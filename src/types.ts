export type TaskStatus =
  | "waiting"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface PromptVersion {
  id: string;
  label: string;
  text: string;
  createdAt: string;
}

export interface Draft {
  startImagePath: string;
  endImagePath: string;
  promptVersions: PromptVersion[];
  activePromptVersion: number;
  modelId: string;
  workflowPath: string;
  ratio: "source" | "16:9" | "9:16" | "1:1" | "4:3";
  resolution: 480 | 540 | 720;
  duration: number;
  motion: "subtle" | "natural" | "strong";
  seed: number | null;
  keepSeedOnCopy: boolean;
}

export interface Settings {
  comfyUrl: string;
  lmStudioUrl: string;
  lmStudioModel: string;
  outputDirectory: string;
  modelDirectory: string;
  promptSystemTemplate: string;
}

export interface QueueTask {
  id: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  outputFilename: string;
  prompt: string;
  promptVersion: number;
  startImagePath: string;
  endImagePath: string;
  modelId: string;
  workflowPath: string;
  ratio: Draft["ratio"];
  resolution: Draft["resolution"];
  duration: number;
  motion: Draft["motion"];
  seed: number;
  keepSeedOnCopy: boolean;
  comfyPromptId?: string;
  progress?: number;
  error?: string;
}

export interface HistoryFile {
  filename: string;
  subfolder: string;
  type: string;
  format?: string;
  absolutePath?: string;
}

export interface HistoryAsset {
  id: string;
  taskId: string;
  title: string;
  outputFilename: string;
  createdAt: string;
  modelId: string;
  duration: number;
  resolution: number;
  prompt: string;
  seed: number;
  comfyPromptId: string;
  comfyOutputs: unknown;
  files: HistoryFile[];
}

export interface AppState {
  schemaVersion: 1;
  draft: Draft;
  settings: Settings;
  queue: QueueTask[];
  history: HistoryAsset[];
  queueRunning: boolean;
}

export type ConnectionKind = "comfy" | "lmstudio";

export interface ConnectionResult {
  ok: boolean;
  message: string;
}

export interface EnhanceRequest {
  prompt: string;
  modelId: string;
}

export interface AppApi {
  getState(): Promise<AppState>;
  saveDraft(draft: Draft): Promise<AppState>;
  saveSettings(settings: Settings): Promise<AppState>;
  pickImage(): Promise<string | null>;
  pickWorkflow(): Promise<string | null>;
  pickDirectory(): Promise<string | null>;
  readImage(path: string): Promise<string | null>;
  showItemInFolder(path: string): Promise<boolean>;
  enhancePrompt(request: EnhanceRequest): Promise<string>;
  testConnection(kind: ConnectionKind, settings: Settings): Promise<ConnectionResult>;
  enqueue(draft: Draft): Promise<AppState>;
  removeTask(taskId: string): Promise<AppState>;
  startQueue(): Promise<AppState>;
  pauseQueue(): Promise<AppState>;
  cancelTask(taskId: string): Promise<AppState>;
  moveTask(taskId: string, direction: -1 | 1): Promise<AppState>;
  optimizeQueue(): Promise<AppState>;
  duplicateTask(taskId: string): Promise<AppState>;
  retryTask(taskId: string): Promise<AppState>;
  onStateChanged(callback: (state: AppState) => void): () => void;
}

declare global {
  interface Window {
    studio: AppApi;
  }
}
