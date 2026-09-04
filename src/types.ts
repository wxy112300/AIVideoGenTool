import type {
  PromptOperationOrigin,
  PromptRuntimeState
} from "./core/prompt-runtime-state.js";

export type TaskStatus =
  | "waiting"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Queue-level state is deliberately separate from an individual task status.
 * A running task can be paused, cancelled, or waiting for ComfyUI cleanup
 * without changing the immutable task status until the worker has finished
 * the corresponding operation.
 */
export type QueueLifecycle =
  | "idle"
  | "starting"
  | "running"
  | "pausing"
  | "cancelling"
  | "cleaning"
  | "error";

export type ComfyRuntimePhase =
  | "unknown"
  | "stopped"
  | "starting"
  | "ready"
  | "degraded"
  | "restarting"
  | "stopping"
  | "error";

export type ComfyRuntimeOwnership = "unknown" | "none" | "app" | "external";

/**
 * Process-local ComfyUI service state. This is intentionally delivered over a
 * dedicated IPC stream instead of being persisted with queue/history data.
 */
export interface ComfyRuntimeState {
  phase: ComfyRuntimePhase;
  ownership: ComfyRuntimeOwnership;
  endpoint: string;
  message: string;
  updatedAt: string;
  operationId: number;
}

export type UiLocale = "zh-CN" | "zh-TW" | "en-US";

