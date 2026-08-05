import "./style.css";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
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
  Plus,
  Puzzle,
  RefreshCw,
  Save,
  ScanSearch,
  Server,
  Settings as SettingsIcon,
  ShieldAlert,
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
  AppState,
  AssetVersion,
  BundledWorkflow,
  Draft,
  EnvironmentScanResult,
  LocalServiceKind,
  ModelComponentStatus,
  ModelScanProfile,
  PerformanceMetrics,
  PromptEnhanceMode,
  PromptVersion,
  QueueTask,
  Settings
  ,WorkflowCapabilities
} from "./types";
import { createClearedDraft } from "./core/defaults";
import { createH3PromptTemplate } from "./core/h3-prompt";
import {
  extensionSafetyForTask,
  frameInterpolationMultiplier,
  generationFrameCountForTask,
  generationSafetyForTask,
  isMiniMaxH3Model,
  outputDimensions,
  outputFrameCountForTask
} from "./core/workflow";
import {
  createUpscaleFilename,
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
let page: Page = "create";
let draftSaveTimer: number | undefined;
let draftRevision = 0;
let draftSaveInFlight = 0;
let draftDirty = false;
let flashMessage = "";
let selectedHistoryAssetId = "";
let selectedHistoryVersionId = "";
let upscaleDialog: {
  taskId?: string;
  assetId: string;
  versionId: string;
  targetHeight: 720 | 1080 | 1440 | 2160;
  modelId: "seedvr2" | "flashvsr" | "realesrgan";
  tileMode: "auto" | "safe" | "fast";
} | null = null;
let historyScrollPosition = 0;
let historyLayout: "masonry" | "album" = "masonry";
let historyCoverMode: "random" | "first" = "random";
let environmentScan: EnvironmentScanResult | null = null;
let environmentScanning = false;
let serviceStarting: LocalServiceKind | null = null;
let serviceRestarting: LocalServiceKind | null = null;
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
let settingsTab: "system" | "acceleration" | "video" | "nodes" | "prompt" | "upscale" = "system";
let selectedInstallGuide: {
  profileName: string;
  component: ModelComponentStatus;
} | null = null;
let pendingConfirmation:
  | { kind: "clear-draft" }
  | { kind: "delete-history"; assetId: string; title: string }
  | null = null;
let confirmationBusy = false;
const bundledWorkflows: Record<string, BundledWorkflow> = {};
const bundledWorkflowKey = (modelId: string, inputMode: Draft["inputMode"]) =>
  `${modelId}:${inputMode}`;
const workflowCapabilities: Record<string, WorkflowCapabilities> = {};
const taskPreviews: Record<string, string> = {};
let performanceMetrics: PerformanceMetrics | null = null;
let performancePolling = false;
let historyContextMenuElement: HTMLElement | null = null;
let historyContextMenuEvents: AbortController | null = null;
let historyMasonryResizeObserver: ResizeObserver | null = null;
let historyTitleResizeObserver: ResizeObserver | null = null;
let promptEnhanceMode: PromptEnhanceMode = "sulphur-native";

const lucideIconSet = {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
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
  Plus,
  Puzzle,
  RefreshCw,
  Save,
  ScanSearch,
  Server,
  Settings: SettingsIcon,
  ShieldAlert,
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

function promptSnippetOptions(): string {
  return [...new Set(promptSnippets.map((snippet) => snippet.group))]
    .map((group) => `<optgroup label="${escapeHtml(group)}">${promptSnippets
      .filter((snippet) => snippet.group === group)
      .map((snippet) => `<option value="${escapeHtml(snippet.id)}">${escapeHtml(snippet.label)}</option>`)
      .join("")}</optgroup>`)
    .join("");
}

function h3PromptCheckMarkup(
  promptText: string,
  hasEndImage: boolean
): string {
  const result = checkH3Prompt(promptText, { hasEndImage });
  return `<div id="h3-prompt-check" class="h3-prompt-check ${result.valid ? "valid" : "warning"}" aria-live="polite">
    <div class="h3-prompt-check-heading"><strong>H3 提示词检查</strong><span>${escapeHtml(result.summary)}</span></div>
    ${result.items.length ? `<ul>${result.items.map((item) => `<li>${escapeHtml(item.message)}</li>`).join("")}</ul>` : ""}
  </div>`;
}

function updateH3PromptCheck(promptText: string, hasEndImage: boolean): void {
  const element = document.querySelector<HTMLElement>("#h3-prompt-check");
  if (!element) return;
  const result = checkH3Prompt(promptText, { hasEndImage });
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
    resolution: isMiniMaxH3Model(draft.modelId)
      ? draft.resolution
      : settings.ltxExtensionResolution,
    maxGeneratedFrames: isMiniMaxH3Model(draft.modelId)
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

function preferredVersion(asset: AppState["history"][number]): AssetVersion {
  return asset.versions.find((version) => version.id === asset.defaultVersionId) ??
    [...asset.versions].sort((left, right) => right.height - left.height)[0]!;
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
      { id: "sulphur2", name: "Sulphur 2 GGUF", available: true, integrated: true },
        { id: "wan22_5b", name: "Wan 2.2 I2V 5B", available: true, integrated: true },
        { id: "hunyuan15", name: "HunyuanVideo 1.5", available: true, integrated: true }
      ];
  return profiles
    .map((profile) => {
      const selected = draft.modelId === profile.id;
      const supportsVideoExtension =
        draft.inputMode === "video" && isMiniMaxH3Model(profile.id)
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

function confirmationDialog(): string {
  if (!pendingConfirmation) return "";
  const request = pendingConfirmation;
  const deleting = request.kind === "delete-history";
  const title = request.kind === "delete-history"
    ? `删除“${request.title}”？`
    : "清空当前草稿？";
  const description = deleting
    ? "关联的视频文件会从磁盘永久删除，历史记录也会一并移除。"
    : "首帧、尾帧和所有提示词版本都会清空；模型与输出设置会保留。";
  return `
    <div class="dialog-backdrop confirm-backdrop" id="confirm-backdrop">
      <section class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description" tabindex="-1">
        <div class="confirm-icon" aria-hidden="true">${icon("alert-triangle")}</div>
        <div class="confirm-copy">
          <span class="eyebrow">此操作无法撤销</span>
          <h2 id="confirm-title">${escapeHtml(title)}</h2>
          <p id="confirm-description">${escapeHtml(description)}</p>
          ${deleting ? `<div class="confirm-warning">只删除本条记录关联的视频，不会删除参考图片、工作流或整个输出目录。</div>` : ""}
        </div>
        <div class="dialog-actions">
          <button class="secondary button-with-icon" id="cancel-confirmation" ${confirmationBusy ? "disabled" : ""}>${icon("x")}取消</button>
          <button class="primary destructive button-with-icon" id="accept-confirmation" ${confirmationBusy ? "disabled" : ""}>${icon("trash-2")}${confirmationBusy ? "处理中…" : deleting ? "删除视频和记录" : "清空草稿"}</button>
        </div>
      </section>
    </div>`;
}

function upscaleDialogHtml(): string {
  if (!upscaleDialog) return "";
  const asset = state.history.find((item) => item.id === upscaleDialog?.assetId);
  const version = asset?.versions.find((item) => item.id === upscaleDialog?.versionId);
  if (!asset || !version) return "";
  const [targetWidth, targetHeight] = upscaleDimensions(
    version.width,
    version.height,
    upscaleDialog.targetHeight
  );
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
    targetHeight
  );
  return `
    <div class="dialog-backdrop upscale-backdrop" id="upscale-backdrop">
      <section class="upscale-dialog" role="dialog" aria-modal="true" aria-labelledby="upscale-title">
        <div class="upscale-dialog-head">
          <div><span class="eyebrow">创建后处理任务</span><h2 id="upscale-title">提升分辨率</h2></div>
          <button class="dialog-close" id="close-upscale" aria-label="关闭">${icon("x")}</button>
        </div>
        <div class="upscale-dialog-body">
          <div class="upscale-source"><div><strong>${escapeHtml(asset.title)}</strong><code>${escapeHtml(version.outputFilename)}</code></div><span>${version.width} × ${version.height} · ${formatVideoDuration(version.duration)}</span></div>
          <div><label>目标分辨率</label><div class="upscale-resolution">
            ${([720, 1080, 1440, 2160] as const).map((height) => `<button class="${height === targetHeight ? "primary" : "secondary"}" data-upscale-height="${height}" ${height <= version.height ? "disabled" : ""}>${height === 2160 ? "4K" : `${height}p`}</button>`).join("")}
          </div></div>
          <div class="settings-grid two">
            <label>提升模型<select id="upscale-model">${profiles.map((profile) => `<option value="${profile.id}" ${profile.id === upscaleDialog?.modelId ? "selected" : ""} ${!profile.available ? "disabled" : ""}>${escapeHtml(profile.name)}${profile.available ? "" : " · 缺组件"}</option>`).join("")}</select></label>
            <label>显存策略<select id="upscale-tile" disabled><option value="safe" selected>保守 · 分批与每批卸载</option></select></label>
          </div>
          <label class="switch-field disabled"><input type="checkbox" disabled><span>人脸细节修复 · 等待独立修复模型接入</span></label>
          <div class="upscale-output"><div><span>预计输出</span><strong>${targetWidth} × ${targetHeight}</strong><code>${escapeHtml(outputFilename)}</code></div><span>${upscaleDialog.modelId === "realesrgan" ? "预计峰值 6–9 GB" : upscaleDialog.modelId === "flashvsr" ? "预计峰值 14–19 GB" : "预计峰值 18–23 GB"}</span></div>
        </div>
        <div class="dialog-actions"><button class="secondary button-with-icon" id="cancel-upscale">${icon("x")}取消</button><button class="primary button-with-icon" id="enqueue-upscale">${icon(upscaleDialog.taskId ? "save" : "plus")}${upscaleDialog.taskId ? "保存更改" : "加入队列"}</button></div>
      </section>
    </div>`;
}

function shell(content: string): string {
  return `
    <div class="app-shell">
      <header class="topbar">
        <button class="brand" data-page="create" aria-label="返回创建页">
          <span class="brand-mark">${icon("play")}</span><span>Local Video Studio</span>
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
      ${flashMessage ? `<div class="flash" role="status">${escapeHtml(flashMessage)}</div>` : ""}
      <main>${content}</main>
    </div>
    ${confirmationDialog()}
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

function createPage(): string {
  const draft = state.draft;
  const isMiniMaxH3 = isMiniMaxH3Model(draft.modelId);
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
  const enqueueDisabled = extending
    ? !videoReady || trimDuration <= 0 || !supportsVideoExtension || !safety.safe
    : !safety.safe;
  return `
    <section class="page-heading">
      <div><h1>创建视频</h1><p>${extending ? "裁出要保留的视频片段，并从末帧继续生成。" : "导入参考画面，调整提示词，然后加入本地生成队列。"}</p></div>
      <span class="save-state">自动保存</span>
    </section>
    <div class="input-mode-switch" role="group" aria-label="创建模式">
      <button class="${extending ? "ghost" : "secondary active"} button-with-icon" data-input-mode="image" aria-pressed="${!extending}">${icon("image")}图片生成</button>
      <button class="${extending ? "secondary active" : "ghost"} button-with-icon" data-input-mode="video" aria-pressed="${extending}">${icon("video")}视频续写</button>
    </div>
    <div class="create-workspace">
      <section class="panel media-panel">
      <div class="section-heading">
        <div><h2>${extending ? "输入视频" : "参考画面"}</h2><span class="muted">${extending ? "选择保留范围，续写将从范围末帧开始" : supportsEndImage ? "当前工作流支持首帧和尾帧" : "当前工作流仅支持首帧"}</span></div>
        ${extending
          ? draft.sourceVideoPath ? `<button class="secondary button-with-icon" id="remove-video">${icon("x")}移除视频</button>` : ""
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
      <div class="section-heading">
        <div>
          <h2>${extending ? "描述接下来发生什么" : "提示词"}</h2>
          <span class="muted">${draft.activePromptVersion + 1} / ${draft.promptVersions.length} · ${escapeHtml(prompt.label)}</span>
        </div>
        <div class="button-row">
          <button class="icon-button" id="prompt-prev" aria-label="上一版提示词" title="上一版提示词" ${draft.activePromptVersion === 0 ? "disabled" : ""}>${icon("chevron-left")}</button>
          <button class="icon-button" id="prompt-next" aria-label="下一版提示词" title="下一版提示词" ${draft.activePromptVersion >= draft.promptVersions.length - 1 ? "disabled" : ""}>${icon("chevron-right")}</button>
          <select class="prompt-enhance-mode" id="prompt-enhance-mode" aria-label="扩写方式" title="选择提示词扩写方式">
            <option value="sulphur-native" ${promptEnhanceMode === "sulphur-native" ? "selected" : ""}>Sulphur 原生增强（推荐）</option>
            <option value="faithful" ${promptEnhanceMode === "faithful" ? "selected" : ""}>忠实扩写（需 Instruct 模型）</option>
          </select>
          <button class="secondary button-with-icon" id="enhance-prompt">${icon("sparkles")}本地扩写</button>
        </div>
      </div>
      <textarea id="prompt-input" rows="6" spellcheck="true" lang="${/[\u3400-\u9fff]/u.test(prompt.text) ? "zh-CN" : "en-US"}">${escapeHtml(prompt.text)}</textarea>
      <div class="prompt-tool-row">
        <label class="prompt-snippet-picker"><span>快速插入</span><select id="prompt-snippet"><option value="">选择镜头、动作、声音或对白片段</option>${promptSnippetOptions()}</select></label>
        <button class="secondary button-with-icon" id="insert-prompt-snippet" type="button" disabled>${icon("plus")}插入</button>
      </div>
      ${isMiniMaxH3 ? h3PromptCheckMarkup(prompt.text, Boolean(draft.endImagePath)) : ""}
      ${extending && isMiniMaxH3 ? `<div class="h3-extension-note">
        <strong>H3 结尾帧接续</strong>
        <span>从保留片段的最后一帧生成新段并保留 H3 原生音轨；它不是 latent overlap 原生续写，边界动作可能发生变化。</span>
      </div>` : ""}
      ${isMiniMaxH3 && !extending ? `<details class="h3-prompt-helper">
        <summary>
          <span class="h3-helper-heading">
            <strong>H3 提示词助手 <span class="model-badge">可选</span></strong>
            <span>${draft.endImagePath ? "当前为 FL2VA 首尾帧模式。" : "当前为 I2VA 首帧模式。"}模板会使用官方对齐说明和音频字段；准确对白请在模板中保留原文，不要交给扩写器改写。</span>
          </span>
          <span class="h3-helper-toggle"><span class="when-closed">查看格式</span><span class="when-open">收起说明</span>${icon("chevron-down")}</span>
        </summary>
        <div class="h3-helper-body">
          <div class="h3-prompt-sections">
            <div><strong>首帧 / 首尾帧对齐</strong><span>自动加入 I2VA 或 FL2VA 的参考图时间说明；首尾帧默认保持一个连续镜头。</span></div>
            <div><strong>三段主体结构</strong><span>使用 integrated_multimodal_description、overall_soundscape 和 non_diegetic_music。</span></div>
            <div><strong>对白格式</strong><span>固定说话人 ID，写明语言和音色；准确台词放在 &lt;d&gt;[Chinese] ...&lt;/d&gt; 中。</span></div>
          </div>
          <div class="h3-helper-actions">
            <span>模板会使用当前首帧/尾帧状态和 H3 实际帧网格；点击后会新建版本，不会覆盖当前内容。</span>
            <button class="secondary button-with-icon" id="h3-prompt-template" type="button">${icon("list-ordered")}创建结构化提示词</button>
          </div>
        </div>
      </details>` : ""}
      <div class="settings-grid">
        <label>模型
          <select id="model">
            ${createModelOptions(draft)}
          </select>
        </label>
        <label>画面比例
          <select id="ratio" ${extending ? "disabled" : ""}>
            ${["source", "16:9", "9:16", "1:1", "4:3"].map((ratio) =>
              `<option value="${ratio}" ${draft.ratio === ratio ? "selected" : ""}>${ratio === "source" ? extending ? "跟随输入视频" : "原图（未读取时按 16:9）" : ratio}</option>`
            ).join("")}
          </select>
        </label>
        <label>清晰度
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
        <label>${extending ? "新增时长" : "时长"}
          <div class="inline-field"><input id="duration" type="range" min="1" max="${safety.maxDurationSeconds}" value="${draft.duration}"><input id="duration-number" type="number" min="1" max="${safety.maxDurationSeconds}" value="${draft.duration}"><span>秒</span></div>
        </label>
        <label>目标帧率
          <select id="fps" ${isMiniMaxH3 ? "disabled" : ""}>
            ${(isMiniMaxH3 ? [24] : [8, 12, 16, 24, 25, 30]).map((value) =>
              `<option value="${value}" ${draft.fps === value ? "selected" : ""}>${value} FPS</option>`
            ).join("")}
          </select>
        </label>
        <label>Frame Interpolation
          <select id="frame-interpolation" ${isMiniMaxH3 ? "disabled" : ""}>
            <option value="off" ${draft.frameInterpolation === "off" ? "selected" : ""}>关闭 · 模型直接生成</option>
            ${isMiniMaxH3 ? "" : `
              <option value="rife2x" ${draft.frameInterpolation === "rife2x" ? "selected" : ""}>RIFE 2×</option>
              <option value="rife4x" ${draft.frameInterpolation === "rife4x" ? "selected" : ""}>RIFE 4×</option>`}
          </select>
        </label>
        <div class="interpolation-summary ${!safety.safe ? "unsafe" : isMiniMaxH3 && (draft.duration > 10 || draft.resolution >= 768) ? "caution" : interpolation.multiplier === 1 ? "disabled" : ""}">
          <div><strong>${!safety.safe ? "配置超过显存安全预算" : isMiniMaxH3 ? "H3 原生 24 FPS · 同步立体声音频" : interpolation.multiplier === 1 ? "未启用插帧" : `生成约 ${draft.fps / interpolation.multiplier} FPS，再插值到 ${draft.fps} FPS`}</strong><span>${interpolation.generatedFrames}/${safety.maxGeneratedFrames} 个模型帧 → ${interpolation.outputFrames} 个成片帧</span></div>
          <p>${escapeHtml(safety.message)} ${safety.safe && interpolation.multiplier !== 1 ? "扩散模型和 VAE 会在 RIFE 前主动卸载；RIFE 使用 BF16、单帧批次。" : ""}</p>
        </div>
        <label>动作幅度
          <select id="motion" ${isMiniMaxH3 ? "disabled" : ""}>
            ${isMiniMaxH3
              ? `<option value="natural" selected>由镜头提示词控制</option>`
              : `<option value="subtle" ${draft.motion === "subtle" ? "selected" : ""}>轻微</option>
                <option value="natural" ${draft.motion === "natural" ? "selected" : ""}>自然</option>
                <option value="strong" ${draft.motion === "strong" ? "selected" : ""}>强烈</option>`}
          </select>
        </label>
        <label>随机 Seed
          <input id="seed" type="number" placeholder="留空则随机" value="${draft.seed ?? ""}">
        </label>
        <label class="checkbox-field"><input id="keep-seed" type="checkbox" ${draft.keepSeedOnCopy ? "checked" : ""}><span>复制任务时保留 Seed</span></label>
      </div>
      <div class="workflow-field">
        <div><strong>ComfyUI API 工作流</strong><p class="muted">${extending && !supportsVideoExtension ? `${selectedModelProfile?.available ? `${modelName(draft.modelId)} 模型组件已安装完整；` : "模型组件尚未安装完整；"}当前工作流未通过原生续写安全检查。` : draft.workflowPath ? escapeHtml(Object.values(bundledWorkflows).find((workflow) => workflow.path === draft.workflowPath)?.label ?? draft.workflowPath) : "为当前模型选择从 ComfyUI 导出的 API 格式 JSON"}</p></div>
        <button class="secondary button-with-icon" id="pick-workflow">${icon("workflow")}${draft.workflowPath ? "更换 JSON" : "选择 JSON"}</button>
      </div>
      <div class="submit-row">
        <button class="ghost danger button-with-icon" id="clear-draft">${icon("trash-2")}清空</button>
        <button class="primary button-with-icon" id="enqueue" ${enqueueDisabled ? "disabled" : ""} title="${extending ? supportsVideoExtension ? "加入视频续写队列" : "模型已安装，但专用视频续写工作流尚未接入" : safety.safe ? "加入本地生成队列" : escapeHtml(safety.message)}">${icon("plus")}加入队列</button>
      </div>
      </section>
    </div>`;
}

function queuePage(): string {
  const running = state.queue.find((task) => task.status === "running");
  return `
    <section class="page-heading">
      <div><h1>生成队列</h1><p>${state.queue.length} 项任务 · ${running ? "当前任务已在队列内展开" : state.queueRunning ? "准备执行" : "当前已暂停"}</p></div>
      <div class="button-row">
        <button class="secondary button-with-icon" id="optimize-queue" ${state.queue.filter((task) => task.status === "waiting").length < 2 ? "disabled" : ""}>${icon("wand-sparkles")}按模型优化顺序</button>
        ${running ? `<span class="queue-mode">${state.queueRunning ? "自动继续后续任务" : "本条完成后暂停"}</span>` : `<button class="primary button-with-icon" id="start-queue" ${state.queue.some((task) => task.status === "waiting") ? "" : "disabled"}>${icon("play")}开始队列</button>`}
      </div>
    </section>
    <section class="performance-grid" aria-label="性能监测">
      ${performanceCard("CPU", "metric-cpu", performanceMetrics?.cpuPercent, "%")}
      ${performanceCard("系统内存", "metric-memory", performanceMetrics ? performanceMetrics.memoryUsedBytes / performanceMetrics.memoryTotalBytes * 100 : null, "%", performanceMetrics ? `${formatBytes(performanceMetrics.memoryUsedBytes)} / ${formatBytes(performanceMetrics.memoryTotalBytes)}` : "")}
      ${performanceCard("GPU", "metric-gpu", performanceMetrics?.gpuPercent, "%", performanceMetrics?.gpuTemperature != null ? `${performanceMetrics.gpuTemperature}°C` : "")}
      ${performanceCard("显存", "metric-vram", performanceMetrics?.vramUsedBytes != null && performanceMetrics.vramTotalBytes ? performanceMetrics.vramUsedBytes / performanceMetrics.vramTotalBytes * 100 : null, "%", performanceMetrics?.vramUsedBytes != null && performanceMetrics.vramTotalBytes != null ? `${formatBytes(performanceMetrics.vramUsedBytes)} / ${formatBytes(performanceMetrics.vramTotalBytes)}` : "")}
    </section>
    <section class="task-list">
      ${state.queue.length === 0
        ? `<div class="empty panel"><h2>队列还是空的</h2><p>从创建页加入一个任务后，就可以在这里运行。</p><button class="secondary button-with-icon" data-page="create">${icon("plus")}去创建</button></div>`
        : state.queue.map(queueTaskCard).join("")}
    </section>`;
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

function queueTaskCard(task: QueueTask): string {
  const description = task.taskType === "generation"
    ? task.prompt
    : task.taskType === "extension"
      ? `${task.prompt} · 保留 ${task.trimStartSeconds.toFixed(1)}–${task.trimEndSeconds.toFixed(1)} 秒`
      : `${task.sourceFilename} → ${task.outputFilename}`;
  const metadata = task.taskType === "generation"
    ? `<span>${escapeHtml(modelName(task.modelId))}</span><span>${task.resolution}p</span><span>${task.duration}秒</span><span>${frameRateSummary(task.fps, task.frameInterpolation)}</span><span>Seed ${task.seed}</span>`
    : task.taskType === "extension"
      ? `<span>视频续写</span><span>${escapeHtml(modelName(task.modelId))}</span><span>${task.resolution}p</span><span>最多 ${task.maxGeneratedFrames} 模型帧</span><span>${task.overlapFrames} 帧上下文</span>`
      : `<span>分辨率提升</span><span>${escapeHtml(modelName(task.modelId))}</span><span>${task.targetWidth} × ${task.targetHeight}</span><span>分批处理 · 每批卸载</span>`;
  if (task.status === "running") {
    const preview = taskPreviews[task.id] ?? "";
    const input = queueTaskInput(task);
    const inputVideoUrl = input?.kind === "video" ? queueTaskInputUrl(task) : "";
    return `
      <article class="task-card panel running expanded">
        <div class="expanded-task-head">
          <div><span class="status running">正在运行</span><h3>${escapeHtml(task.outputFilename)}</h3></div>
          <strong id="running-progress-label">${Math.round(task.progress ?? 0)}%</strong>
        </div>
        <div class="running-layout">
          <div class="live-preview">
            <img id="live-preview-image" ${input?.kind === "image" ? `data-queue-input-image="${escapeHtml(task.id)}"` : ""} alt="${input ? "用户输入或 ComfyUI 实时预览" : "ComfyUI 实时预览"}" src="${preview ? escapeHtml(preview) : ""}" style="${preview ? "" : "display:none"}">
            ${inputVideoUrl ? `<video data-queue-input-video="${escapeHtml(task.id)}" muted playsinline preload="metadata" src="${inputVideoUrl}" style="${preview ? "display:none" : ""}"></video>` : ""}
            <div id="live-preview-empty" style="${preview || inputVideoUrl ? "display:none" : ""}"><span>${icon(input ? input.kind === "image" ? "image" : "film" : "film")}</span><strong>${input ? "正在读取输入画面" : "等待 ComfyUI 预览帧"}</strong><small>${input ? "ComfyUI 返回实时帧后会自动替换" : "部分节点只会在采样过程中发送预览"}</small></div>
          </div>
          <div class="running-copy">
            <span class="eyebrow">当前步骤 · <span id="running-stage">${escapeHtml(task.stage ?? "准备中")}</span></span>
            <div class="progress"><span id="running-progress-bar" style="width:${task.progress ?? 0}%"></span></div>
            <p>${escapeHtml(description)}</p>
            <div class="task-meta">${metadata}<span id="running-elapsed">${elapsedText(task.startedAt)}</span></div>
            <div class="running-controls">
              <button class="secondary button-with-icon" id="${state.queueRunning ? "pause-queue" : "start-queue"}">${icon(state.queueRunning ? "pause" : "play")}${state.queueRunning ? "本条完成后暂停" : "继续执行后续任务"}</button>
              <button class="danger secondary button-with-icon" data-cancel="${task.id}">${icon("ban")}取消当前任务</button>
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
        <div><span class="status ${task.status}">${statusLabel(task.status)}</span><h3>${escapeHtml(task.outputFilename)}</h3></div>
        <p>${escapeHtml(description)}</p>
        <div class="task-meta">${metadata}</div>
        ${task.error ? `<p class="error">${escapeHtml(task.error)}</p>` : ""}
      </div>
      <div class="task-actions">
        ${task.status === "waiting" ? `<div class="button-row"><button class="icon-button" data-move="${task.id}" data-direction="-1" aria-label="上移" title="上移">${icon("move-up")}</button><button class="icon-button" data-move="${task.id}" data-direction="1" aria-label="下移" title="下移">${icon("move-down")}</button></div>` : ""}
        ${task.status === "waiting" && task.taskType === "upscale" ? `<button class="secondary button-with-icon" data-edit-upscale-task="${task.id}">${icon("sliders-horizontal")}编辑</button>` : ""}
        <button class="secondary button-with-icon" data-duplicate="${task.id}">${icon("copy")}复制</button>
        ${task.status === "failed" || task.status === "cancelled" ? `<button class="primary button-with-icon" data-retry="${task.id}">${icon("refresh-cw")}重试并启动</button>` : ""}
        <button class="ghost danger button-with-icon" data-remove="${task.id}">${icon("trash-2")}移除</button>
      </div>
    </article>`;
}

function statusLabel(status: string): string {
  return { waiting: "等待", running: "运行中", completed: "完成", failed: "失败", cancelled: "已取消" }[status] ?? status;
}

function historyPage(): string {
  const cards = state.history.map((asset) => {
    const version = preferredVersion(asset);
    const historyTitle = asset.prompt.trim() || asset.title;
    const videoIndex = versionVideoIndex(version);
    const mediaUrl = historyMediaUrl(asset, version);
    const coverTime = historyCoverMode === "first"
      ? 0
      : Math.min(Math.max(asset.duration * 0.38, 0), Math.max(asset.duration - 0.1, 0));
    return `
      <article class="history-gallery-item panel" data-history="${asset.id}" tabindex="0" title="右键查看更多操作">
        <div class="history-media" style="--media-ratio:${version.width} / ${version.height}" data-history-media data-cover-time="${coverTime}" data-preview-duration="${asset.duration}">
          ${mediaUrl
            ? `<video muted loop playsinline preload="metadata" src="${mediaUrl}"></video>`
            : `<div class="history-media-fallback"><span>${icon("play")}</span><small>找不到视频文件</small></div>`}
          <div class="history-media-badges">
            <span class="media-chip">${historyCoverMode === "first" ? "第一帧" : `封面 ${formatVideoDuration(coverTime)}`}</span>
            <span class="media-chip">${version.height === 2160 ? "4K" : `${version.height}p`}</span>
            <span class="media-chip">${formatVideoDuration(asset.duration)}</span>
          </div>
          ${mediaUrl ? `<span class="history-preview-state">${icon("play")}正在预览</span><button type="button" class="history-preview-progress" role="slider" aria-label="调整预览进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="等待视频加载"><i></i></button>` : ""}
        </div>
        <div class="history-gallery-copy">
          <h3 class="history-card-title" title="${escapeHtml(historyTitle)}"><span class="history-card-title-track"><span>${escapeHtml(historyTitle)}</span><span aria-hidden="true">${escapeHtml(historyTitle)}</span></span></h3>
          <code>${escapeHtml(version.files[videoIndex]?.filename ?? version.outputFilename)}</code>
          <div class="history-item-meta"><span class="model-badge">${escapeHtml(modelName(version.modelId))}</span><span>最高 ${version.height === 2160 ? "4K" : `${version.height}p`}</span><span>${asset.versions.length} 个版本</span></div>
          <div class="history-item-actions"><span>${formatHistoryTime(asset.updatedAt)}</span><button class="ghost button-with-icon" data-open-history="${asset.id}">查看详情${icon("external-link")}</button></div>
        </div>
      </article>`;
  }).join("");
  return `
    <section class="history-heading">
      <div><div class="heading-line"><h1>历史作品</h1><span class="badge">${state.history.length} 个视频</span></div></div>
      <div class="history-view-tools">
        <label>封面<select id="history-cover-mode"><option value="random" ${historyCoverMode === "random" ? "selected" : ""}>随机帧</option><option value="first" ${historyCoverMode === "first" ? "selected" : ""}>第一帧</option></select></label>
        <div class="button-row"><button class="${historyLayout === "masonry" ? "secondary" : "ghost"} button-with-icon" data-history-layout="masonry">${icon("columns-3")}瀑布流</button><button class="${historyLayout === "album" ? "secondary" : "ghost"} button-with-icon" data-history-layout="album">${icon("layout-grid")}相册</button></div>
      </div>
    </section>
    <section class="history-gallery ${historyLayout}">
      ${state.history.length === 0
        ? `<div class="empty panel"><h2>还没有完成的视频</h2><p>队列完成后，结果会自动出现在这里。</p></div>`
        : cards}
    </section>`;
}

function historyMasonryColumnCount(width: number): number {
  if (width <= 480) return 1;
  if (width <= 680) return 2;
  if (width >= 1280) return 4;
  return 3;
}

function layoutHistoryMasonry(gallery: HTMLElement): number {
  const cards = [...gallery.querySelectorAll<HTMLElement>(".history-gallery-item")];
  if (!cards.length) return 0;
  const columnCount = historyMasonryColumnCount(gallery.clientWidth);
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
    const nextColumnCount = historyMasonryColumnCount(gallery.clientWidth);
    if (nextColumnCount === columnCount) return;
    columnCount = layoutHistoryMasonry(gallery);
  });
  historyMasonryResizeObserver.observe(gallery);
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
  selectedHistoryVersionId = version.id;
  const videoIndex = versionVideoIndex(version);
  const mediaUrl = historyMediaUrl(asset, version);
  const videoFile = videoIndex >= 0 ? version.files[videoIndex] : undefined;
  const historyIndex = state.history.findIndex((item) => item.id === asset.id);
  const previousAsset = historyIndex > 0 ? state.history[historyIndex - 1] : undefined;
  const nextAsset = historyIndex >= 0 ? state.history[historyIndex + 1] : undefined;
  const detailTitle = asset.prompt.trim() || asset.title;
  const completedAt = formatHistoryTime(version.createdAt);
  const fps = version.fps;
  const elapsedSeconds = version.startedAt
    ? Math.max(0, (new Date(version.createdAt).getTime() - new Date(version.startedAt).getTime()) / 1000)
    : null;
  return `
    <div class="history-detail-back">
      <button class="ghost button-with-icon" data-page="history">${icon("arrow-left")}返回历史</button>
      <div class="history-detail-tools">
        <span>任务记录为生成时的只读快照</span>
        <span class="history-detail-position" aria-label="当前历史作品位置">第 ${historyIndex + 1} / 共 ${state.history.length} 个</span>
        <div class="history-detail-navigation" aria-label="切换历史作品">
          <button class="ghost button-with-icon" data-history-navigation="-1" ${previousAsset ? "" : "disabled"} title="${previousAsset ? `上一个：${escapeHtml(previousAsset.title)}` : "已经是第一项"}">${icon("arrow-left")}上一个</button>
          <button class="ghost button-with-icon" data-history-navigation="1" ${nextAsset ? "" : "disabled"} title="${nextAsset ? `下一个：${escapeHtml(nextAsset.title)}` : "已经是最后一项"}">下一个${icon("arrow-right")}</button>
        </div>
      </div>
    </div>
    <section class="history-detail-hero">
      <div class="history-player-column">
        <div class="panel history-player">
          ${mediaUrl
            ? `<video controls loop playsinline preload="metadata" src="${mediaUrl}"></video>`
            : `<div class="history-media-fallback"><span>${icon("play")}</span><strong>视频文件不可用</strong><small>请检查输出目录或在下方定位文件。</small></div>`}
        </div>
        <div class="panel version-toolbar"><div class="version-switcher">${asset.versions.map((item) => `<button class="${item.id === version.id ? "primary" : "ghost"}" data-version-id="${item.id}">${item.kind === "original" ? "原始" : modelName(item.modelId)} ${item.height === 2160 ? "4K" : `${item.height}p`}</button>`).join("")}</div><span>${asset.versions.length} 个版本</span></div>
      </div>
      <aside class="panel history-summary">
        <div><div class="history-title-line"><h1 class="history-detail-title" title="${escapeHtml(detailTitle)}"><span class="history-card-title-track"><span>${escapeHtml(detailTitle)}</span><span aria-hidden="true">${escapeHtml(detailTitle)}</span></span></h1><span class="status running">已完成</span></div><code>${escapeHtml(videoFile?.filename ?? asset.outputFilename)}</code></div>
        <div class="history-summary-badges"><span class="model-badge">${escapeHtml(modelName(version.modelId))}</span><span>${version.width} × ${version.height} · ${version.duration}秒 · ${fps} FPS</span></div>
        <div class="history-summary-row"><span>完成于</span><strong>${completedAt}</strong></div>
        <div class="history-summary-row"><span>总耗时</span><strong>${elapsedSeconds == null ? "旧记录未保存" : `${Math.round(elapsedSeconds)} 秒`}</strong></div>
        <div class="history-summary-actions">
          <div class="history-primary-actions">
            <button class="secondary button-with-icon" data-edit-history="${asset.id}" aria-label="在创建页调整" title="在创建页调整">${icon("sliders-horizontal")}调整参数</button>
            ${videoFile?.absolutePath ? `<button class="secondary button-with-icon" data-continue-history="${asset.id}" data-source-version="${version.id}" aria-label="继续创作" title="继续创作">${icon("video")}继续创作</button><button class="secondary button-with-icon history-file-action" data-show-file="${escapeHtml(videoFile.absolutePath)}" aria-label="打开所在目录" title="打开所在目录">${icon("folder-open")}定位文件</button>` : ""}
          </div>
          <button class="ghost danger history-delete-button button-with-icon" data-delete-history="${asset.id}">${icon("trash-2")}删除视频和记录</button>
        </div>
        <div class="history-upscale"><div class="history-upscale-heading"><div><strong>提升清晰度</strong><span>完成后会作为同一作品的新版本显示。</span></div>${icon("maximize-2")}</div><button class="secondary button-with-icon" data-open-upscale ${videoFile?.absolutePath && version.height < 2160 ? "" : "disabled"}>${version.height >= 2160 ? "当前已是 4K" : "提升分辨率…"}</button></div>
      </aside>
    </section>
    <section class="history-record-grid">
      <article class="panel history-record full">
        <div class="history-record-heading"><h2>提示词</h2><button class="ghost button-with-icon" data-copy-prompt>${icon("copy")}复制提示词</button></div>
        <span class="muted">实际送入模型的完整提示词</span><div class="history-prompt-scroll" tabindex="0" aria-label="完整提示词"><p class="history-prompt">${escapeHtml(asset.prompt)}</p></div>
      </article>
      <article class="panel history-record">
        <h2>原始生成参数</h2>
        <dl><dt>模型</dt><dd>${escapeHtml(modelName(version.modelId))}</dd><dt>Seed</dt><dd><code>${version.seed ?? "不适用"}</code></dd><dt>工作流</dt><dd><code>${escapeHtml(version.workflowPath || "旧记录未保存")}</code></dd><dt>ComfyUI Prompt ID</dt><dd><code>${escapeHtml(version.comfyPromptId)}</code></dd></dl>
      </article>
      <article class="panel history-record">
        <h2>视频输出</h2>
        <dl><dt>分辨率</dt><dd>${version.width} × ${version.height}</dd><dt>版本类型</dt><dd>${version.kind === "original" ? "原始生成" : "分辨率提升"}</dd><dt>时长</dt><dd>${version.duration} 秒</dd><dt>成片帧率</dt><dd>${fps} FPS</dd><dt>成片帧数</dt><dd>${Math.round(version.duration * fps)}</dd><dt>输出目录</dt><dd><code>${escapeHtml(videoFile?.absolutePath ?? state.settings.outputDirectory)}</code></dd></dl>
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

function modelScanCard(profile: ModelScanProfile): string {
  const missingCount = profile.components.filter((component) => !component.found).length;
  return `
    <article class="panel model-profile ${profile.available ? "available" : "missing"}">
      <div class="model-profile-head">
        <div>
          <div class="model-title"><h3>${escapeHtml(profile.name)}</h3><span class="model-badge">${escapeHtml(profile.badge)}</span></div>
          <p class="muted">${escapeHtml(profile.description)}</p>
        </div>
        <span class="model-availability ${profile.available ? "available" : "missing"}">${profile.available ? `${icon("circle-check")} ${profile.integrated ? "可用" : "组件完整"}` : `${icon("circle-alert")} 缺少 ${missingCount} 项`}</span>
      </div>
      <div class="model-meta-line"><span>${escapeHtml(profile.vram)}</span><span>${profile.available ? profile.integrated ? "组件完整，可用于配置" : "依赖已完整；生成工作流将在下一阶段接入" : "补齐所有必需组件后才能启用"}</span></div>
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
        <section class="install-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="install-guide-title">
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
  const targetDirectory = `${configuredModelDirectory.replace(/[\\/]+$/, "")}\\${guide.targetSubdirectory}`;
  return `
    <div class="dialog-backdrop" id="install-guide-backdrop">
      <section class="install-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="install-guide-title">
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
    return `<div class="environment-empty">${environmentScanning ? `<span class="scan-spinner"></span><div><strong>正在扫描本机环境与模型目录…</strong><p>检查命令、GPU、本地服务及所有模型组件。</p></div>` : `<div><strong>尚未扫描</strong><p>点击右上角“重新扫描”检查当前电脑。</p></div>`}</div>`;
  }
  return `
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
                  ? `<button class="service-start secondary button-with-icon" data-restart-service="comfy" ${serviceStarting || serviceRestarting ? "disabled" : ""}>${icon("refresh-cw")}${serviceRestarting === "comfy" ? "重启中…最多等待 2 分钟" : "重启服务"}</button>`
                  : `<button class="service-start button-with-icon" data-start-service="comfy" ${serviceStarting || serviceRestarting ? "disabled" : ""}>${icon("play")}${serviceStarting === "comfy" ? "启动中…最多等待 2 分钟" : "一键启动"}</button>`
                : !item.ok && item.id === "lmstudio"
                  ? `<button class="service-start secondary button-with-icon" data-pick-lm-install>${icon("folder-open")}选择目录</button>`
                : !item.ok && item.id === "lmstudio-api"
                  ? `<button class="service-start button-with-icon" data-start-service="lmstudio" ${serviceStarting || serviceRestarting ? "disabled" : ""}>${icon("play")}${serviceStarting === "lmstudio" ? "启动中…" : "一键启动"}</button>`
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

function settingsPage(): string {
  const settings = settingsDraft ?? state.settings;
  const profiles = environmentScan?.modelProfiles ?? [];
  const videoProfiles = orderVideoProfiles(
    profiles.filter((profile) => profile.category === "video")
  );
  const upscaleProfiles = profiles.filter((profile) => profile.category === "upscale");
  const videoAvailable = videoProfiles.filter(
    (profile) => profile.available && profile.integrated
  ).length;
  const upscaleAvailable = upscaleProfiles.filter((profile) => profile.available).length;
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
  const gpuCards = gpuDevices.length
    ? `<div class="attention-runtime-grid">${gpuDevices.map((device) => `
        <article class="attention-runtime-card">
          <span class="runtime-label">GPU ${device.index}</span>
          <strong class="runtime-value">${escapeHtml(device.name)}</strong>
          <code class="runtime-detail">${formatBytes(device.vramTotalBytes)} 显存 · 驱动 ${escapeHtml(device.driverVersion || "未知")}</code>
        </article>`).join("")}</div>`
    : `<div class="scan-result">${escapeHtml(gpuSummary)}</div>`;
  const comfyInstallations = environmentScan?.comfyInstallations ?? [];
  const effectiveComfyInstallDirectory =
    environmentScan?.comfyInstallDirectory || settings.comfyInstallDirectory;

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
        <div class="section-heading"><div><h2>ComfyUI 连接</h2><span class="muted">连接运行中的 ComfyUI API</span></div><button class="secondary button-with-icon" data-test="comfy">${icon("zap")}测试连接</button></div>
        <label>服务地址<input id="comfy-url" value="${escapeHtml(settings.comfyUrl)}" placeholder="http://127.0.0.1:8188"></label>
        <p class="muted proxy-hint">默认使用 <code>http://127.0.0.1:8188</code>。一键启动与重启会直接让 ComfyUI 监听此地址。</p>
        <div id="connection-result" class="connection-result muted">尚未单独测试连接</div>
      </section>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>文件路径</h2><span class="muted">扫描结果可以一键写入，也可以手动定位</span></div></div>
        <div class="settings-grid two">
          <label>ComfyUI 模型目录<div class="input-action"><input id="model-directory" value="${escapeHtml(settings.modelDirectory)}" placeholder="扫描或选择 models 目录"><button class="secondary button-with-icon" id="pick-model-directory">${icon("folder-open")}选择</button></div></label>
          <label>视频输出目录<div class="input-action"><input id="output-directory" value="${escapeHtml(settings.outputDirectory)}" placeholder="扫描或选择 output 目录"><button class="secondary button-with-icon" id="pick-output-directory">${icon("folder-open")}选择</button></div></label>
        </div>
      </section>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>下载代理</h2><span class="muted">用于自动下载缺失的节点、Python 依赖和工作流；不会影响 ComfyUI 本地连接。</span></div><span class="model-badge">${settings.proxyEnabled ? "已开启" : "已关闭"}</span></div>
        <div class="settings-grid two">
          <label class="ios-switch-field"><span class="policy-copy"><strong>启用下载代理</strong><small>Git、pip 和工作流下载使用代理地址</small></span><input id="proxy-enabled" type="checkbox" ${settings.proxyEnabled ? "checked" : ""}><span class="ios-switch" aria-hidden="true"></span></label>
          <label>代理地址<input id="proxy-url" value="${escapeHtml(settings.proxyUrl)}" placeholder="http://127.0.0.1:7890"></label>
        </div>
        <p class="muted proxy-hint">默认关闭。开启后 Git 和 pip 下载使用此地址；可填写 <code>127.0.0.1:7890</code> 或完整代理 URL。</p>
      </section>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>GPU 运行策略</h2><span class="muted">${escapeHtml(gpuSummary)}</span></div><span class="model-badge">${escapeHtml(gpuBadge)}</span></div>
        ${gpuCards}
        <div class="runtime-policy-grid">
          <label class="policy-select-field"><span>显存安全余量</span><select id="vram-reserve"><option value="0.5" ${settings.vramReserveGb === 0.5 ? "selected" : ""}>0.5 GB · 激进</option><option value="0.75" ${settings.vramReserveGb === 0.75 ? "selected" : ""}>0.75 GB · 平衡</option><option value="1" ${settings.vramReserveGb === 1 ? "selected" : ""}>1 GB · 保守</option></select></label>
          <label class="ios-switch-field"><span class="policy-copy"><strong>安全取消</strong><small>先请求中断，再重启 ComfyUI 释放显存</small></span><input id="safe-cancel" type="checkbox" ${settings.safeCancel ? "checked" : ""}><span class="ios-switch" aria-hidden="true"></span></label>
          <label class="ios-switch-field"><span class="policy-copy"><strong>优化队列顺序</strong><small>允许按模型自动整理等待中的任务</small></span><input id="optimize-queue-setting" type="checkbox" ${settings.optimizeQueue ? "checked" : ""}><span class="ios-switch" aria-hidden="true"></span></label>
        </div>
      </section>
    </section>`;

  const videoPanel = `
    <section class="settings-panel">
      <section class="panel settings-section">
        <div class="section-heading">
          <div><h2>视频模型</h2><span class="muted">根据真实文件组件判断是否可用，不仅检查单个 checkpoint 名称。</span></div>
          <label class="compact-label">默认模型<select id="default-video-model">
            ${(videoProfiles.length ? videoProfiles : [
              { id: "minimax_h3_fl2va", name: "MiniMax H3 Image to Video", available: true, integrated: true },
              { id: "minimax_h3_fl2va_int4", name: "MiniMax H3 Image to Video · INT4 低显存", available: true, integrated: true },
              { id: "sulphur2", name: "Sulphur 2 GGUF", available: false, integrated: true },
              { id: "wan22_5b", name: "Wan 2.2 I2V 5B", available: false, integrated: true },
              { id: "hunyuan15", name: "HunyuanVideo 1.5 I2V", available: false, integrated: true }
            ]).map((profile) => `<option value="${profile.id}" ${settings.defaultVideoModel === profile.id ? "selected" : ""} ${!profile.available || profile.integrated === false ? "disabled" : ""}>${escapeHtml(profile.name)}${!profile.available ? " · 缺组件" : profile.integrated === false ? " · 工作流待接入" : ""}</option>`).join("")}
          </select></label>
        </div>
        <div class="scan-result">${environmentScanning ? "正在扫描模型目录…" : environmentScan ? `找到 ${videoAvailable} 个已接入可运行模型，${videoProfiles.length - videoAvailable} 个缺组件或等待工作流接入` : "等待首次扫描"}</div>
      </section>
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
      <div class="model-profile-list">${videoProfiles.length ? videoProfiles.map(modelScanCard).join("") : `<div class="panel environment-empty">尚无模型扫描结果</div>`}</div>
    </section>`;

  const promptPanel = `
    <section class="settings-panel">
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
        <div class="token-list">${["PROMPT", "NEGATIVE_PROMPT", "SEED", "INPUT_IMAGE", "END_IMAGE", "SOURCE_VIDEO", "TRIM_START", "TRIM_END", "EXTENSION_FRAMES", "OVERLAP_FRAMES", "UNLOAD_BETWEEN_STAGES", "WIDTH", "HEIGHT", "DURATION", "SOURCE_FPS", "FPS", "FRAMES", "OUTPUT_FRAMES", "OUTPUT_FILENAME"].map((token) => `<code>{{${token}}}</code>`).join("")}</div>
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
    (node) => node.installed && !node.loadError
  ).length ?? 0;
  const h3CoreNodes = environmentScan?.comfyCompatibility.coreNodes ?? [];
  const h3CoreKnown = environmentScan?.comfyCompatibility.checkedFrom !== "";
  const h3CoreReady = h3CoreNodes.length > 0 && h3CoreNodes.every((node) => node.available);
  const workflowDependencies = environmentScan?.workflowDependencies ?? [];
  const nodeDependencyAvailable = nodeInstalled + (h3CoreReady ? 1 : 0) +
    workflowDependencies.filter((workflow) => workflow.installed).length;
  const nodeDependencyTotal = (environmentScan?.customNodes.length ?? 0) + 1 +
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
            <div class="model-title"><h3>MiniMax H3 I2V 核心节点</h3><span class="model-badge">ComfyUI 核心</span></div>
            <p>这些节点随 ComfyUI 核心提供，不应安装成第三方 custom node；缺失时更新所选 ComfyUI 核心并重启复检。</p>
            <div class="component-list">
              ${h3CoreNodes.map((node) => `<div class="component-row ${node.available ? "found" : "missing"}"><span class="component-state">${icon(node.available ? "circle-check" : "circle-alert")}</span><div><strong>${escapeHtml(node.label)}</strong><code>${escapeHtml(node.id)}</code></div></div>`).join("") || `<div class="component-row missing"><span class="component-state">${icon("circle-alert")}</span><div><strong>等待扫描核心节点</strong></div></div>`}
            </div>
            <span class="muted">最低参考提交 <code>${escapeHtml(environmentScan?.comfyCompatibility.h3MinimumRevision ?? "")}</code></span>
            ${comfyUpdateLog ? `<details class="node-log" open><summary>核心处理日志</summary><pre>${escapeHtml(comfyUpdateLog)}</pre></details>` : ""}
          </div>
          <div class="custom-node-actions">
            <span class="model-availability ${h3CoreReady ? "available" : "missing"}">${h3CoreReady ? `${icon("circle-check")} 已加载` : h3CoreKnown ? `${icon("circle-alert")} 核心缺失` : `${icon("circle-help")} 尚未启动检测`}</span>
            ${h3CoreReady ? "" : `<button class="primary button-with-icon" id="repair-h3-core" ${coreDependencyRepairing ? "disabled" : ""}>${icon(coreDependencyRepairing ? "refresh-cw" : "shield-check")}${coreDependencyRepairing ? "处理中…" : h3CoreKnown ? "一键补齐/更新" : "启动并检测"}</button>`}
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
              <button class="primary button-with-icon" data-install-workflow="${escapeHtml(workflow.id)}" ${workflowDependencyInstalling ? "disabled" : ""}>${icon(workflowDependencyInstalling === workflow.id ? "refresh-cw" : "download")}${workflowDependencyInstalling === workflow.id ? "安装中…" : workflow.installed ? "重新安装" : "一键安装"}</button>
            </div>
          </article>`).join("")}
        ${(environmentScan?.customNodes ?? []).map((node) => `
          <article class="panel custom-node-card ${node.installed && !node.loadError ? "available" : "missing"}">
            <div class="custom-node-copy">
              <div class="model-title"><h3>${escapeHtml(node.name)}</h3><span class="model-badge">${node.required ? "项目必需" : "可选"}</span></div>
              <p>${escapeHtml(node.purpose)}</p>
              <code>${escapeHtml(node.directory || node.repositoryUrl)}</code>
              ${node.loadError ? `<span class="node-error">${escapeHtml(node.loadError)}</span>` : ""}
              ${customNodeLogs[node.id] ? `<details class="node-log" open><summary>安装日志</summary><pre>${escapeHtml(customNodeLogs[node.id])}</pre></details>` : ""}
            </div>
            <div class="custom-node-actions">
              <span class="model-availability ${node.installed && !node.loadError ? "available" : "missing"}">${node.installed && !node.loadError ? `${icon("circle-check")} 已加载` : node.loadError ? `${icon("circle-alert")} 加载失败` : `${icon("circle-alert")} 未安装`}</span>
              ${node.installed && !node.loadError ? "" : `<button class="primary button-with-icon" data-install-node="${escapeHtml(node.id)}" ${customNodeInstalling ? "disabled" : ""}>${icon(customNodeInstalling === node.id ? "refresh-cw" : "download")}${customNodeInstalling === node.id ? "处理中…" : node.installed ? "修复/更新" : "安装"}</button>`}
            </div>
          </article>`).join("") || `<div class="panel environment-empty">等待环境扫描结果</div>`}
      </div>
    </section>`;

  const attention = environmentScan?.attentionAcceleration;
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
              <option value="pytorch" ${settings.h3AttentionMode === "pytorch" ? "selected" : ""}>兼容模式 · PyTorch Attention</option>
            </select>
          </label>
          <div class="acceleration-summary">
            <span class="acceleration-summary-icon">${icon(attention?.ready ? "circle-check" : "circle-alert")}</span>
            <div><strong>${escapeHtml(attention?.detail ?? "等待环境扫描")}</strong><span>兼容模式会自动移除 H3 工作流中的 SageAttention 节点。</span></div>
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

  const activePanel =
    settingsTab === "system" ? systemPanel :
    settingsTab === "acceleration" ? accelerationPanel :
    settingsTab === "video" ? videoPanel :
    settingsTab === "nodes" ? nodePanel :
    settingsTab === "prompt" ? promptPanel :
    upscalePanel;

  return `
    <section class="page-heading settings-heading">
      <div><div class="heading-line"><h1>设置</h1>${gpuDevices.length ? `<span class="model-badge">${escapeHtml(gpuBadge)}</span>` : ""}</div><p>模型扫描、GPU 显存检测和本地服务集中配置。</p></div>
      <div class="button-row"><button class="secondary button-with-icon" id="scan-environment" ${environmentScanning ? "disabled" : ""}>${icon(environmentScanning ? "refresh-cw" : "scan-search")}${environmentScanning ? "扫描中…" : "重新扫描全部"}</button><button class="primary button-with-icon" id="save-settings">${icon("save")}保存设置</button></div>
    </section>
    <div class="settings-layout">
      <nav class="settings-sidebar" aria-label="设置分类">
        ${([
          ["system", "settings", "系统与路径"],
          ["acceleration", "zap", "推理加速"],
          ["video", "images", "视频模型"],
          ["nodes", "workflow", "节点与工作流"],
          ["prompt", "sparkles", "提示词扩写"],
          ["upscale", "maximize-2", "分辨率提升"]
        ] as const).map(([id, iconName, label]) => `<button class="settings-tab ${settingsTab === id ? "active" : ""}" data-settings-tab="${id}"><span>${icon(iconName)}</span>${label}${id === "video" && environmentScan ? `<small>${videoAvailable}/${videoProfiles.length}</small>` : ""}${id === "nodes" && environmentScan ? `<small>${nodeDependencyAvailable}/${nodeDependencyTotal}</small>` : ""}${id === "upscale" && environmentScan ? `<small>${upscaleAvailable}/${upscaleProfiles.length}</small>` : ""}</button>`).join("")}
      </nav>
      <div class="settings-content">${activePanel}</div>
    </div>
    ${installGuideDialog()}`;
}

function render(): void {
  const playback = captureHistoryPlayback();
  historyMasonryResizeObserver?.disconnect();
  historyMasonryResizeObserver = null;
  historyTitleResizeObserver?.disconnect();
  historyTitleResizeObserver = null;
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
  } else if (page === "queue") {
    bindQueue();
    void loadQueueInputPreviews();
  }
  else if (page === "history" || page === "history-detail") bindHistory(playback);
  else if (page === "settings") bindSettings();
  restoreHistoryPlayback(playback);
}

function showMessage(message: string): void {
  flashMessage = message;
  render();
  window.setTimeout(() => {
    if (flashMessage === message) {
      flashMessage = "";
      render();
    }
  }, 3500);
}

function requestHistoryDeletion(assetId: string): void {
  const asset = state.history.find((item) => item.id === assetId);
  if (!asset) return;
  pendingConfirmation = {
    kind: "delete-history",
    assetId,
    title: asset.title
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

function openHistoryDetail(assetId: string): void {
  historyScrollPosition = window.scrollY;
  selectedHistoryAssetId = assetId;
  const asset = state.history.find((item) => item.id === assetId);
  selectedHistoryVersionId = asset ? preferredVersion(asset).id : "";
  page = "history-detail";
  render();
  window.scrollTo({ top: 0, behavior: "auto" });
}

async function copyHistoryText(value: string, successMessage: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    showMessage(successMessage);
  } catch {
    showMessage("复制失败，请检查系统剪贴板权限。");
  }
}

async function editHistoryAsset(assetId: string): Promise<void> {
  const asset = state.history.find((item) => item.id === assetId);
  if (!asset) return;
  const now = new Date().toISOString();
  const draft: Draft = {
    ...state.draft,
    modelId: asset.modelId,
    workflowPath: asset.workflowPath ?? state.draft.workflowPath,
    startImagePath: asset.startImagePath ?? state.draft.startImagePath,
    sourceWidth: 0,
    sourceHeight: 0,
    endImagePath: asset.endImagePath ?? "",
    ratio: asset.ratio ?? state.draft.ratio,
    resolution: ([480, 540, 720, 768].includes(asset.resolution)
      ? asset.resolution
      : state.draft.resolution) as Draft["resolution"],
    duration: asset.duration,
    fps: ([8, 12, 16, 24, 25, 30].includes(asset.fps ?? 24)
      ? asset.fps ?? 24
      : 24) as Draft["fps"],
    frameInterpolation: asset.frameInterpolation ?? "off",
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
    <button role="menuitem" data-history-action="edit"><span class="context-icon">${icon("sparkles")}</span><span><strong>使用此参数再创建</strong><small>带入提示词、模型和 Seed</small></span></button>
    <div class="history-context-separator" role="separator"></div>
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
    else if (action === "copy-path") {
      await copyHistoryText(absolutePath, "视频文件路径已复制。");
    } else if (action === "show-file") {
      const shown = await window.studio.showItemInFolder(absolutePath);
      if (!shown) showMessage("视频文件不存在或已经被移动。");
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
  } catch (error) {
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
  };
  document.querySelector("#cancel-confirmation")?.addEventListener("click", close);
  document.querySelector("#accept-confirmation")?.addEventListener("click", () => {
    void acceptConfirmation();
  });
  document.querySelector("#confirm-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) close();
  });
  const dialog = document.querySelector<HTMLElement>(".confirm-dialog");
  dialog?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
  dialog?.focus();
}

function bindShell(): void {
  document.querySelectorAll<HTMLElement>("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextPage = button.dataset.page as Page;
      const restoreHistory =
        page === "history-detail" && nextPage === "history";
      page = nextPage;
      flashMessage = "";
      render();
      window.requestAnimationFrame(() => {
        window.scrollTo({
          top: restoreHistory ? historyScrollPosition : 0,
          behavior: "auto"
        });
      });
    });
  });
  bindConfirmationDialog();
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
  const normalized = value == null ? 0 : Math.max(0, Math.min(100, value));
  return `<article class="panel performance-card"><span>${label}</span><strong id="${id}">${value == null ? "—" : `${Math.round(value)}${suffix}`}</strong><small id="${id}-detail">${escapeHtml(detail)}</small><div class="metric-bar"><i id="${id}-bar" style="width:${normalized}%"></i></div></article>`;
}

function patchDraft(patch: Partial<Draft>): void {
  state.draft = { ...state.draft, ...patch };
  draftRevision += 1;
  draftDirty = true;
  scheduleDraftSave();
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
        ? isMiniMaxH3Model(state.draft.modelId)
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
    updateH3PromptCheck(promptInput.value, Boolean(state.draft.endImagePath));
  });
  document.querySelector("#prompt-prev")?.addEventListener("click", () => {
    patchDraft({ activePromptVersion: Math.max(0, state.draft.activePromptVersion - 1) });
    render();
  });
  document.querySelector("#prompt-next")?.addEventListener("click", () => {
    patchDraft({ activePromptVersion: Math.min(state.draft.promptVersions.length - 1, state.draft.activePromptVersion + 1) });
    render();
  });
  document.querySelector("#prompt-enhance-mode")?.addEventListener("change", (event) => {
    promptEnhanceMode = (event.currentTarget as HTMLSelectElement).value as PromptEnhanceMode;
  });
  document.querySelector("#enhance-prompt")?.addEventListener("click", async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    button.textContent = "扩写中…";
    try {
      const text = await window.studio.enhancePrompt({
        prompt: activePrompt().text,
        modelId: state.draft.modelId,
        mode: promptEnhanceMode,
        imagePath: state.draft.startImagePath || undefined
      });
      const versions = [
        ...state.draft.promptVersions.slice(0, state.draft.activePromptVersion + 1),
        { id: crypto.randomUUID(), label: `扩写 ${state.draft.promptVersions.filter((item) => item.label.startsWith("扩写")).length + 1}`, text, createdAt: new Date().toISOString() }
      ];
      patchDraft({ promptVersions: versions, activePromptVersion: versions.length - 1 });
      render();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error));
    }
  });
  document.querySelector("#h3-prompt-template")?.addEventListener("click", () => {
    const template = createH3PromptTemplate(
      activePrompt().text,
      state.draft.duration,
      { hasEndImage: Boolean(state.draft.endImagePath) }
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
    showMessage(`已创建 H3 ${template.mode} 官方结构模板（${template.effectiveDurationSeconds.toFixed(2)} 秒、${template.shotCount} 个连续镜头），原内容仍可通过左箭头找回。`);
  });
  for (const id of ["model", "ratio", "resolution", "fps", "frame-interpolation", "motion", "seed"]) {
    document.querySelector(`#${id}`)?.addEventListener("change", async (event) => {
      const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
      if (id === "model") {
        const oldKey = bundledWorkflowKey(state.draft.modelId, state.draft.inputMode);
        const nextKey = bundledWorkflowKey(value, state.draft.inputMode);
        const oldBundledPath = bundledWorkflows[oldKey]?.path;
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
          ...(isMiniMaxH3Model(value)
            ? {
                ratio: "source" as const,
                resolution: 480 as const,
                duration: 5,
                fps: 24 as const,
                frameInterpolation: "off" as const,
                motion: "natural" as const
              }
            : {}),
          ...(!bundled?.supportsEndImage ? { endImagePath: "" } : {}),
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
        id === "fps" ? { fps: Number(value) as Draft["fps"] } :
        id === "frame-interpolation" ? { frameInterpolation: value as Draft["frameInterpolation"] } :
        id === "motion" ? { motion: value as Draft["motion"] } :
        { seed: value ? Number(value) : null };
      patchDraft(patch);
      if (id === "fps" || id === "frame-interpolation") render();
    });
  }
  document.querySelector("#keep-seed")?.addEventListener("change", (event) => {
    patchDraft({ keepSeedOnCopy: (event.target as HTMLInputElement).checked });
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
    pendingConfirmation = { kind: "clear-draft" };
    confirmationBusy = false;
    render();
  });
  document.querySelector("#enqueue")?.addEventListener("click", async () => {
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
    state = await window.studio.startQueue();
    render();
  });
  document.querySelector("#pause-queue")?.addEventListener("click", async () => {
    state = await window.studio.pauseQueue();
    render();
  });
  document.querySelector("#optimize-queue")?.addEventListener("click", async () => {
    state = await window.studio.optimizeQueue();
    showMessage("等待任务已按模型和工作流重新分组。");
  });
  document.querySelectorAll<HTMLElement>("[data-remove]").forEach((button) => {
    button.addEventListener("click", async () => {
      state = await window.studio.removeTask(button.dataset.remove!);
      render();
    });
  });
  document.querySelectorAll<HTMLElement>("[data-cancel]").forEach((button) => {
    button.addEventListener("click", async () => {
      state = await window.studio.cancelTask(button.dataset.cancel!);
      render();
    });
  });
  document.querySelectorAll<HTMLElement>("[data-move]").forEach((button) => {
    button.addEventListener("click", async () => {
      state = await window.studio.moveTask(
        button.dataset.move!,
        Number(button.dataset.direction) as -1 | 1
      );
      render();
    });
  });
  document.querySelectorAll<HTMLElement>("[data-duplicate]").forEach((button) => {
    button.addEventListener("click", async () => {
      state = await window.studio.duplicateTask(button.dataset.duplicate!);
      render();
    });
  });
  document.querySelectorAll<HTMLElement>("[data-retry]").forEach((button) => {
    button.addEventListener("click", async () => {
      state = await window.studio.retryTask(button.dataset.retry!);
      render();
    });
  });
  document.querySelectorAll<HTMLElement>("[data-edit-upscale-task]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = state.queue.find((item) => item.id === button.dataset.editUpscaleTask);
      if (!task || task.taskType !== "upscale") return;
      upscaleDialog = {
        taskId: task.id,
        assetId: task.sourceAssetId,
        versionId: task.sourceVersionId,
        targetHeight: task.targetHeight,
        modelId: task.modelId as typeof upscaleDialog extends { modelId: infer Model } ? Model : never,
        tileMode: "safe"
      };
      render();
    });
  });
}

