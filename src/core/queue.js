import { createOutputFilename } from "./filename.js";
import { uniqueAetherScaleUpscaleFilename, uniqueDlss5UpscaleFilename, uniqueUpscaleFilename } from "./upscale.js";
export function isImageGenerationQueueTask(task) {
    return task.taskType === "image-generation";
}
/**
 * Returns active work in the order shown and executed by the queue. A task
 * that is already running is always the current item, so it owns position 1
 * even if an older persisted queue placed it after a waiting record.
 */
export function activeQueueTasks(queue) {
    const active = queue.filter((task) => task.status === "waiting" || task.status === "running");
    const running = active.find((task) => task.status === "running");
    if (!running)
        return active;
    return [running, ...active.filter((task) => task !== running)];
}
/**
 * Returns the execution order without completed or attention-only records.
 * The queue divider is defined against this list, not against the persisted
 * array indexes, because failed/cancelled records are rendered separately.
 */
export function activeQueueTaskIds(queue) {
    return activeQueueTasks(queue).map((task) => task.id);
}
export function normalizeQueuePauseBoundary(queue, boundary) {
    if (!Number.isInteger(boundary))
        return undefined;
    const activeCount = activeQueueTaskIds(queue).length;
    if (activeCount === 0)
        return undefined;
    // A divider always belongs between tasks. Keep at least the first active
    // task in the current batch so it can never float above the queue.
    return Math.max(1, Math.min(activeCount, boundary));
}
export function queueTaskIsDeferred(queue, boundary, taskId) {
    if (boundary === undefined)
        return false;
    const effectiveBoundary = Math.max(1, boundary);
    const task = queue.find((candidate) => candidate.id === taskId);
    if (!task || task.status !== "waiting")
        return false;
    const activeIndex = activeQueueTaskIds(queue).indexOf(taskId);
    return activeIndex >= 0 && activeIndex >= effectiveBoundary;
}
export function nextQueueWaitingTask(queue, boundary) {
    const effectiveBoundary = boundary === undefined ? undefined : Math.max(1, boundary);
    let activeIndex = 0;
    for (const task of activeQueueTasks(queue)) {
        if (task.status === "waiting" &&
            (effectiveBoundary === undefined || activeIndex < effectiveBoundary)) {
            return task;
        }
        activeIndex += 1;
    }
    return undefined;
}
export function queueHasEligibleWaitingTask(queue, boundary) {
    return Boolean(nextQueueWaitingTask(queue, boundary));
}
export function queuePauseBoundaryAfterRunning(queue) {
    return activeQueueTasks(queue).some((task) => task.status === "running") ? 1 : undefined;
}
/**
 * Chooses the pause point created by ending a queue. If the first task has not
 * been claimed yet, keep that task in the current batch so the divider still
 * represents "stop after the current work" during startup races.
 */
export function queuePauseBoundaryAfterCurrent(queue) {
    const afterRunning = queuePauseBoundaryAfterRunning(queue);
    if (afterRunning !== undefined)
        return afterRunning;
    const activeCount = activeQueueTaskIds(queue).length;
    return activeCount > 0 ? 1 : undefined;
}
/**
 * Keeps the divider attached to the same logical queue position while a
 * mutation removes, restores, or reorders task records around it.
 */
