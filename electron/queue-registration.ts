import type { IpcMain } from "electron";
import { registerQueueEnqueueIpc } from "./queue-enqueue.js";
import { registerQueueMutationIpc } from "./queue-ipc.js";
import { registerQueueControlIpc } from "./queue-control-ipc.js";
import type { QueueService } from "./services/queue-service.js";

export interface QueueIpcRegistrationDependencies {
  ipc: IpcMain;
  service: QueueService;
  registerBetweenEnqueueAndControl?(): void;
}

export function registerQueueIpc(deps: QueueIpcRegistrationDependencies): void {
  const { ipc, service } = deps;

  registerQueueEnqueueIpc({ ipc, service: service.enqueue });

  // Keep the image-mask handler between enqueue and control registration. It
  // is not a queue command, but registration order is part of the current
  // characterization boundary and is intentionally preserved here.
  deps.registerBetweenEnqueueAndControl?.();

  registerQueueControlIpc({ ipc, service: service.control });

  registerQueueMutationIpc({ ipc, service: service.mutation });
}
