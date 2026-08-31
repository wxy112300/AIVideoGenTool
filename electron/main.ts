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
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { WindowCloseRequest } from "../src/types.js";
import { mergeChromiumFeatureList } from "../src/core/chromium-features.js";
import { JsonStore } from "./store.js";
import type { StateRepository } from "./ports/state-repository.js";
import { registerDraftIpc } from "./draft-ipc.js";
import { registerEnvironmentIpc } from "./environment-ipc.js";
import { registerHistoryIpc } from "./history-ipc.js";
import { registerImageDocumentIpc, registerImageMaskIpc } from "./image-document-ipc.js";
import { registerMediaIpc, registerMediaProtocol } from "./media-ipc.js";
import { registerPromptIpc } from "./prompt-ipc.js";
import { registerSettingsIpc } from "./settings-ipc.js";
import { registerQueueIpc } from "./queue-registration.js";
import { registerImageAssetIpc } from "./image-asset-ipc.js";
import { registerAppQueryIpc } from "./app-query-ipc.js";
import { registerNativeHostIpc } from "./native-host-ipc.js";
import { registerWorkflowIpc } from "./workflow-ipc.js";
import { nativeImageInspection } from "./services/native-image-inspection.js";
import { nativeHistoryFileSystem } from "./services/native-history-file-system.js";
import { ApplicationRuntime, type ApplicationServices } from "./application-runtime.js";
import { QueueRuntimeService } from "./services/queue-runtime-service.js";
import { isLocalComfyUrl } from "./services/comfy-endpoint.js";
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
import { createStudioPaths, type StudioPaths } from "./services/studio-paths.js";
import { createStudioEventBus } from "./services/studio-event-bus.js";
import { createWindowStudioEventBridge } from "./window-event-bridge.js";
import { registerWindowShellIpc } from "./window-shell-ipc.js";

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
const removeStudioEventBridge = createWindowStudioEventBridge(
  studioEventBus,
  () => mainWindow
);
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

function interruptForExit(
  waitForWorker: boolean,
  queueCleanupOnly = false
): Promise<{
  interrupted: boolean;
  workerSettled: boolean;
}> {
  return activeApplicationRuntime().interruptForExit(waitForWorker, queueCleanupOnly);
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

function registerIpc(
  studioPaths: StudioPaths,
  applicationServices: ApplicationServices,
  waitForInitialState: () => Promise<void>
): void {
  registerAppQueryIpc({
    ipc: ipcMain,
    store,
    waitForInitialState,
    getComfyRuntimeState: () => comfyRuntimeState.snapshot(),
    getPromptRuntimeState: () => promptRuntimeManager.snapshot(),
    getAppVersion: () => app.getVersion(),
    logger: appLogger,
    getCrashDumpsDirectory: () => app.getPath("crashDumps"),
    performance: getPerformanceMetrics,
    reconcileConfiguredComfyListenerOwnership,
    runtimeState: comfyRuntimeState,
    hasRunningTask: () => store.get().queue.some((task) => task.status === "running")
  });
  registerNativeHostIpc({
    ipc: ipcMain,
    dialog,
    shell,
    fileSystem: fs,
    logger: appLogger,
    paths: studioPaths,
    getCrashDumpsDirectory: () => app.getPath("crashDumps")
  });
  registerWorkflowIpc({
    ipc: ipcMain,
    fileSystem: fs,
    logger: appLogger,
    workflowRoots: [
      path.join(app.getAppPath(), "workflows"),
      path.join(process.resourcesPath, "workflows"),
      path.resolve(currentDirectory, "..", "..", "..", "workflows")
    ],
    getLtxExtensionModelProfile: () => store.get().settings.ltxExtensionModelProfile
  });
  registerWindowShellIpc({
    ipc: ipcMain,
    getWindowWebContents: () => mainWindow?.webContents ?? null,
    setRendererSettingsDirty: (dirty) => {
      rendererHasUnsavedSettings = dirty;
    },
    getPendingWindowCloseRequest: () => pendingWindowCloseRequest,
    clearPendingWindowCloseRequest: () => {
      pendingWindowCloseRequest = null;
    },
    setCloseFlowRunning: (running) => {
      closeFlowRunning = running;
    },
    finishWindowClose,
    finishRunningWorkClose
  });
  registerDraftIpc({ ipc: ipcMain, service: applicationServices.draft });
  registerSettingsIpc({ ipc: ipcMain, service: applicationServices.settings });
  registerImageAssetIpc({
    ipc: ipcMain,
    service: applicationServices.imageAssets
  });
  registerImageDocumentIpc({
    ipc: ipcMain,
    service: applicationServices.imageDocument
  });
  registerMediaIpc({
    ipc: ipcMain,
    protocol,
    service: applicationServices.media,
    logger: appLogger,
    paths: studioPaths
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
  const queueRuntime = new QueueRuntimeService({
    store: stateRepository,
    logger: appLogger,
    runtimeState: comfyRuntimeState,
    updateTask: (taskId, patch) => activeApplicationRuntime().queue.updateTask(taskId, patch),
    isLocalComfyUrl,
    alignRuntimeProfile: (settings) => alignLocalComfyUiRuntimeProfile(settings),
    testComfyUi,
    startLocalService: (kind, settings, signal) => startLocalService(kind, settings, signal),
    forceStopComfyProcesses,
    restartLocalService,
    freeMemory,
    getPerformanceMetrics,
    scanEnvironment,
    settingsForTask: comfyUiSettingsForQueueTask
  });
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
      runtime: queueRuntime
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
