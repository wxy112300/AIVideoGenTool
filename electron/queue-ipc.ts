import type { IpcMain } from "electron";
import type { AppState, UpscaleQueueTask } from "../src/types.js";
import {
  duplicateQueueTask,
  moveWaitingTask,
  removeQueueTask,
  resetQueueTask,
  updateQueuedUpscaleTask
} from "../src/core/queue.js";
import type { JsonStore } from "./store.js";
import type { AppLogger } from "./services/app-logger.js";

export interface QueueMutationIpcDependencies {
  ipc: IpcMain;
  store: JsonStore;
  logger: AppLogger;
  sendState(state: AppState): void;
}

export function registerQueueMutationIpc({
  ipc,
  store,
  logger,
  sendState
}: QueueMutationIpcDependencies): void {
  ipc.handle(
    "queue:update-upscale",
    async (
      _event,
      taskId: string,
      patch: Pick<
        UpscaleQueueTask,
        "targetWidth" | "targetHeight" | "modelId" | "workflowPath" |
        "tileMode" | "faceRestore" | "outputFilename"
      >
    ) => {
      const next = await store.update((state) => {
        state.queue = updateQueuedUpscaleTask(state.queue, taskId, patch);
      });
      sendState(next);
      return next;
    }
  );

  ipc.handle("queue:remove", async (_event, taskId: string) => {
    const next = await store.update((state) => {
      state.queue = removeQueueTask(state.queue, taskId);
    });
    sendState(next);
    return next;
  });

  ipc.handle("queue:move", async (_event, taskId: string, direction: -1 | 1) => {
    const next = await store.update((state) => {
      state.queue = moveWaitingTask(state.queue, taskId, direction);
    });
    sendState(next);
    return next;
  });

  ipc.handle("queue:duplicate", async (_event, taskId: string) => {
    const next = await store.update((state) => {
      state.queue = duplicateQueueTask(state, taskId);
    });
    sendState(next);
    return next;
  });

  ipc.handle("queue:reset", async (_event, taskId: string) => {
    let reset = false;
    const next = await store.update((state) => {
      const result = resetQueueTask(state.queue, taskId);
      state.queue = result.queue;
      reset = result.reset;
    });
    if (reset) {
      logger.info(
        "queue",
        "task-reset-to-waiting",
        "Failed or cancelled task was reset to the waiting queue without starting it",
        { taskId, queueRunning: next.queueRunning }
      );
    }
    sendState(next);
    return next;
  });
}
