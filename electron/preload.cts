import { contextBridge, ipcRenderer } from "electron";
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
  pickWorkflow: () => ipcRenderer.invoke("file:pick-workflow"),
  getBundledWorkflow: (modelId: string) =>
    ipcRenderer.invoke("workflow:get-bundled", modelId),
  getPerformanceMetrics: (settings: Settings) =>
    ipcRenderer.invoke("performance:get", settings),
  pickDirectory: () => ipcRenderer.invoke("file:pick-directory"),
  readImage: (path: string) => ipcRenderer.invoke("file:read-image", path),
  showItemInFolder: (path: string) => ipcRenderer.invoke("file:show-in-folder", path),
  openExternal: (url: string) => ipcRenderer.invoke("shell:open-external", url),
  enhancePrompt: (request: EnhanceRequest) =>
    ipcRenderer.invoke("prompt:enhance", request),
  testConnection: (kind, settings) =>
    ipcRenderer.invoke("connection:test", kind, settings),
  scanEnvironment: (settings: Settings) =>
    ipcRenderer.invoke("environment:scan", settings),
  startLocalService: (kind, settings) =>
    ipcRenderer.invoke("service:start", kind, settings),
  restartLocalService: (kind, settings) =>
    ipcRenderer.invoke("service:restart", kind, settings),
  repairEnvironmentIssue: (issueId: EnvironmentIssue["id"], settings) =>
    ipcRenderer.invoke("environment:repair", issueId, settings),
  installCustomNode: (nodeId, settings) =>
    ipcRenderer.invoke("custom-node:install", nodeId, settings),
  enqueue: (draft: Draft) => ipcRenderer.invoke("queue:enqueue", draft),
  removeTask: (taskId: string) => ipcRenderer.invoke("queue:remove", taskId),
  startQueue: () => ipcRenderer.invoke("queue:start"),
  pauseQueue: () => ipcRenderer.invoke("queue:pause"),
  cancelTask: (taskId: string) => ipcRenderer.invoke("queue:cancel", taskId),
  moveTask: (taskId: string, direction: -1 | 1) =>
    ipcRenderer.invoke("queue:move", taskId, direction),
  optimizeQueue: () => ipcRenderer.invoke("queue:optimize"),
  duplicateTask: (taskId: string) => ipcRenderer.invoke("queue:duplicate", taskId),
  retryTask: (taskId: string) => ipcRenderer.invoke("queue:retry", taskId),
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
  }
};

contextBridge.exposeInMainWorld("studio", api);
