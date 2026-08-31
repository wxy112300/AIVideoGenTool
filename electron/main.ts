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
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AppState,
  BundledWorkflow,
  Draft,
  HistoryFile,
  H3VideoVaeBackend,
  ImageAssetLibraryProgress,
  ImageEditDraft,
  NotificationKind,
  QueueLifecycle,
  QueueTask,
  Settings,
  WindowCloseRequest,
  WindowCloseResponse
} from "../src/types.js";
import { mergeChromiumFeatureList } from "../src/core/chromium-features.js";
import {
  extractComfyOutputFiles,
  isVideoOutputFilename
} from "../src/core/comfy-output.js";
import {
  attachAbsoluteOutputPaths
} from "../src/core/comfy-output-paths.js";
import { imageOutputFormatFromFilename } from "../src/core/image-workflow.js";
import {
  extensionWorkflowSafetyErrors,
  isMiniMaxH3Fl2vaModel,
  isMiniMaxH3R2vModel,
  workflowSupportsEndImage,
  workflowSupportsExtensionForModel,
  workflowSupportsH3BoundaryExtension,
  workflowSupportsH3MotionContextExtension
} from "../src/core/workflow.js";
import { workflowMetadataForFilename } from "../src/core/workflow-metadata.js";
import {
  h3VideoVaeAvailabilityFromModelProfiles,
  resolveH3VideoVaeMode
} from "../src/core/h3-video-vae.js";
import { JsonStore } from "./store.js";
import type { StateRepository } from "./ports/state-repository.js";
import { cleanupCancelledQueueTask as cleanupCancelledQueueTaskInRecovery } from "./queue-recovery.js";
import { registerDraftIpc } from "./draft-ipc.js";
import { registerEnvironmentIpc } from "./environment-ipc.js";
import { registerHistoryIpc } from "./history-ipc.js";
import { registerImageDocumentIpc, registerImageMaskIpc } from "./image-document-ipc.js";
import { registerMediaIpc, registerMediaProtocol } from "./media-ipc.js";
import { registerPromptIpc } from "./prompt-ipc.js";
import { registerSettingsIpc } from "./settings-ipc.js";
import { registerQueueIpc } from "./queue-registration.js";
import { nativeImageInspection } from "./services/native-image-inspection.js";
import { resolveExistingHistoryFile } from "./services/windows-clipboard.js";
import { nativeHistoryFileSystem } from "./services/native-history-file-system.js";
import { ApplicationRuntime, type ApplicationServices } from "./application-runtime.js";
import {
  comfyUiSettingsForQueueTask
} from "../src/infrastructure/comfy-runtime-policy.js";
import {
  alignLocalComfyUiRuntimeProfile,
  forceStopComfyProcesses,
  reconcileConfiguredComfyListenerOwnership,
  resolveComfyOutputDirectory,
  restartLocalService,
  scanEnvironment,
  startLocalService,
} from "./services/environment.js";
import {
  freeMemory,
  testComfyUi,
  interrupt
} from "./services/comfy-ui.js";
import { getPerformanceMetrics } from "./services/performance.js";
import { getApplicationLogger, safeLogErrorMessage } from "../src/infrastructure/app-logger.js";
import { comfyRuntimeState } from "../src/infrastructure/comfy-runtime-state.js";
import { PromptRuntimeManager } from "./services/prompt-runtime-manager.js";
import { setOwnedComfyProcessExitListener } from "./services/comfy-runtime-service.js";
import {
  cleanupImageAssetLibrary,
  organizeImageAssetLibrary,
  scanImageAssetLibrary
} from "../src/infrastructure/image-asset-library.js";
import { createStudioPaths, type StudioPaths } from "./services/studio-paths.js";
import { createStudioEventBus } from "./services/studio-event-bus.js";
import { createStudioEventBridge } from "./services/studio-event-bridge.js";

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

