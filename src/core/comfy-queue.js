function queueEntries(value) {
    return Array.isArray(value) ? value : [];
}
function promptIdFromQueueEntry(entry) {
    if (!Array.isArray(entry))
        return null;
    const promptId = entry[1];
    return typeof promptId === "string" && promptId.trim() ? promptId : null;
}
function clientIdFromQueueEntry(entry) {
    if (!Array.isArray(entry))
        return "";
    const extraData = entry[3];
    if (!extraData || typeof extraData !== "object")
        return "";
    const clientId = extraData.client_id;
    return typeof clientId === "string" ? clientId : "";
}
export function appPromptIdsInComfyQueue(snapshot) {
    if (!snapshot || typeof snapshot !== "object")
        return [];
    const queue = snapshot;
    const entries = [
        ...queueEntries(queue.queue_running),
        ...queueEntries(queue.queue_pending)
    ];
    return entries
        .filter((entry) => clientIdFromQueueEntry(entry).startsWith("local-video-studio-") && clientIdFromQueueEntry(entry).includes("prompt"))
        .map(promptIdFromQueueEntry)
        .filter((promptId) => promptId !== null);
}
export function comfyQueueContainsAnyPromptId(snapshot, promptIds) {
    if (!promptIds.size || !snapshot || typeof snapshot !== "object")
        return false;
    const queue = snapshot;
    return [
        ...queueEntries(queue.queue_running),
        ...queueEntries(queue.queue_pending)
    ].some((entry) => {
        const promptId = promptIdFromQueueEntry(entry);
        return promptId !== null && promptIds.has(promptId);
    });
}
export function comfyPromptQueueLocation(snapshot, promptId) {
    if (!promptId.trim() || !snapshot || typeof snapshot !== "object")
        return "absent";
    const queue = snapshot;
    if (queueEntries(queue.queue_running).some((entry) => promptIdFromQueueEntry(entry) === promptId)) {
        return "running";
    }
    if (queueEntries(queue.queue_pending).some((entry) => promptIdFromQueueEntry(entry) === promptId)) {
        return "pending";
    }
    return "absent";
}
