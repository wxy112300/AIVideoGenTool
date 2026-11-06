import { uiKeys } from "../i18n-keys.js";
import type { Translate } from "../i18n.js";
import { createTranslator } from "../i18n.js";
import type {
  ImageOutputFormat,
  ImageReference,
  ImageReferenceSnapshot,
  ImageAspectRatio,
  ImageTargetResolution,
  ModelScanProfile
} from "../../types.js";
import {
  extractComfyOutputFiles,
  isPersistentComfyOutputFile
} from "../comfy-output.js";
import type {
  ComfyApiWorkflow,
  CompiledImagePrompt,
  ImageOutputCandidate
} from "./contracts.js";
import { qwenImageEdit2511Capability } from "./capabilities.js";

export function cachedImageProfileAllowsEnqueue(
  profile: Pick<ModelScanProfile, "category" | "integrated" | "available" | "missingCustomNodeIds" | "productGate" | "runtimeVerified" | "runtimeReady"> | undefined
): boolean {
  // This is the cached file/package gate only. Runtime node/schema validation
  // happens immediately before the task is submitted to ComfyUI; pending or
  // stale runtime evidence must not prevent a task from being queued.
  return Boolean(
    profile?.category === "image" &&
    profile.integrated &&
    profile.available &&
    !(profile.missingCustomNodeIds?.length) &&
    profile.productGate !== "locked"
  );
}
export const imageOutputCountMax = 6;
export const imageTargetResolutionValues = [2160, 1536, 1152, 1080, 1024, 768, 720, 640, 480] as const;
export const imageTargetResolutionRange = { min: 480, max: 2160 } as const;

export function clampCustomImageResolution(value: number, multiple = 8): number {
  const { min, max } = imageTargetResolutionRange;
  if (!Number.isFinite(value)) return min;
  const step = Number.isInteger(multiple) && multiple > 0 ? multiple : 8;
  return Math.max(min, Math.min(max, Math.round(value / step) * step));
}
export const imageAspectRatioValues = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"] as const satisfies readonly Exclude<ImageAspectRatio, "source">[];

export interface ImageResolutionOption {
  value: ImageTargetResolution;
  label: string;
  width: number;
  height: number;
}

export interface ImageAspectRatioOption {
  value: ImageAspectRatio;
  label: string;
}

function alignedImageDimension(value: number, multiple = 8): number {
  const normalizedMultiple = Number.isFinite(multiple) && multiple > 0
    ? Math.max(1, Math.trunc(multiple))
    : 8;
  return Math.max(normalizedMultiple, Math.round(value / normalizedMultiple) * normalizedMultiple);
}

export function normalizeImageTargetResolution(
  value: unknown,
  sourceWidth = 0,
  sourceHeight = 0
): ImageTargetResolution {
  if (value === "source") return "source";
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numeric) || numeric < imageTargetResolutionRange.min || numeric > imageTargetResolutionRange.max) return "source";
  return numeric;
}

function ratioValue(value: Exclude<ImageAspectRatio, "source">): number {
  const parts = value.split(":");
  const width = Number(parts[0] ?? 0);
  const height = Number(parts[1] ?? 0);
  return width / height;
}

function ratioLabelForDimensions(width: number, height: number,
  t: Translate = createTranslator().t): string {
  if (!(width > 0 && height > 0)) return t(uiKeys.workflowChecks.sourceRatio);
  const sourceRatio = width / height;
  const match = imageAspectRatioValues.find((value) => Math.abs(sourceRatio - ratioValue(value)) < 0.01);
  return match ?? `${width}×${height}`;
}

export function normalizeImageAspectRatio(value: unknown): ImageAspectRatio {
  if (value === "source" || imageAspectRatioValues.some((candidate) => candidate === value)) {
    return value as ImageAspectRatio;
  }
  return "source";
}

