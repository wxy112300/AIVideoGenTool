import type { AppState, HistoryMetadataBatchUpdate } from "../../../types";
import type { RendererContext } from "../../contracts";
import { applyHistoryMetadataChanges, historyMetadataRecord } from "../../../core/history-metadata";
import { uiKeys } from "../../../core/i18n-keys";

export class HistoryMetadataSaveError extends Error {}

export async function updateHistoryMetadata(context: RendererContext, updates: HistoryMetadataBatchUpdate[], openItem?: (id: string, kind: "video" | "image") => void): Promise<AppState> {
  const before = context.getState();
  const targets = updates.map(update => {
    const video = before?.history.find(item => item.id === update.assetId);
    const image = before?.imageHistory.find(item => item.id === update.assetId);
    return { id: update.assetId, title: video?.title || image?.title || video?.prompt?.slice(0, 48).trim() || image?.versions[0]?.prompt?.slice(0, 48).trim() || video?.versions[0]?.outputFilename || image?.versions[0]?.file.filename || update.assetId, kind: image ? "image" as const : "video" as const };
  });
  try {
    if (context.application.patchHistoryMetadata) {
      const changes = await context.application.patchHistoryMetadata(updates);
      const state = context.getState();
      if (!state) throw new Error("History state unavailable");
      return applyHistoryMetadataChanges(state, changes);
    }
    const snapshot = await (updates.length === 1 ? context.application.updateHistoryMetadata(updates[0]!.assetId, updates[0]!.patch) : context.application.updateHistoryMetadataBatch(updates));
    const current = context.getState();
    if (!current) throw new Error("History state unavailable");
    return applyHistoryMetadataChanges(current, updates.flatMap(update => {
      const previous = before?.history.find(item => item.id === update.assetId) ?? before?.imageHistory.find(item => item.id === update.assetId);
      const next = snapshot.history.find(item => item.id === update.assetId) ?? snapshot.imageHistory.find(item => item.id === update.assetId);
      if (!previous || !next) return [];
      const { id: _id, ...metadata } = historyMetadataRecord(previous);
      return [{ ...historyMetadataRecord(next), previous: metadata }];
    }));
  } catch (error) {
    const target = targets[0];
    const operation = updates.some(update => update.patch.tags !== undefined) ? uiKeys.history.tags.updateFailed :
      updates.some(update => update.patch.rating !== undefined) ? uiKeys.uiError.ratingUpdate : uiKeys.uiError.favoriteUpdate;
    const reason = (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method ['"][^'"]+['"]: (?:\w*Error: )?/, "");
    const names = targets.slice(0, 3).map(item => item.title.length > 48 ? `${item.title.slice(0, 48)}…` : item.title).join("、");
    const message = `${names}${targets.length > 3 ? ` +${targets.length - 3}` : ""} · ${context.t(operation)} ${reason}`;
    context.notify(message, { kind: "error", renderPage: false,
      key: `history-metadata:${targets.map(item => item.id).join(":")}:${operation}`,
      actions: target && openItem ? [{ id: "open-history", label: context.t(uiKeys.history.metadataOpen), run: () => openItem(target.id, target.kind) }] : [] });
    throw new HistoryMetadataSaveError(message);
  }
}
