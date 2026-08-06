import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  protocol,
  shell,
  type MenuItemConstructorOptions
} from "electron";
import { createReadStream, promises as fs } from "node:fs";
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
  LocalServiceKind,
  QueueTask,
  Settings,
  TaskPerformanceStats,
  UpscaleQueueTask,
  UpscaleRequest
} from "../src/types.js";
import { createOutputFilename } from "../src/core/filename.js";
import { historyVideoPaths } from "../src/core/history-delete.js";
import {
  attachAbsoluteOutputPaths,
  extractComfyOutputFiles
} from "../src/core/comfy-output.js";
import {
  moveWaitingTask,
  optimizeWaitingTasks
} from "../src/core/queue.js";
import {
  extensionOutputDimensions,
  extensionSafetyForTask,
  activityTimeoutMinutesForTask,
  extensionWorkflowSafetyErrors,
  generationSafetyForTask,
  isMiniMaxH3Fl2vaModel,
  outputDimensions,
  validateApiWorkflow,
  workflowSupportsEndImage,
  workflowSupportsH3BoundaryExtension
} from "../src/core/workflow.js";
import {
  uniqueUpscaleFilename,
  upscaleDimensions
} from "../src/core/upscale.js";
import { JsonStore } from "./store.js";
import {
  enhancePrompt,
  releasePromptModelRuntime,
  testLmStudio
} from "./services/lm-studio.js";
import {
  enhancePromptWithLlamaServer,
  releaseLlamaPromptModel,
  startLlamaPromptModel
} from "./services/llama-server.js";
import { promptRuntimeForSettings } from "../src/core/prompt-models.js";
import {
  installAttentionAcceleration,
  installCustomNode,
  installWorkflowDependency,
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
  submitTask,
  TaskStalledError,
  warmNativePromptModel,
  testComfyUi,
  waitForTask
} from "./services/comfy-ui.js";
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

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;
let store: JsonStore;
let queueWorker: Promise<void> | null = null;
let activeController: AbortController | null = null;
let nativePromptController: AbortController | null = null;
let nativePromptWorker: Promise<unknown> | null = null;
let allowWindowClose = false;
let closeFlowRunning = false;
const hasSingleInstanceLock = app.requestSingleInstanceLock();