let mainWindow: BrowserWindow | null = null;
let store: StateRepository;
let rendererHasUnsavedSettings = false;
let imageAssetLibraryRunning = false;
let pendingWindowCloseRequest: WindowCloseRequest | null = null;
let applicationRuntime: ApplicationRuntime | null = null;

function activeApplicationRuntime(): ApplicationRuntime {
  if (!applicationRuntime) throw new Error("Application runtime is not initialized");
  return applicationRuntime;
}

function activeSettingsService() {
  return activeApplicationRuntime().services.settings;
}

function activePromptService() {
  return activeApplicationRuntime().services.prompt;
}
let allowWindowClose = false;
let closeFlowRunning = false;
const hasSingleInstanceLock = app.requestSingleInstanceLock();
const appLogger = getApplicationLogger();
const studioEventBus = createStudioEventBus({
  onSubscriberError: (name, error) => {
    appLogger.error(
      "events",
      "subscriber-failed",
      `Studio event subscriber failed for ${name}`,
      { eventName: name, ...errorLogMeta(error) }
    );
  }
});
const removeStudioEventBridge = createStudioEventBridge(studioEventBus, () => {
  const window = mainWindow;
  if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return null;
  return {
    send: (channel: string, payload: unknown) => window.webContents.send(channel, payload)
  };
});
let fatalProcessErrorHandled = false;

function activeQueueService() {
  return activeApplicationRuntime().queue;
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
  studioEventBus.publish("state:changed", state);
}

const promptRuntimeManager = new PromptRuntimeManager(comfyRuntimeState.snapshot());

promptRuntimeManager.subscribe((runtime) => {
  studioEventBus.publish("prompt-runtime:changed", runtime);
});

