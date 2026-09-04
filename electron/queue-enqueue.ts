import type { IpcMain } from "electron";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AppState,
  Draft,
  EnvironmentScanResult,
  ImageEditDraft,
  NativeAvArtifactInspection,
  Settings,
  UpscaleRequest
} from "../src/types.js";
import { isImageGenerationQueueTask } from "../src/core/queue.js";
import { activateCreationDraft } from "../src/core/creation-drafts.js";
import { findImageProjectLineage, normalizeImageEditDraft } from "../src/core/image-project.js";
import {
  imageLightningComponentFound,
  imageModelAdapterFor,
  imageQualityProfileRequiresLightning
} from "../src/core/image-workflow.js";
import {
  extensionSafetyForTask,
  extensionWorkflowSafetyErrors,
  generationSafetyForTask,
  isMiniMaxH3ContinuumModel,
  isMiniMaxH3Fl2vaModel,
  isMiniMaxH3Model,
  isMiniMaxH3Q3GgufModel,
  isMiniMaxH3R2vModel,
  h3WorkflowPathForInput,
  normalizeH3Steps,
  validateApiWorkflow,
  workflowSupportsEndImage,
  workflowSupportsH3BoundaryExtension,
  workflowSupportsH3ContinuumExtension,
  workflowSupportsH3MotionContextExtension,
  workflowSupportsH3MotionContextReferences,
  workflowSupportsH3TurboSampling,
  miniMaxH3ModelAssetNames
} from "../src/core/workflow.js";
import { normalizeVideoDraft, videoModelSupportsDraftInput } from "../src/core/video-draft-normalization.js";
import {
  isH3SlaTurboLoraId,
  isH3TurboEnabled,
  normalizeVideoLoras,
  videoLoraCompatibleWithModel,
  videoLoraConfigurationIssues
} from "../src/core/video-loras.js";
import {
  SPECTRUM_MODEL_AWARE_MINIMUM_VERSION,
  SPECTRUM_TURBO_MINIMUM_VERSION
} from "../src/core/catalog/index.js";
import { resolveVideoGenerationPolicy } from "../src/core/video-policy.js";
import {
  normalizeH3MemoryOptions,
  resolveMiniMaxH3ExecutionPlan
} from "../src/core/h3-memory-policy.js";
import {
  h3VideoVaeAvailabilityFromModelProfiles,
  resolveH3VideoVaeMode
} from "../src/core/h3-video-vae.js";
import {
  AETHERSCALE_MODEL_ID,
  normalizeAetherScaleTarget
} from "../src/core/aetherscale.js";
import {
  DLSS5_MODEL_ID,
  normalizeUpscaleTarget
} from "../src/core/dlss5.js";
import {
  ensureMotionContextSourceSlot,
  h3ReferenceSlotCounts
} from "../src/core/h3-reference.js";
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
}

export type QueueEnqueueDependencies = QueueEnqueueServiceDependencies & { ipc: IpcMain };
export type QueueEnqueueIpcDependencies =
  | QueueEnqueueDependencies
  | { ipc: IpcMain; service: QueueEnqueueService };

async function readWorkflow(filename: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(filename, "utf8"));
  } catch (error) {
    throw new Error(`无法读取${label} JSON：${error instanceof Error ? error.message : String(error)}`);
  }
}

async function resolveImageProjectLineage(
  state: AppState,
  draft: ImageEditDraft
): Promise<{ projectId: string; parentVersionId?: string } | undefined> {
  const basePicture = draft.pictures[0];
  if (!basePicture?.absolutePath || !basePicture.contentHash) return undefined;
  const known = findImageProjectLineage(state.imageHistory, basePicture);
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
  const detectedRoot = await resolveComfyOutputDirectory(settings);
  const rootCandidate = detectedRoot || settings.outputDirectory.trim();
  if (!rootCandidate) throw new Error("无法确定 ComfyUI output 目录，无法准备图片输出目录。");
  const root = path.resolve(rootCandidate);
  const directory = path.resolve(settings.imageOutputDirectory.trim() || path.join(root, "Images"));
  if (!isPathWithinDirectory(root, directory)) {
    throw new Error("图片输出目录必须位于当前 ComfyUI output 目录内。");
  }
  await fs.mkdir(directory, { recursive: true });
  return { root, directory, subfolder: path.relative(root, directory).replaceAll(path.sep, "/") };
}

