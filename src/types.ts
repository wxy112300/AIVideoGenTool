export type TaskStatus =
  | "waiting"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type UiLocale = "zh-CN" | "en-US";

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

export type H3StepCount = 4 | 6 | 8 | 10 | 12 | 16 | 20;
export type H3AttentionMode = "sage" | "sage-triton" | "pytorch";
export type H3SpectrumMode = "off" | "balanced";

export interface H3ReferenceSlot {
  id: string;
  mediaType: H3ReferenceMediaType;
  mediaPath: string;
  role: H3ReferenceRole;
  note: string;
}

export type ImageOutputFormat = "png" | "jpeg" | "webp";
export type ImageTargetResolution = "source" | 2160 | 1152 | 1080 | 720 | 640 | 480;
export type ImageReferenceRole =
  | "base"
  | "person"
  | "object"
  | "pose"
  | "style"
  | "background"
  | "auto";

export interface ImageMarkupData {
  documentPath: string;
  renderedPath: string;
  summary: string;
  revision: number;
  objectCount: number;
  updatedAt: string;
}

export interface ImageMarkupSaveRequest {
  pictureId: string;
  sourcePath: string;
  document: string;
  renderedPng: ArrayBuffer;
  summary: string;
  objectCount: number;
  previousRevision?: number;
}

export interface ImageReference {
  id: string;
  pictureNumber: number;
  absolutePath: string;
  width: number;
  height: number;
  role?: ImageReferenceRole;
  markup?: ImageMarkupData;
  contentHash?: string;
  managedRelativePath?: string;
  originalPath?: string;
}

export type ImageReferenceSnapshot = ImageReference;

export interface ImageEditDraft {
  mode: "image-edit";
  projectId?: string;
  parentVersionId?: string;
  pictures: ImageReference[];
  nextPictureNumber: number;
  promptVersions: PromptVersion[];
  activePromptVersion: number;
  modelId: string;
  qualityProfile: string;
  targetResolution: ImageTargetResolution;
  outputCount: number;
  outputFormat: ImageOutputFormat;
  seed: number | null;
}

export interface ImageGenerationRun {
  id: string;
  index: number;
  seed: number;
  status: TaskStatus;
  comfyPromptId?: string;
  progress?: number;
  stage?: string;
  stageStartedAt?: string;
  startedAt?: string;
  completedAt?: string;
  outputVersionId?: string;
  error?: string;
  performanceStats?: TaskPerformanceStats;
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
  h3ContextLatentPath?: string;
  promptVersions: PromptVersion[];
  activePromptVersion: number;
  extensionPromptVersions?: PromptVersion[];
  extensionActivePromptVersion?: number;
  h3ReferenceSlots: H3ReferenceSlot[];
  modelId: string;
  videoLoras: VideoLoraSelection[];
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
  spectrumMode: H3SpectrumMode;
  spectrumModeUserSet?: boolean;
}

export type VideoLoraPurpose = "performance" | "style" | "content" | "character" | "motion" | "quality";

export interface VideoLoraSelection {
  id: string;
  name: string;
  filename: string;
  strength: number;
  modelFamily: string;
  compatibleModelIds: string[];
  compatibleInputModes: Array<"image" | "video">;
  purpose: VideoLoraPurpose;
}

export type LtxExtensionModelProfile =
  | "q2_distilled"
  | "q3_k_m"
  | "q4_k_m";

