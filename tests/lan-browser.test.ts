import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { request } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { layoutBrowseTiles } from "../src/core/lan-browser";
import type { AppState, AssetVersion, HistoryAsset } from "../src/types";
import type { StateRepository } from "../electron/ports/state-repository";
import { HistoryQueryService } from "../electron/services/history-query-service";
import { HistoryMetadataService } from "../electron/services/history-metadata-service";
import { nativeHistoryFileSystem } from "../electron/services/native-history-file-system";
import { LanBrowserLibrary } from "../electron/services/lan-browser-library";
import { LanBrowserServer } from "../electron/services/lan-browser-server";
import { LanBrowserCovers } from "../electron/services/lan-browser-covers";
import type { AppLogger } from "../src/infrastructure/app-logger";

const roots: string[] = [];
const servers: LanBrowserServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.configure(false)));
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lan-browser-")); roots.push(root);
  await fs.writeFile(path.join(root, "index.html"), "<!doctype html><title>Library</title>");
  await fs.writeFile(path.join(root, "video.mp4"), "0123456789");
  let state = createDefaultState(); state.settings.outputDirectory = root;
  const file = { filename: "video.mp4", subfolder: "", type: "output" as const, absolutePath: path.join(root, "video.mp4") };
  const version: AssetVersion = { id: "v1", kind: "original", createdAt: "2026-10-18T01:00:00Z", outputFilename: file.filename, modelId: "model", width: 640, height: 360, duration: 3, fps: 24, workflowPath: "private-workflow", comfyPromptId: "private-prompt", comfyOutputs: {}, files: [file] };
  const asset: HistoryAsset = { mediaKind: "video", id: "one", taskId: "task", title: "First", outputFilename: file.filename, createdAt: version.createdAt, updatedAt: version.createdAt, modelId: "model", favorite: false, rating: null, tags: ["nature"], duration: 3, resolution: 360, fps: 24, prompt: "PRIVATE PROMPT", seed: 42, comfyPromptId: "private-prompt", comfyOutputs: {}, files: [file], versions: [version], defaultVersionId: version.id };
  state.history = [asset, { ...structuredClone(asset), id: "two", title: "Second", favorite: true, rating: 4.5, tags: ["city"], updatedAt: "2026-10-18T02:00:00Z" }];
  let mutation = Promise.resolve();
  const store: StateRepository = { get: () => structuredClone(state), getSettings: () => structuredClone(state.settings), load: async () => structuredClone(state), update: (mutator) => {
    const operation = mutation.then(() => { const next = structuredClone(state); mutator(next); state = next; return structuredClone(state); });
    mutation = operation.then(() => undefined, () => undefined); return operation;
  } };
  const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as AppLogger;
  const query = new HistoryQueryService({ store, logger, paths: { historyCoverDirectory: path.join(root, "covers") }, fileSystem: nativeHistoryFileSystem, resolveTaskOutputDirectory: async () => root });
  const metadata = new HistoryMetadataService({ store, logger, sendState: vi.fn() });
  const library = new LanBrowserLibrary({ store, query, metadata });
  const server = new LanBrowserServer({ library, webRoot: root, host: "127.0.0.1", addresses: () => [] }); servers.push(server);
  const status = await server.configure(true, 0);
  expect(status.state).toBe("running");
  return { root, state: () => store.get(), store, query, metadata, library, server, base: status.localUrl.replace(/\/$/, "") };
}

