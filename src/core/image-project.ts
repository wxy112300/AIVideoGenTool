import type {
  ImageAssetVersion,
  ImageGenerationQueueTask,
  ImageEditDraft,
  ImageHistoryProject,
  ImageOutputFormat,
  ImageReference,
  ImageReferenceRole,
  ImageMarkupData,
  ImageCropData
} from "../types.js";
import type { H3ImageOptions, H3ImageRecipeSnapshot } from "../types.js";
import { createDefaultImageEditDraft } from "./draft-defaults.js";
import { imageOutputCountMax, normalizeImageAspectRatio, normalizeImageTargetResolution } from "./image-workflow.js";
import { isHistoryRating, normalizeHistoryTags } from "./history-filter.js";

const imageOutputFormats: ImageOutputFormat[] = ["png", "jpeg", "webp"];
const imageReferenceRoles: ImageReferenceRole[] = [
  "base",
  "person",
  "object",
  "pose",
  "style",
  "background",
  "auto"
];

const h3ImageModelIds = new Set([
  "minimax-h3-image-i2i",
  "minimax-h3-reference-edit"
]);
const h3ImageSourceFits = new Set<H3ImageOptions["sourceFit"]>([
  "crop-center",
  "contain-pad",
  "stretch"
]);
const h3ImageReferenceDetails = new Set<H3ImageOptions["referenceDetail"]>([
  "match-generation-area",
  "max-identity-2048"
]);
const h3ImageRecipeAdapters = new Set<H3ImageRecipeSnapshot["adapter"]>([
  "base",
  "fl2va-turbo-8",
  "ref2va-turbo-8-768p"
]);

export function isH3ImageModelId(modelId: string): boolean {
  return h3ImageModelIds.has(modelId);
}

export function defaultH3ImageOptionsFor(modelId: string): H3ImageOptions | undefined {
  if (!isH3ImageModelId(modelId)) return undefined;
  return {
    frameProfile: "recommended-5",
    frameSelection: "decode-recommended",
    sourceFit: "crop-center",
    referenceDetail: "match-generation-area",
    sourceFidelity: modelId === "minimax-h3-reference-edit" ? 0.6 : 0.75
  };
}

export function normalizeH3ImageOptions(
  value: unknown,
  modelId: string
): H3ImageOptions | undefined {
  const defaults = defaultH3ImageOptionsFor(modelId);
  if (!defaults) return undefined;
  const source = value && typeof value === "object"
    ? value as Partial<H3ImageOptions>
    : {};
  const fidelity = typeof source.sourceFidelity === "number" && Number.isFinite(source.sourceFidelity)
    ? Math.min(1, Math.max(0, source.sourceFidelity))
    : defaults.sourceFidelity;
  return {
    frameProfile: source.frameProfile === "recommended-5" ? source.frameProfile : defaults.frameProfile,
    frameSelection: source.frameSelection === "decode-recommended" ? source.frameSelection : defaults.frameSelection,
    sourceFit: h3ImageSourceFits.has(source.sourceFit as H3ImageOptions["sourceFit"])
      ? source.sourceFit as H3ImageOptions["sourceFit"]
      : defaults.sourceFit,
    referenceDetail: h3ImageReferenceDetails.has(source.referenceDetail as H3ImageOptions["referenceDetail"])
      ? source.referenceDetail as H3ImageOptions["referenceDetail"]
      : defaults.referenceDetail,
    sourceFidelity: fidelity
  };
}

