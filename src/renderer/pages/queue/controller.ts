import type { AppState, UpscaleQueueTask } from "../../../types";
import type { RendererCleanup, RendererContext } from "../../contracts";
import { uiKeys } from "../../../core/i18n-keys";
import { mountQueueDragSort } from "./drag-sort";

export type QueueConfirmationAction = "remove" | "cancel";

export interface QueueControllerOptions {
  setState(nextState: AppState): void;
  setPromptRuntimeLoaded(loaded: boolean): void;
  requestConfirmation(taskId: string, action: QueueConfirmationAction): void;
  editTask(taskId: string): void;
  editUpscaleTask(task: UpscaleQueueTask): void;
  rememberModalFocus(): void;
}

function currentState(context: RendererContext): AppState | null {
  return context.getState() ?? null;
}

export function mountQueueController(
  context: RendererContext,
  options: QueueControllerOptions
): RendererCleanup {
  const events = new AbortController();
  const signal = events.signal;
  const root = context.root;
  const t = context.t;
  const dragSortCleanup = mountQueueDragSort(context, options.setState);

  const startQueue = async (): Promise<void> => {
    context.reportUserAction("queue-start");
    try {
      options.setState(await context.studio.startQueue());
      options.setPromptRuntimeLoaded(false);
      context.requestRender();
    } catch (error) {
      context.notify(error instanceof Error ? error.message : String(error), { kind: "error" });
    }
  };

  const endQueue = async (action: "queue-end" | "queue-pause" = "queue-end"): Promise<void> => {
    context.reportUserAction(action);
    try {
      // Ending the queue is graceful: the current task is allowed to finish,
      // while later waiting tasks remain available for a future restart.
      options.setState(await context.studio.pauseQueue());
      context.requestRender();
    } catch (error) {
      context.notify(error instanceof Error ? error.message : String(error), { kind: "error" });
    }
  };

  root.querySelector<HTMLInputElement>("#h3-live-preview")?.addEventListener("change", async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const current = currentState(context);
    if (!current) return;
    input.disabled = true;
    try {
      // This is a queue preference, not a general settings form submission.
      // Keep it on a narrow IPC path so toggling it never performs environment
      // validation, starts ComfyUI, or marks the settings page dirty.
      options.setState(await context.studio.setQueueH3LivePreview(input.checked));
      context.requestRender();
    } catch (error) {
      input.checked = !input.checked;
      input.disabled = false;
      context.notify(error instanceof Error ? error.message : String(error), { kind: "error" });
    }
  }, { signal });

  root.querySelector("#queue-primary-action")?.addEventListener("click", async () => {
    const state = currentState(context);
    if (state?.queueRunning) {
      await endQueue();
      return;
    }
    await startQueue();
  }, { signal });

  root.querySelector("#pause-queue")?.addEventListener("click", async () => {
    await endQueue("queue-pause");
  }, { signal });

  root.querySelector("#continue-queue")?.addEventListener("click", async () => {
    await startQueue();
  }, { signal });

  root.querySelectorAll<HTMLElement>("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      const taskId = button.dataset.remove;
      if (!taskId) return;
      context.reportUserAction("queue-remove", { taskId });
      options.requestConfirmation(taskId, "remove");
    }, { signal });
  });

  root.querySelectorAll<HTMLElement>("[data-cancel]").forEach((button) => {
    button.addEventListener("click", () => {
      const taskId = button.dataset.cancel;
      if (!taskId) return;
      context.reportUserAction("queue-cancel", { taskId });
      options.requestConfirmation(taskId, "cancel");
    }, { signal });
  });

  root.querySelectorAll<HTMLElement>("[data-duplicate]").forEach((button) => {
    button.addEventListener("click", async () => {
      const taskId = button.dataset.duplicate;
      if (!taskId) return;
      context.reportUserAction("queue-duplicate", { taskId });
      options.setState(await context.studio.duplicateTask(taskId));
      context.requestRender();
    }, { signal });
  });

  root.querySelectorAll<HTMLElement>("[data-reset-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      const taskId = button.dataset.resetTask;
      if (!taskId) return;
      context.reportUserAction("queue-reset-status", { taskId });
      try {
        options.setState(await context.studio.resetTask(taskId));
        context.requestRender();
      } catch (error) {
        context.notify(error instanceof Error ? error.message : t(uiKeys.runtime.queueResetFailed), { kind: "error" });
      }
    }, { signal });
  });

  root.querySelectorAll<HTMLElement>("[data-edit-task]").forEach((button) => {
    button.addEventListener("click", () => {
      const taskId = button.dataset.editTask;
      if (taskId) options.editTask(taskId);
    }, { signal });
  });

  root.querySelectorAll<HTMLElement>("[data-edit-upscale-task]").forEach((button) => {
    button.addEventListener("click", () => {
      const taskId = button.dataset.editUpscaleTask;
      const task = taskId
        ? currentState(context)?.queue.find((item) => item.id === taskId)
        : undefined;
      if (!task || task.taskType !== "upscale") return;
      try {
        options.rememberModalFocus();
        options.editUpscaleTask(task);
      } catch (error) {
        context.notify(error instanceof Error ? error.message : t(uiKeys.runtime.queueEditFailed), { kind: "error" });
      }
    }, { signal });
  });

  return () => {
    events.abort();
    dragSortCleanup();
  };
}
