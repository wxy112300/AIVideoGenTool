import type {
  AppState,
  HistoryMetadataPatch,
  Draft
} from "../../../types";
import type { CreationMode, HistoryKind, Page, RendererCleanup, RendererContext } from "../../contracts";
import type { RendererUiState } from "../../ui-state";
import { normalizeHistoryFilter, historyFilterSignature } from "../../../core/history-filter";
import { swapHistoryDetailFragments } from "./detail-transition";
import {
  historyAssetsByNewest,
  imageProjectsByNewest,
  preferredImageVersion,
  preferredVersion
} from "./helpers";
import {
  createHistoryAssembly,
  mountHistoryAssembly,
} from "./assembly";
import { createHistoryContextMenus } from "./context-menus";
import { createHistoryLayoutController } from "./layout-controller";
import { createHistoryActions, type HistoryActionsOptions } from "./actions";
import { createHistoryMediaRuntime } from "./media-helpers";
import { escapeHtml } from "../../shared/dom";
import { icon, renderIcons } from "../../shared/icons";
import { formatVideoDuration } from "../../shared/formatters";
import {
  mountHistoryNavigationController,
  type HistoryNavigationControllerOptions
} from "./navigation-controller";
import {
  toggleHistoryPlayerFullscreen,
  type HistoryPlaybackSnapshot
} from "./page-controller";
import type { HistoryLayout } from "./layout-controller";

export type { HistoryPlaybackSnapshot } from "./page-controller";

export interface HistoryWorkspaceCoordinatorDependencies {
  context: RendererContext;
  ui: RendererUiState;
  getState(): AppState;
  getPage(): Page;
  setPage(page: Page): void;
  getHistoryKind(): HistoryKind;
  setHistoryKind(kind: HistoryKind): void;
  setState(nextState: AppState): void;
  addPageCleanup(cleanup: RendererCleanup): void;
  render(): void;
  reportUserAction(action: string, meta?: Record<string, unknown>): void;
  rememberModalFocus(): void;
  restoreModalFocus(): void;
  bindModalFocus(
    dialog: HTMLElement,
    close: () => void,
    initialSelector?: string,
    focusOnBind?: boolean
  ): void;
  renderOverlay(): void;
  saveDraftImmediately(draft: Draft): Promise<void>;
  selectDraftVideo(
    filename: string,
    source?: Parameters<HistoryActionsOptions["selectDraftVideo"]>[1],
    renderAfterSave?: boolean
  ): Promise<void>;
  navigateToCreationMode(mode: CreationMode): void;
}

export interface HistoryWorkspaceCoordinator {
  renderList(context?: RendererContext): string;
  renderDetail(context: RendererContext, kind: "video" | "image"): string;
  bind(playback?: HistoryPlaybackSnapshot | null): void;
  bindNavigation(): RendererCleanup;
  beforeRender(): void;
  bindViewportControls(): RendererCleanup;
  restoreScrollPosition(): void;
  captureHistoryScrollPosition(preferredAssetId?: string): void;
  setScrollRestorePending(value: boolean): void;
  getLayout(): HistoryLayout;
  resetScroll(): void;
  switchLayout(layout: HistoryLayout): void;
  bindMasonry(): void;
  bindAlbum(): void;
  bindImageHistoryViewer(): void;
  bindTitleMarquees(): void;
  restoreLayoutAnchor(): void;
  clearImageHistoryThumbnailCache(): void;
  releaseHistoryVideo(assetId: string): void;
  openHistoryDetail(assetId: string, versionId?: string): void;
  openImageHistoryDetail(projectId: string, versionId?: string): void;
  returnToHistory(): void;
  returnToLastHistoryDetail(): void;
  navigateHistoryDetail(direction: -1 | 1): void;
  navigateImageHistoryDetail(direction: -1 | 1): void;
}

