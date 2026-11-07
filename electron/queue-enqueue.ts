import type { Translate } from "../src/core/i18n.js";
import type { IpcMain } from "electron";
import { createNativeTranslator } from "./ui-translator.js";
import { uiKeys } from "../src/core/i18n-keys.js";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { H3_REFINER_ID, validateH3RefinerSource } from "../src/core/h3-refiner.js";
import { modelCoreVersionBlockReason } from "../src/core/model-core-requirements.js";
import { FASTH3_OMNI_MODEL_ID } from "../src/core/catalog/models/minimax_h3_omni/definition.js";
import { fileURLToPath } from "node:url";
import { TESSERA_ID, tesseraAnchorModels, type TesseraAnchorSnapshot } from "../src/core/tessera.js";
import type {
  AppState,
  ContinuumSequence,
  Draft,
  EnvironmentScanResult,
  ImageEditDraft,
  NativeAvArtifactInspection,
  Settings,
  UpscaleRequest
} from "../src/types.js";
import { H3_CONTINUUM_RECOMMENDED_VERSION } from "../src/core/catalog/dependencies/nodes.js";
import { isImageGenerationQueueTask } from "../src/core/queue.js";
import { activateCreationDraft } from "../src/core/creation-drafts.js";
import { imageLoraConfigurationError } from "../src/core/image-loras.js";
import { findImageProjectLineage, normalizeImageEditDraft } from "../src/core/image-project.js";
import {
  imageModelUnavailableReason,
  imageLightningComponentFound,
  imageModelAdapterFor,
  imagePicturesForModelInput,
  imageQualityProfileComponentFound,
  imageQualityProfileRequiredComponentLabel,
  imageQualityProfileRequiresLightning
} from "../src/core/image-workflow.js";
import {
  extensionSafetyForTask,
  extensionWorkflowSafetyErrors,
  generationSafetyForTask,
  isKnownBundledH3WorkflowPath,
  isMiniMaxH3ContinuumModel,
  h3ContinuumModeForSource,
  isMiniMaxH3Fl2vaModel,
  isMiniMaxH3Model,
  isMiniMaxH3Q3GgufModel,
  isMiniMaxH3R2vModel,
  h3WorkflowPathForInput,
  h3ContinuumWorkflowPathForInput,
  h3ContinuumManagedWorkflowPathForInput,
  continuumTimelinePromptForTask,
  normalizeH3Steps,
  validateApiWorkflow,
  workflowSupportsEndImage,
  workflowSupportsH3BoundaryExtension,
  workflowSupportsH3ContinuumExtension,
  workflowSupportsH3ContinuumManagedExtension,
  workflowSupportsH3MotionContextExtension,
  workflowSupportsH3MotionContextReferences,
  workflowSupportsH3PddSampling,
  workflowSupportsH3TurboSampling,
  miniMaxH3ModelAssetNames
} from "../src/core/workflow.js";
import { adaptH3AvAsset } from "../src/core/h3-av-adapters.js";
import { validateContinuumSequence } from "../src/core/h3-av-asset.js";
import { normalizeVideoDraft, videoModelSupportsDraftInput } from "../src/core/video-draft-normalization.js";
import { isLongVideoDraftActive, longVideoBlockReason, longVideoDependencyBlockReason } from "../src/core/long-video/capability.js";
import { enqueueLongVideoExtension } from "./services/long-video-enqueue.js";
import {
  isH3TurboEnabled,
  isH3PddLoraId,
  normalizeVideoLoras,
  videoLoraCompatibleWithModel,
  videoLoraConfigurationIssues
} from "../src/core/video-loras.js";
import {
  modelCatalog,
  SPECTRUM_MODEL_AWARE_MINIMUM_VERSION,
  SPECTRUM_PDD_MINIMUM_VERSION,
  SPECTRUM_TURBO_MINIMUM_VERSION
} from "../src/core/catalog/index.js";
import { resolveVideoGenerationPolicy } from "../src/core/video-policy.js";
import { resolveH3ExecutionPolicy } from "../src/core/h3-execution-policy.js";
import {
  h3VideoVaeAvailabilityFromModelProfiles,
  resolveH3VideoVaeMode
} from "../src/core/h3-video-vae.js";
import {
  AETHERSCALE_MODEL_ID,
  normalizeAetherScaleTarget
} from "../src/core/aetherscale.js";
import {
  KONOHAMARU_MODEL_ID,
  normalizeKonohamaruTarget
} from "../src/core/konohamaru-dlss5.js";
import {
  DLSS5_MODEL_ID,
  normalizeUpscaleTarget
} from "../src/core/dlss5.js";
import {
  ensureMotionContextSourceSlot,
  h3ReferenceSlotCounts
} from "../src/core/h3-reference.js";
import {
  H3_MOTION_CONTEXT_FILENAME,
  H3_MOTION_CONTEXT_SUBFOLDER,
  h3MotionContextSavePrefixForTask
} from "../src/core/h3-motion-context.js";
import {
  h3SharedLatentSaveModeFor,
  h3LatentSaveModeFor,
  h3LatentSaveModeSavesMotionContext
} from "../src/core/h3-latent-save.js";
import { validateH3ComfyWorkflow } from "../src/core/h3-workflow-contract.js";
import { releaseVersionAtLeast } from "../src/core/release-version.js";
import { isH3NativeHighResolution } from "../src/core/h3-capabilities.js";
import {
  extensionTaskFromDraft,
  imageTaskFromDraft,
  promptOf,
  queueTaskFromDraft,
  upscaleTaskFromRequest
} from "../src/core/queue-task-factory.js";
import type { StateRepository } from "./ports/state-repository.js";
import type { ImageInspectionPort } from "./ports/image-inspection.js";
import type { AppLogger } from "../src/infrastructure/app-logger.js";
import { safeLogErrorMessage } from "../src/infrastructure/app-logger.js";
import {
  getCachedEnvironmentScan,
  resolveComfyOutputDirectory
} from "./services/environment.js";
import { isLocalComfyUrl } from "./services/comfy-endpoint.js";
import { archiveImagePaths, archiveImageReferences, hashImageFile } from "../src/infrastructure/image-asset-library.js";
import { isPathWithinDirectory } from "../src/infrastructure/video-history-migration.js";

function managedSequenceNeedsFreshRun(state: AppState, sequence: ContinuumSequence): boolean {
  if (sequence.acceptedChunks !== 0 || sequence.canonicalHead.revisionId !== "pending") return false;
  return state.queue.some((item) =>
    item.taskType === "extension" &&
    item.h3ContinuumMode === "managed" &&
    item.h3ContinuumSequence?.sequenceId === sequence.sequenceId &&
    (item.status === "failed" || item.status === "cancelled")
  );
}

export interface QueueEnqueueServiceDependencies {
  store: StateRepository;
  logger: AppLogger;
  sendState(state: AppState): void;
  getCachedEnvironmentScanForQueue?: typeof getCachedEnvironmentScan;
  effectiveImageInputLibraryDirectory(settings: Settings): Promise<string>;
  resolveTaskOutputDirectory(): Promise<string>;
  imageInspection: ImageInspectionPort;
  inspectNativeAvArtifact?: (
    referencePath: string,
    outputDirectory: string
  ) => Promise<NativeAvArtifactInspection>;
  inspectExtensionSource?: (draft: Draft) => Promise<import("../src/types.js").VideoExtensionSourceInspection>;
}

export type QueueEnqueueDependencies = QueueEnqueueServiceDependencies & { ipc: IpcMain };
export type QueueEnqueueIpcDependencies =
  | QueueEnqueueDependencies
  | { ipc: IpcMain; service: QueueEnqueueService };

async function readWorkflow(filename: string, label: string, t: Translate = createNativeTranslator(undefined).t): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(filename, "utf8"));
  } catch (error) {
    throw new Error(t(uiKeys.serviceChecks.readWorkflow, { label: label, detail: error instanceof Error ? error.message : String(error) }));
  }
}

function defaultExtensionWorkflowPathForDraft(draft: Draft): string | undefined {
  let filename: string | undefined;
  if (isMiniMaxH3R2vModel(draft.modelId)) {
    filename = "minimax_h3_r2v_extend_api.json";
  } else if (isMiniMaxH3ContinuumModel(draft.modelId)) {
    filename = h3ContinuumModeForSource(draft) === "managed"
      ? "minimax_h3_continuum_v38_managed_extend_api.json"
      : "minimax_h3_continuum_v38_extend_api.json";
  } else if (isMiniMaxH3Fl2vaModel(draft.modelId)) {
    filename = "minimax_h3_i2v_api.json";
  }
  return filename
    ? fileURLToPath(new URL(`../workflows/${filename}`, import.meta.url))
    : undefined;
}

async function extensionWorkflowPathForDraft(draft: Draft): Promise<string | undefined> {
  const current = draft.workflowPath.trim();
  if (current) {
    if (
      !isKnownBundledH3WorkflowPath(current) ||
      !(isMiniMaxH3R2vModel(draft.modelId) ||
        isMiniMaxH3ContinuumModel(draft.modelId) ||
        isMiniMaxH3Fl2vaModel(draft.modelId))
    ) return current;
    const currentBundledPath = fileURLToPath(new URL(
      `../workflows/${current.replaceAll("\\", "/").split("/").pop() ?? current}`,
      import.meta.url
    ));
    if (path.resolve(current) === path.resolve(currentBundledPath)) {
      return defaultExtensionWorkflowPathForDraft(draft);
    }
    if ((await fs.stat(current).catch(() => null))?.isFile()) return current;
  }
  return defaultExtensionWorkflowPathForDraft(draft);
}

