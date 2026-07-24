import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  protocol,
  shell
} from "electron";
import { createReadStream, promises as fs } from "node:fs";
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
  LocalServiceKind,
  QueueTask,
  Settings
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
import { validateApiWorkflow } from "../src/core/workflow.js";
import { JsonStore } from "./store.js";
import { enhancePrompt, testLmStudio } from "./services/lm-studio.js";
import {
  installCustomNode,
  repairEnvironmentIssue,
  restartLocalService,
  scanEnvironment,
  startLocalService
} from "./services/environment.js";
import {
  interrupt,
  submitTask,
  TaskStalledError,
  testComfyUi,
  waitForTask
} from "./services/comfy-ui.js";
import { getPerformanceMetrics } from "./services/performance.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;
let store: JsonStore;
let queueWorker: Promise<void> | null = null;
let activeController: AbortController | null = null;
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
      if (url.hostname !== "history") return new Response("Not found", { status: 404 });
      const [assetId, fileIndexText] = url.pathname.split("/").filter(Boolean);
      const fileIndex = Number(fileIndexText);
      const asset = store
        .get()
        .history.find((item) => item.id === decodeURIComponent(assetId ?? ""));
      const filename =
        Number.isInteger(fileIndex) && fileIndex >= 0
          ? asset?.files[fileIndex]?.absolutePath
          : undefined;
      const stat = filename ? await fs.stat(filename).catch(() => null) : null;
      if (!filename || !stat?.isFile()) {
        return new Response("Media file not found", { status: 404 });
      }
      const contentType = new Map([
        [".mp4", "video/mp4"],
        [".m4v", "video/mp4"],
        [".webm", "video/webm"],
        [".mov", "video/quicktime"],
        [".mkv", "video/x-matroska"]
      ]).get(path.extname(filename).toLowerCase()) ?? "application/octet-stream";
      const range = request.headers.get("range");
      const match = range?.match(/^bytes=(\d*)-(\d*)$/);
      const requestedStart = match?.[1] ? Number(match[1]) : 0;
      const requestedEnd = match?.[2] ? Number(match[2]) : stat.size - 1;
      const start = Math.min(Math.max(0, requestedStart), Math.max(0, stat.size - 1));
      const end = Math.min(Math.max(start, requestedEnd), stat.size - 1);
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

async function bundledWorkflowFor(modelId: string): Promise<BundledWorkflow | null> {
  const definitions: Record<string, { filename: string; label: string }> = {
    wan22_5b: {
      filename: "wan22_5b_i2v_api.json",
      label: "内置 · Wan 2.2 5B 图生视频"
    },
    hunyuan15: {
      filename: "hunyuan15_i2v_api.json",
      label: "内置 · HunyuanVideo 1.5 图生视频"
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
      return {
        modelId,
        label,
        path: candidate
      };
    }
  }
  return null;
}

function sendState(state = store.get()): void {
  mainWindow?.webContents.send("state:changed", state);
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
  const next = await store.update((state) => {
    state.queueRunning = false;
  });
  sendState(next);
  activeController?.abort(new Error("应用退出，任务已中止"));
  const interruptPromise = interrupt(settings).then(
    () => true,
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
  return { interrupted, workerSettled };
}

async function finishWindowClose(): Promise<void> {
  allowWindowClose = true;
  mainWindow?.destroy();
  if (process.platform !== "darwin") app.quit();
}

async function handleWindowClose(): Promise<void> {
  if (!mainWindow || closeFlowRunning) return;
  const runningTask = store
    .get()
    .queue.find((task) => task.status === "running");
  if (!runningTask && !activeController) {
    await finishWindowClose();
    return;
  }
  closeFlowRunning = true;
  try {
    const choice = await dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "任务仍在运行",
      message: "当前视频还在生成，是否结束任务并退出？",
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
      sandbox: true
    }
  });
  mainWindow.setMenuBarVisibility(false);
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

