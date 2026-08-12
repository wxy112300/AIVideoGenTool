import type {
  AppState,
  BundledWorkflow,
  Draft,
  EnvironmentScanResult,
  H3PromptPreset,
  ImageEditDraft,
  ImagePromptPreset,
  PerformanceMetrics,
  PromptEnhanceMode,
  Settings,
  WorkflowCapabilities
} from "../../../types";
import type { H3PromptBuilderInput } from "../../../core/h3-prompt";
import {
  imageModelCapabilityFor,
  imageLightningComponentFound,
  imageQualityProfileRequiresLightning,
  imageResolutionOptionsFor,
  normalizeImageTargetResolution,
  cachedImageProfileAllowsEnqueue
} from "../../../core/image-workflow";
import { normalizeImageEditDraft } from "../../../core/image-project";
import { h3PromptPresetForMode } from "../../../core/h3-prompt-presets";
import { promptModelSupportsImageEdit, isGemmaPromptModel } from "../../../core/prompt-models";
import { h3ReferenceSlotCounts } from "../../../core/h3-reference";
import {
  generationSafetyForTask,
  isMiniMaxH3Fl2vaModel,
  isMiniMaxH3Model,
  isMiniMaxH3R2vModel,
  isMiniMaxH3SpectrumEligible,
  isMiniMaxH3BoundaryExtensionModel,
  normalizeH3Steps,
  outputDimensions
} from "../../../core/workflow";
import {
  BUILTIN_VIDEO_LORAS,
  H3_TURBO_LORA_ID,
  isH3TurboEnabled,
  profileProvidesVideoLora,
  videoLoraCompatibleWithDraft,
  videoLoraConfigurationIssues
} from "../../../core/video-loras";
import { escapeHtml } from "../../shared/dom";
import { formatBytes } from "../../shared/formatters";
import { fieldLabelWithTip } from "../../shared/markup";
import { imageWorkflowStatus, isImageModelSelectable, promptModelStatus } from "../../shared/status";
import { modelName } from "../../shared/labels";
import {
  activeImagePrompt,
  activePrompt,
  createModelOptionViewModels,
  extensionSafetyForDraft,
  h3PromptCheckMarkup,
  h3PromptModeForDraft,
  h3PromptPresetDescriptions,
  h3PromptPresetOptions,
  interpolationEstimate,
  promptSnippetOptions
} from "./helpers";
import type { ImageEditPageViewModel, VideoCreatePageViewModel } from "./page";

export interface CreateViewModelDependencies {
  state: AppState;
  environmentScan: EnvironmentScanResult | null;
  performanceMetrics: PerformanceMetrics | null;
  workflowCapabilities: Readonly<Record<string, WorkflowCapabilities>>;
  bundledWorkflows: Readonly<Record<string, BundledWorkflow>>;
  promptEnhanceMode: PromptEnhanceMode;
  h3PromptPreset: H3PromptPreset;
  promptEnhancing: boolean;
  promptStarting: boolean;
  promptReleasing: boolean;
  promptRuntimeLoaded: boolean;
  h3PromptBuilder: H3PromptBuilderInput;
  enqueueBusy: boolean;
  promptRuntimeControlTitle(settings?: Settings): string;
  promptRuntimeControlIcon(): string;
}

export function imageEditEnqueueBlockReason(
  draft: ImageEditDraft,
  imageProfile: EnvironmentScanResult["modelProfiles"][number] | undefined
): string {
  const imageCapability = imageModelCapabilityFor(draft.modelId);
  const incompletePicture = draft.pictures.find((picture) => !picture.absolutePath);
  const markupGuideCount = draft.modelId === "qwen-image-edit-2511"
    ? draft.pictures.filter((picture) => picture.markup?.objectCount && picture.markup.renderedPath.trim()).length
    : 0;
  const imageModelInputCount = draft.pictures.length + markupGuideCount;
  const prompt = activeImagePrompt(draft);
  return !draft.pictures.length
    ? "请先添加 Slot 1（Picture 1）作为基础图片"
    : !draft.pictures[0]?.absolutePath
      ? "请先为 Slot 1（Picture 1）添加基础图片"
      : incompletePicture
        ? `请先为 Slot ${incompletePicture.pictureNumber}（Picture ${incompletePicture.pictureNumber}）添加图片`
        : draft.pictures.length > imageCapability.maxPictures
          ? `当前 ${imageCapability.name} 最多支持 ${imageCapability.maxPictures} 张 Picture`
          : imageModelInputCount > imageCapability.maxPictures
            ? `Canvas 标记额外占用 ${markupGuideCount} 个参考输入；请减少普通参考图或清除部分标记`
            : !prompt.text.trim()
              ? "请先填写图片编辑 Prompt"
              : !cachedImageProfileAllowsEnqueue(imageProfile)
                ? `${imageCapability.name} 图片工作流尚未接入`
                : "";
}

