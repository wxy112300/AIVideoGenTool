import { promises as fs } from "node:fs";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { ConnectionResult, EnhanceRequest, Settings } from "../../src/types.js";
import { buildComfyCandidates } from "./environment.js";
import { buildLmStudioChatRequest } from "./lm-studio.js";
import {
  inferH3PromptMode,
  normalizeH3PromptOutput
} from "../../src/core/h3-prompt.js";
import {
  isManagedPromptModel,
  managedPromptModel,
  type ManagedPromptModelDefinition
} from "../../src/core/prompt-models.js";

const execFileAsync = promisify(execFile);
const defaultPort = 8091;
const healthTimeoutMs = 90_000;
let ownedServer: ChildProcess | null = null;
let ownedServerPort = 0;
let ownedServerModelId = "";
let startPromise: Promise<ConnectionResult> | null = null;
let lastServerOutput = "";

function serverUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

function portForSettings(settings: Settings): number {
  const port = Number(settings.promptLlamaPort);
  return Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : defaultPort;
}

async function isFile(filename: string): Promise<boolean> {
  if (!filename) return false;
  const stat = await fs.stat(filename).catch(() => undefined);
  return Boolean(stat?.isFile());
}

async function findFile(root: string, basename: string): Promise<string> {
  if (!root || !(await fs.stat(root).catch(() => undefined))) return "";
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop()!;
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const filename = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(filename);
      else if (entry.isFile() && entry.name.toLowerCase() === basename.toLowerCase()) return filename;
    }
  }
  return "";
}

function appManagedLlamaServerDirectory(): string {
  const localAppData =
    process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
  return path.join(localAppData, "Local Video Studio", "llama-server");
}

function promptModelDirectories(settings: Settings): string[] {
  const homeDirectory = os.homedir();
  const localAppData =
    process.env.LOCALAPPDATA ?? path.join(homeDirectory, "AppData", "Local");
  const comfyDirectories = buildComfyCandidates({
    homeDirectory,
    localAppData,
    installDirectory: settings.comfyInstallDirectory,
    modelDirectory: settings.modelDirectory
  }).map((root) => path.join(root, "models", "prompt_models"));
  return [...new Set([
    settings.promptModelDirectory,
    settings.modelDirectory ? path.join(settings.modelDirectory, "prompt_models") : "",
    settings.comfyInstallDirectory ? path.join(settings.comfyInstallDirectory, "models", "prompt_models") : "",
    ...comfyDirectories
  ].filter(Boolean).map((root) => path.resolve(root)))];
}

async function resolveServerExecutable(settings: Settings): Promise<string> {
  const candidates = [
    settings.promptLlamaServerPath,
    settings.promptModelDirectory ? path.join(settings.promptModelDirectory, "llama-server.exe") : "",
    settings.modelDirectory ? path.join(settings.modelDirectory, "prompt_models", "llama-server.exe") : "",
    settings.comfyInstallDirectory ? path.join(settings.comfyInstallDirectory, "llama-server.exe") : ""
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (await isFile(candidate)) return path.resolve(candidate);
  }
  for (const directory of promptModelDirectories(settings)) {
    const discovered = await findFile(directory, "llama-server.exe");
    if (discovered) return path.resolve(discovered);
  }
  const managed = await findFile(appManagedLlamaServerDirectory(), "llama-server.exe");
  if (managed) return path.resolve(managed);
  try {
    const result = await execFileAsync(process.platform === "win32" ? "where.exe" : "which", ["llama-server.exe"], {
      windowsHide: true
    });
    const filename = result.stdout.split(/\r?\n/u).map((line) => line.trim()).find(Boolean) ?? "";
    if (await isFile(filename)) return filename;
  } catch {}
  return "";
}

async function resolvePromptAssets(
  settings: Settings,
  definition: ManagedPromptModelDefinition
): Promise<{ model: string; mmproj: string }> {
  for (const root of promptModelDirectories(settings)) {
    const model = await findFile(root, definition.modelFilename);
    if (!model) continue;
    const colocatedProjector = path.join(path.dirname(model), definition.mmprojFilename);
    const mmproj = await isFile(colocatedProjector)
      ? colocatedProjector
      : await findFile(root, definition.mmprojFilename);
    if (model && mmproj) return { model, mmproj };
  }
  return { model: "", mmproj: "" };
}

function appendServerOutput(chunk: Buffer | string): void {
  lastServerOutput = `${lastServerOutput}${chunk.toString()}`.slice(-8_000);
}

async function waitForServer(port: number): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < healthTimeoutMs) {
    try {
      const response = await fetch(`${serverUrl(port)}/health`, {
        signal: AbortSignal.timeout(2_000)
      });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`llama-server 启动超时。${lastServerOutput ? `最后日志：${lastServerOutput}` : "请检查 llama-server.exe、模型文件和显卡运行库。"}`);
}

