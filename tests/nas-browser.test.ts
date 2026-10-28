import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { request } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { exportLibrary } from "../Tools/NasBrowser/src/exporter";
import { digest, parseCatalog, portablePath } from "../Tools/NasBrowser/src/catalog";
import { NasLibrary } from "../Tools/NasBrowser/src/library";
import { startServer } from "../Tools/NasBrowser/src/server";
import { createHistoryCoverCacheKey } from "../src/core/history-cover";
import { normalizeBrowseFilter } from "../src/core/lan-browser";

const roots: string[] = [];
const servers: Awaited<ReturnType<typeof startServer>>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
  for (const root of roots.splice(0)) {
    const resolved = path.resolve(root);
    if (!path.basename(resolved).startsWith("nas-browser-") || path.dirname(resolved) !== path.resolve(os.tmpdir())) throw new Error("Unexpected fixture cleanup target");
    await fs.rm(resolved, { recursive: true, force: true });
  }
});
async function fixture(separateRoots = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "nas-browser-")); roots.push(root);
  const outputRoot = path.join(root, "pc-output"), nas = path.join(root, "different-nas-location"), coversDirectory = path.join(root, "cache");
  await Promise.all([outputRoot, nas, coversDirectory].map((p) => fs.mkdir(p)));
  const libraryRoot = separateRoots ? path.join(root, "pc-documents") : outputRoot;
  const nasLibraryRoot = separateRoots ? path.join(root, "nas-documents") : nas;
  if (separateRoots) await Promise.all([libraryRoot, nasLibraryRoot].map((p) => fs.mkdir(p)));
  const absolutePath = path.join(outputRoot, "clip.mp4"); await fs.writeFile(absolutePath, "0123456789");
  const version = { id: "v1", createdAt: "2026-10-27T01:00:00Z", width: 360, height: 640, duration: 6,
    files: [{ filename: "clip.mp4", subfolder: "", absolutePath, type: "output" }], comfyOutputs: { private: "private-graph" } };
  const asset = { id: "asset1", title: "One", createdAt: version.createdAt, updatedAt: version.createdAt,
    modelId: "minimax_h3_fl2va", tags: [" Nature ", "nature"], duration: 6, defaultVersionId: "v1", versions: [version],
    prompt: "hello\n<script>must stay text</script>", favorite: true, rating: 4.5 };
  const state = { history: [asset], settings: { uiLocale: "zh-CN", secret: "private-setting" }, queue: [{ private: "private-queue" }] };
  const stateFile = path.join(root, "studio-state.json"); await fs.writeFile(stateFile, JSON.stringify(state));
  const key = createHistoryCoverCacheKey({ assetId: asset.id, versionId: version.id, createdAt: version.createdAt, filename: "clip.mp4", absolutePath });
  const stat = await fs.stat(absolutePath);
  await fs.writeFile(path.join(coversDirectory, `${digest(key)}.jpg`), "cached-jpeg");
  await fs.writeFile(path.join(coversDirectory, `${digest(key)}.json`), JSON.stringify({ sourceSize: stat.size, sourceMtimeMs: stat.mtimeMs }));
  const config = { stateFile, outputRoot, coversDirectory, ...(separateRoots ? { libraryRoot } : {}) };
  const sync = async (media = true) => {
    await fs.cp(path.join(libraryRoot, "StudioLibrary"), path.join(nasLibraryRoot, "StudioLibrary"), { recursive: true, force: true });
    if (media) await fs.copyFile(absolutePath, path.join(nas, "clip.mp4"));
  };
  return { root, config, nas, state, version, absolutePath, sync, libraryRoot, nasLibraryRoot };
}