function queueTaskFromDraft(draft: Draft, state: AppState): QueueTask {
  const now = new Date().toISOString();
  const prompt = promptOf(draft);
  const names = [
    ...state.queue.map((item) => item.outputFilename),
    ...state.history.map((item) => item.outputFilename)
  ];
  return {
    id: crypto.randomUUID(),
    status: "waiting",
    createdAt: now,
    updatedAt: now,
    outputFilename: createOutputFilename(draft.modelId, prompt, names),
    prompt,
    promptVersion: draft.activePromptVersion + 1,
    startImagePath: draft.startImagePath,
    endImagePath: draft.endImagePath,
    modelId: draft.modelId,
    workflowPath: draft.workflowPath,
    ratio: draft.ratio,
    resolution: draft.resolution,
    duration: draft.duration,
    fps: draft.fps,
    motion: draft.motion,
    seed: draft.seed ?? Math.floor(Math.random() * Number.MAX_SAFE_INTEGER),
    keepSeedOnCopy: draft.keepSeedOnCopy,
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

async function executeQueue(): Promise<void> {
  while (store.get().queueRunning) {
    const task = store.get().queue.find((item) => item.status === "waiting");
    if (!task) break;
    activeController = new AbortController();
    try {
      await updateTask(task.id, {
        status: "running",
        progress: 1,
        stage: "提交工作流",
        startedAt: new Date().toISOString(),
        error: undefined
      });
      await ensureComfyUiReady(task.id);
      await updateTask(task.id, {
        progress: 1,
        stage: "提交工作流"
      });
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
        activeController.signal,
        (progress, stage) => void updateTask(task.id, { progress, stage }),
        (dataUrl) =>
          mainWindow?.webContents.send("task:preview", {
            taskId: task.id,
            dataUrl
          })
      );
      const completedTask = store.get().queue.find((item) => item.id === task.id);
      if (!completedTask) continue;
      const asset: HistoryAsset = {
        id: crypto.randomUUID(),
        taskId: completedTask.id,
        title: completedTask.prompt.slice(0, 28) || "未命名视频",
        outputFilename: completedTask.outputFilename,
        createdAt: new Date().toISOString(),
        modelId: completedTask.modelId,
        duration: completedTask.duration,
        resolution: completedTask.resolution,
        fps: completedTask.fps,
        ratio: completedTask.ratio,
        prompt: completedTask.prompt,
        seed: completedTask.seed,
        startImagePath: completedTask.startImagePath,
        endImagePath: completedTask.endImagePath,
        workflowPath: completedTask.workflowPath,
        startedAt: completedTask.startedAt,
        comfyPromptId: promptId,
        comfyOutputs: result,
        files: attachAbsoluteOutputPaths(
          extractComfyOutputFiles(result),
          store.get().settings.outputDirectory
        )
      };
      const next = await store.update((state) => {
        state.queue = state.queue.filter((item) => item.id !== task.id);
        state.history.unshift(asset);
      });
      sendState(next);
    } catch (error) {
      const aborted = activeController.signal.aborted;
      const stalled = error instanceof TaskStalledError;
      if (!aborted) {
        await interrupt(store.get().settings).catch(() => undefined);
      }
      if (stalled) {
        const stopped = await store.update((state) => {
          state.queueRunning = false;
        });
        sendState(stopped);
      }
      const failedState = await updateTask(task.id, {
        status: aborted ? "cancelled" : "failed",
        error: aborted
          ? "任务已中止。部分帧保留依赖所用工作流的安全取消节点。"
          : error instanceof Error
            ? error.message
            : String(error)
      });
      if (stalled) {
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
  ipcMain.handle("file:pick-workflow", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "ComfyUI API 工作流", extensions: ["json"] }]
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipcMain.handle("workflow:get-bundled", (_event, modelId: string) =>
    bundledWorkflowFor(modelId)
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
  ipcMain.handle(
    "prompt:enhance",
    (_event, request: EnhanceRequest) =>
      enhancePrompt(request, store.get().settings)
  );
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
    "service:restart",
    (_event, kind: LocalServiceKind, settings: Settings) =>
      restartLocalService(kind, settings)
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
  ipcMain.handle("queue:enqueue", async (_event, draft: Draft) => {
    if (!draft.startImagePath) throw new Error("请先选择首帧图片");
    if (!promptOf(draft)) throw new Error("提示词不能为空");
    if (!draft.workflowPath) throw new Error("请先选择该模型的 ComfyUI API 工作流");
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
    const next = await store.update((state) => {
      state.queue.push(queueTaskFromDraft(draft, state));
      state.draft = draft;
    });
    sendState(next);
    return next;
  });
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
      const next = await store.update((state) => {
        state.queueRunning = false;
      });
      sendState(next);
      activeController?.abort(new Error("用户取消任务"));
      await interrupt(store.get().settings).catch(() => undefined);
      void restartLocalService("comfy", store.get().settings);
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
      state.queue.push({
        ...source,
        id: crypto.randomUUID(),
        status: "waiting",
        createdAt: now,
        updatedAt: now,
        outputFilename: createOutputFilename(source.modelId, source.prompt, names),
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