export function normalizeH3ImageRecipe(
  value: unknown,
  modelId: string
): H3ImageRecipeSnapshot | undefined {
  if (!isH3ImageModelId(modelId) || !value || typeof value !== "object") return undefined;
  const source = value as Partial<H3ImageRecipeSnapshot>;
  const adapter = source.adapter as H3ImageRecipeSnapshot["adapter"];
  if (!h3ImageRecipeAdapters.has(adapter)) return undefined;
  const allowedAdapters = modelId === "minimax-h3-image-i2i"
    ? new Set<H3ImageRecipeSnapshot["adapter"]>(["base", "fl2va-turbo-8"])
    : new Set<H3ImageRecipeSnapshot["adapter"]>(["base", "ref2va-turbo-8-768p"]);
  if (!allowedAdapters.has(adapter)) return undefined;
  const sampler = source.sampler === "res_multistep" || source.sampler === "euler"
    ? source.sampler
    : undefined;
  if (!sampler || source.scheduler !== "simple" || source.frameProfile !== "recommended-5" ||
      source.frameSelection !== "decode-recommended" ||
      (source.resolutionProfile !== undefined && source.resolutionProfile !== "native-detail-0.98mp")) return undefined;
  const expected = adapter === "base"
    ? { samplingProfile: "base quality | RES 20 steps", sampler: "res_multistep" as const, steps: 20 }
    : adapter === "fl2va-turbo-8"
      ? { samplingProfile: "Turbo v1.0 | 8 steps", sampler: "euler" as const, steps: 8 }
      : { samplingProfile: "REF2VA Turbo v1.0 768p | 8 steps", sampler: "euler" as const, steps: 8 };
  if (source.samplingProfile !== expected.samplingProfile || sampler !== expected.sampler || source.steps !== expected.steps) {
    return undefined;
  }
  const loraFilename = typeof source.loraFilename === "string"
    ? source.loraFilename.trim()
    : "";
  if (adapter === "base" ? source.loraFilename !== undefined : !loraFilename) {
    return undefined;
  }
  const numberFields = [source.steps, source.shiftVideo, source.shiftAudio];
  if (!numberFields.every((field) => typeof field === "number" && Number.isFinite(field) && field > 0)) {
    return undefined;
  }
  if (source.shiftVideo !== 12 || source.shiftAudio !== 3) return undefined;
  return {
    adapter,
    samplingProfile: expected.samplingProfile,
    sampler,
    scheduler: "simple",
    steps: Math.trunc(source.steps!),
    shiftVideo: source.shiftVideo!,
    shiftAudio: source.shiftAudio!,
    frameProfile: "recommended-5",
    frameSelection: "decode-recommended",
    resolutionProfile: "native-detail-0.98mp",
    ...(typeof source.diffusionModelFilename === "string" && source.diffusionModelFilename.trim()
      ? { diffusionModelFilename: source.diffusionModelFilename.trim() }
      : {}),
    ...(loraFilename
      ? { loraFilename }
      : {})
  };
}

function cleanImagePromptText(value: unknown): string {
  if (typeof value !== "string") return "";
  return /(?:prompt-tool-row|image-edit-instruction|image-edit-prompt-input|image-edit-output-group)/u.test(value)
    ? ""
    : value;
}

function isCorruptedImagePrompt(value: unknown): boolean {
  return typeof value === "string" &&
    /(?:prompt-tool-row|image-edit-instruction|image-edit-prompt-input|image-edit-output-group)/u.test(value);
}

function normalizedInteger(value: unknown, fallback: number, minimum: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.trunc(value))
    : fallback;
}

function normalizedTimestamp(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) {
    return fallback;
  }
  return value;
}

function imageBasename(filename: string): string {
  const separator = Math.max(filename.lastIndexOf("/"), filename.lastIndexOf("\\"));
  return filename.slice(separator + 1);
}

function imageExtension(filename: string): string {
  const basename = imageBasename(filename);
  const dot = basename.lastIndexOf(".");
  return dot > 0 ? basename.slice(dot).toLowerCase() : "";
}

function imageFormatFromFilename(filename: string): ImageOutputFormat {
  const extension = imageExtension(filename);
  if (extension === ".jpg" || extension === ".jpeg") return "jpeg";
  if (extension === ".webp") return "webp";
  return "png";
}

function normalizeImageFile(value: unknown): ImageAssetVersion["file"] | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<ImageAssetVersion["file"]>;
  if (typeof source.filename !== "string" || !source.filename.trim()) return null;
  return {
    filename: source.filename,
    subfolder: typeof source.subfolder === "string" ? source.subfolder : "",
    type: typeof source.type === "string" && source.type.trim() ? source.type : "output",
    ...(typeof source.format === "string" && source.format.trim()
      ? { format: source.format }
      : {}),
    ...(typeof source.absolutePath === "string" && source.absolutePath.trim()
      ? { absolutePath: source.absolutePath }
      : {})
  };
}

