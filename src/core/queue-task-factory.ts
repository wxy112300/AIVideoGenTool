import type {
  AppState,
  Draft,
  ExtensionQueueTask,
  GenerationQueueTask,
  ImageEditDraft,
  ImageGenerationQueueTask,
  ImageGenerationRun,
  UpscaleQueueTask,
  UpscaleRequest
} from "../types.js";
import { activePromptIndexForDraft, promptVersionsForDraft } from "./draft-prompts.js";
import { createOutputFilename } from "./filename.js";
import { expandImageSeeds } from "./image-project.js";
import {
  imageModelAdapterFor,
  imageOutputDimensions,
  normalizeImageTargetResolution
} from "./image-workflow.js";
import { uniqueUpscaleFilename, upscaleDimensions } from "./upscale.js";
import { videoLoraSelection } from "./video-loras.js";
import { isMiniMaxH3Fl2vaModel, isMiniMaxH3R2vModel } from "./workflow.js";

export interface QueueTaskFactoryClock {
  now(): Date;
  id(): string;
  random(): number;
}

const defaultClock: QueueTaskFactoryClock = {
  now: () => new Date(),
  id: () => crypto.randomUUID(),
  random: () => Math.random()
};

export interface ImageOutputTarget {
  root: string;
  directory: string;
  subfolder: string;
}

export function promptOf(draft: Draft): string {
  const promptVersions = promptVersionsForDraft(draft);
  const activePromptVersion = activePromptIndexForDraft(draft);
  return (
    promptVersions[activePromptVersion]?.text ??
    promptVersions.at(-1)?.text ??
    ""
  ).trim();
}

export function outputNames(state: AppState): string[] {
  return [
    ...state.queue.map((item) => item.outputFilename),
    ...state.history.flatMap((asset) =>
      asset.versions.map((version) => version.outputFilename)
    )
  ];
}

export function queueTaskFromDraft(
  draft: Draft,
  state: AppState,
  clock: QueueTaskFactoryClock = defaultClock
): GenerationQueueTask {
  const now = clock.now().toISOString();
  // Preserve the legacy generation naming contract: HistoryAsset.outputFilename
  // is the stable compatibility name even when the asset contains versions.
  const names = [
    ...state.queue.map((item) => item.outputFilename),
    ...state.history.map((item) => item.outputFilename)
  ];
  return {
    id: clock.id(),
    taskType: "generation",
    status: "waiting",
    createdAt: now,
    updatedAt: now,
    outputFilename: createOutputFilename(
      draft.modelId,
      draft.resolution,
      draft.duration,
      names
    ),
    prompt: promptOf(draft),
    promptVersion: activePromptIndexForDraft(draft) + 1,
    h3ReferenceSlots: draft.h3ReferenceSlots.map((slot) => ({ ...slot })),
    startImagePath: draft.startImagePath,
    sourceWidth: draft.sourceWidth,
    sourceHeight: draft.sourceHeight,
    endImagePath: draft.endImagePath,
    modelId: draft.modelId,
    videoLoras: draft.videoLoras.map((lora) => videoLoraSelection(lora)),
    workflowPath: draft.workflowPath,
    ratio: draft.ratio,
    resolution: draft.resolution,
    duration: draft.duration,
    steps: draft.steps,
    fps: draft.fps,
    frameInterpolation: draft.frameInterpolation,
    motion: draft.motion,
    ...(draft.modelId === "sulphur2"
      ? { modelProfile: state.settings.ltxExtensionModelProfile }
      : {}),
    seed: draft.seed ?? Math.floor(clock.random() * Number.MAX_SAFE_INTEGER),
    keepSeedOnCopy: draft.keepSeedOnCopy,
    attentionMode: state.settings.h3AttentionMode,
    spectrumMode: draft.spectrumMode,
    spectrumModelAwareMode: draft.spectrumMode === "balanced"
      ? draft.spectrumModelAwareMode
      : "off",
    progress: 0
  };
}

