import { execFile, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type {
  AttentionAccelerationStatus,
  ConnectionResult,
  ComfyUiCompatibility,
  CustomNodeStatus,
  EnvironmentIssue,
  EnvironmentItem,
  EnvironmentItemId,
  EnvironmentScanResult,
  EnvironmentScanScope,
  GpuDeviceInfo,
  LlamaServerStatus,
  LlamaCppPythonStatus,
  LocalServiceKind,
  ModelComponentStatus,
  ModelScanProfile,
  PythonRuntimeCandidate,
  Settings,
  WorkflowDependencyStatus
} from "../../src/types.js";
import {
  managedPromptModelDefinitions
} from "../../src/core/prompt-models.js";
import {
  flux2Klein4bRequiredNodeTypes,
  qwenImageEdit2511RequiredNodeTypes
} from "../../src/core/image-workflow.js";
import {
  customNodeCatalog,
  modelCatalog
} from "../../src/core/catalog/index.js";
import { isRetiredVideoModel } from "../../src/core/workflow.js";
import { getApplicationLogger, safeLogErrorMessage } from "./app-logger.js";
import { captureComfyUiLogFailure } from "./comfy-log-bridge.js";
import {
  availableComfyNodeIds,
  readLatestComfyLog,
  scanCustomNodes
} from "./dependency-scanner.js";
import { discoverCudaToolkit } from "./cuda-toolkit.js";
import { installCustomNodePackage } from "./dependency-installer.js";
import { prepareH3PromptWriter } from "./dependency-node-adapters.js";
import {
  inspectLlamaCppPython,
  installLlamaCppPythonPackage,
  type LlamaCppPythonRuntime
} from "./llama-cpp-python.js";
import { comfyRuntimeState } from "./comfy-runtime-state.js";
import {
  backupSqliteDatabaseFamily,
  buildComfyDatabaseMigrationScript,
  diagnoseComfyDatabaseFailure,
  isPathInsideDirectory,
  probeWritableDirectory,
  quarantineSqliteDatabaseFamily,
  restoreSqliteDatabaseBackups,
  type ComfyDatabaseDiagnosis
} from "./comfy-database-repair.js";
import {
  installWorkflowDependencyPackage,
  scanWorkflowDependencies
} from "./dependency-workflows.js";
import {
  evaluateMiniMaxH3CoreSupport,
  evaluateMiniMaxH3CompatibilityState,
  evaluatePromptCoreSupport,
  minimaxH3CoreNodes,
  minimaxH3KnownBadCoreRanges,
  MINIMAX_H3_MINIMUM_COMFY_REVISION,
  MINIMAX_H3_MINIMUM_COMFY_VERSION,
  MINIMAX_H3_RECOMMENDED_COMFY_VERSION,
  versionAtLeast
} from "./comfy-compatibility.js";
import {
  discoverComfyInstallations,
  findComfyInstallation,
  findComfyRoot,
  readComfyGitRevision,
  readComfySourceVersion,
  uniqueWindowsPaths,
  type ComfyInstallation
} from "./comfy-discovery.js";
import {
  availableVramBytesForReserve,
  comfyUiBundledFrontendArgs,
  comfyUiMemoryArgs,
  comfyUiRuntimeProfileForSettings,
  comfyUiRuntimeProfileFromCommandLine,
  type ComfyUiRuntimeProfile
} from "./comfy-runtime-policy.js";
import {
  isLocalPortInUse,
  launchComfyUiVisible,
  launchDetached,
  localEndpoint,
  waitForService
} from "./local-service-process.js";
import {
  appManagedComfyDatabaseFilename,
  clearOwnedComfyProcessIds,
  ownedComfyProcessIdSnapshot,
  rememberOwnedComfyProcessId,
  startComfyUiService
} from "./comfy-runtime-service.js";
import {
  allComfyProcessInfo,
  forceStopComfyProcesses as forceStopComfyProcessesWithDependencies,
  listeningPid,
  stopComfyUiService
} from "./comfy-shutdown-service.js";

export {
  ltxAudioVaeCompatible,
  videoHelperBatchCompatible
} from "./dependency-compatibility.js";
export {
  patchH3PromptWriterLlamaCppCompatibility,
  patchLtxAudioVaeCompatibility,
  patchVideoHelperBatchCompatibility
} from "./dependency-node-adapters.js";
export {
  evaluateMiniMaxH3CoreSupport,
  evaluateMiniMaxH3CompatibilityState,
  evaluatePromptCoreSupport,
  minimaxH3KnownBadCoreRanges,
  MINIMAX_H3_MINIMUM_COMFY_REVISION,
  MINIMAX_H3_MINIMUM_COMFY_VERSION,
  MINIMAX_H3_RECOMMENDED_COMFY_VERSION
} from "./comfy-compatibility.js";
export {
  buildComfyCandidates,
  buildComfyDesktopCandidates,
  buildComfyDesktopSourceCandidates,
  parseComfyDesktop2Registry
} from "./comfy-discovery.js";
export {
  availableVramBytesForReserve,
  comfyUiBundledFrontendArgs,
  comfyUiMemoryArgs,
  comfyUiRuntimeProfileForSettings,
  comfyUiRuntimeProfileFromCommandLine
} from "./comfy-runtime-policy.js";
export {
  parseComfyProcessIds,
  parseComfyProcessInfo
} from "./comfy-shutdown-service.js";

const execFileAsync = promisify(execFile);
const appLogger = getApplicationLogger();

const sageAttentionVersion = "2.2.0";
const comfyWheelsIndex = "https://comfy-org.github.io/wheels/";
const pytorchCu130Index = "https://download.pytorch.org/whl/cu130";
const h3TorchRuntime = {
  torch: "2.9.1",
  torchvision: "0.24.1",
  torchaudio: "2.9.1"
} as const;
const llamaServerReleaseApiUrl =
  "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest";
const llamaServerCudaVariants = ["12.4", "13.3"] as const;
const githubReleaseCache = new Map<string, {
  version: string;
  checkedAt: number;
}>();
const githubReleaseRequests = new Map<string, Promise<string>>();
const githubReleaseCacheTtlMs = 6 * 60 * 60 * 1000;
const githubReleaseFailureCacheTtlMs = 60 * 1000;

function formatGpuMemory(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function normalizeReleaseVersion(value: string): string {
  return value.trim().replace(/^v/i, "");
}

async function latestGitHubReleaseVersion(
  settings: Settings,
  repository: string
): Promise<string> {
  const cacheKey = repository.trim().toLowerCase();
  const cached = githubReleaseCache.get(cacheKey);
  const cacheTtl = cached?.version
    ? githubReleaseCacheTtlMs
    : githubReleaseFailureCacheTtlMs;
  if (cached && Date.now() - cached.checkedAt < cacheTtl) return cached.version;
  const pending = githubReleaseRequests.get(cacheKey);
  if (pending) return pending;

  const request = (async () => {
    const url = "https://api.github.com/repos/" + repository + "/releases/latest";
    try {
      let payload: { tag_name?: unknown };
      if (settings.proxyEnabled && settings.proxyUrl.trim()) {
        const curl = await findExecutable("curl.exe");
        if (!curl) {
          githubReleaseCache.set(cacheKey, { version: "", checkedAt: Date.now() });
          return "";
        }
        const args = [
          "-fsSL",
          "--max-time",
          "5",
          "--proxy",
          normalizeProxyUrl(settings.proxyUrl),
          "-H",
          "Accept: application/vnd.github+json",
          url
        ];
        const result = await execFileAsync(curl, args, {
          windowsHide: true
        });
        payload = JSON.parse(result.stdout) as { tag_name?: unknown };
      } else {
        const response = await fetch(url, {
          headers: { Accept: "application/vnd.github+json" },
          signal: AbortSignal.timeout(3500)
        });
        if (!response.ok) {
          githubReleaseCache.set(cacheKey, { version: "", checkedAt: Date.now() });
          return "";
        }
        payload = await response.json() as { tag_name?: unknown };
      }
      const version = typeof payload.tag_name === "string"
        ? normalizeReleaseVersion(payload.tag_name)
        : "";
      githubReleaseCache.set(cacheKey, { version, checkedAt: Date.now() });
      return version;
    } catch {
      githubReleaseCache.set(cacheKey, { version: "", checkedAt: Date.now() });
      return "";
    }
  })();
  githubReleaseRequests.set(cacheKey, request);
  try {
    return await request;
  } finally {
    githubReleaseRequests.delete(cacheKey);
  }
}

async function latestCatalogNodeReleaseVersions(
  settings: Settings
): Promise<Record<string, string>> {
  const entries = customNodeCatalog.filter((definition) =>
    definition.releaseSource === "github-release"
  );
  const versions = await Promise.all(entries.map(async (definition) => {
    const repository = definition.repositoryUrl
      .replace(/^https?:\/\/github\.com\//i, "")
      .replace(/\.git$/i, "")
      .replace(/\/+$/u, "");
    return [definition.id, await latestGitHubReleaseVersion(settings, repository)] as const;
  }));
  return Object.fromEntries(versions.filter(([, version]) => version));
}


export function normalizeProxyUrl(value: string): string {
  const raw = value.trim();
  if (!raw) throw new Error("代理已开启，但代理地址为空。");
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(raw)
    ? raw
    : `http://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error(`代理地址无效：${raw}`);
  }
  if (!["http:", "https:", "socks5:", "socks5h:"].includes(parsed.protocol)) {
    throw new Error(`不支持的代理协议：${parsed.protocol}`);
  }
  if (!parsed.hostname || !parsed.port) {
    throw new Error("代理地址需要包含主机和端口，例如 127.0.0.1:7890。");
  }
  if ((parsed.pathname && parsed.pathname !== "/") || parsed.search || parsed.hash) {
    throw new Error("代理地址不能包含路径、查询参数或锚点。");
  }
  return parsed.toString().replace(/\/$/, "");
}

function downloadEnvironment(settings: Settings): NodeJS.ProcessEnv {
  // Detached Python processes on a Chinese Windows locale otherwise inherit
  // GBK for stderr. A custom node that logs an emoji while reporting an
  // import error can then crash ComfyUI itself with UnicodeEncodeError.
  const baseEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    PYTHONUTF8: "1",
    PYTHONIOENCODING: "utf-8"
  };
  if (!settings.proxyEnabled) return baseEnvironment;
  const proxy = normalizeProxyUrl(settings.proxyUrl);
  return {
    ...baseEnvironment,
    HTTP_PROXY: proxy,
    HTTPS_PROXY: proxy,
    ALL_PROXY: proxy,
    PIP_PROXY: proxy,
    http_proxy: proxy,
    https_proxy: proxy,
    all_proxy: proxy
  };
}

function proxyLogLabel(settings: Settings): string {
  if (!settings.proxyEnabled) return "代理：关闭";
  const parsed = new URL(normalizeProxyUrl(settings.proxyUrl));
  return `代理：${parsed.protocol}//${parsed.host}`;
}


interface ModelProfileDefinition {
  id: string;
  name: string;
  category: "video" | "lora" | "image" | "upscale" | "interpolation" | "prompt";
  managedBy?: "comfyui" | "lmstudio" | "llama-server";
  badge: string;
  description: string;
  vram: string;
  integrated?: boolean;
  requiredCustomNodeIds?: readonly string[];
  runtimeNodeTypes?: readonly string[];
  components: Array<{
    label: string;
    expected: string;
    patterns: RegExp[];
    optional?: boolean;
    installGuide?: ModelComponentStatus["installGuide"];
  }>;
}

const gemmaPromptModelDefinitions = managedPromptModelDefinitions.filter(
  (model) => model.backend !== "comfyui-qwenvl-lora"
);
const qwenVlPeftPromptModelDefinition = managedPromptModelDefinitions.find(
  (model) => model.backend === "comfyui-qwenvl-lora"
);

function escapedPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

const gemmaInstallGuides = Object.fromEntries(
  gemmaPromptModelDefinitions.flatMap((model) => {
    const revision = model.revision ? `/resolve/${model.revision}` : "/resolve/main";
    const baseUrl = `https://huggingface.co/${model.source}${revision}`;
    return [
      [`${model.id}:${model.name} GGUF`, {
        sourceLabel: `${model.source} · ${model.badge}`,
        downloadUrl: `${baseUrl}/${model.modelFilename}?download=true`,
        targetSubdirectory: model.targetDirectory,
        recommendedFilename: model.modelFilename,
        notes: `${model.description} 目录规则来自 MiniMax H3 Prompt Writer 扩展：使用大写 models/LLM，并让每个主 GGUF 与其匹配的 mmproj 独占一个子目录。${model.licenseNote}`
      }],
      [`${model.id}:${model.name} mmproj`, {
        sourceLabel: `${model.source} · matching vision projector`,
        downloadUrl: `${baseUrl}/${model.mmprojFilename}?download=true`,
        targetSubdirectory: model.targetDirectory,
        recommendedFilename: model.mmprojFilename,
        notes: "这是 MiniMax H3 Prompt Writer 扩展注册的 LLM 分类，不是 ComfyUI 核心的通用 GGUF 分类。必须与对应 Gemma GGUF 放在同一个独立子目录；不同 Gemma 档位的同名 mmproj 不能混用。"
      }]
    ];
  })
) as Record<string, ModelComponentStatus["installGuide"]>;

const qwenVlPeftInstallGuides = qwenVlPeftPromptModelDefinition
  ? (() => {
      const modelId = qwenVlPeftPromptModelDefinition.id;
      const baseDirectory = qwenVlPeftPromptModelDefinition.baseModelDirectory ?? "LLM/Qwen-VL/qwen3-vl-8b-instruct";
      const adapterDirectory = qwenVlPeftPromptModelDefinition.adapterDirectory ?? "LLM/Qwen-VL-LoRA/minimax-h3-prompt-rewriter-8b";
      const baseUrl = "https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct/resolve/main";
      const adapterUrl = "https://huggingface.co/lightx2v/MiniMax-H3-Prompt-Rewriter-LoRA-8B/resolve/main";
      const qwenGuide = (filename: string, notes: string) => ({
        sourceLabel: "Qwen · Qwen3-VL-8B-Instruct",
        downloadUrl: `${baseUrl}/${filename}?download=true`,
        targetSubdirectory: baseDirectory,
        recommendedFilename: filename,
        notes
      });
      const shardGuides = Object.fromEntries([1, 2, 3, 4].map((shard) => {
        const filename = `model-${String(shard).padStart(5, "0")}-of-00004.safetensors`;
        return [`${modelId}:Qwen3-VL 8B 权重分片 ${shard}/4`, qwenGuide(
          filename,
          "这是 Qwen3-VL 8B 的权重分片；4 个分片必须全部放在同一基座目录，缺任一分片都不能运行。"
        )];
      }));
      return {
        [`${modelId}:Qwen3-VL 8B 配置`]: qwenGuide(
          "config.json",
          "这是 Qwen3-VL-8B-Instruct 基座配置。还需要下载权重索引、4 个权重分片、tokenizer 与图像/视频预处理文件。"
        ),
        [`${modelId}:Qwen3-VL 8B 生成配置`]: qwenGuide(
          "generation_config.json",
          "请与 Qwen3-VL 8B 的权重、tokenizer 和处理器文件放在同一个基座目录。"
        ),
        [`${modelId}:Qwen3-VL 8B 权重索引`]: qwenGuide(
          "model.safetensors.index.json",
          "权重索引必须和 config.json、4 个 safetensors 分片、tokenizer 与预处理文件放在同一个基座目录。"
        ),
        [`${modelId}:Qwen3-VL 8B tokenizer`]: qwenGuide("tokenizer.json", "Qwen3-VL 8B tokenizer 文件。"),
        [`${modelId}:Qwen3-VL 8B tokenizer 配置`]: qwenGuide("tokenizer_config.json", "Qwen3-VL 8B tokenizer 配置。"),
        [`${modelId}:Qwen3-VL 8B preprocessor`]: qwenGuide("preprocessor_config.json", "Qwen3-VL 8B 图像预处理配置。"),
        [`${modelId}:Qwen3-VL 8B video preprocessor`]: qwenGuide("video_preprocessor_config.json", "Qwen3-VL 8B 视频预处理配置。"),
        [`${modelId}:Qwen3-VL 8B chat template`]: qwenGuide("chat_template.json", "Qwen3-VL 8B 对话模板文件。"),
        [`${modelId}:Qwen3-VL 8B vocab`]: qwenGuide("vocab.json", "Qwen3-VL 8B tokenizer vocab 文件。"),
        ...shardGuides,
        [`${modelId}:H3 Prompt Rewriter LoRA 配置`]: {
          sourceLabel: "LightX2V · MiniMax-H3-Prompt-Rewriter-LoRA-8B",
          downloadUrl: `${adapterUrl}/adapter_config.json?download=true`,
          targetSubdirectory: adapterDirectory,
          recommendedFilename: "adapter_config.json",
          notes: "这是绑定 Qwen3-VL-8B-Instruct 的 PEFT LoRA 配置，不能用于 Qwen3.6、Qwen3.8 GGUF 或 Gemma。"
        },
        [`${modelId}:H3 Prompt Rewriter LoRA 权重`]: {
          sourceLabel: "LightX2V · MiniMax-H3-Prompt-Rewriter-LoRA-8B",
          downloadUrl: `${adapterUrl}/adapter_model.safetensors?download=true`,
          targetSubdirectory: adapterDirectory,
          recommendedFilename: "adapter_model.safetensors",
          notes: "请与 adapter_config.json 放在同一个 LoRA 子目录；运行时由 ComfyUI Qwen-VL LoRA 节点加载。"
        }
      };
    })()
  : {};

const installGuides: Record<string, ModelComponentStatus["installGuide"]> = {
  ...gemmaInstallGuides,
  ...qwenVlPeftInstallGuides,
  "qwen/qwen3.5-2b:Qwen3.5 2B ComfyUI 文本编码器": {
    sourceLabel: "Hugging Face · Comfy-Org/Qwen3.5",
    downloadUrl: "https://huggingface.co/Comfy-Org/Qwen3.5/resolve/main/text_encoders/qwen3.5_2b_bf16.safetensors?download=true",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "qwen3.5_2b_bf16.safetensors",
    notes: "Comfy-Org 官方仓库按 text_encoders 分类发布。更快、更省显存的提示词助手备选；仍支持文字和参考图理解，但复杂动作分析与提示词细节能力低于 4B。"
  },
  "qwen/qwen3.5-4b:Qwen3.5 4B ComfyUI 文本编码器": {
    sourceLabel: "Hugging Face · Comfy-Org/Qwen3.5",
    downloadUrl: "https://huggingface.co/Comfy-Org/Qwen3.5/resolve/main/text_encoders/qwen3.5_4b_bf16.safetensors?download=true",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "qwen3.5_4b_bf16.safetensors",
    notes: "Comfy-Org 官方仓库按 text_encoders 分类发布。4090 推荐的原生提示词助手模型，同时支持文字生成和图片/视频理解；ComfyUI TextGenerate 工作流使用此文件。"
  },
  "minimax_h3_fl2va:MiniMax H3 FL2VA INT8 模型": {
    sourceLabel: "Comfy-Org / MiniMax-H3",
    downloadUrl: "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors",
    targetSubdirectory: "diffusion_models",
    recommendedFilename: "minimax_h3_fl2va_pruned_int8_convrot.safetensors",
    notes: "图生视频和首尾帧共用此模型。使用官方 pruned INT8 ConvRot 版本；可用分辨率和时长取决于实际 GPU、系统内存与卸载策略。"
  },
  "minimax_h3_fl2va:Qwen3-VL 32B H3 文本编码器": {
    sourceLabel: "Comfy-Org / MiniMax-H3",
    downloadUrl: "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
    notes: "官方低显存工作流使用 NVFP4 AWQ；是否适合当前设备取决于 GPU 对量化布局的支持和 ComfyUI 的卸载策略。"
  },
  "minimax_h3_fl2va:MiniMax H3 视频 VAE": {
    sourceLabel: "Comfy-Org / MiniMax-H3",
    downloadUrl: "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_video_vae_fp16.safetensors",
    targetSubdirectory: "vae",
    recommendedFilename: "minimax_h3_video_vae_fp16.safetensors"
  },
  "minimax_h3_fl2va:MiniMax H3 音频 VAE": {
    sourceLabel: "Comfy-Org / MiniMax-H3",
    downloadUrl: "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_audio_vae_fp32.safetensors",
    targetSubdirectory: "vae",
    recommendedFilename: "minimax_h3_audio_vae_fp32.safetensors",
    notes: "H3 原生立体声音频必须使用此 VAE；与视频 VAE 一起放在 models/vae。"
  },
  "minimax-h3-lightx2v-turbo-4step:MiniMax H3 LightX2V Turbo LoRA": {
    sourceLabel: "LightX2V / Kijai ComfyUI conversion",
    downloadUrl: "https://huggingface.co/Kijai/MiniMax-H3_comfy/resolve/main/loras/minimax_h3_fl2v_lightx2v_turbo_4step_v0.1_comfy_resized_avg_rank_21_bf16.safetensors",
    targetSubdirectory: "loras",
    recommendedFilename: "minimax_h3_fl2v_lightx2v_turbo_4step_v0.1_comfy_resized_avg_rank_21_bf16.safetensors",
    notes: "LightX2V Turbo LoRA；需要 ComfyUI v0.31.0+，建议 0.75 强度、ER-SDE、Beta 和 8 步。它只适配 MiniMax H3 FL2VA，不是独立基础模型。"
  },
  "minimax-h3-pink-fluffy-bunny-nsfw:PinkFluffyBunny NSFW LoRA": {
    sourceLabel: "SexGod1979 / PinkFluffyBunny-MiniMax-H3",
    downloadUrl: "https://huggingface.co/SexGod1979/PinkFluffyBunny-MiniMax-H3/resolve/main/PinkFluffyBunny-pruned-v1-rank128.safetensors?download=true",
    targetSubdirectory: "loras",
    recommendedFilename: "PinkFluffyBunny-pruned-v1-rank128.safetensors",
    notes: "MiniMax H3 FL2VA 的可选 NSFW 内容 LoRA。当前应用使用 pruned INT8 底模，因此选择同体系的 pruned v1 rank128；作者建议从 0.5 强度开始，并标注为 alpha 质量。"
  },
  "minimax_h3_fl2va_int4:MiniMax H3 FL2VA INT4 ConvRot 模型": {
    sourceLabel: "Merserk / MiniMax-H3-INT4-ConvRot",
    downloadUrl: "https://huggingface.co/Merserk/MiniMax-H3-INT4-ConvRot/resolve/main/minimax_h3_fl2va_pruned_int4_convrot.safetensors",
    targetSubdirectory: "diffusion_models",
    recommendedFilename: "minimax_h3_fl2va_pruned_int4_convrot.safetensors",
    notes: "社区 INT4 ConvRot 转换。12GB 显卡建议使用 pruned 版本，并准备 32GB 以上系统内存和快速 NVMe；不要与 NVFP4 编码器混用。"
  },
  "minimax_h3_fl2va_int4:Qwen3-VL 32B H3 INT4 文本编码器": {
    sourceLabel: "Merserk / MiniMax-H3-INT4-ConvRot",
    downloadUrl: "https://huggingface.co/Merserk/MiniMax-H3-INT4-ConvRot/resolve/main/qwen3vl_32b_minimax_h3_int4_convrot.safetensors",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "qwen3vl_32b_minimax_h3_int4_convrot.safetensors",
    notes: "与 INT4 ConvRot FL2VA 扩散模型配套的文本编码器；需要 ComfyUI 0.30.0 或更高版本。"
  },
  "minimax_h3_fl2va_q3_gguf:MiniMax H3 FL2VA Q3 GGUF 扩散模型": {
    sourceLabel: "Unsloth / MiniMax-H3-GGUF",
    downloadUrl: "https://huggingface.co/unsloth/MiniMax-H3-GGUF/resolve/main/minimax_h3_fl2va_pruned-Q3_K.gguf",
    targetSubdirectory: "unet",
    recommendedFilename: "minimax_h3_fl2va_pruned-Q3_K.gguf",
    notes: "社区 Q3 GGUF 扩散模型，文件约 8.16 GiB。3080 10GB 仅作为低分辨率、短片和 CPU/RAM offload 实验档；需要安装独立 H3 GGUF 节点包，不能与原生 UNETLoader 混用。"
  },
  "minimax_h3_fl2va_q3_gguf:Qwen3-VL 32B H3 Q2 GGUF 文本编码器": {
    sourceLabel: "Unsloth / MiniMax-H3-GGUF",
    downloadUrl: "https://huggingface.co/unsloth/MiniMax-H3-GGUF/resolve/main/qwen3vl_32b_minimax_h3-Q2_K_M.gguf",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "qwen3vl_32b_minimax_h3-Q2_K_M.gguf",
    notes: "Q2 文本编码器约 12.2 GiB，必须配合 H3CLIPLoaderGGUF，并建议放在 CPU/offload 路径；它的文件大小不等于显存峰值。"
  },
  "minimax_h3_ref2va:MiniMax H3 Ref2VA INT8 模型": {
    sourceLabel: "Comfy-Org / MiniMax-H3",
    downloadUrl: "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors",
    targetSubdirectory: "diffusion_models",
    recommendedFilename: "minimax_h3_ref2va_pruned_int8_convrot.safetensors",
    notes: "R2V 多参考模型，和 FL2VA 首帧/首尾帧模型不是同一套权重。4090 可作为 1-2 张图片参考的起步档；参考素材越多，显存和系统内存压力越大。"
  },
  "minimax_h3_ref2va_int4:MiniMax H3 Ref2VA INT4 ConvRot 模型": {
    sourceLabel: "Merserk / MiniMax-H3-INT4-ConvRot",
    downloadUrl: "https://huggingface.co/Merserk/MiniMax-H3-INT4-ConvRot/resolve/main/minimax_h3_ref2va_pruned_int4_convrot.safetensors",
    targetSubdirectory: "diffusion_models",
    recommendedFilename: "minimax_h3_ref2va_pruned_int4_convrot.safetensors",
    notes: "社区 R2V INT4 ConvRot 转换；12GB 起步，4090 可作为低显存实验档。建议 32GB 以上系统内存和快速 NVMe。R2V 工作流尚未接入。"
  },
  "minimax_h3_ref2va:Qwen3-VL 32B H3 文本编码器": {
    sourceLabel: "Comfy-Org / MiniMax-H3",
    downloadUrl: "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
    notes: "R2V 与官方 FL2VA 共用此文本编码器。"
  },
  "minimax_h3_ref2va:MiniMax H3 视频 VAE": {
    sourceLabel: "Comfy-Org / MiniMax-H3",
    downloadUrl: "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_video_vae_fp16.safetensors",
    targetSubdirectory: "vae",
    recommendedFilename: "minimax_h3_video_vae_fp16.safetensors"
  },
  "minimax_h3_ref2va:MiniMax H3 音频 VAE": {
    sourceLabel: "Comfy-Org / MiniMax-H3",
    downloadUrl: "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_audio_vae_fp32.safetensors",
    targetSubdirectory: "vae",
    recommendedFilename: "minimax_h3_audio_vae_fp32.safetensors",
    notes: "R2V 原生立体声音频使用此 VAE。"
  },
  "minimax_h3_ref2va_int4:Qwen3-VL 32B H3 INT4 文本编码器": {
    sourceLabel: "Merserk / MiniMax-H3-INT4-ConvRot",
    downloadUrl: "https://huggingface.co/Merserk/MiniMax-H3-INT4-ConvRot/resolve/main/qwen3vl_32b_minimax_h3_int4_convrot.safetensors",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "qwen3vl_32b_minimax_h3_int4_convrot.safetensors",
    notes: "R2V INT4 与 FL2VA INT4 共用此文本编码器。"
  },
  "minimax_h3_ref2va_int4:MiniMax H3 视频 VAE": {
    sourceLabel: "Comfy-Org / MiniMax-H3",
    downloadUrl: "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_video_vae_fp16.safetensors",
    targetSubdirectory: "vae",
    recommendedFilename: "minimax_h3_video_vae_fp16.safetensors"
  },
  "minimax_h3_ref2va_int4:MiniMax H3 音频 VAE": {
    sourceLabel: "Comfy-Org / MiniMax-H3",
    downloadUrl: "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_audio_vae_fp32.safetensors",
    targetSubdirectory: "vae",
    recommendedFilename: "minimax_h3_audio_vae_fp32.safetensors"
  },
  "qwen-image-edit-2511:Qwen Image Edit 2511 扩散模型": {
    sourceLabel: "Comfy-Org / Qwen-Image-Edit_ComfyUI",
    downloadUrl: "https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_edit_2511_int8_convrot.safetensors",
    targetSubdirectory: "diffusion_models",
    recommendedFilename: "qwen_image_edit_2511_int8_convrot.safetensors",
    notes: "官方 ComfyUI INT8 ConvRot 变体；也可以使用 BF16 或 FP8 Mixed 变体，但需要与当前显卡和工作流实测匹配。"
  },
  "qwen-image-edit-2511:Qwen 2.5 VL 7B 文本编码器": {
    sourceLabel: "Comfy-Org / Qwen-Image_ComfyUI",
    downloadUrl: "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "qwen_2.5_vl_7b_fp8_scaled.safetensors",
    notes: "Qwen Image Edit 与 HunyuanVideo 1.5 共用同一 Qwen2.5-VL 文本编码器；图片工作流从 Qwen-Image_ComfyUI 来源下载即可。"
  },
  "qwen-image-edit-2511:Qwen Image VAE": {
    sourceLabel: "Comfy-Org / Qwen-Image_ComfyUI",
    downloadUrl: "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors",
    targetSubdirectory: "vae",
    recommendedFilename: "qwen_image_vae.safetensors"
  },
  "qwen-image-edit-2511:Qwen Image Edit 2511 Lightning LoRA（可选）": {
    sourceLabel: "lightx2v / Qwen-Image-Edit-2511-Lightning",
    downloadUrl: "https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning/resolve/main/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors?download=true",
    targetSubdirectory: "loras",
    recommendedFilename: "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors",
    notes: "仅使用 Qwen Lightning 4 步质量档时需要；原生 20/40 步不依赖此 LoRA。"
  },
  "flux2-klein-4b:FLUX.2 Klein 4B FP8 扩散模型": {
    sourceLabel: "Black Forest Labs / FLUX.2 Klein 4B FP8",
    downloadUrl: "https://huggingface.co/black-forest-labs/FLUX.2-klein-base-4b-fp8/resolve/main/flux-2-klein-base-4b-fp8.safetensors",
    targetSubdirectory: "diffusion_models",
    recommendedFilename: "flux-2-klein-base-4b-fp8.safetensors",
    notes: "官方 4B Base 图片编辑模型；ComfyUI blueprint 采用 FP8 文件名和 20 步采样，官方称约 13GB VRAM，适合 RTX 4090。"
  },
  "flux2-klein-4b:Qwen3 4B FLUX.2 文本编码器": {
    sourceLabel: "Comfy-Org / FLUX.2 Klein",
    downloadUrl: "https://huggingface.co/Comfy-Org/flux2-klein/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "qwen_3_4b.safetensors",
    notes: "采用 Comfy-Org FLUX.2 Klein 官方 workflow 当前引用的 Qwen3 4B 文本编码器。"
  },
  "flux2-klein-4b:FLUX.2 VAE": {
    sourceLabel: "Comfy-Org / FLUX.2",
    downloadUrl: "https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors",
    targetSubdirectory: "vae",
    recommendedFilename: "flux2-vae.safetensors",
    notes: "FLUX.2 Klein 官方 blueprint 使用的 VAE。"
  },
  "sulphur2:Sulphur 2 Q2_K distilled GGUF": {
    sourceLabel: "szwagros / sulphur-2-gguf",
    downloadUrl: "https://huggingface.co/szwagros/sulphur-2-gguf/resolve/main/sulphur-2-distilled-Q2_K.gguf",
    targetSubdirectory: "unet",
    recommendedFilename: "sulphur-2-distilled-Q2_K.gguf",
    notes: "约 7.93 GB 的 8GB 兼容档。依赖 CPU offload、足够的系统内存和页面文件；质量低于 Q3/Q4。"
  },
  "sulphur2:Sulphur 2 Q3_K_M dev GGUF": {
    sourceLabel: "vantagewithai / Sulphur-2-Base-GGUF",
    downloadUrl: "https://huggingface.co/vantagewithai/Sulphur-2-Base-GGUF/resolve/main/sulphur_dev-Q3_K_M.gguf",
    targetSubdirectory: "unet",
    recommendedFilename: "sulphur_dev-Q3_K_M.gguf",
    notes: "约 11.13 GB，作为 24GB 显卡的默认均衡档。"
  },
  "sulphur2:Sulphur 2 Q4_K_M dev GGUF": {
    sourceLabel: "vantagewithai / Sulphur-2-Base-GGUF",
    downloadUrl: "https://huggingface.co/vantagewithai/Sulphur-2-Base-GGUF/resolve/main/sulphur_dev-Q4_K_M.gguf",
    targetSubdirectory: "unet",
    recommendedFilename: "sulphur_dev-Q4_K_M.gguf",
    notes: "约 14.30 GB 的质量档。运行前应关闭占用显存的其他程序。"
  },
  "sulphur2:Gemma 3 文本编码器": {
    sourceLabel: "Comfy-Org / ltx-2",
    downloadUrl: "https://huggingface.co/Comfy-Org/ltx-2/resolve/main/split_files/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "gemma_3_12B_it_fp4_mixed.safetensors"
  },
  "sulphur2:LTX 2.3 文本连接器": {
    sourceLabel: "vantagewithai / LTX-2.3-Split",
    downloadUrl: "https://huggingface.co/vantagewithai/LTX-2.3-Split/resolve/main/text_encoder/ltx-2-3-22b-text_encoder.safetensors",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "ltx-2-3-22b-text_encoder.safetensors"
  },
  "sulphur2:LTX 2.3 视频 VAE": {
    sourceLabel: "vantagewithai / LTX-2.3-Split",
    downloadUrl: "https://huggingface.co/vantagewithai/LTX-2.3-Split/resolve/main/vae/ltx-2-3-22b-VAE.safetensors",
    targetSubdirectory: "vae",
    recommendedFilename: "ltx-2-3-22b-VAE.safetensors"
  },
  "sulphur2:LTX 2.3 音频 VAE": {
    sourceLabel: "vantagewithai / LTX-2.3-Split",
    downloadUrl: "https://huggingface.co/vantagewithai/LTX-2.3-Split/resolve/main/audio_vae/ltx-2-3-22b-audio_vae.safetensors",
    targetSubdirectory: "checkpoints",
    recommendedFilename: "ltx-2-3-22b-audio_vae.safetensors",
    notes: "必须放在 models/checkpoints，由 ComfyUI-LTXVideo 的 LowVRAMAudioVAELoader 读取；通用 VAELoader 无法识别音频 VAE。"
  },
  "sulphur2:LTX 2.3 蒸馏 LoRA": {
    sourceLabel: "SulphurAI / Sulphur-2-base",
    downloadUrl: "https://huggingface.co/SulphurAI/Sulphur-2-base/resolve/main/distill_loras/ltx-2.3-22b-distilled-lora-1.1_fro90_ceil72_condsafe.safetensors",
    targetSubdirectory: "loras",
    recommendedFilename: "ltx-2.3-22b-distilled-lora-1.1_fro90_ceil72_condsafe.safetensors"
  },
  "sulphur2:LTX 2.3 Latent Upscaler": {
    sourceLabel: "Lightricks / LTX-2.3",
    downloadUrl: "https://huggingface.co/Lightricks/LTX-2/resolve/main/ltx-2-spatial-upscaler-x2-1.0.safetensors",
    targetSubdirectory: "latent_upscale_models",
    recommendedFilename: "ltx-2-spatial-upscaler-x2-1.0.safetensors"
  },
  "wan22_5b:Wan 2.2 5B 扩散模型": {
    sourceLabel: "Comfy-Org / Wan_2.2_ComfyUI_Repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors",
    targetSubdirectory: "diffusion_models",
    recommendedFilename: "wan2.2_ti2v_5B_fp16.safetensors"
  },
  "wan22_5b:UMT5 文本编码器": {
    sourceLabel: "Comfy-Org / Wan_2.2_ComfyUI_Repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "umt5_xxl_fp8_e4m3fn_scaled.safetensors"
  },
  "wan22_5b:Wan VAE": {
    sourceLabel: "Comfy-Org / Wan_2.2_ComfyUI_Repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors",
    targetSubdirectory: "vae",
    recommendedFilename: "wan2.2_vae.safetensors"
  },
  "hunyuan15:HunyuanVideo 1.5 I2V 模型": {
    sourceLabel: "Comfy-Org / HunyuanVideo_1.5_repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/resolve/main/split_files/diffusion_models/hunyuanvideo1.5_720p_i2v_fp16.safetensors",
    targetSubdirectory: "diffusion_models",
    recommendedFilename: "hunyuanvideo1.5_720p_i2v_fp16.safetensors",
    notes: "内置工作流按官方 720p I2V FP16 权重配置；已放在 models/unet 中的同名文件也会被扫描到。"
  },
  "hunyuan15:HunyuanVideo 1.5 VAE": {
    sourceLabel: "Comfy-Org / HunyuanVideo_1.5_repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/resolve/main/split_files/vae/hunyuanvideo15_vae_fp16.safetensors",
    targetSubdirectory: "vae",
    recommendedFilename: "hunyuanvideo15_vae_fp16.safetensors"
  },
  "hunyuan15:Qwen 2.5 VL 7B 文本编码器": {
    sourceLabel: "Comfy-Org / HunyuanVideo_1.5_repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "qwen_2.5_vl_7b_fp8_scaled.safetensors",
    notes: "下载页如有多个精度版本，4090 优先选择 FP8 scaled。"
  },
  "hunyuan15:ByT5 文本编码器": {
    sourceLabel: "Comfy-Org / HunyuanVideo_1.5_repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/resolve/main/split_files/text_encoders/byt5_small_glyphxl_fp16.safetensors",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "byt5_small_glyphxl_fp16.safetensors"
  },
  "hunyuan15:SigCLIP 视觉编码器": {
    sourceLabel: "Comfy-Org / HunyuanVideo_1.5_repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/resolve/main/split_files/clip_vision/sigclip_vision_patch14_384.safetensors",
    targetSubdirectory: "clip_vision",
    recommendedFilename: "sigclip_vision_patch14_384.safetensors"
  },
  "wan22_14b_nsfw:14B 高噪声模型": {
    sourceLabel: "Comfy-Org / Wan_2.2_ComfyUI_Repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors",
    targetSubdirectory: "diffusion_models",
    recommendedFilename: "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors"
  },
  "wan22_14b_nsfw:14B 低噪声模型": {
    sourceLabel: "Comfy-Org / Wan_2.2_ComfyUI_Repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors",
    targetSubdirectory: "diffusion_models",
    recommendedFilename: "wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors"
  },
  "wan22_14b_nsfw:NSFW UMT5 编码器": {
    sourceLabel: "NSFW-API / NSFW-Wan-UMT5-XXL",
    downloadUrl: "https://huggingface.co/NSFW-API/NSFW-Wan-UMT5-XXL/resolve/main/nsfw_wan_umt5-xxl_fp8_scaled.safetensors",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "nsfw_wan_umt5-xxl_fp8_scaled.safetensors"
  },
  "wan22_14b_nsfw:Wan VAE": {
    sourceLabel: "Comfy-Org / Wan_2.2_ComfyUI_Repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors",
    targetSubdirectory: "vae",
    recommendedFilename: "wan_2.1_vae.safetensors",
    notes: "Wan 2.2 14B I2V 官方工作流使用 Wan 2.1 VAE；不要与 5B 工作流的 wan2.2_vae 混用。"
  },
  "wan22_remix:Remix v3 High": {
    sourceLabel: "BigDannyPt / Wan-2.2-Remix-GGUF",
    downloadUrl: "https://huggingface.co/BigDannyPt/Wan-2.2-Remix-GGUF/resolve/main/I2V/v3.0/High/wan22RemixT2VI2V_i2vHighV30-Q5_K_M.gguf",
    targetSubdirectory: "unet",
    recommendedFilename: "wan22RemixT2VI2V_i2vHighV30-Q5_K_M.gguf"
  },
  "wan22_remix:Remix v3 Low": {
    sourceLabel: "BigDannyPt / Wan-2.2-Remix-GGUF",
    downloadUrl: "https://huggingface.co/BigDannyPt/Wan-2.2-Remix-GGUF/resolve/main/I2V/v3.0/Low/wan22RemixT2VI2V_i2vLowV30-Q5_K_M.gguf",
    targetSubdirectory: "unet",
    recommendedFilename: "wan22RemixT2VI2V_i2vLowV30-Q5_K_M.gguf"
  },
  "wan22_remix:UMT5 文本编码器": {
    sourceLabel: "Comfy-Org / Wan_2.2_ComfyUI_Repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "umt5_xxl_fp8_e4m3fn_scaled.safetensors"
  },
  "wan22_remix:Wan VAE": {
    sourceLabel: "Comfy-Org / Wan_2.2_ComfyUI_Repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors",
    targetSubdirectory: "vae",
    recommendedFilename: "wan_2.1_vae.safetensors"
  },
  "wan22_smoothmix:SmoothMix High": {
    sourceLabel: "Bedovyy / smoothMixWan22-I2V-GGUF",
    downloadUrl: "https://huggingface.co/Bedovyy/smoothMixWan22-I2V-GGUF/resolve/main/HighNoise/smoothMixWan22I2VT2V_i2vHigh-Q5_K_M.gguf",
    targetSubdirectory: "unet",
    recommendedFilename: "smoothMixWan22I2VT2V_i2vHigh-Q5_K_M.gguf"
  },
  "wan22_smoothmix:SmoothMix Low": {
    sourceLabel: "Bedovyy / smoothMixWan22-I2V-GGUF",
    downloadUrl: "https://huggingface.co/Bedovyy/smoothMixWan22-I2V-GGUF/resolve/main/LowNoise/smoothMixWan22I2VT2V_i2vLow-Q5_K_M.gguf",
    targetSubdirectory: "unet",
    recommendedFilename: "smoothMixWan22I2VT2V_i2vLow-Q5_K_M.gguf"
  },
  "wan22_smoothmix:UMT5 文本编码器": {
    sourceLabel: "Comfy-Org / Wan_2.2_ComfyUI_Repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "umt5_xxl_fp8_e4m3fn_scaled.safetensors"
  },
  "wan22_smoothmix:Wan VAE": {
    sourceLabel: "Comfy-Org / Wan_2.2_ComfyUI_Repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors",
    targetSubdirectory: "vae",
    recommendedFilename: "wan_2.1_vae.safetensors"
  },
  "wan22_dasiwa:DaSiWa v9 High": {
    sourceLabel: "darksidewalker / DaSiWa-WAN2.2-I2V",
    downloadUrl: "https://huggingface.co/darksidewalker/DaSiWa-WAN2.2-I2V/resolve/main/Distilled/GGUF/v09/DasiwaWAN22I2V14BSynthseduction_q4High.gguf",
    targetSubdirectory: "unet",
    recommendedFilename: "DasiwaWAN22I2V14BSynthseduction_q4High.gguf",
    notes: "该仓库可能要求登录 Hugging Face 并同意访问条款。"
  },
  "wan22_dasiwa:DaSiWa v9 Low": {
    sourceLabel: "darksidewalker / DaSiWa-WAN2.2-I2V",
    downloadUrl: "https://huggingface.co/darksidewalker/DaSiWa-WAN2.2-I2V/resolve/main/Distilled/GGUF/v09/DasiwaWAN22I2V14BSynthseduction_q4Low.gguf",
    targetSubdirectory: "unet",
    recommendedFilename: "DasiwaWAN22I2V14BSynthseduction_q4Low.gguf",
    notes: "High 与 Low 必须使用同一 v9、同一量化等级。"
  },
  "wan22_dasiwa:UMT5 文本编码器": {
    sourceLabel: "Comfy-Org / Wan_2.2_ComfyUI_Repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors",
    targetSubdirectory: "text_encoders",
    recommendedFilename: "umt5_xxl_fp8_e4m3fn_scaled.safetensors"
  },
  "wan22_dasiwa:Wan VAE": {
    sourceLabel: "Comfy-Org / Wan_2.2_ComfyUI_Repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors",
    targetSubdirectory: "vae",
    recommendedFilename: "wan_2.1_vae.safetensors"
  },
  "seedvr2:SeedVR2 主模型": {
    sourceLabel: "numz / SeedVR2_comfyUI",
    downloadUrl: "https://huggingface.co/numz/SeedVR2_comfyUI/resolve/main/seedvr2_ema_3b_fp8_e4m3fn.safetensors",
    targetSubdirectory: "SEEDVR2",
    recommendedFilename: "seedvr2_ema_3b_fp8_e4m3fn.safetensors",
    notes: "当前项目安装的 SeedVR2 节点固定从 models/SEEDVR2 读取权重。"
  },
  "seedvr2:SeedVR2 VAE": {
    sourceLabel: "numz / SeedVR2_comfyUI",
    downloadUrl: "https://huggingface.co/numz/SeedVR2_comfyUI/resolve/main/ema_vae_fp16.safetensors",
    targetSubdirectory: "SEEDVR2",
    recommendedFilename: "ema_vae_fp16.safetensors"
  },
  "flashvsr:FlashVSR 模型": {
    sourceLabel: "1038lab / FlashVSR",
    downloadUrl: "https://huggingface.co/1038lab/FlashVSR/resolve/main/FlashVSR1_1.safetensors",
    targetSubdirectory: "FlashVSR",
    recommendedFilename: "FlashVSR1_1.safetensors",
    notes: "FlashVSR 的 5 个权重必须放在同一个 models/FlashVSR 目录。"
  },
  "flashvsr:Wan 2.1 VAE": {
    sourceLabel: "1038lab / FlashVSR",
    downloadUrl: "https://huggingface.co/1038lab/FlashVSR/resolve/main/Wan2.1_VAE.safetensors",
    targetSubdirectory: "FlashVSR",
    recommendedFilename: "Wan2.1_VAE.safetensors"
  },
  "flashvsr:LQ Projection": {
    sourceLabel: "1038lab / FlashVSR",
    downloadUrl: "https://huggingface.co/1038lab/FlashVSR/resolve/main/LQ_proj_in.safetensors",
    targetSubdirectory: "FlashVSR",
    recommendedFilename: "LQ_proj_in.safetensors"
  },
  "flashvsr:TCDecoder": {
    sourceLabel: "1038lab / FlashVSR",
    downloadUrl: "https://huggingface.co/1038lab/FlashVSR/resolve/main/TCDecoder.safetensors",
    targetSubdirectory: "FlashVSR",
    recommendedFilename: "TCDecoder.safetensors"
  },
  "flashvsr:Prompt Embedding": {
    sourceLabel: "1038lab / FlashVSR",
    downloadUrl: "https://huggingface.co/1038lab/FlashVSR/resolve/main/Prompt.safetensors",
    targetSubdirectory: "FlashVSR",
    recommendedFilename: "Prompt.safetensors"
  },
  "hunyuan15_sr:Hunyuan 1080p SR 模型": {
    sourceLabel: "Comfy-Org / HunyuanVideo_1.5_repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/resolve/main/split_files/diffusion_models/hunyuanvideo1.5_1080p_sr_distilled_fp16.safetensors",
    targetSubdirectory: "diffusion_models",
    recommendedFilename: "hunyuanvideo1.5_1080p_sr_distilled_fp16.safetensors"
  },
  "hunyuan15_sr:Hunyuan 1080p Latent Upsampler": {
    sourceLabel: "Comfy-Org / HunyuanVideo_1.5_repackaged",
    downloadUrl: "https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/resolve/main/split_files/latent_upscale_models/hunyuanvideo15_latent_upsampler_1080p.safetensors",
    targetSubdirectory: "latent_upscale_models",
    recommendedFilename: "hunyuanvideo15_latent_upsampler_1080p.safetensors",
    notes: "该后端只适用于 HunyuanVideo 1.5 的 latent 双阶段 SR，不是通用视频放大模型。"
  },
  "realesrgan:Real-ESRGAN x4 模型": {
    sourceLabel: "Real-ESRGAN 官方 Releases",
    downloadUrl: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth",
    targetSubdirectory: "upscale_models",
    recommendedFilename: "RealESRGAN_x4plus.pth"
  },
  "rife:RIFE 4.7 插帧模型": {
    sourceLabel: "ComfyUI Frame Interpolation / RIFE",
    downloadUrl: "https://github.com/Fannovel16/ComfyUI-Frame-Interpolation/releases/download/models/rife47.pth",
    targetSubdirectory: "custom_nodes/ComfyUI-Frame-Interpolation/ckpts/rife",
    recommendedFilename: "rife47.pth",
    notes: "节点首次使用时也会自动下载；网络受限时请先在系统设置开启代理，再由本工具重启 ComfyUI。"
  }
};

function sulphurComponentsFor(
  modelProfile: Settings["ltxExtensionModelProfile"]
): ModelProfileDefinition["components"] {
  const transformer = {
    q2_distilled: {
      label: "Sulphur 2 Q2_K distilled GGUF",
      expected: "unet/sulphur-2-distilled-Q2_K.gguf",
      patterns: [/unet\/sulphur-2-distilled-q2_k\.gguf$/i]
    },
    q3_k_m: {
      label: "Sulphur 2 Q3_K_M dev GGUF",
      expected: "unet/sulphur_dev-Q3_K_M.gguf",
      patterns: [/unet\/sulphur_dev-q3_k_m\.gguf$/i]
    },
    q4_k_m: {
      label: "Sulphur 2 Q4_K_M dev GGUF",
      expected: "unet/sulphur_dev-Q4_K_M.gguf",
      patterns: [/unet\/sulphur_dev-q4_k_m\.gguf$/i]
    }
  }[modelProfile];
  const components: ModelProfileDefinition["components"] = [
    transformer,
    {
      label: "Gemma 3 文本编码器",
      expected: "text_encoders/gemma_3_12B_it_fp4_mixed.safetensors",
      patterns: [/text_encoders\/gemma_3_12b_it_fp4_mixed\.safetensors$/i]
    },
    {
      label: "LTX 2.3 文本连接器",
      expected: "text_encoders/ltx-2-3-22b-text_encoder.safetensors",
      patterns: [/text_encoders\/ltx-2-3-22b-text_encoder\.safetensors$/i]
    },
    {
      label: "LTX 2.3 视频 VAE",
      expected: "vae/ltx-2-3-22b-VAE.safetensors",
      patterns: [/vae\/ltx-2-3-22b-vae\.safetensors$/i]
    },
    {
      label: "LTX 2.3 音频 VAE",
      expected: "checkpoints/ltx-2-3-22b-audio_vae.safetensors",
      patterns: [/checkpoints\/ltx-2-3-22b-audio_vae\.safetensors$/i]
    }
  ];
  if (modelProfile !== "q2_distilled") {
    components.push({
      label: "LTX 2.3 蒸馏 LoRA",
      expected: "loras/ltx-2.3-22b-distilled-lora-1.1*",
      patterns: [/loras\/ltx-2\.3-22b-distilled-lora-1\.1.*\.safetensors$/i]
    });
  }
  components.push({
    label: "LTX 2.3 Latent Upscaler",
    expected: "latent_upscale_models/ltx-2-spatial-upscaler-x2-1.0.safetensors",
    patterns: [/latent_upscale_models\/ltx-2-spatial-upscaler-x2-1\.0\.safetensors$/i]
  });
  return components;
}

const modelProfileDefinitions: ModelProfileDefinition[] = [
  ...gemmaPromptModelDefinitions.map((model): ModelProfileDefinition => {
    const directoryPattern = escapedPattern(model.targetDirectory.replaceAll("\\", "/"));
    return {
      id: model.id,
      name: model.name,
      category: "prompt",
      managedBy: "comfyui",
      badge: model.badge,
      description: model.description,
      vram: model.vram,
      integrated: true,
      components: [
        {
          label: `${model.name} GGUF`,
          expected: `${model.targetDirectory}/${model.modelFilename}`,
          patterns: [new RegExp(`${directoryPattern}/${escapedPattern(model.modelFilename)}$`, "i")]
        },
        {
          label: `${model.name} mmproj`,
          expected: `${model.targetDirectory}/${model.mmprojFilename}`,
          patterns: [new RegExp(`${directoryPattern}/${escapedPattern(model.mmprojFilename)}$`, "i")]
        }
      ]
    };
  }),
  ...(qwenVlPeftPromptModelDefinition ? [{
    id: qwenVlPeftPromptModelDefinition.id,
    name: qwenVlPeftPromptModelDefinition.name,
    category: "prompt" as const,
    managedBy: "comfyui" as const,
    badge: qwenVlPeftPromptModelDefinition.badge,
    description: qwenVlPeftPromptModelDefinition.description,
    vram: qwenVlPeftPromptModelDefinition.vram,
    integrated: true,
    requiredCustomNodeIds: ["comfyui-qwenvl-lora"],
    runtimeNodeTypes: ["QwenVLModelLoader", "QwenVLLoRALoader", "QwenVLCaption"],
    components: [
      {
        label: "Qwen3-VL 8B 配置",
        expected: `${qwenVlPeftPromptModelDefinition.baseModelDirectory ?? "LLM/Qwen-VL/qwen3-vl-8b-instruct"}/config.json`,
        patterns: [/LLM\/Qwen-VL\/qwen3-vl-8b-instruct\/config\.json$/i],
        installGuide: installGuides[`${qwenVlPeftPromptModelDefinition.id}:Qwen3-VL 8B 配置`]
      },
      {
        label: "Qwen3-VL 8B 生成配置",
        expected: `${qwenVlPeftPromptModelDefinition.baseModelDirectory ?? "LLM/Qwen-VL/qwen3-vl-8b-instruct"}/generation_config.json`,
        patterns: [/LLM\/Qwen-VL\/qwen3-vl-8b-instruct\/generation_config\.json$/i],
        installGuide: installGuides[`${qwenVlPeftPromptModelDefinition.id}:Qwen3-VL 8B 生成配置`]
      },
      {
        label: "Qwen3-VL 8B 权重索引",
        expected: `${qwenVlPeftPromptModelDefinition.baseModelDirectory ?? "LLM/Qwen-VL/qwen3-vl-8b-instruct"}/model.safetensors.index.json`,
        patterns: [/LLM\/Qwen-VL\/qwen3-vl-8b-instruct\/model\.safetensors\.index\.json$/i],
        installGuide: installGuides[`${qwenVlPeftPromptModelDefinition.id}:Qwen3-VL 8B 权重索引`]
      },
      ...[
        ["tokenizer.json", "Qwen3-VL 8B tokenizer"],
        ["tokenizer_config.json", "Qwen3-VL 8B tokenizer 配置"],
        ["preprocessor_config.json", "Qwen3-VL 8B preprocessor"],
        ["video_preprocessor_config.json", "Qwen3-VL 8B video preprocessor"],
        ["chat_template.json", "Qwen3-VL 8B chat template"],
        ["vocab.json", "Qwen3-VL 8B vocab"]
      ].map(([filename, label]) => ({
        label,
        expected: `${qwenVlPeftPromptModelDefinition.baseModelDirectory ?? "LLM/Qwen-VL/qwen3-vl-8b-instruct"}/${filename}`,
        patterns: [new RegExp(`LLM/Qwen-VL/qwen3-vl-8b-instruct/${filename.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, "i")],
        installGuide: installGuides[`${qwenVlPeftPromptModelDefinition.id}:${label}`]
      })),
      ...[1, 2, 3, 4].map((shard) => {
        const filename = `model-${String(shard).padStart(5, "0")}-of-00004.safetensors`;
        return {
          label: `Qwen3-VL 8B 权重分片 ${shard}/4`,
          expected: `${qwenVlPeftPromptModelDefinition.baseModelDirectory ?? "LLM/Qwen-VL/qwen3-vl-8b-instruct"}/${filename}`,
          patterns: [new RegExp(`LLM/Qwen-VL/qwen3-vl-8b-instruct/${filename.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, "i")],
          installGuide: installGuides[`${qwenVlPeftPromptModelDefinition.id}:Qwen3-VL 8B 权重分片 ${shard}/4`]
        };
      }),
      {
        label: "H3 Prompt Rewriter LoRA 配置",
        expected: `${qwenVlPeftPromptModelDefinition.adapterDirectory ?? "LLM/Qwen-VL-LoRA/minimax-h3-prompt-rewriter-8b"}/adapter_config.json`,
        patterns: [/LLM\/Qwen-VL-LoRA\/minimax-h3-prompt-rewriter-8b\/adapter_config\.json$/i],
        installGuide: installGuides[`${qwenVlPeftPromptModelDefinition.id}:H3 Prompt Rewriter LoRA 配置`]
      },
      {
        label: "H3 Prompt Rewriter LoRA 权重",
        expected: `${qwenVlPeftPromptModelDefinition.adapterDirectory ?? "LLM/Qwen-VL-LoRA/minimax-h3-prompt-rewriter-8b"}/adapter_model.safetensors`,
        patterns: [/LLM\/Qwen-VL-LoRA\/minimax-h3-prompt-rewriter-8b\/adapter_model\.safetensors$/i],
        installGuide: installGuides[`${qwenVlPeftPromptModelDefinition.id}:H3 Prompt Rewriter LoRA 权重`]
      }
    // JSON metadata is prepared by the app before runtime; only large weights
    // participate in the offline “user files present” decision.
    ].filter((item) => item.expected.toLowerCase().endsWith(".safetensors"))
  }] : []),
  {
    id: "qwen/qwen3.5-4b",
    name: "Qwen3.5 4B · H3 提示词助手",
    category: "prompt",
    managedBy: "comfyui",
    badge: "BF16 · 多模态",
    description: "同时处理文字和参考图/视频，并按 H3 提示词规则生成更适合视频生成的描述。",
    vram: "BF16 · 文件约 9.3 GB",
    integrated: true,
    runtimeNodeTypes: ["CLIPLoader", "TextGenerate"],
    components: [
      {
        label: "Qwen3.5 4B ComfyUI 文本编码器",
        expected: "text_encoders/qwen3.5_4b_bf16.safetensors",
        patterns: [/text_encoders\/qwen3\.5_4b_bf16\.safetensors$/i]
      }
    ]
  },
  {
    id: "qwen/qwen3.5-2b",
    name: "Qwen3.5 2B · 快速提示词助手",
    category: "prompt",
    managedBy: "comfyui",
    badge: "BF16 · 快速",
    description: "更快的文字和参考图理解备选，适合快速迭代。",
    vram: "BF16 · 文件约 4.55 GB",
    integrated: true,
    runtimeNodeTypes: ["CLIPLoader", "TextGenerate"],
    components: [
      {
        label: "Qwen3.5 2B ComfyUI 文本编码器",
        expected: "text_encoders/qwen3.5_2b_bf16.safetensors",
        patterns: [/text_encoders\/qwen3\.5_2b_bf16\.safetensors$/i]
      }
    ]
  },
  {
    id: "qwen-image-edit-2511",
    name: "Qwen-Image-Edit-2511 · 图片处理",
    category: "image",
    managedBy: "comfyui",
    badge: "最多 3 Picture · 原生质量",
    description: "Qwen 2511 多图编辑模型；使用 CPU 文本编码器、CPU VAE 和激进 DynamicVRAM 卸载。",
    vram: "INT8 + CPU/offload · 速度较慢",
    integrated: true,
    runtimeNodeTypes: qwenImageEdit2511RequiredNodeTypes,
    components: [
      {
        label: "Qwen Image Edit 2511 扩散模型",
        expected: "diffusion_models/qwen_image_edit_2511_{bf16|int8_convrot|fp8mixed}.safetensors",
        patterns: [/diffusion_models\/qwen_image_edit_2511_(?:bf16|int8_convrot|fp8mixed)\.safetensors$/i]
      },
      {
        label: "Qwen 2.5 VL 7B 文本编码器",
        expected: "text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors",
        patterns: [/text_encoders\/qwen_2\.5_vl_7b_fp8_scaled\.safetensors$/i]
      },
      {
        label: "Qwen Image VAE",
        expected: "vae/qwen_image_vae.safetensors",
        patterns: [/vae\/qwen_image_vae\.safetensors$/i]
      },
      {
        label: "Qwen Image Edit 2511 Lightning LoRA（可选）",
        expected: "loras/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors",
        patterns: [/loras\/Qwen-Image-Edit-2511-Lightning-4steps-V1\.0-bf16\.safetensors$/i],
        optional: true
      }
    ]
  },
  {
    id: "flux2-klein-4b",
    name: "FLUX.2 Klein 4B · 图片处理",
    category: "image",
    managedBy: "comfyui",
    badge: "FP8 · 单图编辑",
    description: "Black Forest Labs 的轻量图片生成/编辑模型；初版按官方 ComfyUI blueprint 接入单图编辑。",
    vram: "FP8 · 单图编辑",
    integrated: true,
    runtimeNodeTypes: flux2Klein4bRequiredNodeTypes,
    components: [
      {
        label: "FLUX.2 Klein 4B FP8 扩散模型",
        expected: "diffusion_models/flux-2-klein-base-4b-fp8.safetensors",
        patterns: [/diffusion_models\/flux-2-klein-base-4b-fp8\.safetensors$/i]
      },
      {
        label: "Qwen3 4B FLUX.2 文本编码器",
        expected: "text_encoders/qwen_3_4b.safetensors",
        patterns: [/text_encoders\/qwen_3_4b\.safetensors$/i]
      },
      {
        label: "FLUX.2 VAE",
        expected: "vae/flux2-vae.safetensors",
        patterns: [/vae\/flux2-vae\.safetensors$/i]
      }
    ]
  },
  {
    id: "minimax_h3_fl2va",
    name: "MiniMax H3 FL2VA · 首帧 / 首尾帧",
    category: "video",
    badge: "FL2VA · 原生音视频",
    description: "只接入首帧或首尾帧图生视频，原生 24 FPS 同步立体声音频。",
    vram: "pruned INT8 · DynamicVRAM · 阶段卸载",
    integrated: true,
    components: [
      {
        label: "MiniMax H3 FL2VA INT8 模型",
        expected: "diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors",
        patterns: [/(?:diffusion_models|unet)\/minimax_h3_fl2va_pruned_int8_convrot\.safetensors$/i]
      },
      {
        label: "Qwen3-VL 32B H3 文本编码器",
        expected: "text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
        patterns: [/text_encoders\/qwen3vl_32b_minimax_h3_nvfp4_awq\.safetensors$/i]
      },
      {
        label: "MiniMax H3 视频 VAE",
        expected: "vae/minimax_h3_video_vae_fp16.safetensors",
        patterns: [/vae\/minimax_h3_video_vae_fp16\.safetensors$/i]
      },
      {
        label: "MiniMax H3 音频 VAE",
        expected: "vae/minimax_h3_audio_vae_fp32.safetensors",
        patterns: [/vae\/minimax_h3_audio_vae_fp32\.safetensors$/i]
      }
    ]
  },
  {
    id: "minimax_h3_fl2va_int4",
    name: "MiniMax H3 FL2VA · INT4 低显存",
    category: "video",
    badge: "INT4 · 压缩",
    description: "社区 pruned INT4 ConvRot 档，复用 H3 原生音视频节点。",
    vram: "pruned INT4 · RAM offload",
    integrated: true,
    components: [
      {
        label: "MiniMax H3 FL2VA INT4 ConvRot 模型",
        expected: "diffusion_models/minimax_h3_fl2va_pruned_int4_convrot.safetensors",
        patterns: [/(?:diffusion_models|unet)\/minimax_h3_fl2va_pruned_int4_convrot\.safetensors$/i]
      },
      {
        label: "Qwen3-VL 32B H3 INT4 文本编码器",
        expected: "text_encoders/qwen3vl_32b_minimax_h3_int4_convrot.safetensors",
        patterns: [/text_encoders\/qwen3vl_32b_minimax_h3_int4_convrot\.safetensors$/i]
      },
      {
        label: "MiniMax H3 视频 VAE",
        expected: "vae/minimax_h3_video_vae_fp16.safetensors",
        patterns: [/vae\/minimax_h3_video_vae_fp16\.safetensors$/i]
      },
      {
        label: "MiniMax H3 音频 VAE",
        expected: "vae/minimax_h3_audio_vae_fp32.safetensors",
        patterns: [/vae\/minimax_h3_audio_vae_fp32\.safetensors$/i]
      }
    ]
  },
  {
    id: "minimax_h3_fl2va_q3_gguf",
    name: "MiniMax H3 FL2VA · Q3 GGUF · 低显存实验",
    category: "video",
    managedBy: "comfyui",
    badge: "Q3 GGUF · 实验",
    description: "Unsloth 社区 Q3 GGUF 档，面向 480p/短片实验；必须使用独立 H3 GGUF 节点包、CPU 文本编码器和 RAM offload，不支持视频续写。",
    vram: "Q3 GGUF · CPU 文本编码器 · RAM offload",
    integrated: true,
    requiredCustomNodeIds: ["comfyui-gguf-h3"],
    runtimeNodeTypes: ["H3UnetLoaderGGUFAdvanced", "H3CLIPLoaderGGUF", "MiniMaxH3ImageToVideo"],
    components: [
      {
        label: "MiniMax H3 FL2VA Q3 GGUF 扩散模型",
        expected: "unet/minimax_h3_fl2va_pruned-Q3_K.gguf",
        patterns: [/unet\/minimax_h3_fl2va_pruned-Q3_K\.gguf$/i]
      },
      {
        label: "Qwen3-VL 32B H3 Q2 GGUF 文本编码器",
        expected: "text_encoders/qwen3vl_32b_minimax_h3-Q2_K_M.gguf",
        patterns: [/text_encoders\/qwen3vl_32b_minimax_h3-Q2_K_M\.gguf$/i]
      },
      {
        label: "MiniMax H3 视频 VAE",
        expected: "vae/minimax_h3_video_vae_fp16.safetensors",
        patterns: [/vae\/minimax_h3_video_vae_fp16\.safetensors$/i]
      },
      {
        label: "MiniMax H3 音频 VAE",
        expected: "vae/minimax_h3_audio_vae_fp32.safetensors",
        patterns: [/vae\/minimax_h3_audio_vae_fp32\.safetensors$/i]
      }
    ]
  },
  {
    id: "minimax-h3-lightx2v-turbo-4step",
    name: "LightX2V Turbo 4-Step",
    category: "lora",
    badge: "H3 专属 · 性能",
    description: "MiniMax H3 FL2VA 的蒸馏 LoRA，把约 20 步采样压缩到 6–8 步；不会降低基础模型的显存需求。",
    vram: "LoRA · strength 0.75 · 4–8 steps",
    integrated: true,
    components: [
      {
        label: "MiniMax H3 LightX2V Turbo LoRA",
        expected: "loras/minimax_h3_fl2v_lightx2v_turbo_4step_v0.1_comfy_resized_avg_rank_21_bf16.safetensors",
        patterns: [/loras\/minimax_h3_fl2v_lightx2v_turbo_4step_v0\.1_comfy_resized_avg_rank_21_bf16\.safetensors$/i]
      }
    ]
  },
  {
    id: "minimax-h3-pink-fluffy-bunny-nsfw",
    name: "PinkFluffyBunny NSFW",
    category: "lora",
    badge: "H3 专属 · NSFW",
    description: "MiniMax H3 FL2VA pruned 底模的社区 NSFW 内容 LoRA，可与性能 LoRA 按顺序叠加。",
    vram: "pruned v1 · rank 128 · strength 0.5",
    integrated: true,
    components: [
      {
        label: "PinkFluffyBunny NSFW LoRA",
        expected: "loras/PinkFluffyBunny-pruned-v1-rank128.safetensors",
        patterns: [
          /loras\/PinkFluffyBunny-pruned-v1-rank128\.safetensors$/i,
          /loras\/PinkCherry[_-]PinkFluffyBunny-v1-rank128\.safetensors$/i
        ]
      }
    ]
  },
  {
    id: "minimax_h3_ref2va",
    name: "MiniMax H3 R2V · 多参考 INT8",
    category: "video",
    badge: "R2V · 多参考",
    description: "官方 Ref2VA 多参考档，当前支持最多 9 张图片参考；参考数量越多越需要系统内存。",
    vram: "pruned INT8 · DynamicVRAM · 多参考",
    integrated: true,
    components: [
      {
        label: "MiniMax H3 Ref2VA INT8 模型",
        expected: "diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors",
        patterns: [/(?:diffusion_models|unet)\/minimax_h3_ref2va_pruned_int8_convrot\.safetensors$/i]
      },
      {
        label: "Qwen3-VL 32B H3 文本编码器",
        expected: "text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
        patterns: [/text_encoders\/qwen3vl_32b_minimax_h3_nvfp4_awq\.safetensors$/i]
      },
      {
        label: "MiniMax H3 视频 VAE",
        expected: "vae/minimax_h3_video_vae_fp16.safetensors",
        patterns: [/vae\/minimax_h3_video_vae_fp16\.safetensors$/i]
      },
      {
        label: "MiniMax H3 音频 VAE",
        expected: "vae/minimax_h3_audio_vae_fp32.safetensors",
        patterns: [/vae\/minimax_h3_audio_vae_fp32\.safetensors$/i]
      }
    ]
  },
  {
    id: "minimax_h3_ref2va_int4",
    name: "MiniMax H3 R2V · 多参考 INT4",
    category: "video",
    badge: "R2V · INT4 · 压缩",
    description: "社区 Ref2VA INT4 ConvRot 档，支持多张图片参考。",
    vram: "pruned INT4 · RAM offload · 多参考",
    integrated: true,
    components: [
      {
        label: "MiniMax H3 Ref2VA INT4 ConvRot 模型",
        expected: "diffusion_models/minimax_h3_ref2va_pruned_int4_convrot.safetensors",
        patterns: [/(?:diffusion_models|unet)\/minimax_h3_ref2va_pruned_int4_convrot\.safetensors$/i]
      },
      {
        label: "Qwen3-VL 32B H3 INT4 文本编码器",
        expected: "text_encoders/qwen3vl_32b_minimax_h3_int4_convrot.safetensors",
        patterns: [/text_encoders\/qwen3vl_32b_minimax_h3_int4_convrot\.safetensors$/i]
      },
      {
        label: "MiniMax H3 视频 VAE",
        expected: "vae/minimax_h3_video_vae_fp16.safetensors",
        patterns: [/vae\/minimax_h3_video_vae_fp16\.safetensors$/i]
      },
      {
        label: "MiniMax H3 音频 VAE",
        expected: "vae/minimax_h3_audio_vae_fp32.safetensors",
        patterns: [/vae\/minimax_h3_audio_vae_fp32\.safetensors$/i]
      }
    ]
  },
  {
    id: "sulphur2",
    name: "Sulphur 2 GGUF",
    category: "video",
    badge: "GGUF · 分阶段",
    description: "I2V 与原生 Extend 共用分离式 GGUF 部署。",
    vram: "Q3 默认 · CPU offload · 独立 VAE",
    components: sulphurComponentsFor("q3_k_m")
  },
  {
    id: "wan22_5b",
    name: "Wan 2.2 I2V 5B",
    category: "video",
    badge: "快速草稿",
    description: "适合 480p/540p 快速草稿和本机联调。",
    vram: "预计峰值 14–18 GB",
    components: [
      {
        label: "Wan 2.2 5B 扩散模型",
        expected: "wan2.2_*i2v/ti2v*_5B",
        patterns: [/wan2\.?2.*(?:i2v|ti2v).*5b.*\.(safetensors|gguf)$/i]
      },
      {
        label: "UMT5 文本编码器",
        expected: "text_encoders/umt5*",
        patterns: [/text_encoders\/.*umt5.*\.(safetensors|gguf)$/i]
      },
      {
        label: "Wan VAE",
        expected: "vae/wan*vae*",
        patterns: [/vae\/.*wan.*vae.*\.(safetensors|pt|ckpt)$/i]
      }
    ]
  },
  {
    id: "hunyuan15",
    name: "HunyuanVideo 1.5 I2V",
    category: "video",
    badge: "质量",
    description: "质量优先，默认启用 VAE 分块和 CPU 卸载。",
    vram: "预计峰值 21–23 GB",
    components: [
      {
        label: "HunyuanVideo 1.5 I2V 模型",
        expected: "hunyuanvideo1.5_*i2v*",
        patterns: [/hunyuanvideo1\.?5.*i2v.*\.(safetensors|gguf)$/i]
      },
      {
        label: "HunyuanVideo 1.5 VAE",
        expected: "vae/hunyuanvideo15_vae*",
        patterns: [/vae\/.*hunyuanvideo1?5.*vae.*\.(safetensors|pt|ckpt)$/i]
      },
      {
        label: "Qwen 2.5 VL 7B 文本编码器",
        expected: "text_encoders/qwen_2.5_vl_7b*",
        patterns: [/text_encoders\/.*qwen[_ .-]?2\.?5[_ .-]?vl[_ .-]?7b.*\.(safetensors|gguf)$/i]
      },
      {
        label: "ByT5 文本编码器",
        expected: "text_encoders/byt5_small_glyphxl*",
        patterns: [/text_encoders\/.*byt5[_ .-]?small[_ .-]?glyphxl.*\.(safetensors|gguf)$/i]
      },
      {
        label: "SigCLIP 视觉编码器",
        expected: "clip_vision/sigclip_vision_patch14_384*",
        patterns: [/clip_vision\/.*sigclip[_ .-]?vision[_ .-]?patch14[_ .-]?384.*\.(safetensors|gguf)$/i]
      }
    ]
  },
  {
    id: "wan22_14b_nsfw",
    name: "Wan 2.2 I2V 14B + NSFW",
    category: "video",
    badge: "无审查",
    description: "需要高/低噪声模型及无审查文本编码器完整匹配。",
    vram: "建议 FP8 分块与保守卸载",
    components: [
      {
        label: "14B 高噪声模型",
        expected: "wan2.2*i2v*high*14B*",
        patterns: [/wan2\.?2.*i2v.*high.*14b.*\.(safetensors|gguf)$/i]
      },
      {
        label: "14B 低噪声模型",
        expected: "wan2.2*i2v*low*14B*",
        patterns: [/wan2\.?2.*i2v.*low.*14b.*\.(safetensors|gguf)$/i]
      },
      {
        label: "NSFW UMT5 编码器",
        expected: "text_encoders/nsfw*umt5*",
        patterns: [/text_encoders\/.*nsfw.*umt5.*\.(safetensors|gguf)$/i]
      },
      {
        label: "Wan VAE",
        expected: "vae/wan_2.1_vae*",
        patterns: [/vae\/.*wan[_ .-]?2\.?1[_ .-]?vae.*\.(safetensors|pt|ckpt)$/i]
      }
    ]
  },
  {
    id: "wan22_remix",
    name: "Wan 2.2 Remix v3",
    category: "video",
    badge: "合并模型",
    description: "需要 Remix v3 High/Low 两阶段文件成对存在。",
    vram: "推荐 Q5_K_M · 保守卸载",
    components: [
      {
        label: "Remix v3 High",
        expected: "wan22Remix*High*V30*",
        patterns: [/wan22remix.*high.*v?3(?:\.0|0)?.*\.(safetensors|gguf)$/i]
      },
      {
        label: "Remix v3 Low",
        expected: "wan22Remix*Low*V30*",
        patterns: [/wan22remix.*low.*v?3(?:\.0|0)?.*\.(safetensors|gguf)$/i]
      },
      {
        label: "UMT5 文本编码器",
        expected: "text_encoders/*umt5*",
        patterns: [/text_encoders\/.*umt5.*\.(safetensors|gguf)$/i]
      },
      {
        label: "Wan VAE",
        expected: "vae/wan_2.1_vae*",
        patterns: [/vae\/.*wan[_ .-]?2\.?1[_ .-]?vae.*\.(safetensors|pt|ckpt)$/i]
      }
    ]
  },
  {
    id: "wan22_smoothmix",
    name: "Wan 2.2 SmoothMix I2V",
    category: "video",
    badge: "写实合并模型",
    description: "SmoothMix High/Low 两阶段模型，偏写实人物与自然运动。",
    vram: "推荐 Q5_K_M · 约 20–23 GB",
    components: [
      {
        label: "SmoothMix High",
        expected: "smoothMixWan22*High*Q5_K_M",
        patterns: [/smoothmixwan22.*high.*\.(safetensors|gguf)$/i]
      },
      {
        label: "SmoothMix Low",
        expected: "smoothMixWan22*Low*Q5_K_M",
        patterns: [/smoothmixwan22.*low.*\.(safetensors|gguf)$/i]
      },
      {
        label: "UMT5 文本编码器",
        expected: "text_encoders/*umt5*",
        patterns: [/text_encoders\/.*umt5.*\.(safetensors|gguf)$/i]
      },
      {
        label: "Wan VAE",
        expected: "vae/wan_2.1_vae*",
        patterns: [/vae\/.*wan[_ .-]?2\.?1[_ .-]?vae.*\.(safetensors|pt|ckpt)$/i]
      }
    ]
  },
  {
    id: "wan22_dasiwa",
    name: "DaSiWa SynthSeduction v9",
    category: "video",
    badge: "专用合并模型",
    description: "DaSiWa v9 High/Low 成对工作，偏写实人物与自然运动。",
    vram: "Q4 · 约 19–22 GB",
    components: [
      {
        label: "DaSiWa v9 High",
        expected: "Dasiwa*Synthseduction*q4High",
        patterns: [/dasiwa.*synthseduction.*high.*\.(safetensors|gguf)$/i]
      },
      {
        label: "DaSiWa v9 Low",
        expected: "Dasiwa*Synthseduction*q4Low",
        patterns: [/dasiwa.*synthseduction.*low.*\.(safetensors|gguf)$/i]
      },
      {
        label: "UMT5 文本编码器",
        expected: "text_encoders/*umt5*",
        patterns: [/text_encoders\/.*umt5.*\.(safetensors|gguf)$/i]
      },
      {
        label: "Wan VAE",
        expected: "vae/wan_2.1_vae*",
        patterns: [/vae\/.*wan[_ .-]?2\.?1[_ .-]?vae.*\.(safetensors|pt|ckpt)$/i]
      }
    ]
  },
  {
    id: "seedvr2",
    name: "SeedVR2",
    category: "upscale",
    badge: "推荐",
    description: "视频时间一致性优先，适合人物和真实画面。",
    vram: "预计峰值 18–23 GB",
    components: [
      {
        label: "SeedVR2 主模型",
        expected: "SEEDVR2/seedvr2_ema_3b 或 7b",
        patterns: [/(?:^|\/)seedvr2\/.*seedvr2_ema_(?:3b|7b).*\.(safetensors|pt)$/i]
      },
      {
        label: "SeedVR2 VAE",
        expected: "SEEDVR2/ema_vae*",
        patterns: [/seedvr2\/.*ema_vae.*\.(safetensors|pt)$/i]
      }
    ]
  },
  {
    id: "flashvsr",
    name: "FlashVSR",
    category: "upscale",
    badge: "平衡",
    description: "质量、速度和时间一致性的平衡选择。",
    vram: "预计峰值 14–19 GB",
    components: [
      {
        label: "FlashVSR 模型",
        expected: "FlashVSR/FlashVSR1_1.safetensors",
        patterns: [/flashvsr\/flashvsr1_1\.safetensors$/i]
      },
      {
        label: "Wan 2.1 VAE",
        expected: "FlashVSR/Wan2.1_VAE.safetensors",
        patterns: [/flashvsr\/wan2\.1_vae\.safetensors$/i]
      },
      {
        label: "LQ Projection",
        expected: "FlashVSR/LQ_proj_in.safetensors",
        patterns: [/flashvsr\/lq_proj_in\.safetensors$/i]
      },
      {
        label: "TCDecoder",
        expected: "FlashVSR/TCDecoder.safetensors",
        patterns: [/flashvsr\/tcdecoder\.safetensors$/i]
      },
      {
        label: "Prompt Embedding",
        expected: "FlashVSR/Prompt.safetensors",
        patterns: [/flashvsr\/prompt\.safetensors$/i]
      }
    ]
  },
  {
    id: "hunyuan15_sr",
    name: "HunyuanVideo 1.5 I2V + 1080p SR",
    category: "video",
    badge: "双阶段 1080p",
    description: "先生成 720p latent，再使用官方 8 步 SR 分支输出 1080p。",
    vram: "双阶段工作流 · 模型间卸载",
    components: [
      {
        label: "HunyuanVideo 1.5 I2V 模型",
        expected: "hunyuanvideo1.5_*i2v*",
        patterns: [/hunyuanvideo1\.?5.*i2v.*\.(safetensors|gguf)$/i]
      },
      {
        label: "HunyuanVideo 1.5 VAE",
        expected: "vae/hunyuanvideo15_vae*",
        patterns: [/vae\/.*hunyuanvideo1?5.*vae.*\.(safetensors|pt|ckpt)$/i]
      },
      {
        label: "Qwen 2.5 VL 7B 文本编码器",
        expected: "text_encoders/qwen_2.5_vl_7b*",
        patterns: [/text_encoders\/.*qwen[_ .-]?2\.?5[_ .-]?vl[_ .-]?7b.*\.(safetensors|gguf)$/i]
      },
      {
        label: "ByT5 文本编码器",
        expected: "text_encoders/byt5_small_glyphxl*",
        patterns: [/text_encoders\/.*byt5[_ .-]?small[_ .-]?glyphxl.*\.(safetensors|gguf)$/i]
      },
      {
        label: "SigCLIP 视觉编码器",
        expected: "clip_vision/sigclip_vision_patch14_384*",
        patterns: [/clip_vision\/.*sigclip[_ .-]?vision[_ .-]?patch14[_ .-]?384.*\.(safetensors|gguf)$/i]
      },
      {
        label: "Hunyuan 1080p SR 模型",
        expected: "diffusion_models/hunyuanvideo1.5_1080p_sr*",
        patterns: [/(?:diffusion_models|unet)\/hunyuanvideo1\.5_1080p_sr.*\.(safetensors|gguf)$/i]
      },
      {
        label: "Hunyuan 1080p Latent Upsampler",
        expected: "latent_upscale_models/hunyuanvideo15_latent_upsampler_1080p*",
        patterns: [/latent_upscale_models\/hunyuanvideo15_latent_upsampler_1080p.*\.safetensors$/i]
      }
    ]
  },
  {
    id: "realesrgan",
    name: "Real-ESRGAN x4plus",
    category: "upscale",
    badge: "快速",
    description: "占用较低，适合快速检查和非人像内容。",
    vram: "预计峰值 6–9 GB",
    components: [
      {
        label: "Real-ESRGAN x4 模型",
        expected: "upscale_models/RealESRGAN*x4*",
        patterns: [/upscale_models\/.*realesrgan.*x4.*\.(safetensors|pth|pt)$/i]
      }
    ]
  },
  {
    id: "rife",
    name: "RIFE Frame Interpolation",
    category: "interpolation",
    badge: "插帧",
    description: "将较少的生成帧插值到目标 FPS，降低视频大模型和 VAE 的总体压力。",
    vram: "BF16 · 单帧批次 · 逐帧清缓存",
    components: [
      {
        label: "RIFE 4.7 插帧模型",
        expected: "ComfyUI-Frame-Interpolation/ckpts/rife/rife47.pth",
        patterns: [/frame_interpolation\/rife47\.pth$/i]
      }
    ]
  }
];

function catalogModelProfileDefinitionsFor(
  ltxModelProfile: Settings["ltxExtensionModelProfile"]
): ModelProfileDefinition[] {
  return [...modelCatalog.entries]
    .sort((left, right) => right.definition.order - left.definition.order)
    .flatMap((entry) => {
  const scan = entry.definition.scanVariants?.[ltxModelProfile] ?? entry.definition.scan;
  if (!scan) return [];
  const locale = modelCatalog.localized(entry.definition.id, "zh-CN");
  return [{
    id: entry.definition.id,
    name: locale?.name ?? entry.definition.id,
    category: entry.definition.category,
    managedBy: scan.managedBy,
    badge: locale?.badge ?? "",
    description: locale?.description ?? "",
    vram: scan.vram,
    integrated: scan.integrated,
    requiredCustomNodeIds: scan.requiredCustomNodeIds,
    runtimeNodeTypes: scan.runtimeNodeTypes,
    components: scan.components.map((component) => ({
      label: component.label,
      expected: component.expected,
      patterns: [...component.patterns],
      ...(component.optional ? { optional: true } : {}),
      installGuide: component.installGuide
    }))
  } satisfies ModelProfileDefinition];
    });
}

export function evaluateModelProfiles(
  modelFiles: string[],
  ltxModelProfile: Settings["ltxExtensionModelProfile"] = "q3_k_m",
  runtimeNodeIds?: ReadonlySet<string>
): ModelScanProfile[] {
  const normalizedFiles = modelFiles.map((filename) =>
    filename.replaceAll("\\", "/")
  );
  const catalogModelProfileDefinitions = catalogModelProfileDefinitionsFor(ltxModelProfile);
  const catalogModelProfileIds = new Set(catalogModelProfileDefinitions.map((profile) => profile.id));
  return [
    ...modelProfileDefinitions.filter((profile) => !catalogModelProfileIds.has(profile.id)),
    ...catalogModelProfileDefinitions
  ]
    .filter((profile) => !isRetiredVideoModel(profile.id))
    .map((baseProfile) => {
    const profile = baseProfile.id === "sulphur2"
      ? { ...baseProfile, name: `Sulphur 2 ${ltxModelProfile.replaceAll("_", " ").toUpperCase()}` }
      : baseProfile;
    const components = profile.components.map((component) => {
      const matches = normalizedFiles.filter((filename) =>
        component.patterns.some((pattern) => pattern.test(filename))
      );
      return {
        label: component.label,
        found: matches.length > 0,
        ...(component.optional ? { optional: true } : {}),
        expected: component.expected,
        matches,
        installGuide: component.installGuide ??
          installGuides[`${profile.id}:${component.label}`] ??
          installGuides[`minimax_h3_fl2va:${component.label}`] ??
          installGuides[`hunyuan15:${component.label}`]
      };
    });
    const runtimeMissingNodes = profile.runtimeNodeTypes && runtimeNodeIds
      ? profile.runtimeNodeTypes.filter((nodeType) => !runtimeNodeIds.has(nodeType))
      : [];
    return {
      id: profile.id,
      name: profile.name,
      category: profile.category,
      managedBy: profile.managedBy,
      badge: profile.badge,
      description: profile.description,
      vram: profile.vram,
      available: components.every((component) => component.found || component.optional === true),
      integrated: profile.integrated !== false,
      ...(profile.requiredCustomNodeIds?.length
        ? { requiredCustomNodeIds: [...profile.requiredCustomNodeIds] }
        : {}),
      ...(profile.runtimeNodeTypes
        ? {
            runtimeVerified: runtimeNodeIds !== undefined,
            runtimeReady: runtimeNodeIds !== undefined && runtimeMissingNodes.length === 0,
            runtimeMissingNodes
          }
        : {}),
      components
    };
    });
}

async function exists(filename: string): Promise<boolean> {
  return Boolean(await fs.stat(filename).catch(() => null));
}

const RETRYABLE_RENAME_ERRORS = new Set(["EACCES", "EBUSY", "ENOTEMPTY", "EPERM"]);

interface RenameRetryOptions {
  attempts?: number;
  retryDelayMs?: number;
  rename?: (source: string, destination: string) => Promise<void>;
  wait?: (milliseconds: number) => Promise<void>;
}

function retryableRenameError(error: unknown): boolean {
  return (
    error instanceof Error &&
    RETRYABLE_RENAME_ERRORS.has((error as NodeJS.ErrnoException).code ?? "")
  );
}

export async function renameWithRetry(
  source: string,
  destination: string,
  options: RenameRetryOptions = {}
): Promise<void> {
  const attempts = Math.max(1, options.attempts ?? 8);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 150);
  const rename = options.rename ?? fs.rename;
  const wait =
    options.wait ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      if (!retryableRenameError(error) || attempt === attempts) throw error;
      await wait(retryDelayMs * attempt);
    }
  }
}

async function listModelFiles(modelDirectory: string): Promise<string[]> {
  if (!modelDirectory || !(await exists(modelDirectory))) return [];
  const files: string[] = [];
  const pending = [modelDirectory];
  while (pending.length > 0 && files.length < 20_000) {
    const current = pending.pop()!;
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const filename = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(filename);
      else if (entry.isFile()) files.push(path.relative(modelDirectory, filename));
    }
  }
  return files;
}

