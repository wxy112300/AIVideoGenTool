import { nativeImage, type IpcMain } from "electron";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { AppState, Draft, ImageEditDraft, Settings, UpscaleRequest } from "../src/types.js";
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
  isMiniMaxH3Fl2vaModel,
  isMiniMaxH3Model,
  isMiniMaxH3Q3GgufModel,
  isMiniMaxH3R2vModel,
  h3WorkflowPathForInput,
  normalizeH3Steps,
  validateApiWorkflow,
  workflowSupportsEndImage,
  workflowSupportsH3BoundaryExtension,
  workflowSupportsH3MotionContextExtension,
  workflowSupportsH3MotionContextReferences,
  workflowSupportsH3TurboSampling
} from "../src/core/workflow.js";
import {
  isH3TurboEnabled,
  normalizeVideoLoras,
  videoLoraConfigurationIssues
} from "../src/core/video-loras.js";
import {
  SPECTRUM_MODEL_AWARE_MINIMUM_VERSION,
  SPECTRUM_TURBO_MINIMUM_VERSION
} from "../src/core/catalog/index.js";
import { resolveVideoGenerationPolicy } from "../src/core/video-policy.js";
import {
  ensureMotionContextSourceSlot,
  h3ReferenceSlotCounts
} from "../src/core/h3-reference.js";
import { releaseVersionAtLeast } from "../src/core/release-version.js";
import {
  extensionTaskFromDraft,
  imageTaskFromDraft,
  promptOf,
  queueTaskFromDraft,
  upscaleTaskFromRequest
} from "../src/core/queue-task-factory.js";
import type { JsonStore } from "./store.js";
import type { AppLogger } from "./services/app-logger.js";
import { safeLogErrorMessage } from "./services/app-logger.js";
import { resolveComfyOutputDirectory, scanEnvironment } from "./services/environment.js";
import { archiveImagePaths, archiveImageReferences, hashImageFile } from "./services/image-asset-library.js";
import { isPathWithinDirectory } from "./services/video-history-migration.js";

export interface QueueEnqueueDependencies {
  ipc: IpcMain;
  store: JsonStore;
  logger: AppLogger;
  sendState(state: AppState): void;
  effectiveImageInputLibraryDirectory(settings: Settings): Promise<string>;
  resolveTaskOutputDirectory(): Promise<string>;
}

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

function readImageDimensions(filename: string): { width: number; height: number } {
  const size = nativeImage.createFromPath(filename).getSize();
  if (!size.width || !size.height) throw new Error(`无法读取 Picture 图片尺寸：${filename}`);
  return size;
}