export interface PromptVersion {
  id: string;
  label: string;
  text: string;
  createdAt: string;
  autoPromptSeedId?: string;
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

/** Base H3 short-edge presets that are currently executed by ComfyUI. */
export type H3BaseResolution = 360 | 480 | 540 | 720 | 768;
/** Final short-edge targets for the separate H3 native second-sampling path. */
export type H3HighResolution = 1080 | 1440;
/** Resolutions accepted by the H3 creation draft; high resolutions are gated. */
export type H3Resolution = H3BaseResolution | H3HighResolution;

/** Machine-readable reasons for a gated H3 native high-resolution capability. */
export type H3HighResolutionReasonCode =
  | "provider-not-installed"
  | "provider-not-started"
  | "profile-unsupported"
  | "weights-missing"
  | "hash-mismatch"
  | "gpu-unsupported"
  | "os-unsupported"
  | "runtime-unverified"
  | "model-incompatible"
  | "lora-incompatible"
  | "artifact-missing"
  | "artifact-incompatible"
  | "target-not-supported"
  | "target-not-higher"
  | "conditioning-unavailable";

/** Optional environment evidence for the isolated H3 high-resolution provider. */
export interface H3HighResolutionEnvironment {
  providerId: "h3-native-sidecar";
  state: "unknown" | "stopped" | "starting" | "ready" | "error";
  verified: boolean;
  profileId?: string;
  modelIds?: string[];
  firstPassResolutions?: H3BaseResolution[];
  supportedResolutions?: H3HighResolution[];
  reasonCode?: H3HighResolutionReasonCode;
  detail?: string;
  /** Version/revision reported by the provider, never inferred from a model filename. */
  providerVersion?: string;
  providerRevision?: string;
  providerSource?: string;
  providerDownloadUrl?: string;
  providerInstallGuideUrl?: string;
  providerInstallable?: boolean;
  providerInstallNote?: string;
}

export type H3StepCount = 4 | 6 | 8 | 10 | 12 | 16 | 20;
export type H3AttentionMode = "sage" | "sage-triton" | "pytorch";
/** User-facing selection for the final MiniMax H3 video VAE. */
export type H3VideoVaeMode = "auto" | "fp16" | "int8-convrot";
/** Resolved backend persisted with a task or history record. */
export type H3VideoVaeBackend = Exclude<H3VideoVaeMode, "auto">;
export type H3SpectrumMode = "off" | "balanced";
export type H3SpectrumModelAwareMode = "off" | "schedule" | "schedule_confidence" | "full";
export type H3MemoryOptimizationMode = "off" | "preserve-native" | "auto" | "force-quant";

/** Serializable policy result captured with an immutable video queue task. */
export interface H3MemoryExecutionPlanSnapshot {
  attention: "pytorch" | "sage" | "h3-sparse" | "sla";
  memory: H3MemoryOptimizationMode;
  spectrumEnabled: boolean;
  turboProfile?: string;
  previewEnabled: boolean;
  allowed: boolean;
  reasons: string[];
  chunkRows: number;
}

/** Runtime evidence deliberately keeps execution provider unknown until logs are stable. */
export interface H3MemoryRuntimeEvidence {
  requestedMode: H3MemoryOptimizationMode;
  chunkRows: number;
  contract: "valid" | "invalid";
  execution: "unknown" | "optimized" | "fallback" | "failed";
  nodeVersion?: string;
  nodeRevision?: string;
  note?: string;
}

export interface H3ReferenceSlot {
  id: string;
  mediaType: H3ReferenceMediaType;
  mediaPath: string;
  /** Decoded image dimensions; absent for video references and legacy records. */
  width?: number;
  height?: number;
  role: H3ReferenceRole;
  note: string;
}

export type ImageOutputFormat = "png" | "jpeg" | "webp";
export type ImageTargetResolution = "source" | 2160 | 1536 | 1152 | 1080 | 1024 | 768 | 720 | 640 | 480;
export type ImageAspectRatio = "source" | "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "3:2" | "2:3";
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

export interface ImageMaskData {
  documentPath: string;
  maskPath: string;
  revision: number;
  regionCount: number;
  updatedAt: string;
}

/**
 * A non-destructive crop expressed in the original Picture's pixel space.
 * The original input path remains the lineage anchor; croppedPath is only the
 * derived file used when the Picture is sent to a workflow.
 */
export interface ImageCropSelection {
  x: number;
  y: number;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
}

export interface ImageCropData extends ImageCropSelection {
  documentPath: string;
  croppedPath: string;
  revision: number;
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

export interface ImageMaskSaveRequest {
  pictureId: string;
  sourcePath: string;
  document: string;
  maskPng: ArrayBuffer;
  regionCount: number;
  previousRevision?: number;
}

export interface ImageCropSaveRequest {
  pictureId: string;
  sourcePath: string;
  crop: ImageCropSelection | null;
  croppedPng?: ArrayBuffer;
  previousRevision?: number;
}

export interface ImageReference {
  id: string;
  pictureNumber: number;
  absolutePath: string;
  width: number;
  height: number;
  role?: ImageReferenceRole;
  crop?: ImageCropData;
  markup?: ImageMarkupData;
  mask?: ImageMaskData;
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
  /** Output canvas ratio. Legacy drafts omit this and normalize to source. */
  aspectRatio?: ImageAspectRatio;
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
  /** Decoded dimensions for the optional end-frame image. */
  endImageWidth?: number;
  endImageHeight?: number;
  sourceVideoPath: string;
  sourceVideoDuration: number;
  trimStartSeconds: number;
  trimEndSeconds: number;
  sourceAssetId?: string;
  sourceVersionId?: string;
  h3ContextLatentPath?: string;
  /** Optional H3 Native AV artifact used by the Continuum extension mode. */
  h3ContinuumArtifactPath?: string;
  h3ContinuumArtifact?: NativeAvContinuationArtifact;
  promptVersions: PromptVersion[];
  activePromptVersion: number;
  extensionPromptVersions?: PromptVersion[];
  extensionActivePromptVersion?: number;
  h3ReferenceSlots: H3ReferenceSlot[];
  modelId: string;
  videoLoras: VideoLoraSelection[];
  workflowPath: string;
  ratio: "source" | "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
  resolution: H3Resolution;
  duration: number;
  steps: H3StepCount;
  fps: 8 | 12 | 16 | 24 | 25 | 30;
  frameInterpolation: "off" | "rife2x" | "rife4x";
  motion: "subtle" | "natural" | "strong";
  seed: number | null;
  keepSeedOnCopy: boolean;
  spectrumMode: H3SpectrumMode;
  spectrumModelAwareMode: H3SpectrumModelAwareMode;
  spectrumModeUserSet?: boolean;
  /** Save reusable H3 joint video/audio latents alongside the rendered video. */
  h3SaveJointAv: boolean;
  /** Requested H3 Memory Optimization mode for this creation workspace. */
  h3MemoryOptimizationMode: H3MemoryOptimizationMode;
  /** True when the user explicitly chose the memory mode. */
  h3MemoryOptimizationUserSet?: boolean;
  /** H3 Memory Optimization row chunk size; upstream defaults to 4096. */
  h3MemoryChunkRows: number;
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
  promptPrefixes?: string[];
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
  h3AutoPromptSeedId: string;
  h3AutoPromptSeedInstructions: Record<string, string>;
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
  /** Default model selected when entering video-extension mode. */
  defaultExtensionModel: string;
  defaultImageModel: string;
  defaultImageQualityProfile: string;
  imageOutputCount: number;
  imageOutputFormat: ImageOutputFormat;
  vramReserveGb: number;
  h3AttentionMode: H3AttentionMode;
  /** Default final video VAE selection for MiniMax H3 workflows. */
  h3VideoVaeMode: H3VideoVaeMode;
  h3LivePreview: boolean;
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
  queueIsolationMode: "never" | "lora" | "model-change" | "always";
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
  hfMirrorEnabled: boolean;
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
  workProgress?: QueueWorkProgress;
  startedAt?: string;
  error?: string;
  performanceStats?: TaskPerformanceStats;
  automaticRetryAttempt?: number;
}

export interface QueueWorkProgress {
  value: number;
  max: number;
  unit: "step" | "piece" | "item";
  startedAt: string;
  sampledAt: string;
}

interface VideoQueueTaskBase extends QueueTaskBase {
  taskType: "generation" | "extension" | "upscale";
  duration: number;
  steps?: H3StepCount;
  fps: number;
  seed: number;
  keepSeedOnCopy: boolean;
  attentionMode?: Settings["h3AttentionMode"];
  /** Resolved final MiniMax H3 video VAE backend for this execution. */
  h3VideoVaeMode?: H3VideoVaeBackend;
  spectrumMode?: H3SpectrumMode;
  spectrumModelAwareMode?: H3SpectrumModelAwareMode;
  /** Queue-time H3 Memory Optimization request; absent only in legacy records. */
  h3MemoryOptimizationMode?: H3MemoryOptimizationMode;
  h3MemoryOptimizationUserSet?: boolean;
  h3MemoryChunkRows?: number;
  h3MemoryExecutionPlan?: H3MemoryExecutionPlanSnapshot;
  h3MemoryRuntimeEvidence?: H3MemoryRuntimeEvidence;
  videoLoras?: VideoLoraSelection[];
  /**
   * Queue-time snapshot of the optional H3 preview observer.
   * Older persisted tasks may omit this and fall back to the current setting.
   */
  h3LivePreview?: boolean;
  /** Queue-time H3 JointAV output preference; legacy tasks default to enabled. */
  h3SaveJointAv?: boolean;
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
  /** Queue-time snapshot of the output canvas ratio. */
  aspectRatio?: ImageAspectRatio;
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
  endImageWidth?: number;
  endImageHeight?: number;
  ratio: Draft["ratio"];
  /** Base first-pass resolution; high-resolution delivery remains a separate stage. */
  resolution: H3BaseResolution;
  /** Optional final delivery target for inline H3 learned-latent second sampling. */
  h3DeliveryResolution?: 1080;
  /** Mutable recovery checkpoint committed after the first pass and before learned second sampling. */
  h3FirstPassCheckpoint?: {
    promptId: string;
    outputFile: HistoryFile;
    artifact: NativeAvContinuationArtifact;
  };
  fps: Draft["fps"];
  frameInterpolation: Draft["frameInterpolation"];
  motion: Draft["motion"];
  modelProfile?: LtxExtensionModelProfile;
}

export type UpscaleTargetHeight = 720 | 768 | 1080 | 1440 | 2160;
export type Dlss5Scale = 2 | 3 | 4;
export type Dlss5Quality = "quality" | "balanced" | "performance";
export type Dlss5GuideProfile = "depth-anything-v2-small-farneback";

export interface Dlss5UpscaleOptions {
  operation: "super-resolution";
  scale: Dlss5Scale;
  quality: Dlss5Quality;
  guideProfile: Dlss5GuideProfile;
  /** Immutable HECer source revision captured when the task is queued. */
  nodeRevision: string;
  /** Immutable app-owned runtime bundle captured when the task is queued. */
  runtimeBundleId: string;
}

/**
 * AetherScale's carrier-backed modes are deliberately separate from the
 * HECer scale enum above.  The upstream worker owns these exact factors and
 * perf-quality values; they must not leak into the HECer queue contract.
 */
export type AetherScaleCarrierMode =
  | "native_1x"
  | "quality_1_5x"
  | "balanced_1_724x"
  | "performance_2x"
  | "ultra_performance_3x";

export type AetherScaleStyleProfile = "faithful" | "enhanced";

export interface AetherScaleDlss5Options {
  provider: "aetherscale-carrier";
  operation: "neural-upscale" | "neural-enhance";
  mode: AetherScaleCarrierMode;
  styleProfile: AetherScaleStyleProfile;
  motionProfile: "torch-lk-compact-v1";
  /** Immutable AetherScale source revision captured when the task is queued. */
  nodeRevision: string;
  /** Immutable carrier bundle captured when the task is queued. */
  runtimeBundleId: string;
  targetWidth: number;
  targetHeight: number;
  warmupFrames: number;
  sceneCutThreshold: number;
}

export type Dlss5ProviderId = "hecer" | "aetherscale-carrier";

export type Dlss5ProviderReadiness =
  | "missing"
  | "installed"
  | "statically-recognizable"
  | "registered"
  | "runtime-ready"
  | "smoke-passed"
  | "blocked-upstream"
  | "incompatible";

/** Additive provider-specific evidence; HECer remains represented by dlss5Runtime. */
export interface Dlss5ProviderStatus {
  provider: Dlss5ProviderId;
  nodeId: string;
  nodeRevision: string;
  runtimeBundleId: string;
  level: Dlss5ProviderReadiness;
  availableForQueue: boolean;
  installed: boolean;
  schemaValidated: boolean;
  runtimeValidated: boolean;
  smokeValidated: boolean;
  missingFiles: string[];
  incompatibleFiles: string[];
  blockedReason: string;
  evidence: string[];
}

export type AetherScaleRuntimeState =
  | "ready"
  | "missing"
  | "invalid"
  | "offline"
  | "remote"
  | "unknown";

/** Task-owned native worker evidence published by the AetherScale adapter. */
export interface AetherScaleWorkerState {
  processId: number;
  parentProcessId: number;
  workerPath: string;
  runtimeDirectory: string;
  startedAt: string;
}

/** Offline/app-managed evidence for AetherScale's carrier runtime. */
export interface AetherScaleRuntimeStatus {
  state: AetherScaleRuntimeState;
  provider: "aetherscale-carrier";
  bundleId: string;
  nodeRevision: string;
  runtimeDirectory: string;
  manifestPath: string;
  workerPath: string;
  source: "app-managed" | "manual" | "";
  installed: boolean;
  manifestValid: boolean;
  carrierReady: boolean;
  motionReady: boolean;
  vfxReady: boolean;
  runtimeValidated: boolean;
  smokeValidated: boolean;
  pythonPath: string;
  missingFiles: string[];
  unexpectedFiles: string[];
  incompatibleFiles: string[];
  error: string;
  workerState?: AetherScaleWorkerState;
}

export interface UpscaleQueueTask extends VideoQueueTaskBase {
  taskType: "upscale";
  /** Absent on legacy persisted tasks and treated as pixel-video upscale. */
  upscaleMode?: "pixel" | "h3-native";
  sourceAssetId: string;
  sourceVersionId: string;
  sourceFilePath: string;
  sourceFilename: string;
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  /** Legacy fixed short-edge target; DLSS5 tasks use targetScale instead. */
  targetHeight?: UpscaleTargetHeight;
  targetScale?: Dlss5Scale;
  dlss5?: Dlss5UpscaleOptions;
  aetherScale?: AetherScaleDlss5Options;
  /** Actual aligned output height; legacy pixel tasks use targetHeight. */
  targetOutputHeight?: number;
  tileMode: "auto" | "safe" | "fast";
  faceRestore: boolean;
  h3NativeInput?: H3NativeUpscaleInputSnapshot;
  /**
   * Runtime checkpoint for the native SeedVR2 long-video adapter. It is
   * deliberately separate from the immutable upscale parameters so a failed
   * task can resume completed segments after recovery or an app restart.
   */
  seedVr2Checkpoint?: SeedVr2UpscaleCheckpoint;
  seedVr2Progress?: SeedVr2UpscaleProgress;
}

export interface H3NativeUpscaleInputSnapshot {
  /** Absent on legacy records and interpreted as the bilinear provider. */
  provider?: "bilinear" | "learned-3d";
  artifact: NativeAvContinuationArtifact;
  workflowPath: string;
  learnedModelFilename?: string;
  prompt: string;
  startImagePath: string;
  endImagePath: string;
  scaleBy: number;
  h3VideoVaeMode: H3VideoVaeBackend;
  attentionMode: Settings["h3AttentionMode"];
  steps: H3StepCount;
  videoLoras: VideoLoraSelection[];
}

export interface SeedVr2UpscaleProgress {
  phase: "planning" | "segments" | "merging" | "cleaning";
  currentSegment: number;
  totalSegments: number;
  completedSegments: number;
  segmentProgress: number;
  temporaryFileCount?: number;
}

export interface SeedVr2UpscaleSegmentCheckpoint {
  index: number;
  startFrame: number;
  frameCount: number;
  promptId: string;
  file: HistoryFile;
}

export interface SeedVr2UpscaleCheckpoint {
  planVersion: 1 | 2;
  framesPerSegment: number;
  totalFrames: number;
  totalSegments: number;
  targetWidth?: number;
  targetHeight?: number;
  systemMemoryTotalBytes?: number;
  systemMemoryAvailableBytes?: number;
  vramTotalBytes?: number | null;
  vramAvailableBytes?: number | null;
  preprocessingBudgetBytes?: number;
  vramFrameLimit?: number;
  completed: SeedVr2UpscaleSegmentCheckpoint[];
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
  /** Optional H3 Native AV artifact selected for Continuum extension. */
  h3ContinuumArtifactPath?: string;
  h3ContinuumArtifact?: NativeAvContinuationArtifact;
  h3ContextSavePrefix?: string;
  h3ContextSavedPath?: string;
  /** Motion Context keeps the source video in slot 1 and optional refs after it. */
  h3ReferenceSlots?: H3ReferenceSlot[];
  sourceWidth: number;
  sourceHeight: number;
  ratio: Draft["ratio"];
  resolution: H3BaseResolution;
  fps: Draft["fps"];
  frameInterpolation: Draft["frameInterpolation"];
  motion: Draft["motion"];
  modelProfile: LtxExtensionModelProfile;
  maxGeneratedFrames: 49 | 65 | 362;
  overlapFrames: 16 | 22;
  unloadBetweenStages: true;
}

export type QueueTask =
  | GenerationQueueTask
  | ExtensionQueueTask
  | UpscaleQueueTask
  | ImageGenerationQueueTask;

export interface UpscaleRequest {
  upscaleMode?: "pixel" | "h3-native";
  sourceAssetId: string;
  sourceVersionId: string;
  sourceFilePath: string;
  sourceFilename: string;
  sourceWidth: number;
  sourceHeight: number;
  duration: number;
  fps: number;
  /** Legacy fixed short-edge target; DLSS5 requests use targetScale instead. */
  targetHeight?: UpscaleTargetHeight;
  targetScale?: Dlss5Scale;
  dlss5?: Dlss5UpscaleOptions;
  aetherScale?: AetherScaleDlss5Options;
  modelId: string;
  tileMode: UpscaleQueueTask["tileMode"];
  faceRestore: boolean;
  h3NativeInput?: H3NativeUpscaleInputSnapshot;
}

export interface HistoryFile {
  filename: string;
  subfolder: string;
  type: string;
  format?: string;
  absolutePath?: string;
  sizeBytes?: number;
}

/**
 * A clean joint H3 video/audio latent is an auxiliary video-output asset.
 * It is deliberately separate from Motion Context's h3ContextLatentPath:
 * the latter is a model-specific continuation cache and is not a Native AV
 * serializer contract.
 */
export type H3ContinuationDataStatus =
  | "available"
  | "disabled"
  | "not-supported"
  | "save-failed"
  | "missing"
  | "invalid";

export type NativeAvArtifactRole =
  | "first-pass-clean-av"
  | "final-clean-av"
  | "extend-segment-clean-av";

export interface NativeAvContinuationArtifact {
  schemaVersion: 1;
  artifactId: string;
  role: NativeAvArtifactRole;
  /** Stable lineage for a generation/extend chain, not a filesystem path. */
  lineageId: string;
  /** Optional parent artifact used to produce this artifact. */
  derivedFromArtifactId?: string;
  manifest: HistoryFile;
  payload: HistoryFile;
  payloadSha256: string;
  payloadBytes: number;
  modelFamily: "minimax-h3";
  /** The execution model identity is intentionally not inferred from a file. */
  executionModelId: string;
  providerId: string;
  providerRevision: string;
  /** Optional only for legacy persisted artifacts; new commits include producer identity. */
  producerNodeId?: string;
  producerNodeVersion?: string;
  workflowId?: string;
  diffusionModelFilename: string;
  diffusionModelSha256?: string;
  textEncoderFilename: string;
  textEncoderSha256?: string;
  videoVaeFilename: string;
  videoVaeSha256?: string;
  audioVaeFilename: string;
  audioVaeSha256?: string;
  upscalerId?: string;
  upscalerRevision?: string;
  width: number;
  height: number;
  fps: 24;
  frameCount: number;
  videoShape: number[];
  videoDtype: string;
  audioSampleRate: 32000;
  audioChannels: 2;
  audioLatentRate: 40;
  audioShape: number[];
  audioDtype: string;
  contextFrames: number;
  workflowRevision: string;
  sourceTaskId: string;
  sourceAssetId?: string;
  sourceVersionId?: string;
  createdAt: string;
}

export interface NativeAvContinuationData {
  status: H3ContinuationDataStatus;
  reason?: string;
  artifact?: NativeAvContinuationArtifact;
}

/** Result of re-checking a persisted artifact pair against the active output root. */
export interface NativeAvArtifactInspection {
  status: H3ContinuationDataStatus;
  reason?: string;
  artifact?: NativeAvContinuationArtifact;
  payloadPath?: string;
  manifestPath?: string;
  payloadBytes?: number;
}

export interface AssetVersion {
  id: string;
  taskId?: string;
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
  h3VideoVaeMode?: H3VideoVaeBackend;
  h3SaveJointAv?: boolean;
  spectrumMode?: H3SpectrumMode;
  spectrumModelAwareMode?: H3SpectrumModelAwareMode;
  h3MemoryOptimizationMode?: H3MemoryOptimizationMode;
  h3MemoryOptimizationUserSet?: boolean;
  h3MemoryChunkRows?: number;
  h3MemoryExecutionPlan?: H3MemoryExecutionPlanSnapshot;
  h3MemoryRuntimeEvidence?: H3MemoryRuntimeEvidence;
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
  /** Lineage and provider metadata for derived video versions. */
  sourceAssetId?: string;
  sourceVersionId?: string;
  upscaleProvider?: string;
  upscaleOperation?: string;
  upscaleScale?: Dlss5Scale;
  upscaleQuality?: Dlss5Quality;
  upscaleGuideProfile?: Dlss5GuideProfile;
  /** Provider-specific AetherScale carrier metadata; absent on legacy/HECer versions. */
  upscaleCarrierMode?: AetherScaleCarrierMode;
  upscaleStyleProfile?: AetherScaleStyleProfile;
  upscaleMotionProfile?: AetherScaleDlss5Options["motionProfile"];
  upscaleWarmupFrames?: number;
  upscaleSceneCutThreshold?: number;
  upscaleNodeRevision?: string;
  upscaleRuntimeBundleId?: string;
  startedAt?: string;
  h3ContextLatentPath?: string;
  h3ContinuationData?: NativeAvContinuationData;
}

export interface ImageHistoryProject {
  mediaKind: "image";
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** User curation metadata; absent in legacy files and normalized on load. */
  favorite: boolean;
  rating: HistoryRating | null;
  /** User-defined labels. Tag matching is case-insensitive. */
  tags: string[];
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
  aspectRatio?: ImageAspectRatio;
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
  /** User curation metadata; absent in legacy files and normalized on load. */
  favorite: boolean;
  rating: HistoryRating | null;
  /** User-defined labels. Tag matching is case-insensitive. */
  tags: string[];
  videoLoras?: VideoLoraSelection[];
  duration: number;
  resolution: number;
  steps?: H3StepCount;
  fps?: number;
  frameInterpolation?: Draft["frameInterpolation"];
  ratio?: Draft["ratio"];
  promptVersion?: number;
  attentionMode?: Settings["h3AttentionMode"];
  h3VideoVaeMode?: H3VideoVaeBackend;
  spectrumMode?: H3SpectrumMode;
  spectrumModelAwareMode?: H3SpectrumModelAwareMode;
  h3MemoryOptimizationMode?: H3MemoryOptimizationMode;
  h3MemoryOptimizationUserSet?: boolean;
  h3MemoryChunkRows?: number;
  h3MemoryExecutionPlan?: H3MemoryExecutionPlanSnapshot;
  h3MemoryRuntimeEvidence?: H3MemoryRuntimeEvidence;
  motion?: Draft["motion"];
  prompt: string;
  seed: number;
  inputMode?: Draft["inputMode"];
  h3ReferenceSlots?: H3ReferenceSlot[];
  sourceWidth?: number;
  sourceHeight?: number;
  startImagePath?: string;
  endImagePath?: string;
  endImageWidth?: number;
  endImageHeight?: number;
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

/** User curation rating. Half-star increments keep the control useful for close calls. */
export type HistoryRating = 0.5 | 1 | 1.5 | 2 | 2.5 | 3 | 3.5 | 4 | 4.5 | 5;

export interface HistoryMetadataPatch {
  favorite?: boolean;
  rating?: HistoryRating | null;
  tags?: string[];
}

export interface AppState {
  schemaVersion: number;
  /** Currently visible video-creation draft. */
  draft: Draft;
  /** Complete image-to-video composer snapshot, independent from extension. */
  imageToVideoDraft?: Draft;
  /**
   * Complete video-extension composer snapshot. The visible `draft` is only
   * the active projection; both composer snapshots own all of their model,
   * media, prompt, and generation parameters independently.
   */
  videoExtensionDraft?: Draft;
  imageDraft: ImageEditDraft;
  settings: Settings;
  queue: QueueTask[];
  history: HistoryAsset[];
  imageHistory: ImageHistoryProject[];
  queueRunning: boolean;
  /** ISO timestamp for the current queue run, not an individual task. */
  queueStartedAt?: string;
  /**
   * Number of active queue tasks above the optional horizontal pause divider.
   * The divider is a queue-level projection; task status remains waiting.
   */
  queuePauseBoundary?: number;
  queueLifecycle: QueueLifecycle;
  queueLifecycleTaskId?: string;
  /** Process-local timestamp for the current queue lifecycle operation. */
  queueLifecycleStartedAt?: string;
}

export type ConnectionKind = "comfy";
export type LocalServiceKind = "comfy";

export interface ConnectionResult {
  ok: boolean;
  message: string;
  /** The requested file operation succeeded, but an externally managed service must be restarted by the user. */
  manualRestartRequired?: boolean;
  log?: string;
  executablePath?: string;
}

export interface LlamaServerStatus {
  found: boolean;
  path: string;
  directory: string;
  source: "configured" | "prompt-models" | "app-managed" | "path" | "";
}

/** Runtime dependency shared by the Gemma H3 Prompt Writer and optional vision nodes. */
export interface LlamaCppPythonStatus {
  packageName: "llama-cpp-python";
  pythonPath: string;
  pythonVersion: string;
  packageVersion: string;
  torchVersion: string;
  cudaVersion: string;
  installed: boolean;
  importable: boolean;
  gpuOffload: boolean | null;
  ready: boolean;
  detail: string;
  error: string;
  /** True when the isolated native probe crashed before returning JSON. */
  nativeCrash?: boolean;
  /** Windows/native exit code when a probe crash was identified. */
  nativeCrashCode?: string;
}

export type Dlss5RuntimeState =
  | "ready"
  | "missing"
  | "invalid"
  | "offline"
  | "remote"
  | "unknown";

/** Offline file/config evidence for the app-managed HECer SR runtime. */
export interface Dlss5RuntimeStatus {
  state: Dlss5RuntimeState;
  bundleId: string;
  nodeRevision: string;
  runtimeDirectory: string;
  configPath: string;
  manifestPath: string;
  source: "app-managed" | "manual" | "";
  installed: boolean;
  configValid: boolean;
  srReady: boolean;
  nrReady: boolean;
  /** Reserved for a real runtime/status probe; offline scans keep this false. */
  runtimeValidated: boolean;
  pythonPath: string;
  srPluginPath: string;
  srRuntimePath: string;
  nrPluginPath?: string;
  nrRuntimePath?: string;
  missingFiles: string[];
  unexpectedFiles: string[];
  error: string;
}

/** File evidence for the pinned Depth Anything guide weight. */
export interface DepthAnythingAssetStatus {
  repository: string;
  revision: string;
  /** Resolved directory containing the user-managed model.safetensors file. */
  cacheDirectory: string;
  source: "app-managed" | "external" | "mixed" | "";
  modelFiles: string[];
  foundFiles: string[];
  missingFiles: string[];
  available: boolean;
  pythonPath: string;
  runtimeVerified: boolean;
  error: string;
}

export type EnvironmentItemId =
  | "node"
  | "git"
  | "ffmpeg"
  | "cuda-toolkit"
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
  /** Explicitly distinguishes a service that is merely offline from a confirmed missing dependency. */
  status?: "available" | "warning" | "missing";
  /** Official/manual installation page, when this item can be installed by the user. */
  downloadUrl?: string;
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
  h3MinimumVersion: string;
  h3MinimumRevision: string;
  h3RecommendedVersion: string;
  h3CoreSupported: boolean;
  coreNodes: ComfyUiCoreNodeStatus[];
  promptCoreSupported: boolean;
  promptCoreNodes: ComfyUiCoreNodeStatus[];
  checkedFrom: "api" | "source" | "";
  updateMode: "desktop" | "git" | "unsupported";
  updateHint: string;
  /** Additive compatibility evidence; old scan payloads may omit these fields. */
  compatibilityState?: "supported" | "warning" | "error" | "unknown";
  compatibilityNotice?: string;
  knownBadRanges?: import("./core/catalog/dependencies/types.js").DependencyBadRange[];
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

export interface ModelComponentStatus {
  label: string;
  found: boolean;
  optional?: boolean;
  alternativeGroup?: string;
  expected: string;
  matches: string[];
  installGuide: {
    sourceLabel: string;
    downloadUrl: string;
    targetSubdirectory: string;
    recommendedFilename: string;
    notes?: string;
    version?: string;
    revision?: string;
    bytes?: number;
    sha256?: string;
    license?: string;
  };
}

export interface ModelScanProfile {
  id: string;
  name: string;
  category: "video" | "lora" | "image" | "upscale" | "interpolation" | "prompt";
  /** Absent on legacy profiles and equivalent to `generation`. */
  role?: "generation" | "guide";
  managedBy?: "comfyui" | "lmstudio" | "llama-server";
  badge: string;
  description: string;
  vram: string;
  available: boolean;
  integrated: boolean;
  requiredCustomNodeIds?: string[];
  missingCustomNodeIds?: string[];
  missingCustomNodeNames?: string[];
  customNodeCompatibility?: "supported" | "warning" | "error" | "unknown";
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
  /** Required node classes absent from the current /object_info response. */
  runtimeMissingNodeTypes?: string[];
  /** The installed package registered none of its baseline node classes and can be safely repaired. */
  runtimeRepairable?: boolean;
  loadError: string;
  updateNotice?: string;
  /** Informational runtime evidence; does not downgrade compatibility state. */
  runtimeNotice?: string;
  directory: string;
  required: boolean;
  version: string;
  /** Local package file used to detect version, or .git/HEAD for unversioned repositories. */
  versionSource?: string;
  minimumVersion: string;
  recommendedVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  /** Other custom_nodes directories that appear to contain the same patch/node pack. */
  duplicateDirectories?: string[];
  /** Git revision detected independently from the package version, when available. */
  detectedRevision?: string;
  /** Immutable catalog revision required for an installable package, when pinned. */
  installRevision?: string;
  /** Additive machine-readable state used by Settings; legacy scans omit it. */
  compatibilityState?: "supported" | "warning" | "error" | "unknown";
  compatibilityNotice?: string;
  compatibilityEvidence?: import("./core/catalog/dependencies/types.js").DependencyCompatibilityEvidence[];
  knownBadRanges?: import("./core/catalog/dependencies/types.js").DependencyBadRange[];
  /** Python/system prerequisite shown in Settings; absent on legacy scan payloads. */
  runtimeRequirement?: string;
  /** Optional external-toolchain nodes can be excluded from bulk installation. */
  bulkInstall?: boolean;
  /** False when the package is recognized but the app must not install or uninstall it. */
  appInstallable?: boolean;
  /** Git origin captured during offline scan, when available. */
  sourceRemote?: string;
  /** Git worktree state; unknown is expected when Git is unavailable. */
  revisionDirtyState?: "clean" | "dirty" | "unknown";
}

export type CustomNodeInstallMode = "install" | "update" | "repair" | "reinstall";

export type EnvironmentScanScope = "full" | "runtime" | "dependencies";
export type ComfyUiEndpointScope = "local" | "remote" | "unconfigured";
export type ComfyUiEnvironmentStatus =
  | "ready"
  | "needs-attention"
  | "offline"
  | "not-found"
  | "unknown";
export type ComfyUiRepairOperation =
  | "repair-node-source"
  | "repair-core-python"
  | "repair-database";
export type ComfyUiRepairBackupStrategy =
  | "none"
  | "source-file-copy"
  | "sqlite-family-copy-and-quarantine";
export type ComfyUiRepairServiceAction =
  | "none"
  | "restart-if-app-owned"
  | "start-and-verify"
  | "use-isolated-database";

/**
 * Explicit scope for an environment repair. The renderer can show this plan
 * before invoking the legacy issue-repair IPC without guessing which files,
 * service, or recovery action are involved.
 */
export interface ComfyUiRepairPlan {
  operation: ComfyUiRepairOperation;
  target: {
    endpoint: string;
    endpointScope: ComfyUiEndpointScope;
    installType: ComfyUiInstallationSummary["type"] | "";
    installDirectory: string;
    sourceDirectory: string;
    dataDirectory: string;
    pythonPath: string;
  };
  backup: {
    required: boolean;
    strategy: ComfyUiRepairBackupStrategy;
    directory: string;
  };
  service: {
    ownership: ComfyRuntimeOwnership;
    action: ComfyUiRepairServiceAction;
    remoteMutationAllowed: false;
  };
  rescan: {
    required: boolean;
    scope: EnvironmentScanScope;
    waitForService: boolean;
  };
  logging: {
    scope: "environment";
    retainOutputOnFailure: true;
  };
}

/** Additive, renderer-ready summary of the selected ComfyUI environment. */
export interface ComfyUiEnvironmentSummary {
  status: ComfyUiEnvironmentStatus;
  endpoint: string;
  endpointScope: ComfyUiEndpointScope;
  serviceReachable: boolean;
  runtimePhase: ComfyRuntimePhase;
  runtimeOwnership: ComfyRuntimeOwnership;
  selectedInstallation: ComfyUiInstallationSummary | null;
  core: {
    version: string;
    revision: string;
    checkedFrom: ComfyUiCompatibility["checkedFrom"];
    compatibilityState: "supported" | "warning" | "error" | "unknown";
  };
  python: {
    path: string;
    version: string;
    source: PythonRuntimeCandidate["source"] | "";
    available: boolean;
  };
  issues: {
    total: number;
    errors: number;
    warnings: number;
    repairable: number;
  };
  operations: {
    canStart: boolean;
    canRestart: boolean;
    canStop: boolean;
    canUpdate: boolean;
    canRepair: boolean;
  };
}

export interface EnvironmentIssue {
  id: "fantasytalking-unicodeescape" | "comfy-database" | "comfy-core-pyav";
  label: string;
  detail: string;
  severity: "error" | "warning";
  repairable: boolean;
  repairLabel: string;
  /** Additive repair scope; legacy scan payloads may omit it. */
  repairPlan?: ComfyUiRepairPlan;
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
  llamaCppPython: LlamaCppPythonStatus;
  comfyCompatibility: ComfyUiCompatibility;
  attentionAcceleration: AttentionAccelerationStatus;
  items: EnvironmentItem[];
  modelProfiles: ModelScanProfile[];
  customNodes: CustomNodeStatus[];
  /** Additive DLSS5 runtime evidence; absent in older persisted scan payloads. */
  dlss5Runtime?: Dlss5RuntimeStatus;
  /** Additive Depth Anything guide evidence; absent in older persisted scan payloads. */
  depthAnything?: DepthAnythingAssetStatus;
  /** Additive per-provider DLSS5 evidence; old scans remain HECer-compatible. */
  dlss5Providers?: Partial<Record<Dlss5ProviderId, Dlss5ProviderStatus>>;
  /** Additive AetherScale carrier evidence; independent from dlss5Runtime. */
  aetherScaleRuntime?: AetherScaleRuntimeStatus;
  issues: EnvironmentIssue[];
  /** Additive summary for the ComfyUI environment page. */
  environmentSummary?: ComfyUiEnvironmentSummary;
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
  torchvisionVersion?: string;
  torchaudioVersion?: string;
  cudaVersion: string;
  gpuName: string;
  gpuArchitecture: string;
  sageAttentionVersion: string;
  sageNativeReady?: boolean;
  sageNativeError?: string;
  tritonVersion: string;
  comfyKitchenVersion?: string;
  comfyKitchenBackends?: string[];
  convRotCudaOptimized?: boolean;
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
  | "detailed-cinematic"
  | "reference-faithful"
  | "continuous-motion"
  | "dialogue-sound"
  | "beat-storyboard"
  | "product-brand"
  | "music-video"
  | "narrative-animation"
  | "multi-reference";

export type H3PromptMode = "T2VA" | "I2VA" | "FL2VA" | "L2VA" | "R2V";

export interface PromptExtensionSource {
  filePath: string;
  trimStartSeconds: number;
  trimEndSeconds: number;
}

export interface EnhanceRequest {
  prompt: string;
  modelId: string;
  /** Selected image model; modelId remains the prompt/vision runtime model. */
  imageTargetModelId?: string;
  origin?: PromptOperationOrigin;
  mode?: PromptEnhanceMode;
  promptStrategy?: "rewrite" | "reference-auto";
  autoPromptSeedId?: string;
  autoPromptSeedInstruction?: string;
  autoPromptVariationId?: string;
  imageEditEnhanceMode?: ImagePromptPreset;
  imageEditPresetText?: string;
  imagePath?: string;
  imagePaths?: string[];
  h3PromptMode?: H3PromptMode;
  h3PromptPreset?: H3PromptPreset;
  /** Optional H3 LoRAs currently enabled in the creation draft. */
  videoLoras?: VideoLoraSelection[];
  h3DurationSeconds?: number;
  h3AspectRatio?: string;
  referenceMediaPaths?: string[];
  referenceContext?: string;
  extensionSource?: PromptExtensionSource;
  /** One-shot user consent for CPU inference after a visible VRAM warning. */
  allowCpuFallback?: boolean;
}

export interface PromptExecutionPreflight {
  requiresCpuConfirmation: boolean;
  modelId: string;
  vramUsedBytes: number | null;
  vramTotalBytes: number | null;
  vramFreeBytes: number | null;
  requiredFreeVramBytes: number | null;
}

export type PromptProgressStage =
  | "preparing"
  | "checking"
  | "uploading"
  | "loading-model"
  | "analyzing"
  | "generating"
  | "validating"
  | "unloading";

export type PromptProgressStatus = "running" | "completed" | "failed" | "cancelled";

export interface PromptProgress {
  operationId: string;
  origin: PromptOperationOrigin;
  status: PromptProgressStatus;
  stage: PromptProgressStage;
  progress: number | null;
  startedAt: number;
  elapsedMs: number;
  modelId: string;
  detail?: string;
  error?: string;
}

export type PromptProgressReporter = (
  stage: PromptProgressStage,
  progress?: number | null,
  detail?: string
) => void;

export interface BundledWorkflow {
  modelId: string;
  label: string;
  path: string;
  supportsEndImage: boolean;
  supportsVideoExtension: boolean;
  metadata?: import("./core/workflow-metadata.js").WorkflowSourceMetadata;
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
  /** H3 text + visual conditioning token count resolved for this task. */
  h3TokenCount?: number;
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
  /** Observer source; ordinary ComfyUI previews remain distinguishable from H3 TAE frames. */
  source?: "h3-tae" | "comfy";
  step?: number;
  totalSteps?: number;
  sequence?: number;
}

export interface WindowCloseRequest {
  kind: "unsaved-settings" | "running-work";
  hasUnsavedSettings?: boolean;
  queueCleanupOnly?: boolean;
  queueCleanupTimedOut?: boolean;
  queueLifecycle?: QueueLifecycle;
  queueLifecycleStartedAt?: string;
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

export interface CreationDraftSnapshots {
  imageToVideoDraft?: Draft;
  videoExtensionDraft?: Draft;
}

export interface AppApi {
  getState(): Promise<AppState>;
  getComfyRuntimeState(): Promise<ComfyRuntimeState>;
  getPromptRuntimeState(): Promise<PromptRuntimeState>;
  getAppVersion(): Promise<string>;
  setSettingsDirty(dirty: boolean): Promise<void>;
  respondWindowClose(response: WindowCloseResponse): Promise<void>;
  saveDraft(draft: Draft, snapshots?: CreationDraftSnapshots): Promise<AppState>;
  saveImageDraft(draft: ImageEditDraft): Promise<AppState>;
  saveSettings(settings: Settings, mode?: SettingsSaveMode): Promise<AppState>;
  setQueueH3LivePreview(enabled: boolean): Promise<AppState>;
  pickImage(): Promise<string | null>;
  pickVideo(): Promise<string | null>;
  pickH3NativeAv(): Promise<string | null>;
  getDroppedFilePath(file: File): string;
  saveClipboardImage(data: ArrayBuffer, mimeType: string): Promise<string>;
  readImageMarkup(documentPath: string): Promise<string | null>;
  saveImageMarkup(request: ImageMarkupSaveRequest): Promise<ImageMarkupData>;
  saveImageMask(request: ImageMaskSaveRequest): Promise<ImageMaskData>;
  saveImageCrop(request: ImageCropSaveRequest): Promise<ImageCropData | null>;
  pickWorkflow(): Promise<string | null>;
  pickPython(): Promise<string | null>;
  inspectWorkflow(path: string, modelId?: string): Promise<WorkflowCapabilities>;
  getBundledWorkflow(
    modelId: string,
    inputMode?: Draft["inputMode"]
  ): Promise<BundledWorkflow | null>;
  getPerformanceMetrics(settings: Settings): Promise<PerformanceMetrics>;
  readAppLogs(limit?: number): Promise<AppLogSnapshot>;
  openAppLogDirectory(kind: "logs" | "crashDumps"): Promise<boolean>;
  reportRendererError(message: string, meta?: Record<string, unknown>): Promise<void>;
  reportUserAction(action: string, meta?: Record<string, unknown>): Promise<void>;
  reportNotification(kind: NotificationKind, message: string): Promise<void>;
  pickDirectory(defaultPath?: string, createIfMissing?: boolean): Promise<string | null>;
  readImage(path: string): Promise<string | null>;
  readHistoryCover(key: string, sourcePath: string): Promise<string | null>;
  inspectH3NativeAvArtifact(assetId: string, versionId: string): Promise<NativeAvArtifactInspection>;
  saveHistoryCover(key: string, sourcePath: string, data: ArrayBuffer): Promise<boolean>;
  showItemInFolder(path: string): Promise<boolean>;
  openDirectory(path: string): Promise<boolean>;
  copyFile(path: string): Promise<ConnectionResult>;
  openSystemPlayer(path: string): Promise<ConnectionResult>;
  openExternal(url: string): Promise<boolean>;
  preflightPromptModel(): Promise<PromptExecutionPreflight>;
  enhancePrompt(request: EnhanceRequest): Promise<string>;
  cancelPrompt(): Promise<ConnectionResult>;
  startPromptModel(allowCpuFallback?: boolean): Promise<ConnectionResult>;
  releasePromptModel(): Promise<ConnectionResult>;
  testConnection(kind: ConnectionKind, settings: Settings): Promise<ConnectionResult>;
  scanEnvironment(
    settings: Settings,
    scope?: EnvironmentScanScope
  ): Promise<EnvironmentScanResult>;
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
    settings: Settings,
    mode?: CustomNodeInstallMode
  ): Promise<ConnectionResult>;
  uninstallCustomNode(
    nodeId: string,
    settings: Settings
  ): Promise<ConnectionResult>;
  installLlamaCppPython(settings: Settings): Promise<ConnectionResult>;
  uninstallLlamaCppPython(settings: Settings): Promise<ConnectionResult>;
  installAttentionAcceleration(settings: Settings): Promise<ConnectionResult>;
  installDepthAnything(settings: Settings): Promise<ConnectionResult>;
  enqueue(draft: Draft): Promise<AppState>;
  enqueueExtension(draft: Draft): Promise<AppState>;
  enqueueImageEdit(draft: ImageEditDraft): Promise<AppState>;
  enqueueUpscale(request: UpscaleRequest): Promise<AppState>;
  updateUpscaleTask(taskId: string, patch: Pick<UpscaleQueueTask, "upscaleMode" | "targetWidth" | "targetHeight" | "targetOutputHeight" | "targetScale" | "dlss5" | "aetherScale" | "modelId" | "workflowPath" | "tileMode" | "faceRestore" | "outputFilename">): Promise<AppState>;
  removeTask(taskId: string): Promise<AppState>;
  startQueue(): Promise<AppState>;
  continueQueue(): Promise<AppState>;
  pauseQueue(): Promise<AppState>;
  setQueuePauseBoundaryAfterTask(taskId: string): Promise<AppState>;
  setQueuePauseBoundary(waitingTaskCount: number): Promise<AppState>;
  clearQueuePauseBoundary(): Promise<AppState>;
  cancelTask(taskId: string): Promise<AppState>;
  moveTask(taskId: string, direction: -1 | 1): Promise<AppState>;
  reorderTask(taskId: string, targetWaitingIndex: number, pauseBoundaryTarget?: number): Promise<AppState>;
  duplicateTask(taskId: string): Promise<AppState>;
  randomizeTaskSeed(taskId: string): Promise<AppState>;
  resetTask(taskId: string): Promise<AppState>;
  deleteHistoryAsset(assetId: string): Promise<AppState>;
  deleteHistoryVersion(assetId: string, versionId: string): Promise<AppState>;
  deleteHistoryJointAv(assetId: string, versionId: string): Promise<AppState>;
  updateHistoryMetadata(assetId: string, patch: HistoryMetadataPatch): Promise<AppState>;
  setImageHistoryCover(projectId: string, versionId?: string): Promise<AppState>;
  deleteImageHistoryVersion(projectId: string, versionId: string): Promise<AppState>;
  onStateChanged(callback: (state: AppState) => void): () => void;
  onComfyRuntimeStateChanged(callback: (state: ComfyRuntimeState) => void): () => void;
  onPromptRuntimeStateChanged(callback: (state: PromptRuntimeState) => void): () => void;
  onTaskPreview(callback: (preview: TaskPreview) => void): () => void;
  onPromptProgress(callback: (progress: PromptProgress) => void): () => void;
  onWindowCloseRequest(callback: (request: WindowCloseRequest) => void): () => void;
  onAttentionInstallLog(callback: (message: string) => void): () => void;
  onDependencyInstallLog(
    callback: (progress: DependencyInstallProgress) => void
  ): () => void;
  onHistoryMigrationProgress(callback: (progress: HistoryMigrationProgress) => void): () => void;
  scanImageAssetLibrary(): Promise<ImageAssetLibraryScan>;
  organizeImageAssetLibrary(): Promise<ImageAssetLibraryResult>;
  cleanupImageAssetLibrary(paths: string[]): Promise<ImageAssetLibraryResult>;
  onImageAssetLibraryProgress(callback: (progress: ImageAssetLibraryProgress) => void): () => void;
}

export type NotificationKind =
  | "info"
  | "warning"
  | "error"
  | "task-complete"
  | "queue-complete";

export interface DependencyInstallProgress {
  kind: "custom-node" | "python-runtime" | "model-assets";
  id: string;
  message: string;
}

declare global {
  interface Window {
    studio: AppApi;
  }
}