function appManagedLlamaServerDirectory(): string {
  const localAppData =
    process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
  return path.join(localAppData, "Local Video Studio", "llama-server");
}

async function findFile(root: string, basename: string): Promise<string> {
  if (!root || !(await exists(root))) return "";
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop()!;
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const filename = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(filename);
      else if (entry.isFile() && entry.name.toLowerCase() === basename.toLowerCase()) {
        return filename;
      }
    }
  }
  return "";
}

async function findFileMatching(
  root: string,
  predicate: (basename: string) => boolean
): Promise<string> {
  if (!root || !(await exists(root))) return "";
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop()!;
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const filename = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(filename);
      else if (entry.isFile() && predicate(entry.name)) return filename;
    }
  }
  return "";
}

function llamaServerStatus(
  executablePath: string,
  source: LlamaServerStatus["source"]
): LlamaServerStatus {
  return {
    found: Boolean(executablePath),
    path: executablePath,
    directory: executablePath ? path.dirname(executablePath) : "",
    source
  };
}

export async function scanLlamaServer(
  settings: Pick<Settings, "promptLlamaServerPath" | "promptModelDirectory" | "modelDirectory">,
  comfyRoot = ""
): Promise<LlamaServerStatus> {
  const configured = settings.promptLlamaServerPath.trim();
  const configuredStat = configured
    ? await fs.stat(configured).catch(() => null)
    : null;
  if (configuredStat?.isFile()) {
    return llamaServerStatus(path.resolve(configured), "configured");
  }

  const promptDirectories = [
    settings.promptModelDirectory.trim(),
    settings.modelDirectory.trim()
      ? path.join(settings.modelDirectory.trim(), "prompt_models")
      : "",
    comfyRoot ? path.join(comfyRoot, "models", "prompt_models") : ""
  ].filter(Boolean);
  for (const directory of promptDirectories) {
    const executable = await findFile(path.resolve(directory), "llama-server.exe");
    if (executable) return llamaServerStatus(executable, "prompt-models");
  }

  const managed = await findFile(appManagedLlamaServerDirectory(), "llama-server.exe");
  if (managed) return llamaServerStatus(managed, "app-managed");

  const fromPath = await findExecutable("llama-server.exe");
  return fromPath ? llamaServerStatus(fromPath, "path") : llamaServerStatus("", "");
}

