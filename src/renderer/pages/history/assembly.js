import { imageProjectCoverVersion } from "../../../core/image-project";
import { historyFilterModelIds, historyTagNames } from "../../../core/history-filter";
import { isRetiredVideoModel } from "../../../core/workflow";
import { h3PromptPackFor, qwenImagePromptPackFor } from "../../prompt-packs";
import { escapeHtml } from "../../shared/dom";
import { formatBytes, formatElapsedDuration, formatFullHistoryTime, formatVideoDuration, historyRenderDuration } from "../../shared/formatters";
import { icon } from "../../shared/icons";
import { modelName, videoLoraPurposeLabel } from "../../shared/labels";
import { mountHistoryPageController } from "./page-controller";
import { renderHistoryDetailPage, renderHistoryPage, renderImageHistoryDetailPage, renderImageHistoryPage } from "./page";
import { currentHistoryVersion, currentImageHistoryVersion, historyAssetsByNewest, historyCoverCacheKey, historyCoverSeed, historyInitialCoverTime, historyMediaUrl, historyResolutionLabel, imageHistoryGenerationSummary, imageHistoryMediaUrl, imageHistoryThumbnailCacheKey, imageProjectsByNewest, preferredImageVersion, preferredVersion, versionShortEdge, versionVideoIndex } from "./helpers";
function createHistoryPageViewModel(options) {
    return {
        state: options.getState(),
        historyKind: options.getHistoryKind(),
        historyLayout: options.getHistoryLayout(),
        historyFilter: options.getHistoryFilter(),
        historyFilterPanelOpen: options.isHistoryFilterPanelOpen(),
        historyBatchMode: options.isHistoryBatchMode(),
        historyBatchSelectedIds: options.getHistoryBatchSelectedIds(),
        historyBatchTagsPanelOpen: options.isHistoryBatchTagsPanelOpen(),
        selectedHistoryAssetId: options.getSelectedHistoryAssetId(),
        selectedHistoryVersionId: options.getSelectedHistoryVersionId(),
        historyArtifactInspection: options.getHistoryArtifactInspection()
    };
}
function createHistoryPageOptions(context) {
    return {
        t: context.t,
        uiLocale: context.getState()?.settings.uiLocale,
        icon,
        escapeHtml,
        formatBytes,
        videoLoraPurposeLabel: (purpose) => videoLoraPurposeLabel(purpose, context.t),
        h3ReferenceRoleLabel: (role) => h3PromptPackFor(context.getState()?.settings.uiLocale).referenceRoleLabels[role],
        imageReferenceRoleLabel: (role) => qwenImagePromptPackFor(context.getState()?.settings.uiLocale).referenceRoleLabels[role],
        modelName: (id) => modelName(id, context.getState()?.settings.uiLocale),
        formatFullHistoryTime,
        formatVideoDuration,
        formatElapsedDuration: (seconds) => formatElapsedDuration(seconds, context.t),
        historyAssetsByNewest,
        imageProjectsByNewest,
        historyFilterModelIds: (state, kind) => historyFilterModelIds(state.history, state.imageHistory, kind),
        historyFilterTagNames: (state, kind) => historyTagNames(state.history, state.imageHistory, kind),
        preferredVersion,
        currentHistoryVersion,
        historyMediaUrl,
        historyCoverCacheKey,
        historyCoverSeed,
        historyInitialCoverTime,
        historyResolutionLabel: (asset, version) => historyResolutionLabel(asset, version, context.t),
        historyRenderDuration: (version) => historyRenderDuration(version, context.t),
        versionVideoIndex,
        versionShortEdge,
        preferredImageVersion,
        currentImageHistoryVersion,
        imageHistoryMediaUrl,
        imageHistoryThumbnailCacheKey,
        imageProjectCoverVersion,
        isRetiredVideoModel,
        imageHistoryGenerationSummary: (version) => imageHistoryGenerationSummary(version, context.t)
    };
}
export function createHistoryAssembly(options) {
    let cachedList = null;
    return {
        renderList(context) {
            const viewModel = createHistoryPageViewModel(options);
            const historyFilterKey = JSON.stringify(viewModel.historyFilter);
            const historyBatchMode = viewModel.historyBatchMode === true;
            const historyBatchSelectedKey = [...(viewModel.historyBatchSelectedIds ?? [])].sort().join("\u0000");
            const historyBatchTagsPanelOpen = viewModel.historyBatchTagsPanelOpen === true;
            const uiLocale = viewModel.state.settings.uiLocale;
            if (cachedList?.state === viewModel.state &&
                cachedList.historyKind === viewModel.historyKind &&
                cachedList.historyLayout === viewModel.historyLayout &&
                cachedList.historyFilterKey === historyFilterKey &&
                cachedList.historyFilterPanelOpen === viewModel.historyFilterPanelOpen &&
                cachedList.historyBatchMode === historyBatchMode &&
                cachedList.historyBatchSelectedKey === historyBatchSelectedKey &&
                cachedList.historyBatchTagsPanelOpen === historyBatchTagsPanelOpen &&
                cachedList.uiLocale === uiLocale) {
                return cachedList.markup;
            }
            const pageOptions = createHistoryPageOptions(context);
            const markup = viewModel.historyKind === "image"
                ? renderImageHistoryPage(viewModel, pageOptions)
                : renderHistoryPage(viewModel, pageOptions);
            cachedList = {
                state: viewModel.state,
                historyKind: viewModel.historyKind,
                historyLayout: viewModel.historyLayout,
                historyFilterKey,
                historyFilterPanelOpen: viewModel.historyFilterPanelOpen,
                historyBatchMode,
                historyBatchSelectedKey,
                historyBatchTagsPanelOpen,
                uiLocale,
                markup
            };
            return markup;
        },
        renderDetail(context, kind) {
            const state = options.getState();
            const selectedAssetId = options.getSelectedHistoryAssetId();
            const selectedVersionId = options.getSelectedHistoryVersionId();
            if (kind === "video") {
                const asset = state.history.find((item) => item.id === selectedAssetId);
                if (!asset) {
                    options.navigateToHistory();
                    return this.renderList(context);
                }
                options.setSelectedHistoryVersionId(currentHistoryVersion(asset, selectedVersionId).id);
                return renderHistoryDetailPage(createHistoryPageViewModel(options), createHistoryPageOptions(context));
            }
            const project = state.imageHistory.find((item) => item.id === selectedAssetId);
            if (!project) {
                options.setHistoryKind("image");
                options.navigateToHistory();
                return this.renderList(context);
            }
            options.setSelectedHistoryVersionId(currentImageHistoryVersion(project, selectedVersionId).id);
            return renderImageHistoryDetailPage(createHistoryPageViewModel(options), createHistoryPageOptions(context));
        }
    };
}
export function mountHistoryAssembly(options) {
    return mountHistoryPageController(options);
}
