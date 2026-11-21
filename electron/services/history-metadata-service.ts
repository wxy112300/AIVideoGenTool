import type {
  AppState,
  HistoryMetadataBatchUpdate,
  HistoryMetadataPatch,
  HistoryAsset,
  ImageHistoryProject
} from "../../src/types.js";
import { isHistoryRating, normalizeHistoryTags } from "../../src/core/history-filter.js";
import type { StateRepository } from "../ports/state-repository.js";
import type { AppLogger } from "../../src/infrastructure/app-logger.js";
import { historyMetadataRevision, HistoryMetadataConflict } from "./history-metadata-revision.js";
import { createNativeTranslator } from "../ui-translator.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
import type { Translate } from "../../src/core/i18n.js";
import type { HistoryMetadataChange } from "../../src/types.js";
import { historyMetadataRecord } from "../../src/core/history-metadata.js";

export interface HistoryMetadataServiceDependencies {
  store: StateRepository;
  logger: AppLogger;
  sendState(state: AppState): void;
  sendMetadataChanges?(changes: HistoryMetadataChange[]): void;
}

function validateMetadataPatch(patch: HistoryMetadataPatch, t: Translate): HistoryMetadataPatch {
  if (!patch || typeof patch !== "object") throw new Error(t(uiKeys.serviceError.historyInvalid));
  const favorite = patch.favorite;
  const rating = patch.rating;
  const tags = patch.tags;
  if (favorite !== undefined && typeof favorite !== "boolean") {
    throw new Error(t(uiKeys.serviceError.favoriteInvalid));
  }
  if (rating !== undefined && rating !== null && !isHistoryRating(rating)) {
    throw new Error(t(uiKeys.serviceError.ratingInvalid));
  }
  if (tags !== undefined && !Array.isArray(tags)) {
    throw new Error(t(uiKeys.serviceError.tagsInvalid));
  }
  return {
    ...(favorite !== undefined ? { favorite } : {}),
    ...(rating !== undefined ? { rating } : {}),
    ...(tags !== undefined ? { tags: normalizeHistoryTags(tags) } : {})
  };
}

export class HistoryMetadataService {
  constructor(private readonly deps: HistoryMetadataServiceDependencies) {}

  async patchMetadata(updates: HistoryMetadataBatchUpdate[]): Promise<HistoryMetadataChange[]> {
    const t = createNativeTranslator(this.deps.store.getSettings().uiLocale).t;
    if (!Array.isArray(updates) || !updates.length) throw new Error(t(uiKeys.serviceError.historyBatchInvalid));
    const validated = updates.map(update => {
      if (!update || typeof update.assetId !== "string" || !update.assetId.trim()) throw new Error(t(uiKeys.serviceError.historyInvalid));
      return { assetId: update.assetId, patch: validateMetadataPatch(update.patch, t) };
    });
    if (new Set(validated.map(update => update.assetId)).size !== validated.length) throw new Error(t(uiKeys.serviceError.historyBatchDuplicate));
    let changes: HistoryMetadataChange[] = [];
    const mutate = (items: import("../../src/types.js").HistoryMetadataRecord[]) => {
      changes = items.map((item, i) => {
        const previous = historyMetadataRecord(item);
        Object.assign(item, validated[i].patch);
        return { ...historyMetadataRecord(item), previous: { favorite: previous.favorite, rating: previous.rating, tags: previous.tags } };
      });
    };
    if (this.deps.store.updateHistoryMetadata) changes = await this.deps.store.updateHistoryMetadata(validated.map(update => update.assetId), mutate);
    else await this.updateItems(validated.map(update => update.assetId), mutate);
    this.deps.logger.info("history", "metadata-patched", "History metadata patched", { count: changes.length });
    this.deps.sendMetadataChanges?.(changes);
    return changes;
  }