export function adjustQueuePauseBoundary(beforeQueue, boundary, afterQueue, movedTaskId) {
    const normalized = normalizeQueuePauseBoundary(beforeQueue, boundary);
    if (normalized === undefined) {
        return undefined;
    }
    const beforeIds = activeQueueTaskIds(beforeQueue);
    const afterIds = activeQueueTaskIds(afterQueue);
    if (afterIds.length === 0)
        return undefined;
    const afterSet = new Set(afterIds);
    let next = normalized - beforeIds
        .slice(0, normalized)
        .filter((id) => !afterSet.has(id)).length;
    const beforeSet = new Set(beforeIds);
    for (const [index, id] of afterIds.entries()) {
        if (!beforeSet.has(id) && index < next)
            next += 1;
    }
    const sameActiveTasks = beforeIds.length === afterIds.length &&
        beforeIds.every((id) => afterSet.has(id));
    if (sameActiveTasks && movedTaskId) {
        const oldIndex = beforeIds.indexOf(movedTaskId);
        const newIndex = afterIds.indexOf(movedTaskId);
        if (oldIndex >= 0 && newIndex >= 0) {
            if (oldIndex < normalized && newIndex >= normalized)
                next -= 1;
            else if (oldIndex >= normalized && newIndex < normalized)
                next += 1;
        }
    }
    return Math.max(1, Math.min(afterIds.length, next));
}
/**
 * Returns true when a queue mutation removes every active task that was above
 * the divider while leaving active tasks below it. This is the stop-line
 * transition: the divider has reached the front of the remaining queue, so a
 * running worker must stop before claiming the next task.
 */
export function queuePauseBoundaryReached(beforeQueue, boundary, afterQueue) {
    const normalized = normalizeQueuePauseBoundary(beforeQueue, boundary);
    if (normalized === undefined)
        return false;
    const beforeIds = activeQueueTaskIds(beforeQueue);
    const afterIds = activeQueueTaskIds(afterQueue);
    if (afterIds.length === 0)
        return false;
    const afterSet = new Set(afterIds);
    const idsAboveBoundary = beforeIds.slice(0, normalized);
    return idsAboveBoundary.length > 0 && idsAboveBoundary.every((id) => !afterSet.has(id));
}
/**
 * Advances the divider after one specific task has completed. The divider is
 * an in-order terminal item: it may stop the queue only when the completed
 * task was the last active task before it. This task-aware transition avoids
 * treating an unrelated queue mutation as if the stop line had been read.
 */