export async function downloadFileWithCurl(
  url: string,
  destination: string,
  settings: Settings
): Promise<void> {
  const curl = await findExecutable("curl.exe");
  if (!curl) throw new Error("没有找到 curl，无法自动下载资源。请安装 Windows 10/11 自带 curl，或检查网络后重试。" );
  const args = ["-fL", "--retry", "2", "--connect-timeout", "20", url, "--output", destination];
  if (settings.proxyEnabled) {
    args.splice(1, 0, "--proxy", normalizeProxyUrl(settings.proxyUrl));
  }
  await execFileAsync(curl, args, {
    encoding: "utf8",
    timeout: 600_000,
    windowsHide: true,
    env: downloadEnvironment(settings)
  });
}

async function expandZipArchive(archive: string, destination: string): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("llama-server 一键安装目前只支持 Windows。" );
  }
  const script =
    "& { param([string]$archive, [string]$destination); Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force }";
  await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
    archive,
    destination
  ], {
    encoding: "utf8",
    timeout: 300_000,
    windowsHide: true
  });
}

async function copyDirectoryContents(source: string, destination: string): Promise<void> {
  const entries = await fs.readdir(source, { withFileTypes: true });
  await fs.mkdir(destination, { recursive: true });
  for (const entry of entries) {
    await fs.cp(
      path.join(source, entry.name),
      path.join(destination, entry.name),
      { recursive: true, force: true }
    );
  }
}

