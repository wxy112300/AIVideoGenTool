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
  defaultVideoModel: string;
  vramReserveGb: number;
  autoOffload: boolean;
  safeCancel: boolean;
  optimizeQueue: boolean;
  promptLanguage: "auto" | "zh" | "en";
  promptCreativity: number;
  defaultUpscaleModel: string;
  proxyEnabled: boolean;
  proxyUrl: string;
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
export type LocalServiceKind = "comfy" | "lmstudio";

export interface ConnectionResult {
  ok: boolean;
  message: string;
  log?: string;
}

export type EnvironmentItemId =
  | "node"
  | "git"
  | "ffmpeg"
  | "nvidia"
  | "comfyui"
  | "comfyui-api"
  | "lmstudio"
  | "lmstudio-api";

export interface EnvironmentItem {
  id: EnvironmentItemId;
  label: string;
  ok: boolean;
  detail: string;
  path?: string;
  optional?: boolean;
}

export interface ModelComponentStatus {
  label: string;
  found: boolean;
  expected: string;
  matches: string[];
  installGuide: {
    sourceLabel: string;
    downloadUrl: string;
    targetSubdirectory: string;
    recommendedFilename: string;
    notes?: string;
  };
}

export interface ModelScanProfile {
  id: string;
  name: string;
  category: "video" | "upscale";
  badge: string;
  description: string;
  vram: string;
  available: boolean;
  components: ModelComponentStatus[];
}

export interface CustomNodeStatus {
  id: string;
  name: string;
  purpose: string;
  repositoryUrl: string;
  installed: boolean;
  loadError: string;
  directory: string;
  required: boolean;
}

export interface EnvironmentIssue {
  id: "fantasytalking-unicodeescape" | "comfy-database";
  label: string;
  detail: string;
  severity: "error" | "warning";
  repairable: boolean;
  repairLabel: string;
}

export interface EnvironmentScanResult {
  scannedAt: string;
  userHome: string;
  comfyRoot: string;
  comfyUrl: string;
  comfyInstallDirectory: string;
  comfySourceDirectory: string;
  comfyInstallType: "desktop" | "manual" | "portable" | "";
  modelDirectory: string;
  outputDirectory: string;
  items: EnvironmentItem[];
  modelProfiles: ModelScanProfile[];
  customNodes: CustomNodeStatus[];
  issues: EnvironmentIssue[];
}

export interface EnhanceRequest {
  prompt: string;
  modelId: string;
}

export interface BundledWorkflow {
  modelId: string;
  label: string;
  path: string;
}

export interface AppApi {
  getState(): Promise<AppState>;
  saveDraft(draft: Draft): Promise<AppState>;
  saveSettings(settings: Settings): Promise<AppState>;
  pickImage(): Promise<string | null>;
  pickWorkflow(): Promise<string | null>;
  getBundledWorkflow(modelId: string): Promise<BundledWorkflow | null>;
  pickDirectory(): Promise<string | null>;
  readImage(path: string): Promise<string | null>;
  showItemInFolder(path: string): Promise<boolean>;
  openExternal(url: string): Promise<boolean>;
  enhancePrompt(request: EnhanceRequest): Promise<string>;
  testConnection(kind: ConnectionKind, settings: Settings): Promise<ConnectionResult>;
  scanEnvironment(settings: Settings): Promise<EnvironmentScanResult>;
  startLocalService(
    kind: LocalServiceKind,
    settings: Settings
  ): Promise<ConnectionResult>;
  restartLocalService(
    kind: LocalServiceKind,
    settings: Settings
  ): Promise<ConnectionResult>;
  repairEnvironmentIssue(
    issueId: EnvironmentIssue["id"],
    settings: Settings
  ): Promise<ConnectionResult>;
  installCustomNode(
    nodeId: string,
    settings: Settings
  ): Promise<ConnectionResult>;
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