export function queuePauseBoundaryAfterTaskCompletion(beforeQueue, boundary, completedTaskId, afterQueue) {
    const normalized = normalizeQueuePauseBoundary(beforeQueue, boundary);
    if (normalized === undefined) {
        return { boundary: undefined, reached: false };
    }
    const beforeIds = activeQueueTaskIds(beforeQueue);
    const afterIds = activeQueueTaskIds(afterQueue);
    const completedIndex = beforeIds.indexOf(completedTaskId);
    const afterSet = new Set(afterIds);
    const completedWasRemoved = completedIndex >= 0 && !afterSet.has(completedTaskId);
    const activeTasksAboveLineRemain = beforeIds
        .slice(0, normalized)
        .some((id) => id !== completedTaskId && afterSet.has(id));
    if (completedWasRemoved &&
        completedIndex < normalized &&
        !activeTasksAboveLineRemain) {
        return { boundary: undefined, reached: true };
    }
    return {
        boundary: adjustQueuePauseBoundary(beforeQueue, boundary, afterQueue),
        reached: false
    };
}
export function moveWaitingTaskWithPauseBoundary(queue, boundary, taskId, direction) {
    const next = moveWaitingTask(queue, taskId, direction);
    return {
        queue: next,
        boundary: adjustQueuePauseBoundary(queue, boundary, next, taskId)
    };
}
export function reorderWaitingTaskWithPauseBoundary(queue, boundary, taskId, targetWaitingIndex) {
    const next = reorderWaitingTask(queue, taskId, targetWaitingIndex);
    return {
        queue: next,
        boundary: adjustQueuePauseBoundary(queue, boundary, next, taskId)
    };
}
export function removeQueueTaskWithPauseBoundary(queue, boundary, taskId) {
    const next = removeQueueTask(queue, taskId);
    return {
        queue: next,
        boundary: adjustQueuePauseBoundary(queue, boundary, next)
    };
}
const videoExtensions = new Set([".mp4", ".webm", ".mov", ".m4v", ".mkv"]);
function videoFilePathForVersion(history, assetId, versionId) {
    if (!assetId || !versionId)
        return undefined;
    const asset = history.find((item) => item.id === assetId);
    const version = asset?.versions.find((item) => item.id === versionId);
    return version?.files.find((file) => Boolean(file.absolutePath) && videoExtensions.has(file.filename.slice(file.filename.lastIndexOf(".")).toLowerCase()))?.absolutePath;
}
export function syncQueueVideoInputPaths(queue, history) {
    return queue.map((task) => {
        if (task.taskType === "extension") {
            const sourceVideoPath = videoFilePathForVersion(history, task.sourceAssetId, task.sourceVersionId);
            return sourceVideoPath && sourceVideoPath !== task.sourceVideoPath
                ? { ...task, sourceVideoPath, updatedAt: new Date().toISOString() }
                : task;
        }
        if (task.taskType === "upscale") {
            const sourceFilePath = videoFilePathForVersion(history, task.sourceAssetId, task.sourceVersionId);
            return sourceFilePath && sourceFilePath !== task.sourceFilePath
                ? { ...task, sourceFilePath, updatedAt: new Date().toISOString() }
                : task;
        }
        return task;
    });
}
export function moveWaitingTask(queue, taskId, direction) {
    const next = [...queue];
    const index = next.findIndex((task) => task.id === taskId);
    if (index < 0 || next[index]?.status !== "waiting")
        return next;
    // The currently running task is a hard execution boundary. A persisted or
    // concurrently updated queue can temporarily contain waiting items before
    // it, but a reorder must not move those records across the active task.
    const runningIndex = next.findIndex((task) => task.status === "running");
    if (runningIndex >= 0 && index < runningIndex)
        return next;
    let target = index + direction;
    while (target >= 0 && target < next.length && next[target]?.status !== "waiting") {
        target += direction;
    }
    if (target < 0 || target >= next.length)
        return next;
    if (runningIndex >= 0 && target < runningIndex)
        return next;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
}
/**
 * Reorders a waiting task by its position among reorderable waiting tasks.
 * Non-waiting records keep their slots, and the running task remains a hard
 * execution boundary even if persisted data temporarily contains a stale
 * waiting item before it.
 */