interface LlamaReleaseAsset {
  name?: string;
  browser_download_url?: string;
}

export function selectLlamaServerReleaseAssets(
  release: { assets?: LlamaReleaseAsset[] }
): { variant: string; binaryUrl: string; cudartUrl: string } | null {
  const assets = release.assets ?? [];
  for (const variant of llamaServerCudaVariants) {
    const binaryAsset = assets.find((asset) =>
      asset.name?.match(new RegExp(`^llama-b[^/]+-bin-win-cuda-${variant.replace(".", "\\.")}-x64\\.zip$`))
    );
    const cudartAsset = assets.find((asset) =>
      asset.name === `cudart-llama-bin-win-cuda-${variant}-x64.zip`
    );
    if (
      binaryAsset?.browser_download_url &&
      cudartAsset?.browser_download_url
    ) {
      return {
        variant,
        binaryUrl: binaryAsset.browser_download_url,
        cudartUrl: cudartAsset.browser_download_url
      };
    }
  }
  return null;
}

export async function installLlamaServer(
  settings: Settings
): Promise<ConnectionResult> {
  if (process.platform !== "win32") {
    return { ok: false, message: "llama-server 一键安装目前只支持 Windows。" };
  }
  const installLog = [proxyLogLabel(settings)];
  const temporaryRoot = path.join(
    os.tmpdir(),
    `local-video-studio-llama-${crypto.randomUUID()}`
  );
  let installedDirectory = "";
  let installationSucceeded = false;
  try {
    await fs.mkdir(temporaryRoot, { recursive: true });
    const releaseJson = path.join(temporaryRoot, "release.json");
    await downloadFileWithCurl(llamaServerReleaseApiUrl, releaseJson, settings);
    const release = JSON.parse(await fs.readFile(releaseJson, "utf8")) as {
      tag_name?: string;
      assets?: LlamaReleaseAsset[];
    };
    const selected = selectLlamaServerReleaseAssets(release);
    if (!selected) {
      throw new Error("官方最新版本没有找到 Windows x64 CUDA 12.4/13.3 发布包。" );
    }
    installLog.push(`准备安装 llama.cpp ${release.tag_name ?? "latest"} · CUDA ${selected.variant}`);
    const binaryArchive = path.join(temporaryRoot, "llama-server.zip");
    const cudartArchive = path.join(temporaryRoot, "cudart.zip");
    await downloadFileWithCurl(selected.binaryUrl, binaryArchive, settings);
    await downloadFileWithCurl(selected.cudartUrl, cudartArchive, settings);
    const binaryExtract = path.join(temporaryRoot, "binary");
    const cudartExtract = path.join(temporaryRoot, "cudart");
    await expandZipArchive(binaryArchive, binaryExtract);
    await expandZipArchive(cudartArchive, cudartExtract);
    const sourceExecutable = await findFile(binaryExtract, "llama-server.exe");
    if (!sourceExecutable) throw new Error("下载包中没有找到 llama-server.exe。" );
    const sourceCudart = await findFileMatching(
      cudartExtract,
      (basename) => /^cudart64.*\.dll$/i.test(basename)
    );
    const releaseDirectory = (release.tag_name || `latest-${Date.now()}`)
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    const targetDirectory = path.join(
      appManagedLlamaServerDirectory(),
      `${releaseDirectory}-${crypto.randomUUID()}`
    );
    installedDirectory = targetDirectory;
    await fs.mkdir(targetDirectory, { recursive: true });
    await copyDirectoryContents(path.dirname(sourceExecutable), targetDirectory);
    if (sourceCudart) await copyDirectoryContents(path.dirname(sourceCudart), targetDirectory);
    const installedExecutable = path.join(targetDirectory, "llama-server.exe");
    if (!(await exists(installedExecutable))) {
      throw new Error("llama-server.exe 安装后没有出现在目标目录。" );
    }
    try {
      await execFileAsync(installedExecutable, ["--version"], {
        encoding: "utf8",
        timeout: 10_000,
        windowsHide: true
      });
    } catch (error) {
      throw new Error(
        `llama-server 已解压，但无法启动验证：${error instanceof Error ? error.message : String(error)}`
      );
    }
    installLog.push(`已安装：${installedExecutable}`);
    installationSucceeded = true;
    return {
      ok: true,
      message: "llama-server 已自动安装并完成启动检查。",
      log: installLog.join("\n\n"),
      executablePath: installedExecutable
    };
  } catch (error) {
    installLog.push(error instanceof Error ? error.message : String(error));
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      log: installLog.join("\n\n")
    };
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true }).catch(() => undefined);
    if (!installationSucceeded && installedDirectory) {
      await fs.rm(installedDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}


export function shouldReportComfyDatabaseIssue(input: {
  logContent: string;
  logModifiedAt: number;
  databaseModifiedAt: number;
  serviceReachable: boolean;
  now?: number;
}): boolean {
  if (input.serviceReachable || !input.logContent || !input.logModifiedAt) return false;
  const now = input.now ?? Date.now();
  const recentStartupWindowMs = 15 * 60 * 1000;
  if (now - input.logModifiedAt > recentStartupWindowMs) return false;
  if (input.databaseModifiedAt > input.logModifiedAt) return false;

  const diagnosis = diagnoseComfyDatabaseFailure(input.logContent);
  if (!diagnosis) return false;
  const databaseErrors = [
    "Failed to initialize database",
    "Could not acquire lock on database",
    "unable to open database file",
    "Can't locate revision identified by",
    "No such index:",
    "database disk image is malformed",
    "attempt to write a readonly database",
    "disk I/O error"
  ];
  const lastErrorIndex = Math.max(...databaseErrors.map((message) =>
    input.logContent.toLowerCase().lastIndexOf(message.toLowerCase())
  ));
  if (lastErrorIndex < 0) return false;

  const logAfterError = input.logContent.slice(lastErrorIndex);
  return !/Starting server|To see the GUI go to:|Prompt Server Address/i.test(logAfterError);
}

async function scanEnvironmentIssues(
  comfyRoot: string,
  comfyServiceReachable: boolean
): Promise<EnvironmentIssue[]> {
  const issues: EnvironmentIssue[] = [];
  if (comfyRoot) {
    const fantasyNodes = path.join(
      comfyRoot,
      "custom_nodes",
      "ComfyUI-GGUF-FantasyTalking",
      "nodes.py"
    );
    const fantasySource = await fs.readFile(fantasyNodes, "utf8").catch(() => "");
    if (/\r?\n"""\r?\n!!! Exception during processing !!!/.test(fantasySource)) {
      issues.push({
        id: "fantasytalking-unicodeescape",
        label: "FantasyTalking 节点源码损坏",
        detail: "nodes.py 末尾混入了 Windows 报错文本，导致 unicodeescape 语法错误。",
        severity: "error",
        repairable: true,
        repairLabel: "自动修复源码"
      });
    }
  }
  const log = await readLatestComfyLog(comfyRoot);
  const fallbackDatabase = path.join(comfyRoot, "user", "comfyui.db");
  const diagnosis = diagnoseComfyDatabaseFailure(log.content, fallbackDatabase);
  const diagnosedDatabase = diagnosis?.databasePath && isPathInsideDirectory(
    diagnosis.databasePath,
    path.join(comfyRoot, "user")
  )
    ? diagnosis.databasePath
    : fallbackDatabase;
  const databaseStat = comfyRoot
    ? await fs.stat(diagnosedDatabase).catch(() => null)
    : null;
  if (shouldReportComfyDatabaseIssue({
    logContent: log.content,
    logModifiedAt: log.modifiedAt,
    databaseModifiedAt: databaseStat?.mtimeMs ?? 0,
    serviceReachable: comfyServiceReachable
  })) {
    issues.push({
      id: "comfy-database",
      label: "ComfyUI 数据库初始化失败",
      detail: diagnosis
        ? `${diagnosis.summary} 自动修复会先验证目录和依赖、备份真实数据库，再按故障类型重试或重建。`
        : "数据库初始化异常；自动修复会先诊断并备份，再执行恢复。",
      severity: "warning",
      repairable: true,
      repairLabel: "智能修复"
    });
  }
  return issues;
}


export function isWindowsPythonAlias(filename: string): boolean {
  return /[\\/]WindowsApps[\\/]python(?:3)?\.exe$/iu.test(filename);
}

async function pythonVersionFor(filename: string): Promise<string> {
  if (!filename || isWindowsPythonAlias(filename) || !(await exists(filename))) return "";
  try {
    const { stdout, stderr } = await execFileAsync(
      filename,
      ["--version"],
      { encoding: "utf8", timeout: 5_000, windowsHide: true }
    );
    const output = `${stdout}\n${stderr}`;
    return output.match(/Python\s+(\d+\.\d+(?:\.\d+)?)/i)?.[1] ?? "";
  } catch {
    return "";
  }
}

async function findExecutablePaths(command: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("where.exe", [command], {
      encoding: "utf8",
      timeout: 4_000,
      windowsHide: true
    });
    return stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function pythonLauncherPaths(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("py.exe", ["-0p"], {
      encoding: "utf8",
      timeout: 5_000,
      windowsHide: true
    });
    return stdout.split(/\r?\n/u).flatMap((line) => {
      const match = line.match(/\s([^\s].*python(?:\.exe)?)\s*$/iu);
      return match?.[1] ? [match[1].trim()] : [];
    });
  } catch {
    return [];
  }
}

function pythonRuntimeSource(filename: string, settings: Settings, root: string, sourceRoot: string): PythonRuntimeCandidate["source"] {
  const normalized = path.resolve(filename).toLowerCase();
  if (normalized === path.resolve(root, ".venv", "Scripts", "python.exe").toLowerCase() ||
    normalized === path.resolve(sourceRoot, ".venv", "Scripts", "python.exe").toLowerCase()) return "comfy-venv";
  if (normalized.includes(`${path.sep}python_embeded${path.sep}`.toLowerCase())) return "embedded";
  if (normalized.includes("windowsapps")) return "other";
  if (settings.comfyPythonPath.trim() && normalized === path.resolve(settings.comfyPythonPath).toLowerCase()) return "selected";
  return "path";
}

async function discoverPythonRuntimes(
  settings: Settings,
  comfyRoot = "",
  installation: ComfyInstallation | null = null
): Promise<PythonRuntimeCandidate[]> {
  const root = comfyRoot || await findComfyRoot(settings);
  const selected = installation || await findComfyInstallation(settings);
  const sourceRoot = selected?.sourceDirectory || root;
  const paths = uniqueWindowsPaths([
    settings.comfyPythonPath.trim(),
    root ? path.join(root, ".venv", "Scripts", "python.exe") : "",
    sourceRoot ? path.join(sourceRoot, ".venv", "Scripts", "python.exe") : "",
    sourceRoot ? path.join(path.dirname(sourceRoot), "python_embeded", "python.exe") : "",
    ...(await pythonLauncherPaths()),
    ...(await findExecutablePaths("python.exe"))
  ]).filter((filename) => !isWindowsPythonAlias(filename));
  const candidates = await Promise.all(paths.map(async (filename) => ({
    path: filename,
    version: await pythonVersionFor(filename),
    source: pythonRuntimeSource(filename, settings, root, sourceRoot),
    selected: Boolean(settings.comfyPythonPath.trim()) &&
      path.resolve(filename).toLowerCase() === path.resolve(settings.comfyPythonPath).toLowerCase()
  })));
  return candidates.filter((candidate) => Boolean(candidate.version));
}

async function findComfyPython(
  settings: Settings,
  comfyRoot = "",
  installation: ComfyInstallation | null = null
): Promise<string> {
  const root = comfyRoot || await findComfyRoot(settings);
  const selected = installation || await findComfyInstallation(settings);
  const sourceRoot = selected?.sourceDirectory || root;
  const runtimes = await discoverPythonRuntimes(settings, root, selected);
  const selectedRuntime = runtimes.find((runtime) => runtime.selected);
  if (selectedRuntime) return selectedRuntime.path;
  const preferredPaths = uniqueWindowsPaths([
    root ? path.join(root, ".venv", "Scripts", "python.exe") : "",
    sourceRoot ? path.join(sourceRoot, ".venv", "Scripts", "python.exe") : "",
    sourceRoot ? path.join(path.dirname(sourceRoot), "python_embeded", "python.exe") : ""
  ]).map((filename) => path.resolve(filename).toLowerCase());
  return runtimes.find((runtime) => preferredPaths.includes(path.resolve(runtime.path).toLowerCase()))?.path ??
    runtimes.find((runtime) => runtime.source === "path")?.path ??
    runtimes[0]?.path ??
    "";
}

interface AttentionPythonProbe {
  pythonVersion?: string;
  torchVersion?: string;
  cudaVersion?: string;
  gpuName?: string;
  gpuArchitecture?: string;
  sageAttentionVersion?: string;
  tritonVersion?: string;
  comfyKitchenVersion?: string;
  comfyKitchenBackends?: string[];
}

export function attentionWheelForProbe(
  probe: AttentionPythonProbe
): { version: string; filename: string; url: string } | null {
  const python = probe.pythonVersion?.match(/^(\d+)\.(\d+)/);
  const torch = probe.torchVersion?.match(/^(\d+)\.(\d+)/);
  const cuda = probe.cudaVersion?.match(/^(\d+)\.(\d+)/);
  if (!python || !torch || !cuda || process.platform !== "win32") return null;
  const pythonVersion = `${python[1]}.${python[2]}`;
  const torchVersion = `${torch[1]}.${torch[2]}`;
  const cudaVersion = `${cuda[1]}.${cuda[2]}`;
  const officialBuildMatrix: Record<string, readonly string[]> = {
    "12.4|2.4": ["3.10", "3.11", "3.12"],
    "12.4|2.5": ["3.10", "3.11", "3.12", "3.13"],
    "12.4|2.6": ["3.10", "3.11", "3.12", "3.13"],
    "12.6|2.6": ["3.10", "3.11", "3.12", "3.13"],
    "12.6|2.7": ["3.10", "3.11", "3.12", "3.13"],
    "12.6|2.8": ["3.10", "3.11", "3.12", "3.13"],
    "12.6|2.9": ["3.10", "3.11", "3.12", "3.13", "3.14"],
    "12.6|2.10": ["3.10", "3.11", "3.12", "3.13", "3.14"],
    "12.6|2.11": ["3.10", "3.11", "3.12", "3.13", "3.14"],
    "12.8|2.7": ["3.10", "3.11", "3.12", "3.13"],
    "12.8|2.8": ["3.10", "3.11", "3.12", "3.13"],
    "12.8|2.9": ["3.10", "3.11", "3.12", "3.13", "3.14"],
    "12.8|2.10": ["3.10", "3.11", "3.12", "3.13", "3.14"],
    "12.8|2.11": ["3.10", "3.11", "3.12", "3.13", "3.14"],
    "12.9|2.8": ["3.10", "3.11", "3.12", "3.13"],
    "12.9|2.9": ["3.10", "3.11", "3.12", "3.13", "3.14"],
    "12.9|2.10": ["3.10", "3.11", "3.12", "3.13", "3.14"],
    "13.0|2.9": ["3.10", "3.11", "3.12", "3.13", "3.14"],
    "13.0|2.10": ["3.10", "3.11", "3.12", "3.13", "3.14"],
    "13.0|2.11": ["3.10", "3.11", "3.12", "3.13", "3.14"]
  };
  if (!officialBuildMatrix[`${cudaVersion}|${torchVersion}`]?.includes(pythonVersion)) {
    return null;
  }
  const cp = `cp${python[1]}${python[2]}`;
  const cudaTag = `cu${cuda[1]}${cuda[2]}`;
  // ComfyUI publishes the package local-version tag as e.g. `torch2.8`.
  // Do not normalize the dot away here: pip normalizes distribution filenames,
  // but exact version matching still uses the dotted package version.
  const torchTag = `torch${torch[1]}.${torch[2]}`;
  const version = `${sageAttentionVersion}+${cudaTag}${torchTag}`;
  const filename = `sageattention-${version}-${cp}-${cp}-win_amd64.whl`;
  return {
    version,
    filename,
    // Let pip resolve the asset from ComfyUI's PEP 503 index. Release asset
    // names are not guaranteed to use the same normalized local-version tag.
    url: comfyWheelsIndex
  };
}

export function comfyKitchenConvRotCudaOptimized(cudaVersion: string): boolean {
  const match = cudaVersion.match(/^(\d+)\.(\d+)/);
  if (!match) return false;
  return Number(match[1]) > 13 || (
    Number(match[1]) === 13 && Number(match[2]) >= 0
  );
}

async function inspectAttentionPython(python: string): Promise<AttentionPythonProbe> {
  if (!python) return {};
  const script = [
    "import json, platform, importlib.metadata as md",
    "def version(name):",
    "    try: return md.version(name)",
    "    except md.PackageNotFoundError: return ''",
    "result={'pythonVersion':platform.python_version(),'sageAttentionVersion':version('sageattention'),'tritonVersion':version('triton-windows') or version('triton'),'comfyKitchenVersion':version('comfy-kitchen'),'comfyKitchenBackends':[]}",
    "try:",
    "    import torch",
    "    result['torchVersion']=torch.__version__",
    "    result['cudaVersion']=torch.version.cuda or ''",
    "    if torch.cuda.is_available():",
    "        result['gpuName']=torch.cuda.get_device_name(0)",
    "        cap=torch.cuda.get_device_capability(0)",
    "        result['gpuArchitecture']=f'{cap[0]}.{cap[1]}'",
    "except Exception as error: result['probeError']=str(error)",
    "try:",
    "    import comfy_kitchen as ck",
    "    result['comfyKitchenBackends']=[str(name) for name in ck.list_backends()]",
    "except Exception as error: result['comfyKitchenProbeError']=str(error)",
    "print(json.dumps(result))"
  ].join("\n");
  try {
    const { stdout } = await execFileAsync(python, ["-c", script], {
      encoding: "utf8",
      timeout: 30_000,
      windowsHide: true
    });
    return JSON.parse(stdout.trim()) as AttentionPythonProbe;
  } catch {
    return {};
  }
}

export function kjNodesAttentionSourceCompatible(source: string): boolean {
  return source.includes("PathchSageAttentionKJ") &&
    source.includes("optimized_attention_override") &&
    source.includes("2**31") &&
    source.includes("q.contiguous()") &&
    source.includes("k.contiguous()") &&
    source.includes("v.contiguous()");
}

async function kjNodesSupportsModelAttention(comfyRoot: string): Promise<boolean> {
  if (!comfyRoot) return false;
  const candidates = [
    "ComfyUI-KJNodes",
    "comfyui-kjnodes"
  ].map((directory) => path.join(
    comfyRoot,
    "custom_nodes",
    directory,
    "nodes",
    "model_optimization_nodes.py"
  ));
  for (const filename of candidates) {
    const source = await fs.readFile(filename, "utf8").catch(() => "");
    if (kjNodesAttentionSourceCompatible(source)) return true;
  }
  return false;
}

async function inspectAttentionAcceleration(
  settings: Settings,
  comfyRoot: string,
  installation: ComfyInstallation | null,
  pythonPathOverride = ""
): Promise<AttentionAccelerationStatus> {
  const pythonPath = pythonPathOverride || await findComfyPython(settings, comfyRoot, installation);
  const probe = await inspectAttentionPython(pythonPath);
  const wheel = attentionWheelForProbe(probe);
  const kjNodesInstalled = Boolean(comfyRoot) && (
    await exists(path.join(comfyRoot, "custom_nodes", "ComfyUI-KJNodes")) ||
    await exists(path.join(comfyRoot, "custom_nodes", "comfyui-kjnodes"))
  );
  const kjNodesCompatible = await kjNodesSupportsModelAttention(comfyRoot);
  const sageReady = Boolean(
    wheel && probe.sageAttentionVersion?.toLowerCase() === wheel.version.toLowerCase()
  );
  const tritonReady = Boolean(probe.tritonVersion);
  const gpuArchitecture = Number.parseFloat(probe.gpuArchitecture ?? "");
  const gpuSupported = Number.isFinite(gpuArchitecture) && gpuArchitecture >= 8;
  const convRotCudaOptimized = comfyKitchenConvRotCudaOptimized(probe.cudaVersion ?? "") &&
    (probe.comfyKitchenBackends ?? []).some((backend) => backend.toLowerCase() === "cuda");
  const ready = Boolean(
    pythonPath && wheel && gpuSupported && sageReady && tritonReady && kjNodesCompatible &&
    convRotCudaOptimized
  );
  const missing = [
    !pythonPath ? "ComfyUI Python" : "",
    !gpuSupported ? "SM 8.0+ NVIDIA GPU" : "",
    !wheel ? "匹配的 Windows wheel" : "",
    !sageReady ? `SageAttention ${sageAttentionVersion}` : "",
    !tritonReady ? "Triton" : "",
    !kjNodesCompatible ? "含大 stride 地址保护的新版 KJNodes" : "",
    !convRotCudaOptimized
      ? `H3 INT8 ConvRot CUDA 内核（当前 comfy-kitchen ${probe.comfyKitchenVersion || "未安装"} / ` +
        `${(probe.comfyKitchenBackends ?? []).join(", ") || "无可用 backend"}）`
      : ""
  ].filter(Boolean);
  return {
    pythonPath,
    pythonVersion: probe.pythonVersion ?? "",
    torchVersion: probe.torchVersion ?? "",
    cudaVersion: probe.cudaVersion ?? "",
    gpuName: probe.gpuName ?? "",
    gpuArchitecture: probe.gpuArchitecture ?? "",
    sageAttentionVersion: probe.sageAttentionVersion ?? "",
    tritonVersion: probe.tritonVersion ?? "",
    comfyKitchenVersion: probe.comfyKitchenVersion ?? "",
    comfyKitchenBackends: probe.comfyKitchenBackends ?? [],
    convRotCudaOptimized,
    kjNodesInstalled,
    kjNodesCompatible,
    recommendedSageVersion: wheel?.version ?? "",
    recommendedWheel: wheel?.filename ?? "",
    supported: Boolean(pythonPath && wheel && gpuSupported),
    ready,
    detail: ready ? "H3 模型级 SageAttention CUDA FP16 与 INT8 ConvRot CUDA 优化已就绪" :
      missing.length ? `待补齐：${missing.join("、")}` : "无法识别 Attention 运行环境"
  };
}

function readStatsString(value: unknown, keys: string[]): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}


async function inspectComfyCompatibility(
  baseUrl: string,
  installation: ComfyInstallation | null
): Promise<ComfyUiCompatibility> {
  const sourceDirectory = installation?.sourceDirectory ?? "";
  let version = "";
  let revision = "";
  let objectInfo: unknown = null;
  let checkedFrom: ComfyUiCompatibility["checkedFrom"] = "";
  let nativeH3AvSamplingFromSource = false;
  const [statsResult, objectInfoResult] = await Promise.allSettled([
      fetch(`${baseUrl}/system_stats`, { signal: AbortSignal.timeout(3500) }),
      fetch(`${baseUrl}/object_info`, { signal: AbortSignal.timeout(8000) })
  ]);
  if (statsResult.status === "fulfilled") {
    const statsResponse = statsResult.value;
    if (statsResponse.ok) {
      const stats = await statsResponse.json() as Record<string, unknown>;
      const system = stats.system;
      version = readStatsString(system, ["comfyui_version", "version"]);
      revision = readStatsString(system, [
        "comfyui_revision",
        "git_revision",
        "commit_hash"
      ]).slice(0, 8);
    }
  }
  if (objectInfoResult.status === "fulfilled") {
    const objectInfoResponse = objectInfoResult.value;
    if (objectInfoResponse.ok) {
      objectInfo = await objectInfoResponse.json();
      checkedFrom = "api";
    }
  }

  if (!version) version = await readComfySourceVersion(sourceDirectory);
  if (!revision) revision = await readComfyGitRevision(sourceDirectory);
  if (!objectInfo && sourceDirectory) {
    const [h3Source, textgenSource, previewSource, nodesSource] = await Promise.all([
      fs.readFile(path.join(sourceDirectory, "comfy_extras", "nodes_minimax_h3.py"), "utf8").catch(() => ""),
      fs.readFile(path.join(sourceDirectory, "comfy_extras", "nodes_textgen.py"), "utf8").catch(() => ""),
      fs.readFile(path.join(sourceDirectory, "comfy_extras", "nodes_preview_any.py"), "utf8").catch(() => ""),
      fs.readFile(path.join(sourceDirectory, "nodes.py"), "utf8").catch(() => "")
    ]);
    nativeH3AvSamplingFromSource = h3Source.includes("ModelSamplingAV");
    const sourceNodeIds = [
      ...minimaxH3CoreNodes
        .filter((node) => h3Source.includes(`node_id="${node.id}"`))
        .map((node) => node.id),
      ...(textgenSource.includes('node_id="TextGenerate"') ? ["TextGenerate"] : []),
      ...(nodesSource.includes("class CLIPLoader") ? ["CLIPLoader"] : []),
      ...(nodesSource.includes("class LoadImage") ? ["LoadImage"] : []),
      ...(nodesSource.includes("class ImageBatch") ? ["ImageBatch"] : []),
      ...(previewSource.includes("class PreviewAny") ? ["PreviewAny"] : [])
    ];
    if (sourceNodeIds.length > 0) {
      objectInfo = Object.fromEntries(
        sourceNodeIds.map((nodeId) => [nodeId, {}])
      );
      checkedFrom = "source";
    }
  }
  const nativeH3AvSampling = versionAtLeast(version, MINIMAX_H3_MINIMUM_COMFY_VERSION) ||
    nativeH3AvSamplingFromSource;
  const coreNodes = [
    ...evaluateMiniMaxH3CoreSupport(objectInfo),
    {
      id: "ModelSamplingAV",
      label: `H3 原生双时钟音视频采样（ComfyUI v${MINIMAX_H3_MINIMUM_COMFY_VERSION}+；推荐 v${MINIMAX_H3_RECOMMENDED_COMFY_VERSION}）`,
      available: nativeH3AvSampling
    }
  ];
  const h3CoreSupported = coreNodes.every((node) => node.available);
  const promptNodes = evaluatePromptCoreSupport(objectInfo);
  const promptCoreSupported = promptNodes.every((node) => node.available);
  const compatibility = evaluateMiniMaxH3CompatibilityState(version, revision, checkedFrom);
  const updateMode: ComfyUiCompatibility["updateMode"] = installation?.type === "desktop"
    ? "desktop"
    : sourceDirectory && await exists(path.join(sourceDirectory, ".git"))
      ? "git"
      : "unsupported";
  const updateHint = checkedFrom === "api"
    ? "版本信息来自当前已连接的服务；更新后需要重启该服务再复检。"
    : sourceDirectory
      ? "版本信息来自所选安装的本地核心源码。"
      : "此 Desktop 安装未暴露核心源码；启动服务后将通过 API 读取实际版本。";
  return {
    version,
    revision,
    h3MinimumVersion: MINIMAX_H3_MINIMUM_COMFY_VERSION,
    h3MinimumRevision: MINIMAX_H3_MINIMUM_COMFY_REVISION,
    h3RecommendedVersion: MINIMAX_H3_RECOMMENDED_COMFY_VERSION,
    h3CoreSupported,
    coreNodes,
    promptCoreSupported,
    promptCoreNodes: promptNodes,
    checkedFrom,
    updateMode,
    updateHint,
    compatibilityState: compatibility.compatibilityState,
    compatibilityNotice: compatibility.compatibilityNotice,
    knownBadRanges: [...minimaxH3KnownBadCoreRanges]
  };
}

async function findExecutable(command: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("where.exe", [command], {
      encoding: "utf8",
      timeout: 4000,
      windowsHide: true
    });
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? "";
  } catch {
    return "";
  }
}

const environmentDependencyDownloadUrls: Partial<Record<EnvironmentItemId, string>> = {
  node: "https://nodejs.org/en/download",
  git: "https://git-scm.com/downloads",
  ffmpeg: "https://ffmpeg.org/download.html",
  "cuda-toolkit": "https://developer.nvidia.com/cuda-downloads",
  nvidia: "https://www.nvidia.com/Download/index.aspx",
  comfyui: "https://www.comfy.org/download"
};

async function commandItem(
  id: EnvironmentItemId,
  label: string,
  command: string,
  args: string[],
  optional = false
): Promise<EnvironmentItem> {
  const executable = await findExecutable(command);
  if (!executable) {
    return {
      id,
      label,
      ok: false,
      detail: "未找到",
      optional,
      downloadUrl: environmentDependencyDownloadUrls[id]
    };
  }
  try {
    const { stdout, stderr } = await execFileAsync(executable, args, {
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true
    });
    const detail = `${stdout}${stderr}`
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? "已安装";
    return { id, label, ok: true, detail, path: executable, optional };
  } catch {
    return { id, label, ok: true, detail: "已安装", path: executable, optional };
  }
}

async function cudaToolkitItem(): Promise<EnvironmentItem> {
  const toolkit = await discoverCudaToolkit({
    findExecutable,
    exists
  });
  if (!toolkit) {
    return {
      id: "cuda-toolkit",
      label: "CUDA Toolkit",
      ok: false,
      detail: "未找到 nvcc；仅在安装 Qwen3.6 多模态可选节点时需要",
      optional: true,
      downloadUrl: environmentDependencyDownloadUrls["cuda-toolkit"]
    };
  }
  let version = "";
  try {
    const { stdout, stderr } = await execFileAsync(toolkit.nvcc, ["-V"], {
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true
    });
    version = `${stdout}\n${stderr}`
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => /release\s+\d/iu.test(line)) ?? "";
  } catch {
    // The path is still useful even if nvcc refuses to print its version.
  }
  return {
    id: "cuda-toolkit",
    label: "CUDA Toolkit",
    ok: true,
    detail: `${version || "已找到 nvcc"} · ${toolkit.source === "path" ? "PATH" : toolkit.source === "environment" ? "环境变量" : "默认目录"}`,
    path: toolkit.root,
    optional: true
  };
}

export function parseNvidiaGpuQuery(output: string): GpuDeviceInfo[] {
  return output.split(/\r?\n/).flatMap((line, lineIndex) => {
    const fields = line.split(",").map((field) => field.trim());
    if (fields.length < 4) return [];
    const [indexText, name, driverVersion, memoryText] = fields;
    const index = Number.parseInt(indexText ?? "", 10);
    const memoryMiB = Number.parseFloat(
      (memoryText ?? "").replace(/[^\d.+-]/g, "")
    );
    if (!name || !Number.isFinite(memoryMiB) || memoryMiB <= 0) return [];
    return [{
      index: Number.isInteger(index) ? index : lineIndex,
      name,
      driverVersion: driverVersion ?? "",
      vramTotalBytes: Math.round(memoryMiB * 1024 ** 2)
    }];
  });
}

interface NvidiaProbe {
  item: EnvironmentItem;
  devices: GpuDeviceInfo[];
}

async function nvidiaItem(): Promise<NvidiaProbe> {
  const executable = await findExecutable("nvidia-smi.exe");
  if (!executable) {
    return {
      item: {
        id: "nvidia",
        label: "NVIDIA 驱动 / GPU",
        ok: false,
        detail: "未找到 nvidia-smi；通常表示 NVIDIA 驱动未安装或驱动不可用",
        downloadUrl: environmentDependencyDownloadUrls.nvidia
      },
      devices: []
    };
  }
  try {
    const { stdout } = await execFileAsync(
      executable,
      [
        "--query-gpu=index,name,driver_version,memory.total",
        "--format=csv,noheader,nounits"
      ],
      { encoding: "utf8", timeout: 5000, windowsHide: true }
    );
    const devices = parseNvidiaGpuQuery(stdout);
    return {
      item: {
        id: "nvidia",
        label: "NVIDIA 驱动 / GPU",
        ok: true,
        detail: devices.length
          ? devices.map((device) =>
              `GPU ${device.index} · ${device.name} · ${formatGpuMemory(device.vramTotalBytes)} · 驱动 ${device.driverVersion || "未知"}`
            ).join("；")
          : stdout.trim() || "已检测到 NVIDIA GPU",
        path: executable
      },
      devices
    };
  } catch {
    return {
      item: {
        id: "nvidia",
        label: "NVIDIA 驱动 / GPU",
        ok: false,
        status: "warning",
        detail: "已找到 nvidia-smi，但暂时无法读取显卡详情；请检查驱动状态",
        path: executable,
        downloadUrl: environmentDependencyDownloadUrls.nvidia
      },
      devices: []
    };
  }
}

async function localServiceItem(
  id: "comfyui-api" | "lmstudio-api",
  label: string,
  url: string
): Promise<EnvironmentItem> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { id, label, ok: true, detail: `运行中 · ${url}` };
  } catch {
    return { id, label, ok: false, status: "warning", detail: `未运行或无法连接 · ${url}` };
  }
}

async function firstReachableServiceBase(
  baseUrls: string[],
  healthPath: string
): Promise<string> {
  const uniqueBases = [...new Set(baseUrls.map((url) => url.replace(/\/+$/, "")))];
  const checks = await Promise.all(
    uniqueBases.map(async (baseUrl) => {
      try {
        const response = await fetch(`${baseUrl}${healthPath}`, {
          signal: AbortSignal.timeout(1800)
        });
        return response.ok;
      } catch {
        return false;
      }
    })
  );
  return uniqueBases[checks.findIndex(Boolean)] ?? "";
}

export function buildLmStudioCandidates(options: {
  homeDirectory: string;
  localAppData: string;
  installDirectory?: string;
  driveRoots?: string[];
}): string[] {
  const configured = options.installDirectory?.trim() ?? "";
  const roots = options.driveRoots ?? ["C:\\", "D:\\"];
  return [
    ...(configured
      ? [
          configured,
          path.join(configured, "LM Studio.exe"),
          path.join(configured, "LM Studio", "LM Studio.exe"),
          path.join(configured, "LM-Studio", "LM Studio.exe")
        ]
      : []),
    path.join(options.localAppData, "Programs", "LM Studio", "LM Studio.exe"),
    path.join(options.localAppData, "LM-Studio", "LM Studio.exe"),
    ...roots.flatMap((root) => [
      path.join(root, "Program Files", "LM Studio", "LM Studio.exe"),
      path.join(root, "Program Files", "LM-Studio", "LM Studio.exe"),
      path.join(root, "LM Studio", "LM Studio.exe")
    ])
  ].filter((candidate, index, candidates) => {
    if (path.extname(candidate).toLowerCase() !== ".exe") return false;
    return candidates.findIndex(
      (value) => value.toLowerCase() === candidate.toLowerCase()
    ) === index;
  });
}

async function findLmStudioInstallation(settings: Settings): Promise<string> {
  const homeDirectory = os.homedir();
  const localAppData =
    process.env.LOCALAPPDATA ?? path.join(homeDirectory, "AppData", "Local");
  const candidates = buildLmStudioCandidates({
    homeDirectory,
    localAppData,
    installDirectory: settings.lmStudioInstallDirectory
  });
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return "";
}

async function lmStudioItem(settings: Settings): Promise<EnvironmentItem> {
  const installation = await findLmStudioInstallation(settings);
  if (installation) {
    return {
      id: "lmstudio",
      label: "LM Studio",
      ok: true,
      detail: "已找到 LM Studio.exe",
      path: installation,
      optional: true
    };
  }
  return {
    id: "lmstudio",
    label: "LM Studio",
    ok: false,
    detail: settings.lmStudioInstallDirectory
      ? "手动设置的目录中没有找到 LM Studio.exe"
      : "常见安装目录中未找到，请点击选择目录",
    optional: true
  };
}



export async function resolveComfyOutputDirectory(
  settings: Settings
): Promise<string> {
  const configured = sharedComfyOutputRoot(settings);
  if (configured && await exists(path.resolve(configured))) {
    return path.resolve(configured);
  }
  const comfyRoot = await findComfyRoot(settings);
  return comfyRoot ? path.join(comfyRoot, "output") : "";
}

export function sharedComfyOutputRoot(
  settings: Pick<Settings, "outputDirectory"> &
    Partial<Pick<Settings, "imageOutputDirectory">>
): string {
  const videoDirectory = settings.outputDirectory.trim();
  const imageDirectory = settings.imageOutputDirectory?.trim() ?? "";
  if (videoDirectory && imageDirectory) {
    const videoParent = path.dirname(path.resolve(videoDirectory));
    const imageParent = path.dirname(path.resolve(imageDirectory));
    if (videoParent.toLowerCase() === imageParent.toLowerCase()) {
      return videoParent;
    }
  }
  const candidate = videoDirectory || imageDirectory;
  if (!candidate) return "";
  return configuredComfyOutputRoot(candidate);
}

function configuredComfyOutputRoot(directory: string): string {
  let current = path.resolve(directory);
  let outputRoot = "";
  while (true) {
    if (path.basename(current).toLowerCase() === "output") {
      outputRoot = current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  if (outputRoot) return outputRoot;
  const basename = path.basename(path.resolve(directory)).toLowerCase();
  return basename === "images" || basename === "videos"
    ? path.dirname(path.resolve(directory))
    : path.resolve(directory);
}

export function comfyOutputSubfolder(
  settings: Pick<Settings, "outputDirectory"> &
    Partial<Pick<Settings, "imageOutputDirectory">>,
  kind: "video" | "image"
): string {
  const root = sharedComfyOutputRoot(settings);
  const target = kind === "image"
    ? settings.imageOutputDirectory?.trim() ?? ""
    : settings.outputDirectory.trim();
  if (!root || !target) return "";
  return path.relative(root, path.resolve(target)).replaceAll(path.sep, "/");
}

export function comfyDataDirectories(
  settings: Pick<Settings, "modelDirectory" | "outputDirectory"> &
    Partial<Pick<Settings, "imageOutputDirectory">>,
  comfyRoot: string
): { modelDirectory: string; outputDirectory: string } {
  return {
    modelDirectory: settings.modelDirectory.trim()
      ? path.resolve(settings.modelDirectory)
      : path.join(comfyRoot, "models"),
    outputDirectory: sharedComfyOutputRoot(settings)
      ? path.resolve(sharedComfyOutputRoot(settings))
      : path.join(comfyRoot, "output")
  };
}

export function mergeComfyDesktopSettings(
  value: unknown,
  settings: Pick<Settings, "modelDirectory" | "outputDirectory"> &
    Partial<Pick<Settings, "imageOutputDirectory">>
): Record<string, unknown> {
  const current = value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
  const modelDirectory = settings.modelDirectory.trim();
  const outputDirectory = sharedComfyOutputRoot(settings);
  const currentModels = Array.isArray(current.modelsDirs)
    ? current.modelsDirs.filter((item): item is string => typeof item === "string")
    : [];
  return {
    ...current,
    ...(modelDirectory
      ? { modelsDirs: uniqueWindowsPaths([modelDirectory, ...currentModels]) }
      : {}),
    ...(outputDirectory ? { outputDir: path.resolve(outputDirectory) } : {})
  };
}

async function applyComfyDesktopSettings(settings: Settings): Promise<void> {
  if (!settings.modelDirectory.trim() && !settings.outputDirectory.trim()) return;
  const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  const filename = path.join(appData, "Comfy Desktop", "settings.json");
  const source = await fs.readFile(filename, "utf8").catch(() => "");
  if (!source) return;
  const current = JSON.parse(source) as unknown;
  const next = mergeComfyDesktopSettings(current, settings);
  if (JSON.stringify(current) === JSON.stringify(next)) return;
  await fs.writeFile(filename, JSON.stringify(next, null, 2), "utf8");
}


async function startComfyUi(settings: Settings): Promise<string> {
  return startComfyUiService(settings, {
    findComfyRoot,
    findComfyInstallation,
    applyComfyDesktopSettings,
    launchDetached,
    launchComfyUiVisible,
    isPortInUse: (port) => isLocalPortInUse(port),
    downloadEnvironment,
    exists,
    findComfyPython,
    comfyDataDirectories
  });
}

export async function forceStopComfyProcesses(
  settings: Settings
): Promise<{ ok: boolean; message: string }> {
  if (!localEndpoint(settings.comfyUrl, 8188)) {
    return {
      ok: false,
      message: "远程 ComfyUI 仅支持连接，应用不会终止远程或本机进程。"
    };
  }
  const result = await forceStopComfyProcessesWithDependencies(settings, {
    findComfyPython,
    ownedProcessIds: ownedComfyProcessIdSnapshot,
    ownedOnly: false
  });
  if (result.ok) clearOwnedComfyProcessIds();
  return result;
}

async function stopComfyUi(settings: Settings): Promise<void> {
  await stopComfyUiService(settings, {
    findComfyPython,
    ownedProcessIds: ownedComfyProcessIdSnapshot,
    ownedOnly: false
  });
  clearOwnedComfyProcessIds();
}


export async function alignLocalComfyUiRuntimeProfile(
  settings: Settings
): Promise<{
  ok: boolean;
  restarted: boolean;
  desiredProfile: ComfyUiRuntimeProfile;
  previousProfile: ComfyUiRuntimeProfile | "unknown" | "not-running";
  message: string;
}> {
  const desiredProfile = comfyUiRuntimeProfileForSettings(settings);
  const endpoint = localEndpoint(settings.comfyUrl, 8188);
  if (!endpoint) {
    return {
      ok: true,
      restarted: false,
      desiredProfile,
      previousProfile: "not-running",
      message: "Remote ComfyUI runtime profiles are managed by the remote service."
    };
  }

  const netstat = await execFileAsync(
    "netstat.exe",
    ["-ano", "-p", "tcp"],
    { encoding: "utf8", timeout: 5000, windowsHide: true }
  ).catch(() => ({ stdout: "" }));
  const listenerPid = listeningPid(netstat.stdout, endpoint.port);
  if (!listenerPid) {
    return {
      ok: true,
      restarted: false,
      desiredProfile,
      previousProfile: "not-running",
      message: "ComfyUI is not running; the requested runtime profile will be used at startup."
    };
  }

  const processes = await allComfyProcessInfo(settings, { findComfyPython });
  const listenerOwned = await reconcileConfiguredComfyListenerOwnership(settings);
  const listener = processes.find((item) => item.processId === listenerPid);
  const previousProfile = comfyUiRuntimeProfileFromCommandLine(
    listener?.commandLine ?? ""
  );
  if (listenerOwned && previousProfile === desiredProfile) {
    return {
      ok: true,
      restarted: false,
      desiredProfile,
      previousProfile,
      message: `ComfyUI is already using the ${desiredProfile} runtime profile.`
    };
  }

  appLogger.info("comfy", "runtime-profile-switch-started", "Switching the ComfyUI runtime profile", {
    processId: listenerPid,
    listenerOwned,
    previousProfile,
    desiredProfile
  });
  const restarted = await restartLocalService("comfy", settings);
  appLogger.info(
    "comfy",
    restarted.ok ? "runtime-profile-switch-succeeded" : "runtime-profile-switch-failed",
    restarted.message,
    { processId: listenerPid, previousProfile, desiredProfile, ok: restarted.ok }
  );
  return {
    ok: restarted.ok,
    restarted: restarted.ok,
    desiredProfile,
    previousProfile,
    message: restarted.message
  };
}



async function findLmStudioCli(settings: Settings): Promise<string> {
  const homeDirectory = os.homedir();
  const configured = settings.lmStudioInstallDirectory.trim();
  const candidates = [
    await findExecutable("lms.exe"),
    path.join(homeDirectory, ".lmstudio", "bin", "lms.exe"),
    configured ? path.join(configured, "lms.exe") : "",
    configured ? path.join(configured, "bin", "lms.exe") : ""
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return "";
}

async function startLmStudio(settings: Settings): Promise<string> {
  const endpoint = localEndpoint(settings.lmStudioUrl, 1234);
  if (!endpoint) {
    throw new Error("一键启动只支持本机 LM Studio 地址（localhost 或 127.0.0.1）。");
  }
  const executable = await findLmStudioCli(settings);
  if (!executable) {
    throw new Error(
      "没有找到 LM Studio 的 lms 命令。请先安装并至少启动一次 LM Studio。"
    );
  }
  await launchDetached(executable, [
    "server",
    "start",
    "--port",
    String(endpoint.port),
    "--bind",
    endpoint.host
  ]);
  return `${settings.lmStudioUrl.replace(/\/+$/, "")}/models`;
}

export async function startLocalService(
  kind: LocalServiceKind,
  settings: Settings
): Promise<ConnectionResult> {
  if (pendingLocalComfyStart) return pendingLocalComfyStart;
  const operation = startLocalServiceOperation(kind, settings);
  pendingLocalComfyStart = operation;
  try {
    return await operation;
  } finally {
    if (pendingLocalComfyStart === operation) pendingLocalComfyStart = null;
  }
}

let pendingLocalComfyStart: Promise<ConnectionResult> | null = null;

async function startLocalServiceOperation(
  kind: LocalServiceKind,
  settings: Settings
): Promise<ConnectionResult> {
  const endpoint = settings.comfyUrl.replace(/\/+$/, "");
  const local = localEndpoint(settings.comfyUrl, 8188);
  const listenerExisted = local ? await isLocalPortInUse(local.port) : false;
  const listenerOwned = listenerExisted
    ? await reconcileConfiguredComfyListenerOwnership(settings)
    : false;
  if (listenerExisted && !listenerOwned) {
    appLogger.warn("comfy", "local-runtime-takeover-started", "Taking control of the configured local ComfyUI endpoint", {
      endpoint,
      port: local?.port ?? null
    });
    try {
      await stopComfyUi(settings);
    } catch (error) {
      return {
        ok: false,
        message: `无法接管本地 ComfyUI：${safeLogErrorMessage(error)}`
      };
    }
  }
  const ownership = "app";
  const operationId = comfyRuntimeState.begin(
    "starting",
    endpoint,
    "正在启动 ComfyUI，等待接口就绪。",
    ownership
  );
  try {
    const healthUrl = await startComfyUi(settings);
    const ready = await waitForService(healthUrl);
    const result = ready
      ? {
          ok: true,
          message: `${kind === "comfy" ? "ComfyUI" : "LM Studio"} 服务已启动。`
        }
      : {
          ok: false,
          message: "已等待 2 分钟，但接口仍未就绪。ComfyUI 可能仍在加载，请稍后重新扫描。"
        };
    if (ready && ownership === "app") await rememberOwnedComfyListener(settings);
    if (!ready) {
      const diagnostics = await captureComfyUiLogFailure(
        appLogger,
        settings,
        "service_start_timeout",
        { operationId: String(operationId) }
      );
      appLogger.error("comfy", "service-start-timeout", result.message, {
        operationId,
        ownership,
        logAvailable: diagnostics.available,
        capturedLines: diagnostics.lines,
        errorLines: diagnostics.errors,
        logTruncated: diagnostics.truncated
      });
    }
    comfyRuntimeState.finish(
      operationId,
      ready ? "ready" : "error",
      result.message,
      ownership
    );
    return result;
  } catch (error) {
    const result = {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    };
    const diagnostics = await captureComfyUiLogFailure(
      appLogger,
      settings,
      "service_start_failed",
      { operationId: String(operationId) }
    );
    appLogger.error("comfy", "service-start-failed", result.message, {
      operationId,
      ownership,
      errorName: error instanceof Error ? error.name : "Error",
      logAvailable: diagnostics.available,
      capturedLines: diagnostics.lines,
      errorLines: diagnostics.errors,
      logTruncated: diagnostics.truncated
    });
    comfyRuntimeState.finish(operationId, "error", result.message);
    return result;
  }
}

export async function reconcileConfiguredComfyListenerOwnership(
  settings: Settings
): Promise<boolean> {
  const endpoint = localEndpoint(settings.comfyUrl, 8188);
  if (!endpoint) return false;
  const netstat = await execFileAsync(
    "netstat.exe",
    ["-ano", "-p", "tcp"],
    { encoding: "utf8", timeout: 5000, windowsHide: true }
  ).catch(() => ({ stdout: "" }));
  const processId = listeningPid(netstat.stdout, endpoint.port);
  if (!processId) return false;
  if (ownedComfyProcessIdSnapshot().includes(processId)) return true;

  const processes = await allComfyProcessInfo(settings, { findComfyPython });
  const listener = processes.find((process) => process.processId === processId);
  if (!listener || !isAppManagedComfyCommandLine(listener.commandLine, endpoint.port)) {
    return false;
  }

  for (const process of processes) {
    if (isAppManagedComfyCommandLine(process.commandLine, endpoint.port)) {
      rememberOwnedComfyProcessId(process.processId);
    }
  }
  appLogger.info(
    "comfy",
    "legacy-owned-runtime-reconciled",
    "Recovered ownership of a ComfyUI runtime launched by an earlier app session",
    { listenerProcessId: processId, port: endpoint.port }
  );
  return true;
}

export function isAppManagedComfyCommandLine(commandLine: string, port: number): boolean {
  return new RegExp(
    `comfyui\\.local-video-studio-\\d+-${port}\\.db(?:\\s|["']|$)`,
    "i"
  ).test(commandLine);
}

async function rememberOwnedComfyListener(settings: Settings): Promise<void> {
  const endpoint = localEndpoint(settings.comfyUrl, 8188);
  if (!endpoint) return;
  const netstat = await execFileAsync(
    "netstat.exe",
    ["-ano", "-p", "tcp"],
    { encoding: "utf8", timeout: 5000, windowsHide: true }
  ).catch(() => ({ stdout: "" }));
  const processId = listeningPid(netstat.stdout, endpoint.port);
  if (processId) rememberOwnedComfyProcessId(processId);
}

export async function restartLocalService(
  kind: LocalServiceKind,
  settings: Settings
): Promise<ConnectionResult> {
  const endpoint = localEndpoint(settings.comfyUrl, 8188);
  const listenerExists = endpoint ? await isLocalPortInUse(endpoint.port) : true;
  if (!listenerExists && !ownedComfyProcessIdSnapshot().length) {
    return startLocalService(kind, settings);
  }
  const operationId = comfyRuntimeState.begin(
    "restarting",
    settings.comfyUrl.replace(/\/+$/, ""),
    "正在重启 ComfyUI。"
  );
  try {
    await stopComfyUi(settings);
    const healthUrl = await startComfyUi(settings);
    const ready = await waitForService(healthUrl);
    const result = ready
      ? { ok: true, message: "ComfyUI 服务已重启并连接成功。" }
      : {
          ok: false,
          message: "ComfyUI 已重新启动，但等待 2 分钟后接口仍未就绪。"
        };
    if (ready) await rememberOwnedComfyListener(settings);
    comfyRuntimeState.finish(operationId, ready ? "ready" : "error", result.message, "app");
    return result;
  } catch (error) {
    const result = {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    };
    comfyRuntimeState.finish(operationId, "error", result.message);
    return result;
  }
}

export async function updateComfyUi(
  settings: Settings
): Promise<{ ok: boolean; message: string; log?: string }> {
  const installation = await findComfyInstallation(settings);
  if (!installation) {
    return { ok: false, message: "没有找到可更新的 ComfyUI 安装。" };
  }
  if (installation.type === "desktop") {
    try {
      await launchDetached(installation.executable, []);
      return {
        ok: true,
        message: "已打开 ComfyUI Desktop。请在服务器配置的更新页面确认 Update Now，完成后重启服务并重新扫描。",
        log: "Desktop 安装由官方更新器维护，本工具不会直接覆盖 Program Files 中的核心文件。"
      };
    } catch (error) {
      return {
        ok: false,
        message: `无法打开 ComfyUI Desktop：${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  const sourceDirectory = installation.sourceDirectory;
  if (!sourceDirectory || !(await exists(path.join(sourceDirectory, ".git")))) {
    return {
      ok: false,
      message: "当前安装没有 Git 元数据，无法安全地原地更新；请使用 ComfyUI 官方安装器。"
    };
  }
  const git = await findExecutable("git.exe");
  if (!git) return { ok: false, message: "没有找到 Git，无法更新 ComfyUI。" };
  try {
    const status = await execFileAsync(
      git,
      ["-C", sourceDirectory, "status", "--porcelain"],
      { encoding: "utf8", timeout: 10_000, windowsHide: true }
    );
    if (status.stdout.trim()) {
      return {
        ok: false,
        message: "ComfyUI 源码目录存在未提交修改，为避免覆盖修改，本次更新已取消。",
        log: status.stdout.trim()
      };
    }
    const result = await execFileAsync(
      git,
      ["-C", sourceDirectory, "pull", "--ff-only"],
      {
        encoding: "utf8",
        timeout: 180_000,
        windowsHide: true,
        env: downloadEnvironment(settings)
      }
    );
    return {
      ok: true,
      message: "ComfyUI 源码已快进更新。请重启 ComfyUI 后重新扫描环境。",
      log: `${result.stdout}${result.stderr}`.trim()
    };
  } catch (error) {
    const processError = error as Error & { stdout?: string; stderr?: string };
    return {
      ok: false,
      message: `ComfyUI 更新失败：${processError.message}`,
      log: [processError.stdout, processError.stderr].filter(Boolean).join("\n")
    };
  }
}

function databaseRepairTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function installComfyDatabaseDependencies(
  python: string,
  sourceDirectory: string,
  settings: Settings,
  repairLog: string[]
): Promise<void> {
  const requirementsPath = path.join(sourceDirectory, "requirements.txt");
  const requirements = await fs.readFile(requirementsPath, "utf8").catch(() => "");
  const databaseRequirements = requirements
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => /^(?:alembic|sqlalchemy|filelock)(?:\b|[<>=!~])/iu.test(line));
  const packages = databaseRequirements.length
    ? databaseRequirements
    : ["alembic", "SQLAlchemy>=2.0.0", "filelock"];
  repairLog.push(`补齐数据库依赖：${packages.join("、")}`);
  const output = await runLoggedProcess(
    python,
    [
      "-m",
      "pip",
      "install",
      "--disable-pip-version-check",
      "--no-input",
      "--upgrade",
      ...packages
    ],
    {
      env: downloadEnvironment(settings),
      timeoutMs: 900_000
    }
  );
  if (output) repairLog.push(output);
}

async function initializeAndCheckComfyDatabase(
  python: string,
  sourceDirectory: string,
  databasePath: string,
  settings: Settings
): Promise<string> {
  const script = buildComfyDatabaseMigrationScript(sourceDirectory, databasePath);
  return runLoggedProcess(
    python,
    ["-c", script],
    {
      cwd: sourceDirectory,
      env: downloadEnvironment(settings),
      timeoutMs: 180_000
    }
  );
}

function databaseRepairDetail(diagnosis: ComfyDatabaseDiagnosis): string {
  switch (diagnosis.kind) {
    case "locked":
      return "检测到数据库被其他进程占用；不会修改原库，将验证应用隔离数据库启动。";
    case "missing-dependencies":
      return "检测到数据库依赖缺失；将使用所选 ComfyUI Python 补齐匹配依赖后重试迁移。";
    case "unavailable-path":
      return "检测到数据库目录不可用；将创建目录并执行可写性检查。";
    case "migration":
      return "检测到迁移版本异常；将先备份并无损重试，失败后才隔离旧库并新建。";
    case "corrupt":
      return "检测到 SQLite 损坏；将保留完整备份并创建新库。";
    default:
      return "将先备份并执行无损迁移检查；未知错误不会自动丢弃原数据库。";
  }
}

export async function repairEnvironmentIssue(
  issueId: EnvironmentIssue["id"],
  settings: Settings
): Promise<{ ok: boolean; message: string; log?: string }> {
  const repairLog: string[] = [];
  try {
    const comfyRoot = await findComfyRoot(settings);
    if (!comfyRoot) throw new Error("没有找到 ComfyUI 数据目录。");

    if (issueId === "fantasytalking-unicodeescape") {
      const nodesFile = path.join(
        comfyRoot,
        "custom_nodes",
        "ComfyUI-GGUF-FantasyTalking",
        "nodes.py"
      );
      const source = await fs.readFile(nodesFile, "utf8");
      const marker = /\r?\n"""\r?\n!!! Exception during processing !!!/;
      if (!marker.test(source)) {
        return { ok: true, message: "FantasyTalking 源码已经是可解析状态，无需修复。" };
      }
      const repaired = source.replace(
        marker,
        '\nr"""\n!!! Exception during processing !!!'
      );
      await fs.writeFile(nodesFile, repaired, "utf8");
      repairLog.push(`已将误粘贴的报错块改为 Python 原始字符串：${nodesFile}`);
      const python = path.join(comfyRoot, ".venv", "Scripts", "python.exe");
      if (await exists(python)) {
        await execFileAsync(python, ["-m", "py_compile", nodesFile], {
          encoding: "utf8",
          timeout: 30_000,
          windowsHide: true
        });
        repairLog.push("Python 语法检查通过");
      }
      return {
        ok: true,
        message: "FantasyTalking 源码已修复。请重启 ComfyUI 以重新加载节点。",
        log: repairLog.join("\n")
      };
    }

    if (issueId === "comfy-database") {
      const installation = await findComfyInstallation(settings);
      const sourceDirectory = installation?.sourceDirectory ?? "";
      if (!sourceDirectory || !(await exists(path.join(sourceDirectory, "alembic.ini")))) {
        throw new Error("没有找到所选 ComfyUI 的数据库迁移脚本，请先确认核心安装目录。");
      }
      const python = await findComfyPython(settings, comfyRoot, installation);
      if (!python) throw new Error("没有找到所选 ComfyUI 的 Python 环境。");
      const userDirectory = path.join(comfyRoot, "user");
      const defaultDatabase = path.join(userDirectory, "comfyui.db");
      const latestLog = await readLatestComfyLog(comfyRoot);
      const diagnosis = diagnoseComfyDatabaseFailure(latestLog.content, defaultDatabase) ?? {
        kind: "unknown",
        databasePath: defaultDatabase,
        explicitDatabasePath: false,
        summary: "当前日志没有保留完整错误，将执行无损数据库检查。"
      } satisfies ComfyDatabaseDiagnosis;
      const databasePath = path.resolve(diagnosis.databasePath || defaultDatabase);
      const allowedDatabaseRoots = [
        userDirectory,
        path.join(sourceDirectory, "user")
      ];
      if (!allowedDatabaseRoots.some((directory) => isPathInsideDirectory(databasePath, directory))) {
        throw new Error(
          `日志中的数据库不属于所选 ComfyUI 数据/核心目录，已拒绝自动修改：${databasePath}`
        );
      }
      repairLog.push(`诊断：${diagnosis.summary}`);
      repairLog.push(databaseRepairDetail(diagnosis));
      repairLog.push(`目标数据库：${databasePath}`);

      const healthUrl = `${settings.comfyUrl.replace(/\/+$/, "")}/system_stats`;
      const running = await fetch(healthUrl, {
        signal: AbortSignal.timeout(2000)
      }).then((response) => response.ok).catch(() => false);
      if (running) {
        return {
          ok: true,
          message: "ComfyUI 当前已连接，数据库初始化错误属于历史日志，无需修复。",
          log: repairLog.join("\n")
        };
      }
      if (ownedComfyProcessIdSnapshot().length) {
        repairLog.push("停止仍由应用拥有但接口未就绪的 ComfyUI 进程");
        await stopComfyUi(settings);
      }

      if (diagnosis.kind === "locked") {
        const started = await startLocalService("comfy", settings);
        if (!started.ok) {
          throw new Error(
            `${started.message} 原数据库仍可能被外部 ComfyUI 占用，应用没有终止该进程。`
          );
        }
        const endpoint = localEndpoint(settings.comfyUrl, 8188);
        const isolatedDatabase = endpoint
          ? path.join(userDirectory, appManagedComfyDatabaseFilename(endpoint.port))
          : "";
        if (isolatedDatabase && !(await exists(isolatedDatabase))) {
          throw new Error("ComfyUI 已连接，但应用隔离数据库没有生成。");
        }
        repairLog.push(`原数据库保持不变；应用已使用隔离数据库：${isolatedDatabase}`);
        return {
          ok: true,
          message: "检测到其他进程占用原数据库；未修改原库，应用已通过隔离数据库恢复服务。",
          log: repairLog.join("\n")
        };
      }

      await probeWritableDirectory(path.dirname(databasePath));
      repairLog.push("数据库目录可写性检查通过");
      if (diagnosis.kind === "missing-dependencies") {
        await installComfyDatabaseDependencies(
          python,
          sourceDirectory,
          settings,
          repairLog
        );
      }

      const timestamp = databaseRepairTimestamp();
      const backups = await backupSqliteDatabaseFamily(databasePath, timestamp);
      for (const entry of backups) {
        repairLog.push(`已复制备份 ${entry.sourcePath} -> ${entry.backupPath}`);
      }

      let databaseCheck = "";
      try {
        databaseCheck = await initializeAndCheckComfyDatabase(
          python,
          sourceDirectory,
          databasePath,
          settings
        );
        repairLog.push(`数据库无损迁移与 quick_check 通过：${databaseCheck}`);
      } catch (initializationError) {
        const resetAllowed = diagnosis.kind === "migration" || diagnosis.kind === "corrupt";
        repairLog.push(
          `无损修复失败：${initializationError instanceof Error ? initializationError.message : String(initializationError)}`
        );
        if (!resetAllowed) {
          await quarantineSqliteDatabaseFamily(
            databasePath,
            `${timestamp}-repair-attempt`
          ).catch(() => []);
          await restoreSqliteDatabaseBackups(backups);
          repairLog.push("无损检查未通过，已恢复检查前的数据库文件");
          throw new Error("无损数据库修复失败；已恢复原数据库，请查看修复日志。");
        }
        const quarantined = await quarantineSqliteDatabaseFamily(databasePath, timestamp);
        repairLog.push(...quarantined.map((filename) => `已隔离故障文件：${filename}`));
        try {
          databaseCheck = await initializeAndCheckComfyDatabase(
            python,
            sourceDirectory,
            databasePath,
            settings
          );
          repairLog.push(`新数据库迁移与 quick_check 通过：${databaseCheck}`);
        } catch (resetError) {
          await quarantineSqliteDatabaseFamily(
            databasePath,
            `${timestamp}-repair-attempt`
          ).catch(() => []);
          await restoreSqliteDatabaseBackups(backups);
          repairLog.push("新建数据库失败，已从备份恢复原数据库文件");
          throw resetError;
        }
      }

      const started = await startLocalService("comfy", settings);
      if (!started.ok) throw new Error(`数据库修复完成，但 ComfyUI 启动失败：${started.message}`);
      const endpoint = localEndpoint(settings.comfyUrl, 8188);
      const activeDatabase = endpoint
        ? path.join(userDirectory, appManagedComfyDatabaseFilename(endpoint.port))
        : databasePath;
      if (!(await exists(activeDatabase))) {
        throw new Error(`ComfyUI API 已恢复，但实际启动数据库没有生成：${activeDatabase}`);
      }
      repairLog.push(`ComfyUI 已连接；实际启动数据库：${activeDatabase}`);
      return {
        ok: true,
        message: "ComfyUI 数据库已完成分类修复、备份和完整性检查，服务已恢复。",
        log: repairLog.join("\n")
      };
    }

    return { ok: false, message: "未知的环境问题，已拒绝修复。" };
  } catch (error) {
    const processError = error as Error & { stdout?: string; stderr?: string };
    repairLog.push(
      [processError.message, processError.stdout, processError.stderr]
        .filter(Boolean)
        .join("\n")
    );
    if (issueId === "comfy-database") {
      const healthUrl = `${settings.comfyUrl.replace(/\/+$/, "")}/system_stats`;
      const running = await fetch(healthUrl, {
        signal: AbortSignal.timeout(1500)
      }).then((response) => response.ok).catch(() => false);
      if (!running) {
        try {
          repairLog.push("修复未完成，尝试恢复启动 ComfyUI");
          const recovery = await startLocalService("comfy", settings);
          if (!recovery.ok) throw new Error(recovery.message);
        } catch (recoveryError) {
          repairLog.push(
            `恢复启动失败：${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}`
          );
        }
      }
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      log: repairLog.join("\n")
    };
  }
}

export async function installCustomNode(
  nodeId: string,
  settings: Settings,
  onLog?: (message: string) => void
): Promise<{ ok: boolean; message: string; log?: string }> {
  return installCustomNodePackage(nodeId, settings, {
    downloadEnvironment,
    proxyLogLabel,
    findComfyRoot,
    findExecutable,
    findComfyPython,
    exists,
    retryableRenameError,
    renameWithRetry,
    runLoggedProcess
  }, onLog);
}

export async function inspectLlamaCppPythonRuntime(
  pythonPath: string
): Promise<LlamaCppPythonStatus> {
  return inspectLlamaCppPython(pythonPath, runLoggedProcess);
}

export async function installLlamaCppPython(
  settings: Settings,
  onLog?: (message: string) => void
): Promise<{ ok: boolean; message: string; log?: string }> {
  const runtime: LlamaCppPythonRuntime = {
    downloadEnvironment,
    proxyLogLabel,
    findComfyRoot,
    findComfyPython,
    runLoggedProcess
  };
  const restartLog: string[] = [];
  const reportRestart = (message: string) => {
    const normalized = message.trim();
    if (!normalized) return;
    restartLog.push(normalized);
    onLog?.(normalized);
  };
  let wasRunning = false;
  try {
    const comfyRoot = await findComfyRoot(settings);
    const python = await findComfyPython(settings, comfyRoot);
    const before = await inspectLlamaCppPython(python, runLoggedProcess);
    // The button is also an explicit repair action while the probe still
    // reports a healthy package (the native import can succeed but model load
    // may crash). Always release an app-managed ComfyUI process before pip
    // replaces its native DLLs, then restore it below if it was running.
    const healthUrl = `${settings.comfyUrl.replace(/\/+$/u, "")}/system_stats`;
    wasRunning = await fetch(healthUrl, {
      signal: AbortSignal.timeout(2000)
    }).then((response) => response.ok).catch(() => false);
    if (wasRunning) {
      reportRestart("正在停止 ComfyUI，避免替换 Python 扩展时文件被占用……");
      await stopComfyUi(settings);
      reportRestart("ComfyUI 已停止");
    }
    const result = await installLlamaCppPythonPackage(settings, runtime, onLog);
    if (result.ok) {
      const promptWriterDirectory = path.join(
        comfyRoot,
        "custom_nodes",
        "ComfyUI-MiniMaxH3-Prompt-Writer"
      );
      if (await exists(promptWriterDirectory)) {
        reportRestart("正在检查 H3 Prompt Writer 与新版 llama-cpp-python 的 API 兼容层……");
        await prepareH3PromptWriter(promptWriterDirectory, reportRestart);
      }
    }
    if (wasRunning) {
      reportRestart("正在重启 ComfyUI，并重新检查提示词节点……");
      const healthUrl = await startComfyUi(settings);
      if (!(await waitForService(healthUrl))) {
        throw new Error("llama-cpp-python 安装完成，但 ComfyUI 重启后未在等待时间内就绪。");
      }
      reportRestart("ComfyUI 已重启并恢复连接");
    }
    return {
      ...result,
      log: [result.log, ...restartLog].filter(Boolean).join("\n\n")
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    reportRestart(message);
    if (wasRunning) {
      try {
        reportRestart("安装过程异常，正在尝试恢复 ComfyUI……");
        const healthUrl = await startComfyUi(settings);
        await waitForService(healthUrl);
        reportRestart("ComfyUI 已恢复");
      } catch (recoveryError) {
        reportRestart(`ComfyUI 恢复失败：${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}`);
      }
    }
    return { ok: false, message, log: restartLog.join("\n\n") };
  }
}

export function tritonRequirementForTorch(torchVersion: string): string {
  const match = torchVersion.match(/^(\d+)\.(\d+)/);
  if (!match) throw new Error(`无法识别 PyTorch 版本：${torchVersion || "未知"}`);
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major !== 2 || minor < 4 || minor > 11) {
    throw new Error(`当前自动安装尚不支持 PyTorch ${torchVersion}`);
  }
  const tritonMinor = minor - 4;
  return `triton-windows>=3.${tritonMinor},<3.${tritonMinor + 1}`;
}

export async function runLoggedProcess(
  executable: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    onLog?: (message: string) => void;
  }
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const output: string[] = [];
    let settled = false;
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const append = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      output.push(text);
      for (const line of text.split(/\r?\n/).filter(Boolean)) {
        options.onLog?.(line);
      }
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    const finishReject = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(Object.assign(error, { stdout: output.join("").trim() }));
    };
    const timeout = setTimeout(() => {
      options.onLog?.("命令超过等待上限，正在终止子进程……");
      child.kill();
      if (process.platform === "win32" && child.pid) {
        const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore"
        });
        killer.unref();
      } else {
        child.kill("SIGTERM");
      }
      finishReject(new Error(`命令运行超过 ${Math.round((options.timeoutMs ?? 900_000) / 60_000)} 分钟，已停止`));
    }, options.timeoutMs ?? 900_000);
    child.once("error", (error) => {
      finishReject(error);
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const text = output.join("").trim();
      if (code === 0) resolve(text);
      else reject(Object.assign(new Error(`命令退出，代码 ${code}`), { stdout: text }));
    });
  });
}

