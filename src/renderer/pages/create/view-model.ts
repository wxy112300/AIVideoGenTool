import type {
  AppState,
  BundledWorkflow,
  Draft,
  EnvironmentScanResult,
  H3PromptPreset,
  ImageEditDraft,
  ImagePromptPreset,
  PerformanceMetrics,
  PromptProgress,
  PromptEnhanceMode,
  Settings,
  WorkflowCapabilities
} from "../../../types";
import { createTranslator, type Translate } from "../../../core/i18n";
import { activePromptIndexForDraft, promptVersionsForDraft } from "../../../core/draft-prompts";
import { uiKeys } from "../../../core/i18n-keys";
import { modelCatalog, sortProfilesByCatalogOrder } from "../../../core/catalog";
import { SPECTRUM_TURBO_MINIMUM_VERSION } from "../../../core/catalog";
import { releaseVersionAtLeast } from "../../../core/release-version";
import { h3PromptPackFor, h3PromptPresetForMode, qwenImagePromptPackFor } from "../../prompt-packs";
import {
  imageModelCapabilityFor,
  imageLightningComponentFound,
  imageQualityProfileRequiresLightning,
  imageAspectRatioOptionsFor,
  imageResolutionOptionsFor,
  imageOutputCountMax,
  normalizeImageAspectRatio,
  normalizeImageTargetResolution,
  cachedImageProfileAllowsEnqueue
} from "../../../core/image-workflow";
import { normalizeImageEditDraft } from "../../../core/image-project";
import { promptModelSupportsImageEdit, isGemmaPromptModel } from "../../../core/prompt-models";
import {
  ensureMotionContextSourceSlot,
  h3ReferenceSlotCounts,
  motionContextReferenceSlotsReady
} from "../../../core/h3-reference";
import {
  generationSafetyForTask,
  isMiniMaxH3Fl2vaModel,
  isMiniMaxH3Model,
  isMiniMaxH3R2vModel,
  isMiniMaxH3BoundaryExtensionModel,
  outputDimensions
} from "../../../core/workflow";
import {
  BUILTIN_VIDEO_LORAS,
  H3_SLA_TURBO_LORA_ID,
  H3_TURBO_LORA_ID,
  isH3SlaTurboLoraId,
  isH3TurboLoraId,
  profileProvidesVideoLora,
  videoLoraCompatibleWithModel,
  videoLoraCompatibleWithDraft
} from "../../../core/video-loras";
import { normalizeVideoSteps, resolveVideoGenerationPolicy } from "../../../core/video-policy";
import { loraRuleText } from "../../../core/catalog/loras/locales";
import { escapeHtml } from "../../shared/dom";
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
  h3PromptPresetOptions,
  interpolationEstimate,
  promptSnippetOptions
} from "./helpers";
import type { ImageEditPageViewModel, VideoCreatePageViewModel } from "./page";
import type { PromptRuntimeViewProjection } from "../../../core/prompt-runtime-view";

export interface CreateViewModelDependencies {
  t: Translate;
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
  promptProgress: PromptProgress | null;
  enqueueBusy: boolean;
  promptRuntimeControlTitle(settings?: Settings): string;
  promptRuntimeControlIcon(): string;
  promptRuntimeView: PromptRuntimeViewProjection;
}