describe("NAS portable read-only library", () => {
  it("independently maps Documents archives and ComfyUI output on PC and NAS without changing video paths", async () => {
    const f = await fixture(true); await exportLibrary(f.config);
    await expect(fs.access(path.join(f.config.outputRoot, "StudioLibrary"))).rejects.toThrow();
    const raw = await fs.readFile(path.join(f.libraryRoot, "StudioLibrary/catalog.json"), "utf8");
    expect(parseCatalog(raw).assets[0]?.versions[0]?.media.path).toBe("clip.mp4");
    await f.sync();
    const library = new NasLibrary(f.nas, "StudioLibrary", f.nasLibraryRoot); await library.reload();
    expect(library.info().count).toBe(1);
    expect(await library.source("asset1", "v1", "media")).toBe(await fs.realpath(path.join(f.nas, "clip.mp4")));
    expect(path.relative(await fs.realpath(f.nasLibraryRoot), await library.source("asset1", "v1", "cover"))).toMatch(/^StudioLibrary[\\/]covers[\\/]/);
    const catalog = parseCatalog(raw); catalog.assets[0]!.versions[0]!.cover = { path: "clip.mp4", size: 10 };
    await fs.writeFile(path.join(f.nasLibraryRoot, "StudioLibrary/catalog.json"), JSON.stringify(catalog));
    await library.reload();
    expect(library.detail("asset1").coverUrl).toBe(""); // Never resolve archive files against the media mount.
  });
  it("exports stable IDs, relative paths and valid cached covers without private App state or rewriting unchanged files", async () => {
    const f = await fixture(), before = await fs.readFile(f.config.stateFile, "utf8");
    expect(await exportLibrary(f.config)).toEqual({ assets: 1, versions: 1, covers: 1, skipped: 0, changed: true });
    const filename = path.join(f.config.outputRoot, "StudioLibrary/catalog.json"), raw = await fs.readFile(filename, "utf8");
    const catalog = parseCatalog(raw), stat = await fs.stat(filename);
    expect(catalog.assets[0]?.versions[0]?.media).toEqual({ path: "clip.mp4", size: 10 });
    expect(catalog.assets[0]?.tags).toEqual(["Nature"]);
    expect(raw).not.toMatch(/absolutePath|private-setting|private-graph|private-queue/);
    expect(catalog.assets[0]).toMatchObject({ favorite: true, rating: 4.5 });
    expect(raw).not.toContain(f.root);
    expect(catalog.assets[0]?.versions[0]?.prompt).toBe(f.state.history[0]!.prompt);
    expect((await exportLibrary(f.config)).changed).toBe(false);
    expect((await fs.stat(filename)).mtimeMs).toBe(stat.mtimeMs);
    expect(await fs.readFile(f.config.stateFile, "utf8")).toBe(before);
    await f.sync(); const library = new NasLibrary(f.nas); await library.reload();
    expect(library.info()).toMatchObject({ readOnly: true, count: 1 });
    expect(await fs.readFile(await library.source("asset1", "v1", "cover"), "utf8")).toBe("cached-jpeg");
  });
  it("keeps partial media invisible, recovers when upload completes, and retains the last good catalog", async () => {
    const f = await fixture(); await exportLibrary(f.config); await f.sync(false);
    const library = new NasLibrary(f.nas); await library.reload(); expect(library.info().count).toBe(0);
    await fs.writeFile(path.join(f.nas, "clip.mp4"), "012"); await library.reload(); expect(library.info().count).toBe(0);
    await f.sync(); await library.reload(); expect(library.info().count).toBe(1);
    const query = library.createQuery({ tags: ["nature"], favoriteOnly: true, minRating: 4, sort: "rating-desc" });
    expect(query.total).toBe(1); expect(query.filter).toMatchObject({ favoriteOnly: true, minRating: 4, sort: "rating-desc" });
    await fs.writeFile(path.join(f.nas, "StudioLibrary/catalog.json"), "{");
    await expect(library.reload()).rejects.toThrow(); expect(library.info().count).toBe(1);
    expect(library.page(query.queryId, 0, 1).items[0]?.id).toBe("asset1");
    await fs.unlink(path.join(f.nas, "clip.mp4"));
    await expect(library.source("asset1", "v1", "media")).rejects.toMatchObject({ status: 404 });
  });
  it("does not export outside media, stale covers or incomplete state over a good index", async () => {
    const f = await fixture(); await exportLibrary(f.config);
    const name = path.join(f.config.outputRoot, "StudioLibrary/catalog.json"), good = await fs.readFile(name, "utf8");
    await fs.writeFile(f.config.stateFile, "{}"); await expect(exportLibrary(f.config)).rejects.toThrow();
    expect(await fs.readFile(name, "utf8")).toBe(good);
    const outside = path.join(f.root, "outside.mp4"); await fs.writeFile(outside, "other-video");
    f.version.files = [{ ...f.version.files[0]!, filename: "outside.mp4", absolutePath: outside }];
    await fs.writeFile(f.config.stateFile, JSON.stringify(f.state));
    expect(await exportLibrary(f.config)).toMatchObject({ assets: 0, skipped: 1 });
    f.version.files = [{ filename: "clip.mp4", subfolder: "", absolutePath: f.absolutePath, type: "output" }];
    await fs.writeFile(f.absolutePath, "different-size"); await fs.writeFile(f.config.stateFile, JSON.stringify(f.state));
    expect(await exportLibrary(f.config)).toMatchObject({ assets: 1, covers: 0 });
  });
  it("rejects drive letters/traversal and symlink escapes without exposing arbitrary files", async () => {
    for (const value of ["../secret", "/etc/passwd", "C:/private", "a\\b", "a//b", "a/./b", "a/../b", "a\u0000b"]) expect(() => portablePath(value)).toThrow();
    const f = await fixture(); await exportLibrary(f.config); await f.sync();
    const outside = path.join(f.root, "outside"); await fs.mkdir(outside); await fs.writeFile(path.join(outside, "private.mp4"), "0123456789");
    await fs.symlink(outside, path.join(f.nas, "escape"), process.platform === "win32" ? "junction" : "dir");
    const filename = path.join(f.nas, "StudioLibrary/catalog.json"), catalog = parseCatalog(await fs.readFile(filename, "utf8"));
    catalog.assets[0]!.versions[0]!.media.path = "escape/private.mp4"; await fs.writeFile(filename, JSON.stringify(catalog));
    const library = new NasLibrary(f.nas); await library.reload(); expect(library.info().count).toBe(0);
  });
  it("serves Range/HEAD, prompt on demand, and blocks all writes, private paths and cross-origin requests", async () => {
    const f = await fixture(true); await exportLibrary(f.config); await f.sync();
    const web = path.join(f.root, "web"); await fs.mkdir(web); await fs.writeFile(path.join(web, "index.html"), "<!doctype html>");
    const server = await startServer({ mediaRoot: f.nas, libraryRoot: f.nasLibraryRoot, host: "127.0.0.1", port: 0, allowedOrigins: ["http://nas.test:8790"], pollSeconds: 60 }, web); servers.push(server);
    const base = `http://127.0.0.1:${(server.server.address() as { port: number }).port}`;
    const get = (url: string, options: { method?: string; headers?: Record<string, string> } = {}) => new Promise<Response>((resolve, reject) => {
      const req = request(base + url, { method: options.method, headers: { Host: "nas.test:8790", ...options.headers } }, (response) => {
        const chunks: Buffer[] = []; response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => resolve(new Response(options.method === "HEAD" || response.statusCode === 304 ? null : Buffer.concat(chunks), {
          status: response.statusCode!, headers: response.headers as Record<string, string>
        }))); response.on("error", reject);
      }); req.on("error", reject); req.end();
    });
    const pageResponse = await get("/api/v1/videos"); expect(pageResponse.status).toBe(200);
    const page = await pageResponse.json();
    expect(JSON.stringify(page)).not.toMatch(/prompt|absolutePath|mediaRoot|clip\.mp4/);
    const item = page.items[0];
    expect(item).toMatchObject({ favorite: true, rating: 4.5, tags: ["Nature"] });
    const response = await get(item.mediaUrl, { headers: { Range: "bytes=2-5" } });
    expect(response.status).toBe(206); expect(await response.text()).toBe("2345");
    expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
    const head = await get(item.mediaUrl, { method: "HEAD" }); expect(head.headers.get("content-length")).toBe("10"); expect(await head.text()).toBe("");
    expect((await get(item.coverUrl)).headers.get("content-type")).toBe("image/jpeg");
    expect((await get(item.mediaUrl, { headers: { Range: "bytes=99-" } })).status).toBe(416);
    expect((await (await get(item.mediaUrl.replace(/media$/, "prompt"))).json()).prompt).toBe(f.state.history[0]!.prompt);
    for (const method of ["PATCH", "POST", "PUT", "DELETE"]) expect((await get("/api/v1/videos/asset1/metadata", { method })).status).toBe(405);
    expect((await get("/StudioLibrary/catalog.json")).status).toBe(404);
    expect((await get("/api/v1/library", { headers: { Host: "evil.test" } })).status).toBe(403);
    expect((await get("/api/v1/library", { headers: { Origin: "http://evil.test" } })).status).toBe(403);
    expect((await get("/api/v1/library", { headers: { "Sec-Fetch-Site": "cross-site" } })).status).toBe(403);
    expect((await (await get("/healthz")).json()).ready).toBe(true);
  });
  it("preserves all browse conditions independently of metadata write permission", () => {
    const input = { favoriteOnly: true, minRating: 4 as const, sort: "rating-desc" as const, tags: ["Nature"] };
    expect(normalizeBrowseFilter(input).favoriteOnly).toBe(true);
    expect(normalizeBrowseFilter(input)).toMatchObject({ favoriteOnly: true, minRating: 4, sort: "rating-desc", tags: ["Nature"] });
  });
  it("filters and sorts synchronized favorites and half-star ratings, while accepting older projections", async () => {
    const f = await fixture();
    f.state.history.push({ ...f.state.history[0]!, id: "asset2", favorite: false, rating: 2 });
    await fs.writeFile(f.config.stateFile, JSON.stringify(f.state));
    await exportLibrary(f.config); await f.sync();
    const library = new NasLibrary(f.nas); await library.reload();
    expect(library.createQuery({ favoriteOnly: true }).items.map(item => item.id)).toEqual(["asset1"]);
    expect(library.createQuery({ minRating: 4 }).items.map(item => item.id)).toEqual(["asset1"]);
    expect(library.createQuery({ maxRating: 2 }).items.map(item => item.id)).toEqual(["asset2"]);
    expect(library.createQuery({ sort: "rating-desc" }).items.map(item => item.id)).toEqual(["asset1", "asset2"]);
    expect(library.createQuery({ sort: "rating-asc" }).items.map(item => item.id)).toEqual(["asset2", "asset1"]);
    const filename = path.join(f.nas, "StudioLibrary/catalog.json"), catalog = parseCatalog(await fs.readFile(filename, "utf8"));
    for (const asset of catalog.assets) { delete asset.favorite; delete asset.rating; }
    await fs.writeFile(filename, JSON.stringify(catalog)); await library.reload();
    expect(library.detail("asset1")).toMatchObject({ favorite: false, rating: null });
    expect(library.createQuery({}).total).toBe(2);
    expect(library.createQuery({ favoriteOnly: true }).total).toBe(0);
    for (const invalid of [{ favorite: "yes" }, { rating: 4.2 }, { rating: 6 }]) {
      expect(() => parseCatalog(JSON.stringify({ ...catalog, assets: [{ ...catalog.assets[0], ...invalid }] }))).toThrow();
    }
  });
});