function bindUpscaleDialog(): void {
  const closeUpscale = () => {
    upscaleDialog = null;
    render();
  };
  document.querySelector("#close-upscale")?.addEventListener("click", closeUpscale);
  document.querySelector("#cancel-upscale")?.addEventListener("click", closeUpscale);
  document.querySelector("#upscale-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeUpscale();
  });
  document.querySelectorAll<HTMLElement>("[data-upscale-height]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!upscaleDialog) return;
      upscaleDialog.targetHeight = Number(button.dataset.upscaleHeight) as typeof upscaleDialog.targetHeight;
      render();
    });
  });
  document.querySelector("#upscale-model")?.addEventListener("change", (event) => {
    if (!upscaleDialog) return;
    upscaleDialog.modelId = (event.currentTarget as HTMLSelectElement).value as typeof upscaleDialog.modelId;
    render();
  });
  document.querySelector("#upscale-tile")?.addEventListener("change", (event) => {
    if (!upscaleDialog) return;
    upscaleDialog.tileMode = (event.currentTarget as HTMLSelectElement).value as typeof upscaleDialog.tileMode;
    render();
  });
  document.querySelector("#enqueue-upscale")?.addEventListener("click", async () => {
    if (!upscaleDialog) return;
    const dialogState = upscaleDialog;
    const asset = state.history.find((item) => item.id === dialogState.assetId);
    const version = asset?.versions.find((item) => item.id === dialogState.versionId);
    const fileIndex = version ? versionVideoIndex(version) : -1;
    const sourceFile = fileIndex >= 0 ? version?.files[fileIndex] : undefined;
    if (!asset || !version || !sourceFile?.absolutePath) {
      showMessage("源视频文件不可用，无法创建提升任务。");
      return;
    }
    try {
      if (dialogState.taskId) {
        const [targetWidth, targetHeight] = upscaleDimensions(
          version.width,
          version.height,
          dialogState.targetHeight
        );
        state = await window.studio.updateUpscaleTask(dialogState.taskId, {
          targetWidth,
          targetHeight,
          modelId: dialogState.modelId,
          workflowPath: `builtin:upscale/${dialogState.modelId}`,
          tileMode: dialogState.tileMode,
          faceRestore: false,
          outputFilename: createUpscaleFilename(sourceFile.filename, targetHeight)
        });
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
      showMessage(dialogState.taskId ? "提升任务已更新。" : "分辨率提升任务已加入队列。");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error));
    }
  });
}

