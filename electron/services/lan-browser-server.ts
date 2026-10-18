import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { promises as fs } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { LAN_BROWSER_DEFAULT_PORT, type LanBrowserStatus } from "../../src/core/lan-browser.js";
import type { HistoryMetadataPatch } from "../../src/types.js";
import { BrowseError, LanBrowserLibrary } from "./lan-browser-library.js";
import { HistoryMetadataConflict } from "./history-metadata-revision.js";
import { LanBrowserCovers } from "./lan-browser-covers.js";
import { mediaFileResponse } from "./media-file-response.js";

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});

export function lanAddresses(): string[] {
  return [...new Set(Object.values(networkInterfaces()).flatMap((entries) => (entries ?? [])
    .filter((entry) => entry.family === "IPv4" && !entry.internal).map((entry) => entry.address)))];
}

function privateAddress(address: string): boolean {
  const ip = address.replace(/^::ffff:/, "");
  return ip === "::1" || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
}

/** Only the optional LAN transport lives here; no ComfyUI, window or store ownership. */
export class LanBrowserServer {
  private server: Server | null = null;
  private controller = new AbortController();
  private tail: Promise<unknown> = Promise.resolve();
  private status: LanBrowserStatus = { state: "off", port: LAN_BROWSER_DEFAULT_PORT, localUrl: "", urls: [], error: "" };
  private readonly covers: LanBrowserCovers;
  constructor(private readonly deps: {
    library: LanBrowserLibrary;
    webRoot: string;
    addresses?: () => string[];
    /** Tests/dev can bind loopback; production explicitly uses the LAN listener. */
    host?: string;
  }) { this.covers = new LanBrowserCovers(deps.library.deps.query); }

  snapshot(): LanBrowserStatus {
    const status = { ...this.status, urls: [] as string[] };
    if (status.state === "running") status.urls = (this.deps.addresses?.() ?? lanAddresses()).map((ip) => `http://${ip}:${status.port}/`);
    return status;
  }

  configure(enabled: boolean, port = LAN_BROWSER_DEFAULT_PORT): Promise<LanBrowserStatus> {
    const operation = this.tail.catch(() => undefined).then(async () => {
      if (enabled && this.status.state === "running" && port === this.status.port) return this.snapshot();
      await this.stop();
      if (!enabled) return this.snapshot();
      if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid LAN port");
      this.status = { state: "starting", port, localUrl: "", urls: [], error: "" };
      this.controller = new AbortController();
      const server = createServer((request, response) => { void this.respond(request, response); });
      server.requestTimeout = 15_000;
      server.headersTimeout = 10_000;
      this.server = server;
      try {
        await fs.access(path.join(this.deps.webRoot, "index.html"));
        await new Promise<void>((resolve, reject) => {
          server.once("error", reject);
          server.listen({ host: this.deps.host ?? "0.0.0.0", port, exclusive: true }, () => {
            server.removeListener("error", reject);
            resolve();
          });
        });
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Listener unavailable");
        this.status = { state: "running", port: address.port, localUrl: `http://127.0.0.1:${address.port}/`, urls: [], error: "" };
        server.on("error", () => { void this.stop(); });
      } catch (error) {
        await this.stop();
        this.status = { state: "error", port, localUrl: "", urls: [], error:
          (error as NodeJS.ErrnoException).code === "EADDRINUSE"
            ? "端口已被占用，请修改端口或关闭占用程序后重试。"
            : "网页服务无法启动，请检查网页构建文件和端口后重试。" };
      }
      return this.snapshot();
    });
    this.tail = operation;
    return operation;
  }

  async stop(): Promise<void> {
    this.controller.abort();
    const server = this.server;
    this.server = null;
    this.deps.library.clear();
    this.status = { ...this.status, state: "off", localUrl: "", urls: [], error: "" };
    if (!server) return;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }

  private async respond(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const result = await this.route(request);
      result.headers.forEach((value, key) => response.setHeader(key, value));
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Referrer-Policy", "no-referrer");
      response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
      response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'");
      response.statusCode = result.status;
      if (!result.body || request.method === "HEAD") { await result.body?.cancel(); response.end(); return; }
      const stream = Readable.fromWeb(result.body as import("node:stream/web").ReadableStream);
      const onClose = () => { if (!response.writableFinished) stream.destroy(); };
      response.once("close", onClose);
      try { await pipeline(stream, response); }
      finally { response.removeListener("close", onClose); }
    } catch (error) {
      if (response.destroyed) return;
      if (response.headersSent) { response.destroy(); return; }
      const status = error instanceof BrowseError ? error.status : error instanceof HistoryMetadataConflict ? 409 : 500;
      response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      response.end(JSON.stringify({ error: status === 500 ? "服务暂时不可用，请重试。" : (error as Error).message }));
    }
  }

  private async route(request: IncomingMessage): Promise<Response> {
    if (!privateAddress(request.socket.remoteAddress ?? "")) throw new BrowseError(403, "仅支持局域网访问。");
    const authority = request.headers.host ?? "";
    const allowed = new Set([`127.0.0.1:${this.status.port}`, `localhost:${this.status.port}`,
      ...(this.deps.addresses?.() ?? lanAddresses()).map((ip) => `${ip}:${this.status.port}`)]);
    if (!allowed.has(authority.toLowerCase())) throw new BrowseError(403, "访问地址无效。");
    const origin = `http://${authority.toLowerCase()}`;
    if (request.headers.origin && request.headers.origin.toLowerCase() !== origin) throw new BrowseError(403, "不允许跨站访问。");
    if (request.headers["sec-fetch-site"] === "cross-site") throw new BrowseError(403, "不允许跨站访问。");
    const url = new URL(request.url ?? "/", origin);
    if (url.search.length > 8192) throw new BrowseError(400, "查询条件过长。");
    let parts: string[];
    try { parts = url.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part)); }
    catch { throw new BrowseError(400, "访问地址无效。"); }
    const read = request.method === "GET" || request.method === "HEAD";
    const library = this.deps.library;
    if (parts[0] !== "api") {
      if (!read) throw new BrowseError(405, "请求方式无效。");
      const relative = url.pathname === "/" ? "index.html"
        : /^\/assets\/[a-zA-Z0-9_.-]+$/.test(url.pathname) ? url.pathname.slice(1) : null;
      if (!relative) throw new BrowseError(404, "页面不存在。");
      const filename = path.join(this.deps.webRoot, relative);
      const bytes = await fs.readFile(filename).catch(() => null);
      if (!bytes) throw new BrowseError(404, "页面不存在。");
      const type = filename.endsWith(".html") ? "text/html; charset=utf-8"
        : filename.endsWith(".js") ? "text/javascript; charset=utf-8"
          : filename.endsWith(".css") ? "text/css; charset=utf-8" : "application/octet-stream";
      return new Response(request.method === "HEAD" ? null : bytes, { headers: {
        "Content-Type": type, "Content-Length": String(bytes.length),
        "Cache-Control": relative === "index.html" ? "no-cache" : "private, max-age=3600"
      } });
    }
    if (parts[1] !== "v1") throw new BrowseError(404, "接口不存在。");
    if (read && parts.length === 3 && (parts[2] === "library" || parts[2] === "facets")) return json(library.info());
    if (read && parts.length === 3 && parts[2] === "videos") {
      let filter: unknown;
      try { filter = JSON.parse(url.searchParams.get("q") ?? "{}"); }
      catch { throw new BrowseError(400, "筛选参数无效。"); }
      if (!filter || typeof filter !== "object" || Array.isArray(filter)) throw new BrowseError(400, "筛选参数无效。");
      return json(library.createQuery(filter));
    }
    if (read && parts[2] === "queries" && parts.length === 5 && parts[4] === "items") {
      return json(library.page(parts[3]!, Number(url.searchParams.get("offset") ?? 0),
        Number(url.searchParams.get("limit") ?? 48), url.searchParams.get("around") ?? undefined));
    }
    if (parts[2] === "videos" && parts[3]) {
      const id = parts[3];
      if (read && parts.length === 4) return json(library.detail(id, url.searchParams.get("version") ?? undefined));
      if (read && parts.length === 7 && parts[4] === "versions" && parts[6] === "prompt") return json(library.prompt(id, parts[5]!));
      if (request.method === "PATCH" && parts.length === 5 && parts[4] === "metadata") {
        if (!request.headers.origin || request.headers["content-type"]?.split(";")[0] !== "application/json") {
          throw new BrowseError(403, "请从浏览网页保存信息。");
        }
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 16_384) throw new BrowseError(413, "标签内容过长。");
          chunks.push(Buffer.from(chunk));
        }
        let body: Record<string, unknown>;
        try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
        catch { throw new BrowseError(400, "信息格式无效。"); }
        if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !["favorite", "rating", "tags"].includes(key)) || !Object.keys(body).length) {
          throw new BrowseError(400, "仅支持收藏、评分和标签。");
        }
        if ((body.favorite !== undefined && typeof body.favorite !== "boolean") ||
          (body.rating !== undefined && body.rating !== null && (typeof body.rating !== "number" || body.rating < 0.5 || body.rating > 5 || !Number.isInteger(body.rating * 2))) ||
          (body.tags !== undefined && (!Array.isArray(body.tags) || body.tags.length > 64 || body.tags.some((tag) => typeof tag !== "string" || tag.length > 80)))) {
          throw new BrowseError(400, "收藏、评分或标签内容无效。");
        }
        return json(await library.update(id, body as HistoryMetadataPatch,
          String(request.headers["if-match"] ?? "").replace(/^"|"$/g, ""), url.searchParams.get("version") ?? undefined));
      }
      if (read && parts.length === 7 && parts[4] === "versions" && (parts[6] === "media" || parts[6] === "cover")) {
        const source = await library.source(id, parts[5]!);
        const filename = parts[6] === "media" ? source.filename
          : await this.covers.get(source.asset, source.version, source.filename, this.controller.signal, false);
        if (!filename) return new Response(null, { status: 503, headers: { "Retry-After": "1", "Cache-Control": "no-store" } });
        const stat = await fs.stat(filename).catch(() => null);
        if (!stat?.isFile() || !stat.size) throw new BrowseError(404, "媒体不可用。");
        const etag = `"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
        if (parts[6] === "cover" && request.headers["if-none-match"] === etag) return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "private, max-age=60" } });
        const result = mediaFileResponse(filename, stat.size, {
          method: request.method!, headers: { get: (name) => String(request.headers[name.toLowerCase()] ?? "") || null }
        });
        result.headers.set("Cache-Control", parts[6] === "media" ? "private, no-cache" : "private, max-age=60");
        result.headers.set("ETag", etag);
        return result;
      }
    }
    throw new BrowseError(read ? 404 : 405, "接口或请求方式无效。");
  }
}
