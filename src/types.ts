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

export type H3ReferenceRole =
  | "subject"
  | "scene"
  | "style"
  | "motion"
  | "camera"
  | "voice"
  | "keyframe"
  | "other";

export type H3ReferenceMediaType = "image" | "video";

export type H3StepCount = 12 | 16 | 20;

export interface H3ReferenceSlot {
  id: string;
  mediaType: H3ReferenceMediaType;
  mediaPath: string;
  role: H3ReferenceRole;
  note: string;
}

export interface Draft {
  inputMode: "image" | "video";
  startImagePath: string;
  sourceWidth: number;
  sourceHeight: number;
  endImagePath: string;
  sourceVideoPath: string;
  sourceVideoDuration: number;
  trimStartSeconds: number;
  trimEndSeconds: number;
  sourceAssetId?: string;
  sourceVersionId?: string;
  promptVersions: PromptVersion[];
  activePromptVersion: number;
  h3ReferenceSlots: H3ReferenceSlot[];
  modelId: string;
  workflowPath: string;
  ratio: "source" | "16:9" | "9:16" | "1:1" | "4:3";
  resolution: 480 | 540 | 720 | 768;
  duration: number;
  steps: H3StepCount;
  fps: 8 | 12 | 16 | 24 | 25 | 30;
  frameInterpolation: "off" | "rife2x" | "rife4x";
  motion: "subtle" | "natural" | "strong";
  seed: number | null;
  keepSeedOnCopy: boolean;
}

export type LtxExtensionModelProfile =
  | "q2_distilled"
  | "q3_k_m"
  | "q4_k_m";

export interface Settings {
  comfyUrl: string;
  comfyInstallDirectory: string;
  lmStudioUrl: string;
  lmStudioModel: string;
  lmStudioInstallDirectory: string;
  promptUseLmStudio: boolean;
  promptModelId: string;
  promptModelDirectory: string;
  h3PromptPresets: Record<H3PromptPreset, string>;
  outputDirectory: string;
  modelDirectory: string;
  promptSystemTemplate: string;
  defaultVideoModel: string;
  vramReserveGb: number;
  h3AttentionMode: "sage" | "pytorch";
  autoOffload: boolean;
  ltxExtensionModelProfile: LtxExtensionModelProfile;
  ltxExtensionResolution: 360 | 480;
  ltxExtensionFrames: 49 | 65;
  ltxExtensionOverlapFrames: 16;
  ltxExtensionUnloadBetweenStages: true;
  ltxExtensionTimeoutMinutes: 10 | 20 | 30;
  safeCancel: boolean;
  optimizeQueue: boolean;
  promptLanguage: "auto" | "zh" | "en";
  promptCreativity: number;
  defaultUpscaleModel: string;
  upscaleTileMode: "auto" | "safe" | "fast";
  upscaleFaceRestore: boolean;
  seedVr2Model: string;
  realEsrganModel: string;
  proxyEnabled: boolean;
  proxyUrl: string;
}

interface QueueTaskBase {
  id: string;
  taskType: "generation" | "extension" | "upscale";
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  outputFilename: string;
  modelId: string;
  workflowPath: string;
  duration: number;
  steps?: H3StepCount;
  fps: number;
  seed: number;
  keepSeedOnCopy: boolean;
  attentionMode?: Settings["h3AttentionMode"];
  comfyPromptId?: string;
  progress?: number;
  stage?: string;
  startedAt?: string;
  error?: string;
  performanceStats?: TaskPerformanceStats;
}

export interface GenerationQueueTask extends QueueTaskBase {
  taskType: "generation";
  prompt: string;
  promptVersion: number;
  h3ReferenceSlots?: H3ReferenceSlot[];
  startImagePath: string;
  sourceWidth: number;
  sourceHeight: number;
  endImagePath: string;
  ratio: Draft["ratio"];
  resolution: Draft["resolution"];
  fps: Draft["fps"];
  frameInterpolation: Draft["frameInterpolation"];
  motion: Draft["motion"];
  modelProfile?: LtxExtensionModelProfile;
}

export interface UpscaleQueueTask extends QueueTaskBase {
  taskType: "upscale";
  sourceAssetId: string;
  sourceVersionId: string;
  sourceFilePath: string;
  sourceFilename: string;
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: 720 | 1080 | 1440 | 2160;
  tileMode: "auto" | "safe" | "fast";
  faceRestore: boolean;
}

export interface ExtensionQueueTask extends QueueTaskBase {
  taskType: "extension";
  prompt: string;
  promptVersion: number;
  sourceVideoPath: string;
  sourceVideoDuration: number;
  trimStartSeconds: number;
  trimEndSeconds: number;
  sourceAssetId?: string;
  sourceVersionId?: string;
  sourceWidth: number;
  sourceHeight: number;
  ratio: Draft["ratio"];
  resolution: 360 | 480 | 540 | 720 | 768;
  fps: Draft["fps"];
  frameInterpolation: Draft["frameInterpolation"];
  motion: Draft["motion"];
  modelProfile: LtxExtensionModelProfile;
  maxGeneratedFrames: 49 | 65 | 362;
  overlapFrames: 16;
  unloadBetweenStages: true;
}