export function reorderWaitingTask(queue, taskId, targetWaitingIndex) {
    const next = [...queue];
    if (!Number.isInteger(targetWaitingIndex))
        return next;
    const runningIndex = next.findIndex((task) => task.status === "running");
    const reorderable = next
        .map((task, index) => ({ task, index }))
        .filter(({ task, index }) => task.status === "waiting" && (runningIndex < 0 || index > runningIndex));
    const sourceIndex = reorderable.findIndex(({ task }) => task.id === taskId);
    if (sourceIndex < 0 || reorderable.length < 2)
        return next;
    const targetIndex = Math.max(0, Math.min(targetWaitingIndex, reorderable.length - 1));
    if (targetIndex === sourceIndex)
        return next;
    const reordered = reorderable.map(({ task }) => task);
    const [moved] = reordered.splice(sourceIndex, 1);
    if (!moved)
        return next;
    reordered.splice(targetIndex, 0, moved);
    let reorderableIndex = 0;
    return next.map((task, index) => {
        const slot = reorderable[reorderableIndex];
        if (!slot || slot.index !== index)
            return task;
        reorderableIndex += 1;
        return reordered[reorderableIndex - 1];
    });
}
export function updateQueuedUpscaleTask(queue, taskId, patch, updatedAt = new Date().toISOString()) {
    return queue.map((task) => {
        if (task.id !== taskId ||
            task.taskType !== "upscale" ||
            !["waiting", "failed", "cancelled"].includes(task.status))
            return task;
        const resetFailure = task.status === "failed" || task.status === "cancelled";
        return {
            ...task,
            ...patch,
            seedVr2Checkpoint: undefined,
            seedVr2Progress: undefined,
            tileMode: patch.tileMode ?? task.tileMode,
            ...(resetFailure ? {
                status: "waiting",
                error: undefined,
                progress: 0,
                stage: undefined,
                startedAt: undefined,
                comfyPromptId: undefined,
                automaticRetryAttempt: undefined
            } : {}),
            updatedAt
        };
    });
}
export function randomizeQueuedTaskSeed(queue, taskId, clock = defaultClock) {
    const updatedAt = clock.now().toISOString();
    return queue.map((task) => {
        if (task.id !== taskId || task.status !== "waiting" || isImageGenerationQueueTask(task)) {
            return task;
        }
        const seedLimit = task.taskType === "upscale"
            ? 0xffffffff
            : Number.MAX_SAFE_INTEGER;
        const randomValue = clock.random();
        const boundedValue = Number.isFinite(randomValue)
            ? Math.max(0, Math.min(0.9999999999999999, randomValue))
            : 0;
        let seed = Math.floor(boundedValue * seedLimit);
        if (seed === task.seed)
            seed = (seed + 1) % seedLimit;
        return { ...task, seed, updatedAt };
    });
}
export function removeQueueTask(queue, taskId) {
    return queue.filter((task) => task.id !== taskId || task.status === "running");
}
const defaultClock = {
    now: () => new Date(),
    id: () => crypto.randomUUID(),
    random: () => Math.random()
};
export function duplicateQueueTask(state, taskId, clock = defaultClock) {
    const source = state.queue.find((task) => task.id === taskId);
    if (!source)
        return state.queue;
    if (isImageGenerationQueueTask(source)) {
        throw new Error("图片批次复制将在图片编辑页面接入。");
    }
    const now = clock.now().toISOString();
    const names = [
        ...state.queue.map((task) => task.outputFilename),
        ...state.history.map((asset) => asset.outputFilename)
    ];
    const outputFilename = source.taskType === "generation" || source.taskType === "extension"
        ? createOutputFilename(source.modelId, source.resolution, source.duration, names)
        : source.modelId === "aetherscale-dlss5" && source.aetherScale
            ? uniqueAetherScaleUpscaleFilename(source.sourceFilename, source.aetherScale.mode, names)
        : source.modelId === "dlss5-sr"
            ? uniqueDlss5UpscaleFilename(source.sourceFilename, source.targetScale, names)
            : uniqueUpscaleFilename(source.sourceFilename, source.targetHeight, names);
    return [...state.queue, {
            ...source,
            id: clock.id(),
            status: "waiting",
            createdAt: now,
            updatedAt: now,
            outputFilename,
            seed: source.keepSeedOnCopy
                ? source.seed
                : Math.floor(clock.random() * Number.MAX_SAFE_INTEGER),
            comfyPromptId: undefined,
            progress: 0,
            error: undefined,
            stage: undefined,
            automaticRetryAttempt: undefined,
        ...(source.taskType === "upscale" && source.modelId === "dlss5-sr" && source.dlss5
            ? { dlss5: structuredClone(source.dlss5) }
            : {}),
        ...(source.taskType === "upscale" && source.modelId === "aetherscale-dlss5" && source.aetherScale
            ? { aetherScale: structuredClone(source.aetherScale) }
            : {}),
            ...(source.taskType === "upscale"
                ? { seedVr2Checkpoint: undefined, seedVr2Progress: undefined }
                : {})
        }];
}
export function resetQueueTask(queue, taskId, updatedAt = new Date().toISOString()) {
    let reset = false;
    const next = queue.map((task) => {
        if (task.id !== taskId || (task.status !== "failed" && task.status !== "cancelled")) {
            return task;
        }
        reset = true;
        return {
            ...task,
            status: "waiting",
            updatedAt,
            comfyPromptId: undefined,
            progress: 0,
            error: undefined,
            stage: undefined,
            startedAt: undefined,
            automaticRetryAttempt: undefined,
            ...(task.taskType === "upscale" ? { seedVr2Progress: undefined } : {})
        };
    });
    return { queue: next, reset };
}
