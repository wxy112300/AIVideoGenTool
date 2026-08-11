import {
  app,
  BrowserWindow,
  crashReporter,
  dialog,
  ipcMain,
  Menu,
  protocol,
  shell,
  nativeImage,
  type MenuItemConstructorOptions
} from "electron";
import { createReadStream, promises as fs } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import type {
  AppState,
  AssetVersion,
  BundledWorkflow,
  ConnectionKind,
  Draft,
  EnhanceRequest,
  EnvironmentIssue,
  ExtensionQueueTask,
  GenerationQueueTask,
  HistoryAsset,
  HistoryFile,
  HistoryMigrationProgress,
  ImageAssetLibraryProgress,
  ImageGenerationQueueTask,
  ImageAssetVersion,
  ImageEditDraft,
  ImageGenerationRun,
  ImageHistoryProject,
  ImageMarkupSaveRequest,
  LocalServiceKind,
  QueueTask,
  Settings,
  SettingsSaveMode,
  TaskPerformanceStats,
  UpscaleQueueTask,
  UpscaleRequest,
  WindowCloseRequest,
  WindowCloseResponse
} from "../src/types.js";
import { createOutputFilename } from "../src/core/filename.js";
import { normalizeUiLocale } from "../src/core/i18n.js";
import {
  classifyFailureForRecovery,
  nextH3AttentionModeAfterCudaFailure,
  nextAutomaticRetryAttempt
} from "../src/core/recovery.js";
import { historyVideoPaths } from "../src/core/history-delete.js";
import { createHistoryCoverCacheKey } from "../src/core/history-cover.js";
import { historyFileCandidates } from "../src/core/history-media.js";
import { mergeChromiumFeatureList } from "../src/core/chromium-features.js";
import {
  extractComfyOutputFiles
} from "../src/core/comfy-output.js";
import { attachAbsoluteOutputPaths } from "../src/core/comfy-output-paths.js";
import {
  isImageGenerationQueueTask,
  moveWaitingTask,
  syncQueueVideoInputPaths
} from "../src/core/queue.js";
import {
  createImageSourceVersion,
  expandImageSeeds,
  nextImageVersionNumber,
  normalizeImageEditDraft
} from "../src/core/image-project.js";
import { promptModelBackend, promptModelSupportsImageEdit } from "../src/core/prompt-models.js";
import {
  imageModelAdapterFor,
  imageOutputDimensions,
  imageOutputFormatFromFilename,
  imageReferenceInputPath,
  imageLightningComponentFound,
  imageQualityProfileRequiresLightning,
  normalizeImageTargetResolution
} from "../src/core/image-workflow.js";
import {
  extensionOutputDimensions,
  extensionSafetyForTask,
  activityTimeoutMinutesForTask,
  extensionWorkflowSafetyErrors,
  generationSafetyForTask,
  isMiniMaxH3Fl2vaModel,
  isMiniMaxH3R2vModel,
  isMiniMaxH3Model,
  outputDimensions,
  validateApiWorkflow,
  workflowSupportsEndImage,
  workflowSupportsH3BoundaryExtension,
  workflowSupportsH3MotionContextExtension
} from "../src/core/workflow.js";
import {
  uniqueUpscaleFilename,
  upscaleDimensions
} from "../src/core/upscale.js";
import { JsonStore } from "./store.js";
import {
  copyFileToWindowsClipboard,
  resolveExistingHistoryFile
} from "./services/windows-clipboard.js";
import { isGemmaPromptModel, promptRuntimeForSettings } from "../src/core/prompt-models.js";
import {
  installAttentionAcceleration,
  installCustomNode,
  installWorkflowDependency,
  alignLocalComfyUiRuntimeProfile,
  forceStopComfyProcesses,
  repairEnvironmentIssue,
  resolveComfyOutputDirectory,
  restartLocalService,
  scanEnvironment,
  startLocalService,
  updateComfyUi
} from "./services/environment.js";
import {
  freeMemory,
  enhancePromptWithComfyUi,
  interrupt,
  submitImageTask,
  submitTask,
  TaskStalledError,
  warmNativePromptModel,
  testComfyUi,
  waitForTask
} from "./services/comfy-ui.js";
import {
  enhancePromptWithH3PromptWriter,
  promptWriterModelForSelection,
  releaseH3PromptWriter,
  testH3PromptWriter
} from "./services/h3-prompt-writer.js";
import {
  getPerformanceMetrics,
  startTaskPerformanceMonitor,
  type TaskPerformanceMonitor
} from "./services/performance.js";
import { finalizeExtensionOutput } from "./services/extension-media.js";
import {
  startAdaptiveVramWatchdog,
  type VramWatchdogMonitor
} from "./services/vram-watchdog.js";
import { getApplicationLogger, safeLogErrorMessage } from "./services/app-logger.js";
import {
  cleanupVideoHistoryMigration,
  isPathWithinDirectory,
  markVideoHistoryMigrationCommitted,
  planVideoHistoryMigration,
  prepareVideoHistoryMigration,
  rollbackVideoHistoryMigration,
  type PreparedVideoHistoryMigration
} from "./services/video-history-migration.js";
import {
  archiveImageReferences,
  cleanupImageAssetLibrary,
  organizeImageAssetLibrary,
  scanImageAssetLibrary
} from "./services/image-asset-library.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const studioProductName = "Local Video Studio";
const studioWindowTitle = () => `${studioProductName} v${app.getVersion()}`;
// Chromium 150 can fatally CHECK while Windows is temporarily rebuilding a
// multi-monitor topology. Its own feature flag is the intended kill switch.
const windowsChromiumWorkarounds = ["SkipEmptyDisplayHotplugEvent"] as const;
const appliedChromiumWorkarounds = process.platform === "win32"
  ? windowsChromiumWorkarounds
  : [];

if (appliedChromiumWorkarounds.length) {
  app.commandLine.appendSwitch(
    "disable-features",
    mergeChromiumFeatureList(
      app.commandLine.getSwitchValue("disable-features"),
      appliedChromiumWorkarounds
    )
  );
}

const historyCoverDirectory = () => path.join(app.getPath("userData"), "history-covers", "v3");
const historyCoverDigest = (key: string) => createHash("sha256").update(key).digest("hex");
const historyCoverPathFromDigest = (digest: string) =>
  path.join(historyCoverDirectory(), `${digest}.jpg`);
const historyCoverPath = (key: string) => historyCoverPathFromDigest(historyCoverDigest(key));
const historyCoverMetadataPath = (key: string) =>
  path.join(historyCoverDirectory(), `${historyCoverDigest(key)}.json`);

function historyCoverKeys(asset: HistoryAsset): string[] {
  const videoPattern = /\.(mp4|webm|mov|m4v|mkv)$/i;
  return asset.versions.map((version) => {
    const file = version.files.find((item) => videoPattern.test(item.filename));
    return createHistoryCoverCacheKey({
      assetId: asset.id,
      versionId: version.id,
      createdAt: version.createdAt,
      filename: file?.filename ?? version.outputFilename,
      absolutePath: file?.absolutePath ?? ""
    });
  });
}

async function removeHistoryCoverCache(asset: HistoryAsset): Promise<void> {
  await Promise.all(historyCoverKeys(asset).flatMap((key) => [
    fs.rm(historyCoverPath(key), { force: true }).catch(() => undefined),
    fs.rm(historyCoverMetadataPath(key), { force: true }).catch(() => undefined)
  ]));
}

interface HistoryCoverMetadata {
  sourceSize: number;
  sourceMtimeMs: number;
  generatedAt: string;
}

async function resolveHistorySourcePath(sourcePath: string): Promise<string | null> {
  const direct = await resolveExistingHistoryFile(sourcePath);
  if (direct) return direct;
  const state = store.get();
  const normalizedSource = path.resolve(sourcePath).toLowerCase();
  const file = state.history
    .flatMap((asset) => asset.versions.flatMap((version) => version.files))
    .find((candidate) =>
      candidate.absolutePath &&
      path.resolve(candidate.absolutePath).toLowerCase() === normalizedSource
    );
  return file
    ? resolveExistingHistoryFile(
        sourcePath,
        historyFileCandidates(file, state.settings)
      )
    : null;
}
let mainWindow: BrowserWindow | null = null;
let store: JsonStore;
let rendererHasUnsavedSettings = false;
let historyMigrationRunning = false;
let imageAssetLibraryRunning = false;
let pendingWindowCloseRequest: WindowCloseRequest | null = null;
let queueWorker: Promise<void> | null = null;
let activeController: AbortController | null = null;
let nativePromptController: AbortController | null = null;
let nativePromptWorker: Promise<unknown> | null = null;
let allowWindowClose = false;
let closeFlowRunning = false;
const hasSingleInstanceLock = app.requestSingleInstanceLock();
const appLogger = getApplicationLogger();
let fatalProcessErrorHandled = false;
const taskStageStartedAt = new Map<string, { stage: string; startedAt: number }>();

if (appliedChromiumWorkarounds.length) {
  appLogger.info(
    "app",
    "chromium-workaround-applied",
    "Applied Windows Chromium display hotplug crash workaround",
    { disabledFeatures: appliedChromiumWorkarounds }
  );
}

try {
  crashReporter.start({
    uploadToServer: false,
    compress: true
  });
} catch {
  // Crash reporting is best-effort and must not prevent the app from starting.
}

function errorLogMeta(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorStack: error.stack ?? ""
    };
  }
  return { errorType: typeof error };
}

function appLogSnapshot(limit?: number) {
  let crashDirectory = "";
  try {
    crashDirectory = app.getPath("crashDumps");
  } catch {
    // CrashReporter is initialized after Electron is ready.
  }
  return {
    ...appLogger.recent(limit),
    ...(crashDirectory ? { crashDirectory } : {})
  };
}

process.on("uncaughtException", (error) => {
  appLogger.fatal(
    "process",
    "uncaught-exception",
    safeLogErrorMessage(error),
    errorLogMeta(error)
  );
  if (fatalProcessErrorHandled) return;
  fatalProcessErrorHandled = true;
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 100);
});

process.on("unhandledRejection", (reason) => {
  appLogger.error(
    "process",
    "unhandled-rejection",
    safeLogErrorMessage(reason),
    errorLogMeta(reason)
  );
});

process.on("warning", (warning) => {
  appLogger.warn(
    "process",
    "runtime-warning",
    safeLogErrorMessage(warning),
    errorLogMeta(warning)
  );
});