describe("LAN history browser", () => {
  it("only publishes video DTOs and preserves a query's order/default version through metadata changes", async () => {
    const f = await fixture();
    await f.store.update((state: AppState) => { state.history[0]!.versions.push({ ...state.history[0]!.versions[0]!, id: "large", width: 1920, height: 1080 }); });
    const first = await (await fetch(`${f.base}/api/v1/videos`)).json();
    expect(first.items.map((item: { id: string }) => item.id)).toEqual(["two", "one"]);
    expect(first.items[1].versionId).toBe("v1");
    const serialized = JSON.stringify(first);
    for (const secret of ["PRIVATE PROMPT", "private-workflow", "private-prompt", f.root, "settings", "comfyOutputs", "absolutePath"]) expect(serialized).not.toContain(secret);
    await f.metadata.updateMetadata("one", { rating: 5, favorite: true });
    const stable = await (await fetch(`${f.base}/api/v1/queries/${first.queryId}/items?offset=0&limit=2`)).json();
    expect(stable.items.map((item: { id: string }) => item.id)).toEqual(["two", "one"]);
    expect(stable.items[1].rating).toBe(5);
    const filtered = await (await fetch(`${f.base}/api/v1/videos?q=${encodeURIComponent(JSON.stringify({ favoriteOnly: true, tags: ["nature"], sort: "rating-desc" }))}`)).json();
    expect(filtered.items.map((item: { id: string }) => item.id)).toEqual(["one"]);
  });
  it("streams real byte ranges and HEAD without exposing desktop CORS or arbitrary files", async () => {
    const f = await fixture(); const url = `${f.base}/api/v1/videos/one/versions/v1/media`;
    const slice = await fetch(url, { headers: { Range: "bytes=2-4" } });
    expect(slice.status).toBe(206); expect(slice.headers.get("content-range")).toBe("bytes 2-4/10");
    expect(slice.headers.get("access-control-allow-origin")).toBeNull(); expect(await slice.text()).toBe("234");
    const suffix = await fetch(url, { headers: { Range: "bytes=-2" } }); expect(await suffix.text()).toBe("89");
    const head = await fetch(url, { method: "HEAD", headers: { Range: "bytes=2-4" } });
    expect(head.status).toBe(206); expect(head.headers.get("content-length")).toBe("3"); expect(await head.text()).toBe("");
    expect((await fetch(url, { headers: { Range: "bytes=100-" } })).status).toBe(416);
    expect((await fetch(`${f.base}/api/v1/files?path=${encodeURIComponent(path.join(f.root, "video.mp4"))}`)).status).toBe(404);
    expect((await fetch(`${f.base}/api/v1/settings`)).status).toBe(404);
    expect((await fetch(`${f.base}/api/v1/videos/%E0%A4%A`)).status).toBe(400);
  });
  it("loads only read-only prompt text for the requested video/version on demand", async () => {
    const f = await fixture();
    await f.store.update((state) => {
      const asset = state.history[0]!;
      asset.versions[0]!.videoLoras = [];
      asset.versions.push({ ...asset.versions[0]!, id: "v2", videoLoras: [{ id: "custom", name: "LoRA", filename: "hidden.safetensors", strength: 1, modelFamily: "custom", compatibleModelIds: [], compatibleInputModes: [], purpose: "style", promptPrefixes: ["v2 trigger"] }] });
    });
    const url = `${f.base}/api/v1/videos/one/versions`;
    const original = await fetch(`${url}/v1/prompt`);
    expect(original.headers.get("cache-control")).toBe("no-store");
    expect(await original.json()).toEqual({ id: "one", versionId: "v1", prompt: "PRIVATE PROMPT" });
    const version = await (await fetch(`${url}/v2/prompt`)).json();
    expect(version).toEqual({ id: "one", versionId: "v2", prompt: "v2 trigger, PRIVATE PROMPT" });
    expect(JSON.stringify(version)).not.toContain("hidden.safetensors");
    expect((await fetch(`${url}/missing/prompt`)).status).toBe(404);
    expect((await fetch(`${url}/v1/prompt`, { headers: { Origin: "https://evil.example" } })).status).toBe(403);
    expect((await fetch(`${url}/v1/prompt`, { method: "PUT" })).status).toBe(405);
    await f.store.update((state) => { state.history[0]!.prompt = ""; });
    expect((await (await fetch(`${url}/v1/prompt`)).json()).prompt).toBe("");
    expect(f.state().queue).toEqual([]);
  });
  it("writes only curation metadata, rejects cross-site writes and stale revisions", async () => {
    const f = await fixture(); const item = f.library.detail("one");
    const url = `${f.base}/api/v1/videos/one/metadata?version=v1`;
    const headers = { "Content-Type": "application/json", "If-Match": item.revision, Origin: f.base };
    expect((await fetch(url, { method: "PATCH", headers: { ...headers, Origin: "https://evil.example" }, body: '{"favorite":true}' })).status).toBe(403);
    expect((await fetch(url, { method: "PATCH", headers, body: '{"prompt":"oops"}' })).status).toBe(400);
    expect((await fetch(url, { method: "PATCH", headers, body: '{"rating":4.2}' })).status).toBe(400);
    const good = await fetch(url, { method: "PATCH", headers, body: JSON.stringify({ favorite: true, rating: 4.5, tags: [" Nature ", "nature", "test"] }) });
    expect(good.status).toBe(200); expect((await good.json()).tags).toEqual(["Nature", "test"]);
    const stale = await fetch(url, { method: "PATCH", headers, body: '{"tags":["overwrite"]}' }); expect(stale.status).toBe(409);
    expect(f.state().history[0]).toMatchObject({ favorite: true, rating: 4.5, tags: ["Nature", "test"], prompt: "PRIVATE PROMPT" });
    expect(f.state().queue).toEqual([]);
  });
  it("rejects unrecognized Host and releases the listener and queries on stop", async () => {
    const f = await fixture(); const first = f.library.createQuery({});
    const status = await new Promise<number>((resolve, reject) => { const req = request(f.base, { headers: { Host: "evil.example" } }, (res) => { res.resume(); resolve(res.statusCode!); }); req.on("error", reject); req.end(); });
    expect(status).toBe(403);
    await f.server.configure(false);
    expect(f.server.snapshot().state).toBe("off");
    expect(() => f.library.page(first.queryId, 0, 1)).toThrow("过期");
    await expect(fetch(f.base)).rejects.toThrow();
  });
  it("reuses the desktop cover cache without invoking a producer", async () => {
    const f = await fixture(); const asset = f.state().history[0]!, version = asset.versions[0]!;
    const key = f.query.coverCacheKeyForVideoVersion(asset, version);
    const lookup = await f.query.lookupHistoryCover(key, path.join(f.root, "video.mp4"));
    expect(lookup.state).toBe("miss"); if (lookup.state !== "miss") return;
    const saved = await f.query.saveHistoryCoverIfCurrent({ key, sourcePath: path.join(f.root, "video.mp4"), sourceRevision: lookup.sourceRevision, data: Uint8Array.from([0xff,0xd8,0xff,0xd9]).buffer });
    expect(saved.state).toBe("saved");
    const producer = new LanBrowserCovers(f.query);
    const frame = vi.spyOn(producer as unknown as { frame(): Promise<Buffer> }, "frame");
    expect(await producer.get(asset, version, path.join(f.root, "video.mp4"), new AbortController().signal)).toBeTruthy();
    expect(frame).not.toHaveBeenCalled();
    const response = await fetch(`${f.base}/api/v1/videos/one/versions/v1/cover`);
    expect(response.status).toBe(200); expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect((await response.arrayBuffer()).byteLength).toBe(4);
  });
  it("reports a port collision without stopping its owner, then recovers on retry", async () => {
    const f = await fixture();
    const other = new LanBrowserServer({ library: new LanBrowserLibrary(f.library.deps), webRoot: f.root, host: "127.0.0.1", addresses: () => [] });
    servers.push(other);
    const port = f.server.snapshot().port;
    expect((await other.configure(true, port)).state).toBe("error");
    expect((await fetch(f.base)).status).toBe(200);
    await f.server.configure(false);
    expect((await other.configure(true, port)).state).toBe("running");
    expect((await fetch(f.base)).status).toBe(200);
  });
});

