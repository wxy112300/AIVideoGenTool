import type {
  H3VideoVaeBackend,
  QueueTask,
  Settings
} from "../../src/types.js";
import type { QueueIsolationReason } from "../services/queue-execution-side-effects.js";

/**
 * Runtime capabilities required by queue execution and cancellation.
 *
 * The queue owns execution order; this capability owns the process/API
 * boundary and the model-scoped runtime policy used at each task boundary.
 */
export interface QueueRuntimeCapability {
  ensureComfyUiReady(taskId: string, signal?: AbortSignal): Promise<void>;
  prepareQueueRuntimeForTask(
    taskId: string,
    modelId: string,
    settings: Settings,
    reason: QueueIsolationReason
  ): Promise<boolean>;
  stabilizeH3RuntimeBetweenTasks(
    taskId: string,
    modelId: string,
    settings: Settings,
    hasVideoLoras: boolean,
    queueWillContinue: boolean
  ): Promise<boolean>;
  stopQueueRuntime(settings: Settings): Promise<boolean>;
  restartQueueRuntime(settings: Settings): Promise<{ ok: boolean; message: string }>;
  resolveH3VideoVaeModeForTask(
    task: QueueTask,
    settings: Settings
  ): Promise<H3VideoVaeBackend | null>;
  settingsForTask(task: QueueTask | undefined, settings: Settings): Settings;
  cleanupCancelledTask(
    taskId: string,
    settings: Settings,
    worker: Promise<void> | null
  ): Promise<void>;
}