export function imageOutputDimensions(
  sourceWidth: number,
  sourceHeight: number,
  targetResolution: ImageTargetResolution,
  fallbackWidth = 0,
  fallbackHeight = 0,
  aspectRatio: ImageAspectRatio = "source",
  alignmentMultiple = 8
): [number, number] {
  const hasSource = Number.isFinite(sourceWidth) && Number.isFinite(sourceHeight) &&
    sourceWidth > 0 && sourceHeight > 0;
  const hasFallback = Number.isFinite(fallbackWidth) && Number.isFinite(fallbackHeight) &&
    fallbackWidth > 0 && fallbackHeight > 0;
  const width = hasSource ? sourceWidth : hasFallback ? fallbackWidth : 0;
  const height = hasSource ? sourceHeight : hasFallback ? fallbackHeight : 0;
  if (!width || !height) {
    return [Math.max(0, Math.trunc(width)), Math.max(0, Math.trunc(height))];
  }
  const normalizedAspectRatio = normalizeImageAspectRatio(aspectRatio);
  if (targetResolution === "source" && normalizedAspectRatio === "source") {
    return [Math.max(0, Math.trunc(width)), Math.max(0, Math.trunc(height))];
  }
  const sourceRatio = normalizedAspectRatio === "source"
    ? width / height
    : ratioValue(normalizedAspectRatio);
  const shortEdge = Math.min(width, height);
  const normalizedTarget = normalizeImageTargetResolution(targetResolution);
  const outputShortEdge = normalizedTarget === "source" ? shortEdge : normalizedTarget;
  const outputWidth = sourceRatio >= 1
    ? outputShortEdge * sourceRatio
    : outputShortEdge;
  const outputHeight = sourceRatio >= 1
    ? outputShortEdge
    : outputShortEdge / sourceRatio;
  return [
    alignedImageDimension(outputWidth, alignmentMultiple),
    alignedImageDimension(outputHeight, alignmentMultiple)
  ];
}

export function imageAspectRatioOptionsFor(
  sourceWidth = 0,
  sourceHeight = 0,
  fallbackWidth = 0,
  fallbackHeight = 0,
  t: Translate = createTranslator().t
): ImageAspectRatioOption[] {
  const hasSource = sourceWidth > 0 && sourceHeight > 0;
  const hasFallback = fallbackWidth > 0 && fallbackHeight > 0;
  const sourceLabel = hasSource
    ? t(uiKeys.workflowChecks.sourceRatioValue, { ratio: ratioLabelForDimensions(sourceWidth, sourceHeight, t) })
    : hasFallback
      ? t(uiKeys.workflowChecks.defaultRatioValue, { ratio: ratioLabelForDimensions(fallbackWidth, fallbackHeight, t) })
      : t(uiKeys.workflowChecks.sourceRatioPending);
  return [
    { value: "source", label: sourceLabel },
    ...imageAspectRatioValues.map((value) => ({
      value,
      label: `${value}${value === "1:1" ? t(uiKeys.workflowChecks.square) : value === "16:9" || value === "3:2" ? t(uiKeys.workflowChecks.landscape) : value === "9:16" || value === "2:3" ? t(uiKeys.workflowChecks.portrait) : ""}`
    }))
  ];
}