protocol.registerSchemesAsPrivileged([
  {
    scheme: "studio-media",
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

if (!hasSingleInstanceLock) {
  app.quit();
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.on("child-process-gone", (_event, details) => {
  appLogger.error("process", "child-process-gone", "Electron child process exited", {
    type: details.type,
    reason: details.reason,
    exitCode: details.exitCode,
    serviceName: details.serviceName ?? ""
  });
});

function registerMediaProtocol(): void {
  protocol.handle("studio-media", async (request) => {
    try {
      const url = new URL(request.url);
      let filename: string | undefined;
      let trustedCacheFile = false;
      if (url.hostname === "cover") {
        const match = url.pathname.match(/^\/([a-f0-9]{64})\.jpg$/i);
        if (!match?.[1]) return new Response("Invalid cover", { status: 400 });
        filename = historyCoverPathFromDigest(match[1].toLowerCase());
        trustedCacheFile = true;
      } else if (url.hostname === "draft" && url.pathname === "/video") {
        filename = store.get().draft.sourceVideoPath;
      } else if (url.hostname === "draft" && url.pathname === "/reference-video") {
        filename = url.searchParams.get("source") ?? undefined;
      } else if (url.hostname === "history") {
        const [assetId, versionId, fileIndexText] = url.pathname.split("/").filter(Boolean);
        const fileIndex = Number(fileIndexText);
        const decodedAssetId = decodeURIComponent(assetId ?? "");
        const decodedVersionId = decodeURIComponent(versionId ?? "");
        const currentState = store.get();
        const asset = currentState.history.find((item) => item.id === decodedAssetId);
        if (asset) {
          const version = asset.versions.find((item) => item.id === decodedVersionId);
          const historyFile = Number.isInteger(fileIndex) && fileIndex >= 0
            ? version?.files[fileIndex]
            : undefined;
          filename = historyFile?.absolutePath;
          if (historyFile) {
            filename = await resolveExistingHistoryFile(
              filename ?? "",
              historyFileCandidates(historyFile, currentState.settings)
            ) ?? undefined;
            trustedCacheFile = Boolean(filename);
          }
        } else {
          const project = currentState.imageHistory.find((item) => item.id === decodedAssetId);
          const version = project?.versions.find((item) => item.id === decodedVersionId);
          const historyFile = Number.isInteger(fileIndex) && fileIndex === 0
            ? version?.file
            : undefined;
          filename = historyFile?.absolutePath;
          if (historyFile) {
            filename = await resolveExistingHistoryFile(
              filename ?? "",
              historyFileCandidates(historyFile, currentState.settings)
            ) ?? undefined;
            trustedCacheFile = Boolean(filename);
          }
        }
      } else if (url.hostname === "queue") {
        const taskId = decodeURIComponent(url.pathname.split("/").filter(Boolean)[0] ?? "");
        const task = store.get().queue.find((item) => item.id === taskId);
        filename = task?.taskType === "extension"
          ? task.sourceVideoPath
          : task?.taskType === "upscale"
            ? task.sourceFilePath
            : undefined;
      } else {
        return new Response("Not found", { status: 404 });
      }
      const resolvedFilename = filename
        ? trustedCacheFile
          ? filename
          : await resolveExistingHistoryFile(filename)
        : null;
      const stat = resolvedFilename
        ? await fs.stat(resolvedFilename).catch(() => null)
        : null;
      if (!resolvedFilename || !stat?.isFile()) {
        return new Response("Media file not found", { status: 404 });
      }
      filename = resolvedFilename;
      const contentType = new Map([
        [".mp4", "video/mp4"],
        [".m4v", "video/mp4"],
        [".webm", "video/webm"],
        [".mov", "video/quicktime"],
        [".mkv", "video/x-matroska"],
        [".gif", "image/gif"],
        [".png", "image/png"],
        [".jpg", "image/jpeg"],
        [".jpeg", "image/jpeg"],
        [".webp", "image/webp"],
        [".bmp", "image/bmp"]
      ]).get(path.extname(filename).toLowerCase()) ?? "application/octet-stream";
      const range = request.headers.get("range");
      const match = range?.match(/^bytes=(\d*)-(\d*)$/);
      if (range && (!match || (!match[1] && !match[2]))) {
        return new Response("Invalid range", {
          status: 416,
          headers: { "Content-Range": `bytes */${stat.size}` }
        });
      }
      let start = 0;
      let end = stat.size - 1;
      if (match?.[1]) {
        start = Number(match[1]);
        end = match[2] ? Number(match[2]) : stat.size - 1;
      } else if (match?.[2]) {
        const suffixLength = Number(match[2]);
        start = Math.max(0, stat.size - suffixLength);
      }
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        end < start ||
        start >= stat.size
      ) {
        return new Response("Range not satisfiable", {
          status: 416,
          headers: { "Content-Range": `bytes */${stat.size}` }
        });
      }
      end = Math.min(end, stat.size - 1);
      const partial = Boolean(match);
      const headers = new Headers({
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Headers": "Range",
        "Access-Control-Allow-Origin": "*",
        "Content-Type": contentType,
        "Content-Length": String(end - start + 1)
      });
      if (partial) headers.set("Content-Range", `bytes ${start}-${end}/${stat.size}`);
      if (request.method === "HEAD") {
        return new Response(null, { status: partial ? 206 : 200, headers });
      }
      const stream = Readable.toWeb(createReadStream(filename, { start, end }));
      return new Response(stream as BodyInit, {
        status: partial ? 206 : 200,
        headers
      });
    } catch {
      return new Response("Unable to open media", { status: 500 });
    }
  });
}

async function bundledWorkflowFor(
  modelId: string,
  inputMode: Draft["inputMode"] = "image"
): Promise<BundledWorkflow | null> {
  const ltxProfile = store.get().settings.ltxExtensionModelProfile;
  const ltxVariant = ltxProfile === "q2_distilled" ? "q2" : "dev";
  const ltxProfileLabel = {
    q2_distilled: "Q2_K distilled · 8GB 兼容",
    q3_k_m: "Q3_K_M dev · 均衡",
    q4_k_m: "Q4_K_M dev · 质量"
  }[ltxProfile];
  if (inputMode === "video") {
    if (modelId === "minimax_h3_fl2va_q3_gguf") {
      const filename = "minimax_h3_i2v_gguf_q3_api.json";
      const candidates = [
        path.join(app.getAppPath(), "workflows", filename),
        path.join(process.resourcesPath, "workflows", filename),
        path.resolve(currentDirectory, "..", "..", "..", "workflows", filename)
      ];
      for (const candidate of candidates) {
        if (!(await fs.stat(candidate).catch(() => null))) continue;
        const source = JSON.parse(await fs.readFile(candidate, "utf8")) as unknown;
        return {
          modelId,
          label: "内置 · MiniMax H3 Q3 GGUF · 3080 低显存实验（不支持续写）",
          path: candidate,
          supportsEndImage: workflowSupportsEndImage(source),
          supportsVideoExtension: false
        };
      }
      return null;
    }
    if (isMiniMaxH3R2vModel(modelId)) {
      const filename = "minimax_h3_r2v_extend_api.json";
      const candidates = [
        path.join(app.getAppPath(), "workflows", filename),
        path.join(process.resourcesPath, "workflows", filename),
        path.resolve(currentDirectory, "..", "..", "..", "workflows", filename)
      ];
      for (const candidate of candidates) {
        if (!(await fs.stat(candidate).catch(() => null))) continue;
        const source = JSON.parse(await fs.readFile(candidate, "utf8")) as unknown;
        return {
          modelId,
          label: "内置 · MiniMax H3 R2V Motion Context · 运动与音频连续",
          path: candidate,
          supportsEndImage: false,
          supportsVideoExtension: workflowSupportsH3MotionContextExtension(source)
        };
      }
      return null;
    }
    if (isMiniMaxH3Fl2vaModel(modelId)) {
      const filename = "minimax_h3_i2v_api.json";
      const candidates = [
        path.join(app.getAppPath(), "workflows", filename),
        path.join(process.resourcesPath, "workflows", filename),
        path.resolve(currentDirectory, "..", "..", "..", "workflows", filename)
      ];
      for (const candidate of candidates) {
        if (!(await fs.stat(candidate).catch(() => null))) continue;
        const source = JSON.parse(await fs.readFile(candidate, "utf8")) as unknown;
        return {
          modelId,
          label: "内置 · MiniMax H3 结尾帧接续 · 原生音视频",
          path: candidate,
          supportsEndImage: workflowSupportsEndImage(source),
          supportsVideoExtension: workflowSupportsH3BoundaryExtension(source)
        };
      }
      return null;
    }
    if (modelId !== "sulphur2") return null;
    const filename = `sulphur2_ltx23_extend_gguf_${ltxVariant}_api.json`;
    const candidates = [
      path.join(app.getAppPath(), "workflows", filename),
      path.join(process.resourcesPath, "workflows", filename),
      path.resolve(currentDirectory, "..", "..", "..", "workflows", filename)
    ];
    for (const candidate of candidates) {
      if (!(await fs.stat(candidate).catch(() => null))) continue;
      const source = JSON.parse(await fs.readFile(candidate, "utf8")) as unknown;
      return {
        modelId,
        label: `内置 · Sulphur 2 原生续写 · ${ltxProfileLabel}`,
        path: candidate,
        supportsEndImage: false,
        supportsVideoExtension: extensionWorkflowSafetyErrors(source).length === 0
      };
    }
    return null;
  }
  const definitions: Record<string, { filename: string; label: string }> = {
    minimax_h3_fl2va: {
      filename: "minimax_h3_i2v_api.json",
      label: "内置 · MiniMax H3 FL2VA · 原生 24 FPS 音视频"
    },
    minimax_h3_fl2va_int4: {
      filename: "minimax_h3_i2v_api.json",
      label: "内置 · MiniMax H3 FL2VA INT4 · 原生 24 FPS 音视频"
    },
    minimax_h3_fl2va_q3_gguf: {
      filename: "minimax_h3_i2v_gguf_q3_api.json",
      label: "内置 · MiniMax H3 Q3 GGUF · 低显存实验"
    },
    minimax_h3_fl2va_turbo: {
      filename: "minimax_h3_fl2va_turbo_api.json",
      label: "内置 · MiniMax H3 LightX2V Turbo FL2VA · 首尾帧音视频"
    },
    minimax_h3_ref2va: {
      filename: "minimax_h3_r2v_api.json",
      label: "内置 · MiniMax H3 R2V · 多参考音视频"
    },
    minimax_h3_ref2va_int4: {
      filename: "minimax_h3_r2v_api.json",
      label: "内置 · MiniMax H3 R2V INT4 · 多参考音视频"
    },
    sulphur2: {
      filename: `sulphur2_ltx23_i2v_gguf_${ltxVariant}_api.json`,
      label: `内置 · Sulphur 2 图生视频 · ${ltxProfileLabel}`
    },
    wan22_5b: {
      filename: "wan22_5b_i2v_api.json",
      label: "内置 · Wan 2.2 5B 图生视频"
    },
    hunyuan15: {
      filename: "hunyuan15_i2v_api.json",
      label: "内置 · HunyuanVideo 1.5 图生视频"
    },
    hunyuan15_sr: {
      filename: "hunyuan15_sr_i2v_api.json",
      label: "内置 · HunyuanVideo 1.5 双阶段 1080p 图生视频"
    },
    wan22_14b_nsfw: {
      filename: "wan22_14b_i2v_api.json",
      label: "内置 · Wan 2.2 I2V 14B + NSFW"
    },
    wan22_remix: {
      filename: "wan22_14b_gguf_i2v_api.json",
      label: "内置 · Wan 2.2 Remix v3"
    },
    wan22_smoothmix: {
      filename: "wan22_14b_gguf_i2v_api.json",
      label: "内置 · Wan 2.2 SmoothMix I2V"
    },
    wan22_dasiwa: {
      filename: "wan22_14b_gguf_i2v_api.json",
      label: "内置 · DaSiWa SynthSeduction v9"
    }
  };
  const definition = definitions[modelId];
  if (!definition) return null;
  const { filename, label } = definition;
  const candidates = [
    path.join(app.getAppPath(), "workflows", filename),
    path.join(process.resourcesPath, "workflows", filename),
    path.resolve(currentDirectory, "..", "..", "..", "workflows", filename)
  ];
  for (const candidate of candidates) {
    if (await fs.stat(candidate).catch(() => null)) {
      const source = JSON.parse(await fs.readFile(candidate, "utf8")) as unknown;
      return {
        modelId,
        label,
        path: candidate,
        supportsEndImage: workflowSupportsEndImage(source),
        supportsVideoExtension: extensionWorkflowSafetyErrors(source).length === 0
      };
    }
  }
  return null;
}

let lastQueueLogSignature = "";

function sendState(state = store.get()): void {
  const queueSignature = state.queue
    .map((task) => `${task.id}:${task.status}`)
    .join("|");
  if (queueSignature !== lastQueueLogSignature) {
    lastQueueLogSignature = queueSignature;
    appLogger.info("queue", "state-changed", "Queue state changed", {
      queueCount: state.queue.length,
      waitingCount: state.queue.filter((task) => task.status === "waiting").length,
      runningCount: state.queue.filter((task) => task.status === "running").length,
      failedCount: state.queue.filter((task) => task.status === "failed").length,
      cancelledCount: state.queue.filter((task) => task.status === "cancelled").length,
      queueRunning: state.queueRunning,
      taskOrder: state.queue.map((task) => task.id)
    });
  }
  mainWindow?.webContents.send("state:changed", state);
}

const videoOutputPattern = /\.(mp4|webm|mov|m4v|mkv)$/i;
const performanceLogIntervalMs = 30_000;

async function resolveTaskOutputDirectory(): Promise<string> {
  const configured = store.get().settings.outputDirectory.trim();
  const detected = await resolveComfyOutputDirectory(store.get().settings);
  return detected || configured;
}

async function requireExistingVideoOutput(
  result: unknown,
  alternateRoots: string[] = []
): Promise<ReturnType<typeof extractComfyOutputFiles>> {
  const outputDirectory = await resolveTaskOutputDirectory();
  if (!outputDirectory) {
    throw new Error(
      "ComfyUI 已返回完成状态，但无法确定输出目录。请在设置中确认 ComfyUI 目录后重试。"
    );
  }

  const reportedFiles = extractComfyOutputFiles(result);
  const roots = [...new Set([outputDirectory, ...alternateRoots].filter(Boolean))];
  let lastFiles = attachAbsoluteOutputPaths(reportedFiles, outputDirectory);
  for (const root of roots) {
    const files = attachAbsoluteOutputPaths(reportedFiles, root);
    lastFiles = files;
    const videoFiles = files.filter(
      (file) => file.absolutePath && videoOutputPattern.test(file.filename)
    );
    for (const file of videoFiles) {
      const resolved = await resolveExistingHistoryFile(file.absolutePath!);
      if (!resolved) continue;
      const stat = await fs.stat(resolved).catch(() => null);
      if (stat?.isFile() && stat.size > 0) return files;
    }
  }

  const returnedNames = lastFiles.map((file) => file.filename).join("、");
  throw new Error(
    returnedNames
      ? `ComfyUI 已返回完成状态，但输出视频不存在或为空：${returnedNames}`
      : "ComfyUI 已返回完成状态，但工作流没有返回任何视频文件。任务不会写入历史。"
  );
}

async function requireExistingImageOutput(
  result: unknown,
  outputRoot: string,
  alternateRoots: string[] = []
): Promise<ReturnType<typeof extractComfyOutputFiles>> {
  if (!outputRoot) {
    throw new Error(
      "ComfyUI 已返回图片完成状态，但无法确定输出目录。请在设置中确认 ComfyUI 目录后重试。"
    );
  }
  const reportedFiles = extractComfyOutputFiles(result);
  const configuredRoots = [outputRoot, ...alternateRoots].filter(Boolean);
  const parentRoots = configuredRoots
    .filter((root) => ["images", "videos"].includes(path.basename(path.resolve(root)).toLowerCase()))
    .map((root) => path.dirname(path.resolve(root)));
  const roots = [...new Set([...configuredRoots, ...parentRoots])];
  let lastFiles = attachAbsoluteOutputPaths(reportedFiles, outputRoot);
  for (const root of roots) {
    const files = attachAbsoluteOutputPaths(reportedFiles, root);
    lastFiles = files;
    const imageFiles = files.filter(
      (file) => file.absolutePath && imageOutputFormatFromFilename(file.filename) === "png"
    );
    for (const file of imageFiles) {
      const resolved = await resolveExistingHistoryFile(file.absolutePath!);
      if (!resolved) continue;
      const stat = await fs.stat(resolved).catch(() => null);
      if (stat?.isFile() && stat.size > 0) return files;
    }
  }
  const returnedNames = lastFiles.map((file) => file.filename).join("、");
  throw new Error(
    returnedNames
      ? `ComfyUI 已返回完成状态，但图片输出不存在或为空：${returnedNames}`
      : "ComfyUI 已返回完成状态，但图片工作流没有返回任何图片文件。"
  );
}

function restoreRecordedHistoryFiles(
  reportedFiles: HistoryFile[],
  recordedFiles: HistoryFile[],
  outputDirectory: string
): HistoryFile[] {
  const recordedPaths = new Map(
    recordedFiles
      .filter((file) => file.absolutePath)
      .map((file) => [`${file.subfolder}\u0000${file.filename}\u0000${file.type}`, file.absolutePath!])
  );
  const files = reportedFiles.length ? reportedFiles : recordedFiles;
  return files.map((file) => {
    const recordedPath = recordedPaths.get(`${file.subfolder}\u0000${file.filename}\u0000${file.type}`);
    if (recordedPath) return { ...file, absolutePath: recordedPath };
    return attachAbsoluteOutputPaths([file], outputDirectory)[0] ?? file;
  });
}

async function restoreHistoryOutputPaths(): Promise<void> {
  const outputDirectory = await resolveTaskOutputDirectory();
  if (!outputDirectory) return;

  await store.update((state) => {
    for (const asset of state.history) {
      const originalAssetFiles = extractComfyOutputFiles(asset.comfyOutputs);
      asset.files = restoreRecordedHistoryFiles(
        originalAssetFiles.length ? originalAssetFiles : asset.files,
        asset.files,
        outputDirectory
      );
      for (const version of asset.versions) {
        const originalVersionFiles = extractComfyOutputFiles(version.comfyOutputs);
        version.files = restoreRecordedHistoryFiles(
          originalVersionFiles.length ? originalVersionFiles : version.files,
          version.files,
          outputDirectory
        );
      }
    }
    state.queue = syncQueueVideoInputPaths(state.queue, state.history);
  });
}

async function waitWithTimeout(
  promise: Promise<unknown> | null,
  timeoutMs: number
): Promise<boolean> {
  if (!promise) return true;
  return Promise.race([
    promise.then(() => true, () => true),
    new Promise<boolean>((resolve) =>
      setTimeout(() => resolve(false), timeoutMs)
    )
  ]);
}

async function cleanupCancelledQueueTask(
  taskId: string,
  settings: Settings,
  worker: Promise<void> | null
): Promise<void> {
  try {
    if (settings.safeCancel) {
      await interrupt(settings).catch((error) => {
        appLogger.warn("comfy", "cancel-interrupt-failed", "ComfyUI interrupt request failed during background cancellation cleanup", {
          taskId,
          error: safeLogErrorMessage(error)
        });
      });
    }
    const workerSettled = await waitWithTimeout(worker, 15_000);
    if (settings.safeCancel && workerSettled) {
      try {
        await freeMemory(settings);
        await updateTask(taskId, {
          stage: "任务已取消，显存已释放",
          error: "任务已取消"
        });
        return;
      } catch (error) {
        appLogger.warn("comfy", "cancel-free-memory-failed", "ComfyUI memory release failed after task cancellation; falling back to restart", {
          taskId,
          error: safeLogErrorMessage(error)
        });
      }
    }
    const recovery = await restartLocalService("comfy", settings);
    await updateTask(taskId, {
      stage: recovery.ok ? "任务已取消，ComfyUI 已后台重启" : "任务已取消，但 ComfyUI 清理失败",
      error: recovery.ok
        ? "任务已取消"
        : `任务已取消；ComfyUI 清理失败：${recovery.message}`
    });
  } catch (error) {
    appLogger.error("comfy", "cancel-cleanup-failed", "Background cancellation cleanup failed", {
      taskId,
      error: safeLogErrorMessage(error)
    });
    await updateTask(taskId, {
      stage: "任务已取消，但 ComfyUI 清理失败",
      error: `任务已取消；ComfyUI 清理失败：${safeLogErrorMessage(error)}`
    }).catch(() => undefined);
  }
}

async function interruptForExit(waitForWorker: boolean): Promise<{
  interrupted: boolean;
  workerSettled: boolean;
}> {
  const settings = store.get().settings;
  const hadNativePrompt = Boolean(nativePromptWorker);
  const next = await store.update((state) => {
    state.queueRunning = false;
  });
  sendState(next);
  activeController?.abort(new Error("应用退出，任务已中止"));
  nativePromptController?.abort(new Error("应用退出，提示词扩写已中止"));
  const interruptPromise = interrupt(settings).then(
    async () => {
      appLogger.info("comfy", "shutdown-interrupt-succeeded", "ComfyUI interruption requested during shutdown");
      await freeMemory(settings).catch(() => undefined);
      return true;
    },
    (error) => {
      appLogger.warn("comfy", "shutdown-interrupt-failed", "ComfyUI interruption failed during shutdown", {
        error: safeLogErrorMessage(error)
      });
      return false;
    }
  );
  const interrupted = waitForWorker
    ? await interruptPromise
    : await Promise.race([
        interruptPromise,
        new Promise<boolean>((resolve) =>
          setTimeout(() => resolve(false), 2_500)
        )
      ]);
  const workerSettled = waitForWorker
    ? await waitWithTimeout(queueWorker, 15_000)
    : false;
  const promptSettled = waitForWorker
    ? await waitWithTimeout(nativePromptWorker, 15_000)
    : false;
  return {
    interrupted: interrupted || (hadNativePrompt && promptSettled),
    workerSettled: workerSettled && promptSettled
  };
}

function sendHistoryMigrationProgress(progress: HistoryMigrationProgress): void {
  mainWindow?.webContents.send("history-migration:progress", progress);
}

function sendImageAssetLibraryProgress(progress: ImageAssetLibraryProgress): void {
  mainWindow?.webContents.send("image-assets:progress", progress);
}

async function effectiveImageInputLibraryDirectory(settings: Settings): Promise<string> {
  const configured = settings.imageInputLibraryDirectory.trim();
  if (configured) return path.resolve(configured);
  const outputRoot = await resolveComfyOutputDirectory(settings);
  if (!outputRoot) {
    throw new Error("无法确定 ComfyUI input 目录，请先选择 ComfyUI 实例或手动设置图片素材库目录。");
  }
  return path.join(path.dirname(path.resolve(outputRoot)), "input", "LocalVideoStudio");
}

async function materializeDefaultImageInputLibraryDirectory(): Promise<void> {
  if (store.get().settings.imageInputLibraryDirectory.trim()) return;
  const directory = await effectiveImageInputLibraryDirectory(store.get().settings).catch(() => "");
  if (!directory) return;
  await store.update((state) => {
    if (!state.settings.imageInputLibraryDirectory.trim()) {
      state.settings.imageInputLibraryDirectory = directory;
    }
  });
  appLogger.info("settings", "image-input-library-defaulted", "Default image input library was saved", {
    directory
  });
}

async function effectiveVideoOutputDirectory(settings: Settings): Promise<string> {
  const configured = settings.outputDirectory.trim();
  if (configured) return path.resolve(configured);
  const detected = await resolveComfyOutputDirectory({
    ...settings,
    outputDirectory: ""
  });
  return detected ? path.resolve(detected) : "";
}

async function validateVideoOutputDirectoryChange(
  previous: Settings,
  next: Settings
): Promise<{ oldDirectory: string; newDirectory: string }> {
  const oldDirectory = await effectiveVideoOutputDirectory(previous);
  const newDirectory = await effectiveVideoOutputDirectory(next);
  if (!newDirectory) {
    throw new Error("无法确定新的视频输出目录，请先启动或选择 ComfyUI 实例。");
  }
  if (!oldDirectory || oldDirectory.toLowerCase() === newDirectory.toLowerCase()) {
    return { oldDirectory, newDirectory };
  }
  const outputRoot = await resolveComfyOutputDirectory({
    ...previous,
    outputDirectory: ""
  }) || oldDirectory;
  if (!isPathWithinDirectory(outputRoot, newDirectory)) {
    throw new Error("视频输出目录必须位于当前 ComfyUI output 目录内。");
  }
  return { oldDirectory, newDirectory };
}

function applyVideoMigrationPaths(
  state: AppState,
  plan: PreparedVideoHistoryMigration["plan"]
): void {
  for (const entry of plan.entries) {
    for (const reference of entry.references) {
      if (reference.kind === "queue") {
        const task = state.queue.find((item) => item.id === reference.taskId);
        if (task?.taskType === "extension" && reference.field === "sourceVideoPath") {
          task.sourceVideoPath = entry.targetPath;
          task.updatedAt = new Date().toISOString();
        } else if (task?.taskType === "upscale" && reference.field === "sourceFilePath") {
          task.sourceFilePath = entry.targetPath;
          task.updatedAt = new Date().toISOString();
        }
        continue;
      }
      const asset = state.history.find((item) => item.id === reference.assetId);
      if (!asset) continue;
      if (reference.versionId) {
        const version = asset.versions.find((item) => item.id === reference.versionId);
        const file = version?.files[reference.fileIndex];
        if (file) file.absolutePath = entry.targetPath;
      } else {
        const file = asset.files[reference.fileIndex];
        if (file) file.absolutePath = entry.targetPath;
      }
    }
  }
}

async function finishWindowClose(): Promise<void> {
  appLogger.info("app", "shutdown", "Application shutdown started");
  await releasePromptRuntime(store.get().settings);
  rendererHasUnsavedSettings = false;
  pendingWindowCloseRequest = null;
  allowWindowClose = true;
  mainWindow?.destroy();
  if (process.platform !== "darwin") app.quit();
}

async function handleWindowClose(): Promise<void> {
  if (!mainWindow || closeFlowRunning) return;
  if (historyMigrationRunning) {
    await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "目录迁移正在进行",
      message: "请等待历史视频迁移完成后再退出应用。",
      buttons: ["知道了"],
      noLink: true
    });
    return;
  }
  const runningTask = store
    .get()
    .queue.find((task) => task.status === "running");
  const hasRunningWork = Boolean(
    runningTask || activeController || queueWorker || nativePromptWorker
  );
  if (!hasRunningWork && !rendererHasUnsavedSettings) {
    await finishWindowClose();
    return;
  }
  if (!hasRunningWork && rendererHasUnsavedSettings) {
    closeFlowRunning = true;
    pendingWindowCloseRequest = { kind: "unsaved-settings" };
    mainWindow.webContents.send("window:close-requested", pendingWindowCloseRequest);
    return;
  }
  closeFlowRunning = true;
  pendingWindowCloseRequest = {
    kind: "running-work",
    hasUnsavedSettings: rendererHasUnsavedSettings
  };
  mainWindow.webContents.send("window:close-requested", pendingWindowCloseRequest);
}

async function finishRunningWorkClose(
  response: "finish-tasks" | "force-exit"
): Promise<void> {
  try {
    if (!mainWindow) return;
    mainWindow.setTitle(`正在结束任务并退出… · ${studioWindowTitle()}`);
    if (response === "force-exit") {
      await interruptForExit(false);
      await finishWindowClose();
      return;
    }
    const result = await interruptForExit(true);
    if (!result.interrupted || !result.workerSettled) {
      const fallback = await dialog.showMessageBox(mainWindow, {
        type: "warning",
        title: "任务清理尚未完成",
        message: "没有收到完整的任务中止确认。",
        detail:
          "可以继续等待，或强制退出。强制退出前会再次尝试通知 ComfyUI 中断当前计算。",
        buttons: ["继续等待", "强制退出", "取消退出"],
        defaultId: 0,
        cancelId: 2,
        noLink: true
      });
      if (fallback.response === 2) return;
      if (fallback.response === 0) {
        const retried = await interruptForExit(true);
        if (!retried.interrupted || !retried.workerSettled) return;
      } else {
        await interruptForExit(false);
      }
    }
    await finishWindowClose();
  } finally {
    closeFlowRunning = false;
    if (!allowWindowClose && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setTitle(studioWindowTitle());
    }
  }
}

function createWindow(): void {
  allowWindowClose = false;
  appLogger.info("window", "created", "Main window created");
  mainWindow = new BrowserWindow({
    title: studioWindowTitle(),
    width: 1280,
    height: 860,
    minWidth: 820,
    minHeight: 620,
    backgroundColor: "#181818",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(currentDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  });
  mainWindow.setMenuBarVisibility(false);
  try {
    const requestedLanguages = ["en-US", "zh-CN", "zh"];
    const availableLanguages = mainWindow.webContents.session.availableSpellCheckerLanguages;
    const spellCheckerLanguages = requestedLanguages.filter((language) =>
      availableLanguages.includes(language)
    );
    if (spellCheckerLanguages.length) {
      mainWindow.webContents.session.setSpellCheckerLanguages(spellCheckerLanguages);
    }
  } catch {}
  mainWindow.webContents.on("context-menu", (event, params) => {
    if (!params.isEditable) return;
    event.preventDefault();
    const menuItems: MenuItemConstructorOptions[] = [];
    const suggestions = (params.dictionarySuggestions ?? []).slice(0, 5);
    if (params.misspelledWord) {
      if (suggestions.length) {
        menuItems.push(
          ...suggestions.map((suggestion) => ({
            label: suggestion,
            click: () => mainWindow?.webContents.replaceMisspelling(suggestion)
          }))
        );
      } else {
        menuItems.push({ label: "没有拼写建议", enabled: false });
      }
      menuItems.push({ type: "separator" });
    }
    menuItems.push(
      { label: "撤销", role: "undo", enabled: params.editFlags.canUndo },
      { label: "重做", role: "redo", enabled: params.editFlags.canRedo },
      { type: "separator" },
      { label: "剪切", role: "cut", enabled: params.editFlags.canCut },
      { label: "复制", role: "copy", enabled: params.editFlags.canCopy },
      { label: "粘贴", role: "paste", enabled: params.editFlags.canPaste },
      { label: "全选", role: "selectAll", enabled: params.editFlags.canSelectAll }
    );
    Menu.buildFromTemplate(menuItems).popup({ window: mainWindow! });
  });
  mainWindow.on("close", (event) => {
    appLogger.info("window", "close-requested", "Main window close requested", {
      hasRunningTask: store.get().queue.some((task) => task.status === "running")
    });
    if (allowWindowClose) return;
    event.preventDefault();
    void handleWindowClose();
  });
  mainWindow.on("closed", () => {
    appLogger.info("window", "closed", "Main window closed");
    mainWindow = null;
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    appLogger.error("renderer", "process-gone", "Renderer process exited", {
      reason: details.reason,
      exitCode: details.exitCode
    });
  });
  mainWindow.webContents.on("unresponsive", () => {
    appLogger.warn("renderer", "unresponsive", "Renderer became unresponsive");
  });
  mainWindow.webContents.on("responsive", () => {
    appLogger.info("renderer", "responsive", "Renderer became responsive");
  });
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    appLogger.error("renderer", "load-failed", "Renderer failed to load", {
      errorCode,
      errorDescription
    });
  });

  const developmentUrl = process.env.VITE_DEV_SERVER_URL;
  if (developmentUrl) {
    void mainWindow.loadURL(developmentUrl);
  } else {
    void mainWindow.loadFile(
      path.join(currentDirectory, "..", "..", "renderer", "index.html")
    );
  }
}

