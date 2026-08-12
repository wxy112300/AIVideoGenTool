import type { IpcMain } from "electron";
import type { AppState, QueueTask, Settings } from "../src/types.js";
import type { JsonStore } from "./store.js";
import type { AppLogger } from "./services/app-logger.js";

export class QueueWorkerController {
  private worker: Promise<void> | null = null;
  private controller: AbortController | null = null;

  get runningWorker(): Promise<void> | null {
    return this.worker;
  }

  get activeController(): AbortController | null {
    return this.controller;
  }

  beginTask(): AbortController {
    const controller = new AbortController();
    this.controller = controller;
    return controller;
  }

  endTask(controller?: AbortController): void {
    if (!controller || this.controller === controller) this.controller = null;
  }

  abort(reason: Error): void {
    this.controller?.abort(reason);
  }

  start(execute: () => Promise<void>): void {
    if (this.worker) return;
    this.worker = execute().finally(() => {
      this.worker = null;
      this.controller = null;
    });
  }
}

export interface QueueControlIpcDependencies {
  ipc: IpcMain;
  store: JsonStore;
  logger: AppLogger;
  worker: QueueWorkerController;
  sendState(state: AppState): void;
  executeQueue(): Promise<void>;
  nativePromptBusy(): boolean;
  settingsForTask(task: QueueTask, settings: Settings): Settings;
  cleanupCancelledTask(
    taskId: string,
    settings: Settings,
    worker: Promise<void> | null
  ): Promise<void>;
  updateTask(taskId: string, patch: Partial<QueueTask>): Promise<AppState>;
}

export function registerQueueControlIpc(deps: QueueControlIpcDependencies): void {
  const { ipc, store, logger, worker, sendState } = deps;
  ipc.handle("queue:start", async () => {
    if (deps.nativePromptBusy()) {
      throw new Error("当前正在生成提示词，请等待扩写完成后再开始视频任务。 ");
    }
    const next = await store.update((state) => {
      state.queueRunning = true;
    });
    logger.info("queue", "started", "Queue processing started", {
      waitingTasks: next.queue.filter((task) => task.status === "waiting").length
    });
    sendState(next);
    worker.start(deps.executeQueue);
    return next;
  });

  ipc.handle("queue:pause", async () => {
    const next = await store.update((state) => {
      state.queueRunning = false;
    });
    logger.info("queue", "paused", "Queue processing paused");
    sendState(next);
    return next;
  });

  ipc.handle("queue:cancel", async (_event, taskId: string) => {
    const task = store.get().queue.find((item) => item.id === taskId);
    if (!task) return store.get();
    if (task.status === "running") {
      const settings = deps.settingsForTask(task, store.get().settings);
      const runningWorker = worker.runningWorker;
      const next = await store.update((state) => {
        state.queueRunning = false;
        const current = state.queue.find((item) => item.id === taskId);
        if (current && current.status === "running") {
          current.status = "cancelled";
          current.stage = "任务已取消，正在后台清理 ComfyUI";
          current.error = "任务已取消，正在后台清理 ComfyUI。";
          current.updatedAt = new Date().toISOString();
        }
      });
      sendState(next);
      worker.abort(new Error("用户取消任务"));
      void deps.cleanupCancelledTask(taskId, settings, runningWorker);
      return next;
    }
    return deps.updateTask(taskId, {
      status: "cancelled",
      error: "任务在开始前被取消"
    });
  });
}