export function createPipDownloadProgressReporter(
  report: (message: string) => void,
  now: () => number = Date.now
): (message: string) => void {
  let totalBytes = 0;
  let lastBytes = 0;
  let lastPercent = -1;
  let lastReportedAt = now();
  return (message: string) => {
    const progress = message.trim().match(/^Progress\s+(\d+)\s+of\s+(\d+)$/u);
    if (!progress) {
      report(message);
      return;
    }
    const current = Number(progress[1]);
    const total = Number(progress[2]);
    if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) return;
    const timestamp = now();
    if (total !== totalBytes || current < lastBytes) {
      totalBytes = total;
      lastBytes = 0;
      lastPercent = -1;
      lastReportedAt = timestamp;
    }
    const percent = Math.min(100, Math.floor((current / total) * 100));
    const elapsedMs = timestamp - lastReportedAt;
    if (percent < 100 && lastPercent >= 0 && elapsedMs < 1_000) return;
    const bytesPerSecond = elapsedMs > 0
      ? ((current - lastBytes) * 1_000) / elapsedMs
      : 0;
    lastBytes = current;
    lastPercent = percent;
    lastReportedAt = timestamp;
    const speed = bytesPerSecond > 0
      ? ` · ${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`
      : "";
    report(
      `下载进度：${percent}% · ${(current / 1024 / 1024).toFixed(1)} / ` +
      `${(total / 1024 / 1024).toFixed(1)} MB${speed}`
    );
  };
}