function bindHistory(playback: HistoryPlaybackSnapshot | null = null): void {
  bindHistoryMasonry();
  bindHistoryTitleMarquees();
  const detailVideo = document.querySelector<HTMLVideoElement>('.history-player video');
  if (detailVideo && !playback) {
    const startPlayback = () => {
      detailVideo.loop = true;
      void detailVideo.play().catch(() => {
        if (detailVideo.muted) return;
        detailVideo.muted = true;
        void detailVideo.play().catch(() => undefined);
      });
    };
    if (detailVideo.readyState >= 2) startPlayback();
    else detailVideo.addEventListener('canplay', startPlayback, { once: true });
  }
  document.querySelector("#history-cover-mode")?.addEventListener("change", (event) => {
    historyCoverMode = (event.currentTarget as HTMLSelectElement).value as typeof historyCoverMode;
    render();
  });
  document.querySelectorAll<HTMLElement>("[data-history-layout]").forEach((button) => {
    button.addEventListener("click", () => {
      historyLayout = button.dataset.historyLayout as typeof historyLayout;
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-history-navigation]").forEach((button) => {
    button.addEventListener("click", () => {
      const currentIndex = state.history.findIndex(
        (item) => item.id === selectedHistoryAssetId
      );
      const nextIndex = currentIndex + Number(button.dataset.historyNavigation);
      const nextAsset = state.history[nextIndex];
      if (!nextAsset) return;
      openHistoryDetail(nextAsset.id);
    });
  });
  document.querySelectorAll<HTMLElement>("[data-history-media]").forEach((media) => {
    const video = media.querySelector<HTMLVideoElement>("video");
    if (!video) return;
    const progress = media.querySelector<HTMLButtonElement>(".history-preview-progress");
    const fill = progress?.querySelector<HTMLElement>("i");
    const fallbackDuration = Number(media.dataset.previewDuration) || 0;
    let pendingSeekRatio: number | null = null;
    let seeking = false;
    let resumeAfterSeek = false;
    const coverTime = Number(media.dataset.coverTime) || 0;
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
    const prepareVideo = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        media.style.setProperty(
          "--media-ratio",
          `${video.videoWidth} / ${video.videoHeight}`
        );
      }
      if (pendingSeekRatio == null) seekCover();
      else seekToRatio(pendingSeekRatio);
    };
    if (video.readyState >= 1) prepareVideo();
    else video.addEventListener("loadedmetadata", prepareVideo, { once: true });
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
      if ((event?.target as HTMLElement | null)?.closest("button")) return;
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
      selectedHistoryVersionId = button.dataset.versionId!;
      render();
    });
  });
  document.querySelector("[data-open-upscale]")?.addEventListener("click", () => {
    const asset = state.history.find((item) => item.id === selectedHistoryAssetId);
    if (!asset) return;
    const version = currentHistoryVersion(asset);
    const targetHeight = ([720, 1080, 1440, 2160] as const).find(
      (height) => height > version.height
    );
    if (!targetHeight) return;
    const configuredModel = state.settings.defaultUpscaleModel;
    upscaleDialog = {
      assetId: asset.id,
      versionId: version.id,
      targetHeight,
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
      requestHistoryDeletion(button.dataset.deleteHistory!);
    });
  });
  document.querySelector("[data-copy-prompt]")?.addEventListener("click", async () => {
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
        await selectDraftVideo(filename, {
          assetId: asset.id,
          versionId: version.id,
          duration: version.duration,
          width: version.width,
          height: version.height
        });
        page = "create";
        render();
      } catch (error) {
        showMessage(error instanceof Error ? error.message : "无法继续创作");
      }
    });
  });
  document.querySelectorAll<HTMLElement>("[data-show-file]").forEach((button) => {
    button.addEventListener("click", async () => {
      const shown = await window.studio.showItemInFolder(button.dataset.showFile!);
      if (!shown) showMessage("文件不存在或当前路径还没有在本机生成。");
    });
  });
}

