import type {
  AppState,
  AssetVersion,
  Draft,
  ImageAssetVersion,
  ImageHistoryProject,
  UpscaleQueueTask
} from "../../../types";
import type { RendererContext } from "../../contracts";
import { uiKeys } from "../../../core/i18n-keys";
import {
  imageEditPicturesForVersion,
  normalizeImageEditDraft
} from "../../../core/image-project";
import {
  firstSupportedImageModelId,
  imageModelCapabilityFor
} from "../../../core/image-workflow";
import { normalizeH3Steps, isMiniMaxH3R2vModel, isRetiredVideoModel } from "../../../core/workflow";
import { ensureMotionContextSourceSlot } from "../../../core/h3-reference";
import { modelCatalog } from "../../../core/catalog";
import { nearestSupportedVideoResolution } from "../../../core/video-resolution";
import { modelName } from "../../shared/labels";
import { currentHistoryVersion, preferredVersion, versionShortEdge, versionVideoIndex } from "./helpers";
import type { UpscaleDialogState } from "../../shell/secondary-dialogs";

export interface HistoryActionsOptions {
  context: RendererContext;
  setState(nextState: AppState): void;
  getSelectedHistoryAssetId(): string;
  getSelectedHistoryVersionId(): string;
  setSelectedHistoryAssetId(assetId: string): void;
  setDialog(dialog: UpscaleDialogState | null): void;
  rememberModalFocus(): void;
  saveDraftImmediately(draft: Draft): Promise<void>;
  selectDraftVideo(
    filename: string,
    source?: {
      assetId: string;
      versionId: string;
      duration: number;
      width: number;
      height: number;
      h3ContextLatentPath?: string;
      /** Resolution to restore when continuing from a history video. */
      resolution?: number;
      /** History continuation starts a fresh random seed. */
      resetSeed?: boolean;
    },
    renderAfterSave?: boolean
  ): Promise<void>;
  navigateToCreationMode(mode: "image-to-video" | "video-extension" | "image-edit"): void;
  requestHistoryDeletion(assetId: string): void;
  reportUserAction(action: string, meta?: Record<string, unknown>): void;
}