async function resolveImageProjectLineage(
  state: AppState,
  draft: ImageEditDraft
): Promise<{ projectId: string; parentVersionId?: string } | undefined> {
  const basePicture = draft.pictures[0];
  if (!basePicture?.absolutePath || !basePicture.contentHash) return undefined;
  const known = findImageProjectLineage(state.imageHistory, basePicture, draft.projectId
    ? { projectId: draft.projectId, parentVersionId: draft.parentVersionId }
    : undefined);
  if (known) return known;
  const queuedMatch = state.queue.find((item) =>
    isImageGenerationQueueTask(item) && item.pictures[0]?.contentHash === basePicture.contentHash
  );
  if (queuedMatch && isImageGenerationQueueTask(queuedMatch)) {
    return {
      projectId: queuedMatch.projectId,
      ...(queuedMatch.parentVersionId ? { parentVersionId: queuedMatch.parentVersionId } : {})
    };
  }
  const preferred = draft.projectId
    ? [
        ...state.imageHistory.filter((project) => project.id === draft.projectId),
        ...state.imageHistory.filter((project) => project.id !== draft.projectId)
      ]
    : state.imageHistory;
  for (const project of preferred) {
    for (const version of project.versions) {
      const outputPath = version.file.absolutePath?.trim();
      if (!outputPath) continue;
      if (await hashImageFile(outputPath).catch(() => undefined) === basePicture.contentHash) {
        return { projectId: project.id, parentVersionId: version.id };
      }
    }
  }
  return undefined;
}

async function resolveImageOutputTarget(settings: Settings): Promise<{
  root: string; directory: string; subfolder: string;
}> {
  const t = createNativeTranslator(settings.uiLocale).t;
  const detectedRoot = await resolveComfyOutputDirectory(settings);
  const rootCandidate = detectedRoot || settings.outputDirectory.trim();
  if (!rootCandidate) throw new Error(t(uiKeys.serviceChecks.outputRoot));
  const root = path.resolve(rootCandidate);
  const directory = path.resolve(settings.imageOutputDirectory.trim() || path.join(root, "Images"));
  if (!isPathWithinDirectory(root, directory)) {
    throw new Error(t(uiKeys.serviceChecks.outputInside));
  }
  await fs.mkdir(directory, { recursive: true });
  return { root, directory, subfolder: path.relative(root, directory).replaceAll(path.sep, "/") };
}

function readImageDimensions(
  filename: string,
  imageInspection: ImageInspectionPort,
  t: Translate = createNativeTranslator(undefined).t
): { width: number; height: number } {
  const size = imageInspection.readDimensions(filename);
  if (!size.width || !size.height) throw new Error(t(uiKeys.serviceChecks.pictureSize, { filename: filename }));
  return size;
}

function hydrateVideoInputImageDimensions(
  draft: Draft,
  imageInspection: ImageInspectionPort
): void {
  const tryRead = (filename: string): { width: number; height: number } | undefined => {
    try {
      return readImageDimensions(filename, imageInspection);
    } catch {
      return undefined;
    }
  };

  if (isMiniMaxH3R2vModel(draft.modelId)) {
    draft.h3ReferenceSlots = draft.h3ReferenceSlots.map((slot) => {
      if (slot.mediaType !== "image" || !slot.mediaPath) return slot;
      const dimensions = tryRead(slot.mediaPath);
      return dimensions ? { ...slot, ...dimensions } : slot;
    });
    return;
  }
  if (!isMiniMaxH3Model(draft.modelId)) return;
  if (draft.startImagePath) {
    const dimensions = tryRead(draft.startImagePath);
    if (dimensions) {
      draft.sourceWidth = dimensions.width;
      draft.sourceHeight = dimensions.height;
    }
  }
  if (draft.endImagePath) {
    const dimensions = tryRead(draft.endImagePath);
    if (dimensions) {
      draft.endImageWidth = dimensions.width;
      draft.endImageHeight = dimensions.height;
    }
  }
}

async function requireImageModelAssets(
  settings: Settings,
  modelId = settings.defaultImageModel,
  qualityProfile = "native",
  hasReference = false,
  cachedScan?: EnvironmentScanResult
): Promise<string | undefined> {
  const t = createNativeTranslator(settings.uiLocale).t;
  const adapter = imageModelAdapterFor(modelId);
  const scan = cachedScan;
  if (!scan) return undefined;
  const profile = scan.modelProfiles.find((item) => item.id === modelId);
  if (!adapter || profile?.category !== "image" || !profile.integrated) {
    throw new Error(t(uiKeys.serviceChecks.adapterMissing, { model: modelId }));
  }
  if (!profile.available) {
    const missing = profile.components.filter((component) => !component.found)
      .map((component) => component.expected).join("、");
    throw new Error(t(uiKeys.serviceChecks.componentsMissing, { model: adapter.name, detail: missing ? t(uiKeys.serviceChecks.missingDetail, { detail: missing }) : "" }));
  }
  if (profile.missingCustomNodeNames?.length) {
    throw new Error(
      t(uiKeys.serviceChecks.nodesMissing, { model: adapter.name, nodes: profile.missingCustomNodeNames.join("、") }) +
      t(uiKeys.serviceChecks.installNodes)
    );
  }
  if (imageQualityProfileRequiresLightning(qualityProfile) && !imageLightningComponentFound(profile.components)) {
    throw new Error(t(uiKeys.serviceChecks.lightningMissing));
  }
  const requiredQualityComponent = imageQualityProfileRequiredComponentLabel(adapter, qualityProfile);
  if (requiredQualityComponent && !imageQualityProfileComponentFound(adapter, qualityProfile, profile.components)) {
    throw new Error(
      t(uiKeys.serviceChecks.qualityFile, { model: adapter.name, quality: qualityProfile, component: requiredQualityComponent }) +
      t(uiKeys.serviceChecks.qualityRecovery)
    );
  }
  if (hasReference && adapter.referenceModelComponentLabel) {
    const referenceComponent = profile.components.find((component) =>
      component.label.includes(adapter.referenceModelComponentLabel!)
    );
    if (!referenceComponent?.found) {
      throw new Error(
        t(uiKeys.serviceChecks.referenceComponent, { model: adapter.name, component: adapter.referenceModelComponentLabel }) +
        t(uiKeys.serviceChecks.referenceRecovery)
      );
    }
  }
  if (adapter.operation === "inpaint" || adapter.operation === "background-removal") return undefined;
  const diffusionModel = profile.components.find((component) =>
    component.label.includes("扩散模型") ||
    /(?:^|[\\/])(diffusion_models|unet)[\\/]/u.test(component.expected)
  )
    ?.matches[0]?.split(/[\\/]/u).pop();
  if (!diffusionModel) throw new Error(t(uiKeys.serviceChecks.diffusionFile, { model: adapter.name }));
  return diffusionModel;
}

export class QueueEnqueueService {
  constructor(private readonly deps: QueueEnqueueServiceDependencies) {}

  private get t(): Translate { return createNativeTranslator(this.deps.store.getSettings().uiLocale).t; }

  private rejectUnavailableH3NativeResolution(draft: Draft): void {
    if (isLongVideoDraftActive(draft)) return;
    if (!isH3NativeHighResolution(draft.resolution)) return;
    if (draft.resolution === 1440) {
      throw new Error(this.t(uiKeys.serviceChecks.native1440));
    }
    if (draft.modelId !== "minimax_h3_fl2va") {
      throw new Error(this.t(uiKeys.serviceChecks.nativeBase));
    }
    if (h3SharedLatentSaveModeFor(draft) === "none") {
      throw new Error(this.t(uiKeys.serviceChecks.nativeJointAv));
    }
    if (draft.videoLoras.length) {
      throw new Error(this.t(uiKeys.serviceChecks.nativeLora));
    }
  }

  private async validateH3Create1080(draft: Draft, settings: Settings): Promise<void> {
    if (isLongVideoDraftActive(draft)) return;
    if (draft.resolution !== 1080) return;
    const t = createNativeTranslator(settings.uiLocale).t;
    const [firstPass, secondPass] = await Promise.all([
      readWorkflow(fileURLToPath(new URL(
        "../workflows/minimax_h3_fl2va_first_pass_av_api.json",
        import.meta.url
      )), t(uiKeys.workflowChecks.first1080Label), t),
      readWorkflow(fileURLToPath(new URL(
        "../workflows/minimax_h3_fl2va_learned_3d_second_sample_av_api.json",
        import.meta.url
      )), t(uiKeys.workflowChecks.second1080Label), t)
    ]);
    const firstValidation = validateH3ComfyWorkflow(firstPass, t);
    const secondValidation = validateH3ComfyWorkflow(secondPass, t);
    if (!firstValidation.valid || firstValidation.kind !== "first-pass-av") {
      throw new Error(t(uiKeys.workflowChecks.first1080Static, { detail: firstValidation.errors.join("; ") }));
    }
    if (!secondValidation.valid || secondValidation.kind !== "second-sampling-av") {
      throw new Error(t(uiKeys.workflowChecks.second1080Static, { detail: secondValidation.errors.join("; ") }));
    }
    const environment = (this.deps.getCachedEnvironmentScanForQueue ?? getCachedEnvironmentScan)(settings);
    if (!environment) return;
    const learnedProfile = environment.modelProfiles.find(
      (profile) => profile.id === "minimax_h3_latent_upscaler"
    );
    if (!learnedProfile?.integrated) throw new Error(this.t(uiKeys.serviceChecks.learnedUnsupported));
    if (!learnedProfile.available) {
      const missing = learnedProfile.components
        .filter((component) => !component.found)
        .map((component) => component.expected)
        .join("、");
      throw new Error(this.t(uiKeys.serviceChecks.learnedWeights, { detail: missing ? this.t(uiKeys.serviceChecks.missingDetail, { detail: missing }) : "" }));
    }
    if (learnedProfile.missingCustomNodeNames?.length) {
      throw new Error(this.t(uiKeys.serviceChecks.learnedNodes, { nodes: learnedProfile.missingCustomNodeNames.join("、") }));
    }
    if (learnedProfile.customNodeCompatibility === "error") {
      throw new Error(this.t(uiKeys.serviceChecks.learnedVersion));
    }
  }

  private validateDlss5EnqueuePreflight(
    request: UpscaleRequest
  ): UpscaleRequest {
    if (request.upscaleMode === "h3-native") {
      throw new Error(this.t(uiKeys.serviceChecks.dlssProvider));
    }
    const target = normalizeUpscaleTarget(request, this.t);
    if (target.provider !== "dlss5") throw new Error(this.t(uiKeys.serviceChecks.dlssTarget));
    return {
      ...request,
      upscaleMode: "pixel",
      modelId: DLSS5_MODEL_ID,
      targetHeight: undefined,
      targetScale: target.targetScale,
      dlss5: structuredClone(target.dlss5),
      tileMode: "auto",
      faceRestore: false
    };
  }

