import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  AppApi,
  Draft,
  EnhanceRequest,
  EnvironmentIssue,
  Settings
} from "../src/types.js";

const api: AppApi = {
  getState: () => ipcRenderer.invoke("state:get"),
  saveDraft: (draft: Draft) => ipcRenderer.invoke("draft:save", draft),
  saveSettings: (settings: Settings) => ipcRenderer.invoke("settings:save", settings),
  pickImage: () => ipcRenderer.invoke("file:pick-image"),
  pickVideo: () => ipcRenderer.invoke("file:pick-video"),
  getDroppedFilePath: (file) => webUtils.getPathForFile(file),
  saveClipboardImage: (data: ArrayBuffer, mimeType: string) =>
    ipcRenderer.invoke("file:save-clipboard-image", data, mimeType),
  pickWorkflow: () => ipcRenderer.invoke("file:pick-workflow"),
  inspectWorkflow: (path: string) =>
    ipcRenderer.invoke("workflow:inspect", path),
  getBundledWorkflow: (modelId: string, inputMode?: Draft["inputMode"]) =>
    ipcRenderer.invoke("workflow:get-bundled", modelId, inputMode),
  getPerformanceMetrics: (settings: Settings) =>
    ipcRenderer.invoke("performance:get", settings),
  pickDirectory: () => ipcRenderer.invoke("file:pick-directory"),
  readImage: (path: string) => ipcRenderer.invoke("file:read-image", path),
  showItemInFolder: (path: string) => ipcRenderer.invoke("file:show-in-folder", path),
  openExternal: (url: string) => ipcRenderer.invoke("shell:open-external", url),
  enhancePrompt: (request: EnhanceRequest) =>
    ipcRenderer.invoke("prompt:enhance", request),
  startPromptModel: () => ipcRenderer.invoke("prompt:start"),
  releasePromptModel: () => ipcRenderer.invoke("prompt:release"),
  testConnection: (kind, settings) =>
    ipcRenderer.invoke("connection:test", kind, settings),
  scanEnvironment: (settings: Settings) =>
    ipcRenderer.invoke("environment:scan", settings),
  installLlamaServer: (settings: Settings) =>
    ipcRenderer.invoke("llama-server:install", settings),
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
  installAttentionAcceleration: (settings) =>
    ipcRenderer.invoke("attention-acceleration:install", settings),
  enqueue: (draft: Draft) => ipcRenderer.invoke("queue:enqueue", draft),
  enqueueExtension: (draft: Draft) =>
    ipcRenderer.invoke("queue:enqueue-extension", draft),
  enqueueUpscale: (request) => ipcRenderer.invoke("queue:enqueue-upscale", request),
  updateUpscaleTask: (taskId, patch) =>
    ipcRenderer.invoke("queue:update-upscale", taskId, patch),
  removeTask: (taskId: string) => ipcRenderer.invoke("queue:remove", taskId),
  startQueue: () => ipcRenderer.invoke("queue:start"),
  pauseQueue: () => ipcRenderer.invoke("queue:pause"),
  cancelTask: (taskId: string) => ipcRenderer.invoke("queue:cancel", taskId),
  moveTask: (taskId: string, direction: -1 | 1) =>
    ipcRenderer.invoke("queue:move", taskId, direction),
  optimizeQueue: () => ipcRenderer.invoke("queue:optimize"),
  duplicateTask: (taskId: string) => ipcRenderer.invoke("queue:duplicate", taskId),
  retryTask: (taskId: string) => ipcRenderer.invoke("queue:retry", taskId),
  deleteHistoryAsset: (assetId: string) =>
    ipcRenderer.invoke("history:delete", assetId),
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
  onAttentionInstallLog: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, message: unknown) =>
      callback(String(message));
    ipcRenderer.on("attention-acceleration:log", listener);
    return () => ipcRenderer.removeListener("attention-acceleration:log", listener);
  }
};

contextBridge.exposeInMainWorld("studio", api);
