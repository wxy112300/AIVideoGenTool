import { promises as fs } from "node:fs";
import path from "node:path";
import type { PromptProgressReporter, Settings } from "../../src/types.js";
import { findComfyRoot } from "./comfy-discovery.js";
import { downloadFileWithCurl } from "./environment.js";
import { getApplicationLogger, safeLogErrorMessage } from "./app-logger.js";

const QWEN_BASE_REPO = "https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct/resolve/main";
const QWEN_ADAPTER_REPO = "https://huggingface.co/lightx2v/MiniMax-H3-Prompt-Rewriter-LoRA-8B/resolve/main";
const QWEN_BASE_DIRECTORY = "LLM/Qwen-VL/qwen3-vl-8b-instruct";
const QWEN_ADAPTER_DIRECTORY = "LLM/Qwen-VL-LoRA/minimax-h3-prompt-rewriter-8b";

export interface QwenVlManagedAsset {
  relativePath: string;
  url: string;
}

/**
 * Small PEFT/Transformers metadata is application-managed. The large model
 * shards remain explicit catalog requirements so the settings page never
 * makes users hunt through a repository for JSON files.
 */
export const qwenVlManagedMetadata: readonly QwenVlManagedAsset[] = [
  "config.json",
  "generation_config.json",
  "model.safetensors.index.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "preprocessor_config.json",
  "video_preprocessor_config.json",
  "chat_template.json",
  "vocab.json"
].map((filename) => ({
  relativePath: `${QWEN_BASE_DIRECTORY}/${filename}`,
  url: `${QWEN_BASE_REPO}/${filename}?download=true`
})).concat({
  relativePath: `${QWEN_ADAPTER_DIRECTORY}/adapter_config.json`,
  url: `${QWEN_ADAPTER_REPO}/adapter_config.json?download=true`
});

const appLogger = getApplicationLogger();
const inFlight = new Map<string, Promise<{ modelDirectory: string; downloaded: string[] }>>();

async function isUsableFile(filename: string): Promise<boolean> {
  const stat = await fs.stat(filename).catch(() => null);
  return Boolean(stat?.isFile() && stat.size > 0);
}

function safeAssetPath(modelDirectory: string, relativePath: string): string {
  const root = path.resolve(modelDirectory);
  const target = path.resolve(root, ...relativePath.split("/"));
  const relative = path.relative(root, target);
  if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Qwen3-VL 资源路径越界：${relativePath}`);
  }
  return target;
}

async function resolveModelDirectory(settings: Settings): Promise<string> {
  const configured = settings.modelDirectory.trim();
  if (configured) return path.resolve(configured);
  const comfyRoot = await findComfyRoot(settings);
  return comfyRoot ? path.join(comfyRoot, "models") : "";
}

async function downloadMetadataAsset(
  asset: QwenVlManagedAsset,
  modelDirectory: string,
  settings: Settings
): Promise<boolean> {
  const target = safeAssetPath(modelDirectory, asset.relativePath);
  if (await isUsableFile(target)) {
    if (path.extname(target).toLowerCase() !== ".json") return false;
    try {
      JSON.parse(await fs.readFile(target, "utf8"));
      return false;
    } catch {
      await fs.rm(target, { force: true });
    }
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.part-${process.pid}-${crypto.randomUUID()}`;
  try {
    await downloadFileWithCurl(asset.url, temporary, settings);
    if (!(await isUsableFile(temporary))) throw new Error("下载完成但文件为空");
    if (path.extname(target).toLowerCase() === ".json") {
      JSON.parse(await fs.readFile(temporary, "utf8"));
    }
    await fs.rename(temporary, target);
    return true;
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}

export async function ensureQwenVlManagedMetadata(
  settings: Settings,
  signal?: AbortSignal,
  onProgress?: PromptProgressReporter
): Promise<{ modelDirectory: string; downloaded: string[] }> {
  if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
  const modelDirectory = await resolveModelDirectory(settings);
  if (!modelDirectory) {
    throw new Error("无法定位 ComfyUI 的 models 目录，无法自动准备 Qwen3-VL 配置。请先在设置中选择 ComfyUI 模型目录。");
  }
  const key = path.normalize(modelDirectory).toLowerCase();
  const existing = inFlight.get(key);
  if (existing) return existing;
  const task = (async () => {
    const downloaded: string[] = [];
    try {
      for (let index = 0; index < qwenVlManagedMetadata.length; index += 1) {
        if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
        const asset = qwenVlManagedMetadata[index]!;
        onProgress?.(
          "checking",
          5 + Math.round((index / qwenVlManagedMetadata.length) * 8),
          `准备 Qwen3-VL 配置 ${index + 1}/${qwenVlManagedMetadata.length}`
        );
        appLogger.info("prompt", "qwenvl-metadata-check", "Checking Qwen3-VL managed metadata", {
          relativePath: asset.relativePath,
          modelDirectory
        });
        if (await downloadMetadataAsset(asset, modelDirectory, settings)) downloaded.push(asset.relativePath);
      }
      if (downloaded.length) {
        appLogger.info("prompt", "qwenvl-metadata-prepared", "Qwen3-VL prompt metadata prepared", {
          modelDirectory,
          downloaded
        });
      }
      return { modelDirectory, downloaded };
    } catch (error) {
      appLogger.error("prompt", "qwenvl-metadata-failed", safeLogErrorMessage(error), {
        modelDirectory,
        downloaded
      });
      throw new Error(`Qwen3-VL 配置自动准备失败：${safeLogErrorMessage(error)}。大模型 safetensors 不受影响，请检查网络/代理后重试。`);
    }
  })();
  inFlight.set(key, task);
  try {
    return await task;
  } finally {
    if (inFlight.get(key) === task) inFlight.delete(key);
  }
}