export function imageEditEnqueueBlockReason(
  draft: ImageEditDraft,
  imageProfile: EnvironmentScanResult["modelProfiles"][number] | undefined,
  t: Translate = createTranslator("zh-CN").t
): string {
  const imageCapability = imageModelCapabilityFor(draft.modelId);
  const incompletePicture = draft.pictures.find((picture) => !picture.absolutePath);
  const markupGuideCount = draft.modelId === "qwen-image-edit-2511"
    ? draft.pictures.filter((picture) => picture.markup?.objectCount && picture.markup.renderedPath.trim()).length
    : 0;
  const imageModelInputCount = draft.pictures.length + markupGuideCount;
  const prompt = activeImagePrompt(draft);
  const referenceBlockReason = !draft.pictures.length
    ? imageCapability.supportsTextOnly
      ? ""
      : t(uiKeys.create.validation.imageAddSlot)
    : !draft.pictures[0]?.absolutePath
      ? t(uiKeys.create.validation.imageBaseMissing)
      : incompletePicture
        ? t(uiKeys.create.validation.imagePictureMissing, { slot: incompletePicture.pictureNumber })
        : draft.pictures.length > imageCapability.maxPictures
          ? t(uiKeys.create.validation.imageTooMany, { name: imageCapability.name, count: imageCapability.maxPictures })
          : imageModelInputCount > imageCapability.maxPictures
            ? t(uiKeys.create.validation.imageMarkupTooMany, { count: markupGuideCount })
            : imageCapability.requiresMask && !draft.pictures[0]?.mask?.regionCount
              ? "请先在原图上绘制并保存 Mask"
              : "";
  return referenceBlockReason || imageCapability.requiresPrompt !== false && !prompt.text.trim()
    ? referenceBlockReason || t(uiKeys.create.validation.imagePromptMissing)
    : imageProfile?.missingCustomNodeNames?.length
      ? `缺少必需节点：${imageProfile.missingCustomNodeNames.join("、")}。请先在设置 → 节点与依赖中安装。`
      : !cachedImageProfileAllowsEnqueue(imageProfile)
        ? !imageProfile?.available
          ? `${imageCapability.name} 模型文件不完整，请先在设置 → 图片模型中安装并重新扫描。`
          : t(uiKeys.create.validation.imageWorkflowMissing, { name: imageCapability.name })
        : "";
}

export interface VideoEnqueueBlockReasonInput {
  t?: Translate;
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
  allowTextOnly?: boolean;
  turboCoreBlockReason: string;
  turboLoraBlockReason: string;
  selectedLoraBlockReason: string;
}

export function videoEnqueueBlockReason(
  input: VideoEnqueueBlockReasonInput
): string {
  const t = input.t ?? createTranslator("zh-CN").t;
  if (input.extending) {
    return !input.videoReady
      ? t(uiKeys.create.validation.videoMissing)
      : input.trimDuration <= 0
        ? t(uiKeys.create.validation.invalidTrim)
        : !input.promptText.trim()
          ? t(uiKeys.create.validation.promptMissing)
          : !input.workflowPath
            ? t(uiKeys.create.validation.extensionWorkflowMissing)
            : !input.supportsVideoExtension
              ? t(uiKeys.create.validation.extensionUnsafe)
              : !input.safetySafe
                ? input.safetyMessage
                : !input.h3MotionContextReady
                  ? t(uiKeys.create.validation.motionContextMissing)
                  : !input.r2vSlotsReady
                    ? t(uiKeys.create.validation.r2vSlotMissing)
                  : !input.spectrumReady
                    ? t(uiKeys.create.validation.spectrumMissing)
                    : "";
  }
  return !input.isR2V && !input.allowTextOnly && !input.startImagePath
    ? t(uiKeys.create.validation.startFrameMissing)
    : !input.promptText.trim()
      ? t(uiKeys.create.validation.promptMissing)
      : input.turboCoreBlockReason || input.turboLoraBlockReason || input.selectedLoraBlockReason
        ? input.turboCoreBlockReason || input.turboLoraBlockReason || input.selectedLoraBlockReason
        : !input.workflowPath
          ? t(uiKeys.create.validation.modelWorkflowMissing)
          : !input.r2vSlotsReady
            ? t(uiKeys.create.validation.r2vSlotMissing)
            : !input.safetySafe
              ? input.safetyMessage
              : !input.spectrumReady
                ? t(uiKeys.create.validation.spectrumMissing)
                : "";
}

