import {
  app,
  BrowserWindow,
  crashReporter,
  dialog,
  ipcMain,
  Menu,
  protocol,
  shell,
  type MenuItemConstructorOptions
} from "electron";
import { createReadStream, promises as fs } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import type {
  AppState,
  BundledWorkflow,
  ConnectionKind,
  Draft,
  EnhanceRequest,
  EnvironmentIssue,
  HistoryAsset,
  HistoryFile,
  HistoryMetadataPatch,
  HistoryMigrationProgress,
  ImageAssetLibraryProgress,
  ImageCropSaveRequest,
  ImageEditDraft,
  ImageMaskSaveRequest,
  ImageMarkupSaveRequest,
  LocalServiceKind,
  NotificationKind,
  PromptProgress,
  PromptProgressReporter,
  PromptProgressStage,
  QueueLifecycle,
  QueueTask,
  Settings,
  SettingsSaveMode,
  WindowCloseRequest,
  WindowCloseResponse
} from "../src/types.js";
import { normalizeUiLocale } from "../src/core/i18n.js";
import { isHistoryRating } from "../src/core/history-filter.js";
import {
  isH3ReferenceAutoPrompt,
  validateH3ReferenceAutoPrompt
} from "../src/core/h3-auto-prompter.js";
import { historyVideoPaths } from "../src/core/history-delete.js";
import { createHistoryCoverCacheKey } from "../src/core/history-cover.js";
import { historyFileCandidates } from "../src/core/history-media.js";
import { mergeChromiumFeatureList } from "../src/core/chromium-features.js";
import {
  extractComfyOutputFiles
} from "../src/core/comfy-output.js";
import { attachAbsoluteOutputPaths } from "../src/core/comfy-output-paths.js";
import {
  syncQueueVideoInputPaths
} from "../src/core/queue.js";
import { normalizeImageEditDraft } from "../src/core/image-project.js";
import { promptModelBackend } from "../src/core/prompt-models.js";
import { imageOutputFormatFromFilename } from "../src/core/image-workflow.js";
import {
  extensionWorkflowSafetyErrors,
  isMiniMaxH3Fl2vaModel,
  isMiniMaxH3R2vModel,
  isMiniMaxH3Model,
  workflowSupportsEndImage,
  workflowSupportsH3BoundaryExtension,
  workflowSupportsH3MotionContextExtension
} from "../src/core/workflow.js";
import { workflowMetadataForFilename } from "../src/core/workflow-metadata.js";
import { JsonStore } from "./store.js";
import { registerQueueMutationIpc } from "./queue-ipc.js";
import { registerQueueEnqueueIpc } from "./queue-enqueue.js";
import { createQueueExecutor } from "./queue-executor.js";
import { cleanupCancelledQueueTask as cleanupCancelledQueueTaskInRecovery } from "./queue-recovery.js";
import {
  QueueWorkerController,
  registerQueueControlIpc
} from "./queue-worker.js";
import {
  copyFileToWindowsClipboard,
  resolveExistingHistoryFile
} from "./services/windows-clipboard.js";
import {
  isComfyMultimodalPromptModel,
  isGemmaPromptModel,
  promptRuntimeForSettings
} from "../src/core/prompt-models.js";
import { comfyUiSettingsForQueueTask } from "./services/comfy-runtime-policy.js";
import {
  installAttentionAcceleration,
  installCustomNode,
  installLlamaCppPython,
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
  testComfyUi,
  interrupt,
  TaskStalledError,
  warmNativePromptModel
} from "./services/comfy-ui.js";
import { isLocalPortInUse, localEndpoint } from "./services/local-service-process.js";
import {
  enhancePromptWithMultimodalComfyUi,
  warmMultimodalPromptModel
} from "./services/multimodal-prompt.js";
import {
  enhancePromptWithH3PromptWriter,
  promptWriterModelForSelection,
  releaseH3PromptWriter,
  testH3PromptWriter,
  validateH3PromptWriterRuntime
} from "./services/h3-prompt-writer.js";
import { getPerformanceMetrics } from "./services/performance.js";
import { getApplicationLogger, safeLogErrorMessage } from "./services/app-logger.js";
import { captureComfyUiLogFailure } from "./services/comfy-log-bridge.js";
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
const historyCoverExtension = (key: string) => key.startsWith("image-history:") ? ".png" : ".jpg";
const historyCoverPathFromDigest = (digest: string, extension = ".jpg") =>
  path.join(historyCoverDirectory(), `${digest}${extension}`);
const historyCoverPath = (key: string) =>
  historyCoverPathFromDigest(historyCoverDigest(key), historyCoverExtension(key));
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
const queueWorkerController = new QueueWorkerController();
let nativePromptController: AbortController | null = null;
let nativePromptWorker: Promise<unknown> | null = null;
let allowWindowClose = false;
let closeFlowRunning = false;
const hasSingleInstanceLock = app.requestSingleInstanceLock();
const appLogger = getApplicationLogger();
let fatalProcessErrorHandled = false;
const taskStageStartedAt = new Map<string, { stage: string; startedAt: number }>();

