import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import type {
  ImageCropData,
  ImageCropSaveRequest,
  ImageMaskData,
  ImageMaskSaveRequest,
  ImageMarkupData,
  ImageMarkupSaveRequest
} from "../../src/types.js";
import type { HistoryFileSystemPort } from "../ports/history-file-system.js";
import { isPathWithinDirectory } from "../../src/infrastructure/video-history-migration.js";
import type { StudioPaths } from "./studio-paths.js";

export interface ImageDocumentServiceDependencies {
  paths: Pick<StudioPaths, "imageGuidesDirectory" | "imageMasksDirectory" | "imageCropsDirectory">;
  fileSystem: HistoryFileSystemPort;
  randomId?: () => string;
  now?: () => string;
}

export class ImageDocumentService {
  constructor(private readonly deps: ImageDocumentServiceDependencies) {}

  async readMarkup(documentPath: string): Promise<string | null> {
    const roots = [this.deps.paths.imageGuidesDirectory, this.deps.paths.imageMasksDirectory];
    const filename = typeof documentPath === "string" ? path.resolve(documentPath) : "";
    if (!filename || !roots.some((root) => isPathWithinDirectory(root, filename))) return null;
    return this.deps.fileSystem.readText(filename).catch(() => null);
  }

  async saveMarkup(request: ImageMarkupSaveRequest): Promise<ImageMarkupData> {
    if (!request || typeof request !== "object") throw new Error("标记数据无效");
    const sourceStat = await this.safeStat(request.sourcePath);
    if (!sourceStat?.isFile()) throw new Error("原始 Picture 文件不存在");
    if (typeof request.document !== "string" || !request.document.trim()) {
      throw new Error("标记工程为空");
    }
    const bytes = arrayBufferBytes(request.renderedPng);
    if (!bytes?.byteLength) throw new Error("标注图片为空");
    if (bytes.byteLength > 100 * 1024 * 1024) throw new Error("标注图片不能超过 100 MB");
    const pictureKey = pictureKeyFor(request.pictureId, request.sourcePath);
    const revision = nextRevision(request.previousRevision);
    const directory = path.join(this.deps.paths.imageGuidesDirectory, pictureKey);
    await this.deps.fileSystem.makeDirectory(directory);
    const basename = revisionBasename(revision);
    const documentPath = path.join(directory, `${basename}.fabric.json`);
    const renderedPath = path.join(directory, `${basename}-guide.png`);
    const documentTemporary = `${documentPath}.${this.newId()}.tmp`;
    const renderedTemporary = `${renderedPath}.${this.newId()}.tmp`;
    try {
      await this.deps.fileSystem.writeFile(documentTemporary, request.document);
      await this.deps.fileSystem.writeFile(renderedTemporary, bytes);
      await this.deps.fileSystem.rename(documentTemporary, documentPath);
      await this.deps.fileSystem.rename(renderedTemporary, renderedPath);
    } finally {
      await this.deps.fileSystem.remove(documentTemporary).catch(() => undefined);
      await this.deps.fileSystem.remove(renderedTemporary).catch(() => undefined);
    }
    return {
      documentPath,
      renderedPath,
      summary: typeof request.summary === "string" ? request.summary.trim() : "",
      revision,
      objectCount: Math.max(0, Math.trunc(request.objectCount || 0)),
      updatedAt: this.now()
    };
  }

  async saveMask(request: ImageMaskSaveRequest): Promise<ImageMaskData> {
    if (!request || typeof request !== "object") throw new Error("Mask 数据无效");
    const sourceStat = await this.safeStat(request.sourcePath);
    if (!sourceStat?.isFile()) throw new Error("原始 Picture 文件不存在");
    if (typeof request.document !== "string" || !request.document.trim()) {
      throw new Error("Mask 工程为空");
    }
    const bytes = arrayBufferBytes(request.maskPng);
    if (!bytes?.byteLength) throw new Error("Mask 图片为空");
    if (bytes.byteLength > 100 * 1024 * 1024) throw new Error("Mask 图片不能超过 100 MB");
    const pictureKey = pictureKeyFor(request.pictureId, request.sourcePath);
    const revision = nextRevision(request.previousRevision);
    const directory = path.join(this.deps.paths.imageMasksDirectory, pictureKey);
    await this.deps.fileSystem.makeDirectory(directory);
    const basename = revisionBasename(revision);
    const documentPath = path.join(directory, `${basename}.fabric.json`);
    const maskPath = path.join(directory, `${basename}-mask.png`);
    const documentTemporary = `${documentPath}.${this.newId()}.tmp`;
    const maskTemporary = `${maskPath}.${this.newId()}.tmp`;
    try {
      await this.deps.fileSystem.writeFile(documentTemporary, request.document);
      await this.deps.fileSystem.writeFile(maskTemporary, bytes);
      await this.deps.fileSystem.rename(documentTemporary, documentPath);
      await this.deps.fileSystem.rename(maskTemporary, maskPath);
    } finally {
      await this.deps.fileSystem.remove(documentTemporary).catch(() => undefined);
      await this.deps.fileSystem.remove(maskTemporary).catch(() => undefined);
    }
    return {
      documentPath,
      maskPath,
      revision,
      regionCount: Math.max(0, Math.trunc(request.regionCount || 0)),
      updatedAt: this.now()
    };
  }

