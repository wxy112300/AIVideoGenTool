import { createTranslator } from "../../../core/i18n";
import { activePromptIndexForDraft, promptVersionsForDraft } from "../../../core/draft-prompts";
import { uiKeys } from "../../../core/i18n-keys";
import { modelCatalog, sortProfilesByCatalogOrder } from "../../../core/catalog";
import { SPECTRUM_PDD_MINIMUM_VERSION, SPECTRUM_TURBO_MINIMUM_VERSION } from "../../../core/catalog";
import { releaseVersionAtLeast } from "../../../core/release-version";
import { h3PromptPackFor, h3PromptPresetForMode, imagePromptPackForTarget } from "../../prompt-packs";
import { imageModelCapabilityFor, imageModelAdapterFor, imageLightningComponentFound, imagePicturesForModelInput, imageQualityProfileRequiresLightning, imageAspectRatioOptionsFor, imageResolutionOptionsFor, imageOutputCountMax, imageQualityProfileComponentFound, imageQualityProfileRequiredComponentLabel, normalizeImageAspectRatio, normalizeImageTargetResolution, cachedImageProfileAllowsEnqueue } from "../../../core/image-workflow";
import { isH3ImageModelId, normalizeImageEditDraft } from "../../../core/image-project";
import { promptModelSupportsImageEdit, isGemmaPromptModel } from "../../../core/prompt-models";
import { ensureMotionContextSourceSlot, h3ReferenceSlotCounts, motionContextReferenceSlotsReady } from "../../../core/h3-reference";
import { h3TokenCountForDraft } from "../../../core/h3-token-count";
import { generationSafetyForTask, isMiniMaxH3ContinuumModel, h3ContinuumModeForSource, continuumTimelinePromptForTask, isMiniMaxH3Model, isMiniMaxH3R2vModel, outputDimensions } from "../../../core/workflow";
import { BUILTIN_VIDEO_LORAS, H3_SLA_TURBO_LORA_ID, H3_TURBO_LORA_ID, isH3PddLoraId, isH3SlaTurboLoraId, isH3TurboLoraId, profileProvidesVideoLora, videoLoraCompatibleWithModel, videoLoraCompatibleWithDraft } from "../../../core/video-loras";
import { normalizeVideoSteps, resolveVideoGenerationPolicy } from "../../../core/video-policy";
import { loraRuleText } from "../../../core/catalog/loras/locales";
import { h3SharedLatentSaveModeFor, h3LatentSaveModeSavesJointAv } from "../../../core/h3-latent-save";
import { escapeHtml } from "../../shared/dom";
import { fieldLabelWithTip } from "../../shared/markup";
import { imageWorkflowStatus, isImageModelSelectable, promptModelStatus } from "../../shared/status";
import { modelName } from "../../shared/labels";
import { activeImagePrompt, activePrompt, createModelOptionViewModels, extensionSafetyForDraft, h3PromptCheckMarkup, h3PromptModeForDraft, h3PromptPresetOptions, interpolationEstimate, promptSnippetOptions } from "./helpers";
const h3LatentSaveModeTipKeys = {
    all: uiKeys.create.videoSettings.saveLatentAllTip,
    none: uiKeys.create.videoSettings.saveLatentNoneTip
};
export function videoResolutionOptionsForDraft(draft, extending, jointAvSerializerInstalled) {
    const base = isMiniMaxH3Model(draft.modelId)
        ? modelCatalog.get(draft.modelId)?.definition.capabilities?.resolutions ?? [360, 480, 540, 720, 768]
        : [480, 540, 720];
    const h3Create1080 = !extending && draft.modelId === "minimax_h3_fl2va" &&
        draft.videoLoras.length === 0 &&
        h3LatentSaveModeSavesJointAv(h3SharedLatentSaveModeFor(draft)) &&
        jointAvSerializerInstalled;
    return h3Create1080 ? [...base, 1080] : base;
}
export function resolutionAfterJointAvPreference(resolution, saveJointAv) {
    return !saveJointAv && resolution === 1080 ? 768 : resolution;
}
export function selectedVideoResolution(resolution, options) {
    return options.includes(resolution) ? resolution : options.at(-1) ?? resolution;
}
export function generationSafetyForCreateDraft(draft, locale) {
    return generationSafetyForTask({
        ...draft,
        resolution: draft.resolution === 1080 ? 720 : draft.resolution
    }, locale ?? "zh-CN");
}
export function imageEditEnqueueBlockReason(draft, imageProfile, t = createTranslator("zh-CN").t) {
    const imageCapability = imageModelCapabilityFor(draft.modelId);
    const inputPictures = imagePicturesForModelInput(draft.pictures, imageCapability.supportsTextOnly === true);
    const incompletePicture = inputPictures.find((picture) => !picture.absolutePath);
    const markupGuideCount = imageCapability.supportsMarkupReferenceGuide === true
        ? inputPictures.filter((picture) => picture.markup?.objectCount && picture.markup.renderedPath.trim()).length
        : 0;
    const imageModelInputCount = inputPictures.length + markupGuideCount;
    const prompt = activeImagePrompt(draft);
    const referenceBlockReason = !inputPictures.length
        ? imageCapability.supportsTextOnly
            ? ""
            : t(uiKeys.create.validation.imageAddSlot)
        : !inputPictures[0]?.absolutePath
            ? t(uiKeys.create.validation.imageBaseMissing)
            : incompletePicture
                ? t(uiKeys.create.validation.imagePictureMissing, { slot: incompletePicture.pictureNumber })
                    : inputPictures.length > imageCapability.maxPictures
                    ? t(uiKeys.create.validation.imageTooMany, { name: imageCapability.name, count: imageCapability.maxPictures })
                    : imageModelInputCount > imageCapability.maxPictures
                        ? t(uiKeys.create.validation.imageMarkupTooMany, { count: markupGuideCount })
                        : imageCapability.requiresMask && !inputPictures[0]?.mask?.regionCount
                            ? "请先在原图上绘制并保存 Mask"
                            : "";
    if (referenceBlockReason)
        return referenceBlockReason;
    if (imageCapability.requiresPrompt !== false && !prompt.text.trim()) {
        return t(uiKeys.create.validation.imagePromptMissing);
    }
    if (isH3ImageModelId(draft.modelId)) {
        const productGate = imageProfile?.productGate ?? modelCatalog.get(draft.modelId)?.definition.scan?.productGate;
        if (productGate === "locked")
            return t(uiKeys.status.imageProductGatePending);
        if (!imageCapability.qualityProfiles.some((profile) => profile.id === draft.qualityProfile)) {
            return `H3 图片质量档 ${draft.qualityProfile} 未登记，请重新选择 Base 或该路线的 Turbo 质量档。`;
        }
        const compiled = imageModelAdapterFor(draft.modelId)?.compilePrompt(prompt.text, draft.pictures);
        if (compiled?.errors.length)
            return compiled.errors[0];
    }
    if (imageProfile?.missingCustomNodeNames?.length) {
        return `缺少必需节点：${imageProfile.missingCustomNodeNames.join("、")}。请先在设置 → 节点与依赖中安装。`;
    }
    if (imageProfile && !cachedImageProfileAllowsEnqueue(imageProfile)) {
        return !imageProfile?.available
            ? `${imageCapability.name} 模型文件不完整，请先在设置 → 图片模型中安装并重新扫描。`
            : t(uiKeys.create.validation.imageWorkflowMissing, { name: imageCapability.name });
    }
    const selectedQuality = imageCapability.qualityProfiles.find((profile) => profile.id === draft.qualityProfile);
    const requiredQualityComponent = imageQualityProfileRequiredComponentLabel(imageCapability, draft.qualityProfile);
    if (selectedQuality && requiredQualityComponent &&
        !imageQualityProfileComponentFound(imageCapability, draft.qualityProfile, imageProfile?.components ?? [])) {
        return `${selectedQuality.label} 需要 ${requiredQualityComponent}；请先在设置 → 图片模型中补齐后重新扫描。`;
    }
    return "";
}
export function videoEnqueueBlockReason(input) {
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
                                : input.continuumPreflightBlockReason
                                    ? input.continuumPreflightBlockReason
                                    : input.isContinuum && !input.continuumArtifactReady
                                        ? t(uiKeys.create.validation.continuumArtifactMissing)
                                        : input.motionContextLatentTrimValid === false
                                            ? t(uiKeys.create.validation.motionContextTrimUnsupported)
                                        : input.motionContextPreflightBlockReason
                                            ? input.motionContextPreflightBlockReason
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
export function buildImageEditPageViewModel(options) {
    const { t, state, environmentScan, promptEnhanceMode, promptEnhancing, promptStarting, promptReleasing, promptRuntimeLoaded, promptRuntimeView, enqueueBusy } = options;
    const draft = normalizeImageEditDraft(state.imageDraft);
    const imageCapability = imageModelCapabilityFor(draft.modelId);
    const promptless = imageCapability.requiresPrompt === false;
    const basePicture = draft.pictures[0];
    const selectedAspectRatio = normalizeImageAspectRatio(draft.aspectRatio ?? "source");
    const selectedTargetResolution = normalizeImageTargetResolution(draft.targetResolution, basePicture?.width ?? 0, basePicture?.height ?? 0);
    const imageAspectRatioOptions = imageAspectRatioOptionsFor(basePicture?.width ?? 0, basePicture?.height ?? 0, imageCapability.textOnlyOutputWidth ?? 0, imageCapability.textOnlyOutputHeight ?? 0);
    const imageResolutionOptions = imageResolutionOptionsFor(basePicture?.width ?? 0, basePicture?.height ?? 0, imageCapability.textOnlyOutputWidth ?? 0, imageCapability.textOnlyOutputHeight ?? 0, selectedAspectRatio, basePicture ? imageCapability.customOutputMultiple ?? 8 : 8);
    const imageModelProfiles = sortProfilesByCatalogOrder(environmentScan?.modelProfiles.filter((profile) => profile.category === "image") ?? [], modelCatalog, "image");
    const imageModelOptions = imageModelProfiles.length
        ? imageModelProfiles
        : modelCatalog.list("image").map((entry) => ({
            id: entry.definition.id,
            name: modelCatalog.localized(entry.definition.id, state.settings.uiLocale)?.name ?? entry.definition.id,
            category: "image",
            badge: modelCatalog.localized(entry.definition.id, state.settings.uiLocale)?.badge ?? "",
            description: modelCatalog.localized(entry.definition.id, state.settings.uiLocale)?.description ?? "",
            vram: entry.definition.scan?.vram ?? "",
            available: false,
            integrated: entry.definition.scan?.integrated !== false,
            productGate: entry.definition.scan?.productGate,
            productGateReason: entry.definition.scan?.productGateReason,
            components: []
        }));
    const prompt = activeImagePrompt(draft, state.settings.uiLocale);
    const imageProfile = environmentScan?.modelProfiles.find((profile) => profile.id === draft.modelId);
    const promptStatus = promptModelStatus(state.settings, environmentScan, t);
    const promptRuntimeBusy = promptStarting || promptRuntimeView.left.busy || promptRuntimeView.right.busy;
    const imagePromptModelSupportsImageEdit = promptModelSupportsImageEdit(state.settings.promptModelId);
    const imagePromptEnhanceBlocked = promptStarting || promptRuntimeView.right.disabled || state.queueRunning || !imagePromptModelSupportsImageEdit;
    const imagePromptAiDisabled = imagePromptEnhanceBlocked || !prompt.text.trim();
    const imageEnhanceMode = promptEnhanceMode === "faithful"
        ? "faithful"
        : "detail-enhance";
    const imagePromptPack = imagePromptPackForTarget(state.settings.uiLocale, draft.modelId);
    const imagePromptOptimizeTitle = state.queueRunning
        ? t(uiKeys.create.validation.promptTaskRunning)
        : !imagePromptModelSupportsImageEdit
            ? t(uiKeys.create.validation.promptAdapterMissing)
            : !prompt.text.trim()
                ? t(uiKeys.create.validation.imagePromptEmpty)
                : isGemmaPromptModel(state.settings.promptModelId)
                    ? t(uiKeys.create.validation.gemmaOptimize)
                    : t(uiKeys.create.validation.promptOptimize);
    const inputPictures = imagePicturesForModelInput(draft.pictures, imageCapability.supportsTextOnly === true);
    const incompletePicture = inputPictures.find((picture) => !picture.absolutePath);
    const markupGuideCount = imageCapability.supportsMarkupReferenceGuide === true
        ? inputPictures.filter((picture) => picture.markup?.objectCount && picture.markup.renderedPath.trim()).length
        : 0;
    const imageModelInputCount = inputPictures.length + markupGuideCount;
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
    const h3ImageOptionsVisible = isH3ImageModelId(draft.modelId);
    const textOnlySizeControlsVisible = imageCapability.supportsTextOnly === true && imagePicturesForModelInput(draft.pictures, true).length === 0;
    const imageSizeControlsVisible = !h3ImageOptionsVisible && (imageCapability.sourceResolutionOnly !== true || imageCapability.supportsCustomOutputSize === true || textOnlySizeControlsVisible);
    const h3ReferenceDetailVisible = draft.modelId === "minimax-h3-reference-edit";
    const h3ReferenceNoteVisible = h3ReferenceDetailVisible;
    const h3ImageSourceFitOptionsMarkup = h3ImageOptionsVisible && draft.h3ImageOptions
        ? [
            ["crop-center", uiKeys.create.imageEdit.h3SourceFitCropCenter],
            ["contain-pad", uiKeys.create.imageEdit.h3SourceFitContainPad],
            ["stretch", uiKeys.create.imageEdit.h3SourceFitStretch]
        ].map(([value, label]) => `<option value="${value}" ${draft.h3ImageOptions?.sourceFit === value ? "selected" : ""}>${escapeHtml(t(label))}</option>`).join("")
        : "";
    const h3ImageReferenceDetailOptionsMarkup = h3ReferenceDetailVisible && draft.h3ImageOptions
        ? [
            ["match-generation-area", uiKeys.create.imageEdit.h3ReferenceDetailMatchGenerationArea],
            ["max-identity-2048", uiKeys.create.imageEdit.h3ReferenceDetailMaxIdentity2048]
        ].map(([value, label]) => `<option value="${value}" ${draft.h3ImageOptions?.referenceDetail === value ? "selected" : ""}>${escapeHtml(t(label))}</option>`).join("")
        : "";
    const imageQualityOptionsMarkup = imageCapability.qualityProfiles.map((profile) => {
        const qualityNeedsComponent = imageQualityProfileRequiredComponentLabel(imageCapability, profile.id);
        const qualityComponentMissing = Boolean(qualityNeedsComponent && !imageQualityProfileComponentFound(imageCapability, profile.id, imageProfile?.components ?? []));
        const lightningMissing = imageQualityProfileRequiresLightning(profile.id) &&
            !imageLightningComponentFound(imageProfile?.components ?? []);
        const disabled = qualityComponentMissing || lightningMissing;
        const missingLabel = qualityComponentMissing
            ? ` · 缺少 ${qualityNeedsComponent}`
            : lightningMissing
                ? ` · ${t(uiKeys.create.videoSettings.missingLora)}`
                : "";
        return `<option value="${escapeHtml(profile.id)}" ${draft.qualityProfile === profile.id ? "selected" : ""} ${disabled ? "disabled" : ""}>${escapeHtml(profile.label)}${profile.steps > 0 ? ` · ${profile.steps} ${t(uiKeys.create.videoSettings.stepsUnit)}` : ""}${missingLabel}</option>`;
    }).join("");
    return {
        draft,
        prompt,
        promptRuntimeBusy,
        promptEnhancing,
        imageCapabilityName: imageCapability.name,
        imageCapabilityMaxPictures: imageCapability.maxPictures,
        imageModelOptionsMarkup: imageModelOptions.map((profile) => `<option value="${escapeHtml(profile.id)}" ${draft.modelId === profile.id ? "selected" : ""} ${isImageModelSelectable(profile) ? "" : "disabled"}>${escapeHtml(profile.name)}${isImageModelSelectable(profile) ? "" : ` · ${escapeHtml(imageWorkflowStatus(profile, t))}`}</option>`).join(""),
        imageQualityOptionsMarkup,
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
                : (imageProfile.productGate ?? modelCatalog.get(imageProfile.id)?.definition.scan?.productGate) === "locked"
                    ? t(uiKeys.status.imageProductGatePending)
                    : imageProfile.missingCustomNodeNames?.length
                        ? `缺少必需节点：${imageProfile.missingCustomNodeNames.join("、")}。模型可以选择，但安装节点前不能加入队列。`
                        : imageProfile.runtimeVerified && !imageProfile.runtimeReady
                            ? t(uiKeys.create.validation.imageRuntimeRecheck, { status: imageWorkflowStatus(imageProfile, t) })
                            : t(uiKeys.create.validation.imageWorkflowRecheck, { status: imageWorkflowStatus(imageProfile, t) }),
        enqueueBusy,
        promptless,
        maskRequired: imageCapability.requiresMask === true,
        sourceResolutionOnly: imageCapability.sourceResolutionOnly === true,
        imageAspectRatioVisible: imageSizeControlsVisible,
        imageResolutionVisible: imageSizeControlsVisible,
        supportsTextOnly: imageCapability.supportsTextOnly === true,
        maskSupported: imageCapability.supportsMask === true,
        annotationSupported: imageCapability.supportsMarkup === true,
        h3ImageOptionsVisible,
        h3ReferenceDetailVisible,
        h3ReferenceNoteVisible,
        h3ImageSourceFitOptionsMarkup,
        h3ImageReferenceDetailOptionsMarkup,
        h3ImageSourceFidelity: draft.h3ImageOptions?.sourceFidelity ?? 0
    };
}
export function continuumDependencyBlockReasonFor(environmentScan, modelId, managed) {
    if (!managed || !environmentScan)
        return "";
    if (environmentScan.comfyCompatibility.checkedFrom && !environmentScan.comfyCompatibility.h3CoreSupported) {
        return "当前 ComfyUI 未通过 H3 核心兼容性检查，请先在设置中修复并重新扫描。";
    }
    const profile = environmentScan.modelProfiles.find((candidate) => candidate.id === modelId);
    if (!profile)
        return "环境扫描没有找到 MiniMax H3 Continuum 档案，请先重新扫描。";
    if (!profile.available) {
        const missing = profile.components
            .filter((component) => !component.found && !component.optional)
            .map((component) => component.expected)
            .join("、");
        return `MiniMax H3 Continuum 模型文件不完整${missing ? `，缺少：${missing}` : ""}。`;
    }
    if (profile.missingCustomNodeNames?.length) {
        return `Continuum 缺少必需节点：${profile.missingCustomNodeNames.join("、")}。请先在设置 → 节点与依赖中安装。`;
    }
    if (profile.customNodeCompatibility === "error") {
        return "Continuum 节点版本或 revision 不兼容，请在设置 → 节点与依赖中修复后重新扫描。";
    }
    if (profile.runtimeVerified && profile.runtimeReady === false) {
        return `当前 ComfyUI 未注册 Continuum 所需节点${profile.runtimeMissingNodes?.length ? `：${profile.runtimeMissingNodes.join("、")}` : ""}。请重启 ComfyUI 后重新扫描。`;
    }
    for (const nodeId of profile.requiredCustomNodeIds ?? []) {
        const node = environmentScan.customNodes.find((candidate) => candidate.id === nodeId);
        if (node?.compatibilityState === "error") {
            return `${node.name} 当前不兼容：${node.loadError || node.compatibilityNotice || "请在设置中修复后重新扫描。"}`;
        }
        if (node?.runtimeVerified && !node.loaded) {
            return `${node.name} 尚未加载到当前 ComfyUI。请重启 ComfyUI 后重新扫描。`;
        }
    }
    return "";
}
function continuumStatusFor(t, state, draft, managed, artifactReady, enqueueBlockReason, dependencyBlockReason, runtimeUnverified, inspection) {
    const route = t(managed
        ? uiKeys.create.continuumArtifact.managedRoute
        : uiKeys.create.continuumArtifact.bootstrapRoute);
    const sequence = draft.h3ContinuumSequence;
    const runDetail = managed && sequence ? `${route} · Run ${sequence.runName}` : route;
    if (draft.sourceVideoPath && !inspection) {
        return { tone: "info", label: t(uiKeys.create.continuumArtifact.pendingValidation), detail: runDetail };
    }
    if (inspection && inspection.status !== "available") {
        return { tone: "error", label: inspection.reason || t(uiKeys.create.continuumArtifact.statusFallbackMissing), detail: runDetail };
    }
    const blockReason = dependencyBlockReason || enqueueBlockReason;
    if (blockReason) {
        return {
            tone: "error",
            label: t(uiKeys.create.continuumArtifact.statusBlocked, { reason: blockReason }),
            detail: runDetail
        };
    }
    if (!managed) {
        return artifactReady
            ? {
                tone: "warning",
                label: t(uiKeys.create.continuumArtifact.statusFallbackReady),
                detail: runDetail
            }
            : {
                tone: "error",
                label: t(uiKeys.create.continuumArtifact.statusFallbackMissing),
                detail: runDetail
            };
    }
    const relatedTasks = sequence
        ? state.queue.filter((item) => item.taskType === "extension" &&
            item.h3ContinuumMode === "managed" &&
            item.h3ContinuumSequence?.sequenceId === sequence.sequenceId)
        : [];
    if (sequence && sequence.acceptedChunks === 0 && relatedTasks.some((item) => item.status === "failed" || item.status === "cancelled")) {
        return {
            tone: "warning",
            label: t(uiKeys.create.continuumArtifact.statusFreshRun),
            detail: runDetail
        };
    }
    if (relatedTasks.some((item) => item.status === "waiting" || item.status === "running")) {
        return {
            tone: "info",
            label: t(uiKeys.create.continuumArtifact.statusRunning),
            detail: runDetail
        };
    }
    if (sequence && sequence.acceptedChunks > 0) {
        return {
            tone: "warning",
            label: inspection?.reason || t(uiKeys.create.continuumArtifact.statusReadyContinue, { count: sequence.acceptedChunks }),
            detail: runDetail
        };
    }
    if (runtimeUnverified) {
        return {
            tone: "info",
            label: t(uiKeys.create.continuumArtifact.statusUnknown),
            detail: runDetail
        };
    }
    return {
        tone: "success",
        label: t(uiKeys.create.continuumArtifact.statusReadyFirst),
        detail: runDetail
    };
}
function continuumFileNameFor(path) {
    return path?.split(/[\\/]/u).pop() ?? "";
}
function continuumFileLocationFor(file, path) {
    return file?.absolutePath ?? path ?? (file ? [file.subfolder, file.filename].filter(Boolean).join("/") : "");
}
function continuumDependencyStatusFor(inspection, hasReference) {
    if (inspection?.status === "available")
        return hasReference ? "available" : "missing";
    if (inspection)
        return "missing";
    return hasReference ? "checking" : "missing";
}
export function continuumDependencyFilesFor(t, draft, managed, inspection) {
    const files = [];
    const identities = new Set();
    const addFile = (kind, file, path, status, chunkIndex) => {
        const filename = file?.filename ?? continuumFileNameFor(path);
        const location = continuumFileLocationFor(file, path);
        const identity = location || `${kind}:${chunkIndex ?? ""}`;
        if (identities.has(identity))
            return;
        identities.add(identity);
        files.push({
            kind,
            filename: filename || t(status === "not-created"
                ? uiKeys.create.continuumArtifact.dependencyNotCreated
                : uiKeys.create.continuumArtifact.dependencyNoReference),
            location,
            status,
            ...(chunkIndex === undefined ? {} : { chunkIndex })
        });
    };
    if (!managed) {
        const artifact = inspection?.artifact ?? draft.h3ContinuumArtifact;
        const hasPayloadReference = Boolean(artifact?.payload || inspection?.payloadPath || draft.h3ContinuumArtifactPath);
        const hasManifestReference = Boolean(artifact?.manifest || inspection?.manifestPath);
        if (!hasPayloadReference && !hasManifestReference)
            return files;
        const artifactStatus = continuumDependencyStatusFor(inspection, hasPayloadReference);
        addFile("payload", artifact?.payload, inspection?.payloadPath ?? draft.h3ContinuumArtifactPath, artifactStatus);
        addFile("manifest", artifact?.manifest, inspection?.manifestPath, continuumDependencyStatusFor(inspection, hasManifestReference));
        return files;
    }
    const receipts = (draft.h3ContinuumSequence?.chunks ?? [])
        .map((chunk) => chunk.receipt)
        .filter((receipt) => Boolean(receipt));
    if (receipts.length === 0) {
        addFile("run-storage", undefined, undefined, "not-created");
        return files;
    }
    for (const receipt of receipts) {
        const receiptStatus = continuumDependencyStatusFor(inspection, true);
        addFile("run-storage", receipt.runStorageRoot, undefined, receiptStatus);
        for (const record of receipt.chunkRecords) {
            addFile("chunk-payload", record.payloadPath, undefined, receiptStatus, record.logicalChunkIndex);
        }
    }
    return files;
}
export function buildVideoCreatePageViewModel(options) {
    const { t, state, environmentScan, performanceMetrics, workflowCapabilities, bundledWorkflows, promptEnhanceMode, h3PromptPreset, promptEnhancing, promptStarting, promptReleasing, promptRuntimeLoaded, promptProgress, promptRuntimeView, enqueueBusy } = options;
    const draft = state.draft;
    const h3PromptPack = h3PromptPackFor(state.settings.uiLocale);
    const isMiniMaxH3 = isMiniMaxH3Model(draft.modelId);
    const isR2V = isMiniMaxH3R2vModel(draft.modelId);
    const isContinuum = isMiniMaxH3ContinuumModel(draft.modelId);
    const isManagedContinuum = isContinuum && h3ContinuumModeForSource(draft) === "managed";
    const continuumArtifactReady = options.extensionSourceInspection?.status === "available";
    const continuumArtifactFilename = draft.h3ContinuumArtifact?.payload.filename ??
        draft.h3ContinuumArtifactPath?.split(/[\\/]/u).pop() ?? "";
    const motionContextLatentReady = Boolean(draft.h3ContextLatentPath?.trim());
    const motionContextLatentFilename = draft.h3ContextLatentPath?.split(/[\\/]/u).pop() ?? "";
    const motionContextLatentHistoryBound = Boolean(motionContextLatentReady && draft.sourceAssetId && draft.sourceVersionId);
    const extending = draft.inputMode === "video";
    const h3LatentSaveMode = h3SharedLatentSaveModeFor(draft, extending && isR2V, isManagedContinuum && extending);
    const continuumEffectiveDraft = isContinuum && extending && draft.sourceVideoDuration > 0
        ? {
            ...draft,
            trimStartSeconds: 0,
            trimEndSeconds: draft.sourceVideoDuration
        }
        : draft;
    const referenceSlots = extending && isR2V
        ? ensureMotionContextSourceSlot(draft.h3ReferenceSlots, draft.sourceVideoPath)
        : draft.h3ReferenceSlots;
    if (extending && isR2V && JSON.stringify(referenceSlots) !== JSON.stringify(draft.h3ReferenceSlots)) {
        draft.h3ReferenceSlots = referenceSlots;
    }
    const h3Mode = isMiniMaxH3 ? h3PromptModeForDraft(draft) : undefined;
    const videoReady = Boolean(draft.sourceVideoPath && draft.sourceVideoDuration > 0);
    const extensionBoundaryAvailable = extending && videoReady &&
        draft.trimEndSeconds > draft.trimStartSeconds &&
        draft.trimEndSeconds <= draft.sourceVideoDuration + 0.05;
    const promptBoundaryBlockReason = extending
        ? !videoReady
            ? t(uiKeys.create.validation.videoMissing)
            : !extensionBoundaryAvailable
                ? t(uiKeys.create.validation.invalidTrim)
                : ""
        : "";
    const referenceAutoPromptAvailable = isMiniMaxH3 && (extensionBoundaryAvailable || (isR2V
        ? referenceSlots.some((slot) => Boolean(slot.mediaPath))
        : Boolean(draft.startImagePath || draft.endImagePath)));
    const activeH3PromptPreset = h3Mode
        ? h3PromptPresetForMode(h3Mode, h3PromptPreset)
        : h3PromptPreset;
    const enhanceMode = isMiniMaxH3
        ? promptEnhanceMode === "faithful" ? "faithful" : "h3-vision"
        : promptEnhanceMode === "faithful" ? "faithful" : "sulphur-native";
    const promptStatus = promptModelStatus(state.settings, environmentScan, t);
    const promptRuntimeBusy = promptStarting || promptRuntimeView.left.busy || promptRuntimeView.right.busy;
    const promptAiDisabled = promptStarting || promptRuntimeView.right.disabled || state.queueRunning ||
        Boolean(promptBoundaryBlockReason);
    const videoPolicy = resolveVideoGenerationPolicy({
        modelId: draft.modelId,
        inputMode: draft.inputMode,
        ratio: draft.ratio,
        spectrumMode: draft.spectrumMode,
        attentionMode: state.settings.h3AttentionMode,
        videoLoras: draft.videoLoras,
        locale: state.settings.uiLocale
    });
    const turboEnabled = videoPolicy.turboEnabled;
    const h3Steps = normalizeVideoSteps(draft.steps, videoPolicy);
    const selectedTurboLora = draft.videoLoras.find((lora) => (isH3TurboLoraId(lora.id) || isH3PddLoraId(lora.id)) &&
        videoLoraCompatibleWithModel(lora, draft.modelId));
    const turboLoraProfile = environmentScan?.modelProfiles.find((profile) => profile.id === (selectedTurboLora?.id ?? H3_TURBO_LORA_ID));
    const compatibleLoraDefinitions = BUILTIN_VIDEO_LORAS.filter((lora) => videoLoraCompatibleWithDraft(lora, draft.modelId, draft.inputMode));
    const addableLoraDefinitions = compatibleLoraDefinitions.filter((lora) => !draft.videoLoras.some((selected) => selected.id === lora.id));
    const installReadyLoraDefinitions = addableLoraDefinitions.filter((lora) => environmentScan?.modelProfiles.find((item) => item.id === lora.id)?.available === true);
    const loraIssues = videoPolicy.issues;
    const loraBlockingIssue = loraIssues.find((issue) => issue.severity === "error");
    const scannedModelProfiles = environmentScan?.modelProfiles;
    const missingSelectedLora = scannedModelProfiles
        ? draft.videoLoras.find((lora) => !profileProvidesVideoLora(scannedModelProfiles.find((profile) => profile.id === lora.id), lora.filename))
        : undefined;
    const spectrumNode = environmentScan?.customNodes.find((node) => node.id === "spectrum-minimax-h3");
    const spectrumLoaded = Boolean(spectrumNode?.loaded);
    const pddSelected = draft.videoLoras.some((lora) => isH3PddLoraId(lora.id) && videoLoraCompatibleWithModel(lora, draft.modelId));
    const spectrumTurboCompatible = !turboEnabled || releaseVersionAtLeast(spectrumNode?.version ?? "", pddSelected ? SPECTRUM_PDD_MINIMUM_VERSION : SPECTRUM_TURBO_MINIMUM_VERSION);
    const spectrumEligible = videoPolicy.spectrum.allowed && spectrumTurboCompatible;
    const spectrumReady = draft.spectrumMode !== "balanced" || (spectrumEligible && spectrumLoaded);
    const jointAvSerializerInstalled = environmentScan?.customNodes.some((node) => node.id === "local-video-studio-h3-av" && node.installed) === true;
    const resolutionOptions = videoResolutionOptionsForDraft(draft, extending, jointAvSerializerInstalled);
    const selectedResolution = selectedVideoResolution(draft.resolution, resolutionOptions);
    const resolutionOptionsMarkup = extending && !isMiniMaxH3
        ? `<option value="${state.settings.ltxExtensionResolution}" selected>${state.settings.ltxExtensionResolution}p</option>`
        : resolutionOptions.map((value) => {
            const [width, height] = outputDimensions({
                ...draft,
                resolution: value
            });
            return `<option value="${value}" ${selectedResolution === value ? "selected" : ""}>${value}p · ${width}×${height}</option>`;
        }).join("");
    const latentSaveDisabled = isManagedContinuum && extending;
    const latentSaveModeOptionsMarkup = `<option value="all" data-description="${escapeHtml(t(h3LatentSaveModeTipKeys.all))}" title="${escapeHtml(t(h3LatentSaveModeTipKeys.all))}" ${h3LatentSaveMode === "all" ? "selected" : ""}>${escapeHtml(t(uiKeys.create.videoSettings.saveLatentEnabled))}</option><option value="none" data-description="${escapeHtml(t(h3LatentSaveModeTipKeys.none))}" title="${escapeHtml(t(h3LatentSaveModeTipKeys.none))}" ${h3LatentSaveMode === "none" ? "selected" : ""}>${escapeHtml(t(uiKeys.create.videoSettings.saveLatentDisabled))}</option>`;
    const h3MotionContextNode = environmentScan?.customNodes.find((node) => node.id === "h3-motion-context");
    const h3MotionContextReady = !extending || !isR2V || Boolean(h3MotionContextNode?.installed || h3MotionContextNode?.loaded);
    const motionContextLatentTrimValid = !isR2V || !motionContextLatentReady || Math.abs(draft.trimEndSeconds - draft.sourceVideoDuration) < 0.05;
    const motionInspection = isR2V && extending && options.extensionSourceInspection?.route === "motion-context"
        ? options.extensionSourceInspection
        : undefined;
    const motionContextPreflightBlockReason = isR2V && extending && motionContextLatentReady
        ? motionInspection?.status === "available"
            ? ""
            : motionInspection?.reason || t(uiKeys.create.motionContextLatent.pendingValidation)
        : "";
    const motionContextStatusTone = !motionContextLatentReady
        ? "info"
        : motionInspection?.status === "available"
            ? "success"
            : motionInspection?.status === "invalid" || motionInspection?.status === "missing"
                ? "error"
                : "warning";
    const motionContextStatusLabel = !motionContextLatentReady
        ? t(uiKeys.create.motionContextLatent.statusVideoContext)
        : motionInspection?.status === "available"
            ? t(uiKeys.create.motionContextLatent.statusReady)
            : motionInspection
                ? t(uiKeys.create.motionContextLatent.statusBlocked)
                : t(uiKeys.create.motionContextLatent.statusChecking);
    const motionContextStatusDetail = !motionContextLatentReady
        ? motionInspection?.reason || t(uiKeys.create.motionContextLatent.statusVideoContext)
        : motionInspection?.reason || t(uiKeys.create.motionContextLatent.pendingValidation);
    const slaTurboSelected = draft.videoLoras.some((lora) => isH3SlaTurboLoraId(lora.id) && videoLoraCompatibleWithModel(lora, draft.modelId));
    const slaNode = environmentScan?.customNodes.find((node) => node.id === "plaguekind-h3-sla");
    const prompt = activePrompt(draft, state.settings.uiLocale);
    let continuumPromptBlockReason = "";
    if (isManagedContinuum && extending && prompt.text.trim()) {
        try {
            continuumTimelinePromptForTask({ ...draft, prompt: prompt.text.trim() }, draft.duration);
        }
        catch (error) {
            continuumPromptBlockReason = error instanceof Error ? error.message : String(error);
        }
    }
    const h3TokenEstimate = isMiniMaxH3
        ? h3TokenCountForDraft(draft, prompt.text)
        : undefined;
    const promptVersionIndex = activePromptIndexForDraft(draft);
    const promptVersionCount = promptVersionsForDraft(draft).length;
    const interpolation = interpolationEstimate(draft);
    const safety = extending
        ? extensionSafetyForDraft(continuumEffectiveDraft, state.settings)
        : generationSafetyForCreateDraft(draft, state.settings.uiLocale);
    const supportsEndImage = workflowCapabilities[draft.workflowPath]?.supportsEndImage === true;
    const supportsVideoExtension = workflowCapabilities[draft.workflowPath]?.supportsVideoExtension === true;
    const selectedModelProfile = environmentScan?.modelProfiles.find((profile) => profile.id === draft.modelId);
    const continuumDependencyBlockReason = continuumDependencyBlockReasonFor(environmentScan, draft.modelId, isContinuum && extending);
    const continuumRuntimeUnverified = isManagedContinuum && extending && (!environmentScan ||
        !selectedModelProfile?.runtimeVerified ||
        selectedModelProfile.runtimeReady !== true ||
        !environmentScan.comfyCompatibility.checkedFrom);
    const trimDuration = Math.max(0, continuumEffectiveDraft.trimEndSeconds - continuumEffectiveDraft.trimStartSeconds);
    const trimStartPercent = continuumEffectiveDraft.sourceVideoDuration > 0
        ? continuumEffectiveDraft.trimStartSeconds / continuumEffectiveDraft.sourceVideoDuration * 100
        : 0;
    const trimEndPercent = continuumEffectiveDraft.sourceVideoDuration > 0
        ? continuumEffectiveDraft.trimEndSeconds / continuumEffectiveDraft.sourceVideoDuration * 100
        : 100;
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
        ? loraRuleText(H3_SLA_TURBO_LORA_ID, slaNode?.installed ? "slaNodeRestart" : "slaNodeMissing", state.settings.uiLocale)
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
        isContinuum,
        continuumArtifactReady,
        continuumPreflightBlockReason: continuumDependencyBlockReason || continuumPromptBlockReason || (isContinuum && extending && videoReady && !continuumArtifactReady
            ? options.extensionSourceInspection?.reason || t(uiKeys.create.continuumArtifact.pendingValidation)
            : ""),
        videoReady,
        trimDuration,
        workflowPath: draft.workflowPath,
        supportsVideoExtension,
        safetySafe: safety.safe,
        safetyMessage: safety.message,
        h3MotionContextReady,
        motionContextLatentTrimValid,
        motionContextPreflightBlockReason,
        spectrumReady,
        r2vSlotsReady,
        startImagePath: draft.startImagePath,
        allowTextOnly: h3Mode === "T2VA",
        turboCoreBlockReason,
        turboLoraBlockReason,
        selectedLoraBlockReason
    });
    const continuumStatus = continuumStatusFor(t, state, draft, isManagedContinuum, continuumArtifactReady, enqueueBlockReason, continuumDependencyBlockReason, continuumRuntimeUnverified, options.extensionSourceInspection);
    const continuumDependencyRoute = t(isManagedContinuum
        ? uiKeys.create.continuumArtifact.managedRoute
        : uiKeys.create.continuumArtifact.bootstrapRoute);
    const continuumDependencyProgress = !isManagedContinuum
        ? t(uiKeys.create.continuumArtifact.dependencyProgressBootstrap)
        : draft.h3ContinuumSequence && draft.h3ContinuumSequence.acceptedChunks > 0
            ? t(uiKeys.create.continuumArtifact.dependencyProgressChunks, {
                count: draft.h3ContinuumSequence.acceptedChunks,
                target: draft.h3ContinuumSequence.targetChunks
            })
            : t(uiKeys.create.continuumArtifact.dependencyProgressFirst);
    const continuumDependencyFiles = continuumDependencyFilesFor(t, draft, isManagedContinuum, options.extensionSourceInspection);
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
        isContinuum,
        continuumManaged: isManagedContinuum,
        continuumStatusTone: continuumStatus.tone,
        continuumStatusLabel: continuumStatus.label,
        continuumStatusDetail: continuumStatus.detail,
        continuumArtifactReady,
        continuumArtifactFilename,
        continuumArtifactHistoryBound: Boolean(draft.h3ContinuumArtifact),
        continuumDependencyRoute,
        continuumDependencyProgress,
        continuumDependencyFiles,
        motionContextLatentReady,
        motionContextLatentFilename,
        motionContextLatentHistoryBound,
        motionContextStatusTone,
        motionContextStatusLabel,
        motionContextStatusDetail,
        h3TokenEstimate,
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
            : promptBoundaryBlockReason
                ? promptBoundaryBlockReason
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
            ? h3PromptCheckMarkup(prompt.text, Boolean(draft.endImagePath), h3Mode, draft.h3ReferenceSlots.some((slot) => slot.mediaType === "image"), draft.h3ReferenceSlots.some((slot) => slot.mediaType === "video"), draft.duration, escapeHtml, h3PromptPack.ui, draft.videoLoras)
            : "",
        modelOptions: createModelOptionViewModels(draft, environmentScan, workflowCapabilities, bundledWorkflows, t),
        resolutionOptionsMarkup,
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
        spectrumLabelMarkup: fieldLabelWithTip(t(uiKeys.create.validation.spectrumLabel), extending && isR2V
            ? t(uiKeys.create.validation.spectrumMotionContext)
            : !spectrumEligible
                ? turboEnabled && !spectrumTurboCompatible
                    ? t(uiKeys.create.validation.spectrumTurboUpdate, { version: SPECTRUM_TURBO_MINIMUM_VERSION })
                    : t(uiKeys.create.validation.spectrumUnsupported)
                : !spectrumLoaded
                    ? t(uiKeys.create.validation.spectrumInstall)
                    : t(uiKeys.create.validation.spectrumLoaded, { version: spectrumNode?.version ? `v${spectrumNode.version}` : t(uiKeys.create.options.spectrumLoaded) })),
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
        jointAvLabelMarkup: fieldLabelWithTip(t(uiKeys.create.videoSettings.saveLatentData), latentSaveDisabled
            ? t(uiKeys.create.videoSettings.saveLatentManagedTip)
            : t(uiKeys.create.videoSettings.saveLatentDataDescription)),
        latentSaveModeOptionsMarkup,
        latentSaveDisabled,
        loraLabelMarkup: fieldLabelWithTip(t(uiKeys.create.validation.loraLabel), t(uiKeys.create.validation.loraDescription)),
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