describe("mobile media wall layout", () => {
  it("uses two portrait columns, more tablet columns, and keeps navigation in data order", () => {
    const media = Array.from({ length: 300 }, (_, i) => ({ width: i % 2 ? 1080 : 1920, height: i % 2 ? 1920 : 1080 }));
    const phone = layoutBrowseTiles(media, 390, "masonry");
    expect(phone.columns).toBe(2); expect(phone.tiles.map((tile) => tile.index)).toEqual(media.map((_, i) => i));
    expect(layoutBrowseTiles(media, 820, "masonry").columns).toBe(3);
    expect(layoutBrowseTiles(media, 1180, "masonry").columns).toBe(5);
    const album = layoutBrowseTiles(media, 390, "album");
    expect(album.columns).toBe(4);
    expect(layoutBrowseTiles(media, 308, "album").columns).toBe(3);
    expect(album.tiles[0]!.height / album.tiles[0]!.width).toBeCloseTo(4/3);
    expect(phone.tiles.every((tile) => tile.x >= 0 && tile.x + tile.width <= 390.01)).toBe(true);
  });
  it("preserves extreme source aspect ratios in masonry instead of cropping them", () => {
    const media = [{ width: 3200, height: 200 }, { width: 200, height: 2000 }];
    const layout = layoutBrowseTiles(media, 378, "masonry");
    layout.tiles.forEach((tile, index) => expect(tile.width / tile.height).toBeCloseTo(media[index]!.width / media[index]!.height));
  });
});