function normalizeImageCrop(value: unknown): ImageCropData | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Partial<ImageCropData>;
  const numbers = [source.x, source.y, source.width, source.height, source.sourceWidth, source.sourceHeight];
  if (!numbers.every((item) => typeof item === "number" && Number.isFinite(item))) return undefined;
  const sourceWidth = Math.max(1, Math.trunc(source.sourceWidth!));
  const sourceHeight = Math.max(1, Math.trunc(source.sourceHeight!));
  const x = Math.max(0, Math.min(sourceWidth - 1, Math.trunc(source.x!)));
  const y = Math.max(0, Math.min(sourceHeight - 1, Math.trunc(source.y!)));
  const width = Math.max(1, Math.min(sourceWidth - x, Math.trunc(source.width!)));
  const height = Math.max(1, Math.min(sourceHeight - y, Math.trunc(source.height!)));
  if (typeof source.documentPath !== "string" || !source.documentPath.trim() ||
      typeof source.croppedPath !== "string" || !source.croppedPath.trim()) return undefined;
  return {
    x,
    y,
    width,
    height,
    sourceWidth,
    sourceHeight,
    documentPath: source.documentPath.trim(),
    croppedPath: source.croppedPath.trim(),
    revision: normalizedInteger(source.revision, 1, 1),
    updatedAt: normalizedTimestamp(source.updatedAt, new Date(0).toISOString())
  };
}

function normalizeImageAssetVersion(
  value: unknown,
  fallbackCreatedAt: string
): ImageAssetVersion | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<ImageAssetVersion>;
  const file = normalizeImageFile(source.file);
  if (!file) return null;
  const kind = source.kind === "source" || source.kind === "edit" || source.kind === "upscale"
    ? source.kind
    : "edit";
  const generatedVersion = Boolean(source.taskId || source.runId || source.comfyPromptId || source.workflowPath);
  const modelId = typeof source.modelId === "string" ? source.modelId : "";
  return {
    id: typeof source.id === "string" && source.id.trim() ? source.id : crypto.randomUUID(),
    versionNumber: normalizedInteger(source.versionNumber, 0, 0),
    kind: kind === "source" && generatedVersion ? "edit" : kind,
    ...(typeof source.parentVersionId === "string" && source.parentVersionId.trim()
      ? { parentVersionId: source.parentVersionId }
      : {}),
    ...(typeof source.taskId === "string" && source.taskId.trim()
      ? { taskId: source.taskId }
      : {}),
    ...(typeof source.runId === "string" && source.runId.trim()
      ? { runId: source.runId }
      : {}),
    createdAt: normalizedTimestamp(source.createdAt, fallbackCreatedAt),
    ...(typeof source.startedAt === "string" && Number.isFinite(Date.parse(source.startedAt))
      ? { startedAt: source.startedAt }
      : {}),
    modelId,
    workflowPath: typeof source.workflowPath === "string" ? source.workflowPath : "",
    prompt: typeof source.prompt === "string" ? source.prompt : "",
    promptVersion: normalizedInteger(source.promptVersion, 0, 0),
    references: normalizeImageReferences(source.references),
    ...(typeof source.qualityProfile === "string" && source.qualityProfile.trim()
      ? { qualityProfile: source.qualityProfile.trim() }
      : {}),
    ...(typeof source.steps === "number" && Number.isFinite(source.steps)
      ? { steps: normalizedInteger(source.steps, 1, 1) }
      : {}),
    ...(typeof source.cfg === "number" && Number.isFinite(source.cfg)
      ? { cfg: source.cfg }
      : {}),
    ...(source.aspectRatio === "source" || typeof source.aspectRatio === "string"
      ? { aspectRatio: normalizeImageAspectRatio(source.aspectRatio) }
      : {}),
    ...(source.targetResolution === "source" ||
      (typeof source.targetResolution === "number" && Number.isFinite(source.targetResolution))
      ? { targetResolution: source.targetResolution }
      : {}),
    ...(typeof source.outputCount === "number" && Number.isFinite(source.outputCount)
      ? { outputCount: normalizedInteger(source.outputCount, 1, 1) }
      : {}),
    ...(typeof source.diffusionModelFilename === "string" && source.diffusionModelFilename.trim()
      ? { diffusionModelFilename: source.diffusionModelFilename.trim() }
      : {}),
    ...(typeof source.seed === "number" && Number.isFinite(source.seed)
      ? { seed: Math.trunc(source.seed) }
      : {}),
    width: normalizedInteger(source.width, 0, 0),
    height: normalizedInteger(source.height, 0, 0),
    format: imageOutputFormats.includes(source.format as ImageOutputFormat)
      ? source.format as ImageOutputFormat
      : imageFormatFromFilename(file.filename),
    ...(typeof source.contentHash === "string" && /^[a-f0-9]{64}$/iu.test(source.contentHash.trim())
      ? { contentHash: source.contentHash.trim().toLowerCase() }
      : {}),
    file,
    ...(typeof source.comfyPromptId === "string" && source.comfyPromptId.trim()
      ? { comfyPromptId: source.comfyPromptId }
      : {}),
    ...(source.comfyOutputs !== undefined ? { comfyOutputs: source.comfyOutputs } : {}),
    ...(source.performanceStats !== undefined ? { performanceStats: source.performanceStats } : {}),
    ...(normalizeH3ImageOptions(source.h3ImageOptions, modelId)
      ? { h3ImageOptions: normalizeH3ImageOptions(source.h3ImageOptions, modelId) }
      : {}),
    ...(normalizeH3ImageRecipe(source.h3ImageRecipe, modelId)
      ? { h3ImageRecipe: normalizeH3ImageRecipe(source.h3ImageRecipe, modelId) }
      : {})
  };
}