function createPromptProgressController(
  modelId: string,
  startedAt: number,
  operationId: string
): {
  update: PromptProgressReporter;
  finish(status: PromptProgress["status"], stage: PromptProgressStage, error?: string): void;
} {
  let lastProgress = 0;
  let lastSentAt = 0;
  let lastStage: PromptProgressStage = "preparing";
  const send = (
    status: PromptProgress["status"],
    stage: PromptProgressStage,
    progress: number | null,
    detail?: string,
    error?: string
  ) => {
    const elapsedMs = Date.now() - startedAt;
    const payload: PromptProgress = {
      status,
      stage,
      progress,
      startedAt,
      elapsedMs,
      modelId,
      ...(detail ? { detail } : {}),
      ...(error ? { error } : {})
    };
    mainWindow?.webContents.send("prompt:progress", payload);
    appLogger.info("prompt", "progress", "Prompt enhancement progress", {
      operationId,
      modelId,
      stage,
      status,
      progress,
      elapsedMs
    });
  };
  const update: PromptProgressReporter = (stage, progress = null, detail) => {
    const now = Date.now();
    if (now - lastSentAt < 250 && stage === lastStage) return;
    lastSentAt = now;
    lastStage = stage;
    const normalized = progress == null
      ? null
      : Math.min(99, Math.max(lastProgress, Math.max(0, progress)));
    if (normalized != null) lastProgress = normalized;
    send("running", stage, normalized, detail);
  };
  return {
    update,
    finish(status, stage, error) {
      send(status, stage, status === "completed" ? 100 : lastProgress, undefined, error);
    }
  };
}

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
    const details = error as Error & {
      cause?: unknown;
      code?: unknown;
      errno?: unknown;
      syscall?: unknown;
      status?: unknown;
      statusCode?: unknown;
    };
    return {
      errorName: error.name,
      errorStack: error.stack ?? "",
      ...(details.cause !== undefined
        ? { errorCause: safeLogErrorMessage(details.cause) }
        : {}),
      ...(typeof details.code === "string" || typeof details.code === "number"
        ? { errorCode: details.code }
        : {}),
      ...(typeof details.errno === "string" || typeof details.errno === "number"
        ? { errorErrno: details.errno }
        : {}),
      ...(typeof details.syscall === "string" ? { errorSyscall: details.syscall } : {}),
      ...(typeof details.status === "number" ? { errorStatus: details.status } : {}),
      ...(typeof details.statusCode === "number" ? { errorStatusCode: details.statusCode } : {})
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
        const match = url.pathname.match(/^\/([a-f0-9]{64})\.(jpg|png)$/i);
        if (!match?.[1]) return new Response("Invalid cover", { status: 400 });
        filename = historyCoverPathFromDigest(match[1].toLowerCase(), `.${match[2]!.toLowerCase()}`);
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
  const attachWorkflowMetadata = (workflow: BundledWorkflow): BundledWorkflow => {
    const metadata = workflowMetadataForFilename(workflow.path);
    return metadata ? { ...workflow, metadata } : workflow;
  };
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
        return attachWorkflowMetadata({
          modelId,
          label: "内置 · MiniMax H3 Q3 GGUF · 3080 低显存实验（不支持续写）",
          path: candidate,
          supportsEndImage: workflowSupportsEndImage(source),
          supportsVideoExtension: false
        });
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
        return attachWorkflowMetadata({
          modelId,
          label: "内置 · MiniMax H3 R2V Motion Context · 运动与音频连续",
          path: candidate,
          supportsEndImage: false,
          supportsVideoExtension: workflowSupportsH3MotionContextExtension(source)
        });
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
        return attachWorkflowMetadata({
          modelId,
          label: "内置 · MiniMax H3 结尾帧接续 · 原生音视频",
          path: candidate,
          supportsEndImage: workflowSupportsEndImage(source),
          supportsVideoExtension: workflowSupportsH3BoundaryExtension(source)
        });
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
      return attachWorkflowMetadata({
        modelId,
        label: `内置 · Sulphur 2 原生续写 · ${ltxProfileLabel}`,
        path: candidate,
        supportsEndImage: false,
        supportsVideoExtension: extensionWorkflowSafetyErrors(source).length === 0
      });
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
      return attachWorkflowMetadata({
        modelId,
        label,
        path: candidate,
        supportsEndImage: workflowSupportsEndImage(source),
        supportsVideoExtension: extensionWorkflowSafetyErrors(source).length === 0
      });
    }
  }
  return null;
}

let lastQueueLogSignature = "";

function sendState(state = store.get()): void {
  const queueSignature = state.queue
    .map((task) => `${task.id}:${task.status}`)
    .join("|") + `|lifecycle:${state.queueLifecycle}`;
  if (queueSignature !== lastQueueLogSignature) {
    lastQueueLogSignature = queueSignature;
    appLogger.info("queue", "state-changed", "Queue state changed", {
      queueCount: state.queue.length,
      waitingCount: state.queue.filter((task) => task.status === "waiting").length,
      runningCount: state.queue.filter((task) => task.status === "running").length,
      failedCount: state.queue.filter((task) => task.status === "failed").length,
      cancelledCount: state.queue.filter((task) => task.status === "cancelled").length,
      queueRunning: state.queueRunning,
      queueLifecycle: state.queueLifecycle,
      taskOrder: state.queue.map((task) => task.id)
    });
  }
  mainWindow?.webContents.send("state:changed", state);
}

const videoOutputPattern = /\.(mp4|webm|mov|m4v|mkv)$/i;

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

