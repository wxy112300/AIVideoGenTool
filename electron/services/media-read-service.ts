import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import type { StateRepository } from "../ports/state-repository.js";
import { resolveExistingHistoryFile } from "./windows-clipboard.js";
import type { HistoryQueryService } from "./history-query-service.js";

export interface MediaProtocolHeaders {
  get(name: string): string | null;
}

export interface MediaProtocolRequest {
  url: string;
  method: string;
  headers: MediaProtocolHeaders;
}

export interface MediaFileStat {
  readonly size: number;
  isFile(): boolean;
}

export interface MediaReadServiceDependencies {
  store: StateRepository;
  historyQuery: HistoryQueryService;
  readFile?: (filename: string) => Promise<Uint8Array>;
  stat?: (filename: string) => Promise<MediaFileStat | null>;
  createReadStream?: typeof createReadStream;
  resolveExistingFile?: (filename: string) => Promise<string | null>;
}

const contentTypes = new Map([
  [".mp4", "video/mp4"],
  [".m4v", "video/mp4"],
  [".webm", "video/webm"],
  [".mov", "video/quicktime"],
  [".mkv", "video/x-matroska"],
  [".gif", "image/gif"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".bmp", "image/bmp"]
]);

export class MediaReadService {
  constructor(private readonly deps: MediaReadServiceDependencies) {}

  async readImage(filename: string): Promise<string | null> {
    if (!filename) return null;
    const extension = path.extname(filename).slice(1).toLowerCase();
    const mime = extension === "jpg" || extension === "jpeg"
      ? "image/jpeg"
      : `image/${extension}`;
    const content = await (this.deps.readFile ?? defaultReadFile)(filename);
    return `data:${mime};base64,${Buffer.from(content).toString("base64")}`;
  }

  resolveSourcePath(sourcePath: string): Promise<string | null> {
    return this.deps.historyQuery.resolveHistorySourcePath(sourcePath);
  }

  async handleProtocolRequest(request: MediaProtocolRequest): Promise<Response> {
    try {
      const url = new URL(request.url);
      let filename: string | undefined;
      let trustedCacheFile = false;
      if (url.hostname === "cover") {
        const match = url.pathname.match(/^\/([a-f0-9]{64})\.(jpg|png)$/i);
        if (!match?.[1]) return new Response("Invalid cover", { status: 400 });
        filename = this.deps.historyQuery.coverPathFromDigest(
          match[1].toLowerCase(),
          `.${match[2]!.toLowerCase()}`
        );
        trustedCacheFile = true;
      } else if (url.hostname === "draft" && url.pathname === "/video") {
        filename = this.deps.store.get().draft.sourceVideoPath;
      } else if (url.hostname === "draft" && url.pathname === "/reference-video") {
        filename = url.searchParams.get("source") ?? undefined;
      } else if (url.hostname === "history") {
        const [assetId, versionId, fileIndexText] = url.pathname.split("/").filter(Boolean);
        const fileIndex = Number(fileIndexText);
        const decodedAssetId = decodeURIComponent(assetId ?? "");
        const decodedVersionId = decodeURIComponent(versionId ?? "");
        const currentState = this.deps.store.get();
        const asset = currentState.history.find((item) => item.id === decodedAssetId);
        if (asset) {
          const version = asset.versions.find((item) => item.id === decodedVersionId);
          const historyFile = Number.isInteger(fileIndex) && fileIndex >= 0
            ? version?.files[fileIndex]
            : undefined;
          filename = historyFile?.absolutePath;
          if (historyFile) {
            filename = await this.deps.historyQuery.resolveHistoryFile(
              historyFile,
              currentState.settings
            ) ?? undefined;
            trustedCacheFile = Boolean(filename);
          }
        } else {
          const project = currentState.imageHistory.find((item) => item.id === decodedAssetId);
          const version = project?.versions.find((item) => item.id === decodedVersionId);
          const historyFile = Number.isInteger(fileIndex) && fileIndex === 0
            ? version?.file
            : undefined;
          filename = historyFile?.absolutePath;
          if (historyFile) {
            filename = await this.deps.historyQuery.resolveHistoryFile(
              historyFile,
              currentState.settings
            ) ?? undefined;
            trustedCacheFile = Boolean(filename);
          }
        }
      } else if (url.hostname === "queue") {
        const taskId = decodeURIComponent(url.pathname.split("/").filter(Boolean)[0] ?? "");
        const task = this.deps.store.get().queue.find((item) => item.id === taskId);
        const referenceIndexText = url.searchParams.get("reference");
        if (referenceIndexText !== null) {
          const referenceIndex = Number(referenceIndexText);
          const referenceSlots = task?.taskType === "generation" || task?.taskType === "extension"
            ? task.h3ReferenceSlots
            : undefined;
          filename = Number.isInteger(referenceIndex) && referenceIndex >= 0
            ? referenceSlots?.[referenceIndex]?.mediaPath
            : undefined;
        } else {
          filename = task?.taskType === "extension"
            ? task.sourceVideoPath
            : task?.taskType === "upscale"
              ? task.sourceFilePath
              : undefined;
        }
      } else {
        return new Response("Not found", { status: 404 });
      }
      const resolvedFilename = filename
        ? trustedCacheFile
          ? filename
          : await (this.deps.resolveExistingFile ?? resolveExistingHistoryFile)(filename)
        : null;
      const stat = resolvedFilename
        ? await (this.deps.stat ?? defaultStat)(resolvedFilename)
        : null;
      if (!resolvedFilename || !stat?.isFile()) {
        return new Response("Media file not found", { status: 404 });
      }
      filename = resolvedFilename;
      const contentType = contentTypes.get(path.extname(filename).toLowerCase())
        ?? "application/octet-stream";
      const range = request.headers.get("range");
      const match = range?.match(/^bytes=(\d*)-(\d*)$/);
      if (range && (!match || (!match[1] && !match[2]))) {
        return new Response("Invalid range", {
          status: 416,
          headers: { "Content-Range": `bytes */${stat.size}` }
        });
      }
      let start = 0;
      let end = stat.size - 1;
      if (match?.[1]) {
        start = Number(match[1]);
        end = match[2] ? Number(match[2]) : stat.size - 1;
      } else if (match?.[2]) {
        const suffixLength = Number(match[2]);
        start = Math.max(0, stat.size - suffixLength);
      }
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        end < start ||
        start >= stat.size
      ) {
        return new Response("Range not satisfiable", {
          status: 416,
          headers: { "Content-Range": `bytes */${stat.size}` }
        });
      }
      end = Math.min(end, stat.size - 1);
      const partial = Boolean(match);
      const headers = new Headers({
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Headers": "Range",
        "Access-Control-Allow-Origin": "*",
        "Content-Type": contentType,
        "Content-Length": String(end - start + 1)
      });
      if (partial) headers.set("Content-Range", `bytes ${start}-${end}/${stat.size}`);
      if (request.method === "HEAD") {
        return new Response(null, { status: partial ? 206 : 200, headers });
      }
      const stream = Readable.toWeb(
        (this.deps.createReadStream ?? createReadStream)(filename, { start, end })
      );
      return new Response(stream as BodyInit, {
        status: partial ? 206 : 200,
        headers
      });
    } catch {
      return new Response("Unable to open media", { status: 500 });
    }
  }
}

async function defaultReadFile(filename: string): Promise<Uint8Array> {
  return fs.readFile(filename);
}

async function defaultStat(filename: string): Promise<MediaFileStat | null> {
  return fs.stat(filename).catch(() => null);
}
