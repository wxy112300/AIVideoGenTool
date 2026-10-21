/** Additive IPC approval, scoped to the exact deletion and references shown. */
export interface HistoryDeleteApproval {
  referenceToken: string;
}

export interface HistoryDeleteImpact extends HistoryDeleteApproval {
  references: { id: string; label: string }[];
}

const marker = "HISTORY_DELETE_CONFIRMATION_REQUIRED:";

// Electron preserves Error.message but not custom error fields across invoke.
export function historyDeleteConfirmationMessage(impact: HistoryDeleteImpact): string {
  return `文件仍被其他版本、队列或草稿引用，需要再次确认。 ${marker}${encodeURIComponent(JSON.stringify(impact))}`;
}

export function historyDeleteImpactFromError(error: unknown): HistoryDeleteImpact | null {
  const message = error instanceof Error ? error.message : String(error);
  const encoded = message.split(marker)[1]?.split(/\s/)[0];
  if (!encoded) return null;
  try {
    const impact = JSON.parse(decodeURIComponent(encoded)) as HistoryDeleteImpact;
    if (!/^[a-f0-9]{64}$/.test(impact.referenceToken) || !Array.isArray(impact.references) ||
      !impact.references.length || !impact.references.every(reference =>
        typeof reference.id === "string" && typeof reference.label === "string")) return null;
    return impact;
  } catch { return null; }
}
