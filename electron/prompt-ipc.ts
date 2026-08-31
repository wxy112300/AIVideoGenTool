import type { IpcMain } from "electron";
import type { EnhanceRequest } from "../src/types.js";
import type { PromptApplicationService } from "./services/prompt-application-service.js";

export interface PromptIpcDependencies {
  ipc: IpcMain;
  service: PromptApplicationService;
}

export function registerPromptIpc(deps: PromptIpcDependencies): void {
  deps.ipc.handle("prompt:preflight", () => deps.service.preflight());
  deps.ipc.handle(
    "prompt:start",
    async (_event, allowCpuFallback = false) => deps.service.start(allowCpuFallback === true)
  );
  deps.ipc.handle(
    "prompt:enhance",
    async (_event, request: EnhanceRequest) => deps.service.enhance(request)
  );
  deps.ipc.handle("prompt:cancel", () => deps.service.cancel());
  deps.ipc.handle("prompt:release", () => deps.service.releaseForUser());
}
