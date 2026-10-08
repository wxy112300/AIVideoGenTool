import type { IpcMain } from "electron";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
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
  it.each(["directory", "cleaning", "queue-start"] as const)("rechecks latest references when state changes during %s", async (timing) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-library-cleanup-race-"));
    const library = path.join(root, "library");
    const sourceDirectory = path.join(library, "sources", "fixture");
    const newlyReferenced = path.join(sourceDirectory, "new-reference.png");
    const genuineOrphan = path.join(sourceDirectory, "genuine-orphan.png");
    await fs.mkdir(sourceDirectory, { recursive: true });
    await fs.writeFile(newlyReferenced, "new reference");
    await fs.writeFile(genuineOrphan, "orphan");

    let state = createDefaultState();
    let releaseDirectoryResolution!: () => void;
    let notifyDirectoryResolution!: () => void;
    const directoryResolutionStarted = new Promise<void>((resolve) => {
      notifyDirectoryResolution = resolve;
    });
    const continueDirectoryResolution = new Promise<void>((resolve) => {
      releaseDirectoryResolution = resolve;
    });
    const unrelatedMarker = "changed while cleanup was waiting";
    const addReference = () => {
      state = structuredClone(state);
      state.imageDraft.pictures.push({ id: "newly-referenced", pictureNumber: 1,
        absolutePath: newlyReferenced, width: 1, height: 1 });
      state.settings.outputDirectory = unrelatedMarker;
    };
    const store: StateRepository = {
      load: async () => state,
      get: () => state,
      getSettings: () => state.settings,
      update: async (mutator) => {
        mutator(state);
        return state;
      }
    };
    const service = new ImageAssetLibraryService({
      store,
      logger: { info: vi.fn(), error: vi.fn() },
      events: { publish: vi.fn((_event: string, progress: ImageAssetLibraryProgress) => {
        if (timing !== "directory" && progress.phase === "cleaning" && progress.current === 2) {
          addReference();
          if (timing === "queue-start") state.queueRunning = true;
        }
      }) } as never,
      resolveLibraryDirectory: async () => {
        notifyDirectoryResolution();
        await continueDirectoryResolution;
        return library;
      },
      sendState: vi.fn()
    });

    try {
      const cleanup = service.cleanup([genuineOrphan, newlyReferenced]);
      await directoryResolutionStarted;
      if (timing === "directory") addReference();
      releaseDirectoryResolution();
      if (timing === "queue-start") {
        await expect(cleanup).rejects.toThrow("队列已开始运行");
        await expect(fs.stat(genuineOrphan)).rejects.toMatchObject({ code: "ENOENT" });
        await expect(fs.stat(newlyReferenced)).resolves.toBeDefined();
        expect(store.get().queueRunning).toBe(true);
        return;
      }
      const result = await cleanup;

      await expect(fs.stat(genuineOrphan)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(fs.stat(newlyReferenced)).resolves.toBeDefined();
      expect(store.get().settings.outputDirectory).toBe(unrelatedMarker);
      expect(result.cleanedFiles).toBe(1);
      expect(result.scan.missingReferences).toEqual([]);
      expect(result.scan.orphanFiles).toEqual([]);
    } finally {
      releaseDirectoryResolution();
      await fs.rm(root, { recursive: true, force: true });
    }
  });

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
    state.imageToVideoDraft = { ...structuredClone(state.draft), seed: 11 };
    state.videoExtensionDraft = { ...structuredClone(state.draft), endImagePath: "old-end.png", seed: 22 };
    const preparedState = structuredClone(state);
    preparedState.draft.startImagePath = "managed-start.png";
    preparedState.imageToVideoDraft!.startImagePath = "managed-start.png";
    preparedState.videoExtensionDraft!.endImagePath = "managed-end.png";
    preparedState.videoExtensionDraft!.seed = 999; // Unrelated draft fields are never copied from prepared state.
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
    expect(state.imageToVideoDraft).toMatchObject({ startImagePath: "managed-start.png", seed: 11 });
    expect(state.videoExtensionDraft).toMatchObject({ endImagePath: "managed-end.png", seed: 22 });
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
