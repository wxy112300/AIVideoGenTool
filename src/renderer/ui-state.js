import { defaultHistoryFilter } from "../core/history-filter";
export function createRendererUiState() {
    return {
        appVersion: "",
        flashMessage: "",
        flashNotification: null,
        flashNotificationQueue: [],
        nextFlashNotificationId: 1,
        flashMessageTimer: undefined,
        selectedHistoryAssetId: "",
        selectedHistoryVersionId: "",
        historyFilter: { ...defaultHistoryFilter },
        historyFilterPanelOpen: false,
        historyForwardTarget: null,
        upscaleDialog: null,
        pendingConfirmation: null,
        confirmationBusy: false,
        pendingDirectoryMigration: null,
        directoryMigrationBusy: false,
        historyMigrationProgress: null,
        imageAssetLibraryDialog: null,
        imageAssetLibraryProgress: null,
        enqueueBusy: false,
        modalReturnFocus: null,
        modalInitialFocusPending: false,
        modalControlFocusSelector: "",
        pendingWindowCloseRequest: null,
        windowCloseResponseBusy: false
    };
}
export const rendererUiState = createRendererUiState();