  async saveCrop(request: ImageCropSaveRequest): Promise<ImageCropData | null> {
    if (!request || typeof request !== "object") throw new Error("裁剪数据无效");
    const sourceStat = await this.safeStat(request.sourcePath);
    if (!sourceStat?.isFile()) throw new Error("原始 Picture 文件不存在");
    if (request.crop === null) return null;
    const crop = request.crop;
    const values = [crop.x, crop.y, crop.width, crop.height, crop.sourceWidth, crop.sourceHeight];
    if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) {
      throw new Error("裁剪区域无效");
    }
    const sourceWidth = Math.max(1, Math.trunc(crop.sourceWidth));
    const sourceHeight = Math.max(1, Math.trunc(crop.sourceHeight));
    const x = Math.max(0, Math.trunc(crop.x));
    const y = Math.max(0, Math.trunc(crop.y));
    const width = Math.max(1, Math.trunc(crop.width));
    const height = Math.max(1, Math.trunc(crop.height));
    if (x + width > sourceWidth || y + height > sourceHeight) {
      throw new Error("裁剪区域超出原图范围");
    }
    const bytes = arrayBufferBytes(request.croppedPng);
    if (!bytes?.byteLength) throw new Error("裁剪结果为空");
    if (bytes.byteLength > 100 * 1024 * 1024) throw new Error("裁剪结果不能超过 100 MB");
    const pictureKey = pictureKeyFor(request.pictureId, request.sourcePath);
    const revision = nextRevision(request.previousRevision);
    const directory = path.join(this.deps.paths.imageCropsDirectory, pictureKey);
    await this.deps.fileSystem.makeDirectory(directory);
    const basename = revisionBasename(revision);
    const documentPath = path.join(directory, `${basename}.crop.json`);
    const croppedPath = path.join(directory, `${basename}-crop.png`);
    const documentTemporary = `${documentPath}.${this.newId()}.tmp`;
    const croppedTemporary = `${croppedPath}.${this.newId()}.tmp`;
    const document = JSON.stringify({
      version: 1,
      sourceWidth,
      sourceHeight,
      x,
      y,
      width,
      height
    }, null, 2);
    try {
      await this.deps.fileSystem.writeFile(documentTemporary, document);
      await this.deps.fileSystem.writeFile(croppedTemporary, bytes);
      await this.deps.fileSystem.rename(documentTemporary, documentPath);
      await this.deps.fileSystem.rename(croppedTemporary, croppedPath);
    } finally {
      await this.deps.fileSystem.remove(documentTemporary).catch(() => undefined);
      await this.deps.fileSystem.remove(croppedTemporary).catch(() => undefined);
    }
    return {
      documentPath,
      croppedPath,
      x,
      y,
      width,
      height,
      sourceWidth,
      sourceHeight,
      revision,
      updatedAt: this.now()
    };
  }

  private newId(): string {
    return this.deps.randomId?.() ?? randomUUID();
  }

  private now(): string {
    return this.deps.now?.() ?? new Date().toISOString();
  }

  private safeStat(filename: string) {
    return this.deps.fileSystem.stat(filename).catch(() => null);
  }
}

function arrayBufferBytes(value: ArrayBuffer | undefined): Uint8Array | null {
  return value instanceof ArrayBuffer ? new Uint8Array(value) : null;
}

function pictureKeyFor(pictureId: string, sourcePath: string): string {
  return createHash("sha256")
    .update(`${pictureId}\0${path.resolve(sourcePath)}`)
    .digest("hex")
    .slice(0, 24);
}

function nextRevision(previousRevision: number | undefined): number {
  return Math.max(1, Math.trunc(previousRevision ?? 0) + 1);
}

function revisionBasename(revision: number): string {
  return `revision-${String(revision).padStart(4, "0")}`;
}