function promptOf(draft: Draft): string {
  return (
    draft.promptVersions[draft.activePromptVersion]?.text ??
    draft.promptVersions.at(-1)?.text ??
    ""
  ).trim();
}

function queueTaskFromDraft(draft: Draft, state: AppState): GenerationQueueTask {
  const now = new Date().toISOString();
  const prompt = promptOf(draft);
  const names = [
    ...state.queue.map((item) => item.outputFilename),
    ...state.history.map((item) => item.outputFilename)
  ];
  return {
    id: crypto.randomUUID(),
    taskType: "generation",
    status: "waiting",
    createdAt: now,
    updatedAt: now,
    outputFilename: createOutputFilename(draft.modelId, draft.resolution, draft.duration, names),
    prompt,
    promptVersion: draft.activePromptVersion + 1,
    h3ReferenceSlots: draft.h3ReferenceSlots.map((slot) => ({ ...slot })),
    startImagePath: draft.startImagePath,
    sourceWidth: draft.sourceWidth,
    sourceHeight: draft.sourceHeight,
    endImagePath: draft.endImagePath,
    modelId: draft.modelId,
    workflowPath: draft.workflowPath,
    ratio: draft.ratio,
    resolution: draft.resolution,
    duration: draft.duration,
    steps: draft.steps,
    fps: draft.fps,
    frameInterpolation: draft.frameInterpolation,
    motion: draft.motion,
    ...(draft.modelId === "sulphur2"
      ? { modelProfile: state.settings.ltxExtensionModelProfile }
      : {}),
    seed: draft.seed ?? Math.floor(Math.random() * Number.MAX_SAFE_INTEGER),
    keepSeedOnCopy: draft.keepSeedOnCopy,
    attentionMode: state.settings.h3AttentionMode,
    spectrumMode: draft.spectrumMode,
    progress: 0
  };
}

function imageTaskFromDraft(
  draft: ImageEditDraft,
  state: AppState,
  diffusionModelFilename: string | undefined,
  outputTarget: {
    root: string;
    directory: string;
    subfolder: string;
  }
): ImageGenerationQueueTask {
  const now = new Date().toISOString();
  const prompt = draft.promptVersions[draft.activePromptVersion]?.text.trim() ?? "";
  const id = crypto.randomUUID();
  const projectId = draft.projectId ?? crypto.randomUUID();
  const seeds = expandImageSeeds(draft.seed, draft.outputCount);
  const runs: ImageGenerationRun[] = seeds.map((seed, index) => ({
    id: crypto.randomUUID(),
    index,
    seed,
    status: "waiting"
  }));
  const outputFilename = `QwenEdit-${new Date().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14)}-${id.slice(0, 8)}`;
  const basePicture = draft.pictures[0];
  const targetResolution = normalizeImageTargetResolution(
    draft.targetResolution,
    basePicture?.width ?? 0,
    basePicture?.height ?? 0
  );
  const [outputWidth, outputHeight] = imageOutputDimensions(
    basePicture?.width ?? 0,
    basePicture?.height ?? 0,
    targetResolution
  );
  return {
    id,
    taskType: "image-generation",
    status: "waiting",
    createdAt: now,
    updatedAt: now,
    outputFilename,
    projectId,
    parentVersionId: draft.parentVersionId,
    pictures: draft.pictures.map((picture) => ({
      ...picture,
      ...(picture.markup ? { markup: { ...picture.markup } } : {})
    })),
    imageOutputRoot: outputTarget.root,
    imageOutputDirectory: outputTarget.directory,
    imageOutputSubfolder: outputTarget.subfolder,
    outputWidth,
    outputHeight,
    targetResolution,
    ...(diffusionModelFilename ? { diffusionModelFilename } : {}),
    prompt,
    promptVersion: draft.activePromptVersion + 1,
    modelId: draft.modelId,
    workflowPath: "builtin:image/qwen-image-edit-2511",
    qualityProfile: draft.qualityProfile,
    outputFormat: "png",
    outputCount: runs.length,
    runs,
    progress: 0
  };
}

async function resolveImageOutputTarget(settings: Settings): Promise<{
  root: string;
  directory: string;
  subfolder: string;
}> {
  const detectedRoot = await resolveComfyOutputDirectory(settings);
  const rootCandidate = detectedRoot || settings.outputDirectory.trim();
  if (!rootCandidate) throw new Error("无法确定 ComfyUI output 目录，无法准备图片输出目录。");
  const root = path.resolve(rootCandidate);
  const configured = settings.imageOutputDirectory.trim();
  const directory = path.resolve(configured || path.join(root, "Images"));
  if (!isPathWithinDirectory(root, directory)) {
    throw new Error("图片输出目录必须位于当前 ComfyUI output 目录内。");
  }
  await fs.mkdir(directory, { recursive: true });
  return {
    root,
    directory,
    subfolder: path.relative(root, directory).replaceAll(path.sep, "/")
  };
}

function readImageDimensions(filename: string): { width: number; height: number } {
  const image = nativeImage.createFromPath(filename);
  const size = image.getSize();
  if (!size.width || !size.height) {
    throw new Error(`无法读取 Picture 图片尺寸：${filename}`);
  }
  return { width: size.width, height: size.height };
}

async function requireImageModelAssets(
  settings: Settings,
  modelId = settings.defaultImageModel,
  qualityProfile = "native"
): Promise<string> {
  const scan = await scanEnvironment(settings);
  const profile = scan.modelProfiles.find((item) => item.id === modelId);
  if (!profile?.available) {
    const missing = profile?.components
      .filter((component) => !component.found)
      .map((component) => component.expected)
      .join("、");
    throw new Error(
      `Qwen Image Edit 2511 组件尚未完整${missing ? `，缺少：${missing}` : ""}。`
    );
  }
  if (
    imageQualityProfileRequiresLightning(qualityProfile) &&
    !imageLightningComponentFound(profile.components)
  ) {
    throw new Error(
      "当前选择了 Qwen Lightning 4 步档，但未找到 Lightning LoRA。请在设置 → 图片模型中打开下载说明并重新扫描。"
    );
  }
  const diffusionModel = profile.components
    .find((component) => component.label.includes("扩散模型"))
    ?.matches[0]
    ?.split(/[\\/]/u)
    .pop();
  if (!diffusionModel) {
    throw new Error("Qwen Image Edit 2511 扩散模型文件未能从环境扫描结果中解析。");
  }
  return diffusionModel;
}

function extensionTaskFromDraft(
  draft: Draft,
  state: AppState
): ExtensionQueueTask {
  const now = new Date().toISOString();
  const prompt = promptOf(draft);
  const settings = state.settings;
  return {
    id: crypto.randomUUID(),
    taskType: "extension",
    status: "waiting",
    createdAt: now,
    updatedAt: now,
    outputFilename: createOutputFilename(
      draft.modelId,
      isMiniMaxH3Fl2vaModel(draft.modelId) || isMiniMaxH3R2vModel(draft.modelId)
        ? draft.resolution
        : settings.ltxExtensionResolution,
      draft.duration,
      outputNames(state)
    ),
    prompt,
    promptVersion: draft.activePromptVersion + 1,
    sourceVideoPath: draft.sourceVideoPath,
    sourceVideoDuration: draft.sourceVideoDuration,
    trimStartSeconds: draft.trimStartSeconds,
    trimEndSeconds: draft.trimEndSeconds,
    sourceAssetId: draft.sourceAssetId,
    sourceVersionId: draft.sourceVersionId,
    sourceWidth: draft.sourceWidth,
    sourceHeight: draft.sourceHeight,
    modelId: draft.modelId,
    workflowPath: draft.workflowPath,
    ratio: "source",
    resolution: isMiniMaxH3Fl2vaModel(draft.modelId) || isMiniMaxH3R2vModel(draft.modelId)
      ? draft.resolution
      : settings.ltxExtensionResolution,
    duration: draft.duration,
    steps: draft.steps,
    fps: draft.fps,
    frameInterpolation: draft.frameInterpolation,
    motion: draft.motion,
    modelProfile: settings.ltxExtensionModelProfile,
    seed: draft.seed ?? Math.floor(Math.random() * Number.MAX_SAFE_INTEGER),
    keepSeedOnCopy: draft.keepSeedOnCopy,
    attentionMode: state.settings.h3AttentionMode,
    spectrumMode: isMiniMaxH3R2vModel(draft.modelId) ? "off" : draft.spectrumMode,
    maxGeneratedFrames: isMiniMaxH3Fl2vaModel(draft.modelId) || isMiniMaxH3R2vModel(draft.modelId)
      ? 362
      : settings.ltxExtensionFrames,
    overlapFrames: settings.ltxExtensionOverlapFrames,
    unloadBetweenStages: settings.ltxExtensionUnloadBetweenStages,
    progress: 0
  };
}

function outputNames(state: AppState): string[] {
  return [
    ...state.queue.map((item) => item.outputFilename),
    ...state.history.flatMap((asset) =>
      asset.versions.map((version) => version.outputFilename)
    )
  ];
}

function upscaleTaskFromRequest(
  request: UpscaleRequest,
  state: AppState
): UpscaleQueueTask {
  const now = new Date().toISOString();
  const [targetWidth] = upscaleDimensions(
    request.sourceWidth,
    request.sourceHeight,
    request.targetHeight
  );
  return {
    id: crypto.randomUUID(),
    taskType: "upscale",
    status: "waiting",
    createdAt: now,
    updatedAt: now,
    outputFilename: uniqueUpscaleFilename(
      request.sourceFilename,
      request.targetHeight,
      outputNames(state)
    ),
    modelId: request.modelId,
    workflowPath: `builtin:upscale/${request.modelId}`,
    duration: request.duration,
    fps: request.fps,
    seed: Math.floor(Math.random() * 0xffffffff),
    keepSeedOnCopy: true,
    sourceAssetId: request.sourceAssetId,
    sourceVersionId: request.sourceVersionId,
    sourceFilePath: request.sourceFilePath,
    sourceFilename: request.sourceFilename,
    sourceWidth: request.sourceWidth,
    sourceHeight: request.sourceHeight,
    targetWidth,
    targetHeight: request.targetHeight,
    tileMode: request.tileMode === "fast" || request.tileMode === "auto"
      ? request.tileMode
      : "safe",
    faceRestore: request.faceRestore,
    progress: 0
  };
}

async function updateTask(
  taskId: string,
  patch: Partial<QueueTask>
): Promise<AppState> {
  const next = await store.update((state) => {
    const task = state.queue.find((item) => item.id === taskId);
    if (!task) return;
    if (patch.status && patch.status !== task.status) {
      appLogger.info("queue", "task-status", "Queue task status changed", {
        taskId,
        taskType: task.taskType,
        modelId: task.modelId,
        status: patch.status
      });
    }
    if (patch.stage && patch.stage !== task.stage) {
      const previousStage = taskStageStartedAt.get(taskId);
      if (previousStage) {
        appLogger.info("queue", "stage-duration", "Queue task stage finished", {
          taskId,
          taskType: task.taskType,
          modelId: task.modelId,
          stage: previousStage.stage,
          durationSeconds: Math.round((Date.now() - previousStage.startedAt) / 1000)
        });
      }
      taskStageStartedAt.set(taskId, { stage: patch.stage, startedAt: Date.now() });
      patch.stageStartedAt = new Date().toISOString();
      appLogger.info("queue", "task-stage", "Queue task stage changed", {
        taskId,
        taskType: task.taskType,
        modelId: task.modelId,
        progress: patch.progress ?? task.progress ?? 0,
        stage: patch.stage
      });
    }
    Object.assign(task, patch, { updatedAt: new Date().toISOString() });
  });
  sendState(next);
  return next;
}

function isLocalComfyUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return (
      hostname === "127.0.0.1" ||
      hostname === "localhost" ||
      hostname === "::1" ||
      hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

async function ensureComfyUiReady(taskId: string): Promise<void> {
  const settings = store.get().settings;
  const queuedTask = store.get().queue.find((item) => item.id === taskId);
  const serviceSettings = comfyUiSettingsForQueueTask(queuedTask, settings);
  const profile = await alignLocalComfyUiRuntimeProfile(serviceSettings);
  if (!profile.ok) {
    throw new Error(`ComfyUI 运行配置切换失败：${profile.message}`);
  }
  if (profile.restarted) {
    appLogger.info("service", "runtime-profile-aligned", "ComfyUI runtime profile was aligned for the queue task", {
      taskId,
      taskType: queuedTask?.taskType ?? "unknown",
      modelId: queuedTask?.modelId ?? "unknown",
      previousProfile: profile.previousProfile,
      desiredProfile: profile.desiredProfile
    });
  }
  try {
    await testComfyUi(serviceSettings);
    return;
  } catch (connectionError) {
    appLogger.warn("service", "connection-unavailable", "ComfyUI was not ready", {
      taskId,
      local: isLocalComfyUrl(settings.comfyUrl),
      error: safeLogErrorMessage(connectionError)
    });
    if (!isLocalComfyUrl(settings.comfyUrl)) {
      throw new Error(
        `无法连接 ComfyUI（${settings.comfyUrl}）：${
          connectionError instanceof Error
            ? connectionError.message
            : String(connectionError)
        }`
      );
    }
  }

  await updateTask(taskId, {
    progress: 1,
    stage: "正在启动 ComfyUI，等待服务就绪"
  });
  appLogger.info("service", "auto-start-requested", "Queue requested automatic ComfyUI startup", {
    taskId
  });
  const started = await startLocalService("comfy", serviceSettings);
  appLogger.info(
    "service",
    started.ok ? "auto-start-succeeded" : "auto-start-failed",
    started.message,
    { taskId, ok: started.ok }
  );
  if (!started.ok) {
    throw new Error(`ComfyUI 自动启动失败：${started.message}`);
  }
  await testComfyUi(serviceSettings);
}

function comfyUiSettingsForQueueTask(
  task: QueueTask | undefined,
  settings: Settings
): Settings {
  return {
    ...settings,
    // Qwen image editing needs its aggressive CPU-VAE profile. Every other
    // workflow must explicitly opt out even when Qwen is the persisted default
    // image model, otherwise H3 inherits CPU FP32 VAE execution and its FP16
    // decoder fails with a dtype mismatch.
    defaultImageModel: task?.taskType === "image-generation"
      ? task.modelId
      : ""
  };
}

async function ensureComfyUiReadyForPrompt(settings: Settings): Promise<void> {
  try {
    await testComfyUi(settings);
    return;
  } catch (connectionError) {
    appLogger.warn("service", "prompt-connection-unavailable", "ComfyUI was not ready for prompt runtime", {
      local: isLocalComfyUrl(settings.comfyUrl),
      error: safeLogErrorMessage(connectionError)
    });
    if (!isLocalComfyUrl(settings.comfyUrl)) {
      throw new Error(
        `无法连接 ComfyUI（${settings.comfyUrl}）：${
          connectionError instanceof Error ? connectionError.message : String(connectionError)
        }`
      );
    }
  }
  const started = await startLocalService("comfy", settings);
  if (!started.ok) throw new Error(`ComfyUI 自动启动失败：${started.message}`);
  await testComfyUi(settings);
}

async function validateNativePromptRuntime(settings: Settings): Promise<void> {
  const scan = await scanEnvironment(settings);
  const profile = scan.modelProfiles.find(
    (item) => item.id === settings.promptModelId && item.category === "prompt"
  );
  if (!profile?.available) {
    const missing = profile?.components
      .filter((component) => !component.found)
      .map((component) => component.expected)
      .join("、");
    throw new Error(
      `提示词模型尚未就绪${missing ? `，缺少：${missing}` : ""}。请把模型放入 ComfyUI/models/text_encoders 后重新扫描。`
    );
  }
  if (!scan.comfyCompatibility.promptCoreSupported) {
    const missing = scan.comfyCompatibility.promptCoreNodes
      .filter((node) => !node.available)
      .map((node) => node.id)
      .join("、");
    throw new Error(
      `当前 ComfyUI 核心缺少提示词节点：${missing || "TextGenerate"}。请更新 ComfyUI、重启服务后重试。`
    );
  }
}

async function releasePromptRuntime(settings: Settings): Promise<number> {
  if (isGemmaPromptModel(settings.promptModelId)) {
    try {
      return await releaseH3PromptWriter(settings) ? 1 : 0;
    } catch {
      return 0;
    }
  }
  try {
    await freeMemory(settings);
    return 1;
  } catch {
    // An offline ComfyUI instance cannot be holding the native prompt model.
    return 0;
  }
}

async function releasePromptRuntimeForUser(): Promise<{ ok: boolean; message: string }> {
  const settings = store.get().settings;
  if (store.get().queueRunning || activeController || queueWorker) {
    return { ok: false, message: "当前有视频任务正在运行，暂不能释放提示词模型。" };
  }
  if (nativePromptWorker) {
    return { ok: false, message: "当前正在生成提示词，请等待本次扩写完成。" };
  }
  if (isGemmaPromptModel(settings.promptModelId)) {
    try {
      const released = await releaseH3PromptWriter(settings);
      return { ok: true, message: released ? "已请求 ComfyUI 卸载 H3 Prompt Writer 模型并释放显存。" : "当前没有已加载的 Prompt Writer 模型。" };
    } catch {
      return { ok: true, message: "ComfyUI 当前未运行，无需释放提示词模型。" };
    }
  }
  try {
    await freeMemory(settings);
    return { ok: true, message: "已请求 ComfyUI 卸载提示词模型并释放显存。" };
  } catch {
    return { ok: true, message: "ComfyUI 当前未运行，无需释放提示词模型。" };
  }
}

async function stabilizeH3RuntimeBetweenTasks(
  taskId: string,
  modelId: string,
  settings: Settings
): Promise<boolean> {
  const gib = 1024 ** 3;
  const before = await getPerformanceMetrics(settings).catch(() => null);
  appLogger.info("comfy", "h3-release-started", "Releasing H3 runtime before the next queue task", {
    taskId,
    modelId,
    vramUsedBytes: before?.vramUsedBytes ?? null,
    vramTotalBytes: before?.vramTotalBytes ?? null
  });
  try {
    await freeMemory(settings);
  } catch (error) {
    appLogger.warn("comfy", "h3-release-request-failed", "H3 runtime release request failed; restarting ComfyUI", {
      taskId,
      modelId,
      error: safeLogErrorMessage(error)
    });
    const recovery = await restartLocalService("comfy", settings);
    appLogger.info("comfy", recovery.ok ? "h3-release-restart-succeeded" : "h3-release-restart-failed", recovery.message, {
      taskId,
      modelId,
      recoveryOk: recovery.ok
    });
    return recovery.ok;
  }

  const deadline = Date.now() + 20_000;
  let stableSamples = 0;
  let lastSample = before;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const sample = await getPerformanceMetrics(settings).catch(() => null);
    if (!sample?.vramUsedBytes || !sample.vramTotalBytes) continue;
    lastSample = sample;
    const belowSafeLevel = sample.vramUsedBytes <= sample.vramTotalBytes * 0.45;
    const releasedSubstantially = before?.vramUsedBytes != null &&
      before.vramUsedBytes - sample.vramUsedBytes >= 4 * gib;
    const gpuIdle = sample.gpuPercent == null || sample.gpuPercent < 10;
    stableSamples = gpuIdle && (belowSafeLevel || releasedSubstantially)
      ? stableSamples + 1
      : 0;
    if (stableSamples >= 2) {
      appLogger.info("comfy", "h3-release-verified", "H3 runtime release was verified before continuing the queue", {
        taskId,
        modelId,
        vramBeforeBytes: before?.vramUsedBytes ?? null,
        vramAfterBytes: sample.vramUsedBytes,
        vramTotalBytes: sample.vramTotalBytes,
        gpuPercent: sample.gpuPercent
      });
      return true;
    }
  }

  appLogger.warn("comfy", "h3-release-unverified", "H3 VRAM did not reach a safe idle level; restarting ComfyUI", {
    taskId,
    modelId,
    vramBeforeBytes: before?.vramUsedBytes ?? null,
    vramAfterBytes: lastSample?.vramUsedBytes ?? null,
    vramTotalBytes: lastSample?.vramTotalBytes ?? null,
    gpuPercent: lastSample?.gpuPercent ?? null
  });
  const recovery = await restartLocalService("comfy", settings);
  appLogger.info("comfy", recovery.ok ? "h3-release-restart-succeeded" : "h3-release-restart-failed", recovery.message, {
    taskId,
    modelId,
    recoveryOk: recovery.ok
  });
  return recovery.ok;
}

async function executeImageGenerationQueueTask(
  task: ImageGenerationQueueTask
): Promise<void> {
  const controller = new AbortController();
  activeController = controller;
  try {
    await updateTask(task.id, {
      status: "running",
      progress: 1,
      stage: "准备图片批次",
      startedAt: new Date().toISOString(),
      error: undefined
    });
    await ensureComfyUiReady(task.id);
    const totalRuns = Math.max(1, task.runs.length);
    for (const plannedRun of task.runs) {
      const current = store.get().queue.find((item) => item.id === task.id);
      if (!current || !isImageGenerationQueueTask(current)) return;
      const run = current.runs.find((item) => item.id === plannedRun.id);
      if (!run || run.status === "completed") continue;
      const runStartedAt = new Date().toISOString();
      await store.update((state) => {
        const queued = state.queue.find((item) => item.id === task.id);
        if (!queued || !isImageGenerationQueueTask(queued)) return;
        const queuedRun = queued.runs.find((item) => item.id === run.id);
        if (!queuedRun) return;
        queuedRun.status = "running";
        queuedRun.startedAt = runStartedAt;
        queuedRun.progress = 1;
        queued.stage = `生成第 ${run.index + 1} / ${totalRuns} 张`;
      });
      sendState(store.get());
      const monitor = startTaskPerformanceMonitor();
      try {
        const submitted = await submitImageTask(
          current,
          { ...run, status: "running" },
          store.get().settings,
          controller.signal
        );
        let lastProgress = -1;
        const result = await waitForTask(
          submitted.promptId,
          submitted.clientId,
          submitted.nodeTypes,
          store.get().settings,
          20,
          controller.signal,
          (progress, stage) => {
            const batchProgress = ((run.index + Math.max(0, progress) / 100) / totalRuns) * 100;
            if (Math.round(batchProgress) < lastProgress + 2 && progress < 100) return;
            lastProgress = Math.round(batchProgress);
            void updateTask(task.id, {
              progress: Math.min(99, batchProgress),
              stage: `第 ${run.index + 1} / ${totalRuns} 张 · ${stage}`
            });
          },
          (dataUrl) => {
            mainWindow?.webContents.send("task:preview", {
              taskId: task.id,
              dataUrl
            });
          },
          () => true
        );
        const files = await requireExistingImageOutput(
          result,
          task.imageOutputRoot ?? await resolveTaskOutputDirectory(),
          [store.get().settings.outputDirectory]
        );
        const file = files.find((candidate) => imageOutputFormatFromFilename(candidate.filename) === "png");
        if (!file) throw new Error("图片工作流没有返回可用图片文件。");
        const performanceStats = monitor.stop();
        const completedAt = new Date().toISOString();
        const versionId = crypto.randomUUID();
        const next = await store.update((state) => {
          const queued = state.queue.find((item) => item.id === task.id);
          if (!queued || !isImageGenerationQueueTask(queued)) return;
          let project = state.imageHistory.find((item) => item.id === queued.projectId);
          const projectCreated = !project;
          if (!project) {
            project = {
              mediaKind: "image",
              id: queued.projectId,
              title: queued.prompt.slice(0, 32) || "未命名图片",
              createdAt: completedAt,
              updatedAt: completedAt,
              coverMode: "auto",
              nextVersionNumber: 1,
              versions: []
            };
            state.imageHistory.unshift(project);
          }
          if (projectCreated && project.versions.length === 0) {
            const sourcePicture = queued.pictures[0];
            if (sourcePicture?.absolutePath) {
              const sourceVersion = createImageSourceVersion(sourcePicture, queued.createdAt);
              sourceVersion.versionNumber = nextImageVersionNumber(project);
              project.versions.unshift(sourceVersion);
              project.nextVersionNumber = sourceVersion.versionNumber + 1;
            }
          }
          const versionNumber = nextImageVersionNumber(project);
          const version: ImageAssetVersion = {
            id: versionId,
            versionNumber,
            kind: "edit",
            parentVersionId: queued.parentVersionId,
            taskId: queued.id,
            runId: run.id,
            createdAt: completedAt,
            startedAt: runStartedAt,
            modelId: queued.modelId,
            workflowPath: queued.workflowPath,
            prompt: queued.prompt,
            promptVersion: queued.promptVersion,
            references: queued.pictures.map((picture) => ({ ...picture })),
            seed: run.seed,
            width: queued.outputWidth ?? queued.pictures[0]?.width ?? 0,
            height: queued.outputHeight ?? queued.pictures[0]?.height ?? 0,
            format: "png",
            file,
            comfyPromptId: submitted.promptId,
            comfyOutputs: result,
            performanceStats
          };
          project.versions.unshift(version);
          project.nextVersionNumber = versionNumber + 1;
          project.updatedAt = completedAt;
          const queuedRun = queued.runs.find((item) => item.id === run.id);
          if (queuedRun) {
            queuedRun.status = "completed";
            queuedRun.progress = 100;
            queuedRun.completedAt = completedAt;
            queuedRun.comfyPromptId = submitted.promptId;
            queuedRun.outputVersionId = versionId;
            queuedRun.performanceStats = performanceStats;
          }
          queued.progress = ((run.index + 1) / totalRuns) * 100;
          queued.stage = `已完成第 ${run.index + 1} / ${totalRuns} 张`;
        });
        sendState(next);
      } catch (error) {
        const performanceStats = monitor.stop();
        await store.update((state) => {
          const queued = state.queue.find((item) => item.id === task.id);
          if (!queued || !isImageGenerationQueueTask(queued)) return;
          const queuedRun = queued.runs.find((item) => item.id === run.id);
          if (!queuedRun) return;
          queuedRun.status = controller.signal.aborted ? "cancelled" : "failed";
          queuedRun.error = error instanceof Error ? error.message : String(error);
          queuedRun.performanceStats = performanceStats;
          queued.error = queuedRun.error;
        });
        throw error;
      }
    }
    const completed = await store.update((state) => {
      state.queue = state.queue.filter((item) => item.id !== task.id);
    });
    sendState(completed);
  } catch (error) {
    await updateTask(task.id, {
      status: controller.signal.aborted ? "cancelled" : "failed",
      error: controller.signal.aborted
        ? "图片批次已取消，已保留完成的图片版本。"
        : error instanceof Error
          ? error.message
          : String(error)
    });
  } finally {
    await freeMemory(store.get().settings).catch((error) => {
      appLogger.warn("comfy", "image-release-failed", "Failed to release image model memory after batch", {
        taskId: task.id,
        error: safeLogErrorMessage(error)
      });
    });
    if (activeController === controller) activeController = null;
  }
}

