import type { IpcMain } from "electron";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createDefaultSettings, createDefaultState } from "../src/core/defaults";
import { registerAppQueryIpc } from "../electron/app-query-ipc";
import { registerNativeHostIpc } from "../electron/native-host-ipc";
import { registerWorkflowIpc } from "../electron/workflow-ipc";

type Handler = (...args: unknown[]) => unknown;

function fakeIpc(): { ipc: IpcMain; handlers: Map<string, Handler> } {
  const handlers = new Map<string, Handler>();
  const ipc = {
    handle(channel: string, handler: Handler) {
      if (handlers.has(channel)) throw new Error(`duplicate handler: ${channel}`);
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

describe("extracted Electron IPC adapters", () => {
  it("registers app queries and preserves runtime/performance delegation", async () => {
    const { ipc, handlers } = fakeIpc();
    const call = <T>(channel: string, ...args: unknown[]) => invoke<T>(handlers, channel, ...args);
    const state = createDefaultState();
    const settings = createDefaultSettings();
    const runtime = {
      phase: "ready",
      ownership: "unknown",
      endpoint: settings.comfyUrl,
      message: "ready",
      updatedAt: "2026-08-31T00:00:00.000Z",
      operationId: 1
    } as const;
    const observeReachability = vi.fn();
    const metrics = {
      sampledAt: "2026-08-31T00:00:00.000Z",
      cpuPercent: 1,
      memoryUsedBytes: 2,
      memoryTotalBytes: 3,
      gpuPercent: null,
      vramUsedBytes: null,
      vramTotalBytes: null,
      gpuTemperature: null,
      comfyConnected: true
    };
    const logger = {
      recent: vi.fn(() => ({
        directory: "C:\\logs",
        retentionDays: 7,
        records: [],
        text: ""
      })),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn()
    };
    const waitForInitialState = vi.fn(async () => undefined);
    const reconcileConfiguredComfyListenerOwnership = vi.fn(async () => true);

    registerAppQueryIpc({
      ipc,
      store: { get: () => state },
      waitForInitialState,
      getComfyRuntimeState: () => runtime,
      getPromptRuntimeState: () => ({ phase: "idle" } as never),
      getAppVersion: () => "0.56.2",
      logger,
      getCrashDumpsDirectory: () => "C:\\crashes",
      performance: vi.fn(async () => metrics),
      reconcileConfiguredComfyListenerOwnership,
      runtimeState: {
        snapshot: () => runtime,
        observeReachability
      },
      hasRunningTask: () => true
    });

    expect(handlers.size).toBe(9);
    expect(await call("state:get")).toBe(state);
    expect(waitForInitialState).toHaveBeenCalledOnce();
    expect(await call("comfy-runtime:get")).toBe(runtime);
    expect(await call("app:version")).toBe("0.56.2");
    expect(await call("logs:read", 10)).toMatchObject({
      directory: "C:\\logs",
      crashDirectory: "C:\\crashes"
    });

    await call("logs:notification", "warning", "test warning");
    expect(logger.warn).toHaveBeenCalledWith(
      "ui",
      "warning",
      "test warning",
      { notificationKind: "warning" }
    );

    const result = await call("performance:get", settings);
    expect(result).toEqual(metrics);
    expect(reconcileConfiguredComfyListenerOwnership).toHaveBeenCalledWith(settings);
    expect(observeReachability).toHaveBeenCalledWith(
      true,
      settings.comfyUrl,
      "app",
      true
    );
  });

  it("keeps native file, directory, URL, clipboard, and log actions injectable", async () => {
    const { ipc, handlers } = fakeIpc();
    const call = <T>(channel: string, ...args: unknown[]) => invoke<T>(handlers, channel, ...args);
    const showOpenDialog = vi.fn(async () => ({
      canceled: false,
      filePaths: ["C:\\picked.png"]
    }));
    const mkdir = vi.fn(async () => undefined);
    const stat = vi.fn(async () => ({ isDirectory: () => true }));
    const writeFile = vi.fn(async () => undefined);
    const openPath = vi.fn(async () => "");
    const openExternal = vi.fn(async () => undefined);
    const logger = {
      directory: "C:\\logs",
      info: vi.fn(),
      warn: vi.fn()
    };

    registerNativeHostIpc({
      ipc,
      dialog: { showOpenDialog } as never,
      shell: { openPath, openExternal } as never,
      fileSystem: { mkdir, stat, writeFile } as never,
      logger,
      paths: { clipboardInputsDirectory: "C:\\clipboard" },
      getCrashDumpsDirectory: () => "C:\\crashes"
    });

    expect(handlers.size).toBe(9);
    expect(await call("file:pick-image")).toBe("C:\\picked.png");
    expect(await call("file:pick-directory", "C:\\defaults", true)).toBe("C:\\picked.png");
    expect(mkdir).toHaveBeenCalled();
    expect(stat).toHaveBeenCalled();
    expect(await call("file:open-directory", "C:\\models")).toBe(true);
    expect(await call("shell:open-external", "http://example.com")).toBe(false);
    expect(await call("shell:open-external", "https://example.com")).toBe(true);
    expect(openExternal).toHaveBeenCalledWith("https://example.com/");

    const filename = await call<string>(
      "file:save-clipboard-image",
      new ArrayBuffer(4),
      "image/png"
    );
    expect(filename).toMatch(/clipboard-.*\.png$/u);
    expect(writeFile).toHaveBeenCalledOnce();

    expect(await call("logs:open-directory", "logs")).toBe(true);
    expect(openPath).toHaveBeenLastCalledWith("C:\\logs");
    expect(await call("logs:open-directory", "crashDumps")).toBe(true);
    expect(openPath).toHaveBeenLastCalledWith("C:\\crashes");
  });

  it("keeps bundled workflow lookup rooted and model-profile aware", async () => {
    const { ipc, handlers } = fakeIpc();
    const call = <T>(channel: string, ...args: unknown[]) => invoke<T>(handlers, channel, ...args);
    const readFile = vi.fn(async () => JSON.stringify({
      node: { class_type: "SaveVideo" },
      text: "{{END_IMAGE}}"
    }));
    const stat = vi.fn(async () => ({ isDirectory: () => false }));
    const logger = { info: vi.fn() };
    const workflowRoot = "C:\\bundled-workflows";

    registerWorkflowIpc({
      ipc,
      fileSystem: { stat, readFile } as never,
      logger,
      workflowRoots: [workflowRoot],
      getLtxExtensionModelProfile: () => "q2_distilled"
    });

    const inspection = await call<{ supportsEndImage: boolean; supportsVideoExtension: boolean }>(
      "workflow:inspect",
      "C:\\custom.json",
      "wan22_5b"
    );
    expect(inspection.supportsEndImage).toBe(true);
    expect(readFile).toHaveBeenCalledWith("C:\\custom.json", "utf8");

    const bundled = await call<{ modelId: string; path: string; label: string }>(
      "workflow:get-bundled",
      "sulphur2"
    );
    expect(bundled).toMatchObject({
      modelId: "sulphur2",
      path: join(workflowRoot, "sulphur2_ltx23_i2v_gguf_q2_api.json"),
      label: "内置 · Sulphur 2 图生视频 · Q2_K distilled · 8GB 兼容"
    });
    expect(logger.info).toHaveBeenCalled();
  });
});
