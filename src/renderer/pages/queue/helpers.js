import { estimateQueueRemainingSeconds, estimateQueueTaskRemainingSeconds, estimateQueueTaskSeconds } from "../../../core/queue-estimator";
/**
 * Fields that change frequently while a task is running but never alter the
 * queue card's structure. Excluding them lets the renderer patch progress in
 * place instead of replacing the entire queue DOM for every step.
 */
const volatileTaskFields = new Set([
    "progress",
    "stage",
    "stageStartedAt",
    "updatedAt",
    "comfyPromptId",
    "performanceStats",
    "seedVr2Checkpoint",
    "seedVr2Progress"
]);
function queueTaskLayoutSnapshot(task) {
    const snapshot = {};
    for (const [key, value] of Object.entries(task)) {
        if (volatileTaskFields.has(key))
            continue;
        if (key === "runs" && Array.isArray(value)) {
            snapshot[key] = value.map((run) => {
                if (!run || typeof run !== "object")
                    return run;
                const stableRun = {};
                for (const [runKey, runValue] of Object.entries(run)) {
                    if (volatileTaskFields.has(runKey) || ["status", "startedAt", "completedAt", "error", "outputVersionId"].includes(runKey))
                        continue;
                    stableRun[runKey] = runValue;
                }
                return stableRun;
            });
            continue;
        }
        snapshot[key] = value;
    }
    return snapshot;
}
/**
 * Returns a stable signature for fields that require a queue re-render. Task
 * progress/stage and other volatile execution telemetry are intentionally
 * omitted; those are updated by patchQueueLiveDom.
 */
export function queueLayoutSignature(state) {
    return JSON.stringify({
        queueRunning: state.queueRunning,
        queueLifecycle: state.queueLifecycle,
        queueLifecycleTaskId: state.queueLifecycleTaskId,
        queuePauseBoundary: state.queuePauseBoundary,
        h3LivePreview: state.settings.h3LivePreview,
        uiLocale: state.settings.uiLocale,
        queue: state.queue.map(queueTaskLayoutSnapshot)
    });
}
export function queueHistoryEstimateSeconds(task, history, imageHistory = []) {
    return estimateQueueTaskSeconds(task, {
        video: history,
        image: imageHistory
    });
}
export function queueTaskRemainingSeconds(task, history, imageHistory = []) {
    return estimateQueueTaskRemainingSeconds(task, {
        video: history,
        image: imageHistory
    });
}
export function queueRemainingSeconds(tasks, history, imageHistory = []) {
    const context = { video: history, image: imageHistory };
    return estimateQueueRemainingSeconds(tasks, context);
}