export function imageResolutionOptionsFor(
  sourceWidth = 0,
  sourceHeight = 0,
  fallbackWidth = 0,
  fallbackHeight = 0,
  aspectRatio: ImageAspectRatio = "source",
  alignmentMultiple = 8,
  t: Translate = createTranslator().t
): ImageResolutionOption[] {
  const hasSource = sourceWidth > 0 && sourceHeight > 0;
  const hasFallback = fallbackWidth > 0 && fallbackHeight > 0;
  const sourceOptionDimensions = imageOutputDimensions(
    sourceWidth,
    sourceHeight,
    "source",
    fallbackWidth,
    fallbackHeight,
    aspectRatio,
    alignmentMultiple
  );
  const sourceLabel = hasSource
    ? t(uiKeys.workflowChecks.sourceSize, { width: sourceOptionDimensions[0], height: sourceOptionDimensions[1] })
    : hasFallback
      ? t(uiKeys.workflowChecks.defaultSize, { width: sourceOptionDimensions[0], height: sourceOptionDimensions[1] })
      : t(uiKeys.workflowChecks.sourceSizePending);
  const options: ImageResolutionOption[] = [{
    value: "source",
    label: sourceLabel,
    width: sourceOptionDimensions[0],
    height: sourceOptionDimensions[1]
  }];
  for (const target of imageTargetResolutionValues) {
    const [width, height] = hasSource || hasFallback
      ? imageOutputDimensions(sourceWidth, sourceHeight, target, fallbackWidth, fallbackHeight, aspectRatio, alignmentMultiple)
      : [0, 0];
    options.push({
      value: target,
      label: hasSource || hasFallback ? `${target}p · ${width}×${height}` : `${target}p`,
      width,
      height
    });
  }
  return options;
}

export const pictureReferencePattern = /(?:<\s*)?(?:picture|image|图片)\s*([1-9]\d*)(?:\s*>)?/giu;

export function orderedPictures(pictures: ImageReferenceSnapshot[]): ImageReferenceSnapshot[] {
  return [...pictures].sort((left, right) => left.pictureNumber - right.pictureNumber);
}

/**
 * An unfilled slot is a UI affordance, not a reference image. Text-only-capable
 * models may therefore submit a draft with one or more empty slots as T2I.
 * Mixed drafts still retain their empty slots so normal validation can explain
 * which reference is incomplete.
 */
export function imagePicturesForModelInput(
  pictures: ImageReferenceSnapshot[],
  supportsTextOnly: boolean
): ImageReferenceSnapshot[] {
  return supportsTextOnly && !pictures.some((picture) => picture.absolutePath.trim())
    ? []
    : pictures;
}

export function imageReferenceInputPath(
  picture: Pick<ImageReference, "absolutePath" | "crop">
): string {
  return picture.crop?.croppedPath.trim() || picture.absolutePath.trim();
}

export function imageMarkupPromptContext(
  pictures: ReadonlyArray<Pick<ImageReference, "pictureNumber" | "markup">>
): string {
  const marked = pictures.filter((picture) => picture.markup?.objectCount);
  if (!marked.length) return "";
  return [
    "Visual annotation instructions:",
    "Canvas annotations are location-only editing instructions stored alongside the clean source Pictures. Use their notes to identify the intended target, but never add annotation graphics, labels, arrows, boxes, or note text to the output.",
    "The per-annotation notes below are the authoritative edit list. A general preservation instruction may protect unrelated content, but must never override, broaden, or replace a specific annotation note.",
    ...marked.map((picture) => `Picture ${picture.pictureNumber}: ${picture.markup?.summary || `${picture.markup?.objectCount ?? 0} marked target(s)`}`)
  ].join("\n");
}

interface CompiledMarkupGuide {
  sourcePictureNumber: number;
  sourceInputNumber: number;
  guideInputNumber: number;
  summary: string;
}

function markupGuidePicture(
  picture: ImageReferenceSnapshot,
  compiledPictureNumber: number
): ImageReferenceSnapshot {
  return {
    ...picture,
    id: `${picture.id}-markup-guide-r${picture.markup?.revision ?? 0}`,
    pictureNumber: compiledPictureNumber,
    absolutePath: picture.markup?.renderedPath.trim() ?? "",
    role: "auto",
    crop: undefined,
    markup: undefined
  };
}

function compiledMarkupPromptContext(guides: CompiledMarkupGuide[]): string {
  if (!guides.length) return "";
  return [
    "Visual annotation reference contract:",
    "The clean source Picture is the image to edit. Its paired annotation-guide Picture is location-only reference material, not output content.",
    "Never reproduce any colored mark, border, box, arrow, label, letter, number, note, or annotation-guide text. Reconstruct clean natural pixels where the requested edit is made, and preserve unmarked content.",
    ...guides.map((guide) => [
      `Picture ${guide.sourceInputNumber} is the clean source for original Picture ${guide.sourcePictureNumber}; Picture ${guide.guideInputNumber} is only its temporary annotation guide.`,
      `Requested edits for Picture ${guide.sourceInputNumber}: ${guide.summary}`
    ].join(" "))
  ].join("\n");
}

