import { promises as fs } from "node:fs";
import path from "node:path";
import type { AppState } from "../types.js";
import { modelCatalog } from "../core/catalog/index.js";
import { isHistoryRating, normalizeHistoryTags } from "../core/history-filter.js";
import { createHistoryCoverCacheKey } from "../core/history-cover.js";
import { versionVideoIndex } from "../core/history-video.js";
import { videoPromptForLoras } from "../core/video-loras.js";
import { atomicWrite, confinedFile, digest, parseCatalog, portablePath, type PortableCatalog, type PortableFile } from "./nas-catalog.js";

export interface ExportConfig {
  stateFile: string; outputRoot: string; libraryRoot?: string; coversDirectory?: string; libraryDirectory?: string; intervalSeconds?: number;
}

export async function exportLibrary(config: ExportConfig, snapshot?: AppState, commitCatalog?: (target: string, catalog: PortableCatalog) => Promise<boolean>): Promise<{ assets: number; versions: number; covers: number; skipped: number; changed: boolean }> {
  if (!config.stateFile || !config.outputRoot) throw new Error("stateFile and outputRoot are required");
  const root = await fs.realpath(config.outputRoot);
  const libraryRoot = config.libraryRoot ? await fs.realpath(config.libraryRoot) : root;
  const directory = portablePath(config.libraryDirectory ?? "StudioLibrary");
  // Resolve the export directory too: a symlink must not redirect writes out of the selected library root.
  await fs.mkdir(path.join(libraryRoot, directory), { recursive: true });
  const target = await confinedFile(libraryRoot, directory);
  await fs.mkdir(path.join(target, "covers"), { recursive: true });
  const coverTarget = await confinedFile(libraryRoot, `${directory}/covers`);
  const state = snapshot ?? JSON.parse(await fs.readFile(config.stateFile, "utf8")) as AppState;
  if (!state || !Array.isArray(state.history)) throw new Error("State has no history array; existing export was preserved");
  const locale = state.settings?.uiLocale === "en-US" || state.settings?.uiLocale === "zh-TW" ? state.settings.uiLocale : "zh-CN";
  const catalog: PortableCatalog = { schemaVersion: 1, locale, models: [], assets: [] };
  const counts = { assets: 0, versions: 0, covers: 0, skipped: 0, changed: false };
  const cacheRoot = config.coversDirectory ?? path.join(path.dirname(config.stateFile), "history-covers", "v3");
  for (const asset of state.history) {
    if (!Array.isArray(asset.versions)) throw new Error("History versions are invalid; existing export was preserved");
    const versions: PortableCatalog["assets"][number]["versions"] = [];
    for (const version of asset.versions) {
      const file = version.files?.[versionVideoIndex(version)];
      if (!file) { counts.skipped++; continue; }
      const candidates = [file.absolutePath, path.join(root, file.subfolder ?? "", file.filename)].filter((v): v is string => Boolean(v));
      let source: string | undefined;
      for (const candidate of candidates) {
        try {
          const relative = path.relative(root, path.resolve(candidate)).split(path.sep).join("/");
          source = await confinedFile(root, relative);
          break;
        } catch { /* Only existing files within the declared sync root can be published. */ }
      }
      const stat = source && await fs.stat(source).catch(() => null);
      if (!source || !stat || !stat.isFile() || !stat.size) { counts.skipped++; continue; }
      let cover: PortableFile | undefined;
      const key = createHistoryCoverCacheKey({ assetId: asset.id, versionId: version.id,
        createdAt: version.createdAt, filename: file.filename, absolutePath: file.absolutePath ?? "" });
      try {
        const cached = path.join(cacheRoot, `${digest(key)}.jpg`);
        const metadata = JSON.parse(await fs.readFile(path.join(cacheRoot, `${digest(key)}.json`), "utf8")) as { sourceSize?: number; sourceMtimeMs?: number };
        if (metadata.sourceSize === stat.size && typeof metadata.sourceMtimeMs === "number" && Math.abs(metadata.sourceMtimeMs - stat.mtimeMs) <= 1) {
          const bytes = await fs.readFile(cached);
          if (bytes.length) {
            const filename = `${digest(bytes)}.jpg`;
            const destination = path.join(coverTarget, filename);
            const existing = await fs.readFile(destination).catch(() => null);
            if (!existing || digest(existing) !== digest(bytes)) await atomicWrite(destination, bytes);
            cover = { path: `${directory}/covers/${filename}`, size: bytes.length };
            counts.covers++;
          }
        }
      } catch { /* Missing/stale covers stay placeholders; this exporter never starts a decoder. */ }
      versions.push({ id: version.id, createdAt: version.createdAt, width: version.width, height: version.height,
        duration: version.duration, media: { path: path.relative(root, source).split(path.sep).join("/"), size: stat.size },
        ...(cover ? { cover } : {}), prompt: videoPromptForLoras(asset.prompt, version.videoLoras ?? asset.videoLoras) });
      counts.versions++;
    }
    if (!versions.length) continue;
    catalog.assets.push({ id: asset.id, title: asset.title, createdAt: asset.createdAt, updatedAt: asset.updatedAt,
      modelId: asset.modelId, tags: normalizeHistoryTags(asset.tags), duration: asset.duration,
      favorite: asset.favorite === true, rating: isHistoryRating(asset.rating) ? asset.rating : null,
      defaultVersionId: asset.defaultVersionId, versions });
  }
  catalog.models = [...new Set(catalog.assets.map((a) => a.modelId))].map((id) => ({ id, name: modelCatalog.localized(id, locale)?.name ?? id }));
  const bytes = JSON.stringify(catalog);
  parseCatalog(bytes);
  const filename = path.join(target, "catalog.json");
  if (commitCatalog) counts.changed = await commitCatalog(target, catalog);
  else if (await fs.readFile(filename, "utf8").catch(() => null) !== bytes) { await atomicWrite(filename, bytes); counts.changed = true; }
  counts.assets = catalog.assets.length;
  return counts;
}
