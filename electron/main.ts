import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AppState,
  ConnectionKind,
  Draft,
  EnhanceRequest,
  HistoryAsset,
  QueueTask,
  Settings
} from "../src/types.js";
import { createOutputFilename } from "../src/core/filename.js";
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
  interrupt,
  submitTask,
  testComfyUi,
  waitForTask
} from "./services/comfy-ui.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;
let store: JsonStore;
let queueWorker: Promise<void> | null = null;
let activeController: AbortController | null = null;

function sendState(state = store.get()): void {
  mainWindow?.webContents.send("state:changed", state);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 820,
    minHeight: 620,
    backgroundColor: "#181818",
    webPreferences: {
      preload: path.join(currentDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
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

async function executeQueue(): Promise<void> {
  while (store.get().queueRunning) {
    const task = store.get().queue.find((item) => item.status === "waiting");
    if (!task) break;
    activeController = new AbortController();
    try {
      await updateTask(task.id, { status: "running", progress: 1, error: undefined });
      const { promptId, clientId } = await submitTask(task, store.get().settings);
      await updateTask(task.id, { comfyPromptId: promptId, progress: 3 });
      const result = await waitForTask(
        promptId,
        clientId,
        store.get().settings,
        activeController.signal,
        (progress) => void updateTask(task.id, { progress })
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
        prompt: completedTask.prompt,
        seed: completedTask.seed,
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
      await updateTask(task.id, {
        status: aborted ? "cancelled" : "failed",
        error: aborted
          ? "任务已中止。部分帧保留依赖所用工作流的安全取消节点。"
          : error instanceof Error
            ? error.message
            : String(error)
      });
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
      activeController?.abort(new Error("用户取消任务"));
      await interrupt(store.get().settings).catch(() => undefined);
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
    });
    sendState(next);
    return next;
  });
}

app.whenReady().then(async () => {
  store = new JsonStore(path.join(app.getPath("userData"), "studio-state.json"));
  await store.load();
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