async function executeQueue(): Promise<void> {
  let promptModelReleased = false;
  while (store.get().queueRunning) {
    const task = store.get().queue.find((item) => item.status === "waiting");
    if (!task) break;
    if (isImageGenerationQueueTask(task)) {
      await executeImageGenerationQueueTask(task);
      continue;
    }
    appLogger.info("queue", "task-started", "Queue task execution started", {
      taskId: task.id,
      taskType: task.taskType,
      modelId: task.modelId,
      automaticRetryAttempt: task.automaticRetryAttempt ?? 0,
      automaticRetryLimit: store.get().settings.autoRetryCount,
      duration: task.duration,
      fps: task.fps,
      attentionMode: task.taskType === "upscale" ? "not-applicable" : task.attentionMode ?? "sage",
      spectrumMode: task.taskType === "upscale" ? "not-applicable" : task.spectrumMode ?? "off",
      ...(task.taskType === "upscale"
        ? {
            sourceWidth: task.sourceWidth,
            sourceHeight: task.sourceHeight,
            targetWidth: task.targetWidth,
            targetHeight: task.targetHeight
          }
        : {})
    });
    activeController = new AbortController();
    let vramWatchdog: VramWatchdogMonitor | undefined;
    let taskPerformanceMonitor: TaskPerformanceMonitor | undefined;
    let taskPerformanceStats: TaskPerformanceStats | undefined;
    let performanceLogTimer: ReturnType<typeof setInterval> | undefined;
    let performanceLogInFlight = false;
    const performanceWarnings = new Set<string>();
    try {
      if (task.taskType === "generation") {
        const safety = generationSafetyForTask(task);
        if (!safety.safe) throw new Error(safety.message);
      } else if (task.taskType === "extension") {
        const safety = extensionSafetyForTask(task);
        if (!safety.safe) throw new Error(safety.message);
      }
      await updateTask(task.id, {
        status: "running",
        progress: 1,
        stage: "提交工作流",
        startedAt: new Date().toISOString(),
        error: undefined
      });
      taskPerformanceMonitor = startTaskPerformanceMonitor();
      const logPerformanceSnapshot = async (): Promise<void> => {
        if (!taskPerformanceMonitor || performanceLogInFlight) return;
        performanceLogInFlight = true;
        try {
          const sample = await taskPerformanceMonitor.snapshot();
          const mib = (bytes: number | null): number | null =>
            bytes == null ? null : Math.round(bytes / 1024 ** 2);
          const warnOnce = (
            key: string,
            message: string,
            meta: Record<string, unknown>
          ): void => {
            if (performanceWarnings.has(key)) return;
            performanceWarnings.add(key);
            appLogger.warn("performance", key, message, {
              taskId: task.id,
              taskType: task.taskType,
              modelId: task.modelId,
              ...meta
            });
          };
          const memoryRatio = sample.memoryTotalBytes > 0
            ? sample.memoryUsedBytes / sample.memoryTotalBytes
            : 0;
          if (sample.vramUsedBytes == null || sample.vramTotalBytes == null) {
            warnOnce(
              "gpu-telemetry-unavailable",
              "GPU telemetry is unavailable; nvidia-smi returned no usable sample",
              {}
            );
          } else if (sample.vramUsedBytes / sample.vramTotalBytes >= 0.95) {
            warnOnce(
              "vram-near-limit",
              "GPU VRAM is near capacity",
              {
                vramUsedMiB: mib(sample.vramUsedBytes),
                vramTotalMiB: mib(sample.vramTotalBytes),
                usagePercent: Math.round(sample.vramUsedBytes / sample.vramTotalBytes * 100)
              }
            );
          }
          if (sample.sharedGpuMemoryBytes != null && sample.sharedGpuMemoryBytes >= 2 * 1024 ** 3) {
            warnOnce(
              "shared-gpu-memory-high",
              "GPU shared memory usage is high",
              { sharedGpuMemoryMiB: mib(sample.sharedGpuMemoryBytes) }
            );
          }
          if (sample.gpuTemperatureC != null && sample.gpuTemperatureC >= 85) {
            warnOnce(
              "gpu-temperature-high",
              "GPU temperature is high",
              { gpuTemperatureC: Math.round(sample.gpuTemperatureC) }
            );
          }
          if (memoryRatio >= 0.9) {
            warnOnce(
              "system-memory-high",
              "System memory usage is high",
              { memoryUsedMiB: mib(sample.memoryUsedBytes), memoryTotalMiB: mib(sample.memoryTotalBytes), usagePercent: Math.round(memoryRatio * 100) }
            );
          }
          if (sample.cpuPercent != null && sample.cpuPercent >= 95) {
            warnOnce(
              "cpu-usage-high",
              "CPU usage is high",
              { cpuPercent: Math.round(sample.cpuPercent) }
            );
          }
          appLogger.info("performance", "task-sample", "Task performance sample", {
            taskId: task.id,
            taskType: task.taskType,
            modelId: task.modelId,
            elapsedSeconds: Math.round(sample.elapsedSeconds),
            cpuPercent: sample.cpuPercent == null ? null : Math.round(sample.cpuPercent),
            memoryUsedMiB: mib(sample.memoryUsedBytes),
            memoryTotalMiB: mib(sample.memoryTotalBytes),
            gpuPercent: sample.gpuPercent == null ? null : Math.round(sample.gpuPercent),
            vramUsedMiB: mib(sample.vramUsedBytes),
            vramTotalMiB: mib(sample.vramTotalBytes),
            sharedGpuMemoryMiB: mib(sample.sharedGpuMemoryBytes),
            sharedGpuMemoryPeakMiB: mib(sample.sharedGpuMemoryPeakBytes),
            gpuTemperatureC: sample.gpuTemperatureC == null
              ? null
              : Math.round(sample.gpuTemperatureC)
          });
        } finally {
          performanceLogInFlight = false;
        }
      };
      void logPerformanceSnapshot();
      performanceLogTimer = setInterval(
        () => void logPerformanceSnapshot(),
        performanceLogIntervalMs
      );
      if (!promptModelReleased) {
        await updateTask(task.id, {
          progress: 1,
          stage: "卸载提示词模型并释放显存"
        });
        const unloaded = await releasePromptRuntime(store.get().settings);
        promptModelReleased = true;
        if (unloaded > 0) {
          await updateTask(task.id, {
            progress: 1,
            stage: "已释放 ComfyUI 提示词模型"
          });
        }
      }
      await ensureComfyUiReady(task.id);
      await updateTask(task.id, {
        progress: 1,
        stage: "提交工作流"
      });
      let lastGpuComputeAt = 0;
      vramWatchdog = startAdaptiveVramWatchdog(
        activeController,
        (pressure, utilization, sample) => {
          taskPerformanceMonitor?.recordGpuSample(sample);
          if (pressure.reason && !performanceWarnings.has("vram-pressure")) {
            performanceWarnings.add("vram-pressure");
            appLogger.warn("performance", "vram-pressure", "VRAM safety pressure detected", {
              taskId: task.id,
              remainingMiB: Math.round(pressure.remainingMiB),
              requiredReserveMiB: Math.round(pressure.requiredReserveMiB),
              growthMiBPerSecond: Math.round(pressure.growthMiBPerSecond),
              reason: pressure.reason
            });
          }
          if (utilization !== null && utilization >= 10) {
            lastGpuComputeAt = Date.now();
          }
        }
      );
      const submitted = await submitTask(
        task,
        store.get().settings,
        activeController.signal
      );
      const { promptId, clientId, nodeTypes } = submitted;
      appLogger.info("comfy", "prompt-submitted", "Workflow submitted to ComfyUI", {
        taskId: task.id,
        taskType: task.taskType,
        modelId: task.modelId,
        promptId,
        nodeCount: Object.keys(nodeTypes).length
      });
      await updateTask(task.id, {
        comfyPromptId: promptId,
        progress: 2,
        stage: "等待 ComfyUI"
      });
      let lastLoggedProgress = -5;
      let lastLoggedStage = "";
      const result = await waitForTask(
        promptId,
        clientId,
        nodeTypes,
        store.get().settings,
        activityTimeoutMinutesForTask(
          task,
          store.get().settings.ltxExtensionTimeoutMinutes
        ),
        activeController.signal,
        (progress, stage) => {
          void updateTask(task.id, { progress, stage });
          const roundedProgress = Math.round(progress);
          if (
            stage !== lastLoggedStage ||
            roundedProgress >= lastLoggedProgress + 5 ||
            progress >= 100
          ) {
            lastLoggedProgress = roundedProgress;
            lastLoggedStage = stage;
            appLogger.info("queue", "task-progress", "Queue task progress", {
              taskId: task.id,
              taskType: task.taskType,
              modelId: task.modelId,
              progress: roundedProgress,
              stage
            });
          }
        },
        (dataUrl) =>
          mainWindow?.webContents.send("task:preview", {
            taskId: task.id,
            dataUrl
          }),
        () => Date.now() - lastGpuComputeAt < 10_000
      );
      appLogger.info("queue", "task-output-ready", "ComfyUI task completed", {
        taskId: task.id,
        taskType: task.taskType,
        modelId: task.modelId
      });
      const completedTask = store.get().queue.find((item) => item.id === task.id);
      if (!completedTask || isImageGenerationQueueTask(completedTask)) continue;
      const completedAt = new Date().toISOString();
      const files = await requireExistingVideoOutput(
        result,
        [store.get().settings.outputDirectory]
      );
      appLogger.info("queue", "output-validated", "Task output validated", {
        taskId: task.id,
        outputCount: files.length
      });
      if (completedTask.taskType === "extension") {
        const outputVideo = files.find(
          (file) => file.absolutePath && videoOutputPattern.test(file.filename)
        );
        if (!outputVideo?.absolutePath) {
          throw new Error("续写工作流没有返回可供 FFmpeg 拼接的视频文件");
        }
        await updateTask(task.id, {
          progress: 99,
          stage: isMiniMaxH3R2vModel(completedTask.modelId)
            ? "合并 Motion Context 续写片段与 32 kHz 音轨"
            : isMiniMaxH3Fl2vaModel(completedTask.modelId)
              ? "裁掉重复边界帧并合并原生音轨"
              : "去除重叠帧并拼接成片"
        });
        await finalizeExtensionOutput(
          completedTask,
          outputVideo.absolutePath,
          activeController.signal
        );
      }
      if (taskPerformanceMonitor) {
        taskPerformanceStats = taskPerformanceMonitor.stop();
        taskPerformanceMonitor = undefined;
        appLogger.info("performance", "task-summary", "Task performance summary", {
          taskId: task.id,
          durationSeconds: Math.round(taskPerformanceStats.durationSeconds),
          vramPeakBytes: taskPerformanceStats.vramPeakBytes,
          vramTotalBytes: taskPerformanceStats.vramTotalBytes,
          gpuPeakPercent: taskPerformanceStats.gpuPeakPercent,
          memoryPeakBytes: taskPerformanceStats.memoryPeakBytes,
          sharedGpuMemoryPeakBytes: taskPerformanceStats.sharedGpuMemoryPeakBytes ?? null
        });
      }
      const next = await store.update((state) => {
        state.queue = state.queue.filter((item) => item.id !== task.id);
        if (completedTask.taskType === "generation") {
          const [width, height] = outputDimensions(completedTask);
          const version: AssetVersion = {
            id: crypto.randomUUID(),
            kind: "original",
            createdAt: completedAt,
            outputFilename: completedTask.outputFilename,
            modelId: completedTask.modelId,
            width,
            height,
            duration: completedTask.duration,
            steps: completedTask.steps,
            spectrumMode: completedTask.spectrumMode,
            fps: completedTask.fps,
            seed: completedTask.seed,
            performanceStats: taskPerformanceStats,
            workflowPath: completedTask.workflowPath,
            comfyPromptId: promptId,
            comfyOutputs: result,
            files,
            startedAt: completedTask.startedAt
          };
          const asset: HistoryAsset = {
            mediaKind: "video",
            id: crypto.randomUUID(),
            taskId: completedTask.id,
            title: completedTask.prompt.slice(0, 28) || "未命名视频",
            outputFilename: completedTask.outputFilename,
            createdAt: completedAt,
            updatedAt: completedAt,
            modelId: completedTask.modelId,
            duration: completedTask.duration,
            resolution: completedTask.resolution,
            steps: completedTask.steps,
            fps: completedTask.fps,
            frameInterpolation: completedTask.frameInterpolation,
            ratio: completedTask.ratio,
            prompt: completedTask.prompt,
            seed: completedTask.seed,
            inputMode: "image",
            h3ReferenceSlots: completedTask.h3ReferenceSlots?.map((slot) => ({ ...slot })),
            sourceWidth: completedTask.sourceWidth,
            sourceHeight: completedTask.sourceHeight,
            startImagePath: completedTask.startImagePath,
            endImagePath: completedTask.endImagePath,
            workflowPath: completedTask.workflowPath,
            startedAt: completedTask.startedAt,
            comfyPromptId: promptId,
            comfyOutputs: result,
            files,
            defaultVersionId: version.id,
            versions: [version]
          };
          state.history.unshift(asset);
          return;
        }
        if (completedTask.taskType === "extension") {
          const [width, height] = extensionOutputDimensions(completedTask);
          const totalDuration =
            completedTask.trimEndSeconds - completedTask.trimStartSeconds +
            completedTask.duration;
          const version: AssetVersion = {
            id: crypto.randomUUID(),
            kind: "original",
            createdAt: completedAt,
            outputFilename: completedTask.outputFilename,
            modelId: completedTask.modelId,
            width,
            height,
            duration: totalDuration,
            steps: completedTask.steps,
            spectrumMode: completedTask.spectrumMode,
            fps: completedTask.fps,
            seed: completedTask.seed,
            performanceStats: taskPerformanceStats,
            workflowPath: completedTask.workflowPath,
            comfyPromptId: promptId,
            comfyOutputs: result,
            files,
            startedAt: completedTask.startedAt,
            h3ContextLatentPath: completedTask.h3ContextSavedPath
          };
          const asset: HistoryAsset = {
            mediaKind: "video",
            id: crypto.randomUUID(),
            taskId: completedTask.id,
            title: completedTask.prompt.slice(0, 28) || "视频续写",
            outputFilename: completedTask.outputFilename,
            createdAt: completedAt,
            updatedAt: completedAt,
            modelId: completedTask.modelId,
            duration: totalDuration,
            resolution: completedTask.resolution,
            steps: completedTask.steps,
            fps: completedTask.fps,
            frameInterpolation: completedTask.frameInterpolation,
            ratio: "source",
            prompt: completedTask.prompt,
            seed: completedTask.seed,
            inputMode: "video",
            sourceWidth: completedTask.sourceWidth,
            sourceHeight: completedTask.sourceHeight,
            sourceAssetId: completedTask.sourceAssetId,
            sourceVersionId: completedTask.sourceVersionId,
            h3ContextLatentPath: completedTask.h3ContextSavedPath,
            sourceVideoPath: completedTask.sourceVideoPath,
            sourceVideoDuration: completedTask.sourceVideoDuration,
            trimStartSeconds: completedTask.trimStartSeconds,
            trimEndSeconds: completedTask.trimEndSeconds,
            workflowPath: completedTask.workflowPath,
            startedAt: completedTask.startedAt,
            comfyPromptId: promptId,
            comfyOutputs: result,
            files,
            defaultVersionId: version.id,
            versions: [version]
          };
          state.history.unshift(asset);
          return;
        }
        const assetIndex = state.history.findIndex(
          (asset) => asset.id === completedTask.sourceAssetId
        );
        if (assetIndex < 0) {
          throw new Error("源作品已不存在，无法保存提升版本");
        }
        const asset = state.history[assetIndex]!;
        const [targetWidth, targetHeight] = upscaleDimensions(
          completedTask.sourceWidth,
          completedTask.sourceHeight,
          completedTask.targetHeight
        );
        const version: AssetVersion = {
          id: crypto.randomUUID(),
          kind: "upscale",
          createdAt: completedAt,
          outputFilename: completedTask.outputFilename,
          modelId: completedTask.modelId,
          width: targetWidth,
          height: targetHeight,
          duration: completedTask.duration,
          fps: completedTask.fps,
          seed: completedTask.seed,
            performanceStats: taskPerformanceStats,
          workflowPath: completedTask.workflowPath,
          comfyPromptId: promptId,
          comfyOutputs: result,
          files,
          tileMode: completedTask.tileMode,
          faceRestore: completedTask.faceRestore,
          startedAt: completedTask.startedAt
        };
        asset.versions.push(version);
        asset.updatedAt = completedAt;
        asset.defaultVersionId = version.id;
        state.history.splice(assetIndex, 1);
        state.history.unshift(asset);
      });
      sendState(next);
      if (isMiniMaxH3Model(completedTask.modelId)) {
        const stable = await stabilizeH3RuntimeBetweenTasks(
          completedTask.id,
          completedTask.modelId,
          comfyUiSettingsForQueueTask(completedTask, next.settings)
        );
        if (!stable) {
          const stopped = await store.update((state) => {
            state.queueRunning = false;
          });
          sendState(stopped);
          appLogger.error("queue", "h3-stabilization-failed", "Queue stopped because H3 runtime could not be safely released", {
            taskId: completedTask.id,
            modelId: completedTask.modelId
          });
        }
      }
    } catch (error) {
      const aborted = activeController.signal.aborted;
      const stalled = error instanceof TaskStalledError;
      const recoveryDecision = classifyFailureForRecovery(error, stalled);
      const memoryFailure = recoveryDecision.kind === "cuda-context" ||
        recoveryDecision.kind === "gpu-memory";
      const cudaContextFailure = recoveryDecision.forceStop;
      if (!taskPerformanceStats && taskPerformanceMonitor) {
        taskPerformanceStats = taskPerformanceMonitor.stop();
        taskPerformanceMonitor = undefined;
        appLogger.info("performance", "task-summary", "Failed task performance summary", {
          taskId: task.id,
          durationSeconds: Math.round(taskPerformanceStats.durationSeconds),
          vramPeakBytes: taskPerformanceStats.vramPeakBytes,
          vramTotalBytes: taskPerformanceStats.vramTotalBytes,
          gpuPeakPercent: taskPerformanceStats.gpuPeakPercent,
          memoryPeakBytes: taskPerformanceStats.memoryPeakBytes,
          sharedGpuMemoryPeakBytes: taskPerformanceStats.sharedGpuMemoryPeakBytes ?? null
        });
      }
      appLogger.error(
        "queue",
        "task-failed",
        safeLogErrorMessage(error),
        {
          taskId: task.id,
          taskType: task.taskType,
          modelId: task.modelId,
          stalled,
          memoryFailure,
          cudaContextFailure,
          recoveryKind: recoveryDecision.kind,
          recoverable: recoveryDecision.recoverable,
          automaticRetryAttempt: task.automaticRetryAttempt ?? 0,
          attentionMode: task.taskType === "upscale" ? "not-applicable" : task.attentionMode ?? "sage",
          spectrumMode: task.taskType === "upscale" ? "not-applicable" : task.spectrumMode ?? "off",
          ...errorLogMeta(error)
        }
      );
      if (!aborted && recoveryDecision.forceStop) {
        appLogger.warn("comfy", "cuda-context-force-stop", "CUDA context is invalid; skipping HTTP cleanup and force-stopping ComfyUI", {
          taskId: task.id,
          modelId: task.modelId
        });
        const forced = await forceStopComfyProcesses(store.get().settings);
        appLogger.info(
          "comfy",
          forced.ok ? "cuda-context-force-stop-succeeded" : "cuda-context-force-stop-failed",
          forced.message,
          { taskId: task.id, modelId: task.modelId, forceStopOk: forced.ok }
        );
      } else if (!aborted && recoveryDecision.kind === "gpu-memory") {
        await interrupt(store.get().settings).catch((interruptError) => {
          appLogger.warn("comfy", "interrupt-failed", "ComfyUI interrupt request failed", {
            taskId: task.id,
            error: safeLogErrorMessage(interruptError)
          });
        });
        await freeMemory(store.get().settings).catch((freeMemoryError) => {
          appLogger.warn("comfy", "free-memory-failed", "ComfyUI memory release request failed", {
            taskId: task.id,
            error: safeLogErrorMessage(freeMemoryError)
          });
        });
      }
      const failedState = await updateTask(task.id, {
        status: aborted ? "cancelled" : "failed",
        error: aborted
          ? "任务已中止，ComfyUI 已停止当前采样。"
          : cudaContextFailure
            ? `${error instanceof Error ? error.message : String(error)} CUDA 上下文已失效，正在重启 ComfyUI。`
          : error instanceof Error
            ? error.message
            : String(error),
        performanceStats: taskPerformanceStats
      });
      if (!aborted && recoveryDecision.requiresRestart) {
        appLogger.warn(
          "queue",
          "recovery-required",
          "Task failure requires ComfyUI recovery",
          {
            taskId: task.id,
            stalled,
            memoryFailure,
            cudaContextFailure,
            recoveryKind: recoveryDecision.kind
          }
        );
        const recovery = await restartLocalService(
          "comfy",
          comfyUiSettingsForQueueTask(task, failedState.settings)
        );
        appLogger.info(
          "comfy",
          recovery.ok ? "recovery-succeeded" : "recovery-failed",
          recovery.message,
          { taskId: task.id, recoveryOk: recovery.ok }
        );
        const originalError = error instanceof Error ? error.message : String(error);
        if (!recovery.ok) {
          const stopped = await store.update((state) => {
            state.queueRunning = false;
            const failedTask = state.queue.find((item) => item.id === task.id);
            if (failedTask) {
              failedTask.error = `${originalError} 自动恢复失败：${recovery.message}`;
              failedTask.updatedAt = new Date().toISOString();
            }
          });
          sendState(stopped);
          appLogger.error("queue", "recovery-stopped-queue", "Queue stopped because ComfyUI recovery failed", {
            taskId: task.id,
            modelId: task.modelId,
            recoveryKind: recoveryDecision.kind
          });
        } else {
          const attentionFallback = recoveryDecision.kind === "cuda-context" &&
            task.taskType !== "upscale" &&
            isMiniMaxH3Model(task.modelId)
            ? nextH3AttentionModeAfterCudaFailure(task.attentionMode)
            : null;
          let recoveredState = failedState;
          if (attentionFallback) {
            let affectedTaskCount = 0;
            recoveredState = await store.update((state) => {
              for (const queuedTask of state.queue) {
                if (queuedTask.taskType === "upscale" || queuedTask.taskType === "image-generation" || !isMiniMaxH3Model(queuedTask.modelId)) continue;
                const currentMode = queuedTask.attentionMode ?? "sage";
                const shouldFallback = attentionFallback === "pytorch"
                  ? currentMode !== "pytorch"
                  : currentMode === "sage";
                if (!shouldFallback) continue;
                queuedTask.attentionMode = attentionFallback;
                queuedTask.updatedAt = new Date().toISOString();
                affectedTaskCount += 1;
              }
            });
            sendState(recoveredState);
            appLogger.warn(
              "queue",
              "h3-attention-fallback-applied",
              "H3 Attention mode was downgraded after a deterministic CUDA kernel failure",
              {
                taskId: task.id,
                modelId: task.modelId,
                attentionFrom: task.attentionMode ?? "sage",
                attentionTo: attentionFallback,
                affectedTaskCount
              }
            );
          }
          const retryAttempt = task.automaticRetryAttempt ?? 0;
          const retryLimit = recoveredState.settings.autoRetryCount;
          const nextAttempt = nextAutomaticRetryAttempt({
            enabled: recoveredState.settings.autoRetryFailedTasks,
            recoverable: recoveryDecision.recoverable,
            currentAttempt: retryAttempt,
            retryLimit
          });
          if (nextAttempt !== null) {
            const retryState = await store.update((state) => {
              const failedTask = state.queue.find((item) => item.id === task.id);
              if (!failedTask) return;
              Object.assign(failedTask, {
                status: "waiting" as const,
                updatedAt: new Date().toISOString(),
                comfyPromptId: undefined,
                progress: 0,
                stage: `自动重试 ${nextAttempt}/${retryLimit}${attentionFallback ? ` · Attention ${attentionFallback}` : ""}`,
                error: `${originalError} ComfyUI 已恢复，准备自动重试 ${nextAttempt}/${retryLimit}。${attentionFallback ? ` H3 Attention 已切换为 ${attentionFallback}。` : ""}`,
                automaticRetryAttempt: nextAttempt
              });
              state.queueRunning = true;
            });
            sendState(retryState);
            appLogger.warn("queue", "automatic-retry-scheduled", "Recoverable task was returned to the queue after ComfyUI recovery", {
              taskId: task.id,
              taskType: task.taskType,
              modelId: task.modelId,
              recoveryKind: recoveryDecision.kind,
              retryAttempt: nextAttempt,
              retryLimit
            });
          } else {
            await updateTask(task.id, {
              error: `${originalError} ComfyUI 已恢复就绪。${
                recoveredState.settings.autoRetryFailedTasks
                  ? `自动重试已达到上限（${retryLimit} 次），已跳过此任务。`
                  : "自动重试未开启，已跳过此任务。"
              }`
            });
            appLogger.warn("queue", "automatic-retry-skipped", "Recovered task remains failed and the queue will continue", {
              taskId: task.id,
              taskType: task.taskType,
              modelId: task.modelId,
              recoveryKind: recoveryDecision.kind,
              retryAttempt,
              retryLimit,
              retryEnabled: recoveredState.settings.autoRetryFailedTasks,
              attentionFallback: attentionFallback ?? "none"
            });
          }
        }
      }
    } finally {
      const finalStage = taskStageStartedAt.get(task.id);
      if (finalStage) {
        appLogger.info("queue", "stage-duration", "Queue task final stage finished", {
          taskId: task.id,
          taskType: task.taskType,
          modelId: task.modelId,
          stage: finalStage.stage,
          durationSeconds: Math.round((Date.now() - finalStage.startedAt) / 1000)
        });
        taskStageStartedAt.delete(task.id);
      }
      if (performanceLogTimer) clearInterval(performanceLogTimer);
      vramWatchdog?.stop();
      taskPerformanceMonitor?.stop();
      activeController = null;
    }
  }
  const next = await store.update((state) => {
    state.queueRunning = false;
  });
  sendState(next);
}
async function loggedOperation<T extends { ok: boolean; message: string }>(
  scope: string,
  event: string,
  startedMessage: string,
  operation: () => Promise<T>,
  meta: Record<string, unknown> = {}
): Promise<T> {
  const startedAt = Date.now();
  appLogger.info(scope, `${event}-started`, startedMessage, meta);
  try {
    const result = await operation();
    appLogger.info(
      scope,
      result.ok ? `${event}-succeeded` : `${event}-failed`,
      result.message,
      { ...meta, ok: result.ok, durationMs: Date.now() - startedAt }
    );
    return result;
  } catch (error) {
    appLogger.error(scope, `${event}-failed`, safeLogErrorMessage(error), {
      ...meta,
      durationMs: Date.now() - startedAt,
      ...errorLogMeta(error)
    });
    throw error;
  }
}

