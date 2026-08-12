import type { AppState, QueueTask, UpscaleQueueTask } from "../../../types";
import type { RendererCleanup, RendererContext } from "../../contracts";

export type QueueConfirmationAction = "remove" | "cancel";

export interface QueueControllerOptions {
  setState(nextState: AppState): void;
  setPromptRuntimeLoaded(loaded: boolean): void;
  requestConfirmation(taskId: string, action: QueueConfirmationAction): void;
  editTask(taskId: string): void;
  editUpscaleTask(task: UpscaleQueueTask): void;
  rememberModalFocus(): void;
}

interface QueueMoveScrollAnchor {
  taskId: string;
  direction: -1 | 1;
  viewportTop: number;
}

let queueMoveScrollAnchor: QueueMoveScrollAnchor | null = null;

function captureQueueMoveAnchor(button: HTMLButtonElement): void {
  const taskId = button.dataset.move;
  const direction = Number(button.dataset.direction);
  if (!taskId || (direction !== -1 && direction !== 1)) return;
  queueMoveScrollAnchor = {
    taskId,
    direction,
    viewportTop: button.getBoundingClientRect().top
  };
}

function restoreQueueMoveAnchor(root: HTMLElement): void {
  const anchor = queueMoveScrollAnchor;
  if (!anchor) return;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      if (queueMoveScrollAnchor !== anchor) return;
      const button = [...root.querySelectorAll<HTMLButtonElement>("[data-move]")]
        .find((candidate) =>
          candidate.dataset.move === anchor.taskId &&
          Number(candidate.dataset.direction) === anchor.direction
        );
      if (!button) return;
      const delta = button.getBoundingClientRect().top - anchor.viewportTop;
      if (Math.abs(delta) > 0.5) {
        window.scrollBy({ top: delta, behavior: "auto" });
      }
      queueMoveScrollAnchor = null;
    });
  });
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

  root.querySelector("#start-queue")?.addEventListener("click", async () => {
    context.reportUserAction("queue-start");
    try {
      options.setState(await context.studio.startQueue());
      options.setPromptRuntimeLoaded(false);
      context.requestRender();
    } catch (error) {
      context.notify(error instanceof Error ? error.message : String(error));
    }
  }, { signal });

  root.querySelector("#pause-queue")?.addEventListener("click", async () => {
    context.reportUserAction("queue-pause");
    options.setState(await context.studio.pauseQueue());
    context.requestRender();
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

  root.querySelectorAll<HTMLButtonElement>("[data-move]").forEach((button) => {
    button.addEventListener("click", async () => {
      const taskId = button.dataset.move;
      const directionValue = button.dataset.direction;
      const direction = Number(directionValue);
      if (!taskId || (direction !== -1 && direction !== 1)) return;
      captureQueueMoveAnchor(button);
      context.reportUserAction("queue-move", { taskId, direction: directionValue });
      options.setState(await context.studio.moveTask(taskId, direction as -1 | 1));
      context.requestRender();
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
        context.notify(error instanceof Error ? error.message : "无法重置任务状态");
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
        context.notify(error instanceof Error ? error.message : "无法编辑提升任务");
      }
    }, { signal });
  });

  restoreQueueMoveAnchor(root);
  return () => events.abort();
}