function cleanupCancelledQueueTask(
  taskId: string,
  settings: Settings,
  worker: Promise<void> | null
): Promise<void> {
  return cleanupCancelledQueueTaskInRecovery(
    {
      logger: appLogger,
      updateTask,
      isComfyUiRunning: async (currentSettings) => {
        const endpoint = localEndpoint(currentSettings.comfyUrl, 8188);
        return endpoint ? isLocalPortInUse(endpoint.port) : true;
      },
      isCancellationCurrent: (currentTaskId) => {
        const current = store.get();
        const task = current.queue.find((item) => item.id === currentTaskId);
        return current.queueLifecycleTaskId === currentTaskId &&
          (current.queueLifecycle === "cancelling" || current.queueLifecycle === "cleaning") &&
          task?.status === "cancelled";
      }
    },
    taskId,
    settings,
    worker
  );
}
async function interruptForExit(
  waitForWorker: boolean,
  queueCleanupOnly = false
): Promise<{
  interrupted: boolean;
  workerSettled: boolean;
}> {
  const settings = store.get().settings;
  if (queueCleanupOnly) {
    const cleanupWorker = queueWorkerController.cleanupWorker;
    if (!waitForWorker) {
      const forced = await forceStopComfyProcesses(settings);
      appLogger.info(
        "service",
        forced.ok ? "cleanup-force-stop-succeeded" : "cleanup-force-stop-failed",
        forced.message,
        { ok: forced.ok }
      );
      return { interrupted: forced.ok, workerSettled: false };
    }
    const cleanupSettled = await waitWithTimeout(cleanupWorker, 15_000);
    return {
      interrupted: true,
      workerSettled: cleanupSettled && await waitWithTimeout(queueWorkerController.runningWorker, 15_000)
    };
  }
  const hadNativePrompt = Boolean(nativePromptWorker);
  const next = await store.update((state) => {
    state.queueRunning = false;
  });
  sendState(next);
  queueWorkerController.abort(new Error("应用退出，任务已中止"));
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
    ? await waitWithTimeout(queueWorkerController.runningWorker, 15_000)
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
  const currentState = store.get();
  const runningTask = currentState.queue.find((task) => task.status === "running");
  const cleanupTask = currentState.queueLifecycleTaskId
    ? currentState.queue.find((task) => task.id === currentState.queueLifecycleTaskId)
    : undefined;
  const queueCleanupOnly = !runningTask && !nativePromptWorker && (
    currentState.queueLifecycle === "cancelling" ||
    currentState.queueLifecycle === "cleaning" ||
    Boolean(queueWorkerController.cleanupWorker) ||
    (currentState.queueLifecycle === "error" &&
      cleanupTask?.status === "cancelled" &&
      Boolean(queueWorkerController.runningWorker || queueWorkerController.activeController))
  );
  const hasRunningWork = Boolean(
    runningTask || nativePromptWorker || (
      !queueCleanupOnly &&
      (queueWorkerController.activeController || queueWorkerController.runningWorker)
    )
  );
  if (!hasRunningWork && queueCleanupOnly) {
    closeFlowRunning = true;
    pendingWindowCloseRequest = {
      kind: "running-work",
      hasUnsavedSettings: rendererHasUnsavedSettings,
      queueCleanupOnly: true,
      queueLifecycle: currentState.queueLifecycle,
      queueLifecycleStartedAt: currentState.queueLifecycleStartedAt
    };
    mainWindow.webContents.send("window:close-requested", pendingWindowCloseRequest);
    return;
  }
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
    hasUnsavedSettings: rendererHasUnsavedSettings,
    ...(queueCleanupOnly
      ? {
          queueCleanupOnly: true,
          queueLifecycle: currentState.queueLifecycle,
          queueLifecycleStartedAt: currentState.queueLifecycleStartedAt
        }
      : {})
  };
  mainWindow.webContents.send("window:close-requested", pendingWindowCloseRequest);
}