function normalizeImageHistoryProject(value: unknown): ImageHistoryProject | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<ImageHistoryProject>;
  const id = typeof source.id === "string" && source.id.trim()
    ? source.id
    : crypto.randomUUID();
  const fallbackCreatedAt = normalizedTimestamp(source.createdAt, new Date(0).toISOString());
  const versions = (Array.isArray(source.versions) ? source.versions : [])
    .map((version) => normalizeImageAssetVersion(version, fallbackCreatedAt))
    .filter((version): version is ImageAssetVersion => version !== null);
  if (!versions.length) return null;

  const versionNumbers = versions.map((version) => version.versionNumber);
  const validVersionNumbers = versionNumbers.every((number) => number > 0) &&
    new Set(versionNumbers).size === versionNumbers.length;
  const orderedVersions = validVersionNumbers
    ? [...versions].sort((left, right) => right.versionNumber - left.versionNumber)
    : [...versions]
        .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
        .map((version, index) => ({ ...version, versionNumber: index + 1 }))
        .reverse();
  const largestVersionNumber = orderedVersions.reduce(
    (largest, version) => Math.max(largest, version.versionNumber),
    0
  );
  const coverMode = source.coverMode === "pinned" ? "pinned" : "auto";
  const updatedAt = normalizedTimestamp(source.updatedAt, orderedVersions[0]!.createdAt);
  return {
    mediaKind: "image",
    id,
    title: typeof source.title === "string" && source.title.trim()
      ? source.title
      : "未命名图片",
    createdAt: fallbackCreatedAt,
    updatedAt,
    favorite: source.favorite === true,
    rating: isHistoryRating(source.rating)
      ? source.rating
      : null,
    tags: normalizeHistoryTags(source.tags),
    coverMode,
    ...(typeof source.coverVersionId === "string" && source.coverVersionId.trim()
      ? { coverVersionId: source.coverVersionId }
      : {}),
    nextVersionNumber: Math.max(
      largestVersionNumber + 1,
      normalizedInteger(source.nextVersionNumber, largestVersionNumber + 1, 1)
    ),
    versions: orderedVersions
  };
}

