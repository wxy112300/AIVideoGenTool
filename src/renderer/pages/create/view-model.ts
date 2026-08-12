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
import { createTranslator, type Translate } from "../../../core/i18n";
import { activePromptIndexForDraft, promptVersionsForDraft } from "../../../core/draft-prompts";
import { uiKeys } from "../../../core/i18n-keys";
import { modelCatalog } from "../../../core/catalog";
import { h3PromptPackFor, h3PromptPresetForMode } from "../../prompt-packs";
import {
  imageModelCapabilityFor,
  imageLightningComponentFound,
  imageQualityProfileRequiresLightning,
  imageResolutionOptionsFor,
  normalizeImageTargetResolution,
  cachedImageProfileAllowsEnqueue
} from "../../../core/image-workflow";
import { normalizeImageEditDraft } from "../../../core/image-project";
import { promptModelSupportsImageEdit, isGemmaPromptModel } from "../../../core/prompt-models";
import { h3ReferenceSlotCounts } from "../../../core/h3-reference";
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
  H3_TURBO_LORA_ID,
  profileProvidesVideoLora,
  videoLoraCompatibleWithDraft
} from "../../../core/video-loras";
import { normalizeVideoSteps, resolveVideoGenerationPolicy } from "../../../core/video-policy";
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
  h3PromptPresetOptions,
  interpolationEstimate,
  promptSnippetOptions
} from "./helpers";
import type { ImageEditPageViewModel, VideoCreatePageViewModel } from "./page";

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
  h3PromptBuilder: H3PromptBuilderInput;
  enqueueBusy: boolean;
  promptRuntimeControlTitle(settings?: Settings): string;
  promptRuntimeControlIcon(): string;
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
  return !draft.pictures.length
    ? t(uiKeys.create.validation.imageAddSlot)
    : !draft.pictures[0]?.absolutePath
      ? t(uiKeys.create.validation.imageBaseMissing)
      : incompletePicture
        ? t(uiKeys.create.validation.imagePictureMissing, { slot: incompletePicture.pictureNumber })
        : draft.pictures.length > imageCapability.maxPictures
          ? t(uiKeys.create.validation.imageTooMany, { name: imageCapability.name, count: imageCapability.maxPictures })
          : imageModelInputCount > imageCapability.maxPictures
            ? t(uiKeys.create.validation.imageMarkupTooMany, { count: markupGuideCount })
            : !prompt.text.trim()
              ? t(uiKeys.create.validation.imagePromptMissing)
              : !cachedImageProfileAllowsEnqueue(imageProfile)
                ? t(uiKeys.create.validation.imageWorkflowMissing, { name: imageCapability.name })
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
                  : !input.spectrumReady
                    ? t(uiKeys.create.validation.spectrumMissing)
                    : "";
  }
  return !input.isR2V && !input.startImagePath
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
  const promptRuntimeBusy = promptStarting || promptEnhancing || promptReleasing;
  const imagePromptModelSupportsImageEdit = promptModelSupportsImageEdit(state.settings.promptModelId);
  const imagePromptAiDisabled = promptRuntimeBusy || state.queueRunning || !prompt.text.trim() || !imagePromptModelSupportsImageEdit;
  const imageEnhanceMode: ImagePromptPreset = promptEnhanceMode === "faithful"
    ? "faithful"
    : "detail-enhance";
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
  const count = Math.min(10, Math.max(1, draft.outputCount));
  return {
    draft,
    prompt,
    promptRuntimeBusy,
    promptEnhancing,
    imageCapabilityName: imageCapability.name,
    imageCapabilityMaxPictures: imageCapability.maxPictures,
    imageModelOptionsMarkup: imageModelOptions.map((profile) => `<option value="${escapeHtml(profile.id)}" ${draft.modelId === profile.id ? "selected" : ""} ${isImageModelSelectable(profile) ? "" : "disabled"}>${escapeHtml(profile.name)}${isImageModelSelectable(profile) ? "" : ` · ${escapeHtml(imageWorkflowStatus(profile, t))}`}</option>`).join(""),
    imageQualityOptionsMarkup: imageCapability.qualityProfiles.map((profile) => `<option value="${escapeHtml(profile.id)}" ${draft.qualityProfile === profile.id ? "selected" : ""} ${imageQualityProfileRequiresLightning(profile.id) && !imageLightningComponentFound(imageProfile?.components ?? []) ? "disabled" : ""}>${escapeHtml(profile.label)} · ${profile.steps} ${t(uiKeys.create.videoSettings.stepsUnit)}${imageQualityProfileRequiresLightning(profile.id) && !imageLightningComponentFound(imageProfile?.components ?? []) ? ` · ${t(uiKeys.create.videoSettings.missingLora)}` : ""}</option>`).join(""),
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
      ? t(uiKeys.create.validation.imageRescan)
      : !imageProfile.available
        ? t(uiKeys.create.validation.imageScanIncomplete)
        : imageProfile.runtimeVerified && !imageProfile.runtimeReady
          ? t(uiKeys.create.validation.imageRuntimeRecheck, { status: imageWorkflowStatus(imageProfile, t) })
          : t(uiKeys.create.validation.imageWorkflowRecheck, { status: imageWorkflowStatus(imageProfile, t) }),
    enqueueBusy
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
    h3PromptBuilder,
    enqueueBusy
  } = options;
  const draft = state.draft;
  const h3PromptPack = h3PromptPackFor(state.settings.uiLocale);
  const isMiniMaxH3 = isMiniMaxH3Model(draft.modelId);
  const isR2V = isMiniMaxH3R2vModel(draft.modelId);
  const h3Mode = isMiniMaxH3 ? h3PromptModeForDraft(draft) : undefined;
  const activeH3PromptPreset = h3Mode
    ? h3PromptPresetForMode(h3Mode, h3PromptPreset)
    : h3PromptPreset;
  const enhanceMode = isMiniMaxH3
    ? promptEnhanceMode === "faithful" ? "faithful" : "h3-vision"
    : promptEnhanceMode === "faithful" ? "faithful" : "sulphur-native";
  const promptStatus = promptModelStatus(state.settings, environmentScan, t);
  const promptRuntimeBusy = promptStarting || promptEnhancing || promptReleasing;
  const promptAiDisabled = promptRuntimeBusy || state.queueRunning;
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
  const spectrumEligible = videoPolicy.spectrum.allowed;
  const spectrumReady = draft.spectrumMode !== "balanced" || (
    videoPolicy.spectrum.allowed && spectrumLoaded
  );
  const detectedVramTotalBytes = environmentScan?.gpus[0]?.vramTotalBytes ?? performanceMetrics?.vramTotalBytes ?? 0;
  const extending = draft.inputMode === "video";
  const h3MotionContextNode = environmentScan?.customNodes.find(
    (node) => node.id === "h3-motion-context"
  );
  const h3MotionContextReady = !extending || !isR2V || Boolean(
    h3MotionContextNode?.installed || h3MotionContextNode?.loaded
  );
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
  const r2vCounts = h3ReferenceSlotCounts(draft.h3ReferenceSlots);
  const r2vSlotsReady = extending || !isR2V || (
    draft.h3ReferenceSlots.length > 0 &&
    draft.h3ReferenceSlots.every((slot) => Boolean(slot.mediaPath))
  );
  const turboCoreBlockReason = turboEnabled &&
    Boolean(environmentScan?.comfyCompatibility.checkedFrom) &&
    !environmentScan?.comfyCompatibility.h3CoreSupported
    ? t(uiKeys.create.validation.turboCoreMissing)
    : "";
  const turboLoraBlockReason = turboEnabled && turboLoraProfile && !turboLoraProfile.available
    ? t(uiKeys.create.validation.turboLoraMissing)
    : "";
  const selectedLoraBlockReason = loraBlockingIssue?.message ??
    (missingSelectedLora
      ? t(uiKeys.create.validation.selectedLoraMissing, { name: missingSelectedLora.name })
      : "");
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
    extending,
    isR2V,
    isMiniMaxH3,
    h3Mode,
    enhanceMode,
    h3PromptEnhanceTitle: isMiniMaxH3
      ? h3PromptPack.presetDescriptions[activeH3PromptPreset]
      : "选择提示词扩写方式",
    promptUi: h3PromptPack.ui,
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
    h3PromptBuilder,
    modelOptions: createModelOptionViewModels(
      draft,
      environmentScan,
      workflowCapabilities,
      bundledWorkflows,
      t
    ),
    resolutionOptionsMarkup: extending && !isMiniMaxH3
      ? `<option value="${state.settings.ltxExtensionResolution}" selected>${state.settings.ltxExtensionResolution}p · ${t(uiKeys.create.options.ggufConservative)}</option>`
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
              ? t(uiKeys.create.options.h3LowVram)
              : value === 768
                ? t(uiKeys.create.options.h3HighVram)
                : ""
            : "";
          const vramLabel = recommended && detectedVramTotalBytes > 0
            ? t(uiKeys.create.options.vramRecommended, { value: formatBytes(detectedVramTotalBytes) })
            : "";
          return `<option value="${value}" ${draft.resolution === value ? "selected" : ""}>${value}p · ${width}×${height}${vramLabel}${h3Label}</option>`;
        }).join(""),
     stepsOptionsMarkup: turboEnabled
      ? `<option value="4" ${h3Steps === 4 ? "selected" : ""}>4 · ${t(uiKeys.create.options.turboStepsExperimental)}</option>
        <option value="6" ${h3Steps === 6 ? "selected" : ""}>6 · ${t(uiKeys.create.options.turboStepsPreview)}</option>
        <option value="8" ${h3Steps === 8 || h3Steps > 8 ? "selected" : ""}>8 · ${t(uiKeys.create.options.turboStepsOutput)}</option>`
      : `<option value="20" ${h3Steps === 20 ? "selected" : ""}>20 · ${t(uiKeys.create.options.standardStepsOutput)}</option>
        <option value="16" ${h3Steps === 16 ? "selected" : ""}>16 · ${t(uiKeys.create.options.balancedStepsPreview)}</option>
        <option value="12" ${h3Steps === 12 ? "selected" : ""}>12 · ${t(uiKeys.create.options.fastStepsPreview)}</option>`,
    stepsTitle: turboEnabled
      ? t(uiKeys.create.options.turboStepsTitle)
      : t(uiKeys.create.options.h3StepsTitle),
    spectrumLabelMarkup: fieldLabelWithTip(
      t(uiKeys.create.validation.spectrumLabel),
      extending && isR2V
        ? t(uiKeys.create.validation.spectrumMotionContext)
        : !spectrumEligible
          ? turboEnabled
            ? t(uiKeys.create.validation.spectrumTurbo)
            : t(uiKeys.create.validation.spectrumUnsupported)
          : !spectrumLoaded
            ? t(uiKeys.create.validation.spectrumInstall)
            : t(uiKeys.create.validation.spectrumLoaded, { version: spectrumNode?.version ? `v${spectrumNode.version}` : t(uiKeys.create.options.spectrumLoaded) })
    ),
    spectrumOptionsMarkup: `<option value="off" ${draft.spectrumMode !== "balanced" ? "selected" : ""}>${t(uiKeys.create.options.spectrumOff)}</option>
      <option value="balanced" ${draft.spectrumMode === "balanced" ? "selected" : ""}>${t(uiKeys.create.options.spectrumBalanced)}</option>`,
    spectrumTitle: extending && isR2V
      ? t(uiKeys.create.validation.spectrumMotionContext)
      : !spectrumEligible
        ? t(uiKeys.create.validation.spectrumUnsupported)
        : !spectrumLoaded
          ? t(uiKeys.create.validation.spectrumInstall)
          : t(uiKeys.create.validation.spectrumNative),
    spectrumModeDisabled: !(videoPolicy.spectrum.allowed && spectrumLoaded),
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