async function finishRunningWorkClose(
  response: "finish-tasks" | "force-exit",
  queueCleanupOnly = false
): Promise<void> {
  try {
    if (!mainWindow) return;
    mainWindow.setTitle(`正在结束任务并退出… · ${studioWindowTitle()}`);
    if (response === "force-exit") {
      await interruptForExit(false, queueCleanupOnly);
      await finishWindowClose();
      return;
    }
    const result = await interruptForExit(true, queueCleanupOnly);
    // A stopped ComfyUI cannot acknowledge /interrupt. Once the application
    // worker and prompt worker have settled, there is no remaining work to
    // block the window close even when the HTTP request failed.
    if (!result.workerSettled) {
      const currentState = store.get();
      pendingWindowCloseRequest = {
        kind: "running-work",
        hasUnsavedSettings: rendererHasUnsavedSettings,
        queueCleanupOnly,
        queueCleanupTimedOut: true,
        queueLifecycle: currentState.queueLifecycle,
        queueLifecycleStartedAt: currentState.queueLifecycleStartedAt
      };
      mainWindow.webContents.send("window:close-requested", pendingWindowCloseRequest);
      return;
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

async function setQueueLifecycle(
  lifecycle: QueueLifecycle,
  taskId?: string
): Promise<AppState> {
  const next = await store.update((state) => {
    const changed = state.queueLifecycle !== lifecycle || state.queueLifecycleTaskId !== taskId;
    state.queueLifecycle = lifecycle;
    state.queueLifecycleTaskId = taskId;
    if (lifecycle === "idle") {
      state.queueLifecycleStartedAt = undefined;
    } else if (changed || !state.queueLifecycleStartedAt) {
      state.queueLifecycleStartedAt = new Date().toISOString();
    }
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

async function ensureComfyUiReady(taskId: string, signal?: AbortSignal): Promise<void> {
  const throwIfCancelled = (): void => {
    if (!signal?.aborted) return;
    throw signal.reason instanceof Error ? signal.reason : new Error("队列任务已取消");
  };
  throwIfCancelled();
  const settings = store.get().settings;
  const queuedTask = store.get().queue.find((item) => item.id === taskId);
  const serviceSettings = comfyUiSettingsForQueueTask(queuedTask, settings);
  let profile;
  try {
    profile = await alignLocalComfyUiRuntimeProfile(serviceSettings);
  } catch (error) {
    throwIfCancelled();
    throw error;
  }
  throwIfCancelled();
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
    throwIfCancelled();
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

  throwIfCancelled();
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
  throwIfCancelled();
  await testComfyUi(serviceSettings);
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
      `提示词模型尚未就绪${missing ? `，缺少：${missing}` : ""}。请把模型放入 ${isComfyMultimodalPromptModel(settings.promptModelId) ? "ComfyUI/models/LLM 的对应子目录" : "ComfyUI/models/text_encoders"} 后重新扫描。`
    );
  }
  if (isGemmaPromptModel(settings.promptModelId) && !scan.llamaCppPython.ready) {
    const runtime = scan.llamaCppPython;
    const detail = runtime.detail || runtime.error || "未通过 CUDA/导入自检";
    throw new Error(
      `Gemma H3 Prompt Writer 的共享 llama-cpp-python 尚未就绪：${detail}。请在设置 → 提示词扩写中对当前选中的 ComfyUI Python 执行“重新安装/修复”，然后重启 ComfyUI。`
    );
  }
  if (isComfyMultimodalPromptModel(settings.promptModelId)) {
    if (profile.missingCustomNodeIds?.length) {
      throw new Error(
        `多模态提示词模型缺少 ComfyUI 节点：${profile.missingCustomNodeNames?.join("、") || profile.missingCustomNodeIds.join("、")}。请先在设置 → 节点与工作流中安装。`
      );
    }
    if (profile.runtimeVerified && profile.runtimeReady === false) {
      throw new Error(
        `多模态提示词节点尚未被当前 ComfyUI 加载：${profile.runtimeMissingNodes?.join("、") || "VisionLLMNode"}。请重启 ComfyUI 后重新扫描。`
      );
    }
    return;
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

async function recoverStalledPromptComfyUi(settings: Settings): Promise<void> {
  await interrupt(settings).catch((error) => {
    appLogger.warn("prompt", "stall-interrupt-failed", "Unable to interrupt the stalled prompt workflow", {
      error: safeLogErrorMessage(error)
    });
  });
  const recovery = await restartLocalService("comfy", settings);
  appLogger.warn(
    "prompt",
    recovery.ok ? "stall-recovery-succeeded" : "stall-recovery-skipped",
    recovery.message,
    { recoveryOk: recovery.ok }
  );
}

async function releasePromptRuntimeForUser(): Promise<{ ok: boolean; message: string }> {
  const settings = store.get().settings;
  if (store.get().queueRunning || queueWorkerController.activeController || queueWorkerController.runningWorker) {
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

let queueExecutor: (() => Promise<void>) | null = null;
async function executeQueue(): Promise<void> {
  queueExecutor ??= createQueueExecutor({
    store,
    logger: appLogger,
    worker: queueWorkerController,
    sendState,
    sendPreview: (payload) => mainWindow?.webContents.send("task:preview", payload),
    setQueueLifecycle,
    updateTask,
    ensureComfyUiReady,
    resolveTaskOutputDirectory,
    requireExistingImageOutput,
    requireExistingVideoOutput,
    releasePromptRuntime,
    stabilizeH3RuntimeBetweenTasks,
    settingsForTask: comfyUiSettingsForQueueTask,
    errorMeta: errorLogMeta,
    taskStageStartedAt
  });
  return queueExecutor();
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
        await finishRunningWorkClose(response, request.queueCleanupOnly === true);
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
    () => undefined
  );
  ipcMain.handle(
    "logs:notification",
    (_event, kind: NotificationKind, message: string) => {
      const event = kind.replaceAll("-", "_");
      const meta = { notificationKind: kind };
      if (kind === "error") {
        appLogger.error("ui", event, message, meta);
      } else if (kind === "warning") {
        appLogger.warn("ui", event, message, meta);
      } else {
        appLogger.info("ui", event, message, meta);
      }
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
  ipcMain.handle("queue:set-h3-live-preview", async (_event, enabled: boolean) => {
    const value = enabled === true;
    const next = await store.update((state) => {
      state.settings.h3LivePreview = value;
    });
    appLogger.info("queue", "h3-live-preview-setting-changed", "H3 live preview queue preference changed", {
      enabled: value
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
        rendererHasUnsavedSettings = false;
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
    rendererHasUnsavedSettings = false;
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
  ipcMain.handle("file:open-directory", async (_event, directory: string) => {
    const requestedDirectory = typeof directory === "string" ? directory.trim() : "";
    if (!requestedDirectory) return false;
    const directoryPath = path.resolve(requestedDirectory);
    try {
      await fs.mkdir(directoryPath, { recursive: true });
      const directoryStat = await fs.stat(directoryPath);
      if (!directoryStat.isDirectory()) return false;
      const errorMessage = await shell.openPath(directoryPath);
      if (errorMessage) {
        appLogger.warn("settings", "open-model-directory-failed", "Model directory could not be opened", {
          directory: directoryPath,
          error: errorMessage
        });
        return false;
      }
      appLogger.info("settings", "open-model-directory-succeeded", "Model directory opened", {
        directory: directoryPath
      });
      return true;
    } catch (error) {
      appLogger.warn("settings", "open-model-directory-failed", "Model directory could not be opened", {
        directory: directoryPath,
        error: safeLogErrorMessage(error)
      });
      return false;
    }
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
        imageProjectCount: snapshot.imageHistory.length,
        videoHistoryCount: snapshot.history.length,
        queueCount: snapshot.queue.filter((task) =>
          task.taskType === "image-generation" || task.taskType === "generation"
        ).length
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
        imageProjectCount: snapshot.imageHistory.length,
        videoHistoryCount: snapshot.history.length,
        queueCount: snapshot.queue.filter((task) =>
          task.taskType === "image-generation" || task.taskType === "generation"
        ).length
      });
      const prepared = await organizeImageAssetLibrary(snapshot, library, sendImageAssetLibraryProgress);
      const next = await store.update((state) => {
        state.imageDraft = prepared.state.imageDraft;
        state.imageHistory = prepared.state.imageHistory;
        state.draft.startImagePath = prepared.state.draft.startImagePath;
        state.draft.endImagePath = prepared.state.draft.endImagePath;
        state.draft.h3ReferenceSlots = prepared.state.draft.h3ReferenceSlots.map((slot) => ({ ...slot }));
        const preparedTasks = new Map(
          prepared.state.queue.map((task) => [task.id, task])
        );
        for (const task of state.queue) {
          const preparedTask = preparedTasks.get(task.id);
          if (task.taskType === "image-generation" && preparedTask?.taskType === "image-generation") {
            task.pictures = preparedTask.pictures;
          } else if (task.taskType === "generation" && preparedTask?.taskType === "generation") {
            task.startImagePath = preparedTask.startImagePath;
            task.endImagePath = preparedTask.endImagePath;
            task.h3ReferenceSlots = preparedTask.h3ReferenceSlots?.map((slot) => ({ ...slot }));
          }
        }
        const preparedHistory = new Map(prepared.state.history.map((asset) => [asset.id, asset]));
        for (const asset of state.history) {
          const preparedAsset = preparedHistory.get(asset.id);
          if (!preparedAsset) continue;
          asset.startImagePath = preparedAsset.startImagePath;
          asset.endImagePath = preparedAsset.endImagePath;
          asset.h3ReferenceSlots = preparedAsset.h3ReferenceSlots?.map((slot) => ({ ...slot }));
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
    const roots = [
      path.join(app.getPath("userData"), "image-guides"),
      path.join(app.getPath("userData"), "image-masks")
    ];
    const filename = typeof documentPath === "string" ? path.resolve(documentPath) : "";
    if (!filename || !roots.some((root) => isPathWithinDirectory(root, filename))) return null;
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
  ipcMain.handle("image-crop:save", async (_event, request: ImageCropSaveRequest) => {
    if (!request || typeof request !== "object") throw new Error("裁剪数据无效");
    const sourceStat = await fs.stat(request.sourcePath).catch(() => null);
    if (!sourceStat?.isFile()) throw new Error("原始 Picture 文件不存在");
    if (request.crop === null) return null;
    const crop = request.crop;
    const values = [crop.x, crop.y, crop.width, crop.height, crop.sourceWidth, crop.sourceHeight];
    if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) {
      throw new Error("裁剪区域无效");
    }
    const sourceWidth = Math.max(1, Math.trunc(crop.sourceWidth));
    const sourceHeight = Math.max(1, Math.trunc(crop.sourceHeight));
    const x = Math.max(0, Math.trunc(crop.x));
    const y = Math.max(0, Math.trunc(crop.y));
    const width = Math.max(1, Math.trunc(crop.width));
    const height = Math.max(1, Math.trunc(crop.height));
    if (x + width > sourceWidth || y + height > sourceHeight) {
      throw new Error("裁剪区域超出原图范围");
    }
    const bytes = request.croppedPng instanceof ArrayBuffer
      ? new Uint8Array(request.croppedPng)
      : null;
    if (!bytes?.byteLength) throw new Error("裁剪结果为空");
    if (bytes.byteLength > 100 * 1024 * 1024) throw new Error("裁剪结果不能超过 100 MB");
    const pictureKey = createHash("sha256")
      .update(`${request.pictureId}\0${path.resolve(request.sourcePath)}`)
      .digest("hex")
      .slice(0, 24);
    const revision = Math.max(1, Math.trunc(request.previousRevision ?? 0) + 1);
    const directory = path.join(app.getPath("userData"), "image-crops", pictureKey);
    await fs.mkdir(directory, { recursive: true });
    const basename = `revision-${String(revision).padStart(4, "0")}`;
    const documentPath = path.join(directory, `${basename}.crop.json`);
    const croppedPath = path.join(directory, `${basename}-crop.png`);
    const documentTemporary = `${documentPath}.${crypto.randomUUID()}.tmp`;
    const croppedTemporary = `${croppedPath}.${crypto.randomUUID()}.tmp`;
    const document = JSON.stringify({
      version: 1,
      sourceWidth,
      sourceHeight,
      x,
      y,
      width,
      height
    }, null, 2);
    try {
      await fs.writeFile(documentTemporary, document, "utf8");
      await fs.writeFile(croppedTemporary, bytes);
      await fs.rename(documentTemporary, documentPath);
      await fs.rename(croppedTemporary, croppedPath);
    } finally {
      await fs.rm(documentTemporary, { force: true }).catch(() => undefined);
      await fs.rm(croppedTemporary, { force: true }).catch(() => undefined);
    }
    return {
      documentPath,
      croppedPath,
      x,
      y,
      width,
      height,
      sourceWidth,
      sourceHeight,
      revision,
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
    return `studio-media://cover/${digest}${historyCoverExtension(key)}?v=${Math.round(coverStat.mtimeMs)}`;
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
    appLogger.info("prompt", "service-start-requested", "Prompt service start requested", {
      runtime,
      promptModelId: settings.promptModelId,
      promptBackend
    });
    if (store.get().queueRunning || queueWorkerController.activeController || queueWorkerController.runningWorker) {
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
        await validateNativePromptRuntime(settings);
        const status = await testH3PromptWriter(settings, controller.signal);
        promptWriterModelForSelection(status.models, settings.promptModelId);
        validateH3PromptWriterRuntime(status.diagnostics);
        return;
      }
      if (promptBackend === "comfyui-multimodal") {
        await ensureComfyUiReadyForPrompt(settings);
        await validateNativePromptRuntime(settings);
        await warmMultimodalPromptModel(settings, controller.signal);
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
          : promptBackend === "comfyui-multimodal"
            ? "ComfyUI 多模态提示词模型已通过节点验证；每次扩写后自动释放显存。"
          : "Qwen 提示词模型已启动并加载到 ComfyUI。"
      };
    } catch (error) {
      await captureComfyUiLogFailure(
        appLogger,
        settings,
        "prompt_service_start_failed",
        { modelId: settings.promptModelId }
      ).catch(() => undefined);
      appLogger.error("prompt", "service-start-failed", safeLogErrorMessage(error), {
        runtime,
        promptModelId: settings.promptModelId,
        promptBackend,
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
    const operationId = crypto.randomUUID();
    const promptLogContext = {
      operationId,
      runtime,
      promptModelId: settings.promptModelId,
      promptBackend,
      modelId: request.modelId,
      mode: request.mode ?? "video",
      h3PromptMode: request.h3PromptMode ?? "auto",
      promptProvided: Boolean(request.prompt.trim()),
      promptLength: request.prompt.length,
      referenceImageCount: request.imagePaths?.length ?? (request.imagePath ? 1 : 0),
      durationSeconds: request.h3DurationSeconds ?? null
    };
    appLogger.info("prompt", "enhance-started", "Prompt enhancement started", {
      ...promptLogContext
    });
    validateH3ReferenceAutoPrompt(request);
    const promptProgress = createPromptProgressController(settings.promptModelId, startedAt, operationId);
    promptProgress.update("preparing", 0);
    if (promptBackend === "h3-prompt-writer") {
      if (!request.prompt.trim() && !isH3ReferenceAutoPrompt(request)) throw new Error("请先输入需要扩写的提示词");
      if (store.get().queueRunning || queueWorkerController.activeController || queueWorkerController.runningWorker) {
        throw new Error("当前有视频任务正在运行，暂不能启动提示词模型。请等待任务结束或先暂停队列。 ");
      }
      if (nativePromptWorker) throw new Error("当前正在生成提示词，请等待本次扩写完成。");
      const controller = new AbortController();
      nativePromptController = controller;
      const worker = (async () => {
        promptProgress.update("checking", 5);
        await ensureComfyUiReadyForPrompt(settings);
        await validateNativePromptRuntime(settings);
        return enhancePromptWithH3PromptWriter(
          request,
          settings,
          controller.signal,
          promptProgress.update
        );
      })();
      nativePromptWorker = worker;
      try {
        const result = await worker;
        promptProgress.finish("completed", "unloading");
        appLogger.info("prompt", "enhance-finished", "Prompt enhancement finished", {
          ...promptLogContext,
          durationMs: Date.now() - startedAt,
          outputLength: result.length
        });
        return result;
      } catch (error) {
        if (error instanceof TaskStalledError) {
          await recoverStalledPromptComfyUi(settings);
        }
        promptProgress.finish(
          controller.signal.aborted ? "cancelled" : "failed",
          controller.signal.aborted ? "unloading" : "validating",
          error instanceof Error ? error.message : String(error)
        );
        await captureComfyUiLogFailure(
          appLogger,
          settings,
          "prompt_enhance_failed",
          { modelId: settings.promptModelId, operationId }
        ).catch(() => undefined);
        appLogger.error("prompt", "enhance-failed", safeLogErrorMessage(error), {
          ...promptLogContext,
          durationMs: Date.now() - startedAt,
          ...errorLogMeta(error)
        });
        throw error;
      } finally {
        if (nativePromptWorker === worker) nativePromptWorker = null;
        if (nativePromptController === controller) nativePromptController = null;
      }
    }
    if (promptBackend === "comfyui-multimodal") {
      if (!request.prompt.trim() && !isH3ReferenceAutoPrompt(request)) throw new Error("请先输入需要扩写的提示词");
      if (store.get().queueRunning || queueWorkerController.activeController || queueWorkerController.runningWorker) {
        throw new Error("当前有视频任务正在运行，暂不能启动提示词模型。请等待任务结束或先暂停队列。 ");
      }
      if (nativePromptWorker) throw new Error("当前正在生成提示词，请等待本次扩写完成。");
      const controller = new AbortController();
      nativePromptController = controller;
      const worker = (async () => {
        promptProgress.update("checking", 5);
        await ensureComfyUiReadyForPrompt(settings);
        await validateNativePromptRuntime(settings);
        return enhancePromptWithMultimodalComfyUi(
          request,
          settings,
          controller.signal,
          false,
          promptProgress.update,
          operationId
        );
      })();
      nativePromptWorker = worker;
      try {
        const result = await worker;
        promptProgress.finish("completed", "unloading");
        appLogger.info("prompt", "enhance-finished", "Prompt enhancement finished", {
          ...promptLogContext,
          durationMs: Date.now() - startedAt,
          outputLength: result.length
        });
        return result;
      } catch (error) {
        if (error instanceof TaskStalledError) {
          await recoverStalledPromptComfyUi(settings);
        }
        promptProgress.finish(
          controller.signal.aborted ? "cancelled" : "failed",
          controller.signal.aborted ? "unloading" : "validating",
          error instanceof Error ? error.message : String(error)
        );
        await captureComfyUiLogFailure(
          appLogger,
          settings,
          "prompt_enhance_failed",
          { modelId: settings.promptModelId, operationId }
        ).catch(() => undefined);
        appLogger.error("prompt", "enhance-failed", safeLogErrorMessage(error), {
          ...promptLogContext,
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
    if (!request.prompt.trim() && !isH3ReferenceAutoPrompt(request)) throw new Error("请先输入需要扩写的提示词");
    if (store.get().queueRunning || queueWorkerController.activeController || queueWorkerController.runningWorker) {
      throw new Error("当前有视频任务正在运行，暂不能启动提示词模型。请等待任务结束或先暂停队列。 ");
    }
    if (nativePromptWorker) throw new Error("当前正在生成提示词，请等待本次扩写完成。");
    const controller = new AbortController();
    nativePromptController = controller;
    const worker = (async () => {
      promptProgress.update("checking", 5);
      await ensureComfyUiReadyForPrompt(settings);
      await validateNativePromptRuntime(settings);
      return enhancePromptWithComfyUi(
        request,
        settings,
        controller.signal,
        false,
        promptProgress.update
      );
    })();
    nativePromptWorker = worker;
    try {
      const result = await worker;
      promptProgress.finish("completed", "unloading");
      appLogger.info("prompt", "enhance-finished", "Prompt enhancement finished", {
        ...promptLogContext,
        durationMs: Date.now() - startedAt,
        outputLength: result.length
      });
      return result;
    } catch (error) {
      promptProgress.finish(
        controller.signal.aborted ? "cancelled" : "failed",
        controller.signal.aborted ? "unloading" : "validating",
        error instanceof Error ? error.message : String(error)
      );
      await captureComfyUiLogFailure(
        appLogger,
        settings,
        "prompt_enhance_failed",
        { modelId: settings.promptModelId, operationId }
      ).catch(() => undefined);
      appLogger.error("prompt", "enhance-failed", safeLogErrorMessage(error), {
        ...promptLogContext,
        durationMs: Date.now() - startedAt,
        ...errorLogMeta(error)
      });
      throw error;
    } finally {
      if (nativePromptWorker === worker) nativePromptWorker = null;
      if (nativePromptController === controller) nativePromptController = null;
    }
  });
  ipcMain.handle("prompt:cancel", async () => {
    const controller = nativePromptController;
    if (!controller) return { ok: false, message: "当前没有正在运行的提示词任务。" };
    controller.abort();
    const settings = store.get().settings;
    if (promptModelBackend(settings.promptModelId) !== "h3-prompt-writer") {
      await interrupt(settings).catch(() => undefined);
    }
    return { ok: true, message: "正在取消提示词任务…" };
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
      const worker = queueWorkerController.runningWorker;
      if (worker) {
        const stopped = await store.update((state) => {
          state.queueRunning = false;
        });
        sendState(stopped);
        queueWorkerController.abort(new Error("用户强制终止 ComfyUI"));
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
    (event, nodeId: string, settings: Settings) => loggedOperation(
      "environment",
      "custom-node-install",
      "Custom node installation started",
      () => installCustomNode(nodeId, settings, (message) => {
        appLogger.info("environment", "custom-node-install-progress", message, { nodeId });
        if (!event.sender.isDestroyed()) {
          event.sender.send("dependency-install:log", {
            kind: "custom-node",
            id: nodeId,
            message
          });
        }
      }),
      { nodeId }
    )
  );
  ipcMain.handle(
    "workflow-dependency:install",
    (event, workflowId, settings: Settings) => loggedOperation(
      "environment",
      "workflow-dependency-install",
      "Workflow dependency installation started",
      () => installWorkflowDependency(workflowId, settings, (message) => {
        appLogger.info("environment", "workflow-dependency-install-progress", message, { workflowId });
        if (!event.sender.isDestroyed()) {
          event.sender.send("dependency-install:log", {
            kind: "workflow",
            id: workflowId,
            message
          });
        }
      }),
      { workflowId }
    )
  );
  ipcMain.handle(
    "llama-cpp-python:install",
    (event, settings: Settings) => loggedOperation(
      "environment",
      "llama-cpp-python-install",
      "llama-cpp-python installation started",
      () => installLlamaCppPython(settings, (message) => {
        appLogger.info("environment", "llama-cpp-python-install-progress", message);
        if (!event.sender.isDestroyed()) {
          event.sender.send("dependency-install:log", {
            kind: "python-runtime",
            id: "llama-cpp-python",
            message
          });
        }
      })
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
  registerQueueEnqueueIpc({
    ipc: ipcMain,
    store,
    logger: appLogger,
    sendState,
    effectiveImageInputLibraryDirectory,
    resolveTaskOutputDirectory
  });
  ipcMain.handle("image-mask:save", async (_event, request: ImageMaskSaveRequest) => {
    if (!request || typeof request !== "object") throw new Error("Mask 数据无效");
    const sourceStat = await fs.stat(request.sourcePath).catch(() => null);
    if (!sourceStat?.isFile()) throw new Error("原始 Picture 文件不存在");
    if (typeof request.document !== "string" || !request.document.trim()) {
      throw new Error("Mask 工程为空");
    }
    const bytes = request.maskPng instanceof ArrayBuffer
      ? new Uint8Array(request.maskPng)
      : null;
    if (!bytes?.byteLength) throw new Error("Mask 图片为空");
    if (bytes.byteLength > 100 * 1024 * 1024) throw new Error("Mask 图片不能超过 100 MB");
    const pictureKey = createHash("sha256")
      .update(`${request.pictureId}\0${path.resolve(request.sourcePath)}`)
      .digest("hex")
      .slice(0, 24);
    const revision = Math.max(1, Math.trunc(request.previousRevision ?? 0) + 1);
    const directory = path.join(app.getPath("userData"), "image-masks", pictureKey);
    await fs.mkdir(directory, { recursive: true });
    const basename = `revision-${String(revision).padStart(4, "0")}`;
    const documentPath = path.join(directory, `${basename}.fabric.json`);
    const maskPath = path.join(directory, `${basename}-mask.png`);
    const documentTemporary = `${documentPath}.${crypto.randomUUID()}.tmp`;
    const maskTemporary = `${maskPath}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(documentTemporary, request.document, "utf8");
      await fs.writeFile(maskTemporary, bytes);
      await fs.rename(documentTemporary, documentPath);
      await fs.rename(maskTemporary, maskPath);
    } finally {
      await fs.rm(documentTemporary, { force: true }).catch(() => undefined);
      await fs.rm(maskTemporary, { force: true }).catch(() => undefined);
    }
    return {
      documentPath,
      maskPath,
      revision,
      regionCount: Math.max(0, Math.trunc(request.regionCount || 0)),
      updatedAt: new Date().toISOString()
    };
  });
  registerQueueMutationIpc({
    ipc: ipcMain,
    store,
    logger: appLogger,
    sendState,
    isQueueCleanupActive: () => Boolean(
      queueWorkerController.cleanupWorker ||
      queueWorkerController.runningWorker ||
      queueWorkerController.activeController
    )
  });
  registerQueueControlIpc({
    ipc: ipcMain,
    store,
    logger: appLogger,
    worker: queueWorkerController,
    sendState,
    executeQueue,
    nativePromptBusy: () => Boolean(nativePromptWorker),
    settingsForTask: comfyUiSettingsForQueueTask,
    cleanupCancelledTask: cleanupCancelledQueueTask,
    updateTask
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
  ipcMain.handle("history:update-metadata", async (_event, assetId: string, patch: HistoryMetadataPatch) => {
    if (typeof assetId !== "string" || !assetId.trim() || !patch || typeof patch !== "object") {
      throw new Error("历史记录参数无效。");
    }
    const favorite = patch.favorite;
    const rating = patch.rating;
    if (favorite !== undefined && typeof favorite !== "boolean") {
      throw new Error("收藏状态无效。");
    }
    if (rating !== undefined && rating !== null && !isHistoryRating(rating)) {
      throw new Error("评分必须是 0.5 到 5 分，支持半星。");
    }
    const next = await store.update((state) => {
      const video = state.history.find((item) => item.id === assetId);
      const image = state.imageHistory.find((item) => item.id === assetId);
      const target = video ?? image;
      if (!target) throw new Error("历史记录不存在。");
      if (favorite !== undefined) target.favorite = favorite;
      if (rating !== undefined) target.rating = rating;
    });
    appLogger.info("history", "metadata-updated", "History curation metadata updated", {
      assetId,
      ...(favorite !== undefined ? { favorite } : {}),
      ...(rating !== undefined ? { rating } : {})
    });
    sendState(next);
    return next;
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
    const startedAt = Date.now();
    const current = store.get();
    const project = current.imageHistory.find((item) => item.id === projectId);
    const version = project?.versions.find((item) => item.id === versionId);
    if (!project || !version) throw new Error("图片项目或版本不存在。");
    if (version.kind === "source") throw new Error("原始导入图片不能从项目中删除。");
    const sharedByAnotherVersion = project.versions.some((item) =>
      item.id !== versionId && (
        Boolean(version.file.absolutePath && item.file.absolutePath === version.file.absolutePath) ||
        (item.file.filename === version.file.filename && item.file.subfolder === version.file.subfolder)
      )
    );
    appLogger.info("history", "image-version-delete-started", "开始删除图片版本和生成文件", {
      projectId,
      versionId,
      filename: version.file.filename
    });
    try {
      const resolvedFile = sharedByAnotherVersion
        ? null
        : await resolveExistingHistoryFile(
            version.file.absolutePath ?? "",
            historyFileCandidates(version.file, current.settings)
          );
      if (resolvedFile) {
        await fs.unlink(resolvedFile).catch((error) => {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw new Error(`无法删除图片文件 ${path.basename(resolvedFile)}：${error instanceof Error ? error.message : String(error)}`);
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
      appLogger.info("history", "image-version-delete-succeeded", "图片版本和生成文件已删除", {
        projectId,
        versionId,
        durationMs: Date.now() - startedAt
      });
      sendState(next);
      return next;
    } catch (error) {
      appLogger.error("history", "image-version-delete-failed", safeLogErrorMessage(error), {
        projectId,
        versionId,
        durationMs: Date.now() - startedAt,
        ...errorLogMeta(error)
      });
      throw error;
    }
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