function normalizeImageReference(value: unknown, index: number): ImageReference | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<ImageReference>;
  if (typeof source.absolutePath !== "string") return null;
  const absolutePath = source.absolutePath.trim();
  const role = imageReferenceRoles.includes(source.role as ImageReferenceRole)
    ? source.role
    : undefined;
  const markupSource = source.markup && typeof source.markup === "object"
    ? source.markup as Partial<ImageMarkupData>
    : null;
  const markup = markupSource &&
    typeof markupSource.documentPath === "string" && markupSource.documentPath.trim() &&
    typeof markupSource.renderedPath === "string" && markupSource.renderedPath.trim()
    ? {
        documentPath: markupSource.documentPath.trim(),
        renderedPath: markupSource.renderedPath.trim(),
        summary: typeof markupSource.summary === "string" ? markupSource.summary.trim() : "",
        revision: normalizedInteger(markupSource.revision, 1, 1),
        objectCount: normalizedInteger(markupSource.objectCount, 0, 0),
        updatedAt: typeof markupSource.updatedAt === "string" && markupSource.updatedAt.trim()
          ? markupSource.updatedAt
          : new Date(0).toISOString()
      }
    : undefined;
  const maskSource = source.mask && typeof source.mask === "object"
    ? source.mask
    : null;
  const mask = maskSource &&
    typeof maskSource.documentPath === "string" && maskSource.documentPath.trim() &&
    typeof maskSource.maskPath === "string" && maskSource.maskPath.trim()
    ? {
        documentPath: maskSource.documentPath.trim(),
        maskPath: maskSource.maskPath.trim(),
        revision: normalizedInteger(maskSource.revision, 1, 1),
        regionCount: normalizedInteger(maskSource.regionCount, 0, 0),
        updatedAt: typeof maskSource.updatedAt === "string" && maskSource.updatedAt.trim()
          ? maskSource.updatedAt
          : new Date(0).toISOString()
      }
      : undefined;
  const crop = normalizeImageCrop(source.crop);
  return {
    id: typeof source.id === "string" && source.id.trim() ? source.id : crypto.randomUUID(),
    pictureNumber: normalizedInteger(source.pictureNumber, index + 1, 1),
    absolutePath,
    width: normalizedInteger(source.width, 0, 0),
    height: normalizedInteger(source.height, 0, 0),
    ...(role ? { role } : {}),
    ...(crop ? { crop } : {}),
    ...(markup ? { markup } : {}),
    ...(mask ? { mask } : {}),
    ...(typeof source.contentHash === "string" && /^[a-f0-9]{64}$/iu.test(source.contentHash.trim())
      ? { contentHash: source.contentHash.trim().toLowerCase() }
      : {}),
    ...(typeof source.managedRelativePath === "string" && source.managedRelativePath.trim()
      ? { managedRelativePath: source.managedRelativePath.trim() }
      : {}),
    ...(typeof source.originalPath === "string" && source.originalPath.trim()
      ? { originalPath: source.originalPath.trim() }
      : {}),
    ...(typeof source.note === "string" && source.note.trim()
      ? { note: source.note.trim() }
      : {})
  };
}

export function normalizeImageReferences(values: unknown): ImageReference[] {
  if (!Array.isArray(values)) return [];
  const normalized = values
    .map((value, index) => normalizeImageReference(value, index))
    .filter((value): value is ImageReference => value !== null);
  const canPreserveNumbers = normalized[0]?.pictureNumber === 1 &&
    new Set(normalized.map((picture) => picture.pictureNumber)).size === normalized.length;
  const usedNumbers = new Set<number>();
  let nextNumber = 1;
  return normalized.map((picture, index) => {
    const requestedNumber = canPreserveNumbers ? picture.pictureNumber : index + 1;
    let pictureNumber = requestedNumber;
    if (usedNumbers.has(pictureNumber)) {
      while (usedNumbers.has(nextNumber)) nextNumber += 1;
      pictureNumber = nextNumber;
    }
    usedNumbers.add(pictureNumber);
    nextNumber = Math.max(nextNumber, pictureNumber + 1);
    return {
      ...picture,
      pictureNumber,
      role: index === 0
        ? "base" as const
        : picture.role === "base"
          ? "auto" as const
          : picture.role ?? "auto"
    };
  });
}

export function normalizeImageHistory(value: unknown): ImageHistoryProject[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((project) => normalizeImageHistoryProject(project))
    .filter((project): project is ImageHistoryProject => project !== null);
}

