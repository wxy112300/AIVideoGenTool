import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  AppApi,
  ComfyRuntimeState,
  CreationDraftSnapshots,
  Draft,
  DependencyInstallProgress,
  EnhanceRequest,
  EnvironmentIssue,
  EnvironmentScanScope,
  HistoryMigrationProgress,
  HistoryMetadataPatch,
  ImageAssetLibraryProgress,
  PromptProgress,
  Settings,
  SettingsSaveMode,
  WindowCloseRequest,
  WindowCloseResponse
} from "../src/types.js";
import type { PromptRuntimeState } from "../src/core/prompt-runtime-state.js";

const api: AppApi = {
  getState: () => ipcRenderer.invoke("state:get"),
  getComfyRuntimeState: () => ipcRenderer.invoke("comfy-runtime:get"),
  getPromptRuntimeState: () => ipcRenderer.invoke("prompt-runtime:get"),
  getAppVersion: () => ipcRenderer.invoke("app:version"),
  setSettingsDirty: (dirty: boolean) => ipcRenderer.invoke("renderer:set-settings-dirty", dirty),
  respondWindowClose: (response: WindowCloseResponse) =>
    ipcRenderer.invoke("window:close-response", response),
  saveDraft: (draft: Draft, snapshots?: CreationDraftSnapshots) =>
    ipcRenderer.invoke("draft:save", draft, snapshots),
  saveImageDraft: (draft) => ipcRenderer.invoke("image-draft:save", draft),
  saveSettings: (settings: Settings, mode?: SettingsSaveMode) =>
    ipcRenderer.invoke("settings:save", settings, mode),
  setQueueH3LivePreview: (enabled: boolean) =>
    ipcRenderer.invoke("queue:set-h3-live-preview", enabled),
  pickImage: () => ipcRenderer.invoke("file:pick-image"),
  pickVideo: () => ipcRenderer.invoke("file:pick-video"),
  getDroppedFilePath: (file) => webUtils.getPathForFile(file),
  saveClipboardImage: (data: ArrayBuffer, mimeType: string) =>
    ipcRenderer.invoke("file:save-clipboard-image", data, mimeType),
  readImageMarkup: (documentPath) => ipcRenderer.invoke("image-markup:read", documentPath),
  saveImageMarkup: (request) => ipcRenderer.invoke("image-markup:save", request),
  saveImageMask: (request) => ipcRenderer.invoke("image-mask:save", request),
  saveImageCrop: (request) => ipcRenderer.invoke("image-crop:save", request),
  pickWorkflow: () => ipcRenderer.invoke("file:pick-workflow"),
  pickPython: () => ipcRenderer.invoke("file:pick-python"),
  inspectWorkflow: (path: string, modelId?: string) =>
    ipcRenderer.invoke("workflow:inspect", path, modelId),
  getBundledWorkflow: (modelId: string, inputMode?: Draft["inputMode"]) =>
    ipcRenderer.invoke("workflow:get-bundled", modelId, inputMode),
  getPerformanceMetrics: (settings: Settings) =>
    ipcRenderer.invoke("performance:get", settings),
  readAppLogs: (limit?: number) => ipcRenderer.invoke("logs:read", limit),
  openAppLogDirectory: (kind: "logs" | "crashDumps") =>
    ipcRenderer.invoke("logs:open-directory", kind),
  reportRendererError: (message: string, meta?: Record<string, unknown>) =>
    ipcRenderer.invoke("logs:renderer-error", message, meta),
  reportUserAction: (action: string, meta?: Record<string, unknown>) =>
    ipcRenderer.invoke("logs:user-action", action, meta),
  reportNotification: (kind, message) =>
    ipcRenderer.invoke("logs:notification", kind, message),
  pickDirectory: (defaultPath?: string, createIfMissing?: boolean) =>
    ipcRenderer.invoke("file:pick-directory", defaultPath, createIfMissing),
  scanImageAssetLibrary: () => ipcRenderer.invoke("image-assets:scan"),
  organizeImageAssetLibrary: () => ipcRenderer.invoke("image-assets:organize"),
  cleanupImageAssetLibrary: (paths) => ipcRenderer.invoke("image-assets:cleanup", paths),
  readImage: (path: string) => ipcRenderer.invoke("file:read-image", path),
  readHistoryCover: (key: string, sourcePath: string) =>
    ipcRenderer.invoke("history-cover:read", key, sourcePath),
  inspectH3NativeAvArtifact: (assetId: string, versionId: string) =>
    ipcRenderer.invoke("history:inspect-h3-artifact", assetId, versionId),
  saveHistoryCover: (key: string, sourcePath: string, data: ArrayBuffer) =>
    ipcRenderer.invoke("history-cover:save", key, sourcePath, data),
  showItemInFolder: (path: string) => ipcRenderer.invoke("file:show-in-folder", path),
  openDirectory: (path: string) => ipcRenderer.invoke("file:open-directory", path),
  copyFile: (path: string) => ipcRenderer.invoke("file:copy", path),
  openSystemPlayer: (path: string) => ipcRenderer.invoke("file:open-system-player", path),
  openExternal: (url: string) => ipcRenderer.invoke("shell:open-external", url),
  preflightPromptModel: () => ipcRenderer.invoke("prompt:preflight"),
  enhancePrompt: (request: EnhanceRequest) =>
    ipcRenderer.invoke("prompt:enhance", request),
  cancelPrompt: () => ipcRenderer.invoke("prompt:cancel"),
  startPromptModel: (allowCpuFallback?: boolean) =>
    ipcRenderer.invoke("prompt:start", allowCpuFallback),
  releasePromptModel: () => ipcRenderer.invoke("prompt:release"),
  testConnection: (kind, settings) =>
    ipcRenderer.invoke("connection:test", kind, settings),
  scanEnvironment: (settings: Settings, scope?: EnvironmentScanScope) =>
    ipcRenderer.invoke("environment:scan", settings, scope),
  startLocalService: (kind, settings) =>
    ipcRenderer.invoke("service:start", kind, settings),
  restartLocalService: (kind, settings) =>
    ipcRenderer.invoke("service:restart", kind, settings),
  forceStopComfyProcesses: (settings) =>
    ipcRenderer.invoke("service:force-stop-comfy", settings),
  updateComfyUi: (settings) =>
    ipcRenderer.invoke("comfyui:update", settings),
  repairEnvironmentIssue: (issueId: EnvironmentIssue["id"], settings) =>
    ipcRenderer.invoke("environment:repair", issueId, settings),
  installCustomNode: (nodeId, settings, mode) =>
    ipcRenderer.invoke("custom-node:install", nodeId, settings, mode),
  uninstallCustomNode: (nodeId, settings) =>
    ipcRenderer.invoke("custom-node:uninstall", nodeId, settings),
  installLlamaCppPython: (settings) =>
    ipcRenderer.invoke("llama-cpp-python:install", settings),
  uninstallLlamaCppPython: (settings) =>
    ipcRenderer.invoke("llama-cpp-python:uninstall", settings),
  installAttentionAcceleration: (settings) =>
    ipcRenderer.invoke("attention-acceleration:install", settings),
  enqueue: (draft: Draft) => ipcRenderer.invoke("queue:enqueue", draft),
  enqueueExtension: (draft: Draft) =>
    ipcRenderer.invoke("queue:enqueue-extension", draft),
  enqueueImageEdit: (draft) => ipcRenderer.invoke("queue:enqueue-image", draft),
  enqueueUpscale: (request) => ipcRenderer.invoke("queue:enqueue-upscale", request),
  updateUpscaleTask: (taskId, patch) =>
    ipcRenderer.invoke("queue:update-upscale", taskId, patch),
  removeTask: (taskId: string) => ipcRenderer.invoke("queue:remove", taskId),
  startQueue: () => ipcRenderer.invoke("queue:start"),
  continueQueue: () => ipcRenderer.invoke("queue:continue"),
  pauseQueue: () => ipcRenderer.invoke("queue:pause"),
  setQueuePauseBoundaryAfterTask: (taskId: string) =>
    ipcRenderer.invoke("queue:set-pause-boundary-after-task", taskId),
  setQueuePauseBoundary: (waitingTaskCount: number) =>
    ipcRenderer.invoke("queue:set-pause-boundary", waitingTaskCount),
  clearQueuePauseBoundary: () => ipcRenderer.invoke("queue:clear-pause-boundary"),
  cancelTask: (taskId: string) => ipcRenderer.invoke("queue:cancel", taskId),
  moveTask: (taskId: string, direction: -1 | 1) =>
    ipcRenderer.invoke("queue:move", taskId, direction),
  reorderTask: (taskId: string, targetWaitingIndex: number, pauseBoundaryTarget?: number) =>
    ipcRenderer.invoke("queue:reorder", taskId, targetWaitingIndex, pauseBoundaryTarget),
  duplicateTask: (taskId: string) => ipcRenderer.invoke("queue:duplicate", taskId),
  randomizeTaskSeed: (taskId: string) =>
    ipcRenderer.invoke("queue:randomize-seed", taskId),
  resetTask: (taskId: string) => ipcRenderer.invoke("queue:reset", taskId),
  deleteHistoryAsset: (assetId: string) =>
    ipcRenderer.invoke("history:delete", assetId),
  deleteHistoryVersion: (assetId: string, versionId: string) =>
    ipcRenderer.invoke("history:delete-version", assetId, versionId),
  deleteHistoryJointAv: (assetId: string, versionId: string) =>
    ipcRenderer.invoke("history:delete-joint-av", assetId, versionId),
  updateHistoryMetadata: (assetId: string, patch: HistoryMetadataPatch) =>
    ipcRenderer.invoke("history:update-metadata", assetId, patch),
  setImageHistoryCover: (projectId: string, versionId?: string) =>
    ipcRenderer.invoke("image-history:set-cover", projectId, versionId),
  deleteImageHistoryVersion: (projectId: string, versionId: string) =>
    ipcRenderer.invoke("image-history:delete-version", projectId, versionId),
  onStateChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown) =>
      callback(state as Parameters<typeof callback>[0]);
    ipcRenderer.on("state:changed", listener);
    return () => ipcRenderer.removeListener("state:changed", listener);
  },
  onComfyRuntimeStateChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown) =>
      callback(state as ComfyRuntimeState);
    ipcRenderer.on("comfy-runtime:changed", listener);
    return () => ipcRenderer.removeListener("comfy-runtime:changed", listener);
  },
  onTaskPreview: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, preview: unknown) =>
      callback(preview as Parameters<typeof callback>[0]);
    ipcRenderer.on("task:preview", listener);
    return () => ipcRenderer.removeListener("task:preview", listener);
  },
  onPromptProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: unknown) =>
      callback(progress as PromptProgress);
    ipcRenderer.on("prompt:progress", listener);
    return () => ipcRenderer.removeListener("prompt:progress", listener);
  },
  onPromptRuntimeStateChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown) =>
      callback(state as PromptRuntimeState);
    ipcRenderer.on("prompt-runtime:changed", listener);
    return () => ipcRenderer.removeListener("prompt-runtime:changed", listener);
  },
  onWindowCloseRequest: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, request: unknown) =>
      callback(request as WindowCloseRequest);
    ipcRenderer.on("window:close-requested", listener);
    return () => ipcRenderer.removeListener("window:close-requested", listener);
  },
  onAttentionInstallLog: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, message: unknown) =>
      callback(String(message));
    ipcRenderer.on("attention-acceleration:log", listener);
    return () => ipcRenderer.removeListener("attention-acceleration:log", listener);
  },
  onDependencyInstallLog: (callback: (progress: DependencyInstallProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: unknown) =>
      callback(progress as DependencyInstallProgress);
    ipcRenderer.on("dependency-install:log", listener);
    return () => ipcRenderer.removeListener("dependency-install:log", listener);
  },
  onHistoryMigrationProgress: (callback: (progress: HistoryMigrationProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: unknown) =>
      callback(progress as HistoryMigrationProgress);
    ipcRenderer.on("history-migration:progress", listener);
    return () => ipcRenderer.removeListener("history-migration:progress", listener);
  },
  onImageAssetLibraryProgress: (callback: (progress: ImageAssetLibraryProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: unknown) =>
      callback(progress as ImageAssetLibraryProgress);
    ipcRenderer.on("image-assets:progress", listener);
    return () => ipcRenderer.removeListener("image-assets:progress", listener);
  }
};

contextBridge.exposeInMainWorld("studio", api);
