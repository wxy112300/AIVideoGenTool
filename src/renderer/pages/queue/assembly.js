import { escapeHtml } from "../../shared/dom";
import { elapsedText, frameRateSummary, performanceCard, queueEstimateText, queueStageElapsedText } from "../../shared/formatters";
import { icon } from "../../shared/icons";
import { modelName } from "../../shared/labels";
import { renderQueueTaskCard } from "./card";
import { mountQueueController } from "./controller";
import { queueRemainingSeconds, queueTaskRemainingSeconds } from "./helpers";
import { loadQueueInputPreviews } from "./input-previews";
import { renderQueuePage } from "./page";

export function createQueueAssembly(options) {
    return {
        render(context) {
            const state = options.getState();
            const renderTaskCard = (task, queuePosition, moveAvailability) => renderQueueTaskCard(task, queuePosition, {
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
        mount(context) {
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
