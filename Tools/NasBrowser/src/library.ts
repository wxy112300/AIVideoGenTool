import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { filterHistoryAssets, normalizeHistoryTags, type HistoryFilterInput, type HistoryFilterState } from "../../../src/core/history-filter.js";
import { normalizeBrowseFilter, type BrowseLibraryInfo, type BrowsePage, type BrowseVideo, type BrowseVideoPrompt } from "../../../src/core/lan-browser.js";
import { preferredVersion } from "../../../src/core/history-video.js";
import { confinedFile, digest, parseCatalog, portablePath, type PortableAsset, type PortableCatalog, type PortableFile, type PortableVersion } from "./catalog.js";
import { NasCommitIndex } from "./commit-index.js";

export class HttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }
interface Snapshot { revision: string; catalog: PortableCatalog; assets: Map<string, PortableAsset> }
interface Query { snapshot: Snapshot; filter: HistoryFilterState; entries: Array<{ id: string; versionId: string }>; expires: number }

export class NasLibrary {
  private root = "";
  private archive = "";
  private snapshot: Snapshot | null = null;
  private queries = new Map<string, Query>();
  private reloading: Promise<void> | null = null;
  private index?: NasCommitIndex;
  constructor(private mediaRoot: string, private directory = "StudioLibrary", private libraryRoot = mediaRoot, dataDirectory?: string) {
    portablePath(directory);
    if (dataDirectory) this.index = new NasCommitIndex(dataDirectory, [mediaRoot, libraryRoot]);
  }

  reload(): Promise<void> {
    if (this.reloading) return this.reloading;
    this.reloading = this.readSnapshot().finally(() => { this.reloading = null; });
    return this.reloading;
  }
  private async readSnapshot(): Promise<void> {
    const root = await fs.realpath(this.mediaRoot);
    const archive = await fs.realpath(this.libraryRoot);
    let catalog: PortableCatalog;
    if (this.index) {
      const source = await confinedFile(archive, this.directory).catch(() => undefined);
      catalog = (await this.index.refresh(source)).catalog;
    } else {
      const filename = await confinedFile(archive, `${this.directory}/catalog.json`);
      const stat = await fs.stat(filename);
      if (stat.size > 64 * 1024 * 1024) throw new Error("Catalog exceeds 64 MiB");
      catalog = parseCatalog(await fs.readFile(filename, "utf8"));
    }
    const ready: PortableAsset[] = [];
    // Recheck on every poll even when the index is unchanged: media can arrive after its index.
    for (const asset of catalog.assets) {
      const versions: PortableVersion[] = [];
      for (const version of asset.versions) {
        const source = await this.readyFile(root, version.media);
        if (!source) continue;
        const cover = version.cover && await this.readyFile(archive, version.cover);
        versions.push({ ...version, cover: cover ? version.cover : undefined });
      }
      if (versions.length) ready.push({ ...asset, versions });
    }
    catalog.assets = ready;
    const revision = digest(JSON.stringify(catalog));
    this.root = root;
    this.archive = archive;
    if (this.snapshot?.revision !== revision) this.snapshot = { revision, catalog, assets: new Map(ready.map((a) => [a.id, a])) };
    this.prune();
    if (this.index?.lastError) throw new Error(this.index.lastError);
  }
  private async readyFile(root: string, file: PortableFile): Promise<string | null> {
    try { const name = await confinedFile(root, file.path); const stat = await fs.stat(name); return stat.isFile() && stat.size === file.size ? name : null; }
    catch { return null; }
  }
  private current(): Snapshot { if (!this.snapshot) throw new HttpError(503, "浏览资料尚未同步完成，请稍后重试。"); return this.snapshot; }
  info(): BrowseLibraryInfo {
    const snapshot = this.current();
    return { readOnly: true, revision: snapshot.revision, count: snapshot.assets.size, locale: snapshot.catalog.locale,
      models: snapshot.catalog.models, tags: normalizeHistoryTags(snapshot.catalog.assets.flatMap((a) => a.tags)).sort((a, b) => a.localeCompare(b, "zh-CN")) };
  }
  createQuery(raw: HistoryFilterInput): BrowsePage {
    this.prune();
    const snapshot = this.current(), filter = normalizeBrowseFilter(raw, true);
    const assets = filterHistoryAssets(snapshot.catalog.assets.map((a) => ({ ...a, favorite: false, rating: null })), filter);
    const id = randomUUID();
    this.queries.set(id, { snapshot, filter, entries: assets.map((a) => ({ id: a.id, versionId: preferredVersion(a).id })), expires: Date.now() + 30 * 60_000 });
    return this.page(id, 0, 48);
  }
  page(id: string, offset: number, limit: number, around?: string): BrowsePage {
    const query = this.queries.get(id);
    if (!query || query.expires <= Date.now()) { this.queries.delete(id); throw new HttpError(410, "浏览列表已过期，请刷新列表。"); }
    if (around) { const index = query.entries.findIndex((e) => e.id === around); if (index < 0) throw new HttpError(404, "视频不在当前筛选结果中。"); offset = Math.max(0, index - 1); }
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 96) throw new HttpError(400, "分页参数无效。");
    query.expires = Date.now() + 30 * 60_000;
    return { queryId: id, offset, total: query.entries.length, filter: query.filter,
      items: query.entries.slice(offset, offset + limit).map((e) => this.dto(query.snapshot, e.id, e.versionId)) };
  }
  private record(snapshot: Snapshot, id: string, versionId?: string): { asset: PortableAsset; version: PortableVersion } {
    const asset = snapshot.assets.get(id);
    const version = asset && (versionId ? asset.versions.find((v) => v.id === versionId) : preferredVersion(asset));
    if (!asset || !version) throw new HttpError(404, "视频不可用。");
    return { asset, version };
  }
  private dto(snapshot: Snapshot, id: string, versionId?: string): BrowseVideo {
    const { asset, version } = this.record(snapshot, id, versionId);
    const base = `/api/v1/videos/${encodeURIComponent(id)}/versions/${encodeURIComponent(version.id)}`;
    return { id, versionId: version.id, title: asset.title, createdAt: asset.createdAt, updatedAt: asset.updatedAt,
      modelId: asset.modelId, width: version.width, height: version.height, duration: version.duration, tags: asset.tags,
      favorite: false, rating: null, revision: snapshot.revision, mediaUrl: `${base}/media`, coverUrl: version.cover ? `${base}/cover` : "" };
  }
  detail(id: string, versionId?: string): BrowseVideo { return this.dto(this.current(), id, versionId); }
  prompt(id: string, versionId: string): BrowseVideoPrompt {
    const version = this.record(this.current(), id, versionId).version;
    return { id, versionId, prompt: version.promptRef && this.index ? this.index.prompt(version.promptRef) : version.prompt };
  }
  async source(id: string, versionId: string, kind: "media" | "cover"): Promise<string> {
    const file = this.record(this.current(), id, versionId).version[kind];
    const name = file && await this.readyFile(kind === "media" ? this.root : this.archive, file);
    if (!name) throw new HttpError(404, "媒体尚未同步完成或已不可用。");
    return name;
  }
  private prune(): void {
    for (const [id, q] of this.queries) if (q.expires <= Date.now()) this.queries.delete(id);
    while (this.queries.size >= 32) this.queries.delete(this.queries.keys().next().value!);
  }
  clear(): void { this.queries.clear(); this.index?.close(); }
}