function readImageDimensions(
  filename: string,
  imageInspection: ImageInspectionPort
): { width: number; height: number } {
  const size = imageInspection.readDimensions(filename);
  if (!size.width || !size.height) throw new Error(`无法读取 Picture 图片尺寸：${filename}`);
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
  const adapter = imageModelAdapterFor(modelId);
  const scan = cachedScan;
  if (!scan) return undefined;
  const profile = scan.modelProfiles.find((item) => item.id === modelId);
  if (!adapter || profile?.category !== "image" || !profile.integrated) {
    throw new Error(`当前没有 ${modelId} 的可用图片工作流适配器。`);
  }
  if (!profile.available) {
    const missing = profile.components.filter((component) => !component.found)
      .map((component) => component.expected).join("、");
    throw new Error(`${adapter.name} 组件尚未完整${missing ? `，缺少：${missing}` : ""}。请确认设置已保存后重新扫描。`);
  }
  if (profile.missingCustomNodeNames?.length) {
    throw new Error(
      `${adapter.name} 缺少必需节点：${profile.missingCustomNodeNames.join("、")}。` +
      "请先在设置 → 节点与依赖中安装；节点目录存在即可入队，无需启动 ComfyUI。"
    );
  }
  if (imageQualityProfileRequiresLightning(qualityProfile) && !imageLightningComponentFound(profile.components)) {
    throw new Error("当前选择了 Qwen Lightning 4 步档，但未找到 Lightning LoRA。请在设置 → 图片模型中打开下载说明并重新扫描。");
  }
  if (hasReference && adapter.referenceModelComponentLabel) {
    const referenceComponent = profile.components.find((component) =>
      component.label.includes(adapter.referenceModelComponentLabel!)
    );
    if (!referenceComponent?.found) {
      throw new Error(
        `${adapter.name} 的参考图路径需要 ${adapter.referenceModelComponentLabel}。` +
        "请在设置 → 图片模型中按下载说明安装后重新扫描；无参考图的文生图不需要该文件。"
      );
    }
  }
  if (adapter.operation === "inpaint" || adapter.operation === "background-removal") return undefined;
  const diffusionModel = profile.components.find((component) => component.label.includes("扩散模型"))
    ?.matches[0]?.split(/[\\/]/u).pop();
  if (!diffusionModel) throw new Error(`${adapter.name} 扩散模型文件未能从环境扫描结果中解析。`);
  return diffusionModel;
}

export class QueueEnqueueService {
  constructor(private readonly deps: QueueEnqueueServiceDependencies) {}

  private rejectUnavailableH3NativeResolution(draft: Draft): void {
    if (!isH3NativeHighResolution(draft.resolution)) return;
    if (draft.resolution === 1440) {
      throw new Error("Create 暂未开放 H3 原生 1440p；请选择 1080p 或普通分辨率。");
    }
    if (draft.modelId !== "minimax_h3_fl2va") {
      throw new Error("Create 原生 1080p 当前仅支持 MiniMax H3 FL2VA Base。");
    }
    if (!draft.h3SaveJointAv) {
      throw new Error("Create 原生 1080p 需要开启 JointAV 输出。");
    }
    if (draft.videoLoras.length) {
      throw new Error("Create 原生 1080p 首发档暂不支持视频 LoRA，请先移除 LoRA。");
    }
  }

  private async validateH3Create1080(draft: Draft, settings: Settings): Promise<void> {
    if (draft.resolution !== 1080) return;
    const [firstPass, secondPass] = await Promise.all([
      readWorkflow(fileURLToPath(new URL(
        "../workflows/minimax_h3_fl2va_first_pass_av_api.json",
        import.meta.url
      )), "H3 1080p 首遍工作流"),
      readWorkflow(fileURLToPath(new URL(
        "../workflows/minimax_h3_fl2va_learned_3d_second_sample_av_api.json",
        import.meta.url
      )), "H3 1080p learned 二采工作流")
    ]);
    const firstValidation = validateH3ComfyWorkflow(firstPass);
    const secondValidation = validateH3ComfyWorkflow(secondPass);
    if (!firstValidation.valid || firstValidation.kind !== "first-pass-av") {
      throw new Error(`H3 1080p 首遍工作流静态校验失败：${firstValidation.errors.join("；")}`);
    }
    if (!secondValidation.valid || secondValidation.kind !== "second-sampling-av") {
      throw new Error(`H3 1080p learned 二采工作流静态校验失败：${secondValidation.errors.join("；")}`);
    }
    const environment = (this.deps.getCachedEnvironmentScanForQueue ?? getCachedEnvironmentScan)(settings);
    if (!environment) return;
    const learnedProfile = environment.modelProfiles.find(
      (profile) => profile.id === "minimax_h3_latent_upscaler"
    );
    if (!learnedProfile?.integrated) throw new Error("当前应用版本没有接入 H3 Learned 3D 工作流。");
    if (!learnedProfile.available) {
      const missing = learnedProfile.components
        .filter((component) => !component.found)
        .map((component) => component.expected)
        .join("、");
      throw new Error(`H3 Learned 3D 权重尚未完整${missing ? `，缺少：${missing}` : ""}。`);
    }
    if (learnedProfile.missingCustomNodeNames?.length) {
      throw new Error(`H3 Learned 3D 缺少必需节点：${learnedProfile.missingCustomNodeNames.join("、")}。`);
    }
    if (learnedProfile.customNodeCompatibility === "error") {
      throw new Error("H3 Learned 3D 节点版本不兼容，请在设置 → 节点与依赖中更新后重试。");
    }
  }

