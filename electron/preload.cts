import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  AppApi,
  Draft,
  DependencyInstallProgress,
  EnhanceRequest,
  EnvironmentIssue,
  HistoryMigrationProgress,
  ImageAssetLibraryProgress,
  Settings,
  SettingsSaveMode,
  WindowCloseRequest,
  WindowCloseResponse
} from "../src/types.js";

const api: AppApi = {
  getState: () => ipcRenderer.invoke("state:get"),
  getAppVersion: () => ipcRenderer.invoke("app:version"),
  setSettingsDirty: (dirty: boolean) => ipcRenderer.invoke("renderer:set-settings-dirty", dirty),
  respondWindowClose: (response: WindowCloseResponse) =>
    ipcRenderer.invoke("window:close-response", response),
  saveDraft: (draft: Draft) => ipcRenderer.invoke("draft:save", draft),
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
  inspectWorkflow: (path: string) =>
    ipcRenderer.invoke("workflow:inspect", path),
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
  saveHistoryCover: (key: string, sourcePath: string, data: ArrayBuffer) =>
    ipcRenderer.invoke("history-cover:save", key, sourcePath, data),
  showItemInFolder: (path: string) => ipcRenderer.invoke("file:show-in-folder", path),
  openDirectory: (path: string) => ipcRenderer.invoke("file:open-directory", path),
  copyFile: (path: string) => ipcRenderer.invoke("file:copy", path),
  openExternal: (url: string) => ipcRenderer.invoke("shell:open-external", url),
  enhancePrompt: (request: EnhanceRequest) =>
    ipcRenderer.invoke("prompt:enhance", request),
  startPromptModel: () => ipcRenderer.invoke("prompt:start"),
  releasePromptModel: () => ipcRenderer.invoke("prompt:release"),
  testConnection: (kind, settings) =>
    ipcRenderer.invoke("connection:test", kind, settings),
  scanEnvironment: (settings: Settings) =>
    ipcRenderer.invoke("environment:scan", settings),
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
  installCustomNode: (nodeId, settings) =>
    ipcRenderer.invoke("custom-node:install", nodeId, settings),
  installWorkflowDependency: (workflowId, settings) =>
    ipcRenderer.invoke("workflow-dependency:install", workflowId, settings),
  installLlamaCppPython: (settings) =>
    ipcRenderer.invoke("llama-cpp-python:install", settings),
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
  pauseQueue: () => ipcRenderer.invoke("queue:pause"),
  cancelTask: (taskId: string) => ipcRenderer.invoke("queue:cancel", taskId),
  moveTask: (taskId: string, direction: -1 | 1) =>
    ipcRenderer.invoke("queue:move", taskId, direction),
  duplicateTask: (taskId: string) => ipcRenderer.invoke("queue:duplicate", taskId),
  resetTask: (taskId: string) => ipcRenderer.invoke("queue:reset", taskId),
  deleteHistoryAsset: (assetId: string) =>
    ipcRenderer.invoke("history:delete", assetId),
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
  onTaskPreview: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, preview: unknown) =>
      callback(preview as Parameters<typeof callback>[0]);
    ipcRenderer.on("task:preview", listener);
    return () => ipcRenderer.removeListener("task:preview", listener);
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