  private validateKonohamaruEnqueuePreflight(
    request: UpscaleRequest
  ): UpscaleRequest {
    if (request.upscaleMode === "h3-native") {
      throw new Error(this.t(uiKeys.serviceChecks.konohamaruProvider));
    }
    if (
      request.targetHeight !== undefined ||
      request.targetScale !== undefined ||
      request.dlss5 !== undefined ||
      request.aetherScale !== undefined
    ) {
      throw new Error(this.t(uiKeys.serviceChecks.konohamaruTarget));
    }
    const target = normalizeKonohamaruTarget(request, this.t);
    return {
      ...request,
      upscaleMode: "pixel",
      modelId: KONOHAMARU_MODEL_ID,
      targetHeight: undefined,
      targetScale: undefined,
      dlss5: undefined,
      aetherScale: undefined,
      targetWidth: target.targetWidth,
      targetOutputHeight: target.targetOutputHeight,
      konohamaru: structuredClone(target.options),
      tileMode: "auto",
      faceRestore: false
    };
  }

  private async checkKonohamaruEnqueueEnvironment(
    request: UpscaleRequest,
    settings: Settings
  ): Promise<void> {
    // Remote ComfyUI owns its own custom_nodes/runtime. The task still gets
    // strict schema validation at submission; this app only preflights a
    // local scan when it manages the ComfyUI data directory.
    if (!isLocalComfyUrl(settings.comfyUrl)) return;
    const environment = (this.deps.getCachedEnvironmentScanForQueue ?? getCachedEnvironmentScan)(settings);
    if (!environment) {
      this.deps.logger.info("queue", "upscale-enqueue-environment-preflight-deferred", "未阻塞入队：Konohamaru DLSS5 环境检查将在任务准备阶段重新执行", {
        provider: KONOHAMARU_MODEL_ID,
        mode: request.konohamaru?.mode,
        frameInterpolation: request.konohamaru?.frameInterpolation.enabled
      });
      return;
    }
    const customNodes = Array.isArray(environment.customNodes)
      ? environment.customNodes
      : undefined;
    const node = customNodes?.find((candidate) => candidate.id === "comfyui-dlss-frame-interpolation");
    if (customNodes && !node) {
      throw new Error(this.t(uiKeys.serviceChecks.konohamaruInstall));
    }
    if (node && (
      !node.installed ||
      Boolean(node.loadError) ||
      node.runtimeRepairable ||
      node.compatibilityState === "error" ||
      (node.runtimeVerified && !node.loaded)
    )) {
      throw new Error(
        node.loadError
          ? this.t(uiKeys.serviceChecks.konohamaruLoad, { detail: node.loadError })
          : this.t(uiKeys.serviceChecks.konohamaruCheck)
      );
    }
    if (node?.runtimeMissingNodeTypes?.length) {
      throw new Error(this.t(uiKeys.serviceChecks.konohamaruNodes, { nodes: node.runtimeMissingNodeTypes.join("、") }));
    }
    const profile = environment.modelProfiles?.find((candidate) => candidate.id === KONOHAMARU_MODEL_ID);
    if (profile?.runtimeMissingNodes?.length || profile?.available === false) {
      throw new Error(this.t(uiKeys.serviceChecks.konohamaruSchema, { detail: profile.runtimeMissingNodes?.length ? this.t(uiKeys.serviceChecks.detailSuffix, { detail: profile.runtimeMissingNodes.join("、") }) : "" }));
    }
    const nvidia = environment.items?.find((item) => item.id === "nvidia");
    if (nvidia && nvidia.ok === false && nvidia.status === "missing") {
      throw new Error(this.t(uiKeys.serviceChecks.konohamaruGpu));
    }
  }

  private validateAetherScaleEnqueuePreflight(
    request: UpscaleRequest
  ): UpscaleRequest {
    if (request.upscaleMode === "h3-native") {
      throw new Error(this.t(uiKeys.serviceChecks.aetherProvider));
    }
    if (request.targetHeight !== undefined || request.targetScale !== undefined || request.dlss5 !== undefined) {
      throw new Error(this.t(uiKeys.serviceChecks.aetherTarget));
    }
    const target = normalizeAetherScaleTarget(request, this.t);
    return {
      ...request,
      upscaleMode: "pixel",
      modelId: AETHERSCALE_MODEL_ID,
      targetHeight: undefined,
      targetScale: undefined,
      dlss5: undefined,
      aetherScale: structuredClone(target.aetherScale),
      tileMode: "auto",
      faceRestore: false
    };
  }

  private async checkAetherScaleEnqueueEnvironment(
    request: UpscaleRequest,
    settings: Settings
  ): Promise<void> {
    if (!isLocalComfyUrl(settings.comfyUrl)) {
      throw new Error(this.t(uiKeys.serviceChecks.aetherLocal));
    }
    const environment = (this.deps.getCachedEnvironmentScanForQueue ?? getCachedEnvironmentScan)(settings);
    if (!environment) {
      this.deps.logger.info("queue", "upscale-enqueue-environment-preflight-deferred", "未阻塞入队：AetherScale 环境检查将在任务准备阶段重新执行", {
        provider: AETHERSCALE_MODEL_ID,
        mode: request.aetherScale?.mode
      });
      return;
    }
    const node = environment.customNodes?.find((candidate) => candidate.id === "comfyui-aetherscale");
    if (!node?.installed || Boolean(node.loadError) || node.compatibilityState === "error" || node.runtimeRepairable ||
        (node.runtimeVerified && !node.loaded)) {
      throw new Error(
        node?.loadError
          ? this.t(uiKeys.serviceChecks.aetherLoad, { detail: node.loadError })
          : this.t(uiKeys.serviceChecks.aetherInstall)
      );
    }
    if (node.runtimeMissingNodeTypes?.length) {
      throw new Error(this.t(uiKeys.serviceChecks.aetherSchema));
    }
    const profile = environment.modelProfiles?.find((candidate) => candidate.id === AETHERSCALE_MODEL_ID);
    if (profile?.runtimeMissingNodes?.length || profile?.available === false) {
      throw new Error(this.t(uiKeys.serviceChecks.aetherSchema));
    }
    const nvidia = environment.items?.find((item) => item.id === "nvidia");
    if (nvidia && nvidia.ok === false && nvidia.status === "missing") {
      throw new Error(this.t(uiKeys.serviceChecks.aetherGpu));
    }
    const runtime = environment.aetherScaleRuntime;
    if (runtime && (!runtime.carrierReady || runtime.state === "missing" || runtime.state === "invalid")) {
      const detail = runtime.error || runtime.missingFiles.join("、") || runtime.incompatibleFiles.join("、");
      throw new Error(this.t(uiKeys.serviceChecks.aetherRuntime, { detail: detail ? this.t(uiKeys.serviceChecks.detailSuffix, { detail: detail }) : "" }));
    }
  }

  private async checkDlss5EnqueueEnvironment(
    request: UpscaleRequest,
    settings: Settings
  ): Promise<void> {
    if (!isLocalComfyUrl(settings.comfyUrl)) return;
    const environment = (this.deps.getCachedEnvironmentScanForQueue ?? getCachedEnvironmentScan)(settings);
    if (!environment) {
      this.deps.logger.info("queue", "upscale-enqueue-environment-preflight-deferred", "未阻塞入队：DLSS5 环境检查将在任务准备阶段重新执行", {
        provider: DLSS5_MODEL_ID,
        targetScale: request.targetScale
      });
      return;
    }
    const customNodes = Array.isArray(environment.customNodes)
      ? environment.customNodes
      : undefined;
    const node = customNodes?.find((candidate) => candidate.id === "comfyui-dlss5");
    if (customNodes && !node) {
      throw new Error(this.t(uiKeys.serviceChecks.dlssInstall));
    }
    if (node && (
      !node.installed ||
      Boolean(node.loadError) ||
      node.runtimeRepairable ||
      node.compatibilityState === "error" ||
      (node.runtimeVerified && !node.loaded)
    )) {
      throw new Error(
        node.loadError
          ? this.t(uiKeys.serviceChecks.dlssLoad, { detail: node.loadError })
          : this.t(uiKeys.serviceChecks.dlssInstall)
      );
    }
    if (node?.runtimeMissingNodeTypes?.length) {
      throw new Error(this.t(uiKeys.serviceChecks.dlssSchema));
    }
    const profile = environment.modelProfiles?.find((candidate) => candidate.id === DLSS5_MODEL_ID);
    if (profile?.runtimeMissingNodes?.length || profile?.available === false) {
      throw new Error(this.t(uiKeys.serviceChecks.dlssSchema));
    }
    const nvidia = environment.items?.find((item) => item.id === "nvidia");
    if (nvidia && nvidia.ok === false && nvidia.status === "missing") {
      throw new Error(this.t(uiKeys.serviceChecks.dlssGpu));
    }
    const runtime = environment.dlss5Runtime;
    const runtimeUnavailable = runtime && (
      runtime.state === "missing" ||
      runtime.state === "invalid" ||
      (runtime.state === "ready" && !runtime.srReady) ||
      (runtime.state === "remote" && runtime.runtimeValidated && !runtime.srReady)
    );
    if (runtimeUnavailable) {
      const detail = runtime.error || runtime.missingFiles.join("、");
      throw new Error(this.t(uiKeys.serviceChecks.dlssRuntime, { detail: detail ? this.t(uiKeys.serviceChecks.detailSuffix, { detail: detail }) : "" }));
    }
    const depth = environment.depthAnything;
    if (depth && !depth.available) {
      const detail = depth.error || depth.missingFiles.join("、");
      throw new Error(this.t(uiKeys.serviceChecks.depthWeights, { detail: detail ? this.t(uiKeys.serviceChecks.detailSuffix, { detail: detail }) : "" }));
    }
  }