export async function installAttentionAcceleration(
  settings: Settings,
  onLog?: (message: string) => void
): Promise<{ ok: boolean; message: string; log?: string }> {
  const log: string[] = [];
  const report = (message: string) => {
    log.push(message);
    onLog?.(message);
  };
  let wasRunning = false;
  try {
    report(proxyLogLabel(settings));
    const comfyRoot = await findComfyRoot(settings);
    const installation = await findComfyInstallation(settings);
    if (!comfyRoot || !installation) {
      throw new Error("请先在设置中选择完整的 ComfyUI 安装和数据目录。");
    }
    const python = await findComfyPython(settings, comfyRoot, installation);
    if (!python) throw new Error("没有找到所选 ComfyUI 的 Python 环境。");
    const before = await inspectAttentionPython(python);
    const gpuArchitecture = Number.parseFloat(before.gpuArchitecture ?? "");
    if (!Number.isFinite(gpuArchitecture) || gpuArchitecture < 8) {
      throw new Error(
        `SageAttention 2.2 需要 SM 8.0+ NVIDIA GPU；当前检测结果为 ${before.gpuName || "未知 GPU"} / SM ${before.gpuArchitecture || "未知"}。`
      );
    }
    const needsCudaRuntimeUpgrade = !comfyKitchenConvRotCudaOptimized(before.cudaVersion ?? "");
    const needsComfyKitchenRepair = !(before.comfyKitchenBackends ?? [])
      .some((backend) => backend.toLowerCase() === "cuda") || before.comfyKitchenVersion !== "0.2.31";
    const initialWheel = attentionWheelForProbe(before);
    if (!initialWheel && !needsCudaRuntimeUpgrade) {
      throw new Error(
        `没有找到适用于 Python ${before.pythonVersion || "未知"} / ` +
        `PyTorch ${before.torchVersion || "未知"} / CUDA ${before.cudaVersion || "未知"} 的官方 Windows wheel。`
      );
    }
    report(`ComfyUI Python：${python}`);
    report(`运行时：Python ${before.pythonVersion} · PyTorch ${before.torchVersion} · CUDA ${before.cudaVersion}`);
    if (needsCudaRuntimeUpgrade) {
      report(
        `检测到 H3 INT8 ConvRot 正在使用 eager fallback；目标运行时：` +
        `PyTorch ${h3TorchRuntime.torch} / CUDA 13.0。`
      );
    } else if (initialWheel) {
      report(`目标：${initialWheel.filename}`);
    }

    const healthUrl = `${settings.comfyUrl.replace(/\/+$/, "")}/system_stats`;
    wasRunning = await fetch(healthUrl, {
      signal: AbortSignal.timeout(2000)
    }).then((response) => response.ok).catch(() => false);
    if (wasRunning) {
      report("正在停止 ComfyUI，避免更新节点和 Python 扩展时文件被占用……");
      await stopComfyUi(settings);
      report("ComfyUI 已停止");
    }

    if (await kjNodesSupportsModelAttention(comfyRoot)) {
      report("KJNodes 已支持模型级 SageAttention，无需重复更新");
    } else {
      report("正在安装或更新 KJNodes 模型级 Attention 补丁……");
      const kjResult = await installCustomNode("kjnodes", settings);
      if (kjResult.log) {
        log.push(kjResult.log);
        for (const line of kjResult.log.split(/\r?\n/).filter(Boolean)) onLog?.(line);
      }
      if (!kjResult.ok) throw new Error(kjResult.message);
      if (!(await kjNodesSupportsModelAttention(comfyRoot))) {
        throw new Error("KJNodes 已安装，但没有检测到模型级 SageAttention 节点；请查看安装日志。");
      }
    }

    const environment = downloadEnvironment(settings);
    const commonPipArgs = [
      "-m", "pip", "install", "--disable-pip-version-check", "--no-input", "--progress-bar=raw"
    ];
    if (needsCudaRuntimeUpgrade || needsComfyKitchenRepair) {
      const snapshot = await runLoggedProcess(
        python,
        ["-m", "pip", "freeze", "--disable-pip-version-check"],
        { env: environment, timeoutMs: 120_000 }
      );
      const snapshotPath = path.join(comfyRoot, `h3-runtime-before-cu130-${Date.now()}.txt`);
      await fs.writeFile(snapshotPath, `${snapshot}\n`, "utf8");
      report(`升级前 Python 包快照：${snapshotPath}`);
      if (needsCudaRuntimeUpgrade) {
        report("正在从 PyTorch 官方 cu130 索引升级 torch、torchvision 与 torchaudio……");
        await runLoggedProcess(
          python,
          [
            ...commonPipArgs,
            "--upgrade",
            "--index-url",
            pytorchCu130Index,
            `torch==${h3TorchRuntime.torch}`,
            `torchvision==${h3TorchRuntime.torchvision}`,
            `torchaudio==${h3TorchRuntime.torchaudio}`
          ],
          {
            env: environment,
            timeoutMs: 2_700_000,
            onLog: createPipDownloadProgressReporter(report)
          }
        );
        report("PyTorch cu130 运行时升级完成");
      }
      report("正在升级 ComfyUI 官方 comfy-kitchen CUDA 内核……");
      await runLoggedProcess(
        python,
        [...commonPipArgs, "--upgrade", "comfy-kitchen==0.2.31"],
        {
          env: environment,
          timeoutMs: 900_000,
          onLog: createPipDownloadProgressReporter(report)
        }
      );
      report("comfy-kitchen 安装完成");
    }

    const target = await inspectAttentionPython(python);
    const wheel = attentionWheelForProbe(target);
    if (!wheel) {
      throw new Error(
        `升级后没有找到适用于 Python ${target.pythonVersion || "未知"} / ` +
        `PyTorch ${target.torchVersion || "未知"} / CUDA ${target.cudaVersion || "未知"} 的 SageAttention wheel。`
      );
    }
    const targetHasComfyKitchenCuda = (target.comfyKitchenBackends ?? [])
      .some((backend) => backend.toLowerCase() === "cuda");
    if (!comfyKitchenConvRotCudaOptimized(target.cudaVersion ?? "") || !targetHasComfyKitchenCuda) {
      throw new Error(
        `升级后 H3 ConvRot CUDA 内核仍未就绪：PyTorch CUDA ${target.cudaVersion || "未知"}，` +
        `comfy-kitchen ${target.comfyKitchenVersion || "未安装"}，` +
        `backend ${(target.comfyKitchenBackends ?? []).join(", ") || "无"}。`
      );
    }
    report(`目标：${wheel.filename}`);
    const tritonRequirement = tritonRequirementForTorch(target.torchVersion ?? "");
    report(`正在安装 ${tritonRequirement}……`);
    await runLoggedProcess(
      python,
      [...commonPipArgs, "--upgrade", tritonRequirement],
      {
        env: environment,
        timeoutMs: 900_000,
        onLog: createPipDownloadProgressReporter(report)
      }
    );
    report("Triton 安装完成");

    report("正在从 ComfyUI 官方 wheel 仓库安装 SageAttention……");
    await runLoggedProcess(
      python,
      [
        ...commonPipArgs,
        "--upgrade",
        "--extra-index-url",
        wheel.url,
        `sageattention==${wheel.version}`
      ],
      {
        env: environment,
        timeoutMs: 900_000,
        onLog: createPipDownloadProgressReporter(report)
      }
    );
    report("SageAttention 安装完成");

    report("正在运行 CUDA Attention 自检……");
    const selfTest = [
      "import json, torch",
      "from sageattention import sageattn_qk_int8_pv_fp16_cuda as sage",
      "q=torch.randn(1,8,128,64,device='cuda',dtype=torch.float16)",
      "k=torch.randn_like(q); v=torch.randn_like(q)",
      "out=sage(q,k,v,tensor_layout='HND',is_causal=False,pv_accum_dtype='fp32')",
      "torch.cuda.synchronize()",
      "assert out.shape == q.shape and torch.isfinite(out).all()",
      "print(json.dumps({'ok':True,'shape':list(out.shape),'dtype':str(out.dtype),'gpu':torch.cuda.get_device_name(0)}))"
    ].join("\n");
    const selfTestOutput = await runLoggedProcess(
      python,
      ["-c", selfTest],
      { env: environment, timeoutMs: 180_000, onLog }
    );
    report(`CUDA 自检通过：${selfTestOutput}`);

    const after = await inspectAttentionAcceleration(settings, comfyRoot, installation);
    if (!after.ready) throw new Error(`安装后复检未通过：${after.detail}`);
    report(`环境复检通过：SageAttention ${after.sageAttentionVersion} · Triton ${after.tritonVersion}`);

    if (wasRunning) {
      report("正在重新启动 ComfyUI 并加载更新后的节点……");
      const health = await startComfyUi(settings);
      if (!(await waitForService(health))) {
        throw new Error("依赖安装成功，但 ComfyUI 在 2 分钟内没有恢复就绪。");
      }
      report("ComfyUI 已重新启动");
    }
    return {
      ok: true,
      message: "H3 推理加速环境已安装并通过 CUDA 自检。",
      log: log.join("\n")
    };
  } catch (error) {
    const processError = error as Error & { stdout?: string; stderr?: string };
    const details = [processError.message, processError.stdout, processError.stderr]
      .filter(Boolean).join("\n");
    report(details);
    if (wasRunning) {
      try {
        report("安装未完整结束，正在尝试恢复 ComfyUI……");
        const health = await startComfyUi(settings);
        await waitForService(health);
      } catch (recoveryError) {
        report(`恢复启动失败：${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}`);
      }
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      log: log.join("\n")
    };
  }
}

