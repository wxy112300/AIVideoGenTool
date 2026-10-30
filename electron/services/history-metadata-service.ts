import type {
  AppState,
  HistoryMetadataBatchUpdate,
  HistoryMetadataPatch
} from "../../src/types.js";
import { isHistoryRating, normalizeHistoryTags } from "../../src/core/history-filter.js";
import type { StateRepository } from "../ports/state-repository.js";
import type { AppLogger } from "../../src/infrastructure/app-logger.js";
import { historyMetadataRevision, HistoryMetadataConflict } from "./history-metadata-revision.js";
import { createNativeTranslator } from "../ui-translator.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
import type { Translate } from "../../src/core/i18n.js";

export interface HistoryMetadataServiceDependencies {
  store: StateRepository;
  logger: AppLogger;
  sendState(state: AppState): void;
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

  async updateMetadata(
    assetId: string,
    patch: HistoryMetadataPatch,
    expectedRevision?: string
  ): Promise<AppState> {
    const locale = this.deps.store.get().settings.uiLocale;
    const t = createNativeTranslator(locale).t;
    if (typeof assetId !== "string" || !assetId.trim()) {
      throw new Error(t(uiKeys.serviceError.historyInvalid));
    }
    const validated = validateMetadataPatch(patch, t);
    const next = await this.deps.store.update((state) => {
      const video = state.history.find((item) => item.id === assetId);
      const image = state.imageHistory.find((item) => item.id === assetId);
      const target = video ?? image;
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
    const t = createNativeTranslator(this.deps.store.get().settings.uiLocale).t;
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
    const next = await this.deps.store.update((state) => {
      validatedUpdates.forEach(({ assetId, patch }) => {
        const target = state.history.find((item) => item.id === assetId) ??
          state.imageHistory.find((item) => item.id === assetId);
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
