import type { IpcMain } from "electron";
import { describe, expect, it, vi } from "vitest";
import { createDefaultState, createDefaultSettings } from "../src/core/defaults";
import type {
  AppState,
  ImageAssetLibraryProgress,
  ImageAssetLibraryResult,
  ImageAssetLibraryScan
} from "../src/types";
import { registerImageAssetIpc } from "../electron/image-asset-ipc";
import { ImageAssetLibraryService } from "../electron/services/image-asset-library-service";
import type {
  ImageAssetLibraryFileSystemPort
} from "../electron/ports/image-asset-library";
import type { StateRepository } from "../electron/ports/state-repository";

type Handler = (...args: unknown[]) => unknown;

function fakeIpc(): { ipc: IpcMain; handlers: Map<string, Handler> } {
  const handlers = new Map<string, Handler>();
  const ipc = {
    handle(channel: string, handler: Handler) {
      handlers.set(channel, handler);
    }
  } as unknown as IpcMain;
  return { ipc, handlers };
}

async function invoke<T>(
  handlers: Map<string, Handler>,
  channel: string,
  ...args: unknown[]
): Promise<T> {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`missing handler: ${channel}`);
  return await handler(undefined, ...args) as T;
}

function repository(state: AppState): StateRepository {
  return {
    load: async () => state,
    get: () => state,
    getSettings: () => state.settings,
    update: async (mutator) => {
      mutator(state);
      return state;
    }
  };
}

function scanFixture(directory: string): ImageAssetLibraryScan {
  return {
    libraryDirectory: directory,
    totalReferences: 0,
    managedReferences: 0,
    archiveCandidates: 0,
    missingReferences: [],
    orphanFiles: [],
    archiveBytes: 0,
    orphanBytes: 0
  };
}

function resultFixture(directory: string): ImageAssetLibraryResult {
  return {
    scan: scanFixture(directory),
    archivedFiles: 0,
    reorganizedFiles: 0,
    updatedReferences: 0,
    cleanedFiles: 0,
    cleanedDirectories: 0,
    cleanedBytes: 0
  };
}

function serviceFixture(
  state: AppState,
  fileSystem: ImageAssetLibraryFileSystemPort
) {
  const publish = vi.fn();
  const sendState = vi.fn();
  const logger = { info: vi.fn(), error: vi.fn() };
  const library = "C:\\ComfyUI\\input\\LocalVideoStudio";
  const resolveLibraryDirectory = vi.fn(async () => library);
  const service = new ImageAssetLibraryService({
    store: repository(state),
    logger,
    events: { publish } as never,
    resolveLibraryDirectory,
    sendState,
    fileSystem
  });
  return { service, publish, sendState, logger, library, resolveLibraryDirectory };
}

describe("image asset library application boundary", () => {
  it("publishes scan progress and keeps filesystem work behind an injected port", async () => {
    const state = createDefaultState();
    const library = "C:\\ComfyUI\\input\\LocalVideoStudio";
    const scan = scanFixture(library);
    const scanOperation = vi.fn(async (
      _state: AppState,
      _directory: string,
      report?: (progress: ImageAssetLibraryProgress) => void
    ): Promise<ImageAssetLibraryScan> => {
      report?.({ phase: "scanning", current: 1, total: 1, message: "scan" });
      return scan;
    });
    const fileSystem = {
      scan: scanOperation,
      organize: vi.fn(),
      cleanup: vi.fn()
    } as unknown as ImageAssetLibraryFileSystemPort;
    const current = serviceFixture(state, fileSystem);

    await expect(current.service.scan()).resolves.toBe(scan);
    expect(scanOperation).toHaveBeenCalledWith(state, library, expect.any(Function));
    expect(current.publish).toHaveBeenCalledWith("image-assets:progress", {
      phase: "scanning",
      current: 1,
      total: 1,
      message: "scan"
    });
    expect(current.logger.info).toHaveBeenCalledWith(
      "assets",
      "image-library-scan-completed",
      "图片素材库扫描完成",
      expect.objectContaining({ operationId: expect.any(String) })
    );
    expect(current.service.isRunning()).toBe(false);
  });

  it("commits only prepared reference fields and publishes the normal state/progress effects", async () => {
    const state = createDefaultState();
    state.draft.startImagePath = "old-start.png";
    const preparedState = structuredClone(state);
    preparedState.draft.startImagePath = "managed-start.png";
    const preparedResult = resultFixture("C:\\library");
    const organize = vi.fn(async () => ({ state: preparedState, result: preparedResult }));
    const fileSystem = {
      scan: vi.fn(),
      organize,
      cleanup: vi.fn()
    } as unknown as ImageAssetLibraryFileSystemPort;
    const current = serviceFixture(state, fileSystem);

    const result = await current.service.organize();
    expect(result).toMatchObject({ ...preparedResult, operationId: expect.any(String) });
    expect(state.draft.startImagePath).toBe("managed-start.png");
    expect(current.sendState).toHaveBeenCalledWith(state);
    expect(current.publish).toHaveBeenCalledWith("image-assets:progress", {
      phase: "completed",
      current: 1,
      total: 1,
      message: "图片素材库整理完成"
    });
    expect(organize).toHaveBeenCalledWith(state, current.library, expect.any(Function));
  });

  it("rejects organize and cleanup during queue execution without touching the filesystem", async () => {
    const state = createDefaultState();
    state.queueRunning = true;
    const fileSystem = {
      scan: vi.fn(),
      organize: vi.fn(),
      cleanup: vi.fn()
    } as unknown as ImageAssetLibraryFileSystemPort;
    const current = serviceFixture(state, fileSystem);

    await expect(current.service.organize()).rejects.toThrow("队列运行期间不能整理图片素材库");
    await expect(current.service.cleanup(["orphan.png"])).rejects.toThrow("队列运行期间不能清理图片素材库");
    expect(fileSystem.organize).not.toHaveBeenCalled();
    expect(fileSystem.cleanup).not.toHaveBeenCalled();
    expect(current.service.isRunning()).toBe(false);
  });

  it("keeps the IPC adapter limited to registration and cleanup argument validation", async () => {
    const { ipc, handlers } = fakeIpc();
    const call = <T>(channel: string, ...args: unknown[]) => invoke<T>(handlers, channel, ...args);
    const result = resultFixture("C:\\library");
    const service = {
      scan: vi.fn(async () => scanFixture("C:\\library")),
      organize: vi.fn(async () => ({ ...result, operationId: "organize" })),
      cleanup: vi.fn(async (paths: string[]) => ({ ...result, operationId: paths.join(",") }))
    };

    registerImageAssetIpc({ ipc, service });
    expect(handlers.size).toBe(3);
    await call("image-assets:scan", "ignored");
    await call("image-assets:organize");
    await call("image-assets:cleanup", undefined);
    await call("image-assets:cleanup", ["inside.png"]);
    expect(service.scan).toHaveBeenCalledOnce();
    expect(service.organize).toHaveBeenCalledOnce();
    expect(service.cleanup).toHaveBeenNthCalledWith(1, []);
    expect(service.cleanup).toHaveBeenNthCalledWith(2, ["inside.png"]);
  });
});