export async function installWorkflowDependency(
  workflowId: WorkflowDependencyStatus["id"],
  settings: Settings,
  onLog?: (message: string) => void
): Promise<{ ok: boolean; message: string; log?: string }> {
  return installWorkflowDependencyPackage(workflowId, settings, {
    findComfyRoot,
    findExecutable,
    normalizeProxyUrl,
    downloadEnvironment,
    proxyLogLabel,
    runLoggedProcess
  }, onLog);
}

function validateCustomNodeRuntime(
  customNodes: CustomNodeStatus[],
  llamaCppPython: LlamaCppPythonStatus,
  runtimeComfyBaseUrl: string
): CustomNodeStatus[] {
  return customNodes.map((node) => {
    if (
      node.id !== "minimax-h3-prompt-writer" ||
      !runtimeComfyBaseUrl ||
      !node.loaded ||
      llamaCppPython.ready
    ) {
      return node;
    }
    const detail = llamaCppPython.detail || llamaCppPython.error || "共享 llama-cpp-python 尚未就绪";
    return {
      ...node,
      loaded: false,
      loadError: `H3 Prompt Writer 共享 llama-cpp-python 未通过运行时自检：${detail}`,
      compatibilityState: "error" as const,
      compatibilityNotice: "节点接口已响应，但共享 llama-cpp-python 未就绪；请在设置 → 提示词扩写中修复运行依赖。"
    };
  });
}