function formSettings(): Settings {
  const base = settingsDraft ?? state.settings;
  const value = (id: string, fallback: string) =>
    document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`#${id}`)?.value.trim() ?? fallback;
  const checked = (id: string, fallback: boolean) =>
    document.querySelector<HTMLInputElement>(`#${id}`)?.checked ?? fallback;
  return {
    comfyUrl: value("comfy-url", base.comfyUrl),
    comfyInstallDirectory: value(
      "comfy-install-directory",
      base.comfyInstallDirectory
    ),
    lmStudioUrl: value("lm-url", base.lmStudioUrl),
    lmStudioModel: value("lm-model", base.lmStudioModel),
    lmStudioInstallDirectory: value(
      "lm-install-directory",
      base.lmStudioInstallDirectory
    ),
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
    optimizeQueue: checked("optimize-queue-setting", base.optimizeQueue),
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
  environmentScanning = true;
  render();
  try {
    environmentScan = await window.studio.scanEnvironment(settings);
  } catch (error) {
    showMessage(`环境扫描失败：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    environmentScanning = false;
    render();
  }
}

function bindSettings(): void {
  if (!environmentScan && !environmentScanning) {
    void runEnvironmentScan(settingsDraft ?? state.settings);
    return;
  }
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(".settings-content input, .settings-content textarea, .settings-content select").forEach((input) => {
    const update = () => {
      settingsDraft = formSettings();
    };
    input.addEventListener("input", update);
    input.addEventListener("change", update);
  });
  document.querySelector<HTMLInputElement>("#proxy-enabled")?.addEventListener("change", () => {
    settingsDraft = formSettings();
    render();
  });
  document.querySelectorAll<HTMLElement>("[data-settings-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      settingsDraft = formSettings();
      settingsTab = button.dataset.settingsTab as typeof settingsTab;
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-install-profile]").forEach((button) => {
    button.addEventListener("click", () => {
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
      const currentSettings = formSettings();
      settingsDraft = currentSettings;
      customNodeInstalling = nodeId;
      render();
      try {
        const result = await window.studio.installCustomNode(nodeId, currentSettings);
        customNodeLogs = {
          ...customNodeLogs,
          [nodeId]: result.log || result.message
        };
        customNodeInstalling = "";
        environmentScan = await window.studio.scanEnvironment(currentSettings);
        showMessage(result.message);
      } catch (error) {
        customNodeInstalling = "";
        const message = error instanceof Error ? error.message : String(error);
        customNodeLogs = { ...customNodeLogs, [nodeId]: message };
        showMessage(`节点安装失败：${message}`);
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
  };
  document.querySelector("#close-install-guide")?.addEventListener("click", closeInstallGuide);
  document.querySelector("#dismiss-install-guide")?.addEventListener("click", closeInstallGuide);
  document.querySelector("#install-guide-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeInstallGuide();
  });
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
      previousSettings.modelDirectory !== nextSettings.modelDirectory ||
      previousSettings.outputDirectory !== nextSettings.outputDirectory ||
      previousSettings.lmStudioInstallDirectory !== nextSettings.lmStudioInstallDirectory;
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
    showMessage("设置已保存，将对下一项尚未开始的任务生效。");
  });
  document.querySelectorAll<HTMLElement>("[data-test]").forEach((button) => {
    button.addEventListener("click", async () => {
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
}

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

function setMetric(
  id: string,
  value: number | null,
  detail = ""
): void {
  const label = document.querySelector<HTMLElement>(`#${id}`);
  const detailElement = document.querySelector<HTMLElement>(`#${id}-detail`);
  const bar = document.querySelector<HTMLElement>(`#${id}-bar`);
  if (label) label.textContent = value == null ? "—" : `${Math.round(value)}%`;
  if (detailElement) detailElement.textContent = detail;
  if (bar) bar.style.width = `${value == null ? 0 : Math.max(0, Math.min(100, value))}%`;
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
      performanceMetrics.memoryUsedBytes / performanceMetrics.memoryTotalBytes * 100,
      `${formatBytes(performanceMetrics.memoryUsedBytes)} / ${formatBytes(performanceMetrics.memoryTotalBytes)}`
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
}, 2_000);

void window.studio.getState().then((initialState) => {
  state = initialState;
  render();
  void refreshPerformanceMetrics();
  void Promise.all([
    window.studio.getBundledWorkflow(state.draft.modelId, state.draft.inputMode),
    window.studio.scanEnvironment(state.settings)
  ]).then(([bundled, scan]) => {
    environmentScan = scan;
    if (bundled) {
      bundledWorkflows[bundledWorkflowKey(bundled.modelId, state.draft.inputMode)] = bundled;
      workflowCapabilities[bundled.path] = {
        supportsEndImage: bundled.supportsEndImage,
        supportsVideoExtension: bundled.supportsVideoExtension
      };
      if (!state.draft.workflowPath) {
        patchDraft({ workflowPath: bundled.path });
      }
    }
    render();
  }).catch(() => {
    // 创建页仍可手动选择工作流；详细扫描错误可在设置页重试查看。
  });
});
