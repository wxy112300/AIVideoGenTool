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
  LocalServiceKind,
  ModelComponentStatus,
  ModelScanProfile,
  PerformanceMetrics,
  PromptEnhanceMode,
  PromptVersion,
  QueueTask,
  Settings,
  TaskPerformanceStats,
  WindowCloseRequest,
  WorkflowCapabilities
} from "./types";
import { createClearedDraft } from "./core/defaults";
import { createHistoryCoverCacheKey } from "./core/history-cover";
import { createDefaultH3PromptPresets, h3PromptPresetForMode } from "./core/h3-prompt-presets";
import {
  isUnconcernedPromptModel,
  promptRuntimeForSettings,
  unconcernedPromptModelId
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
  isMiniMaxH3Fl2vaModel,
  isMiniMaxH3Model,
  isMiniMaxH3R2vModel,
  isMiniMaxH3SpectrumEligible,
  isMiniMaxH3TurboModel,
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

type Page = "create" | "queue" | "history" | "history-detail" | "settings";

const appElement = document.querySelector<HTMLDivElement>("#app")!;
let state: AppState;
let appVersion = "";
let page: Page = "create";
let draftSaveTimer: number | undefined;
let draftRevision = 0;
let draftSaveInFlight = 0;
let draftDirty = false;
let flashMessage = "";
let flashMessageTimer: number | undefined;
let selectedHistoryAssetId = "";
let selectedHistoryVersionId = "";
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
let historyViewportEvents: AbortController | null = null;
let historyLayoutAnchor: { assetId: string; offsetFromCenter: number } | null = null;
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
let llamaServerInstalling = false;
let llamaServerInstallLog = "";
let settingsTab: "system" | "acceleration" | "video" | "nodes" | "prompt" | "upscale" | "logs" = "system";
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
  | { kind: "remove-queue-task"; taskId: string; title: string }
  | { kind: "cancel-queue-task"; taskId: string; title: string }
  | { kind: "discard-settings"; nextPage: Page }
  | { kind: "force-stop-comfy" }
  | null = null;
let confirmationBusy = false;
let queueActionBusy: { taskId: string; action: "remove" | "cancel" | "edit" } | null = null;
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
let shellNavigationEvents: AbortController | null = null;
let historyMasonryResizeObserver: ResizeObserver | null = null;
let historyTitleResizeObserver: ResizeObserver | null = null;
let historyMediaObserver: IntersectionObserver | null = null;
let historyCoverWarmupController: AbortController | null = null;
let historyCoverWarmupTimer: number | undefined;
const HISTORY_COVER_MAX_EDGE = 640;
const historyCoverDataUrls = new Map<string, string>();
let promptEnhanceMode: PromptEnhanceMode = "sulphur-native";
let h3PromptPreset: H3PromptPreset = "official-storyboard";
let settingsH3PromptPreset: H3PromptPreset = "official-storyboard";
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
      wan22_dasiwa: "DaSiWa SynthSeduction v9"
      ,seedvr2: "SeedVR2"
      ,flashvsr: "FlashVSR"
      ,realesrgan: "Real-ESRGAN x4plus"
    }[id] ?? id
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
    hasVideoReference
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
    hasVideoReference
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
    resolution: isMiniMaxH3Fl2vaModel(draft.modelId)
      ? draft.resolution
      : settings.ltxExtensionResolution,
    maxGeneratedFrames: isMiniMaxH3Fl2vaModel(draft.modelId)
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
        { id: "minimax_h3_fl2va_turbo", name: "MiniMax H3 LightX2V Turbo · 首尾帧", available: true, integrated: true },
        { id: "minimax_h3_ref2va", name: "MiniMax H3 R2V · 多参考", available: true, integrated: true },
        { id: "minimax_h3_ref2va_int4", name: "MiniMax H3 R2V · 多参考 INT4", available: true, integrated: true },
      { id: "sulphur2", name: "Sulphur 2 GGUF", available: true, integrated: true }
      ];
  return profiles
    .map((profile) => {
      const selected = draft.modelId === profile.id;
      const supportsVideoExtension =
        draft.inputMode === "video" && isMiniMaxH3Fl2vaModel(profile.id)
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
      return `<option value="${escapeHtml(profile.id)}" ${selected ? "selected" : ""} ${unavailable ? "disabled" : ""}>${escapeHtml(profile.name)}${suffix}</option>`;
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
    document.querySelector<HTMLElement>(`.nav-button[data-page="${page === "history-detail" ? "history" : page}"]`)?.focus();
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

function confirmationDialog(): string {
  if (!pendingConfirmation) return "";
  const request = pendingConfirmation;
  const deleting = request.kind === "delete-history";
  const removingQueueTask = request.kind === "remove-queue-task";
  const cancellingQueueTask = request.kind === "cancel-queue-task";
  const discardingSettings = request.kind === "discard-settings";
  const forceStoppingComfy = request.kind === "force-stop-comfy";
  const title = deleting
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
  const description = deleting
    ? "关联的视频文件会从磁盘永久删除，历史记录也会一并移除。"
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
          ${deleting
            ? `<div class="confirm-warning">只删除本条记录关联的视频，不会删除参考图片、工作流或整个输出目录。</div>`
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
          <button class="primary destructive button-with-icon" id="accept-confirmation" ${confirmationBusy ? "disabled" : ""}>${icon(forceStoppingComfy || cancellingQueueTask ? "ban" : discardingSettings ? "rotate-ccw" : "trash-2")}${confirmationBusy ? "处理中…" : forceStoppingComfy ? "强制终止进程" : deleting ? "删除视频和记录" : removingQueueTask ? "移除任务" : cancellingQueueTask ? "取消当前任务" : discardingSettings ? "放弃更改" : "清空草稿"}</button>
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
    <div class="app-shell ${page === "history" || page === "history-detail" ? "history-shell" : ""}">
      <header class="topbar">
        <button class="brand" data-page="create" aria-label="返回创建页">
          <span class="brand-mark">${icon("play")}</span><span>Local Video Studio</span><span class="brand-version">${appVersion ? `v${escapeHtml(appVersion)}` : ""}</span>
        </button>
        <nav aria-label="主导航">
          ${(["create", "queue", "history", "settings"] as Array<Exclude<Page, "history-detail">>)
            .map((item) => {
              const labels = { create: "创建", queue: "队列", history: "历史", settings: "设置" };
              const badge = item === "queue" && state.queue.length
                ? `<span class="badge">${state.queue.length}</span>`
                : "";
              const active =
                page === item || (item === "history" && page === "history-detail");
              return `<button class="nav-button ${active ? "active" : ""}" data-page="${item}">${labels[item]}${badge}</button>`;
            })
            .join("")}
        </nav>
      </header>
      <div class="flash ${flashMessage ? "visible" : ""}" id="app-flash" role="status" aria-live="polite">${escapeHtml(flashMessage)}</div>
      <main>${content}</main>
    </div>
    ${page === "history" || page === "history-detail" ? `<button class="history-back-top" id="history-back-top" type="button" aria-label="返回顶部" title="返回顶部">${icon("arrow-up")}</button>` : ""}
    ${confirmationDialog()}
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
    detail: promptRuntimeForSettings(settings) === "llama-server"
      ? "启动应用自管理 llama-server 提示词模型"
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
      ? promptRuntimeForSettings(settings) === "llama-server"
        ? "停止应用自管理 llama-server 并释放显存"
        : "释放 ComfyUI 提示词模型并回收显存"
      : promptModelStatus(settings).detail;
}

function createPage(): string {
  const draft = state.draft;
  const isMiniMaxH3 = isMiniMaxH3Model(draft.modelId);
  const isR2V = isMiniMaxH3R2vModel(draft.modelId);
  const h3Mode = isMiniMaxH3 ? h3PromptModeForDraft(draft) : undefined;
  const activeH3PromptPreset = h3Mode
    ? h3PromptPresetForMode(h3Mode, h3PromptPreset)
    : h3PromptPreset;
  const promptRuntime = promptRuntimeForSettings(state.settings);
  const enhanceMode = isMiniMaxH3
    ? promptEnhanceMode === "faithful" ? "faithful" : "h3-vision"
    : promptEnhanceMode === "h3-vision" ? "sulphur-native" : promptEnhanceMode;
  const promptStatus = promptModelStatus(state.settings);
  const promptRuntimeBusy = promptStarting || promptEnhancing || promptReleasing;
  const promptAiDisabled = promptRuntimeBusy || state.queueRunning;
  const h3Steps = normalizeH3Steps(draft.steps, draft.modelId);
  const spectrumNode = environmentScan?.customNodes.find(
    (node) => node.id === "spectrum-minimax-h3"
  );
  const spectrumLoaded = Boolean(spectrumNode?.loaded);
  const spectrumEligible = isMiniMaxH3SpectrumEligible(draft.modelId);
  const spectrumReady = draft.spectrumMode !== "balanced" || (
    spectrumEligible && spectrumLoaded
  );
  const detectedVramTotalBytes = environmentScan?.gpus[0]?.vramTotalBytes ?? performanceMetrics?.vramTotalBytes ?? 0;
  const extending = draft.inputMode === "video";
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
  const r2vSlotsReady = !isR2V || (
    draft.h3ReferenceSlots.length > 0 &&
    draft.h3ReferenceSlots.every((slot) => Boolean(slot.mediaPath))
  );
  const turboCoreBlockReason = isMiniMaxH3TurboModel(draft.modelId) &&
    Boolean(environmentScan?.comfyCompatibility.checkedFrom) &&
    !environmentScan?.comfyCompatibility.h3CoreSupported
    ? "LightX2V Turbo 需要 ComfyUI v0.31.0+ 原生音视频采样；请先在设置中更新核心"
    : "";
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
                : !spectrumReady
                  ? "请先在设置中安装并加载 Spectrum 节点"
                  : ""
    : !isR2V && !draft.startImagePath
      ? "请先选择首帧图片"
      : !prompt.text.trim()
        ? "请先填写提示词"
        : turboCoreBlockReason
          ? turboCoreBlockReason
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
          <button class="${extending ? "ghost" : "secondary active"} button-with-icon" data-input-mode="image" aria-pressed="${!extending}">${icon("image")}图片生成</button>
          <button class="${extending ? "secondary active" : "ghost"} button-with-icon" data-input-mode="video" aria-pressed="${extending}">${icon("video")}视频续写</button>
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
          <button class="icon-button prompt-runtime-button ${promptRuntimeBusy ? "busy" : ""}" id="release-prompt-model-create" ${promptRuntimeBusy || state.queueRunning || promptRuntime === "lmstudio" || (!promptRuntimeLoaded && !promptStatus.ready) ? "disabled" : ""} aria-label="${escapeHtml(promptRuntimeControlTitle())}" title="${escapeHtml(promptRuntimeControlTitle())}" aria-busy="${promptRuntimeBusy}">${icon(promptRuntimeControlIcon())}</button>
          <button class="secondary button-with-icon" id="enhance-prompt" ${promptAiDisabled ? "disabled" : ""} title="${promptAiDisabled && state.queueRunning ? "当前有视频任务运行，暂不能启动提示词模型" : promptAiDisabled ? "正在生成提示词" : promptRuntime === "lmstudio" ? "使用 LM Studio 扩写" : promptRuntime === "llama-server" ? "使用应用自管理 Unconcerned 模型扩写" : "使用 ComfyUI 原生 Qwen 模型扩写"}">${icon("sparkles")}${promptEnhancing ? "扩写中…" : isMiniMaxH3 ? "优化 H3 提示词" : "本地扩写"}</button>
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
        <strong>H3 结尾帧接续</strong>
        <span>从保留片段的最后一帧生成新段并保留 H3 原生音轨；它不是 latent overlap 原生续写，边界动作可能发生变化。</span>
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
          <select id="steps" aria-label="H3 采样步数" title="${escapeHtml(isMiniMaxH3TurboModel(draft.modelId) ? "LightX2V Turbo 建议使用 8 步；6 步用于快速预览，4 步可能损失动态和音频质量。" : "只影响 H3；其他模型沿用各自工作流设置。")}">
            ${isMiniMaxH3TurboModel(draft.modelId)
              ? `<option value="4" ${h3Steps === 4 ? "selected" : ""}>4 · 极限加速（实验）</option>
                <option value="6" ${h3Steps === 6 ? "selected" : ""}>6 · 加速预览</option>
                <option value="8" ${h3Steps === 8 || h3Steps > 8 ? "selected" : ""}>8 · 正式输出（推荐）</option>`
              : `<option value="20" ${h3Steps === 20 ? "selected" : ""}>20 · 标准质量（推荐）</option>
                <option value="16" ${h3Steps === 16 ? "selected" : ""}>16 · 平衡预览</option>
                <option value="12" ${h3Steps === 12 ? "selected" : ""}>12 · 快速预览</option>`}
          </select>
        </label>
        <label class="settings-field settings-spectrum">Spectrum 加速
          <select id="spectrum-mode" ${spectrumEligible && spectrumLoaded ? "" : "disabled"} title="${escapeHtml(!spectrumEligible ? "Turbo 低步数下预测收益有限且近似误差占比更高，当前暂不开放。" : !spectrumLoaded ? "请先在设置 → 节点与工作流中安装 Spectrum，并确认 ComfyUI 已重启加载。" : "使用系统内存保存 H3 特征；不会占用额外模型权重。")} ">
            <option value="off" ${draft.spectrumMode !== "balanced" ? "selected" : ""}>关闭 · 原生完整计算</option>
            <option value="balanced" ${draft.spectrumMode === "balanced" ? "selected" : ""}>平衡模式 · 系统内存</option>
          </select>
          <small>${!spectrumEligible ? "Turbo 暂不开放" : spectrumLoaded ? `已加载${spectrumNode?.version ? ` v${escapeHtml(spectrumNode.version)}` : ""} · 预计降低 20–35% 采样耗时` : spectrumNode?.installed ? "节点已安装，等待 ComfyUI 重启加载" : "需要先安装 Spectrum 节点"}</small>
        </label>` : ""}
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
      ${enqueueBlockReason ? `<p class="submit-feedback error" role="status">${escapeHtml(enqueueBlockReason)}</p>` : ""}
      <div class="submit-row composer-submit-row">
        <button class="ghost danger button-with-icon" id="clear-draft">${icon("trash-2")}清空</button>
        <button class="primary button-with-icon" id="enqueue" ${enqueueDisabled ? "disabled" : ""} title="${escapeHtml(enqueueBlockReason || (isR2V ? "加入 R2V 多参考生成队列" : extending ? "加入视频续写队列" : "加入本地生成队列"))}">${icon("plus")}加入队列</button>
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
  const description = task.taskType === "generation"
    ? task.prompt
    : task.taskType === "extension"
      ? `${task.prompt} · 保留 ${task.trimStartSeconds.toFixed(1)}–${task.trimEndSeconds.toFixed(1)} 秒`
      : `${task.sourceFilename} → ${task.outputFilename}`;
  const upscaleOutput = task.taskType === "upscale"
    ? upscaleDimensions(task.sourceWidth, task.sourceHeight, task.targetHeight)
    : null;
  const h3ComputeSummary = task.taskType !== "upscale" && isMiniMaxH3Model(task.modelId)
    ? isMiniMaxH3TurboModel(task.modelId)
      ? `<span title="Turbo 低步数流程暂不开放 Spectrum">${normalizeH3Steps(task.steps, task.modelId)} 步 · Spectrum 不适用</span>`
      : task.spectrumMode === "balanced"
        ? `<span title="Spectrum 已开启；H3 特征历史保存在系统内存">${normalizeH3Steps(task.steps, task.modelId)} 步 · Spectrum 开</span>`
        : `<span title="Spectrum 已关闭；使用 H3 原生完整计算">${normalizeH3Steps(task.steps, task.modelId)} 步 · Spectrum 关</span>`
    : "";
  const seedText = String(task.seed);
  const metadata = task.taskType === "generation"
    ? `<span>${escapeHtml(modelName(task.modelId))}</span><span>${task.resolution}p</span><span>${task.duration}秒</span><span>${frameRateSummary(task.fps, task.frameInterpolation)}</span>${h3ComputeSummary}<span>Seed ${escapeHtml(seedText)}</span>`
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
  if (task.taskType === "upscale" || task.status === "running") return null;
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
    workflowPath: task.workflowPath,
    ratio: task.ratio,
    resolution,
    duration: task.duration,
    steps: normalizeH3Steps(task.steps, task.modelId),
    fps: task.fps,
    frameInterpolation: task.frameInterpolation,
    motion: task.motion,
    seed: task.seed,
    keepSeedOnCopy: task.keepSeedOnCopy
  };
}

async function editQueueTask(taskId: string): Promise<void> {
  const task = state.queue.find((item) => item.id === taskId);
  const draft = task ? draftFromQueueTask(task) : null;
  if (!task || !draft) return;
  queueActionBusy = { taskId, action: "edit" };
  render();
  try {
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

function historyPage(): string {
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
      <article class="history-gallery-item panel" data-history="${asset.id}" data-history-order="${historyOrder}" tabindex="0" aria-label="${escapeHtml(historyTitle)}，打开详情；右键查看更多操作" title="${escapeHtml(historyTitle)}">
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
    <section class="history-heading">
      <div><div class="heading-line"><h1>历史作品</h1><span class="badge">${state.history.length} 个视频</span></div></div>
      <div class="history-view-tools">
        <div class="button-row"><button class="${historyLayout === "masonry" ? "secondary" : "ghost"} button-with-icon" data-history-layout="masonry">${icon("columns-3")}瀑布流</button><button class="${historyLayout === "album" ? "secondary" : "ghost"} button-with-icon" data-history-layout="album">${icon("layout-grid")}相册</button></div>
      </div>
    </section>
    <section class="history-gallery ${historyLayout}">
      ${state.history.length === 0
        ? `<div class="empty panel"><h2>还没有完成的视频</h2><p>队列完成后，结果会自动出现在这里。</p></div>`
        : cards}
    </section>`;
}

function captureHistoryLayoutAnchor(): { assetId: string; offsetFromCenter: number } | null {
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
  const anchor = historyLayoutAnchor;
  historyLayoutAnchor = null;
  if (!anchor?.assetId) return;
  window.requestAnimationFrame(() => {
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

function bindHistoryViewportControls(): void {
  const events = new AbortController();
  historyViewportEvents = events;
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
    reportUserAction("history-scroll-top");
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

function switchHistoryLayout(nextLayout: typeof historyLayout): void {
  if (nextLayout === historyLayout) return;
  reportUserAction("history-layout", { from: historyLayout, to: nextLayout });
  const gallery = document.querySelector<HTMLElement>(".history-gallery");
  if (!gallery) return;
  historyLayoutAnchor = captureHistoryLayoutAnchor();
  historyLayout = nextLayout;
  historyMasonryResizeObserver?.disconnect();
  historyMasonryResizeObserver = null;
  gallery.classList.toggle("masonry", nextLayout === "masonry");
  gallery.classList.toggle("album", nextLayout === "album");
  if (nextLayout === "album") {
    const cards = historyCardsByOrder(gallery);
    gallery.replaceChildren(...cards);
    gallery.style.removeProperty("--masonry-columns");
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
        <dl><dt>模型</dt><dd>${escapeHtml(modelName(version.modelId))}</dd><dt>采样步数</dt><dd>${version.steps ?? "工作流默认"}</dd><dt>计算模式</dt><dd>${version.spectrumMode === "balanced" ? "Spectrum 平衡模式 · 系统内存" : "原生完整计算"}</dd><dt>Seed</dt><dd><code>${version.seed ?? "不适用"}</code></dd><dt>工作流</dt><dd><code>${escapeHtml(version.workflowPath || "旧记录未保存")}</code></dd><dt>ComfyUI Prompt ID</dt><dd><code>${escapeHtml(version.comfyPromptId)}</code></dd></dl>
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

function modelScanCard(profile: ModelScanProfile): string {
  const missingCount = profile.components.filter((component) => !component.found).length;
  const isPromptProfile = profile.category === "prompt";
  const isLlamaProfile = profile.managedBy === "llama-server";
  const readyLabel = isPromptProfile
    ? "文件完整"
    : profile.integrated
      ? "可用"
      : "组件完整";
  const metaLabel = profile.available
    ? isPromptProfile
      ? isLlamaProfile
        ? "GGUF + mmproj 文件完整；由应用自管理 llama-server"
        : "ComfyUI text_encoders 文件完整；可通过原生 TextGenerate 进行本地扩写"
      : profile.integrated
        ? "组件完整，可用于配置"
        : "依赖已完整；生成工作流将在下一阶段接入"
    : isPromptProfile
      ? isLlamaProfile
        ? "补齐 GGUF + mmproj，并配置 llama-server.exe 后才能使用"
        : "补齐对应的 ComfyUI text_encoders 文件后才能接入本地扩写"
      : "补齐所有必需组件后才能启用";
  return `
    <article class="panel model-profile ${profile.available ? "available" : "missing"}">
      <div class="model-profile-head">
        <div>
          <div class="model-title"><h3>${escapeHtml(profile.name)}</h3><span class="model-badge">${escapeHtml(profile.badge)}</span></div>
          <p class="muted">${escapeHtml(profile.description)}</p>
        </div>
        <span class="model-availability ${profile.available ? "available" : "missing"}">${profile.available ? `${icon("circle-check")} ${readyLabel}` : `${icon("circle-alert")} 缺少 ${missingCount} 项`}</span>
      </div>
      <div class="model-meta-line"><span>${escapeHtml(profile.vram)}</span><span>${metaLabel}</span></div>
      <div class="component-list">
        ${profile.components.map((component, componentIndex) => `
          <div class="component-row ${component.found ? "found" : "missing"}">
            <span class="component-state">${icon(component.found ? "circle-check" : "circle-alert")}</span>
            <div><strong>${escapeHtml(component.label)}</strong>
              ${component.found
                ? `<code title="${escapeHtml(component.matches.join("\n"))}">${escapeHtml(component.matches.join(" · "))}</code>`
                : `<span>缺失：${escapeHtml(component.expected)}</span>`}
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
                : !item.ok && item.id === "lmstudio"
                  ? `<button class="service-start secondary button-with-icon" data-pick-lm-install>${icon("folder-open")}选择目录</button>`
                : !item.ok && item.id === "lmstudio-api"
                  ? `<button class="service-start button-with-icon" data-start-service="lmstudio" ${serviceStarting || serviceRestarting || serviceForceStopping ? "disabled" : ""}>${icon("play")}${serviceStarting === "lmstudio" ? "启动中…" : "一键启动"}</button>`
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
    JSON.stringify(settingsDraft) !== JSON.stringify(state.settings);
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
  const promptProfiles = profiles.filter((profile) => profile.category === "prompt");
  const upscaleProfiles = profiles.filter((profile) => profile.category === "upscale");
  const promptStatus = promptModelStatus(settings);
  const promptRuntime = promptRuntimeForSettings(settings);
  const promptRuntimeBusy = promptStarting || promptEnhancing || promptReleasing;
  const llamaServer = environmentScan?.llamaServer;
  const defaultPromptPresets = createDefaultH3PromptPresets();
  const selectedH3PresetText = settings.h3PromptPresets[settingsH3PromptPreset] ??
    defaultPromptPresets[settingsH3PromptPreset];
  const videoAvailable = videoProfiles.filter(
    (profile) => profile.available && profile.integrated
  ).length;
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
  const effectiveModelDirectory =
    settings.modelDirectory || environmentScan?.modelDirectory || "";
  const effectiveOutputDirectory =
    settings.outputDirectory || environmentScan?.outputDirectory || "";

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
        <label>当前安装目录
          <div class="input-action"><input id="comfy-install-directory" value="${escapeHtml(effectiveComfyInstallDirectory)}" placeholder="留空时自动选择扫描结果"><button class="secondary button-with-icon" id="pick-comfy-install-directory">${icon("folder-open")}选择目录</button></div>
        </label>
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
              <div><div class="model-title"><strong>${escapeHtml(typeLabel)}</strong><span class="model-badge">${escapeHtml(version)}</span></div><code title="${escapeHtml(installation.directory)}">${escapeHtml(installation.directory)}</code>${installation.revision ? `<span class="muted">提交 ${escapeHtml(installation.revision)}</span>` : ""}</div>
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
        <div class="section-heading"><div><h2>文件路径</h2><span class="muted">扫描结果可以一键写入，也可以手动定位</span></div></div>
        <div class="settings-grid two">
          <label>ComfyUI 模型目录<div class="input-action"><input id="model-directory" value="${escapeHtml(effectiveModelDirectory)}" placeholder="扫描或选择 models 目录"><button class="secondary button-with-icon" id="pick-model-directory">${icon("folder-open")}选择</button></div></label>
          <label>视频输出目录<div class="input-action"><input id="output-directory" value="${escapeHtml(effectiveOutputDirectory)}" placeholder="扫描或选择 output 目录"><button class="secondary button-with-icon" id="pick-output-directory">${icon("folder-open")}选择</button></div></label>
        </div>
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
          <label class="ios-switch-field"><span class="policy-copy"><strong>安全取消</strong><small>先请求中断，再重启 ComfyUI 释放显存</small></span><input id="safe-cancel" type="checkbox" ${settings.safeCancel ? "checked" : ""}><span class="ios-switch" aria-hidden="true"></span></label>
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
              { id: "minimax_h3_fl2va_turbo", name: "MiniMax H3 LightX2V Turbo · 首尾帧", available: true, integrated: true },
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

  const promptPanel = `
    <section class="settings-panel">
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>本地提示词模型</h2><span class="muted">Qwen3.5 原生模型使用 ComfyUI；Unconcerned GGUF 可由应用自己启动 llama-server，不依赖 LM Studio。</span></div><div class="button-row"><span class="model-badge">${promptRuntime === "lmstudio" ? "LM Studio" : promptRuntime === "llama-server" ? "应用自管理" : "ComfyUI 原生"}</span>${promptRuntime !== "lmstudio" ? `<button class="icon-button prompt-runtime-button ${promptRuntimeBusy ? "busy" : ""}" id="release-prompt-model" ${promptRuntimeBusy || state.queueRunning || (!promptRuntimeLoaded && !promptStatus.ready) ? "disabled" : ""} aria-label="${escapeHtml(promptRuntimeControlTitle(settings))}" title="${escapeHtml(promptRuntimeControlTitle(settings))}" aria-busy="${promptRuntimeBusy}">${icon(promptRuntimeControlIcon())}</button>` : ""}</div></div>
        <label>提示词运行方式<select id="prompt-runtime"><option value="comfyui" ${promptRuntime === "comfyui" ? "selected" : ""}>ComfyUI 原生 TextGenerate</option><option value="llama-server" ${promptRuntime === "llama-server" ? "selected" : ""}>应用自管理 llama-server（Unconcerned）</option><option value="lmstudio" ${promptRuntime === "lmstudio" ? "selected" : ""}>LM Studio 兼容后端</option></select></label>
        <label>默认提示词模型<select id="prompt-model-id">${promptProfiles.map((profile) => `<option value="${escapeHtml(profile.id)}" ${settings.promptModelId === profile.id ? "selected" : ""} ${!profile.available ? "disabled" : ""}>${escapeHtml(profile.name)}${profile.available ? "" : " · 缺组件"}</option>`).join("")}</select></label>
        <div class="settings-grid two">
          <label>应用提示词模型目录<div class="input-action"><input id="prompt-model-directory" value="${escapeHtml(settings.promptModelDirectory)}" placeholder="留空使用 ComfyUI/models/prompt_models"><button class="secondary button-with-icon" data-pick-prompt-model-directory>${icon("folder-open")}选择</button></div><small>放置 Unconcerned GGUF 和 mmproj；也可使用 ComfyUI/models/prompt_models。</small></label>
          <label>llama-server.exe 路径<input id="prompt-llama-server-path" value="${escapeHtml(settings.promptLlamaServerPath)}" placeholder="例如 D:\\AI\\llama.cpp\\llama-server.exe"><small>留空时应用会尝试从 PATH 和模型目录查找。</small></label>
        </div>
        <div class="settings-grid two llama-server-control">
          <div class="settings-status-card ${llamaServer?.found ? "available" : "missing"}">
            <span class="runtime-label">llama-server 自动扫描</span>
            <strong>${llamaServer?.found ? "已找到" : environmentScanning ? "扫描中…" : "未找到"}</strong>
            <code title="${escapeHtml(llamaServer?.path ?? "")}">${escapeHtml(llamaServer?.path || "可扫描 PATH、prompt_models 和应用管理目录")}</code>
          </div>
          <div class="llama-server-actions">
            <button class="secondary button-with-icon" id="install-llama-server" ${llamaServerInstalling ? "disabled" : ""}>${icon(llamaServerInstalling ? "refresh-cw" : "download")}${llamaServerInstalling ? "正在下载并安装…" : llamaServer?.found ? "安装/更新应用版" : "一键安装 llama-server"}</button>
            <small>官方 llama.cpp Windows CUDA 运行包；不会下载或移动模型文件。</small>
          </div>
        </div>
        ${llamaServerInstallLog ? `<details class="node-log" open><summary>llama-server 安装日志</summary><pre>${escapeHtml(llamaServerInstallLog)}</pre></details>` : ""}
        <div class="scan-result">${environmentScanning ? "正在扫描 ComfyUI/models 和应用提示词模型目录…" : environmentScan ? `找到 ${promptAvailable} 个提示词模型档位；ComfyUI 原生模型与应用自管理 GGUF 分开处理` : "等待首次扫描"}</div>
        <p class="muted proxy-hint">Unconcerned 使用 Apache-2.0 的 Qwen3.5 GGUF + mmproj；应用只管理自己启动的 llama-server，不会接管 LM Studio。开始队列前或程序退出时会停止应用自管理提示词模型。</p>
      </section>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>扩写预设</h2><span class="muted">预设会把原始文字和参考图整理成完整的 H3 视频提示词，覆盖主体、场景、动作、镜头、声音、对白和连续性。</span></div><button class="secondary button-with-icon" id="restore-h3-prompt-presets">${icon("rotate-ccw")}恢复默认</button></div>
        <label>当前编辑预设<select id="h3-prompt-preset-setting">${h3PromptPresetOptions(settingsH3PromptPreset, true)}</select></label>
        <p class="muted proxy-hint">${escapeHtml(h3PromptPresetDescriptions[settingsH3PromptPreset])}</p>
        <label>预设规则头<textarea id="h3-prompt-preset-text" rows="7">${escapeHtml(selectedH3PresetText)}</textarea></label>
        <p class="muted proxy-hint">规则头可自由修改；内置的 H3 官方基线会继续强制参考标签、首尾帧关系、连续性、音频和输出格式。修改后点击设置页顶部“保存设置”，创建页下次扩写立即使用。</p>
      </section>
      <div class="model-profile-list">${promptProfiles.length ? promptProfiles.map(modelScanCard).join("") : `<div class="panel environment-empty">尚无提示词模型扫描结果</div>`}</div>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>LM Studio</h2><span class="muted">本地提示词扩写服务</span></div><button class="secondary button-with-icon" data-test="lmstudio">${icon("zap")}测试并读取模型</button></div>
        <div class="settings-grid two">
          <label>安装目录<div class="input-action"><input id="lm-install-directory" value="${escapeHtml(settings.lmStudioInstallDirectory)}" placeholder="例如 D:\\Apps\\LM Studio"><button class="secondary button-with-icon" data-pick-lm-install>${icon("folder-open")}选择</button></div></label>
          <label>OpenAI API 地址<input id="lm-url" value="${escapeHtml(settings.lmStudioUrl)}"></label>
          <label>模型 ID<input id="lm-model" value="${escapeHtml(settings.lmStudioModel)}" placeholder="留空使用当前加载模型"></label>
          <label>扩写语言<select id="prompt-language"><option value="auto" ${settings.promptLanguage === "auto" ? "selected" : ""}>跟随输入语言</option><option value="zh" ${settings.promptLanguage === "zh" ? "selected" : ""}>中文</option><option value="en" ${settings.promptLanguage === "en" ? "selected" : ""}>英文</option></select></label>
          <label>创造性<select id="prompt-creativity"><option value="0.3" ${settings.promptCreativity === 0.3 ? "selected" : ""}>克制 · 0.3</option><option value="0.7" ${settings.promptCreativity === 0.7 ? "selected" : ""}>平衡 · 0.7</option><option value="1" ${settings.promptCreativity === 1 ? "selected" : ""}>丰富 · 1.0</option></select></label>
        </div>
        <div id="connection-result" class="connection-result muted">尚未单独测试连接</div>
      </section>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>提示词模板</h2><span class="muted">创建页的“本地扩写”使用</span></div></div>
        <label>系统模板<textarea id="prompt-template" rows="7">${escapeHtml(settings.promptSystemTemplate)}</textarea></label>
      </section>
      <section class="panel settings-section">
        <h2>工作流占位符</h2><p class="muted">ComfyUI API JSON 提交前会递归替换：</p>
        <div class="token-list">${["PROMPT", "NEGATIVE_PROMPT", "SEED", "INPUT_IMAGE", "END_IMAGE", "SOURCE_VIDEO", "TRIM_START", "TRIM_END", "EXTENSION_FRAMES", "OVERLAP_FRAMES", "UNLOAD_BETWEEN_STAGES", "WIDTH", "HEIGHT", "DURATION", "SOURCE_FPS", "FPS", "FRAMES", "OUTPUT_FRAMES", "OUTPUT_FILENAME", "H3_DIFFUSION_MODEL", "H3_TEXT_ENCODER", "H3_TURBO_LORA"].map((token) => `<code>{{${token}}}</code>`).join("")}</div>
      </section>
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
          ["nodes", "workflow", "节点与工作流"],
          ["prompt", "sparkles", "提示词扩写"],
          ["upscale", "maximize-2", "分辨率提升"],
          ["logs", "file-text", "运行日志"]
        ] as const).map(([id, iconName, label]) => `<button class="settings-tab ${settingsTab === id ? "active" : ""}" data-settings-tab="${id}"><span>${icon(iconName)}</span>${label}${id === "video" && environmentScan ? `<small>${videoAvailable}/${videoProfiles.length}</small>` : ""}${id === "nodes" && environmentScan ? `<small>${nodeDependencyAvailable}/${nodeDependencyTotal}</small>` : ""}${id === "prompt" && environmentScan ? `<small>${promptAvailable}/${promptProfiles.length}</small>` : ""}${id === "upscale" && environmentScan ? `<small>${upscaleAvailable}/${upscaleProfiles.length}</small>` : ""}</button>`).join("")}
      </nav>
      <div class="settings-content">${activePanel}</div>
    </div>
    ${installGuideDialog()}`;
}

function render(): void {
  if (page === "history" && !historyScrollRestorePending) {
    historyScrollPosition = window.scrollY;
  }
  historyViewportEvents?.abort();
  historyViewportEvents = null;
  const playback = captureHistoryPlayback();
  stopRenderedVideoPlayback();
  historyMasonryResizeObserver?.disconnect();
  historyMasonryResizeObserver = null;
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
    settingsPage();
  appElement.innerHTML = shell(content);
  renderIcons(appElement);
  bindShell();
  bindUpscaleDialog();
  if (page === "create") {
    bindCreate();
    void imagePreview(state.draft.startImagePath, "start-preview");
    void imagePreview(state.draft.endImagePath, "end-preview");
    if (isMiniMaxH3R2vModel(state.draft.modelId)) {
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
  else if (page === "history" || page === "history-detail") {
    bindHistory(playback);
    bindHistoryViewportControls();
  }
  else if (page === "settings") bindSettings();
  syncAppLogPolling();
  if (page === "history") {
    restoreHistoryScrollPosition();
  }
  restoreHistoryPlayback(playback);
}

function showMessage(message: string, renderPage = true): void {
  flashMessage = message;
  window.clearTimeout(flashMessageTimer);
  if (renderPage) {
    render();
  } else {
    const flash = document.querySelector<HTMLElement>("#app-flash");
    if (flash) {
      flash.textContent = message;
      flash.classList.add("visible");
    }
  }
  flashMessageTimer = window.setTimeout(() => {
    if (flashMessage === message) {
      flashMessage = "";
      if (renderPage) {
        render();
      } else {
        const currentFlash = document.querySelector<HTMLElement>("#app-flash");
        currentFlash?.classList.remove("visible");
      }
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
  if (!asset) return;
  rememberModalFocus();
  pendingConfirmation = {
    kind: "delete-history",
    assetId,
    title: asset.title
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

function returnToHistory(): void {
  if (page !== "history-detail") return;
  historyScrollRestorePending = true;
  page = "history";
  flashMessage = "";
  render();
}

function returnToLastHistoryDetail(): void {
  if (page !== "history" || !historyForwardTarget) return;
  const target = historyForwardTarget;
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

async function copyHistoryText(value: string, successMessage: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    showMessage(successMessage, false);
  } catch {
    showMessage("复制失败，请检查系统剪贴板权限。", false);
  }
}

async function copyHistoryFile(filename: string): Promise<void> {
  if (!filename) {
    showMessage("当前记录没有可用的视频文件。", false);
    return;
  }
  try {
    const result = await window.studio.copyFile(filename);
    showMessage(result.message, false);
  } catch {
    showMessage("复制视频文件失败，请检查文件是否仍然存在。", false);
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
    ratio: asset.ratio ?? state.draft.ratio,
    resolution: ([480, 540, 720, 768].includes(asset.resolution)
      ? asset.resolution
      : state.draft.resolution) as Draft["resolution"],
    duration: asset.duration,
    steps: normalizeH3Steps(asset.steps),
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
    } else {
      releaseHistoryVideo(request.assetId);
      await new Promise<void>((resolve) =>
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()))
      );
      state = await window.studio.deleteHistoryAsset(request.assetId);
      selectedHistoryAssetId = "";
      if (page === "history-detail") page = "history";
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
      if (page === "history-detail" && nextPage === "history") {
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
  if (page === "history-detail") {
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
      navigateHistoryDetail(direction);
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

async function saveDraftImmediately(draft: Draft): Promise<void> {
  window.clearTimeout(draftSaveTimer);
  draftRevision += 1;
  draftDirty = false;
  state = await window.studio.saveDraft(draft);
}

function formatBytes(bytes: number): string {
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

function randomSeedValue(): number {
  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  const high = (values[0] ?? 0) & 0x001fffff;
  return high * 0x100000000 + (values[1] ?? 0);
}

async function handleClipboardPaste(event: ClipboardEvent): Promise<void> {
  if (page !== "create" || !state || state.draft.inputMode !== "image") return;
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
    const isSupported =
      file.type.startsWith("image/") ||
      /\.(png|jpe?g|webp|bmp)$/i.test(file.name);
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

function bindCreate(): void {
  document.querySelectorAll<HTMLElement>("[data-input-mode]").forEach((button) => {
    button.addEventListener("click", async () => {
      const inputMode = button.dataset.inputMode === "video" ? "video" : "image";
      const modelId = inputMode === "video"
        ? isMiniMaxH3Fl2vaModel(state.draft.modelId)
          ? state.draft.modelId
          : "sulphur2"
        : state.draft.modelId;
      const key = bundledWorkflowKey(modelId, inputMode);
      const bundled = bundledWorkflows[key] ??
        (await window.studio.getBundledWorkflow(modelId, inputMode));
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
        workflowPath: bundled?.path ?? "",
        ...(inputMode === "video"
          ? { ratio: "source" as const }
          : {})
      });
      render();
    });
  });
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
        referenceContext: isH3Vision ? referenceContext : undefined
      });
      if (promptRuntimeForSettings(state.settings) !== "lmstudio") promptRuntimeLoaded = true;
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
  for (const id of ["model", "ratio", "resolution", "steps", "spectrum-mode", "fps", "frame-interpolation", "motion", "seed"]) {
    document.querySelector(`#${id}`)?.addEventListener("change", async (event) => {
      const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
      if (id === "model") {
        const oldKey = bundledWorkflowKey(state.draft.modelId, state.draft.inputMode);
        const nextKey = bundledWorkflowKey(value, state.draft.inputMode);
        const oldBundledPath = bundledWorkflows[oldKey]?.path;
        const nextIsR2V = isMiniMaxH3R2vModel(value);
        const oldWasR2V = isMiniMaxH3R2vModel(state.draft.modelId);
        const existingSlots = state.draft.h3ReferenceSlots;
        const slotsForR2V = nextIsR2V && !existingSlots.length
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
          h3ReferenceSlots: slotsForR2V,
          startImagePath: nextIsR2V ? "" : restoredStartImage,
          endImagePath: nextIsR2V ? "" : restoredEndImage,
          ...(isMiniMaxH3Model(value)
            ? {
                ratio: "source" as const,
                resolution: 480 as const,
                duration: 5,
                steps: isMiniMaxH3TurboModel(value)
                  ? 8 as const
                  : 20 as const,
                fps: 24 as const,
                frameInterpolation: "off" as const,
                motion: "natural" as const,
                spectrumMode: isMiniMaxH3TurboModel(value)
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
        render();
        return;
      }
      const patch =
        id === "ratio" ? { ratio: value as Draft["ratio"] } :
        id === "resolution" ? { resolution: Number(value) as Draft["resolution"] } :
        id === "steps" ? { steps: normalizeH3Steps(Number(value), state.draft.modelId) } :
        id === "spectrum-mode" ? { spectrumMode: value as Draft["spectrumMode"] } :
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
    reportUserAction("queue-enqueue", {
      taskType: state.draft.inputMode === "video" ? "extension" : "generation",
      modelId: state.draft.modelId,
      duration: state.draft.duration,
      fps: state.draft.fps
    });
    try {
      if (state.draft.inputMode === "video") {
        state = await window.studio.enqueueExtension(state.draft);
        showMessage(`已加入续写队列：${state.queue.at(-1)?.outputFilename ?? ""}`);
        return;
      }
      state = await window.studio.enqueue(state.draft);
      showMessage(`已加入队列：${state.queue.at(-1)?.outputFilename ?? ""}`);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error));
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
  bindHistoryMasonry();
  bindHistoryTitleMarquees();
  restoreHistoryLayoutAnchor();
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
        navigateHistoryDetail(direction);
      }
    });
  });
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
      openHistoryContextMenu(
        card.dataset.history!,
        event.clientX,
        event.clientY
      );
    });
    const open = (event?: Event) => {
      const target = event?.target;
      if (target instanceof Element && target.closest("button")) return;
      openHistoryDetail(card.dataset.history!);
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
          height: version.height
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
}

function formSettings(): Settings {
  const base = settingsDraft ?? state.settings;
  const value = (id: string, fallback: string) =>
    document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`#${id}`)?.value.trim() ?? fallback;
  const checked = (id: string, fallback: boolean) =>
    document.querySelector<HTMLInputElement>(`#${id}`)?.checked ?? fallback;
  const h3PromptPresets = {
    ...base.h3PromptPresets,
    [settingsH3PromptPreset]: value(
      "h3-prompt-preset-text",
      base.h3PromptPresets[settingsH3PromptPreset]
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
    promptRuntime: value("prompt-runtime", base.promptRuntime) as Settings["promptRuntime"],
    promptUseLmStudio: value("prompt-runtime", base.promptRuntime) === "lmstudio",
    promptModelId: value("prompt-model-id", base.promptModelId),
    promptModelDirectory: value("prompt-model-directory", base.promptModelDirectory),
    promptLlamaServerPath: value("prompt-llama-server-path", base.promptLlamaServerPath),
    promptLlamaPort: base.promptLlamaPort,
    h3PromptPresets,
    modelDirectory: value("model-directory", base.modelDirectory),
    outputDirectory: value("output-directory", base.outputDirectory),
    promptSystemTemplate: value("prompt-template", base.promptSystemTemplate),
    defaultVideoModel: value("default-video-model", base.defaultVideoModel),
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

async function runEnvironmentScan(settings: Settings): Promise<void> {
  reportUserAction("scan-environment");
  environmentScanning = true;
  environmentScanError = "";
  render();
  try {
    environmentScan = await window.studio.scanEnvironment(settings);
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
  document.querySelector("#prompt-model-id")?.addEventListener("change", (event) => {
    const modelId = (event.currentTarget as HTMLSelectElement).value;
    if (isUnconcernedPromptModel(modelId)) {
      const runtime = document.querySelector<HTMLSelectElement>("#prompt-runtime");
      if (runtime) runtime.value = "llama-server";
      settingsDraft = formSettings();
      showMessage("Unconcerned 模型由应用自管理 llama-server 运行，不依赖 LM Studio。");
    }
  });
  document.querySelector("#prompt-runtime")?.addEventListener("change", (event) => {
    const runtime = (event.currentTarget as HTMLSelectElement).value;
    const model = document.querySelector<HTMLSelectElement>("#prompt-model-id");
    if (runtime === "llama-server" && model && !isUnconcernedPromptModel(model.value)) {
      model.value = unconcernedPromptModelId;
    } else if (runtime !== "llama-server" && model && isUnconcernedPromptModel(model.value)) {
      model.value = "qwen/qwen3.5-4b";
    }
    settingsDraft = formSettings();
  });
  document.querySelector("#release-prompt-model")?.addEventListener("click", () => {
    void togglePromptModelFromUi();
  });
  document.querySelector("#h3-prompt-preset-setting")?.addEventListener("change", (event) => {
    settingsDraft = formSettings();
    settingsH3PromptPreset = (event.currentTarget as HTMLSelectElement).value as H3PromptPreset;
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
    const previousProfile = previousSettings.ltxExtensionModelProfile;
    const pathsChanged = previousSettings.comfyInstallDirectory !== nextSettings.comfyInstallDirectory ||
      previousSettings.comfyPythonPath !== nextSettings.comfyPythonPath ||
      previousSettings.modelDirectory !== nextSettings.modelDirectory ||
      previousSettings.outputDirectory !== nextSettings.outputDirectory ||
      previousSettings.lmStudioInstallDirectory !== nextSettings.lmStudioInstallDirectory ||
      previousSettings.promptModelDirectory !== nextSettings.promptModelDirectory ||
      previousSettings.promptLlamaServerPath !== nextSettings.promptLlamaServerPath;
    const proxyChanged = previousSettings.proxyEnabled !== nextSettings.proxyEnabled ||
      previousSettings.proxyUrl !== nextSettings.proxyUrl;
    state = await window.studio.saveSettings(nextSettings);
    settingsDraft = null;
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
      : "设置已保存，将对下一项尚未开始的任务生效。");
  });
  document.querySelector<HTMLButtonElement>("#install-llama-server")?.addEventListener("click", async () => {
    const currentSettings = formSettings();
    settingsDraft = currentSettings;
    llamaServerInstalling = true;
    render();
    try {
      const result = await window.studio.installLlamaServer(currentSettings);
      llamaServerInstallLog = result.log || result.message;
      if (!result.ok) throw new Error(result.message);
      state = await window.studio.saveSettings({
        ...currentSettings,
        promptLlamaServerPath: result.executablePath || currentSettings.promptLlamaServerPath
      });
      settingsDraft = null;
      environmentScan = await window.studio.scanEnvironment(state.settings);
      showMessage(result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      llamaServerInstallLog = `${llamaServerInstallLog}\n${message}`.trim();
      showMessage(`llama-server 安装失败：${message}`);
    } finally {
      llamaServerInstalling = false;
      render();
    }
  });
  document.querySelectorAll<HTMLElement>("[data-test]").forEach((button) => {
    button.addEventListener("click", async () => {
      reportUserAction("connection-test", { kind: button.dataset.test });
      const resultElement = document.querySelector("#connection-result")!;
      resultElement.textContent = "正在连接…";
      const result = await window.studio.testConnection(
        button.dataset.test as "comfy" | "lmstudio",
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
    const directory = await window.studio.pickDirectory();
    const input = document.querySelector<HTMLInputElement>("#comfy-install-directory");
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
    const directory = await window.studio.pickDirectory();
    const input = document.querySelector<HTMLInputElement>("#output-directory");
    if (directory && input) {
      input.value = directory;
      settingsDraft = formSettings();
      void runEnvironmentScan(settingsDraft);
    }
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
  const localDraft = state?.draft;
  state = {
    ...nextState,
    draft:
      localDraft && (draftDirty || draftSaveInFlight > 0)
        ? localDraft
        : nextState.draft
  };
  if (nextState.queueRunning || promptRuntimeForSettings(nextState.settings) !== "comfyui") {
    promptRuntimeLoaded = false;
  }
  const activeElement = document.activeElement;
  const isEditing =
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement instanceof HTMLSelectElement;
  if (isEditing || draftSaveInFlight > 0) return;
  if ((page === "history" || page === "history-detail") && !historyChanged) return;
  render();
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
    window.studio.getBundledWorkflow(state.draft.modelId, state.draft.inputMode),
    window.studio.scanEnvironment(state.settings)
  ]).then(([bundledResult, scanResult]) => {
    if (scanResult.status === "fulfilled") {
      environmentScanError = "";
      environmentScan = scanResult.value;
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