function mergeModelProfilesWithCustomNodes(
  scannedModelProfiles: ModelScanProfile[],
  customNodes: CustomNodeStatus[]
): ModelScanProfile[] {
  const customNodesById = new Map(customNodes.map((node) => [node.id, node]));
  return scannedModelProfiles.map((profile) => {
    const requiredCustomNodeIds = profile.requiredCustomNodeIds ?? [];
    const requiredCustomNodes = requiredCustomNodeIds
      .map((id) => customNodesById.get(id))
      .filter((node): node is CustomNodeStatus => Boolean(node));
    const missingCustomNodeIds = requiredCustomNodeIds.filter(
      (id) => !customNodesById.get(id)?.installed
    );
    const customNodeCompatibility: ModelScanProfile["customNodeCompatibility"] = missingCustomNodeIds.length
      ? "error"
      : requiredCustomNodes.some((node) => node.compatibilityState === "error")
        ? "error"
        : requiredCustomNodes.some((node) => node.compatibilityState === "warning")
          ? "warning"
          : requiredCustomNodes.some((node) =>
              !node.compatibilityState || node.compatibilityState === "unknown"
            )
            ? "unknown"
            : "supported";
    return requiredCustomNodeIds.length
      ? {
          ...profile,
          missingCustomNodeIds,
          missingCustomNodeNames: missingCustomNodeIds.map((id) => customNodesById.get(id)?.name ?? id),
          customNodeCompatibility
        }
      : profile;
  });
}

export function refreshModelProfileRuntimeEvidence(
  profiles: ModelScanProfile[],
  settings: Settings,
  runtimeNodeIds?: ReadonlySet<string>
): ModelScanProfile[] {
  const catalogDefinitions = catalogModelProfileDefinitionsFor(settings.ltxExtensionModelProfile);
  const catalogIds = new Set(catalogDefinitions.map((profile) => profile.id));
  const definitions = [
    ...modelProfileDefinitions.filter((profile) => !catalogIds.has(profile.id)),
    ...catalogDefinitions
  ];
  const definitionsById = new Map(definitions.map((profile) => [profile.id, profile]));
  return profiles.map((profile) => {
    const runtimeNodeTypes = definitionsById.get(profile.id)?.runtimeNodeTypes;
    if (!runtimeNodeTypes) return profile;
    const runtimeMissingNodes = runtimeNodeIds
      ? runtimeNodeTypes.filter((nodeType) => !runtimeNodeIds.has(nodeType))
      : [];
    return {
      ...profile,
      runtimeVerified: runtimeNodeIds !== undefined,
      runtimeReady: runtimeNodeIds !== undefined && runtimeMissingNodes.length === 0,
      runtimeMissingNodes
    };
  });
}

async function scanFullEnvironment(
  settings: Settings
): Promise<EnvironmentScanResult> {
  const userHome = os.homedir();
  const [comfyRoot, comfyInstallations] = await Promise.all([
    findComfyRoot(settings),
    discoverComfyInstallations(settings)
  ]);
  const comfyInstallationSummary =
    comfyInstallations.find((installation) => installation.selected) ??
    comfyInstallations[0];
  const comfyInstallation: ComfyInstallation | null = comfyInstallationSummary
    ? {
        type: comfyInstallationSummary.type,
        directory: comfyInstallationSummary.directory,
        sourceDirectory: comfyInstallationSummary.sourceDirectory,
        executable: comfyInstallationSummary.executable
      }
    : null;
  const directories = comfyRoot
    ? comfyDataDirectories(settings, comfyRoot)
    : {
        modelDirectory: settings.modelDirectory.trim(),
        outputDirectory: settings.outputDirectory.trim()
      };
  const modelDirectory = directories.modelDirectory;
  const outputDirectory = directories.outputDirectory;
  const modelFiles = await listModelFiles(modelDirectory);
  if (settings.promptModelDirectory.trim()) {
    const promptDirectory = path.resolve(settings.promptModelDirectory);
    if (promptDirectory.toLowerCase() !== path.resolve(modelDirectory).toLowerCase()) {
      const promptFiles = await listModelFiles(promptDirectory);
      modelFiles.push(...promptFiles.map((filename) => `prompt_models/${filename}`));
    }
  }
  if (
    comfyRoot &&
    await exists(
      path.join(
        comfyRoot,
        "custom_nodes",
        "ComfyUI-Frame-Interpolation",
        "ckpts",
        "rife",
        "rife47.pth"
      )
    )
  ) {
    modelFiles.push("frame_interpolation/rife47.pth");
  }
  const configuredComfyBaseUrl = settings.comfyUrl.replace(/\/+$/, "");
  const desktopComfyBaseUrl = "http://127.0.0.1:8000";
  const runtimeComfyBaseUrl = await firstReachableServiceBase(
    [
      configuredComfyBaseUrl,
      ...(comfyInstallation?.type === "desktop" ? [desktopComfyBaseUrl] : [])
    ],
    "/object_info"
  );
  const runtimeNodeIds = runtimeComfyBaseUrl
    ? await fetch(`${runtimeComfyBaseUrl}/object_info`, {
        signal: AbortSignal.timeout(8000)
      })
        .then(async (response) => response.ok
          ? availableComfyNodeIds(await response.json())
          : undefined)
        .catch(() => undefined)
    : undefined;
  const scannedModelProfiles = evaluateModelProfiles(
    modelFiles,
    settings.ltxExtensionModelProfile,
    runtimeNodeIds
  );
  const pythonRuntimes = await discoverPythonRuntimes(
    settings,
    comfyRoot,
    comfyInstallation
  );
  const selectedPython = pythonRuntimes.find((runtime) => runtime.selected) ??
    pythonRuntimes[0];
  const latestNodeVersionsPromise = latestCatalogNodeReleaseVersions(settings);
  const [customNodes, workflowDependencies, attentionAcceleration, llamaCppPython] = await Promise.all([
    latestNodeVersionsPromise.then((latestNodeVersions) =>
      scanCustomNodes(
        comfyRoot,
        settings,
        latestNodeVersions["spectrum-minimax-h3"] ?? "",
        runtimeComfyBaseUrl || settings.comfyUrl,
        latestNodeVersions["h3-motion-context"] ?? "",
        latestNodeVersions
      )
    ),
    scanWorkflowDependencies(comfyRoot),
    inspectAttentionAcceleration(
      settings,
      comfyRoot,
      comfyInstallation,
      selectedPython?.path ?? ""
    ),
    inspectLlamaCppPython(
      selectedPython?.path ?? "",
      runLoggedProcess
    )
  ]);
  const runtimeValidatedCustomNodes = validateCustomNodeRuntime(
    customNodes,
    llamaCppPython,
    runtimeComfyBaseUrl
  );
  const modelProfiles = mergeModelProfilesWithCustomNodes(
    scannedModelProfiles,
    runtimeValidatedCustomNodes
  );
  const llamaServer: LlamaServerStatus = {
    found: false,
    path: "",
    directory: "",
    source: ""
  };
  const issues = await scanEnvironmentIssues(comfyRoot, Boolean(runtimeComfyBaseUrl));
  const comfyItem: EnvironmentItem = comfyRoot || comfyInstallation
    ? {
        id: "comfyui",
        label: "ComfyUI",
        ok: true,
        detail: comfyInstallation
          ? `${
              comfyInstallation.type === "desktop"
                ? "桌面版"
                : comfyInstallation.type === "portable"
                  ? "便携版"
                  : "手动安装"
            } · 数据目录 ${comfyRoot || "等待初始化"}`
          : "已找到数据目录，尚未找到程序入口",
        path: comfyInstallation?.directory || comfyRoot
      }
    : {
        id: "comfyui",
        label: "ComfyUI",
        ok: false,
        detail: `未在 ${userHome} 及常见磁盘目录中找到`,
        downloadUrl: environmentDependencyDownloadUrls.comfyui
      };

  const reachableComfyBaseUrl = await firstReachableServiceBase(
    [
      runtimeComfyBaseUrl,
      configuredComfyBaseUrl,
      ...(comfyInstallation?.type === "desktop" ? [desktopComfyBaseUrl] : [])
    ],
    "/system_stats"
  );
  const detectedComfyBaseUrl =
    reachableComfyBaseUrl || configuredComfyBaseUrl;
  const comfyCompatibility = await inspectComfyCompatibility(
    detectedComfyBaseUrl,
    comfyInstallation
  );
  const comfyHealthUrl = `${detectedComfyBaseUrl}/system_stats`;
  const [
    nodeItem,
    gitItem,
    ffmpegItem,
    cudaToolkit,
    nvidiaProbe,
    comfyEnvironmentItem,
    comfyApiItem
  ] = await Promise.all([
    commandItem("node", "Node.js", "node.exe", ["--version"]),
    commandItem("git", "Git", "git.exe", ["--version"], true),
    commandItem("ffmpeg", "FFmpeg", "ffmpeg.exe", ["-version"], true),
    cudaToolkitItem(),
    nvidiaItem(),
    Promise.resolve(comfyItem),
    localServiceItem("comfyui-api", "ComfyUI 服务", comfyHealthUrl)
  ]);
  const items = [
    nodeItem,
    gitItem,
    ffmpegItem,
    cudaToolkit,
    nvidiaProbe.item,
    comfyEnvironmentItem,
    comfyApiItem
  ];

  return {
    scannedAt: new Date().toISOString(),
    userHome,
    comfyRoot,
    comfyUrl: detectedComfyBaseUrl,
    comfyInstallDirectory: comfyInstallation?.directory ?? "",
    comfySourceDirectory: comfyInstallation?.sourceDirectory ?? "",
    comfyInstallType: comfyInstallation?.type ?? "",
    comfyInstallations,
    pythonRuntimes,
    gpus: nvidiaProbe.devices,
    modelDirectory,
    outputDirectory,
    llamaServer,
    llamaCppPython,
    comfyCompatibility,
    attentionAcceleration,
    items,
    modelProfiles,
    customNodes: runtimeValidatedCustomNodes,
    workflowDependencies,
    issues
  };
}

const environmentScanCache = new Map<string, EnvironmentScanResult>();

function cacheEnvironmentScan(key: string, scan: EnvironmentScanResult): void {
  environmentScanCache.delete(key);
  environmentScanCache.set(key, scan);
  while (environmentScanCache.size > 4) {
    const oldestKey = environmentScanCache.keys().next().value;
    if (typeof oldestKey !== "string") break;
    environmentScanCache.delete(oldestKey);
  }
}

function environmentScanCacheKey(settings: Settings): string {
  return JSON.stringify({
    comfyInstallDirectory: settings.comfyInstallDirectory,
    comfyPythonPath: settings.comfyPythonPath,
    comfyUrl: settings.comfyUrl,
    modelDirectory: settings.modelDirectory,
    promptModelDirectory: settings.promptModelDirectory,
    outputDirectory: settings.outputDirectory,
    ltxExtensionModelProfile: settings.ltxExtensionModelProfile,
    proxyEnabled: settings.proxyEnabled,
    proxyUrl: settings.proxyUrl
  });
}

async function scanEnvironmentDependencies(
  settings: Settings,
  previous: EnvironmentScanResult,
  scope: Exclude<EnvironmentScanScope, "full">
): Promise<EnvironmentScanResult | null> {
  const [comfyRoot, comfyInstallations] = await Promise.all([
    findComfyRoot(settings),
    discoverComfyInstallations(settings)
  ]);
  if (path.resolve(comfyRoot || "") !== path.resolve(previous.comfyRoot || "")) return null;
  const installationSummary = comfyInstallations.find((installation) => installation.selected) ??
    comfyInstallations[0];
  const comfyInstallation: ComfyInstallation | null = installationSummary
    ? {
        type: installationSummary.type,
        directory: installationSummary.directory,
        sourceDirectory: installationSummary.sourceDirectory,
        executable: installationSummary.executable
      }
    : null;
  const configuredComfyBaseUrl = settings.comfyUrl.replace(/\/+$/, "");
  const desktopComfyBaseUrl = "http://127.0.0.1:8000";
  const runtimeComfyBaseUrl = await firstReachableServiceBase(
    [
      configuredComfyBaseUrl,
      ...(comfyInstallation?.type === "desktop" ? [desktopComfyBaseUrl] : [])
    ],
    "/object_info"
  );
  const runtimeNodeIds = runtimeComfyBaseUrl
    ? await fetch(`${runtimeComfyBaseUrl}/object_info`, {
        signal: AbortSignal.timeout(8000)
      })
        .then(async (response) => response.ok
          ? availableComfyNodeIds(await response.json())
          : undefined)
        .catch(() => undefined)
    : undefined;
  const runtimeOnly = scope === "runtime";
  const pythonRuntimes = runtimeOnly
    ? previous.pythonRuntimes
    : await discoverPythonRuntimes(settings, comfyRoot, comfyInstallation);
  const selectedPython = pythonRuntimes.find((runtime) => runtime.selected) ?? pythonRuntimes[0];
  const latestNodeVersionsPromise = runtimeOnly
    ? Promise.resolve(Object.fromEntries(
        previous.customNodes
          .filter((node) => node.latestVersion)
          .map((node) => [node.id, node.latestVersion])
      ))
    : latestCatalogNodeReleaseVersions(settings);
  const [customNodes, workflowDependencies, attentionAcceleration, llamaCppPython] = await Promise.all([
    latestNodeVersionsPromise.then((latestNodeVersions) =>
      scanCustomNodes(
        comfyRoot,
        settings,
        latestNodeVersions["spectrum-minimax-h3"] ?? "",
        runtimeComfyBaseUrl || settings.comfyUrl,
        latestNodeVersions["h3-motion-context"] ?? "",
        latestNodeVersions
      )
    ),
    runtimeOnly
      ? Promise.resolve(previous.workflowDependencies)
      : scanWorkflowDependencies(comfyRoot),
    runtimeOnly
      ? Promise.resolve(previous.attentionAcceleration)
      : inspectAttentionAcceleration(
          settings,
          comfyRoot,
          comfyInstallation,
          selectedPython?.path ?? ""
        ),
    runtimeOnly
      ? Promise.resolve(previous.llamaCppPython)
      : inspectLlamaCppPython(selectedPython?.path ?? "", runLoggedProcess)
  ]);
  const runtimeValidatedCustomNodes = validateCustomNodeRuntime(
    customNodes,
    llamaCppPython,
    runtimeComfyBaseUrl
  );
  const runtimeProfiles = refreshModelProfileRuntimeEvidence(
    previous.modelProfiles,
    settings,
    runtimeNodeIds
  );
  const modelProfiles = mergeModelProfilesWithCustomNodes(
    runtimeProfiles,
    runtimeValidatedCustomNodes
  );
  const issues = await scanEnvironmentIssues(comfyRoot, Boolean(runtimeComfyBaseUrl));
  const reachableComfyBaseUrl = await firstReachableServiceBase(
    [
      runtimeComfyBaseUrl,
      configuredComfyBaseUrl,
      ...(comfyInstallation?.type === "desktop" ? [desktopComfyBaseUrl] : [])
    ],
    "/system_stats"
  );
  const detectedComfyBaseUrl = reachableComfyBaseUrl || configuredComfyBaseUrl;
  const comfyCompatibility = await inspectComfyCompatibility(
    detectedComfyBaseUrl,
    comfyInstallation
  );
  const comfyApiItem = await localServiceItem(
    "comfyui-api",
    "ComfyUI 服务",
    `${detectedComfyBaseUrl}/system_stats`
  );
  const items = previous.items.some((item) => item.id === "comfyui-api")
    ? previous.items.map((item) => item.id === "comfyui-api" ? comfyApiItem : item)
    : [...previous.items, comfyApiItem];
  return {
    ...previous,
    scannedAt: new Date().toISOString(),
    comfyUrl: detectedComfyBaseUrl,
    comfyInstallDirectory: comfyInstallation?.directory ?? previous.comfyInstallDirectory,
    comfySourceDirectory: comfyInstallation?.sourceDirectory ?? previous.comfySourceDirectory,
    comfyInstallType: comfyInstallation?.type ?? previous.comfyInstallType,
    comfyInstallations,
    pythonRuntimes,
    llamaCppPython,
    comfyCompatibility,
    attentionAcceleration,
    items,
    modelProfiles,
    customNodes: runtimeValidatedCustomNodes,
    workflowDependencies,
    issues
  };
}

export async function scanEnvironment(
  settings: Settings,
  scope: EnvironmentScanScope = "full"
): Promise<EnvironmentScanResult> {
  const cacheKey = environmentScanCacheKey(settings);
  if (scope !== "full") {
    const previous = environmentScanCache.get(cacheKey);
    if (previous) {
      const partial = await scanEnvironmentDependencies(settings, previous, scope);
      if (partial) {
        cacheEnvironmentScan(cacheKey, partial);
        return partial;
      }
    }
  }
  const full = await scanFullEnvironment(settings);
  cacheEnvironmentScan(cacheKey, full);
  return full;
}
