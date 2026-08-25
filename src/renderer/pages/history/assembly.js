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
        selectedHistoryAssetId: options.getSelectedHistoryAssetId(),
        selectedHistoryVersionId: options.getSelectedHistoryVersionId()
    };
}
function createHistoryPageOptions(context) {
    return {
        t: context.t,
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
    const renderList = (context) => {
        const viewModel = createHistoryPageViewModel(options);
        const pageOptions = createHistoryPageOptions(context);
        return viewModel.historyKind === "image"
            ? renderImageHistoryPage(viewModel, pageOptions)
            : renderHistoryPage(viewModel, pageOptions);
    };
    return {
        renderList,
        renderDetail(context, kind) {
            const state = options.getState();
            const selectedAssetId = options.getSelectedHistoryAssetId();
            const selectedVersionId = options.getSelectedHistoryVersionId();
            if (kind === "video") {
                const asset = state.history.find((item) => item.id === selectedAssetId);
                if (!asset) {
                    options.navigateToHistory();
                    return renderList(context);
                }
                options.setSelectedHistoryVersionId(currentHistoryVersion(asset, selectedVersionId).id);
                return renderHistoryDetailPage(createHistoryPageViewModel(options), createHistoryPageOptions(context));
            }
            const project = state.imageHistory.find((item) => item.id === selectedAssetId);
            if (!project) {
                options.setHistoryKind("image");
                options.navigateToHistory();
                return renderList(context);
            }
            options.setSelectedHistoryVersionId(currentImageHistoryVersion(project, selectedVersionId).id);
            return renderImageHistoryDetailPage(createHistoryPageViewModel(options), createHistoryPageOptions(context));
        }
    };
}
export function mountHistoryAssembly(options) {
    return mountHistoryPageController(options);
}