function registerIpc(): void {
  ipcMain.handle("state:get", () => store.get());
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("renderer:set-settings-dirty", (_event, dirty: boolean) => {
    rendererHasUnsavedSettings = dirty === true;
  });
  ipcMain.handle(
    "window:close-response",
    async (event, response: WindowCloseResponse) => {
      if (event.sender !== mainWindow?.webContents || !pendingWindowCloseRequest) return;
      const request = pendingWindowCloseRequest;
      pendingWindowCloseRequest = null;
      if (response === "cancel") {
        closeFlowRunning = false;
        return;
      }
      if (request.kind === "unsaved-settings" && response === "discard-settings") {
        await finishWindowClose();
        return;
      }
      if (request.kind === "running-work" && (response === "finish-tasks" || response === "force-exit")) {
        await finishRunningWorkClose(response);
        return;
      }
      closeFlowRunning = false;
    }
  );
  ipcMain.handle("logs:read", (_event, limit?: number) =>
    appLogSnapshot(typeof limit === "number" ? limit : undefined)
  );
  ipcMain.handle(
    "logs:open-directory",
    async (_event, kind: "logs" | "crashDumps") => {
      const directory = kind === "logs"
        ? appLogger.directory
        : app.getPath("crashDumps");
      const error = await shell.openPath(directory);
      return !error;
    }
  );
  ipcMain.handle(
    "logs:renderer-error",
    (_event, message: string, meta?: Record<string, unknown>) => {
      appLogger.error("renderer", "client-error", message, meta);
    }
  );
  ipcMain.handle(
    "logs:user-action",
    (_event, action: string, meta?: Record<string, unknown>) => {
      appLogger.info("ui", "user-action", action, meta);
    }
  );
  ipcMain.handle("draft:save", async (_event, draft: Draft) => {
    const next = await store.update((state) => {
      state.draft = draft;
    });
    sendState(next);
    return next;
  });
  ipcMain.handle("image-draft:save", async (_event, draft: ImageEditDraft) => {
    const normalized = normalizeImageEditDraft(draft);
    const next = await store.update((state) => {
      state.imageDraft = normalized;
    });
    sendState(next);
    return next;
  });
  ipcMain.handle("settings:save", async (_event, settings: Settings, mode: SettingsSaveMode = "apply") => {
    if (mode !== "apply" && mode !== "migrate-video-history") {
      throw new Error("未知的设置保存模式。");
    }
    if (historyMigrationRunning) {
      throw new Error("当前正在迁移历史视频，请等待本次操作完成。");
    }
    if (!settings.imageInputLibraryDirectory.trim()) {
      settings = {
        ...settings,
        imageInputLibraryDirectory: await effectiveImageInputLibraryDirectory(settings)
      };
    }
    settings = {
      ...settings,
      uiLocale: normalizeUiLocale(settings.uiLocale)
    };
    const previous = store.get().settings;
    const outputDirectoryChanged = previous.outputDirectory.trim() !== settings.outputDirectory.trim();
    const directories = outputDirectoryChanged || mode === "migrate-video-history"
      ? await validateVideoOutputDirectoryChange(previous, settings)
      : { oldDirectory: "", newDirectory: "" };
    const shouldMigrate = mode === "migrate-video-history" &&
      directories.oldDirectory &&
      directories.newDirectory.toLowerCase() !== directories.oldDirectory.toLowerCase();
    const changedKeys = Object.keys(settings).filter((key) =>
      JSON.stringify(previous[key as keyof Settings]) !==
      JSON.stringify(settings[key as keyof Settings])
    );
    let updatedH3TaskCount = 0;
    const commitSettings = (state: AppState): void => {
      state.settings = settings;
      if (previous.h3AttentionMode !== settings.h3AttentionMode) {
        for (const task of state.queue) {
          if (task.status === "running" || task.taskType === "upscale" || task.taskType === "image-generation" || !isMiniMaxH3Model(task.modelId)) continue;
          task.attentionMode = settings.h3AttentionMode;
          task.updatedAt = new Date().toISOString();
          updatedH3TaskCount += 1;
        }
      }
    };
    if (shouldMigrate) {
      historyMigrationRunning = true;
      let preparation: PreparedVideoHistoryMigration | null = null;
      let stateCommitted = false;
      try {
        sendHistoryMigrationProgress({
          phase: "scanning",
          current: 0,
          total: 0,
          message: "正在扫描历史视频文件",
          migratedFiles: 0,
          warningCount: 0
        });
        const plan = await planVideoHistoryMigration(
          store.get().history,
          directories.oldDirectory,
          directories.newDirectory,
          store.get().queue
        );
        sendHistoryMigrationProgress({
          phase: "scanning",
          current: 0,
          total: plan.entries.length,
          message: `已找到 ${plan.entries.length} 个历史视频文件，准备迁移`,
          migratedFiles: 0,
          warningCount: plan.missing.length + plan.conflicts.length
        });
        preparation = await prepareVideoHistoryMigration(
          plan,
          path.join(app.getPath("userData"), "video-history-migration.json"),
          sendHistoryMigrationProgress
        );
        sendHistoryMigrationProgress({
          phase: "committing",
          current: plan.entries.length,
          total: plan.entries.length,
          message: "目标文件已复核，正在更新历史记录",
          migratedFiles: plan.entries.length,
          warningCount: 0
        });
        const next = await store.update((state) => {
          commitSettings(state);
          applyVideoMigrationPaths(state, plan);
        });
        stateCommitted = true;
        await markVideoHistoryMigrationCommitted(preparation);
        const warnings = await cleanupVideoHistoryMigration(
          preparation,
          sendHistoryMigrationProgress
        );
        sendHistoryMigrationProgress({
          phase: "completed",
          current: plan.entries.length,
          total: plan.entries.length,
          message: warnings.length
            ? "历史视频已迁移，部分旧文件清理失败"
            : "历史视频迁移完成",
          migratedFiles: plan.entries.length,
          warningCount: warnings.length
        });
        appLogger.info("settings", "video-history-migrated", "Video history was migrated to the new output directory", {
          oldDirectory: directories.oldDirectory,
          newDirectory: directories.newDirectory,
          migratedFiles: plan.entries.length,
          warningCount: warnings.length
        });
        sendState(next);
        return next;
      } catch (error) {
        if (preparation && !stateCommitted) {
          await rollbackVideoHistoryMigration(preparation);
        }
        throw error;
      } finally {
        historyMigrationRunning = false;
      }
    }
    const next = await store.update((state) => {
      commitSettings(state);
    });
    appLogger.info("settings", "saved", "Application settings saved", {
      changedKeys,
      changedCount: changedKeys.length,
      updatedH3TaskCount
    });
    sendState(next);
    return next;
  });
  ipcMain.handle("file:pick-image", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "bmp"] }]
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipcMain.handle("file:pick-video", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "视频", extensions: ["mp4", "webm", "mov", "m4v", "mkv"] }]
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipcMain.handle("file:pick-workflow", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "ComfyUI API 工作流", extensions: ["json"] }]
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipcMain.handle("file:pick-python", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Python 解释器", extensions: ["exe"] }]
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipcMain.handle("workflow:inspect", async (_event, workflowPath: string) => {
    const startedAt = Date.now();
    const source = JSON.parse(await fs.readFile(workflowPath, "utf8")) as unknown;
    const result = {
      supportsEndImage: workflowSupportsEndImage(source),
      supportsVideoExtension: extensionWorkflowSafetyErrors(source).length === 0
    };
    appLogger.info("workflow", "inspected", "Workflow inspected", {
      durationMs: Date.now() - startedAt,
      supportsEndImage: result.supportsEndImage,
      supportsVideoExtension: result.supportsVideoExtension
    });
    return result;
  });
  ipcMain.handle("workflow:get-bundled", (_event, modelId: string, inputMode?: Draft["inputMode"]) =>
    bundledWorkflowFor(modelId, inputMode)
  );
  ipcMain.handle("performance:get", (_event, settings: Settings) =>
    getPerformanceMetrics(settings)
  );
  ipcMain.handle("file:pick-directory", async (_event, defaultPath?: string, createIfMissing = false) => {
    const candidate = typeof defaultPath === "string" ? defaultPath.trim() : "";
    const candidatePath = candidate ? path.resolve(candidate) : "";
    if (createIfMissing && candidatePath) {
      await fs.mkdir(candidatePath, { recursive: true }).catch(() => undefined);
    }
    const candidateStat = candidatePath ? await fs.stat(candidatePath).catch(() => null) : null;
    const result = await dialog.showOpenDialog({
      defaultPath: candidateStat?.isDirectory() ? candidatePath : undefined,
      properties: ["openDirectory"]
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipcMain.handle("image-assets:scan", async () => {
    if (imageAssetLibraryRunning) throw new Error("图片素材库正在处理中，请稍候。");
    imageAssetLibraryRunning = true;
    const operationId = randomUUID().slice(0, 8);
    try {
      const snapshot = store.get();
      const library = await effectiveImageInputLibraryDirectory(snapshot.settings);
      appLogger.info("assets", "image-library-scan-started", "开始扫描图片素材库", {
        operationId,
        projectCount: snapshot.imageHistory.length,
        queueCount: snapshot.queue.filter((task) => task.taskType === "image-generation").length
      });
      const result = await scanImageAssetLibrary(snapshot, library, sendImageAssetLibraryProgress);
      appLogger.info("assets", "image-library-scan-completed", "图片素材库扫描完成", {
        operationId,
        totalReferences: result.totalReferences,
        managedReferences: result.managedReferences,
        archiveCandidates: result.archiveCandidates,
        missingReferences: result.missingReferences.length,
        orphanCount: result.orphanFiles.length
      });
      return result;
    } catch (error) {
      appLogger.error("assets", "image-library-scan-failed", "图片素材库扫描失败", {
        operationId,
        error: safeLogErrorMessage(error)
      });
      throw error;
    } finally {
      imageAssetLibraryRunning = false;
    }
  });
  ipcMain.handle("image-assets:organize", async () => {
    if (imageAssetLibraryRunning) throw new Error("图片素材库正在处理中，请稍候。");
    if (store.get().queueRunning) throw new Error("队列运行期间不能整理图片素材库，请先暂停或等待任务完成。");
    imageAssetLibraryRunning = true;
    const operationId = randomUUID().slice(0, 8);
    try {
      const snapshot = store.get();
      const library = await effectiveImageInputLibraryDirectory(snapshot.settings);
      appLogger.info("assets", "image-library-organize-started", "开始归档并修复图片素材库", {
        operationId,
        projectCount: snapshot.imageHistory.length,
        queueCount: snapshot.queue.filter((task) => task.taskType === "image-generation").length
      });
      const prepared = await organizeImageAssetLibrary(snapshot, library, sendImageAssetLibraryProgress);
      const next = await store.update((state) => {
        state.imageDraft = prepared.state.imageDraft;
        state.imageHistory = prepared.state.imageHistory;
        const preparedTasks = new Map(
          prepared.state.queue
            .filter((task): task is ImageGenerationQueueTask => task.taskType === "image-generation")
            .map((task) => [task.id, task])
        );
        for (const task of state.queue) {
          if (task.taskType !== "image-generation") continue;
          const preparedTask = preparedTasks.get(task.id);
          if (preparedTask) task.pictures = preparedTask.pictures;
        }
      });
      sendState(next);
      sendImageAssetLibraryProgress({ phase: "completed", current: 1, total: 1, message: "图片素材库整理完成" });
      appLogger.info("assets", "image-library-organize-completed", "图片素材库整理完成，历史引用已保存，原文件和旧分片副本未删除", {
        operationId,
        archivedCount: prepared.result.archivedFiles,
        reorganizedCount: prepared.result.reorganizedFiles,
        updatedReferences: prepared.result.updatedReferences,
        remainingArchiveCandidates: prepared.result.scan.archiveCandidates,
        missingReferences: prepared.result.scan.missingReferences.length,
        orphanCount: prepared.result.scan.orphanFiles.length
      });
      return { ...prepared.result, operationId };
    } catch (error) {
      appLogger.error("assets", "image-library-organize-failed", "图片素材库归档修复失败，历史引用未提交", {
        operationId,
        error: safeLogErrorMessage(error)
      });
      throw error;
    } finally {
      imageAssetLibraryRunning = false;
    }
  });
  ipcMain.handle("image-assets:cleanup", async (_event, paths: string[]) => {
    if (imageAssetLibraryRunning) throw new Error("图片素材库正在处理中，请稍候。");
    if (store.get().queueRunning) throw new Error("队列运行期间不能清理图片素材库，请先暂停或等待任务完成。");
    imageAssetLibraryRunning = true;
    const operationId = randomUUID().slice(0, 8);
    try {
      const snapshot = store.get();
      const library = await effectiveImageInputLibraryDirectory(snapshot.settings);
      appLogger.info("assets", "image-library-cleanup-started", "开始清理未被引用的图片素材", {
        operationId,
        requestedCount: Array.isArray(paths) ? paths.length : 0
      });
      const result = await cleanupImageAssetLibrary(
        snapshot,
        library,
        Array.isArray(paths) ? paths : [],
        sendImageAssetLibraryProgress
      );
      sendImageAssetLibraryProgress({ phase: "completed", current: 1, total: 1, message: "素材库清理完成" });
      appLogger.info("assets", "image-library-cleanup-completed", "图片素材库清理完成", {
        operationId,
        cleanedCount: result.cleanedFiles,
        cleanedDirectoryCount: result.cleanedDirectories,
        cleanedBytes: result.cleanedBytes,
        remainingOrphanCount: result.scan.orphanFiles.length
      });
      return { ...result, operationId };
    } catch (error) {
      appLogger.error("assets", "image-library-cleanup-failed", "图片素材库清理失败", {
        operationId,
        error: safeLogErrorMessage(error)
      });
      throw error;
    } finally {
      imageAssetLibraryRunning = false;
    }
  });
  ipcMain.handle("file:read-image", async (_event, filename: string) => {
    if (!filename) return null;
    const extension = path.extname(filename).slice(1).toLowerCase();
    const mime = extension === "jpg" || extension === "jpeg" ? "image/jpeg" : `image/${extension}`;
    const content = await fs.readFile(filename);
    return `data:${mime};base64,${content.toString("base64")}`;
  });
  ipcMain.handle("image-markup:read", async (_event, documentPath: string) => {
    const root = path.join(app.getPath("userData"), "image-guides");
    const filename = typeof documentPath === "string" ? path.resolve(documentPath) : "";
    if (!filename || !isPathWithinDirectory(root, filename)) return null;
    return fs.readFile(filename, "utf8").catch(() => null);
  });
  ipcMain.handle("image-markup:save", async (_event, request: ImageMarkupSaveRequest) => {
    if (!request || typeof request !== "object") throw new Error("标记数据无效");
    const sourceStat = await fs.stat(request.sourcePath).catch(() => null);
    if (!sourceStat?.isFile()) throw new Error("原始 Picture 文件不存在");
    if (typeof request.document !== "string" || !request.document.trim()) {
      throw new Error("标记工程为空");
    }
    const bytes = request.renderedPng instanceof ArrayBuffer
      ? new Uint8Array(request.renderedPng)
      : null;
    if (!bytes?.byteLength) throw new Error("标注图片为空");
    if (bytes.byteLength > 100 * 1024 * 1024) throw new Error("标注图片不能超过 100 MB");
    const pictureKey = createHash("sha256")
      .update(`${request.pictureId}\0${path.resolve(request.sourcePath)}`)
      .digest("hex")
      .slice(0, 24);
    const revision = Math.max(1, Math.trunc(request.previousRevision ?? 0) + 1);
    const directory = path.join(app.getPath("userData"), "image-guides", pictureKey);
    await fs.mkdir(directory, { recursive: true });
    const basename = `revision-${String(revision).padStart(4, "0")}`;
    const documentPath = path.join(directory, `${basename}.fabric.json`);
    const renderedPath = path.join(directory, `${basename}-guide.png`);
    const documentTemporary = `${documentPath}.${crypto.randomUUID()}.tmp`;
    const renderedTemporary = `${renderedPath}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(documentTemporary, request.document, "utf8");
      await fs.writeFile(renderedTemporary, bytes);
      await fs.rename(documentTemporary, documentPath);
      await fs.rename(renderedTemporary, renderedPath);
    } finally {
      await fs.rm(documentTemporary, { force: true }).catch(() => undefined);
      await fs.rm(renderedTemporary, { force: true }).catch(() => undefined);
    }
    return {
      documentPath,
      renderedPath,
      summary: typeof request.summary === "string" ? request.summary.trim() : "",
      revision,
      objectCount: Math.max(0, Math.trunc(request.objectCount || 0)),
      updatedAt: new Date().toISOString()
    };
  });
  ipcMain.handle("history-cover:read", async (_event, key: string, sourcePath: string) => {
    if (!key || !sourcePath) return null;
    const resolvedSource = await resolveHistorySourcePath(sourcePath);
    const sourceStat = resolvedSource ? await fs.stat(resolvedSource).catch(() => null) : null;
    if (!sourceStat?.isFile()) return null;
    const [coverStat, metadataText] = await Promise.all([
      fs.stat(historyCoverPath(key)).catch(() => null),
      fs.readFile(historyCoverMetadataPath(key), "utf8").catch(() => "")
    ]);
    if (!coverStat?.isFile() || coverStat.size <= 0 || !metadataText) return null;
    let metadata: HistoryCoverMetadata;
    try {
      metadata = JSON.parse(metadataText) as HistoryCoverMetadata;
    } catch {
      return null;
    }
    if (
      metadata.sourceSize !== sourceStat.size ||
      Math.abs(metadata.sourceMtimeMs - sourceStat.mtimeMs) > 1
    ) return null;
    const digest = historyCoverDigest(key);
    return `studio-media://cover/${digest}.jpg?v=${Math.round(coverStat.mtimeMs)}`;
  });
  ipcMain.handle(
    "history-cover:save",
    async (_event, key: string, sourcePath: string, data: ArrayBuffer | Uint8Array) => {
      const bytes = data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : ArrayBuffer.isView(data)
          ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
          : null;
      if (!key || !sourcePath || !bytes?.byteLength) return false;
      if (bytes.byteLength > 2 * 1024 * 1024) throw new Error("历史封面缓存不能超过 2 MB");
      const resolvedSource = await resolveHistorySourcePath(sourcePath);
      const sourceStat = resolvedSource ? await fs.stat(resolvedSource).catch(() => null) : null;
      if (!sourceStat?.isFile()) return false;
      const directory = historyCoverDirectory();
      await fs.mkdir(directory, { recursive: true });
      const filename = historyCoverPath(key);
      const metadataFilename = historyCoverMetadataPath(key);
      const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
      const metadataTemporary = `${metadataFilename}.${crypto.randomUUID()}.tmp`;
      const metadata: HistoryCoverMetadata = {
        sourceSize: sourceStat.size,
        sourceMtimeMs: sourceStat.mtimeMs,
        generatedAt: new Date().toISOString()
      };
      try {
        await fs.writeFile(temporary, bytes);
        await fs.writeFile(metadataTemporary, JSON.stringify(metadata), "utf8");
        await fs.rm(filename, { force: true });
        await fs.rm(metadataFilename, { force: true });
        await fs.rename(temporary, filename);
        await fs.rename(metadataTemporary, metadataFilename);
      } finally {
        await fs.rm(temporary, { force: true }).catch(() => undefined);
        await fs.rm(metadataTemporary, { force: true }).catch(() => undefined);
      }
      return true;
    }
  );
  ipcMain.handle(
    "file:save-clipboard-image",
    async (_event, data: ArrayBuffer, mimeType: string) => {
      const extensions: Record<string, string> = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
        "image/bmp": ".bmp"
      };
      const extension = extensions[mimeType.toLowerCase()];
      if (!extension) throw new Error("剪贴板内容不是支持的图片格式");
      if (!(data instanceof ArrayBuffer) || data.byteLength === 0) {
        throw new Error("剪贴板图片为空");
      }
      if (data.byteLength > 50 * 1024 * 1024) {
        throw new Error("剪贴板图片不能超过 50 MB");
      }
      const directory = path.join(app.getPath("userData"), "clipboard-inputs");
      await fs.mkdir(directory, { recursive: true });
      const filename = path.join(
        directory,
        `clipboard-${Date.now()}-${crypto.randomUUID()}${extension}`
      );
      await fs.writeFile(filename, new Uint8Array(data));
      return filename;
    }
  );
  ipcMain.handle("file:show-in-folder", async (_event, filename: string) => {
    const requestedFilename = typeof filename === "string" ? filename : "";
    const resolved = await resolveExistingHistoryFile(requestedFilename);
    if (!resolved) {
      appLogger.warn("history", "show-file-missing", "History file could not be found in its recorded location", {
        filename: requestedFilename
      });
      return false;
    }
    shell.showItemInFolder(resolved);
    appLogger.info("history", "show-file-succeeded", "History file revealed in Explorer", {
      filename: resolved,
      repairedPath: !requestedFilename || path.resolve(requestedFilename) !== resolved
    });
    return true;
  });
  ipcMain.handle("file:copy", async (_event, filename: string) => {
    if (process.platform !== "win32") {
      return { ok: false, message: "复制文件目前仅支持 Windows。" };
    }
    const requestedFilename = typeof filename === "string" ? filename : "";
    const resolved = await resolveExistingHistoryFile(requestedFilename);
    if (!resolved) {
      appLogger.warn("history", "copy-file-missing", "History file could not be found for clipboard copy", {
        filename: requestedFilename
      });
      return {
        ok: false,
        message: "视频文件不存在，可能已被移动、重命名或删除。"
      };
    }
    try {
      await copyFileToWindowsClipboard(
        resolved,
        path.join(app.getPath("userData"), "clipboard-files")
      );
      appLogger.info("history", "copy-file-succeeded", "History file copied to the Windows clipboard", {
        filename: resolved,
        repairedPath: !requestedFilename || path.resolve(requestedFilename) !== resolved
      });
      return {
        ok: true,
        message: requestedFilename && path.resolve(requestedFilename) === resolved
          ? "视频文件已复制，可在资源管理器中粘贴。"
          : "已自动找到视频的实际文件并复制，可在资源管理器中粘贴。"
      };
    } catch (error) {
      appLogger.warn("history", "copy-file-failed", "Windows clipboard file copy failed", {
        filename: resolved,
        error: safeLogErrorMessage(error)
      });
      return {
        ok: false,
        message: "剪贴板暂时被其他程序占用，请稍后再试。"
      };
    }
  });
  ipcMain.handle("shell:open-external", async (_event, value: string) => {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") return false;
      await shell.openExternal(url.toString());
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle("prompt:start", async () => {
    const settings = store.get().settings;
    const runtime = promptRuntimeForSettings(settings);
    const promptBackend = promptModelBackend(settings.promptModelId);
    const startedAt = Date.now();
    appLogger.info("prompt", "service-start-requested", "Prompt service start requested", { runtime });
    if (store.get().queueRunning || activeController || queueWorker) {
      return { ok: false, message: "当前有视频任务正在运行，暂不能启动提示词模型。" };
    }
    if (nativePromptWorker) {
      return { ok: false, message: "提示词模型正在启动或使用中。" };
    }
    const controller = new AbortController();
    nativePromptController = controller;
    const worker = (async () => {
      if (promptBackend === "h3-prompt-writer") {
        await ensureComfyUiReadyForPrompt(settings);
        const status = await testH3PromptWriter(settings, controller.signal);
        promptWriterModelForSelection(status.models, settings.promptModelId);
        return;
      }
      if (promptBackend !== "native-text-generate") {
        throw new Error("当前选择的提示词模型没有可用的本地运行适配器，请重新扫描设置中的模型列表。");
      }
      await ensureComfyUiReadyForPrompt(settings);
      await validateNativePromptRuntime(settings);
      await warmNativePromptModel(settings, controller.signal);
    })();
    nativePromptWorker = worker;
    try {
      await worker;
      appLogger.info("prompt", "service-ready", "Prompt service ready", {
        runtime,
        durationMs: Date.now() - startedAt
      });
      return {
        ok: true,
        message: promptBackend === "h3-prompt-writer"
          ? "ComfyUI H3 Prompt Writer 已就绪；模型会在扩写时按需加载，完成后自动卸载。"
          : "Qwen 提示词模型已启动并加载到 ComfyUI。"
      };
    } catch (error) {
      appLogger.error("prompt", "service-start-failed", safeLogErrorMessage(error), {
        runtime,
        durationMs: Date.now() - startedAt,
        ...errorLogMeta(error)
      });
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    } finally {
      if (nativePromptWorker === worker) nativePromptWorker = null;
      if (nativePromptController === controller) nativePromptController = null;
    }
  });
  ipcMain.handle("prompt:enhance", async (_event, request: EnhanceRequest) => {
    const settings = store.get().settings;
    const runtime = promptRuntimeForSettings(settings);
    const promptBackend = promptModelBackend(settings.promptModelId);
    const startedAt = Date.now();
    appLogger.info("prompt", "enhance-started", "Prompt enhancement started", {
      runtime,
      modelId: request.modelId,
      mode: request.mode,
      h3PromptMode: request.h3PromptMode,
      referenceImageCount: request.imagePaths?.length ?? (request.imagePath ? 1 : 0),
      durationSeconds: request.h3DurationSeconds
    });
    if (promptBackend === "h3-prompt-writer") {
      if (!request.prompt.trim()) throw new Error("请先输入需要扩写的提示词");
      if (store.get().queueRunning || activeController || queueWorker) {
        throw new Error("当前有视频任务正在运行，暂不能启动提示词模型。请等待任务结束或先暂停队列。 ");
      }
      if (nativePromptWorker) throw new Error("当前正在生成提示词，请等待本次扩写完成。");
      const controller = new AbortController();
      nativePromptController = controller;
      const worker = (async () => {
        await ensureComfyUiReadyForPrompt(settings);
        return enhancePromptWithH3PromptWriter(request, settings, controller.signal);
      })();
      nativePromptWorker = worker;
      try {
        const result = await worker;
        appLogger.info("prompt", "enhance-finished", "Prompt enhancement finished", {
          runtime,
          durationMs: Date.now() - startedAt,
          outputLength: result.length
        });
        return result;
      } catch (error) {
        appLogger.error("prompt", "enhance-failed", safeLogErrorMessage(error), {
          runtime,
          durationMs: Date.now() - startedAt,
          ...errorLogMeta(error)
        });
        throw error;
      } finally {
        if (nativePromptWorker === worker) nativePromptWorker = null;
        if (nativePromptController === controller) nativePromptController = null;
      }
    }
    if (promptBackend !== "native-text-generate") {
      throw new Error("当前选择的提示词模型没有可用的本地运行适配器，请重新扫描设置中的模型列表。");
    }
    if (!request.prompt.trim()) throw new Error("请先输入需要扩写的提示词");
    if (store.get().queueRunning || activeController || queueWorker) {
      throw new Error("当前有视频任务正在运行，暂不能启动提示词模型。请等待任务结束或先暂停队列。 ");
    }
    if (nativePromptWorker) throw new Error("当前正在生成提示词，请等待本次扩写完成。");
    const controller = new AbortController();
    nativePromptController = controller;
    const worker = (async () => {
      await ensureComfyUiReadyForPrompt(settings);
      await validateNativePromptRuntime(settings);
      return enhancePromptWithComfyUi(request, settings, controller.signal);
    })();
    nativePromptWorker = worker;
    try {
      const result = await worker;
      appLogger.info("prompt", "enhance-finished", "Prompt enhancement finished", {
        runtime,
        durationMs: Date.now() - startedAt,
        outputLength: result.length
      });
      return result;
    } catch (error) {
      appLogger.error("prompt", "enhance-failed", safeLogErrorMessage(error), {
        runtime,
        durationMs: Date.now() - startedAt,
        ...errorLogMeta(error)
      });
      throw error;
    } finally {
      if (nativePromptWorker === worker) nativePromptWorker = null;
      if (nativePromptController === controller) nativePromptController = null;
    }
  });
  ipcMain.handle("prompt:release", async () => {
    const startedAt = Date.now();
    appLogger.info("prompt", "service-release-requested", "Prompt service release requested");
    const result = await releasePromptRuntimeForUser();
    appLogger.info(
      "prompt",
      result.ok ? "service-released" : "service-release-failed",
      result.message,
      { durationMs: Date.now() - startedAt, ok: result.ok }
    );
    return result;
  });
  ipcMain.handle(
    "connection:test",
    async (_event, kind: ConnectionKind, settings: Settings) => {
      const startedAt = Date.now();
      appLogger.info("service", "connection-test-started", "Service connection test started", { kind });
      try {
        const message = await testComfyUi(settings);
        appLogger.info("service", "connection-test-succeeded", "Service connection test succeeded", {
          kind,
          durationMs: Date.now() - startedAt
        });
        return { ok: true, message };
      } catch (error) {
        appLogger.warn("service", "connection-test-failed", "Service connection test failed", {
          kind,
          durationMs: Date.now() - startedAt,
          error: safeLogErrorMessage(error)
        });
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error)
        };
      }
    }
  );
  ipcMain.handle(
    "environment:scan",
    async (_event, settings: Settings) => {
      const startedAt = Date.now();
      appLogger.info("environment", "scan-started", "Environment scan started");
      try {
        const result = await scanEnvironment(settings);
        appLogger.info("environment", "scan-finished", "Environment scan finished", {
          durationMs: Date.now() - startedAt,
          checkedFrom: result.comfyCompatibility.checkedFrom,
          gpuCount: result.gpus.length,
          modelProfiles: result.modelProfiles.length,
          availableModels: result.modelProfiles.filter((profile) => profile.available).length,
          customNodes: result.customNodes.length,
          installedCustomNodes: result.customNodes.filter((node) => node.installed && !node.loadError).length,
          issueCount: result.issues.length
        });
        return result;
      } catch (error) {
        appLogger.error("environment", "scan-failed", safeLogErrorMessage(error), {
          durationMs: Date.now() - startedAt,
          ...errorLogMeta(error)
        });
        throw error;
      }
    }
  );
  ipcMain.handle(
    "service:start",
    async (_event, kind: LocalServiceKind, settings: Settings) => {
      appLogger.info("service", "start-requested", "Local service start requested", { kind });
      const result = await startLocalService(kind, settings);
      appLogger.info(
        "service",
        result.ok ? "start-succeeded" : "start-failed",
        result.message,
        { kind, ok: result.ok }
      );
      return result;
    }
  );
  ipcMain.handle(
    "service:force-stop-comfy",
    async (_event, settings: Settings) => {
      appLogger.warn("service", "force-stop-requested", "ComfyUI force-stop requested");
      nativePromptController?.abort(new Error("ComfyUI 已被强制终止，提示词扩写已中止"));
      const worker = queueWorker;
      if (worker) {
        const stopped = await store.update((state) => {
          state.queueRunning = false;
        });
        sendState(stopped);
        activeController?.abort(new Error("用户强制终止 ComfyUI"));
        await interrupt(settings).catch(() => undefined);
      }
      const result = await forceStopComfyProcesses(settings);
      appLogger.info(
        "service",
        result.ok ? "force-stop-succeeded" : "force-stop-failed",
        result.message,
        { ok: result.ok }
      );
      await waitWithTimeout(worker, 15_000);
      return result;
    }
  );
  ipcMain.handle(
    "service:restart",
    async (_event, kind: LocalServiceKind, settings: Settings) => {
      appLogger.info("service", "restart-requested", "Local service restart requested", { kind });
      const result = await restartLocalService(kind, settings);
      appLogger.info(
        "service",
        result.ok ? "restart-succeeded" : "restart-failed",
        result.message,
        { kind, ok: result.ok }
      );
      return result;
    }
  );
  ipcMain.handle(
    "comfyui:update",
    (_event, settings: Settings) => loggedOperation(
      "service",
      "comfy-update",
      "ComfyUI update started",
      () => updateComfyUi(settings)
    )
  );
  ipcMain.handle(
    "environment:repair",
    (_event, issueId: EnvironmentIssue["id"], settings: Settings) => loggedOperation(
      "environment",
      "repair",
      "Environment repair started",
      () => repairEnvironmentIssue(issueId, settings),
      { issueId }
    )
  );
  ipcMain.handle(
    "custom-node:install",
    (_event, nodeId: string, settings: Settings) => loggedOperation(
      "environment",
      "custom-node-install",
      "Custom node installation started",
      () => installCustomNode(nodeId, settings),
      { nodeId }
    )
  );
  ipcMain.handle(
    "workflow-dependency:install",
    (_event, workflowId, settings: Settings) => loggedOperation(
      "environment",
      "workflow-dependency-install",
      "Workflow dependency installation started",
      () => installWorkflowDependency(workflowId, settings),
      { workflowId }
    )
  );
  ipcMain.handle(
    "attention-acceleration:install",
    (event, settings: Settings) => loggedOperation(
      "environment",
      "attention-install",
      "Attention acceleration installation started",
      () => installAttentionAcceleration(settings, (message) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send("attention-acceleration:log", message);
        }
      })
    )
  );
  ipcMain.handle("queue:enqueue", async (_event, draft: Draft) => {
    if (draft.inputMode !== "image") {
      throw new Error("视频续写必须使用独立的 extension 队列任务");
    }
    const isR2V = isMiniMaxH3R2vModel(draft.modelId);
    if (!isR2V && !draft.startImagePath) throw new Error("请先选择首帧图片");
    if (
      isR2V &&
      (!draft.h3ReferenceSlots.length ||
        draft.h3ReferenceSlots.some((slot) => !slot.mediaPath))
    ) {
      throw new Error("R2V 的每个 Slot 都必须先添加图片或视频。");
    }
    if (!promptOf(draft)) throw new Error("提示词不能为空");
    if (!draft.workflowPath) throw new Error("请先选择该模型的 ComfyUI API 工作流");
    const safety = generationSafetyForTask(draft);
    if (!safety.safe) throw new Error(safety.message);
    let workflow: unknown;
    try {
      workflow = JSON.parse(await fs.readFile(draft.workflowPath, "utf8"));
    } catch (error) {
      throw new Error(
        `无法读取工作流 JSON：${error instanceof Error ? error.message : String(error)}`
      );
    }
    const validation = validateApiWorkflow(workflow);
    if (!validation.valid) {
      throw new Error(`工作流校验失败：${validation.errors.join("；")}`);
    }
    if (
      draft.endImagePath &&
      !workflowSupportsEndImage(workflow)
    ) {
      throw new Error(
        "当前工作流不支持尾帧。请选择包含 {{END_IMAGE}} 占位符的自定义 API 工作流，或移除尾帧。"
      );
    }
    const next = await store.update((state) => {
      state.queue.push(queueTaskFromDraft(draft, state));
      state.draft = draft;
    });
    const task = next.queue.at(-1);
    if (task && !isImageGenerationQueueTask(task)) {
      appLogger.info("queue", "task-enqueued", "Generation task added to queue", {
        taskId: task.id,
        taskType: task.taskType,
        modelId: task.modelId,
        duration: task.duration,
        fps: task.fps
      });
    }
    sendState(next);
    return next;
  });
  ipcMain.handle("queue:enqueue-image", async (_event, draft: ImageEditDraft) => {
    const normalized = normalizeImageEditDraft(draft);
    const adapter = imageModelAdapterFor(normalized.modelId);
    if (!adapter) {
      throw new Error(`当前没有 ${normalized.modelId} 的图片模型适配器。`);
    }
    if (!normalized.pictures.length) throw new Error("请先添加至少一张 Picture 作为基础图片。");
    if (normalized.pictures.length > adapter.maxPictures) {
      throw new Error(`当前 ${adapter.name} 工作流最多支持 ${adapter.maxPictures} 张 Picture。`);
    }
    const incompletePicture = normalized.pictures.find((picture) => !picture.absolutePath);
    if (incompletePicture) {
      throw new Error(`请先为 Slot ${incompletePicture.pictureNumber}（Picture ${incompletePicture.pictureNumber}）添加图片。`);
    }
    const prompt = normalized.promptVersions[normalized.activePromptVersion]?.text.trim() ?? "";
    if (!prompt) throw new Error("图片处理提示词不能为空");
    const diffusionModelFilename = await requireImageModelAssets(
      store.get().settings,
      normalized.modelId,
      normalized.qualityProfile
    );
    const outputTarget = await resolveImageOutputTarget(store.get().settings);
    const imageLibraryDirectory = await effectiveImageInputLibraryDirectory(store.get().settings);
    const archiveOperationId = randomUUID().slice(0, 8);
    appLogger.info("assets", "image-input-archive-started", "开始归档图片任务输入素材", {
      operationId: archiveOperationId,
      referenceCount: normalized.pictures.length
    });
    let archivedPictures: typeof normalized.pictures;
    try {
      archivedPictures = await archiveImageReferences(normalized.pictures, imageLibraryDirectory);
      appLogger.info("assets", "image-input-archive-completed", "图片任务输入素材已归档并校验", {
        operationId: archiveOperationId,
        referenceCount: archivedPictures.length,
        uniqueAssets: new Set(archivedPictures.map((picture) => picture.contentHash).filter(Boolean)).size
      });
    } catch (error) {
      appLogger.error("assets", "image-input-archive-failed", "图片任务输入素材归档失败，任务未加入队列", {
        operationId: archiveOperationId,
        error: safeLogErrorMessage(error)
      });
      throw error;
    }
    const preparedDraft = normalizeImageEditDraft({
      ...normalized,
      pictures: archivedPictures.map((picture) => ({
        ...picture,
        ...readImageDimensions(picture.absolutePath)
      })),
      outputFormat: "png"
    });
    for (const picture of preparedDraft.pictures) {
      const stat = await fs.stat(picture.absolutePath).catch(() => null);
      if (!stat?.isFile()) {
        throw new Error(`Picture ${picture.pictureNumber} 文件不存在：${picture.absolutePath}`);
      }
      const effectivePath = imageReferenceInputPath(picture);
      if (effectivePath !== picture.absolutePath) {
        const markedStat = await fs.stat(effectivePath).catch(() => null);
        if (!markedStat?.isFile()) {
          throw new Error(`Picture ${picture.pictureNumber} 的标记预览不存在，请重新打开标记画布并保存。`);
        }
      }
    }
    const preparedPrompt = preparedDraft.promptVersions[preparedDraft.activePromptVersion]?.text.trim() ?? "";
    const compiled = adapter.compilePrompt(preparedPrompt, preparedDraft.pictures);
    if (compiled.errors.length) throw new Error(compiled.errors.join(" "));
    const current = store.get();
    const task = imageTaskFromDraft(preparedDraft, current, diffusionModelFilename, outputTarget);
    const next = await store.update((state) => {
      state.queue.push(task);
      state.imageDraft = preparedDraft;
    });
    appLogger.info("queue", "image-task-enqueued", "Image generation batch added to queue", {
      taskId: task.id,
      projectId: task.projectId,
      modelId: task.modelId,
      outputCount: task.outputCount,
      seedMode: preparedDraft.seed == null ? "random-per-run" : "fixed"
    });
    sendState(next);
    return next;
  });
  ipcMain.handle("queue:enqueue-extension", async (_event, draft: Draft) => {
    if (draft.inputMode !== "video") {
      throw new Error("只有视频输入模式可以创建 extension 队列任务");
    }
    if (!promptOf(draft)) throw new Error("提示词不能为空");
    if (!draft.workflowPath) throw new Error("请先选择视频续写 API 工作流");
    if (!(await fs.stat(draft.sourceVideoPath).catch(() => null))) {
      throw new Error("源视频文件不存在，无法加入续写队列");
    }
    let workflow: unknown;
    try {
      workflow = JSON.parse(await fs.readFile(draft.workflowPath, "utf8"));
    } catch (error) {
      throw new Error(
        `无法读取续写工作流 JSON：${error instanceof Error ? error.message : String(error)}`
      );
    }
    const validation = validateApiWorkflow(workflow);
    if (!validation.valid) {
      throw new Error(`工作流校验失败：${validation.errors.join("；")}`);
    }
    const workflowSafetyErrors = isMiniMaxH3Fl2vaModel(draft.modelId)
      ? workflowSupportsH3BoundaryExtension(workflow)
        ? []
        : ["H3 接续工作流缺少 INPUT_IMAGE、MiniMaxH3ImageToVideo 或视频输出节点"]
      : isMiniMaxH3R2vModel(draft.modelId)
        ? workflowSupportsH3MotionContextExtension(workflow)
          ? []
          : ["H3 Motion Context 工作流缺少 R2V、运动上下文、同步裁剪、latent 保存或视频输出节点"]
      : extensionWorkflowSafetyErrors(workflow);
    if (workflowSafetyErrors.length) {
      throw new Error(`续写工作流不符合原生续写低显存契约：${workflowSafetyErrors.join("；")}`);
    }
    const current = store.get();
    const task = extensionTaskFromDraft(draft, current);
    if (isMiniMaxH3R2vModel(task.modelId)) {
      const outputDirectory = await resolveTaskOutputDirectory();
      const relativePrefix = `h3_context/${task.id}/clip`;
      task.h3ContextSavePrefix = relativePrefix;
      task.h3ContextSavedPath = outputDirectory
        ? path.join(outputDirectory, "h3_context", task.id, "clip_00001.safetensors")
        : undefined;
      task.h3ContextLatentPath =
        draft.h3ContextLatentPath &&
        Math.abs(draft.trimEndSeconds - draft.sourceVideoDuration) < 0.05 &&
        await fs.stat(draft.h3ContextLatentPath).catch(() => null)
          ? draft.h3ContextLatentPath
          : undefined;
    }
    const safety = extensionSafetyForTask(task);
    if (!safety.safe) throw new Error(safety.message);
    const next = await store.update((state) => {
      state.queue.push(task);
      state.draft = draft;
    });
    appLogger.info("queue", "task-enqueued", "Extension task added to queue", {
      taskId: task.id,
      taskType: task.taskType,
      modelId: task.modelId,
      duration: task.duration,
      fps: task.fps
    });
    sendState(next);
    return next;
  });
  ipcMain.handle("queue:enqueue-upscale", async (_event, request: UpscaleRequest) => {
    const current = store.get();
    const asset = current.history.find((item) => item.id === request.sourceAssetId);
    const version = asset?.versions.find((item) => item.id === request.sourceVersionId);
    if (!asset || !version) throw new Error("源作品或版本已不存在");
    if (!request.sourceFilePath || !(await fs.stat(request.sourceFilePath).catch(() => null))) {
      throw new Error("源视频文件不存在，无法加入提升队列");
    }
    const next = await store.update((state) => {
      state.queue.push(upscaleTaskFromRequest(request, state));
    });
    const task = next.queue.at(-1);
    if (task?.taskType === "upscale") {
      appLogger.info("queue", "task-enqueued", "Upscale task added to queue", {
        taskId: task.id,
        taskType: task.taskType,
        modelId: task.modelId,
        sourceWidth: task.sourceWidth,
        sourceHeight: task.sourceHeight,
        targetWidth: task.targetWidth,
        targetHeight: task.targetHeight,
        duration: task.duration,
        fps: task.fps
      });
    }
    sendState(next);
    return next;
  });
  ipcMain.handle(
    "queue:update-upscale",
    async (_event, taskId: string, patch: Pick<UpscaleQueueTask, "targetWidth" | "targetHeight" | "modelId" | "workflowPath" | "tileMode" | "faceRestore" | "outputFilename">) => {
      const next = await store.update((state) => {
        const task = state.queue.find((item) => item.id === taskId);
        if (
          !task ||
          task.taskType !== "upscale" ||
          (task.status !== "waiting" &&
            task.status !== "failed" &&
            task.status !== "cancelled")
        ) return;
        const resetFailure = task.status === "failed" || task.status === "cancelled";
        Object.assign(task, patch, {
          tileMode: patch.tileMode ?? task.tileMode,
          ...(resetFailure
            ? {
                status: "waiting" as const,
                error: undefined,
                progress: 0,
                stage: undefined,
                startedAt: undefined,
                comfyPromptId: undefined,
                automaticRetryAttempt: undefined
              }
            : {}),
          updatedAt: new Date().toISOString()
        });
      });
      sendState(next);
      return next;
    }
  );
  ipcMain.handle("queue:remove", async (_event, taskId: string) => {
    const next = await store.update((state) => {
      state.queue = state.queue.filter(
        (task) => task.id !== taskId || task.status === "running"
      );
    });
    sendState(next);
    return next;
  });
  ipcMain.handle("queue:start", async () => {
    if (nativePromptWorker) {
      throw new Error("当前正在生成提示词，请等待扩写完成后再开始视频任务。 ");
    }
    const next = await store.update((state) => {
      state.queueRunning = true;
    });
    appLogger.info("queue", "started", "Queue processing started", {
      waitingTasks: next.queue.filter((task) => task.status === "waiting").length
    });
    sendState(next);
    if (!queueWorker) {
      queueWorker = executeQueue().finally(() => {
        queueWorker = null;
      });
    }
    return next;
  });
  ipcMain.handle("queue:pause", async () => {
    const next = await store.update((state) => {
      state.queueRunning = false;
    });
    appLogger.info("queue", "paused", "Queue processing paused");
    sendState(next);
    return next;
  });
  ipcMain.handle("queue:cancel", async (_event, taskId: string) => {
    const task = store.get().queue.find((item) => item.id === taskId);
    if (!task) return store.get();
    if (task.status === "running") {
      const settings = store.get().settings;
      const serviceSettings = comfyUiSettingsForQueueTask(task, settings);
      const worker = queueWorker;
      const next = await store.update((state) => {
        state.queueRunning = false;
        const current = state.queue.find((item) => item.id === taskId);
        if (current && current.status === "running") {
          current.status = "cancelled";
          current.stage = "任务已取消，正在后台清理 ComfyUI";
          current.error = "任务已取消，正在后台清理 ComfyUI。";
          current.updatedAt = new Date().toISOString();
        }
      });
      sendState(next);
      activeController?.abort(new Error("用户取消任务"));
      void cleanupCancelledQueueTask(taskId, serviceSettings, worker);
      return next;
    }
    return updateTask(taskId, {
      status: "cancelled",
      error: "任务在开始前被取消"
    });
  });
  ipcMain.handle(
    "queue:move",
    async (_event, taskId: string, direction: -1 | 1) => {
      const next = await store.update((state) => {
        state.queue = moveWaitingTask(state.queue, taskId, direction);
      });
      sendState(next);
      return next;
    }
  );
  ipcMain.handle("queue:duplicate", async (_event, taskId: string) => {
    const next = await store.update((state) => {
      const source = state.queue.find((task) => task.id === taskId);
      if (!source) return;
      if (isImageGenerationQueueTask(source)) {
        throw new Error("图片批次复制将在图片编辑页面接入。");
      }
      const now = new Date().toISOString();
      const names = [
        ...state.queue.map((task) => task.outputFilename),
        ...state.history.map((asset) => asset.outputFilename)
      ];
      const outputFilename = source.taskType === "generation" || source.taskType === "extension"
        ? createOutputFilename(source.modelId, source.resolution, source.duration, names)
        : uniqueUpscaleFilename(source.sourceFilename, source.targetHeight, names);
      state.queue.push({
        ...source,
        id: crypto.randomUUID(),
        status: "waiting",
        createdAt: now,
        updatedAt: now,
        outputFilename,
        seed: source.keepSeedOnCopy
          ? source.seed
          : Math.floor(Math.random() * Number.MAX_SAFE_INTEGER),
        comfyPromptId: undefined,
        progress: 0,
        error: undefined,
        stage: undefined,
        automaticRetryAttempt: undefined
      });
    });
    sendState(next);
    return next;
  });
  ipcMain.handle("queue:reset", async (_event, taskId: string) => {
    let reset = false;
    const next = await store.update((state) => {
      const task = state.queue.find((item) => item.id === taskId);
      if (!task || (task.status !== "failed" && task.status !== "cancelled")) return;
      Object.assign(task, {
        status: "waiting" as const,
        updatedAt: new Date().toISOString(),
        comfyPromptId: undefined,
        progress: 0,
        error: undefined,
        stage: undefined,
        startedAt: undefined,
        automaticRetryAttempt: undefined
      });
      reset = true;
    });
    if (reset) {
      appLogger.info("queue", "task-reset-to-waiting", "Failed or cancelled task was reset to the waiting queue without starting it", {
        taskId,
        queueRunning: next.queueRunning
      });
    }
    sendState(next);
    return next;
  });
  ipcMain.handle("history:delete", async (_event, assetId: string) => {
    const startedAt = Date.now();
    appLogger.info("history", "delete-started", "History asset deletion started", { assetId });
    const current = store.get();
    const asset = current.history.find((item) => item.id === assetId);
    const imageProject = current.imageHistory.find((item) => item.id === assetId);
    if (!asset && !imageProject) return current;
    try {
      const filesToDelete = asset
        ? historyVideoPaths(asset, current.settings.outputDirectory)
        : [...new Set(
            imageProject!.versions
              .filter((version) => version.kind !== "source")
              .map((version) => version.file.absolutePath)
              .filter((filename): filename is string => Boolean(filename))
          )];
      for (const filename of filesToDelete) {
        try {
          await fs.unlink(filename);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
          throw new Error(
            `无法删除视频文件 ${path.basename(filename)}：${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
      const next = await store.update((state) => {
        if (asset) state.history = state.history.filter((item) => item.id !== assetId);
        if (imageProject) state.imageHistory = state.imageHistory.filter((item) => item.id !== assetId);
      });
      if (asset) await removeHistoryCoverCache(asset);
      appLogger.info("history", "delete-succeeded", "History asset deleted", {
        assetId,
        durationMs: Date.now() - startedAt,
        versionCount: asset?.versions.length ?? imageProject?.versions.length ?? 0
      });
      sendState(next);
      return next;
    } catch (error) {
      appLogger.error("history", "delete-failed", safeLogErrorMessage(error), {
        assetId,
        durationMs: Date.now() - startedAt,
        ...errorLogMeta(error)
      });
      throw error;
    }
  });
  ipcMain.handle("image-history:set-cover", async (_event, projectId: string, versionId?: string) => {
    const next = await store.update((state) => {
      const project = state.imageHistory.find((item) => item.id === projectId);
      if (!project) throw new Error("图片项目不存在。");
      if (versionId) {
        if (!project.versions.some((version) => version.id === versionId)) {
          throw new Error("图片版本不存在。");
        }
        project.coverMode = "pinned";
        project.coverVersionId = versionId;
      } else {
        project.coverMode = "auto";
        project.coverVersionId = undefined;
      }
    });
    sendState(next);
    return next;
  });
  ipcMain.handle("image-history:delete-version", async (_event, projectId: string, versionId: string) => {
    const current = store.get();
    const project = current.imageHistory.find((item) => item.id === projectId);
    const version = project?.versions.find((item) => item.id === versionId);
    if (!project || !version) throw new Error("图片项目或版本不存在。");
    if (version.kind === "source") throw new Error("原始导入图片不能从项目中删除。");
    const remainingPaths = new Set(
      project.versions
        .filter((item) => item.id !== versionId)
        .map((item) => item.file.absolutePath)
        .filter((filename): filename is string => Boolean(filename))
    );
    if (version.file.absolutePath && !remainingPaths.has(version.file.absolutePath)) {
      await fs.unlink(version.file.absolutePath).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw new Error(`无法删除图片文件 ${path.basename(version.file.absolutePath!)}：${error instanceof Error ? error.message : String(error)}`);
        }
      });
    }
    const next = await store.update((state) => {
      const target = state.imageHistory.find((item) => item.id === projectId);
      if (!target) return;
      target.versions = target.versions.filter((item) => item.id !== versionId);
      if (target.coverVersionId === versionId) {
        target.coverMode = "auto";
        target.coverVersionId = undefined;
      }
      target.updatedAt = [...target.versions]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]?.createdAt ?? target.createdAt;
    });
    sendState(next);
    return next;
  });
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  appLogger.info("app", "ready", "Application is ready", {
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch
  });
  Menu.setApplicationMenu(null);
  store = new JsonStore(path.join(app.getPath("userData"), "studio-state.json"));
  await store.load();
  await materializeDefaultImageInputLibraryDirectory();
  appLogger.info("app", "state-loaded", "Application state loaded", {
    queueCount: store.get().queue.length,
    historyCount: store.get().history.length,
    queueRunning: store.get().queueRunning
  });
  await restoreHistoryOutputPaths();
  registerMediaProtocol();
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