export function createHistoryWorkspaceCoordinator(
  deps: HistoryWorkspaceCoordinatorDependencies
): HistoryWorkspaceCoordinator {
  let activeHistoryCleanup: RendererCleanup | null = null;

  const historyMediaRuntime = createHistoryMediaRuntime(
    deps.context,
    () => deps.getPage() === "history"
  );
  const historyLayoutController = createHistoryLayoutController(
    deps.context,
    deps.reportUserAction,
    () => historyFilterSignature(deps.ui.historyFilter)
  );

  const requestHistoryDeletion = (assetId: string): void => {
    const state = deps.getState();
    const asset = state.history.find((item) => item.id === assetId);
    const project = state.imageHistory.find((item) => item.id === assetId);
    const title = asset?.title ?? project?.title;
    if (!title) return;
    if (deps.getPage() === "history") historyLayoutController.captureHistoryScrollPosition(assetId);
    deps.rememberModalFocus();
    deps.ui.pendingConfirmation = { kind: "delete-history", assetId, title };
    deps.ui.confirmationBusy = false;
    deps.renderOverlay();
  };

  const requestHistoryVersionDeletion = (assetId: string, versionId: string): void => {
    const state = deps.getState();
    const asset = state.history.find((item) => item.id === assetId);
    const version = asset?.versions.find((item) => item.id === versionId);
    if (!asset || !version || asset.versions.length <= 1) return;
    if (deps.getPage() === "history") historyLayoutController.captureHistoryScrollPosition(assetId);
    deps.rememberModalFocus();
    deps.ui.pendingConfirmation = {
      kind: "delete-video-version",
      assetId,
      versionId,
      title: deps.context.t("runtime.historyVersionTitle", {
        title: asset.title,
        version: `${version.width} × ${version.height}`
      })
    };
    deps.ui.confirmationBusy = false;
    deps.renderOverlay();
  };

  const requestImageVersionDeletion = (projectId: string, versionId: string): void => {
    const state = deps.getState();
    const project = state.imageHistory.find((item) => item.id === projectId);
    const version = project?.versions.find((item) => item.id === versionId);
    if (!project || !version || version.kind === "source") return;
    if (deps.getPage() === "history") historyLayoutController.captureHistoryScrollPosition(projectId);
    deps.rememberModalFocus();
    deps.ui.pendingConfirmation = {
      kind: "delete-image-version",
      projectId,
      versionId,
      title: deps.context.t("runtime.historyVersionTitle", {
        title: project.title,
        version: version.versionNumber
      })
    };
    deps.ui.confirmationBusy = false;
    deps.renderOverlay();
  };

  const historyAssembly = createHistoryAssembly({
    getState: deps.getState,
    getHistoryKind: deps.getHistoryKind,
    getHistoryLayout: () => historyLayoutController.getLayout(),
    getHistoryFilter: () => deps.ui.historyFilter,
    isHistoryFilterPanelOpen: () => deps.ui.historyFilterPanelOpen,
    getSelectedHistoryAssetId: () => deps.ui.selectedHistoryAssetId,
    getSelectedHistoryVersionId: () => deps.ui.selectedHistoryVersionId,
    setSelectedHistoryVersionId: (versionId) => {
      deps.ui.selectedHistoryVersionId = versionId;
    },
    setHistoryKind: deps.setHistoryKind,
    navigateToHistory: () => deps.setPage("history")
  });

  const historyActions = createHistoryActions({
    context: deps.context,
    setState: deps.setState,
    getSelectedHistoryAssetId: () => deps.ui.selectedHistoryAssetId,
    getSelectedHistoryVersionId: () => deps.ui.selectedHistoryVersionId,
    setSelectedHistoryAssetId: (assetId) => {
      deps.ui.selectedHistoryAssetId = assetId;
    },
    setDialog: (dialog) => {
      deps.ui.upscaleDialog = dialog;
    },
    rememberModalFocus: deps.rememberModalFocus,
    saveDraftImmediately: deps.saveDraftImmediately,
    selectDraftVideo: deps.selectDraftVideo,
    navigateToCreationMode: deps.navigateToCreationMode,
    requestHistoryDeletion,
    reportUserAction: deps.reportUserAction
  });

  const historyContextMenus = createHistoryContextMenus(deps.context, {
    getState: () => deps.getState(),
    openHistoryDetail: (assetId) => openHistoryDetail(assetId),
    editHistoryAsset: historyActions.editHistoryAsset,
    openImageHistoryDetail: (projectId) => openImageHistoryDetail(projectId),
    continueImageEdit: historyActions.continueImageEdit,
    continueImageToVideo: historyActions.continueImageToVideo,
    copyHistoryFile: historyActions.copyHistoryFile,
    copyHistoryText: historyActions.copyHistoryText,
    requestHistoryDeletion,
    toggleHistoryPlayerFullscreen
  });

  function historyPlayerIsFullscreen(): boolean {
    return Boolean(document.fullscreenElement?.closest(".history-player"));
  }

  function restoreHistoryPlayerFullscreen(): void {
    const target = document.querySelector<HTMLElement>(".history-player") ??
      document.querySelector<HTMLVideoElement>(".history-player video");
    if (!target?.requestFullscreen) return;
    void target.requestFullscreen().catch(() => undefined);
  }

  const historyNavigationOptions = (): HistoryNavigationControllerOptions => ({
    setHistoryKind: (kind) => {
      deps.setHistoryKind(kind);
      if (kind === "image" && deps.ui.historyFilter.minDuration !== null) {
        deps.ui.historyFilter = normalizeHistoryFilter({ ...deps.ui.historyFilter, minDuration: null });
      }
    },
    resetHistoryScroll: () => historyLayoutController.resetScroll(),
    captureHistoryScrollPosition: (preferredAssetId, preserveForActivation) =>
      historyLayoutController.captureHistoryScrollPosition(preferredAssetId, preserveForActivation),
    switchHistoryLayout: historyLayoutController.switchLayout,
    openHistoryDetail: (assetId) => openHistoryDetail(assetId),
    openImageHistoryDetail: (projectId) => openImageHistoryDetail(projectId),
    navigateHistoryDetail,
    navigateImageHistoryDetail,
    navigateImageHistoryVersion,
    selectVideoHistoryVersion: (versionId) => {
      deps.reportUserAction("history-version-select", { versionId });
      deps.ui.selectedHistoryVersionId = versionId;
      if (deps.ui.selectedHistoryAssetId) {
        deps.ui.historyForwardTarget = { assetId: deps.ui.selectedHistoryAssetId, versionId };
      }
      deps.render();
    },
    selectImageHistoryVersion: (versionId) => {
      if (!deps.ui.selectedHistoryAssetId) return;
      deps.ui.selectedHistoryVersionId = versionId;
      deps.ui.historyForwardTarget = { assetId: deps.ui.selectedHistoryAssetId, versionId };
      deps.reportUserAction("image-history-version-select", {
        projectId: deps.ui.selectedHistoryAssetId,
        versionId
      });
      deps.render();
    }
  });

  function bindNavigation(): RendererCleanup {
    return mountHistoryNavigationController(deps.context, historyNavigationOptions());
  }

  function bind(playback: HistoryPlaybackSnapshot | null = null): void {
    activeHistoryCleanup?.();
    const cleanup = mountHistoryAssembly({
      context: deps.context,
      playback,
      navigation: historyNavigationOptions(),
      media: { ...historyMediaRuntime, formatVideoDuration },
      actions: {
        setState: deps.setState,
        getSelectedHistoryAssetId: () => deps.ui.selectedHistoryAssetId,
        getSelectedHistoryVersionId: () => deps.ui.selectedHistoryVersionId,
        openUpscaleDialog: historyActions.openUpscaleDialog,
        requestHistoryDeletion,
        requestHistoryVersionDeletion,
        requestImageVersionDeletion,
        copyHistoryText: historyActions.copyHistoryText,
        copyHistoryFile: historyActions.copyHistoryFile,
        copyHistoryImage: historyActions.copyHistoryImage,
        editHistoryAsset: historyActions.editHistoryAsset,
        continueVideoHistory: historyActions.continueVideoHistory,
        continueImageEdit: async (projectId, versionId) => {
          const project = deps.getState().imageHistory.find((item) => item.id === projectId);
          const version = project?.versions.find((item) => item.id === versionId);
          if (project && version) await historyActions.continueImageEdit(project, version);
        },
        continueImageToVideo: async (projectId, versionId) => {
          const project = deps.getState().imageHistory.find((item) => item.id === projectId);
          const version = project?.versions.find((item) => item.id === versionId);
          if (project && version) await historyActions.continueImageToVideo(project, version);
        },
        updateHistoryMetadata: (assetId, patch: HistoryMetadataPatch) =>
          deps.context.application.updateHistoryMetadata(assetId, patch)
      },
      filter: {
        getFilter: () => deps.ui.historyFilter,
        setFilter: (filter) => {
          deps.ui.historyFilter = normalizeHistoryFilter(filter);
        },
        getPanelOpen: () => deps.ui.historyFilterPanelOpen,
        setPanelOpen: (open) => {
          deps.ui.historyFilterPanelOpen = open;
        }
      },
      tags: {
        setState: deps.setState,
        escapeHtml,
        icon,
        updateHistoryMetadata: (assetId, patch: HistoryMetadataPatch) =>
          deps.context.application.updateHistoryMetadata(assetId, patch)
      },
      historyLayout: historyLayoutController.getLayout(),
      isImageHistoryDetail: deps.getPage() === "image-history-detail",
      bindHistoryMasonry: historyLayoutController.bindMasonry,
      bindHistoryAlbum: historyLayoutController.bindAlbum,
      bindImageHistoryViewer: historyLayoutController.bindImageHistoryViewer,
      bindHistoryTitleMarquees: historyLayoutController.bindTitleMarquees,
      restoreHistoryLayoutAnchor: historyLayoutController.restoreLayoutAnchor,
      imageLightbox: {
        getSelectedHistoryAssetId: () => deps.ui.selectedHistoryAssetId,
        getSelectedHistoryVersionId: () => deps.ui.selectedHistoryVersionId,
        rememberModalFocus: deps.rememberModalFocus,
        restoreModalFocus: deps.restoreModalFocus,
        bindModalFocus: deps.bindModalFocus,
        setSelectedHistoryVersionId: (versionId) => {
          deps.ui.selectedHistoryVersionId = versionId;
        },
        setHistoryForwardTarget: (target) => {
          deps.ui.historyForwardTarget = target;
        }
      },
      openHistoryContextMenu: historyContextMenus.openHistory,
      openImageHistoryContextMenu: historyContextMenus.openImageHistory,
      openHistoryPlayerContextMenu: historyContextMenus.openHistoryPlayer,
      closeHistoryContextMenu: historyContextMenus.close
    });
    let disposed = false;
    const managedCleanup: RendererCleanup = () => {
      if (disposed) return;
      disposed = true;
      cleanup();
      if (activeHistoryCleanup === managedCleanup) activeHistoryCleanup = null;
    };
    activeHistoryCleanup = managedCleanup;
    deps.addPageCleanup(managedCleanup);
  }

  function resetHistoryDetailScroll(
    expectedPage: "history-detail" | "image-history-detail"
  ): void {
    const reset = () => {
      if (deps.getPage() !== expectedPage) return;
      window.scrollTo({ top: 0, behavior: "auto" });
    };
    // The detail shell is committed synchronously for the image path, while
    // the video player can finish mounting over later frames. Reset once now
    // and again across the first two frame boundaries so browser scroll
    // anchoring cannot leave a detail page at the list's old offset.
    reset();
    window.requestAnimationFrame(() => {
      reset();
      window.requestAnimationFrame(reset);
    });
  }

  function updateHistoryDetailInPlace(): boolean {
    const currentPlayer = document.querySelector<HTMLElement>(".history-player");
    if (!currentPlayer) return false;
    const nextMarkup = document.createElement("div");
    nextMarkup.innerHTML = historyAssembly.renderDetail(deps.context, "video");
    const nextPlayer = nextMarkup.querySelector<HTMLElement>(".history-player");
    if (!nextPlayer || !swapHistoryDetailFragments({
      currentRoot: document,
      nextRoot: nextMarkup,
      currentPlayer,
      nextPlayer
    })) return false;
    renderIcons(deps.context.root);
    const nextBack = document.querySelector<HTMLElement>(".history-detail-back");
    if (!nextBack) return false;
    nextBack.querySelector<HTMLButtonElement>("[data-page=history]")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      returnToHistory();
    });
    bind();
    return true;
  }

  function openHistoryDetail(assetId: string, versionId?: string): void {
    const preserveFullscreen = deps.getPage() === "history-detail" && historyPlayerIsFullscreen();
    if (deps.getPage() === "history") historyLayoutController.captureHistoryScrollPosition(assetId);
    deps.reportUserAction("history-open-detail", { assetId, versionId });
    deps.setHistoryKind("video");
    deps.ui.selectedHistoryAssetId = assetId;
    const asset = deps.getState().history.find((item) => item.id === assetId);
    deps.ui.selectedHistoryVersionId = asset?.versions.find((item) => item.id === versionId)?.id ??
      (asset ? preferredVersion(asset).id : "");
    deps.ui.historyForwardTarget = asset
      ? { assetId, versionId: deps.ui.selectedHistoryVersionId }
      : null;
    deps.setPage("history-detail");
    if (preserveFullscreen && updateHistoryDetailInPlace()) {
      resetHistoryDetailScroll("history-detail");
      return;
    }
    deps.render();
    if (preserveFullscreen) restoreHistoryPlayerFullscreen();
    resetHistoryDetailScroll("history-detail");
  }

  function openImageHistoryDetail(projectId: string, versionId?: string): void {
    const project = deps.getState().imageHistory.find((item) => item.id === projectId);
    if (!project) return;
    if (deps.getPage() === "history") historyLayoutController.captureHistoryScrollPosition(projectId);
    deps.reportUserAction("image-history-open-detail", { projectId, versionId });
    deps.setHistoryKind("image");
    deps.ui.selectedHistoryAssetId = projectId;
    deps.ui.selectedHistoryVersionId = project.versions.find((item) => item.id === versionId)?.id ??
      preferredImageVersion(project).id;
    deps.ui.historyForwardTarget = { assetId: projectId, versionId: deps.ui.selectedHistoryVersionId };
    deps.setPage("image-history-detail");
    deps.render();
    resetHistoryDetailScroll("image-history-detail");
  }

  function returnToHistory(): void {
    if (deps.getPage() !== "history-detail" && deps.getPage() !== "image-history-detail") return;
    historyLayoutController.setScrollRestorePending(true);
    deps.setPage("history");
    deps.render();
  }

  function returnToLastHistoryDetail(): void {
    if (deps.getPage() !== "history" || !deps.ui.historyForwardTarget) return;
    const target = deps.ui.historyForwardTarget;
    if (deps.getHistoryKind() === "image") {
      if (!deps.getState().imageHistory.some((item) => item.id === target.assetId)) {
        deps.ui.historyForwardTarget = null;
        return;
      }
      openImageHistoryDetail(target.assetId, target.versionId);
      return;
    }
    if (!deps.getState().history.some((item) => item.id === target.assetId)) {
      deps.ui.historyForwardTarget = null;
      return;
    }
    openHistoryDetail(target.assetId, target.versionId);
  }

  function navigateHistoryDetail(direction: -1 | 1): void {
    if (deps.getPage() !== "history-detail") return;
    const orderedHistory = historyAssetsByNewest(deps.getState().history, deps.ui.historyFilter);
    const currentIndex = orderedHistory.findIndex((item) => item.id === deps.ui.selectedHistoryAssetId);
    const nextAsset = orderedHistory[currentIndex + direction];
    if (nextAsset) openHistoryDetail(nextAsset.id);
  }

  function navigateImageHistoryDetail(direction: -1 | 1): void {
    if (deps.getPage() !== "image-history-detail") return;
    const orderedProjects = imageProjectsByNewest(deps.getState().imageHistory, deps.ui.historyFilter);
    const currentIndex = orderedProjects.findIndex((item) => item.id === deps.ui.selectedHistoryAssetId);
    const nextProject = orderedProjects[currentIndex + direction];
    if (nextProject) openImageHistoryDetail(nextProject.id);
  }

  function navigateImageHistoryVersion(direction: -1 | 1): void {
    if (deps.getPage() !== "image-history-detail") return;
    const project = deps.getState().imageHistory.find((item) => item.id === deps.ui.selectedHistoryAssetId);
    if (!project) return;
    const currentIndex = project.versions.findIndex((item) => item.id === deps.ui.selectedHistoryVersionId);
    if (currentIndex < 0) return;
    const nextVersion = project.versions[currentIndex - direction];
    if (!nextVersion) return;
    deps.ui.selectedHistoryVersionId = nextVersion.id;
    deps.ui.historyForwardTarget = { assetId: project.id, versionId: nextVersion.id };
    deps.reportUserAction("image-history-version-navigation", {
      projectId: project.id,
      versionId: nextVersion.id,
      direction
    });
    deps.render();
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-image-version-id="${CSS.escape(nextVersion.id)}"]`)?.scrollIntoView({
        block: "nearest",
        inline: "nearest"
      });
    });
  }

  function releaseHistoryVideo(assetId: string): void {
    const cards = [...document.querySelectorAll<HTMLElement>("[data-history]")];
    const card = cards.find((item) => item.dataset.history === assetId);
    const videos = deps.getPage() === "history-detail" && deps.ui.selectedHistoryAssetId === assetId
      ? document.querySelectorAll<HTMLVideoElement>(".history-player video")
      : card?.querySelectorAll<HTMLVideoElement>("video") ?? [];
    videos.forEach((video) => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    });
  }

  return {
    renderList: (context = deps.context) => historyAssembly.renderList(context),
    renderDetail: (context, kind) => historyAssembly.renderDetail(context, kind),
    bind,
    bindNavigation,
    beforeRender: historyLayoutController.beforeRender,
    bindViewportControls: historyLayoutController.bindViewportControls,
    restoreScrollPosition: historyLayoutController.restoreScrollPosition,
    captureHistoryScrollPosition: historyLayoutController.captureHistoryScrollPosition,
    setScrollRestorePending: historyLayoutController.setScrollRestorePending,
    getLayout: historyLayoutController.getLayout,
    resetScroll: historyLayoutController.resetScroll,
    switchLayout: historyLayoutController.switchLayout,
    bindMasonry: historyLayoutController.bindMasonry,
    bindAlbum: historyLayoutController.bindAlbum,
    bindImageHistoryViewer: historyLayoutController.bindImageHistoryViewer,
    bindTitleMarquees: historyLayoutController.bindTitleMarquees,
    restoreLayoutAnchor: historyLayoutController.restoreLayoutAnchor,
    clearImageHistoryThumbnailCache: historyMediaRuntime.clearImageHistoryThumbnailCache,
    releaseHistoryVideo,
    openHistoryDetail,
    openImageHistoryDetail,
    returnToHistory,
    returnToLastHistoryDetail,
    navigateHistoryDetail,
    navigateImageHistoryDetail
  };
}
