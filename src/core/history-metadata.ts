import type { AppState, HistoryMetadataChange, HistoryMetadataRecord } from "../types.js";

export function historyMetadataRecord(item: HistoryMetadataRecord): HistoryMetadataRecord {
  return { id: item.id, favorite: item.favorite ?? false, rating: item.rating ?? null, tags: [...(item.tags ?? [])] };
}

function sameMetadata(item: Omit<HistoryMetadataRecord, "id">, other: Omit<HistoryMetadataRecord, "id">): boolean {
  return (item.favorite ?? false) === other.favorite && (item.rating ?? null) === other.rating &&
    (item.tags ?? []).length === other.tags.length && (item.tags ?? []).every((tag, i) => tag === other.tags[i]);
}

/** Preserve all media objects; duplicate events/acks and stale acknowledgements are harmless. */
export function applyHistoryMetadataChanges(state: AppState, changes: readonly HistoryMetadataChange[]): AppState {
  const byId = new Map(changes.map(change => [change.id, change]));
  const apply = <T extends HistoryMetadataRecord>(items: T[]): T[] => {
    let changed = false;
    const next = items.map(item => {
      const update = byId.get(item.id);
      if (!update || sameMetadata(item, update) || !sameMetadata(item, update.previous)) return item;
      changed = true;
      return { ...item, favorite: update.favorite, rating: update.rating, tags: [...update.tags] };
    });
    return changed ? next : items;
  };
  const history = apply(state.history), imageHistory = apply(state.imageHistory);
  return history === state.history && imageHistory === state.imageHistory ? state : { ...state, history, imageHistory };
}
