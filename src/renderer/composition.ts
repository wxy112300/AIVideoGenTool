import {
  imageEditDraftFromQueueTask
} from "../core/image-project";
import { ensureMotionContextSourceSlot } from "../core/h3-reference";
import { uiKeys } from "../core/i18n-keys";
import { normalizeVideoDraft } from "../core/video-draft-normalization";
import { DLSS5_MODEL_ID, requireLegacyUpscaleTargetHeight } from "../core/dlss5";
import { AETHERSCALE_DEFAULT_MODE, AETHERSCALE_DEFAULT_STYLE_PROFILE, AETHERSCALE_MODEL_ID, isAetherScaleMode, isAetherScaleStyleProfile } from "../core/aetherscale";
import {
  continuumMaxDurationSeconds,
  isMiniMaxH3ContinuumModel,
  isMiniMaxH3R2vModel,
  motionContextMaxDurationSeconds,
  normalizeH3Steps
} from "../core/workflow";
import type {
  AppState,
  Draft,
  QueueTask,
  UpscaleQueueTask
} from "../types";
import type { CreationMode, Page, RendererContext } from "./contracts";
import type { RendererApplicationApi } from "./studio-client";
import type { RendererUiState } from "./ui-state";
import type { QueueActionBusy } from "./pages/queue/card";
import type { QueueConfirmationAction } from "./pages/queue/controller";

export interface RendererNavigationDependencies {
  getState(): AppState;
  ui: RendererUiState;
  setCreationMode(mode: CreationMode): void;
  setPage(page: Page): void;
  patchDraft(patch: Partial<Draft>): void;
  render(): void;
}

export interface RendererNavigation {
  navigateToCreationMode(mode: CreationMode): void;
}

/**
 * Cross-page route changes that need to normalize a draft before entering a
 * workspace live here instead of in the renderer composition root.
 */
export function createRendererNavigation(
  deps: RendererNavigationDependencies
): RendererNavigation {
  function navigateToCreationMode(mode: CreationMode): void {
    const state = deps.getState();
    if (mode === "video-extension" && (isMiniMaxH3R2vModel(state.draft.modelId) || isMiniMaxH3ContinuumModel(state.draft.modelId))) {
      const maxDuration = isMiniMaxH3ContinuumModel(state.draft.modelId)
        ? continuumMaxDurationSeconds()
        : motionContextMaxDurationSeconds();
      if (state.draft.duration > maxDuration) {
        deps.patchDraft({ duration: maxDuration });
      }
    }
    deps.setCreationMode(mode);
    deps.setPage("create");
    deps.ui.historyForwardTarget = null;
    deps.render();
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  }

  return { navigateToCreationMode };
}

export interface QueueWorkspaceCoordinatorDependencies {
  context: RendererContext;
  application: Pick<RendererApplicationApi, "saveImageDraft" | "removeTask">;
  ui: RendererUiState;
  getState(): AppState;
  setState(nextState: AppState): void;
  render(): void;
  renderOverlay(): void;
  rememberModalFocus(): void;
  saveDraftImmediately(draft: Draft): Promise<void>;
  navigateToCreationMode(mode: CreationMode): void;
}

export interface QueueWorkspaceCoordinator {
  getActionBusy(): QueueActionBusy;
  setActionBusy(value: QueueActionBusy): void;
  requestConfirmation(taskId: string, action: QueueConfirmationAction): void;
  editTask(taskId: string): Promise<void>;
  editUpscaleTask(task: UpscaleQueueTask): void;
}

function draftFromQueueTask(
  task: QueueTask,
  currentDraft: Draft,
  t: RendererContext["t"]
): Draft | null {
  if (task.taskType === "upscale" || task.taskType === "image-generation" || task.status === "running") {
    return null;
  }
  const now = new Date().toISOString();
  const resolution = [360, 480, 540, 720, 768].includes(task.resolution)
    ? task.resolution as Draft["resolution"]
    : 480;
  const extension = task.taskType === "extension";
  return normalizeVideoDraft({
    ...currentDraft,
    inputMode: extension ? "video" : "image",
    startImagePath: extension ? "" : task.startImagePath,
    sourceWidth: task.sourceWidth,
    sourceHeight: task.sourceHeight,
    endImagePath: extension ? "" : task.endImagePath,
    endImageWidth: task.taskType === "generation" ? task.endImageWidth ?? 0 : 0,
    endImageHeight: task.taskType === "generation" ? task.endImageHeight ?? 0 : 0,
    sourceVideoPath: extension ? task.sourceVideoPath : "",
    sourceVideoDuration: extension ? task.sourceVideoDuration : 0,
    trimStartSeconds: extension ? task.trimStartSeconds : 0,
    trimEndSeconds: extension ? task.trimEndSeconds : 0,
    sourceAssetId: extension ? task.sourceAssetId : undefined,
    sourceVersionId: extension ? task.sourceVersionId : undefined,
    h3ContinuumArtifactPath: extension ? task.h3ContinuumArtifactPath : undefined,
    h3ContinuumArtifact: extension && task.h3ContinuumArtifact
      ? structuredClone(task.h3ContinuumArtifact)
      : undefined,
    ...(extension
      ? {
          extensionPromptVersions: [{
            id: crypto.randomUUID(),
            label: t(uiKeys.runtime.fromQueue),
            text: task.prompt,
            createdAt: now
          }],
          extensionActivePromptVersion: 0
        }
      : {
          promptVersions: [{
            id: crypto.randomUUID(),
            label: t(uiKeys.runtime.fromQueue),
            text: task.prompt,
            createdAt: now
          }],
          activePromptVersion: 0
        }),
    h3ReferenceSlots: extension
      ? task.taskType === "extension" && isMiniMaxH3R2vModel(task.modelId)
        ? ensureMotionContextSourceSlot(task.h3ReferenceSlots ?? [], task.sourceVideoPath)
        : []
      : (task.h3ReferenceSlots ?? []).map((slot) => ({ ...slot })),
    modelId: task.modelId,
    videoLoras: task.videoLoras?.map((lora) => ({ ...lora })) ?? [],
    workflowPath: task.workflowPath,
    ratio: task.ratio,
    resolution,
    duration: task.duration,
    steps: normalizeH3Steps(task.steps, task.modelId, task.videoLoras),
    fps: task.fps,
    frameInterpolation: task.frameInterpolation,
    motion: task.motion,
    seed: task.seed,
    keepSeedOnCopy: task.keepSeedOnCopy
  });
}