export function normalizeImageEditDraft(value: unknown): ImageEditDraft {
  const defaults = createDefaultImageEditDraft();
  if (!value || typeof value !== "object") return defaults;
  const source = value as Partial<ImageEditDraft>;
  const { h3ImageOptions: _storedH3ImageOptions, ...sourceWithoutH3ImageOptions } = source;
  const pictures = normalizeImageReferences(source.pictures);
  const storedPromptVersions = Array.isArray(source.promptVersions) && source.promptVersions.length
    ? source.promptVersions
        .filter((version) =>
          version && typeof version.id === "string" && typeof version.text === "string"
        )
        .filter((version) => !isCorruptedImagePrompt(version.text))
        .map((version) => ({
          ...version,
          text: cleanImagePromptText(version.text)
        }))
    : [];
  const promptVersions = storedPromptVersions.length ? storedPromptVersions : defaults.promptVersions;
  const outputFormat: ImageOutputFormat = "png";
  const outputCount = Math.min(
    imageOutputCountMax,
    Math.max(
      1,
      Math.trunc(
        typeof source.outputCount === "number" && Number.isFinite(source.outputCount)
          ? source.outputCount
          : defaults.outputCount
      )
    )
  );
  const activePromptVersion = Math.min(
    promptVersions.length - 1,
    Math.max(0, Math.trunc(source.activePromptVersion ?? defaults.activePromptVersion))
  );
  const seed = typeof source.seed === "number" && Number.isFinite(source.seed)
    ? Math.trunc(source.seed)
    : null;
  const modelId = typeof source.modelId === "string" && source.modelId.trim()
    ? source.modelId
    : defaults.modelId;
  const largestPictureNumber = pictures.reduce(
    (largest, picture) => Math.max(largest, picture.pictureNumber),
    0
  );
  const nextPictureNumber = Math.max(
    largestPictureNumber + 1,
    normalizedInteger(source.nextPictureNumber, largestPictureNumber + 1, 1)
  );
  return {
    ...defaults,
    ...sourceWithoutH3ImageOptions,
    mode: "image-edit",
    projectId: typeof source.projectId === "string" && source.projectId.trim()
      ? source.projectId
      : undefined,
    parentVersionId: typeof source.parentVersionId === "string" && source.parentVersionId.trim()
      ? source.parentVersionId
      : undefined,
    pictures,
    nextPictureNumber,
    promptVersions,
    activePromptVersion,
    modelId,
    qualityProfile: typeof source.qualityProfile === "string" && source.qualityProfile.trim()
      ? source.qualityProfile
      : defaults.qualityProfile,
    aspectRatio: normalizeImageAspectRatio(source.aspectRatio ?? defaults.aspectRatio),
    targetResolution: normalizeImageTargetResolution(
      source.targetResolution ?? defaults.targetResolution,
      pictures[0]?.width ?? 0,
      pictures[0]?.height ?? 0
    ),
    outputCount,
    outputFormat,
    seed,
    ...(normalizeH3ImageOptions(source.h3ImageOptions, modelId)
      ? { h3ImageOptions: normalizeH3ImageOptions(source.h3ImageOptions, modelId) }
      : {})
  };
}

export function nextImagePictureNumber(
  draft: Pick<ImageEditDraft, "nextPictureNumber" | "pictures">
): number {
  // Picture numbers are user-facing slot labels. Keep numbers already assigned
  // to existing references stable, but reuse the first gap left by a removed
  // slot instead of making the visible labels grow forever.
  const usedNumbers = new Set(
    draft.pictures
      .map((picture) => picture.pictureNumber)
      .filter((number) => Number.isInteger(number) && number > 0)
  );
  let candidate = 1;
  while (usedNumbers.has(candidate)) candidate += 1;
  return candidate;
}

export function imageEditDraftFromQueueTask(
  task: ImageGenerationQueueTask,
  currentDraft: ImageEditDraft
): ImageEditDraft {
  const seeds = task.runs.map((run) => run.seed);
  const sameSeed = seeds.length > 0 && seeds.every((seed) => seed === seeds[0]);
  return normalizeImageEditDraft({
    ...currentDraft,
    projectId: task.projectId,
    parentVersionId: task.parentVersionId,
    pictures: task.pictures.map((picture) => ({
      ...picture,
      ...(picture.crop ? { crop: { ...picture.crop } } : {}),
      ...(picture.markup ? { markup: { ...picture.markup } } : {}),
      ...(picture.mask ? { mask: { ...picture.mask } } : {}),
      ...(picture.note ? { note: picture.note } : {})
    })),
    promptVersions: [{
      id: crypto.randomUUID(),
      label: "从队列调整",
      text: task.prompt,
      createdAt: new Date().toISOString()
    }],
    activePromptVersion: 0,
    modelId: task.modelId,
    qualityProfile: task.qualityProfile,
    aspectRatio: task.aspectRatio ?? "source",
    targetResolution: task.targetResolution ?? "source",
    outputCount: task.outputCount,
    outputFormat: "png",
    seed: sameSeed ? seeds[0] : null,
    ...(task.h3ImageOptions ? { h3ImageOptions: { ...task.h3ImageOptions } } : {})
  });
}

