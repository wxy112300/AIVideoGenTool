export const notificationDuration = {
    info: 6_000,
    warning: 7_500,
    error: Number.POSITIVE_INFINITY,
    "task-complete": 8_000,
    "queue-complete": 9_000
};
export const notificationPersistent = {
    info: false,
    warning: false,
    error: true,
    "task-complete": false,
    "queue-complete": false
};
export function notificationDedupeKey(message, kind) {
    return `${kind}\u0000${message.trim()}`;
}
export function createNotification(id, message, kind, durationMs = notificationDuration[kind], actions = []) {
    return {
        id,
        message,
        kind,
        durationMs,
        persistent: notificationPersistent[kind],
        dedupeKey: notificationDedupeKey(message, kind),
        actions: [...actions]
    };
}
export function notificationAlreadyPending(candidate, current, queue) {
    return [current, ...queue].some((notification) => notification?.dedupeKey === candidate.dedupeKey);
}
export function notificationShouldPreserveError(current, nextKind) {
    return current?.kind === "error" && nextKind !== "error";
}
function completedHistoryTasks(state) {
    const completed = new Map();
    for (const asset of state.history) {
        if (asset.taskId)
            completed.set(asset.taskId, asset.title || asset.outputFilename);
        for (const version of asset.versions) {
            if (version.taskId)
                completed.set(version.taskId, asset.title || version.outputFilename);
        }
    }
    for (const project of state.imageHistory) {
        for (const version of project.versions) {
            if (version.taskId)
                completed.set(version.taskId, project.title || version.file.filename);
        }
    }
    return completed;
}
export function queueCompletionChange(previous, next) {
    if (!previous)
        return { completedTasks: [], failedTasks: [], queueCompleted: false };
    const before = completedHistoryTasks(previous);
    const after = completedHistoryTasks(next);
    const completedTasks = [...after.entries()]
        .filter(([taskId]) => !before.has(taskId))
        .map(([taskId, title]) => ({ taskId, title }));
    const previousTasks = new Map(previous.queue.map((task) => [task.id, task]));
    const failedTasks = next.queue
        .filter((task) => task.status === "failed" && previousTasks.get(task.id)?.status !== "failed")
        .map((task) => ({
        taskId: task.id,
        title: task.outputFilename,
        error: task.error?.trim() || "未知运行错误"
    }));
    const queueCompleted = previous.queueRunning &&
        !next.queueRunning &&
        next.queue.length === 0;
    return { completedTasks, failedTasks, queueCompleted };
}
