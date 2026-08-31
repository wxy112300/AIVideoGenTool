import type { IpcMain, WebContents } from "electron";
import type {
  WindowCloseRequest,
  WindowCloseResponse
} from "../src/types.js";

export interface WindowShellIpcDependencies {
  ipc: IpcMain;
  getWindowWebContents(): WebContents | null;
  setRendererSettingsDirty(dirty: boolean): void;
  getPendingWindowCloseRequest(): WindowCloseRequest | null;
  clearPendingWindowCloseRequest(): void;
  setCloseFlowRunning(running: boolean): void;
  finishWindowClose(): Promise<void>;
  finishRunningWorkClose(
    response: "finish-tasks" | "force-exit",
    queueCleanupOnly: boolean
  ): Promise<void>;
}

/** Registers only renderer/window shell channels; business IPC stays in named adapters. */
export function registerWindowShellIpc(deps: WindowShellIpcDependencies): void {
  deps.ipc.handle("renderer:set-settings-dirty", (_event, dirty: boolean) => {
    deps.setRendererSettingsDirty(dirty === true);
  });
  deps.ipc.handle(
    "window:close-response",
    async (event, response: WindowCloseResponse) => {
      const request = deps.getPendingWindowCloseRequest();
      if (event.sender !== deps.getWindowWebContents() || !request) return;
      deps.clearPendingWindowCloseRequest();
      if (response === "cancel") {
        deps.setCloseFlowRunning(false);
        return;
      }
      if (request.kind === "unsaved-settings" && response === "discard-settings") {
        await deps.finishWindowClose();
        return;
      }
      if (
        request.kind === "running-work" &&
        (response === "finish-tasks" || response === "force-exit")
      ) {
        await deps.finishRunningWorkClose(response, request.queueCleanupOnly === true);
        return;
      }
      deps.setCloseFlowRunning(false);
    }
  );
}