  async enqueue(draft: Draft): Promise<AppState> {
    const deps = this.deps;
    const { store, logger, sendState } = deps;
    const enqueueSettings = store.getSettings();
    Object.assign(draft, normalizeVideoDraft(draft));
    const longVideo = isLongVideoDraftActive(draft);
    if (longVideo) {
      const reason = longVideoBlockReason(draft, enqueueSettings);
      if (reason) throw new Error(reason);
    }
    if (draft.inputMode !== "image") throw new Error(this.t(uiKeys.serviceChecks.extensionTask));
    if (!videoModelSupportsDraftInput(draft.modelId, "image")) {
      throw new Error(this.t(uiKeys.serviceChecks.imageUnsupported));
    }
    this.rejectUnavailableH3NativeResolution(draft);
    await this.validateH3Create1080(draft, enqueueSettings);
    const isR2V = isMiniMaxH3R2vModel(draft.modelId);
    const hasReference = Boolean(draft.startImagePath || draft.endImagePath);
    const isH3TextToVideo = isMiniMaxH3Model(draft.modelId) && !isR2V && !hasReference;
    if (!isR2V && !isH3TextToVideo && !draft.startImagePath) throw new Error(this.t(uiKeys.serviceChecks.firstImage));
    if (isR2V && (!draft.h3ReferenceSlots.length || draft.h3ReferenceSlots.some((slot) => !slot.mediaPath))) {
      throw new Error(this.t(uiKeys.serviceChecks.r2vSlots));
    }
    if (!longVideo && !promptOf(draft)) throw new Error(this.t(uiKeys.serviceChecks.promptEmpty));
    if (!draft.workflowPath) throw new Error(this.t(uiKeys.serviceChecks.workflowSelect));
    const resolvedWorkflowPath = h3WorkflowPathForInput(
      draft.workflowPath,
      draft.modelId,
      hasReference
    );
    const safety = generationSafetyForTask({
      ...draft,
      resolution: isH3NativeHighResolution(draft.resolution) ? 720 : draft.resolution
    }, enqueueSettings.uiLocale);
    if (!longVideo && !safety.safe) throw new Error(safety.message);
    if (isMiniMaxH3Q3GgufModel(draft.modelId) && draft.videoLoras.length) {
      throw new Error(this.t(uiKeys.serviceChecks.q3Lora));
    }
    const videoPolicy = resolveVideoGenerationPolicy({
      modelId: draft.modelId,
      inputMode: draft.inputMode,
      spectrumMode: draft.spectrumMode,
      videoLoras: draft.videoLoras,
      locale: enqueueSettings.uiLocale
    });
    const initialH3ExecutionPolicy = resolveH3ExecutionPolicy({
      modelId: draft.modelId,
      inputMode: draft.inputMode,
      attentionMode: enqueueSettings.h3AttentionMode,
      sparseAttentionMode: enqueueSettings.h3SparseAttentionMode,
      runtimeMode: enqueueSettings.h3RuntimeMode,
      comfyCompilerMode: enqueueSettings.h3ComfyCompilerMode,
      spectrumMode: draft.spectrumMode,
      videoLoras: draft.videoLoras,
      h3LivePreview: enqueueSettings.h3LivePreview
    });
    if (isMiniMaxH3Model(draft.modelId) && !initialH3ExecutionPolicy.allowed) {
      throw new Error(this.t(uiKeys.serviceChecks.executionPolicy, { reasons: initialH3ExecutionPolicy.reasons.join("、") }));
    }
    if (draft.spectrumMode === "balanced" && !videoPolicy.spectrum.allowed) {
      throw new Error(isMiniMaxH3Q3GgufModel(draft.modelId)
        ? this.t(uiKeys.serviceChecks.q3Spectrum)
        : this.t(uiKeys.serviceChecks.spectrumUnsupported));
    }
    const workflow = await readWorkflow(resolvedWorkflowPath, this.t(uiKeys.serviceChecks.workflowLabel), this.t);
    const validation = validateApiWorkflow(workflow, enqueueSettings.uiLocale);
    if (!validation.valid) throw new Error(this.t(uiKeys.serviceChecks.workflowInvalid, { errors: validation.errors.join("；") }));
    if ((draft.modelId === FASTH3_OMNI_MODEL_ID || draft.videoLoras.some((lora) =>
      isH3PddLoraId(lora.id) && videoLoraCompatibleWithModel(lora, draft.modelId)
    )) && !workflowSupportsH3PddSampling(workflow, { modelId: draft.modelId })) {
      throw new Error(this.t(uiKeys.serviceChecks.pddWorkflow));
    }
    const h3UsesSageAttention = isMiniMaxH3Model(draft.modelId) &&
      (enqueueSettings.h3AttentionMode === "sage" || enqueueSettings.h3AttentionMode === "sage-triton");
    const dependencyScanRequired = isMiniMaxH3Model(draft.modelId) || draft.videoLoras.length > 0 || draft.spectrumMode === "balanced" ||
      h3UsesSageAttention;
    const dependencyScan = dependencyScanRequired
      ? getCachedEnvironmentScan(enqueueSettings)
      : undefined;
    if (longVideo) {
      const reason = longVideoDependencyBlockReason(dependencyScan, enqueueSettings);
      if (reason) throw new Error(reason);
    }
    if (dependencyScan) {
      const coreBlockReason = modelCoreVersionBlockReason(draft.modelId, dependencyScan.comfyCompatibility.version, enqueueSettings.uiLocale);
      if (coreBlockReason) throw new Error(coreBlockReason);
    }
    if (dependencyScanRequired && !dependencyScan) {
      logger.info("queue", "enqueue-environment-preflight-deferred", "未阻塞入队：环境依赖检查将在任务准备阶段执行", {
        taskType: "generation",
        modelId: draft.modelId
      });
    }
    const h3VideoVaeMode = (isMiniMaxH3Model(draft.modelId) && dependencyScan
      ? resolveH3VideoVaeMode(
          enqueueSettings.h3VideoVaeMode,
          h3VideoVaeAvailabilityFromModelProfiles(dependencyScan?.modelProfiles ?? [])
        )
      : undefined) ?? undefined;
    if (isMiniMaxH3Model(draft.modelId) && dependencyScan && !h3VideoVaeMode) {
      throw new Error(this.t(uiKeys.serviceChecks.videoVae));
    }
    if (draft.videoLoras.length) {
      const issues = videoLoraConfigurationIssues({
        modelId: draft.modelId, inputMode: draft.inputMode,
        spectrumMode: draft.spectrumMode, attentionMode: enqueueSettings.h3AttentionMode,
        videoLoras: draft.videoLoras, h3ReferenceSlots: draft.h3ReferenceSlots
      });
      const blocking = issues.find((issue) => issue.severity === "error");
      if (blocking) throw new Error(blocking.message);
      issues.filter((issue) => issue.severity === "warning").forEach((issue) => {
        logger.warn("queue", "video-lora-compatibility-warning", issue.message, { loraIds: issue.loraIds });
      });
      if (dependencyScan) {
        const missing = draft.videoLoras.find((lora) => {
          const profile = dependencyScan.modelProfiles.find((candidate) => candidate.id === lora.id);
          if (!profile?.available) return true;
          const expected = `loras/${lora.filename}`.replaceAll("\\", "/").toLowerCase();
          return !profile.components.some((component) => component.matches.some((match) => {
            const normalized = match.replaceAll("\\", "/").toLowerCase();
            return normalized === expected || normalized.endsWith(`/${expected}`);
          }));
        });
        if (missing) throw new Error(this.t(uiKeys.serviceChecks.loraFile, { name: missing.name, filename: missing.filename }));
      }
    }
    if (draft.spectrumMode === "balanced" && dependencyScan) {
      const spectrum = dependencyScan?.customNodes.find(
        (node) => node.id === "spectrum-minimax-h3"
      );
      if (!spectrum?.loaded) {
        throw new Error(this.t(uiKeys.serviceChecks.spectrumInstall));
      }
      if (isH3TurboEnabled(draft) && !releaseVersionAtLeast(
        spectrum.version,
        SPECTRUM_TURBO_MINIMUM_VERSION
      )) {
        throw new Error(this.t(uiKeys.serviceChecks.spectrumTurbo, { minimum: SPECTRUM_TURBO_MINIMUM_VERSION, current: spectrum.version ? `v${spectrum.version}` : this.t(uiKeys.serviceChecks.unknownVersion) }));
      }
      if (draft.videoLoras.some((lora) =>
        isH3PddLoraId(lora.id) && videoLoraCompatibleWithModel(lora, draft.modelId)
      ) && !releaseVersionAtLeast(spectrum.version, SPECTRUM_PDD_MINIMUM_VERSION)) {
        throw new Error(this.t(uiKeys.serviceChecks.spectrumPdd, { minimum: SPECTRUM_PDD_MINIMUM_VERSION, current: spectrum.version ? `v${spectrum.version}` : this.t(uiKeys.serviceChecks.unknownVersion) }));
      }
      if (draft.spectrumModelAwareMode !== "off" && !releaseVersionAtLeast(
        spectrum.version,
        SPECTRUM_MODEL_AWARE_MINIMUM_VERSION
      )) {
        throw new Error(this.t(uiKeys.serviceChecks.spectrumAware, { minimum: SPECTRUM_MODEL_AWARE_MINIMUM_VERSION, current: spectrum.version ? `v${spectrum.version}` : this.t(uiKeys.serviceChecks.unknownVersion) }));
      }
    }
    if (h3UsesSageAttention && dependencyScan) {
      const kjNodes = dependencyScan?.customNodes.find((node) => node.id === "kjnodes");
      if (!kjNodes?.installed) {
        throw new Error(this.t(uiKeys.serviceChecks.sageNode));
      }
    }
    if (isH3TurboEnabled(draft) && !workflowSupportsH3TurboSampling(workflow, {
      modelId: draft.modelId,
      videoLoras: draft.videoLoras,
      applySamplingRecipe: true
    })) {
      throw new Error(this.t(uiKeys.serviceChecks.turboWorkflow));
    }
    if (draft.endImagePath && !workflowSupportsEndImage(workflow)) {
      throw new Error(this.t(uiKeys.serviceChecks.endImage));
    }
    const sourcePaths = (isR2V
      ? draft.h3ReferenceSlots.filter((slot) => slot.mediaType === "image").map((slot) => slot.mediaPath)
      : [draft.startImagePath, draft.endImagePath]
    ).filter((candidate): candidate is string => Boolean(candidate.trim()));
    const preparedDraft = structuredClone(draft);
    if (sourcePaths.length) {
      const library = await deps.effectiveImageInputLibraryDirectory(enqueueSettings);
      const operationId = randomUUID().slice(0, 8);
      logger.info("assets", "video-input-image-archive-started", "开始归档视频任务输入图片", { operationId, referenceCount: sourcePaths.length });
      try {
        const archived = await archiveImagePaths(sourcePaths, library, this.t);
        const replacements = new Map(sourcePaths.map((source, index) => [source, archived[index]!]));
        preparedDraft.startImagePath = replacements.get(preparedDraft.startImagePath) ?? preparedDraft.startImagePath;
        preparedDraft.endImagePath = replacements.get(preparedDraft.endImagePath) ?? preparedDraft.endImagePath;
        preparedDraft.h3ReferenceSlots = preparedDraft.h3ReferenceSlots.map((slot) => slot.mediaType === "image"
          ? { ...slot, mediaPath: replacements.get(slot.mediaPath) ?? slot.mediaPath } : slot);
        logger.info("assets", "video-input-image-archive-completed", "视频任务输入图片已归档并校验", {
          operationId, referenceCount: sourcePaths.length, uniqueAssets: new Set(archived).size
        });
      } catch (error) {
        logger.error("assets", "video-input-image-archive-failed", "视频任务输入图片归档失败，任务未加入队列", {
          operationId, error: safeLogErrorMessage(error)
        });
        throw error;
      }
    }
    hydrateVideoInputImageDimensions(preparedDraft, deps.imageInspection);
    const longVideoRoot = longVideo ? path.join(await deps.resolveTaskOutputDirectory(), ".lvs-long-video") : undefined;
    const next = await store.update((state) => {
      const taskDraft = structuredClone(preparedDraft);
      taskDraft.workflowPath = resolvedWorkflowPath;
      const task = queueTaskFromDraft(taskDraft, state, undefined, { h3VideoVaeMode }, this.t);
      if (longVideoRoot) task.longVideoRoot = longVideoRoot;
      if (state.settings.modelDirectories?.length) task.modelDirectories = [...state.settings.modelDirectories];
      state.queue.push(task);
      activateCreationDraft(state, preparedDraft);
    });
    const task = next.queue.at(-1);
    if (task && !isImageGenerationQueueTask(task)) logger.info("queue", "task-enqueued", "Generation task added to queue", {
      taskId: task.id, taskType: task.taskType, modelId: task.modelId, duration: task.duration, fps: task.fps
    });
    sendState(next);
    return next;
  }