export function imageTaskFromDraft(
  draft: ImageEditDraft,
  diffusionModelFilename: string | undefined,
  outputTarget: ImageOutputTarget,
  clock: QueueTaskFactoryClock = defaultClock
): ImageGenerationQueueTask {
  const currentDate = clock.now();
  const now = currentDate.toISOString();
  const id = clock.id();
  const projectId = draft.projectId ?? clock.id();
  const adapter = imageModelAdapterFor(draft.modelId);
  const outputCount = adapter?.deterministic ? 1 : draft.outputCount;
  const runs: ImageGenerationRun[] = expandImageSeeds(draft.seed, outputCount)
    .map((seed, index) => ({
      id: clock.id(),
      index,
      seed,
      status: "waiting"
    }));
  const basePicture = draft.pictures[0];
  const targetResolution = normalizeImageTargetResolution(
    draft.targetResolution,
    basePicture?.width ?? 0,
    basePicture?.height ?? 0
  );
  const [outputWidth, outputHeight] = imageOutputDimensions(
    basePicture?.width ?? 0,
    basePicture?.height ?? 0,
    adapter?.sourceResolutionOnly ? "source" : targetResolution
  );
  const promptless = imageModelAdapterFor(draft.modelId)?.requiresPrompt === false;
  return {
    id,
    taskType: "image-generation",
    status: "waiting",
    createdAt: now,
    updatedAt: now,
    outputFilename: `${draft.modelId === "lama-inpaint" ? "LaMa" : draft.modelId === "birefnet-background-removal" ? "BiRefNet" : "ImageEdit"}-${currentDate.toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14)}-${id.slice(0, 8)}`,
    projectId,
    parentVersionId: draft.parentVersionId,
    pictures: draft.pictures.map((picture) => ({
      ...picture,
      ...(picture.crop ? { crop: { ...picture.crop } } : {}),
      ...(picture.markup ? { markup: { ...picture.markup } } : {}),
      ...(picture.mask ? { mask: { ...picture.mask } } : {})
    })),
    imageOutputRoot: outputTarget.root,
    imageOutputDirectory: outputTarget.directory,
    imageOutputSubfolder: outputTarget.subfolder,
    outputWidth,
    outputHeight,
    targetResolution: adapter?.sourceResolutionOnly ? "source" : targetResolution,
    ...(diffusionModelFilename ? { diffusionModelFilename } : {}),
    prompt: promptless ? "" : draft.promptVersions[draft.activePromptVersion]?.text.trim() ?? "",
    promptVersion: promptless ? 1 : draft.activePromptVersion + 1,
    modelId: draft.modelId,
    workflowPath: `builtin:image/${adapter?.id ?? draft.modelId}`,
    qualityProfile: draft.qualityProfile,
    outputFormat: "png",
    outputCount: runs.length,
    runs,
    progress: 0
  };
}

export function extensionTaskFromDraft(
  draft: Draft,
  state: AppState,
  clock: QueueTaskFactoryClock = defaultClock
): ExtensionQueueTask {
  const now = clock.now().toISOString();
  const isH3 = isMiniMaxH3Fl2vaModel(draft.modelId) || isMiniMaxH3R2vModel(draft.modelId);
  const resolution = isH3 ? draft.resolution : state.settings.ltxExtensionResolution;
  return {
    id: clock.id(),
    taskType: "extension",
    status: "waiting",
    createdAt: now,
    updatedAt: now,
    outputFilename: createOutputFilename(
      draft.modelId,
      resolution,
      draft.duration,
      outputNames(state)
    ),
    prompt: promptOf(draft),
    promptVersion: activePromptIndexForDraft(draft) + 1,
    sourceVideoPath: draft.sourceVideoPath,
    sourceVideoDuration: draft.sourceVideoDuration,
    trimStartSeconds: draft.trimStartSeconds,
    trimEndSeconds: draft.trimEndSeconds,
    sourceAssetId: draft.sourceAssetId,
    sourceVersionId: draft.sourceVersionId,
    sourceWidth: draft.sourceWidth,
    sourceHeight: draft.sourceHeight,
    modelId: draft.modelId,
    videoLoras: draft.videoLoras.map((lora) => videoLoraSelection(lora)),
    workflowPath: draft.workflowPath,
    ratio: "source",
    resolution,
    duration: draft.duration,
    steps: draft.steps,
    fps: draft.fps,
    frameInterpolation: draft.frameInterpolation,
    motion: draft.motion,
    modelProfile: state.settings.ltxExtensionModelProfile,
    seed: draft.seed ?? Math.floor(clock.random() * Number.MAX_SAFE_INTEGER),
    keepSeedOnCopy: draft.keepSeedOnCopy,
    attentionMode: state.settings.h3AttentionMode,
    spectrumMode: isMiniMaxH3R2vModel(draft.modelId) ? "off" : draft.spectrumMode,
    spectrumModelAwareMode: isMiniMaxH3R2vModel(draft.modelId) || draft.spectrumMode !== "balanced"
      ? "off"
      : draft.spectrumModelAwareMode,
    maxGeneratedFrames: isH3 ? 362 : state.settings.ltxExtensionFrames,
    overlapFrames: state.settings.ltxExtensionOverlapFrames,
    unloadBetweenStages: state.settings.ltxExtensionUnloadBetweenStages,
    progress: 0
  };
}

export function upscaleTaskFromRequest(
  request: UpscaleRequest,
  state: AppState,
  clock: QueueTaskFactoryClock = defaultClock
): UpscaleQueueTask {
  const now = clock.now().toISOString();
  const [targetWidth] = upscaleDimensions(
    request.sourceWidth,
    request.sourceHeight,
    request.targetHeight
  );
  return {
    id: clock.id(),
    taskType: "upscale",
    status: "waiting",
    createdAt: now,
    updatedAt: now,
    outputFilename: uniqueUpscaleFilename(
      request.sourceFilename,
      request.targetHeight,
      outputNames(state)
    ),
    modelId: request.modelId,
    workflowPath: `builtin:upscale/${request.modelId}`,
    duration: request.duration,
    fps: request.fps,
    seed: Math.floor(clock.random() * 0xffffffff),
    keepSeedOnCopy: true,
    sourceAssetId: request.sourceAssetId,
    sourceVersionId: request.sourceVersionId,
    sourceFilePath: request.sourceFilePath,
    sourceFilename: request.sourceFilename,
    sourceWidth: request.sourceWidth,
    sourceHeight: request.sourceHeight,
    targetWidth,
    targetHeight: request.targetHeight,
    tileMode: request.tileMode === "fast" || request.tileMode === "auto"
      ? request.tileMode
      : "safe",
    faceRestore: request.faceRestore,
    progress: 0
  };
}