async function runningServerModelMatches(
  port: number,
  definition: ManagedPromptModelDefinition
): Promise<boolean> {
  try {
    const response = await fetch(`${serverUrl(port)}/v1/models`, {
      signal: AbortSignal.timeout(2_000)
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { data?: Array<{ id?: string }> };
    const filename = definition.modelFilename.toLowerCase();
    const stem = filename.replace(/\.gguf$/u, "");
    return (body.data ?? []).some((item) => {
      const id = item.id?.toLowerCase() ?? "";
      return id === definition.id.toLowerCase() || id.includes(filename) || id.includes(stem);
    });
  } catch {
    return false;
  }
}

export async function startLlamaPromptModel(settings: Settings): Promise<ConnectionResult> {
  const definition = managedPromptModel(settings.promptModelId);
  if (!definition || !isManagedPromptModel(settings.promptModelId)) {
    return { ok: false, message: "当前提示词模型不属于应用自管理的 llama-server 模型。" };
  }
  if (startPromise) return startPromise;
  startPromise = (async () => {
    if (ownedServer && ownedServerModelId !== definition.id) {
      await stopOwnedServer();
    }
    const executable = await resolveServerExecutable(settings);
    if (!executable) {
      return {
        ok: false,
        message: "找不到 llama-server.exe。请下载 llama.cpp 的 Windows CUDA 版本，并在设置中填写 llama-server.exe 的完整路径。"
      };
    }
    const assets = await resolvePromptAssets(settings, definition);
    if (!assets.model || !assets.mmproj) {
      return {
        ok: false,
        message: `缺少 ${definition.name} 的模型文件。请把 ${definition.modelFilename} 和匹配的 ${definition.mmprojFilename} 放在同一子目录后重新扫描。`
      };
    }
    const port = portForSettings(settings);
    try {
      const existing = await fetch(`${serverUrl(port)}/health`, { signal: AbortSignal.timeout(1_500) });
      if (existing.ok) {
        if (ownedServerModelId === definition.id || await runningServerModelMatches(port, definition)) {
          return { ok: true, message: `已连接已有 ${definition.name} llama-server（${serverUrl(port)}）。` };
        }
        return {
          ok: false,
          message: `端口 ${port} 已有 llama-server，但加载的不是 ${definition.name}。请先停止旧提示词服务或更换端口。`
        };
      }
    } catch {}
    lastServerOutput = "";
    const child = spawn(executable, [
      "--model", assets.model,
      "--mmproj", assets.mmproj,
      "--host", "127.0.0.1",
      "--port", String(port),
      "--n-gpu-layers", "999",
      "--ctx-size", String(definition.contextSize),
      "--parallel", "1"
    ], {
      cwd: path.dirname(executable),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout?.on("data", appendServerOutput);
    child.stderr?.on("data", appendServerOutput);
    child.once("exit", () => {
      if (ownedServer === child) {
        ownedServer = null;
        ownedServerPort = 0;
        ownedServerModelId = "";
      }
    });
    ownedServer = child;
    ownedServerPort = port;
    ownedServerModelId = definition.id;
    try {
      await waitForServer(port);
      return { ok: true, message: `${definition.name} 已由应用启动（${serverUrl(port)}）。` };
    } catch (error) {
      await stopOwnedServer();
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  })();
  try {
    return await startPromise;
  } finally {
    startPromise = null;
  }
}

async function stopOwnedServer(): Promise<void> {
  const child = ownedServer;
  ownedServer = null;
  ownedServerPort = 0;
  ownedServerModelId = "";
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = execFile("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
      killer.once("exit", () => resolve());
      killer.once("error", () => resolve());
    });
  } else {
    child.kill("SIGTERM");
  }
}

export async function releaseLlamaPromptModel(): Promise<number> {
  if (!ownedServer) return 0;
  await stopOwnedServer();
  return 1;
}

export async function enhancePromptWithLlamaServer(
  request: EnhanceRequest,
  settings: Settings
): Promise<string> {
  const started = await startLlamaPromptModel(settings);
  if (!started.ok) throw new Error(started.message);
  const port = ownedServerPort || portForSettings(settings);
  const body = await buildLmStudioChatRequest(
    request,
    { ...settings, promptUseLmStudio: true, lmStudioUrl: `${serverUrl(port)}/v1` },
    settings.promptModelId
  );
  const response = await fetch(`${serverUrl(port)}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000)
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`llama-server 返回 HTTP ${response.status}${detail ? `：${detail}` : ""}`);
  }
  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = result.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("llama-server 没有返回提示词文本");
  const normalizedContent = content
    .replace(/<think>[\s\S]*?<\/think>/giu, "")
    .replace(/^```(?:text|markdown)?\s*/iu, "")
    .replace(/\s*```$/u, "")
    .trim();
  if (request.mode === "image-edit") return normalizedContent;
  const imageCount = request.imagePaths?.length ?? 0;
  const mode = request.h3PromptMode ?? inferH3PromptMode(
    Boolean(request.imagePath || imageCount > 0),
    imageCount > 1
  );
  return normalizeH3PromptOutput(normalizedContent, mode, request.h3DurationSeconds ?? 5);
}

export function llamaPromptServerStatus(): { running: boolean; port: number; output: string; modelId: string } {
  return { running: Boolean(ownedServer), port: ownedServerPort, output: lastServerOutput, modelId: ownedServerModelId };
}