comfyRuntimeState.subscribe((runtime) => {
  appLogger.info("comfy", "runtime-state-changed", runtime.message, {
    phase: runtime.phase,
    ownership: runtime.ownership,
    endpoint: runtime.endpoint,
    operationId: runtime.operationId
  });
  if (runtime.phase === "stopped" || runtime.phase === "error") {
    applicationRuntime?.servicesOrNull?.prompt.handleComfyRuntimeFailure(runtime.message);
  }
  promptRuntimeManager.observeService(runtime);
  studioEventBus.publish("comfy-runtime:changed", runtime);
});

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
      (file) => file.absolutePath && isVideoOutputFilename(file.filename)
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
      getComfyRuntimeState: () => comfyRuntimeState.snapshot(),
      waitForComfyRuntimeSettled: (timeoutMs) => comfyRuntimeState.waitForSettled(timeoutMs),
      hasSubmittedPrompt: (currentTaskId) => Boolean(
        store.get().queue.find((item) => item.id === currentTaskId)?.comfyPromptId
      ),
      getSubmittedPromptId: (currentTaskId) =>
        store.get().queue.find((item) => item.id === currentTaskId)?.comfyPromptId,
      stopComfyRuntime: async (currentSettings) => {
        if (!isLocalComfyUrl(currentSettings.comfyUrl)) return false;
        const stopped = await forceStopComfyProcesses(currentSettings);
        if (!stopped.ok) throw new Error(stopped.message);
        return true;
      },
      restartComfyUi: async (kind, currentSettings) => {
        if (!isLocalComfyUrl(currentSettings.comfyUrl)) {
          return { ok: false, message: "远程 ComfyUI 为 connection-only，未执行进程重启。" };
        }
        return restartLocalService(kind, currentSettings);
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
function interruptForExit(
  waitForWorker: boolean,
  queueCleanupOnly = false
): Promise<{
  interrupted: boolean;
  workerSettled: boolean;
}> {
  return activeApplicationRuntime().interruptForExit(waitForWorker, queueCleanupOnly);
}

function sendImageAssetLibraryProgress(progress: ImageAssetLibraryProgress): void {
  studioEventBus.publish("image-assets:progress", progress);
}

async function finishWindowClose(): Promise<void> {
  appLogger.info("app", "shutdown", "Application shutdown started");
  await activeApplicationRuntime().stop();
  rendererHasUnsavedSettings = false;
  pendingWindowCloseRequest = null;
  allowWindowClose = true;
  mainWindow?.destroy();
  if (process.platform !== "darwin") app.quit();
}

async function handleWindowClose(): Promise<void> {
  if (!mainWindow || closeFlowRunning) return;
  if (activeSettingsService().isHistoryMigrationRunning()) {
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
  const queueCleanupOnly = !runningTask && !activePromptService().runningWorker && (
    currentState.queueLifecycle === "cancelling" ||
    currentState.queueLifecycle === "cleaning" ||
    Boolean(activeQueueService().cleanupWorker) ||
    (currentState.queueLifecycle === "error" &&
      cleanupTask?.status === "cancelled" &&
      Boolean(activeQueueService().runningWorker || activeQueueService().activeController))
  );
  const hasRunningWork = Boolean(
    runningTask || activePromptService().runningWorker || (
      !queueCleanupOnly &&
      (activeQueueService().activeController || activeQueueService().runningWorker)
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
  appLogger.info("window", "created", "Main window created");
  mainWindow.webContents.once("dom-ready", () => {
    appLogger.info("renderer", "dom-ready", "Renderer DOM is ready");
  });
  mainWindow.webContents.once("did-finish-load", () => {
    appLogger.info("renderer", "did-finish-load", "Renderer document finished loading");
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
  return activeQueueService().updateTask(taskId, patch);
}

async function setQueueLifecycle(
  lifecycle: QueueLifecycle,
  taskId?: string
): Promise<AppState> {
  return activeQueueService().setQueueLifecycle(lifecycle, taskId);
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
  const started = await startLocalService("comfy", serviceSettings, signal);
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

async function stabilizeH3RuntimeBetweenTasks(
  taskId: string,
  modelId: string,
  settings: Settings,
  hasVideoLoras: boolean,
  queueWillContinue: boolean
): Promise<boolean> {
  if (!queueWillContinue && isLocalComfyUrl(settings.comfyUrl)) {
    appLogger.info("comfy", "h3-release-deferred-to-queue-stop", "The queue will not continue; runtime cleanup is deferred to queue shutdown", {
      taskId,
      modelId,
      hasVideoLoras
    });
    return true;
  }
  if (hasVideoLoras) {
    appLogger.info("comfy", "h3-lora-release-started", "H3 LoRA task will use API memory release independently from queue process isolation", {
      taskId,
      modelId
    });
  }

  const gib = 1024 ** 3;
  const before = await getPerformanceMetrics(settings).catch(() => null);
  appLogger.info("comfy", "h3-release-started", "Releasing H3 runtime before the next queue task", {
    taskId,
    modelId,
    hasVideoLoras,
    vramUsedBytes: before?.vramUsedBytes ?? null,
    vramTotalBytes: before?.vramTotalBytes ?? null
  });

  const waitForIdleRelease = async (requiredSamples: number) => {
    const deadline = Date.now() + 20_000;
    let stableSamples = 0;
    let lastSample = before;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      const sample = await getPerformanceMetrics(settings).catch(() => null);
      if (!sample?.vramUsedBytes || !sample.vramTotalBytes) continue;
      lastSample = sample;
      const idleVramLimit = Math.min(5 * gib, sample.vramTotalBytes * 0.2);
      const gpuIdle = sample.gpuPercent == null || sample.gpuPercent < 10;
      stableSamples = gpuIdle && sample.vramUsedBytes <= idleVramLimit
        ? stableSamples + 1
        : 0;
      if (stableSamples >= requiredSamples) {
        return { verified: true, lastSample, idleVramLimit };
      }
    }
    const idleVramLimit = lastSample?.vramTotalBytes
      ? Math.min(5 * gib, lastSample.vramTotalBytes * 0.2)
      : null;
    return { verified: false, lastSample, idleVramLimit };
  };

  const requestRelease = async (phase: "initial" | "lora-final") => {
    try {
      await freeMemory(settings);
      return true;
    } catch (error) {
      appLogger.warn("comfy", "h3-release-request-failed", "H3 runtime release request failed; restarting ComfyUI", {
        taskId,
        modelId,
        phase,
        error: safeLogErrorMessage(error)
      });
      return false;
    }
  };

  let release = await requestRelease("initial");
  let result = release
    ? await waitForIdleRelease(2)
    : { verified: false, lastSample: before, idleVramLimit: null };
  if (result.verified && hasVideoLoras) {
    release = await requestRelease("lora-final");
    result = release
      ? await waitForIdleRelease(3)
      : { verified: false, lastSample: result.lastSample, idleVramLimit: result.idleVramLimit };
  }

  if (result.verified) {
    appLogger.info("comfy", "h3-release-verified", "H3 runtime release was verified before continuing the queue", {
      taskId,
      modelId,
      hasVideoLoras,
      releasePhases: hasVideoLoras ? 2 : 1,
      vramBeforeBytes: before?.vramUsedBytes ?? null,
      vramAfterBytes: result.lastSample?.vramUsedBytes ?? null,
      vramTotalBytes: result.lastSample?.vramTotalBytes ?? null,
      idleVramLimitBytes: result.idleVramLimit,
      gpuPercent: result.lastSample?.gpuPercent ?? null
    });
    return true;
  }

  appLogger.warn("comfy", "h3-release-unverified", "H3 VRAM did not reach a safe idle level; applying endpoint-appropriate recovery", {
    taskId,
    modelId,
    hasVideoLoras,
    vramBeforeBytes: before?.vramUsedBytes ?? null,
    vramAfterBytes: result.lastSample?.vramUsedBytes ?? null,
    vramTotalBytes: result.lastSample?.vramTotalBytes ?? null,
    idleVramLimitBytes: result.idleVramLimit,
    gpuPercent: result.lastSample?.gpuPercent ?? null
  });
  if (!isLocalComfyUrl(settings.comfyUrl)) {
    appLogger.error("comfy", "h3-remote-release-failed", "Remote ComfyUI memory release could not be verified; stopping the application queue without process management", {
      taskId,
      modelId
    });
    return false;
  }
  const recovery = await restartLocalService("comfy", settings).catch((error) => ({
    ok: false,
    message: safeLogErrorMessage(error)
  }));
  appLogger.info("comfy", recovery.ok ? "h3-release-restart-succeeded" : "h3-release-restart-failed", recovery.message, {
    taskId,
    modelId,
    recoveryOk: recovery.ok
  });
  return recovery.ok;
}

async function stopQueueRuntime(settings: Settings): Promise<boolean> {
  if (!isLocalComfyUrl(settings.comfyUrl)) {
    appLogger.info("comfy", "queue-runtime-stop-skipped", "Remote ComfyUI remains connection-only when the queue stops");
    return true;
  }
  const stopped = await forceStopComfyProcesses(settings).catch((error) => ({
    ok: false,
    message: safeLogErrorMessage(error)
  }));
  appLogger.info(
    "comfy",
    stopped.ok ? "queue-runtime-stop-succeeded" : "queue-runtime-stop-failed",
    stopped.message,
    { ok: stopped.ok }
  );
  return stopped.ok;
}

async function restartQueueRuntime(settings: Settings): Promise<{ ok: boolean; message: string }> {
  if (!isLocalComfyUrl(settings.comfyUrl)) {
    return { ok: false, message: "远程 ComfyUI 为 connection-only，未执行进程重启。" };
  }
  return restartLocalService("comfy", settings);
}

async function prepareQueueRuntimeForTask(
  taskId: string,
  modelId: string,
  settings: Settings,
  reason: "lora" | "model-change" | "always"
): Promise<boolean> {
  if (!isLocalComfyUrl(settings.comfyUrl)) {
    appLogger.warn("comfy", "queue-isolation-restart-skipped", "Remote ComfyUI remains connection-only at the requested queue isolation boundary", {
      taskId,
      modelId,
      reason
    });
    return true;
  }
  appLogger.info("comfy", "queue-isolation-restart-started", "Restarting ComfyUI at a queue isolation boundary", {
    taskId,
    modelId,
    reason
  });
  const recovery = await restartLocalService("comfy", settings);
  appLogger.info(
    "comfy",
    recovery.ok ? "queue-isolation-restart-succeeded" : "queue-isolation-restart-failed",
    recovery.message,
    { taskId, modelId, reason, recoveryOk: recovery.ok }
  );
  return recovery.ok;
}

async function resolveH3VideoVaeModeForQueueTask(
  _task: QueueTask,
  settings: Settings
): Promise<H3VideoVaeBackend | null> {
  // The dependency-scoped scan reuses the latest file inventory when one is
  // available, while still falling back to a full scan on a cold start or
  // after the selected ComfyUI/model paths change.
  const scan = await scanEnvironment(settings, "dependencies");
  return resolveH3VideoVaeMode(
    settings.h3VideoVaeMode,
    h3VideoVaeAvailabilityFromModelProfiles(scan.modelProfiles)
  );
}

function registerIpc(
  studioPaths: StudioPaths,
  applicationServices: ApplicationServices,
  waitForInitialState: () => Promise<void>
): void {
  ipcMain.handle("state:get", async () => {
    await waitForInitialState();
    return store.get();
  });
  ipcMain.handle("comfy-runtime:get", () => comfyRuntimeState.snapshot());
  ipcMain.handle("prompt-runtime:get", () => promptRuntimeManager.snapshot());
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
  registerDraftIpc({ ipc: ipcMain, service: applicationServices.draft });
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
  registerSettingsIpc({ ipc: ipcMain, service: applicationServices.settings });
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
  ipcMain.handle("workflow:inspect", async (_event, workflowPath: string, modelId?: string) => {
    const startedAt = Date.now();
    const source = JSON.parse(await fs.readFile(workflowPath, "utf8")) as unknown;
    const result = {
      supportsEndImage: workflowSupportsEndImage(source),
      supportsVideoExtension: modelId
        ? workflowSupportsExtensionForModel(source, modelId)
        : extensionWorkflowSafetyErrors(source).length === 0
    };
    appLogger.info("workflow", "inspected", "Workflow inspected", {
      durationMs: Date.now() - startedAt,
      modelId,
      supportsEndImage: result.supportsEndImage,
      supportsVideoExtension: result.supportsVideoExtension
    });
    return result;
  });
  ipcMain.handle("workflow:get-bundled", (_event, modelId: string, inputMode?: Draft["inputMode"]) =>
    bundledWorkflowFor(modelId, inputMode)
  );
  ipcMain.handle("performance:get", async (_event, settings: Settings) => {
    const metrics = await getPerformanceMetrics(settings);
    const currentOwnership = comfyRuntimeState.snapshot().ownership;
    const ownership = metrics.comfyConnected && currentOwnership === "unknown" &&
      await reconcileConfiguredComfyListenerOwnership(settings)
      ? "app"
      : currentOwnership;
    comfyRuntimeState.observeReachability(
      metrics.comfyConnected,
      settings.comfyUrl.replace(/\/+$/, ""),
      ownership,
      store.get().queue.some((task) => task.status === "running")
    );
    return metrics;
  });
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
      const library = await applicationServices.settings.effectiveImageInputLibraryDirectory(
        snapshot.settings
      );
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
      const library = await applicationServices.settings.effectiveImageInputLibraryDirectory(
        snapshot.settings
      );
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
          } else if (task.taskType === "extension" && preparedTask?.taskType === "extension") {
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
      const library = await applicationServices.settings.effectiveImageInputLibraryDirectory(
        snapshot.settings
      );
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
  registerImageDocumentIpc({
    ipc: ipcMain,
    service: applicationServices.imageDocument
  });
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
      const directory = studioPaths.clipboardInputsDirectory;
      await fs.mkdir(directory, { recursive: true });
      const filename = path.join(
        directory,
        `clipboard-${Date.now()}-${crypto.randomUUID()}${extension}`
      );
      await fs.writeFile(filename, new Uint8Array(data));
      return filename;
    }
  );
  registerMediaIpc({
    ipc: ipcMain,
    protocol,
    service: applicationServices.media,
    logger: appLogger,
    paths: studioPaths
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
  registerPromptIpc({
    ipc: ipcMain,
    service: applicationServices.prompt
  });
  registerEnvironmentIpc({
    ipc: ipcMain,
    query: applicationServices.environment.query,
    admin: applicationServices.environment.admin
  });
  registerQueueIpc({
    ipc: ipcMain,
    service: activeQueueService(),
    registerBetweenEnqueueAndControl: () => registerImageMaskIpc({
      ipc: ipcMain,
      service: applicationServices.imageDocument
    })
  });
  registerHistoryIpc({
    ipc: ipcMain,
    query: applicationServices.history.query,
    metadata: applicationServices.history.metadata,
    destructive: applicationServices.history.destructive
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
  const studioPaths = createStudioPaths(app.getPath("userData"));
  const stateRepository = new JsonStore(studioPaths.stateFile);
  store = stateRepository;
  const runtime = new ApplicationRuntime({
    paths: studioPaths,
    store: stateRepository,
    events: studioEventBus,
    logger: appLogger,
    runtimeState: comfyRuntimeState,
    promptRuntimeManager,
    historyFileSystem: nativeHistoryFileSystem,
    imageInspection: nativeImageInspection,
    sendState,
    errorMeta: errorLogMeta,
    waitForWorker: waitWithTimeout,
    settings: {
      videoHistoryMigrationJournal: studioPaths.videoHistoryMigrationJournal,
      resolveComfyOutputDirectory,
      clearRendererDirty: () => {
        rendererHasUnsavedSettings = false;
      }
    },
    queue: {
      ensureComfyUiReady,
      resolveTaskOutputDirectory,
      requireExistingImageOutput,
      requireExistingVideoOutput,
      prepareQueueRuntimeForTask,
      stabilizeH3RuntimeBetweenTasks,
      stopQueueRuntime,
      restartQueueRuntime,
      resolveH3VideoVaeModeForTask: resolveH3VideoVaeModeForQueueTask,
      settingsForTask: comfyUiSettingsForQueueTask,
      cleanupCancelledTask: cleanupCancelledQueueTask
    },
    lifecycle: {
      interruptComfy: (settings) => interrupt(settings),
      freeMemory: (settings) => freeMemory(settings),
      forceStopComfyProcesses: (settings) => forceStopComfyProcesses(settings),
      alignRuntimeProfile: (settings) => alignLocalComfyUiRuntimeProfile(settings),
      isLocalComfyUrl
    }
  });
  applicationRuntime = runtime;
  try {
    await runtime.start({
      onServicesReady: (context) => {
        setOwnedComfyProcessExitListener((event) => {
          context.services.lifecycle.handleOwnedComfyProcessExit(event);
        });
        registerMediaProtocol({
          protocol,
          service: context.services.media
        });
        registerIpc(
          studioPaths,
          context.services,
          () => runtime.waitForInitialState()
        );
        createWindow();
      }
    });
  } catch (error) {
    appLogger.error(
      "app",
      "startup-failed",
      error instanceof Error ? error.message : String(error)
    );
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.once("will-quit", () => {
  removeStudioEventBridge();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
