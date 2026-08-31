import type {
  AppState,
  HistoryMetadataPatch,
  Settings
} from "../../src/types.js";
import { isHistoryRating, normalizeHistoryTags } from "../../src/core/history-filter.js";
import type { StateRepository } from "../ports/state-repository.js";
import type { AppLogger } from "../../src/infrastructure/app-logger.js";

export interface HistoryMetadataServiceDependencies {
  store: StateRepository;
  logger: AppLogger;
  sendState(state: AppState): void;
}

export class HistoryMetadataService {
  constructor(private readonly deps: HistoryMetadataServiceDependencies) {}

  async updateMetadata(
    assetId: string,
    patch: HistoryMetadataPatch
  ): Promise<AppState> {
    if (typeof assetId !== "string" || !assetId.trim() || !patch || typeof patch !== "object") {
      throw new Error("历史记录参数无效。");
    }
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
    const normalizedTags = tags === undefined ? undefined : normalizeHistoryTags(tags);
    const next = await this.deps.store.update((state) => {
      const video = state.history.find((item) => item.id === assetId);
      const image = state.imageHistory.find((item) => item.id === assetId);
      const target = video ?? image;
      if (!target) throw new Error("历史记录不存在。");
      if (favorite !== undefined) target.favorite = favorite;
      if (rating !== undefined) target.rating = rating;
      if (normalizedTags !== undefined) target.tags = normalizedTags;
    });
    this.deps.logger.info("history", "metadata-updated", "History curation metadata updated", {
      assetId,
      ...(favorite !== undefined ? { favorite } : {}),
      ...(rating !== undefined ? { rating } : {}),
      ...(normalizedTags !== undefined ? { tags: normalizedTags } : {})
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
