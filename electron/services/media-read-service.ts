import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { mediaFileResponse } from "./media-file-response.js";
import type { HistoryBatchCopyKind, HistoryBatchCopyResult } from "../../src/types.js";
import { historyBatchImageFile, historyBatchVideoFile } from "../../src/core/history-batch.js";
import type { StateRepository } from "../ports/state-repository.js";
import { resolveExistingHistoryFile } from "./windows-clipboard.js";
import { copyFilesToWindowsClipboard } from "./windows-clipboard.js";
import type { HistoryQueryService } from "./history-query-service.js";
import { createNativeTranslator } from "../ui-translator.js";
import { uiKeys } from "../../src/core/i18n-keys.js";

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

  async copyHistoryFiles(
    kind: HistoryBatchCopyKind,
    assetIds: string[],
    stagingRoot: string
  ): Promise<HistoryBatchCopyResult> {
    const state = this.deps.store.get();
    const t = createNativeTranslator(state.settings.uiLocale).t;
    if (kind !== "video" && kind !== "image") {
      throw new Error(t(uiKeys.mediaAction.invalidKind));
    }
    const uniqueIds = [...new Set(assetIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())))];
    const resolvedFiles: string[] = [];
    let missingCount = 0;
    for (const assetId of uniqueIds) {
      const asset = kind === "video"
        ? state.history.find((item) => item.id === assetId)
        : state.imageHistory.find((item) => item.id === assetId);
      const file = asset
        ? kind === "video" && asset.mediaKind === "video"
          ? historyBatchVideoFile(asset)
          : kind === "image" && asset.mediaKind === "image"
            ? historyBatchImageFile(asset)
            : undefined
        : undefined;
      if (!file) {
        missingCount += 1;
        continue;
      }
      const resolved = await this.deps.historyQuery.resolveHistoryFile(file, state.settings);
      if (!resolved) {
        missingCount += 1;
        continue;
      }
      if (!resolvedFiles.some((candidate) => candidate.toLowerCase() === resolved.toLowerCase())) {
        resolvedFiles.push(resolved);
      }
    }
    if (!resolvedFiles.length) {
      return {
        ok: false,
        message: t(uiKeys.mediaAction.batchMissing),
        requestedCount: uniqueIds.length,
        copiedCount: 0,
        missingCount
      };
    }
    await copyFilesToWindowsClipboard(resolvedFiles, stagingRoot);
    return {
      ok: true,
      message: missingCount
        ? t(uiKeys.mediaAction.batchPartial, { count: resolvedFiles.length, missing: missingCount })
        : t(uiKeys.mediaAction.batchCopied, { count: resolvedFiles.length }),
      requestedCount: uniqueIds.length,
      copiedCount: resolvedFiles.length,
      missingCount
    };
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
      return mediaFileResponse(filename, stat.size, request, {
        createReadStream: this.deps.createReadStream,
        desktopCors: true
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