protocol.registerSchemesAsPrivileged([
  {
    scheme: "studio-media",
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true
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

function registerMediaProtocol(): void {
  protocol.handle("studio-media", async (request) => {
    try {
      const url = new URL(request.url);
      let filename: string | undefined;
      if (url.hostname === "draft" && url.pathname === "/video") {
        filename = store.get().draft.sourceVideoPath;
      } else if (url.hostname === "draft" && url.pathname === "/reference-video") {
        filename = url.searchParams.get("source") ?? undefined;
      } else if (url.hostname === "history") {
        const [assetId, versionId, fileIndexText] = url.pathname.split("/").filter(Boolean);
        const fileIndex = Number(fileIndexText);
        const asset = store
          .get()
          .history.find((item) => item.id === decodeURIComponent(assetId ?? ""));
        const version = asset?.versions.find(
          (item) => item.id === decodeURIComponent(versionId ?? "")
        );
        filename =
          Number.isInteger(fileIndex) && fileIndex >= 0
            ? version?.files[fileIndex]?.absolutePath
            : undefined;
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
      const stat = filename ? await fs.stat(filename).catch(() => null) : null;
      if (!filename || !stat?.isFile()) {
        return new Response("Media file not found", { status: 404 });
      }
      const contentType = new Map([
        [".mp4", "video/mp4"],
        [".m4v", "video/mp4"],
        [".webm", "video/webm"],
        [".mov", "video/quicktime"],
        [".mkv", "video/x-matroska"],
        [".gif", "image/gif"]
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

function sendState(state = store.get()): void {
  mainWindow?.webContents.send("state:changed", state);
}

const videoOutputPattern = /\.(mp4|webm|mov|m4v|mkv)$/i;

async function resolveTaskOutputDirectory(): Promise<string> {
  const configured = store.get().settings.outputDirectory.trim();
  const detected = await resolveComfyOutputDirectory(store.get().settings);
  const resolved = detected || configured;
  if (!resolved) return "";

  await store.update((state) => {
    if (state.settings.outputDirectory !== resolved) {
      state.settings.outputDirectory = resolved;
    }
  });
  return resolved;
}

async function requireExistingVideoOutput(
  result: unknown
): Promise<ReturnType<typeof extractComfyOutputFiles>> {
  const outputDirectory = await resolveTaskOutputDirectory();
  if (!outputDirectory) {
    throw new Error(
      "ComfyUI 已返回完成状态，但无法确定输出目录。请在设置中确认 ComfyUI 目录后重试。"
    );
  }

  const files = attachAbsoluteOutputPaths(
    extractComfyOutputFiles(result),
    outputDirectory
  );
  const videoFiles = files.filter(
    (file) => file.absolutePath && videoOutputPattern.test(file.filename)
  );
  for (const file of videoFiles) {
    try {
      const stat = await fs.stat(file.absolutePath!);
      if (stat.isFile() && stat.size > 0) return files;
    } catch {
      // Try any other video returned by the workflow before reporting failure.
    }
  }

  const returnedNames = files.map((file) => file.filename).join("、");
  throw new Error(
    returnedNames
      ? `ComfyUI 已返回完成状态，但输出视频不存在或为空：${returnedNames}`
      : "ComfyUI 已返回完成状态，但工作流没有返回任何视频文件。任务不会写入历史。"
  );
}

async function restoreHistoryOutputPaths(): Promise<void> {
  const outputDirectory = await resolveTaskOutputDirectory();
  if (!outputDirectory) return;

  await store.update((state) => {
    for (const asset of state.history) {
      asset.files = attachAbsoluteOutputPaths(asset.files, outputDirectory);
      for (const version of asset.versions) {
        version.files = attachAbsoluteOutputPaths(
          version.files,
          outputDirectory
        );
      }
    }
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
      await freeMemory(settings).catch(() => undefined);
      return true;
    },
    () => false
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

async function finishWindowClose(): Promise<void> {
  await releasePromptRuntime(store.get().settings);
  allowWindowClose = true;
  mainWindow?.destroy();
  if (process.platform !== "darwin") app.quit();
}

async function handleWindowClose(): Promise<void> {
  if (!mainWindow || closeFlowRunning) return;
  const runningTask = store
    .get()
    .queue.find((task) => task.status === "running");
  if (!runningTask && !activeController && !queueWorker && !nativePromptWorker) {
    await finishWindowClose();
    return;
  }
  closeFlowRunning = true;
  try {
    const choice = await dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "任务仍在运行",
      message: "当前视频任务或提示词扩写仍在运行，是否结束并退出？",
      detail:
        "“结束任务并退出”会中断当前 ComfyUI 计算并等待任务状态保存。“强制退出”仍会尝试中断计算，但不会等待完整清理。ComfyUI 服务本身不会关闭。",
      buttons: ["取消退出", "结束任务并退出", "强制退出"],
      defaultId: 1,
      cancelId: 0,
      noLink: true
    });
    if (choice.response === 0) return;
    mainWindow.setTitle("正在结束任务并退出…");
    if (choice.response === 2) {
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
      mainWindow.setTitle("Local Video Studio");
    }
  }
}

function createWindow(): void {
  allowWindowClose = false;
  mainWindow = new BrowserWindow({
    title: "Local Video Studio",
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
    if (allowWindowClose) return;
    event.preventDefault();
    void handleWindowClose();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
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
    progress: 0
  };
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
      isMiniMaxH3Fl2vaModel(draft.modelId)
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
    resolution: isMiniMaxH3Fl2vaModel(draft.modelId)
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
    maxGeneratedFrames: isMiniMaxH3Fl2vaModel(draft.modelId)
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
  const [targetWidth, targetHeight] = upscaleDimensions(
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
      targetHeight,
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
    targetHeight,
    tileMode: "safe",
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
    if (task) Object.assign(task, patch, { updatedAt: new Date().toISOString() });
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
  try {
    await testComfyUi(settings);
    return;
  } catch (connectionError) {
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
  const started = await startLocalService("comfy", settings);
  if (!started.ok) {
    throw new Error(`ComfyUI 自动启动失败：${started.message}`);
  }
  await testComfyUi(settings);
}

async function ensureComfyUiReadyForPrompt(settings: Settings): Promise<void> {
  try {
    await testComfyUi(settings);
    return;
  } catch (connectionError) {
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
  const runtime = promptRuntimeForSettings(settings);
  if (runtime === "lmstudio") return releasePromptModelRuntime(settings);
  if (runtime === "llama-server") return releaseLlamaPromptModel();
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
  const runtime = promptRuntimeForSettings(settings);
  if (runtime === "lmstudio") {
    try {
      const count = await releasePromptModelRuntime(settings);
      return { ok: true, message: count ? `已释放 ${count} 个 LM Studio 提示词模型。` : "当前没有已加载的 LM Studio 提示词模型。" };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }
  if (runtime === "llama-server") {
    const count = await releaseLlamaPromptModel();
    return { ok: true, message: count ? "已停止应用自管理的 llama-server 并释放提示词模型。" : "当前没有运行中的应用自管理提示词模型。" };
  }
  try {
    await freeMemory(settings);
    return { ok: true, message: "已请求 ComfyUI 卸载提示词模型并释放显存。" };
  } catch {
    return { ok: true, message: "ComfyUI 当前未运行，无需释放提示词模型。" };
  }
}

async function executeQueue(): Promise<void> {
  let lmStudioReleased = false;
  while (store.get().queueRunning) {
    const task = store.get().queue.find((item) => item.status === "waiting");
    if (!task) break;
    activeController = new AbortController();
    let vramWatchdog: VramWatchdogMonitor | undefined;
    let taskPerformanceMonitor: TaskPerformanceMonitor | undefined;
    let taskPerformanceStats: TaskPerformanceStats | undefined;
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
      if (!lmStudioReleased) {
        await updateTask(task.id, {
          progress: 1,
          stage: "卸载提示词模型并释放显存"
        });
        const unloaded = await releasePromptRuntime(store.get().settings);
        lmStudioReleased = true;
        if (unloaded > 0) {
          await updateTask(task.id, {
            progress: 1,
            stage: promptRuntimeForSettings(store.get().settings) === "lmstudio"
              ? `已卸载 ${unloaded} 个 LM Studio 模型`
              : promptRuntimeForSettings(store.get().settings) === "llama-server"
                ? "已停止应用自管理提示词模型"
                : "已释放 ComfyUI 提示词模型"
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
        (_pressure, utilization, sample) => {
          taskPerformanceMonitor?.recordGpuSample(sample);
          if (utilization !== null && utilization >= 10) {
            lastGpuComputeAt = Date.now();
          }
        }
      );
      const { promptId, clientId, nodeTypes } = await submitTask(
        task,
        store.get().settings,
        activeController.signal
      );
      await updateTask(task.id, {
        comfyPromptId: promptId,
        progress: 2,
        stage: "等待 ComfyUI"
      });
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
        (progress, stage) => void updateTask(task.id, { progress, stage }),
        (dataUrl) =>
          mainWindow?.webContents.send("task:preview", {
            taskId: task.id,
            dataUrl
          }),
        () => Date.now() - lastGpuComputeAt < 10_000
      );
      const completedTask = store.get().queue.find((item) => item.id === task.id);
      if (!completedTask) continue;
      const completedAt = new Date().toISOString();
      const files = await requireExistingVideoOutput(result);
      if (completedTask.taskType === "extension") {
        const outputVideo = files.find(
          (file) => file.absolutePath && videoOutputPattern.test(file.filename)
        );
        if (!outputVideo?.absolutePath) {
          throw new Error("续写工作流没有返回可供 FFmpeg 拼接的视频文件");
        }
        await updateTask(task.id, {
          progress: 99,
          stage: isMiniMaxH3Fl2vaModel(completedTask.modelId)
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
            id: crypto.randomUUID(),
            taskId: completedTask.id,
            title: completedTask.prompt.slice(0, 28) || "视频续写",
            outputFilename: completedTask.outputFilename,
            createdAt: completedAt,
            updatedAt: completedAt,
            modelId: completedTask.modelId,
            duration: totalDuration,
            resolution: height,
            steps: completedTask.steps,
            fps: completedTask.fps,
            frameInterpolation: completedTask.frameInterpolation,
            ratio: "source",
            prompt: completedTask.prompt,
            seed: completedTask.seed,
            sourceAssetId: completedTask.sourceAssetId,
            sourceVersionId: completedTask.sourceVersionId,
            sourceVideoPath: completedTask.sourceVideoPath,
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
        const version: AssetVersion = {
          id: crypto.randomUUID(),
          kind: "upscale",
          createdAt: completedAt,
          outputFilename: completedTask.outputFilename,
          modelId: completedTask.modelId,
          width: completedTask.targetWidth,
          height: completedTask.targetHeight,
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
    } catch (error) {
      const aborted = activeController.signal.aborted;
      const stalled = error instanceof TaskStalledError;
      const memoryFailure =
        error instanceof Error &&
        /out of memory|cuda error|cuda.*alloc|allocation.*failed|cublas_status_alloc_failed|illegal memory access|cudaErrorIllegalAddress|device-side assertion|显存不足/i.test(
          error.message
        );
      const cudaContextFailure =
        error instanceof Error &&
        /illegal memory access|cudaErrorIllegalAddress|device-side assertion/i.test(
          error.message
        );
      if (!taskPerformanceStats && taskPerformanceMonitor) {
        taskPerformanceStats = taskPerformanceMonitor.stop();
        taskPerformanceMonitor = undefined;
      }
      const requiresRestart = stalled || memoryFailure;
      if (!aborted) {
        await interrupt(store.get().settings).catch(() => undefined);
        await freeMemory(store.get().settings).catch(() => undefined);
      }
      if (requiresRestart) {
        const stopped = await store.update((state) => {
          state.queueRunning = false;
        });
        sendState(stopped);
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
      if (requiresRestart) {
        const recovery = await restartLocalService(
          "comfy",
          failedState.settings
        );
        await updateTask(task.id, {
          error: `${error instanceof Error ? error.message : String(error)} ${
            recovery.ok ? "ComfyUI 已恢复就绪。" : `自动恢复失败：${recovery.message}`
          }`
        });
      }
    } finally {
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

function registerIpc(): void {
  ipcMain.handle("state:get", () => store.get());
  ipcMain.handle("draft:save", async (_event, draft: Draft) => {
    const next = await store.update((state) => {
      state.draft = draft;
    });
    sendState(next);
    return next;
  });
  ipcMain.handle("settings:save", async (_event, settings: Settings) => {
    const next = await store.update((state) => {
      state.settings = settings;
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
  ipcMain.handle("workflow:inspect", async (_event, workflowPath: string) => {
    const source = JSON.parse(await fs.readFile(workflowPath, "utf8")) as unknown;
    return {
      supportsEndImage: workflowSupportsEndImage(source),
      supportsVideoExtension: extensionWorkflowSafetyErrors(source).length === 0
    };
  });
  ipcMain.handle("workflow:get-bundled", (_event, modelId: string, inputMode?: Draft["inputMode"]) =>
    bundledWorkflowFor(modelId, inputMode)
  );
  ipcMain.handle("performance:get", (_event, settings: Settings) =>
    getPerformanceMetrics(settings)
  );
  ipcMain.handle("file:pick-directory", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipcMain.handle("file:read-image", async (_event, filename: string) => {
    if (!filename) return null;
    const extension = path.extname(filename).slice(1).toLowerCase();
    const mime = extension === "jpg" || extension === "jpeg" ? "image/jpeg" : `image/${extension}`;
    const content = await fs.readFile(filename);
    return `data:${mime};base64,${content.toString("base64")}`;
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
    if (!filename || !(await fs.stat(filename).catch(() => null))) return false;
    shell.showItemInFolder(filename);
    return true;
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
    if (store.get().queueRunning || activeController || queueWorker) {
      return { ok: false, message: "当前有视频任务正在运行，暂不能启动提示词模型。" };
    }
    if (nativePromptWorker) {
      return { ok: false, message: "提示词模型正在启动或使用中。" };
    }
    const controller = new AbortController();
    nativePromptController = controller;
    const worker = (async () => {
      if (runtime === "llama-server") {
        const result = await startLlamaPromptModel(settings);
        if (!result.ok) throw new Error(result.message);
        return;
      }
      await ensureComfyUiReadyForPrompt(settings);
      await validateNativePromptRuntime(settings);
      await warmNativePromptModel(settings, controller.signal);
    })();
    nativePromptWorker = worker;
    try {
      await worker;
      return {
        ok: true,
        message: runtime === "llama-server"
          ? "Unconcerned Qwen3.5 已由应用启动并加载。"
          : "Qwen 提示词模型已启动并加载到 ComfyUI。"
      };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    } finally {
      if (nativePromptWorker === worker) nativePromptWorker = null;
      if (nativePromptController === controller) nativePromptController = null;
    }
  });
  ipcMain.handle("prompt:enhance", async (_event, request: EnhanceRequest) => {
    const settings = store.get().settings;
    const runtime = promptRuntimeForSettings(settings);
    if (runtime === "lmstudio") return enhancePrompt(request, settings);
    if (runtime === "llama-server") {
      if (!request.prompt.trim()) throw new Error("请先输入需要扩写的提示词");
      if (store.get().queueRunning || activeController || queueWorker) {
        throw new Error("当前有视频任务正在运行，暂不能启动提示词模型。请等待任务结束或先暂停队列。 ");
      }
      if (nativePromptWorker) throw new Error("当前正在生成提示词，请等待本次扩写完成。");
      const controller = new AbortController();
      nativePromptController = controller;
      const worker = enhancePromptWithLlamaServer(request, settings);
      nativePromptWorker = worker;
      try {
        return await worker;
      } finally {
        if (nativePromptWorker === worker) nativePromptWorker = null;
        if (nativePromptController === controller) nativePromptController = null;
      }
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
      return await worker;
    } finally {
      if (nativePromptWorker === worker) nativePromptWorker = null;
      if (nativePromptController === controller) nativePromptController = null;
    }
  });
  ipcMain.handle("prompt:release", () => releasePromptRuntimeForUser());
  ipcMain.handle(
    "connection:test",
    async (_event, kind: ConnectionKind, settings: Settings) => {
      try {
        const message =
          kind === "comfy"
            ? await testComfyUi(settings)
            : await testLmStudio(settings);
        return { ok: true, message };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error)
        };
      }
    }
  );
  ipcMain.handle(
    "environment:scan",
    (_event, settings: Settings) => scanEnvironment(settings)
  );
  ipcMain.handle(
    "service:start",
    (_event, kind: LocalServiceKind, settings: Settings) =>
      startLocalService(kind, settings)
  );
  ipcMain.handle(
    "service:force-stop-comfy",
    async (_event, settings: Settings) => {
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
      await waitWithTimeout(worker, 15_000);
      return result;
    }
  );
  ipcMain.handle(
    "service:restart",
    (_event, kind: LocalServiceKind, settings: Settings) =>
      restartLocalService(kind, settings)
  );
  ipcMain.handle(
    "comfyui:update",
    (_event, settings: Settings) => updateComfyUi(settings)
  );
  ipcMain.handle(
    "environment:repair",
    (_event, issueId: EnvironmentIssue["id"], settings: Settings) =>
      repairEnvironmentIssue(issueId, settings)
  );
  ipcMain.handle(
    "custom-node:install",
    (_event, nodeId: string, settings: Settings) =>
      installCustomNode(nodeId, settings)
  );
  ipcMain.handle(
    "workflow-dependency:install",
    (_event, workflowId, settings: Settings) =>
      installWorkflowDependency(workflowId, settings)
  );
  ipcMain.handle(
    "attention-acceleration:install",
    (event, settings: Settings) =>
      installAttentionAcceleration(settings, (message) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send("attention-acceleration:log", message);
        }
      })
  );
  ipcMain.handle("queue:enqueue", async (_event, draft: Draft) => {
    if (draft.inputMode !== "image") {
      throw new Error("视频续写必须使用独立的 extension 队列任务");
    }
    if (!draft.startImagePath) throw new Error("请先选择首帧图片");
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
      : extensionWorkflowSafetyErrors(workflow);
    if (workflowSafetyErrors.length) {
      throw new Error(`续写工作流不符合原生续写低显存契约：${workflowSafetyErrors.join("；")}`);
    }
    const current = store.get();
    const task = extensionTaskFromDraft(draft, current);
    const safety = extensionSafetyForTask(task);
    if (!safety.safe) throw new Error(safety.message);
    const next = await store.update((state) => {
      state.queue.push(task);
      state.draft = draft;
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
    sendState(next);
    return next;
  });
  ipcMain.handle(
    "queue:update-upscale",
    async (_event, taskId: string, patch: Pick<UpscaleQueueTask, "targetWidth" | "targetHeight" | "modelId" | "workflowPath" | "tileMode" | "faceRestore" | "outputFilename">) => {
      const next = await store.update((state) => {
        const task = state.queue.find((item) => item.id === taskId);
        if (!task || task.taskType !== "upscale" || task.status !== "waiting") return;
        Object.assign(task, patch, {
          tileMode: "safe",
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
    sendState(next);
    return next;
  });
  ipcMain.handle("queue:cancel", async (_event, taskId: string) => {
    const task = store.get().queue.find((item) => item.id === taskId);
    if (!task) return store.get();
    if (task.status === "running") {
      const settings = store.get().settings;
      const worker = queueWorker;
      const next = await store.update((state) => {
        state.queueRunning = false;
      });
      sendState(next);
      activeController?.abort(new Error("用户取消任务"));
      if (settings.safeCancel) {
        await interrupt(settings).catch(() => undefined);
      }
      await updateTask(taskId, {
        stage: "任务已取消，正在重启 ComfyUI 以释放显存"
      });
      await restartLocalService("comfy", settings);
      await waitWithTimeout(worker, 15_000);
      return store.get();
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
  ipcMain.handle("queue:optimize", async () => {
    const next = await store.update((state) => {
      state.queue = optimizeWaitingTasks(state.queue);
    });
    sendState(next);
    return next;
  });
  ipcMain.handle("queue:duplicate", async (_event, taskId: string) => {
    const next = await store.update((state) => {
      const source = state.queue.find((task) => task.id === taskId);
      if (!source) return;
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
        error: undefined
      });
    });
    sendState(next);
    return next;
  });
  ipcMain.handle("queue:retry", async (_event, taskId: string) => {
    const next = await store.update((state) => {
      const task = state.queue.find((item) => item.id === taskId);
      if (!task || (task.status !== "failed" && task.status !== "cancelled")) return;
      Object.assign(task, {
        status: "waiting",
        updatedAt: new Date().toISOString(),
        comfyPromptId: undefined,
        progress: 0,
        error: undefined
      });
      state.queueRunning = true;
    });
    sendState(next);
    if (!queueWorker) {
      queueWorker = executeQueue().finally(() => {
        queueWorker = null;
      });
    }
    return next;
  });
  ipcMain.handle("history:delete", async (_event, assetId: string) => {
    const current = store.get();
    const asset = current.history.find((item) => item.id === assetId);
    if (!asset) return current;
    for (const filename of historyVideoPaths(asset, current.settings.outputDirectory)) {
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
      state.history = state.history.filter((item) => item.id !== assetId);
    });
    sendState(next);
    return next;
  });
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  Menu.setApplicationMenu(null);
  store = new JsonStore(path.join(app.getPath("userData"), "studio-state.json"));
  await store.load();
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