export interface Settings {
  comfyUrl: string;
  comfyInstallDirectory: string;
  comfyPythonPath: string;
  lmStudioUrl: string;
  lmStudioModel: string;
  lmStudioInstallDirectory: string;
  promptUseLmStudio: boolean;
  promptRuntime: PromptRuntime;
  promptModelId: string;
  promptModelDirectory: string;
  promptLlamaServerPath: string;
  promptLlamaPort: number;
  h3PromptPresets: Record<H3PromptPreset, string>;
  imagePromptPresets: Record<ImagePromptPreset, string>;
  outputDirectory: string;
  imageOutputDirectory: string;
  imageInputLibraryDirectory: string;
  modelDirectory: string;
  defaultVideoModel: string;
  defaultImageModel: string;
  defaultImageQualityProfile: string;
  imageOutputCount: number;
  imageOutputFormat: ImageOutputFormat;
  vramReserveGb: number;
  h3AttentionMode: H3AttentionMode;
  autoOffload: boolean;
  ltxExtensionModelProfile: LtxExtensionModelProfile;
  ltxExtensionResolution: 360 | 480;
  ltxExtensionFrames: 49 | 65;
  ltxExtensionOverlapFrames: 16;
  ltxExtensionUnloadBetweenStages: true;
  ltxExtensionTimeoutMinutes: 10 | 20 | 30;
  safeCancel: boolean;
  autoRetryFailedTasks: boolean;
  autoRetryCount: 1 | 2 | 3 | 4 | 5;
  uiLocale?: UiLocale;
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
  taskType: "generation" | "extension" | "upscale" | "image-generation";
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  outputFilename: string;
  modelId: string;
  workflowPath: string;
  comfyPromptId?: string;
  progress?: number;
  stage?: string;
  stageStartedAt?: string;
  startedAt?: string;
  error?: string;
  performanceStats?: TaskPerformanceStats;
  automaticRetryAttempt?: number;
}

interface VideoQueueTaskBase extends QueueTaskBase {
  taskType: "generation" | "extension" | "upscale";
  duration: number;
  steps?: H3StepCount;
  fps: number;
  seed: number;
  keepSeedOnCopy: boolean;
  attentionMode?: Settings["h3AttentionMode"];
  spectrumMode?: H3SpectrumMode;
  videoLoras?: VideoLoraSelection[];
}

export interface ImageGenerationQueueTask extends QueueTaskBase {
  taskType: "image-generation";
  projectId: string;
  parentVersionId?: string;
  pictures: ImageReferenceSnapshot[];
  imageOutputRoot?: string;
  imageOutputDirectory?: string;
  imageOutputSubfolder?: string;
  outputWidth?: number;
  outputHeight?: number;
  targetResolution?: ImageTargetResolution;
  diffusionModelFilename?: string;
  prompt: string;
  promptVersion: number;
  qualityProfile: string;
  outputFormat: ImageOutputFormat;
  outputCount: number;
  runs: ImageGenerationRun[];
}

