import type {
  AppState,
  ComfyRuntimeState,
  PerformanceMetrics,
  QueueTask,
  UpscaleQueueTask
} from "../../../types";
import type { RendererCleanup, RendererContext } from "../../contracts";
import { escapeHtml } from "../../shared/dom";
import {
  elapsedText,
  frameRateSummary,
  performanceCard,
  queueEstimateText,
  queueStageElapsedText
} from "../../shared/formatters";
import { icon } from "../../shared/icons";
import { modelName } from "../../shared/labels";
import {
  renderQueueTaskCard,
  type QueueActionBusy
} from "./card";
import {
  mountQueueController,
  type QueueConfirmationAction
} from "./controller";
import { queueRemainingSeconds, queueTaskRemainingSeconds } from "./helpers";
import { loadQueueInputPreviews } from "./input-previews";
import {
  renderQueuePage,
  type QueueMoveAvailability
} from "./page";

export interface QueueAssemblyOptions {
  getState(): AppState;
  getPerformanceMetrics(): PerformanceMetrics | null;
  getComfyRuntime(): ComfyRuntimeState;
  isEnvironmentScanning(): boolean;
  getTaskPreviews(): Readonly<Record<string, string>>;
  getQueueActionBusy(): QueueActionBusy;
  setState(nextState: AppState): void;
  setPromptRuntimeLoaded(loaded: boolean): void;
  requestConfirmation(taskId: string, action: QueueConfirmationAction): void;
  editTask(taskId: string): void;
  editUpscaleTask(task: UpscaleQueueTask): void;
  rememberModalFocus(): void;
}

export interface QueueAssembly {
  render(context: RendererContext): string;
  mount(context: RendererContext): RendererCleanup;
}

export function createQueueAssembly(options: QueueAssemblyOptions): QueueAssembly {
  return {
    render(context): string {
      const state = options.getState();
      const renderTaskCard = (
        task: QueueTask,
        queuePosition: number,
        moveAvailability?: QueueMoveAvailability
      ): string => renderQueueTaskCard(task, queuePosition, {
        t: context.t,
        taskPreviews: options.getTaskPreviews(),
        queueRunning: state.queueRunning,
        queueLifecycle: state.queueLifecycle,
        queueLifecycleTaskId: state.queueLifecycleTaskId,
        queueActionBusy: options.getQueueActionBusy(),
        icon,
        escapeHtml,
        modelName: (id) => modelName(id, state.settings.uiLocale),
        frameRateSummary,
        queueStageElapsedText: (queueTask) => queueStageElapsedText(queueTask, context.t),
        queueTaskRemainingSeconds: (queueTask) => queueTaskRemainingSeconds(queueTask, state.history, state.imageHistory),
        queueEstimateText: (seconds) => queueEstimateText(seconds, context.t),
        elapsedText: (startedAt) => elapsedText(startedAt, context.t),
        canDrag: moveAvailability?.canDrag
      });

      return renderQueuePage(state, {
        t: context.t,
        escapeHtml,
        performanceMetrics: options.getPerformanceMetrics(),
        comfyRuntime: options.getComfyRuntime(),
        environmentScanning: options.isEnvironmentScanning(),
        queueRemainingSeconds: (tasks) => queueRemainingSeconds(tasks, state.history, state.imageHistory),
        queueEstimateText: (seconds) => queueEstimateText(seconds, context.t),
        performanceCard,
        renderTaskCard,
        icon
      });
    },

    mount(context): RendererCleanup {
      const cleanup = mountQueueController(context, {
        setState: options.setState,
        setPromptRuntimeLoaded: options.setPromptRuntimeLoaded,
        requestConfirmation: options.requestConfirmation,
        editTask: options.editTask,
        editUpscaleTask: options.editUpscaleTask,
        rememberModalFocus: options.rememberModalFocus
      });
      void loadQueueInputPreviews(context);
      return cleanup;
    }
  };
}