export interface VideoEnqueueBlockReasonInput {
  promptText: string;
  extending: boolean;
  isR2V: boolean;
  videoReady: boolean;
  trimDuration: number;
  workflowPath: string;
  supportsVideoExtension: boolean;
  safetySafe: boolean;
  safetyMessage: string;
  h3MotionContextReady: boolean;
  spectrumReady: boolean;
  r2vSlotsReady: boolean;
  startImagePath: string;
  turboCoreBlockReason: string;
  turboLoraBlockReason: string;
  selectedLoraBlockReason: string;
}

export function videoEnqueueBlockReason(
  input: VideoEnqueueBlockReasonInput
): string {
  if (input.extending) {
    return !input.videoReady
      ? "请先选择视频并等待读取完成"
      : input.trimDuration <= 0
        ? "请设置有效的视频保留范围"
        : !input.promptText.trim()
          ? "请先填写提示词"
          : !input.workflowPath
            ? "请先选择视频续写 API 工作流"
            : !input.supportsVideoExtension
              ? "当前工作流未通过视频续写安全检查"
              : !input.safetySafe
                ? input.safetyMessage
                : !input.h3MotionContextReady
                  ? "请先在设置 → 节点与工作流中安装 H3 Motion Context，并重启 ComfyUI"
                  : !input.spectrumReady
                    ? "请先在设置中安装并加载 Spectrum 节点"
                    : "";
  }
  return !input.isR2V && !input.startImagePath
    ? "请先选择首帧图片"
    : !input.promptText.trim()
      ? "请先填写提示词"
      : input.turboCoreBlockReason || input.turboLoraBlockReason || input.selectedLoraBlockReason
        ? input.turboCoreBlockReason || input.turboLoraBlockReason || input.selectedLoraBlockReason
        : !input.workflowPath
          ? "请先选择该模型的 ComfyUI API 工作流"
          : !input.r2vSlotsReady
            ? "请先补齐 R2V 参考 Slot"
            : !input.safetySafe
              ? input.safetyMessage
              : !input.spectrumReady
                ? "请先在设置中安装并加载 Spectrum 节点"
                : "";
}

