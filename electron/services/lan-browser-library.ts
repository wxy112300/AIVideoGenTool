import { createHash, randomUUID } from "node:crypto";
import type { BrowseLibraryInfo, BrowsePage, BrowseVideo, BrowseVideoPrompt } from "../../src/core/lan-browser.js";
import { filterHistoryAssets, historyTagNames, normalizeHistoryFilter, type HistoryFilterState } from "../../src/core/history-filter.js";
import { preferredVersion, versionVideoIndex } from "../../src/core/history-video.js";
import { modelCatalog } from "../../src/core/catalog/index.js";
import { videoPromptForLoras } from "../../src/core/video-loras.js";
import type { AssetVersion, HistoryAsset, HistoryMetadataPatch } from "../../src/types.js";
import type { StateRepository } from "../ports/state-repository.js";
import type { HistoryQueryService } from "./history-query-service.js";
import type { HistoryMetadataService } from "./history-metadata-service.js";
import { historyMetadataRevision } from "./history-metadata-revision.js";

export class BrowseError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

interface QuerySnapshot {
  filter: HistoryFilterState;
  entries: Array<{ id: string; versionId: string }>;
  expires: number;
}

export class LanBrowserLibrary {
  private readonly queries = new Map<string, QuerySnapshot>();
  constructor(readonly deps: {
    store: StateRepository;
    query: HistoryQueryService;
    metadata: HistoryMetadataService;
    now?: () => number;
  }) {}

  info(): BrowseLibraryInfo {
    const state = this.deps.store.get();
    const models = [...new Set(state.history.map((asset) => asset.modelId))];
    const revision = createHash("sha256").update(JSON.stringify(state.history.map((asset) => [
      asset.id, asset.updatedAt, asset.defaultVersionId, asset.versions.map((v) => v.id), historyMetadataRevision(asset)
    ]))).digest("hex");
    return { revision, count: state.history.length, locale: state.settings.uiLocale ?? "zh-CN",
      tags: historyTagNames(state.history, [], "video"), models: models.map((id) => ({ id, name: modelCatalog.localized(id, state.settings.uiLocale)?.name ?? id })) };
  }

  createQuery(raw: Partial<HistoryFilterState>): BrowsePage {
    this.prune();
    const filter = normalizeHistoryFilter(raw);
    const entries = filterHistoryAssets(this.deps.store.get().history, filter)
      .filter((asset) => asset.versions.length > 0)
      .map((asset) => ({ id: asset.id, versionId: preferredVersion(asset).id }));
    const id = randomUUID();
    this.queries.set(id, { filter, entries, expires: this.now() + 30 * 60_000 });
    return this.page(id, 0, 48);
  }

  page(id: string, offset: number, limit: number, around?: string): BrowsePage {
    const snapshot = this.queries.get(id);
    if (!snapshot || snapshot.expires <= this.now()) {
      this.queries.delete(id);
      throw new BrowseError(410, "浏览列表已过期，请刷新列表。");
    }
    if (around) {
      const index = snapshot.entries.findIndex((entry) => entry.id === around);
      if (index < 0) throw new BrowseError(404, "视频不在当前筛选结果中。");
      offset = Math.max(0, index - 1);
    }
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 96) {
      throw new BrowseError(400, "分页参数无效。");
    }
    snapshot.expires = this.now() + 30 * 60_000;
    const assets = new Map(this.deps.store.get().history.map((asset) => [asset.id, asset]));
    const items = snapshot.entries.slice(offset, offset + limit).map((entry) => {
      const asset = assets.get(entry.id);
      const version = asset?.versions.find((v) => v.id === entry.versionId);
      return asset && version ? this.dto(asset, version) : {
        id: entry.id, versionId: entry.versionId, title: "", createdAt: "", updatedAt: "", modelId: "",
        width: 0, height: 0, duration: 0, favorite: false, rating: null, tags: [], revision: "",
        coverUrl: "", mediaUrl: ""
      } satisfies BrowseVideo;
    });
    return { queryId: id, total: snapshot.entries.length, offset, items, filter: snapshot.filter };
  }

  detail(assetId: string, versionId?: string): BrowseVideo {
    const { asset, version } = this.record(assetId, versionId);
    return this.dto(asset, version);
  }

  prompt(assetId: string, versionId: string): BrowseVideoPrompt {
    const { asset, version } = this.record(assetId, versionId);
    return { id: asset.id, versionId: version.id, prompt: videoPromptForLoras(asset.prompt, version.videoLoras ?? asset.videoLoras) };
  }

  record(assetId: string, versionId?: string): { asset: HistoryAsset; version: AssetVersion } {
    const asset = this.deps.store.get().history.find((item) => item.id === assetId);
    if (!asset || !asset.versions.length) throw new BrowseError(404, "视频已不可用。");
    const version = versionId ? asset.versions.find((v) => v.id === versionId) : preferredVersion(asset);
    if (!version) throw new BrowseError(404, "视频版本已不可用。");
    return { asset, version };
  }

  async source(assetId: string, versionId: string): Promise<{ asset: HistoryAsset; version: AssetVersion; filename: string }> {
    const { asset, version } = this.record(assetId, versionId);
    const file = version.files[versionVideoIndex(version)];
    const filename = file && await this.deps.query.resolveHistoryFile(file);
    if (!filename) throw new BrowseError(404, "视频文件不可用，请在电脑端检查历史文件。");
    return { asset, version, filename };
  }

  async update(assetId: string, patch: HistoryMetadataPatch, revision: string, versionId?: string): Promise<BrowseVideo> {
    this.record(assetId, versionId);
    if (!/^[a-f0-9]{64}$/.test(revision)) throw new BrowseError(428, "缺少信息版本，请刷新后重试。");
    await this.deps.metadata.updateMetadata(assetId, patch, revision);
    return this.detail(assetId, versionId);
  }

  clear(): void { this.queries.clear(); }

  private dto(asset: HistoryAsset, version: AssetVersion): BrowseVideo {
    const base = `/api/v1/videos/${encodeURIComponent(asset.id)}/versions/${encodeURIComponent(version.id)}`;
    return {
      id: asset.id, versionId: version.id, title: asset.title, createdAt: asset.createdAt,
      updatedAt: asset.updatedAt, modelId: asset.modelId, width: version.width, height: version.height,
      duration: version.duration, favorite: asset.favorite, rating: asset.rating,
      tags: [...asset.tags], revision: historyMetadataRevision(asset),
      coverUrl: `${base}/cover`, mediaUrl: `${base}/media`
    };
  }

  private now(): number { return this.deps.now?.() ?? Date.now(); }
  private prune(): void {
    for (const [id, query] of this.queries) if (query.expires <= this.now()) this.queries.delete(id);
    while (this.queries.size >= 32) this.queries.delete(this.queries.keys().next().value!);
  }
}