async function requireImageModelAssets(
  settings: Settings,
  modelId = settings.defaultImageModel,
  qualityProfile = "native",
  hasReference = false
): Promise<string | undefined> {
  const scan = await scanEnvironment(settings);
  const profile = scan.modelProfiles.find((item) => item.id === modelId);
  const adapter = imageModelAdapterFor(modelId);
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
      "请先在设置 → 节点与工作流中安装；节点目录存在即可入队，无需启动 ComfyUI。"
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

export function registerQueueEnqueueIpc(deps: QueueEnqueueDependencies): void {
  const { ipc, store, logger, sendState } = deps;
  ipc.handle("queue:enqueue", async (_event, draft: Draft) => {
    draft.videoLoras = normalizeVideoLoras(draft.videoLoras, draft.modelId);
    draft.steps = normalizeH3Steps(draft.steps, draft.modelId, draft.videoLoras);
    if (draft.inputMode !== "image") throw new Error("视频续写必须使用独立的 extension 队列任务");
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
    const safety = generationSafetyForTask(draft, store.get().settings.uiLocale);
    if (!safety.safe) throw new Error(safety.message);
    if (isMiniMaxH3Q3GgufModel(draft.modelId) && draft.videoLoras.length) {
      throw new Error("H3 Q3 GGUF 3080 实验档不支持 LoRA，请先移除 LoRA。");
    }
    const videoPolicy = resolveVideoGenerationPolicy({
      modelId: draft.modelId,
      inputMode: draft.inputMode,
      spectrumMode: draft.spectrumMode,
      videoLoras: draft.videoLoras,
      locale: store.get().settings.uiLocale
    });
    if (draft.spectrumMode === "balanced" && !videoPolicy.spectrum.allowed) {
      throw new Error(isMiniMaxH3Q3GgufModel(draft.modelId)
        ? "H3 Q3 GGUF 3080 实验档不支持 Spectrum，请关闭后再提交。"
        : "当前模型不支持 Spectrum，请关闭后再提交。");
    }
    const workflow = await readWorkflow(resolvedWorkflowPath, "工作流");
    const validation = validateApiWorkflow(workflow, store.get().settings.uiLocale);
    if (!validation.valid) throw new Error(`工作流校验失败：${validation.errors.join("；")}`);
    const h3UsesSageAttention = isMiniMaxH3Model(draft.modelId) &&
      store.get().settings.h3AttentionMode !== "pytorch";
    const dependencyScan = draft.videoLoras.length || draft.spectrumMode === "balanced" || h3UsesSageAttention
      ? await scanEnvironment(store.get().settings)
      : undefined;
    if (draft.videoLoras.length) {
      const issues = videoLoraConfigurationIssues({
        modelId: draft.modelId, inputMode: draft.inputMode,
        spectrumMode: draft.spectrumMode, attentionMode: store.get().settings.h3AttentionMode,
        videoLoras: draft.videoLoras
      });
      const blocking = issues.find((issue) => issue.severity === "error");
      if (blocking) throw new Error(blocking.message);
      issues.filter((issue) => issue.severity === "warning").forEach((issue) => {
        logger.warn("queue", "video-lora-compatibility-warning", issue.message, { loraIds: issue.loraIds });
      });
      const missing = draft.videoLoras.find((lora) => {
        const profile = dependencyScan?.modelProfiles.find((candidate) => candidate.id === lora.id);
        if (!profile?.available) return true;
        const expected = `loras/${lora.filename}`.replaceAll("\\", "/").toLowerCase();
        return !profile.components.some((component) => component.matches.some((match) => {
          const normalized = match.replaceAll("\\", "/").toLowerCase();
          return normalized === expected || normalized.endsWith(`/${expected}`);
        }));
      });
      if (missing) throw new Error(`${missing.name} 当前记录的文件 ${missing.filename} 未找到，请先在设置 → LoRA 中重新扫描或安装。`);
    }
    if (draft.spectrumMode === "balanced") {
      const spectrum = dependencyScan?.customNodes.find(
        (node) => node.id === "spectrum-minimax-h3"
      );
      if (!spectrum?.loaded) {
        throw new Error("Spectrum 节点不可用；请先在设置 → 节点与工作流中安装、更新并复检。");
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
    if (h3UsesSageAttention) {
      const kjNodes = dependencyScan?.customNodes.find((node) => node.id === "kjnodes");
      if (!kjNodes?.installed) {
        throw new Error("当前 H3 Attention 模式需要 ComfyUI-KJNodes 的 SageAttention 节点；请先安装节点，或切换到 PyTorch 模式。");
      }
    }
    if (isH3TurboEnabled(draft) && !workflowSupportsH3TurboSampling(workflow, {
      modelId: draft.modelId,
      videoLoras: draft.videoLoras
    })) {
      throw new Error("LightX2V Turbo 需要匹配所选版本的采样契约：v1.1 4-step 使用 Euler、Beta、video shift 6、audio shift 3；8-step/旧版路径使用 ER-SDE、Beta 和 Sigma Shift。R2V Turbo 还需要标准 MiniMaxH3ReferenceToVideo 工作流。");
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
      const library = await deps.effectiveImageInputLibraryDirectory(store.get().settings);
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
    const next = await store.update((state) => {
      const taskDraft = structuredClone(preparedDraft);
      taskDraft.workflowPath = resolvedWorkflowPath;
      state.queue.push(queueTaskFromDraft(taskDraft, state));
      activateCreationDraft(state, preparedDraft);
    });
    const task = next.queue.at(-1);
    if (task && !isImageGenerationQueueTask(task)) logger.info("queue", "task-enqueued", "Generation task added to queue", {
      taskId: task.id, taskType: task.taskType, modelId: task.modelId, duration: task.duration, fps: task.fps
    });
    sendState(next);
    return next;
  });

  ipc.handle("queue:enqueue-image", async (_event, draft: ImageEditDraft) => {
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
    const diffusionModelFilename = await requireImageModelAssets(
      store.get().settings,
      normalized.modelId,
      normalized.qualityProfile,
      hasReference
    );
    const outputTarget = await resolveImageOutputTarget(store.get().settings);
    const operationId = randomUUID().slice(0, 8);
    logger.info("assets", "image-input-archive-started", "开始归档图片任务输入素材", { operationId, referenceCount: normalized.pictures.length });
    let archivedPictures: typeof normalized.pictures;
    try {
      archivedPictures = normalized.pictures.length
        ? await archiveImageReferences(
            normalized.pictures,
            await deps.effectiveImageInputLibraryDirectory(store.get().settings)
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
          : readImageDimensions(picture.absolutePath))
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
  });

  ipc.handle("queue:enqueue-extension", async (_event, draft: Draft) => {
    draft.videoLoras = normalizeVideoLoras(draft.videoLoras, draft.modelId);
    const loraIssue = videoLoraConfigurationIssues({
      modelId: draft.modelId, inputMode: draft.inputMode, spectrumMode: draft.spectrumMode,
      attentionMode: store.get().settings.h3AttentionMode, videoLoras: draft.videoLoras
    }).find((issue) => issue.severity === "error");
    if (loraIssue) throw new Error(loraIssue.message);
    if (draft.inputMode !== "video") throw new Error("只有视频输入模式可以创建 extension 队列任务");
    if (!promptOf(draft)) throw new Error("提示词不能为空");
    if (!draft.workflowPath) throw new Error("请先选择视频续写 API 工作流");
    if (!(await fs.stat(draft.sourceVideoPath).catch(() => null))) throw new Error("源视频文件不存在，无法加入续写队列");
    const motionContext = isMiniMaxH3R2vModel(draft.modelId);
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
    const workflow = await readWorkflow(draft.workflowPath, "续写工作流");
    const validation = validateApiWorkflow(workflow, store.get().settings.uiLocale);
    if (!validation.valid) throw new Error(`工作流校验失败：${validation.errors.join("；")}`);
    const safetyErrors = isMiniMaxH3Fl2vaModel(draft.modelId)
      ? workflowSupportsH3BoundaryExtension(workflow) ? [] : ["H3 接续工作流缺少 INPUT_IMAGE、MiniMaxH3ImageToVideo 或视频输出节点"]
      : isMiniMaxH3R2vModel(draft.modelId)
        ? workflowSupportsH3MotionContextExtension(workflow) ? [] : ["H3 Motion Context 工作流缺少 R2V、运动上下文、同步裁剪、latent 保存或视频输出节点"]
        : extensionWorkflowSafetyErrors(workflow, store.get().settings.uiLocale);
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
        const library = await deps.effectiveImageInputLibraryDirectory(store.get().settings);
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
    const current = store.get();
    const task = extensionTaskFromDraft(preparedDraft, current);
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
  });

  ipc.handle("queue:enqueue-upscale", async (_event, request: UpscaleRequest) => {
    const current = store.get();
    const asset = current.history.find((item) => item.id === request.sourceAssetId);
    const version = asset?.versions.find((item) => item.id === request.sourceVersionId);
    if (!asset || !version) throw new Error("源作品或版本已不存在");
    if (!request.sourceFilePath || !(await fs.stat(request.sourceFilePath).catch(() => null))) {
      throw new Error("源视频文件不存在，无法加入提升队列");
    }
    const next = await store.update((state) => { state.queue.push(upscaleTaskFromRequest(request, state)); });
    const task = next.queue.at(-1);
    if (task?.taskType === "upscale") logger.info("queue", "task-enqueued", "Upscale task added to queue", {
      taskId: task.id, taskType: task.taskType, modelId: task.modelId,
      sourceWidth: task.sourceWidth, sourceHeight: task.sourceHeight,
      targetWidth: task.targetWidth, targetHeight: task.targetHeight,
      duration: task.duration, fps: task.fps
    });
    sendState(next);
    return next;
  });
}
