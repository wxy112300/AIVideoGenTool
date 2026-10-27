import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { promises as fs } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { mediaFileResponse } from "../../../electron/services/media-file-response.js";
import { HttpError, NasLibrary } from "./library.js";
import type { HistoryFilterInput } from "../../../src/core/history-filter.js";

export interface ServerConfig {
  mediaRoot: string; libraryRoot?: string; libraryDirectory?: string; host?: string; port?: number; pollSeconds?: number;
  /** Enables v2 commits and the local persistent SQLite index; omit for legacy catalog.json. */
  dataDirectory?: string;
  /** Exact browser origins, including the NAS host port; works through Docker bridge networking. */
  allowedOrigins: string[];
}
const privateAddress = (address: string) => {
  const ip = address.replace(/^::ffff:/, "");
  return ip === "::1" || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});

export async function startServer(config: ServerConfig, webRoot: string, log: (message: string) => void = console.error) {
  const port = config.port ?? 8790, seconds = config.pollSeconds ?? 10;
  if (!config.mediaRoot || !Number.isInteger(port) || port < 0 || port > 65535 || !Number.isFinite(seconds) || seconds < 1 || seconds > 86400 ||
      !Array.isArray(config.allowedOrigins) || !config.allowedOrigins.length) throw new Error("Invalid server configuration");
  const origins = config.allowedOrigins.map((value) => {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("allowedOrigins must contain exact HTTP(S) origins");
    return url.origin;
  });
  await fs.access(path.join(webRoot, "index.html"));
  const library = new NasLibrary(config.mediaRoot, config.libraryDirectory, config.libraryRoot, config.dataDirectory);
  let lastError = "";
  const reload = async () => {
    try { await library.reload(); lastError = ""; }
    catch (error) { const message = (error as Error).message; if (message !== lastError) log(`Library refresh: ${message}`); lastError = message; }
  };
  await reload();
  const timer = setInterval(() => { void reload(); }, seconds * 1000);
  timer.unref();
  const route = async (request: IncomingMessage): Promise<Response> => {
    if (!privateAddress(request.socket.remoteAddress ?? "")) throw new HttpError(403, "仅支持局域网访问。");
    const authority = request.headers.host?.toLowerCase();
    const matching = origins.filter((o) => new URL(o).host === authority);
    if (!matching.length || (request.headers.origin && !matching.includes(request.headers.origin)) || request.headers["sec-fetch-site"] === "cross-site") throw new HttpError(403, "访问地址无效。");
    const read = request.method === "GET" || request.method === "HEAD";
    if (!read) throw new HttpError(405, "此服务仅支持浏览。");
    const url = new URL(request.url ?? "/", matching[0]);
    if (url.search.length > 8192) throw new HttpError(400, "查询条件过长。");
    let parts: string[];
    try { parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent); }
    catch { throw new HttpError(400, "访问地址无效。"); }
    if (url.pathname === "/healthz") {
      const info = library.info();
      return json({ ready: true, readOnly: true, count: info.count, revision: info.revision, refreshError: Boolean(lastError) });
    }
    if (parts[0] !== "api") {
      const relative = url.pathname === "/" ? "index.html" : /^\/assets\/[a-zA-Z0-9_.-]+$/.test(url.pathname) ? url.pathname.slice(1) : null;
      if (!relative) throw new HttpError(404, "页面不存在。");
      const bytes = await fs.readFile(path.join(webRoot, relative)).catch(() => null);
      if (!bytes) throw new HttpError(404, "页面不存在。");
      const type = relative.endsWith(".html") ? "text/html; charset=utf-8" : relative.endsWith(".js") ? "text/javascript; charset=utf-8" : relative.endsWith(".css") ? "text/css; charset=utf-8" : "application/octet-stream";
      return new Response(request.method === "HEAD" ? null : bytes, { headers: { "Content-Type": type, "Content-Length": String(bytes.length), "Cache-Control": relative === "index.html" ? "no-cache" : "private, max-age=3600" } });
    }
    if (parts[1] !== "v1") throw new HttpError(404, "接口不存在。");
    if (parts.length === 3 && ["library", "facets"].includes(parts[2]!)) return json(library.info());
    if (parts.length === 3 && parts[2] === "videos") {
      let filter: unknown;
      try { filter = JSON.parse(url.searchParams.get("q") ?? "{}"); } catch { throw new HttpError(400, "筛选参数无效。"); }
      if (!filter || typeof filter !== "object" || Array.isArray(filter)) throw new HttpError(400, "筛选参数无效。");
      return json(library.createQuery(filter as HistoryFilterInput));
    }
    if (parts.length === 5 && parts[2] === "queries" && parts[4] === "items") return json(library.page(parts[3]!, Number(url.searchParams.get("offset") ?? 0), Number(url.searchParams.get("limit") ?? 48), url.searchParams.get("around") ?? undefined));
    if (parts[2] === "videos" && parts[3]) {
      if (parts.length === 4) return json(library.detail(parts[3], url.searchParams.get("version") ?? undefined));
      if (parts.length === 7 && parts[4] === "versions") {
        if (parts[6] === "prompt") return json(library.prompt(parts[3], parts[5]!));
        if (parts[6] === "media" || parts[6] === "cover") {
          const filename = await library.source(parts[3], parts[5]!, parts[6]);
          const stat = await fs.stat(filename);
          const etag = `"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
          const cache = parts[6] === "cover" ? "private, max-age=60" : "private, no-cache";
          if (request.headers["if-none-match"] === etag) return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": cache } });
          const result = mediaFileResponse(filename, stat.size, { method: request.method!, headers: { get: (name) => String(request.headers[name.toLowerCase()] ?? "") || null } });
          result.headers.set("ETag", etag); result.headers.set("Cache-Control", cache);
          return result;
        }
      }
    }
    throw new HttpError(404, "接口不存在。");
  };
  const respond = async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const result = await route(request);
      result.headers.forEach((v, k) => response.setHeader(k, v));
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Referrer-Policy", "no-referrer");
      response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
      response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'");
      response.statusCode = result.status;
      if (!result.body || request.method === "HEAD") { await result.body?.cancel(); response.end(); return; }
      const stream = Readable.fromWeb(result.body as import("node:stream/web").ReadableStream);
      const close = () => { if (!response.writableFinished) stream.destroy(); };
      response.once("close", close);
      try { await pipeline(stream, response); } finally { response.removeListener("close", close); }
    } catch (error) {
      if (response.destroyed) return;
      if (response.headersSent) { response.destroy(); return; }
      const status = error instanceof HttpError ? error.status : 500;
      response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      response.end(JSON.stringify({ error: status === 500 ? "服务暂时不可用，请重试。" : (error as Error).message }));
    }
  };
  const server = createServer((request, response) => { void respond(request, response); });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  try {
    await new Promise<void>((resolve, reject) => {
      const fail = (error: Error) => reject(error);
      server.once("error", fail);
      server.listen(port, config.host ?? "0.0.0.0", () => { server.removeListener("error", fail); resolve(); });
    });
  } catch (error) { clearInterval(timer); throw error; }
  return { server, library, async close() {
    clearInterval(timer); library.clear();
    await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); });
  } };
}