  async enqueueImage(draft: ImageEditDraft): Promise<AppState> {
    const deps = this.deps;
    const { store, logger, sendState } = deps;
    const enqueueSettings = store.getSettings();
    if (modelCatalog.get(draft.modelId)?.definition.retired) throw new Error(imageModelUnavailableReason(draft.modelId, createNativeTranslator(enqueueSettings.uiLocale)));
    const requested = normalizeImageEditDraft(draft);
    const adapter = imageModelAdapterFor(requested.modelId);
    const normalized = normalizeImageEditDraft({
      ...requested,
      ...(adapter?.deterministic ? { outputCount: 1 } : {}),
      pictures: imagePicturesForModelInput(requested.pictures, adapter?.supportsTextOnly === true)
    });
    if (!adapter) throw new Error(imageModelUnavailableReason(normalized.modelId, createNativeTranslator(enqueueSettings.uiLocale)));
    const imageLoraError = imageLoraConfigurationError(
      normalized.imageLoras,
      normalized.modelId,
      normalized.pictures.length + (adapter.supportsMarkupReferenceGuide
        ? normalized.pictures.filter((picture) => picture.markup?.objectCount && picture.markup.renderedPath.trim()).length
        : 0),
      createNativeTranslator(enqueueSettings.uiLocale).t
    );
    if (imageLoraError) throw new Error(imageLoraError);
    const hasReference = normalized.pictures.length > 0;
    if (!hasReference && !adapter.supportsTextOnly) {
      throw new Error(this.t(uiKeys.serviceChecks.basePicture));
    }
    if (normalized.pictures.length > adapter.maxPictures) throw new Error(this.t(uiKeys.serviceChecks.maxPictures, { model: adapter.name, count: adapter.maxPictures }));
    if (hasReference) {
      const incomplete = normalized.pictures.find((picture) => !picture.absolutePath);
      if (incomplete) throw new Error(this.t(uiKeys.serviceChecks.emptySlot, { slot: incomplete.pictureNumber, picture: incomplete.pictureNumber }));
    }
    const prompt = adapter.requiresPrompt === false
      ? ""
      : normalized.promptVersions[normalized.activePromptVersion]?.text.trim() ?? "";
    if (adapter.requiresPrompt !== false && !prompt) throw new Error(this.t(uiKeys.serviceChecks.imagePrompt));
    if (adapter.requiresMask && !normalized.pictures[0]?.mask?.regionCount) {
      throw new Error(this.t(uiKeys.serviceChecks.maskRequired));
    }
    const cachedEnvironment = (deps.getCachedEnvironmentScanForQueue ?? getCachedEnvironmentScan)(
      enqueueSettings
    );
    if (!cachedEnvironment) {
      logger.info(
        "queue",
        "image-enqueue-environment-preflight-deferred",
        "未阻塞入队：图片模型与节点检查将在任务执行阶段通过工作流和 /object_info 完成",
        { taskType: "image-generation", modelId: normalized.modelId }
      );
    }
    const diffusionModelFilename = await requireImageModelAssets(
      enqueueSettings,
      normalized.modelId,
      normalized.qualityProfile,
      hasReference,
      cachedEnvironment
    );
    const outputTarget = await resolveImageOutputTarget(enqueueSettings);
    const operationId = randomUUID().slice(0, 8);
    logger.info("assets", "image-input-archive-started", "开始归档图片任务输入素材", { operationId, referenceCount: normalized.pictures.length });
    let archivedPictures: typeof normalized.pictures;
    try {
      archivedPictures = normalized.pictures.length
        ? await archiveImageReferences(
            normalized.pictures,
            await deps.effectiveImageInputLibraryDirectory(enqueueSettings),
            this.t
          )
        : [];
      logger.info("assets", "image-input-archive-completed", "图片任务输入素材已归档并校验", {
        operationId, referenceCount: archivedPictures.length,
        uniqueAssets: new Set(archivedPictures.map((picture) => picture.contentHash).filter(Boolean)).size
      });
    } catch (error) {
      logger.error("assets", "image-input-archive-failed", "图片任务输入素材归档失败，任务未加入队列", {
        operationId, error: safeLogErrorMessage(error)
      });
      throw error;
    }
    let preparedDraft = normalizeImageEditDraft({
      ...normalized,
      ...(adapter.requiresPrompt === false
        ? {
            promptVersions: [{
              id: randomUUID(),
              label: "无需 Prompt",
              text: "",
              createdAt: new Date().toISOString()
            }],
            activePromptVersion: 0
          }
        : {}),
      pictures: archivedPictures.map((picture) => ({
        ...picture,
        ...(picture.crop
          ? { width: picture.crop.width, height: picture.crop.height }
          : readImageDimensions(picture.absolutePath, deps.imageInspection, this.t))
      })),
      outputFormat: "png"
    });
    const lineage = await resolveImageProjectLineage(store.get(), preparedDraft);
    preparedDraft = normalizeImageEditDraft({ ...preparedDraft, projectId: lineage?.projectId, parentVersionId: lineage?.parentVersionId });
    for (const picture of preparedDraft.pictures) {
      if (!(await fs.stat(picture.absolutePath).catch(() => null))?.isFile()) {
        throw new Error(this.t(uiKeys.serviceChecks.pictureMissing, { number: picture.pictureNumber, path: picture.absolutePath }));
      }
      if (picture.crop?.croppedPath?.trim() && !(await fs.stat(picture.crop.croppedPath).catch(() => null))?.isFile()) {
        throw new Error(this.t(uiKeys.serviceChecks.cropMissing, { number: picture.pictureNumber }));
      }
      const markedPath = picture.markup?.renderedPath.trim();
      if (picture.markup?.objectCount && markedPath && !(await fs.stat(markedPath).catch(() => null))?.isFile()) {
        throw new Error(this.t(uiKeys.serviceChecks.markupMissing, { number: picture.pictureNumber }));
      }
      const maskPath = picture.mask?.maskPath.trim();
      if (adapter.requiresMask && (!maskPath || !(await fs.stat(maskPath).catch(() => null))?.isFile())) {
        throw new Error(this.t(uiKeys.serviceChecks.maskMissing, { number: picture.pictureNumber }));
      }
    }
    const preparedPrompt = preparedDraft.promptVersions[preparedDraft.activePromptVersion]?.text.trim() ?? "";
    const compiled = adapter.compilePrompt(preparedPrompt, preparedDraft.pictures, createNativeTranslator(enqueueSettings.uiLocale).t);
    if (compiled.errors.length) throw new Error(compiled.errors.join(" "));
    const task = imageTaskFromDraft(preparedDraft, diffusionModelFilename, outputTarget);
    const next = await store.update((state) => {
      if (state.settings.modelDirectories?.length) task.modelDirectories = [...state.settings.modelDirectories];
      state.queue.push(task);
      state.imageDraft = preparedDraft;
    });
    logger.info("queue", "image-task-enqueued", "Image generation batch added to queue", {
      taskId: task.id, projectId: task.projectId, modelId: task.modelId,
      outputCount: task.outputCount, seedMode: preparedDraft.seed == null ? "random-per-run" : "fixed"
    });
    sendState(next);
    return next;
  }