export type QueueTask = GenerationQueueTask | ExtensionQueueTask | UpscaleQueueTask;

export interface UpscaleRequest {
  sourceAssetId: string;
  sourceVersionId: string;
  sourceFilePath: string;
  sourceFilename: string;
  sourceWidth: number;
  sourceHeight: number;
  duration: number;
  fps: number;
  targetHeight: UpscaleQueueTask["targetHeight"];
  modelId: "seedvr2" | "flashvsr" | "realesrgan";
  tileMode: UpscaleQueueTask["tileMode"];
  faceRestore: boolean;
}

export interface HistoryFile {
  filename: string;
  subfolder: string;
  type: string;
  format?: string;
  absolutePath?: string;
}

export interface AssetVersion {
  id: string;
  kind: "original" | "upscale";
  createdAt: string;
  outputFilename: string;
  modelId: string;
  width: number;
  height: number;
  duration: number;
  steps?: H3StepCount;
  fps: number;
  seed?: number;
  performanceStats?: TaskPerformanceStats;
  workflowPath: string;
  comfyPromptId: string;
  comfyOutputs: unknown;
  files: HistoryFile[];
  tileMode?: UpscaleQueueTask["tileMode"];
  faceRestore?: boolean;
  startedAt?: string;
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
  steps?: H3StepCount;
  fps?: number;
  frameInterpolation?: Draft["frameInterpolation"];
  ratio?: Draft["ratio"];
  prompt: string;
  seed: number;
  startImagePath?: string;
  endImagePath?: string;
  sourceAssetId?: string;
  sourceVersionId?: string;
  sourceVideoPath?: string;
  trimStartSeconds?: number;
  trimEndSeconds?: number;
  workflowPath?: string;
  startedAt?: string;
  comfyPromptId: string;
  comfyOutputs: unknown;
  files: HistoryFile[];
  updatedAt: string;
  defaultVersionId?: string;
  versions: AssetVersion[];
}