  private validateDlss5EnqueuePreflight(
    request: UpscaleRequest
  ): UpscaleRequest {
    if (request.upscaleMode === "h3-native") {
      throw new Error("DLSS5 任务不能与 H3 原生二次采样 provider 混用。");
    }
    const target = normalizeUpscaleTarget(request);
    if (target.provider !== "dlss5") throw new Error("DLSS5 目标规范化失败。");
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

  private validateAetherScaleEnqueuePreflight(
    request: UpscaleRequest
  ): UpscaleRequest {
    if (request.upscaleMode === "h3-native") {
      throw new Error("AetherScale 任务不能与 H3 原生二次采样 provider 混用。");
    }
    if (request.targetHeight !== undefined || request.targetScale !== undefined || request.dlss5 !== undefined) {
      throw new Error("AetherScale 任务不能与 legacy/HECer target 字段混用。");
    }
    const target = normalizeAetherScaleTarget(request);
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
      throw new Error("AetherScale carrier 需要与当前 Windows 本地 ComfyUI 使用同一台机器；远程 ComfyUI 仅支持连接。");
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
          ? `AetherScale 节点加载失败：${node.loadError} 请在设置 → 节点与依赖中更新并重启 ComfyUI。`
          : "AetherScale 节点尚未安装或未通过静态检查，请先在设置 → 节点与依赖中安装并重新扫描。"
      );
    }
    if (node.runtimeMissingNodeTypes?.length) {
      throw new Error("AetherScale 节点 schema 尚未通过当前 ComfyUI 检查，请刷新环境后重试。");
    }
    const profile = environment.modelProfiles?.find((candidate) => candidate.id === AETHERSCALE_MODEL_ID);
    if (profile?.runtimeMissingNodes?.length || profile?.available === false) {
      throw new Error("AetherScale 节点 schema 尚未通过当前 ComfyUI 检查，请刷新环境后重试。");
    }
    const nvidia = environment.items?.find((item) => item.id === "nvidia");
    if (nvidia && nvidia.ok === false && nvidia.status === "missing") {
      throw new Error("当前未检测到可用的 NVIDIA GPU/驱动，AetherScale carrier 只能在 Windows + NVIDIA 环境运行。");
    }
    const runtime = environment.aetherScaleRuntime;
    if (runtime && (!runtime.carrierReady || runtime.state === "missing" || runtime.state === "invalid")) {
      const detail = runtime.error || runtime.missingFiles.join("、") || runtime.incompatibleFiles.join("、");
      throw new Error(`AetherScale carrier runtime 尚未就绪${detail ? `：${detail}` : ""}。请在设置 → 节点与依赖中完成安装并重新扫描。`);
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
      throw new Error("DLSS5 节点尚未安装，请先在设置 → 节点与依赖中安装并重新扫描。");
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
          ? `DLSS5 节点加载失败：${node.loadError} 请在设置 → 节点与依赖中更新并重启 ComfyUI。`
          : "DLSS5 节点尚未安装，请先在设置 → 节点与依赖中安装并重新扫描。"
      );
    }
    if (node?.runtimeMissingNodeTypes?.length) {
      throw new Error("DLSS5 节点 schema 尚未通过当前 ComfyUI 检查，请在设置 → 节点与依赖中刷新并重试。");
    }
    const profile = environment.modelProfiles?.find((candidate) => candidate.id === DLSS5_MODEL_ID);
    if (profile?.runtimeMissingNodes?.length || profile?.available === false) {
      throw new Error("DLSS5 节点 schema 尚未通过当前 ComfyUI 检查，请在设置 → 节点与依赖中刷新并重试。");
    }
    const nvidia = environment.items?.find((item) => item.id === "nvidia");
    if (nvidia && nvidia.ok === false && nvidia.status === "missing") {
      throw new Error("当前未检测到可用的 NVIDIA GPU/驱动，DLSS Super Resolution 只能在 Windows + NVIDIA 环境运行。");
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
      throw new Error(`DLSS5 Super Resolution runtime 尚未就绪${detail ? `：${detail}` : ""}。请在设置 → 节点与依赖中完成安装并重新扫描。`);
    }
    const depth = environment.depthAnything;
    if (depth && !depth.available) {
      const detail = depth.error || depth.missingFiles.join("、");
      throw new Error(`Depth Anything V2 Small 权重尚未就绪${detail ? `：${detail}` : ""}。请按设置页模型卡下载 model.safetensors，放入指定 ComfyUI 模型目录后重新扫描。`);
    }
  }

  async enqueue(draft: Draft): Promise<AppState> {
    const deps = this.deps;
    const { store, logger, sendState } = deps;
    const enqueueSettings = store.getSettings();
    Object.assign(draft, normalizeVideoDraft(draft));
    if (draft.inputMode !== "image") throw new Error("视频续写必须使用独立的 extension 队列任务");
    if (!videoModelSupportsDraftInput(draft.modelId, "image")) {
      throw new Error("当前模型不支持图像输入生成。");
    }
    this.rejectUnavailableH3NativeResolution(draft);
    await this.validateH3Create1080(draft, enqueueSettings);
    const isR2V = isMiniMaxH3R2vModel(draft.modelId);
    const hasReference = Boolean(draft.startImagePath || draft.endImagePath);
    const isH3TextToVideo = isMiniMaxH3Model(draft.modelId) && !isR2V && !hasReference;
    if (!isR2V && !isH3TextToVideo && !draft.startImagePath) throw new Error("请先选择首帧图片");
    if (isR2V && (!draft.h3ReferenceSlots.length || draft.h3ReferenceSlots.some((slot) => !slot.mediaPath))) {
      throw new Error("R2V 的每个 Slot 都必须先添加图片或视频。");
    }
    if (!promptOf(draft)) throw new Error("提示词不能为空");
    if (!draft.workflowPath) throw new Error("请先选择该模型的 ComfyUI API 工作流");
    const resolvedWorkflowPath = h3WorkflowPathForInput(
      draft.workflowPath,
      draft.modelId,
      hasReference
    );
    const safety = generationSafetyForTask({
      ...draft,
      resolution: isH3NativeHighResolution(draft.resolution) ? 720 : draft.resolution
    }, enqueueSettings.uiLocale);
    if (!safety.safe) throw new Error(safety.message);
    if (isMiniMaxH3Q3GgufModel(draft.modelId) && draft.videoLoras.length) {
      throw new Error("H3 Q3 GGUF 3080 实验档不支持 LoRA，请先移除 LoRA。");
    }
    const videoPolicy = resolveVideoGenerationPolicy({
      modelId: draft.modelId,
      inputMode: draft.inputMode,
      spectrumMode: draft.spectrumMode,
      videoLoras: draft.videoLoras,
      locale: enqueueSettings.uiLocale
    });
    const initialH3ExecutionPlan = resolveMiniMaxH3ExecutionPlan({
      modelId: draft.modelId,
      inputMode: draft.inputMode,
      attentionMode: enqueueSettings.h3AttentionMode,
      h3MemoryOptimizationMode: draft.h3MemoryOptimizationMode,
      h3MemoryChunkRows: draft.h3MemoryChunkRows,
      spectrumMode: draft.spectrumMode,
      videoLoras: draft.videoLoras,
      h3LivePreview: enqueueSettings.h3LivePreview
    });
    if (draft.h3MemoryOptimizationMode !== "off" && !initialH3ExecutionPlan.allowed) {
      throw new Error(`H3 Memory Optimization 组合不支持：${initialH3ExecutionPlan.reasons.join("、")}`);
    }
    if (draft.spectrumMode === "balanced" && !videoPolicy.spectrum.allowed) {
      throw new Error(isMiniMaxH3Q3GgufModel(draft.modelId)
        ? "H3 Q3 GGUF 3080 实验档不支持 Spectrum，请关闭后再提交。"
        : "当前模型不支持 Spectrum，请关闭后再提交。");
    }
    const workflow = await readWorkflow(resolvedWorkflowPath, "工作流");
    const validation = validateApiWorkflow(workflow, enqueueSettings.uiLocale);
    if (!validation.valid) throw new Error(`工作流校验失败：${validation.errors.join("；")}`);
    const h3UsesSlaAttention = isMiniMaxH3Model(draft.modelId) && draft.videoLoras.some((lora) =>
      isH3SlaTurboLoraId(lora.id) && videoLoraCompatibleWithModel(lora, draft.modelId)
    );
    const h3UsesSageAttention = isMiniMaxH3Model(draft.modelId) &&
      !h3UsesSlaAttention &&
      enqueueSettings.h3AttentionMode !== "pytorch";
    const dependencyScanRequired = isMiniMaxH3Model(draft.modelId) || draft.videoLoras.length > 0 || draft.spectrumMode === "balanced" ||
      h3UsesSageAttention || draft.h3MemoryOptimizationMode !== "off";
    const dependencyScan = dependencyScanRequired
      ? getCachedEnvironmentScan(enqueueSettings)
      : undefined;
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
      throw new Error("H3 视频 VAE 未找到：请安装 FP16 或 INT8 ConvRot 视频 VAE 后重新扫描。您也可以在设置 → 性能与加速中查看状态。");
    }
    if (draft.h3MemoryOptimizationMode !== "off" && dependencyScan) {
      const memoryNode = dependencyScan?.customNodes.find((node) => node.id === "h3-optimizations");
      const executionPlan = resolveMiniMaxH3ExecutionPlan({
        modelId: draft.modelId,
        inputMode: draft.inputMode,
        attentionMode: enqueueSettings.h3AttentionMode,
        h3MemoryOptimizationMode: draft.h3MemoryOptimizationMode,
        h3MemoryChunkRows: draft.h3MemoryChunkRows,
        spectrumMode: draft.spectrumMode,
        videoLoras: draft.videoLoras,
        h3LivePreview: enqueueSettings.h3LivePreview,
        memoryNode: memoryNode ?? null
      });
      if (!executionPlan.allowed) {
        throw new Error(`H3 Memory Optimization 不可用：${executionPlan.reasons.join("、")}`);
      }
    }
    if (draft.videoLoras.length) {
      const issues = videoLoraConfigurationIssues({
        modelId: draft.modelId, inputMode: draft.inputMode,
        spectrumMode: draft.spectrumMode, attentionMode: enqueueSettings.h3AttentionMode,
        videoLoras: draft.videoLoras
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
        if (missing) throw new Error(`${missing.name} 当前记录的文件 ${missing.filename} 未找到，请先在设置 → LoRA 中重新扫描或安装。`);
      }
    }
    if (h3UsesSlaAttention && dependencyScan) {
      const slaNode = dependencyScan?.customNodes.find((node) => node.id === "plaguekind-h3-sla");
      if (!slaNode?.loaded) {
        throw new Error(slaNode?.installed
          ? "Turbo-SLA 节点已安装但尚未被当前 ComfyUI 加载，请重启 ComfyUI 后重新扫描。"
          : "Turbo-SLA 需要 H3 SLA Attention 节点，请先在设置 → 节点与依赖中安装并重启 ComfyUI。");
      }
    }
    if (draft.spectrumMode === "balanced" && dependencyScan) {
      const spectrum = dependencyScan?.customNodes.find(
        (node) => node.id === "spectrum-minimax-h3"
      );
      if (!spectrum?.loaded) {
        throw new Error("Spectrum 节点不可用；请先在设置 → 节点与依赖中安装、更新并复检。");
      }
      if (isH3TurboEnabled(draft) && !releaseVersionAtLeast(
        spectrum.version,
        SPECTRUM_TURBO_MINIMUM_VERSION
      )) {
        throw new Error(`LightX2V Turbo + Spectrum 需要 Spectrum v${SPECTRUM_TURBO_MINIMUM_VERSION}+；当前 ${spectrum.version ? `v${spectrum.version}` : "版本未知"}。`);
      }
      if (draft.spectrumModelAwareMode !== "off" && !releaseVersionAtLeast(
        spectrum.version,
        SPECTRUM_MODEL_AWARE_MINIMUM_VERSION
      )) {
        throw new Error(`模型感知预测需要 Spectrum v${SPECTRUM_MODEL_AWARE_MINIMUM_VERSION}+；当前 ${spectrum.version ? `v${spectrum.version}` : "版本未知"}。`);
      }
    }
    if (h3UsesSageAttention && dependencyScan) {
      const kjNodes = dependencyScan?.customNodes.find((node) => node.id === "kjnodes");
      if (!kjNodes?.installed) {
        throw new Error("当前 H3 Attention 模式需要 ComfyUI-KJNodes 的 SageAttention 节点；请先安装节点，或切换到 PyTorch 模式。");
      }
    }
    if (isH3TurboEnabled(draft) && !workflowSupportsH3TurboSampling(workflow, {
      modelId: draft.modelId,
      videoLoras: draft.videoLoras
    })) {
      throw new Error("LightX2V Turbo 需要匹配所选版本的采样契约：v1.1/Turbo-SLA 4-step 使用 Euler、Beta、video shift 6、audio shift 3；v4 使用 Euler、Beta、video shift 12、audio shift 6；8-step/旧版路径使用 ER-SDE、Beta 和 Sigma Shift。R2V Turbo 还需要标准 MiniMaxH3ReferenceToVideo 工作流。");
    }
    if (draft.endImagePath && !workflowSupportsEndImage(workflow)) {
      throw new Error("当前工作流不支持尾帧。请选择包含 {{END_IMAGE}} 占位符的自定义 API 工作流，或移除尾帧。");
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
        const archived = await archiveImagePaths(sourcePaths, library);
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
    const next = await store.update((state) => {
      const taskDraft = structuredClone(preparedDraft);
      taskDraft.workflowPath = resolvedWorkflowPath;
      state.queue.push(queueTaskFromDraft(taskDraft, state, undefined, { h3VideoVaeMode }));
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
    const requested = normalizeImageEditDraft(draft);
    const adapter = imageModelAdapterFor(requested.modelId);
    const normalized = normalizeImageEditDraft({
      ...requested,
      ...(adapter?.deterministic ? { outputCount: 1 } : {})
    });
    if (!adapter) throw new Error(`当前没有 ${normalized.modelId} 的图片模型适配器。`);
    const hasReference = normalized.pictures.length > 0;
    if (!hasReference && !adapter.supportsTextOnly) {
      throw new Error("请先添加至少一张 Picture 作为基础图片。");
    }
    if (normalized.pictures.length > adapter.maxPictures) throw new Error(`当前 ${adapter.name} 工作流最多支持 ${adapter.maxPictures} 张 Picture。`);
    if (hasReference) {
      const incomplete = normalized.pictures.find((picture) => !picture.absolutePath);
      if (incomplete) throw new Error(`请先为 Slot ${incomplete.pictureNumber}（Picture ${incomplete.pictureNumber}）添加图片。`);
    }
    const prompt = adapter.requiresPrompt === false
      ? ""
      : normalized.promptVersions[normalized.activePromptVersion]?.text.trim() ?? "";
    if (adapter.requiresPrompt !== false && !prompt) throw new Error("图片处理提示词不能为空");
    if (adapter.requiresMask && !normalized.pictures[0]?.mask?.regionCount) {
      throw new Error("请先在原图上绘制并保存 Mask。");
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
            await deps.effectiveImageInputLibraryDirectory(enqueueSettings)
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
          : readImageDimensions(picture.absolutePath, deps.imageInspection))
      })),
      outputFormat: "png"
    });
    const lineage = await resolveImageProjectLineage(store.get(), preparedDraft);
    preparedDraft = normalizeImageEditDraft({ ...preparedDraft, projectId: lineage?.projectId, parentVersionId: lineage?.parentVersionId });
    for (const picture of preparedDraft.pictures) {
      if (!(await fs.stat(picture.absolutePath).catch(() => null))?.isFile()) {
        throw new Error(`Picture ${picture.pictureNumber} 文件不存在：${picture.absolutePath}`);
      }
      if (picture.crop?.croppedPath?.trim() && !(await fs.stat(picture.crop.croppedPath).catch(() => null))?.isFile()) {
        throw new Error(`Picture ${picture.pictureNumber} 的裁剪文件不存在，请重新打开裁剪工具并保存。`);
      }
      const markedPath = picture.markup?.renderedPath.trim();
      if (picture.markup?.objectCount && markedPath && !(await fs.stat(markedPath).catch(() => null))?.isFile()) {
        throw new Error(`Picture ${picture.pictureNumber} 的标记预览不存在，请重新打开标记画布并保存。`);
      }
      const maskPath = picture.mask?.maskPath.trim();
      if (adapter.requiresMask && (!maskPath || !(await fs.stat(maskPath).catch(() => null))?.isFile())) {
        throw new Error(`Picture ${picture.pictureNumber} 的 Mask 不存在，请重新绘制并保存。`);
      }
    }
    const preparedPrompt = preparedDraft.promptVersions[preparedDraft.activePromptVersion]?.text.trim() ?? "";
    const compiled = adapter.compilePrompt(preparedPrompt, preparedDraft.pictures);
    if (compiled.errors.length) throw new Error(compiled.errors.join(" "));
    const task = imageTaskFromDraft(preparedDraft, diffusionModelFilename, outputTarget);
    const next = await store.update((state) => {
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
    if (draft.inputMode !== "video") throw new Error("只有视频输入模式可以创建 extension 队列任务");
    if (!videoModelSupportsDraftInput(draft.modelId, "video")) {
      throw new Error("当前模型不支持视频续写。");
    }
    const loraIssue = videoLoraConfigurationIssues({
      modelId: draft.modelId, inputMode: draft.inputMode, spectrumMode: draft.spectrumMode,
      attentionMode: enqueueSettings.h3AttentionMode, videoLoras: draft.videoLoras
    }).find((issue) => issue.severity === "error");
    if (loraIssue) throw new Error(loraIssue.message);
    this.rejectUnavailableH3NativeResolution(draft);
    const initialH3ExecutionPlan = resolveMiniMaxH3ExecutionPlan({
      modelId: draft.modelId,
      inputMode: draft.inputMode,
      attentionMode: enqueueSettings.h3AttentionMode,
      h3MemoryOptimizationMode: draft.h3MemoryOptimizationMode,
      h3MemoryChunkRows: draft.h3MemoryChunkRows,
      spectrumMode: draft.spectrumMode,
      videoLoras: draft.videoLoras,
      h3LivePreview: enqueueSettings.h3LivePreview
    });
    if (draft.h3MemoryOptimizationMode !== "off" && !initialH3ExecutionPlan.allowed) {
      throw new Error(`H3 Memory Optimization 组合不支持：${initialH3ExecutionPlan.reasons.join("、")}`);
    }
    if (!promptOf(draft)) throw new Error("提示词不能为空");
    if (!draft.workflowPath) throw new Error("请先选择视频续写 API 工作流");
    if (!(await fs.stat(draft.sourceVideoPath).catch(() => null))) throw new Error("源视频文件不存在，无法加入续写队列");
    const dependencyScanRequired = isMiniMaxH3Model(draft.modelId) || draft.h3MemoryOptimizationMode !== "off";
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
      throw new Error("H3 视频 VAE 未找到：请安装 FP16 或 INT8 ConvRot 视频 VAE 后重新扫描。您也可以在设置 → 性能与加速中查看状态。");
    }
    const motionContext = isMiniMaxH3R2vModel(draft.modelId);
    const continuum = isMiniMaxH3ContinuumModel(draft.modelId);
    const preparedDraft = structuredClone(draft);
    if (motionContext) {
      preparedDraft.h3ReferenceSlots = ensureMotionContextSourceSlot(
        preparedDraft.h3ReferenceSlots,
        preparedDraft.sourceVideoPath
      );
      const counts = h3ReferenceSlotCounts(preparedDraft.h3ReferenceSlots);
      if (counts.imageCount > 9 || counts.videoCount > 3 || counts.total > 12) {
        throw new Error("H3 Motion Context 最多支持 9 张图片、3 段视频，且总参考媒体不超过 12 个。");
      }
      if (!preparedDraft.h3ReferenceSlots.every((slot) => slot.mediaPath.trim())) {
        throw new Error("Motion Context 的每个参考 Slot 都必须先添加图片或视频。");
      }
    }
    if (continuum) {
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
        throw new Error("Continuum 续写需要一个已验证的 H3 Native AV artifact；请从 History 继续，或选择 output/h3-native-av 下的 safetensors 文件。");
      }
      if (!deps.inspectNativeAvArtifact) {
        throw new Error("当前运行时没有可用的 H3 Native AV artifact 校验服务，请重启应用后重试。");
      }
      const inspection = await deps.inspectNativeAvArtifact(artifactPath, outputDirectory);
      const artifact = inspection.status === "available" ? inspection.artifact : undefined;
      if (!artifact) {
        throw new Error(`Continuum 输入 artifact 不可用：${inspection.reason ?? "manifest 或 payload 校验失败"}`);
      }
      const assets = miniMaxH3ModelAssetNames(draft.modelId);
      if (
        artifact.modelFamily !== "minimax-h3" ||
        !assets ||
        artifact.diffusionModelFilename !== assets.diffusionModel
      ) {
        throw new Error("所选 JointAV 与 MiniMax H3 Continuum 当前权重不兼容；请使用同一套 FL2VA INT8 模型生成的 artifact。");
      }
      if (
        preparedDraft.sourceWidth > 0 && preparedDraft.sourceHeight > 0 &&
        (artifact.width !== preparedDraft.sourceWidth || artifact.height !== preparedDraft.sourceHeight)
      ) {
        throw new Error(`所选 JointAV 分辨率 ${artifact.width}×${artifact.height} 与源视频 ${preparedDraft.sourceWidth}×${preparedDraft.sourceHeight} 不一致。`);
      }
      preparedDraft.h3ContinuumArtifactPath = inspection.payloadPath ?? artifact.payload.absolutePath;
      preparedDraft.h3ContinuumArtifact = artifact;
    }
    if (draft.h3MemoryOptimizationMode !== "off" && dependencyScan) {
      const memoryNode = dependencyScan.customNodes.find((node) => node.id === "h3-optimizations");
      const executionPlan = resolveMiniMaxH3ExecutionPlan({
        modelId: draft.modelId,
        inputMode: draft.inputMode,
        attentionMode: enqueueSettings.h3AttentionMode,
        h3MemoryOptimizationMode: draft.h3MemoryOptimizationMode,
        h3MemoryChunkRows: draft.h3MemoryChunkRows,
        spectrumMode: draft.spectrumMode,
        videoLoras: draft.videoLoras,
        h3LivePreview: enqueueSettings.h3LivePreview,
        memoryNode: memoryNode ?? null
      });
      if (!executionPlan.allowed) {
        throw new Error(`H3 Memory Optimization 不可用：${executionPlan.reasons.join("、")}`);
      }
    }
    const workflow = await readWorkflow(draft.workflowPath, "续写工作流");
    const validation = validateApiWorkflow(workflow, enqueueSettings.uiLocale);
    if (!validation.valid) throw new Error(`工作流校验失败：${validation.errors.join("；")}`);
    const safetyErrors = isMiniMaxH3Fl2vaModel(draft.modelId)
      ? workflowSupportsH3BoundaryExtension(workflow) ? [] : ["H3 接续工作流缺少 INPUT_IMAGE、MiniMaxH3ImageToVideo 或视频输出节点"]
      : continuum
        ? workflowSupportsH3ContinuumExtension(workflow) ? [] : ["H3 Continuum 工作流缺少 Native AV loader、state bridge、Join/Finish 或视频输出节点"]
      : isMiniMaxH3R2vModel(draft.modelId)
        ? workflowSupportsH3MotionContextExtension(workflow) ? [] : ["H3 Motion Context 工作流缺少 R2V、运动上下文、同步裁剪、latent 保存或视频输出节点"]
        : extensionWorkflowSafetyErrors(workflow, enqueueSettings.uiLocale);
    if (safetyErrors.length) throw new Error(`续写工作流不符合原生续写低显存契约：${safetyErrors.join("；")}`);
    if (motionContext) {
      const imageCount = preparedDraft.h3ReferenceSlots.filter((slot) => slot.mediaType === "image").length;
      const extraVideoCount = Math.max(0, preparedDraft.h3ReferenceSlots.filter((slot) => slot.mediaType === "video").length - 1);
      if (!workflowSupportsH3MotionContextReferences(workflow, imageCount, extraVideoCount)) {
        throw new Error("当前 Motion Context 工作流没有对应的参考 Slot 输入，请重新选择新版 minimax_h3_r2v_extend_api.json。");
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
          const archived = await archiveImagePaths(imagePaths, library);
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
    const task = extensionTaskFromDraft(preparedDraft, current, undefined, { h3VideoVaeMode });
    if (isMiniMaxH3R2vModel(task.modelId)) {
      const outputDirectory = await deps.resolveTaskOutputDirectory();
      task.h3ContextSavePrefix = `h3_context/${task.id}/clip`;
      task.h3ContextSavedPath = outputDirectory ? path.join(outputDirectory, "h3_context", task.id, "clip_00001.safetensors") : undefined;
      task.h3ContextLatentPath = preparedDraft.h3ContextLatentPath &&
        Math.abs(preparedDraft.trimEndSeconds - preparedDraft.sourceVideoDuration) < 0.05 &&
        await fs.stat(preparedDraft.h3ContextLatentPath).catch(() => null)
        ? preparedDraft.h3ContextLatentPath : undefined;
    }
    const safety = extensionSafetyForTask(task, current.settings.uiLocale);
    if (!safety.safe) throw new Error(safety.message);
    const next = await store.update((state) => {
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
    if (!asset || !version) throw new Error("源作品或版本已不存在");
    if (!request.sourceFilePath || !(await fs.stat(request.sourceFilePath).catch(() => null))) {
      throw new Error("源视频文件不存在，无法加入提升队列");
    }
    const isAetherScale = request.modelId === AETHERSCALE_MODEL_ID || request.aetherScale !== undefined;
    const isDlss5 = !isAetherScale && (request.modelId === DLSS5_MODEL_ID ||
      request.targetScale !== undefined || request.dlss5 !== undefined);
    let preparedRequest = request;
    if (isAetherScale) {
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
        throw new Error("H3 原生二次采样仅支持 720p/768p/1080p/1440p 目标档位。");
      }
      const artifact = version.h3ContinuationData?.status === "available"
        ? version.h3ContinuationData.artifact
        : undefined;
      if (!artifact) throw new Error("当前版本没有可用的 JointAV artifact。");
      if (!isMiniMaxH3Fl2vaModel(artifact.executionModelId) || artifact.contextFrames !== 0) {
        throw new Error("当前 JointAV artifact 不是可重建 conditioning 的 H3 FL2VA clean AV。");
      }
      if (artifact.width !== version.width || artifact.height !== version.height) {
        throw new Error("JointAV artifact 的实际分辨率与当前 History 版本不一致。");
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
        throw new Error("JointAV payload 或 manifest 已不存在，无法加入 H3 提升队列。");
      }
      for (const [label, filename] of [
        ["首帧", asset.startImagePath],
        ["尾帧", asset.endImagePath]
      ] as const) {
        if (filename && !(await fs.stat(filename).catch(() => null))?.isFile()) {
          throw new Error(`H3 二次采样的${label} conditioning 文件已不存在。`);
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
          throw new Error("当前应用版本没有接入 H3 Learned 3D 工作流。");
        } else if (!learnedProfile.available) {
          const missing = learnedProfile.components
            .filter((component) => !component.found)
            .map((component) => component.expected)
            .join("、");
          throw new Error(`H3 Learned 3D 权重尚未完整${missing ? `，缺少：${missing}` : ""}。`);
        } else if (learnedProfile.missingCustomNodeNames?.length) {
          throw new Error(
            `H3 Learned 3D 缺少必需节点：${learnedProfile.missingCustomNodeNames.join("、")}。` +
            "请先在设置 → 节点与依赖中安装；节点目录存在即可入队，无需启动 ComfyUI。"
          );
        } else if (learnedProfile.customNodeCompatibility === "error") {
          throw new Error("H3 Learned 3D 节点版本不兼容，请在设置 → 节点与依赖中更新后重试。");
        }
        if (environment && request.targetHeight === 1440) {
          const mmh3Node = environment.customNodes.find(
            (node) => node.id === "mmh3-ultimate-upscale"
          );
          if (!mmh3Node?.installed) {
            throw new Error(
              "1440p H3 分块二次采样需要 MMH3 Ultimate Upscale。" +
              "请先在设置 → 节点与依赖中安装固定版本。"
            );
          }
          if (mmh3Node.compatibilityState === "error") {
            throw new Error(
              "MMH3 Ultimate Upscale 版本或应用补丁不兼容，" +
              "请在设置 → 节点与依赖中修复后重试。"
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
          steps: normalizeH3Steps(version.steps ?? asset.steps, artifact.executionModelId, videoLoras),
          videoLoras: videoLoras.map((lora) => ({ ...lora }))
        }
      };
    }
    const next = await store.update((state) => {
      state.queue.push(upscaleTaskFromRequest(preparedRequest, state));
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
