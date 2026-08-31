import type { IpcMain } from "electron";
import type { AppState } from "../src/types.js";
import {
  QueueControlService,
  type QueueControlServiceDependencies
} from "./queue-control-service.js";

export type QueueControlIpcDependencies =
  | (QueueControlServiceDependencies & { ipc: IpcMain })
  | { ipc: IpcMain; service: QueueControlService };

export function registerQueueControlIpc(deps: QueueControlIpcDependencies): {
  resumeQueue(clearPauseBoundary?: boolean): Promise<AppState>;
} {
  const service = "service" in deps
    ? deps.service
    : new QueueControlService(deps);
  deps.ipc.handle("queue:start", async () => service.resumeQueue(false));
  deps.ipc.handle("queue:continue", async () => service.resumeQueue(true));
  deps.ipc.handle("queue:pause", async () => service.pauseQueue());
  deps.ipc.handle("queue:cancel", async (_event, taskId: string) => service.cancelTask(taskId));
  return {
    resumeQueue: (clearPauseBoundary = true) => service.resumeQueue(clearPauseBoundary)
  };
}
