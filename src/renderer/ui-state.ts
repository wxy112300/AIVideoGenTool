import type {
  HistoryMigrationProgress,
  ImageAssetLibraryProgress,
  Settings,
  WindowCloseRequest
} from "../types";
import type { Page } from "./contracts";
import type { ConfirmationRequest } from "./shell/confirmation-service";
import type { UpscaleDialogState, ImageAssetLibraryDialogState } from "./shell/secondary-dialogs";
import type { AppNotification } from "./notifications";
import { defaultHistoryFilter, type HistoryFilterState } from "../core/history-filter";

export interface RendererUiState {
  appVersion: string;
  flashMessage: string;
  flashNotification: AppNotification | null;
  flashNotificationQueue: AppNotification[];
  nextFlashNotificationId: number;
  flashMessageTimer: number | undefined;
  selectedHistoryAssetId: string;
  selectedHistoryVersionId: string;
  historyFilter: HistoryFilterState;
  historyFilterPanelOpen: boolean;
  historyForwardTarget: { assetId: string; versionId: string } | null;
  upscaleDialog: UpscaleDialogState | null;
  pendingConfirmation: ConfirmationRequest | null;
  confirmationBusy: boolean;
  pendingDirectoryMigration: {
    target: "video";
    previousSettings: Settings;
    nextSettings: Settings;
    oldDirectory: string;
    newDirectory: string;
  } | null;
  directoryMigrationBusy: boolean;
  historyMigrationProgress: HistoryMigrationProgress | null;
  imageAssetLibraryDialog: ImageAssetLibraryDialogState | null;
  imageAssetLibraryProgress: ImageAssetLibraryProgress | null;
  enqueueBusy: boolean;
  modalReturnFocus: HTMLElement | null;
  modalInitialFocusPending: boolean;
  modalControlFocusSelector: string;
  pendingWindowCloseRequest: WindowCloseRequest | null;
  windowCloseResponseBusy: boolean;
}

export function createRendererUiState(): RendererUiState {
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

export type RendererUiPage = Page;
