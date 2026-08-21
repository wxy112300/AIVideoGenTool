interface ComfyQueueSnapshot {
  queue_running?: unknown;
  queue_pending?: unknown;
}

function queueEntries(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function promptIdFromQueueEntry(entry: unknown): string | null {
  if (!Array.isArray(entry)) return null;
  const promptId = entry[1];
  return typeof promptId === "string" && promptId.trim() ? promptId : null;
}

function clientIdFromQueueEntry(entry: unknown): string {
  if (!Array.isArray(entry)) return "";
  const extraData = entry[3];
  if (!extraData || typeof extraData !== "object") return "";
  const clientId = (extraData as { client_id?: unknown }).client_id;
  return typeof clientId === "string" ? clientId : "";
}

export function appPromptIdsInComfyQueue(snapshot: unknown): string[] {
  if (!snapshot || typeof snapshot !== "object") return [];
  const queue = snapshot as ComfyQueueSnapshot;
  const entries = [
    ...queueEntries(queue.queue_running),
    ...queueEntries(queue.queue_pending)
  ];
  return entries
    .filter((entry) => clientIdFromQueueEntry(entry).startsWith("local-video-studio-") && clientIdFromQueueEntry(entry).includes("prompt"))
    .map(promptIdFromQueueEntry)
    .filter((promptId): promptId is string => promptId !== null);
}

export function comfyQueueContainsAnyPromptId(snapshot: unknown, promptIds: ReadonlySet<string>): boolean {
  if (!promptIds.size || !snapshot || typeof snapshot !== "object") return false;
  const queue = snapshot as ComfyQueueSnapshot;
  return [
    ...queueEntries(queue.queue_running),
    ...queueEntries(queue.queue_pending)
  ].some((entry) => {
    const promptId = promptIdFromQueueEntry(entry);
    return promptId !== null && promptIds.has(promptId);
  });
}

export type ComfyPromptQueueLocation = "running" | "pending" | "absent";

export function comfyPromptQueueLocation(
  snapshot: unknown,
  promptId: string
): ComfyPromptQueueLocation {
  if (!promptId.trim() || !snapshot || typeof snapshot !== "object") return "absent";
  const queue = snapshot as ComfyQueueSnapshot;
  if (queueEntries(queue.queue_running).some((entry) => promptIdFromQueueEntry(entry) === promptId)) {
    return "running";
  }
  if (queueEntries(queue.queue_pending).some((entry) => promptIdFromQueueEntry(entry) === promptId)) {
    return "pending";
  }
  return "absent";
}