export function createImageSourceVersion(
  reference: ImageReference,
  createdAt: string
): ImageAssetVersion {
  const filename = imageBasename(reference.absolutePath);
  return {
    id: crypto.randomUUID(),
    versionNumber: 1,
    kind: "source",
    createdAt,
    modelId: "source",
    workflowPath: "",
    prompt: "",
    promptVersion: 0,
    references: [{ ...reference }],
    width: reference.crop?.sourceWidth ?? reference.width,
    height: reference.crop?.sourceHeight ?? reference.height,
    format: imageFormatFromFilename(filename),
    ...(reference.contentHash ? { contentHash: reference.contentHash } : {}),
    file: {
      filename,
      subfolder: "",
      type: "input",
      absolutePath: reference.absolutePath
    }
  };
}

export function imageEditPicturesForVersion(
  version: Pick<ImageAssetVersion, "file" | "width" | "height" | "references" | "contentHash"> & {
    modelId?: string;
  }
): ImageReference[] {
  const outputPath = version.file.absolutePath?.trim();
  if (!outputPath) return [];
  const preserveH3ReferenceNumbers = version.modelId === "minimax-h3-reference-edit";
  const retainedReferences = version.references
    .filter((reference) => reference.pictureNumber > 1 && reference.absolutePath.trim())
    .slice(0, preserveH3ReferenceNumbers ? 8 : 2)
    .map((reference, index) => ({
      ...reference,
      ...(preserveH3ReferenceNumbers ? {} : { pictureNumber: index + 2 }),
      role: reference.role === "base" ? "auto" as const : reference.role
    }));
  return [
    {
      id: crypto.randomUUID(),
      pictureNumber: 1,
      absolutePath: outputPath,
      width: version.width,
      height: version.height,
      role: "base",
      ...(version.contentHash ? { contentHash: version.contentHash } : {})
    },
    ...retainedReferences
  ];
}

export interface ImageProjectLineageMatch {
  projectId: string;
  parentVersionId?: string;
}

function normalizedLineagePath(value: string | undefined): string {
  return value?.trim().replaceAll("\\", "/").replace(/\/+$/u, "").toLowerCase() ?? "";
}

/**
 * Matches Picture 1 only against project outputs (including the protected source
 * version). Secondary references do not establish ancestry.
 */
export function findImageProjectLineage(
  projects: readonly ImageHistoryProject[],
  basePicture: Pick<ImageReference, "absolutePath" | "originalPath" | "contentHash">
): ImageProjectLineageMatch | undefined {
  const hash = basePicture.contentHash?.trim().toLowerCase();
  const paths = new Set(
    [basePicture.absolutePath, basePicture.originalPath]
      .map(normalizedLineagePath)
      .filter(Boolean)
  );
  for (const project of projects) {
    for (const version of project.versions) {
      const sourceHash = version.kind === "source"
        ? version.references[0]?.contentHash?.trim().toLowerCase()
        : undefined;
      if (hash && (version.contentHash === hash || sourceHash === hash)) {
        return { projectId: project.id, parentVersionId: version.id };
      }
      const outputPath = normalizedLineagePath(version.file.absolutePath);
      const sourcePath = version.kind === "source"
        ? normalizedLineagePath(version.references[0]?.absolutePath)
        : "";
      if ((outputPath && paths.has(outputPath)) || (sourcePath && paths.has(sourcePath))) {
        return { projectId: project.id, parentVersionId: version.id };
      }
    }
  }
  return undefined;
}

export function expandImageSeeds(
  seed: number | null,
  outputCount: number,
  randomSeed: () => number = () => {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] ?? 0;
  }
): number[] {
  const count = Math.min(imageOutputCountMax, Math.max(1, Math.trunc(outputCount)));
  if (seed != null && Number.isFinite(seed)) {
    return Array.from({ length: count }, () => Math.trunc(seed));
  }
  return Array.from({ length: count }, () => Math.trunc(randomSeed()) >>> 0);
}

export function nextImageVersionNumber(
  project: Pick<ImageHistoryProject, "nextVersionNumber" | "versions">
): number {
  const largestExisting = project.versions.reduce(
    (largest, version) => Math.max(largest, version.versionNumber),
    0
  );
  return Math.max(1, project.nextVersionNumber, largestExisting + 1);
}

export function imageProjectCoverVersion(
  project: Pick<ImageHistoryProject, "coverMode" | "coverVersionId" | "versions">
): ImageAssetVersion | undefined {
  if (project.coverMode === "pinned" && project.coverVersionId) {
    const pinned = project.versions.find((version) => version.id === project.coverVersionId);
    if (pinned) return pinned;
  }
  return [...project.versions]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}
