import type {
  AppState,
  HistoryMetadataBatchUpdate,
  HistoryMetadataPatch
} from "../../src/types.js";
import { isHistoryRating, normalizeHistoryTags } from "../../src/core/history-filter.js";
import type { StateRepository } from "../ports/state-repository.js";
import type { AppLogger } from "../../src/infrastructure/app-logger.js";

export interface HistoryMetadataServiceDependencies {
  store: StateRepository;
  logger: AppLogger;
  sendState(state: AppState): void;
}

function validateMetadataPatch(patch: HistoryMetadataPatch): HistoryMetadataPatch {
  if (!patch || typeof patch !== "object") throw new Error("历史记录参数无效。");
  const favorite = patch.favorite;
  const rating = patch.rating;
  const tags = patch.tags;
  if (favorite !== undefined && typeof favorite !== "boolean") {
    throw new Error("收藏状态无效。");
  }
  if (rating !== undefined && rating !== null && !isHistoryRating(rating)) {
    throw new Error("评分必须是 0.5 到 5 分，支持半星。");
  }
  if (tags !== undefined && !Array.isArray(tags)) {
    throw new Error("历史标签格式无效。");
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
    patch: HistoryMetadataPatch
  ): Promise<AppState> {
    if (typeof assetId !== "string" || !assetId.trim()) {
      throw new Error("历史记录参数无效。");
    }
    const validated = validateMetadataPatch(patch);
    const next = await this.deps.store.update((state) => {
      const video = state.history.find((item) => item.id === assetId);
      const image = state.imageHistory.find((item) => item.id === assetId);
      const target = video ?? image;
      if (!target) throw new Error("历史记录不存在。");
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
    if (!Array.isArray(updates) || updates.length === 0) {
      throw new Error("批量历史记录参数无效。");
    }
    const validatedUpdates = updates.map((update) => {
      if (!update || typeof update.assetId !== "string" || !update.assetId.trim()) {
        throw new Error("历史记录参数无效。");
      }
      return { assetId: update.assetId, patch: validateMetadataPatch(update.patch) };
    });
    if (new Set(validatedUpdates.map((update) => update.assetId)).size !== validatedUpdates.length) {
      throw new Error("批量历史记录不能包含重复项目。");
    }
    const next = await this.deps.store.update((state) => {
      validatedUpdates.forEach(({ assetId, patch }) => {
        const target = state.history.find((item) => item.id === assetId) ??
          state.imageHistory.find((item) => item.id === assetId);
        if (!target) throw new Error("历史记录不存在。");
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
    const next = await this.deps.store.update((state) => {
      const project = state.imageHistory.find((item) => item.id === projectId);
      if (!project) throw new Error("图片项目不存在。");
      if (versionId) {
        if (!project.versions.some((version) => version.id === versionId)) {
          throw new Error("图片版本不存在。");
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
