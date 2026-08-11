import { countPromptWords, recommendedH3PromptWords } from "./core/prompt-count";
import "./style.css";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Ban,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Columns3,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Film,
  FolderOpen,
  Gauge,
  Grid2X2,
  Image,
  Images,
  Info,
  LayoutGrid,
  ListOrdered,
  Maximize2,
  MemoryStick,
  Monitor,
  MoveDown,
  MoveUp,
  PackageOpen,
  Pause,
  Pencil,
  Play,
  Power,
  Plus,
  Puzzle,
  RefreshCw,
  RotateCcw,
  Save,
  ScanSearch,
  Server,
  Settings as SettingsIcon,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  SlidersHorizontal,
  Trash2,
  Upload,
  Video,
  WandSparkles,
  Workflow,
  X,
  Zap,
  createIcons
} from "lucide";
import type {
  AppLogSnapshot,
  AppState,
  AssetVersion,
  BundledWorkflow,
  Draft,
  EnvironmentScanResult,
  H3PromptPreset,
  H3PromptMode,
  H3ReferenceMediaType,
  H3ReferenceRole,
  H3ReferenceSlot,
  HistoryMigrationProgress,
  ImageAssetLibraryProgress,
  ImageAssetLibraryResult,
  ImageAssetLibraryScan,
  ImageAssetVersion,
  ImageGenerationQueueTask,
  ImageEditDraft,
  ImageHistoryProject,
  ImagePromptPreset,
  ImageReference,
  ImageReferenceRole,
  LocalServiceKind,
  ModelComponentStatus,
  ModelScanProfile,
  PerformanceMetrics,
  PromptEnhanceMode,
  PromptVersion,
  QueueTask,
  Settings,
  SettingsSaveMode,
  TaskPerformanceStats,
  VideoLoraPurpose,
  WindowCloseRequest,
  WorkflowCapabilities
} from "./types";
import { createClearedDraft, createDefaultImageEditDraft, createDefaultImagePromptPresets } from "./core/defaults";
import { createHistoryCoverCacheKey } from "./core/history-cover";
import {
  imageEditDraftFromQueueTask,
  imageEditPicturesForVersion,
  imageProjectCoverVersion,
  nextImagePictureNumber,
  normalizeImageEditDraft
} from "./core/image-project";
import {
  imageMarkupPromptContext,
  imageModelCapabilityFor,
  imageReferenceInputPath,
  imageLightningComponentFound,
  imageQualityProfileRequiresLightning,
  imageResolutionOptionsFor,
  normalizeImageTargetResolution
} from "./core/image-workflow";
import { createDefaultH3PromptPresets, h3PromptPresetForMode } from "./core/h3-prompt-presets";
import {
  isGemmaPromptModel,
  isManagedPromptModel,
  promptModelSupportsImageEdit
} from "./core/prompt-models";
import {
  h3ReferenceSlotCounts
} from "./core/h3-reference";
import {
  createH3PromptFromBuilder,
  createH3PromptTemplate,
  inferH3PromptMode,
  type H3CameraMotion,
  type H3PromptBuilderInput
} from "./core/h3-prompt";
import {
  extensionSafetyForTask,
  frameInterpolationMultiplier,
  generationFrameCountForTask,
  generationSafetyForTask,
  isMiniMaxH3BoundaryExtensionModel,
  isMiniMaxH3Fl2vaModel,
  isMiniMaxH3Model,
  isMiniMaxH3R2vModel,
  isMiniMaxH3SpectrumEligible,
  isRetiredVideoModel,
  normalizeH3Steps,
  outputDimensions,
  outputFrameCountForTask
} from "./core/workflow";
import {
  createUpscaleFilename,
  estimateUpscaleResources,
  upscaleDimensions
} from "./core/upscale";
import {
  promptSnippetFor,
  promptSnippets
} from "./core/prompt-suggestions";
import { checkH3Prompt } from "./core/h3-prompt-check";
import { structurallyEqual } from "./core/structural-equal";
import {
  BUILTIN_VIDEO_LORAS,
  H3_TURBO_LORA_ID,
  bundledWorkflowModelId,
  isH3TurboEnabled,
  reorderVideoLoras,
  videoLoraConfigurationIssues,
  videoLoraCompatibleWithDraft,
  videoLoraSelection
} from "./core/video-loras";

type Page = "create" | "queue" | "history" | "history-detail" | "image-history-detail" | "settings";
type HistoryKind = "video" | "image";
type CreationMode = "image-to-video" | "video-extension" | "image-edit";

const appElement = document.querySelector<HTMLDivElement>("#app")!;
let state: AppState;
let appVersion = "";
let page: Page = "create";
let creationMode: CreationMode = "image-to-video";
let draftSaveTimer: number | undefined;
let draftRevision = 0;
let draftSaveInFlight = 0;
let draftDirty = false;
let imageDraftSaveTimer: number | undefined;
let imageDraftRevision = 0;
let flashMessage = "";
let flashMessageTimer: number | undefined;
let selectedHistoryAssetId = "";
let selectedHistoryVersionId = "";
let historyKind: HistoryKind = "video";
let historyForwardTarget: { assetId: string; versionId: string } | null = null;
let upscaleDialog: {
  taskId?: string;
  replaceTaskId?: string;
  assetId: string;
  versionId: string;
  targetHeight: 720 | 1080 | 1440 | 2160;
  modelId: "seedvr2" | "flashvsr" | "realesrgan";
  tileMode: "auto" | "safe" | "fast";
} | null = null;
let historyScrollPosition = 0;
let historyScrollRestorePending = false;
let pageViewportEvents: AbortController | null = null;
let historyLayoutAnchor: { assetId: string; offsetFromCenter: number } | null = null;
let historyLayoutRestoreFrame: number | null = null;
let historyLayout: "masonry" | "album" = "masonry";
let environmentScan: EnvironmentScanResult | null = null;
let environmentScanning = false;
let environmentScanError = "";
let serviceStarting: LocalServiceKind | null = null;
let serviceRestarting: LocalServiceKind | null = null;
let serviceForceStopping = false;
let serviceStatusMessage = "";
let comfyUpdating = false;
let comfyUpdateLog = "";
let environmentRepairing = "";
let environmentRepairLogs: Record<string, string> = {};
let customNodeInstalling = "";
let customNodeLogs: Record<string, string> = {};
let workflowDependencyInstalling = "";
let workflowDependencyLogs: Record<string, string> = {};
let coreDependencyRepairing = false;
let attentionAccelerationInstalling = false;
let attentionAccelerationLog = "";
let settingsDraft: Settings | null = null;
let settingsTab: "system" | "acceleration" | "video" | "lora" | "image" | "nodes" | "prompt" | "upscale" | "logs" = "system";
let appLogs: AppLogSnapshot | null = null;
let appLogsLoading = false;
let appLogsError = "";
let appLogPollingTimer: number | undefined;
let appLogPollingInFlight = false;
let appLogFollowTail = true;
let appLogScreenClearedAt: number | null = null;
let selectedInstallGuide: {
  profileName: string;
  component: ModelComponentStatus;
} | null = null;
let pendingConfirmation:
  | { kind: "clear-draft" }
  | { kind: "delete-history"; assetId: string; title: string }
  | { kind: "delete-image-version"; projectId: string; versionId: string; title: string }
  | { kind: "remove-queue-task"; taskId: string; title: string }
  | { kind: "cancel-queue-task"; taskId: string; title: string }
  | { kind: "discard-settings"; nextPage: Page }
  | { kind: "force-stop-comfy" }
  | null = null;
let confirmationBusy = false;
let pendingDirectoryMigration: {
  target: "video";
  previousSettings: Settings;
  nextSettings: Settings;
  oldDirectory: string;
  newDirectory: string;
} | null = null;
let directoryMigrationBusy = false;
let historyMigrationProgress: HistoryMigrationProgress | null = null;
let imageAssetLibraryDialog: {
  scan: ImageAssetLibraryScan | null;
  busy: boolean;
  error: string;
  confirmCleanup: boolean;
  selectedPaths: string[];
  lastResult: {
    tone: "success" | "warning";
    title: string;
    detail: string;
    operationId?: string;
  } | null;
} | null = null;
let imageAssetLibraryProgress: ImageAssetLibraryProgress | null = null;
let queueActionBusy: { taskId: string; action: "remove" | "cancel" | "edit" } | null = null;
let enqueueBusy = false;
let modalReturnFocus: HTMLElement | null = null;
let modalInitialFocusPending = false;
let modalControlFocusSelector = "";
let pendingWindowCloseRequest: WindowCloseRequest | null = null;
let windowCloseResponseBusy = false;
const bundledWorkflows: Record<string, BundledWorkflow> = {};
const bundledWorkflowKey = (modelId: string, inputMode: Draft["inputMode"]) =>
  `${modelId}:${inputMode}`;
const workflowCapabilities: Record<string, WorkflowCapabilities> = {};
const taskPreviews: Record<string, string> = {};
let performanceMetrics: PerformanceMetrics | null = null;
let performancePolling = false;
let queueMoveScrollAnchor: {
  taskId: string;
  direction: -1 | 1;
  viewportTop: number;
} | null = null;
let historyContextMenuElement: HTMLElement | null = null;
let historyContextMenuEvents: AbortController | null = null;
let imageLightboxEvents: AbortController | null = null;
let shellNavigationEvents: AbortController | null = null;
let historyMasonryResizeObserver: ResizeObserver | null = null;
let historyAlbumResizeObserver: ResizeObserver | null = null;
let imageHistoryViewerResizeObserver: ResizeObserver | null = null;
let historyTitleResizeObserver: ResizeObserver | null = null;
let historyMediaObserver: IntersectionObserver | null = null;
let historyCoverWarmupController: AbortController | null = null;
let historyCoverWarmupTimer: number | undefined;
const HISTORY_COVER_MAX_EDGE = 640;
const historyCoverDataUrls = new Map<string, string>();
const imageHistoryThumbnailDataUrls = new Map<string, string>();
const IMAGE_HISTORY_THUMBNAIL_MAX_EDGE = 640;
let promptEnhanceMode: PromptEnhanceMode = "sulphur-native";
let h3PromptPreset: H3PromptPreset = "official-storyboard";
let settingsH3PromptPreset: H3PromptPreset = "official-storyboard";
let settingsImagePromptPreset: ImagePromptPreset = "faithful";
const imagePromptPresetLabels: Record<ImagePromptPreset, string> = {
  faithful: "忠实整理",
  "detail-enhance": "细节增强"
};
const imagePromptPresetDescriptions: Record<ImagePromptPreset, string> = {
  faithful: "只澄清用户明确的编辑意图，不新增未要求的主体、材质、光照、构图或故事。",
  "detail-enhance": "在不改变编辑范围的前提下，补充区域、材质、光照、透视和边缘融合等执行细节。"
};
const h3PromptPresetLabels: Record<H3PromptPreset, string> = {
  "official-storyboard": "通用影视时间线",
  "reference-faithful": "参考画面保真",
  "continuous-motion": "单镜头连续动作",
  "dialogue-sound": "对白与原生声音",
  "beat-storyboard": "节拍分镜与镜头节奏",
  "product-brand": "产品与品牌演示",
  "music-video": "音乐视频与歌词",
  "narrative-animation": "风格化动画叙事",
  "multi-reference": "多参考关系编排"
};
const h3PromptPresetOrder: H3PromptPreset[] = [
  "official-storyboard",
  "reference-faithful",
  "continuous-motion",
  "dialogue-sound",
  "beat-storyboard",
  "product-brand",
  "music-video",
  "narrative-animation",
  "multi-reference"
];
const h3PromptPresetDescriptions: Record<H3PromptPreset, string> = {
  "official-storyboard": "按 H3 官方字段组织完整的视听时间线，适合一般视频请求。",
  "reference-faithful": "减少无依据的画面补写，优先保护参考图中的身份、构图和连续性。",
  "continuous-motion": "把动作写成一个无剪辑的连续镜头，强调因果、身体力学和收束状态。",
  "dialogue-sound": "优先处理对白、演唱、环境声、动作声和原生音乐的同步关系。",
  "beat-storyboard": "按时长拆解镜头节拍、动作节点、转场、镜头运动和声音落点。",
  "product-brand": "保护产品、界面、品牌素材和文案的真实性，强调功能动作与清晰收尾。",
  "music-video": "把歌曲、歌词、节拍、表演和空间化文字作为同一条时间线设计。",
  "narrative-animation": "强调角色锁定、因果故事、表演节奏、风格化运动和镜头连续性。",
  "multi-reference": "为 R2V 图片、视频和音频分配明确关系，并保持标签和复用关系稳定。"
};

function h3PromptPresetOptions(selected: H3PromptPreset, includeMultiReference: boolean): string {
  return h3PromptPresetOrder
    .filter((preset) => includeMultiReference || preset !== "multi-reference")
    .map((preset) => `<option value="${preset}" ${selected === preset ? "selected" : ""}>${h3PromptPresetLabels[preset]}</option>`)
    .join("");
}
let promptEnhancing = false;
let promptStarting = false;
let promptReleasing = false;
let promptRuntimeLoaded = false;
function createDefaultH3PromptBuilder(): H3PromptBuilderInput {
  return {
    style: "",
    subject: "",
    action: "",
    continuity: "",
    physicalLock: "",
    cameraMotion: "static",
    cameraAmplitude: "small",
    cameraSpeed: "slow",
    framing: "",
    diegeticSound: "",
    finalState: "",
    soundscape: "",
    music: "N/A",
    dialogueSpeaker: "S1",
    dialogueLanguage: "Chinese",
    dialogueDelivery: "a clear, natural voice",
    dialogueText: "",
    onScreenText: ""
  };
}

let h3PromptBuilder = createDefaultH3PromptBuilder();

const lucideIconSet = {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Ban,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Columns3,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Film,
  FolderOpen,
  Gauge,
  Grid2X2,
  Image,
  Images,
  Info,
  LayoutGrid,
  ListOrdered,
  Maximize2,
  MemoryStick,
  Monitor,
  MoveDown,
  MoveUp,
  PackageOpen,
  Pause,
  Pencil,
  Play,
  Power,
  Plus,
  Puzzle,
  RefreshCw,
  RotateCcw,
  Save,
  ScanSearch,
  Server,
  Settings: SettingsIcon,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  SlidersHorizontal,
  Trash2,
  Upload,
  Video,
  WandSparkles,
  Workflow,
  X,
  Zap
};

function icon(name: string, className = ""): string {
  return `<i data-lucide="${name}" class="ui-icon ${className}" aria-hidden="true"></i>`;
}

function fieldLabelWithTip(label: string, tip: string): string {
  return `<span class="field-label-row"><span>${escapeHtml(label)}</span><span class="field-info" tabindex="0" aria-label="${escapeHtml(tip)}">${icon("info")}<span class="field-info-tip" role="tooltip">${escapeHtml(tip)}</span></span></span>`;
}

function videoLoraPurposeLabel(purpose: VideoLoraPurpose): string {
  return ({
    performance: "性能",
    style: "风格",
    content: "内容",
    character: "人物",
    motion: "动作",
    quality: "质量"
  } satisfies Record<VideoLoraPurpose, string>)[purpose];
}

function videoLoraInfoButton(lora: Draft["videoLoras"][number]): string {
  const definition = BUILTIN_VIDEO_LORAS.find((item) => item.id === lora.id);
  const guide = definition?.guide;
  if (!guide) {
    const fallback = "此 LoRA 暂无内置教程。建议从 0.6–1.0 小幅调整，并与不使用 LoRA 的结果对照。";
    return `<span class="field-info video-lora-info" tabindex="0" aria-label="${escapeHtml(fallback)}">${icon("info")}<span class="field-info-tip video-lora-info-tip" role="tooltip">${escapeHtml(fallback)}</span></span>`;
  }
  const constraintNotes = [
    ...definition.rules.settingConflicts.map((conflict) => conflict.message),
    ...definition.rules.combinations.map((combination) => combination.message)
  ];
  const ariaLabel = [guide.summary, guide.recommendedStrength, guide.effects, guide.stacking, guide.compatibility, ...constraintNotes].join(" ");
  return `<span class="field-info video-lora-info" tabindex="0" aria-label="${escapeHtml(ariaLabel)}">
    ${icon("info")}
    <span class="field-info-tip video-lora-info-tip" role="tooltip">
      <strong>${escapeHtml(lora.name)}</strong>
      <span><b>作用</b>${escapeHtml(guide.summary)}</span>
      <span><b>推荐强度</b>${escapeHtml(guide.recommendedStrength)}</span>
      <span><b>可能影响</b>${escapeHtml(guide.effects)}</span>
      <span><b>叠加建议</b>${escapeHtml(guide.stacking)}</span>
      <span><b>兼容范围</b>${escapeHtml(guide.compatibility)}</span>
      ${constraintNotes.length ? `<span><b>冲突限制</b>${escapeHtml(constraintNotes.join(" "))}</span>` : ""}
      <small>来源：${escapeHtml(guide.source)}</small>
    </span>
  </span>`;
}

function detectedVideoLoraFilename(profile: ModelScanProfile | undefined): string {
  const match = profile?.components.flatMap((component) => component.matches)[0];
  if (!match) return "";
  const normalized = match.replaceAll("\\", "/");
  const markerIndex = normalized.toLowerCase().lastIndexOf("loras/");
  return markerIndex >= 0 ? normalized.slice(markerIndex + "loras/".length) : "";
}

function profileProvidesVideoLora(
  profile: ModelScanProfile | undefined,
  filename: string
): boolean {
  if (!profile?.available) return false;
  const expected = `loras/${filename}`.replaceAll("\\", "/").toLowerCase();
  return profile.components.some((component) =>
    component.matches.some((match) => {
      const normalized = match.replaceAll("\\", "/").toLowerCase();
      return normalized === expected || normalized.endsWith(`/${expected}`);
    })
  );
}

function renderIcons(root: Element): void {
  createIcons({
    icons: lucideIconSet,
    root,
    attrs: {
      "stroke-width": "1.8"
    }
  });
}

window.addEventListener("dragover", (event) => {
  if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
});
window.addEventListener("drop", (event) => {
  if (event.dataTransfer?.files.length) event.preventDefault();
});
window.addEventListener("paste", (event) => {
  void handleClipboardPaste(event);
});

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function activePrompt(draft = state.draft): PromptVersion {
  return (
    draft.promptVersions[draft.activePromptVersion] ??
    draft.promptVersions.at(-1) ?? {
      id: crypto.randomUUID(),
      label: "新建",
      text: "",
      createdAt: new Date().toISOString()
    }
  );
}

function modelName(id: string): string {
  return (
    {
      minimax_h3_fl2va: "MiniMax H3 FL2VA",
      minimax_h3_fl2va_int4: "MiniMax H3 FL2VA · INT4 低显存",
      minimax_h3_fl2va_q3_gguf: "MiniMax H3 FL2VA · Q3 GGUF · 低显存实验",
      minimax_h3_fl2va_turbo: "MiniMax H3 LightX2V Turbo · 首尾帧",
      minimax_h3_ref2va: "MiniMax H3 R2V · 多参考",
      minimax_h3_ref2va_int4: "MiniMax H3 R2V · 多参考 INT4",
      sulphur2: "Sulphur 2 GGUF",
      wan22_5b: "Wan 2.2 I2V 5B",
      hunyuan15: "HunyuanVideo 1.5",
      hunyuan15_sr: "HunyuanVideo 1.5 1080p",
      wan22_14b_nsfw: "Wan 2.2 I2V 14B + NSFW",
      wan22_remix: "Wan 2.2 Remix v3",
      wan22_smoothmix: "Wan 2.2 SmoothMix I2V",
      wan22_dasiwa: "DaSiWa SynthSeduction v9",
      "qwen-image-edit-2511": "Qwen-Image-Edit-2511",
      "flux2-klein-4b": "FLUX.2 Klein 4B"
      ,seedvr2: "SeedVR2"
      ,flashvsr: "FlashVSR"
      ,realesrgan: "Real-ESRGAN x4plus"
    }[id] ?? id
  );
}

const modelHardwareRecommendations: Record<string, string> = {
  "qwen/qwen3.5-4b": "RTX 3060 12GB 以上 · 系统 RAM 16GB 以上",
  "qwen/qwen3.5-2b": "RTX 2060 6GB 以上 · 系统 RAM 16GB 以上",
  "qwen-image-edit-2511": "RTX 3090/4090 24GB 以上 · CPU/offload",
  "flux2-klein-4b": "RTX 4080/4090 16GB 以上",
  minimax_h3_fl2va: "RTX 3090/4090 24GB 以上 · 系统 RAM 64GB 推荐",
  minimax_h3_fl2va_int4: "RTX 4070/4080 16GB 推荐 · 12GB 仅实验",
  minimax_h3_fl2va_q3_gguf: "RTX 3080 10GB 实验 · 系统 RAM 32GB 起步",
  minimax_h3_fl2va_turbo: "RTX 3090/4090 24GB 以上 · Turbo 不降低基础显存",
  minimax_h3_ref2va: "RTX 3090/4090 24GB 以上 · 多参考需更多 RAM",
  minimax_h3_ref2va_int4: "RTX 4070/4080 16GB 推荐 · 12GB 仅实验",
  sulphur2: "RTX 3060 12GB 以上 · 系统 RAM 32GB 以上",
  wan22_5b: "RTX 3080 12GB/4070 12GB 以上 · 16GB 推荐",
  hunyuan15: "RTX 3090/4090 24GB 以上",
  wan22_14b_nsfw: "RTX 3090/4090 24GB 以上 · 保守卸载",
  wan22_remix: "RTX 3090/4090 24GB 以上",
  wan22_smoothmix: "RTX 3090/4090 24GB 以上",
  wan22_dasiwa: "RTX 3090/4090 24GB 以上",
  seedvr2: "RTX 3090/4090 24GB 以上",
  flashvsr: "RTX 4080/4090 16GB 以上",
  hunyuan15_sr: "RTX 4090 24GB 以上 · 两阶段模型卸载",
  realesrgan: "RTX 2060/3060 6GB 以上",
  rife: "RTX 2060/3060 6GB 以上",
  "community/gemma-4-e4b-unconcerned-q5": "RTX 3060 12GB 以上 · 系统 RAM 16GB 以上",
  "community/gemma-4-12b-uncensored-q4": "RTX 3060/4070 12GB 以上 · 系统 RAM 24GB 以上",
  "community/gemma-4-26b-a4b-uncensored-q4": "RTX 3090/4090 24GB 以上",
  "google/gemma-4-e4b-q3": "RTX 3060 8GB/12GB 以上 · 系统 RAM 16GB 以上",
  "google/gemma-4-12b-q4": "RTX 3060/4070 12GB 以上 · 系统 RAM 24GB 以上",
  "google/gemma-4-12b-q5": "RTX 4080/4090 16GB 以上 · 系统 RAM 24GB 以上",
  "google/gemma-4-26b-a4b-q4": "RTX 3090/4090 24GB 以上",
  "google/gemma-4-31b-q4": "RTX 4090 32GB 以上或专业卡"
};

function modelHardwareRecommendation(profile: ModelScanProfile): string {
  return modelHardwareRecommendations[profile.id] ?? (
    profile.category === "video"
      ? "RTX 3080 12GB 以上 · 系统 RAM 32GB 以上"
      : profile.category === "image"
        ? "RTX 3060 12GB 以上"
        : profile.category === "prompt"
          ? "RTX 3060 12GB 以上 · 系统 RAM 16GB 以上"
          : "RTX 2060 6GB 以上"
  );
}

const h3ReferenceRoleLabels: Record<H3ReferenceRole, string> = {
  subject: "人物 / 主体",
  scene: "场景 / 环境",
  style: "风格 / 服装",
  motion: "动作 / 姿态",
  camera: "镜头 / 构图",
  voice: "声音关联",
  keyframe: "关键画面",
  other: "其它参考"
};

const h3CameraMotionLabels: Array<[H3CameraMotion, string]> = [
  ["static", "固定镜头"],
  ["push-in", "Push in · 推近"],
  ["pull-out", "Pull out · 后退"],
  ["zoom-in", "Zoom in · 变焦推近"],
  ["zoom-out", "Zoom out · 变焦拉远"],
  ["pan-left", "Pan left · 向左摇摄"],
  ["pan-right", "Pan right · 向右摇摄"],
  ["truck-left", "Truck left · 向左平移"],
  ["truck-right", "Truck right · 向右平移"],
  ["tilt-up", "Tilt up · 向上俯仰"],
  ["tilt-down", "Tilt down · 向下俯仰"],
  ["pedestal-up", "Pedestal up · 升降向上"],
  ["pedestal-down", "Pedestal down · 升降向下"],
  ["tracking", "Tracking · 跟拍"],
  ["arc", "Arc shot · 弧线环绕"],
  ["pov", "POV · 主观视角"],
  ["roll-clockwise", "Roll clockwise · 顺时针旋转"],
  ["roll-counterclockwise", "Roll counterclockwise · 逆时针旋转"],
  ["shake-slight", "Slight handheld · 轻微手持"]
];

function h3BuilderValue(field: keyof H3PromptBuilderInput): string {
  return escapeHtml(h3PromptBuilder[field]);
}

function h3BuilderTextField(
  field: keyof H3PromptBuilderInput,
  label: string,
  placeholder: string,
  rows = 2
): string {
  const value = h3BuilderValue(field);
  return rows > 0
    ? `<label>${label}<textarea rows="${rows}" data-h3-builder="${field}" placeholder="${escapeHtml(placeholder)}">${value}</textarea></label>`
    : `<label>${label}<input data-h3-builder="${field}" value="${value}" placeholder="${escapeHtml(placeholder)}"></label>`;
}

function h3BuilderSelect(
  field: keyof H3PromptBuilderInput,
  label: string,
  options: Array<[string, string]>
): string {
  const selected = String(h3PromptBuilder[field]);
  return `<label>${label}<select data-h3-builder="${field}">${options
    .map(([value, optionLabel]) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`)
    .join("")}</select></label>`;
}

function h3PromptBuilderMarkup(): string {
  return `
    <div class="h3-prompt-builder">
      <div class="h3-builder-heading"><div><strong>结构化构建器</strong><span>把提示词拆成镜头、动作、连续性和声音决策；生成结果会新建一个版本。</span></div><span class="model-badge">H3 Guide</span></div>
      <div class="h3-builder-grid">
        ${h3BuilderTextField("style", "视觉风格", "Live-action, cinematic, 2D animated…", 0)}
        ${h3BuilderTextField("subject", "主体与初始构图", "谁在什么环境里，以什么姿态和构图开始？")}
        ${h3BuilderTextField("action", "动作时间线", "先写一个小的自然起因，再写主要动作和可见反应。")}
        ${h3BuilderTextField("continuity", "参考图与连续性锁", "身份、服装、位置、灯光、背景中哪些必须保持？")}
        ${h3BuilderTextField("physicalLock", "身体 / 视线锁定", "例如：脚、髋、肩、头和视线保持朝向不变。")}
        ${h3BuilderSelect("cameraMotion", "镜头运动", h3CameraMotionLabels)}
        ${h3BuilderSelect("cameraAmplitude", "运动幅度", [["small", "Small amplitude · 小幅度"], ["large", "Large amplitude · 大幅度"]])}
        ${h3BuilderSelect("cameraSpeed", "运动速度", [["slow", "Slow speed · 慢速"], ["fast", "Fast speed · 快速"]])}
        ${h3BuilderTextField("framing", "景别变化", "例如：近景 → 半身 → 全身 → 环境广角；写清由什么运动造成变化。")}
        ${h3BuilderTextField("diegeticSound", "画面同步声音", "动作发生时，哪些可见反应和现场声音同步出现？")}
        ${h3BuilderTextField("finalState", "最终状态", "动作结束时主体、镜头、环境和画面停在哪里？")}
      </div>
      <details class="h3-builder-optional">
        <summary><strong>声音、对白与屏幕文字</strong><span>可选高级字段</span>${icon("chevron-down")}</summary>
        <div class="h3-builder-grid optional">
          ${h3BuilderTextField("soundscape", "整体环境声", "风、脚步、房间底噪、回声；不要重复对白。")}
          ${h3BuilderTextField("music", "非叙事音乐", "只写观众听到的背景音乐；没有就保留 N/A。")}
          ${h3BuilderTextField("dialogueSpeaker", "说话人 ID", "S1", 0)}
          ${h3BuilderTextField("dialogueLanguage", "对白语言", "Chinese / English", 0)}
          ${h3BuilderTextField("dialogueDelivery", "声音与表达", "a clear, restrained Mandarin voice", 0)}
          ${h3BuilderTextField("dialogueText", "准确对白", "只填写角色实际说出的原文；留空表示无对白。")}
          ${h3BuilderTextField("onScreenText", "屏幕文字", "可见招牌、字幕或标签；会原样放入英文双引号。", 0)}
        </div>
      </details>
      <div class="h3-builder-actions"><button class="ghost button-with-icon" id="h3-builder-reset" type="button">${icon("refresh-cw")}重置构建器</button><button class="primary button-with-icon" id="h3-builder-generate" type="button">${icon("wand-sparkles")}生成结构化版本</button></div>
    </div>`;
}

function newH3ReferenceSlot(
  mediaPath = "",
  mediaType: H3ReferenceMediaType = "image"
): H3ReferenceSlot {
  return {
    id: crypto.randomUUID(),
    mediaType,
    mediaPath,
    role: "subject",
    note: ""
  };
}

function h3ReferenceSlotRoleOptions(role: H3ReferenceRole): string {
  return (Object.entries(h3ReferenceRoleLabels) as Array<[H3ReferenceRole, string]>)
    .map(([value, label]) => `<option value="${value}" ${value === role ? "selected" : ""}>${label}</option>`)
    .join("");
}

function h3ReferenceTag(slots: H3ReferenceSlot[], slotId: string): string {
  const index = slots.findIndex((slot) => slot.id === slotId);
  if (index < 0) return "<Picture 1>";
  const slot = slots[index]!;
  const ordinal = slots
    .slice(0, index + 1)
    .filter((item) => item.mediaType === slot.mediaType)
    .length;
  return `<${slot.mediaType === "video" ? "Video" : "Picture"} ${ordinal}>`;
}

function h3ReferenceSlotsMarkup(draft: Draft): string {
  const slots = draft.h3ReferenceSlots;
  const referenceOrdinals = new Map<string, number>();
  const typeCounts: Record<H3ReferenceMediaType, number> = { image: 0, video: 0 };
  slots.forEach((slot) => {
    typeCounts[slot.mediaType] += 1;
    referenceOrdinals.set(slot.id, typeCounts[slot.mediaType]);
  });
  return `
    ${slots.length ? `<div class="h3-reference-grid">${slots.map((slot, index) => `
      <article class="h3-reference-slot" data-h3-slot="${escapeHtml(slot.id)}">
        <div class="h3-reference-slot-head">
          <div><strong>Slot ${index + 1}</strong><span>&lt;${slot.mediaType === "video" ? "Video" : "Picture"} ${referenceOrdinals.get(slot.id)}&gt; · ${slot.mediaType === "video" ? "参考视频" : "参考图片"}</span></div>
          <div class="h3-reference-slot-actions"><select class="h3-slot-type" data-h3-slot-type="${escapeHtml(slot.id)}" aria-label="Slot ${index + 1} 媒体类型"><option value="image" ${slot.mediaType === "image" ? "selected" : ""}>图片</option><option value="video" ${slot.mediaType === "video" ? "selected" : ""}>视频</option></select><button class="secondary" data-insert-h3-slot="${escapeHtml(slot.id)}" type="button">插入标签</button><button class="icon-button" data-remove-h3-slot="${escapeHtml(slot.id)}" aria-label="移除 Slot ${index + 1}" title="移除 Slot">${icon("x")}</button></div>
        </div>
        ${slot.mediaType === "video" && slot.mediaPath
          ? `<div class="drop-zone h3-reference-drop has-image h3-video-reference" data-drop-h3-slot="${escapeHtml(slot.id)}" data-drop-label="松开以替换参考视频">
              <video controls playsinline preload="metadata" src="studio-media://draft/reference-video?source=${encodeURIComponent(slot.mediaPath)}" aria-label="参考视频 ${referenceOrdinals.get(slot.id)}"></video>
              <button class="image-remove button-with-icon" data-clear-h3-slot="${escapeHtml(slot.id)}" aria-label="删除参考视频 ${referenceOrdinals.get(slot.id)}" title="删除参考视频">${icon("x")}<span>删除</span></button>
            </div>`
          : slot.mediaPath
            ? `<div class="h3-reference-media-shell">
                <button class="drop-zone h3-reference-drop has-image" id="pick-h3-slot-${escapeHtml(slot.id)}" data-pick-h3-slot="${escapeHtml(slot.id)}" data-h3-slot-media-type="${slot.mediaType}" data-drop-h3-slot="${escapeHtml(slot.id)}" data-drop-label="松开以替换参考图">
                  <img id="h3-slot-preview-${escapeHtml(slot.id)}" alt="参考图 ${index + 1}预览"><span class="image-label">点击或拖入替换图片</span>
                </button>
                <button class="image-remove button-with-icon" data-clear-h3-slot="${escapeHtml(slot.id)}" aria-label="删除参考图片 ${referenceOrdinals.get(slot.id)}" title="删除参考图片">${icon("x")}<span>删除</span></button>
              </div>`
            : `<button class="drop-zone h3-reference-drop" id="pick-h3-slot-${escapeHtml(slot.id)}" data-pick-h3-slot="${escapeHtml(slot.id)}" data-h3-slot-media-type="${slot.mediaType}" data-drop-h3-slot="${escapeHtml(slot.id)}" data-drop-label="松开以添加${slot.mediaType === "video" ? "参考视频" : "参考图"}">
                <span class="drop-icon">${icon(slot.mediaType === "video" ? "video" : "image")}</span><strong>添加${slot.mediaType === "video" ? "参考视频" : "参考图片"}</strong><span>${slot.mediaType === "video" ? "MP4、MOV、WEBM、MKV" : "PNG、JPG、WEBP、BMP"}</span>
              </button>`}
        <label>参考作用<select data-h3-slot-role="${escapeHtml(slot.id)}">${h3ReferenceSlotRoleOptions(slot.role)}</select></label>
        <label>给提示词的备注<input data-h3-slot-note="${escapeHtml(slot.id)}" value="${escapeHtml(slot.note)}" placeholder="例如：人物外貌、场景布局或动作参考"></label>
      </article>`).join("")}</div>` : `
      <div class="h3-slot-empty"><span class="drop-icon">${icon("images")}</span><strong>先添加一张参考媒体</strong><span>最多 9 张图片和 3 段视频；视频会同时使用画面与自身音轨。</span><button class="secondary button-with-icon" id="add-h3-reference-slot-empty" type="button">${icon("plus")}添加第一个 Slot</button></div>`}`;
}

function promptSnippetOptions(): string {
  return [...new Set(promptSnippets.map((snippet) => snippet.group))]
    .map((group) => `<optgroup label="${escapeHtml(group)}">${promptSnippets
      .filter((snippet) => snippet.group === group)
      .map((snippet) => `<option value="${escapeHtml(snippet.id)}">${escapeHtml(snippet.label)}</option>`)
      .join("")}</optgroup>`)
    .join("");
}

function h3PromptModeForDraft(draft: Draft): H3PromptMode {
  return inferH3PromptMode(
    Boolean(draft.startImagePath),
    Boolean(draft.endImagePath),
    isMiniMaxH3R2vModel(draft.modelId)
  );
}

function updatePromptWordCounter(
  promptText: string,
  mode?: H3PromptMode,
  durationSeconds = state.draft.duration
): void {
  const counter = document.querySelector<HTMLElement>("#prompt-word-counter");
  if (!counter) return;
  const count = countPromptWords(promptText);
  if (!mode) {
    counter.className = "prompt-word-counter";
    counter.textContent = `当前 ${count} 词`;
    return;
  }
  const limit = recommendedH3PromptWords(mode, durationSeconds);
  const overLimit = count > limit;
  counter.className = `prompt-word-counter ${overLimit ? "warning" : ""}`;
  counter.textContent = overLimit
    ? `当前 ${count} 词 · 已超过建议 ${limit} 词，仍可继续输入`
    : `当前 ${count} 词 · 建议不超过 ${limit} 词`;
}

function updateImagePromptWordCounter(promptText: string): void {
  const counter = document.querySelector<HTMLElement>("#image-prompt-word-counter");
  if (!counter) return;
  counter.className = "prompt-word-counter";
  counter.textContent = `当前 ${countPromptWords(promptText)} 词`;
}

function resizePromptInput(promptInput: HTMLTextAreaElement): void {
  promptInput.style.height = "auto";
  const styles = window.getComputedStyle(promptInput);
  const minHeight = Number.parseFloat(styles.minHeight) || 0;
  const maxHeight = Number.parseFloat(styles.maxHeight);
  const contentHeight = promptInput.scrollHeight;
  const height = Number.isFinite(maxHeight)
    ? Math.min(contentHeight, maxHeight)
    : contentHeight;
  promptInput.style.height = `${Math.max(minHeight, height)}px`;
  promptInput.style.overflowY = Number.isFinite(maxHeight) && contentHeight > maxHeight
    ? "auto"
    : "hidden";
}

function h3PromptCheckMarkup(
  promptText: string,
  hasEndImage: boolean,
  mode?: H3PromptMode,
  hasVideoReference = false
): string {
  const result = checkH3Prompt(promptText, {
    hasEndImage,
    mode,
    hasImageReference: state.draft.h3ReferenceSlots.some((slot) => slot.mediaType === "image"),
    hasVideoReference,
    durationSeconds: state.draft.duration
  });
  return `<div id="h3-prompt-check" class="h3-prompt-check ${result.valid ? "valid" : "warning"}" aria-live="polite">
    <div class="h3-prompt-check-heading"><strong>H3 提示词检查</strong><span>${escapeHtml(result.summary)}</span></div>
    ${result.items.length ? `<ul>${result.items.map((item) => `<li>${escapeHtml(item.message)}</li>`).join("")}</ul>` : ""}
  </div>`;
}

function updateH3PromptCheck(
  promptText: string,
  hasEndImage: boolean,
  mode?: H3PromptMode,
  hasVideoReference = false
): void {
  const element = document.querySelector<HTMLElement>("#h3-prompt-check");
  if (!element) return;
  const result = checkH3Prompt(promptText, {
    hasEndImage,
    mode,
    hasImageReference: state.draft.h3ReferenceSlots.some((slot) => slot.mediaType === "image"),
    hasVideoReference,
    durationSeconds: state.draft.duration
  });
  element.className = `h3-prompt-check ${result.valid ? "valid" : "warning"}`;
  element.innerHTML = `<div class="h3-prompt-check-heading"><strong>H3 提示词检查</strong><span>${escapeHtml(result.summary)}</span></div>
    ${result.items.length ? `<ul>${result.items.map((item) => `<li>${escapeHtml(item.message)}</li>`).join("")}</ul>` : ""}`;
}

function interpolationMultiplier(
  value: Draft["frameInterpolation"] | undefined
): 1 | 2 | 4 {
  if (value === "rife2x") return 2;
  if (value === "rife4x") return 4;
  return 1;
}

function frameRateSummary(
  fps: number,
  interpolation: Draft["frameInterpolation"] | undefined
): string {
  const multiplier = interpolationMultiplier(interpolation);
  return multiplier === 1
    ? `${fps} FPS`
    : `${fps / multiplier} → ${fps} FPS · RIFE ${multiplier}×`;
}

function interpolationEstimate(draft: Draft): {
  multiplier: 1 | 2 | 4;
  generatedFrames: number;
  outputFrames: number;
} {
  return {
    multiplier: frameInterpolationMultiplier(draft),
    generatedFrames: generationFrameCountForTask(draft),
    outputFrames: outputFrameCountForTask(draft)
  };
}

function extensionSafetyForDraft(draft: Draft, settings: Settings) {
  return extensionSafetyForTask({
    ...draft,
    resolution: isMiniMaxH3Fl2vaModel(draft.modelId) || isMiniMaxH3R2vModel(draft.modelId)
      ? draft.resolution
      : settings.ltxExtensionResolution,
    maxGeneratedFrames: isMiniMaxH3Fl2vaModel(draft.modelId) || isMiniMaxH3R2vModel(draft.modelId)
      ? 362
      : settings.ltxExtensionFrames,
    overlapFrames: settings.ltxExtensionOverlapFrames,
    unloadBetweenStages: settings.ltxExtensionUnloadBetweenStages
  });
}

function insertPromptSnippet(
  promptInput: HTMLTextAreaElement,
  snippet: string
): void {
  if (!snippet) return;
  const start = promptInput.selectionStart;
  const end = promptInput.selectionEnd;
  const before = promptInput.value.slice(0, start);
  const after = promptInput.value.slice(end);
  const prefix = before && !/\s$/u.test(before) ? "\n" : "";
  const suffix = after && !/^\s/u.test(after) ? "\n" : "";
  promptInput.focus();
  promptInput.setRangeText(
    `${prefix}${snippet}${suffix}`,
    start,
    end,
    "end"
  );
  promptInput.dispatchEvent(new Event("input", { bubbles: true }));
}

function versionVideoIndex(version: AssetVersion): number {
  const videoPattern = /\.(mp4|webm|mov|m4v|mkv)$/i;
  return version.files.findIndex((file) => videoPattern.test(file.filename));
}

function versionShortEdge(version: AssetVersion): number {
  const width = Number.isFinite(version.width) && version.width > 0 ? version.width : 0;
  const height = Number.isFinite(version.height) && version.height > 0 ? version.height : 0;
  return Math.max(0, Math.round(Math.min(width || height, height || width)));
}

function resolutionLabel(value: number): string {
  const rounded = Math.max(0, Math.round(value));
  return rounded === 2160 ? "4K" : rounded > 0 ? `${rounded}p` : "未知";
}

function historyResolutionLabel(
  asset: AppState["history"][number],
  version: AssetVersion
): string {
  const requestedResolution = version.kind === "original" &&
    [360, 480, 540, 720, 768, 1080, 1440, 2160].includes(asset.resolution)
    ? asset.resolution
    : versionShortEdge(version);
  return resolutionLabel(requestedResolution);
}

function preferredVersion(asset: AppState["history"][number]): AssetVersion {
  return asset.versions.find((version) => version.id === asset.defaultVersionId) ??
    [...asset.versions].sort((left, right) => versionShortEdge(right) - versionShortEdge(left))[0]!;
}

function currentHistoryVersion(asset: AppState["history"][number]): AssetVersion {
  return asset.versions.find((version) => version.id === selectedHistoryVersionId) ??
    preferredVersion(asset);
}

function historyMediaUrl(
  asset: AppState["history"][number],
  version = preferredVersion(asset)
): string {
  const index = versionVideoIndex(version);
  return index < 0
    ? ""
    : `studio-media://history/${encodeURIComponent(asset.id)}/${encodeURIComponent(version.id)}/${index}`;
}

function imageProjectsByNewest(): ImageHistoryProject[] {
  return [...state.imageHistory].sort((left, right) => {
    const leftTime = Date.parse(left.updatedAt || left.createdAt);
    const rightTime = Date.parse(right.updatedAt || right.createdAt);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return 0;
  });
}

function preferredImageVersion(project: ImageHistoryProject): ImageAssetVersion {
  return imageProjectCoverVersion(project) ??
    [...project.versions].sort((left, right) => right.versionNumber - left.versionNumber)[0]!;
}

function currentImageHistoryVersion(project: ImageHistoryProject): ImageAssetVersion {
  return project.versions.find((version) => version.id === selectedHistoryVersionId) ??
    preferredImageVersion(project);
}

function imageHistoryMediaUrl(
  project: ImageHistoryProject,
  version = preferredImageVersion(project)
): string {
  return version.file.filename
    ? `studio-media://history/${encodeURIComponent(project.id)}/${encodeURIComponent(version.id)}/0`
    : "";
}

function imageHistoryThumbnailCacheKey(
  project: ImageHistoryProject,
  version: ImageAssetVersion
): string {
  return `image-history:${createHistoryCoverCacheKey({
    assetId: project.id,
    versionId: version.id,
    createdAt: version.createdAt,
    filename: version.file.filename,
    absolutePath: version.file.absolutePath ?? ""
  })}`;
}

async function loadImageHistoryThumbnail(image: HTMLImageElement): Promise<void> {
  const key = image.dataset.imageHistoryCacheKey ?? "";
  const sourcePath = image.dataset.imageHistorySource ?? "";
  if (!key || !sourcePath || !image.isConnected) return;
  try {
    const cached = imageHistoryThumbnailDataUrls.get(key) ??
      await window.studio.readHistoryCover(key, sourcePath);
    if (cached) {
      imageHistoryThumbnailDataUrls.set(key, cached);
      if (image.isConnected) image.src = cached;
      return;
    }
    const sourceData = await window.studio.readImage(sourcePath);
    if (!sourceData || !image.isConnected) return;
    const source = document.createElement("img");
    source.src = sourceData;
    await source.decode();
    if (!source.naturalWidth || !source.naturalHeight) return;
    const scale = Math.min(1, IMAGE_HISTORY_THUMBNAIL_MAX_EDGE / Math.max(source.naturalWidth, source.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", .88));
    if (!blob || blob.size > 2 * 1024 * 1024 || !image.isConnected) return;
    const saved = await window.studio.saveHistoryCover(key, sourcePath, await blob.arrayBuffer());
    if (!saved || !image.isConnected) return;
    const savedUrl = await window.studio.readHistoryCover(key, sourcePath);
    if (savedUrl) {
      imageHistoryThumbnailDataUrls.set(key, savedUrl);
      if (image.isConnected) image.src = savedUrl;
    }
  } catch {
  }
}

function historyHeading(description: string): string {
  const activeCount = historyKind === "video" ? state.history.length : state.imageHistory.length;
  return `
    <section class="history-heading">
      <div class="history-heading-title"><div class="heading-line"><h1>历史作品</h1><span class="badge">${activeCount} 个${historyKind === "video" ? "视频" : "图片项目"}</span></div><p>${escapeHtml(description)}</p></div>
      <div class="history-kind-tabs" role="tablist" aria-label="作品类型">
        <button class="${historyKind === "video" ? "active" : ""}" role="tab" aria-selected="${historyKind === "video"}" data-history-kind="video">${icon("film")}视频</button>
        <button class="${historyKind === "image" ? "active" : ""}" role="tab" aria-selected="${historyKind === "image"}" data-history-kind="image">${icon("image")}图片</button>
      </div>
      <div class="history-view-tools">
        <div class="button-row"><button class="${historyLayout === "masonry" ? "secondary" : "ghost"} button-with-icon" data-history-layout="masonry">${icon("columns-3")}瀑布流</button><button class="${historyLayout === "album" ? "secondary" : "ghost"} button-with-icon" data-history-layout="album">${icon("layout-grid")}相册</button></div>
      </div>
    </section>`;
}

function historyCoverCacheKey(
  asset: AppState["history"][number],
  version: AssetVersion
): string {
  const videoIndex = versionVideoIndex(version);
  const file = videoIndex >= 0 ? version.files[videoIndex] : undefined;
  return createHistoryCoverCacheKey({
    assetId: asset.id,
    versionId: version.id,
    createdAt: version.createdAt,
    filename: file?.filename ?? version.outputFilename,
    absolutePath: file?.absolutePath ?? ""
  });
}

function setHistoryCoverImage(media: HTMLElement, dataUrl: string): boolean {
  const image = media.querySelector<HTMLImageElement>("[data-history-cover-image]");
  if (!image || !dataUrl) return false;
  const key = media.dataset.coverKey;
  image.hidden = false;
  const showImage = () => {
    if (image.src !== dataUrl || !media.isConnected) return;
    image.hidden = false;
    media.dataset.historyCoverCached = "true";
    media.classList.remove("media-loading", "media-error");
    media.classList.add("has-history-cover");
  };
  image.onload = showImage;
  image.onerror = () => {
    if (image.src !== dataUrl) return;
    image.removeAttribute("src");
    media.classList.remove("has-history-cover");
    delete media.dataset.historyCoverCached;
    if (key) historyCoverDataUrls.delete(key);
    loadHistoryCardVideo(media);
  };
  image.src = dataUrl;
  if (image.complete && image.naturalWidth > 0) showImage();
  return true;
}

async function loadHistoryCoverFromCache(media: HTMLElement): Promise<boolean> {
  const key = media.dataset.coverKey;
  const sourcePath = media.dataset.coverSource;
  if (!key || !sourcePath) return false;
  try {
    const cached = historyCoverDataUrls.get(key) ?? await window.studio.readHistoryCover(key, sourcePath);
    if (!cached) return false;
    historyCoverDataUrls.set(key, cached);
    return setHistoryCoverImage(media, cached);
  } catch (error) {
    void window.studio.reportRendererError("读取历史封面缓存失败", {
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

function loadHistoryCardVideo(media: HTMLElement): HTMLVideoElement | null {
  const video = media.querySelector<HTMLVideoElement>("video");
  const source = video?.dataset.historySrc;
  if (!video || !source) return video ?? null;
  if (video.dataset.historyLoaded === "true") return video;
  media.classList.remove("media-error");
  media.classList.add("media-loading");
  video.src = source;
  video.dataset.historyLoaded = "true";
  video.load();
  return video;
}

function releaseHistoryCardVideo(media: HTMLElement): void {
  const video = media.querySelector<HTMLVideoElement>("video");
  if (!video || video.dataset.historyLoaded !== "true") return;
  video.pause();
  video.removeAttribute("src");
  delete video.dataset.historyLoaded;
  if (media.dataset.historyCoverCached !== "true") {
    media.classList.remove("media-ready");
    media.classList.add("media-loading");
  }
  video.load();
}

function historyCoverSeed(assetId: string, versionId: string): number {
  let hash = 2166136261;
  for (const character of `${assetId}:${versionId}`) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return hash >>> 0;
}

function historyInitialCoverTime(duration: number, seed: number): number {
  const safeDuration = Math.max(0, Number.isFinite(duration) ? duration : 0);
  if (safeDuration <= 0.5) return safeDuration / 2;
  const positions = [0.2, 0.31, 0.43, 0.56, 0.68, 0.79];
  const position = positions[seed % positions.length] ?? 0.43;
  return Math.min(safeDuration - 0.1, Math.max(0.1, safeDuration * position));
}

function historyCoverCandidates(duration: number, seed: number): number[] {
  const safeDuration = Math.max(0, Number.isFinite(duration) ? duration : 0);
  if (safeDuration <= 0.5) return [safeDuration / 2];
  const positions = [0.18, 0.28, 0.38, 0.49, 0.6, 0.71, 0.82];
  const start = seed % positions.length;
  return Array.from({ length: 4 }, (_, index) => {
    const position = positions[(start + index) % positions.length] ?? 0.49;
    return Math.min(safeDuration - 0.1, Math.max(0.1, safeDuration * position));
  });
}

function historyCoverScore(video: HTMLVideoElement): number | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 18;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  try {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let brightnessTotal = 0;
    let brightnessSquaredTotal = 0;
    let saturationTotal = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index] ?? 0;
      const green = pixels[index + 1] ?? 0;
      const blue = pixels[index + 2] ?? 0;
      const brightness = red * 0.299 + green * 0.587 + blue * 0.114;
      brightnessTotal += brightness;
      brightnessSquaredTotal += brightness * brightness;
      saturationTotal += Math.max(red, green, blue) - Math.min(red, green, blue);
    }
    const pixelCount = pixels.length / 4;
    const brightnessAverage = brightnessTotal / pixelCount;
    const brightnessVariance = Math.max(
      0,
      brightnessSquaredTotal / pixelCount - brightnessAverage * brightnessAverage
    );
    const saturationAverage = saturationTotal / pixelCount;
    const exposurePenalty = Math.abs(brightnessAverage - 128) * 0.35;
    const unusablePenalty = brightnessAverage < 18 || brightnessAverage > 242 ? 120 : 0;
    return Math.sqrt(brightnessVariance) * 1.5 + saturationAverage * 0.35 - exposurePenalty - unusablePenalty;
  } catch {
    return null;
  }
}

function historyCoverBlob(video: HTMLVideoElement): Promise<Blob | null> {
  if (!video.videoWidth || !video.videoHeight) return Promise.resolve(null);
  const scale = Math.min(
    1,
    HISTORY_COVER_MAX_EDGE / Math.max(video.videoWidth, video.videoHeight)
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);
  try {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
  } catch {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      canvas.toBlob(resolve, "image/jpeg", 0.78);
    } catch {
      resolve(null);
    }
  });
}

function historyBlobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}

async function saveHistoryCover(
  media: HTMLElement,
  video: HTMLVideoElement,
  isActive: () => boolean
): Promise<void> {
  const key = media.dataset.coverKey;
  const sourcePath = media.dataset.coverSource;
  if (!key || !sourcePath || !isActive() || media.dataset.historyCoverCached === "true") return;
  const frameScore = historyCoverScore(video);
  // Failed/unfinished seeks can expose the decoder's empty black surface.
  // Never persist that surface as a cover for every subsequent launch.
  if (frameScore == null || frameScore < -80) return;
  const blob = await historyCoverBlob(video);
  if (!blob || !isActive()) return;
  const data = await blob.arrayBuffer();
  try {
    if (!await window.studio.saveHistoryCover(key, sourcePath, data) || !isActive()) return;
    const dataUrl = await historyBlobDataUrl(blob);
    historyCoverDataUrls.set(key, dataUrl);
    setHistoryCoverImage(media, dataUrl);
  } catch (error) {
    void window.studio.reportRendererError("保存历史封面缓存失败", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function waitForHistoryVideoData(
  video: HTMLVideoElement,
  signal: AbortSignal
): Promise<boolean> {
  if (video.readyState >= 2) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
      window.clearTimeout(timeout);
      resolve(ready);
    };
    const onReady = () => finish(true);
    const onError = () => finish(false);
    const onAbort = () => finish(false);
    const timeout = window.setTimeout(() => finish(false), 10_000);
    video.addEventListener("loadeddata", onReady, { once: true });
    video.addEventListener("error", onError, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
    video.load();
  });
}

async function warmHistoryCover(
  media: HTMLElement,
  signal: AbortSignal
): Promise<void> {
  if (signal.aborted || media.dataset.historyCoverCached === "true") return;
  const source = media.querySelector<HTMLVideoElement>("video")?.dataset.historySrc;
  const key = media.dataset.coverKey;
  if (!source || !key) return;
  if (await loadHistoryCoverFromCache(media) || signal.aborted) return;
  if (media.dataset.historyLoaded === "true" || media.matches(":hover") || media.classList.contains("playing")) return;
  const video = document.createElement("video");
  video.muted = true;
  video.crossOrigin = "anonymous";
  video.preload = "auto";
  video.src = source;
  try {
    if (!await waitForHistoryVideoData(video, signal) || signal.aborted) return;
    const duration = Number(media.dataset.previewDuration) || video.duration;
    const fallbackTime = Number(media.dataset.coverTime) || 0;
    const seed = Number(media.dataset.coverSeed) || 0;
    const isActive = () =>
      !signal.aborted &&
      page === "history" &&
      media.isConnected &&
      !media.matches(":hover") &&
      !media.classList.contains("playing");
    const selectedTime = await chooseHistoryCoverTime(
      video,
      fallbackTime,
      duration,
      seed,
      isActive
    );
    if (!isActive()) return;
    media.dataset.coverTime = String(selectedTime);
    await saveHistoryCover(media, video, isActive);
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
}

function scheduleHistoryCoverWarmup(mediaCards: HTMLElement[]): void {
  historyCoverWarmupController?.abort();
  window.clearTimeout(historyCoverWarmupTimer);
  const controller = new AbortController();
  historyCoverWarmupController = controller;
  historyCoverWarmupTimer = window.setTimeout(() => {
    historyCoverWarmupTimer = undefined;
    void (async () => {
      for (const media of mediaCards) {
        if (controller.signal.aborted) return;
        await warmHistoryCover(media, controller.signal);
      }
    })();
  }, 1200);
}

function waitForHistorySeek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener("seeked", finish);
      window.clearTimeout(timeout);
      resolve();
    };
    const timeout = window.setTimeout(finish, 1200);
    video.addEventListener("seeked", finish, { once: true });
    try {
      video.currentTime = time;
    } catch {
      finish();
    }
  });
}

async function chooseHistoryCoverTime(
  video: HTMLVideoElement,
  fallbackTime: number,
  duration: number,
  seed: number,
  isActive: () => boolean
): Promise<number> {
  const candidates = historyCoverCandidates(duration, seed);
  let bestTime = fallbackTime;
  let bestScore: number | null = null;
  for (const candidate of candidates) {
    if (!isActive()) return bestTime;
    await waitForHistorySeek(video, candidate);
    if (!isActive()) return bestTime;
    const score = historyCoverScore(video);
    if (score != null && (bestScore == null || score > bestScore)) {
      bestScore = score;
      bestTime = candidate;
    }
  }
  if (!isActive()) return bestTime;
  await waitForHistorySeek(video, bestTime);
  return bestTime;
}

function historyAspectRatio(ratio: AppState["history"][number]["ratio"]): string {
  return (
    {
      "16:9": "16 / 9",
      "9:16": "9 / 16",
      "1:1": "1 / 1",
      "4:3": "4 / 3",
      source: "16 / 9"
    }[ratio ?? "source"] ?? "16 / 9"
  );
}

function formatVideoDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  return `${String(minutes).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`;
}

function formatElapsedDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  return `${minutes}分${rounded % 60}秒`;
}

function formatUpscaleEstimateRange(minSeconds: number, maxSeconds: number): string {
  const format = (seconds: number): string => {
    const rounded = Math.max(1, Math.round(seconds));
    if (rounded < 60) return `${rounded}秒`;
    if (rounded < 3600) return `${Math.round(rounded / 60)}分`;
    return `${(rounded / 3600).toFixed(1)}小时`;
  };
  const minimum = format(minSeconds);
  const maximum = format(maxSeconds);
  return minimum === maximum ? minimum : `${minimum}-${maximum}`;
}

function formatPerformancePercent(value: number | null | undefined): string {
  return value == null ? "不可用" : `${Math.round(value)}%`;
}

function formatPerformanceBytes(value: number | null | undefined): string {
  return value == null ? "不可用" : formatBytes(value);
}

function performanceStatsMarkup(stats: TaskPerformanceStats | undefined): string {
  if (!stats) {
    return `<p class="muted history-performance-empty">旧记录没有保存运行采样摘要。</p>`;
  }
  const vramIncrease = stats.vramPeakBytes != null && stats.vramBaselineBytes != null
    ? Math.max(0, stats.vramPeakBytes - stats.vramBaselineBytes)
    : null;
  return `
    <div class="task-stat-grid">
      <div class="task-stat"><span>GPU 利用率</span><strong>${formatPerformancePercent(stats.gpuAveragePercent)}</strong><small>峰值 ${formatPerformancePercent(stats.gpuPeakPercent)}</small></div>
      <div class="task-stat"><span>显存峰值</span><strong>${formatPerformanceBytes(stats.vramPeakBytes)}</strong><small>${formatPerformanceBytes(stats.vramTotalBytes)} · 增加 ${formatPerformanceBytes(vramIncrease)}</small></div>
      <div class="task-stat"><span>CPU 占用</span><strong>${formatPerformancePercent(stats.cpuAveragePercent)}</strong><small>峰值 ${formatPerformancePercent(stats.cpuPeakPercent)}</small></div>
      <div class="task-stat"><span>系统内存峰值</span><strong>${formatPerformanceBytes(stats.memoryPeakBytes)}</strong><small>平均 ${formatPerformanceBytes(stats.memoryAverageBytes)} · 总量 ${formatPerformanceBytes(stats.memoryTotalBytes)}</small></div>
      <div class="task-stat"><span>GPU 温度峰值</span><strong>${stats.gpuTemperaturePeak == null ? "不可用" : `${Math.round(stats.gpuTemperaturePeak)}°C`}</strong><small>任务期间最高温度</small></div>
      <div class="task-stat"><span>采样摘要</span><strong>${stats.sampleCount} 次</strong><small>GPU 采样 ${stats.gpuSampleCount} 次 · ${stats.durationSeconds.toFixed(1)} 秒</small></div>
    </div>
    <p class="muted history-performance-note">只保存任务摘要，不保存原始采样曲线；GPU、显存和系统内存包含同机其他进程的影响。</p>`;
}

function formatHistoryTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatFullHistoryTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function historyRenderDuration(version: AssetVersion): string {
  if (!version.startedAt) return "耗时未知";
  const startedAt = Date.parse(version.startedAt);
  const createdAt = Date.parse(version.createdAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(createdAt)) return "耗时未知";
  return formatElapsedDuration(Math.max(0, (createdAt - startedAt) / 1000));
}

function historyRenderSeconds(version: AssetVersion): number | null {
  if (!version.startedAt) return null;
  const startedAt = Date.parse(version.startedAt);
  const createdAt = Date.parse(version.createdAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(createdAt)) return null;
  return Math.max(0, (createdAt - startedAt) / 1000);
}

function queueHistoryEstimateSeconds(task: QueueTask): number | null {
  const candidates = state.history
    .flatMap((asset) => asset.versions)
    .filter((version) => version.modelId === task.modelId)
    .map(historyRenderSeconds)
    .filter((value): value is number => value != null && value > 0);
  if (!candidates.length) return null;
  return candidates.reduce((total, value) => total + value, 0) / candidates.length;
}

function queueTaskRemainingSeconds(task: QueueTask): number | null {
  const historyEstimate = queueHistoryEstimateSeconds(task);
  if (task.status !== "running") return historyEstimate;
  const progress = Math.max(0, Math.min(100, task.progress ?? 0));
  const startedAt = task.startedAt ? Date.parse(task.startedAt) : Number.NaN;
  const elapsed = Number.isFinite(startedAt)
    ? Math.max(0, (Date.now() - startedAt) / 1000)
    : 0;
  if (progress >= 2 && elapsed > 0) {
    return elapsed * (100 - progress) / progress;
  }
  return historyEstimate;
}

function queueRemainingSeconds(tasks = state.queue): number | null {
  const activeTasks = tasks.filter((task) => task.status === "waiting" || task.status === "running");
  const estimates = activeTasks.map(queueTaskRemainingSeconds);
  if (estimates.some((value) => value == null)) return null;
  return estimates.reduce((total: number, value) => total + (value ?? 0), 0);
}

function queueStageElapsedText(task: QueueTask): string {
  if (!task.stageStartedAt) return "阶段计时待开始";
  const startedAt = Date.parse(task.stageStartedAt);
  return Number.isFinite(startedAt)
    ? `当前阶段 ${formatElapsedDuration(Math.max(0, (Date.now() - startedAt) / 1000))}`
    : "阶段计时待开始";
}

function queueEstimateText(seconds: number | null): string {
  return seconds == null ? "等待历史数据" : formatElapsedDuration(seconds);
}

function formatTrimTime(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const remainder = (safe % 60).toFixed(1).padStart(4, "0");
  return `${String(minutes).padStart(2, "0")}:${remainder}`;
}

function orderVideoProfiles<T extends { id: string }>(profiles: T[]): T[] {
  return [...profiles].sort((left, right) =>
    Number(isMiniMaxH3Model(right.id)) - Number(isMiniMaxH3Model(left.id))
  );
}

function createModelOptions(draft: Draft): string {
  const scanned = environmentScan
    ? orderVideoProfiles(
        environmentScan.modelProfiles.filter((profile) => profile.category === "video")
      )
    : undefined;
  const profiles = scanned?.length
    ? scanned
    : [
        { id: "minimax_h3_fl2va", name: "MiniMax H3 Image to Video", available: true, integrated: true },
      { id: "minimax_h3_fl2va_int4", name: "MiniMax H3 Image to Video · INT4 低显存", available: true, integrated: true },
          { id: "minimax_h3_fl2va_q3_gguf", name: "MiniMax H3 Image to Video · Q3 GGUF · 低显存实验", available: true, integrated: true },
        { id: "minimax_h3_ref2va", name: "MiniMax H3 R2V · 多参考", available: true, integrated: true },
        { id: "minimax_h3_ref2va_int4", name: "MiniMax H3 R2V · 多参考 INT4", available: true, integrated: true },
      { id: "sulphur2", name: "Sulphur 2 GGUF", available: true, integrated: true }
      ];
  return profiles
    .map((profile) => {
      const selected = draft.modelId === profile.id;
      const supportsVideoExtension =
        draft.inputMode === "video" && (
          isMiniMaxH3BoundaryExtensionModel(profile.id) || isMiniMaxH3R2vModel(profile.id)
        )
          ? true
          : selected
            ? workflowCapabilities[draft.workflowPath]?.supportsVideoExtension === true
            : bundledWorkflows[bundledWorkflowKey(profile.id, draft.inputMode)]
                ?.supportsVideoExtension === true;
      const unavailable = !profile.available ||
        profile.integrated === false ||
        (draft.inputMode === "video" && !supportsVideoExtension);
      const suffix = !profile.available
        ? " · 缺组件"
        : profile.integrated === false
          ? " · 已扫描，工作流待接入"
        : draft.inputMode === "video" && !supportsVideoExtension
          ? " · 未通过续写检查"
          : "";
      const modeLabel = draft.inputMode === "video"
        ? isMiniMaxH3R2vModel(profile.id)
          ? " · Motion Context 推荐"
          : isMiniMaxH3Fl2vaModel(profile.id)
            ? " · 尾帧兼容"
            : ""
        : "";
      return `<option value="${escapeHtml(profile.id)}" ${selected ? "selected" : ""} ${unavailable ? "disabled" : ""}>${escapeHtml(profile.name)}${modeLabel}${suffix}</option>`;
    })
    .join("");
}

function rememberModalFocus(): void {
  const active = document.activeElement;
  modalReturnFocus = active instanceof HTMLElement && active !== document.body
    ? active
    : null;
  modalInitialFocusPending = true;
  modalControlFocusSelector = "";
}

function rememberModalControlFocus(element: HTMLElement): void {
  if (element.id) {
    modalControlFocusSelector = `#${element.id}`;
    return;
  }
  const upscaleHeight = element.dataset.upscaleHeight;
  if (upscaleHeight) {
    modalControlFocusSelector = `[data-upscale-height="${CSS.escape(upscaleHeight)}"]`;
  }
}

function restoreModalFocus(): void {
  const target = modalReturnFocus;
  modalReturnFocus = null;
  window.requestAnimationFrame(() => {
    if (target?.isConnected && !target.hasAttribute("disabled")) {
      target.focus();
      return;
    }
    document.querySelector<HTMLElement>(`.nav-button[data-page="${page === "history-detail" || page === "image-history-detail" ? "history" : page}"]`)?.focus();
  });
}

function bindModalFocus(
  dialog: HTMLElement,
  close: () => void,
  initialSelector?: string
): void {
  const focusableSelector = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex=\"-1\"])";
  const focusInitial = () => {
    const storedControl = !modalInitialFocusPending && modalControlFocusSelector
      ? dialog.querySelector<HTMLElement>(modalControlFocusSelector)
      : null;
    const initial = storedControl ?? (initialSelector
      ? dialog.querySelector<HTMLElement>(initialSelector)
      : null);
    const first = initial ?? dialog.querySelector<HTMLElement>(focusableSelector);
    (first ?? dialog).focus();
    modalControlFocusSelector = "";
  };
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusables = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)]
      .filter((element) => element.getClientRects().length > 0);
    if (!focusables.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusables[0]!;
    const last = focusables.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  if (modalInitialFocusPending || modalControlFocusSelector) {
    modalInitialFocusPending = false;
    focusInitial();
  }
}

function directoryMigrationDialog(): string {
  const request = pendingDirectoryMigration;
  if (!request) return "";
  const progress = historyMigrationProgress;
  const phaseRanges: Record<HistoryMigrationProgress["phase"], [number, number]> = {
    scanning: [0, 10],
    moving: [10, 65],
    verifying: [65, 82],
    committing: [82, 88],
    cleaning: [88, 100],
    completed: [100, 100]
  };
  const [phaseStart, phaseEnd] = progress
    ? phaseRanges[progress.phase]
    : [0, 0];
  const phaseRatio = progress?.total
    ? Math.max(0, Math.min(1, progress.current / progress.total))
    : progress?.phase === "completed"
      ? 1
      : 0;
  const progressValue = phaseStart + (phaseEnd - phaseStart) * phaseRatio;
  return `
    <div class="dialog-backdrop confirm-backdrop" id="directory-migration-backdrop">
      <section class="confirm-dialog directory-migration-dialog" role="alertdialog" aria-modal="true" aria-labelledby="directory-migration-title" aria-describedby="directory-migration-description" tabindex="-1">
        <div class="confirm-icon" aria-hidden="true">${icon(directoryMigrationBusy ? "refresh-cw" : "folder-open")}</div>
        <div class="confirm-copy">
          <span class="eyebrow">${directoryMigrationBusy ? "正在处理目录" : "输出目录已更改"}</span>
          <h2 id="directory-migration-title">应用视频输出目录更改？</h2>
          <p id="directory-migration-description">${directoryMigrationBusy ? escapeHtml(progress?.message || "正在准备迁移") : "请选择如何处理已有的视频历史记录。"}</p>
          <div class="confirm-warning"><strong>当前目录</strong><code>${escapeHtml(request.oldDirectory || "自动目录")}</code><strong>新目录</strong><code>${escapeHtml(request.newDirectory)}</code></div>
          ${directoryMigrationBusy
            ? `<div class="progress" role="progressbar" aria-label="历史视频迁移进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progressValue)}"><span style="width:${progressValue}%"></span></div><p class="muted">${progress ? `${progress.current} / ${progress.total} 个文件${progress.warningCount ? ` · ${progress.warningCount} 个警告` : ""}` : "准备中"}</p>`
            : `<p class="muted">“应用更改”只影响之后创建的视频；“应用并迁移”会扫描历史中实际记录的视频文件并在复核后更新路径。</p>`}
        </div>
        <div class="dialog-actions">
          <button class="secondary button-with-icon" id="directory-apply" ${directoryMigrationBusy ? "disabled" : ""}>${icon("check")}应用更改</button>
          <button class="primary button-with-icon" id="directory-apply-migrate" ${directoryMigrationBusy ? "disabled" : ""}>${icon("folder-open")}应用并迁移</button>
          <button class="ghost button-with-icon" id="directory-cancel" ${directoryMigrationBusy ? "disabled" : ""}>${icon("x")}取消</button>
        </div>
      </section>
    </div>`;
}

async function chooseDirectoryMigration(mode: SettingsSaveMode | "cancel"): Promise<void> {
  const request = pendingDirectoryMigration;
  if (!request || directoryMigrationBusy) return;
  if (mode === "cancel") {
    settingsDraft = {
      ...request.nextSettings,
      outputDirectory: request.previousSettings.outputDirectory
    };
    pendingDirectoryMigration = null;
    historyMigrationProgress = null;
    render();
    restoreModalFocus();
    showMessage("已取消目录更改，继续使用当前目录。");
    return;
  }
  directoryMigrationBusy = true;
  historyMigrationProgress = null;
  render();
  try {
    await saveSettingsFromUi(request.nextSettings, mode);
    const warningCount = (historyMigrationProgress as HistoryMigrationProgress | null)?.warningCount ?? 0;
    pendingDirectoryMigration = null;
    directoryMigrationBusy = false;
    historyMigrationProgress = null;
    render();
    restoreModalFocus();
    if (mode === "migrate-video-history") {
      showMessage(warningCount
        ? `历史视频已迁移，但有 ${warningCount} 个旧文件清理警告。`
        : "历史视频迁移完成。");
    }
  } catch (error) {
    directoryMigrationBusy = false;
    showMessage(error instanceof Error ? error.message : String(error), false);
    render();
  }
}

function bindDirectoryMigrationDialog(): void {
  if (!pendingDirectoryMigration) return;
  document.querySelector("#directory-apply")?.addEventListener("click", () => {
    void chooseDirectoryMigration("apply");
  });
  document.querySelector("#directory-apply-migrate")?.addEventListener("click", () => {
    void chooseDirectoryMigration("migrate-video-history");
  });
  document.querySelector("#directory-cancel")?.addEventListener("click", () => {
    void chooseDirectoryMigration("cancel");
  });
  document.querySelector("#directory-migration-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget && !directoryMigrationBusy) {
      void chooseDirectoryMigration("cancel");
    }
  });
  const dialog = document.querySelector<HTMLElement>(".directory-migration-dialog");
  if (dialog) bindModalFocus(dialog, () => void chooseDirectoryMigration("cancel"), "#directory-cancel");
}

function imageAssetProgressPercent(progress: ImageAssetLibraryProgress | null, busy: boolean): number {
  if (!progress) return busy ? 5 : 100;
  if (progress.phase === "completed") return 100;
  const ranges: Record<ImageAssetLibraryProgress["phase"], [number, number]> = {
    scanning: [5, 20],
    archiving: [20, 72],
    verifying: [72, 86],
    committing: [86, 96],
    cleaning: [20, 92],
    completed: [100, 100]
  };
  const [start, end] = ranges[progress.phase];
  const ratio = progress.total
    ? Math.max(0, Math.min(1, progress.current / progress.total))
    : 0;
  return Math.round(start + (end - start) * ratio);
}

function imageAssetPhaseLabel(phase: ImageAssetLibraryProgress["phase"] | undefined): string {
  return ({
    scanning: "扫描引用",
    archiving: "复制归档",
    verifying: "校验文件",
    committing: "保存历史",
    cleaning: "清理素材",
    completed: "操作完成"
  } as const)[phase ?? "scanning"];
}

function imageAssetResultSummary(
  result: ImageAssetLibraryResult,
  action: "organize" | "cleanup"
): NonNullable<NonNullable<typeof imageAssetLibraryDialog>["lastResult"]> {
  const missing = result.scan.missingReferences.length;
  if (action === "cleanup") {
    return {
      tone: "success",
      title: "素材清理完成",
      detail: `已删除 ${result.cleanedFiles} 个未被引用的素材和 ${result.cleanedDirectories} 个空分片目录，释放 ${formatAssetBytes(result.cleanedBytes)}。执行前已重新核对引用。`,
      operationId: result.operationId
    };
  }
  return {
    tone: missing ? "warning" : "success",
    title: missing ? "整理完成，仍有缺失引用" : "整理完成，原文件已保留",
    detail: `已归档 ${result.archivedFiles} 个外部文件，并将 ${result.reorganizedFiles} 个旧分片文件复制到扁平目录；校验并写入 ${result.updatedReferences} 处引用，历史状态已保存。原文件和旧分片副本没有删除，可以稍后再清理。${missing ? ` 另有 ${missing} 个原文件已不存在，未改写这些记录。` : " 当前已没有待整理引用。"}`,
    operationId: result.operationId
  };
}

function imageAssetLibraryDialogHtml(): string {
  const dialog = imageAssetLibraryDialog;
  if (!dialog) return "";
  const scan = dialog.scan;
  const progress = imageAssetLibraryProgress;
  const progressValue = imageAssetProgressPercent(progress, dialog.busy);
  const orphanPreview = scan?.orphanFiles.slice(0, 12).map((file) => `
    <label class="asset-library-file">
      <input type="checkbox" data-orphan-path="${escapeHtml(file.absolutePath)}" ${dialog.selectedPaths.includes(file.absolutePath) ? "checked" : ""}>
      <span><strong title="${escapeHtml(file.relativePath)}">${escapeHtml(file.relativePath)}</strong><small>${formatAssetBytes(file.size)}</small></span>
    </label>`).join("") ?? "";
  return `
    <div class="dialog-backdrop confirm-backdrop" id="image-asset-library-backdrop">
      <section class="confirm-dialog image-asset-library-dialog" role="dialog" aria-modal="true" aria-labelledby="image-asset-library-title" tabindex="-1">
        <div class="confirm-copy">
          <span class="eyebrow">图片输入资产</span>
          <h2 id="image-asset-library-title">整理图片素材库</h2>
          <p id="image-assets-progress-message">${dialog.busy ? escapeHtml(progress?.message || "正在扫描历史与素材文件") : "归档仍在外部的历史素材，并检查素材库中没有被历史、草稿或队列引用的文件。"}</p>
          ${scan ? `<code class="asset-library-path">${escapeHtml(scan.libraryDirectory)}</code>` : ""}
          ${dialog.busy ? `<div class="progress" id="image-assets-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progressValue}"><span style="width:${progressValue}%"></span></div>` : ""}
          ${dialog.busy ? `<div class="asset-library-progress-meta"><span id="image-assets-progress-phase">${imageAssetPhaseLabel(progress?.phase)}</span><span id="image-assets-progress-count">${progress?.total ? `${progress.current} / ${progress.total}` : "准备中"}</span></div>` : ""}
          ${dialog.error ? `<div class="confirm-warning danger-hint">${escapeHtml(dialog.error)}</div>` : ""}
          ${dialog.lastResult ? `<div class="asset-library-result ${dialog.lastResult.tone}" role="status"><span class="asset-library-result-icon">${icon(dialog.lastResult.tone === "success" ? "circle-check" : "alert-triangle")}</span><div><strong>${escapeHtml(dialog.lastResult.title)}</strong><p>${escapeHtml(dialog.lastResult.detail)}</p>${dialog.lastResult.operationId ? `<small>操作编号 ${escapeHtml(dialog.lastResult.operationId)} · 可在运行日志中检索</small>` : ""}</div></div>` : ""}
          ${scan ? `<div class="asset-library-summary">
            <article><span>记录引用</span><strong>${scan.totalReferences}</strong></article>
            <article><span>待整理</span><strong>${scan.archiveCandidates}</strong><small>${formatAssetBytes(scan.archiveBytes)}</small></article>
            <article class="${scan.missingReferences.length ? "warning" : ""}"><span>已缺失</span><strong>${scan.missingReferences.length}</strong></article>
            <article><span>可清理</span><strong>${scan.orphanFiles.length}</strong><small>${formatAssetBytes(scan.orphanBytes)}</small></article>
          </div>
          ${scan.missingReferences.length ? `<details class="asset-library-details"><summary>查看 ${scan.missingReferences.length} 个缺失引用</summary>${scan.missingReferences.slice(0, 20).map((item) => `<code>${escapeHtml(item)}</code>`).join("")}</details>` : ""}
          ${scan.orphanFiles.length ? `<details class="asset-library-orphans" ${dialog.confirmCleanup ? "open" : ""}><summary><span><strong>可清理的未引用素材</strong><small>${scan.orphanFiles.length} 个 · ${formatAssetBytes(scan.orphanBytes)}</small></span><span class="asset-library-summary-action">展开选择</span></summary><div class="asset-library-file-list">${orphanPreview}${scan.orphanFiles.length > 12 ? `<p class="muted">另有 ${scan.orphanFiles.length - 12} 个文件；本次清理只处理上面勾选的文件。</p>` : ""}</div></details>` : `<p class="asset-library-clean">没有发现可清理的孤立素材。</p>`}
          ${dialog.confirmCleanup ? `<div class="confirm-warning"><strong>确认永久删除勾选的孤立文件？</strong><span>执行前会重新扫描引用；素材库外文件不会被删除。</span></div>` : ""}` : ""}
        </div>
        <div class="dialog-actions">
          <button class="secondary button-with-icon" id="image-assets-rescan" ${dialog.busy ? "disabled" : ""}>${icon("scan-search")}重新扫描</button>
          <button class="primary button-with-icon" id="image-assets-organize" ${dialog.busy || !scan?.archiveCandidates ? "disabled" : ""}>${icon("folder-open")}归档并修复</button>
          ${scan?.orphanFiles.length ? `<button class="secondary destructive button-with-icon" id="image-assets-cleanup" ${dialog.busy ? "disabled" : ""}>${icon("trash-2")}${dialog.confirmCleanup ? "确认清理" : "清理所选"}</button>` : ""}
          <button class="ghost button-with-icon" id="image-assets-close" ${dialog.busy ? "disabled" : ""}>${icon("x")}关闭</button>
        </div>
      </section>
    </div>`;
}

async function scanImageAssets(): Promise<void> {
  if (!imageAssetLibraryDialog || imageAssetLibraryDialog.busy) return;
  imageAssetLibraryDialog = { ...imageAssetLibraryDialog, busy: true, error: "", confirmCleanup: false, lastResult: null };
  imageAssetLibraryProgress = null;
  render();
  try {
    const scan = await window.studio.scanImageAssetLibrary();
    imageAssetLibraryDialog = { scan, busy: false, error: "", confirmCleanup: false, selectedPaths: scan.orphanFiles.slice(0, 12).map((file) => file.absolutePath), lastResult: null };
  } catch (error) {
    imageAssetLibraryDialog = { ...imageAssetLibraryDialog, busy: false, error: error instanceof Error ? error.message : String(error) };
  }
  render();
}

function bindImageAssetLibraryDialog(): void {
  const dialog = imageAssetLibraryDialog;
  if (!dialog) return;
  const close = () => {
    if (imageAssetLibraryDialog?.busy) return;
    imageAssetLibraryDialog = null;
    imageAssetLibraryProgress = null;
    render();
    restoreModalFocus();
  };
  document.querySelector("#image-assets-close")?.addEventListener("click", close);
  document.querySelector("#image-asset-library-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) close();
  });
  document.querySelector("#image-assets-rescan")?.addEventListener("click", () => void scanImageAssets());
  document.querySelector("#image-assets-organize")?.addEventListener("click", async () => {
    if (!imageAssetLibraryDialog || imageAssetLibraryDialog.busy) return;
    imageAssetLibraryDialog = { ...imageAssetLibraryDialog, busy: true, error: "", lastResult: null };
    imageAssetLibraryProgress = null;
    render();
    try {
      const result = await window.studio.organizeImageAssetLibrary();
      imageAssetLibraryDialog = { scan: result.scan, busy: false, error: "", confirmCleanup: false, selectedPaths: result.scan.orphanFiles.slice(0, 12).map((file) => file.absolutePath), lastResult: imageAssetResultSummary(result, "organize") };
      showMessage(`素材库整理完成：归档 ${result.archivedFiles} 个外部素材、迁移 ${result.reorganizedFiles} 个旧目录文件、更新 ${result.updatedReferences} 处引用；原文件未删除。`);
    } catch (error) {
      imageAssetLibraryDialog = { ...imageAssetLibraryDialog, busy: false, error: error instanceof Error ? error.message : String(error) };
    }
    render();
  });
  document.querySelector("#image-assets-cleanup")?.addEventListener("click", async () => {
    if (!imageAssetLibraryDialog || imageAssetLibraryDialog.busy) return;
    if (!imageAssetLibraryDialog.confirmCleanup) {
      const selectedPaths = [...document.querySelectorAll<HTMLInputElement>("[data-orphan-path]:checked")].map((item) => item.dataset.orphanPath || "").filter(Boolean);
      imageAssetLibraryDialog = { ...imageAssetLibraryDialog, confirmCleanup: true, selectedPaths };
      render();
      return;
    }
    const paths = imageAssetLibraryDialog.selectedPaths;
    imageAssetLibraryDialog = { ...imageAssetLibraryDialog, busy: true, error: "", confirmCleanup: false, lastResult: null };
    imageAssetLibraryProgress = null;
    render();
    try {
      const result = await window.studio.cleanupImageAssetLibrary(paths);
      imageAssetLibraryDialog = { scan: result.scan, busy: false, error: "", confirmCleanup: false, selectedPaths: result.scan.orphanFiles.slice(0, 12).map((file) => file.absolutePath), lastResult: imageAssetResultSummary(result, "cleanup") };
      showMessage(`已清理 ${result.cleanedFiles} 个孤立素材，释放 ${formatAssetBytes(result.cleanedBytes)}。`);
    } catch (error) {
      imageAssetLibraryDialog = { ...imageAssetLibraryDialog, busy: false, error: error instanceof Error ? error.message : String(error), confirmCleanup: false };
    }
    render();
  });
  const element = document.querySelector<HTMLElement>(".image-asset-library-dialog");
  if (element) bindModalFocus(element, close, "#image-assets-close");
}

function confirmationDialog(): string {
  if (!pendingConfirmation) return "";
  const request = pendingConfirmation;
  const deleting = request.kind === "delete-history";
  const deletingImageVersion = request.kind === "delete-image-version";
  const deletingImage = deleting && state.imageHistory.some((item) => item.id === request.assetId);
  const removingQueueTask = request.kind === "remove-queue-task";
  const cancellingQueueTask = request.kind === "cancel-queue-task";
  const discardingSettings = request.kind === "discard-settings";
  const forceStoppingComfy = request.kind === "force-stop-comfy";
  const title = deletingImageVersion
    ? `删除“${request.title}”？`
    : deleting
    ? `删除“${request.title}”？`
    : removingQueueTask
      ? `移除任务“${request.title}”？`
      : cancellingQueueTask
        ? `取消当前任务“${request.title}”？`
        : discardingSettings
          ? "放弃未保存的设置？"
          : forceStoppingComfy
            ? "强制终止所有 ComfyUI 进程？"
            : "清空当前草稿？";
  const description = deletingImageVersion
    ? "当前图片版本和对应生成文件会永久删除；同项目的其他版本和原始导入图片不会受影响。"
    : deleting
    ? deletingImage
      ? "图片项目记录和生成的版本文件会从磁盘永久删除；最初导入的原始素材不会删除。"
      : "关联的视频文件会从磁盘永久删除，历史记录也会一并移除。"
    : removingQueueTask
      ? "这会从队列中移除任务，不会删除输入文件或历史作品。"
      : cancellingQueueTask
        ? "当前生成会被中断；如果已经产生可用的部分视频，程序会尝试保留它。"
        : discardingSettings
          ? "当前设置修改尚未保存。放弃后会恢复到上一次保存的值。"
          : forceStoppingComfy
            ? "这会关闭所有识别到的 ComfyUI Desktop/后端进程，立即中断当前任务并释放 CUDA 上下文；不会自动重新启动。"
            : "首帧、尾帧和所有提示词版本都会清空；模型与输出设置会保留。";
  return `
    <div class="dialog-backdrop confirm-backdrop" id="confirm-backdrop">
      <section class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description" tabindex="-1">
        <div class="confirm-icon" aria-hidden="true">${icon("alert-triangle")}</div>
        <div class="confirm-copy">
          <span class="eyebrow">此操作无法撤销</span>
          <h2 id="confirm-title">${escapeHtml(title)}</h2>
          <p id="confirm-description">${escapeHtml(description)}</p>
          ${deletingImageVersion
            ? `<div class="confirm-warning">如果后续版本基于它生成，版本谱系会保留父版本已删除的标记。</div>`
            : deleting
            ? `<div class="confirm-warning">${deletingImage ? "只删除本图片项目的生成版本，不会删除原始导入图片或整个输出目录。" : "只删除本条记录关联的视频，不会删除参考图片、工作流或整个输出目录。"}</div>`
            : removingQueueTask || cancellingQueueTask
              ? `<div class="confirm-warning">任务参数、输入媒体和错误记录会继续保留在本地，之后仍可编辑、重试或移除。</div>`
              : discardingSettings
                ? `<div class="confirm-warning">已经保存的设置不会受到影响；只有当前编辑中的设置草稿会被丢弃。</div>`
                : forceStoppingComfy
                  ? `<div class="confirm-warning danger-warning">这是进程级强制操作，会关闭其它 ComfyUI 实例；未保存的 ComfyUI 工作流状态不会保留。</div>`
                  : ""}
        </div>
        <div class="dialog-actions">
          <button class="secondary button-with-icon" id="cancel-confirmation" ${confirmationBusy ? "disabled" : ""}>${icon("x")}取消</button>
          <button class="primary destructive button-with-icon" id="accept-confirmation" ${confirmationBusy ? "disabled" : ""}>${icon(forceStoppingComfy || cancellingQueueTask ? "ban" : discardingSettings ? "rotate-ccw" : "trash-2")}${confirmationBusy ? "处理中…" : forceStoppingComfy ? "强制终止进程" : deletingImageVersion ? "删除当前版本" : deleting ? deletingImage ? "删除图片项目" : "删除视频和记录" : removingQueueTask ? "移除任务" : cancellingQueueTask ? "取消当前任务" : discardingSettings ? "放弃更改" : "清空草稿"}</button>
        </div>
      </section>
    </div>`;
}

function windowCloseDialog(): string {
  if (!pendingWindowCloseRequest) return "";
  const runningWork = pendingWindowCloseRequest.kind === "running-work";
  const hasUnsavedSettings = pendingWindowCloseRequest.hasUnsavedSettings === true;
  return `
    <div class="dialog-backdrop confirm-backdrop close-dialog-backdrop" id="window-close-backdrop">
      <section class="confirm-dialog close-dialog" role="alertdialog" aria-modal="true" aria-labelledby="window-close-title" aria-describedby="window-close-description" tabindex="-1">
        <div class="confirm-icon" aria-hidden="true">${icon("alert-triangle")}</div>
        <div class="confirm-copy">
          <span class="eyebrow">${runningWork ? "任务仍在运行" : "退出应用"}</span>
          <h2 id="window-close-title">${runningWork ? "当前任务还没有结束" : "有未保存的设置"}</h2>
          <p id="window-close-description">${runningWork ? "结束任务会中断当前 ComfyUI 计算；强制退出不会等待完整清理。" : "当前设置还有未保存更改，退出后这些修改会丢失。"}</p>
          <div class="confirm-warning">${runningWork ? `${hasUnsavedSettings ? "未保存的设置也会被放弃。" : ""} ComfyUI 服务本身不会关闭。` : "已经保存的设置不会受到影响；只有当前编辑中的设置会被放弃。"}</div>
        </div>
        <div class="dialog-actions">
          <button class="secondary button-with-icon" id="cancel-window-close" ${windowCloseResponseBusy ? "disabled" : ""}>${icon("x")}取消退出</button>
          ${runningWork ? `<button class="primary destructive button-with-icon" id="finish-window-close" ${windowCloseResponseBusy ? "disabled" : ""}>${icon("power")}${windowCloseResponseBusy ? "处理中…" : "结束任务并退出"}</button><button class="ghost danger button-with-icon" id="force-window-close" ${windowCloseResponseBusy ? "disabled" : ""}>${icon("ban")}强制退出</button>` : `<button class="primary destructive button-with-icon" id="discard-window-close" ${windowCloseResponseBusy ? "disabled" : ""}>${icon("power")}${windowCloseResponseBusy ? "处理中…" : "放弃设置并退出"}</button>`}
        </div>
      </section>
    </div>`;
}

function upscaleDialogHtml(): string {
  if (!upscaleDialog) return "";
  const asset = state.history.find((item) => item.id === upscaleDialog?.assetId);
  const version = asset?.versions.find((item) => item.id === upscaleDialog?.versionId);
  if (!asset || !version) return "";
  const [targetWidth, outputHeight] = upscaleDimensions(
    version.width,
    version.height,
    upscaleDialog.targetHeight
  );
  const sourceShortEdge = versionShortEdge(version);
  const selectedTargetHeight = upscaleDialog.targetHeight;
  const estimate = estimateUpscaleResources({
    modelId: upscaleDialog.modelId,
    sourceWidth: version.width,
    sourceHeight: version.height,
    targetWidth,
    targetHeight: outputHeight,
    duration: version.duration,
    fps: version.fps
  });
  const formatEstimateGb = (value: number) =>
    `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)} GB`;
  const estimatedVram = `${formatEstimateGb(estimate.vramMinGb)}-${formatEstimateGb(estimate.vramMaxGb)}`;
  const estimatedTime = formatUpscaleEstimateRange(
    estimate.secondsMin,
    estimate.secondsMax
  );
  const detectedVramBytes = environmentScan?.gpus[0]?.vramTotalBytes ??
    performanceMetrics?.vramTotalBytes ??
    0;
  const vramWarning = detectedVramBytes > 0 &&
    estimate.vramMaxGb * 1024 ** 3 > detectedVramBytes;
  const supportedIds = new Set(["seedvr2", "flashvsr", "realesrgan"]);
  const profiles = environmentScan?.modelProfiles.filter(
    (profile) => profile.category === "upscale" && supportedIds.has(profile.id)
  ) ?? [
    { id: "seedvr2", name: "SeedVR2", available: true },
    { id: "flashvsr", name: "FlashVSR", available: true },
    { id: "realesrgan", name: "Real-ESRGAN x4plus", available: true }
  ];
  const outputFilename = createUpscaleFilename(
    version.outputFilename,
    upscaleDialog.targetHeight
  );
  const supportsTileMode = upscaleDialog.modelId === "seedvr2";
  return `
    <div class="dialog-backdrop upscale-backdrop" id="upscale-backdrop">
      <section class="upscale-dialog" role="dialog" aria-modal="true" aria-labelledby="upscale-title" tabindex="-1">
        <div class="upscale-dialog-head">
          <div><span class="eyebrow">创建后处理任务</span><h2 id="upscale-title">提升分辨率</h2></div>
          <button class="dialog-close" id="close-upscale" aria-label="关闭">${icon("x")}</button>
        </div>
        <div class="upscale-dialog-body">
          <div class="upscale-source"><div><strong>${escapeHtml(asset.title)}</strong><code>${escapeHtml(version.outputFilename)}</code></div><span>${version.width} × ${version.height} · ${formatVideoDuration(version.duration)}</span></div>
          <div><label>目标分辨率</label><div class="upscale-resolution">
            ${([720, 1080, 1440, 2160] as const).map((height) => `<button class="${height === selectedTargetHeight ? "primary" : "secondary"}" data-upscale-height="${height}" ${height <= sourceShortEdge ? "disabled" : ""}>${height === 2160 ? "4K" : `${height}p`}</button>`).join("")}
          </div></div>
          <div class="settings-grid two">
            <label>提升模型<select id="upscale-model">${profiles.map((profile) => `<option value="${profile.id}" ${profile.id === upscaleDialog?.modelId ? "selected" : ""} ${!profile.available ? "disabled" : ""}>${escapeHtml(profile.name)}${profile.available ? "" : " · 缺组件"}</option>`).join("")}</select></label>
            <label>显存策略${supportsTileMode ? `<select id="upscale-tile"><option value="auto" ${upscaleDialog.tileMode === "auto" ? "selected" : ""}>自动 · 按显存选择</option><option value="safe" ${upscaleDialog.tileMode === "safe" ? "selected" : ""}>保守 · 分批与每批卸载</option><option value="fast" ${upscaleDialog.tileMode === "fast" ? "selected" : ""}>速度优先 · 尽量少卸载</option></select>` : `<span class="upscale-policy-readonly">节点固定 · 低显存分批</span>`}</label>
          </div>
          <div class="upscale-output"><div><span>预计输出</span><strong>${targetWidth} × ${outputHeight}</strong><code>${escapeHtml(outputFilename)}</code></div><div class="upscale-estimates"><span>预计峰值 ${estimatedVram}</span><span>预计耗时 ${estimatedTime}</span></div></div>
          <p class="upscale-estimate-note ${vramWarning ? "warning" : ""}">按模型、目标分辨率和帧数估算，共 ${estimate.frameCount} 帧；显存策略会影响实际峰值和耗时，不含首次加载模型、磁盘读取和最终编码时间。${vramWarning ? `预计峰值可能超过当前 ${formatBytes(detectedVramBytes)} 显存，建议降低目标分辨率或改用更轻模型。` : "实际速度和峰值会受 ComfyUI 版本、后台进程和磁盘速度影响。"}</p>
        </div>
        <div class="dialog-actions"><button class="secondary button-with-icon" id="cancel-upscale">${icon("x")}取消</button><button class="primary button-with-icon" id="enqueue-upscale">${icon(upscaleDialog.taskId ? "save" : "plus")}${upscaleDialog.taskId ? "保存更改" : upscaleDialog.replaceTaskId ? "重新加入队列" : "加入队列"}</button></div>
      </section>
    </div>`;
}

function shell(content: string): string {
  return `
    <div class="app-shell ${page === "history" || page === "history-detail" || page === "image-history-detail" ? "history-shell" : ""}">
      <header class="topbar">
        <button class="brand" data-page="create" aria-label="返回创建页">
          <span class="brand-mark">${icon("play")}</span><span>Local Video Studio</span><span class="brand-version">${appVersion ? `v${escapeHtml(appVersion)}` : ""}</span>
        </button>
        <nav aria-label="主导航">
          ${(["create", "queue", "history", "settings"] as Array<Exclude<Page, "history-detail" | "image-history-detail">>)
            .map((item) => {
              const labels = { create: "创建", queue: "队列", history: "历史", settings: "设置" };
              const badge = item === "queue" && state.queue.length
                ? `<span class="badge">${state.queue.length}</span>`
                : "";
              const active =
                page === item || (item === "history" && (page === "history-detail" || page === "image-history-detail"));
              return `<button class="nav-button ${active ? "active" : ""}" data-page="${item}">${labels[item]}${badge}</button>`;
            })
            .join("")}
        </nav>
      </header>
      <div class="flash ${flashMessage ? "visible" : ""}" id="app-flash" role="status" aria-live="polite">${escapeHtml(flashMessage)}</div>
      <main>${content}</main>
    </div>
    <button class="history-back-top" id="history-back-top" type="button" aria-label="返回顶部" title="返回顶部">${icon("arrow-up")}</button>
    ${confirmationDialog()}
    ${directoryMigrationDialog()}
    ${imageAssetLibraryDialogHtml()}
    ${windowCloseDialog()}
    ${upscaleDialogHtml()}`;
}

async function imagePreview(filename: string, targetId: string): Promise<void> {
  if (!filename) return;
  const dataUrl = await window.studio.readImage(filename);
  const image = document.querySelector<HTMLImageElement>(`#${targetId}`);
  if (image && dataUrl) {
    image.addEventListener("load", () => {
      if (!image.naturalWidth || !image.naturalHeight) return;
      image.closest<HTMLElement>(".drop-zone")?.style.setProperty(
        "--image-ratio",
        `${image.naturalWidth} / ${image.naturalHeight}`
      );
      if (
        targetId === "start-preview" &&
        (state.draft.sourceWidth !== image.naturalWidth ||
          state.draft.sourceHeight !== image.naturalHeight)
      ) {
        patchDraft({
          sourceWidth: image.naturalWidth,
          sourceHeight: image.naturalHeight
        });
      }
    }, { once: true });
    image.src = dataUrl;
  }
}

function promptModelStatus(settings: Settings): { ready: boolean; detail: string } {
  if (!environmentScan) {
    return { ready: false, detail: "等待环境扫描确认提示词模型" };
  }
  const profile = environmentScan.modelProfiles.find(
    (item) => item.category === "prompt" && item.id === settings.promptModelId
  );
  if (!profile) {
    return { ready: false, detail: "当前提示词模型未在设置扫描结果中" };
  }
  if (!profile.available) {
    const missing = profile.components
      .filter((component) => !component.found)
      .map((component) => component.expected)
      .join("、");
    return {
      ready: false,
      detail: `模型未配置完整${missing ? `：缺少 ${missing}` : ""}`
    };
  }
  return {
    ready: true,
    detail: isGemmaPromptModel(settings.promptModelId)
      ? "检查 ComfyUI H3 Prompt Writer"
      : "启动 ComfyUI 提示词模型"
  };
}

function promptRuntimeControlIcon(): string {
  return promptStarting || promptEnhancing || promptReleasing
    ? "refresh-cw"
    : promptRuntimeLoaded
      ? "power"
      : "play";
}

function promptRuntimeControlTitle(settings = state.settings): string {
  return promptStarting
    ? "正在启动提示词模型"
    : promptEnhancing
    ? "提示词模型正在运行"
    : promptReleasing
      ? "正在释放提示词模型"
      : promptRuntimeLoaded
      ? "释放 ComfyUI 提示词模型并回收显存"
      : promptModelStatus(settings).detail;
}

const imageReferenceRoleLabels: Record<ImageReferenceRole, string> = {
  base: "基础画面",
  person: "人物",
  object: "物体",
  pose: "姿态",
  style: "风格",
  background: "背景",
  auto: "自动"
};

function activeImagePrompt(draft = state.imageDraft): PromptVersion {
  return draft.promptVersions[draft.activePromptVersion] ??
    draft.promptVersions.at(-1) ?? {
      id: "image-prompt-fallback",
      label: "原始",
      text: "",
      createdAt: new Date().toISOString()
    };
}

function imageEditPromptInstructionOptions(): string {
  return [
    ["", "选择保持、编辑或禁止项"],
    ["保持 Picture 1 的主体身份、构图、光源方向和背景结构不变。", "保持基础画面"],
    ["以带标记 Picture 中每一条标记说明作为具体修改清单，只执行这些说明。本条指令不新增、不替代任何标记要求；如果与某条标记说明冲突，以标记说明为准。除完成标记要求所必需的局部调整外，保持所有未标记区域和未提及内容不变。", "按标记局部修改"],
    ["只修改明确指定的区域，不要改变画面中的其他内容。", "只修改指定内容"],
    ["移除指定元素，并使用周围纹理、光影和透视自然补全区域。", "自然移除元素"],
    ["添加指定元素，并匹配原图的透视、尺度、光照、阴影、景深和颗粒。", "自然添加元素"],
    ["修复抠图边缘、色温、光源方向、接触阴影、透视、景深和清晰度不一致造成的合成痕迹。", "修复合成痕迹"],
    ["不要添加文字、Logo、水印或用户未要求的新元素。", "禁止新增文字或元素"]
  ].map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("");
}

function imageEditPage(): string {
  const draft = normalizeImageEditDraft(state.imageDraft);
  const imageCapability = imageModelCapabilityFor(draft.modelId);
  const basePicture = draft.pictures[0];
  const selectedTargetResolution = normalizeImageTargetResolution(
    draft.targetResolution,
    basePicture?.width ?? 0,
    basePicture?.height ?? 0
  );
  const imageResolutionOptions = imageResolutionOptionsFor(
    basePicture?.width ?? 0,
    basePicture?.height ?? 0
  );
  const imageModelProfiles = environmentScan?.modelProfiles.filter((profile) => profile.category === "image") ?? [];
  const imageModelOptions = imageModelProfiles.length
    ? imageModelProfiles
    : [
        { id: "qwen-image-edit-2511", name: "Qwen-Image-Edit-2511 · 图片处理", category: "image" as const, badge: "Qwen 2511", description: "", vram: "", available: false, integrated: true, components: [] },
        { id: "flux2-klein-4b", name: "FLUX.2 Klein 4B · 图片处理", category: "image" as const, badge: "约 13GB VRAM", description: "", vram: "", available: false, integrated: true, components: [] }
      ];
  const prompt = activeImagePrompt(draft);
  const imageProfile = environmentScan?.modelProfiles.find(
    (profile) => profile.id === draft.modelId
  );
  const lightningReady = !imageQualityProfileRequiresLightning(draft.qualityProfile) ||
    imageLightningComponentFound(imageProfile?.components ?? []);
  const promptStatus = promptModelStatus(state.settings);
  const promptRuntimeBusy = promptStarting || promptEnhancing || promptReleasing;
  const imagePromptModelSupportsImageEdit = promptModelSupportsImageEdit(state.settings.promptModelId);
  const imagePromptAiDisabled = promptRuntimeBusy || state.queueRunning || !prompt.text.trim() || !imagePromptModelSupportsImageEdit;
  const imageEnhanceMode: ImagePromptPreset = promptEnhanceMode === "faithful"
    ? "faithful"
    : "detail-enhance";
  const imagePromptOptimizeTitle = state.queueRunning
    ? "当前有任务运行，暂不能启动提示词模型"
    : !imagePromptModelSupportsImageEdit
      ? "当前选择的提示词模型没有可用适配器，请在设置中重新选择已接入的模型"
    : !prompt.text.trim()
      ? "请先输入图片编辑 Prompt"
      : isGemmaPromptModel(state.settings.promptModelId)
        ? "使用设置中选择的 Gemma Prompt Writer 优化"
        : "使用设置中选择的提示词模型优化";
  const incompletePicture = draft.pictures.find((picture) => !picture.absolutePath);
  const enqueueBlockReason = !draft.pictures.length
    ? "请先添加 Slot 1（Picture 1）作为基础图片"
    : !draft.pictures[0]?.absolutePath
      ? "请先为 Slot 1（Picture 1）添加基础图片"
      : incompletePicture
        ? `请先为 Slot ${incompletePicture.pictureNumber}（Picture ${incompletePicture.pictureNumber}）添加图片`
    : draft.pictures.length > imageCapability.maxPictures
      ? `当前 ${imageCapability.name} 最多支持 ${imageCapability.maxPictures} 张 Picture`
      : !prompt.text.trim()
        ? "请先填写图片编辑 Prompt"
        : !imageProfile?.available
          ? `请先在设置 → 图片模型中补齐 ${imageCapability.name} 组件`
          : !imageProfile.integrated
            ? `${imageCapability.name} 图片工作流尚未接入`
            : !lightningReady
                  ? "当前 4 步 Lightning 档缺少 Lightning LoRA，请先在设置中下载并扫描"
                : "";
  const count = Math.min(10, Math.max(1, draft.outputCount));
  return `
    <section class="page-heading create-page-heading image-edit-page-heading">
      <div class="page-heading-copy"><h1>图片处理</h1><p>先生成可复用的图片素材，再从满意版本开始图生视频或继续编辑。</p></div>
      <div class="create-page-actions">
        <div class="input-mode-switch" role="group" aria-label="创建模式">
          <button class="ghost button-with-icon" data-input-mode="image" aria-pressed="false">${icon("image")}图生视频</button>
          <button class="ghost button-with-icon" data-input-mode="video" aria-pressed="false">${icon("video")}视频续写</button>
          <button class="secondary active button-with-icon" data-input-mode="image-edit" aria-pressed="true">${icon("wand-sparkles")}图片处理</button>
        </div>
        <span class="save-state">自动保存</span>
      </div>
    </section>
    <div class="create-workspace image-edit-workspace">
      <section class="media-panel image-edit-references">
        <div class="section-heading">
          <div><h2>参考图片</h2><span class="muted">Slot ${draft.pictures.length}/${imageCapability.maxPictures} · Picture 1 是基础输入</span></div>
          <button class="secondary button-with-icon" id="add-image-slot" ${draft.pictures.length >= imageCapability.maxPictures ? "disabled" : ""}>${icon("plus")}添加 Slot</button>
        </div>
        <div class="image-picture-list">
          ${draft.pictures.length ? draft.pictures.map((picture) => `
            <article class="image-picture-card ${picture.pictureNumber === 1 ? "is-base" : "is-reference"} ${picture.absolutePath ? "has-picture" : "is-empty"} ${picture.markup ? "has-markup" : ""}" data-image-picture-card="${escapeHtml(picture.id)}">
              <button class="image-picture-preview ${picture.absolutePath ? "has-image" : ""}" data-image-picture-pick="${escapeHtml(picture.id)}" aria-label="${picture.absolutePath ? `替换 Slot ${picture.pictureNumber} 图片` : `选择 Slot ${picture.pictureNumber} 图片`}">
                <img data-image-picture-preview="${escapeHtml(picture.id)}" alt="Slot ${picture.pictureNumber}预览" ${picture.absolutePath ? "" : "hidden"}>
                ${picture.absolutePath ? "" : `<span>${icon("image")}选择图片</span>`}
              </button>
              <div class="image-picture-card-body">
                <div class="image-picture-card-title"><strong>Slot ${picture.pictureNumber}</strong><span class="picture-number">Picture ${picture.pictureNumber}</span><span class="model-badge">${picture.pictureNumber === 1 ? "基础输入" : "参考"}</span>${picture.markup ? `<span class="model-availability available">${icon("pencil")} 已标记 ${picture.markup.objectCount} 处</span>` : ""}</div>
                <code title="${escapeHtml(picture.absolutePath)}">${picture.absolutePath ? escapeHtml(picture.absolutePath.split(/[\\/]/u).pop() ?? picture.absolutePath) : "尚未添加图片"}</code>
                <label>参考作用<select data-image-picture-role="${escapeHtml(picture.id)}" ${picture.pictureNumber === 1 ? "disabled" : ""}>${Object.entries(imageReferenceRoleLabels).map(([value, label]) => `<option value="${value}" ${picture.role === value || (picture.pictureNumber === 1 && value === "base") ? "selected" : ""}>${label}</option>`).join("")}</select></label>
              </div>
              <div class="image-picture-card-actions">${picture.absolutePath ? `<button class="icon-button" data-markup-image-picture="${escapeHtml(picture.id)}" aria-label="标记 Picture ${picture.pictureNumber}" title="标记图片">${icon("pencil")}</button>` : ""}<button class="icon-button danger" data-remove-image-picture="${escapeHtml(picture.id)}" aria-label="删除 Slot ${picture.pictureNumber}" title="删除 Slot ${picture.pictureNumber}">${icon("trash-2")}</button></div>
            </article>`).join("") : `<div class="image-picture-empty"><span>${icon("images")}</span><strong>先添加 Picture 1</strong><small>基础画面决定默认构图；后续最多添加两张人物、物体、姿态或风格参考。</small></div>`}
        </div>
        <button class="drop-zone image-picture-drop-zone" id="image-picture-drop-zone" data-image-picture-drop ${draft.pictures.length >= imageCapability.maxPictures ? "disabled" : ""}>
          <span class="drop-icon">${icon("upload")}</span><strong>拖入图片到下一个 Slot</strong><span>PNG、JPG、WEBP、BMP · 也可以点击选择文件</span>
        </button>
      </section>
      <section class="panel composer image-edit-composer">
        <div class="section-heading composer-heading">
          <div class="composer-heading-main"><h2>提示词</h2><span class="muted">${draft.activePromptVersion + 1} / ${draft.promptVersions.length} · ${escapeHtml(prompt.label)}</span><div class="prompt-version-controls"><button class="icon-button" id="image-prompt-prev" aria-label="上一版提示词" ${draft.activePromptVersion === 0 ? "disabled" : ""}>${icon("chevron-left")}</button><button class="icon-button" id="image-prompt-next" aria-label="下一版提示词" ${draft.activePromptVersion >= draft.promptVersions.length - 1 ? "disabled" : ""}>${icon("chevron-right")}</button></div></div>
          <div class="prompt-action-controls">
            <select class="prompt-enhance-mode" id="prompt-enhance-mode" aria-label="图片提示词优化方式" title="只影响优化提示词，不影响图片生成参数；细节增强会补充执行细节，忠实整理尽量保持原意">
              <option value="detail-enhance" ${imageEnhanceMode === "detail-enhance" ? "selected" : ""}>细节增强</option>
              <option value="faithful" ${imageEnhanceMode === "faithful" ? "selected" : ""}>忠实整理</option>
            </select>
            <button class="icon-button prompt-runtime-button ${promptRuntimeBusy ? "busy" : ""}" id="release-prompt-model-create" ${promptRuntimeBusy || state.queueRunning || (!promptRuntimeLoaded && !promptStatus.ready) ? "disabled" : ""} aria-label="${escapeHtml(promptRuntimeControlTitle())}" title="${escapeHtml(promptRuntimeControlTitle())}" aria-busy="${promptRuntimeBusy}">${icon(promptRuntimeControlIcon())}</button>
            <button class="secondary button-with-icon" id="enhance-prompt" ${imagePromptAiDisabled ? "disabled" : ""} title="${escapeHtml(imagePromptOptimizeTitle)}">${icon("sparkles")}${promptEnhancing ? "优化中…" : "优化提示词"}</button>
          </div>
        </div>
        <div class="prompt-editor-shell"><textarea id="image-edit-prompt-input" rows="6" spellcheck="true" lang="${/[\u3400-\u9fff]/u.test(prompt.text) ? "zh-CN" : "en-US"}">${escapeHtml(prompt.text)}</textarea><div id="image-prompt-word-counter" class="prompt-word-counter" aria-live="polite"></div></div>
        <div class="prompt-tool-row"><label class="prompt-snippet-picker"><span>快速插入</span><select id="image-edit-instruction">${imageEditPromptInstructionOptions()}</select></label><button class="secondary button-with-icon" id="insert-image-edit-instruction" disabled>${icon("plus")}插入</button></div>
        <section class="composer-control-group image-edit-output-group"><div class="composer-group-heading"><div><strong>生成设置</strong><span>一个批次顺序生成多张候选图，Seed 和参数会保存到任务快照</span></div></div><div class="composer-control-grid image-edit-settings-grid">
          <label class="settings-field">模型<select id="image-edit-model">${imageModelOptions.map((profile) => `<option value="${escapeHtml(profile.id)}" ${draft.modelId === profile.id ? "selected" : ""} ${isImageModelSelectable(profile) ? "" : "disabled"}>${escapeHtml(profile.name)}${isImageModelSelectable(profile) ? "" : ` · ${escapeHtml(imageWorkflowStatus(profile))}`}</option>`).join("")}</select></label>
          <label class="settings-field">质量<select id="image-edit-quality">${imageCapability.qualityProfiles.map((profile) => `<option value="${escapeHtml(profile.id)}" ${draft.qualityProfile === profile.id ? "selected" : ""} ${imageQualityProfileRequiresLightning(profile.id) && !imageLightningComponentFound(imageProfile?.components ?? []) ? "disabled" : ""}>${escapeHtml(profile.label)} · ${profile.steps} 步${imageQualityProfileRequiresLightning(profile.id) && !imageLightningComponentFound(imageProfile?.components ?? []) ? " · 缺少 LoRA" : ""}</option>`).join("")}</select></label>
          <label class="settings-field">输出分辨率<select id="image-edit-resolution" aria-label="图片输出分辨率">${imageResolutionOptions.map((option) => `<option value="${option.value}" ${selectedTargetResolution === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select></label>
          <label class="settings-field">随机 Seed<div class="inline-field seed-control"><input id="image-edit-seed" type="number" placeholder="留空则每张随机" value="${draft.seed ?? ""}"><button class="icon-button" id="random-image-edit-seed" title="生成随机 Seed">${icon("refresh-cw")}</button><button class="icon-button" id="clear-image-edit-seed" title="清空 Seed">${icon("x")}</button></div></label>
          <label class="settings-field range-field"><span class="range-heading"><span>生成数量</span><strong id="image-edit-count-value">${count} 张</strong></span><input id="image-edit-count" type="range" min="1" max="10" step="1" value="${count}"><span class="range-scale"><span>1</span><span>一个任务，逐张生成</span><span>10</span></span></label>
        </div></section>
        <div class="interpolation-summary settings-summary ${enqueueBlockReason ? "unsafe" : ""}"><div><strong>${enqueueBlockReason || `一个任务 · ${count} 个${draft.seed == null ? "随机" : "相同"} Seed 顺序生成`}</strong><span>Qwen 不执行 AI 超分；高于原图短边的档位已隐藏</span></div><p>${escapeHtml(imageProfile ? imageWorkflowStatus(imageProfile) : "请先打开设置 → 图片模型，下载并扫描三项 Qwen 组件。")}</p></div>
        <div class="submit-row composer-submit-row"><button class="ghost danger button-with-icon" id="clear-image-edit-draft">${icon("trash-2")}清空</button><button class="primary button-with-icon enqueue-button ${enqueueBusy ? "busy" : ""}" id="enqueue-image-edit" ${enqueueBlockReason || enqueueBusy ? "disabled" : ""} aria-busy="${enqueueBusy}">${icon(enqueueBusy ? "refresh-cw" : "plus", "enqueue-spinner")}<span data-enqueue-label>${enqueueBusy ? "加入中…" : "加入队列"}</span></button></div>
      </section>
    </div>`;
}

function createPage(): string {
  if (creationMode === "image-edit") return imageEditPage();
  const draft = state.draft;
  const isMiniMaxH3 = isMiniMaxH3Model(draft.modelId);
  const isR2V = isMiniMaxH3R2vModel(draft.modelId);
  const h3Mode = isMiniMaxH3 ? h3PromptModeForDraft(draft) : undefined;
  const activeH3PromptPreset = h3Mode
    ? h3PromptPresetForMode(h3Mode, h3PromptPreset)
    : h3PromptPreset;
  const enhanceMode = isMiniMaxH3
    ? promptEnhanceMode === "faithful" ? "faithful" : "h3-vision"
    : promptEnhanceMode === "h3-vision" ? "sulphur-native" : promptEnhanceMode;
  const promptStatus = promptModelStatus(state.settings);
  const promptRuntimeBusy = promptStarting || promptEnhancing || promptReleasing;
  const promptAiDisabled = promptRuntimeBusy || state.queueRunning;
  const turboEnabled = isH3TurboEnabled(draft);
  const h3Steps = normalizeH3Steps(draft.steps, draft.modelId, draft.videoLoras);
  const turboLoraProfile = environmentScan?.modelProfiles.find(
    (profile) => profile.id === H3_TURBO_LORA_ID
  );
  const compatibleLoraDefinitions = BUILTIN_VIDEO_LORAS.filter((lora) =>
    videoLoraCompatibleWithDraft(lora, draft.modelId, draft.inputMode)
  );
  const addableLoraDefinitions = compatibleLoraDefinitions.filter((lora) =>
    !draft.videoLoras.some((selected) => selected.id === lora.id)
  );
  const installReadyLoraDefinitions = addableLoraDefinitions.filter((lora) =>
    environmentScan?.modelProfiles.find((item) => item.id === lora.id)?.available === true
  );
  const loraIssues = videoLoraConfigurationIssues({
    modelId: draft.modelId,
    inputMode: draft.inputMode,
    spectrumMode: draft.spectrumMode,
    attentionMode: state.settings.h3AttentionMode,
    videoLoras: draft.videoLoras
  });
  const loraBlockingIssue = loraIssues.find((issue) => issue.severity === "error");
  const scannedModelProfiles = environmentScan?.modelProfiles;
  const missingSelectedLora = scannedModelProfiles
    ? draft.videoLoras.find((lora) => !profileProvidesVideoLora(
        scannedModelProfiles.find((profile) => profile.id === lora.id),
        lora.filename
      ))
    : undefined;
  const spectrumNode = environmentScan?.customNodes.find(
    (node) => node.id === "spectrum-minimax-h3"
  );
  const spectrumLoaded = Boolean(spectrumNode?.loaded);
  const spectrumEligible = isMiniMaxH3SpectrumEligible(draft.modelId) && !turboEnabled;
  const spectrumReady = draft.spectrumMode !== "balanced" || (
    spectrumEligible && spectrumLoaded
  );
  const detectedVramTotalBytes = environmentScan?.gpus[0]?.vramTotalBytes ?? performanceMetrics?.vramTotalBytes ?? 0;
  const extending = draft.inputMode === "video";
  const h3MotionContextNode = environmentScan?.customNodes.find(
    (node) => node.id === "h3-motion-context"
  );
  const h3MotionContextReady = !extending || !isR2V || Boolean(
    h3MotionContextNode?.installed || h3MotionContextNode?.loaded
  );
  const prompt = activePrompt();
  const interpolation = interpolationEstimate(draft);
  const safety = extending
    ? extensionSafetyForDraft(draft, state.settings)
    : generationSafetyForTask(draft);
  const supportsEndImage =
    workflowCapabilities[draft.workflowPath]?.supportsEndImage === true;
  const supportsVideoExtension =
    workflowCapabilities[draft.workflowPath]?.supportsVideoExtension === true;
  const selectedModelProfile = environmentScan?.modelProfiles.find(
    (profile) => profile.id === draft.modelId
  );
  const trimDuration = Math.max(0, draft.trimEndSeconds - draft.trimStartSeconds);
  const trimStartPercent = draft.sourceVideoDuration > 0
    ? draft.trimStartSeconds / draft.sourceVideoDuration * 100
    : 0;
  const trimEndPercent = draft.sourceVideoDuration > 0
    ? draft.trimEndSeconds / draft.sourceVideoDuration * 100
    : 100;
  const videoReady = Boolean(draft.sourceVideoPath && draft.sourceVideoDuration > 0);
  const r2vCounts = h3ReferenceSlotCounts(draft.h3ReferenceSlots);
  const r2vSlotsReady = extending || !isR2V || (
    draft.h3ReferenceSlots.length > 0 &&
    draft.h3ReferenceSlots.every((slot) => Boolean(slot.mediaPath))
  );
  const turboCoreBlockReason = turboEnabled &&
    Boolean(environmentScan?.comfyCompatibility.checkedFrom) &&
    !environmentScan?.comfyCompatibility.h3CoreSupported
    ? "LightX2V Turbo 需要 ComfyUI v0.31.0+ 原生音视频采样；请先在设置中更新核心"
    : "";
  const turboLoraBlockReason = turboEnabled && turboLoraProfile && !turboLoraProfile.available
    ? "LightX2V Turbo LoRA 文件缺失；请先在设置 → LoRA 中安装"
    : "";
  const selectedLoraBlockReason = loraBlockingIssue?.message ??
    (missingSelectedLora
      ? `${missingSelectedLora.name} 当前记录的文件未找到；请在设置 → LoRA 中重新扫描或安装`
      : "");
  const enqueueBlockReason = extending
    ? !videoReady
      ? "请先选择视频并等待读取完成"
      : trimDuration <= 0
        ? "请设置有效的视频保留范围"
        : !prompt.text.trim()
          ? "请先填写提示词"
          : !draft.workflowPath
            ? "请先选择视频续写 API 工作流"
            : !supportsVideoExtension
              ? "当前工作流未通过视频续写安全检查"
              : !safety.safe
                ? safety.message
                : !h3MotionContextReady
                  ? "请先在设置 → 节点与工作流中安装 H3 Motion Context，并重启 ComfyUI"
                : !spectrumReady
                  ? "请先在设置中安装并加载 Spectrum 节点"
                  : ""
    : !isR2V && !draft.startImagePath
      ? "请先选择首帧图片"
      : !prompt.text.trim()
        ? "请先填写提示词"
        : turboCoreBlockReason || turboLoraBlockReason || selectedLoraBlockReason
          ? turboCoreBlockReason || turboLoraBlockReason || selectedLoraBlockReason
          : !draft.workflowPath
            ? "请先选择该模型的 ComfyUI API 工作流"
            : !r2vSlotsReady
              ? "请先补齐 R2V 参考 Slot"
              : !safety.safe
                ? safety.message
                : !spectrumReady
                  ? "请先在设置中安装并加载 Spectrum 节点"
                  : "";
  const enqueueDisabled = Boolean(enqueueBlockReason);
  return `
    <section class="page-heading create-page-heading">
      <div class="page-heading-copy"><h1>创建视频</h1><p>${extending ? "裁出要保留的视频片段，并从末帧继续生成。" : "导入参考画面，调整提示词，然后加入本地生成队列。"}</p></div>
      <div class="create-page-actions">
        <div class="input-mode-switch" role="group" aria-label="创建模式">
          <button class="${extending ? "ghost" : "secondary active"} button-with-icon" data-input-mode="image" aria-pressed="${!extending}">${icon("image")}图生视频</button>
          <button class="${extending ? "secondary active" : "ghost"} button-with-icon" data-input-mode="video" aria-pressed="${extending}">${icon("video")}视频续写</button>
          <button class="ghost button-with-icon" data-input-mode="image-edit" aria-pressed="false">${icon("wand-sparkles")}图片处理</button>
        </div>
        <span class="save-state">自动保存</span>
      </div>
    </section>
    <div class="create-workspace ${isR2V ? "r2v-workspace" : ""}">
      <section class="panel media-panel">
      <div class="section-heading">
        <div><h2>${extending ? "输入视频" : isR2V ? "多参考 Slots" : "参考画面"}</h2><span class="muted">${extending ? "选择保留范围，续写将从范围末帧开始" : isR2V ? `图片 ${r2vCounts.imageCount}/9 · 视频 ${r2vCounts.videoCount}/3 · 视频会同步使用自身音轨` : supportsEndImage ? "当前工作流支持首帧和尾帧" : "当前工作流仅支持首帧"}</span></div>
        ${extending
          ? draft.sourceVideoPath ? `<button class="secondary button-with-icon" id="remove-video">${icon("x")}移除视频</button>` : ""
          : isR2V
            ? r2vCounts.total < 12 ? `<button class="secondary button-with-icon" id="add-h3-reference-slot" type="button">${icon("plus")}添加 Slot <small>${r2vCounts.total}/12</small></button>` : ""
            : `<button class="secondary button-with-icon" id="toggle-end" ${!supportsEndImage && !draft.endImagePath ? "disabled" : ""}>${icon(draft.endImagePath ? "x" : "images")}${draft.endImagePath ? "移除尾帧" : "添加尾帧"}</button>`}
      </div>
      ${extending
        ? draft.sourceVideoPath
          ? `<div class="video-editor">
              <video id="source-video" src="studio-media://draft/video?source=${encodeURIComponent(draft.sourceVideoPath)}" controls muted playsinline preload="metadata"></video>
              ${videoReady
                ? `<div class="trim-panel">
                    <div class="trim-heading"><strong>裁剪保留范围</strong><span><output id="trim-start-output">${formatTrimTime(draft.trimStartSeconds)}</output> — <output id="trim-end-output">${formatTrimTime(draft.trimEndSeconds)}</output></span></div>
                    <div class="trim-editor" id="trim-editor" style="--trim-start:${trimStartPercent}%;--trim-end:${trimEndPercent}%">
                      <div class="trim-filmstrip" aria-hidden="true">${Array.from({ length: 8 }, () => "<i></i>").join("")}</div>
                      <div class="trim-dim trim-dim-start"></div><div class="trim-dim trim-dim-end"></div><div class="trim-selection"></div>
                      <input class="trim-range" id="trim-start" type="range" min="0" max="${draft.sourceVideoDuration}" step="0.1" value="${draft.trimStartSeconds}" aria-label="裁剪起点" aria-valuetext="${formatTrimTime(draft.trimStartSeconds)}">
                      <input class="trim-range" id="trim-end" type="range" min="0" max="${draft.sourceVideoDuration}" step="0.1" value="${draft.trimEndSeconds}" aria-label="裁剪终点" aria-valuetext="${formatTrimTime(draft.trimEndSeconds)}">
                    </div>
                    <div class="trim-summary" aria-live="polite">
                      <span>保留<strong id="trim-kept">${trimDuration.toFixed(1)} 秒</strong></span>
                      <span>裁掉<strong id="trim-discarded">${Math.max(0, draft.sourceVideoDuration - trimDuration).toFixed(1)} 秒</strong></span>
                      <span>新增<strong id="trim-added">${draft.duration.toFixed(1)} 秒</strong></span>
                      <span>预计成片<strong id="trim-total">约 ${(trimDuration + draft.duration).toFixed(1)} 秒</strong></span>
                    </div>
                    <p class="trim-help">视频保持暂停；拖动左右手柄时预览对应画面。</p>
                  </div>`
                : `<p class="video-loading">正在读取视频时长和画面尺寸…</p>`}
            </div>`
            : `<button class="drop-zone video-drop-zone" id="pick-video" data-drop-video data-drop-label="松开以添加视频">
              <span class="drop-icon">${icon("video")}</span><strong>选择或拖入视频</strong><span>MP4、WebM、MOV、M4V、MKV</span>
            </button>`
        : isR2V
          ? h3ReferenceSlotsMarkup(draft)
        : `<div class="media-grid ${draft.endImagePath ? "paired" : ""}">
        <div class="media-slot">
          <button class="drop-zone ${draft.startImagePath ? "has-image" : ""}" id="pick-start" data-drop-frame="start" data-paste-frame="start" data-drop-label="${draft.startImagePath ? "松开以替换首帧" : "松开以添加首帧"}">
            ${draft.startImagePath
              ? `<img id="start-preview" alt="首帧预览"><span class="image-label">点击或拖入替换</span>`
                : `<span class="drop-icon">${icon("image")}</span><strong>选择或拖入首帧</strong><span>PNG、JPG、WEBP、BMP，也可直接粘贴截图</span>`}
          </button>
              ${draft.startImagePath ? `<button class="image-remove button-with-icon" data-clear-frame="start" aria-label="删除首帧" title="删除首帧">${icon("x")}<span>删除</span></button>` : ""}
        </div>
        ${draft.endImagePath
          ? `<div class="media-slot">
              <button class="drop-zone has-image" id="pick-end" data-drop-frame="end" data-paste-frame="end" data-drop-label="松开以替换尾帧"><img id="end-preview" alt="尾帧预览"><span class="image-label">点击或拖入替换</span></button>
              <button class="image-remove button-with-icon" data-clear-frame="end" aria-label="删除尾帧" title="删除尾帧">${icon("x")}<span>删除</span></button>
            </div>`
          : ""}
          </div>`}
      </section>
      <section class="panel composer">
      <div class="section-heading composer-heading">
        <div class="composer-heading-main">
          <h2>${extending ? "描述接下来发生什么" : "提示词"}</h2>
          <span class="muted">${draft.activePromptVersion + 1} / ${draft.promptVersions.length} · ${escapeHtml(prompt.label)}</span>
          <div class="prompt-version-controls">
            <button class="icon-button" id="prompt-prev" aria-label="上一版提示词" title="上一版提示词" ${draft.activePromptVersion === 0 ? "disabled" : ""}>${icon("chevron-left")}</button>
            <button class="icon-button" id="prompt-next" aria-label="下一版提示词" title="下一版提示词" ${draft.activePromptVersion >= draft.promptVersions.length - 1 ? "disabled" : ""}>${icon("chevron-right")}</button>
          </div>
        </div>
        <div class="prompt-action-controls">
          <select class="prompt-enhance-mode" id="prompt-enhance-mode" aria-label="扩写方式" title="${isMiniMaxH3 ? escapeHtml(h3PromptPresetDescriptions[activeH3PromptPreset]) : "选择提示词扩写方式"}">
            ${isMiniMaxH3
              ? h3PromptPresetOptions(activeH3PromptPreset, isR2V)
              : `<option value="sulphur-native" ${enhanceMode === "sulphur-native" ? "selected" : ""}>Sulphur 原生增强（推荐）</option>
                 <option value="faithful" ${enhanceMode === "faithful" ? "selected" : ""}>忠实扩写（需 Instruct 模型）</option>`}
          </select>
          <button class="icon-button prompt-runtime-button ${promptRuntimeBusy ? "busy" : ""}" id="release-prompt-model-create" ${promptRuntimeBusy || state.queueRunning || (!promptRuntimeLoaded && !promptStatus.ready) ? "disabled" : ""} aria-label="${escapeHtml(promptRuntimeControlTitle())}" title="${escapeHtml(promptRuntimeControlTitle())}" aria-busy="${promptRuntimeBusy}">${icon(promptRuntimeControlIcon())}</button>
          <button class="secondary button-with-icon" id="enhance-prompt" ${promptAiDisabled ? "disabled" : ""} title="${promptAiDisabled && state.queueRunning ? "当前有视频任务运行，暂不能启动提示词模型" : promptAiDisabled ? "正在生成提示词" : isGemmaPromptModel(state.settings.promptModelId) ? "使用 ComfyUI H3 Prompt Writer 优化" : "使用 ComfyUI 原生 Qwen 模型优化"}">${icon("sparkles")}${promptEnhancing ? "优化中…" : "优化提示词"}</button>
        </div>
      </div>
      <div class="prompt-editor-shell">
        <textarea id="prompt-input" rows="6" spellcheck="true" lang="${/[\u3400-\u9fff]/u.test(prompt.text) ? "zh-CN" : "en-US"}">${escapeHtml(prompt.text)}</textarea>
        <div id="prompt-word-counter" class="prompt-word-counter" aria-live="polite"></div>
      </div>
      <div class="prompt-tool-row">
        <label class="prompt-snippet-picker"><span>快速插入</span><select id="prompt-snippet"><option value="">选择镜头、动作、声音或对白片段</option>${promptSnippetOptions()}</select></label>
        <button class="secondary button-with-icon" id="insert-prompt-snippet" type="button" disabled>${icon("plus")}插入</button>
      </div>
      ${isMiniMaxH3 ? h3PromptCheckMarkup(prompt.text, Boolean(draft.endImagePath), h3Mode, draft.h3ReferenceSlots.some((slot) => slot.mediaType === "video")) : ""}
      ${extending && isMiniMaxH3 ? `<div class="h3-extension-note">
        <strong>${isR2V ? "H3 R2V Motion Context（推荐）" : "H3 结尾帧接续（兼容）"}</strong>
        <span>${isR2V
          ? `携带上一段最后 22 帧的运动与 32 kHz 音频；头部上下文会自动同步裁掉。${draft.h3ContextLatentPath ? "已找到上一段 latent，将跳过有损重编码。" : "当前使用像素/音频回退，完成后会保存 latent 供下一次接续。"} Spectrum 会被强制关闭。`
          : "从保留片段的最后一帧生成新段并保留 H3 原生音轨；不依赖额外节点，但边界动作可能发生变化。"}</span>
      </div>` : ""}
      ${isMiniMaxH3 && !extending ? `<details class="h3-prompt-helper">
        <summary>
          <span class="h3-helper-heading">
            <strong>H3 提示词助手 <span class="model-badge">可选</span></strong>
            <span>${h3Mode === "R2V" ? "R2V 多参考" : h3Mode === "FL2VA" ? "FL2VA 首尾帧" : h3Mode === "L2VA" ? "L2VA 尾帧" : h3Mode === "T2VA" ? "T2VA 纯文本" : "I2VA 首帧"} · 模板、检查和构建器</span>
          </span>
          <span class="h3-helper-toggle"><span class="when-closed">打开</span><span class="when-open">收起</span>${icon("chevron-down")}</span>
        </summary>
        <div class="h3-helper-body">
          <div class="h3-prompt-sections">
            <div><strong>${h3Mode === "R2V" ? "参考标签" : h3Mode === "T2VA" ? "文字时间轴" : "参考对齐"}</strong><span>${h3Mode === "R2V" ? "按顺序使用 Picture / Video 标签，并给每个参考分配作用。" : h3Mode === "T2VA" ? "不添加图片对齐句，直接从文字构建完整视听时间轴。" : h3Mode === "L2VA" ? "从合理的前置状态逐步收束到尾帧。" : "按官方格式先锁定首帧或首尾帧，再写连续动作。"}</span></div>
            <div><strong>时间轴</strong><span>用 [Shot 1] 开始；后续镜头写明确切时间。</span></div>
            <div><strong>声音与对白</strong><span>对白放入 d 标签；现场声和背景音乐分开描述。</span></div>
          </div>
          <div class="h3-helper-actions h3-helper-quick-actions">
            <span>从模板开始，或打开构建器逐项组合；都会新建版本，不覆盖当前提示词。</span>
            <button class="secondary button-with-icon" id="h3-prompt-template" type="button">${icon("list-ordered")}使用结构模板</button>
          </div>
          <details class="h3-builder-disclosure">
            <summary><span><strong>结构化构建器</strong><small>镜头、动作、连续性、声音和屏幕文字</small></span>${icon("chevron-down")}</summary>
            ${h3PromptBuilderMarkup()}
          </details>
        </div>
      </details>` : ""}
      <div class="composer-settings">
        <section class="composer-control-group composer-output-group">
          <div class="composer-group-heading"><div><strong>输出设置</strong><span>模型、画面比例和清晰度</span></div></div>
          <div class="composer-control-grid composer-output-grid">
        <label class="settings-field settings-model">模型
          <select id="model">
            ${createModelOptions(draft)}
          </select>
        </label>
        <label class="settings-field settings-ratio">画面比例
          <select id="ratio" ${extending ? "disabled" : ""}>
            ${["source", "16:9", "9:16", "1:1", "4:3"].map((ratio) =>
              `<option value="${ratio}" ${draft.ratio === ratio ? "selected" : ""}>${ratio === "source" ? extending ? "跟随输入视频" : "原图（未读取时按 16:9）" : ratio}</option>`
            ).join("")}
          </select>
        </label>
        <label class="settings-field settings-resolution">清晰度
          <select id="resolution" ${extending && !isMiniMaxH3 ? "disabled" : ""}>
            ${extending && !isMiniMaxH3
              ? `<option value="${state.settings.ltxExtensionResolution}" selected>${state.settings.ltxExtensionResolution}p · GGUF 保守预设</option>`
              : (isMiniMaxH3 ? [480, 540, 720, 768] as const : [480, 540, 720] as const).map((value) => {
                  const [width, height] = outputDimensions({
                    ...draft,
                    resolution: value
                  });
                  const recommended =
                    draft.modelId === "sulphur2" &&
                    value === 720 &&
                    (performanceMetrics?.vramTotalBytes ?? 0) >= 20 * 1024 ** 3;
                  const h3Label = isMiniMaxH3
                    ? value === 480
                      ? " · 低显存起步"
                      : value === 768
                        ? " · 高显存开放档"
                        : ""
                    : "";
                  const vramLabel = recommended && detectedVramTotalBytes > 0
                    ? ` · ${formatBytes(detectedVramTotalBytes)} 显存推荐`
                    : "";
                  return `<option value="${value}" ${draft.resolution === value ? "selected" : ""}>${value}p · ${width}×${height}${vramLabel}${h3Label}</option>`;
                }).join("")}
          </select>
        </label>
        ${isMiniMaxH3 ? `<label class="settings-field settings-steps">采样步数（H3）
          <select id="steps" aria-label="H3 采样步数" title="${escapeHtml(turboEnabled ? "LightX2V Turbo 建议使用 8 步；6 步用于快速预览，4 步可能损失动态和音频质量。" : "只影响 H3；其他模型沿用各自工作流设置。")}">
            ${turboEnabled
              ? `<option value="4" ${h3Steps === 4 ? "selected" : ""}>4 · 极限加速（实验）</option>
                <option value="6" ${h3Steps === 6 ? "selected" : ""}>6 · 加速预览</option>
                <option value="8" ${h3Steps === 8 || h3Steps > 8 ? "selected" : ""}>8 · 正式输出（推荐）</option>`
              : `<option value="20" ${h3Steps === 20 ? "selected" : ""}>20 · 标准质量（推荐）</option>
                <option value="16" ${h3Steps === 16 ? "selected" : ""}>16 · 平衡预览</option>
                <option value="12" ${h3Steps === 12 ? "selected" : ""}>12 · 快速预览</option>`}
          </select>
        </label>
        <label class="settings-field settings-spectrum">${fieldLabelWithTip("Spectrum 加速", extending && isR2V ? "Motion Context 官方建议关闭 Spectrum，避免固定上下文帧与音频质量退化。" : !spectrumEligible ? turboEnabled ? "LightX2V Turbo 当前使用专用低步数采样策略，不与 Spectrum 叠加。" : "当前模型暂不支持 Spectrum。" : !spectrumLoaded ? "请先在设置 → 节点与工作流中安装 Spectrum，并确认 ComfyUI 已重启加载。" : `Spectrum ${spectrumNode?.version ? `v${spectrumNode.version}` : "已加载"}，预计降低 20–35% 采样耗时；使用系统内存保存 H3 特征。`)}
          <select id="spectrum-mode" ${spectrumEligible && spectrumLoaded && !(extending && isR2V) ? "" : "disabled"} title="${escapeHtml(extending && isR2V ? "Motion Context 官方建议关闭 Spectrum，避免固定上下文行与音频质量退化。" : !spectrumEligible ? "当前模型暂不支持 Spectrum。" : !spectrumLoaded ? "请先在设置 → 节点与工作流中安装 Spectrum，并确认 ComfyUI 已重启加载。" : "使用系统内存保存 H3 特征；不会占用额外模型权重。")} ">
            <option value="off" ${draft.spectrumMode !== "balanced" ? "selected" : ""}>关闭 · 原生完整计算</option>
            <option value="balanced" ${draft.spectrumMode === "balanced" ? "selected" : ""}>平衡模式 · 系统内存</option>
          </select>
        </label>` : ""}
          </div>
          <div class="video-lora-stack">
            <div class="video-lora-stack-heading">
              <div><strong>${fieldLabelWithTip("LoRA 叠加", "LoRA 会按列表顺序叠加到当前基础模型。每个 LoRA 只能用于其声明兼容的模型和输入模式；强度通常从 0.6–1.0 起步，过高可能造成画面失真。")}</strong><span>${draft.videoLoras.length ? `已启用 ${draft.videoLoras.length} 个适配层` : "可选，不使用 LoRA 也可以正常生成"}</span></div>
              <div class="video-lora-add">
                <select id="video-lora-to-add" aria-label="选择要添加的 LoRA" ${installReadyLoraDefinitions.length ? "" : "disabled"}>
                  ${installReadyLoraDefinitions.length
                    ? installReadyLoraDefinitions.map((lora) => `<option value="${escapeHtml(lora.id)}">${escapeHtml(lora.name)}</option>`).join("")
                    : `<option value="">${!environmentScan ? "等待环境扫描" : addableLoraDefinitions.length ? "兼容 LoRA 尚未安装" : "没有更多兼容 LoRA"}</option>`}
                </select>
                <button class="secondary button-with-icon" id="add-video-lora" type="button" ${installReadyLoraDefinitions.length ? "" : "disabled"}>${icon("plus")}添加</button>
              </div>
            </div>
            ${draft.videoLoras.length
              ? `<div class="video-lora-list">${draft.videoLoras.map((lora, index) => `
                  <article class="video-lora-row" data-video-lora-id="${escapeHtml(lora.id)}">
                    <div class="video-lora-identity"><span class="video-lora-order">${index + 1}</span><div><span class="video-lora-name-line"><strong>${escapeHtml(lora.name)}</strong>${videoLoraInfoButton(lora)}</span><span>${escapeHtml(lora.modelFamily)} · ${videoLoraPurposeLabel(lora.purpose)}</span></div></div>
                    <label class="video-lora-strength"><span>强度</span><input type="range" min="0" max="2" step="0.05" value="${lora.strength}" data-video-lora-strength="${escapeHtml(lora.id)}"><input type="number" min="0" max="2" step="0.05" value="${lora.strength}" data-video-lora-strength-number="${escapeHtml(lora.id)}"></label>
                    <div class="video-lora-actions">
                      <button class="icon-button" type="button" data-move-video-lora="${escapeHtml(lora.id)}" data-direction="up" aria-label="上移 ${escapeHtml(lora.name)}" title="上移 LoRA" ${index === 0 ? "disabled" : ""}>${icon("move-up")}</button>
                      <button class="icon-button" type="button" data-move-video-lora="${escapeHtml(lora.id)}" data-direction="down" aria-label="下移 ${escapeHtml(lora.name)}" title="下移 LoRA" ${index === draft.videoLoras.length - 1 ? "disabled" : ""}>${icon("move-down")}</button>
                      <button class="icon-button" type="button" data-remove-video-lora="${escapeHtml(lora.id)}" aria-label="移除 ${escapeHtml(lora.name)}" title="移除 LoRA">${icon("x")}</button>
                    </div>
                  </article>`).join("")}</div>`
              : `<div class="video-lora-empty">未使用 LoRA</div>`}
            ${loraIssues.length ? `<div class="video-lora-issues">${loraIssues.map((issue) => `<div class="video-lora-issue ${issue.severity}">${icon(issue.severity === "error" ? "circle-alert" : "alert-triangle")}<span>${escapeHtml(issue.message)}</span></div>`).join("")}</div>` : ""}
          </div>
        </section>
        <section class="composer-control-group composer-motion-group">
          <div class="composer-group-heading"><div><strong>时间与运动</strong><span>控制片段长度、帧率和运动处理</span></div></div>
          <div class="composer-control-grid composer-motion-grid">
        <label class="settings-field settings-duration">${extending ? "新增时长" : "时长"}
          <div class="inline-field"><input id="duration" type="range" min="1" max="${safety.maxDurationSeconds}" value="${draft.duration}"><input id="duration-number" type="number" min="1" max="${safety.maxDurationSeconds}" value="${draft.duration}"><span>秒</span></div>
        </label>
        <label class="settings-field settings-fps">目标帧率
          <select id="fps" ${isMiniMaxH3 ? "disabled" : ""}>
            ${(isMiniMaxH3 ? [24] : [8, 12, 16, 24, 25, 30]).map((value) =>
              `<option value="${value}" ${draft.fps === value ? "selected" : ""}>${value} FPS</option>`
            ).join("")}
          </select>
        </label>
        ${isMiniMaxH3 ? "" : `<label class="settings-field settings-interpolation">Frame Interpolation
          <select id="frame-interpolation" ${isMiniMaxH3 ? "disabled" : ""}>
            <option value="off" ${draft.frameInterpolation === "off" ? "selected" : ""}>关闭 · 模型直接生成</option>
            <option value="rife2x" ${draft.frameInterpolation === "rife2x" ? "selected" : ""}>RIFE 2×</option>
            <option value="rife4x" ${draft.frameInterpolation === "rife4x" ? "selected" : ""}>RIFE 4×</option>
          </select>
        </label>
        <label class="settings-field settings-motion">动作幅度
          <select id="motion" ${isMiniMaxH3 ? "disabled" : ""}>
            <option value="subtle" ${draft.motion === "subtle" ? "selected" : ""}>轻微</option>
            <option value="natural" ${draft.motion === "natural" ? "selected" : ""}>自然</option>
            <option value="strong" ${draft.motion === "strong" ? "selected" : ""}>强烈</option>
          </select>
        </label>`}
          </div>
        </section>
        <section class="composer-control-group composer-seed-group">
          <div class="composer-group-heading"><div><strong>可复现性</strong><span>控制随机种子</span></div></div>
          <div class="composer-control-grid composer-seed-grid">
        <label class="settings-field settings-seed">随机 Seed
          <div class="inline-field seed-control"><input id="seed" type="number" placeholder="留空则随机" value="${draft.seed ?? ""}"><button class="secondary button-with-icon seed-random" id="random-seed" type="button" title="生成一个新的随机 Seed">${icon("refresh-cw")}随机</button><button class="icon-button" id="clear-seed" type="button" aria-label="清空 Seed" title="清空 Seed">${icon("x")}</button></div>
        </label>
          </div>
        </section>
        <div class="interpolation-summary settings-summary ${!safety.safe || !r2vSlotsReady ? "unsafe" : isMiniMaxH3 && (draft.duration > 10 || draft.resolution >= 768) ? "caution" : interpolation.multiplier === 1 ? "disabled" : ""}">
          <div><strong>${!r2vSlotsReady ? "请先补齐 R2V 参考 Slot" : !safety.safe ? "配置超过显存安全预算" : isMiniMaxH3 ? "H3 原生 24 FPS · 同步立体声音频" : interpolation.multiplier === 1 ? "未启用插帧" : `生成约 ${draft.fps / interpolation.multiplier} FPS，再插值到 ${draft.fps} FPS`}</strong><span>${interpolation.generatedFrames}/${safety.maxGeneratedFrames} 个模型帧 → ${interpolation.outputFrames} 个成片帧</span></div>
          <p>${escapeHtml(!r2vSlotsReady ? "R2V 至少需要一张已选择的参考图片；空 Slot 不能提交。" : safety.message)} ${safety.safe && r2vSlotsReady && interpolation.multiplier !== 1 ? "扩散模型和 VAE 会在 RIFE 前主动卸载；RIFE 使用 BF16、单帧批次。" : ""}</p>
        </div>
      </div>
      <div class="workflow-field composer-workflow-field">
        <div><strong>ComfyUI API 工作流</strong><p class="muted">${extending && !supportsVideoExtension ? `${selectedModelProfile?.available ? `${modelName(draft.modelId)} 模型组件已安装完整；` : "模型组件尚未安装完整；"}当前工作流未通过原生续写安全检查。` : draft.workflowPath ? escapeHtml(Object.values(bundledWorkflows).find((workflow) => workflow.path === draft.workflowPath)?.label ?? draft.workflowPath) : "为当前模型选择从 ComfyUI 导出的 API 格式 JSON"}</p></div>
        <button class="secondary button-with-icon" id="pick-workflow">${icon("workflow")}${draft.workflowPath ? "更换 JSON" : "选择 JSON"}</button>
      </div>
      <p class="submit-feedback error" data-enqueue-feedback role="status" ${enqueueBlockReason ? "" : "hidden"}>${escapeHtml(enqueueBlockReason)}</p>
      <div class="submit-row composer-submit-row">
        <button class="ghost danger button-with-icon" id="clear-draft">${icon("trash-2")}清空</button>
        <button class="primary button-with-icon enqueue-button ${enqueueBusy ? "busy" : ""}" id="enqueue" data-enqueue-block-reason="${escapeHtml(enqueueBlockReason)}" data-enqueue-ready-title="${escapeHtml(isR2V ? "加入 R2V 多参考生成队列" : extending ? "加入视频续写队列" : "加入本地生成队列")}" ${enqueueDisabled || enqueueBusy ? "disabled" : ""} aria-busy="${enqueueBusy}" title="${escapeHtml(enqueueBlockReason || (isR2V ? "加入 R2V 多参考生成队列" : extending ? "加入视频续写队列" : "加入本地生成队列"))}">${icon(enqueueBusy ? "refresh-cw" : "plus", "enqueue-spinner")}<span data-enqueue-label>${enqueueBusy ? "加入中…" : "加入队列"}</span></button>
      </div>
      </section>
    </div>`;
}

function queuePage(): string {
  const running = state.queue.find((task) => task.status === "running");
  const activeTasks = state.queue.filter((task) => task.status === "waiting" || task.status === "running");
  const attentionTasks = state.queue.filter((task) => task.status === "failed" || task.status === "cancelled");
  const waitingCount = activeTasks.filter((task) => task.status === "waiting").length;
  const remainingSeconds = queueRemainingSeconds(activeTasks);
  const queueStatus = running
    ? "当前任务正在运行"
    : activeTasks.some((task) => task.status === "waiting")
      ? "等待任务已暂停"
      : attentionTasks.length
        ? "有任务需要处理"
        : "队列为空";
  return `
    <section class="page-heading queue-page-heading">
      <div class="queue-page-heading-main">
        <div class="queue-heading-line">
          <h1>生成队列</h1>
          <div class="queue-overview" aria-label="队列概览">
            <div class="queue-overview-item"><span>等待中</span><strong id="queue-waiting-count">${waitingCount}</strong></div>
            <div class="queue-overview-item"><span>预计剩余</span><strong id="queue-eta">${queueEstimateText(remainingSeconds)}</strong><small id="queue-eta-note">${remainingSeconds == null ? "完成首条任务后更准确" : "按历史耗时与当前进度"}</small></div>
          </div>
        </div>
        <p>${activeTasks.length} 项执行任务 · ${attentionTasks.length} 项需处理 · ${queueStatus}</p>
      </div>
      <div class="button-row">
        ${running ? `<span class="queue-mode">${state.queueRunning ? "自动继续后续任务" : "本条完成后暂停"}</span>` : `<button class="primary button-with-icon" id="start-queue" ${state.queue.some((task) => task.status === "waiting") ? "" : "disabled"}>${icon("play")}开始队列</button>`}
      </div>
    </section>
    <section class="performance-grid" aria-label="性能监测">
      ${performanceCard("CPU", "metric-cpu", performanceMetrics?.cpuPercent, "%")}
      ${performanceCard("系统内存", "metric-memory", performanceMetrics && performanceMetrics.memoryTotalBytes > 0 ? performanceMetrics.memoryUsedBytes / performanceMetrics.memoryTotalBytes * 100 : null, "%", performanceMetrics && performanceMetrics.memoryTotalBytes > 0 ? `${formatBytes(performanceMetrics.memoryUsedBytes)} / ${formatBytes(performanceMetrics.memoryTotalBytes)}` : "")}
      ${performanceCard("GPU", "metric-gpu", performanceMetrics?.gpuPercent, "%", performanceMetrics?.gpuTemperature != null ? `${performanceMetrics.gpuTemperature}°C` : "")}
      ${performanceCard("显存", "metric-vram", performanceMetrics?.vramUsedBytes != null && performanceMetrics.vramTotalBytes ? performanceMetrics.vramUsedBytes / performanceMetrics.vramTotalBytes * 100 : null, "%", performanceMetrics?.vramUsedBytes != null && performanceMetrics.vramTotalBytes != null ? `${formatBytes(performanceMetrics.vramUsedBytes)} / ${formatBytes(performanceMetrics.vramTotalBytes)}` : "")}
    </section>
    ${state.queue.length === 0
        ? `<div class="empty panel"><h2>队列还是空的</h2><p>从创建页加入一个任务后，就可以在这里运行。</p><button class="secondary button-with-icon" data-page="create">${icon("plus")}去创建</button></div>`
      : `<section class="queue-section"><div class="queue-section-heading"><div><h2>执行队列</h2><span class="muted">等待和当前运行中的任务按此顺序执行。</span></div><span class="model-badge">${activeTasks.length} 项</span></div><div class="task-list">${activeTasks.length ? activeTasks.map((task, index) => queueTaskCard(task, index + 1)).join("") : `<div class="empty panel queue-section-empty"><h2>没有等待中的任务</h2><p>下面的任务需要重试、编辑或移除。</p></div>`}</div></section>${attentionTasks.length ? `<section class="queue-section queue-attention-section"><div class="queue-section-heading"><div><h2>需要处理</h2><span class="muted">失败和取消的任务不会自动占用执行队列。</span></div><span class="model-badge warning-badge">${attentionTasks.length} 项</span></div><div class="task-list">${attentionTasks.map((task) => queueTaskCard(task, 0)).join("")}</div></section>` : ""}`}
    `;
}

type QueueTaskInput =
  | { kind: "image"; path: string }
  | { kind: "video"; path: string };

function queueTaskInput(task: QueueTask): QueueTaskInput | null {
  if (task.taskType === "image-generation" && task.pictures[0]?.absolutePath) {
    return { kind: "image", path: task.pictures[0].absolutePath };
  }
  if (task.taskType === "generation" && task.startImagePath) {
    return { kind: "image", path: task.startImagePath };
  }
  if (task.taskType === "extension" && task.sourceVideoPath) {
    return { kind: "video", path: task.sourceVideoPath };
  }
  if (task.taskType === "upscale" && task.sourceFilePath) {
    return { kind: "video", path: task.sourceFilePath };
  }
  return null;
}

function queueTaskInputUrl(task: QueueTask): string {
  return queueTaskInput(task)
    ? `studio-media://queue/${encodeURIComponent(task.id)}`
    : "";
}

function captureQueueMoveAnchor(button: HTMLButtonElement): void {
  const taskId = button.dataset.move;
  const direction = Number(button.dataset.direction);
  if (!taskId || (direction !== -1 && direction !== 1)) return;
  queueMoveScrollAnchor = {
    taskId,
    direction,
    viewportTop: button.getBoundingClientRect().top
  };
}

function restoreQueueMoveAnchor(): void {
  const anchor = queueMoveScrollAnchor;
  if (!anchor) return;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      if (queueMoveScrollAnchor !== anchor) return;
      const button = [...document.querySelectorAll<HTMLButtonElement>("[data-move]")]
        .find((candidate) =>
          candidate.dataset.move === anchor.taskId &&
          Number(candidate.dataset.direction) === anchor.direction
        );
      if (!button) return;
      const delta = button.getBoundingClientRect().top - anchor.viewportTop;
      if (Math.abs(delta) > 0.5) {
        window.scrollBy({ top: delta, behavior: "auto" });
      }
      queueMoveScrollAnchor = null;
    });
  });
}

async function loadQueueInputPreviews(): Promise<void> {
  const tasks = state.queue.filter(
    (task) => queueTaskInput(task) !== null
  );
  await Promise.all(tasks.map(async (task) => {
    const input = queueTaskInput(task);
    if (!input) return;
    if (input.kind === "video") {
      document.querySelectorAll<HTMLVideoElement>(
        `[data-queue-input-video="${task.id}"]`
      ).forEach((video) => {
        const revealVideo = () => {
          try {
            video.currentTime = 0;
          } catch {
            // Some containers expose the first frame only after metadata settles.
          }
          video.closest<HTMLElement>("[data-queue-input-preview], .live-preview")
            ?.querySelector<HTMLElement>("[data-queue-input-empty]")
            ?.setAttribute("hidden", "");
        };
        if (video.readyState >= 2) revealVideo();
        else video.addEventListener("loadeddata", revealVideo, { once: true });
      });
      return;
    }
    const image = document.querySelector<HTMLImageElement>(
      `[data-queue-input-image="${task.id}"]`
    );
    if (!image) return;
    try {
      const dataUrl = await window.studio.readImage(input.path);
      if (!dataUrl) return;
      image.src = dataUrl;
      image.style.display = "";
      image.closest<HTMLElement>("[data-queue-input-preview]")
        ?.querySelector<HTMLElement>("[data-queue-input-empty]")
        ?.setAttribute("hidden", "");
    } catch {
      // The task can remain visible even when its source image was moved.
    }
  }));
}

function queueTaskCard(task: QueueTask, queuePosition: number): string {
  const description = task.taskType === "image-generation"
    ? `${task.prompt} · ${task.outputCount} 张候选图`
    : task.taskType === "generation"
    ? task.prompt
    : task.taskType === "extension"
      ? `${task.prompt} · 保留 ${task.trimStartSeconds.toFixed(1)}–${task.trimEndSeconds.toFixed(1)} 秒`
      : `${task.sourceFilename} → ${task.outputFilename}`;
  const upscaleOutput = task.taskType === "upscale"
    ? upscaleDimensions(task.sourceWidth, task.sourceHeight, task.targetHeight)
    : null;
  const h3ComputeSummary = task.taskType !== "upscale" && task.taskType !== "image-generation" && isMiniMaxH3Model(task.modelId)
    ? task.spectrumMode === "balanced"
        ? `<span title="Spectrum 已开启；H3 特征历史保存在系统内存">${normalizeH3Steps(task.steps, task.modelId, task.videoLoras)} 步 · Spectrum 开</span>`
        : `<span title="Spectrum 已关闭；使用 H3 原生完整计算">${normalizeH3Steps(task.steps, task.modelId, task.videoLoras)} 步 · Spectrum 关</span>`
    : "";
  const loraSummary = task.taskType !== "image-generation" && task.videoLoras?.length
    ? `<span>LoRA · ${task.videoLoras.map((lora) => escapeHtml(lora.name)).join(" + ")}</span>`
    : "";
  const seedText = task.taskType === "image-generation" ? "批次内独立" : String(task.seed);
  const metadata = task.taskType === "image-generation"
    ? `<span>图片处理</span><span>${escapeHtml(modelName(task.modelId))}</span><span>${task.outputCount} 张候选图</span><span>${escapeHtml(task.qualityProfile)}</span><span>PNG 中间输出</span>`
    : task.taskType === "generation"
    ? `<span>${escapeHtml(modelName(task.modelId))}</span>${loraSummary}<span>${task.resolution}p</span><span>${task.duration}秒</span><span>${frameRateSummary(task.fps, task.frameInterpolation)}</span>${h3ComputeSummary}<span>Seed ${escapeHtml(seedText)}</span>`
    : task.taskType === "extension"
      ? `<span>视频续写</span><span>${escapeHtml(modelName(task.modelId))}</span><span>${task.resolution}p</span><span>最多 ${task.maxGeneratedFrames} 模型帧</span><span>${task.overlapFrames} 帧上下文</span>${h3ComputeSummary}`
      : `<span>分辨率提升</span><span>${escapeHtml(modelName(task.modelId))}</span><span>${upscaleOutput![0]} × ${upscaleOutput![1]}</span><span>分批处理 · 每批卸载</span>`;
  const attentionTask = task.status === "failed" || task.status === "cancelled";
  const retrySummary = task.automaticRetryAttempt
    ? `<span class="queue-retry-status">自动重试第 ${task.automaticRetryAttempt} 次</span>`
    : "";
  const rankMarkup = queuePosition > 0
    ? `<strong>${String(queuePosition).padStart(2, "0")}</strong><small>队位</small>`
    : `<strong>!</strong><small>需处理</small>`;
  if (task.status === "running") {
    const preview = taskPreviews[task.id] ?? "";
    const input = queueTaskInput(task);
    const inputVideoUrl = input?.kind === "video" ? queueTaskInputUrl(task) : "";
    return `
      <article class="task-card panel running expanded">
        <div class="expanded-task-head">
          <div class="queue-task-heading"><div class="queue-rank running" aria-label="队列第 ${queuePosition} 项"><strong>${String(queuePosition).padStart(2, "0")}</strong><small>当前</small></div><div><div class="running-status-line"><span class="status running">正在运行</span><span class="running-elapsed-prominent" id="running-elapsed">${elapsedText(task.startedAt)}</span></div><h3>${escapeHtml(task.outputFilename)}</h3></div></div>
          <div class="running-progress-value"><span>总进度</span><strong id="running-progress-label">${Math.round(task.progress ?? 0)}%</strong></div>
        </div>
        <div class="running-layout">
          <div class="live-preview">
            <img id="live-preview-image" ${input?.kind === "image" ? `data-queue-input-image="${escapeHtml(task.id)}"` : ""} alt="${input ? "用户输入或 ComfyUI 实时预览" : "ComfyUI 实时预览"}" src="${preview ? escapeHtml(preview) : ""}" style="${preview ? "" : "display:none"}">
            ${inputVideoUrl ? `<video data-queue-input-video="${escapeHtml(task.id)}" muted playsinline preload="metadata" src="${inputVideoUrl}" style="${preview ? "display:none" : ""}"></video>` : ""}
            <div id="live-preview-empty" style="${preview || inputVideoUrl ? "display:none" : ""}"><span>${icon(input ? input.kind === "image" ? "image" : "film" : "film")}</span><strong>${input ? "正在读取输入画面" : "等待 ComfyUI 预览帧"}</strong><small>${input ? "ComfyUI 返回实时帧后会自动替换" : "部分节点只会在采样过程中发送预览"}</small></div>
          </div>
          <div class="running-copy">
            <span class="eyebrow">当前步骤 · <span id="running-stage">${escapeHtml(task.stage ?? "准备中")}</span></span>
            <div class="progress" role="progressbar" aria-label="任务总进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(task.progress ?? 0)}"><span id="running-progress-bar" style="width:${task.progress ?? 0}%"></span></div>
            <p class="task-description">${escapeHtml(description)}</p>
            <div class="task-meta">${metadata}<span id="running-stage-elapsed">${queueStageElapsedText(task)}</span><span id="running-eta">预计剩余 ${queueEstimateText(queueTaskRemainingSeconds(task))}</span></div>
            <div class="running-controls">
              <button class="secondary button-with-icon" id="${state.queueRunning ? "pause-queue" : "start-queue"}">${icon(state.queueRunning ? "pause" : "play")}${state.queueRunning ? "本条完成后暂停" : "继续执行后续任务"}</button>
              <button class="danger secondary button-with-icon" data-cancel="${task.id}" ${queueActionBusy?.taskId === task.id ? "disabled" : ""}>${icon("ban")}${queueActionBusy?.taskId === task.id && queueActionBusy.action === "cancel" ? "取消中…" : "取消当前任务"}</button>
            </div>
            <p class="control-hint">${state.queueRunning ? "暂停不会冻结当前 GPU 计算；当前任务完成后不会启动下一条。" : "当前任务仍会继续运行，后续任务已暂停。"}</p>
          </div>
        </div>
      </article>`;
  }
  const input = queueTaskInput(task);
  const inputVideoUrl = input?.kind === "video" ? queueTaskInputUrl(task) : "";
  const inputPreview = input
    ? `<div class="task-input-preview" data-queue-input-preview="${escapeHtml(task.id)}">${input.kind === "image" ? `<img data-queue-input-image="${escapeHtml(task.id)}" alt="用户输入图片" style="display:none">` : `<video data-queue-input-video="${escapeHtml(task.id)}" muted playsinline preload="metadata" src="${inputVideoUrl}"></video>`}<div data-queue-input-empty><span>${icon(input.kind === "image" ? "image" : "film")}</span><small>${input.kind === "image" ? "输入画面" : "源视频"}</small></div></div>`
    : "";
  return `
    <article class="task-card panel ${task.status}${inputPreview ? " task-card-with-preview" : ""}">
      ${inputPreview}
      <div class="task-main">
        <div class="queue-task-heading"><div class="queue-rank ${attentionTask ? "attention" : task.status}" aria-label="${attentionTask ? "需要处理的任务" : `队列第 ${queuePosition} 项`}">${rankMarkup}</div><div><span class="status ${task.status}">${statusLabel(task.status)}</span><h3>${escapeHtml(task.outputFilename)}</h3></div></div>
        <p class="task-description">${escapeHtml(description)}</p>
        <div class="task-meta">${metadata}${retrySummary}</div>
        ${task.error ? `<p class="error">${escapeHtml(task.error)}</p>` : ""}
      </div>
      <div class="task-actions">
        ${task.status === "waiting" ? `<div class="button-row"><button class="icon-button" data-move="${task.id}" data-direction="-1" aria-label="上移" title="上移">${icon("move-up")}</button><button class="icon-button" data-move="${task.id}" data-direction="1" aria-label="下移" title="下移">${icon("move-down")}</button></div>` : ""}
        ${task.status === "waiting" || task.status === "failed" || task.status === "cancelled"
          ? task.taskType === "upscale"
            ? `<button class="secondary button-with-icon" data-edit-upscale-task="${task.id}" ${queueActionBusy?.taskId === task.id && queueActionBusy.action === "edit" ? "disabled" : ""} title="带回提升设置并重新加入队列">${icon("sliders-horizontal")}${queueActionBusy?.taskId === task.id && queueActionBusy.action === "edit" ? "打开中…" : task.status === "waiting" ? "编辑" : "编辑并重新加入"}</button>`
            : `<button class="secondary button-with-icon" data-edit-task="${task.id}" ${queueActionBusy?.taskId === task.id && queueActionBusy.action === "edit" ? "disabled" : ""} title="带回创建页调整参数并重新加入队列">${icon("sliders-horizontal")}${queueActionBusy?.taskId === task.id && queueActionBusy.action === "edit" ? "带回中…" : "编辑并重新加入"}</button>`
          : ""}
        <button class="secondary button-with-icon" data-duplicate="${task.id}">${icon("copy")}复制</button>
        ${task.status === "failed" || task.status === "cancelled" ? `<button class="secondary button-with-icon" data-reset-task="${task.id}" title="清除失败状态并恢复为普通等待任务">${icon("rotate-ccw")}重置状态</button>` : ""}
        <button class="ghost danger button-with-icon" data-remove="${task.id}" ${queueActionBusy?.taskId === task.id ? "disabled" : ""}>${icon("trash-2")}${queueActionBusy?.taskId === task.id && queueActionBusy.action === "remove" ? "移除中…" : "移除"}</button>
      </div>
    </article>`;
}

function statusLabel(status: string): string {
  return { waiting: "等待", running: "运行中", completed: "完成", failed: "失败", cancelled: "已取消" }[status] ?? status;
}

function draftFromQueueTask(task: QueueTask): Draft | null {
  if (task.taskType === "upscale" || task.taskType === "image-generation" || task.status === "running") return null;
  const now = new Date().toISOString();
  const resolution = [480, 540, 720, 768].includes(task.resolution)
    ? task.resolution as Draft["resolution"]
    : 480;
  const extension = task.taskType === "extension";
  return {
    ...state.draft,
    inputMode: extension ? "video" : "image",
    startImagePath: extension ? "" : task.startImagePath,
    sourceWidth: task.sourceWidth,
    sourceHeight: task.sourceHeight,
    endImagePath: extension ? "" : task.endImagePath,
    sourceVideoPath: extension ? task.sourceVideoPath : "",
    sourceVideoDuration: extension ? task.sourceVideoDuration : 0,
    trimStartSeconds: extension ? task.trimStartSeconds : 0,
    trimEndSeconds: extension ? task.trimEndSeconds : 0,
    sourceAssetId: extension ? task.sourceAssetId : undefined,
    sourceVersionId: extension ? task.sourceVersionId : undefined,
    promptVersions: [{
      id: crypto.randomUUID(),
      label: "从队列调整",
      text: task.prompt,
      createdAt: now
    }],
    activePromptVersion: 0,
    h3ReferenceSlots: extension ? [] : (task.h3ReferenceSlots ?? []).map((slot) => ({ ...slot })),
    modelId: task.modelId,
    videoLoras: task.videoLoras?.map((lora) => ({ ...lora })) ?? [],
    workflowPath: task.workflowPath,
    ratio: task.ratio,
    resolution,
    duration: task.duration,
    steps: normalizeH3Steps(task.steps, task.modelId, task.videoLoras),
    fps: task.fps,
    frameInterpolation: task.frameInterpolation,
    motion: task.motion,
    seed: task.seed,
    keepSeedOnCopy: task.keepSeedOnCopy
  };
}

async function editQueueTask(taskId: string): Promise<void> {
  const task = state.queue.find((item) => item.id === taskId);
  if (!task || task.status === "running") return;
  queueActionBusy = { taskId, action: "edit" };
  render();
  try {
    if (task.taskType === "image-generation") {
      const imageDraft = imageEditDraftFromQueueTask(task, state.imageDraft);
      state = await window.studio.saveImageDraft(imageDraft);
      state = await window.studio.removeTask(taskId);
      page = "create";
      creationMode = "image-edit";
      queueActionBusy = null;
      showMessage("已带回图片创作页，可调整参数后重新加入队列。");
      render();
      return;
    }
    const draft = draftFromQueueTask(task);
    if (!draft) return;
    await saveDraftImmediately(draft);
    state = await window.studio.removeTask(taskId);
    page = "create";
    queueActionBusy = null;
    showMessage("已带回创建页，可调整参数后重新加入队列。");
  } catch (error) {
    queueActionBusy = null;
    showMessage(error instanceof Error ? error.message : "无法编辑该队列任务");
  }
}

function historyAssetsByNewest(): AppState["history"] {
  return [...state.history].sort((left, right) => {
    const leftTime = Date.parse(left.updatedAt || left.createdAt);
    const rightTime = Date.parse(right.updatedAt || right.createdAt);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return 0;
  });
}

function historyCardsByOrder(gallery: HTMLElement): HTMLElement[] {
  return [...gallery.querySelectorAll<HTMLElement>(".history-gallery-item")].sort(
    (left, right) =>
      Number(left.dataset.historyOrder ?? Number.MAX_SAFE_INTEGER) -
      Number(right.dataset.historyOrder ?? Number.MAX_SAFE_INTEGER)
  );
}

function imageHistoryPage(): string {
  const projects = imageProjectsByNewest();
  const cards = projects.map((project, historyOrder) => {
    const version = preferredImageVersion(project);
    const mediaUrl = imageHistoryMediaUrl(project, version);
    const title = project.title.trim() || "未命名图片";
    const iterationCount = Math.max(0, project.versions.filter((item) => item.kind !== "source").length);
    return `
      <article class="history-gallery-item panel image-history-gallery-item" data-history="${escapeHtml(project.id)}" data-history-kind="image" data-history-order="${historyOrder}" tabindex="0" aria-label="${escapeHtml(title)}，打开图片详情；右键查看更多操作" title="${escapeHtml(title)}">
        <div class="history-media image-history-media" style="--media-ratio:${version.width || 1} / ${version.height || 1}">
          ${mediaUrl
            ? `<img src="${escapeHtml(mediaUrl)}" loading="lazy" alt="${escapeHtml(title)}" data-image-history-preview data-image-history-cache-key="${escapeHtml(imageHistoryThumbnailCacheKey(project, version))}" data-image-history-source="${escapeHtml(version.file.absolutePath ?? "")}">`
            : `<div class="history-media-fallback"><span>${icon("image")}</span><small>找不到图片文件</small></div>`}
          <div class="history-media-badges">
            <span class="media-chip history-model-chip">${escapeHtml(version.kind === "source" ? "原始图片" : modelName(version.modelId))}</span>
            <span class="media-chip">${version.width > 0 && version.height > 0 ? `${version.width} × ${version.height}` : "尺寸未知"}</span>
            <span class="media-chip history-version-count-chip">${project.versions.length} 个版本</span>
          </div>
          <span class="image-project-kind">${icon("workflow")}${iterationCount ? `${iterationCount} 次迭代` : "原始素材"}</span>
        </div>
        <div class="history-gallery-copy">
          <h3 class="history-card-title" title="${escapeHtml(title)}"><span class="history-card-title-track"><span>${escapeHtml(title)}</span><span aria-hidden="true">${escapeHtml(title)}</span></span></h3>
          <code class="history-card-filename">${escapeHtml(version.file.filename)}</code>
          <div class="history-card-meta"><span>${escapeHtml(formatFullHistoryTime(project.updatedAt || version.createdAt))}</span><span>最新版本 v${version.versionNumber}</span></div>
        </div>
      </article>`;
  }).join("");
  return `
    ${historyHeading("一个图片项目包含原始素材和全部后续编辑版本；选择满意版本后可继续编辑或送入视频 Slot 1。")}
    <section class="history-gallery ${historyLayout}">
      ${projects.length === 0
        ? `<div class="empty panel"><h2>还没有图片项目</h2><p>图片处理队列完成后，项目会自动出现在这里。</p></div>`
        : cards}
    </section>`;
}

function historyPage(): string {
  if (historyKind === "image") return imageHistoryPage();
  const orderedAssets = historyAssetsByNewest();
  const cards = orderedAssets.map((asset, historyOrder) => {
    const version = preferredVersion(asset);
    const historyTitle = asset.title.trim() || asset.prompt.trim() || "未命名视频";
    const videoIndex = versionVideoIndex(version);
    const mediaUrl = historyMediaUrl(asset, version);
    const coverKey = historyCoverCacheKey(asset, version);
    const coverSeed = historyCoverSeed(asset.id, version.id);
    const coverTime = historyInitialCoverTime(asset.duration, coverSeed);
    return `
      <article class="history-gallery-item panel" data-history="${asset.id}" data-history-kind="video" data-history-order="${historyOrder}" tabindex="0" aria-label="${escapeHtml(historyTitle)}，打开详情；右键查看更多操作" title="${escapeHtml(historyTitle)}">
        <div class="history-media${mediaUrl ? " media-loading" : ""}" style="--media-ratio:${version.width} / ${version.height}" data-history-media data-cover-key="${escapeHtml(coverKey)}" data-cover-source="${escapeHtml(version.files[videoIndex]?.absolutePath ?? "")}" data-cover-time="${coverTime}" data-cover-seed="${coverSeed}" data-preview-duration="${asset.duration}">
          ${mediaUrl
            ? `<video muted loop playsinline preload="none" data-history-src="${escapeHtml(mediaUrl)}"></video>`
            : `<div class="history-media-fallback"><span>${icon("play")}</span><small>找不到视频文件</small></div>`}
          ${mediaUrl ? `<img class="history-cover-image" data-history-cover-image="${asset.id}" alt="">` : ""}
          ${mediaUrl ? `<div class="history-media-loading" role="status"><span class="history-loading-spinner" aria-hidden="true"></span><small>正在加载封面</small></div>` : ""}
          ${mediaUrl ? `<div class="history-media-error" aria-live="polite"><span>${icon("film")}</span><small>视频预览加载失败，点击卡片仍可打开详情</small></div>` : ""}
          <div class="history-media-badges">
            <span class="media-chip history-model-chip">${escapeHtml(modelName(version.modelId))}</span>
            <span class="media-chip">${historyResolutionLabel(asset, version)}</span>
            <span class="media-chip history-version-count-chip">${asset.versions.length} 个版本</span>
            <span class="media-chip">${formatVideoDuration(asset.duration)}</span>
          </div>
          ${mediaUrl ? `<span class="history-preview-state">${icon("play")}正在预览</span><button type="button" class="history-preview-progress" role="slider" aria-label="调整预览进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="等待视频加载"><i></i></button>` : ""}
        </div>
        <div class="history-gallery-copy">
          <h3 class="history-card-title" title="${escapeHtml(historyTitle)}"><span class="history-card-title-track"><span>${escapeHtml(historyTitle)}</span><span aria-hidden="true">${escapeHtml(historyTitle)}</span></span></h3>
          <code class="history-card-filename">${escapeHtml(version.files[videoIndex]?.filename ?? version.outputFilename)}</code>
          <div class="history-card-meta"><span>${escapeHtml(formatFullHistoryTime(version.createdAt))}</span><span>渲染 ${escapeHtml(historyRenderDuration(version))}</span></div>
        </div>
      </article>`;
  }).join("");
  return `
    ${historyHeading("封面读取持久缓存；悬停才加载并播放原视频，退出后回到稳定封面。")}
    <section class="history-gallery ${historyLayout}">
      ${state.history.length === 0
        ? `<div class="empty panel"><h2>还没有完成的视频</h2><p>队列完成后，结果会自动出现在这里。</p></div>`
        : cards}
    </section>`;
}

function captureHistoryLayoutAnchor(): { assetId: string; offsetFromCenter: number } | null {
  if (window.scrollY <= 1) return null;
  const heading = document.querySelector<HTMLElement>(".history-heading");
  if (heading) {
    const stickyTop = Number.parseFloat(getComputedStyle(heading).top) || 0;
    if (heading.getBoundingClientRect().top > stickyTop + 1) return null;
  }
  const cards = [...document.querySelectorAll<HTMLElement>(".history-gallery-item")];
  if (!cards.length) return null;
  const viewportCenter = window.innerHeight / 2;
  const card = cards.reduce((closest, candidate) => {
    const closestRect = closest.getBoundingClientRect();
    const candidateRect = candidate.getBoundingClientRect();
    return Math.abs(candidateRect.top + candidateRect.height / 2 - viewportCenter) <
      Math.abs(closestRect.top + closestRect.height / 2 - viewportCenter)
      ? candidate
      : closest;
  });
  const rect = card.getBoundingClientRect();
  return {
    assetId: card.dataset.history ?? "",
    offsetFromCenter: rect.top + rect.height / 2 - viewportCenter
  };
}

function restoreHistoryLayoutAnchor(): void {
  if (historyLayoutRestoreFrame !== null) {
    window.cancelAnimationFrame(historyLayoutRestoreFrame);
    historyLayoutRestoreFrame = null;
  }
  const anchor = historyLayoutAnchor;
  historyLayoutAnchor = null;
  if (!anchor?.assetId) return;
  historyLayoutRestoreFrame = window.requestAnimationFrame(() => {
    historyLayoutRestoreFrame = null;
    const card = [...document.querySelectorAll<HTMLElement>(".history-gallery-item")]
      .find((item) => item.dataset.history === anchor.assetId);
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const desiredCenter = window.innerHeight / 2 + anchor.offsetFromCenter;
    const delta = rect.top + rect.height / 2 - desiredCenter;
    if (Math.abs(delta) < 1) return;
    window.scrollBy({ top: delta, behavior: "auto" });
  });
}

function restoreHistoryScrollPosition(): void {
  const position = Math.max(0, historyScrollPosition);
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      if (page !== "history") {
        historyScrollRestorePending = false;
        return;
      }
      window.scrollTo({ top: position, behavior: "auto" });
      historyScrollRestorePending = false;
    });
  });
}

function bindPageViewportControls(): void {
  const events = new AbortController();
  pageViewportEvents = events;
  const backTop = document.querySelector<HTMLButtonElement>("#history-back-top");
  const update = (capturePosition = true) => {
    if (capturePosition && page === "history" && !historyScrollRestorePending) {
      historyScrollPosition = window.scrollY;
    }
    backTop?.classList.toggle("visible", window.scrollY > 260);
  };
  window.addEventListener("scroll", () => update(), {
    passive: true,
    signal: events.signal
  });
  backTop?.addEventListener("click", () => {
    reportUserAction(page === "history" ? "history-scroll-top" : "page-scroll-top");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, { signal: events.signal });
  update(false);
}

function historyMasonryColumnCount(width: number, gap = 10): number {
  if (width <= 480) return 1;
  const minimumCardWidth = 300;
  const maximumCardWidth = 520;
  const minimumColumns = 3;
  const maximumColumns = 5;
  let columns = minimumColumns;
  const cardWidth = (columnCount: number) =>
    (width - gap * (columnCount - 1)) / columnCount;

  while (columns < maximumColumns && cardWidth(columns) > maximumCardWidth) {
    columns += 1;
  }
  while (columns > 2 && cardWidth(columns) < minimumCardWidth) {
    columns -= 1;
  }
  return columns;
}

function layoutHistoryMasonry(gallery: HTMLElement): number {
  const cards = historyCardsByOrder(gallery);
  if (!cards.length) return 0;
  const gap = Number.parseFloat(getComputedStyle(gallery).columnGap) || 10;
  const columnCount = historyMasonryColumnCount(gallery.clientWidth, gap);
  const columns = Array.from({ length: columnCount }, () => {
    const column = document.createElement("div");
    column.className = "history-masonry-column";
    return column;
  });
  gallery.style.setProperty("--masonry-columns", String(columnCount));
  gallery.replaceChildren(...columns);
  for (const card of cards) {
    const shortestColumn = columns.reduce((shortest, column) =>
      column.getBoundingClientRect().height < shortest.getBoundingClientRect().height
        ? column
        : shortest
    );
    shortestColumn.append(card);
  }
  return columnCount;
}

function bindHistoryMasonry(): void {
  const gallery = document.querySelector<HTMLElement>(".history-gallery.masonry");
  if (!gallery) return;
  let columnCount = layoutHistoryMasonry(gallery);
  if (typeof ResizeObserver === "undefined") return;
  historyMasonryResizeObserver = new ResizeObserver(() => {
    const gap = Number.parseFloat(getComputedStyle(gallery).columnGap) || 10;
    const nextColumnCount = historyMasonryColumnCount(gallery.clientWidth, gap);
    if (nextColumnCount === columnCount) return;
    columnCount = layoutHistoryMasonry(gallery);
  });
  historyMasonryResizeObserver.observe(gallery);
}

function layoutHistoryAlbum(gallery: HTMLElement): void {
  const cards = historyCardsByOrder(gallery);
  if (!cards.length || gallery.clientWidth <= 0) return;
  const gap = Number.parseFloat(getComputedStyle(gallery).columnGap) || 8;
  const minimumCardWidth = 180;
  const maximumCardWidth = 300;
  const cardCount = cards.length;
  const availableWidth = gallery.clientWidth;
  const maximumRowWidth = cardCount * maximumCardWidth + (cardCount - 1) * gap;
  let columnCount = cardCount;
  let cardWidth = maximumCardWidth;
  if (maximumRowWidth > availableWidth) {
    columnCount = Math.min(
      cardCount,
      Math.max(1, Math.floor((availableWidth + gap) / (minimumCardWidth + gap)))
    );
    cardWidth = (availableWidth - (columnCount - 1) * gap) / columnCount;
  }
  cardWidth = Math.max(1, Math.min(maximumCardWidth, cardWidth));
  gallery.style.gridTemplateColumns = `repeat(${columnCount}, ${cardWidth}px)`;
  gallery.style.justifyContent = "start";
}

function bindHistoryAlbum(): void {
  const gallery = document.querySelector<HTMLElement>(".history-gallery.album");
  if (!gallery) return;
  const update = () => layoutHistoryAlbum(gallery);
  update();
  if (typeof ResizeObserver === "undefined") return;
  historyAlbumResizeObserver = new ResizeObserver(update);
  historyAlbumResizeObserver.observe(gallery);
}

function layoutImageHistoryViewer(): void {
  const stagePanel = document.querySelector<HTMLElement>(".image-history-stage-panel");
  const versionRail = document.querySelector<HTMLElement>(".image-history-version-rail");
  const versionList = document.querySelector<HTMLElement>(".image-history-version-list");
  if (!stagePanel || !versionRail || !versionList) return;
  if (window.matchMedia("(max-width: 760px)").matches) {
    versionRail.style.removeProperty("height");
    versionList.style.removeProperty("height");
    return;
  }
  versionRail.style.height = "0px";
  versionList.style.height = "0px";
  const stageHeight = stagePanel.getBoundingClientRect().height;
  if (stageHeight <= 0) return;
  versionRail.style.height = `${stageHeight}px`;
  versionList.style.height = "100%";
}

function bindImageHistoryViewer(): void {
  const stagePanel = document.querySelector<HTMLElement>(".image-history-stage-panel");
  if (!stagePanel) return;
  layoutImageHistoryViewer();
  if (typeof ResizeObserver === "undefined") return;
  imageHistoryViewerResizeObserver = new ResizeObserver(layoutImageHistoryViewer);
  imageHistoryViewerResizeObserver.observe(stagePanel);
}

function switchHistoryLayout(nextLayout: typeof historyLayout): void {
  if (nextLayout === historyLayout) return;
  if (historyLayoutRestoreFrame !== null) {
    window.cancelAnimationFrame(historyLayoutRestoreFrame);
    historyLayoutRestoreFrame = null;
  }
  reportUserAction("history-layout", { from: historyLayout, to: nextLayout });
  const gallery = document.querySelector<HTMLElement>(".history-gallery");
  if (!gallery) return;
  historyLayoutAnchor = captureHistoryLayoutAnchor();
  historyLayout = nextLayout;
  historyMasonryResizeObserver?.disconnect();
  historyMasonryResizeObserver = null;
  historyAlbumResizeObserver?.disconnect();
  historyAlbumResizeObserver = null;
  imageHistoryViewerResizeObserver?.disconnect();
  imageHistoryViewerResizeObserver = null;
  gallery.classList.toggle("masonry", nextLayout === "masonry");
  gallery.classList.toggle("album", nextLayout === "album");
  gallery.style.removeProperty("grid-template-columns");
  gallery.style.removeProperty("justify-content");
  if (nextLayout === "album") {
    const cards = historyCardsByOrder(gallery);
    if (cards.length) {
      gallery.replaceChildren(...cards);
      gallery.style.removeProperty("--masonry-columns");
    }
    bindHistoryAlbum();
  } else {
    bindHistoryMasonry();
  }
  document.querySelectorAll<HTMLElement>("[data-history-layout]").forEach((button) => {
    const active = button.dataset.historyLayout === nextLayout;
    button.classList.toggle("secondary", active);
    button.classList.toggle("ghost", !active);
  });
  restoreHistoryLayoutAnchor();
}

function bindHistoryTitleMarquees(): void {
  const titles = [...document.querySelectorAll<HTMLElement>(".history-card-title, .history-detail-title")];
  if (!titles.length) return;
  const update = () => {
    for (const title of titles) {
      title.classList.remove("is-overflowing");
      title.style.removeProperty("--marquee-distance");
      const text = title.querySelector<HTMLElement>(".history-card-title-track > span");
      if (!text || text.getBoundingClientRect().width <= title.clientWidth) continue;
      const distance = text.getBoundingClientRect().width + 36;
      title.style.setProperty("--marquee-distance", `${distance}px`);
      title.classList.add("is-overflowing");
    }
  };
  window.requestAnimationFrame(update);
  if (typeof ResizeObserver !== "undefined") {
    historyTitleResizeObserver = new ResizeObserver(update);
    titles.forEach((title) => historyTitleResizeObserver?.observe(title));
  }
}

function historyDetailPage(): string {
  const asset = state.history.find((item) => item.id === selectedHistoryAssetId);
  if (!asset) {
    page = "history";
    return historyPage();
  }
  const version = currentHistoryVersion(asset);
  const retiredModel = isRetiredVideoModel(asset.modelId);
  selectedHistoryVersionId = version.id;
  const videoIndex = versionVideoIndex(version);
  const mediaUrl = historyMediaUrl(asset, version);
  const videoFile = videoIndex >= 0 ? version.files[videoIndex] : undefined;
  const orderedHistory = historyAssetsByNewest();
  const historyIndex = orderedHistory.findIndex((item) => item.id === asset.id);
  const previousAsset = historyIndex > 0 ? orderedHistory[historyIndex - 1] : undefined;
  const nextAsset = historyIndex >= 0 ? orderedHistory[historyIndex + 1] : undefined;
  const detailTitle = asset.title.trim() || asset.prompt.trim() || "未命名视频";
  const completedAt = formatFullHistoryTime(version.createdAt);
  const fps = version.fps;
  const performanceStats = version.performanceStats;
  const elapsedSeconds = version.startedAt
    ? Math.max(0, (new Date(version.createdAt).getTime() - new Date(version.startedAt).getTime()) / 1000)
    : null;
  return `
    <div class="history-detail-back">
      <button class="secondary button-with-icon history-detail-back-button" data-page="history">${icon("arrow-left")}返回历史</button>
      <div class="history-detail-tools">
        <span>任务记录为生成时的只读快照</span>
        <span class="history-detail-position" aria-label="当前历史作品位置">第 ${historyIndex + 1} / 共 ${state.history.length} 个</span>
        <div class="history-detail-navigation" aria-label="切换历史作品">
          <button class="ghost history-detail-nav-button" data-history-navigation="-1" aria-keyshortcuts="PageUp" ${previousAsset ? "" : "disabled"} title="${previousAsset ? `上一个：${escapeHtml(previousAsset.title)} · Page Up` : "已经是第一项"}"><span class="history-detail-nav-label">${icon("arrow-left")}上一个</span><span class="history-detail-nav-shortcut"><kbd>Page Up</kbd></span></button>
          <button class="ghost history-detail-nav-button" data-history-navigation="1" aria-keyshortcuts="PageDown" ${nextAsset ? "" : "disabled"} title="${nextAsset ? `下一个：${escapeHtml(nextAsset.title)} · Page Down` : "已经是最后一项"}"><span class="history-detail-nav-label">下一个${icon("arrow-right")}</span><span class="history-detail-nav-shortcut"><kbd>Page Down</kbd></span></button>
        </div>
      </div>
    </div>
    <section class="history-detail-hero">
      <div class="history-player-column">
        <div class="panel history-player" style="--video-aspect: ${version.width} / ${version.height}">
          ${mediaUrl
            ? `<video controls loop playsinline preload="metadata" data-history-asset="${asset.id}" data-history-version="${version.id}" src="${mediaUrl}"></video>`
            : `<div class="history-media-fallback"><span>${icon("play")}</span><strong>视频文件不可用</strong><small>请检查输出目录或在下方定位文件。</small></div>`}
        </div>
      </div>
      <aside class="history-detail-sidebar">
        <section class="panel history-summary">
          <div class="history-summary-copy">
          <div class="history-title-line"><h1 class="history-detail-title" title="${escapeHtml(detailTitle)}"><span class="history-card-title-track"><span>${escapeHtml(detailTitle)}</span><span aria-hidden="true">${escapeHtml(detailTitle)}</span></span></h1><span class="status running">已完成</span></div>
          <code>${escapeHtml(videoFile?.filename ?? asset.outputFilename)}</code>
          <div class="history-summary-badges"><span class="model-badge">${escapeHtml(modelName(version.modelId))}</span><span>${version.kind === "original" ? "原始生成" : "分辨率提升版本"}</span></div>
          </div>
          <div class="history-overview-facts">
          <div><span>完成时间</span><strong>${completedAt}</strong></div>
          <div><span>生成耗时</span><strong>${elapsedSeconds == null ? "旧记录未保存" : formatElapsedDuration(elapsedSeconds)}</strong></div>
          <div><span>分辨率</span><strong>${version.width} × ${version.height}</strong></div>
          <div><span>视频时长</span><strong>${version.duration} 秒</strong></div>
          <div><span>成片帧率</span><strong>${fps} FPS</strong></div>
          <div><span>成片帧数</span><strong>${Math.round(version.duration * fps)} 帧</strong></div>
          </div>
          <div class="history-detail-quick-actions">
          ${retiredModel ? "" : `<button class="secondary button-with-icon" data-edit-history="${asset.id}" aria-label="在创建页调整" title="在创建页调整">${icon("sliders-horizontal")}调整参数</button>`}
          ${videoFile?.absolutePath ? `${retiredModel ? "" : `<button class="secondary button-with-icon" data-continue-history="${asset.id}" data-source-version="${version.id}" aria-label="继续创作" title="继续创作">${icon("video")}继续创作</button>`}<button class="secondary button-with-icon" data-copy-file="${escapeHtml(videoFile.absolutePath)}" aria-label="复制文件" title="复制文件">${icon("copy")}复制文件</button><button class="secondary button-with-icon history-file-action" data-show-file="${escapeHtml(videoFile.absolutePath)}" aria-label="打开所在目录" title="打开所在目录">${icon("folder-open")}定位文件</button>` : ""}
            <button class="secondary button-with-icon" data-open-upscale ${videoFile?.absolutePath && versionShortEdge(version) < 2160 ? "" : "disabled"}>${icon("maximize-2")}${versionShortEdge(version) >= 2160 ? "当前已是 4K" : "提升分辨率"}</button>
            <button class="secondary danger history-delete-button button-with-icon" data-delete-history="${asset.id}">${icon("trash-2")}删除视频和记录</button>
          </div>
        </section>
        <section class="panel history-version-panel">
          <div class="history-version-panel-heading"><strong>视频版本</strong><span>${asset.versions.length} 个版本</span></div>
          <div class="version-switcher history-summary-version-switcher">${asset.versions.map((item) => `<button class="${item.id === version.id ? "primary" : "ghost"}" data-version-id="${item.id}" title="${item.kind === "original" ? `原始生成 · ${item.width} × ${item.height}` : `${modelName(item.modelId)} · ${item.width} × ${item.height}`}">${item.kind === "original" ? `原始 · ${historyResolutionLabel(asset, item)}` : `提升 · ${historyResolutionLabel(asset, item)}`}</button>`).join("")}</div>
        </section>
      </aside>
    </section>
    <section class="history-record-grid">
      <article class="panel history-record full">
        <div class="history-record-heading"><h2>提示词</h2><button class="ghost button-with-icon" data-copy-prompt>${icon("copy")}复制提示词</button></div>
        <span class="muted">实际送入模型的完整提示词</span><div class="history-prompt-scroll" tabindex="0" aria-label="完整提示词"><p class="history-prompt">${escapeHtml(asset.prompt)}</p></div>
      </article>
      <article class="panel history-record">
        <h2>原始生成参数</h2>
        <dl><dt>模型</dt><dd>${escapeHtml(modelName(version.modelId))}</dd>${version.videoLoras?.length ? `<dt>LoRA</dt><dd>${version.videoLoras.map((lora) => `${escapeHtml(lora.name)} · ${lora.strength}`).join(" + ")}</dd>` : ""}<dt>采样步数</dt><dd>${version.steps ?? "工作流默认"}</dd><dt>计算模式</dt><dd>${version.spectrumMode === "balanced" ? "Spectrum 平衡模式 · 系统内存" : "原生完整计算"}</dd><dt>Seed</dt><dd><code>${version.seed ?? "不适用"}</code></dd><dt>工作流</dt><dd><code>${escapeHtml(version.workflowPath || "旧记录未保存")}</code></dd><dt>ComfyUI Prompt ID</dt><dd><code>${escapeHtml(version.comfyPromptId)}</code></dd></dl>
      </article>
      <article class="panel history-record">
        <h2>视频输出</h2>
        <dl><dt>分辨率</dt><dd>${historyResolutionLabel(asset, version)} · ${version.width} × ${version.height}</dd><dt>版本类型</dt><dd>${version.kind === "original" ? "原始生成" : "分辨率提升"}</dd><dt>时长</dt><dd>${version.duration} 秒</dd><dt>成片帧率</dt><dd>${fps} FPS</dd><dt>成片帧数</dt><dd>${Math.round(version.duration * fps)}</dd><dt>输出目录</dt><dd><code>${escapeHtml(videoFile?.absolutePath ?? state.settings.outputDirectory)}</code></dd></dl>
      </article>
      <article class="panel history-record full history-performance-record">
        <div class="history-record-heading"><h2>运行统计</h2><span class="muted">低频采样摘要</span></div>
        ${performanceStatsMarkup(performanceStats)}
      </article>
      <article class="panel history-record full">
        <div class="history-record-heading"><h2>输出文件</h2><span>${version.files.length} 个</span></div>
      <div class="output-files">
        ${version.files.length === 0
          ? `<p class="muted">ComfyUI 返回中没有识别到文件。需要在本地保存一份 history 响应，用于补充该工作流的输出结构。</p>`
          : version.files.map((file) => `<div class="output-file"><div><strong>${escapeHtml(file.filename)}</strong><p class="muted">${escapeHtml(file.subfolder || ".")} · ${escapeHtml(file.type)}</p></div>${file.absolutePath ? `<button class="secondary button-with-icon" data-show-file="${escapeHtml(file.absolutePath)}">${icon("folder-open")}在 Explorer 中显示</button>` : `<span class="muted">请先在设置中填写 ComfyUI 输出目录</span>`}</div>`).join("")}
      </div>
        <details><summary>原始 ComfyUI 输出快照</summary><pre>${escapeHtml(JSON.stringify(version.comfyOutputs, null, 2))}</pre></details>
      </article>
    </section>`;
}

function imageHistoryDetailPage(): string {
  const project = state.imageHistory.find((item) => item.id === selectedHistoryAssetId);
  if (!project) {
    historyKind = "image";
    page = "history";
    return historyPage();
  }
  const version = currentImageHistoryVersion(project);
  selectedHistoryVersionId = version.id;
  const versionIndex = project.versions.findIndex((item) => item.id === version.id);
  const previousVersion = project.versions[versionIndex + 1];
  const nextVersion = project.versions[versionIndex - 1];
  const orderedProjects = imageProjectsByNewest();
  const projectIndex = orderedProjects.findIndex((item) => item.id === project.id);
  const previousProject = projectIndex > 0 ? orderedProjects[projectIndex - 1] : undefined;
  const nextProject = projectIndex >= 0 ? orderedProjects[projectIndex + 1] : undefined;
  const title = project.title.trim() || "未命名图片";
  const mediaUrl = imageHistoryMediaUrl(project, version);
  const pinnedVersion = imageProjectCoverVersion(project);
  const parent = version.parentVersionId
    ? project.versions.find((item) => item.id === version.parentVersionId)
    : undefined;
  const elapsedSeconds = version.performanceStats?.durationSeconds ?? (version.startedAt
    ? Math.max(0, (Date.parse(version.createdAt) - Date.parse(version.startedAt)) / 1000)
    : null);
  const filePath = version.file.absolutePath ?? "";
  return `
    <div class="history-detail-back">
      <button class="secondary button-with-icon history-detail-back-button" data-page="history">${icon("arrow-left")}返回图片历史</button>
      <div class="history-detail-tools">
        <span>图片项目保留所有编辑版本</span>
        <span class="history-detail-position" aria-label="当前图片项目位置">第 ${projectIndex + 1} / 共 ${orderedProjects.length} 个</span>
        <div class="history-detail-navigation" aria-label="切换图片项目">
          <button class="ghost history-detail-nav-button" data-history-navigation="-1" ${previousProject ? "" : "disabled"} title="${previousProject ? `上一个：${escapeHtml(previousProject.title)}` : "已经是第一项"}"><span class="history-detail-nav-label">${icon("arrow-left")}上一个</span><span class="history-detail-nav-shortcut"><kbd>Page Up</kbd></span></button>
          <button class="ghost history-detail-nav-button" data-history-navigation="1" ${nextProject ? "" : "disabled"} title="${nextProject ? `下一个：${escapeHtml(nextProject.title)}` : "已经是最后一项"}"><span class="history-detail-nav-label">下一个${icon("arrow-right")}</span><span class="history-detail-nav-shortcut"><kbd>Page Down</kbd></span></button>
        </div>
      </div>
    </div>
    <section class="image-history-detail-layout">
      <section class="panel image-history-viewer-panel">
        <div class="image-history-viewer-grid">
          <aside class="image-history-version-rail">
            <div><h2>版本</h2><p class="muted tiny">最新在前</p></div>
            <div class="image-history-version-list">
              ${project.versions.map((item) => `<button class="image-history-version-thumb ${item.id === version.id ? "active" : ""}" data-image-version-id="${escapeHtml(item.id)}" title="版本 ${item.versionNumber} · ${item.width} × ${item.height}">${imageHistoryMediaUrl(project, item) ? `<img src="${escapeHtml(imageHistoryMediaUrl(project, item))}" loading="lazy" alt="">` : ""}<span>${String(item.versionNumber).padStart(2, "0")}</span>${item.id === pinnedVersion?.id ? icon("circle-check") : ""}</button>`).join("")}
            </div>
          </aside>
          <section class="image-history-stage-panel">
            <div class="image-history-stage-toolbar"><div><strong>${escapeHtml(version.file.filename)}</strong><p class="muted tiny">版本 ${version.versionNumber} · Seed ${version.seed ?? "随机"} · ${escapeHtml(version.kind === "source" ? "原始图片" : modelName(version.modelId))}</p></div></div>
            <div class="image-history-stage ${version.width > version.height ? "is-wide" : "is-tall"}" data-image-stage="fit" data-image-orientation="${version.width > version.height ? "wide" : "tall"}" style="--image-aspect:${version.width || 1} / ${version.height || 1}">
              ${mediaUrl ? `<img src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(title)} · 版本 ${version.versionNumber}" data-image-history-stage-image>` : `<div class="history-media-fallback"><span>${icon("image")}</span><strong>图片文件不可用</strong><small>请检查输出目录或在下方定位文件。</small></div>`}
            </div>
            <div class="image-history-stage-controls" aria-label="图片版本浏览操作">
              <button class="icon-button image-history-stage-nav" data-image-version-navigation="-1" ${previousVersion ? "" : "disabled"} title="${previousVersion ? `上一版本：v${previousVersion.versionNumber}` : "已经是最早版本"}" aria-label="上一版本">${icon("arrow-left")}</button>
              <button class="primary button-with-icon image-history-open-viewer" data-open-image-lightbox ${mediaUrl ? "" : "disabled"}>${icon("maximize-2")}查看大图</button>
              <button class="icon-button image-history-stage-nav" data-image-version-navigation="1" ${nextVersion ? "" : "disabled"} title="${nextVersion ? `下一版本：v${nextVersion.versionNumber}` : "已经是最新版本"}" aria-label="下一版本">${icon("arrow-right")}</button>
            </div>
          </section>
        </div>
      </section>
      <aside class="image-history-detail-sidebar">
        <section class="panel image-history-summary">
          <div class="status-line"><span class="badge ok">版本 ${version.versionNumber}${pinnedVersion?.id === version.id ? " · 当前封面" : ""}</span><span class="badge">PNG</span></div>
          <h2>${escapeHtml(title)}</h2>
          <p class="muted tiny">${escapeHtml(version.prompt || (version.kind === "source" ? "原始导入图片" : "未保存编辑要求"))}</p>
          <div class="image-history-facts"><div><span>模型</span><strong>${escapeHtml(version.kind === "source" ? "原始图片" : modelName(version.modelId))}</strong></div><div><span>Seed</span><strong>${version.seed ?? "随机"}</strong></div><div><span>尺寸</span><strong>${version.width} × ${version.height}</strong></div><div><span>格式</span><strong>${version.format.toUpperCase()}</strong></div><div><span>生成时间</span><strong>${escapeHtml(formatFullHistoryTime(version.createdAt))}</strong></div><div><span>耗时</span><strong>${elapsedSeconds == null ? "旧记录未保存" : escapeHtml(formatElapsedDuration(elapsedSeconds))}</strong></div></div>
          <div class="image-history-quick-actions"><button class="primary button-with-icon" data-image-continue-video-project="${escapeHtml(project.id)}" data-image-continue-video-version="${escapeHtml(version.id)}">${icon("video")}开始创作视频</button><button class="secondary button-with-icon" data-image-continue-edit-project="${escapeHtml(project.id)}" data-image-continue-edit-version="${escapeHtml(version.id)}">${icon("wand-sparkles")}继续编辑图片</button>${filePath ? `<button class="secondary button-with-icon" data-copy-image="${escapeHtml(filePath)}">${icon("copy")}复制图片</button><button class="secondary button-with-icon" data-copy-file="${escapeHtml(filePath)}">${icon("copy")}复制文件</button><button class="secondary button-with-icon" data-show-file="${escapeHtml(filePath)}">${icon("folder-open")}打开所在位置</button>` : ""}<button class="secondary button-with-icon" data-image-set-cover="${escapeHtml(project.id)}" data-image-cover-version="${pinnedVersion?.id === version.id ? "" : version.id}">${icon("image")}${pinnedVersion?.id === version.id ? "恢复自动封面" : "设为项目封面"}</button><button class="secondary danger button-with-icon" data-delete-image-version="${escapeHtml(project.id)}" data-image-version-delete-id="${escapeHtml(version.id)}" ${version.kind === "source" ? "disabled" : ""}>${icon("trash-2")}${version.kind === "source" ? "原始图不可删除" : "删除当前版本"}</button><button class="secondary danger button-with-icon" data-delete-history="${escapeHtml(project.id)}">${icon("trash-2")}删除图片项目</button></div>
        </section>
        <section class="panel image-history-version-panel"><div class="history-version-panel-heading"><strong>图片项目版本</strong><span>${project.versions.length} 个版本</span></div><p class="muted tiny">${parent ? `当前版本基于 v${parent.versionNumber} 继续编辑。` : version.kind === "source" ? "这是项目最初导入的基础图片。" : "当前版本没有记录父版本。"}</p></section>
      </aside>
    </section>
    <section class="history-record-grid image-history-record-grid">
      <article class="panel history-record full"><div class="history-record-heading"><h2>本次编辑要求</h2><button class="ghost button-with-icon" data-copy-image-prompt>${icon("copy")}复制 Prompt</button></div><span class="muted">生成时保存的 Prompt 快照</span><div class="history-prompt-scroll" tabindex="0" aria-label="图片编辑要求"><p class="history-prompt">${escapeHtml(version.prompt || "原始导入图片，没有编辑 Prompt")}</p></div></article>
      <article class="panel history-record"><h2>版本来源</h2><dl><dt>所属项目</dt><dd>${escapeHtml(title)}</dd><dt>父版本</dt><dd>${parent ? `v${parent.versionNumber}` : version.kind === "source" ? "原始图片" : "未记录"}</dd><dt>版本编号</dt><dd>${version.versionNumber} / ${project.versions.length}</dd><dt>版本类型</dt><dd>${version.kind === "source" ? "原始素材" : version.kind === "upscale" ? "分辨率提升" : "图片编辑"}</dd></dl></article>
      <article class="panel history-record"><h2>生成信息</h2><dl><dt>模型</dt><dd>${escapeHtml(version.kind === "source" ? "原始图片" : modelName(version.modelId))}</dd><dt>Seed</dt><dd>${version.seed ?? "随机"}</dd><dt>生成时间</dt><dd>${escapeHtml(formatFullHistoryTime(version.createdAt))}</dd><dt>输出格式</dt><dd>${version.format.toUpperCase()}</dd><dt>工作流</dt><dd><code>${escapeHtml(version.workflowPath || "原始导入")}</code></dd><dt>ComfyUI Prompt ID</dt><dd><code>${escapeHtml(version.comfyPromptId ?? "旧记录未保存")}</code></dd></dl></article>
      <article class="panel history-record full"><div class="history-record-heading"><h2>输出文件</h2><span>1 个</span></div><div class="output-files"><div class="output-file"><div><strong>${escapeHtml(version.file.filename)}</strong><p class="muted">${escapeHtml(version.file.subfolder || ".")} · ${escapeHtml(version.file.type)}</p></div>${filePath ? `<button class="secondary button-with-icon" data-show-file="${escapeHtml(filePath)}">${icon("folder-open")}在 Explorer 中显示</button>` : `<span class="muted">当前文件不可用</span>`}</div></div><details><summary>原始 ComfyUI 输出快照</summary><pre>${escapeHtml(JSON.stringify(version.comfyOutputs, null, 2))}</pre></details></article>
    </section>
    ${mediaUrl ? `<div class="image-lightbox" data-image-lightbox hidden>
      <div class="image-lightbox-backdrop" data-image-lightbox-close></div>
      <section class="image-lightbox-dialog" role="dialog" aria-modal="true" aria-labelledby="image-lightbox-title" tabindex="-1">
        <header class="image-lightbox-toolbar">
          <div><strong id="image-lightbox-title">${escapeHtml(title)}</strong><span>版本 ${version.versionNumber} · ${version.width} × ${version.height}</span></div>
          <div class="button-row"><button class="secondary button-with-icon" data-image-lightbox-reset>${icon("rotate-ccw")}重置视图</button><button class="icon-button" data-image-lightbox-close aria-label="关闭大图" title="关闭大图">${icon("x")}</button></div>
        </header>
        <div class="image-lightbox-stage" data-image-lightbox-stage>
          <img src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(title)} · 版本 ${version.versionNumber}" data-image-lightbox-image draggable="false">
        </div>
        <p class="image-lightbox-hint">滚轮缩放 · 拖动平移 · 双击重置 · Esc 关闭</p>
      </section>
    </div>` : ""}`;
}

function historyStateChanged(
  previous: AppState["history"] | undefined,
  next: AppState["history"]
): boolean {
  if (!previous || previous.length !== next.length) return true;
  return next.some((asset, index) => {
    const previousAsset = previous[index];
    if (!previousAsset) return true;
    if (
      previousAsset.id !== asset.id ||
      previousAsset.updatedAt !== asset.updatedAt ||
      previousAsset.defaultVersionId !== asset.defaultVersionId ||
      previousAsset.versions.length !== asset.versions.length
    ) {
      return true;
    }
    return asset.versions.some((version, versionIndex) => {
      const previousVersion = previousAsset.versions[versionIndex];
      return !previousVersion ||
        previousVersion.id !== version.id ||
        previousVersion.createdAt !== version.createdAt ||
        previousVersion.files.length !== version.files.length;
    });
  });
}

function imageHistoryStateChanged(
  previous: ImageHistoryProject[] | undefined,
  next: ImageHistoryProject[]
): boolean {
  if (!previous || previous.length !== next.length) return true;
  return next.some((project, index) => {
    const previousProject = previous[index];
    if (!previousProject) return true;
    if (
      previousProject.id !== project.id ||
      previousProject.updatedAt !== project.updatedAt ||
      previousProject.coverMode !== project.coverMode ||
      previousProject.coverVersionId !== project.coverVersionId ||
      previousProject.versions.length !== project.versions.length
    ) {
      return true;
    }
    return project.versions.some((version, versionIndex) => {
      const previousVersion = previousProject.versions[versionIndex];
      return !previousVersion ||
        previousVersion.id !== version.id ||
        previousVersion.versionNumber !== version.versionNumber ||
        previousVersion.createdAt !== version.createdAt ||
        previousVersion.file.filename !== version.file.filename ||
        previousVersion.file.absolutePath !== version.file.absolutePath;
    });
  });
}

interface HistoryPlaybackSnapshot {
  assetId: string;
  versionId: string;
  currentTime: number;
  paused: boolean;
  muted: boolean;
  playbackRate: number;
}

function captureHistoryPlayback(): HistoryPlaybackSnapshot | null {
  if (page !== "history-detail") return null;
  const video = document.querySelector<HTMLVideoElement>(".history-player video");
  if (!video) return null;
  return {
    assetId: video.dataset.historyAsset ?? "",
    versionId: video.dataset.historyVersion ?? "",
    currentTime: video.currentTime,
    paused: video.paused,
    muted: video.muted,
    playbackRate: video.playbackRate
  };
}

function restoreHistoryPlayback(snapshot: HistoryPlaybackSnapshot | null): void {
  if (!snapshot) return;
  const video = document.querySelector<HTMLVideoElement>(".history-player video");
  if (!video) return;
  if (
    video.dataset.historyAsset !== snapshot.assetId ||
    video.dataset.historyVersion !== snapshot.versionId
  ) return;
  const restore = () => {
    video.muted = snapshot.muted;
    video.playbackRate = snapshot.playbackRate;
    if (Number.isFinite(video.duration)) {
      video.currentTime = Math.min(snapshot.currentTime, video.duration);
    }
    if (snapshot.paused) video.pause();
    else void video.play().catch(() => undefined);
  };
  if (video.readyState >= 1) window.requestAnimationFrame(restore);
  else video.addEventListener("loadedmetadata", restore, { once: true });
}

function stopRenderedVideoPlayback(): void {
  document.querySelectorAll<HTMLVideoElement>("video").forEach((video) => {
    video.pause();
  });
}

function isImageWorkflowReady(profile?: ModelScanProfile): boolean {
  return Boolean(
    profile?.category === "image" &&
    profile.available &&
    profile.integrated &&
    profile.runtimeVerified &&
    profile.runtimeReady
  );
}

function isImageModelSelectable(profile?: ModelScanProfile): boolean {
  return Boolean(
    profile?.category === "image" &&
    profile.available &&
    profile.integrated
  );
}

function enableSpectrumByDefaultIfAvailable(): void {
  const spectrumNode = environmentScan?.customNodes.find(
    (node) => node.id === "spectrum-minimax-h3"
  );
  const draft = state?.draft;
  if (
    !draft ||
    draft.spectrumModeUserSet ||
    draft.spectrumMode === "balanced" ||
    !spectrumNode?.installed ||
    !spectrumNode.loaded ||
    !isMiniMaxH3SpectrumEligible(draft.modelId) ||
    (draft.inputMode === "video" && isMiniMaxH3R2vModel(draft.modelId))
  ) return;
  patchDraft({ spectrumMode: "balanced" });
}

function imageWorkflowStatus(profile?: ModelScanProfile): string {
  if (!profile) return "等待环境扫描";
  if (!profile.available) return "组件不完整";
  if (!profile.integrated) return "工作流待接入";
  if (!profile.runtimeVerified) return "未启动，入队时自动启动并验证";
  if (!profile.runtimeReady) {
    return profile.runtimeMissingNodes?.length
      ? `缺少节点：${profile.runtimeMissingNodes.join("、")}`
      : "运行时节点验证未通过";
  }
  return "工作流节点已验证";
}

function modelScanCard(profile: ModelScanProfile): string {
  const missingCount = profile.components.filter((component) => !component.found && !component.optional).length;
  const isPromptProfile = profile.category === "prompt";
  const isLlamaProfile = profile.managedBy === "llama-server";
  const isGemmaProfile = isPromptProfile && isGemmaPromptModel(profile.id);
  const runtimeUnavailable = profile.runtimeVerified === true && profile.runtimeReady === false;
  const hardwareRecommendation = modelHardwareRecommendation(profile);
  const loraDefinition = profile.category === "lora"
    ? BUILTIN_VIDEO_LORAS.find((lora) => lora.id === profile.id)
    : undefined;
  const isReady = profile.category === "image"
    ? isImageWorkflowReady(profile)
    : profile.available && !runtimeUnavailable;
  const readyLabel = isPromptProfile
    ? "文件完整"
    : isReady
      ? "可用"
      : runtimeUnavailable
        ? "运行节点未就绪"
        : profile.category === "image"
          ? imageWorkflowStatus(profile)
          : "组件完整";
  const metaLabel = profile.available
    ? isPromptProfile
      ? isLlamaProfile
        ? "GGUF + mmproj 文件完整；由应用自管理 llama-server"
        : isGemmaProfile
          ? "LLM GGUF + mmproj 文件完整；通过 ComfyUI Prompt Writer 处理视频和图片提示词"
        : "ComfyUI text_encoders 文件完整；可通过原生 TextGenerate 进行本地扩写"
      : profile.category === "image"
        ? imageWorkflowStatus(profile)
        : runtimeUnavailable
          ? `缺少运行节点：${profile.runtimeMissingNodes?.join("、") || "请启动 ComfyUI 后重新扫描"}`
        : profile.integrated
          ? "组件完整，可用于配置"
          : "依赖已完整；生成工作流将在下一阶段接入"
    : isPromptProfile
      ? isLlamaProfile
        ? "补齐 GGUF + mmproj，并配置 llama-server.exe 后才能使用"
        : "补齐对应的 ComfyUI text_encoders 文件后才能接入本地扩写"
      : "补齐所有必需组件后才能启用";
  return `
    <article class="panel model-profile ${isReady ? "available" : "missing"}">
      <div class="model-profile-head">
        <div>
          <div class="model-title"><h3>${escapeHtml(profile.name)}</h3>${loraDefinition ? videoLoraInfoButton(loraDefinition) : ""}<span class="model-badge">${escapeHtml(profile.badge)}</span></div>
          <p class="muted">${escapeHtml(profile.description)}</p>
        </div>
        <span class="model-availability ${isReady ? "available" : "missing"}">${profile.available ? `${icon(isReady ? "circle-check" : "circle-alert")} ${escapeHtml(readyLabel)}` : `${icon("circle-alert")} 缺少 ${missingCount} 项`}</span>
      </div>
      <div class="model-meta-line"><span>资源 / 策略 · ${escapeHtml(profile.vram)}</span><span class="model-hardware-recommendation">推荐硬件 · ${escapeHtml(hardwareRecommendation)}</span><span>${metaLabel}</span></div>
      <div class="component-list">
        ${profile.components.map((component, componentIndex) => `
          <div class="component-row ${component.found ? "found" : component.optional ? "optional missing" : "missing"}">
            <span class="component-state">${icon(component.found ? "circle-check" : "circle-alert")}</span>
            <div><strong>${escapeHtml(component.label)}</strong>
              ${component.found
                ? `<code title="${escapeHtml(component.matches.join("\n"))}">${escapeHtml(component.matches.join(" · "))}</code>`
                : `<span>${component.optional ? "可选，4 步 Lightning 档需要：" : "缺失："}${escapeHtml(component.expected)}</span>`}
            </div>
            ${component.found ? "" : `<button class="component-info" data-install-profile="${escapeHtml(profile.id)}" data-install-component="${componentIndex}" aria-label="查看 ${escapeHtml(component.label)} 的下载和安装说明" title="查看下载和安装说明">${icon("info")}</button>`}
          </div>`).join("")}
      </div>
    </article>`;
}

function installGuideDialog(): string {
  if (!selectedInstallGuide) return "";
  const { profileName, component } = selectedInstallGuide;
  const guide = component.installGuide;
  if (!guide) {
    return `
      <div class="dialog-backdrop" id="install-guide-backdrop">
        <section class="install-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="install-guide-title" tabindex="-1">
          <div class="install-guide-head">
            <div><span class="eyebrow">${escapeHtml(profileName)}</span><h2 id="install-guide-title">${escapeHtml(component.label)}</h2></div>
            <button class="dialog-close" id="close-install-guide" aria-label="关闭">${icon("x")}</button>
          </div>
          <div class="install-note"><strong>扫描数据需要刷新</strong><p>当前结果来自更新前的主进程。请关闭并重新启动应用，然后重新扫描环境。</p></div>
          <div class="dialog-actions"><button class="primary" id="dismiss-install-guide">知道了</button></div>
        </section>
      </div>`;
  }
  const configuredModelDirectory =
    environmentScan?.modelDirectory ||
    settingsDraft?.modelDirectory ||
    state.settings.modelDirectory ||
    "ComfyUI\\models";
  const targetDirectory = `${configuredModelDirectory.replace(/[\\/]+$/, "")}\\${guide.targetSubdirectory.replaceAll("/", "\\")}`;
  return `
    <div class="dialog-backdrop" id="install-guide-backdrop">
      <section class="install-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="install-guide-title" tabindex="-1">
        <div class="install-guide-head">
          <div><span class="eyebrow">${escapeHtml(profileName)}</span><h2 id="install-guide-title">${escapeHtml(component.label)}</h2></div>
            <button class="dialog-close" id="close-install-guide" aria-label="关闭">${icon("x")}</button>
        </div>
        <p class="muted">下载完成后，将文件放入下面的目录，再回到设置页重新扫描。</p>
        <div class="install-guide-fields">
          <div><span>下载来源</span><strong>${escapeHtml(guide.sourceLabel)}</strong></div>
          <div><span>推荐文件</span><code>${escapeHtml(guide.recommendedFilename)}</code></div>
          <div class="install-target"><span>应放目录</span><code>${escapeHtml(targetDirectory)}</code></div>
        </div>
        ${guide.notes ? `<div class="install-note"><strong>注意</strong><p>${escapeHtml(guide.notes)}</p></div>` : ""}
        <div class="dialog-actions">
          <button class="secondary" id="dismiss-install-guide">关闭</button>
          <button class="primary button-with-icon" id="open-install-download">打开下载页面${icon("external-link")}</button>
        </div>
      </section>
    </div>`;
}

function environmentOverview(): string {
  if (!environmentScan) {
    return `${environmentScanError ? `<div class="service-status warning">${escapeHtml(environmentScanError)}</div>` : ""}<div class="environment-empty">${environmentScanning ? `<span class="scan-spinner"></span><div><strong>正在扫描本机环境与模型目录…</strong><p>检查命令、GPU、本地服务及所有模型组件。</p></div>` : `<div><strong>尚未扫描</strong><p>点击右上角“重新扫描”检查当前电脑。</p></div>`}</div>`;
  }
  return `
    ${environmentScanError ? `<div class="service-status warning">${escapeHtml(environmentScanError)}</div>` : ""}
    <div class="environment-summary">
      <div><span class="muted">当前用户目录</span><code title="${escapeHtml(environmentScan.userHome)}">${escapeHtml(environmentScan.userHome)}</code></div>
      <span class="scan-time">扫描于 ${new Date(environmentScan.scannedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>
    </div>
    <div class="environment-grid">
      ${environmentScan.items.map((item) => `
        <article class="environment-item ${item.ok ? "available" : "missing"}">
          <span class="environment-state">${icon(item.ok ? "circle-check" : "circle-alert")}</span>
          <div>
            <div class="environment-item-heading">
              <div class="environment-name"><strong>${escapeHtml(item.label)}</strong>${item.optional ? `<span class="optional-tag">可选</span>` : ""}</div>
              ${item.id === "comfyui-api"
                ? item.ok
                  ? `<button class="service-start secondary button-with-icon" data-restart-service="comfy" ${serviceStarting || serviceRestarting || serviceForceStopping ? "disabled" : ""}>${icon("refresh-cw")}${serviceRestarting === "comfy" ? "重启中…最多等待 2 分钟" : "重启服务"}</button>`
                  : `<button class="service-start button-with-icon" data-start-service="comfy" ${serviceStarting || serviceRestarting || serviceForceStopping ? "disabled" : ""}>${icon("play")}${serviceStarting === "comfy" ? "启动中…最多等待 2 分钟" : "一键启动"}</button>`
                : ""}
            </div>
            <p>${escapeHtml(item.detail)}</p>
            ${item.path ? `<code title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</code>` : ""}
          </div>
        </article>`).join("")}
    </div>
    ${serviceStatusMessage ? `<div class="service-status ${serviceStarting || serviceRestarting ? "working" : ""}">${escapeHtml(serviceStatusMessage)}</div>` : ""}
    ${environmentScan.comfyRoot || environmentScan.comfyInstallDirectory ? `
      <div class="detected-path">
        <div><span class="eyebrow">检测到 ComfyUI ${
          environmentScan.comfyInstallType === "desktop" ? "桌面版" :
          environmentScan.comfyInstallType === "portable" ? "便携版" :
          environmentScan.comfyInstallType === "manual" ? "手动安装" : "数据目录"
        }</span>
        <strong>${escapeHtml(environmentScan.comfyInstallDirectory || environmentScan.comfyRoot)}</strong>
        <p class="muted">核心源码：${escapeHtml(environmentScan.comfySourceDirectory || "未找到")}<br>数据目录：${escapeHtml(environmentScan.comfyRoot || "等待初始化")}<br>服务：${escapeHtml(environmentScan.comfyUrl)}<br>模型：${escapeHtml(environmentScan.modelDirectory || "等待初始化")}<br>输出：${escapeHtml(environmentScan.outputDirectory || "等待初始化")}</p></div>
        <button class="secondary button-with-icon" id="use-scanned-comfy">${icon("check")}采用这些路径</button>
      </div>` : ""}`;
}

function environmentIssuesPanel(): string {
  const issues = environmentScan?.issues ?? [];
  if (!issues.length) return "";
  return `
    <section class="panel settings-section environment-issues">
      <div class="section-heading"><div><h2>检测到的问题</h2><span class="muted">修复操作只针对已识别的问题，并保留执行日志或备份。</span></div><span class="model-badge">${issues.length} 项</span></div>
      <div class="issue-list">
        ${issues.map((issue) => `
          <article class="issue-card ${issue.severity}">
            <div>
              <strong>${escapeHtml(issue.label)}</strong>
              <p class="muted">${escapeHtml(issue.detail)}</p>
              ${environmentRepairLogs[issue.id] ? `<details class="node-log" open><summary>修复日志</summary><pre>${escapeHtml(environmentRepairLogs[issue.id])}</pre></details>` : ""}
            </div>
            ${issue.repairable ? `<button class="primary button-with-icon" data-repair-issue="${escapeHtml(issue.id)}" ${environmentRepairing ? "disabled" : ""}>${icon(environmentRepairing === issue.id ? "refresh-cw" : "shield-check")}${environmentRepairing === issue.id ? "修复中…" : escapeHtml(issue.repairLabel)}</button>` : ""}
          </article>`).join("")}
      </div>
    </section>`;
}

function comfyCompatibilityPanel(): string {
  const compatibility = environmentScan?.comfyCompatibility;
  if (!compatibility) return "";
  const selectedInstallation = environmentScan?.comfyInstallations.find(
    (installation) => installation.selected
  ) ?? environmentScan?.comfyInstallations[0];
  const versionLabel = compatibility.version
    ? `v${compatibility.version}`
    : "版本号未知";
  const ready = Boolean(compatibility.version || compatibility.revision || compatibility.checkedFrom);
  const versionMismatch = compatibility.checkedFrom === "api" &&
    Boolean(selectedInstallation?.version) &&
    Boolean(compatibility.version) &&
    selectedInstallation?.version !== compatibility.version;
  return `
    <section class="panel settings-section comfy-compatibility ${ready ? "available" : "missing"}">
      <div class="section-heading">
        <div>
          <h2>ComfyUI 核心版本</h2>
          <span class="muted">显示当前选择或当前已连接服务的核心信息</span>
        </div>
        <div class="compatibility-actions">
            <span class="model-availability ${ready ? "available" : "missing"}">${ready ? `${icon("circle-check")} 已识别` : `${icon("circle-help")} 等待启动服务`}</span>
          <button class="primary button-with-icon" id="update-comfyui" ${comfyUpdating || compatibility.updateMode === "unsupported" ? "disabled" : ""}>${icon(comfyUpdating ? "refresh-cw" : "download")}${comfyUpdating ? "正在处理…" : compatibility.updateMode === "desktop" ? "打开官方更新器" : "手动更新 ComfyUI"}</button>
        </div>
      </div>
      <div class="compatibility-version">
        <div><span>Desktop 应用</span><strong>${escapeHtml(selectedInstallation?.desktopVersion ? `v${selectedInstallation.desktopVersion}` : selectedInstallation?.type === "desktop" ? "未读取到应用版本" : "不适用")}</strong></div>
        <div><span>所选目录本地核心</span><strong>${escapeHtml(selectedInstallation?.version ? `v${selectedInstallation.version}` : "未找到本地版本文件")}</strong></div>
        <div><span>当前连接服务核心</span><strong>${escapeHtml(compatibility.checkedFrom === "api" ? versionLabel : "服务未连接")}</strong></div>
        <div><span>核心提交</span><code>${escapeHtml(compatibility.revision || "未知")}</code></div>
        <div><span>检测来源</span><strong>${compatibility.checkedFrom === "api" ? "运行中服务 /object_info" : compatibility.checkedFrom === "source" ? "本地核心源码" : "等待启动服务"}</strong></div>
      </div>
      ${versionMismatch ? `<div class="service-status warning">当前连接服务是核心 ${escapeHtml(versionLabel)}，但所选目录的本地核心是 v${escapeHtml(selectedInstallation?.version ?? "未知")}；你可能连接到了另一个正在运行的 ComfyUI 实例。重启服务前请确认端口和安装目录。</div>` : ""}
      <p class="muted">${escapeHtml(compatibility.updateHint)}</p>
      ${comfyUpdateLog ? `<details class="node-log" open><summary>更新日志</summary><pre>${escapeHtml(comfyUpdateLog)}</pre></details>` : ""}
    </section>`;
}

function settingsHaveUnsavedChanges(): boolean {
  return settingsDraft !== null &&
    !structurallyEqual(settingsDraft, state.settings);
}

function syncSettingsDirtyUi(): void {
  const dirty = settingsHaveUnsavedChanges();
  const setSettingsDirty = window.studio.setSettingsDirty;
  if (setSettingsDirty) void setSettingsDirty(dirty).catch(() => undefined);
  const status = document.querySelector<HTMLElement>(".settings-heading-actions .save-state");
  status?.classList.toggle("dirty", dirty);
  if (status) status.textContent = dirty ? "未保存更改" : "已保存";
  document.querySelector<HTMLButtonElement>("#discard-settings")?.toggleAttribute("disabled", !dirty);
  document.querySelector<HTMLButtonElement>("#save-settings")?.toggleAttribute("disabled", !dirty);
}

function settingsPage(): string {
  const settings = settingsDraft ?? state.settings;
  const settingsDirty = settingsHaveUnsavedChanges();
  const profiles = environmentScan?.modelProfiles ?? [];
  const videoProfiles = orderVideoProfiles(
    profiles.filter((profile) => profile.category === "video")
  );
  const loraProfiles = profiles.filter((profile) => profile.category === "lora");
  const imageProfiles = profiles.filter((profile) => profile.category === "image");
  const imageQualityProfiles = imageModelCapabilityFor(settings.defaultImageModel).qualityProfiles;
  const promptProfiles = profiles.filter((profile) => profile.category === "prompt");
  const upscaleProfiles = profiles.filter((profile) => profile.category === "upscale");
  const promptStatus = promptModelStatus(settings);
  const promptRuntimeBusy = promptStarting || promptEnhancing || promptReleasing;
  const defaultPromptPresets = createDefaultH3PromptPresets();
  const selectedH3PresetText = settings.h3PromptPresets[settingsH3PromptPreset] ??
    defaultPromptPresets[settingsH3PromptPreset];
  const defaultImagePromptPresets = createDefaultImagePromptPresets();
  const selectedImagePromptPresetText = settings.imagePromptPresets[settingsImagePromptPreset] ??
    defaultImagePromptPresets[settingsImagePromptPreset];
  const videoAvailable = videoProfiles.filter(
    (profile) => profile.available && profile.integrated
  ).length;
  const loraAvailable = loraProfiles.filter((profile) => profile.available).length;
  const imageComponentsReady = imageProfiles.filter((profile) => profile.available).length;
  const imageWorkflowsReady = imageProfiles.filter((profile) => isImageWorkflowReady(profile)).length;
  const upscaleAvailable = upscaleProfiles.filter((profile) => profile.available).length;
  const promptAvailable = promptProfiles.filter((profile) => profile.available).length;
  const gpu = environmentScan?.items.find((item) => item.id === "nvidia");
  const gpuDevices = environmentScan?.gpus ?? [];
  const gpuSummary = gpuDevices.length
    ? gpuDevices.map((device) => `${device.name} · ${formatBytes(device.vramTotalBytes)}`).join("；")
    : gpu?.ok
      ? gpu.detail
      : environmentScan
        ? "未检测到 NVIDIA GPU"
        : "等待扫描真实显卡与显存";
  const gpuBadge = gpuDevices.length
    ? gpuDevices.length === 1
      ? `${gpuDevices[0]!.name} · ${formatBytes(gpuDevices[0]!.vramTotalBytes)}`
      : `${gpuDevices.length} 张 GPU`
    : "GPU 待检测";
  const reserveVramBytes = Math.max(
    0,
    (Number.isFinite(settings.vramReserveGb)
      ? Math.max(0.5, Math.min(1, settings.vramReserveGb))
      : 1)
  ) * 1024 ** 3;
  const gpuBudgetSummary = gpuDevices.length
    ? gpuDevices.map((device) =>
        `${formatBytes(device.vramTotalBytes)} 总显存 - ${formatBytes(reserveVramBytes)} 余量 = ${formatBytes(Math.max(0, device.vramTotalBytes - reserveVramBytes))} 工作预算`
      ).join("；")
    : "扫描完成后将按总显存扣除安全余量计算工作预算";
  const gpuCards = gpuDevices.length
    ? `<div class="gpu-device-list">${gpuDevices.map((device) => `
        <article class="gpu-device-card">
          <span class="runtime-label">GPU ${device.index}</span>
          <strong class="runtime-value">${escapeHtml(device.name)}</strong>
          <code class="runtime-detail">${formatBytes(device.vramTotalBytes)} 总显存 · ${formatBytes(Math.max(0, device.vramTotalBytes - reserveVramBytes))} 工作预算 · 驱动 ${escapeHtml(device.driverVersion || "未知")}</code>
        </article>`).join("")}</div>`
    : `<div class="scan-result">${escapeHtml(gpuSummary)}</div>`;
  const comfyInstallations = environmentScan?.comfyInstallations ?? [];
  const effectiveComfyInstallDirectory =
    environmentScan?.comfyInstallDirectory || settings.comfyInstallDirectory;
  const selectedComfyInstallation = comfyInstallations.find(
    (installation) => installation.selected || (
      Boolean(effectiveComfyInstallDirectory) &&
      installation.directory.toLowerCase() === effectiveComfyInstallDirectory.toLowerCase()
    )
  ) ?? comfyInstallations[0];
  const effectiveComfyCoreDirectory =
    environmentScan?.comfySourceDirectory || selectedComfyInstallation?.sourceDirectory || "";
  const effectiveComfyDataDirectory = environmentScan?.comfyRoot || "";
  const effectiveModelDirectory =
    settings.modelDirectory || environmentScan?.modelDirectory || "";
  const comfyOutputRoot = environmentScan?.comfyRoot
    ? `${environmentScan.comfyRoot.replace(/[\\/]+$/u, "")}\\output`
    : environmentScan?.outputDirectory || "";
  const autoVideoOutputDirectory = comfyOutputRoot
    ? `${comfyOutputRoot.replace(/[\\/]+$/u, "")}\\Videos`
    : "";
  const autoImageOutputDirectory = comfyOutputRoot
    ? `${comfyOutputRoot.replace(/[\\/]+$/u, "")}\\Images`
    : "";
  const autoImageInputLibraryDirectory = environmentScan?.comfyRoot
    ? `${environmentScan.comfyRoot.replace(/[\\/]+$/u, "")}\\input\\LocalVideoStudio`
    : "";
  const videoOutputDirectoryValue = settings.outputDirectory || autoVideoOutputDirectory;
  const imageOutputDirectoryPlaceholder = autoImageOutputDirectory ||
    "自动：当前 ComfyUI\\output\\Images";

  const systemPanel = `
    <section class="settings-panel">
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>本机环境</h2><span class="muted">必需组件、可选工具和本地服务状态</span></div></div>
        ${environmentOverview()}
      </section>
      ${comfyCompatibilityPanel()}
      ${environmentIssuesPanel()}
      <section class="panel settings-section">
        <div class="section-heading">
          <div><h2>ComfyUI 安装实例</h2><span class="muted">选择一键启动、更新和离线版本检测使用的安装；不会自动改写你的选择</span></div>
          ${comfyInstallations.length > 1 ? `<span class="model-availability missing">发现 ${comfyInstallations.length} 个安装</span>` : `<span class="model-badge">${comfyInstallations.length ? "已发现" : "未发现"}</span>`}
        </div>
        <label>当前安装入口
          <div class="input-action"><input id="comfy-install-directory" value="${escapeHtml(effectiveComfyInstallDirectory)}" placeholder="留空时自动选择扫描结果"><button class="secondary button-with-icon" id="pick-comfy-install-directory">${icon("folder-open")}选择目录</button></div>
        </label>
        <div class="comfy-directory-map" aria-label="当前 ComfyUI 目录结构">
          <div class="comfy-directory-row">
            <span class="comfy-directory-label">核心目录</span>
            <div><code title="${escapeHtml(effectiveComfyCoreDirectory)}">${escapeHtml(effectiveComfyCoreDirectory || "等待扫描")}</code><small>包含 main.py 和核心版本文件，用于启动与更新</small></div>
          </div>
          <div class="comfy-directory-row">
            <span class="comfy-directory-label">数据 / 节点目录</span>
            <div><code title="${escapeHtml(effectiveComfyDataDirectory)}">${escapeHtml(effectiveComfyDataDirectory || "等待扫描")}</code><small>包含 models、custom_nodes、input、output 和 user</small></div>
          </div>
        </div>
        ${comfyInstallations.length ? `<div class="comfy-installation-list">
          ${comfyInstallations.map((installation) => {
            const active = settings.comfyInstallDirectory
              ? installation.selected || installation.directory.toLowerCase() === settings.comfyInstallDirectory.toLowerCase()
              : installation === comfyInstallations[0];
            const typeLabel = installation.type === "desktop" ? "Desktop" : installation.type === "portable" ? "便携版" : "源码版";
            const versionParts = [
              installation.desktopVersion ? `Desktop v${installation.desktopVersion}` : "",
              installation.version ? `核心 v${installation.version}` : ""
            ].filter(Boolean);
            const version = versionParts.join(" · ") || "版本元数据未读取到";
            return `<article class="comfy-installation ${active ? "active" : ""}">
              <div><div class="model-title"><strong>${escapeHtml(typeLabel)}</strong><span class="model-badge">${escapeHtml(version)}</span></div><div class="comfy-installation-entry"><span>安装入口</span><code title="${escapeHtml(installation.directory)}">${escapeHtml(installation.directory)}</code></div>${installation.revision ? `<span class="muted">提交 ${escapeHtml(installation.revision)}</span>` : ""}</div>
              <button class="secondary button-with-icon" data-select-comfy-install="${escapeHtml(installation.directory)}" ${active ? "disabled" : ""}>${icon(active ? "check" : "play")}${active ? "当前使用" : "使用此版本"}</button>
            </article>`;
          }).join("")}
        </div>` : `<p class="muted proxy-hint">没有在常见位置找到安装。可手动选择包含 ComfyUI.exe、Comfy Desktop.exe 或 main.py 的目录。</p>`}
      </section>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>ComfyUI 连接</h2><span class="muted">连接运行中的 ComfyUI API</span></div><div class="connection-actions"><button class="secondary button-with-icon" data-test="comfy" ${serviceForceStopping ? "disabled" : ""}>${icon("zap")}测试连接</button><button class="primary destructive button-with-icon" id="force-stop-comfy" ${serviceForceStopping || serviceStarting || serviceRestarting ? "disabled" : ""}>${icon(serviceForceStopping ? "refresh-cw" : "ban")}${serviceForceStopping ? "终止中…" : "强制终止所有进程"}</button></div></div>
        <label>服务地址<input id="comfy-url" value="${escapeHtml(settings.comfyUrl)}" placeholder="http://127.0.0.1:8188"></label>
        <p class="muted proxy-hint">默认使用 <code>http://127.0.0.1:8188</code>。一键启动与重启会直接让 ComfyUI 监听此地址。</p>
        <p class="muted proxy-hint danger-hint">强制终止会关闭所有 ComfyUI Desktop/后端实例，不会自动重启；适用于模型无法卸载或显存未释放的情况。</p>
        <div id="connection-result" class="connection-result muted">尚未单独测试连接</div>
      </section>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>文件路径</h2><span class="muted">先确认生成结果保存位置，再管理 ComfyUI 使用的素材与模型</span></div></div>
        <div class="path-settings-group primary-paths">
          <div class="path-settings-caption"><strong>输出位置</strong><span>视频和图片生成结果分别保存</span></div>
          <div class="settings-grid two">
            <label>视频输出目录<div class="input-action"><input id="output-directory" data-auto-directory="${escapeHtml(autoVideoOutputDirectory)}" value="${escapeHtml(videoOutputDirectoryValue)}" placeholder="自动：当前 ComfyUI\\output\\Videos"><button class="secondary button-with-icon" id="pick-output-directory">${icon("folder-open")}选择</button></div></label>
            <label>图片输出目录<div class="input-action"><input id="image-output-directory" data-auto-directory="${escapeHtml(autoImageOutputDirectory)}" value="${escapeHtml(settings.imageOutputDirectory || autoImageOutputDirectory)}" placeholder="${escapeHtml(imageOutputDirectoryPlaceholder)}"><button class="secondary button-with-icon" id="pick-image-output-directory">${icon("folder-open")}选择</button></div></label>
          </div>
        </div>
        <div class="path-settings-group resource-paths">
          <div class="path-settings-caption"><strong>ComfyUI 资源</strong><span>输入素材和本地模型所在位置</span></div>
          <div class="settings-grid two">
            <label>输入素材库<div class="input-action"><input id="image-input-library-directory" value="${escapeHtml(settings.imageInputLibraryDirectory || autoImageInputLibraryDirectory)}" placeholder="等待识别当前 ComfyUI 数据目录"><button class="secondary button-with-icon" id="pick-image-input-library-directory">${icon("folder-open")}选择</button></div></label>
            <label>模型目录<div class="input-action"><input id="model-directory" value="${escapeHtml(effectiveModelDirectory)}" placeholder="扫描或选择 models 目录"><button class="secondary button-with-icon" id="pick-model-directory">${icon("folder-open")}选择</button></div></label>
          </div>
        </div>
        <div class="asset-library-settings-row"><div><strong>素材库维护</strong><span class="muted">归档旧历史引用，并检查未被使用的输入素材。</span></div><button class="secondary button-with-icon" id="open-image-asset-library">${icon("package-open")}整理素材库</button></div>
      </section>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>下载代理</h2><span class="muted">用于节点、Python 依赖、工作流及节点运行时模型下载；不会影响 ComfyUI 本地连接。</span></div><span class="model-badge">${settings.proxyEnabled ? "已开启" : "已关闭"}</span></div>
        <div class="settings-grid two">
          <label class="ios-switch-field"><span class="policy-copy"><strong>启用下载代理</strong><small>Git、pip、工作流和 SeedVR2 等节点下载共用此地址</small></span><input id="proxy-enabled" type="checkbox" ${settings.proxyEnabled ? "checked" : ""}><span class="ios-switch" aria-hidden="true"></span></label>
          <label>代理地址<input id="proxy-url" value="${escapeHtml(settings.proxyUrl)}" placeholder="http://127.0.0.1:7890"></label>
        </div>
        <p class="muted proxy-hint">默认关闭。可填写 <code>127.0.0.1:7890</code> 或完整代理 URL。节点安装立即使用；ComfyUI 运行时下载需要保存后重启服务才能继承新代理。</p>
      </section>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>GPU 运行策略</h2><span class="muted">${escapeHtml(gpuSummary)}</span></div><span class="model-badge">${escapeHtml(gpuBadge)}</span></div>
        <div class="gpu-hardware-block">
          <div class="gpu-hardware-heading"><div><strong>已识别硬件</strong><span>来自 nvidia-smi 的实时检测结果</span></div><span class="gpu-budget-label">${escapeHtml(gpuBudgetSummary)}</span></div>
          ${gpuCards}
        </div>
        <div class="runtime-policy-grid">
          <label class="policy-select-field"><span>显存安全余量</span><select id="vram-reserve"><option value="0.5" ${settings.vramReserveGb === 0.5 ? "selected" : ""}>0.5 GB · 激进</option><option value="0.75" ${settings.vramReserveGb === 0.75 ? "selected" : ""}>0.75 GB · 平衡</option><option value="1" ${settings.vramReserveGb === 1 ? "selected" : ""}>1 GB · 保守</option></select></label>
          <label class="ios-switch-field"><span class="policy-copy"><strong>安全取消</strong><small>先请求中断，再后台释放显存；清理失败时才重启 ComfyUI</small></span><input id="safe-cancel" type="checkbox" ${settings.safeCancel ? "checked" : ""}><span class="ios-switch" aria-hidden="true"></span></label>
          <label class="ios-switch-field"><span class="policy-copy"><strong>任务失败自动重试</strong><small>仅重试可通过清理并重启 ComfyUI 恢复的错误</small></span><input id="auto-retry-failed-tasks" type="checkbox" ${settings.autoRetryFailedTasks ? "checked" : ""}><span class="ios-switch" aria-hidden="true"></span></label>
          <label class="policy-select-field"><span>自动重试次数</span><select id="auto-retry-count" ${settings.autoRetryFailedTasks ? "" : "disabled"}>${[1, 2, 3, 4, 5].map((count) => `<option value="${count}" ${settings.autoRetryCount === count ? "selected" : ""}>${count} 次${count === 2 ? " · 推荐" : ""}</option>`).join("")}</select></label>
        </div>
        <p class="muted proxy-hint">CUDA 上下文损坏、显存分配失败、ComfyUI 失联或卡死会先完成进程清理和服务重启，再重试当前任务。参数、模型或工作流错误不会自动重试；达到上限后保留失败任务并继续队列。</p>
      </section>
    </section>`;

  const videoPanel = `
    <section class="settings-panel">
      <section class="panel settings-section">
        <div class="section-heading">
          <div><h2>视频模型</h2><span class="muted">根据真实文件组件判断是否可用，不仅检查单个 checkpoint 名称。</span></div>
          <label class="compact-label">默认模型<select id="default-video-model">
            ${(videoProfiles.length ? videoProfiles : [
              { id: "minimax_h3_fl2va", name: "MiniMax H3 FL2VA · 首帧 / 首尾帧", available: true, integrated: true },
              { id: "minimax_h3_fl2va_int4", name: "MiniMax H3 FL2VA · INT4 低显存", available: true, integrated: true },
              { id: "minimax_h3_fl2va_q3_gguf", name: "MiniMax H3 FL2VA · Q3 GGUF · 低显存实验", available: true, integrated: true },
              { id: "minimax_h3_ref2va", name: "MiniMax H3 R2V · 多参考 INT8", available: true, integrated: true },
              { id: "minimax_h3_ref2va_int4", name: "MiniMax H3 R2V · 多参考 INT4", available: true, integrated: true },
              { id: "sulphur2", name: "Sulphur 2 GGUF", available: false, integrated: true }
            ]).map((profile) => `<option value="${profile.id}" ${settings.defaultVideoModel === profile.id ? "selected" : ""} ${!profile.available || profile.integrated === false ? "disabled" : ""}>${escapeHtml(profile.name)}${!profile.available ? " · 缺组件" : profile.integrated === false ? " · 工作流待接入" : ""}</option>`).join("")}
          </select></label>
        </div>
        <div class="scan-result">${environmentScanning ? "正在扫描模型目录…" : environmentScan ? `找到 ${videoAvailable} 个已接入可运行模型，${videoProfiles.length - videoAvailable} 个缺组件或等待工作流接入` : "等待首次扫描"}</div>
      </section>
      <div class="model-profile-list">${videoProfiles.length ? videoProfiles.map(modelScanCard).join("") : `<div class="panel environment-empty">尚无模型扫描结果</div>`}</div>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>Sulphur 2 部署</h2><span class="muted">同一档位同时决定普通 I2V、原生 Extend、模型扫描和新任务快照。</span></div><span class="model-badge">分离式 GGUF</span></div>
        <div class="settings-grid two">
          <label>Transformer 量化档<select id="ltx-extension-model-profile"><option value="q2_distilled" ${settings.ltxExtensionModelProfile === "q2_distilled" ? "selected" : ""}>Q2_K distilled · 7.93 GB · 8GB 兼容</option><option value="q3_k_m" ${settings.ltxExtensionModelProfile === "q3_k_m" ? "selected" : ""}>Q3_K_M dev · 11.13 GB · 推荐</option><option value="q4_k_m" ${settings.ltxExtensionModelProfile === "q4_k_m" ? "selected" : ""}>Q4_K_M dev · 14.30 GB · 质量</option></select></label>
          <label>基准分辨率<select id="ltx-extension-resolution"><option value="360" ${settings.ltxExtensionResolution === 360 ? "selected" : ""}>360p · 推荐</option><option value="480" ${settings.ltxExtensionResolution === 480 ? "selected" : ""}>480p · 较慢</option></select></label>
          <label>每段新增模型帧<select id="ltx-extension-frames"><option value="49" ${settings.ltxExtensionFrames === 49 ? "selected" : ""}>49 帧 · 推荐</option><option value="65" ${settings.ltxExtensionFrames === 65 ? "selected" : ""}>65 帧 · 较长</option></select></label>
          <label>单节点等待上限<select id="ltx-extension-timeout"><option value="10" ${settings.ltxExtensionTimeoutMinutes === 10 ? "selected" : ""}>10 分钟 · 快速止损</option><option value="20" ${settings.ltxExtensionTimeoutMinutes === 20 ? "selected" : ""}>20 分钟 · 推荐</option><option value="30" ${settings.ltxExtensionTimeoutMinutes === 30 ? "selected" : ""}>30 分钟 · 极慢设备</option></select></label>
        </div>
        <p class="muted proxy-hint">Q2 使用 distilled 模型且不加载 LoRA；Q3/Q4 使用 dev 模型和 distill LoRA。三档均要求 Gemma 3、LTX 文本连接器、独立视频/音频 VAE 与 latent upscaler，并强制单任务、<code>patch_on_device=false</code>、<code>--cache-none</code>、CPU offload 和分块解码。8GB 兼容仍要求充足的系统内存与页面文件。</p>
      </section>
    </section>`;

  const loraPanel = `
    <section class="settings-panel">
      <section class="panel settings-section">
        <div class="section-heading">
          <div><h2>视频 LoRA</h2><span class="muted">LoRA 是叠加在基础模型上的可选适配层，不再作为独立视频模型显示。</span></div>
          <span class="model-badge">${loraAvailable}/${loraProfiles.length} 可用</span>
        </div>
        <div class="scan-result">标准 <code>.safetensors</code> LoRA 由 ComfyUI 核心 <code>LoraLoaderModelOnly</code> 加载，不需要单独安装节点。只有带自定义加载器、采样器、缓存或模型补丁的特殊 LoRA 才会额外依赖节点。</div>
        <p class="muted proxy-hint">LightX2V Turbo 4-Step 仅兼容 MiniMax H3 FL2VA。启用后默认使用 strength 0.75、ER-SDE、Beta 和 8 步；它减少采样步数，但不会把 H3 变成低显存模型。</p>
      </section>
      <div class="model-profile-list">${loraProfiles.length ? loraProfiles.map(modelScanCard).join("") : `<div class="panel environment-empty">尚无 LoRA 扫描结果</div>`}</div>
    </section>`;

  const imagePanel = `
    <section class="settings-panel">
      <section class="panel settings-section">
        <div class="section-heading">
          <div><h2>图片编辑模型</h2><span class="muted">选择适合当前显存的本地图像模型；只有组件和工作流完成验证后，创建页才会允许提交。</span></div>
          <span class="model-badge">Qwen / Klein</span>
        </div>
        <div class="settings-grid two">
          <label>默认图片模型<select id="default-image-model">
            ${(imageProfiles.length ? imageProfiles : [
              { id: "qwen-image-edit-2511", name: "Qwen-Image-Edit-2511 · 图片处理", category: "image" as const, badge: "Qwen 2511", description: "", vram: "", available: false, integrated: true, components: [] },
              { id: "flux2-klein-4b", name: "FLUX.2 Klein 4B · 图片处理", category: "image" as const, badge: "约 13GB VRAM", description: "", vram: "", available: false, integrated: true, components: [] }
            ]).map((profile) => `<option value="${escapeHtml(profile.id)}" ${settings.defaultImageModel === profile.id ? "selected" : ""} ${isImageModelSelectable(profile) ? "" : "disabled"}>${escapeHtml(profile.name)}${isImageModelSelectable(profile) ? "" : ` · ${escapeHtml(imageWorkflowStatus(profile))}`}</option>`).join("")}
          </select></label>
          <label>默认质量档<select id="image-quality-profile">
            ${imageQualityProfiles.map((profile) => `<option value="${escapeHtml(profile.id)}" ${settings.defaultImageQualityProfile === profile.id ? "selected" : ""}>${escapeHtml(profile.label)} · ${profile.steps} 步</option>`).join("")}
          </select></label>
          <label>默认生成数量<div class="inline-field"><input id="image-output-count" type="range" min="1" max="10" step="1" value="${Math.min(10, Math.max(1, settings.imageOutputCount))}"><input id="image-output-count-number" type="number" min="1" max="10" step="1" value="${Math.min(10, Math.max(1, settings.imageOutputCount))}"><span>张</span></div></label>
        </div>
        <div class="scan-result">${environmentScanning ? "正在扫描图片模型组件和 ComfyUI 节点…" : environmentScan ? `找到 ${imageComponentsReady} 个组件完整档位，${imageWorkflowsReady} 个工作流可用；Qwen 2511 当前最多支持 3 张 Picture` : "等待首次扫描"}</div>
        <p class="muted proxy-hint">图片工作流固定输出 PNG，便于继续编辑和交给 H3 使用。Qwen 2511 会在下次启动 ComfyUI 时自动使用 CPU VAE、文本编码器卸载和更激进的显存回收；FLUX.2 Klein 4B 是 4090 的优先轻量候选。</p>
      </section>
      <div class="model-profile-list">${imageProfiles.length ? imageProfiles.map(modelScanCard).join("") : `<div class="panel environment-empty">尚无图片模型扫描结果；请先确认模型目录后重新扫描。</div>`}</div>
    </section>`;

  const promptPanel = `
    <section class="settings-panel">
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>本地提示词模型</h2><span class="muted">统一由当前 ComfyUI 运行：Qwen 使用原生 TextGenerate，Gemma 4 使用 H3 Prompt Writer 扩展。</span></div><div class="button-row"><span class="model-badge">仅依赖 ComfyUI</span><button class="icon-button prompt-runtime-button ${promptRuntimeBusy ? "busy" : ""}" id="release-prompt-model" ${promptRuntimeBusy || state.queueRunning || (!promptRuntimeLoaded && !promptStatus.ready) ? "disabled" : ""} aria-label="${escapeHtml(promptRuntimeControlTitle(settings))}" title="${escapeHtml(promptRuntimeControlTitle(settings))}" aria-busy="${promptRuntimeBusy}">${icon(promptRuntimeControlIcon())}</button></div></div>
        <label>默认提示词模型<select id="prompt-model-id">${promptProfiles.map((profile) => `<option value="${escapeHtml(profile.id)}" ${settings.promptModelId === profile.id ? "selected" : ""} ${!profile.available ? "disabled" : ""}>${escapeHtml(profile.name)}${profile.available ? "" : " · 缺组件"} · 视频/图片</option>`).join("")}</select></label>
        <div class="settings-grid two">
          <label>扩写语言<select id="prompt-language"><option value="auto" ${settings.promptLanguage === "auto" ? "selected" : ""}>跟随输入语言</option><option value="zh" ${settings.promptLanguage === "zh" ? "selected" : ""}>中文</option><option value="en" ${settings.promptLanguage === "en" ? "selected" : ""}>英文</option></select></label>
          <label>创造性<select id="prompt-creativity"><option value="0.3" ${settings.promptCreativity === 0.3 ? "selected" : ""}>克制 · 0.3</option><option value="0.7" ${settings.promptCreativity === 0.7 ? "selected" : ""}>平衡 · 0.7</option><option value="1" ${settings.promptCreativity === 1 ? "selected" : ""}>丰富 · 1.0</option></select></label>
        </div>
        <div class="scan-result">${environmentScanning ? "正在扫描 ComfyUI/models…" : environmentScan ? `找到 ${promptAvailable} 个提示词模型档位` : "等待首次扫描"}</div>
        <p class="muted proxy-hint">Qwen Safetensors 使用 ComfyUI 官方 <code>models/text_encoders</code> 分类；Gemma GGUF 使用 H3 Prompt Writer 扩展注册的大写 <code>models/LLM/独立子目录</code>，主模型与匹配的 <code>mmproj</code> 必须放在一起。扩写完成会自动卸载，不需要安装或启动 llama-server、LM Studio。</p>
      </section>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>视频提示词预设</h2><span class="muted">预设会把原始文字和参考图整理成完整的 H3 视频提示词，覆盖主体、场景、动作、镜头、声音、对白和连续性。</span></div><button class="secondary button-with-icon" id="restore-h3-prompt-presets">${icon("rotate-ccw")}恢复默认</button></div>
        <label>当前编辑预设<select id="h3-prompt-preset-setting">${h3PromptPresetOptions(settingsH3PromptPreset, true)}</select></label>
        <p class="muted proxy-hint">${escapeHtml(h3PromptPresetDescriptions[settingsH3PromptPreset])}</p>
        <label>预设规则头<textarea id="h3-prompt-preset-text" rows="7">${escapeHtml(selectedH3PresetText)}</textarea></label>
        <p class="muted proxy-hint">规则头可自由修改；内置的 H3 官方基线会继续强制参考标签、首尾帧关系、连续性、音频和输出格式。修改后点击设置页顶部“保存设置”，创建页下次扩写立即使用。</p>
      </section>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>图片提示词预设</h2><span class="muted">只影响图片“优化提示词”时的整理策略，不改变 Qwen Image 的生成参数。</span></div><button class="secondary button-with-icon" id="restore-image-prompt-presets">${icon("rotate-ccw")}恢复默认</button></div>
        <label>当前编辑预设<select id="image-prompt-preset-setting">${Object.entries(imagePromptPresetLabels).map(([id, label]) => `<option value="${id}" ${settingsImagePromptPreset === id ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        <p class="muted proxy-hint">${escapeHtml(imagePromptPresetDescriptions[settingsImagePromptPreset])}</p>
        <label>预设规则头<textarea id="image-prompt-preset-text" rows="7">${escapeHtml(selectedImagePromptPresetText)}</textarea></label>
        <p class="muted proxy-hint">规则头会作为图片 Prompt 优化器的策略说明；最终发送给 Qwen Image 的 Prompt 不会包含这段设置文本。</p>
      </section>
      <div class="model-profile-list">${promptProfiles.length ? promptProfiles.map(modelScanCard).join("") : `<div class="panel environment-empty">尚无提示词模型扫描结果</div>`}</div>
    </section>`;

  const upscalePanel = `
    <section class="settings-panel">
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>分辨率提升模型</h2><span class="muted">只有组件完整的模型才能进入后续提升工作流。</span></div>
          <label class="compact-label">默认模型<select id="default-upscale-model">${upscaleProfiles.map((profile) => `<option value="${profile.id}" ${settings.defaultUpscaleModel === profile.id ? "selected" : ""} ${!profile.available ? "disabled" : ""}>${escapeHtml(profile.name)}${profile.available ? "" : " · 缺组件"}</option>`).join("")}</select></label>
        </div>
        <div class="scan-result">${environmentScanning ? "正在扫描模型目录…" : environmentScan ? `找到 ${upscaleAvailable} 个可运行模型，${upscaleProfiles.length - upscaleAvailable} 个待补齐` : "等待首次扫描"}</div>
        <div class="settings-grid two">
          <label>SeedVR2 权重<input id="seedvr2-model" value="${escapeHtml(settings.seedVr2Model)}"></label>
          <label>Real-ESRGAN 权重<input id="realesrgan-model" value="${escapeHtml(settings.realEsrganModel)}"></label>
        </div>
      </section>
      <div class="model-profile-list">${upscaleProfiles.length ? upscaleProfiles.map(modelScanCard).join("") : `<div class="panel environment-empty">尚无模型扫描结果</div>`}</div>
    </section>`;

  const nodeInstalled = environmentScan?.customNodes.filter(
    (node) => node.loaded
  ).length ?? 0;
  const h3CoreNodes = environmentScan?.comfyCompatibility.coreNodes ?? [];
  const h3CoreKnown = environmentScan?.comfyCompatibility.checkedFrom !== "";
  const h3CoreReady = environmentScan?.comfyCompatibility.h3CoreSupported ?? false;
  const promptCoreNodes = environmentScan?.comfyCompatibility.promptCoreNodes ?? [];
  const promptCoreKnown = environmentScan?.comfyCompatibility.checkedFrom !== "";
  const promptCoreReady = promptCoreNodes.length > 0 && promptCoreNodes.every((node) => node.available);
  const workflowDependencies = environmentScan?.workflowDependencies ?? [];
  const nodeDependencyAvailable = nodeInstalled + (h3CoreReady ? 1 : 0) +
    (promptCoreReady ? 1 : 0) +
    workflowDependencies.filter((workflow) => workflow.installed).length;
  const nodeDependencyTotal = (environmentScan?.customNodes.length ?? 0) + 2 +
    workflowDependencies.length;
  const nodePanel = `
    <section class="settings-panel">
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>节点与工作流依赖</h2><span class="muted">换电脑后按项目清单复现 ComfyUI 节点环境</span></div><span class="model-badge">${nodeDependencyAvailable}/${nodeDependencyTotal} 可用</span></div>
        <div class="scan-result">安装只使用项目内置仓库清单；完成后重启 ComfyUI，再重新扫描。</div>
      </section>
      <div class="model-profile-list">
        <article class="panel custom-node-card ${h3CoreReady ? "available" : "missing"}">
          <div class="custom-node-copy">
            <div class="model-title"><h3>MiniMax H3 原生音视频核心</h3><span class="model-badge">ComfyUI v0.31.0+</span></div>
            <p>LightX2V Turbo 直接使用 ComfyUI 原生 LoRA 与音视频采样，不需要额外的 Turbo custom node；版本过低时请更新所选 ComfyUI 并重启复检。</p>
            <div class="component-list">
              ${h3CoreNodes.map((node) => `<div class="component-row ${node.available ? "found" : "missing"}"><span class="component-state">${icon(node.available ? "circle-check" : "circle-alert")}</span><div><strong>${escapeHtml(node.label)}</strong><code>${escapeHtml(node.id)}</code></div></div>`).join("") || `<div class="component-row missing"><span class="component-state">${icon("circle-alert")}</span><div><strong>等待扫描核心节点</strong></div></div>`}
            </div>
            <span class="muted">最低版本 <code>v0.31.0</code> · 参考提交 <code>${escapeHtml(environmentScan?.comfyCompatibility.h3MinimumRevision ?? "")}</code></span>
            ${comfyUpdateLog ? `<details class="node-log" open><summary>核心处理日志</summary><pre>${escapeHtml(comfyUpdateLog)}</pre></details>` : ""}
          </div>
          <div class="custom-node-actions">
            <span class="model-availability ${h3CoreReady ? "available" : "missing"}">${h3CoreReady ? `${icon("circle-check")} 已加载` : h3CoreKnown ? `${icon("circle-alert")} 核心缺失` : `${icon("circle-help")} 尚未启动检测`}</span>
            ${h3CoreReady ? "" : `<button class="primary button-with-icon" id="repair-h3-core" ${coreDependencyRepairing ? "disabled" : ""}>${icon(coreDependencyRepairing ? "refresh-cw" : "shield-check")}${coreDependencyRepairing ? "处理中…" : h3CoreKnown ? "一键补齐/更新" : "启动并检测"}</button>`}
          </div>
        </article>
        <article class="panel custom-node-card ${promptCoreReady ? "available" : "missing"}">
          <div class="custom-node-copy">
            <div class="model-title"><h3>Qwen 提示词核心节点</h3><span class="model-badge">ComfyUI 核心</span></div>
            <p>Qwen3.5 2B/4B 使用 ComfyUI 自带的文本生成链路，不需要安装第三方节点；更新 ComfyUI 核心后重新扫描即可。</p>
            <div class="component-list">
              ${promptCoreNodes.map((node) => `<div class="component-row ${node.available ? "found" : "missing"}"><span class="component-state">${icon(node.available ? "circle-check" : "circle-alert")}</span><div><strong>${escapeHtml(node.label)}</strong><code>${escapeHtml(node.id)}</code></div></div>`).join("") || `<div class="component-row missing"><span class="component-state">${icon("circle-alert")}</span><div><strong>等待扫描 Qwen 核心节点</strong></div></div>`}
            </div>
          </div>
          <div class="custom-node-actions">
            <span class="model-availability ${promptCoreReady ? "available" : "missing"}">${promptCoreReady ? `${icon("circle-check")} 已加载` : promptCoreKnown ? `${icon("circle-alert")} 核心缺失` : `${icon("circle-help")} 尚未启动检测`}</span>
          </div>
        </article>
        ${workflowDependencies.map((workflow) => `
          <article class="panel custom-node-card ${workflow.installed ? "available" : "missing"}">
            <div class="custom-node-copy">
              <div class="model-title"><h3>${escapeHtml(workflow.name)}</h3><span class="model-badge">官方工作流</span></div>
              <p>${escapeHtml(workflow.purpose)}</p>
              <code>${escapeHtml(workflow.path || workflow.sourceUrl)}</code>
              ${workflowDependencyLogs[workflow.id] ? `<details class="node-log" open><summary>安装日志</summary><pre>${escapeHtml(workflowDependencyLogs[workflow.id])}</pre></details>` : ""}
            </div>
            <div class="custom-node-actions">
              <span class="model-availability ${workflow.installed ? "available" : "missing"}">${workflow.installed ? `${icon("circle-check")} 已安装` : `${icon("circle-alert")} 未安装`}</span>
              <button class="${workflow.installed ? "secondary" : "primary"} button-with-icon" data-install-workflow="${escapeHtml(workflow.id)}" ${workflowDependencyInstalling ? "disabled" : ""}>${icon(workflowDependencyInstalling === workflow.id ? "refresh-cw" : "download")}${workflowDependencyInstalling === workflow.id ? "安装中…" : workflow.installed ? "重新安装" : "一键安装"}</button>
            </div>
          </article>`).join("")}
        ${(environmentScan?.customNodes ?? []).map((node) => `
          <article class="panel custom-node-card ${node.loaded ? "available" : "missing"}">
            <div class="custom-node-copy">
              <div class="model-title"><h3>${escapeHtml(node.name)}</h3><span class="model-badge">${node.required ? "项目必需" : "可选"}${node.version ? ` · v${escapeHtml(node.version)}` : ""}</span></div>
              <p>${escapeHtml(node.purpose)}</p>
              <code>${escapeHtml(node.directory || node.repositoryUrl)}</code>
              ${node.id === "spectrum-minimax-h3" ? `<p class="muted">本机版本：${node.version ? `v${escapeHtml(node.version)}` : node.installed ? "未读取到版本号" : "未安装"} · 最新发布：${node.latestVersion ? `v${escapeHtml(node.latestVersion)}` : "联网后重新扫描"} · 运行时固定使用系统内存，不额外下载模型。</p>` : ""}
              ${node.loadError ? `<span class="node-error">${escapeHtml(node.loadError)}</span>` : ""}
              ${customNodeLogs[node.id] ? `<details class="node-log" open><summary>安装日志</summary><pre>${escapeHtml(customNodeLogs[node.id])}</pre></details>` : ""}
            </div>
            <div class="custom-node-actions">
              <span class="model-availability ${node.loaded && !node.updateAvailable ? "available" : "missing"}">${node.updateAvailable ? `${icon("circle-alert")} 需要更新` : node.loaded ? `${icon("circle-check")} ${node.runtimeVerified ? "运行时已验证" : "文件检查通过"}` : node.installed ? `${icon("circle-alert")} 已安装，需修复` : `${icon("circle-alert")} 未安装`}</span>
              <button class="${node.updateAvailable || !node.installed || !node.loaded ? "primary" : "secondary"} button-with-icon" data-install-node="${escapeHtml(node.id)}" ${customNodeInstalling || state.queueRunning || state.queue.some((task) => task.status === "running") ? "disabled" : ""}>${icon(customNodeInstalling === node.id ? "refresh-cw" : node.installed ? "refresh-cw" : "download")}${customNodeInstalling === node.id ? "处理中…" : node.updateAvailable ? "更新并重启" : node.installed && !node.loaded ? "更新/重启复检" : node.installed ? "检查更新" : "安装并重启"}</button>
            </div>
          </article>`).join("") || `<div class="panel environment-empty">等待环境扫描结果</div>`}
      </div>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>工作流占位符</h2><span class="muted">提交自定义视频 ComfyUI API JSON 前会递归替换；图片工作流不使用这些占位符。</span></div></div>
        <div class="token-list">${["PROMPT", "NEGATIVE_PROMPT", "SEED", "INPUT_IMAGE", "END_IMAGE", "SOURCE_VIDEO", "TRIM_START", "TRIM_END", "EXTENSION_FRAMES", "OVERLAP_FRAMES", "UNLOAD_BETWEEN_STAGES", "WIDTH", "HEIGHT", "DURATION", "SOURCE_FPS", "FPS", "FRAMES", "OUTPUT_FRAMES", "OUTPUT_FILENAME", "H3_DIFFUSION_MODEL", "H3_TEXT_ENCODER", "H3_TURBO_LORA"].map((token) => `<code>{{${token}}}</code>`).join("")}</div>
      </section>
    </section>`;

  const attention = environmentScan?.attentionAcceleration;
  const pythonSourceLabels: Record<string, string> = {
    selected: "手动指定",
    "comfy-venv": "ComfyUI 虚拟环境",
    embedded: "嵌入式 Python",
    path: "系统 PATH",
    "py-launcher": "py 启动器",
    other: "其他来源"
  };
  const pythonRuntimes = environmentScan?.pythonRuntimes ?? [];
  const detectedPythonPath = attention?.pythonPath ||
    pythonRuntimes.find((runtime) => runtime.selected)?.path ||
    pythonRuntimes[0]?.path ||
    "";
  const effectivePythonPath = settings.comfyPythonPath || detectedPythonPath;
  const selectedPythonRuntime = pythonRuntimes.find(
    (runtime) => runtime.path.toLowerCase() === effectivePythonPath.toLowerCase()
  );
  const pythonSelectionLabel = settings.comfyPythonPath
    ? selectedPythonRuntime?.source === "comfy-venv"
      ? "ComfyUI 虚拟环境"
      : "手动指定"
    : "自动探测";
  const accelerationPanel = `
    <section class="settings-panel acceleration-panel">
      <section class="panel settings-section acceleration-overview ${attention?.ready ? "available" : "missing"}">
        <div class="section-heading">
          <div><h2>H3 推理加速</h2><span class="muted">为当前 ComfyUI 环境匹配 Python、PyTorch、CUDA 与 Attention 运行库</span></div>
          <span class="model-availability ${attention?.ready ? "available" : "missing"}">${attention?.ready ? `${icon("circle-check")} 已就绪` : attention?.supported ? `${icon("circle-alert")} 待安装/修复` : `${icon("circle-alert")} 环境不支持`}</span>
        </div>
        <div class="acceleration-control-row">
          <label class="acceleration-mode-field">H3 Attention 模式
            <select id="h3-attention-mode">
              <option value="sage" ${settings.h3AttentionMode === "sage" ? "selected" : ""}>自动加速 · SageAttention CUDA FP16</option>
              <option value="sage-triton" ${settings.h3AttentionMode === "sage-triton" ? "selected" : ""}>稳定加速 · SageAttention Triton FP16</option>
              <option value="pytorch" ${settings.h3AttentionMode === "pytorch" ? "selected" : ""}>兼容模式 · PyTorch Attention</option>
            </select>
          </label>
          <div class="acceleration-summary">
            <span class="acceleration-summary-icon">${icon(attention?.ready ? "circle-check" : "circle-alert")}</span>
            <div><strong>${escapeHtml(attention?.detail ?? "等待环境扫描")}</strong><span>CUDA 内核异常时会依次降级到 SageAttention Triton 和 PyTorch Attention，避免队列反复崩溃。</span></div>
          </div>
        </div>
        <div class="python-runtime-picker">
          <div class="python-runtime-picker-head">
            <div><span class="runtime-label">ComfyUI Python 解释器</span><strong>用于启动 ComfyUI、安装节点依赖和 H3 加速检测</strong></div>
            <span class="python-selection-badge">${pythonSelectionLabel}</span>
          </div>
          <div class="python-runtime-picker-controls">
            <label class="python-path-field"><span class="runtime-label">当前解释器路径</span><div class="input-action"><input id="comfy-python-path" value="${escapeHtml(effectivePythonPath)}" placeholder="扫描后自动填入可用解释器"><button class="secondary button-with-icon" id="pick-comfy-python">${icon("folder-open")}选择文件</button></div></label>
            <label class="python-candidate-field"><span class="runtime-label">扫描到的候选版本</span><select id="comfy-python-candidate"><option value="">${environmentScanning ? "正在扫描…" : pythonRuntimes.length ? "选择一个解释器" : "未发现可用 Python"}</option>${pythonRuntimes.map((runtime) => `<option value="${escapeHtml(runtime.path)}" ${runtime.path.toLowerCase() === effectivePythonPath.toLowerCase() ? "selected" : ""}>Python ${escapeHtml(runtime.version)} · ${escapeHtml(pythonSourceLabels[runtime.source] ?? runtime.source)}${runtime.path.toLowerCase() === effectivePythonPath.toLowerCase() ? " · 当前" : ""}</option>`).join("")}</select></label>
          </div>
        </div>
        <div class="attention-runtime-grid">
          <article class="attention-runtime-card"><span class="runtime-label">ComfyUI Python</span><strong class="runtime-value">${escapeHtml(attention?.pythonVersion || "未找到")}</strong><code class="runtime-detail" title="${escapeHtml(attention?.pythonPath || "")}">${escapeHtml(attention?.pythonPath || "请先选择 ComfyUI 安装目录")}</code></article>
          <article class="attention-runtime-card"><span class="runtime-label">PyTorch / CUDA</span><strong class="runtime-value">${escapeHtml(attention?.torchVersion || "未知")}</strong><code class="runtime-detail">CUDA ${escapeHtml(attention?.cudaVersion || "未知")} · SM ${escapeHtml(attention?.gpuArchitecture || "未知")}</code></article>
          <article class="attention-runtime-card"><span class="runtime-label">SageAttention</span><strong class="runtime-value">${escapeHtml(attention?.sageAttentionVersion || "未安装")}</strong><code class="runtime-detail" title="${escapeHtml(attention?.recommendedWheel || "")}">${escapeHtml(attention?.recommendedWheel || "当前环境没有匹配的 wheel")}</code></article>
          <article class="attention-runtime-card"><span class="runtime-label">Triton / KJNodes</span><strong class="runtime-value">${escapeHtml(attention?.tritonVersion || "未安装")}</strong><code class="runtime-detail">${attention?.kjNodesCompatible ? "KJNodes 模型级补丁可用" : attention?.kjNodesInstalled ? "KJNodes 需要更新" : "KJNodes 未安装"}</code></article>
        </div>
        <div class="acceleration-actions">
          <button class="primary button-with-icon" id="install-attention-acceleration" ${attentionAccelerationInstalling || !attention?.supported ? "disabled" : ""}>${icon(attentionAccelerationInstalling ? "refresh-cw" : "wand-sparkles")}${attentionAccelerationInstalling ? "正在补全环境…" : attention?.ready ? "重新安装/修复" : "一键安装并自检"}</button>
          <div><strong>安装过程会临时停止 ComfyUI</strong><span>环境补全后，若服务此前正在运行，程序会自动将它重启。</span></div>
        </div>
        ${attentionAccelerationLog ? `<details class="node-log" open><summary>环境安装日志</summary><pre id="attention-install-log">${escapeHtml(attentionAccelerationLog)}</pre></details>` : ""}
      </section>
    </section>`;

  const logsPanel = `
    <section class="settings-panel app-logs-panel">
      <section class="panel settings-section">
        <div class="section-heading">
          <div><h2>运行日志</h2><span class="muted">记录程序生命周期、任务阶段和错误，不记录提示词、输入内容或媒体路径。</span></div>
          <div class="button-row"><button class="secondary button-with-icon" id="refresh-app-logs" ${appLogsLoading ? "disabled" : ""}>${icon(appLogsLoading ? "refresh-cw" : "rotate-ccw")}${appLogsLoading ? "读取中…" : "刷新"}</button></div>
        </div>
        <div class="app-log-summary">
          <div class="app-log-directory-actions"><span>目录</span><div><button class="secondary button-with-icon" id="open-app-log-directory">${icon("folder-open")}日志目录</button><button class="secondary button-with-icon" id="open-app-crash-directory">${icon("folder-open")}崩溃转储</button></div></div>
          <div class="app-log-stats"><div class="app-log-stat"><span>保留</span><strong>${appLogs?.retentionDays ?? 7} 天</strong></div><div class="app-log-stat"><span>记录</span><strong id="app-log-count">${appLogs?.records.length ?? 0}</strong></div></div>
        </div>
        ${appLogsError ? `<p class="error">${escapeHtml(appLogsError)}</p>` : ""}
        ${appLogs?.text
          ? `<pre class="app-log-terminal" id="app-log-terminal">${appLogTerminalHtml(visibleAppLogText(appLogs.text))}</pre>`
          : `<div class="environment-empty">${appLogsLoading ? "正在读取运行日志…" : "暂无运行日志"}</div>`}
      </section>
    </section>`;

  const activePanel =
    settingsTab === "system" ? systemPanel :
    settingsTab === "acceleration" ? accelerationPanel :
    settingsTab === "video" ? videoPanel :
    settingsTab === "lora" ? loraPanel :
    settingsTab === "image" ? imagePanel :
    settingsTab === "nodes" ? nodePanel :
    settingsTab === "prompt" ? promptPanel :
    settingsTab === "upscale" ? upscalePanel :
    logsPanel;

  return `
    <section class="page-heading settings-heading">
      <div><div class="heading-line"><h1>设置</h1>${gpuDevices.length ? `<span class="model-badge">${escapeHtml(gpuBadge)}</span>` : ""}</div><p>模型扫描、GPU 显存检测和本地服务集中配置。</p></div>
      <div class="button-row settings-heading-actions"><span class="save-state ${settingsDirty ? "dirty" : ""}">${settingsDirty ? "未保存更改" : "已保存"}</span><button class="secondary button-with-icon" id="scan-environment" ${environmentScanning ? "disabled" : ""}>${icon(environmentScanning ? "refresh-cw" : "scan-search")}${environmentScanning ? "扫描中…" : "重新扫描全部"}</button><button class="secondary button-with-icon" id="discard-settings" ${settingsDirty ? "" : "disabled"}>${icon("rotate-ccw")}放弃更改</button><button class="primary button-with-icon" id="save-settings" ${settingsDirty ? "" : "disabled"}>${icon("save")}保存设置</button></div>
    </section>
    <div class="settings-layout">
      <nav class="settings-sidebar" aria-label="设置分类">
        ${([
          ["system", "settings", "系统与路径"],
          ["acceleration", "zap", "推理加速"],
          ["video", "images", "视频模型"],
          ["lora", "zap", "LoRA"],
          ["image", "images", "图片模型"],
          ["nodes", "workflow", "节点与工作流"],
          ["prompt", "sparkles", "提示词扩写"],
          ["upscale", "maximize-2", "分辨率提升"],
          ["logs", "file-text", "运行日志"]
        ] as const).map(([id, iconName, label]) => `<button class="settings-tab ${settingsTab === id ? "active" : ""}" data-settings-tab="${id}"><span>${icon(iconName)}</span>${label}${id === "video" && environmentScan ? `<small>${videoAvailable}/${videoProfiles.length}</small>` : ""}${id === "lora" && environmentScan ? `<small>${loraAvailable}/${loraProfiles.length}</small>` : ""}${id === "image" && environmentScan ? `<small>${imageComponentsReady}/${imageProfiles.length}</small>` : ""}${id === "nodes" && environmentScan ? `<small>${nodeDependencyAvailable}/${nodeDependencyTotal}</small>` : ""}${id === "prompt" && environmentScan ? `<small>${promptAvailable}/${promptProfiles.length}</small>` : ""}${id === "upscale" && environmentScan ? `<small>${upscaleAvailable}/${upscaleProfiles.length}</small>` : ""}</button>`).join("")}
      </nav>
      <div class="settings-content">${activePanel}</div>
    </div>
    ${installGuideDialog()}`;
}

function render(): void {
  if (historyLayoutRestoreFrame !== null) {
    window.cancelAnimationFrame(historyLayoutRestoreFrame);
    historyLayoutRestoreFrame = null;
  }
  historyLayoutAnchor = null;
  if (page === "history" && !historyScrollRestorePending) {
    historyScrollPosition = window.scrollY;
  }
  pageViewportEvents?.abort();
  pageViewportEvents = null;
  const playback = captureHistoryPlayback();
  stopRenderedVideoPlayback();
  historyMasonryResizeObserver?.disconnect();
  historyMasonryResizeObserver = null;
  historyAlbumResizeObserver?.disconnect();
  historyAlbumResizeObserver = null;
  imageHistoryViewerResizeObserver?.disconnect();
  imageHistoryViewerResizeObserver = null;
  historyTitleResizeObserver?.disconnect();
  historyTitleResizeObserver = null;
  historyMediaObserver?.disconnect();
  historyMediaObserver = null;
  historyCoverWarmupController?.abort();
  historyCoverWarmupController = null;
  window.clearTimeout(historyCoverWarmupTimer);
  historyCoverWarmupTimer = undefined;
  closeHistoryContextMenu();
  const content =
    page === "create" ? createPage() :
    page === "queue" ? queuePage() :
    page === "history" ? historyPage() :
    page === "history-detail" ? historyDetailPage() :
    page === "image-history-detail" ? imageHistoryDetailPage() :
    settingsPage();
  appElement.innerHTML = shell(content);
  renderIcons(appElement);
  bindShell();
  bindPageViewportControls();
  bindUpscaleDialog();
  if (page === "create") {
    bindCreate();
    if (creationMode === "image-edit") {
      void loadImageEditPreviews();
    } else {
      void imagePreview(state.draft.startImagePath, "start-preview");
      void imagePreview(state.draft.endImagePath, "end-preview");
    }
    if (creationMode !== "image-edit" && isMiniMaxH3R2vModel(state.draft.modelId)) {
      bindH3ReferenceSlots();
      for (const slot of state.draft.h3ReferenceSlots) {
        if (slot.mediaType === "image") {
          void imagePreview(slot.mediaPath, `h3-slot-preview-${slot.id}`);
        }
      }
    }
  } else if (page === "queue") {
    bindQueue();
    void loadQueueInputPreviews();
    restoreQueueMoveAnchor();
  }
  else if (page === "history" || page === "history-detail" || page === "image-history-detail") {
    bindHistory(playback);
  }
  else if (page === "settings") bindSettings();
  syncAppLogPolling();
  if (page === "history") {
    restoreHistoryScrollPosition();
  }
  restoreHistoryPlayback(playback);
}

function syncFlashMessage(): void {
  const flash = document.querySelector<HTMLElement>("#app-flash");
  if (!flash) return;
  flash.textContent = flashMessage;
  flash.classList.toggle("visible", Boolean(flashMessage));
}

function showMessage(message: string, _legacyRenderPage?: boolean): void {
  flashMessage = message;
  window.clearTimeout(flashMessageTimer);
  syncFlashMessage();
  flashMessageTimer = window.setTimeout(() => {
    if (flashMessage === message) {
      flashMessage = "";
      syncFlashMessage();
    }
  }, 3500);
}

function reportUserAction(action: string, meta?: Record<string, unknown>): void {
  void window.studio.reportUserAction(action, meta).catch(() => undefined);
}

function clearAppLogScreen(): void {
  if (appLogsLoading) return;
  appLogScreenClearedAt = Date.now();
  appLogFollowTail = true;
  reportUserAction("clear-log-screen");
  const terminal = document.querySelector<HTMLPreElement>("#app-log-terminal");
  if (terminal) {
    terminal.innerHTML = "";
    terminal.scrollTop = 0;
  }
}

function openAppLogContextMenu(clientX: number, clientY: number): void {
  closeHistoryContextMenu();
  const selectedText = window.getSelection()?.toString() ?? "";
  const menu = document.createElement("section");
  menu.className = "history-context-menu app-log-context-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "运行日志快捷操作");
  menu.innerHTML = `<button role="menuitem" data-app-log-action="copy" ${selectedText.trim() ? "" : "disabled"}><span class="context-icon">${icon("copy")}</span><span><strong>复制</strong><small>复制选中的日志文本</small></span></button><button role="menuitem" data-app-log-action="select-all"><span class="context-icon">${icon("list")}</span><span><strong>全选</strong><small>选择当前日志内容</small></span></button><div class="history-context-separator" role="separator"></div><button class="danger" role="menuitem" data-app-log-action="clear"><span class="context-icon">${icon("trash-2")}</span><span><strong>清屏</strong><small>只清空当前视口，继续接收新日志</small></span></button>`;
  menu.style.left = `${clientX}px`;
  menu.style.top = `${clientY}px`;
  document.body.append(menu);
  renderIcons(menu);
  historyContextMenuElement = menu;
  const events = new AbortController();
  historyContextMenuEvents = events;
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(clientX, window.innerWidth - rect.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(clientY, window.innerHeight - rect.height - 8))}px`;
  menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  menu.addEventListener("contextmenu", (event) => event.preventDefault());
  menu.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-app-log-action]");
    if (!button || button.disabled) return;
    const action = button.dataset.appLogAction;
    closeHistoryContextMenu();
    if (action === "copy") {
      try {
        await navigator.clipboard.writeText(selectedText);
        reportUserAction("copy-app-log-selection", { length: selectedText.length });
        showMessage("日志片段已复制。");
      } catch {
        showMessage("复制日志失败，请检查系统剪贴板权限。");
      }
    } else if (action === "select-all") {
      const terminal = document.querySelector<HTMLPreElement>("#app-log-terminal");
      if (terminal) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(terminal);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    } else if (action === "clear") {
      clearAppLogScreen();
    }
  });
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!menu.contains(event.target as Node)) closeHistoryContextMenu();
    },
    { capture: true, signal: events.signal }
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") closeHistoryContextMenu();
    },
    { signal: events.signal }
  );
  window.addEventListener("blur", closeHistoryContextMenu, { signal: events.signal });
  window.addEventListener("resize", closeHistoryContextMenu, { signal: events.signal });
}

function appLogTerminalHtml(text: string): string {
  if (!text) return "暂无运行日志";
  return text.split("\n").map((line) => {
    const level = line.match(/\]\[(DEBUG|INFO|WARN|ERROR|FATAL)\s*\]/u)?.[1]?.toLowerCase() ?? "info";
    return `<span class="app-log-line ${level}">${escapeHtml(line)}</span>`;
  }).join("\n");
}

function appLogTimestampMs(value: string): number {
  const isoTime = Date.parse(value);
  if (Number.isFinite(isoTime)) return isoTime;
  const match = value.match(/^(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2}):(\d{3})$/u);
  if (!match) return Number.NaN;
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
    Number(match[7])
  ).getTime();
}

function visibleAppLogText(text: string): string {
  if (appLogScreenClearedAt == null) return text;
  return text.split("\n").filter((line) => {
    const timestamp = line.match(/^\[([^\]]+)\]/u)?.[1];
    return timestamp ? appLogTimestampMs(timestamp) >= appLogScreenClearedAt! : false;
  }).join("\n");
}

function applyAppLogSnapshot(snapshot: AppLogSnapshot): void {
  appLogs = snapshot;
  const terminal = document.querySelector<HTMLPreElement>("#app-log-terminal");
  if (!terminal) {
    render();
    return;
  }
  const shouldFollowTail = appLogFollowTail ||
    terminal.scrollHeight - terminal.scrollTop - terminal.clientHeight < 48;
  terminal.innerHTML = appLogTerminalHtml(visibleAppLogText(snapshot.text));
  if (shouldFollowTail) terminal.scrollTop = terminal.scrollHeight;
  const count = document.querySelector<HTMLElement>("#app-log-count");
  if (count) count.textContent = String(snapshot.records.length);
}

async function pollAppLogs(): Promise<void> {
  if (
    appLogPollingInFlight ||
    appLogsLoading ||
    page !== "settings" ||
    settingsTab !== "logs"
  ) return;
  appLogPollingInFlight = true;
  try {
    const snapshot = await window.studio.readAppLogs(500);
    if (snapshot.text !== appLogs?.text) applyAppLogSnapshot(snapshot);
  } catch {
    // The panel keeps the last readable log while the main process is busy.
  } finally {
    appLogPollingInFlight = false;
  }
}

function syncAppLogPolling(): void {
  const shouldPoll = page === "settings" && settingsTab === "logs";
  if (!shouldPoll) {
    if (appLogPollingTimer !== undefined) {
      window.clearInterval(appLogPollingTimer);
      appLogPollingTimer = undefined;
    }
    return;
  }
  if (appLogPollingTimer === undefined) {
    appLogPollingTimer = window.setInterval(() => void pollAppLogs(), 2_000);
  }
}

async function releasePromptModelFromUi(): Promise<void> {
  if (promptReleasing) return;
  reportUserAction("release-prompt-service");
  promptReleasing = true;
  render();
  try {
    const result = await window.studio.releasePromptModel();
    if (result.ok) promptRuntimeLoaded = false;
    showMessage(result.message);
  } catch (error) {
    showMessage(error instanceof Error ? error.message : String(error));
  } finally {
    promptReleasing = false;
    render();
  }
}

async function startPromptModelFromUi(): Promise<void> {
  if (promptStarting) return;
  reportUserAction("start-prompt-service");
  promptStarting = true;
  render();
  try {
    const result = await window.studio.startPromptModel();
    if (!result.ok) throw new Error(result.message);
    promptRuntimeLoaded = true;
    showMessage(result.message);
  } catch (error) {
    showMessage(error instanceof Error ? error.message : String(error));
  } finally {
    promptStarting = false;
    render();
  }
}

async function togglePromptModelFromUi(): Promise<void> {
  if (promptRuntimeLoaded) {
    await releasePromptModelFromUi();
  } else {
    await startPromptModelFromUi();
  }
}

function requestHistoryDeletion(assetId: string): void {
  const asset = state.history.find((item) => item.id === assetId);
  const project = state.imageHistory.find((item) => item.id === assetId);
  const title = asset?.title ?? project?.title;
  if (!title) return;
  rememberModalFocus();
  pendingConfirmation = {
    kind: "delete-history",
    assetId,
    title
  };
  confirmationBusy = false;
  render();
}

function requestImageVersionDeletion(projectId: string, versionId: string): void {
  const project = state.imageHistory.find((item) => item.id === projectId);
  const version = project?.versions.find((item) => item.id === versionId);
  if (!project || !version || version.kind === "source") return;
  rememberModalFocus();
  pendingConfirmation = {
    kind: "delete-image-version",
    projectId,
    versionId,
    title: `${project.title} · 版本 ${version.versionNumber}`
  };
  confirmationBusy = false;
  render();
}

function requestQueueTaskConfirmation(
  taskId: string,
  action: "remove" | "cancel"
): void {
  const task = state.queue.find((item) => item.id === taskId);
  if (!task) return;
  rememberModalFocus();
  pendingConfirmation = {
    kind: action === "remove" ? "remove-queue-task" : "cancel-queue-task",
    taskId,
    title: task.outputFilename
  };
  confirmationBusy = false;
  render();
}

function closeHistoryContextMenu(): void {
  historyContextMenuEvents?.abort();
  historyContextMenuEvents = null;
  historyContextMenuElement?.remove();
  historyContextMenuElement = null;
}

function historyPlayerIsFullscreen(): boolean {
  return Boolean(document.fullscreenElement?.closest(".history-player"));
}

function restoreHistoryPlayerFullscreen(): void {
  const target = document.querySelector<HTMLVideoElement>(".history-player video") ??
    document.querySelector<HTMLElement>(".history-player");
  if (!target?.requestFullscreen) return;
  void target.requestFullscreen().catch(() => undefined);
}

function updateHistoryDetailInPlace(): boolean {
  const currentPlayer = document.querySelector<HTMLElement>(".history-player");
  const currentVideo = currentPlayer?.querySelector<HTMLVideoElement>("video");
  if (!currentPlayer || !currentVideo) return false;

  const nextMarkup = document.createElement("div");
  nextMarkup.innerHTML = historyDetailPage();
  const nextPlayer = nextMarkup.querySelector<HTMLElement>(".history-player");
  const nextVideo = nextPlayer?.querySelector<HTMLVideoElement>("video");
  const currentBack = document.querySelector<HTMLElement>(".history-detail-back");
  const nextBack = nextMarkup.querySelector<HTMLElement>(".history-detail-back");
  const currentSidebar = document.querySelector<HTMLElement>(".history-detail-sidebar");
  const nextSidebar = nextMarkup.querySelector<HTMLElement>(".history-detail-sidebar");
  if (!nextPlayer || !nextVideo || !currentBack || !nextBack || !currentSidebar || !nextSidebar) {
    return false;
  }

  currentPlayer.setAttribute("style", nextPlayer.getAttribute("style") ?? "");
  currentVideo.pause();
  const nextSource = nextVideo.getAttribute("src");
  if (nextSource) currentVideo.setAttribute("src", nextSource);
  else currentVideo.removeAttribute("src");
  currentVideo.dataset.historyAsset = nextVideo.dataset.historyAsset ?? "";
  currentVideo.dataset.historyVersion = nextVideo.dataset.historyVersion ?? "";
  currentVideo.loop = true;
  currentVideo.load();
  currentBack.replaceWith(nextBack);
  currentSidebar.replaceWith(nextSidebar);
  historyTitleResizeObserver?.disconnect();
  historyTitleResizeObserver = null;
  renderIcons(appElement);
  bindShell();
  bindHistory();
  return true;
}

function openHistoryDetail(assetId: string, versionId?: string): void {
  const preserveFullscreen = page === "history-detail" && historyPlayerIsFullscreen();
  if (page === "history") historyScrollPosition = window.scrollY;
  reportUserAction("history-open-detail", { assetId, versionId });
  historyKind = "video";
  selectedHistoryAssetId = assetId;
  const asset = state.history.find((item) => item.id === assetId);
  selectedHistoryVersionId = asset?.versions.find((item) => item.id === versionId)?.id ??
    (asset ? preferredVersion(asset).id : "");
  historyForwardTarget = asset
    ? { assetId, versionId: selectedHistoryVersionId }
    : null;
  page = "history-detail";
  if (preserveFullscreen && updateHistoryDetailInPlace()) {
    window.scrollTo({ top: 0, behavior: "auto" });
    return;
  }
  render();
  if (preserveFullscreen) restoreHistoryPlayerFullscreen();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function openImageHistoryDetail(projectId: string, versionId?: string): void {
  const project = state.imageHistory.find((item) => item.id === projectId);
  if (!project) return;
  reportUserAction("image-history-open-detail", { projectId, versionId });
  historyKind = "image";
  selectedHistoryAssetId = projectId;
  selectedHistoryVersionId = project.versions.find((item) => item.id === versionId)?.id ??
    preferredImageVersion(project).id;
  historyForwardTarget = { assetId: projectId, versionId: selectedHistoryVersionId };
  page = "image-history-detail";
  render();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function returnToHistory(): void {
  if (page !== "history-detail" && page !== "image-history-detail") return;
  historyScrollRestorePending = true;
  page = "history";
  flashMessage = "";
  render();
}

function returnToLastHistoryDetail(): void {
  if (page !== "history" || !historyForwardTarget) return;
  const target = historyForwardTarget;
  if (historyKind === "image") {
    const project = state.imageHistory.find((item) => item.id === target.assetId);
    if (!project) {
      historyForwardTarget = null;
      return;
    }
    openImageHistoryDetail(target.assetId, target.versionId);
    return;
  }
  const asset = state.history.find((item) => item.id === target.assetId);
  if (!asset) {
    historyForwardTarget = null;
    return;
  }
  openHistoryDetail(target.assetId, target.versionId);
}

function navigateHistoryDetail(direction: -1 | 1): void {
  if (page !== "history-detail") return;
  const orderedHistory = historyAssetsByNewest();
  const currentIndex = orderedHistory.findIndex(
    (item) => item.id === selectedHistoryAssetId
  );
  const nextAsset = orderedHistory[currentIndex + direction];
  if (!nextAsset) return;
  openHistoryDetail(nextAsset.id);
}

function navigateImageHistoryDetail(direction: -1 | 1): void {
  if (page !== "image-history-detail") return;
  const orderedProjects = imageProjectsByNewest();
  const currentIndex = orderedProjects.findIndex((item) => item.id === selectedHistoryAssetId);
  const nextProject = orderedProjects[currentIndex + direction];
  if (!nextProject) return;
  openImageHistoryDetail(nextProject.id);
}

function navigateImageHistoryVersion(direction: -1 | 1): void {
  if (page !== "image-history-detail") return;
  const project = state.imageHistory.find((item) => item.id === selectedHistoryAssetId);
  if (!project) return;
  const currentIndex = project.versions.findIndex((item) => item.id === selectedHistoryVersionId);
  if (currentIndex < 0) return;
  const nextVersion = project.versions[currentIndex - direction];
  if (!nextVersion) return;
  selectedHistoryVersionId = nextVersion.id;
  historyForwardTarget = { assetId: project.id, versionId: nextVersion.id };
  reportUserAction("image-history-version-navigation", {
    projectId: project.id,
    versionId: nextVersion.id,
    direction
  });
  render();
  window.requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(`[data-image-version-id="${CSS.escape(nextVersion.id)}"]`)?.scrollIntoView({
      block: "nearest",
      inline: "nearest"
    });
  });
}

async function copyHistoryText(value: string, successMessage: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    showMessage(successMessage, false);
  } catch {
    showMessage("复制失败，请检查系统剪贴板权限。", false);
  }
}

async function copyHistoryFile(filename: string, successMessage = "视频文件已复制。"): Promise<void> {
  if (!filename) {
    showMessage("当前记录没有可用的媒体文件。", false);
    return;
  }
  try {
    const result = await window.studio.copyFile(filename);
    showMessage(result.ok ? successMessage : result.message, false);
  } catch {
    showMessage("复制媒体文件失败，请检查文件是否仍然存在。", false);
  }
}

async function copyHistoryImage(filename: string): Promise<void> {
  if (!filename) {
    showMessage("当前记录没有可用的图片文件。", false);
    return;
  }
  try {
    const dataUrl = await window.studio.readImage(filename);
    if (!dataUrl || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      showMessage("当前系统不支持复制图片像素，请使用复制文件。", false);
      return;
    }
    const blob = await fetch(dataUrl).then((response) => response.blob());
    await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
    showMessage("图片像素已复制到剪贴板。", false);
  } catch {
    showMessage("复制图片像素失败，请检查系统剪贴板权限。", false);
  }
}

async function editHistoryAsset(assetId: string): Promise<void> {
  const asset = state.history.find((item) => item.id === assetId);
  if (!asset) return;
  if (isRetiredVideoModel(asset.modelId)) {
    showMessage(`${modelName(asset.modelId)} 已从创建模型中移除；历史视频和模型名称仍会保留。`);
    return;
  }
  const now = new Date().toISOString();
  const version = preferredVersion(asset);
  const isExtension = asset.inputMode === "video" || Boolean(asset.sourceVideoPath);
  const sourceVideoDuration = asset.sourceVideoDuration ?? asset.trimEndSeconds ?? 0;
  const draft: Draft = {
    ...state.draft,
    inputMode: isExtension ? "video" : "image",
    modelId: asset.modelId,
    workflowPath: asset.workflowPath ?? state.draft.workflowPath,
    startImagePath: isExtension ? "" : asset.startImagePath ?? "",
    sourceWidth: asset.sourceWidth ?? (isExtension ? version.width : 0),
    sourceHeight: asset.sourceHeight ?? (isExtension ? version.height : 0),
    endImagePath: isExtension ? "" : asset.endImagePath ?? "",
    sourceVideoPath: isExtension ? asset.sourceVideoPath ?? "" : "",
    sourceVideoDuration: isExtension ? sourceVideoDuration : 0,
    trimStartSeconds: isExtension ? asset.trimStartSeconds ?? 0 : 0,
    trimEndSeconds: isExtension ? asset.trimEndSeconds ?? sourceVideoDuration : 0,
    sourceAssetId: asset.sourceAssetId,
    sourceVersionId: asset.sourceVersionId,
    h3ReferenceSlots: isExtension
      ? []
      : (asset.h3ReferenceSlots ?? []).map((slot) => ({ ...slot })),
    videoLoras: asset.videoLoras?.map((lora) => ({ ...lora })) ?? [],
    ratio: asset.ratio ?? state.draft.ratio,
    resolution: ([480, 540, 720, 768].includes(asset.resolution)
      ? asset.resolution
      : state.draft.resolution) as Draft["resolution"],
    duration: asset.duration,
    steps: normalizeH3Steps(asset.steps, asset.modelId, asset.videoLoras),
    fps: ([8, 12, 16, 24, 25, 30].includes(asset.fps ?? 24)
      ? asset.fps ?? 24
      : 24) as Draft["fps"],
    frameInterpolation: asset.frameInterpolation ?? "off",
    spectrumMode: preferredVersion(asset).spectrumMode ?? "off",
    seed: asset.seed,
    promptVersions: [
      ...state.draft.promptVersions,
      {
        id: crypto.randomUUID(),
        label: "从历史调整",
        text: asset.prompt,
        createdAt: now
      }
    ],
    activePromptVersion: state.draft.promptVersions.length
  };
  await saveDraftImmediately(draft);
  page = "create";
  render();
}

function openHistoryContextMenu(
  assetId: string,
  clientX: number,
  clientY: number
): void {
  closeHistoryContextMenu();
  const asset = state.history.find((item) => item.id === assetId);
  if (!asset) return;
  const version = preferredVersion(asset);
  const retiredModel = isRetiredVideoModel(asset.modelId);
  const videoIndex = versionVideoIndex(version);
  const videoFile = videoIndex >= 0 ? version.files[videoIndex] : undefined;
  const absolutePath = videoFile?.absolutePath ?? "";
  const menu = document.createElement("section");
  menu.className = "history-context-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", `${asset.title} 快捷操作`);
  menu.innerHTML = `
    <div class="history-context-heading">
      <strong>${escapeHtml(asset.title)}</strong>
      <span>${escapeHtml(videoFile?.filename ?? asset.outputFilename)}</span>
    </div>
    <button role="menuitem" data-history-action="detail"><span class="context-icon">${icon("external-link")}</span><span><strong>查看详情</strong><small>播放视频并查看生成参数</small></span><kbd>Enter</kbd></button>
    ${retiredModel ? "" : `<button role="menuitem" data-history-action="edit"><span class="context-icon">${icon("sparkles")}</span><span><strong>使用此参数再创建</strong><small>带入提示词、模型和 Seed</small></span></button>`}
    <div class="history-context-separator" role="separator"></div>
    <button role="menuitem" data-history-action="copy-file" ${absolutePath ? "" : "disabled"}><span class="context-icon">${icon("copy")}</span><span><strong>复制文件</strong><small>${absolutePath ? "复制视频文件，可在资源管理器中粘贴" : "当前记录没有可用文件"}</small></span></button>
    <button role="menuitem" data-history-action="copy-path" ${absolutePath ? "" : "disabled"}><span class="context-icon">${icon("copy")}</span><span><strong>复制文件路径</strong><small>${absolutePath ? "复制完整视频文件路径" : "当前记录没有可用文件"}</small></span></button>
    <button role="menuitem" data-history-action="show-file" ${absolutePath ? "" : "disabled"}><span class="context-icon">${icon("folder-open")}</span><span><strong>打开所在目录</strong><small>在 Explorer 中定位视频</small></span></button>
    <button role="menuitem" data-history-action="copy-prompt"><span class="context-icon">${icon("file-text")}</span><span><strong>复制提示词</strong><small>复制实际送入模型的文本</small></span></button>
    <div class="history-context-separator" role="separator"></div>
    <button class="danger" role="menuitem" data-history-action="delete"><span class="context-icon">${icon("trash-2")}</span><span><strong>删除视频和记录</strong><small>操作前仍会要求确认</small></span></button>`;
  menu.style.left = `${clientX}px`;
  menu.style.top = `${clientY}px`;
  document.body.append(menu);
  renderIcons(menu);
  historyContextMenuElement = menu;
  const events = new AbortController();
  historyContextMenuEvents = events;

  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(clientX, window.innerWidth - rect.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(clientY, window.innerHeight - rect.height - 8))}px`;
  menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();

  menu.addEventListener("contextmenu", (event) => event.preventDefault());
  menu.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-history-action]"
    );
    if (!button || button.disabled) return;
    const action = button.dataset.historyAction;
    closeHistoryContextMenu();
    if (action === "detail") openHistoryDetail(assetId);
    else if (action === "edit") await editHistoryAsset(assetId);
    else if (action === "copy-file") {
      await copyHistoryFile(absolutePath);
    } else if (action === "copy-path") {
      await copyHistoryText(absolutePath, "视频文件路径已复制。");
    } else if (action === "show-file") {
      const shown = await window.studio.showItemInFolder(absolutePath);
      if (!shown) showMessage("视频文件不存在或已经被移动。", false);
    } else if (action === "copy-prompt") {
      await copyHistoryText(asset.prompt, "提示词已复制。");
    } else if (action === "delete") {
      requestHistoryDeletion(assetId);
    }
  });
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!menu.contains(event.target as Node)) closeHistoryContextMenu();
    },
    { capture: true, signal: events.signal }
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") closeHistoryContextMenu();
    },
    { signal: events.signal }
  );
  window.addEventListener("blur", closeHistoryContextMenu, { signal: events.signal });
  window.addEventListener("resize", closeHistoryContextMenu, { signal: events.signal });
  window.addEventListener("scroll", closeHistoryContextMenu, {
    capture: true,
    signal: events.signal
  });
}

function releaseHistoryVideo(assetId: string): void {
  const cards = [...document.querySelectorAll<HTMLElement>("[data-history]")];
  const card = cards.find((item) => item.dataset.history === assetId);
  const videos =
    page === "history-detail" && selectedHistoryAssetId === assetId
      ? document.querySelectorAll<HTMLVideoElement>(".history-player video")
      : card?.querySelectorAll<HTMLVideoElement>("video") ?? [];
  videos.forEach((video) => {
    video.pause();
    video.removeAttribute("src");
    video.load();
  });
}

function bindImageHistoryLightbox(): void {
  imageLightboxEvents?.abort();
  imageLightboxEvents = null;
  document.body.classList.remove("image-lightbox-open");
  const lightbox = document.querySelector<HTMLElement>("[data-image-lightbox]");
  const openButton = document.querySelector<HTMLButtonElement>("[data-open-image-lightbox]");
  const dialog = lightbox?.querySelector<HTMLElement>(".image-lightbox-dialog");
  const stage = lightbox?.querySelector<HTMLElement>("[data-image-lightbox-stage]");
  const image = lightbox?.querySelector<HTMLImageElement>("[data-image-lightbox-image]");
  if (!lightbox || !openButton || !dialog || !stage || !image) return;

  const events = new AbortController();
  imageLightboxEvents = events;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let activePointerId: number | null = null;
  let lastPointerX = 0;
  let lastPointerY = 0;
  const clampScale = (value: number) => Math.min(5, Math.max(1, value));
  const updateTransform = () => {
    image.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scale})`;
    stage.classList.toggle("is-zoomed", scale > 1);
  };
  const reset = () => {
    scale = 1;
    offsetX = 0;
    offsetY = 0;
    updateTransform();
  };
  const close = () => {
    lightbox.hidden = true;
    document.body.classList.remove("image-lightbox-open");
    openButton.focus();
  };
  const open = () => {
    lightbox.hidden = false;
    document.body.classList.add("image-lightbox-open");
    reset();
    window.requestAnimationFrame(() => dialog.focus());
  };

  openButton.addEventListener("click", open, { signal: events.signal });
  lightbox.querySelectorAll<HTMLElement>("[data-image-lightbox-close]").forEach((button) => {
    button.addEventListener("click", close, { signal: events.signal });
  });
  lightbox.querySelector<HTMLElement>("[data-image-lightbox-reset]")?.addEventListener(
    "click",
    reset,
    { signal: events.signal }
  );
  stage.addEventListener("wheel", (event) => {
    if (lightbox.hidden) return;
    event.preventDefault();
    const rect = stage.getBoundingClientRect();
    const factor = event.deltaY < 0 ? 1.12 : 0.88;
    const nextScale = clampScale(scale * factor);
    if (nextScale === scale) return;
    const pointerX = event.clientX - rect.left - rect.width / 2 - offsetX;
    const pointerY = event.clientY - rect.top - rect.height / 2 - offsetY;
    const scaleRatio = nextScale / scale;
    offsetX -= pointerX * (scaleRatio - 1);
    offsetY -= pointerY * (scaleRatio - 1);
    scale = nextScale;
    if (scale === 1) {
      offsetX = 0;
      offsetY = 0;
    }
    updateTransform();
  }, { passive: false, signal: events.signal });
  stage.addEventListener("pointerdown", (event) => {
    if (lightbox.hidden || event.button !== 0 || scale <= 1) return;
    activePointerId = event.pointerId;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    stage.setPointerCapture(event.pointerId);
    stage.classList.add("is-panning");
    event.preventDefault();
  }, { signal: events.signal });
  stage.addEventListener("pointermove", (event) => {
    if (event.pointerId !== activePointerId) return;
    offsetX += event.clientX - lastPointerX;
    offsetY += event.clientY - lastPointerY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    updateTransform();
  }, { signal: events.signal });
  const stopPanning = (event: PointerEvent) => {
    if (event.pointerId !== activePointerId) return;
    activePointerId = null;
    stage.classList.remove("is-panning");
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
  };
  stage.addEventListener("pointerup", stopPanning, { signal: events.signal });
  stage.addEventListener("pointercancel", stopPanning, { signal: events.signal });
  stage.addEventListener("dblclick", (event) => {
    event.preventDefault();
    reset();
  }, { signal: events.signal });
  document.addEventListener("keydown", (event) => {
    if (lightbox.hidden) return;
    if (event.key === "Escape") close();
    else if (event.key === "0") reset();
  }, { signal: events.signal });
}

async function continueImageEdit(project: ImageHistoryProject, version: ImageAssetVersion): Promise<void> {
  const now = new Date().toISOString();
  const pictures = imageEditPicturesForVersion(version);
  if (!pictures.length) {
    showMessage("当前图片版本的本地文件不可用，无法继续编辑。", false);
    return;
  }
  const draft = normalizeImageEditDraft({
    ...state.imageDraft,
    projectId: project.id,
    parentVersionId: version.id,
    modelId: version.modelId || state.imageDraft.modelId,
    pictures,
    promptVersions: [{
      id: crypto.randomUUID(),
      label: "从图片历史继续编辑",
      text: version.prompt,
      createdAt: now
    }],
    activePromptVersion: 0,
    seed: version.seed ?? null,
    outputFormat: "png"
  });
  state = await window.studio.saveImageDraft(draft);
  creationMode = "image-edit";
  page = "create";
  reportUserAction("image-history-continue-edit", { projectId: project.id, versionId: version.id });
  render();
}

async function continueImageToVideo(project: ImageHistoryProject, version: ImageAssetVersion): Promise<void> {
  const filename = version.file.absolutePath;
  if (!filename) {
    showMessage("当前图片版本的本地文件不可用。", false);
    return;
  }
  await saveDraftImmediately({
    ...state.draft,
    inputMode: "image",
    startImagePath: filename,
    sourceWidth: version.width,
    sourceHeight: version.height,
    sourceAssetId: project.id,
    sourceVersionId: version.id,
    endImagePath: "",
    sourceVideoPath: "",
    sourceVideoDuration: 0,
    trimStartSeconds: 0,
    trimEndSeconds: 0,
    ratio: "source"
  });
  creationMode = "image-to-video";
  page = "create";
  reportUserAction("image-history-continue-video", { projectId: project.id, versionId: version.id });
  render();
}

function openImageHistoryContextMenu(
  projectId: string,
  clientX: number,
  clientY: number
): void {
  closeHistoryContextMenu();
  const project = state.imageHistory.find((item) => item.id === projectId);
  if (!project) return;
  const version = preferredImageVersion(project);
  const absolutePath = version.file.absolutePath ?? "";
  const title = project.title.trim() || "未命名图片";
  const menu = document.createElement("section");
  menu.className = "history-context-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", `${title} 快捷操作`);
  menu.innerHTML = `
    <div class="history-context-heading"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(version.file.filename)}</span></div>
    <button role="menuitem" data-image-history-action="detail"><span class="context-icon">${icon("external-link")}</span><span><strong>查看详情</strong><small>查看版本、Prompt 和项目谱系</small></span><kbd>Enter</kbd></button>
    <button role="menuitem" data-image-history-action="edit"><span class="context-icon">${icon("wand-sparkles")}</span><span><strong>继续编辑图片</strong><small>以当前版本作为下一轮编辑基础</small></span></button>
    <button role="menuitem" data-image-history-action="video"><span class="context-icon">${icon("video")}</span><span><strong>开始创作视频</strong><small>把当前图片放入视频首帧</small></span></button>
    <div class="history-context-separator" role="separator"></div>
    <button role="menuitem" data-image-history-action="copy-file" ${absolutePath ? "" : "disabled"}><span class="context-icon">${icon("copy")}</span><span><strong>复制文件</strong><small>${absolutePath ? "复制图片文件，可在资源管理器中粘贴" : "当前记录没有可用文件"}</small></span></button>
    <button role="menuitem" data-image-history-action="copy-path" ${absolutePath ? "" : "disabled"}><span class="context-icon">${icon("copy")}</span><span><strong>复制文件路径</strong><small>${absolutePath ? "复制完整图片文件路径" : "当前记录没有可用文件"}</small></span></button>
    <button role="menuitem" data-image-history-action="show-file" ${absolutePath ? "" : "disabled"}><span class="context-icon">${icon("folder-open")}</span><span><strong>打开所在目录</strong><small>在 Explorer 中定位图片</small></span></button>
    <button role="menuitem" data-image-history-action="copy-prompt" ${version.prompt ? "" : "disabled"}><span class="context-icon">${icon("file-text")}</span><span><strong>复制 Prompt</strong><small>${version.prompt ? "复制当前版本的编辑要求" : "原始图片没有 Prompt"}</small></span></button>
    <div class="history-context-separator" role="separator"></div>
    <button class="danger" role="menuitem" data-image-history-action="delete"><span class="context-icon">${icon("trash-2")}</span><span><strong>删除图片项目</strong><small>操作前仍会要求确认</small></span></button>`;
  menu.style.left = `${clientX}px`;
  menu.style.top = `${clientY}px`;
  document.body.append(menu);
  renderIcons(menu);
  historyContextMenuElement = menu;
  const events = new AbortController();
  historyContextMenuEvents = events;
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(clientX, window.innerWidth - rect.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(clientY, window.innerHeight - rect.height - 8))}px`;
  menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  menu.addEventListener("contextmenu", (event) => event.preventDefault());
  menu.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-image-history-action]");
    if (!button || button.disabled) return;
    const action = button.dataset.imageHistoryAction;
    closeHistoryContextMenu();
    if (action === "detail") openImageHistoryDetail(projectId);
    else if (action === "edit") await continueImageEdit(project, version);
    else if (action === "video") await continueImageToVideo(project, version);
    else if (action === "copy-file") await copyHistoryFile(absolutePath, "图片文件已复制。");
    else if (action === "copy-path") await copyHistoryText(absolutePath, "图片文件路径已复制。");
    else if (action === "show-file") {
      const shown = await window.studio.showItemInFolder(absolutePath);
      if (!shown) showMessage("图片文件不存在或已经被移动。", false);
    } else if (action === "copy-prompt") await copyHistoryText(version.prompt, "Prompt 已复制。");
    else if (action === "delete") requestHistoryDeletion(projectId);
  });
  document.addEventListener("pointerdown", (event) => {
    if (!menu.contains(event.target as Node)) closeHistoryContextMenu();
  }, { capture: true, signal: events.signal });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeHistoryContextMenu();
  }, { signal: events.signal });
  window.addEventListener("blur", closeHistoryContextMenu, { signal: events.signal });
  window.addEventListener("resize", closeHistoryContextMenu, { signal: events.signal });
  window.addEventListener("scroll", closeHistoryContextMenu, { capture: true, signal: events.signal });
}

async function acceptConfirmation(): Promise<void> {
  if (!pendingConfirmation || confirmationBusy) return;
  const request = pendingConfirmation;
  confirmationBusy = true;
  const acceptButton = document.querySelector<HTMLButtonElement>("#accept-confirmation");
  const cancelButton = document.querySelector<HTMLButtonElement>("#cancel-confirmation");
  if (acceptButton) {
    acceptButton.disabled = true;
    acceptButton.textContent = "处理中…";
  }
  if (cancelButton) cancelButton.disabled = true;
  try {
    if (request.kind === "clear-draft") {
      window.clearTimeout(draftSaveTimer);
      draftRevision += 1;
      draftDirty = false;
      state = await window.studio.saveDraft(createClearedDraft(state.draft));
    } else if (request.kind === "force-stop-comfy") {
      serviceForceStopping = true;
      serviceStatusMessage = "正在强制终止所有 ComfyUI 进程并释放 CUDA 上下文…";
      const result = await window.studio.forceStopComfyProcesses(formSettings());
      serviceForceStopping = false;
      serviceStatusMessage = result.message;
      environmentScan = await window.studio.scanEnvironment(formSettings());
      if (!result.ok) throw new Error(result.message);
      pendingConfirmation = null;
      confirmationBusy = false;
      showMessage(result.message);
      render();
      restoreModalFocus();
      return;
    } else if (request.kind === "remove-queue-task") {
      queueActionBusy = { taskId: request.taskId, action: "remove" };
      state = await window.studio.removeTask(request.taskId);
      queueActionBusy = null;
    } else if (request.kind === "cancel-queue-task") {
      queueActionBusy = { taskId: request.taskId, action: "cancel" };
      state = await window.studio.cancelTask(request.taskId);
      queueActionBusy = null;
    } else if (request.kind === "discard-settings") {
      settingsDraft = null;
      void window.studio.setSettingsDirty(false).catch(() => undefined);
      page = request.nextPage;
      flashMessage = "";
      pendingConfirmation = null;
      confirmationBusy = false;
      render();
      restoreModalFocus();
      if (request.nextPage !== "history") {
        window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
      }
      return;
    } else if (request.kind === "delete-history") {
      releaseHistoryVideo(request.assetId);
      await new Promise<void>((resolve) =>
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()))
      );
      state = await window.studio.deleteHistoryAsset(request.assetId);
      selectedHistoryAssetId = "";
      if (page === "history-detail" || page === "image-history-detail") {
        if (page === "image-history-detail") historyKind = "image";
        page = "history";
      }
    }
    pendingConfirmation = null;
    confirmationBusy = false;
    render();
    restoreModalFocus();
  } catch (error) {
    queueActionBusy = null;
    if (request.kind === "force-stop-comfy") serviceForceStopping = false;
    confirmationBusy = false;
    showMessage(error instanceof Error ? error.message : String(error));
  }
}

function bindConfirmationDialog(): void {
  if (!pendingConfirmation) return;
  const close = () => {
    if (confirmationBusy) return;
    pendingConfirmation = null;
    render();
    restoreModalFocus();
  };
  document.querySelector("#cancel-confirmation")?.addEventListener("click", close);
  document.querySelector("#accept-confirmation")?.addEventListener("click", () => {
    void acceptConfirmation();
  });
  document.querySelector("#confirm-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) close();
  });
  const dialog = document.querySelector<HTMLElement>(".confirm-dialog");
  if (dialog) bindModalFocus(dialog, close, "#cancel-confirmation");
}

function bindWindowCloseDialog(): void {
  if (!pendingWindowCloseRequest) return;
  const respond = async (response: "cancel" | "discard-settings" | "finish-tasks" | "force-exit") => {
    if (windowCloseResponseBusy) return;
    if (document.activeElement instanceof HTMLElement) {
      rememberModalControlFocus(document.activeElement);
    }
    windowCloseResponseBusy = true;
    render();
    try {
      await window.studio.respondWindowClose(response);
      if (response === "cancel") {
        pendingWindowCloseRequest = null;
        windowCloseResponseBusy = false;
        render();
        restoreModalFocus();
      }
    } catch (error) {
      windowCloseResponseBusy = false;
      showMessage(error instanceof Error ? error.message : "无法处理退出请求");
    }
  };
  const cancel = () => void respond("cancel");
  document.querySelector("#cancel-window-close")?.addEventListener("click", cancel);
  document.querySelector("#window-close-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) cancel();
  });
  document.querySelector("#discard-window-close")?.addEventListener("click", () => {
    void respond("discard-settings");
  });
  document.querySelector("#finish-window-close")?.addEventListener("click", () => {
    void respond("finish-tasks");
  });
  document.querySelector("#force-window-close")?.addEventListener("click", () => {
    void respond("force-exit");
  });
  const dialog = document.querySelector<HTMLElement>(".close-dialog");
  if (dialog) bindModalFocus(dialog, cancel, "#cancel-window-close");
}

function bindShell(): void {
  shellNavigationEvents?.abort();
  const navigationEvents = new AbortController();
  shellNavigationEvents = navigationEvents;
  document.querySelectorAll<HTMLElement>("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextPage = button.dataset.page as Page;
      const previousPage = page;
      if (page === "settings" && nextPage !== "settings" && settingsHaveUnsavedChanges()) {
        rememberModalFocus();
        pendingConfirmation = { kind: "discard-settings", nextPage };
        confirmationBusy = false;
        render();
        return;
      }
      if ((page === "history-detail" || page === "image-history-detail") && nextPage === "history") {
        returnToHistory();
        return;
      }
      if (previousPage === "history") historyScrollPosition = window.scrollY;
      if (nextPage === "history" && page !== "history") historyForwardTarget = null;
      if (nextPage !== "history") historyForwardTarget = null;
      if (nextPage === "history" && previousPage !== "history") {
        historyScrollRestorePending = true;
      }
      reportUserAction("navigate-panel", { from: page, to: nextPage });
      page = nextPage;
      flashMessage = "";
      render();
      if (nextPage !== "history") {
        window.requestAnimationFrame(() => {
          window.scrollTo({
            top: 0,
            behavior: "auto"
          });
        });
      }
    });
  });
  if (page === "history-detail" || page === "image-history-detail") {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      return target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable;
    };
    const handleKeyboardBack = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const isBrowserBack = event.key === "BrowserBack" ||
        event.key === "GoBack" ||
        event.code === "BrowserBack" ||
        (event.altKey && event.key === "ArrowLeft") ||
        (event.key === "Backspace" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey);
      if (!isBrowserBack) return;
      event.preventDefault();
      event.stopPropagation();
      returnToHistory();
    };
    const handleMouseBack = (event: MouseEvent) => {
      if (event.button !== 3) return;
      event.preventDefault();
      event.stopPropagation();
      returnToHistory();
    };
    const handleHistoryVideoNavigation = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat || isEditableTarget(event.target)) return;
      if (document.querySelector(".dialog-backdrop")) return;
      const direction = event.key === "[" || event.code === "BracketLeft" || event.key === "PageUp" || event.code === "PageUp"
        ? -1
        : event.key === "]" || event.code === "BracketRight" || event.key === "PageDown" || event.code === "PageDown"
          ? 1
          : 0;
      if (direction !== -1 && direction !== 1) return;
      event.preventDefault();
      event.stopPropagation();
      if (page === "image-history-detail") navigateImageHistoryDetail(direction);
      else navigateHistoryDetail(direction);
    };
    window.addEventListener("keydown", handleKeyboardBack, { signal: navigationEvents.signal });
    window.addEventListener("keydown", handleHistoryVideoNavigation, { signal: navigationEvents.signal });
    window.addEventListener("auxclick", handleMouseBack, { signal: navigationEvents.signal });
    window.addEventListener("mouseup", handleMouseBack, { signal: navigationEvents.signal });
  }
  if (page === "history") {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      return target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable;
    };
    const handleKeyboardForward = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const isBrowserForward = event.key === "BrowserForward" ||
        event.key === "GoForward" ||
        event.code === "BrowserForward" ||
        (event.altKey && event.key === "ArrowRight") ||
        (event.key === "Backspace" && event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey);
      if (!isBrowserForward) return;
      event.preventDefault();
      event.stopPropagation();
      returnToLastHistoryDetail();
    };
    const handleMouseForward = (event: MouseEvent) => {
      if (event.button !== 4) return;
      event.preventDefault();
      event.stopPropagation();
      returnToLastHistoryDetail();
    };
    window.addEventListener("keydown", handleKeyboardForward, { signal: navigationEvents.signal });
    window.addEventListener("auxclick", handleMouseForward, { signal: navigationEvents.signal });
    window.addEventListener("mouseup", handleMouseForward, { signal: navigationEvents.signal });
  }
  bindConfirmationDialog();
  bindDirectoryMigrationDialog();
  bindImageAssetLibraryDialog();
  bindWindowCloseDialog();
}

function scheduleDraftSave(): void {
  window.clearTimeout(draftSaveTimer);
  draftSaveTimer = window.setTimeout(async () => {
    const revision = draftRevision;
    const draftToSave = state.draft;
    draftSaveInFlight += 1;
    try {
      const savedState = await window.studio.saveDraft(draftToSave);
      const localDraft = state.draft;
      state = { ...savedState, draft: localDraft };
      if (revision === draftRevision) draftDirty = false;
    } finally {
      draftSaveInFlight -= 1;
    }
  }, 350);
}

function scheduleImageDraftSave(): void {
  window.clearTimeout(imageDraftSaveTimer);
  imageDraftSaveTimer = window.setTimeout(async () => {
    const revision = imageDraftRevision;
    const draftToSave = state.imageDraft;
    try {
      const savedState = await window.studio.saveImageDraft(draftToSave);
      if (revision === imageDraftRevision) {
        state = { ...savedState, imageDraft: draftToSave };
      }
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "图片草稿保存失败", false);
    }
  }, 350);
}

async function saveDraftImmediately(draft: Draft): Promise<void> {
  window.clearTimeout(draftSaveTimer);
  draftRevision += 1;
  draftDirty = false;
  state = await window.studio.saveDraft(draft);
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function formatAssetBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function elapsedText(startedAt?: string): string {
  if (!startedAt) return "等待计时";
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `已运行 ${minutes > 0 ? `${minutes}分` : ""}${seconds % 60}秒`;
}

function performanceCard(
  label: string,
  id: string,
  value: number | null | undefined,
  suffix: string,
  detail = ""
): string {
  const available = value != null && Number.isFinite(value);
  const normalized = available ? Math.max(0, Math.min(100, value)) : 0;
  return `<article class="panel performance-card"><span>${label}</span><strong id="${id}">${available ? `${Math.round(value)}${suffix}` : "—"}</strong><small id="${id}-detail">${escapeHtml(detail)}</small><div class="metric-bar"><i id="${id}-bar" style="width:${normalized}%"></i></div></article>`;
}

function patchDraft(patch: Partial<Draft>): void {
  state.draft = { ...state.draft, ...patch };
  draftRevision += 1;
  draftDirty = true;
  scheduleDraftSave();
}

function patchImageDraft(patch: Partial<ImageEditDraft>): void {
  state.imageDraft = normalizeImageEditDraft({ ...state.imageDraft, ...patch });
  imageDraftRevision += 1;
  scheduleImageDraftSave();
}

async function loadImageEditPreviews(): Promise<void> {
  const pictures = state.imageDraft.pictures;
  let dimensionsChanged = false;
  await Promise.all(pictures.map(async (picture) => {
    const image = document.querySelector<HTMLImageElement>(
      `[data-image-picture-preview="${CSS.escape(picture.id)}"]`
    );
    if (!image || !picture.absolutePath) return;
    const previewPath = picture.markup?.renderedPath || picture.absolutePath;
    const dataUrl = await window.studio.readImage(previewPath).catch(() => null);
    if (!dataUrl || !image.isConnected) return;
    await new Promise<void>((resolve) => {
      image.addEventListener("load", () => {
        if (image.naturalWidth && image.naturalHeight) {
          const current = state.imageDraft.pictures.find((item) => item.id === picture.id);
          if (current && (current.width !== image.naturalWidth || current.height !== image.naturalHeight)) {
            const nextPictures = state.imageDraft.pictures.map((item) =>
              item.id === picture.id
                ? { ...item, width: image.naturalWidth, height: image.naturalHeight }
                : item
            );
            const basePicture = nextPictures[0];
            patchImageDraft({
              pictures: nextPictures,
              targetResolution: normalizeImageTargetResolution(
                state.imageDraft.targetResolution,
                basePicture?.width ?? 0,
                basePicture?.height ?? 0
              )
            });
            dimensionsChanged = true;
          }
        }
        resolve();
      }, { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
      image.src = dataUrl;
    });
  }));
  if (dimensionsChanged && page === "create" && creationMode === "image-edit") render();
}

function randomSeedValue(): number {
  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  const high = (values[0] ?? 0) & 0x001fffff;
  return high * 0x100000000 + (values[1] ?? 0);
}

async function editImagePictureMarkup(pictureId: string): Promise<void> {
  const picture = state.imageDraft.pictures.find((item) => item.id === pictureId);
  if (!picture?.absolutePath) return;
  try {
    const { openImageMarkupEditor } = await import("./image-markup-editor");
    const [sourceDataUrl, existingDocument] = await Promise.all([
      window.studio.readImage(picture.absolutePath),
      picture.markup?.documentPath
        ? window.studio.readImageMarkup(picture.markup.documentPath)
        : Promise.resolve(null)
    ]);
    if (!sourceDataUrl) throw new Error("无法读取原始图片，请确认文件仍然存在。");
    const result = await openImageMarkupEditor({
      pictureNumber: picture.pictureNumber,
      filename: picture.absolutePath,
      sourceDataUrl,
      existingDocument
    });
    if (!result) return;
    const markup = result.objectCount > 0
      ? await window.studio.saveImageMarkup({
          pictureId: picture.id,
          sourcePath: picture.absolutePath,
          document: result.document,
          renderedPng: result.renderedPng,
          summary: result.summary,
          objectCount: result.objectCount,
          previousRevision: picture.markup?.revision
        })
      : undefined;
    patchImageDraft({
      pictures: state.imageDraft.pictures.map((item) =>
        item.id === pictureId ? { ...item, markup } : item
      )
    });
    render();
    void loadImageEditPreviews();
    showMessage(markup ? `已保存 ${markup.objectCount} 处图片标记` : "图片标记已清除", true);
  } catch (error) {
    showMessage(error instanceof Error ? error.message : "图片标记保存失败", false);
  }
}

function addImageSlot(): void {
  const pictures = state.imageDraft.pictures;
  const capability = imageModelCapabilityFor(state.imageDraft.modelId);
  if (pictures.length >= capability.maxPictures) {
    showMessage(`当前 ${capability.name} 最多支持 ${capability.maxPictures} 个 Slot`);
    return;
  }
  const pictureNumber = nextImagePictureNumber(state.imageDraft);
  const slot: ImageReference = {
    id: crypto.randomUUID(),
    pictureNumber,
    absolutePath: "",
    width: 0,
    height: 0,
    role: pictureNumber === 1 ? "base" : "auto"
  };
  patchImageDraft({
    pictures: [...pictures, slot],
    nextPictureNumber: pictureNumber + 1
  });
  render();
}

function addImagePicture(path: string, replacePictureId?: string): void {
  if (!path) return;
  const pictures = state.imageDraft.pictures;
  const targetPicture = replacePictureId
    ? pictures.find((picture) => picture.id === replacePictureId)
    : pictures.find((picture) => !picture.absolutePath);
  if (targetPicture) {
    patchImageDraft({
      pictures: pictures.map((picture) =>
        picture.id === targetPicture.id
          ? { ...picture, absolutePath: path, width: 0, height: 0, markup: undefined }
          : picture
      )
    });
    render();
    return;
  }
  const capability = imageModelCapabilityFor(state.imageDraft.modelId);
  if (pictures.length >= capability.maxPictures) {
    showMessage(`当前 ${capability.name} 最多支持 ${capability.maxPictures} 张 Picture`);
    return;
  }
  const pictureNumber = nextImagePictureNumber(state.imageDraft);
  const picture: ImageReference = {
    id: crypto.randomUUID(),
    pictureNumber,
    absolutePath: path,
    width: 0,
    height: 0,
    role: pictureNumber === 1 ? "base" : "auto"
  };
  patchImageDraft({
    pictures: [...pictures, picture],
    nextPictureNumber: pictureNumber + 1
  });
  render();
}

function imageFileIsSupported(file: File): boolean {
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp|bmp)$/i.test(file.name);
}

async function handleClipboardPaste(event: ClipboardEvent): Promise<void> {
  if (page !== "create" || !state) return;
  const activeElement = document.activeElement;
  if (
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement instanceof HTMLSelectElement ||
    (activeElement instanceof HTMLElement && activeElement.isContentEditable)
  ) {
    return;
  }
  const item = [...(event.clipboardData?.items ?? [])].find(
    (candidate) => candidate.kind === "file" && candidate.type.startsWith("image/")
  );
  const file = item?.getAsFile();
  if (!file) return;
  if (creationMode === "image-edit") {
    event.preventDefault();
    if (!imageFileIsSupported(file)) {
      showMessage("剪贴板图片仅支持 PNG、JPG、WEBP 或 BMP");
      return;
    }
    const focusedPicture = activeElement instanceof HTMLElement
      ? activeElement.closest<HTMLElement>("[data-image-picture-pick]")
      : null;
    const pictureId = focusedPicture?.dataset.imagePicturePick;
    try {
      const filename = await window.studio.saveClipboardImage(
        await file.arrayBuffer(),
        file.type || "image/png"
      );
      addImagePicture(filename, pictureId);
      showMessage(pictureId ? "已替换选中的 Picture。" : "已添加到下一个 Picture。")
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "无法读取剪贴板图片");
    }
    return;
  }
  if (state.draft.inputMode !== "image") return;
  const supportedTypes = new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/bmp"
  ]);
  if (!supportedTypes.has(file.type.toLowerCase())) {
    showMessage("剪贴板图片仅支持 PNG、JPG、WEBP 或 BMP");
    return;
  }
  event.preventDefault();
  const focusedPasteTarget =
    activeElement instanceof HTMLElement
      ? activeElement.closest<HTMLElement>("[data-paste-frame]")
      : null;
  if (isMiniMaxH3R2vModel(state.draft.modelId)) {
    const targetSlot = state.draft.h3ReferenceSlots.find(
      (slot) => slot.mediaType === "image" && !slot.mediaPath
    );
    if (!targetSlot) {
      const { imageCount } = h3ReferenceSlotCounts(state.draft.h3ReferenceSlots);
      showMessage(
        imageCount >= 9
          ? "R2V 的图片 Slot 已满，请添加图片 Slot 后再粘贴。"
          : "R2V 当前没有空 Slot，请先添加一个 Slot。"
      );
      return;
    }
    try {
      const filename = await window.studio.saveClipboardImage(
        await file.arrayBuffer(),
        file.type
      );
      updateH3ReferenceSlot(targetSlot.id, { mediaPath: filename });
      render();
      showMessage(`已粘贴到下一个空的 R2V Slot（${h3ReferenceTag(state.draft.h3ReferenceSlots, targetSlot.id)}）。`);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "无法读取剪贴板图片");
    }
    return;
  }
  const field = focusedPasteTarget?.dataset.pasteFrame === "end"
    ? "endImagePath"
    : "startImagePath";
  try {
    const filename = await window.studio.saveClipboardImage(
      await file.arrayBuffer(),
      file.type
    );
    patchDraft({
      [field]: filename,
      ...(field === "startImagePath"
        ? { sourceWidth: 0, sourceHeight: 0 }
        : {})
    });
    render();
    showMessage(field === "startImagePath" ? "已粘贴为首帧图片。" : "已粘贴为尾帧图片。");
  } catch (error) {
    showMessage(error instanceof Error ? error.message : "无法读取剪贴板图片");
  }
}

function bindFrameDrop(
  selector: string,
  field: "startImagePath" | "endImagePath"
): void {
  const zone = document.querySelector<HTMLElement>(selector);
  if (!zone) return;
  const clearDragState = () => zone.classList.remove("drag-over");
  zone.addEventListener("dragenter", (event) => {
    event.preventDefault();
    zone.classList.add("drag-over");
  });
  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    zone.classList.add("drag-over");
  });
  zone.addEventListener("dragleave", (event) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && zone.contains(nextTarget)) return;
    clearDragState();
  });
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearDragState();
    const file = event.dataTransfer?.files.item(0);
    if (!file) return;
      const isSupported = imageFileIsSupported(file);
    if (!isSupported) {
      showMessage("请拖入 PNG、JPG、WEBP 或 BMP 图片");
      return;
    }
    try {
      const filename = window.studio.getDroppedFilePath(file);
      if (!filename) {
        showMessage("无法读取拖入图片的本地路径");
        return;
      }
      patchDraft({
        [field]: filename,
        ...(field === "startImagePath"
          ? { sourceWidth: 0, sourceHeight: 0 }
          : {})
      });
      render();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "无法读取拖入的图片");
    }
  });
}

function updateH3ReferenceSlot(
  slotId: string,
  patch: Partial<H3ReferenceSlot>
): void {
  patchDraft({
    h3ReferenceSlots: state.draft.h3ReferenceSlots.map((slot) =>
      slot.id === slotId ? { ...slot, ...patch } : slot
    )
  });
}

function bindH3ReferenceSlots(): void {
  const addSlot = () => {
    const counts = h3ReferenceSlotCounts(state.draft.h3ReferenceSlots);
    if (counts.total >= 12) return;
    const mediaType: H3ReferenceMediaType = counts.imageCount < 9
      ? "image"
      : "video";
    patchDraft({
      h3ReferenceSlots: [
        ...state.draft.h3ReferenceSlots,
        newH3ReferenceSlot("", mediaType)
      ]
    });
    render();
  };
  document.querySelector("#add-h3-reference-slot")?.addEventListener("click", addSlot);
  document.querySelector("#add-h3-reference-slot-empty")?.addEventListener("click", addSlot);
  document.querySelectorAll<HTMLElement>("[data-remove-h3-slot]").forEach((button) => {
    button.addEventListener("click", () => {
      const slotId = button.dataset.removeH3Slot;
      if (!slotId) return;
      patchDraft({
        h3ReferenceSlots: state.draft.h3ReferenceSlots.filter((slot) => slot.id !== slotId)
      });
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-clear-h3-slot]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const slotId = button.dataset.clearH3Slot;
      if (!slotId) return;
      updateH3ReferenceSlot(slotId, { mediaPath: "" });
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-insert-h3-slot]").forEach((button) => {
    button.addEventListener("click", () => {
      const slotId = button.dataset.insertH3Slot;
      const promptInput = document.querySelector<HTMLTextAreaElement>("#prompt-input");
        updatePromptWordCounter(promptInput?.value ?? "", isMiniMaxH3Model(state.draft.modelId) ? h3PromptModeForDraft(state.draft) : undefined, state.draft.duration);
      const slotIndex = state.draft.h3ReferenceSlots.findIndex((slot) => slot.id === slotId);
      if (!promptInput || !slotId || slotIndex < 0) return;
      insertPromptSnippet(promptInput, h3ReferenceTag(state.draft.h3ReferenceSlots, slotId));
    });
  });
  document.querySelectorAll<HTMLSelectElement>("[data-h3-slot-type]").forEach((select) => {
    select.addEventListener("change", () => {
      const slotId = select.dataset.h3SlotType;
      const nextType = select.value as H3ReferenceMediaType;
      const currentSlot = state.draft.h3ReferenceSlots.find((slot) => slot.id === slotId);
      if (!slotId || !currentSlot || currentSlot.mediaType === nextType) return;
      const counts = h3ReferenceSlotCounts(state.draft.h3ReferenceSlots);
      if (nextType === "image" && counts.imageCount >= 9) {
        select.value = currentSlot.mediaType;
        showMessage("R2V 最多支持 9 个图片 Slot。");
        return;
      }
      if (nextType === "video" && counts.videoCount >= 3) {
        select.value = currentSlot.mediaType;
        showMessage("R2V 最多支持 3 个视频 Slot。");
        return;
      }
      if (nextType === "video" && currentSlot.mediaPath) {
        showMessage("切换为视频后需要重新选择视频文件，当前图片不会自动转换。");
      }
      updateH3ReferenceSlot(slotId, {
        mediaType: nextType,
        mediaPath: ""
      });
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-pick-h3-slot]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const slotId = button.dataset.pickH3Slot;
      if (!slotId) return;
      const mediaType = button.dataset.h3SlotMediaType === "video"
        ? "video"
        : "image";
      const filename = mediaType === "video"
        ? await window.studio.pickVideo()
        : await window.studio.pickImage();
      if (!filename) return;
      updateH3ReferenceSlot(slotId, { mediaType, mediaPath: filename });
      render();
    });
  });
  document.querySelectorAll<HTMLSelectElement>("[data-h3-slot-role]").forEach((select) => {
    select.addEventListener("change", () => {
      const slotId = select.dataset.h3SlotRole;
      if (slotId) updateH3ReferenceSlot(slotId, { role: select.value as H3ReferenceRole });
    });
  });
  document.querySelectorAll<HTMLInputElement>("[data-h3-slot-note]").forEach((input) => {
    input.addEventListener("input", () => {
      const slotId = input.dataset.h3SlotNote;
      if (slotId) updateH3ReferenceSlot(slotId, { note: input.value });
    });
  });
  document.querySelectorAll<HTMLElement>("[data-drop-h3-slot]").forEach((zone) => {
    const clearDragState = () => zone.classList.remove("drag-over");
    zone.addEventListener("dragenter", (event) => {
      event.preventDefault();
      zone.classList.add("drag-over");
    });
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      zone.classList.add("drag-over");
    });
    zone.addEventListener("dragleave", (event) => {
      const nextTarget = event.relatedTarget;
      if (nextTarget instanceof Node && zone.contains(nextTarget)) return;
      clearDragState();
    });
    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearDragState();
      const file = event.dataTransfer?.files.item(0);
      const slotId = zone.dataset.dropH3Slot;
      const slot = state.draft.h3ReferenceSlots.find((item) => item.id === slotId);
      if (!file || !slotId || !slot) return;
      const isVideo = slot.mediaType === "video";
      const isSupported = isVideo
        ? file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|mkv|gif)$/i.test(file.name)
        : file.type.startsWith("image/") || /\.(png|jpe?g|webp|bmp)$/i.test(file.name);
      if (!isSupported) {
        showMessage(isVideo
          ? "视频 Slot 只支持 MP4、WebM、MOV、M4V、MKV 或 GIF"
          : "图片 Slot 只支持 PNG、JPG、WEBP 或 BMP 图片");
        return;
      }
      const filename = window.studio.getDroppedFilePath(file);
      if (!filename) {
        showMessage(`无法读取拖入${isVideo ? "视频" : "图片"}的本地路径`);
        return;
      }
      updateH3ReferenceSlot(slotId, { mediaPath: filename });
      render();
    });
  });
}

async function selectDraftVideo(
  filename: string,
  source?: {
    assetId: string;
    versionId: string;
    duration: number;
    width: number;
    height: number;
    h3ContextLatentPath?: string;
  }
): Promise<void> {
  const draft: Draft = {
    ...state.draft,
    inputMode: "video",
    sourceVideoPath: filename,
    sourceVideoDuration: source?.duration ?? 0,
    trimStartSeconds: 0,
    trimEndSeconds: source?.duration ?? 0,
    sourceAssetId: source?.assetId,
    sourceVersionId: source?.versionId,
    h3ContextLatentPath: source?.h3ContextLatentPath,
    sourceWidth: source?.width ?? 0,
    sourceHeight: source?.height ?? 0,
    ratio: "source"
  };
  await saveDraftImmediately(draft);
  render();
}

function bindVideoDrop(): void {
  const zone = document.querySelector<HTMLElement>("[data-drop-video]");
  if (!zone) return;
  const clearDragState = () => zone.classList.remove("drag-over");
  zone.addEventListener("dragenter", (event) => {
    event.preventDefault();
    zone.classList.add("drag-over");
  });
  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    zone.classList.add("drag-over");
  });
  zone.addEventListener("dragleave", clearDragState);
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    clearDragState();
    const file = event.dataTransfer?.files.item(0);
    if (!file) return;
    if (!file.type.startsWith("video/") && !/\.(mp4|webm|mov|m4v|mkv)$/i.test(file.name)) {
      showMessage("请拖入 MP4、WebM、MOV、M4V 或 MKV 视频");
      return;
    }
    const filename = window.studio.getDroppedFilePath(file);
    if (!filename) {
      showMessage("无法读取拖入视频的本地路径");
      return;
    }
    void selectDraftVideo(filename).catch((error) =>
      showMessage(error instanceof Error ? error.message : "无法读取拖入的视频")
    );
  });
}

function bindVideoTrim(): void {
  const video = document.querySelector<HTMLVideoElement>("#source-video");
  if (!video) return;
  video.addEventListener("loadedmetadata", () => {
    video.pause();
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    const durationChanged = Math.abs(state.draft.sourceVideoDuration - video.duration) > 0.05;
    const dimensionsChanged = state.draft.sourceWidth !== video.videoWidth ||
      state.draft.sourceHeight !== video.videoHeight;
    if (!durationChanged && !dimensionsChanged) return;
    const trimStartSeconds = durationChanged
      ? Math.min(state.draft.trimStartSeconds, Math.max(0, video.duration - 0.1))
      : state.draft.trimStartSeconds;
    const trimEndSeconds = durationChanged
      ? state.draft.trimEndSeconds <= 0 || state.draft.trimEndSeconds > video.duration
        ? video.duration
        : Math.max(trimStartSeconds + 0.1, state.draft.trimEndSeconds)
      : state.draft.trimEndSeconds;
    patchDraft({
      sourceVideoDuration: video.duration,
      trimStartSeconds,
      trimEndSeconds,
      sourceWidth: video.videoWidth,
      sourceHeight: video.videoHeight
    });
    render();
  });
  video.addEventListener("play", () => {
    const start = state.draft.trimStartSeconds;
    const end = state.draft.trimEndSeconds;
    if (video.currentTime < start || video.currentTime >= end) video.currentTime = start;
  });
  video.addEventListener("timeupdate", () => {
    if (video.currentTime < state.draft.trimEndSeconds) return;
    video.pause();
    video.currentTime = state.draft.trimEndSeconds;
  });

  const startInput = document.querySelector<HTMLInputElement>("#trim-start");
  const endInput = document.querySelector<HTMLInputElement>("#trim-end");
  const editor = document.querySelector<HTMLElement>("#trim-editor");
  if (!startInput || !endInput || !editor) return;
  const updateTrim = (active: "start" | "end") => {
    const duration = state.draft.sourceVideoDuration;
    const minimumClip = Math.min(0.1, duration);
    let start = Number(startInput.value);
    let end = Number(endInput.value);
    if (active === "start") start = Math.min(start, end - minimumClip);
    else end = Math.max(end, start + minimumClip);
    start = Math.max(0, start);
    end = Math.min(duration, end);
    startInput.value = String(start);
    endInput.value = String(end);
    const kept = end - start;
    editor.style.setProperty("--trim-start", `${start / duration * 100}%`);
    editor.style.setProperty("--trim-end", `${end / duration * 100}%`);
    startInput.setAttribute("aria-valuetext", formatTrimTime(start));
    endInput.setAttribute("aria-valuetext", formatTrimTime(end));
    document.querySelector("#trim-start-output")!.textContent = formatTrimTime(start);
    document.querySelector("#trim-end-output")!.textContent = formatTrimTime(end);
    document.querySelector("#trim-kept")!.textContent = `${kept.toFixed(1)} 秒`;
    document.querySelector("#trim-discarded")!.textContent = `${Math.max(0, duration - kept).toFixed(1)} 秒`;
    document.querySelector("#trim-total")!.textContent = `约 ${(kept + state.draft.duration).toFixed(1)} 秒`;
    video.pause();
    video.currentTime = active === "start" ? start : end;
    patchDraft({ trimStartSeconds: start, trimEndSeconds: end });
  };
  startInput.addEventListener("input", () => updateTrim("start"));
  endInput.addEventListener("input", () => updateTrim("end"));
}

function setEnqueueBusyUi(busy: boolean): void {
  const button = document.querySelector<HTMLButtonElement>(
    creationMode === "image-edit" ? "#enqueue-image-edit" : "#enqueue"
  );
  if (!button) return;
  button.disabled = busy;
  button.classList.toggle("busy", busy);
  button.setAttribute("aria-busy", String(busy));
  const buttonIcon = button.querySelector<HTMLElement>(".enqueue-spinner");
  if (buttonIcon) {
    buttonIcon.outerHTML = icon(busy ? "refresh-cw" : "plus", "enqueue-spinner");
    renderIcons(button);
  }
  const label = button.querySelector<HTMLElement>("[data-enqueue-label]");
  if (label) label.textContent = busy ? "加入中…" : "加入队列";
}

function syncPromptEnqueueUi(promptText: string): void {
  const button = document.querySelector<HTMLButtonElement>("#enqueue");
  if (!button) return;
  const currentReason = button.dataset.enqueueBlockReason ?? "";
  if (currentReason && currentReason !== "请先填写提示词") return;
  const hasPrompt = promptText.trim().length > 0;
  const reason = hasPrompt ? "" : "请先填写提示词";
  button.dataset.enqueueBlockReason = reason;
  button.disabled = !hasPrompt || enqueueBusy;
  button.title = hasPrompt
    ? button.dataset.enqueueReadyTitle ?? "加入队列"
    : reason;
  const feedback = document.querySelector<HTMLElement>("[data-enqueue-feedback]");
  if (feedback) {
    feedback.hidden = hasPrompt;
    feedback.textContent = reason;
  }
}

function bindImageEditCreate(): void {
  const choosePicture = async (pictureId?: string) => {
    const filename = await window.studio.pickImage();
    if (filename) addImagePicture(filename, pictureId);
  };
  document.querySelector("#add-image-slot")?.addEventListener("click", addImageSlot);
  document.querySelectorAll<HTMLElement>("[data-image-picture-pick]").forEach((button) => {
    button.addEventListener("click", () => {
      void choosePicture(button.dataset.imagePicturePick);
    });
  });
  document.querySelectorAll<HTMLElement>("[data-remove-image-picture]").forEach((button) => {
    button.addEventListener("click", () => {
      const pictureId = button.dataset.removeImagePicture;
      if (!pictureId) return;
      const picture = state.imageDraft.pictures.find((item) => item.id === pictureId);
      if (!picture) return;
      const pictures = picture.pictureNumber === 1
        ? state.imageDraft.pictures.map((item) =>
            item.id === pictureId
              ? { ...item, absolutePath: "", width: 0, height: 0, role: "base" as const, markup: undefined }
              : item
          )
        : state.imageDraft.pictures.filter((item) => item.id !== pictureId);
      patchImageDraft({ pictures });
      render();
    });
  });
  document.querySelectorAll<HTMLElement>("[data-markup-image-picture]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const pictureId = button.dataset.markupImagePicture;
      if (pictureId) void editImagePictureMarkup(pictureId);
    });
  });
  document.querySelectorAll<HTMLSelectElement>("[data-image-picture-role]").forEach((select) => {
    select.addEventListener("change", () => {
      const pictureId = select.dataset.imagePictureRole;
      if (!pictureId) return;
      patchImageDraft({
        pictures: state.imageDraft.pictures.map((picture) =>
          picture.id === pictureId
            ? { ...picture, role: select.value as ImageReferenceRole }
            : picture
        )
      });
    });
  });
  const dropZone = document.querySelector<HTMLElement>("#image-picture-drop-zone");
  if (dropZone) {
    const clearDragState = () => dropZone.classList.remove("drag-over");
    dropZone.addEventListener("click", () => void choosePicture());
    dropZone.addEventListener("dragenter", (event) => {
      event.preventDefault();
      dropZone.classList.add("drag-over");
    });
    dropZone.addEventListener("dragover", (event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      dropZone.classList.add("drag-over");
    });
    dropZone.addEventListener("dragleave", (event) => {
      const nextTarget = event.relatedTarget;
      if (nextTarget instanceof Node && dropZone.contains(nextTarget)) return;
      clearDragState();
    });
    dropZone.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearDragState();
      const file = event.dataTransfer?.files.item(0);
      if (!file) return;
      if (!imageFileIsSupported(file)) {
        showMessage("请拖入 PNG、JPG、WEBP 或 BMP 图片");
        return;
      }
      const filename = window.studio.getDroppedFilePath(file);
      if (!filename) {
        showMessage("无法读取拖入图片的本地路径");
        return;
      }
      addImagePicture(filename);
    });
  }
  const promptInput = document.querySelector<HTMLTextAreaElement>("#image-edit-prompt-input");
  const snippetSelect = document.querySelector<HTMLSelectElement>("#image-edit-instruction");
  const insertSnippet = document.querySelector<HTMLButtonElement>("#insert-image-edit-instruction");
  const syncSnippetButton = () => {
    if (insertSnippet) insertSnippet.disabled = !snippetSelect?.value;
  };
  snippetSelect?.addEventListener("change", syncSnippetButton);
  insertSnippet?.addEventListener("click", () => {
    if (!promptInput || !snippetSelect?.value) return;
    const start = promptInput.selectionStart;
    const prefix = promptInput.value && !/\s$/u.test(promptInput.value) ? "\n" : "";
    const insertion = `${prefix}${snippetSelect.value}`;
    promptInput.setRangeText(insertion, start, promptInput.selectionEnd, "end");
    promptInput.dispatchEvent(new Event("input", { bubbles: true }));
    snippetSelect.value = "";
    syncSnippetButton();
  });
  promptInput?.addEventListener("input", () => {
    const versions = [...state.imageDraft.promptVersions];
    const current = versions[state.imageDraft.activePromptVersion];
    if (current?.label === "手动编辑") {
      versions[state.imageDraft.activePromptVersion] = { ...current, text: promptInput.value };
    } else {
      versions.splice(state.imageDraft.activePromptVersion + 1);
      versions.push({
        id: crypto.randomUUID(),
        label: "手动编辑",
        text: promptInput.value,
        createdAt: new Date().toISOString()
      });
      state.imageDraft.activePromptVersion = versions.length - 1;
    }
    patchImageDraft({
      promptVersions: versions,
      activePromptVersion: state.imageDraft.activePromptVersion
    });
    resizePromptInput(promptInput);
    updateImagePromptWordCounter(promptInput.value);
  });
  if (promptInput) {
    resizePromptInput(promptInput);
    window.requestAnimationFrame(() => resizePromptInput(promptInput));
    updateImagePromptWordCounter(promptInput.value);
  }
  document.querySelector("#prompt-enhance-mode")?.addEventListener("change", (event) => {
    promptEnhanceMode = (event.currentTarget as HTMLSelectElement).value === "faithful"
      ? "faithful"
      : "sulphur-native";
  });
  document.querySelector("#release-prompt-model-create")?.addEventListener("click", () => {
    void togglePromptModelFromUi();
  });
  document.querySelector("#enhance-prompt")?.addEventListener("click", async () => {
    if (promptEnhancing) return;
    const requestPrompt = activeImagePrompt(state.imageDraft).text.trim();
    if (!requestPrompt) {
      showMessage("请先输入图片编辑 Prompt");
      return;
    }
    promptEnhancing = true;
    render();
    try {
      const pictures = state.imageDraft.pictures.filter((picture) => picture.absolutePath);
      const text = await window.studio.enhancePrompt({
        prompt: requestPrompt,
        modelId: state.settings.promptModelId,
        mode: "image-edit",
        imageEditEnhanceMode: promptEnhanceMode === "faithful" ? "faithful" : "detail-enhance",
        imageEditPresetText: state.settings.imagePromptPresets[
          promptEnhanceMode === "faithful" ? "faithful" : "detail-enhance"
        ],
        imagePaths: pictures.map(imageReferenceInputPath),
        referenceContext: [
          pictures.map((picture) =>
            `Slot ${picture.pictureNumber} / Picture ${picture.pictureNumber} = ${imageReferenceRoleLabels[picture.role ?? "auto"]}`
          ).join("\n"),
          imageMarkupPromptContext(pictures)
        ].filter(Boolean).join("\n\n")
      });
      promptRuntimeLoaded = true;
      const versions = [
        ...state.imageDraft.promptVersions.slice(0, state.imageDraft.activePromptVersion + 1),
        {
          id: crypto.randomUUID(),
          label: `图片优化 ${state.imageDraft.promptVersions.filter((item) => item.label.startsWith("图片优化")).length + 1}`,
          text,
          createdAt: new Date().toISOString()
        }
      ];
      patchImageDraft({ promptVersions: versions, activePromptVersion: versions.length - 1 });
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error));
    } finally {
      promptEnhancing = false;
      render();
    }
  });
  document.querySelector("#image-prompt-prev")?.addEventListener("click", () => {
    patchImageDraft({ activePromptVersion: Math.max(0, state.imageDraft.activePromptVersion - 1) });
    render();
  });
  document.querySelector("#image-prompt-next")?.addEventListener("click", () => {
    patchImageDraft({ activePromptVersion: Math.min(state.imageDraft.promptVersions.length - 1, state.imageDraft.activePromptVersion + 1) });
    render();
  });
  for (const id of ["image-edit-model", "image-edit-quality", "image-edit-resolution", "image-edit-seed"]) {
    document.querySelector(`#${id}`)?.addEventListener("change", (event) => {
      const value = (event.currentTarget as HTMLInputElement | HTMLSelectElement).value;
      const modelCapability = id === "image-edit-model"
        ? imageModelCapabilityFor(value)
        : undefined;
      patchImageDraft(
        id === "image-edit-model"
          ? {
              modelId: value,
              qualityProfile: modelCapability?.qualityProfiles.some((profile) => profile.id === state.imageDraft.qualityProfile)
                ? state.imageDraft.qualityProfile
                : modelCapability?.qualityProfiles[0]?.id ?? "native"
            }
          :
        id === "image-edit-quality" ? { qualityProfile: value } :
        id === "image-edit-resolution"
          ? {
              targetResolution: normalizeImageTargetResolution(
                value,
                state.imageDraft.pictures[0]?.width ?? 0,
                state.imageDraft.pictures[0]?.height ?? 0
              )
            } :
        { seed: value ? Number(value) : null }
      );
      if (id !== "image-edit-seed") render();
    });
  }
  const countInput = document.querySelector<HTMLInputElement>("#image-edit-count");
  countInput?.addEventListener("input", () => {
    const outputCount = Math.min(10, Math.max(1, Number(countInput.value) || 1));
    patchImageDraft({ outputCount });
    const countValue = document.querySelector("#image-edit-count-value");
    if (countValue) countValue.textContent = `${outputCount} 张`;
  });
  document.querySelector("#random-image-edit-seed")?.addEventListener("click", () => {
    patchImageDraft({ seed: randomSeedValue() });
    render();
  });
  document.querySelector("#clear-image-edit-seed")?.addEventListener("click", () => {
    patchImageDraft({ seed: null });
    render();
  });
  document.querySelector("#clear-image-edit-draft")?.addEventListener("click", () => {
    patchImageDraft(createDefaultImageEditDraft());
    render();
  });
  document.querySelector("#enqueue-image-edit")?.addEventListener("click", async () => {
    if (enqueueBusy) return;
    enqueueBusy = true;
    setEnqueueBusyUi(true);
    try {
      reportUserAction("image-queue-enqueue", {
        modelId: state.imageDraft.modelId,
        outputCount: state.imageDraft.outputCount,
        pictureCount: state.imageDraft.pictures.length
      });
      state = await window.studio.enqueueImageEdit(state.imageDraft);
      showMessage(`已加入图片队列：${state.queue.at(-1)?.outputFilename ?? ""}`);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error));
    } finally {
      enqueueBusy = false;
      render();
    }
  });
}

function bindCreate(): void {
  document.querySelectorAll<HTMLElement>("[data-input-mode]").forEach((button) => {
    button.addEventListener("click", async () => {
      const requestedMode = button.dataset.inputMode;
      if (requestedMode === "image-edit") {
        creationMode = "image-edit";
        render();
        return;
      }
      const inputMode = requestedMode === "video" ? "video" : "image";
      creationMode = inputMode === "video" ? "video-extension" : "image-to-video";
      const modelId = inputMode === "video"
        ? isMiniMaxH3R2vModel(state.draft.modelId) || isMiniMaxH3Fl2vaModel(state.draft.modelId)
          ? state.draft.modelId
          : (() => {
              const node = environmentScan?.customNodes.find((item) => item.id === "h3-motion-context");
              return node?.installed || node?.loaded;
            })()
            ? "minimax_h3_ref2va"
            : "minimax_h3_fl2va"
        : state.draft.modelId;
      const videoLoras = inputMode === "video" ? [] : state.draft.videoLoras;
      const workflowModelId = bundledWorkflowModelId({ modelId, videoLoras });
      const key = bundledWorkflowKey(workflowModelId, inputMode);
      const bundled = bundledWorkflows[key] ??
        (await window.studio.getBundledWorkflow(workflowModelId, inputMode));
      if (bundled) {
        bundledWorkflows[key] = bundled;
        workflowCapabilities[bundled.path] = {
          supportsEndImage: bundled.supportsEndImage,
          supportsVideoExtension: bundled.supportsVideoExtension
        };
      }
      patchDraft({
        inputMode,
        modelId,
        videoLoras,
        workflowPath: bundled?.path ?? "",
        ...(inputMode === "video"
          ? {
              ratio: "source" as const,
              spectrumMode: isMiniMaxH3R2vModel(modelId)
                ? "off" as const
                : state.draft.spectrumMode
            }
          : {})
      });
      render();
    });
  });
  if (creationMode === "image-edit") {
    bindImageEditCreate();
    return;
  }
  document.querySelector("#pick-video")?.addEventListener("click", async () => {
    const filename = await window.studio.pickVideo();
    if (filename) await selectDraftVideo(filename);
  });
  document.querySelector("#remove-video")?.addEventListener("click", () => {
    patchDraft({
      sourceVideoPath: "",
      sourceVideoDuration: 0,
      trimStartSeconds: 0,
      trimEndSeconds: 0,
      sourceAssetId: undefined,
      sourceVersionId: undefined,
      h3ContextLatentPath: undefined,
      sourceWidth: 0,
      sourceHeight: 0
    });
    render();
  });
  bindVideoDrop();
  bindVideoTrim();
  document.querySelector("#pick-start")?.addEventListener("click", async () => {
    const filename = await window.studio.pickImage();
    if (filename) {
      patchDraft({ startImagePath: filename, sourceWidth: 0, sourceHeight: 0 });
      render();
    }
  });
  document.querySelector("#pick-end")?.addEventListener("click", async () => {
    const filename = await window.studio.pickImage();
    if (filename) {
      patchDraft({ endImagePath: filename });
      render();
    }
  });
  document.querySelector("#toggle-end")?.addEventListener("click", async () => {
    if (state.draft.endImagePath) {
      patchDraft({ endImagePath: "" });
      render();
      return;
    }
    const filename = await window.studio.pickImage();
    if (filename) {
      patchDraft({ endImagePath: filename });
      render();
    }
  });
  bindFrameDrop("#pick-start", "startImagePath");
  bindFrameDrop("#pick-end", "endImagePath");
  document.querySelectorAll<HTMLElement>("[data-clear-frame]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const field =
        button.dataset.clearFrame === "end"
          ? "endImagePath"
          : "startImagePath";
      patchDraft({
        [field]: "",
        ...(field === "startImagePath"
          ? { sourceWidth: 0, sourceHeight: 0 }
          : {})
      });
      render();
    });
  });
  document.querySelector("#pick-workflow")?.addEventListener("click", async () => {
    const filename = await window.studio.pickWorkflow();
    if (filename) {
      workflowCapabilities[filename] = await window.studio.inspectWorkflow(filename);
      patchDraft({ workflowPath: filename });
      render();
    }
  });
  const promptInput = document.querySelector<HTMLTextAreaElement>("#prompt-input");
  const promptSnippetSelect = document.querySelector<HTMLSelectElement>("#prompt-snippet");
  const insertSnippetButton = document.querySelector<HTMLButtonElement>("#insert-prompt-snippet");
  const updateSnippetButton = () => {
    if (insertSnippetButton) insertSnippetButton.disabled = !promptSnippetSelect?.value;
  };
  promptSnippetSelect?.addEventListener("change", updateSnippetButton);
  insertSnippetButton?.addEventListener("click", () => {
    if (!promptInput || !promptSnippetSelect) return;
    insertPromptSnippet(promptInput, promptSnippetFor(promptSnippetSelect.value));
    promptSnippetSelect.value = "";
    updateSnippetButton();
  });
  promptInput?.addEventListener("input", () => {
    resizePromptInput(promptInput);
    const versions = [...state.draft.promptVersions];
    const current = versions[state.draft.activePromptVersion];
    if (current?.label === "手动编辑") {
      versions[state.draft.activePromptVersion] = { ...current, text: promptInput.value };
    } else {
      versions.splice(state.draft.activePromptVersion + 1);
      versions.push({
        id: crypto.randomUUID(),
        label: "手动编辑",
        text: promptInput.value,
        createdAt: new Date().toISOString()
      });
      state.draft.activePromptVersion = versions.length - 1;
    }
    patchDraft({ promptVersions: versions, activePromptVersion: state.draft.activePromptVersion });
    syncPromptEnqueueUi(promptInput.value);
    updatePromptWordCounter(promptInput.value, isMiniMaxH3Model(state.draft.modelId) ? h3PromptModeForDraft(state.draft) : undefined, state.draft.duration);
    updateH3PromptCheck(
      promptInput.value,
      Boolean(state.draft.endImagePath),
      h3PromptModeForDraft(state.draft),
      state.draft.h3ReferenceSlots.some((slot) => slot.mediaType === "video")
    );
  });
  if (promptInput) {
    resizePromptInput(promptInput);
    window.requestAnimationFrame(() => resizePromptInput(promptInput));
  }
  updatePromptWordCounter(
    promptInput?.value ?? "",
    isMiniMaxH3Model(state.draft.modelId)
      ? h3PromptModeForDraft(state.draft)
      : undefined,
    state.draft.duration
  );
  document.querySelector("#prompt-prev")?.addEventListener("click", () => {
    patchDraft({ activePromptVersion: Math.max(0, state.draft.activePromptVersion - 1) });
    render();
  });
  document.querySelector("#prompt-next")?.addEventListener("click", () => {
    patchDraft({ activePromptVersion: Math.min(state.draft.promptVersions.length - 1, state.draft.activePromptVersion + 1) });
    render();
  });
  document.querySelector("#prompt-enhance-mode")?.addEventListener("change", (event) => {
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (isMiniMaxH3Model(state.draft.modelId)) {
      h3PromptPreset = value as H3PromptPreset;
    } else {
      promptEnhanceMode = value as PromptEnhanceMode;
    }
  });
  document.querySelector("#release-prompt-model-create")?.addEventListener("click", () => {
    void togglePromptModelFromUi();
  });
  document.querySelector("#enhance-prompt")?.addEventListener("click", async (event) => {
    promptEnhancing = true;
    render();
    try {
      const isCurrentH3 = isMiniMaxH3Model(state.draft.modelId);
      const h3Mode = h3PromptModeForDraft(state.draft);
      const requestMode: PromptEnhanceMode = isCurrentH3
        ? "h3-vision"
        : promptEnhanceMode === "h3-vision" ? "sulphur-native" : promptEnhanceMode;
      const isH3Vision = requestMode === "h3-vision";
      const h3ImagePaths = isMiniMaxH3R2vModel(state.draft.modelId)
        ? state.draft.h3ReferenceSlots
            .filter((slot) => slot.mediaType === "image" && slot.mediaPath)
            .map((slot) => slot.mediaPath)
        : [state.draft.startImagePath, state.draft.endImagePath].filter(Boolean);
      const referenceContext = isMiniMaxH3R2vModel(state.draft.modelId)
        ? state.draft.h3ReferenceSlots.map((slot) =>
            `${h3ReferenceTag(state.draft.h3ReferenceSlots, slot.id)} = ${h3ReferenceRoleLabels[slot.role]}${slot.note ? `; ${slot.note}` : ""}`
          ).join("\n")
        : h3Mode === "FL2VA"
          ? "<Picture 1> = 首帧; <Picture 2> = 尾帧"
          : h3Mode === "I2VA"
            ? "<Picture 1> = 首帧"
            : h3Mode === "L2VA"
              ? "<Picture 1> = 尾帧"
              : "";
      const text = await window.studio.enhancePrompt({
        prompt: activePrompt().text,
        modelId: state.draft.modelId,
        mode: requestMode,
        imagePath: state.draft.startImagePath || undefined,
        imagePaths: isH3Vision ? h3ImagePaths : undefined,
        h3PromptMode: h3Mode,
        h3PromptPreset: isCurrentH3
          ? h3PromptPresetForMode(h3Mode, h3PromptPreset)
          : undefined,
        h3DurationSeconds: state.draft.duration,
        h3AspectRatio: state.draft.ratio === "source"
          ? state.draft.sourceHeight > state.draft.sourceWidth ? "9:16" : "16:9"
          : state.draft.ratio,
        referenceMediaPaths: isMiniMaxH3R2vModel(state.draft.modelId)
          ? state.draft.h3ReferenceSlots.map((slot) => slot.mediaPath).filter(Boolean)
          : [state.draft.startImagePath, state.draft.endImagePath].filter(Boolean),
        referenceContext: isH3Vision ? referenceContext : undefined
      });
      promptRuntimeLoaded = true;
      const versions = [
        ...state.draft.promptVersions.slice(0, state.draft.activePromptVersion + 1),
        { id: crypto.randomUUID(), label: `扩写 ${state.draft.promptVersions.filter((item) => item.label.startsWith("扩写")).length + 1}`, text, createdAt: new Date().toISOString() }
      ];
      patchDraft({ promptVersions: versions, activePromptVersion: versions.length - 1 });
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error));
    } finally {
      promptEnhancing = false;
      render();
    }
  });
  document.querySelector("#h3-prompt-template")?.addEventListener("click", () => {
    const template = createH3PromptTemplate(
      activePrompt().text,
      state.draft.duration,
      {
        hasEndImage: Boolean(state.draft.endImagePath),
        hasStartImage: Boolean(state.draft.startImagePath),
        mode: h3PromptModeForDraft(state.draft),
        referenceSlots: state.draft.h3ReferenceSlots.map((slot) => ({
          mediaType: slot.mediaType,
          role: h3ReferenceRoleLabels[slot.role],
          note: slot.note
        }))
      }
    );
    const versions = [
      ...state.draft.promptVersions.slice(0, state.draft.activePromptVersion + 1),
      {
        id: crypto.randomUUID(),
        label: "H3 分镜模板",
        text: template.text,
        createdAt: new Date().toISOString()
      }
    ];
    patchDraft({ promptVersions: versions, activePromptVersion: versions.length - 1 });
    showMessage(`已创建 H3 ${template.mode} 官方结构模板（${template.effectiveDurationSeconds.toFixed(2)} 秒、${template.shotCount} 个镜头），原内容仍可通过左箭头找回。`);
  });
  document.querySelectorAll<HTMLElement>("[data-h3-builder]").forEach((field) => {
    const updateBuilder = (event: Event) => {
      const key = (event.currentTarget as HTMLElement).dataset.h3Builder as keyof H3PromptBuilderInput | undefined;
      if (!key) return;
      const target = event.currentTarget as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      h3PromptBuilder = { ...h3PromptBuilder, [key]: target.value } as H3PromptBuilderInput;
    };
    field.addEventListener("input", updateBuilder);
    field.addEventListener("change", updateBuilder);
  });
  document.querySelector("#h3-builder-reset")?.addEventListener("click", () => {
    h3PromptBuilder = createDefaultH3PromptBuilder();
    render();
  });
  document.querySelector("#h3-builder-generate")?.addEventListener("click", () => {
    const template = createH3PromptFromBuilder(
      h3PromptBuilder,
      state.draft.duration,
      {
        hasEndImage: Boolean(state.draft.endImagePath),
        hasStartImage: Boolean(state.draft.startImagePath),
        mode: h3PromptModeForDraft(state.draft),
        referenceSlots: state.draft.h3ReferenceSlots.map((slot) => ({
          mediaType: slot.mediaType,
          role: h3ReferenceRoleLabels[slot.role],
          note: slot.note
        }))
      }
    );
    const versions = [
      ...state.draft.promptVersions.slice(0, state.draft.activePromptVersion + 1),
      {
        id: crypto.randomUUID(),
        label: "H3 构建器版本",
        text: template.text,
        createdAt: new Date().toISOString()
      }
    ];
    patchDraft({ promptVersions: versions, activePromptVersion: versions.length - 1 });
    showMessage(`已生成 H3 ${template.mode} 结构化提示词（${template.effectiveDurationSeconds.toFixed(2)} 秒），原内容仍可通过左箭头找回。`);
  });
  const applyVideoLoraStack = async (videoLoras: Draft["videoLoras"]): Promise<void> => {
    const wasTurboEnabled = isH3TurboEnabled(state.draft);
    const turboWillBeEnabled = isH3TurboEnabled({ modelId: state.draft.modelId, videoLoras });
    const turboStateChanged = wasTurboEnabled !== turboWillBeEnabled;
    const previousWorkflowModelId = bundledWorkflowModelId(state.draft);
    const workflowModelId = bundledWorkflowModelId({
      modelId: state.draft.modelId,
      videoLoras
    });
    const key = bundledWorkflowKey(workflowModelId, state.draft.inputMode);
    const bundled = bundledWorkflows[key] ??
      await window.studio.getBundledWorkflow(workflowModelId, state.draft.inputMode);
    if (bundled) {
      bundledWorkflows[key] = bundled;
      workflowCapabilities[bundled.path] = {
        supportsEndImage: bundled.supportsEndImage,
        supportsVideoExtension: bundled.supportsVideoExtension
      };
    }
    const previousBundledPath = bundledWorkflows[
      bundledWorkflowKey(previousWorkflowModelId, state.draft.inputMode)
    ]?.path;
    const currentWorkflowIsBundled = !state.draft.workflowPath ||
      state.draft.workflowPath === previousBundledPath;
    const shouldSwitchWorkflow = turboStateChanged && currentWorkflowIsBundled;
    patchDraft({
      videoLoras,
      steps: turboWillBeEnabled
        ? normalizeH3Steps(state.draft.steps, state.draft.modelId, videoLoras)
        : wasTurboEnabled ? 20 : state.draft.steps,
      spectrumMode: turboWillBeEnabled ? "off" : state.draft.spectrumMode,
      workflowPath: shouldSwitchWorkflow
        ? bundled?.path ?? state.draft.workflowPath
        : state.draft.workflowPath
    });
    render();
    if (turboStateChanged && !currentWorkflowIsBundled) {
      showMessage(turboWillBeEnabled
        ? "已保留当前自定义工作流；Turbo 提交前会检查 ER-SDE、Beta 与 Sigma Shift。"
        : "已保留当前自定义工作流；其中自带的 LoRA 和采样设置不会被应用自动删除。");
    } else if (turboStateChanged && shouldSwitchWorkflow) {
      showMessage(turboWillBeEnabled
        ? "已启用 Turbo，并切换到匹配的低步数工作流。"
        : "已关闭 Turbo，并恢复标准 H3 工作流。"
      );
    }
  };
  document.querySelector("#add-video-lora")?.addEventListener("click", async () => {
    const id = document.querySelector<HTMLSelectElement>("#video-lora-to-add")?.value ?? "";
    const lora = BUILTIN_VIDEO_LORAS.find((item) => item.id === id);
    if (!lora || state.draft.videoLoras.some((item) => item.id === id)) return;
    const profile = environmentScan?.modelProfiles.find((item) => item.id === id);
    const detectedFilename = detectedVideoLoraFilename(profile);
    if (!detectedFilename) {
      showMessage(`${lora.name} 尚未检测到可用文件，请先在设置 → LoRA 中安装或重新扫描。`, false);
      return;
    }
    await applyVideoLoraStack([
      ...state.draft.videoLoras,
      videoLoraSelection(lora, lora.strength, detectedFilename)
    ]);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-remove-video-lora]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.removeVideoLora;
      if (!id) return;
      await applyVideoLoraStack(state.draft.videoLoras.filter((lora) => lora.id !== id));
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-move-video-lora]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.moveVideoLora;
      const direction = button.dataset.direction === "up" ? -1 : 1;
      if (!id) return;
      await applyVideoLoraStack(reorderVideoLoras(state.draft.videoLoras, id, direction));
    });
  });
  const updateLoraStrength = (id: string, rawValue: string): void => {
    const strength = Math.max(0, Math.min(2, Number(rawValue) || 0));
    patchDraft({
      videoLoras: state.draft.videoLoras.map((lora) =>
        lora.id === id ? { ...lora, strength } : lora
      )
    });
    const range = document.querySelector<HTMLInputElement>(`[data-video-lora-strength="${CSS.escape(id)}"]`);
    const number = document.querySelector<HTMLInputElement>(`[data-video-lora-strength-number="${CSS.escape(id)}"]`);
    if (range) range.value = String(strength);
    if (number) number.value = String(strength);
  };
  document.querySelectorAll<HTMLInputElement>("[data-video-lora-strength]").forEach((input) => {
    input.addEventListener("input", () => updateLoraStrength(input.dataset.videoLoraStrength ?? "", input.value));
  });
  document.querySelectorAll<HTMLInputElement>("[data-video-lora-strength-number]").forEach((input) => {
    input.addEventListener("change", () => updateLoraStrength(input.dataset.videoLoraStrengthNumber ?? "", input.value));
  });
  for (const id of ["model", "ratio", "resolution", "steps", "spectrum-mode", "fps", "frame-interpolation", "motion", "seed"]) {
    document.querySelector(`#${id}`)?.addEventListener("change", async (event) => {
      const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
      if (id === "model") {
        const oldKey = bundledWorkflowKey(bundledWorkflowModelId(state.draft), state.draft.inputMode);
        const nextKey = bundledWorkflowKey(value, state.draft.inputMode);
        const oldBundledPath = bundledWorkflows[oldKey]?.path;
        const nextIsR2V = isMiniMaxH3R2vModel(value);
        const oldWasR2V = isMiniMaxH3R2vModel(state.draft.modelId);
        const existingSlots = state.draft.h3ReferenceSlots;
        const slotsForR2V = nextIsR2V && state.draft.inputMode !== "video" && !existingSlots.length
          ? [state.draft.startImagePath, state.draft.endImagePath]
              .filter(Boolean)
              .map((imagePath) => newH3ReferenceSlot(imagePath))
          : existingSlots;
        const restoredStartImage = oldWasR2V
          ? existingSlots.find((slot) => slot.mediaType === "image")?.mediaPath ?? ""
          : state.draft.startImagePath;
        const restoredEndImage = oldWasR2V
          ? existingSlots.filter((slot) => slot.mediaType === "image")[1]?.mediaPath ?? ""
          : state.draft.endImagePath;
        const bundled =
          bundledWorkflows[nextKey] ??
          (await window.studio.getBundledWorkflow(value, state.draft.inputMode));
        if (bundled) bundledWorkflows[nextKey] = bundled;
        if (bundled) {
          workflowCapabilities[bundled.path] = {
            supportsEndImage: bundled.supportsEndImage,
            supportsVideoExtension: bundled.supportsVideoExtension
          };
        }
        patchDraft({
          modelId: value,
          videoLoras: [],
          h3ReferenceSlots: slotsForR2V,
          startImagePath: nextIsR2V && state.draft.inputMode !== "video" ? "" : restoredStartImage,
          endImagePath: nextIsR2V && state.draft.inputMode !== "video" ? "" : restoredEndImage,
          ...(isMiniMaxH3Model(value)
            ? {
                ratio: "source" as const,
                resolution: 480 as const,
                duration: 5,
                steps: 20 as const,
                fps: 24 as const,
                frameInterpolation: "off" as const,
                motion: "natural" as const,
                spectrumMode: (state.draft.inputMode === "video" && nextIsR2V)
                  ? "off" as const
                  : state.draft.spectrumMode
              }
            : {}),
          ...(!bundled?.supportsEndImage && !nextIsR2V ? { endImagePath: "" } : {}),
          workflowPath:
            bundled?.path ??
            (state.draft.workflowPath === oldBundledPath
              ? ""
              : state.draft.workflowPath)
        });
        enableSpectrumByDefaultIfAvailable();
        render();
        return;
      }
      const patch =
        id === "ratio" ? { ratio: value as Draft["ratio"] } :
        id === "resolution" ? { resolution: Number(value) as Draft["resolution"] } :
        id === "steps" ? { steps: normalizeH3Steps(Number(value), state.draft.modelId, state.draft.videoLoras) } :
        id === "spectrum-mode"
          ? { spectrumMode: value as Draft["spectrumMode"], spectrumModeUserSet: true }
          :
        id === "fps" ? { fps: Number(value) as Draft["fps"] } :
        id === "frame-interpolation" ? { frameInterpolation: value as Draft["frameInterpolation"] } :
        id === "motion" ? { motion: value as Draft["motion"] } :
        { seed: value ? Number(value) : null };
      patchDraft(patch);
      if (id === "fps" || id === "frame-interpolation") render();
    });
  }
  document.querySelector<HTMLButtonElement>("#clear-seed")?.addEventListener("click", () => {
    patchDraft({ seed: null });
    render();
  });
  document.querySelector<HTMLButtonElement>("#random-seed")?.addEventListener("click", () => {
    patchDraft({ seed: randomSeedValue() });
    render();
  });
  const range = document.querySelector<HTMLInputElement>("#duration");
  const number = document.querySelector<HTMLInputElement>("#duration-number");
  const updateDuration = (value: string) => {
    const maxDuration = generationSafetyForTask(state.draft).maxDurationSeconds;
    const duration = Math.max(1, Math.min(maxDuration, Number(value) || 1));
    patchDraft({ duration });
    if (range) range.value = String(duration);
    if (number) number.value = String(duration);
    const added = document.querySelector("#trim-added");
    const total = document.querySelector("#trim-total");
    const kept = state.draft.trimEndSeconds - state.draft.trimStartSeconds;
    if (added) added.textContent = `${duration.toFixed(1)} 秒`;
    if (total) total.textContent = `约 ${(kept + duration).toFixed(1)} 秒`;
  };
  range?.addEventListener("input", () => updateDuration(range.value));
  number?.addEventListener("input", () => updateDuration(number.value));
  range?.addEventListener("change", render);
  number?.addEventListener("change", render);
  document.querySelector("#clear-draft")?.addEventListener("click", () => {
    rememberModalFocus();
    pendingConfirmation = { kind: "clear-draft" };
    confirmationBusy = false;
    render();
  });
  document.querySelector("#enqueue")?.addEventListener("click", async () => {
    if (enqueueBusy) return;
    enqueueBusy = true;
    setEnqueueBusyUi(true);
    try {
      reportUserAction("queue-enqueue", {
        taskType: state.draft.inputMode === "video" ? "extension" : "generation",
        modelId: state.draft.modelId,
        duration: state.draft.duration,
        fps: state.draft.fps
      });
      if (state.draft.inputMode === "video") {
        state = await window.studio.enqueueExtension(state.draft);
        showMessage(`已加入续写队列：${state.queue.at(-1)?.outputFilename ?? ""}`);
        return;
      }
      state = await window.studio.enqueue(state.draft);
      showMessage(`已加入队列：${state.queue.at(-1)?.outputFilename ?? ""}`);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error));
    } finally {
      enqueueBusy = false;
      render();
    }
  });
}

function bindQueue(): void {
  document.querySelector("#start-queue")?.addEventListener("click", async () => {
    reportUserAction("queue-start");
    try {
      state = await window.studio.startQueue();
      promptRuntimeLoaded = false;
      render();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error));
    }
  });
  document.querySelector("#pause-queue")?.addEventListener("click", async () => {
    reportUserAction("queue-pause");
    state = await window.studio.pauseQueue();
    render();
  });
  document.querySelectorAll<HTMLElement>("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      reportUserAction("queue-remove", { taskId: button.dataset.remove });
      requestQueueTaskConfirmation(button.dataset.remove!, "remove");
    });
  });
  document.querySelectorAll<HTMLElement>("[data-cancel]").forEach((button) => {
    button.addEventListener("click", () => {
      reportUserAction("queue-cancel", { taskId: button.dataset.cancel });
      requestQueueTaskConfirmation(button.dataset.cancel!, "cancel");
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-move]").forEach((button) => {
    button.addEventListener("click", async () => {
      captureQueueMoveAnchor(button);
      reportUserAction("queue-move", {
        taskId: button.dataset.move,
        direction: button.dataset.direction
      });
      state = await window.studio.moveTask(
        button.dataset.move!,
        Number(button.dataset.direction) as -1 | 1
      );
      render();
    });
  });
  document.querySelectorAll<HTMLElement>("[data-duplicate]").forEach((button) => {
    button.addEventListener("click", async () => {
      reportUserAction("queue-duplicate", { taskId: button.dataset.duplicate });
      state = await window.studio.duplicateTask(button.dataset.duplicate!);
      render();
    });
  });
  document.querySelectorAll<HTMLElement>("[data-reset-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      reportUserAction("queue-reset-status", { taskId: button.dataset.resetTask });
      try {
        state = await window.studio.resetTask(button.dataset.resetTask!);
        render();
      } catch (error) {
        showMessage(error instanceof Error ? error.message : "无法重置任务状态");
      }
    });
  });
  document.querySelectorAll<HTMLElement>("[data-edit-task]").forEach((button) => {
    button.addEventListener("click", () => {
      void editQueueTask(button.dataset.editTask!);
    });
  });
  document.querySelectorAll<HTMLElement>("[data-edit-upscale-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      const task = state.queue.find((item) => item.id === button.dataset.editUpscaleTask);
      if (!task || task.taskType !== "upscale") return;
      try {
        rememberModalFocus();
        const editingWaitingTask = task.status === "waiting";
        upscaleDialog = {
          ...(editingWaitingTask ? { taskId: task.id } : { replaceTaskId: task.id }),
          assetId: task.sourceAssetId,
          versionId: task.sourceVersionId,
          targetHeight: task.targetHeight,
          modelId: task.modelId as typeof upscaleDialog extends { modelId: infer Model } ? Model : never,
          tileMode: task.tileMode
        };
        render();
      } catch (error) {
        showMessage(error instanceof Error ? error.message : "无法编辑提升任务");
      }
    });
  });
}

function bindUpscaleDialog(): void {
  const closeUpscale = () => {
    upscaleDialog = null;
    render();
    restoreModalFocus();
  };
  document.querySelector("#close-upscale")?.addEventListener("click", closeUpscale);
  document.querySelector("#cancel-upscale")?.addEventListener("click", closeUpscale);
  document.querySelector("#upscale-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeUpscale();
  });
  const upscaleDialogElement = document.querySelector<HTMLElement>(".upscale-dialog");
  if (upscaleDialogElement) bindModalFocus(upscaleDialogElement, closeUpscale, "#cancel-upscale");
  document.querySelectorAll<HTMLElement>("[data-upscale-height]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!upscaleDialog) return;
      rememberModalControlFocus(button);
      upscaleDialog.targetHeight = Number(button.dataset.upscaleHeight) as typeof upscaleDialog.targetHeight;
      render();
    });
  });
  document.querySelector("#upscale-model")?.addEventListener("change", (event) => {
    if (!upscaleDialog) return;
    rememberModalControlFocus(event.currentTarget as HTMLElement);
    upscaleDialog.modelId = (event.currentTarget as HTMLSelectElement).value as typeof upscaleDialog.modelId;
    render();
  });
  document.querySelector("#upscale-tile")?.addEventListener("change", (event) => {
    if (!upscaleDialog) return;
    rememberModalControlFocus(event.currentTarget as HTMLElement);
    upscaleDialog.tileMode = (event.currentTarget as HTMLSelectElement).value as typeof upscaleDialog.tileMode;
    render();
  });
  document.querySelector("#enqueue-upscale")?.addEventListener("click", async () => {
    if (!upscaleDialog) return;
    const dialogState = upscaleDialog;
    reportUserAction(dialogState.taskId ? "upscale-task-update" : "upscale-task-enqueue", {
      taskId: dialogState.taskId ?? dialogState.replaceTaskId,
      modelId: dialogState.modelId,
      targetHeight: dialogState.targetHeight
    });
    const asset = state.history.find((item) => item.id === dialogState.assetId);
    const version = asset?.versions.find((item) => item.id === dialogState.versionId);
    const fileIndex = version ? versionVideoIndex(version) : -1;
    const sourceFile = fileIndex >= 0 ? version?.files[fileIndex] : undefined;
    if (!asset || !version || !sourceFile?.absolutePath) {
      showMessage("源视频文件不可用，无法创建提升任务。");
      return;
    }
    try {
      const [targetWidth, targetHeight] = upscaleDimensions(
        version.width,
        version.height,
        dialogState.targetHeight
      );
      const upscalePatch = {
        targetWidth,
        targetHeight: dialogState.targetHeight,
        modelId: dialogState.modelId,
        workflowPath: `builtin:upscale/${dialogState.modelId}`,
        tileMode: dialogState.tileMode,
        faceRestore: false,
        outputFilename: createUpscaleFilename(sourceFile.filename, dialogState.targetHeight)
      };
      if (dialogState.taskId || dialogState.replaceTaskId) {
        state = await window.studio.updateUpscaleTask(
          dialogState.taskId ?? dialogState.replaceTaskId!,
          upscalePatch
        );
      } else {
        state = await window.studio.enqueueUpscale({
          sourceAssetId: asset.id,
          sourceVersionId: version.id,
          sourceFilePath: sourceFile.absolutePath,
          sourceFilename: sourceFile.filename,
          sourceWidth: version.width,
          sourceHeight: version.height,
          duration: version.duration,
          fps: version.fps,
          targetHeight: dialogState.targetHeight,
          modelId: dialogState.modelId,
          tileMode: dialogState.tileMode,
          faceRestore: false
        });
      }
      upscaleDialog = null;
      showMessage(
        dialogState.taskId
          ? "提升任务已更新。"
          : dialogState.replaceTaskId
            ? "失败任务已恢复并更新设置。"
            : "分辨率提升任务已加入队列。"
      );
      restoreModalFocus();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error));
    }
  });
}

function bindHistory(playback: HistoryPlaybackSnapshot | null = null): void {
  if (historyLayout === "album") bindHistoryAlbum();
  else bindHistoryMasonry();
  if (page === "image-history-detail") bindImageHistoryViewer();
  bindHistoryTitleMarquees();
  restoreHistoryLayoutAnchor();
  document.querySelectorAll<HTMLButtonElement>("[data-history-kind][role=tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextKind = button.dataset.historyKind as HistoryKind;
      if (nextKind !== "video" && nextKind !== "image") return;
      if (nextKind === historyKind) return;
      reportUserAction("history-kind", { kind: nextKind });
      historyKind = nextKind;
      historyScrollPosition = 0;
      historyScrollRestorePending = false;
      render();
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
    });
  });
  document.querySelectorAll<HTMLImageElement>("[data-image-history-preview]").forEach((image) => {
    void loadImageHistoryThumbnail(image);
  });
  const detailVideo = document.querySelector<HTMLVideoElement>('.history-player video');
  const playbackMatches = Boolean(
    detailVideo && playback &&
    detailVideo.dataset.historyAsset === playback.assetId &&
    detailVideo.dataset.historyVersion === playback.versionId
  );
  if (detailVideo && !playbackMatches) {
    const startPlayback = () => {
      detailVideo.loop = true;
      try {
        detailVideo.currentTime = 0;
      } catch {
        // Metadata may not expose a seekable range yet; playback still begins at zero.
      }
      void detailVideo.play().catch(() => {
        if (detailVideo.muted) return;
        detailVideo.muted = true;
        void detailVideo.play().catch(() => undefined);
      });
    };
    if (detailVideo.readyState >= 2) startPlayback();
    else detailVideo.addEventListener('canplay', startPlayback, { once: true });
  }
  document.querySelectorAll<HTMLElement>("[data-history-layout]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextLayout = button.dataset.historyLayout as typeof historyLayout;
      switchHistoryLayout(nextLayout);
    });
  });
  document.querySelectorAll<HTMLElement>(".history-media-badges").forEach((badges) => {
    badges.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-history-navigation]").forEach((button) => {
    button.addEventListener("click", () => {
      const direction = Number(button.dataset.historyNavigation);
      if (direction === -1 || direction === 1) {
        if (page === "image-history-detail") navigateImageHistoryDetail(direction);
        else navigateHistoryDetail(direction);
      }
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-image-version-navigation]").forEach((button) => {
    button.addEventListener("click", () => {
      const direction = Number(button.dataset.imageVersionNavigation);
      if (direction === -1 || direction === 1) navigateImageHistoryVersion(direction);
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-image-version-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const versionId = button.dataset.imageVersionId;
      if (!versionId || !selectedHistoryAssetId) return;
      selectedHistoryVersionId = versionId;
      historyForwardTarget = { assetId: selectedHistoryAssetId, versionId };
      reportUserAction("image-history-version-select", { projectId: selectedHistoryAssetId, versionId });
      render();
    });
  });
  bindImageHistoryLightbox();
  const historyMediaCards = [...document.querySelectorAll<HTMLElement>("[data-history-media]")];
  historyMediaCards.forEach((media) => {
    const video = media.querySelector<HTMLVideoElement>("video");
    if (!video) return;
    video.addEventListener("error", () => {
      media.classList.remove("playing");
      media.classList.remove("media-loading", "media-ready");
      if (media.dataset.historyCoverCached === "true") return;
      media.classList.add("media-error");
    });
    video.addEventListener("loadeddata", () => {
      media.classList.remove("media-loading", "media-error");
      media.classList.add("media-ready");
    });
    const progress = media.querySelector<HTMLButtonElement>(".history-preview-progress");
    const fill = progress?.querySelector<HTMLElement>("i");
    const fallbackDuration = Number(media.dataset.previewDuration) || 0;
    let pendingSeekRatio: number | null = null;
    let seeking = false;
    let resumeAfterSeek = false;
    let coverTime = Number(media.dataset.coverTime) || 0;
    const coverSeed = Number(media.dataset.coverSeed) || 0;
    let coverSelectionStarted = false;
    const previewDuration = () =>
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : fallbackDuration;
    const updatePreviewProgress = () => {
      if (!progress || !fill) return;
      const duration = previewDuration();
      if (!duration) return;
      const ratio = pendingSeekRatio ?? Math.min(1, Math.max(0, video.currentTime / duration));
      fill.style.width = `${ratio * 100}%`;
      progress.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
      progress.setAttribute(
        "aria-valuetext",
        `${formatVideoDuration(ratio * duration)} / ${formatVideoDuration(duration)}`
      );
    };
    const seekToRatio = (value: number) => {
      const ratio = Math.min(1, Math.max(0, value));
      const duration = previewDuration();
      if (!duration) return;
      if (video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0) {
        try {
          video.currentTime = ratio * video.duration;
          pendingSeekRatio = null;
        } catch {
          pendingSeekRatio = ratio;
        }
      } else {
        pendingSeekRatio = ratio;
      }
      updatePreviewProgress();
    };
    const seekToPointer = (clientX: number) => {
      if (!progress) return;
      const bounds = progress.getBoundingClientRect();
      if (bounds.width <= 0) return;
      seekToRatio((clientX - bounds.left) / bounds.width);
    };
    const seekCover = () => {
      if (video.readyState < 1) return;
      try {
        video.currentTime = Math.min(coverTime, Math.max(0, video.duration - 0.05));
        pendingSeekRatio = null;
        updatePreviewProgress();
      } catch {
        // Some codecs do not expose a seekable range until more data is buffered.
      }
    };
    const startSmartCoverSelection = () => {
      if (
        coverSelectionStarted ||
        video.readyState < 2 ||
        media.dataset.historyCoverCached === "true" ||
        media.matches(":hover") ||
        media.classList.contains("playing")
      ) return;
      coverSelectionStarted = true;
      const duration = previewDuration();
      const isActive = () =>
        video.dataset.historyLoaded === "true" &&
        media.isConnected &&
        !media.matches(":hover") &&
        !media.classList.contains("playing");
      void chooseHistoryCoverTime(
        video,
        coverTime,
        duration,
        coverSeed,
        isActive
      ).then((selectedTime) => {
        if (video.dataset.historyLoaded !== "true" || !media.isConnected) return;
        coverTime = selectedTime;
        media.dataset.coverTime = String(selectedTime);
        if (isActive()) {
          seekCover();
          void saveHistoryCover(media, video, isActive);
        }
      });
    };
    const prepareVideo = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        media.style.setProperty(
          "--media-ratio",
          `${video.videoWidth} / ${video.videoHeight}`
        );
      }
      if (pendingSeekRatio == null) seekCover();
      else seekToRatio(pendingSeekRatio);
      startSmartCoverSelection();
    };
    if (video.readyState >= 1) prepareVideo();
    video.addEventListener("loadedmetadata", prepareVideo);
    video.addEventListener("loadeddata", startSmartCoverSelection, { once: true });
    video.addEventListener("timeupdate", () => {
      pendingSeekRatio = null;
      updatePreviewProgress();
    });
    progress?.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      seeking = true;
      resumeAfterSeek = !video.paused;
      video.pause();
      media.classList.add("playing");
      progress.setPointerCapture(event.pointerId);
      seekToPointer(event.clientX);
    });
    progress?.addEventListener("pointermove", (event) => {
      if (!seeking) return;
      event.preventDefault();
      event.stopPropagation();
      seekToPointer(event.clientX);
    });
    const finishSeeking = (event: PointerEvent, commit: boolean) => {
      if (!seeking) return;
      event.preventDefault();
      event.stopPropagation();
      if (commit) seekToPointer(event.clientX);
      seeking = false;
      if (progress?.hasPointerCapture(event.pointerId)) {
        progress.releasePointerCapture(event.pointerId);
      }
      if (resumeAfterSeek) void video.play().catch(() => undefined);
      resumeAfterSeek = false;
    };
    progress?.addEventListener("pointerup", (event) => finishSeeking(event, true));
    progress?.addEventListener("pointercancel", (event) => finishSeeking(event, false));
    progress?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.detail > 0) seekToPointer(event.clientX);
    });
    progress?.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      event.stopPropagation();
      const current = pendingSeekRatio ?? (previewDuration() > 0
        ? video.currentTime / previewDuration()
        : 0);
      seekToRatio(current + (event.key === "ArrowRight" ? 0.05 : -0.05));
    });
    media.addEventListener("mouseenter", () => {
      loadHistoryCardVideo(media);
      seekToRatio(0);
      media.classList.add("playing");
      void video.play().catch(() => undefined);
    });
    media.addEventListener("mouseleave", () => {
      if (seeking) return;
      media.classList.remove("playing");
      video.pause();
      seekCover();
    });
  });
  const loadHistoryCardMedia = (media: HTMLElement) => {
    void loadHistoryCoverFromCache(media).then((cached) => {
      if (!cached) loadHistoryCardVideo(media);
    });
  };
  if (typeof IntersectionObserver === "undefined") {
    historyMediaCards.forEach(loadHistoryCardMedia);
  } else {
    historyMediaObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const media = entry.target as HTMLElement;
        if (entry.isIntersecting) {
          loadHistoryCardMedia(media);
        } else if (!media.matches(":hover") && !media.classList.contains("playing")) {
          releaseHistoryCardVideo(media);
        }
      });
    }, { rootMargin: "320px 0px" });
    historyMediaCards.forEach((media) => historyMediaObserver?.observe(media));
  }
  scheduleHistoryCoverWarmup(historyMediaCards);
  document.querySelectorAll<HTMLElement>("[data-history]").forEach((card) => {
    card.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (card.dataset.historyKind === "image") {
        openImageHistoryContextMenu(card.dataset.history!, event.clientX, event.clientY);
      } else {
        openHistoryContextMenu(card.dataset.history!, event.clientX, event.clientY);
      }
    });
    const open = (event?: Event) => {
      const target = event?.target;
      if (target instanceof Element && target.closest("button")) return;
      if (card.dataset.historyKind === "image") {
        openImageHistoryDetail(card.dataset.history!);
      } else {
        openHistoryDetail(card.dataset.history!);
      }
    };
    card.addEventListener("click", (event) => open(event));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") open(event);
    });
  });
  document.querySelectorAll<HTMLElement>("[data-open-history]").forEach((button) => {
    button.addEventListener("click", () => {
      openHistoryDetail(button.dataset.openHistory!);
    });
  });
  document.querySelectorAll<HTMLElement>("[data-version-id]").forEach((button) => {
    button.addEventListener("click", () => {
      reportUserAction("history-version-select", { versionId: button.dataset.versionId });
      selectedHistoryVersionId = button.dataset.versionId!;
      if (selectedHistoryAssetId) {
        historyForwardTarget = {
          assetId: selectedHistoryAssetId,
          versionId: selectedHistoryVersionId
        };
      }
      render();
    });
  });
  document.querySelector("[data-open-upscale]")?.addEventListener("click", () => {
    reportUserAction("history-open-upscale");
    const asset = state.history.find((item) => item.id === selectedHistoryAssetId);
    if (!asset) return;
    const version = currentHistoryVersion(asset);
    const targetShortEdge = ([720, 1080, 1440, 2160] as const).find(
      (shortEdge) => shortEdge > versionShortEdge(version)
    );
    if (!targetShortEdge) return;
    rememberModalFocus();
    const configuredModel = state.settings.defaultUpscaleModel;
    upscaleDialog = {
      assetId: asset.id,
      versionId: version.id,
      targetHeight: targetShortEdge,
      modelId: (["seedvr2", "flashvsr", "realesrgan"] as const).includes(
        configuredModel as "seedvr2" | "flashvsr" | "realesrgan"
      )
        ? configuredModel as "seedvr2" | "flashvsr" | "realesrgan"
        : "seedvr2",
      tileMode: state.settings.upscaleTileMode
    };
    render();
  });
  document.querySelectorAll<HTMLElement>("[data-delete-history]").forEach((button) => {
    button.addEventListener("click", () => {
      reportUserAction("history-delete-requested", { assetId: button.dataset.deleteHistory });
      requestHistoryDeletion(button.dataset.deleteHistory!);
    });
  });
  document.querySelector("[data-copy-prompt]")?.addEventListener("click", async () => {
    reportUserAction("history-copy-prompt");
    const asset = state.history.find((item) => item.id === selectedHistoryAssetId);
    if (!asset) return;
    await copyHistoryText(asset.prompt, "提示词已复制。");
  });
  document.querySelector("[data-copy-image-prompt]")?.addEventListener("click", async () => {
    const project = state.imageHistory.find((item) => item.id === selectedHistoryAssetId);
    if (!project) return;
    const version = currentImageHistoryVersion(project);
    if (!version.prompt) {
      showMessage("当前原始图片没有可复制的 Prompt。", false);
      return;
    }
    await copyHistoryText(version.prompt, "Prompt 已复制。");
  });
  document.querySelector<HTMLElement>("[data-image-continue-edit-project]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget as HTMLElement;
    const project = state.imageHistory.find((item) => item.id === button.dataset.imageContinueEditProject);
    const version = project?.versions.find((item) => item.id === button.dataset.imageContinueEditVersion);
    if (!project || !version) return;
    await continueImageEdit(project, version);
  });
  document.querySelector<HTMLElement>("[data-image-continue-video-project]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget as HTMLElement;
    const project = state.imageHistory.find((item) => item.id === button.dataset.imageContinueVideoProject);
    const version = project?.versions.find((item) => item.id === button.dataset.imageContinueVideoVersion);
    if (!project || !version) return;
    await continueImageToVideo(project, version);
  });
  document.querySelector<HTMLButtonElement>("[data-image-set-cover]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const projectId = button.dataset.imageSetCover;
    if (!projectId) return;
    try {
      state = await window.studio.setImageHistoryCover(projectId, button.dataset.imageCoverVersion || undefined);
      showMessage(button.dataset.imageCoverVersion ? "已将当前版本设为项目封面。" : "已恢复自动封面。", false);
      render();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "无法更新项目封面。", false);
    }
  });
  document.querySelectorAll<HTMLElement>("[data-edit-history]").forEach((button) => {
    button.addEventListener("click", () => {
      void editHistoryAsset(button.dataset.editHistory!);
    });
  });
  document.querySelectorAll<HTMLElement>("[data-continue-history]").forEach((button) => {
    button.addEventListener("click", async () => {
      reportUserAction("history-continue", {
        assetId: button.dataset.continueHistory,
        versionId: button.dataset.sourceVersion
      });
      const asset = state.history.find(
        (item) => item.id === button.dataset.continueHistory
      );
      const version = asset?.versions.find(
        (item) => item.id === button.dataset.sourceVersion
      );
      const videoIndex = version ? versionVideoIndex(version) : -1;
      const filename = videoIndex >= 0 ? version?.files[videoIndex]?.absolutePath : undefined;
      if (!asset || !version || !filename) {
        showMessage("当前视频版本的本地文件不可用。");
        return;
      }
      try {
        page = "create";
        await selectDraftVideo(filename, {
          assetId: asset.id,
          versionId: version.id,
          duration: version.duration,
          width: version.width,
          height: version.height,
          h3ContextLatentPath: version.h3ContextLatentPath
        });
      } catch (error) {
        showMessage(error instanceof Error ? error.message : "无法继续创作");
      }
    });
  });
  document.querySelectorAll<HTMLElement>("[data-show-file]").forEach((button) => {
    button.addEventListener("click", async () => {
      reportUserAction("history-show-file");
      const shown = await window.studio.showItemInFolder(button.dataset.showFile!);
      if (!shown) showMessage("文件不存在或当前路径还没有在本机生成。", false);
    });
  });
  document.querySelectorAll<HTMLElement>("[data-copy-file]").forEach((button) => {
    button.addEventListener("click", () => {
      reportUserAction("history-copy-file");
      void copyHistoryFile(button.dataset.copyFile!);
    });
  });
  document.querySelectorAll<HTMLElement>("[data-copy-image]").forEach((button) => {
    button.addEventListener("click", () => {
      reportUserAction("image-history-copy-image");
      void copyHistoryImage(button.dataset.copyImage!);
    });
  });
  document.querySelectorAll<HTMLElement>("[data-delete-image-version]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.hasAttribute("disabled")) return;
      const projectId = button.dataset.deleteImageVersion;
      const versionId = button.dataset.imageVersionDeleteId;
      if (projectId && versionId) requestImageVersionDeletion(projectId, versionId);
    });
  });
}

function formSettings(): Settings {
  const base = settingsDraft ?? state.settings;
  const value = (id: string, fallback: string) =>
    document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`#${id}`)?.value.trim() ?? fallback;
  const directoryValue = (id: string, fallback: string) => {
    const input = document.querySelector<HTMLInputElement>(`#${id}`);
    const raw = input?.value.trim() ?? fallback;
    const automatic = input?.dataset.autoDirectory?.trim() ?? "";
    return !fallback.trim() && automatic && raw.toLowerCase() === automatic.toLowerCase()
      ? ""
      : raw;
  };
  const checked = (id: string, fallback: boolean) =>
    document.querySelector<HTMLInputElement>(`#${id}`)?.checked ?? fallback;
  const h3PromptPresets = {
    ...base.h3PromptPresets,
    [settingsH3PromptPreset]: value(
      "h3-prompt-preset-text",
      base.h3PromptPresets[settingsH3PromptPreset]
    )
  };
  const imagePromptPresets = {
    ...base.imagePromptPresets,
    [settingsImagePromptPreset]: value(
      "image-prompt-preset-text",
      base.imagePromptPresets[settingsImagePromptPreset]
    )
  };
  return {
    comfyUrl: value("comfy-url", base.comfyUrl),
    comfyInstallDirectory: value(
      "comfy-install-directory",
      base.comfyInstallDirectory
    ),
    comfyPythonPath: value("comfy-python-path", base.comfyPythonPath),
    lmStudioUrl: value("lm-url", base.lmStudioUrl),
    lmStudioModel: value("lm-model", base.lmStudioModel),
    lmStudioInstallDirectory: value(
      "lm-install-directory",
      base.lmStudioInstallDirectory
    ),
    promptRuntime: "comfyui",
    promptUseLmStudio: false,
    promptModelId: value("prompt-model-id", base.promptModelId),
    promptModelDirectory: value("prompt-model-directory", base.promptModelDirectory),
    promptLlamaServerPath: value("prompt-llama-server-path", base.promptLlamaServerPath),
    promptLlamaPort: base.promptLlamaPort,
    h3PromptPresets,
    imagePromptPresets,
    modelDirectory: value("model-directory", base.modelDirectory),
    outputDirectory: directoryValue("output-directory", base.outputDirectory),
    imageOutputDirectory: directoryValue("image-output-directory", base.imageOutputDirectory),
    imageInputLibraryDirectory: directoryValue("image-input-library-directory", base.imageInputLibraryDirectory),
    defaultVideoModel: value("default-video-model", base.defaultVideoModel),
    defaultImageModel: value("default-image-model", base.defaultImageModel),
    defaultImageQualityProfile: value("image-quality-profile", base.defaultImageQualityProfile),
    imageOutputCount: Math.min(10, Math.max(1, Number(value("image-output-count-number", String(base.imageOutputCount))))),
    imageOutputFormat: "png",
    vramReserveGb: Number(value("vram-reserve", String(base.vramReserveGb))),
    h3AttentionMode: value(
      "h3-attention-mode",
      base.h3AttentionMode
    ) as Settings["h3AttentionMode"],
    autoOffload: checked("auto-offload", base.autoOffload),
    ltxExtensionModelProfile: value(
      "ltx-extension-model-profile",
      base.ltxExtensionModelProfile
    ) as Settings["ltxExtensionModelProfile"],
    ltxExtensionResolution: Number(value("ltx-extension-resolution", String(base.ltxExtensionResolution))) as Settings["ltxExtensionResolution"],
    ltxExtensionFrames: Number(value("ltx-extension-frames", String(base.ltxExtensionFrames))) as Settings["ltxExtensionFrames"],
    ltxExtensionOverlapFrames: 16,
    ltxExtensionUnloadBetweenStages: true,
    ltxExtensionTimeoutMinutes: Number(value("ltx-extension-timeout", String(base.ltxExtensionTimeoutMinutes))) as Settings["ltxExtensionTimeoutMinutes"],
    safeCancel: checked("safe-cancel", base.safeCancel),
    autoRetryFailedTasks: checked("auto-retry-failed-tasks", base.autoRetryFailedTasks),
    autoRetryCount: Number(value("auto-retry-count", String(base.autoRetryCount))) as Settings["autoRetryCount"],
    uiLocale: base.uiLocale,
    promptLanguage: value("prompt-language", base.promptLanguage) as Settings["promptLanguage"],
    promptCreativity: Number(value("prompt-creativity", String(base.promptCreativity))),
    defaultUpscaleModel: value("default-upscale-model", base.defaultUpscaleModel),
    upscaleTileMode: value("upscale-tile-mode", base.upscaleTileMode) as Settings["upscaleTileMode"],
    upscaleFaceRestore: checked("upscale-face-restore", base.upscaleFaceRestore),
    seedVr2Model: value("seedvr2-model", base.seedVr2Model),
    realEsrganModel: value("realesrgan-model", base.realEsrganModel),
    proxyEnabled: checked("proxy-enabled", base.proxyEnabled),
    proxyUrl: value("proxy-url", base.proxyUrl)
  };
}

function directoryComparisonKey(value: string): string {
  return value.trim().replace(/[\\/]+$/u, "").toLowerCase();
}

async function saveSettingsFromUi(
  nextSettings: Settings,
  mode: SettingsSaveMode = "apply"
): Promise<void> {
  const previousSettings = state.settings;
  const previousProfile = previousSettings.ltxExtensionModelProfile;
  const imageModelChanged = previousSettings.defaultImageModel !== nextSettings.defaultImageModel;
  const pathsChanged = previousSettings.comfyInstallDirectory !== nextSettings.comfyInstallDirectory ||
    previousSettings.comfyPythonPath !== nextSettings.comfyPythonPath ||
    previousSettings.modelDirectory !== nextSettings.modelDirectory ||
    previousSettings.outputDirectory !== nextSettings.outputDirectory ||
    previousSettings.imageOutputDirectory !== nextSettings.imageOutputDirectory ||
    previousSettings.imageInputLibraryDirectory !== nextSettings.imageInputLibraryDirectory ||
    previousSettings.lmStudioInstallDirectory !== nextSettings.lmStudioInstallDirectory ||
    previousSettings.promptModelDirectory !== nextSettings.promptModelDirectory ||
    previousSettings.promptLlamaServerPath !== nextSettings.promptLlamaServerPath;
  const proxyChanged = previousSettings.proxyEnabled !== nextSettings.proxyEnabled ||
    previousSettings.proxyUrl !== nextSettings.proxyUrl;
  state = await window.studio.saveSettings(nextSettings, mode);
  settingsDraft = null;
  if (imageModelChanged && state.imageDraft.modelId === previousSettings.defaultImageModel) {
    const capability = imageModelCapabilityFor(nextSettings.defaultImageModel);
    const qualityProfile = capability.qualityProfiles.some(
      (profile) => profile.id === state.imageDraft.qualityProfile
    )
      ? state.imageDraft.qualityProfile
      : capability.qualityProfiles[0]?.id ?? "native";
    state = await window.studio.saveImageDraft({
      ...state.imageDraft,
      modelId: nextSettings.defaultImageModel,
      qualityProfile
    });
  }
  if (state.settings.ltxExtensionModelProfile !== previousProfile) {
    delete bundledWorkflows[bundledWorkflowKey("sulphur2", "image")];
    delete bundledWorkflows[bundledWorkflowKey("sulphur2", "video")];
    if (state.draft.modelId === "sulphur2") {
      const bundled = await window.studio.getBundledWorkflow(
        "sulphur2",
        state.draft.inputMode
      );
      if (bundled) {
        bundledWorkflows[
          bundledWorkflowKey("sulphur2", state.draft.inputMode)
        ] = bundled;
        state = await window.studio.saveDraft({
          ...state.draft,
          workflowPath: bundled.path
        });
      }
    }
  }
  if (pathsChanged || state.settings.ltxExtensionModelProfile !== previousProfile) {
    await runEnvironmentScan(state.settings);
  }
  showMessage(proxyChanged
    ? "设置已保存。代理已用于后续安装；请重启 ComfyUI，让 SeedVR2 等节点的运行时下载继承新代理。"
    : mode === "migrate-video-history"
      ? "设置已保存，历史视频迁移完成。"
      : "设置已保存，将对下一项尚未开始的任务生效。");
}

async function runEnvironmentScan(settings: Settings): Promise<void> {
  reportUserAction("scan-environment");
  environmentScanning = true;
  environmentScanError = "";
  render();
  try {
    environmentScan = await window.studio.scanEnvironment(settings);
    enableSpectrumByDefaultIfAvailable();
  } catch (error) {
    environmentScanError = `环境扫描失败：${error instanceof Error ? error.message : String(error)}`;
    showMessage(environmentScanError);
  } finally {
    environmentScanning = false;
    render();
  }
}

async function loadAppLogs(): Promise<void> {
  if (appLogsLoading) return;
  appLogScreenClearedAt = null;
  appLogsLoading = true;
  appLogsError = "";
  render();
  try {
    applyAppLogSnapshot(await window.studio.readAppLogs(500));
  } catch (error) {
    appLogsError = error instanceof Error ? error.message : String(error);
  } finally {
    appLogsLoading = false;
    render();
  }
}

function bindSettings(): void {
  if (settingsTab === "logs" && !appLogs && !appLogsLoading) {
    void loadAppLogs();
  }
  if (settingsTab !== "logs" && !environmentScan && !environmentScanning) {
    void runEnvironmentScan(settingsDraft ?? state.settings);
    return;
  }
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(".settings-content input, .settings-content textarea, .settings-content select").forEach((input) => {
    const update = () => {
      settingsDraft = formSettings();
      syncSettingsDirtyUi();
    };
    input.addEventListener("input", update);
    input.addEventListener("change", update);
  });
  const imageCountRange = document.querySelector<HTMLInputElement>("#image-output-count");
  const imageCountNumber = document.querySelector<HTMLInputElement>("#image-output-count-number");
  const syncImageCount = (value: string) => {
    const count = Math.min(10, Math.max(1, Number(value) || 1));
    if (imageCountRange) imageCountRange.value = String(count);
    if (imageCountNumber) imageCountNumber.value = String(count);
    settingsDraft = formSettings();
    syncSettingsDirtyUi();
  };
  imageCountRange?.addEventListener("input", () => syncImageCount(imageCountRange.value));
  imageCountNumber?.addEventListener("input", () => syncImageCount(imageCountNumber.value));
  document.querySelector("#prompt-model-id")?.addEventListener("change", (event) => {
    const modelId = (event.currentTarget as HTMLSelectElement).value;
    if (isManagedPromptModel(modelId)) {
      settingsDraft = formSettings();
      showMessage("该 Gemma GGUF 由当前 ComfyUI 的 H3 Prompt Writer 运行，扩写完成后会自动卸载。");
    }
  });
  document.querySelector("#default-image-model")?.addEventListener("change", () => {
    const settings = formSettings();
    const capability = imageModelCapabilityFor(settings.defaultImageModel);
    const qualityProfile = capability.qualityProfiles.some(
      (profile) => profile.id === settings.defaultImageQualityProfile
    )
      ? settings.defaultImageQualityProfile
      : capability.qualityProfiles[0]?.id ?? "native";
    settingsDraft = { ...settings, defaultImageQualityProfile: qualityProfile };
    render();
  });
  document.querySelector("#release-prompt-model")?.addEventListener("click", () => {
    void togglePromptModelFromUi();
  });
  document.querySelector("#h3-prompt-preset-setting")?.addEventListener("change", (event) => {
    settingsDraft = formSettings();
    settingsH3PromptPreset = (event.currentTarget as HTMLSelectElement).value as H3PromptPreset;
    render();
  });
  document.querySelector("#image-prompt-preset-setting")?.addEventListener("change", (event) => {
    settingsDraft = formSettings();
    settingsImagePromptPreset = (event.currentTarget as HTMLSelectElement).value as ImagePromptPreset;
    render();
  });
  document.querySelector("#restore-h3-prompt-presets")?.addEventListener("click", () => {
    settingsDraft = {
      ...formSettings(),
      h3PromptPresets: createDefaultH3PromptPresets()
    };
    render();
    showMessage("扩写预设已恢复默认，请保存设置后生效。");
  });
  document.querySelector("#restore-image-prompt-presets")?.addEventListener("click", () => {
    settingsDraft = {
      ...formSettings(),
      imagePromptPresets: createDefaultImagePromptPresets()
    };
    render();
    showMessage("图片提示词预设已恢复默认，请保存设置后生效。");
  });
  document.querySelector<HTMLInputElement>("#proxy-enabled")?.addEventListener("change", () => {
    settingsDraft = formSettings();
    render();
  });
  document.querySelector<HTMLInputElement>("#auto-retry-failed-tasks")?.addEventListener("change", () => {
    settingsDraft = formSettings();
    render();
  });
  document.querySelector<HTMLButtonElement>("#discard-settings")?.addEventListener("click", () => {
    if (!settingsHaveUnsavedChanges()) return;
    settingsDraft = null;
    void window.studio.setSettingsDirty(false).catch(() => undefined);
    render();
  });
  document.querySelectorAll<HTMLElement>("[data-settings-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      settingsDraft = formSettings();
      settingsTab = button.dataset.settingsTab as typeof settingsTab;
      reportUserAction("settings-tab", { tab: settingsTab });
      render();
    });
  });
  document.querySelector<HTMLSelectElement>("#comfy-python-candidate")?.addEventListener("change", (event) => {
    const selectedPath = (event.currentTarget as HTMLSelectElement).value;
    if (!selectedPath) return;
    const input = document.querySelector<HTMLInputElement>("#comfy-python-path");
    if (!input) return;
    input.value = selectedPath;
    settingsDraft = formSettings();
    reportUserAction("select-comfy-python", { source: "scan-candidate" });
    void runEnvironmentScan(settingsDraft);
  });
  document.querySelector<HTMLButtonElement>("#pick-comfy-python")?.addEventListener("click", async () => {
    const selectedPath = await window.studio.pickPython();
    const input = document.querySelector<HTMLInputElement>("#comfy-python-path");
    if (!selectedPath || !input) return;
    input.value = selectedPath;
    settingsDraft = formSettings();
    reportUserAction("select-comfy-python", { source: "file-picker" });
    await runEnvironmentScan(settingsDraft);
  });
  document.querySelector<HTMLButtonElement>("#refresh-app-logs")?.addEventListener("click", () => {
    void loadAppLogs();
  });
  const openLogDirectory = async (
    kind: "logs" | "crashDumps",
    action: string,
    failureMessage: string
  ) => {
    reportUserAction(action);
    const opened = await window.studio.openAppLogDirectory(kind);
    if (!opened) showMessage(failureMessage);
  };
  document.querySelector<HTMLButtonElement>("#open-app-log-directory")?.addEventListener("click", () => {
    void openLogDirectory("logs", "open-log-directory", "日志目录无法打开。");
  });
  document.querySelector<HTMLButtonElement>("#open-app-crash-directory")?.addEventListener("click", () => {
    void openLogDirectory("crashDumps", "open-crash-directory", "崩溃转储目录无法打开。");
  });
  const terminal = document.querySelector<HTMLPreElement>("#app-log-terminal");
  if (terminal) {
    terminal.scrollTop = terminal.scrollHeight;
    terminal.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      openAppLogContextMenu(event.clientX, event.clientY);
    });
    terminal.addEventListener("scroll", () => {
      appLogFollowTail = terminal.scrollHeight - terminal.scrollTop - terminal.clientHeight < 48;
    });
  }
  document.querySelectorAll<HTMLButtonElement>("[data-install-profile]").forEach((button) => {
    button.addEventListener("click", () => {
      rememberModalFocus();
      settingsDraft = formSettings();
      const profile = environmentScan?.modelProfiles.find(
        (item) => item.id === button.dataset.installProfile
      );
      const component = profile?.components[Number(button.dataset.installComponent)];
      if (!profile || !component) return;
      selectedInstallGuide = { profileName: profile.name, component };
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-start-service]").forEach((button) => {
    button.addEventListener("click", async () => {
      const kind = button.dataset.startService as LocalServiceKind;
      settingsDraft = formSettings();
      serviceStarting = kind;
      serviceStatusMessage = kind === "comfy"
        ? "正在启动 ComfyUI 后端并检测接口，首次加载节点可能需要 1–2 分钟…"
        : "正在启动 LM Studio…";
      render();
      try {
        const result = await window.studio.startLocalService(kind, settingsDraft);
        serviceStarting = null;
        serviceStatusMessage = result.message;
        environmentScan = await window.studio.scanEnvironment(settingsDraft);
        showMessage(result.message);
      } catch (error) {
        serviceStarting = null;
        serviceStatusMessage = `启动失败：${error instanceof Error ? error.message : String(error)}`;
        showMessage(serviceStatusMessage);
      }
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-restart-service]").forEach((button) => {
    button.addEventListener("click", async () => {
      const kind = button.dataset.restartService as LocalServiceKind;
      settingsDraft = formSettings();
      serviceRestarting = kind;
      serviceStatusMessage = "正在停止并重新启动 ComfyUI，节点加载期间会持续检测，最多等待 2 分钟…";
      render();
      try {
        const result = await window.studio.restartLocalService(kind, settingsDraft);
        serviceRestarting = null;
        serviceStatusMessage = result.message;
        environmentScan = await window.studio.scanEnvironment(settingsDraft);
        showMessage(result.message);
      } catch (error) {
        serviceRestarting = null;
        serviceStatusMessage = `重启失败：${error instanceof Error ? error.message : String(error)}`;
        showMessage(serviceStatusMessage);
      }
      render();
    });
  });
  document.querySelector<HTMLButtonElement>("#force-stop-comfy")?.addEventListener("click", () => {
    rememberModalFocus();
    settingsDraft = formSettings();
    pendingConfirmation = { kind: "force-stop-comfy" };
    confirmationBusy = false;
    render();
  });
  document.querySelector<HTMLButtonElement>("#update-comfyui")?.addEventListener("click", async () => {
    const currentSettings = formSettings();
    settingsDraft = currentSettings;
    comfyUpdating = true;
    comfyUpdateLog = "";
    render();
    try {
      const result = await window.studio.updateComfyUi(currentSettings);
      comfyUpdateLog = result.log || result.message;
      showMessage(result.message);
      if (result.ok && environmentScan?.comfyCompatibility.updateMode === "git") {
        serviceStatusMessage = "更新完成。重启 ComfyUI 后会重新检测 H3 核心节点。";
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      comfyUpdateLog = message;
      showMessage(`ComfyUI 更新失败：${message}`);
    } finally {
      comfyUpdating = false;
      render();
    }
  });
  document.querySelector<HTMLButtonElement>("#install-attention-acceleration")?.addEventListener("click", async () => {
    const currentSettings = formSettings();
    settingsDraft = currentSettings;
    attentionAccelerationInstalling = true;
    attentionAccelerationLog = "";
    render();
    try {
      const result = await window.studio.installAttentionAcceleration(currentSettings);
      attentionAccelerationLog = result.log || attentionAccelerationLog || result.message;
      environmentScan = await window.studio.scanEnvironment(currentSettings);
      showMessage(result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      attentionAccelerationLog = [attentionAccelerationLog, message].filter(Boolean).join("\n");
      showMessage(`推理加速环境安装失败：${message}`);
    } finally {
      attentionAccelerationInstalling = false;
      render();
    }
  });
  document.querySelector<HTMLButtonElement>("#repair-h3-core")?.addEventListener("click", async () => {
    const currentSettings = formSettings();
    settingsDraft = currentSettings;
    coreDependencyRepairing = true;
    comfyUpdateLog = "";
    render();
    try {
      if (!environmentScan?.comfyCompatibility.checkedFrom) {
        const started = await window.studio.startLocalService("comfy", currentSettings);
        comfyUpdateLog = started.message;
        environmentScan = await window.studio.scanEnvironment(currentSettings);
        if (environmentScan.comfyCompatibility.h3CoreSupported) {
          showMessage("ComfyUI 已启动，MiniMax H3 I2V 核心节点已加载。");
          return;
        }
      }
      const updateMode = environmentScan?.comfyCompatibility.updateMode;
      const result = await window.studio.updateComfyUi(currentSettings);
      comfyUpdateLog = [comfyUpdateLog, result.log || result.message]
        .filter(Boolean)
        .join("\n\n");
      if (!result.ok) throw new Error(result.message);
      if (updateMode === "git") {
        const restarted = await window.studio.restartLocalService("comfy", currentSettings);
        comfyUpdateLog += `\n\n${restarted.message}`;
        environmentScan = await window.studio.scanEnvironment(currentSettings);
      }
      showMessage(result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      comfyUpdateLog = [comfyUpdateLog, message].filter(Boolean).join("\n\n");
      showMessage(`核心节点处理失败：${message}`);
    } finally {
      coreDependencyRepairing = false;
      render();
    }
  });
  document.querySelectorAll<HTMLButtonElement>("[data-repair-issue]").forEach((button) => {
    button.addEventListener("click", async () => {
      const issueId = button.dataset.repairIssue as NonNullable<EnvironmentScanResult["issues"]>[number]["id"];
      const currentSettings = formSettings();
      settingsDraft = currentSettings;
      environmentRepairing = issueId;
      render();
      try {
        const result = await window.studio.repairEnvironmentIssue(issueId, currentSettings);
        environmentRepairLogs = {
          ...environmentRepairLogs,
          [issueId]: result.log || result.message
        };
        environmentRepairing = "";
        environmentScan = await window.studio.scanEnvironment(currentSettings);
        showMessage(result.message);
      } catch (error) {
        environmentRepairing = "";
        const message = error instanceof Error ? error.message : String(error);
        environmentRepairLogs = { ...environmentRepairLogs, [issueId]: message };
        showMessage(`自动修复失败：${message}`);
      }
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-install-node]").forEach((button) => {
    button.addEventListener("click", async () => {
      const nodeId = button.dataset.installNode!;
      if (state.queue.some((task) => task.status === "running")) {
        showMessage("当前有视频任务正在运行，请等待完成后再安装或更新节点。");
        return;
      }
      const currentSettings = formSettings();
      settingsDraft = currentSettings;
      customNodeInstalling = nodeId;
      render();
      try {
        const result = await window.studio.installCustomNode(nodeId, currentSettings);
        if (!result.ok) throw new Error(result.message);
        customNodeLogs = {
          ...customNodeLogs,
          [nodeId]: result.log || result.message
        };
        const restarted = await window.studio.restartLocalService(
          "comfy",
          currentSettings
        );
        customNodeLogs = {
          ...customNodeLogs,
          [nodeId]: [
            customNodeLogs[nodeId],
            `ComfyUI 重启：${restarted.message}`
          ].filter(Boolean).join("\n\n")
        };
        if (!restarted.ok) {
          throw new Error(`节点文件已安装/更新，但 ComfyUI 自动重启失败：${restarted.message}`);
        }
        const message = `${result.message} ComfyUI 已重启并完成复检。`;
        environmentScan = await window.studio.scanEnvironment(currentSettings);
        if (!environmentScan.customNodes.find((node) => node.id === nodeId)?.loaded) {
          throw new Error("ComfyUI 已重启，但节点必需模块仍未全部注册；请展开安装日志检查导入错误。");
        }
        showMessage(message);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        customNodeLogs = {
          ...customNodeLogs,
          [nodeId]: [customNodeLogs[nodeId], message].filter(Boolean).join("\n\n")
        };
        showMessage(`节点安装失败：${message}`);
      } finally {
        customNodeInstalling = "";
        render();
      }
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-install-workflow]").forEach((button) => {
    button.addEventListener("click", async () => {
      const workflowId = button.dataset.installWorkflow as "minimax_h3_i2v";
      const currentSettings = formSettings();
      settingsDraft = currentSettings;
      workflowDependencyInstalling = workflowId;
      render();
      try {
        const result = await window.studio.installWorkflowDependency(
          workflowId,
          currentSettings
        );
        workflowDependencyLogs = {
          ...workflowDependencyLogs,
          [workflowId]: result.log || result.message
        };
        if (!result.ok) throw new Error(result.message);
        environmentScan = await window.studio.scanEnvironment(currentSettings);
        showMessage(result.message);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        workflowDependencyLogs = {
          ...workflowDependencyLogs,
          [workflowId]: workflowDependencyLogs[workflowId] || message
        };
        showMessage(`工作流安装失败：${message}`);
      } finally {
        workflowDependencyInstalling = "";
        render();
      }
    });
  });
  const closeInstallGuide = () => {
    selectedInstallGuide = null;
    render();
    restoreModalFocus();
  };
  document.querySelector("#close-install-guide")?.addEventListener("click", closeInstallGuide);
  document.querySelector("#dismiss-install-guide")?.addEventListener("click", closeInstallGuide);
  document.querySelector("#install-guide-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeInstallGuide();
  });
  const installGuide = document.querySelector<HTMLElement>(".install-guide-dialog");
  if (installGuide) bindModalFocus(installGuide, closeInstallGuide, "#dismiss-install-guide");
  document.querySelector("#open-install-download")?.addEventListener("click", async () => {
    if (!selectedInstallGuide) return;
    const opened = await window.studio.openExternal(
      selectedInstallGuide.component.installGuide.downloadUrl
    );
    if (!opened) showMessage("下载页面无法打开，请检查链接或系统浏览器设置。");
  });
  document.querySelector("#scan-environment")?.addEventListener("click", () => {
    settingsDraft = formSettings();
    void runEnvironmentScan(settingsDraft);
  });
  document.querySelector("#save-settings")?.addEventListener("click", async () => {
    const previousSettings = state.settings;
    const nextSettings = formSettings();
    const oldDirectory = previousSettings.outputDirectory || environmentScan?.outputDirectory || "";
    const newDirectory = nextSettings.outputDirectory || environmentScan?.outputDirectory || "";
    const directoryChanged = directoryComparisonKey(oldDirectory) !== directoryComparisonKey(newDirectory);
    if (directoryChanged) {
      rememberModalFocus();
      pendingDirectoryMigration = {
        target: "video",
        previousSettings,
        nextSettings,
        oldDirectory,
        newDirectory
      };
      directoryMigrationBusy = false;
      historyMigrationProgress = null;
      render();
      return;
    }
    try {
      await saveSettingsFromUi(nextSettings);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), false);
    }
  });
  document.querySelectorAll<HTMLElement>("[data-test]").forEach((button) => {
    button.addEventListener("click", async () => {
      reportUserAction("connection-test", { kind: button.dataset.test });
      const resultElement = document.querySelector("#connection-result")!;
      resultElement.textContent = "正在连接…";
      const result = await window.studio.testConnection(
        "comfy",
        formSettings()
      );
      resultElement.className = `connection-result ${result.ok ? "success" : "error"}`;
      resultElement.textContent = result.message;
    });
  });
  document.querySelector("#use-scanned-comfy")?.addEventListener("click", async () => {
    if (!environmentScan?.comfyRoot) return;
    const nextSettings = {
      ...formSettings(),
      comfyInstallDirectory:
        environmentScan.comfyInstallDirectory || formSettings().comfyInstallDirectory,
      modelDirectory: environmentScan.modelDirectory,
      outputDirectory: environmentScan.outputDirectory
    };
    state = await window.studio.saveSettings(nextSettings);
    settingsDraft = null;
    showMessage("已采用扫描到的 ComfyUI 模型和输出目录。");
  });
  document.querySelector("#pick-comfy-install-directory")?.addEventListener("click", async () => {
    const input = document.querySelector<HTMLInputElement>("#comfy-install-directory");
    const directory = await window.studio.pickDirectory();
    if (!directory || !input) return;
    input.value = directory;
    settingsDraft = formSettings();
    await runEnvironmentScan(settingsDraft);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-select-comfy-install]").forEach((button) => {
    button.addEventListener("click", async () => {
      const directory = button.dataset.selectComfyInstall;
      const input = document.querySelector<HTMLInputElement>("#comfy-install-directory");
      if (!directory || !input) return;
      input.value = directory;
      settingsDraft = formSettings();
      await runEnvironmentScan(settingsDraft);
    });
  });
  document.querySelector("#pick-model-directory")?.addEventListener("click", async () => {
    const directory = await window.studio.pickDirectory();
    const input = document.querySelector<HTMLInputElement>("#model-directory");
    if (directory && input) {
      input.value = directory;
      settingsDraft = formSettings();
      void runEnvironmentScan(settingsDraft);
    }
  });
  document.querySelector("#pick-output-directory")?.addEventListener("click", async () => {
    const input = document.querySelector<HTMLInputElement>("#output-directory");
    const directory = await window.studio.pickDirectory(input?.value, true);
    if (directory && input) {
      input.value = directory;
      settingsDraft = formSettings();
      void runEnvironmentScan(settingsDraft);
    }
  });
  document.querySelector("#pick-image-output-directory")?.addEventListener("click", async () => {
    const input = document.querySelector<HTMLInputElement>("#image-output-directory");
    const directory = await window.studio.pickDirectory(input?.value, true);
    if (!directory || !input) return;
    input.value = directory;
    settingsDraft = formSettings();
    syncSettingsDirtyUi();
  });
  document.querySelector("#pick-image-input-library-directory")?.addEventListener("click", async () => {
    const input = document.querySelector<HTMLInputElement>("#image-input-library-directory");
    const directory = await window.studio.pickDirectory(input?.value, true);
    if (!directory || !input) return;
    input.value = directory;
    settingsDraft = formSettings();
    syncSettingsDirtyUi();
  });
  document.querySelector("#open-image-asset-library")?.addEventListener("click", () => {
    if (settingsHaveUnsavedChanges()) {
      showMessage("请先保存素材库目录设置，再开始整理。", false);
      return;
    }
    rememberModalFocus();
    imageAssetLibraryDialog = { scan: null, busy: false, error: "", confirmCleanup: false, selectedPaths: [], lastResult: null };
    render();
    void scanImageAssets();
  });
  document.querySelector("[data-pick-prompt-model-directory]")?.addEventListener("click", async () => {
    const directory = await window.studio.pickDirectory();
    const input = document.querySelector<HTMLInputElement>("#prompt-model-directory");
    if (!directory || !input) return;
    input.value = directory;
    settingsDraft = formSettings();
    void runEnvironmentScan(settingsDraft);
  });
  document.querySelectorAll<HTMLElement>("[data-pick-lm-install]").forEach((button) => {
    button.addEventListener("click", async () => {
      const directory = await window.studio.pickDirectory();
      if (!directory) return;
      const input = document.querySelector<HTMLInputElement>("#lm-install-directory");
      if (input) input.value = directory;
      state = await window.studio.saveSettings({
        ...formSettings(),
        lmStudioInstallDirectory: directory
      });
      settingsDraft = null;
      await runEnvironmentScan(state.settings);
      showMessage("已保存 LM Studio 安装目录并重新扫描。");
    });
  });
  syncSettingsDirtyUi();
}

window.studio.onWindowCloseRequest((request) => {
  rememberModalFocus();
  pendingWindowCloseRequest = request;
  windowCloseResponseBusy = false;
  render();
});

window.studio.onStateChanged((nextState) => {
  const previousHistory = state?.history;
  const historyChanged = historyStateChanged(previousHistory, nextState.history);
  const previousImageHistory = state?.imageHistory;
  const imageHistoryChanged = imageHistoryStateChanged(previousImageHistory, nextState.imageHistory);
  const localDraft = state?.draft;
  state = {
    ...nextState,
    draft:
      localDraft && (draftDirty || draftSaveInFlight > 0)
        ? localDraft
        : nextState.draft
  };
  if (nextState.queueRunning) {
    promptRuntimeLoaded = false;
  }
  const activeElement = document.activeElement;
  const isEditing =
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement instanceof HTMLSelectElement;
  if (isEditing || draftSaveInFlight > 0) return;
  const visibleHistoryChanged = historyKind === "image" ? imageHistoryChanged : historyChanged;
  if ((page === "history" || page === "history-detail" || page === "image-history-detail") && !visibleHistoryChanged) return;
  render();
});

window.studio.onHistoryMigrationProgress((progress) => {
  historyMigrationProgress = progress;
  if (pendingDirectoryMigration) render();
});

window.studio.onImageAssetLibraryProgress((progress) => {
  imageAssetLibraryProgress = progress;
  const message = document.querySelector<HTMLElement>("#image-assets-progress-message");
  if (message) message.textContent = progress.message;
  const progressElement = document.querySelector<HTMLElement>("#image-assets-progress");
  if (progressElement) {
    const value = imageAssetProgressPercent(progress, true);
    progressElement.setAttribute("aria-valuenow", String(value));
    progressElement.querySelector<HTMLElement>("span")?.style.setProperty("width", `${value}%`);
  }
  const phase = document.querySelector<HTMLElement>("#image-assets-progress-phase");
  if (phase) phase.textContent = imageAssetPhaseLabel(progress.phase);
  const count = document.querySelector<HTMLElement>("#image-assets-progress-count");
  if (count) count.textContent = progress.total ? `${progress.current} / ${progress.total}` : "准备中";
});

window.studio.onTaskPreview((preview) => {
  taskPreviews[preview.taskId] = preview.dataUrl;
  const running = state.queue.find((task) => task.status === "running");
  if (page !== "queue" || running?.id !== preview.taskId) return;
  const image = document.querySelector<HTMLImageElement>("#live-preview-image");
  const empty = document.querySelector<HTMLElement>("#live-preview-empty");
  if (image) {
    image.src = preview.dataUrl;
    image.style.display = "";
  }
  document.querySelector<HTMLVideoElement>("[data-queue-input-video]")?.style.setProperty(
    "display",
    "none"
  );
  if (empty) empty.style.display = "none";
});

window.studio.onAttentionInstallLog((message) => {
  attentionAccelerationLog = [attentionAccelerationLog, message]
    .filter(Boolean)
    .join("\n")
    .slice(-40_000);
  const logElement = document.querySelector<HTMLElement>("#attention-install-log");
  if (logElement) {
    logElement.textContent = attentionAccelerationLog;
    logElement.scrollTop = logElement.scrollHeight;
  }
});

window.addEventListener("error", (event) => {
  void window.studio.reportRendererError(
    event.message || "Renderer error",
    {
      source: event.filename,
      line: event.lineno,
      column: event.colno
    }
  ).catch(() => undefined);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason instanceof Error
    ? event.reason.message
    : String(event.reason ?? "Unhandled promise rejection");
  void window.studio.reportRendererError(reason).catch(() => undefined);
});

function setMetric(
  id: string,
  value: number | null,
  detail = ""
): void {
  const available = value != null && Number.isFinite(value);
  const label = document.querySelector<HTMLElement>(`#${id}`);
  const detailElement = document.querySelector<HTMLElement>(`#${id}-detail`);
  const bar = document.querySelector<HTMLElement>(`#${id}-bar`);
  if (label) label.textContent = available ? `${Math.round(value)}%` : "—";
  if (detailElement) detailElement.textContent = detail;
  if (bar) bar.style.width = `${available ? Math.max(0, Math.min(100, value)) : 0}%`;
}

async function refreshPerformanceMetrics(): Promise<void> {
  if (performancePolling) return;
  performancePolling = true;
  try {
    performanceMetrics = await window.studio.getPerformanceMetrics(state.settings);
    if (page !== "queue") return;
    setMetric("metric-cpu", performanceMetrics.cpuPercent);
    setMetric(
      "metric-memory",
      performanceMetrics.memoryTotalBytes > 0
        ? performanceMetrics.memoryUsedBytes / performanceMetrics.memoryTotalBytes * 100
        : null,
      performanceMetrics.memoryTotalBytes > 0
        ? `${formatBytes(performanceMetrics.memoryUsedBytes)} / ${formatBytes(performanceMetrics.memoryTotalBytes)}`
        : ""
    );
    setMetric(
      "metric-gpu",
      performanceMetrics.gpuPercent,
      performanceMetrics.gpuTemperature == null
        ? ""
        : `${performanceMetrics.gpuTemperature}°C`
    );
    setMetric(
      "metric-vram",
      performanceMetrics.vramUsedBytes != null && performanceMetrics.vramTotalBytes
        ? performanceMetrics.vramUsedBytes / performanceMetrics.vramTotalBytes * 100
        : null,
      performanceMetrics.vramUsedBytes != null && performanceMetrics.vramTotalBytes != null
        ? `${formatBytes(performanceMetrics.vramUsedBytes)} / ${formatBytes(performanceMetrics.vramTotalBytes)}`
        : ""
    );
  } finally {
    performancePolling = false;
  }
}

window.setInterval(() => {
  void refreshPerformanceMetrics();
  const running = state?.queue.find((task) => task.status === "running");
  const elapsed = document.querySelector<HTMLElement>("#running-elapsed");
  if (elapsed && running) elapsed.textContent = elapsedText(running.startedAt);
  const stageElapsed = document.querySelector<HTMLElement>("#running-stage-elapsed");
  if (stageElapsed && running) stageElapsed.textContent = queueStageElapsedText(running);
  const runningEta = document.querySelector<HTMLElement>("#running-eta");
  if (runningEta && running) runningEta.textContent = `预计剩余 ${queueEstimateText(queueTaskRemainingSeconds(running))}`;
  const activeTasks = state?.queue.filter((task) => task.status === "waiting" || task.status === "running") ?? [];
  const remainingSeconds = queueRemainingSeconds(activeTasks);
  const waitingCount = activeTasks.filter((task) => task.status === "waiting").length;
  const waitingElement = document.querySelector<HTMLElement>("#queue-waiting-count");
  if (waitingElement) waitingElement.textContent = String(waitingCount);
  const etaElement = document.querySelector<HTMLElement>("#queue-eta");
  if (etaElement) etaElement.textContent = queueEstimateText(remainingSeconds);
  const etaNote = document.querySelector<HTMLElement>("#queue-eta-note");
  if (etaNote) etaNote.textContent = remainingSeconds == null ? "完成首条任务后会更准确" : "按历史耗时与当前进度估算";
}, 2_000);

void window.studio.getState().then(async (initialState) => {
  state = initialState;
  appVersion = await window.studio.getAppVersion();
  document.title = `Local Video Studio v${appVersion}`;
  render();
  void refreshPerformanceMetrics();
  void Promise.allSettled([
    window.studio.getBundledWorkflow(
      bundledWorkflowModelId(state.draft),
      state.draft.inputMode
    ),
    window.studio.scanEnvironment(state.settings)
  ]).then(([bundledResult, scanResult]) => {
    if (scanResult.status === "fulfilled") {
      environmentScanError = "";
      environmentScan = scanResult.value;
      enableSpectrumByDefaultIfAvailable();
    } else {
      environmentScanError = `启动时环境扫描失败：${scanResult.reason instanceof Error ? scanResult.reason.message : String(scanResult.reason)}`;
    }
    if (bundledResult.status === "fulfilled" && bundledResult.value) {
      const bundled = bundledResult.value;
      bundledWorkflows[bundledWorkflowKey(bundled.modelId, state.draft.inputMode)] = bundled;
      workflowCapabilities[bundled.path] = {
        supportsEndImage: bundled.supportsEndImage,
        supportsVideoExtension: bundled.supportsVideoExtension
      };
      if (!state.draft.workflowPath) {
        patchDraft({ workflowPath: bundled.path });
      }
    }
    if (bundledResult.status === "rejected") {
      void window.studio.reportRendererError(
        bundledResult.reason instanceof Error
          ? bundledResult.reason.message
          : String(bundledResult.reason),
        { source: "bundled-workflow-load" }
      ).catch(() => undefined);
    }
    render();
  });
});