export function createHistoryActions(options: HistoryActionsOptions) {
  const { context } = options;
  const t = context.t;
  const copyHistoryText = async (value: string, successMessage: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      context.notify(successMessage, { renderPage: false });
    } catch {
      context.notify(t(uiKeys.history.actions.copyFailed), { renderPage: false });
    }
  };
  const copyHistoryFile = async (filename: string, successMessage = t(uiKeys.history.menu.videoFileCopied)): Promise<void> => {
    if (!filename) {
      context.notify(t(uiKeys.history.actions.noMediaFile), { renderPage: false });
      return;
    }
    try {
      const result = await context.studio.copyFile(filename);
      context.notify(result.ok ? successMessage : result.message, { renderPage: false });
    } catch {
      context.notify(t(uiKeys.history.actions.copyMediaFailed), { renderPage: false });
    }
  };
  const copyHistoryImage = async (filename: string): Promise<void> => {
    if (!filename) {
      context.notify(t(uiKeys.history.actions.noImageFile), { renderPage: false });
      return;
    }
    try {
      const dataUrl = await context.studio.readImage(filename);
      if (!dataUrl || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        context.notify(t(uiKeys.history.actions.imageClipboardUnsupported), { renderPage: false });
        return;
      }
      const blob = await fetch(dataUrl).then((response) => response.blob());
      await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
      context.notify(t(uiKeys.history.actions.imagePixelsCopied), { renderPage: false });
    } catch {
      context.notify(t(uiKeys.history.actions.copyImagePixelsFailed), { renderPage: false });
    }
  };
  const editHistoryAsset = async (assetId: string): Promise<void> => {
    const state = context.getState();
    const asset = state?.history.find((item) => item.id === assetId);
    if (!state || !asset) return;
    if (isRetiredVideoModel(asset.modelId)) {
      context.notify(t(uiKeys.history.actions.retiredModel, { model: modelName(asset.modelId, state.settings.uiLocale) }));
      return;
    }
    const version = preferredVersion(asset);
    const requestedResolution = Number.isFinite(asset.resolution) && asset.resolution > 0
      ? asset.resolution
      : versionShortEdge(version);
    const isExtension = asset.inputMode === "video" || Boolean(asset.sourceVideoPath);
    const sourceVideoDuration = asset.sourceVideoDuration ?? asset.trimEndSeconds ?? 0;
    const historyPromptVersion = {
      id: crypto.randomUUID(),
      label: t(uiKeys.history.actions.fromHistory),
      text: asset.prompt,
      createdAt: new Date().toISOString()
    };
    const existingPromptVersions = isExtension && state.draft.extensionPromptVersions?.length
      ? state.draft.extensionPromptVersions
      : state.draft.promptVersions;
    const draft: Draft = {
      ...state.draft,
      inputMode: isExtension ? "video" : "image",
      modelId: asset.modelId,
      workflowPath: asset.workflowPath ?? state.draft.workflowPath,
      startImagePath: isExtension ? "" : asset.startImagePath ?? "",
      sourceWidth: asset.sourceWidth ?? (isExtension ? version.width : 0),
      sourceHeight: asset.sourceHeight ?? (isExtension ? version.height : 0),
      endImagePath: isExtension ? "" : asset.endImagePath ?? "",
      sourceVideoPath: isExtension ? asset.sourceVideoPath ?? "" : "",
      sourceVideoDuration: isExtension ? sourceVideoDuration : 0,
      trimStartSeconds: isExtension ? asset.trimStartSeconds ?? 0 : 0,
      trimEndSeconds: isExtension ? asset.trimEndSeconds ?? sourceVideoDuration : 0,
      sourceAssetId: asset.sourceAssetId,
      sourceVersionId: asset.sourceVersionId,
      h3ReferenceSlots: isExtension && isMiniMaxH3R2vModel(asset.modelId)
        ? ensureMotionContextSourceSlot(
            (asset.h3ReferenceSlots ?? []).map((slot) => ({ ...slot })),
            asset.sourceVideoPath ?? ""
          )
        : isExtension
          ? []
          : (asset.h3ReferenceSlots ?? []).map((slot) => ({ ...slot })),
      videoLoras: asset.videoLoras?.map((lora) => ({ ...lora })) ?? [],
      ratio: asset.ratio ?? state.draft.ratio,
      resolution: nearestSupportedVideoResolution(
        requestedResolution,
        modelCatalog.get(asset.modelId)?.definition.capabilities?.resolutions ?? [360, 480, 540, 720, 768],
        state.draft.resolution
      ) as Draft["resolution"],
      duration: asset.duration,
      steps: normalizeH3Steps(asset.steps, asset.modelId, asset.videoLoras),
      fps: ([8, 12, 16, 24, 25, 30].includes(asset.fps ?? 24) ? asset.fps ?? 24 : 24) as Draft["fps"],
      frameInterpolation: asset.frameInterpolation ?? "off",
      spectrumMode: preferredVersion(asset).spectrumMode ?? "off",
      spectrumModelAwareMode: preferredVersion(asset).spectrumModelAwareMode ?? "off",
      seed: asset.seed,
      ...(isExtension
        ? {
            extensionPromptVersions: [...existingPromptVersions, historyPromptVersion],
            extensionActivePromptVersion: existingPromptVersions.length
          }
        : {
            promptVersions: [...state.draft.promptVersions, historyPromptVersion],
            activePromptVersion: state.draft.promptVersions.length
          })
    };
    await options.saveDraftImmediately(draft);
    options.navigateToCreationMode(isExtension ? "video-extension" : "image-to-video");
  };
  const continueImageEdit = async (project: ImageHistoryProject, version: ImageAssetVersion): Promise<void> => {
    const pictures = imageEditPicturesForVersion(version);
    if (!pictures.length) {
      context.notify(t(uiKeys.history.actions.imageUnavailable), { renderPage: false });
      return;
    }
    const state = context.getState();
    if (!state) return;
    const modelId = firstSupportedImageModelId(
      version.kind === "source" ? undefined : version.modelId,
      state.imageDraft.modelId,
      state.settings.defaultImageModel
    );
    const capability = imageModelCapabilityFor(modelId);
    const qualityProfile = capability.qualityProfiles.some((profile) => profile.id === state.imageDraft.qualityProfile)
      ? state.imageDraft.qualityProfile
      : capability.qualityProfiles[0]?.id ?? "native";
    const draft = normalizeImageEditDraft({
      ...state.imageDraft,
      projectId: project.id,
      parentVersionId: version.id,
      modelId,
      qualityProfile,
      aspectRatio: version.aspectRatio ?? state.imageDraft.aspectRatio ?? "source",
      targetResolution: version.targetResolution ?? state.imageDraft.targetResolution,
      pictures,
      promptVersions: [{
        id: crypto.randomUUID(),
        label: t(uiKeys.history.actions.fromImageHistory),
        text: version.prompt,
        createdAt: new Date().toISOString()
      }],
      activePromptVersion: 0,
      seed: version.seed ?? null,
      outputFormat: "png"
    });
    options.setState(await context.studio.saveImageDraft(draft));
    options.reportUserAction("image-history-continue-edit", { projectId: project.id, versionId: version.id });
    options.navigateToCreationMode("image-edit");
  };
  const continueImageToVideo = async (project: ImageHistoryProject, version: ImageAssetVersion): Promise<void> => {
    const filename = version.file.absolutePath;
    if (!filename) {
      context.notify(t(uiKeys.history.actions.imageUnavailable), { renderPage: false });
      return;
    }
    const state = context.getState();
    if (!state) return;
    await options.saveDraftImmediately({
      ...state.draft,
      inputMode: "image",
      startImagePath: filename,
      sourceWidth: version.width,
      sourceHeight: version.height,
      sourceAssetId: project.id,
      sourceVersionId: version.id,
      endImagePath: "",
      h3ReferenceSlots: [],
      sourceVideoPath: "",
      sourceVideoDuration: 0,
      trimStartSeconds: 0,
      trimEndSeconds: 0,
      h3ContextLatentPath: undefined,
      ratio: "source"
    });
    options.reportUserAction("image-history-continue-video", { projectId: project.id, versionId: version.id });
    options.navigateToCreationMode("image-to-video");
  };
  const continueVideoHistory = async (assetId: string, versionId: string): Promise<void> => {
    options.reportUserAction("history-continue", { assetId, versionId });
    const asset = context.getState()?.history.find((item) => item.id === assetId);
    const version = asset?.versions.find((item) => item.id === versionId);
    const videoIndex = version ? versionVideoIndex(version) : -1;
    const filename = videoIndex >= 0 ? version?.files[videoIndex]?.absolutePath : undefined;
    if (!asset || !version || !filename) {
      context.notify(t(uiKeys.history.actions.videoUnavailable), { renderPage: false });
      return;
    }
    try {
      await options.selectDraftVideo(filename, {
        assetId: asset.id,
        versionId: version.id,
        duration: version.duration,
        width: version.width,
        height: version.height,
        h3ContextLatentPath: version.h3ContextLatentPath,
        resolution: Number.isFinite(asset.resolution) && asset.resolution > 0
          ? asset.resolution
          : versionShortEdge(version),
        resetSeed: true
      }, false);
      options.navigateToCreationMode("video-extension");
    } catch (error) {
      context.notify(error instanceof Error ? error.message : t(uiKeys.history.actions.continueFailed), { renderPage: false, kind: "error" });
    }
  };
  const openUpscaleDialog = () => {
    options.reportUserAction("history-open-upscale");
    const state = context.getState();
    const asset = state?.history.find((item) => item.id === options.getSelectedHistoryAssetId());
    if (!state || !asset) return;
    const version = currentHistoryVersion(asset, options.getSelectedHistoryVersionId());
    const targetShortEdge = ([720, 1080, 1440, 2160] as const).find((shortEdge) => shortEdge > versionShortEdge(version));
    if (!targetShortEdge) return;
    options.rememberModalFocus();
    const configuredModel = state.settings.defaultUpscaleModel;
    options.setDialog({
      assetId: asset.id,
      versionId: version.id,
      targetHeight: targetShortEdge,
      modelId: (["seedvr2", "seedvr2-native-int8", "flashvsr", "realesrgan"] as const).includes(configuredModel as "seedvr2" | "seedvr2-native-int8" | "flashvsr" | "realesrgan")
        ? configuredModel as UpscaleDialogState["modelId"]
        : "seedvr2",
      tileMode: state.settings.upscaleTileMode
    });
    context.requestRender();
  };
  return {
    copyHistoryText,
    copyHistoryFile,
    copyHistoryImage,
    editHistoryAsset,
    continueImageEdit,
    continueImageToVideo,
    continueVideoHistory,
    openUpscaleDialog
  };
}