export function compileImagePromptWithLimit(
  prompt: string,
  pictures: ImageReferenceSnapshot[],
  maxPictures: number,
  modelLabel: string,
  includeMarkupGuides = false,
  t: Translate = createTranslator().t
): CompiledImagePrompt {
  const ordered = orderedPictures(pictures);
  const usable = ordered.filter((picture) => picture.absolutePath.trim());
  const errors: string[] = [];
  ordered
    .filter((picture) => !picture.absolutePath.trim())
    .forEach((picture) => {
      errors.push(t(uiKeys.workflowChecks.pictureEmpty, { number: picture.pictureNumber }));
    });
  const originalToCompiled = new Map<number, number>();
  const compiledPictures: ImageReferenceSnapshot[] = [];
  const markupGuides: CompiledMarkupGuide[] = [];
  usable.forEach((picture) => {
    if (originalToCompiled.has(picture.pictureNumber)) {
      errors.push(t(uiKeys.workflowChecks.pictureDuplicate, { number: picture.pictureNumber }));
      return;
    }
    const sourceInputNumber = compiledPictures.length + 1;
    originalToCompiled.set(picture.pictureNumber, sourceInputNumber);
    compiledPictures.push(picture);
    if (includeMarkupGuides && picture.markup?.objectCount && picture.markup.renderedPath.trim()) {
      const guideInputNumber = compiledPictures.length + 1;
      compiledPictures.push(markupGuidePicture(picture, guideInputNumber));
      markupGuides.push({
        sourcePictureNumber: picture.pictureNumber,
        sourceInputNumber,
        guideInputNumber,
        summary: picture.markup.summary.trim() || `${picture.markup.objectCount} marked target(s)`
      });
    }
  });
  if (ordered.length > maxPictures) {
    errors.push(t(uiKeys.workflowChecks.pictureLimit, { model: modelLabel, count: maxPictures }));
  }
  if (compiledPictures.length > maxPictures) {
    const guideCount = markupGuides.length;
    errors.push(
      t(uiKeys.workflowChecks.markupLimit, { guides: guideCount, model: modelLabel, count: maxPictures })
    );
  }

  const referencedPictureNumbers = new Set<number>();
  const compiledPrompt = prompt.replace(pictureReferencePattern, (match, numberText: string) => {
    const originalNumber = Number(numberText);
    referencedPictureNumbers.add(originalNumber);
    const compiledNumber = originalToCompiled.get(originalNumber);
    if (!compiledNumber) {
      errors.push(t(uiKeys.workflowChecks.pictureReference, { reference: match, number: originalNumber }));
      return match;
    }
    return `Picture ${compiledNumber}`;
  });

  const limitedPictures = compiledPictures.slice(0, maxPictures);
  const markupContext = includeMarkupGuides
    ? compiledMarkupPromptContext(markupGuides)
    : imageMarkupPromptContext(usable);
  return {
    prompt: markupContext ? `${compiledPrompt.trim()}\n\n${markupContext}` : compiledPrompt,
    pictures: limitedPictures,
    referencedPictureNumbers: [...referencedPictureNumbers].sort((left, right) => left - right),
    errors: [...new Set(errors)]
  };
}

export function imageOutputFormatFromFilename(filename: string): ImageOutputFormat | undefined {
  const extension = filename.toLowerCase().split(".").pop();
  if (extension === "png") return "png";
  if (extension === "jpg" || extension === "jpeg") return "jpeg";
  if (extension === "webp") return "webp";
  return undefined;
}