  async enqueueExtension(draft: Draft): Promise<AppState> {
    const deps = this.deps;
    const { store, logger, sendState } = deps;
    const enqueueSettings = store.getSettings();
    Object.assign(draft, normalizeVideoDraft(draft));
    if (isLongVideoDraftActive(draft)) return enqueueLongVideoExtension(deps, draft);
    if (draft.inputMode !== "video") throw new Error(this.t(uiKeys.serviceChecks.extensionMode));
    if (!videoModelSupportsDraftInput(draft.modelId, "video")) {
      throw new Error(this.t(uiKeys.serviceChecks.extensionUnsupported));
    }
    const loraIssue = videoLoraConfigurationIssues({
      modelId: draft.modelId, inputMode: draft.inputMode, spectrumMode: draft.spectrumMode,
      attentionMode: enqueueSettings.h3AttentionMode, videoLoras: draft.videoLoras,
      h3ReferenceSlots: draft.h3ReferenceSlots
    }).find((issue) => issue.severity === "error");
    if (loraIssue) throw new Error(loraIssue.message);
    this.rejectUnavailableH3NativeResolution(draft);
    const initialH3ExecutionPolicy = resolveH3ExecutionPolicy({
      modelId: draft.modelId,
      inputMode: draft.inputMode,
      attentionMode: enqueueSettings.h3AttentionMode,
      sparseAttentionMode: enqueueSettings.h3SparseAttentionMode,
      runtimeMode: enqueueSettings.h3RuntimeMode,
      comfyCompilerMode: enqueueSettings.h3ComfyCompilerMode,
      spectrumMode: draft.spectrumMode,
      videoLoras: draft.videoLoras,
      h3LivePreview: enqueueSettings.h3LivePreview
    });
    if (isMiniMaxH3Model(draft.modelId) && !initialH3ExecutionPolicy.allowed) {
      throw new Error(this.t(uiKeys.serviceChecks.executionPolicy, { reasons: initialH3ExecutionPolicy.reasons.join("、") }));
    }
    if (!promptOf(draft)) throw new Error(this.t(uiKeys.serviceChecks.promptEmpty));
    const extensionWorkflowPath = await extensionWorkflowPathForDraft(draft);
    if (!extensionWorkflowPath) throw new Error(this.t(uiKeys.serviceChecks.extensionWorkflow));
    if (!(await fs.stat(draft.sourceVideoPath).catch(() => null))) throw new Error(this.t(uiKeys.serviceChecks.extensionSource));
    const dependencyScanRequired = isMiniMaxH3Model(draft.modelId);
    const dependencyScan = dependencyScanRequired
      ? getCachedEnvironmentScan(enqueueSettings)
      : undefined;
    if (dependencyScanRequired && !dependencyScan) {
      logger.info("queue", "enqueue-environment-preflight-deferred", "未阻塞入队：环境依赖检查将在任务准备阶段执行", {
        taskType: "extension",
        modelId: draft.modelId
      });
    }
    const h3VideoVaeMode = (isMiniMaxH3Model(draft.modelId) && dependencyScan
      ? resolveH3VideoVaeMode(
          enqueueSettings.h3VideoVaeMode,
          h3VideoVaeAvailabilityFromModelProfiles(dependencyScan?.modelProfiles ?? [])
        )
      : undefined) ?? undefined;
    if (isMiniMaxH3Model(draft.modelId) && dependencyScan && !h3VideoVaeMode) {
      throw new Error(this.t(uiKeys.serviceChecks.videoVae));
    }
    const motionContext = isMiniMaxH3R2vModel(draft.modelId);
    const continuum = isMiniMaxH3ContinuumModel(draft.modelId);
    const preparedDraft = structuredClone({
      ...draft,
      workflowPath: extensionWorkflowPath
    });
    if (motionContext && preparedDraft.h3MotionContextAsset) {
      const adapted = adaptH3AvAsset(
        preparedDraft.h3MotionContextAsset, "motion-context", createNativeTranslator(enqueueSettings.uiLocale).t
      );
      const ownerPath = adapted.payloadPath.absolutePath ??
        path.resolve(enqueueSettings.outputDirectory, adapted.payloadPath.subfolder, adapted.payloadPath.filename);
      const selectedPath = preparedDraft.h3ContextLatentPath?.trim();
      const assetPaths = [
        ownerPath,
        ...(preparedDraft.h3MotionContextAsset.aliasPaths ?? [])
          .map((candidate) => candidate.absolutePath)
          .filter((candidate): candidate is string => Boolean(candidate))
      ].map((candidate) => path.resolve(candidate).toLowerCase());
      if (selectedPath && assetPaths.includes(path.resolve(selectedPath).toLowerCase())) {
        preparedDraft.h3ContextLatentPath = ownerPath;
      } else {
        // A cleared or manually selected path is authoritative. Never let a
        // stale typed asset silently resurrect or replace that user choice.
        preparedDraft.h3MotionContextAsset = undefined;
      }
    }
    const managedContinuum = continuum && h3ContinuumModeForSource(preparedDraft) === "managed";
    if (managedContinuum) {
      preparedDraft.h3ContinuumMode = "managed";
      preparedDraft.workflowPath = h3ContinuumManagedWorkflowPathForInput(preparedDraft.workflowPath);
      let sequence = preparedDraft.h3ContinuumSequence;
      if (sequence && managedSequenceNeedsFreshRun(store.get(), sequence)) {
        logger.info("queue", "continuum-managed-fresh-run", "上一次首个 managed Continuum 任务未被 History 接受，创建新的 Run Storage identity", {
          previousSequenceId: sequence.sequenceId,
          previousRunName: sequence.runName
        });
        sequence = undefined;
      }
      if (sequence) {
        const t = createNativeTranslator(enqueueSettings.uiLocale).t;
        const sequenceError = validateContinuumSequence(sequence, t);
        if (sequenceError) throw new Error(t(uiKeys.sequenceValidation.invalid, { reason: sequenceError }));
        if (sequence.fps !== 24 || sequence.chunkSeconds <= 0) {
          throw new Error(t(uiKeys.sequenceValidation.frozenSampling));
        }
      } else {
        const sequenceId = randomUUID();
        const sourceRatio = preparedDraft.sourceWidth > 0 && preparedDraft.sourceHeight > 0
          ? preparedDraft.sourceWidth / preparedDraft.sourceHeight
          : 16 / 9;
        const shortEdge = preparedDraft.resolution;
        const width = Math.max(32, Math.round((sourceRatio >= 1 ? shortEdge * sourceRatio : shortEdge) / 32) * 32);
        const height = Math.max(32, Math.round((sourceRatio >= 1 ? shortEdge : shortEdge / sourceRatio) / 32) * 32);
        sequence = {
          schemaVersion: 1,
          sequenceId,
          projectId: `lvs-${sequenceId.slice(0, 12)}`,
          runName: `lvs-${sequenceId.slice(0, 12)}`,
          packageVersion: H3_CONTINUUM_RECOMMENDED_VERSION,
          runStorageSchemaVersion: 3,
          workflowRevision: "managed-v38-api-v1",
          status: "in-progress",
          chunkSeconds: preparedDraft.duration,
          fps: 24,
          width,
          height,
          baseSeed: preparedDraft.seed ?? Math.floor(Math.random() * 0xffffffff),
          modelIdentity: preparedDraft.modelId,
          firstFrameSource: {
            sourceVideoPath: preparedDraft.sourceVideoPath,
            sourceVideoDuration: preparedDraft.sourceVideoDuration,
            trimStartSeconds: preparedDraft.trimStartSeconds,
            trimEndSeconds: preparedDraft.trimEndSeconds,
            sourceWidth: preparedDraft.sourceWidth,
            sourceHeight: preparedDraft.sourceHeight,
            resolution: preparedDraft.resolution
          },
          promptFormat: "Timeline",
          targetChunks: 1,
          acceptedChunks: 0,
          canonicalHead: { revisionId: "pending" },
          chunks: [],
          updatedAt: new Date().toISOString()
        } satisfies ContinuumSequence;
      }
      preparedDraft.h3ContinuumSequence = sequence;
      // Keep the user's seed preference in the creation draft. The managed
      // sequence's frozen base seed belongs to the queued execution snapshot,
      // not to the UI field; an empty field must remain "random" after enqueue.
      if (preparedDraft.seed !== null && preparedDraft.seed !== undefined) {
        preparedDraft.seed = sequence.baseSeed;
      }
      preparedDraft.duration = sequence.chunkSeconds;
      preparedDraft.fps = 24;
    } else if (continuum) {
      preparedDraft.h3ContinuumMode = "bootstrap";
      preparedDraft.h3ContinuumSequence = undefined;
      preparedDraft.workflowPath = h3ContinuumWorkflowPathForInput(preparedDraft.workflowPath);
    }
    if (motionContext) {
      preparedDraft.h3ReferenceSlots = ensureMotionContextSourceSlot(
        preparedDraft.h3ReferenceSlots,
        preparedDraft.sourceVideoPath
      );
      const counts = h3ReferenceSlotCounts(preparedDraft.h3ReferenceSlots);
      if (counts.imageCount > 9 || counts.videoCount > 3 || counts.total > 12) {
        throw new Error(this.t(uiKeys.serviceChecks.motionLimits));
      }
      if (!preparedDraft.h3ReferenceSlots.every((slot) => slot.mediaPath.trim())) {
        throw new Error(this.t(uiKeys.serviceChecks.motionSlots));
      }
    }
    if (continuum && !managedContinuum) {
      // Continuum consumes a JointAV boundary for the complete source latent;
      // never let a stale boundary-frame trim leak into its immutable task.
      preparedDraft.trimStartSeconds = 0;
      preparedDraft.trimEndSeconds = preparedDraft.sourceVideoDuration;
      const outputDirectory = await deps.resolveTaskOutputDirectory();
      const artifactPath = preparedDraft.h3ContinuumArtifact
        ? path.join(
            outputDirectory,
            preparedDraft.h3ContinuumArtifact.payload.subfolder,
            preparedDraft.h3ContinuumArtifact.payload.filename
          )
        : preparedDraft.h3ContinuumArtifactPath?.trim() || "";
      if (!artifactPath) {
        throw new Error(this.t(uiKeys.serviceChecks.continuumArtifact));
      }
      if (!deps.inspectNativeAvArtifact) {
        throw new Error(this.t(uiKeys.serviceChecks.artifactService));
      }
      const inspection = await deps.inspectNativeAvArtifact(artifactPath, outputDirectory);
      const artifact = inspection.status === "available" ? inspection.artifact : undefined;
      if (!artifact) {
        throw new Error(this.t(uiKeys.serviceChecks.artifactInvalid, { detail: inspection.reason ?? this.t(uiKeys.serviceChecks.artifactFallback) }));
      }
      const assets = miniMaxH3ModelAssetNames(draft.modelId);
      if (
        artifact.modelFamily !== "minimax-h3" ||
        !assets ||
        artifact.diffusionModelFilename !== assets.diffusionModel
      ) {
        throw new Error(this.t(uiKeys.serviceChecks.artifactWeights));
      }
      if (
        preparedDraft.sourceWidth > 0 && preparedDraft.sourceHeight > 0 &&
        (artifact.width !== preparedDraft.sourceWidth || artifact.height !== preparedDraft.sourceHeight)
      ) {
        throw new Error(this.t(uiKeys.serviceChecks.artifactResolution, { width: artifact.width, height: artifact.height, sourceWidth: preparedDraft.sourceWidth, sourceHeight: preparedDraft.sourceHeight }));
      }
      preparedDraft.h3ContinuumArtifactPath = inspection.payloadPath ?? artifact.payload.absolutePath;
      preparedDraft.h3ContinuumArtifact = artifact;
    }
    const workflow = await readWorkflow(preparedDraft.workflowPath, this.t(uiKeys.serviceChecks.extensionLabel), this.t);
    const validation = validateApiWorkflow(workflow, enqueueSettings.uiLocale);
    if (!validation.valid) throw new Error(this.t(uiKeys.serviceChecks.workflowInvalid, { errors: validation.errors.join("；") }));
    const safetyErrors = isMiniMaxH3Fl2vaModel(draft.modelId)
      ? workflowSupportsH3BoundaryExtension(workflow) ? [] : [this.t(uiKeys.serviceChecks.boundaryWorkflow)]
      : continuum
        ? managedContinuum
          ? workflowSupportsH3ContinuumManagedExtension(workflow) ? [] : [this.t(uiKeys.serviceChecks.managedWorkflow)]
          : workflowSupportsH3ContinuumExtension(workflow) ? [] : [this.t(uiKeys.serviceChecks.bootstrapWorkflow)]
      : isMiniMaxH3R2vModel(draft.modelId)
        ? workflowSupportsH3MotionContextExtension(workflow) ? [] : [this.t(uiKeys.serviceChecks.motionWorkflow)]
        : extensionWorkflowSafetyErrors(workflow, enqueueSettings.uiLocale);
    if (safetyErrors.length) throw new Error(this.t(uiKeys.serviceChecks.extensionSafety, { errors: safetyErrors.join("；") }));
    if (motionContext) {
      const imageCount = preparedDraft.h3ReferenceSlots.filter((slot) => slot.mediaType === "image").length;
      const extraVideoCount = Math.max(0, preparedDraft.h3ReferenceSlots.filter((slot) => slot.mediaType === "video").length - 1);
      if (!workflowSupportsH3MotionContextReferences(workflow, imageCount, extraVideoCount)) {
        throw new Error(this.t(uiKeys.serviceChecks.motionInputs));
      }
    }
    if (motionContext) {
      const imagePaths = preparedDraft.h3ReferenceSlots
        .filter((slot) => slot.mediaType === "image")
        .map((slot) => slot.mediaPath)
        .filter(Boolean);
      if (imagePaths.length) {
        const library = await deps.effectiveImageInputLibraryDirectory(enqueueSettings);
        const operationId = randomUUID().slice(0, 8);
        logger.info("assets", "extension-input-image-archive-started", "开始归档续写任务参考图片", {
          operationId,
          referenceCount: imagePaths.length
        });
        try {
          const archived = await archiveImagePaths(imagePaths, library, this.t);
          const replacements = new Map(imagePaths.map((source, index) => [source, archived[index]!])) as Map<string, string>;
          preparedDraft.h3ReferenceSlots = preparedDraft.h3ReferenceSlots.map((slot) =>
            slot.mediaType === "image"
              ? { ...slot, mediaPath: replacements.get(slot.mediaPath) ?? slot.mediaPath }
              : slot
          );
          logger.info("assets", "extension-input-image-archive-completed", "续写任务参考图片已归档并校验", {
            operationId,
            referenceCount: imagePaths.length,
            uniqueAssets: new Set(archived).size
          });
        } catch (error) {
          logger.error("assets", "extension-input-image-archive-failed", "续写任务参考图片归档失败，任务未加入队列", {
            operationId,
            error: safeLogErrorMessage(error)
          });
          throw error;
        }
      }
    }
    hydrateVideoInputImageDimensions(preparedDraft, deps.imageInspection);
    const current = store.get();
    const taskDraft = managedContinuum && preparedDraft.h3ContinuumSequence
      ? { ...preparedDraft, seed: preparedDraft.h3ContinuumSequence.baseSeed }
      : preparedDraft;
    const task = extensionTaskFromDraft(taskDraft, current, undefined, { h3VideoVaeMode }, this.t);
    if (managedContinuum) {
      const sequence = preparedDraft.h3ContinuumSequence!;
      task.h3ContinuumMode = "managed";
      task.h3ContinuumSequence = structuredClone(sequence);
      const reviewAction = preparedDraft.h3ContinuumReviewAction ?? "Continue / Next";
      if (reviewAction === "Regenerate Current" && sequence.acceptedChunks < 1) {
        throw new Error(this.t(uiKeys.serviceChecks.managedFirst));
      }
      task.h3ContinuumTargetChunks = reviewAction === "Regenerate Current"
        ? sequence.acceptedChunks
        : sequence.acceptedChunks + 1;
      task.h3ContinuumReviewAction = reviewAction;
      task.h3ContinuumParentRevisionId = sequence.canonicalHead.revisionId;
      task.h3ContinuumParentTakeId = sequence.canonicalHead.takeId;
      task.h3ContinuumParentBranchId = sequence.canonicalHead.branchId;
      task.h3ContinuumRerollFromChunk = reviewAction === "Regenerate Current"
        ? 0
        : preparedDraft.h3ContinuumRerollFromChunk ?? 0;
      task.h3ContinuumTakeGroup = preparedDraft.h3ContinuumTakeGroup ?? 0;
      task.h3ContinuumTakeRevisionId = preparedDraft.h3ContinuumTakeRevisionId ?? "";
      task.h3ContinuumTakeAction = preparedDraft.h3ContinuumTakeAction ?? "Automatic";
      if (task.h3ContinuumTakeAction !== "Automatic" &&
          (!(task.h3ContinuumTakeGroup > 0) || !task.h3ContinuumTakeRevisionId)) {
        throw new Error(this.t(uiKeys.serviceChecks.managedPhysical));
      }
      continuumTimelinePromptForTask(task, sequence.chunkSeconds, enqueueSettings.uiLocale);
      if (sequence.acceptedChunks > 0) {
        if (!deps.inspectExtensionSource) throw new Error(this.t(uiKeys.serviceChecks.runService));
        const inspection = await deps.inspectExtensionSource(preparedDraft);
        if (inspection.status !== "available") throw new Error(inspection.reason ?? this.t(uiKeys.serviceChecks.runPrefix));
      }
    }
    if (isMiniMaxH3R2vModel(task.modelId)) {
      if (
        task.h3AvOutputPolicy !== "shared" &&
        h3LatentSaveModeSavesMotionContext(h3LatentSaveModeFor(task, true))
      ) {
        const outputDirectory = await deps.resolveTaskOutputDirectory();
        task.h3ContextSavePrefix = h3MotionContextSavePrefixForTask(task.id);
        task.h3ContextSavedPath = outputDirectory
          ? path.join(outputDirectory, H3_MOTION_CONTEXT_SUBFOLDER, task.id, H3_MOTION_CONTEXT_FILENAME)
          : undefined;
      }
      const contextPath = preparedDraft.h3ContextLatentPath?.trim();
      const contextFile = contextPath
        ? await fs.stat(contextPath).catch(() => undefined)
        : undefined;
      if (
        contextPath &&
        contextFile?.isFile() &&
        Math.abs(preparedDraft.trimEndSeconds - preparedDraft.sourceVideoDuration) >= 0.05
      ) {
        throw new Error(this.t(uiKeys.serviceChecks.latentEndpoint));
      }
      if (contextPath && !contextFile?.isFile()) {
        throw new Error(this.t(uiKeys.serviceChecks.latentMissing));
      }
      if (contextPath && contextFile?.isFile()) {
        const latestContextFile = await fs.stat(contextPath).catch(() => undefined);
        if (!latestContextFile?.isFile() ||
            latestContextFile.size !== contextFile.size ||
            latestContextFile.mtimeMs !== contextFile.mtimeMs) {
          throw new Error(this.t(uiKeys.serviceChecks.latentChanged));
        }
        if (!deps.inspectExtensionSource) {
          throw new Error(this.t(uiKeys.serviceChecks.latentService));
        }
        const motionInspection = await deps.inspectExtensionSource(preparedDraft);
        if (motionInspection.route !== "motion-context" || motionInspection.status !== "available") {
          throw new Error(motionInspection.reason ?? this.t(uiKeys.serviceChecks.latentInvalid));
        }
      }
      task.h3ContextLatentPath = contextPath &&
        contextFile?.isFile() &&
        Math.abs(preparedDraft.trimEndSeconds - preparedDraft.sourceVideoDuration) < 0.05
        ? contextPath : undefined;
    }
    const safety = extensionSafetyForTask(task, current.settings.uiLocale);
    if (!safety.safe) throw new Error(safety.message);
    const next = await store.update((state) => {
      if (state.settings.modelDirectories?.length) task.modelDirectories = [...state.settings.modelDirectories];
      state.queue.push(task);
      activateCreationDraft(state, preparedDraft);
    });
    logger.info("queue", "task-enqueued", "Extension task added to queue", {
      taskId: task.id, taskType: task.taskType, modelId: task.modelId, duration: task.duration, fps: task.fps
    });
    sendState(next);
    return next;
  }