export function createQueueWorkspaceCoordinator(
  deps: QueueWorkspaceCoordinatorDependencies
): QueueWorkspaceCoordinator {
  let actionBusy: QueueActionBusy = null;

  const setActionBusy = (value: QueueActionBusy): void => {
    actionBusy = value;
  };

  const requestConfirmation = (
    taskId: string,
    action: QueueConfirmationAction
  ): void => {
    const task = deps.getState().queue.find((item) => item.id === taskId);
    if (!task) return;
    deps.rememberModalFocus();
    deps.ui.pendingConfirmation = {
      kind: action === "remove" ? "remove-queue-task" : "cancel-queue-task",
      taskId,
      title: task.outputFilename
    };
    deps.ui.confirmationBusy = false;
    deps.renderOverlay();
  };

  const editUpscaleTask = (task: UpscaleQueueTask): void => {
    const editingWaitingTask = task.status === "waiting";
    const dlss5Selected = task.modelId === DLSS5_MODEL_ID;
    const aetherScaleSelected = task.modelId === AETHERSCALE_MODEL_ID;
    deps.ui.upscaleDialog = {
      ...(editingWaitingTask ? { taskId: task.id } : { replaceTaskId: task.id }),
      assetId: task.sourceAssetId,
      versionId: task.sourceVersionId,
      ...(task.upscaleMode === "h3-native"
        ? { h3Provider: task.h3NativeInput?.provider ?? "bilinear" }
        : {}),
      ...(dlss5Selected
        ? {
            targetScale: task.targetScale ?? task.dlss5?.scale ?? 2,
            dlss5Quality: task.dlss5?.quality ?? "quality"
          }
        : aetherScaleSelected
          ? {
              aetherScaleMode: isAetherScaleMode(task.aetherScale?.mode)
                ? task.aetherScale.mode
                : AETHERSCALE_DEFAULT_MODE,
              aetherStyleProfile: isAetherScaleStyleProfile(task.aetherScale?.styleProfile)
                ? task.aetherScale.styleProfile
                : AETHERSCALE_DEFAULT_STYLE_PROFILE
            }
        : {
            targetHeight: requireLegacyUpscaleTargetHeight(task.targetHeight)
          }),
      modelId: task.upscaleMode === "h3-native"
        ? "minimax_h3_latent_upscaler"
        : task.modelId as NonNullable<RendererUiState["upscaleDialog"]>["modelId"],
      tileMode: task.tileMode
    };
    deps.renderOverlay();
  };

  const editTask = async (taskId: string): Promise<void> => {
    const task = deps.getState().queue.find((item) => item.id === taskId);
    if (!task || task.status === "running") return;
    setActionBusy({ taskId, action: "edit" });
    deps.render();
    try {
      if (task.taskType === "image-generation") {
        const imageDraft = imageEditDraftFromQueueTask(task, deps.getState().imageDraft);
        deps.setState(await deps.application.saveImageDraft(imageDraft));
        deps.setState(await deps.application.removeTask(taskId));
        setActionBusy(null);
        deps.navigateToCreationMode("image-edit");
        deps.context.notify(deps.context.t(uiKeys.runtime.queueImageReturned));
        return;
      }
      const draft = draftFromQueueTask(task, deps.getState().draft, deps.context.t);
      if (!draft) {
        setActionBusy(null);
        deps.render();
        return;
      }
      await deps.saveDraftImmediately(draft);
      deps.setState(await deps.application.removeTask(taskId));
      setActionBusy(null);
      deps.navigateToCreationMode(draft.inputMode === "video" ? "video-extension" : "image-to-video");
      deps.context.notify(deps.context.t(uiKeys.runtime.queueReturned));
    } catch (error) {
      setActionBusy(null);
      deps.render();
      deps.context.notify(
        error instanceof Error ? error.message : deps.context.t(uiKeys.runtime.cannotEditQueue),
        { kind: "error" }
      );
    }
  };

  return {
    getActionBusy: () => actionBusy,
    setActionBusy,
    requestConfirmation,
    editTask,
    editUpscaleTask
  };
}