export function imageOutputCandidateFromValue(value: unknown): ImageOutputCandidate | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<ImageOutputCandidate>;
  if (typeof source.filename !== "string" || !source.filename.trim()) return null;
  return {
    filename: source.filename,
    subfolder: typeof source.subfolder === "string" ? source.subfolder : "",
    type: typeof source.type === "string" ? source.type : "output",
    format: imageOutputFormatFromFilename(source.filename)
  };
}

export function imageQualityProfileRequiresLightning(qualityProfile: string): boolean {
  return qualityProfile === "lightning-4step";
}

export function imageLightningComponentFound(
  components: ReadonlyArray<{ label: string; found: boolean }>
): boolean {
  return components.some((component) =>
    component.label.includes("Lightning LoRA") && component.found
  );
}

export function imageQualityProfileRequiredComponentLabel(
  capability: Pick<import("./contracts.js").ImageModelCapability, "qualityProfileComponentLabels">,
  qualityProfile: string
): string | undefined {
  return capability.qualityProfileComponentLabels?.[qualityProfile];
}

export function imageQualityProfileComponentFound(
  capability: Pick<import("./contracts.js").ImageModelCapability, "qualityProfileComponentLabels">,
  qualityProfile: string,
  components: ReadonlyArray<{ label: string; found: boolean }>
): boolean {
  const requiredLabel = imageQualityProfileRequiredComponentLabel(capability, qualityProfile);
  return !requiredLabel || components.some((component) =>
    component.label.includes(requiredLabel) && component.found
  );
}

export function imageReferenceInputs(
  pictures: ImageReferenceSnapshot[],
  nodePrefix: string,
  maxPictures = qwenImageEdit2511Capability.maxPictures
): Record<string, unknown> {
  return Object.fromEntries(
    pictures.slice(0, maxPictures).map((picture, index) => [
      `image${index + 1}`,
      [`${nodePrefix}-${picture.id}`, 0]
    ])
  );
}

export function exactImageDimension(value: number | undefined, fallback: number,
  t: Translate = createTranslator().t): number {
  const dimension = value ?? fallback;
  if (!Number.isInteger(dimension) || dimension <= 0) {
    throw new Error(t(uiKeys.workflowChecks.outputDimensions));
  }
  return dimension;
}

export function unresolvedImagePlaceholders(workflow: ComfyApiWorkflow): string[] {
  return Object.values(workflow).flatMap((node) =>
    Object.values(node.inputs).filter((value) =>
      typeof value === "string" && /^\{\{(?:IMAGE|MASK)_\d+\}\}$/u.test(value)
    )
  ).map(String);
}

export function renderImageWorkflow(
  workflow: ComfyApiWorkflow,
  uploadedPictures: string[],
  uploadedMasks: string[] = []
): ComfyApiWorkflow {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, child]) => [
          key,
          visit(child)
        ])
      );
    }
    if (typeof value !== "string") return value;
    const exact = value.match(/^\{\{IMAGE_(\d+)\}\}$/u);
    if (exact?.[1]) return uploadedPictures[Number(exact[1])] ?? value;
    const exactMask = value.match(/^\{\{MASK_(\d+)\}\}$/u);
    if (exactMask?.[1]) return uploadedMasks[Number(exactMask[1])] ?? value;
    return value
      .replace(/\{\{IMAGE_(\d+)\}\}/gu, (match, indexText: string) =>
        uploadedPictures[Number(indexText)] ?? match
      )
      .replace(/\{\{MASK_(\d+)\}\}/gu, (match, indexText: string) =>
        uploadedMasks[Number(indexText)] ?? match
      );
  };
  return visit(workflow) as ComfyApiWorkflow;
}

export function parseImageOutputs(history: unknown): ImageOutputCandidate[] {
  return extractComfyOutputFiles(history)
    .filter(isPersistentComfyOutputFile)
    .map((file) => imageOutputCandidateFromValue(file))
    .filter((file): file is ImageOutputCandidate => file !== null);
}