export function buildImageEditPageViewModel(
  options: CreateViewModelDependencies
): ImageEditPageViewModel {
  const {
    t,
    state,
    environmentScan,
    promptEnhanceMode,
    promptEnhancing,
    promptStarting,
    promptReleasing,
    promptRuntimeLoaded,
    promptRuntimeView,
    enqueueBusy
  } = options;
  const draft = normalizeImageEditDraft(state.imageDraft);
  const imageCapability = imageModelCapabilityFor(draft.modelId);
  const promptless = imageCapability.requiresPrompt === false;
  const basePicture = draft.pictures[0];
  const selectedAspectRatio = normalizeImageAspectRatio(draft.aspectRatio ?? "source");
  const selectedTargetResolution = normalizeImageTargetResolution(
    draft.targetResolution,
    basePicture?.width ?? 0,
    basePicture?.height ?? 0
  );
  const imageAspectRatioOptions = imageAspectRatioOptionsFor(
    basePicture?.width ?? 0,
    basePicture?.height ?? 0,
    imageCapability.textOnlyOutputWidth ?? 0,
    imageCapability.textOnlyOutputHeight ?? 0
  );
  const imageResolutionOptions = imageResolutionOptionsFor(
    basePicture?.width ?? 0,
    basePicture?.height ?? 0,
    imageCapability.textOnlyOutputWidth ?? 0,
    imageCapability.textOnlyOutputHeight ?? 0,
    selectedAspectRatio
  );
  const imageModelProfiles = sortProfilesByCatalogOrder(
    environmentScan?.modelProfiles.filter((profile) => profile.category === "image") ?? [],
    modelCatalog,
    "image"
  );
  const imageModelOptions = imageModelProfiles.length
    ? imageModelProfiles
    : modelCatalog.list("image").map((entry) => ({
        id: entry.definition.id,
        name: modelCatalog.localized(entry.definition.id, state.settings.uiLocale)?.name ?? entry.definition.id,
        category: "image" as const,
        badge: modelCatalog.localized(entry.definition.id, state.settings.uiLocale)?.badge ?? "",
        description: modelCatalog.localized(entry.definition.id, state.settings.uiLocale)?.description ?? "",
        vram: entry.definition.scan?.vram ?? "",
        available: false,
        integrated: entry.definition.scan?.integrated !== false,
        components: []
      }));
  const prompt = activeImagePrompt(draft, state.settings.uiLocale);
  const imageProfile = environmentScan?.modelProfiles.find(
    (profile) => profile.id === draft.modelId
  );
  const promptStatus = promptModelStatus(state.settings, environmentScan, t);
  const promptRuntimeBusy = promptStarting || promptRuntimeView.left.busy || promptRuntimeView.right.busy;
  const imagePromptModelSupportsImageEdit = promptModelSupportsImageEdit(state.settings.promptModelId);
  const imagePromptEnhanceBlocked = promptStarting || promptRuntimeView.right.disabled || state.queueRunning || !imagePromptModelSupportsImageEdit;
  const imagePromptAiDisabled = imagePromptEnhanceBlocked || !prompt.text.trim();
  const imageEnhanceMode: ImagePromptPreset = promptEnhanceMode === "faithful"
    ? "faithful"
    : "detail-enhance";
  const imagePromptPack = qwenImagePromptPackFor(state.settings.uiLocale);
  const imagePromptOptimizeTitle = state.queueRunning
    ? t(uiKeys.create.validation.promptTaskRunning)
    : !imagePromptModelSupportsImageEdit
      ? t(uiKeys.create.validation.promptAdapterMissing)
      : !prompt.text.trim()
        ? t(uiKeys.create.validation.imagePromptEmpty)
        : isGemmaPromptModel(state.settings.promptModelId)
          ? t(uiKeys.create.validation.gemmaOptimize)
          : t(uiKeys.create.validation.promptOptimize);
  const incompletePicture = draft.pictures.find((picture) => !picture.absolutePath);
  const markupGuideCount = draft.modelId === "qwen-image-edit-2511"
    ? draft.pictures.filter((picture) => picture.markup?.objectCount && picture.markup.renderedPath.trim()).length
    : 0;
  const imageModelInputCount = draft.pictures.length + markupGuideCount;
  const enqueueBlockReason = imageEditEnqueueBlockReason(draft, imageProfile, t);
  const count = imageCapability.deterministic ? 1 : Math.min(imageOutputCountMax, Math.max(1, draft.outputCount));
  const backgroundRemoval = imageCapability.operation === "background-removal";
  const promptlessTitle = t(backgroundRemoval
    ? uiKeys.create.imageEdit.promptlessBackgroundRemovalTitle
    : uiKeys.create.imageEdit.promptlessLocalRemovalTitle);
  const promptlessDescription = t(backgroundRemoval
    ? uiKeys.create.imageEdit.promptlessBackgroundRemovalDescription
    : uiKeys.create.imageEdit.promptlessLocalRemovalDescription);
  const promptlessSummary = t(backgroundRemoval
    ? uiKeys.create.imageEdit.promptlessBackgroundRemovalSummary
    : uiKeys.create.imageEdit.promptlessLocalRemovalSummary, { count });
  const promptlessResultDescription = t(backgroundRemoval
    ? uiKeys.create.imageEdit.promptlessBackgroundRemovalResult
    : uiKeys.create.imageEdit.promptlessLocalRemovalResult);
  return {
    draft,
    prompt,
    promptRuntimeBusy,
    promptEnhancing,
    imageCapabilityName: imageCapability.name,
    imageCapabilityMaxPictures: imageCapability.maxPictures,
    imageModelOptionsMarkup: imageModelOptions.map((profile) => `<option value="${escapeHtml(profile.id)}" ${draft.modelId === profile.id ? "selected" : ""} ${isImageModelSelectable(profile) ? "" : "disabled"}>${escapeHtml(profile.name)}${isImageModelSelectable(profile) ? "" : ` · ${escapeHtml(imageWorkflowStatus(profile, t))}`}</option>`).join(""),
    imageQualityOptionsMarkup: imageCapability.qualityProfiles.map((profile) => `<option value="${escapeHtml(profile.id)}" ${draft.qualityProfile === profile.id ? "selected" : ""} ${imageQualityProfileRequiresLightning(profile.id) && !imageLightningComponentFound(imageProfile?.components ?? []) ? "disabled" : ""}>${escapeHtml(profile.label)}${profile.steps > 0 ? ` · ${profile.steps} ${t(uiKeys.create.videoSettings.stepsUnit)}` : ""}${imageQualityProfileRequiresLightning(profile.id) && !imageLightningComponentFound(imageProfile?.components ?? []) ? ` · ${t(uiKeys.create.videoSettings.missingLora)}` : ""}</option>`).join(""),
    imageAspectRatioOptionsMarkup: imageAspectRatioOptions.map((option) => `<option value="${option.value}" ${selectedAspectRatio === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join(""),
    imageResolutionOptionsMarkup: imageResolutionOptions.map((option) => `<option value="${option.value}" ${selectedTargetResolution === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join(""),
    imageEnhanceMode,
    imageDetailEnhanceTitle: imagePromptPack.presetDescriptions["detail-enhance"],
    imageFaithfulEnhanceTitle: imagePromptPack.presetDescriptions.faithful,
    imagePromptOptimizeTitle,
    imagePromptEnhanceBlocked,
    imagePromptAiDisabled,
    releasePromptControlTitle: options.promptRuntimeControlTitle(),
    releasePromptControlIconName: promptRuntimeView.left.icon,
    releasePromptControlDisabled: promptStarting || promptRuntimeView.left.disabled || state.queueRunning,
    markupGuideCount,
    imageModelInputCount,
    enqueueBlockReason,
    count,
    outputCountVisible: !imageCapability.deterministic,
    promptlessTitle,
    promptlessDescription,
    promptlessSummary,
    promptlessResultDescription,
    imageProfileStatusText: !imageProfile
      ? t(uiKeys.create.validation.imageRescan)
      : !imageProfile.available
        ? `${imageCapability.name} 模型文件不完整，当前不可选择或加入队列。`
        : imageProfile.missingCustomNodeNames?.length
          ? `缺少必需节点：${imageProfile.missingCustomNodeNames.join("、")}。模型可以选择，但安装节点前不能加入队列。`
        : imageProfile.runtimeVerified && !imageProfile.runtimeReady
          ? t(uiKeys.create.validation.imageRuntimeRecheck, { status: imageWorkflowStatus(imageProfile, t) })
          : t(uiKeys.create.validation.imageWorkflowRecheck, { status: imageWorkflowStatus(imageProfile, t) }),
    enqueueBusy,
    promptless,
    maskRequired: imageCapability.requiresMask === true,
    sourceResolutionOnly: imageCapability.sourceResolutionOnly === true,
    imageAspectRatioVisible: imageCapability.sourceResolutionOnly !== true,
    imageResolutionVisible: imageCapability.sourceResolutionOnly !== true,
    supportsTextOnly: imageCapability.supportsTextOnly === true,
    maskSupported: imageCapability.supportsMask === true,
    annotationSupported: imageCapability.supportsMarkup === true
  };
}

export function buildVideoCreatePageViewModel(
  options: CreateViewModelDependencies
): VideoCreatePageViewModel {
  const {
    t,
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
    promptProgress,
    promptRuntimeView,
    enqueueBusy
  } = options;
  const draft = state.draft;
  const h3PromptPack = h3PromptPackFor(state.settings.uiLocale);
  const isMiniMaxH3 = isMiniMaxH3Model(draft.modelId);
  const isR2V = isMiniMaxH3R2vModel(draft.modelId);
  const extending = draft.inputMode === "video";
  const referenceSlots = extending && isR2V
    ? ensureMotionContextSourceSlot(draft.h3ReferenceSlots, draft.sourceVideoPath)
    : draft.h3ReferenceSlots;
  if (extending && isR2V && JSON.stringify(referenceSlots) !== JSON.stringify(draft.h3ReferenceSlots)) {
    draft.h3ReferenceSlots = referenceSlots;
  }
  const h3Mode = isMiniMaxH3 ? h3PromptModeForDraft(draft) : undefined;
  const extensionBoundaryAvailable = extending && Boolean(draft.sourceVideoPath) &&
    draft.trimEndSeconds > draft.trimStartSeconds;
  const referenceAutoPromptAvailable = isMiniMaxH3 && (
    extensionBoundaryAvailable || (isR2V
      ? referenceSlots.some((slot) => Boolean(slot.mediaPath))
      : Boolean(draft.startImagePath || draft.endImagePath)
    )
  );
  const activeH3PromptPreset = h3Mode
    ? h3PromptPresetForMode(h3Mode, h3PromptPreset)
    : h3PromptPreset;
  const enhanceMode = isMiniMaxH3
    ? promptEnhanceMode === "faithful" ? "faithful" : "h3-vision"
    : promptEnhanceMode === "faithful" ? "faithful" : "sulphur-native";
  const promptStatus = promptModelStatus(state.settings, environmentScan, t);
  const promptRuntimeBusy = promptStarting || promptRuntimeView.left.busy || promptRuntimeView.right.busy;
  const promptAiDisabled = promptStarting || promptRuntimeView.right.disabled || state.queueRunning;
  const videoPolicy = resolveVideoGenerationPolicy({
    modelId: draft.modelId,
    inputMode: draft.inputMode,
    spectrumMode: draft.spectrumMode,
    attentionMode: state.settings.h3AttentionMode,
    videoLoras: draft.videoLoras,
    locale: state.settings.uiLocale
  });
  const turboEnabled = videoPolicy.turboEnabled;
  const h3Steps = normalizeVideoSteps(draft.steps, videoPolicy);
  const selectedTurboLora = draft.videoLoras.find((lora) =>
    isH3TurboLoraId(lora.id) && videoLoraCompatibleWithModel(lora, draft.modelId)
  );
  const turboLoraProfile = environmentScan?.modelProfiles.find(
    (profile) => profile.id === (selectedTurboLora?.id ?? H3_TURBO_LORA_ID)
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
  const loraIssues = videoPolicy.issues;
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
  const spectrumTurboCompatible = !turboEnabled || releaseVersionAtLeast(
    spectrumNode?.version ?? "",
    SPECTRUM_TURBO_MINIMUM_VERSION
  );
  const spectrumEligible = videoPolicy.spectrum.allowed && spectrumTurboCompatible;
  const spectrumReady = draft.spectrumMode !== "balanced" || (spectrumEligible && spectrumLoaded);
  const resolutionOptions = isMiniMaxH3
    ? modelCatalog.get(draft.modelId)?.definition.capabilities?.resolutions ?? [360, 480, 540, 720, 768]
    : [480, 540, 720];
  const h3MotionContextNode = environmentScan?.customNodes.find(
    (node) => node.id === "h3-motion-context"
  );
  const h3MotionContextReady = !extending || !isR2V || Boolean(
    h3MotionContextNode?.installed || h3MotionContextNode?.loaded
  );
  const slaTurboSelected = draft.videoLoras.some((lora) =>
    isH3SlaTurboLoraId(lora.id) && videoLoraCompatibleWithModel(lora, draft.modelId)
  );
  const slaNode = environmentScan?.customNodes.find((node) => node.id === "plaguekind-h3-sla");
  const prompt = activePrompt(draft, state.settings.uiLocale);
  const promptVersionIndex = activePromptIndexForDraft(draft);
  const promptVersionCount = promptVersionsForDraft(draft).length;
  const interpolation = interpolationEstimate(draft);
  const safety = extending
    ? extensionSafetyForDraft(draft, state.settings)
    : generationSafetyForTask(draft, state.settings.uiLocale);
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
  const r2vCounts = h3ReferenceSlotCounts(referenceSlots);
  const r2vSlotsReady = !isR2V
    ? true
    : extending
      ? motionContextReferenceSlotsReady(referenceSlots, draft.sourceVideoPath)
      : referenceSlots.length > 0 && referenceSlots.every((slot) => Boolean(slot.mediaPath));
  const turboCoreBlockReason = turboEnabled &&
    Boolean(environmentScan?.comfyCompatibility.checkedFrom) &&
    !environmentScan?.comfyCompatibility.h3CoreSupported
    ? t(uiKeys.create.validation.turboCoreMissing)
    : "";
  const turboLoraBlockReason = turboEnabled && turboLoraProfile && !turboLoraProfile.available
    ? t(uiKeys.create.validation.turboLoraMissing)
    : "";
  const slaNodeBlockReason = slaTurboSelected && environmentScan && !slaNode?.loaded
    ? loraRuleText(
        H3_SLA_TURBO_LORA_ID,
        slaNode?.installed ? "slaNodeRestart" : "slaNodeMissing",
        state.settings.uiLocale
      )
    : "";
  const selectedLoraBlockReason = loraBlockingIssue?.message ??
    (missingSelectedLora
      ? t(uiKeys.create.validation.selectedLoraMissing, { name: missingSelectedLora.name })
      : slaNodeBlockReason);
  const enqueueBlockReason = videoEnqueueBlockReason({
    t,
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
    allowTextOnly: h3Mode === "T2VA",
    turboCoreBlockReason,
    turboLoraBlockReason,
    selectedLoraBlockReason
  });
  return {
    draft,
    prompt,
    promptVersionIndex,
    promptVersionCount,
    promptRuntimeBusy,
    promptEnhancing,
    promptProgress,
    extending,
    isR2V,
    isMiniMaxH3,
    h3Mode,
    enhanceMode,
    h3PromptEnhanceTitle: isMiniMaxH3
      ? h3PromptPack.presetDescriptions[activeH3PromptPreset]
      : h3PromptPack.ui.t("enhanceMode"),
    referenceAutoPromptAvailable,
    promptUi: h3PromptPack.ui,
    releasePromptControlTitle: options.promptRuntimeControlTitle(),
    releasePromptControlIconName: promptRuntimeView.left.icon,
    releasePromptControlDisabled: promptStarting || promptRuntimeView.left.disabled || state.queueRunning,
    promptAiDisabled,
    promptEnhanceButtonTitle: promptAiDisabled && state.queueRunning
      ? t(uiKeys.create.validation.promptTaskRunning)
      : promptAiDisabled
        ? h3PromptPack.ui.t("optimizing")
        : referenceAutoPromptAvailable && !prompt.text.trim()
          ? h3PromptPack.ui.t("autoPromptHint")
        : isGemmaPromptModel(state.settings.promptModelId)
          ? t(uiKeys.create.validation.gemmaOptimize)
          : t(uiKeys.create.validation.promptOptimize),
    h3PromptPresetOptionsMarkup: isMiniMaxH3
      ? h3PromptPresetOptions(activeH3PromptPreset, isR2V, state.settings.uiLocale)
      : "",
    promptSnippetOptionsMarkup: promptSnippetOptions(escapeHtml, state.settings.uiLocale),
    h3PromptCheckMarkup: isMiniMaxH3
      ? h3PromptCheckMarkup(
          prompt.text,
          Boolean(draft.endImagePath),
          h3Mode,
          draft.h3ReferenceSlots.some((slot) => slot.mediaType === "image"),
          draft.h3ReferenceSlots.some((slot) => slot.mediaType === "video"),
          draft.duration,
          escapeHtml,
          h3PromptPack.ui
        )
      : "",
    modelOptions: createModelOptionViewModels(
      draft,
      environmentScan,
      workflowCapabilities,
      bundledWorkflows,
      t
    ),
    resolutionOptionsMarkup: extending && !isMiniMaxH3
      ? `<option value="${state.settings.ltxExtensionResolution}" selected>${state.settings.ltxExtensionResolution}p</option>`
      : resolutionOptions.map((value) => {
          const [width, height] = outputDimensions({
            ...draft,
            resolution: value as Draft["resolution"]
          });
          return `<option value="${value}" ${draft.resolution === value ? "selected" : ""}>${value}p · ${width}×${height}</option>`;
        }).join(""),
    stepsOptionsMarkup: videoPolicy.steps.options.map((value) => {
      const label = turboEnabled
        ? value === 4
          ? t(uiKeys.create.options.turboStepsExperimental)
          : value === 6
            ? t(uiKeys.create.options.turboStepsPreview)
            : t(uiKeys.create.options.turboStepsOutput)
        : value === videoPolicy.steps.defaultValue
          ? t(uiKeys.create.options.standardStepsOutput)
          : value === Math.max(...videoPolicy.steps.options)
            ? t(uiKeys.create.options.balancedStepsPreview)
            : t(uiKeys.create.options.fastStepsPreview);
      return `<option value="${value}" ${h3Steps === value ? "selected" : ""}>${value} · ${label}</option>`;
    }).join(""),
    stepsTitle: turboEnabled
      ? t(uiKeys.create.options.turboStepsTitle)
      : t(uiKeys.create.options.h3StepsTitle),
    spectrumLabelMarkup: fieldLabelWithTip(
      t(uiKeys.create.validation.spectrumLabel),
      extending && isR2V
        ? t(uiKeys.create.validation.spectrumMotionContext)
        : !spectrumEligible
          ? turboEnabled && !spectrumTurboCompatible
            ? t(uiKeys.create.validation.spectrumTurboUpdate, { version: SPECTRUM_TURBO_MINIMUM_VERSION })
            : t(uiKeys.create.validation.spectrumUnsupported)
          : !spectrumLoaded
            ? t(uiKeys.create.validation.spectrumInstall)
            : t(uiKeys.create.validation.spectrumLoaded, { version: spectrumNode?.version ? `v${spectrumNode.version}` : t(uiKeys.create.options.spectrumLoaded) })
    ),
    spectrumOptionsMarkup: `<option value="off" ${draft.spectrumMode !== "balanced" ? "selected" : ""}>${t(uiKeys.create.options.spectrumOff)}</option>
      <option value="balanced" ${draft.spectrumMode === "balanced" ? "selected" : ""} ${spectrumEligible && spectrumLoaded ? "" : "disabled"}>${t(uiKeys.create.options.spectrumBalanced)}</option>`,
    spectrumTitle: extending && isR2V
      ? t(uiKeys.create.validation.spectrumMotionContext)
      : !spectrumEligible
        ? turboEnabled && !spectrumTurboCompatible
          ? t(uiKeys.create.validation.spectrumTurboUpdate, { version: SPECTRUM_TURBO_MINIMUM_VERSION })
          : t(uiKeys.create.validation.spectrumUnsupported)
        : !spectrumLoaded
          ? t(uiKeys.create.validation.spectrumInstall)
          : t(uiKeys.create.validation.spectrumNative),
    spectrumModeDisabled: draft.spectrumMode !== "balanced" && !(spectrumEligible && spectrumLoaded),
    loraLabelMarkup: fieldLabelWithTip(
      t(uiKeys.create.validation.loraLabel),
      t(uiKeys.create.validation.loraDescription)
    ),
    installReadyLoraDefinitions,
    installReadyLoraEmptyLabel: !environmentScan
      ? t(uiKeys.create.validation.loraScanWaiting)
      : addableLoraDefinitions.length
        ? t(uiKeys.create.validation.loraNotInstalled)
        : t(uiKeys.create.validation.loraNoMore),
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
      ? `${selectedModelProfile?.available ? t(uiKeys.create.validation.workflowComponentsReady, { name: modelName(draft.modelId, state.settings.uiLocale) }) : t(uiKeys.create.validation.workflowComponentsMissing)}${t(uiKeys.create.validation.workflowSafetyFailed)}`
      : draft.workflowPath
        ? escapeHtml(Object.values(bundledWorkflows).find((workflow) => workflow.path === draft.workflowPath)?.label ?? draft.workflowPath)
        : t(uiKeys.create.validation.chooseApiWorkflow),
    enqueueBlockReason,
    enqueueDisabled: Boolean(enqueueBlockReason),
    enqueueBusy
  };
}