export function buildImageEditPageViewModel(
  options: CreateViewModelDependencies
): ImageEditPageViewModel {
  const {
    state,
    environmentScan,
    promptEnhanceMode,
    promptEnhancing,
    promptStarting,
    promptReleasing,
    promptRuntimeLoaded,
    enqueueBusy
  } = options;
  const draft = normalizeImageEditDraft(state.imageDraft);
  const imageCapability = imageModelCapabilityFor(draft.modelId);
  const basePicture = draft.pictures[0];
  const selectedTargetResolution = normalizeImageTargetResolution(
    draft.targetResolution,
    basePicture?.width ?? 0,
    basePicture?.height ?? 0
  );
  const imageResolutionOptions = imageResolutionOptionsFor(
    basePicture?.width ?? 0,
    basePicture?.height ?? 0
  );
  const imageModelProfiles = environmentScan?.modelProfiles.filter((profile) => profile.category === "image") ?? [];
  const imageModelOptions = imageModelProfiles.length
    ? imageModelProfiles
    : [
        { id: "qwen-image-edit-2511", name: "Qwen-Image-Edit-2511 · 图片处理", category: "image" as const, badge: "Qwen 2511", description: "", vram: "", available: false, integrated: true, components: [] },
        { id: "flux2-klein-4b", name: "FLUX.2 Klein 4B · 图片处理", category: "image" as const, badge: "约 13GB VRAM", description: "", vram: "", available: false, integrated: true, components: [] }
      ];
  const prompt = activeImagePrompt(draft);
  const imageProfile = environmentScan?.modelProfiles.find(
    (profile) => profile.id === draft.modelId
  );
  const promptStatus = promptModelStatus(state.settings, environmentScan);
  const promptRuntimeBusy = promptStarting || promptEnhancing || promptReleasing;
  const imagePromptModelSupportsImageEdit = promptModelSupportsImageEdit(state.settings.promptModelId);
  const imagePromptAiDisabled = promptRuntimeBusy || state.queueRunning || !prompt.text.trim() || !imagePromptModelSupportsImageEdit;
  const imageEnhanceMode: ImagePromptPreset = promptEnhanceMode === "faithful"
    ? "faithful"
    : "detail-enhance";
  const imagePromptOptimizeTitle = state.queueRunning
    ? "当前有任务运行，暂不能启动提示词模型"
    : !imagePromptModelSupportsImageEdit
      ? "当前选择的提示词模型没有可用适配器，请在设置中重新选择已接入的模型"
      : !prompt.text.trim()
        ? "请先输入图片编辑 Prompt"
        : isGemmaPromptModel(state.settings.promptModelId)
          ? "使用设置中选择的 Gemma Prompt Writer 优化"
          : "使用设置中选择的提示词模型优化";
  const incompletePicture = draft.pictures.find((picture) => !picture.absolutePath);
  const markupGuideCount = draft.modelId === "qwen-image-edit-2511"
    ? draft.pictures.filter((picture) => picture.markup?.objectCount && picture.markup.renderedPath.trim()).length
    : 0;
  const imageModelInputCount = draft.pictures.length + markupGuideCount;
  const enqueueBlockReason = imageEditEnqueueBlockReason(draft, imageProfile);
  const count = Math.min(10, Math.max(1, draft.outputCount));
  return {
    draft,
    prompt,
    promptRuntimeBusy,
    promptEnhancing,
    imageCapabilityName: imageCapability.name,
    imageCapabilityMaxPictures: imageCapability.maxPictures,
    imageModelOptionsMarkup: imageModelOptions.map((profile) => `<option value="${escapeHtml(profile.id)}" ${draft.modelId === profile.id ? "selected" : ""} ${isImageModelSelectable(profile) ? "" : "disabled"}>${escapeHtml(profile.name)}${isImageModelSelectable(profile) ? "" : ` · ${escapeHtml(imageWorkflowStatus(profile))}`}</option>`).join(""),
    imageQualityOptionsMarkup: imageCapability.qualityProfiles.map((profile) => `<option value="${escapeHtml(profile.id)}" ${draft.qualityProfile === profile.id ? "selected" : ""} ${imageQualityProfileRequiresLightning(profile.id) && !imageLightningComponentFound(imageProfile?.components ?? []) ? "disabled" : ""}>${escapeHtml(profile.label)} · ${profile.steps} 步${imageQualityProfileRequiresLightning(profile.id) && !imageLightningComponentFound(imageProfile?.components ?? []) ? " · 缺少 LoRA" : ""}</option>`).join(""),
    imageResolutionOptionsMarkup: imageResolutionOptions.map((option) => `<option value="${option.value}" ${selectedTargetResolution === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join(""),
    imageEnhanceMode,
    imagePromptOptimizeTitle,
    imagePromptAiDisabled,
    releasePromptControlTitle: options.promptRuntimeControlTitle(),
    releasePromptControlIconName: options.promptRuntimeControlIcon(),
    releasePromptControlDisabled: promptRuntimeBusy || state.queueRunning || (!promptRuntimeLoaded && !promptStatus.ready),
    markupGuideCount,
    imageModelInputCount,
    enqueueBlockReason,
    count,
    imageProfileStatusText: !imageProfile
      ? "加入队列时会重新扫描模型文件；任务启动时再验证 ComfyUI 运行节点。"
      : !imageProfile.available
        ? "当前缓存扫描显示组件不完整；仍可加入队列，届时会按已保存路径重新扫描确认。"
        : imageProfile.runtimeVerified && !imageProfile.runtimeReady
          ? `${imageWorkflowStatus(imageProfile)}；可先入队，任务启动时会再次验证。`
          : `${imageWorkflowStatus(imageProfile)}；加入队列时仍会复核模型文件。`,
    enqueueBusy
  };
}

export function buildVideoCreatePageViewModel(
  options: CreateViewModelDependencies
): VideoCreatePageViewModel {
  const {
    state,
    environmentScan,
    performanceMetrics,
    workflowCapabilities,
    bundledWorkflows,
    promptEnhanceMode,
    h3PromptPreset,
    promptEnhancing,
    promptStarting,
    promptReleasing,
    promptRuntimeLoaded,
    h3PromptBuilder,
    enqueueBusy
  } = options;
  const draft = state.draft;
  const isMiniMaxH3 = isMiniMaxH3Model(draft.modelId);
  const isR2V = isMiniMaxH3R2vModel(draft.modelId);
  const h3Mode = isMiniMaxH3 ? h3PromptModeForDraft(draft) : undefined;
  const activeH3PromptPreset = h3Mode
    ? h3PromptPresetForMode(h3Mode, h3PromptPreset)
    : h3PromptPreset;
  const enhanceMode = isMiniMaxH3
    ? promptEnhanceMode === "faithful" ? "faithful" : "h3-vision"
    : promptEnhanceMode === "faithful" ? "faithful" : "sulphur-native";
  const promptStatus = promptModelStatus(state.settings, environmentScan);
  const promptRuntimeBusy = promptStarting || promptEnhancing || promptReleasing;
  const promptAiDisabled = promptRuntimeBusy || state.queueRunning;
  const turboEnabled = isH3TurboEnabled(draft);
  const h3Steps = normalizeH3Steps(draft.steps, draft.modelId, draft.videoLoras);
  const turboLoraProfile = environmentScan?.modelProfiles.find(
    (profile) => profile.id === H3_TURBO_LORA_ID
  );
  const compatibleLoraDefinitions = BUILTIN_VIDEO_LORAS.filter((lora) =>
    videoLoraCompatibleWithDraft(lora, draft.modelId, draft.inputMode)
  );
  const addableLoraDefinitions = compatibleLoraDefinitions.filter((lora) =>
    !draft.videoLoras.some((selected) => selected.id === lora.id)
  );
  const installReadyLoraDefinitions = addableLoraDefinitions.filter((lora) =>
    environmentScan?.modelProfiles.find((item) => item.id === lora.id)?.available === true
  );
  const loraIssues = videoLoraConfigurationIssues({
    modelId: draft.modelId,
    inputMode: draft.inputMode,
    spectrumMode: draft.spectrumMode,
    attentionMode: state.settings.h3AttentionMode,
    videoLoras: draft.videoLoras
  });
  const loraBlockingIssue = loraIssues.find((issue) => issue.severity === "error");
  const scannedModelProfiles = environmentScan?.modelProfiles;
  const missingSelectedLora = scannedModelProfiles
    ? draft.videoLoras.find((lora) => !profileProvidesVideoLora(
        scannedModelProfiles.find((profile) => profile.id === lora.id),
        lora.filename
      ))
    : undefined;
  const spectrumNode = environmentScan?.customNodes.find(
    (node) => node.id === "spectrum-minimax-h3"
  );
  const spectrumLoaded = Boolean(spectrumNode?.loaded);
  const spectrumEligible = isMiniMaxH3SpectrumEligible(draft.modelId) && !turboEnabled;
  const spectrumReady = draft.spectrumMode !== "balanced" || (
    spectrumEligible && spectrumLoaded
  );
  const detectedVramTotalBytes = environmentScan?.gpus[0]?.vramTotalBytes ?? performanceMetrics?.vramTotalBytes ?? 0;
  const extending = draft.inputMode === "video";
  const h3MotionContextNode = environmentScan?.customNodes.find(
    (node) => node.id === "h3-motion-context"
  );
  const h3MotionContextReady = !extending || !isR2V || Boolean(
    h3MotionContextNode?.installed || h3MotionContextNode?.loaded
  );
  const prompt = activePrompt(draft);
  const interpolation = interpolationEstimate(draft);
  const safety = extending
    ? extensionSafetyForDraft(draft, state.settings)
    : generationSafetyForTask(draft);
  const supportsEndImage = workflowCapabilities[draft.workflowPath]?.supportsEndImage === true;
  const supportsVideoExtension = workflowCapabilities[draft.workflowPath]?.supportsVideoExtension === true;
  const selectedModelProfile = environmentScan?.modelProfiles.find(
    (profile) => profile.id === draft.modelId
  );
  const trimDuration = Math.max(0, draft.trimEndSeconds - draft.trimStartSeconds);
  const trimStartPercent = draft.sourceVideoDuration > 0
    ? draft.trimStartSeconds / draft.sourceVideoDuration * 100
    : 0;
  const trimEndPercent = draft.sourceVideoDuration > 0
    ? draft.trimEndSeconds / draft.sourceVideoDuration * 100
    : 100;
  const videoReady = Boolean(draft.sourceVideoPath && draft.sourceVideoDuration > 0);
  const r2vCounts = h3ReferenceSlotCounts(draft.h3ReferenceSlots);
  const r2vSlotsReady = extending || !isR2V || (
    draft.h3ReferenceSlots.length > 0 &&
    draft.h3ReferenceSlots.every((slot) => Boolean(slot.mediaPath))
  );
  const turboCoreBlockReason = turboEnabled &&
    Boolean(environmentScan?.comfyCompatibility.checkedFrom) &&
    !environmentScan?.comfyCompatibility.h3CoreSupported
    ? "LightX2V Turbo 需要 ComfyUI v0.31.0+ 原生音视频采样；请先在设置中更新核心"
    : "";
  const turboLoraBlockReason = turboEnabled && turboLoraProfile && !turboLoraProfile.available
    ? "LightX2V Turbo LoRA 文件缺失；请先在设置 → LoRA 中安装"
    : "";
  const selectedLoraBlockReason = loraBlockingIssue?.message ??
    (missingSelectedLora
      ? `${missingSelectedLora.name} 当前记录的文件未找到；请在设置 → LoRA 中重新扫描或安装`
      : "");
  const enqueueBlockReason = videoEnqueueBlockReason({
    promptText: prompt.text,
    extending,
    isR2V,
    videoReady,
    trimDuration,
    workflowPath: draft.workflowPath,
    supportsVideoExtension,
    safetySafe: safety.safe,
    safetyMessage: safety.message,
    h3MotionContextReady,
    spectrumReady,
    r2vSlotsReady,
    startImagePath: draft.startImagePath,
    turboCoreBlockReason,
    turboLoraBlockReason,
    selectedLoraBlockReason
  });
  return {
    draft,
    prompt,
    promptRuntimeBusy,
    promptEnhancing,
    extending,
    isR2V,
    isMiniMaxH3,
    h3Mode,
    enhanceMode,
    h3PromptEnhanceTitle: isMiniMaxH3
      ? h3PromptPresetDescriptions[activeH3PromptPreset]
      : "选择提示词扩写方式",
    releasePromptControlTitle: options.promptRuntimeControlTitle(),
    releasePromptControlIconName: options.promptRuntimeControlIcon(),
    releasePromptControlDisabled: promptRuntimeBusy || state.queueRunning || (!promptRuntimeLoaded && !promptStatus.ready),
    promptAiDisabled,
    promptEnhanceButtonTitle: promptAiDisabled && state.queueRunning
      ? "当前有视频任务运行，暂不能启动提示词模型"
      : promptAiDisabled
        ? "正在生成提示词"
        : isGemmaPromptModel(state.settings.promptModelId)
          ? "使用 ComfyUI H3 Prompt Writer 优化"
          : "使用 ComfyUI 原生 Qwen 模型优化",
    h3PromptPresetOptionsMarkup: isMiniMaxH3
      ? h3PromptPresetOptions(activeH3PromptPreset, isR2V)
      : "",
    promptSnippetOptionsMarkup: promptSnippetOptions(escapeHtml),
    h3PromptCheckMarkup: isMiniMaxH3
      ? h3PromptCheckMarkup(
          prompt.text,
          Boolean(draft.endImagePath),
          h3Mode,
          draft.h3ReferenceSlots.some((slot) => slot.mediaType === "image"),
          draft.h3ReferenceSlots.some((slot) => slot.mediaType === "video"),
          draft.duration,
          escapeHtml
        )
      : "",
    h3PromptBuilder,
    modelOptions: createModelOptionViewModels(
      draft,
      environmentScan,
      workflowCapabilities,
      bundledWorkflows
    ),
    resolutionOptionsMarkup: extending && !isMiniMaxH3
      ? `<option value="${state.settings.ltxExtensionResolution}" selected>${state.settings.ltxExtensionResolution}p · GGUF 保守预设</option>`
      : (isMiniMaxH3 ? [480, 540, 720, 768] as const : [480, 540, 720] as const).map((value) => {
          const [width, height] = outputDimensions({
            ...draft,
            resolution: value
          });
          const recommended =
            draft.modelId === "sulphur2" &&
            value === 720 &&
            detectedVramTotalBytes >= 20 * 1024 ** 3;
          const h3Label = isMiniMaxH3
            ? value === 480
              ? " · 低显存起步"
              : value === 768
                ? " · 高显存开放档"
                : ""
            : "";
          const vramLabel = recommended && detectedVramTotalBytes > 0
            ? ` · ${formatBytes(detectedVramTotalBytes)} 显存推荐`
            : "";
          return `<option value="${value}" ${draft.resolution === value ? "selected" : ""}>${value}p · ${width}×${height}${vramLabel}${h3Label}</option>`;
        }).join(""),
    stepsOptionsMarkup: turboEnabled
      ? `<option value="4" ${h3Steps === 4 ? "selected" : ""}>4 · 极限加速（实验）</option>
         <option value="6" ${h3Steps === 6 ? "selected" : ""}>6 · 加速预览</option>
         <option value="8" ${h3Steps === 8 || h3Steps > 8 ? "selected" : ""}>8 · 正式输出（推荐）</option>`
      : `<option value="20" ${h3Steps === 20 ? "selected" : ""}>20 · 标准质量（推荐）</option>
         <option value="16" ${h3Steps === 16 ? "selected" : ""}>16 · 平衡预览</option>
         <option value="12" ${h3Steps === 12 ? "selected" : ""}>12 · 快速预览</option>`,
    stepsTitle: turboEnabled
      ? "LightX2V Turbo 建议使用 8 步；6 步用于快速预览，4 步可能损失动态和音频质量。"
      : "只影响 H3；其他模型沿用各自工作流设置。",
    spectrumLabelMarkup: fieldLabelWithTip(
      "Spectrum 加速",
      extending && isR2V
        ? "Motion Context 官方建议关闭 Spectrum，避免固定上下文帧与音频质量退化。"
        : !spectrumEligible
          ? turboEnabled
            ? "LightX2V Turbo 当前使用专用低步数采样策略，不与 Spectrum 叠加。"
            : "当前模型暂不支持 Spectrum。"
          : !spectrumLoaded
            ? "请先在设置 → 节点与工作流中安装 Spectrum，并确认 ComfyUI 已重启加载。"
            : `Spectrum ${spectrumNode?.version ? `v${spectrumNode.version}` : "已加载"}，预计降低 20–35% 采样耗时；使用系统内存保存 H3 特征。`
    ),
    spectrumOptionsMarkup: `<option value="off" ${draft.spectrumMode !== "balanced" ? "selected" : ""}>关闭 · 原生完整计算</option>
      <option value="balanced" ${draft.spectrumMode === "balanced" ? "selected" : ""}>平衡模式 · 系统内存</option>`,
    spectrumTitle: extending && isR2V
      ? "Motion Context 官方建议关闭 Spectrum，避免固定上下文行与音频质量退化。"
      : !spectrumEligible
        ? "当前模型暂不支持 Spectrum。"
        : !spectrumLoaded
          ? "请先在设置 → 节点与工作流中安装 Spectrum，并确认 ComfyUI 已重启加载。"
          : "使用系统内存保存 H3 特征；不会占用额外模型权重。",
    spectrumModeDisabled: !(spectrumEligible && spectrumLoaded && !(extending && isR2V)),
    loraLabelMarkup: fieldLabelWithTip(
      "LoRA 叠加",
      "LoRA 会按列表顺序叠加到当前基础模型。每个 LoRA 只能用于其声明兼容的模型和输入模式；强度通常从 0.6–1.0 起步，过高可能造成画面失真。"
    ),
    installReadyLoraDefinitions,
    installReadyLoraEmptyLabel: !environmentScan
      ? "等待环境扫描"
      : addableLoraDefinitions.length
        ? "兼容 LoRA 尚未安装"
        : "没有更多兼容 LoRA",
    loraIssues,
    trimDuration,
    trimStartPercent,
    trimEndPercent,
    videoReady,
    r2vImageCount: r2vCounts.imageCount,
    r2vVideoCount: r2vCounts.videoCount,
    r2vTotalCount: r2vCounts.total,
    r2vSlotsReady,
    safetySafe: safety.safe,
    safetyMessage: safety.message,
    safetyMaxDurationSeconds: safety.maxDurationSeconds,
    safetyMaxGeneratedFrames: safety.maxGeneratedFrames,
    interpolationMultiplier: interpolation.multiplier,
    interpolationGeneratedFrames: interpolation.generatedFrames,
    interpolationOutputFrames: interpolation.outputFrames,
    supportsEndImage,
    selectedWorkflowDescription: extending && !supportsVideoExtension
      ? `${selectedModelProfile?.available ? `${modelName(draft.modelId)} 模型组件已安装完整；` : "模型组件尚未安装完整；"}当前工作流未通过原生续写安全检查。`
      : draft.workflowPath
        ? escapeHtml(Object.values(bundledWorkflows).find((workflow) => workflow.path === draft.workflowPath)?.label ?? draft.workflowPath)
        : "为当前模型选择从 ComfyUI 导出的 API 格式 JSON",
    enqueueBlockReason,
    enqueueDisabled: Boolean(enqueueBlockReason),
    enqueueBusy
  };
}
