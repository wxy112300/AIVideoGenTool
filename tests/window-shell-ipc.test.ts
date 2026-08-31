import { describe, expect, it, vi } from "vitest";
import type { WindowCloseRequest } from "../src/types";
import { registerWindowShellIpc } from "../electron/window-shell-ipc";

function ipcFixture() {
  const handlers = new Map<string, (...args: any[]) => unknown>();
  const ipc = {
    handle: (channel: string, handler: (...args: any[]) => unknown) => {
      handlers.set(channel, handler);
    }
  };
  return { ipc, handlers };
}

describe("window shell IPC adapter", () => {
  it("owns dirty state and validates the requesting window before consuming close requests", async () => {
    const { ipc, handlers } = ipcFixture();
    const webContents = {};
    let dirty = false;
    let request: WindowCloseRequest | null = { kind: "unsaved-settings" };
    const clearRequest = vi.fn(() => { request = null; });
    const finishWindowClose = vi.fn(async () => undefined);
    const setCloseFlowRunning = vi.fn();
    registerWindowShellIpc({
      ipc: ipc as never,
      getWindowWebContents: () => webContents as never,
      setRendererSettingsDirty: (value) => { dirty = value; },
      getPendingWindowCloseRequest: () => request,
      clearPendingWindowCloseRequest: clearRequest,
      setCloseFlowRunning,
      finishWindowClose,
      finishRunningWorkClose: vi.fn(async () => undefined)
    });

    await handlers.get("renderer:set-settings-dirty")?.({}, true);
    expect(dirty).toBe(true);
    await handlers.get("window:close-response")?.({ sender: {} }, "discard-settings");
    expect(clearRequest).not.toHaveBeenCalled();
    expect(finishWindowClose).not.toHaveBeenCalled();

    await handlers.get("window:close-response")?.({ sender: webContents }, "discard-settings");
    expect(clearRequest).toHaveBeenCalledOnce();
    expect(finishWindowClose).toHaveBeenCalledOnce();
  });

  it("delegates running-work responses with the cleanup-only flag", async () => {
    const { ipc, handlers } = ipcFixture();
    const request: WindowCloseRequest = {
      kind: "running-work",
      hasUnsavedSettings: true,
      queueCleanupOnly: true
    };
    const finishRunningWorkClose = vi.fn(async () => undefined);
    const target = {};
    registerWindowShellIpc({
      ipc: ipc as never,
      getWindowWebContents: () => target as never,
      setRendererSettingsDirty: () => undefined,
      getPendingWindowCloseRequest: () => request,
      clearPendingWindowCloseRequest: () => undefined,
      setCloseFlowRunning: () => undefined,
      finishWindowClose: async () => undefined,
      finishRunningWorkClose
    });

    await (handlers.get("window:close-response") as (...args: any[]) => unknown)(
      { sender: target },
      "finish-tasks"
    );
    expect(finishRunningWorkClose).toHaveBeenCalledWith("finish-tasks", true);
  });
});