export interface AppState {
  schemaVersion: 2;
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

export interface GpuDeviceInfo {
  index: number;
  name: string;
  driverVersion: string;
  vramTotalBytes: number;
}

export interface ComfyUiCoreNodeStatus {
  id: string;
  label: string;
  available: boolean;
}

export interface ComfyUiCompatibility {
  version: string;
  revision: string;
  h3MinimumRevision: string;
  h3CoreSupported: boolean;
  coreNodes: ComfyUiCoreNodeStatus[];
  promptCoreSupported: boolean;
  promptCoreNodes: ComfyUiCoreNodeStatus[];
  checkedFrom: "api" | "source" | "";
  updateMode: "desktop" | "git" | "unsupported";
  updateHint: string;
}

export interface ComfyUiInstallationSummary {
  type: "desktop" | "manual" | "portable";
  directory: string;
  sourceDirectory: string;
  executable: string;
  desktopVersion: string;
  version: string;
  revision: string;
  selected: boolean;
}

export interface WorkflowDependencyStatus {
  id: "minimax_h3_i2v";
  name: string;
  purpose: string;
  installed: boolean;
  path: string;
  sourceUrl: string;
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
  category: "video" | "upscale" | "interpolation" | "prompt";
  badge: string;
  description: string;
  vram: string;
  available: boolean;
  integrated: boolean;
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
  comfyInstallations: ComfyUiInstallationSummary[];
  gpus: GpuDeviceInfo[];
  modelDirectory: string;
  outputDirectory: string;
  comfyCompatibility: ComfyUiCompatibility;
  attentionAcceleration: AttentionAccelerationStatus;
  items: EnvironmentItem[];
  modelProfiles: ModelScanProfile[];
  customNodes: CustomNodeStatus[];
  workflowDependencies: WorkflowDependencyStatus[];
  issues: EnvironmentIssue[];
}

export interface AttentionAccelerationStatus {
  pythonPath: string;
  pythonVersion: string;
  torchVersion: string;
  cudaVersion: string;
  gpuName: string;
  gpuArchitecture: string;
  sageAttentionVersion: string;
  tritonVersion: string;
  kjNodesInstalled: boolean;
  kjNodesCompatible: boolean;
  recommendedSageVersion: string;
  recommendedWheel: string;
  supported: boolean;
  ready: boolean;
  detail: string;
}

export type PromptEnhanceMode = "faithful" | "sulphur-native" | "h3-vision";

export type H3PromptPreset =
  | "official-storyboard"
  | "reference-faithful"
  | "continuous-motion"
  | "multi-reference";

export type H3PromptMode = "T2VA" | "I2VA" | "FL2VA" | "L2VA" | "R2V";

export interface EnhanceRequest {
  prompt: string;
  modelId: string;
  mode?: PromptEnhanceMode;
  imagePath?: string;
  imagePaths?: string[];
  h3PromptMode?: H3PromptMode;
  h3PromptPreset?: H3PromptPreset;
  h3DurationSeconds?: number;
  referenceContext?: string;
}

export interface BundledWorkflow {
  modelId: string;
  label: string;
  path: string;
  supportsEndImage: boolean;
  supportsVideoExtension: boolean;
}

export interface WorkflowCapabilities {
  supportsEndImage: boolean;
  supportsVideoExtension: boolean;
}

export interface PerformanceMetrics {
  sampledAt: string;
  cpuPercent: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  gpuPercent: number | null;
  vramUsedBytes: number | null;
  vramTotalBytes: number | null;
  gpuTemperature: number | null;
  comfyConnected: boolean;
}

export interface TaskPerformanceStats {
  durationSeconds: number;
  sampleCount: number;
  gpuSampleCount: number;
  cpuAveragePercent: number;
  cpuPeakPercent: number;
  memoryAverageBytes: number;
  memoryPeakBytes: number;
  memoryTotalBytes: number;
  gpuAveragePercent: number | null;
  gpuPeakPercent: number | null;
  gpuTemperaturePeak: number | null;
  vramBaselineBytes: number | null;
  vramAverageBytes: number | null;
  vramPeakBytes: number | null;
  vramTotalBytes: number | null;
}

export interface TaskPreview {
  taskId: string;
  dataUrl: string;
}

export interface AppApi {
  getState(): Promise<AppState>;
  saveDraft(draft: Draft): Promise<AppState>;
  saveSettings(settings: Settings): Promise<AppState>;
  pickImage(): Promise<string | null>;
  pickVideo(): Promise<string | null>;
  getDroppedFilePath(file: File): string;
  saveClipboardImage(data: ArrayBuffer, mimeType: string): Promise<string>;
  pickWorkflow(): Promise<string | null>;
  inspectWorkflow(path: string): Promise<WorkflowCapabilities>;
  getBundledWorkflow(
    modelId: string,
    inputMode?: Draft["inputMode"]
  ): Promise<BundledWorkflow | null>;
  getPerformanceMetrics(settings: Settings): Promise<PerformanceMetrics>;
  pickDirectory(): Promise<string | null>;
  readImage(path: string): Promise<string | null>;
  showItemInFolder(path: string): Promise<boolean>;
  openExternal(url: string): Promise<boolean>;
  enhancePrompt(request: EnhanceRequest): Promise<string>;
  startPromptModel(): Promise<ConnectionResult>;
  releasePromptModel(): Promise<ConnectionResult>;
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
  forceStopComfyProcesses(settings: Settings): Promise<ConnectionResult>;
  updateComfyUi(settings: Settings): Promise<ConnectionResult>;
  repairEnvironmentIssue(
    issueId: EnvironmentIssue["id"],
    settings: Settings
  ): Promise<ConnectionResult>;
  installCustomNode(
    nodeId: string,
    settings: Settings
  ): Promise<ConnectionResult>;
  installWorkflowDependency(
    workflowId: WorkflowDependencyStatus["id"],
    settings: Settings
  ): Promise<ConnectionResult>;
  installAttentionAcceleration(settings: Settings): Promise<ConnectionResult>;
  enqueue(draft: Draft): Promise<AppState>;
  enqueueExtension(draft: Draft): Promise<AppState>;
  enqueueUpscale(request: UpscaleRequest): Promise<AppState>;
  updateUpscaleTask(taskId: string, patch: Pick<UpscaleQueueTask, "targetWidth" | "targetHeight" | "modelId" | "workflowPath" | "tileMode" | "faceRestore" | "outputFilename">): Promise<AppState>;
  removeTask(taskId: string): Promise<AppState>;
  startQueue(): Promise<AppState>;
  pauseQueue(): Promise<AppState>;
  cancelTask(taskId: string): Promise<AppState>;
  moveTask(taskId: string, direction: -1 | 1): Promise<AppState>;
  optimizeQueue(): Promise<AppState>;
  duplicateTask(taskId: string): Promise<AppState>;
  retryTask(taskId: string): Promise<AppState>;
  deleteHistoryAsset(assetId: string): Promise<AppState>;
  onStateChanged(callback: (state: AppState) => void): () => void;
  onTaskPreview(callback: (preview: TaskPreview) => void): () => void;
  onAttentionInstallLog(callback: (message: string) => void): () => void;
}

declare global {
  interface Window {
    studio: AppApi;
  }
}