  async enqueueUpscale(request: UpscaleRequest): Promise<AppState> {
    const deps = this.deps;
    const { store, logger, sendState } = deps;
    const current = store.get();
    const asset = current.history.find((item) => item.id === request.sourceAssetId);
    const version = asset?.versions.find((item) => item.id === request.sourceVersionId);
    if (!asset || !version) throw new Error(this.t(uiKeys.serviceChecks.sourceVersion));
    if (!request.sourceFilePath || !(await fs.stat(request.sourceFilePath).catch(() => null))) {
      throw new Error(this.t(uiKeys.serviceChecks.upscaleSource));
    }
    const isKonohamaru = request.modelId === KONOHAMARU_MODEL_ID || request.konohamaru !== undefined;
    const isAetherScale = !isKonohamaru && (request.modelId === AETHERSCALE_MODEL_ID || request.aetherScale !== undefined);
    const isDlss5 = !isKonohamaru && !isAetherScale && (request.modelId === DLSS5_MODEL_ID ||
      request.targetScale !== undefined || request.dlss5 !== undefined);
    let preparedRequest = request;
    let tesseraAnchor: TesseraAnchorSnapshot | undefined;
    if (request.modelId === H3_REFINER_ID || request.modelId === TESSERA_ID) {
      if (request.upscaleMode === "h3-native") throw new Error(this.t(uiKeys.serviceChecks.refinerTask));
      const source = version.files.find(file => file.absolutePath && path.resolve(file.absolutePath) === path.resolve(request.sourceFilePath));
      if (!source || !/\.(mp4|webm|mov|mkv|m4v)$/i.test(source.filename)) throw new Error(this.t(uiKeys.serviceChecks.refinerInput));
      validateH3RefinerSource(version.duration, version.fps, this.t);
      preparedRequest = { ...request, upscaleMode: "pixel", sourceWidth: version.width, sourceHeight: version.height,
        duration: version.duration, fps: version.fps, sourceFilename: version.outputFilename,
        targetScale: undefined, dlss5: undefined, aetherScale: undefined, konohamaru: undefined, h3NativeInput: undefined };
      const environment = (deps.getCachedEnvironmentScanForQueue ?? getCachedEnvironmentScan)(current.settings);
      const profile = environment?.modelProfiles.find(item => item.id === request.modelId);
      if (environment && (!profile?.available || profile.missingCustomNodeNames?.length || profile.customNodeCompatibility === "error")) {
        throw new Error(this.t(uiKeys.serviceChecks.refinerReady));
      }
      if (request.modelId === TESSERA_ID) {
        if (!environment || !profile?.available) throw new Error(this.t(uiKeys.serviceChecks.tesseraReady));
        if (request.tesseraAnchor?.enabled) {
          tesseraAnchor = tesseraAnchorModels(environment).find(m => m.modelId === request.tesseraAnchor?.modelId);
          if (!tesseraAnchor) throw new Error(this.t(uiKeys.serviceChecks.anchorReady));
        }
        preparedRequest = { ...preparedRequest, tesseraAnchor: undefined };
      }
    }
    if (isKonohamaru) {
      preparedRequest = this.validateKonohamaruEnqueuePreflight(request);
      await this.checkKonohamaruEnqueueEnvironment(preparedRequest, current.settings);
    } else if (isAetherScale) {
      preparedRequest = this.validateAetherScaleEnqueuePreflight(request);
      await this.checkAetherScaleEnqueueEnvironment(preparedRequest, current.settings);
    } else if (isDlss5) {
      preparedRequest = this.validateDlss5EnqueuePreflight(request);
      await this.checkDlss5EnqueueEnvironment(preparedRequest, current.settings);
    }
    if (request.upscaleMode === "h3-native") {
      if (
        request.targetHeight !== 720 &&
        request.targetHeight !== 768 &&
        request.targetHeight !== 1080 &&
        request.targetHeight !== 1440
      ) {
        throw new Error(this.t(uiKeys.serviceChecks.nativeTargets));
      }
      const artifact = version.h3ContinuationData?.status === "available"
        ? version.h3ContinuationData.artifact
        : undefined;
      if (!artifact) throw new Error(this.t(uiKeys.serviceChecks.jointAvMissing));
      if (!isMiniMaxH3Fl2vaModel(artifact.executionModelId) || artifact.contextFrames !== 0) {
        throw new Error(this.t(uiKeys.serviceChecks.jointAvClean));
      }
      if (artifact.width !== version.width || artifact.height !== version.height) {
        throw new Error(this.t(uiKeys.serviceChecks.jointAvSize));
      }
      const [payloadStat, manifestStat] = await Promise.all([
        artifact.payload.absolutePath
          ? fs.stat(artifact.payload.absolutePath).catch(() => null)
          : Promise.resolve(null),
        artifact.manifest.absolutePath
          ? fs.stat(artifact.manifest.absolutePath).catch(() => null)
          : Promise.resolve(null)
      ]);
      if (!payloadStat?.isFile() || !manifestStat?.isFile()) {
        throw new Error(this.t(uiKeys.serviceChecks.jointAvFiles));
      }
      for (const [label, filename] of [
        [this.t(uiKeys.serviceChecks.firstFrame), asset.startImagePath],
        [this.t(uiKeys.serviceChecks.lastFrame), asset.endImagePath]
      ] as const) {
        if (filename && !(await fs.stat(filename).catch(() => null))?.isFile()) {
          throw new Error(this.t(uiKeys.serviceChecks.conditioningFile, { label: label }));
        }
      }
      const h3VideoVaeMode = version.h3VideoVaeMode ?? asset.h3VideoVaeMode ??
        (artifact.videoVaeFilename.toLowerCase().includes("int8") ? "int8-convrot" : "fp16");
      const videoLoras = version.videoLoras ?? asset.videoLoras ?? [];
      const provider = request.targetHeight >= 1080 ? "learned-3d" : "bilinear";
      if (provider === "learned-3d") {
        const environment = (deps.getCachedEnvironmentScanForQueue ?? getCachedEnvironmentScan)(
          current.settings
        );
        const learnedProfile = environment?.modelProfiles.find(
          (profile) => profile.id === "minimax_h3_latent_upscaler"
        );
        if (!environment) {
          logger.info(
            "queue",
            "upscale-enqueue-environment-preflight-deferred",
            "未阻塞入队：H3 Learned 3D 依赖检查将在任务准备阶段执行",
            { taskType: "upscale", provider, targetHeight: request.targetHeight }
          );
        } else if (!learnedProfile?.integrated) {
          throw new Error(this.t(uiKeys.serviceChecks.learnedUnsupported));
        } else if (!learnedProfile.available) {
          const missing = learnedProfile.components
            .filter((component) => !component.found)
            .map((component) => component.expected)
            .join("、");
          throw new Error(this.t(uiKeys.serviceChecks.learnedWeights, { detail: missing ? this.t(uiKeys.serviceChecks.missingDetail, { detail: missing }) : "" }));
        } else if (learnedProfile.missingCustomNodeNames?.length) {
          throw new Error(
            this.t(uiKeys.serviceChecks.learnedNodes, { nodes: learnedProfile.missingCustomNodeNames.join("、") }) +
            this.t(uiKeys.serviceChecks.installNodes)
          );
        } else if (learnedProfile.customNodeCompatibility === "error") {
          throw new Error(this.t(uiKeys.serviceChecks.learnedVersion));
        }
        if (environment && request.targetHeight === 1440) {
          const mmh3Node = environment.customNodes.find(
            (node) => node.id === "mmh3-ultimate-upscale"
          );
          if (!mmh3Node?.installed) {
            throw new Error(
              this.t(uiKeys.serviceChecks.ultimateRequired) +
              this.t(uiKeys.serviceChecks.ultimateInstall)
            );
          }
          if (mmh3Node.compatibilityState === "error") {
            throw new Error(
              this.t(uiKeys.serviceChecks.ultimateVersion) +
              this.t(uiKeys.serviceChecks.ultimateRepair)
            );
          }
        }
      }
      preparedRequest = {
        ...request,
        modelId: artifact.executionModelId,
        sourceWidth: artifact.width,
        sourceHeight: artifact.height,
        duration: artifact.frameCount / artifact.fps,
        fps: artifact.fps,
        h3NativeInput: {
          provider,
          artifact: structuredClone(artifact),
          workflowPath: fileURLToPath(new URL(
            request.targetHeight === 1440
              ? "../workflows/minimax_h3_fl2va_ultimate_tiled_second_sample_av_api.json"
              : provider === "learned-3d"
              ? "../workflows/minimax_h3_fl2va_learned_3d_second_sample_av_api.json"
              : "../workflows/minimax_h3_fl2va_second_sample_av_api.json",
            import.meta.url
          )),
          ...(provider === "learned-3d"
            ? { learnedModelFilename: "minimax_h3_latent_upscaler_3d_bf16.safetensors" }
            : {}),
          prompt: asset.prompt,
          startImagePath: asset.startImagePath ?? "",
          endImagePath: asset.endImagePath ?? "",
          scaleBy: request.targetHeight / Math.min(artifact.width, artifact.height),
          h3VideoVaeMode,
          attentionMode: version.attentionMode ?? asset.attentionMode ?? current.settings.h3AttentionMode,
          h3SparseAttentionMode: current.settings.h3SparseAttentionMode,
          h3RuntimeMode: current.settings.h3RuntimeMode,
          h3ComfyCompilerMode: current.settings.h3ComfyCompilerMode,
          steps: normalizeH3Steps(version.steps ?? asset.steps, artifact.executionModelId, videoLoras),
          videoLoras: videoLoras.map((lora) => ({ ...lora }))
        }
      };
    }
    const next = await store.update((state) => {
      const task = upscaleTaskFromRequest(preparedRequest, state, undefined, this.t);
      if (task.tessera && tesseraAnchor) task.tessera.anchor = structuredClone(tesseraAnchor);
      if (state.settings.modelDirectories?.length) task.modelDirectories = [...state.settings.modelDirectories];
      state.queue.push(task);
    });
    const task = next.queue.at(-1);
    if (task?.taskType === "upscale") logger.info("queue", "task-enqueued", "Upscale task added to queue", {
      taskId: task.id, taskType: task.taskType, modelId: task.modelId,
      sourceWidth: task.sourceWidth, sourceHeight: task.sourceHeight,
      targetWidth: task.targetWidth, targetHeight: task.targetHeight,
      duration: task.duration, fps: task.fps
    });
    sendState(next);
    return next;
  }
}

export function registerQueueEnqueueIpc(deps: QueueEnqueueIpcDependencies): void {
  const service = "service" in deps
    ? deps.service
    : new QueueEnqueueService(deps);
  const { ipc } = deps;
  ipc.handle("queue:enqueue", async (_event, draft: Draft) => service.enqueue(draft));
  ipc.handle("queue:enqueue-image", async (_event, draft: ImageEditDraft) => service.enqueueImage(draft));
  ipc.handle("queue:enqueue-extension", async (_event, draft: Draft) => service.enqueueExtension(draft));
  ipc.handle("queue:enqueue-upscale", async (_event, request: UpscaleRequest) => service.enqueueUpscale(request));
}
