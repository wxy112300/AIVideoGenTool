import type { IpcMain } from "electron";
import type { UpscaleQueueTask } from "../src/types.js";
import {
  QueueMutationService,
  type QueueMutationServiceDependencies
} from "./queue-mutation-service.js";

export type QueueMutationIpcDependencies =
  | (QueueMutationServiceDependencies & { ipc: IpcMain })
  | { ipc: IpcMain; service: QueueMutationService };

export function registerQueueMutationIpc(deps: QueueMutationIpcDependencies): void {
  const service = "service" in deps
    ? deps.service
    : new QueueMutationService(deps);
  const { ipc } = deps;
  ipc.handle(
    "queue:set-h3-live-preview",
    async (_event, enabled: boolean) => service.setH3LivePreview(enabled)
  );
  ipc.handle(
    "queue:update-upscale",
    async (
      _event,
      taskId: string,
      patch: Pick<
        UpscaleQueueTask,
        "upscaleMode" | "targetWidth" | "targetHeight" | "targetOutputHeight" |
        "modelId" | "workflowPath" |
        "tileMode" | "faceRestore" | "outputFilename"
      >
    ) => service.updateUpscale(taskId, patch)
  );
  ipc.handle("queue:remove", async (_event, taskId: string) => service.remove(taskId));
  ipc.handle("queue:move", async (_event, taskId: string, direction: -1 | 1) =>
    service.move(taskId, direction)
  );
  ipc.handle(
    "queue:reorder",
    async (
      _event,
      taskId: string,
      targetWaitingIndex: number,
      pauseBoundaryTarget?: number
    ) => service.reorder(taskId, targetWaitingIndex, pauseBoundaryTarget)
  );
  ipc.handle("queue:duplicate", async (_event, taskId: string) => service.duplicate(taskId));
  ipc.handle("queue:randomize-seed", async (_event, taskId: string) => service.randomizeSeed(taskId));
  ipc.handle(
    "queue:set-pause-boundary-after-task",
    async (_event, taskId: string) => service.setPauseBoundaryAfterTask(taskId)
  );
  ipc.handle(
    "queue:set-pause-boundary",
    async (_event, waitingTaskCount: number) => service.setPauseBoundary(waitingTaskCount)
  );
  ipc.handle("queue:clear-pause-boundary", async () => service.clearPauseBoundary());
  ipc.handle("queue:reset", async (_event, taskId: string) => service.reset(taskId));
}