export interface GenerationQueueTask extends VideoQueueTaskBase {
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

export interface UpscaleQueueTask extends VideoQueueTaskBase {
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

export interface ExtensionQueueTask extends VideoQueueTaskBase {
  taskType: "extension";
  prompt: string;
  promptVersion: number;
  sourceVideoPath: string;
  sourceVideoDuration: number;
  trimStartSeconds: number;
  trimEndSeconds: number;
  sourceAssetId?: string;
  sourceVersionId?: string;
  h3ContextLatentPath?: string;
  h3ContextSavePrefix?: string;
  h3ContextSavedPath?: string;
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

export type QueueTask =
  | GenerationQueueTask
  | ExtensionQueueTask
  | UpscaleQueueTask
  | ImageGenerationQueueTask;

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
  videoLoras?: VideoLoraSelection[];
  width: number;
  height: number;
  duration: number;
  promptVersion?: number;
  steps?: H3StepCount;
  attentionMode?: Settings["h3AttentionMode"];
  spectrumMode?: H3SpectrumMode;
  fps: number;
  frameInterpolation?: Draft["frameInterpolation"];
  ratio?: Draft["ratio"];
  motion?: Draft["motion"];
  seed?: number;
  performanceStats?: TaskPerformanceStats;
  workflowPath: string;
  comfyPromptId: string;
  comfyOutputs: unknown;
  files: HistoryFile[];
  tileMode?: UpscaleQueueTask["tileMode"];
  faceRestore?: boolean;
  startedAt?: string;
  h3ContextLatentPath?: string;
}

export interface ImageHistoryProject {
  mediaKind: "image";
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  coverMode: "auto" | "pinned";
  coverVersionId?: string;
  nextVersionNumber: number;
  versions: ImageAssetVersion[];
}

export interface ImageAssetVersion {
  id: string;
  versionNumber: number;
  kind: "source" | "edit" | "upscale";
  parentVersionId?: string;
  taskId?: string;
  runId?: string;
  createdAt: string;
  startedAt?: string;
  modelId: string;
  workflowPath: string;
  prompt: string;
  promptVersion: number;
  references: ImageReferenceSnapshot[];
  qualityProfile?: string;
  steps?: number;
  cfg?: number;
  targetResolution?: ImageTargetResolution;
  outputCount?: number;
  diffusionModelFilename?: string;
  seed?: number;
  width: number;
  height: number;
  format: ImageOutputFormat;
  /** SHA-256 of this version's output file, used to preserve image-project lineage. */
  contentHash?: string;
  file: HistoryFile;
  comfyPromptId?: string;
  comfyOutputs?: unknown;
  performanceStats?: TaskPerformanceStats;
}

export type HistoryItem = HistoryAsset | ImageHistoryProject;

export interface HistoryAsset {
  mediaKind: "video";
  id: string;
  taskId: string;
  title: string;
  outputFilename: string;
  createdAt: string;
  modelId: string;
  videoLoras?: VideoLoraSelection[];
  duration: number;
  resolution: number;
  steps?: H3StepCount;
  fps?: number;
  frameInterpolation?: Draft["frameInterpolation"];
  ratio?: Draft["ratio"];
  promptVersion?: number;
  attentionMode?: Settings["h3AttentionMode"];
  motion?: Draft["motion"];
  prompt: string;
  seed: number;
  inputMode?: Draft["inputMode"];
  h3ReferenceSlots?: H3ReferenceSlot[];
  sourceWidth?: number;
  sourceHeight?: number;
  startImagePath?: string;
  endImagePath?: string;
  sourceAssetId?: string;
  sourceVersionId?: string;
  h3ContextLatentPath?: string;
  sourceVideoPath?: string;
  sourceVideoDuration?: number;
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
  schemaVersion: number;
  draft: Draft;
  imageDraft: ImageEditDraft;
  settings: Settings;
  queue: QueueTask[];
  history: HistoryAsset[];
  imageHistory: ImageHistoryProject[];
  queueRunning: boolean;
}

export type ConnectionKind = "comfy";
export type LocalServiceKind = "comfy";

export interface ConnectionResult {
  ok: boolean;
  message: string;
  log?: string;
  executablePath?: string;
}

export interface LlamaServerStatus {
  found: boolean;
  path: string;
  directory: string;
  source: "configured" | "prompt-models" | "app-managed" | "path" | "";
}

export type EnvironmentItemId =
  | "node"
  | "git"
  | "ffmpeg"
  | "nvidia"
  | "comfyui"
  | "comfyui-api"
  // Retained only for deserializing older scan payloads; new scans do not emit them.
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
  optional?: boolean;
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
  category: "video" | "lora" | "image" | "upscale" | "interpolation" | "prompt";
  managedBy?: "comfyui" | "lmstudio" | "llama-server";
  badge: string;
  description: string;
  vram: string;
  available: boolean;
  integrated: boolean;
  runtimeVerified?: boolean;
  runtimeReady?: boolean;
  runtimeMissingNodes?: string[];
  components: ModelComponentStatus[];
}

export interface CustomNodeStatus {
  id: string;
  name: string;
  purpose: string;
  repositoryUrl: string;
  installed: boolean;
  loaded: boolean;
  runtimeVerified: boolean;
  loadError: string;
  directory: string;
  required: boolean;
  version: string;
  latestVersion: string;
  updateAvailable: boolean;
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
  pythonRuntimes: PythonRuntimeCandidate[];
  gpus: GpuDeviceInfo[];
  modelDirectory: string;
  outputDirectory: string;
  llamaServer: LlamaServerStatus;
  comfyCompatibility: ComfyUiCompatibility;
  attentionAcceleration: AttentionAccelerationStatus;
  items: EnvironmentItem[];
  modelProfiles: ModelScanProfile[];
  customNodes: CustomNodeStatus[];
  workflowDependencies: WorkflowDependencyStatus[];
  issues: EnvironmentIssue[];
}

export interface PythonRuntimeCandidate {
  path: string;
  version: string;
  source: "selected" | "comfy-venv" | "embedded" | "path" | "py-launcher" | "other";
  selected: boolean;
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

export type PromptEnhanceMode = "faithful" | "sulphur-native" | "h3-vision" | "image-edit";
export type PromptRuntime = "comfyui" | "lmstudio" | "llama-server";
export type ImagePromptPreset = "faithful" | "detail-enhance";

export type H3PromptPreset =
  | "official-storyboard"
  | "reference-faithful"
  | "continuous-motion"
  | "dialogue-sound"
  | "beat-storyboard"
  | "product-brand"
  | "music-video"
  | "narrative-animation"
  | "multi-reference";

export type H3PromptMode = "T2VA" | "I2VA" | "FL2VA" | "L2VA" | "R2V";

export interface EnhanceRequest {
  prompt: string;
  modelId: string;
  mode?: PromptEnhanceMode;
  imageEditEnhanceMode?: ImagePromptPreset;
  imageEditPresetText?: string;
  imagePath?: string;
  imagePaths?: string[];
  h3PromptMode?: H3PromptMode;
  h3PromptPreset?: H3PromptPreset;
  h3DurationSeconds?: number;
  h3AspectRatio?: string;
  referenceMediaPaths?: string[];
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
  sharedGpuMemoryPeakBytes?: number | null;
}

export type AppLogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface AppLogRecord {
  timestamp: string;
  level: AppLogLevel;
  scope: string;
  event: string;
  message: string;
  meta?: Record<string, unknown>;
}

export interface AppLogSnapshot {
  directory: string;
  crashDirectory?: string;
  retentionDays: number;
  records: AppLogRecord[];
  text: string;
}

export interface TaskPreview {
  taskId: string;
  dataUrl: string;
}

export interface WindowCloseRequest {
  kind: "unsaved-settings" | "running-work";
  hasUnsavedSettings?: boolean;
}

export type WindowCloseResponse =
  | "cancel"
  | "discard-settings"
  | "finish-tasks"
  | "force-exit";

export type SettingsSaveMode = "apply" | "migrate-video-history";

export type HistoryMigrationPhase =
  | "scanning"
  | "moving"
  | "verifying"
  | "committing"
  | "cleaning"
  | "completed";

export interface HistoryMigrationProgress {
  phase: HistoryMigrationPhase;
  current: number;
  total: number;
  message: string;
  migratedFiles: number;
  warningCount: number;
}

export type ImageAssetLibraryPhase =
  | "scanning"
  | "archiving"
  | "verifying"
  | "committing"
  | "cleaning"
  | "completed";

export interface ImageAssetLibraryProgress {
  phase: ImageAssetLibraryPhase;
  current: number;
  total: number;
  message: string;
}

export interface ImageAssetLibraryFile {
  absolutePath: string;
  relativePath: string;
  size: number;
}

export interface ImageAssetLibraryScan {
  libraryDirectory: string;
  totalReferences: number;
  managedReferences: number;
  archiveCandidates: number;
  missingReferences: string[];
  orphanFiles: ImageAssetLibraryFile[];
  archiveBytes: number;
  orphanBytes: number;
}

export interface ImageAssetLibraryResult {
  operationId?: string;
  scan: ImageAssetLibraryScan;
  archivedFiles: number;
  reorganizedFiles: number;
  updatedReferences: number;
  cleanedFiles: number;
  cleanedDirectories: number;
  cleanedBytes: number;
}

export interface AppApi {
  getState(): Promise<AppState>;
  getAppVersion(): Promise<string>;
  setSettingsDirty(dirty: boolean): Promise<void>;
  respondWindowClose(response: WindowCloseResponse): Promise<void>;
  saveDraft(draft: Draft): Promise<AppState>;
  saveImageDraft(draft: ImageEditDraft): Promise<AppState>;
  saveSettings(settings: Settings, mode?: SettingsSaveMode): Promise<AppState>;
  pickImage(): Promise<string | null>;
  pickVideo(): Promise<string | null>;
  getDroppedFilePath(file: File): string;
  saveClipboardImage(data: ArrayBuffer, mimeType: string): Promise<string>;
  readImageMarkup(documentPath: string): Promise<string | null>;
  saveImageMarkup(request: ImageMarkupSaveRequest): Promise<ImageMarkupData>;
  pickWorkflow(): Promise<string | null>;
  pickPython(): Promise<string | null>;
  inspectWorkflow(path: string): Promise<WorkflowCapabilities>;
  getBundledWorkflow(
    modelId: string,
    inputMode?: Draft["inputMode"]
  ): Promise<BundledWorkflow | null>;
  getPerformanceMetrics(settings: Settings): Promise<PerformanceMetrics>;
  readAppLogs(limit?: number): Promise<AppLogSnapshot>;
  openAppLogDirectory(kind: "logs" | "crashDumps"): Promise<boolean>;
  reportRendererError(message: string, meta?: Record<string, unknown>): Promise<void>;
  reportUserAction(action: string, meta?: Record<string, unknown>): Promise<void>;
  pickDirectory(defaultPath?: string, createIfMissing?: boolean): Promise<string | null>;
  readImage(path: string): Promise<string | null>;
  readHistoryCover(key: string, sourcePath: string): Promise<string | null>;
  saveHistoryCover(key: string, sourcePath: string, data: ArrayBuffer): Promise<boolean>;
  showItemInFolder(path: string): Promise<boolean>;
  copyFile(path: string): Promise<ConnectionResult>;
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
  enqueueImageEdit(draft: ImageEditDraft): Promise<AppState>;
  enqueueUpscale(request: UpscaleRequest): Promise<AppState>;
  updateUpscaleTask(taskId: string, patch: Pick<UpscaleQueueTask, "targetWidth" | "targetHeight" | "modelId" | "workflowPath" | "tileMode" | "faceRestore" | "outputFilename">): Promise<AppState>;
  removeTask(taskId: string): Promise<AppState>;
  startQueue(): Promise<AppState>;
  pauseQueue(): Promise<AppState>;
  cancelTask(taskId: string): Promise<AppState>;
  moveTask(taskId: string, direction: -1 | 1): Promise<AppState>;
  duplicateTask(taskId: string): Promise<AppState>;
  resetTask(taskId: string): Promise<AppState>;
  deleteHistoryAsset(assetId: string): Promise<AppState>;
  setImageHistoryCover(projectId: string, versionId?: string): Promise<AppState>;
  deleteImageHistoryVersion(projectId: string, versionId: string): Promise<AppState>;
  onStateChanged(callback: (state: AppState) => void): () => void;
  onTaskPreview(callback: (preview: TaskPreview) => void): () => void;
  onWindowCloseRequest(callback: (request: WindowCloseRequest) => void): () => void;
  onAttentionInstallLog(callback: (message: string) => void): () => void;
  onHistoryMigrationProgress(callback: (progress: HistoryMigrationProgress) => void): () => void;
  scanImageAssetLibrary(): Promise<ImageAssetLibraryScan>;
  organizeImageAssetLibrary(): Promise<ImageAssetLibraryResult>;
  cleanupImageAssetLibrary(paths: string[]): Promise<ImageAssetLibraryResult>;
  onImageAssetLibraryProgress(callback: (progress: ImageAssetLibraryProgress) => void): () => void;
}

declare global {
  interface Window {
    studio: AppApi;
  }
}