  private updateItems(ids: readonly string[], mutator: (items: Array<HistoryAsset | ImageHistoryProject>) => void): Promise<AppState> {
    if (this.deps.store.updateHistoryItems) return this.deps.store.updateHistoryItems(ids, mutator);
    return this.deps.store.update(state => {
      const items = ids.map(id => state.history.find(item => item.id === id) ?? state.imageHistory.find(item => item.id === id));
      if (items.some(item => !item)) throw new Error(createNativeTranslator(state.settings.uiLocale).t(uiKeys.serviceError.historyMissing));
      mutator(items as Array<HistoryAsset | ImageHistoryProject>);
    });
  }

  async updateMetadata(
    assetId: string,
    patch: HistoryMetadataPatch,
    expectedRevision?: string
  ): Promise<AppState> {
    const locale = this.deps.store.getSettings().uiLocale;
    const t = createNativeTranslator(locale).t;
    if (typeof assetId !== "string" || !assetId.trim()) {
      throw new Error(t(uiKeys.serviceError.historyInvalid));
    }
    const validated = validateMetadataPatch(patch, t);
    const next = await this.updateItems([assetId], ([target]) => {
      if (!target) throw new Error(t(uiKeys.serviceError.historyMissing));
      if (expectedRevision !== undefined && historyMetadataRevision(target) !== expectedRevision) {
        throw new HistoryMetadataConflict(locale);
      }
      if (validated.favorite !== undefined) target.favorite = validated.favorite;
      if (validated.rating !== undefined) target.rating = validated.rating;
      if (validated.tags !== undefined) target.tags = validated.tags;
    });
    this.deps.logger.info("history", "metadata-updated", "History curation metadata updated", {
      assetId,
      ...(validated.favorite !== undefined ? { favorite: validated.favorite } : {}),
      ...(validated.rating !== undefined ? { rating: validated.rating } : {}),
      ...(validated.tags !== undefined ? { tags: validated.tags } : {})
    });
    this.deps.sendState(next);
    return next;
  }

  async updateMetadataBatch(updates: HistoryMetadataBatchUpdate[]): Promise<AppState> {
    const t = createNativeTranslator(this.deps.store.getSettings().uiLocale).t;
    if (!Array.isArray(updates) || updates.length === 0) {
      throw new Error(t(uiKeys.serviceError.historyBatchInvalid));
    }
    const validatedUpdates = updates.map((update) => {
      if (!update || typeof update.assetId !== "string" || !update.assetId.trim()) {
        throw new Error(t(uiKeys.serviceError.historyInvalid));
      }
      return { assetId: update.assetId, patch: validateMetadataPatch(update.patch, t) };
    });
    if (new Set(validatedUpdates.map((update) => update.assetId)).size !== validatedUpdates.length) {
      throw new Error(t(uiKeys.serviceError.historyBatchDuplicate));
    }
    const next = await this.updateItems(validatedUpdates.map(update => update.assetId), (items) => {
      validatedUpdates.forEach(({ patch }, index) => {
        const target = items[index];
        if (!target) throw new Error(t(uiKeys.serviceError.historyMissing));
        if (patch.favorite !== undefined) target.favorite = patch.favorite;
        if (patch.rating !== undefined) target.rating = patch.rating;
        if (patch.tags !== undefined) target.tags = patch.tags;
      });
    });
    this.deps.logger.info("history", "metadata-batch-updated", "History curation metadata updated in batch", {
      count: validatedUpdates.length
    });
    this.deps.sendState(next);
    return next;
  }

  async setImageCover(projectId: string, versionId?: string): Promise<AppState> {
    const t = createNativeTranslator(this.deps.store.get().settings.uiLocale).t;
    const next = await this.deps.store.update((state) => {
      const project = state.imageHistory.find((item) => item.id === projectId);
      if (!project) throw new Error(t(uiKeys.serviceError.imageProjectMissing));
      if (versionId) {
        if (!project.versions.some((version) => version.id === versionId)) {
          throw new Error(t(uiKeys.serviceError.imageVersionMissing));
        }
        project.coverMode = "pinned";
        project.coverVersionId = versionId;
      } else {
        project.coverMode = "auto";
        project.coverVersionId = undefined;
      }
    });
    this.deps.sendState(next);
    return next;
  }
}
