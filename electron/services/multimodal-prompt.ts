import type { EnhanceRequest, PromptProgressReporter, Settings } from "../../src/types.js";
import {
  comfyMultimodalPromptModel
} from "../../src/core/prompt-models.js";
import {
  inferH3PromptMode,
  normalizeH3PromptOutput
} from "../../src/core/h3-prompt.js";
import {
  isH3ReferenceAutoPrompt,
  validateH3ReferenceAutoPrompt
} from "../../src/core/h3-auto-prompter.js";
import { normalizeQwenImageEditPromptOutput } from "../../src/core/qwen-image-prompt.js";
import { missingWorkflowNodeTypes } from "../../src/core/workflow.js";
import { getApplicationLogger, safeLogErrorMessage } from "./app-logger.js";
import { getPerformanceMetrics } from "./performance.js";
import {
  extractStringNodeOutput,
  freeMemory,
  h3PromptInstruction,
  imageEditPromptInstruction,
  jsonRequest,
  uploadInput,
  waitForTask
} from "./comfy-ui.js";

type PromptNode = { class_type: string; inputs: Record<string, unknown> };
export type MultimodalDevice = "CPU" | "GPU";
export interface MultimodalRuntimeSelection {
  model: string;
  mmproj: string;
}

const gib = 1024 ** 3;
const minimumFreeVramForMultimodalModel: Record<string, number> = {
  "qwen/qwen3.6-27b-uncensored-q4": 20 * gib,
  "qwen/qwen3.8-27b-uncensored-q4": 20 * gib
};
let retainedMultimodalDevice: { modelId: string; device: MultimodalDevice } | null = null;
const appLogger = getApplicationLogger();

export function multimodalDeviceFor(
  modelId: string,
  vramUsedBytes: number | null,
  vramTotalBytes: number | null
): MultimodalDevice {
  const minimumFreeVram = minimumFreeVramForMultimodalModel[modelId];
  if (!minimumFreeVram) return "GPU";
  if (vramUsedBytes == null || vramTotalBytes == null) {
    return "CPU";
  }
  return vramTotalBytes - vramUsedBytes >= minimumFreeVram ? "GPU" : "CPU";
}

export function multimodalActivityTimeoutMinutes(
  modelId: string,
  device: MultimodalDevice
): number {
  if (device === "CPU") return 20;
  if (modelId === "qwen/qwen3.6-27b-uncensored-q4") return 10;
  return 5;
}

function cleanBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export async function releaseMultimodalPromptModel(
  settings: Pick<Settings, "comfyUrl">
): Promise<boolean> {
  retainedMultimodalDevice = null;
  const response = await fetch(
    `${cleanBaseUrl(settings.comfyUrl)}/local-video-studio/multimodal-prompt/unload`,
    { method: "POST", signal: AbortSignal.timeout(15_000) }
  );
  if (!response.ok) throw new Error(`MultiModal Prompt 模型卸载失败（HTTP ${response.status}）`);
  const body = await response.json() as { unload_requested?: boolean };
  return Boolean(body.unload_requested);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

function modelRelativePath(directory: string, filename: string): string {
  return `${directory.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")}/${filename}`;
}

function objectInfoEnumValues(
  objectInfo: Record<string, unknown>,
  nodeType: string,
  inputName: string
): string[] {
  const node = objectInfo[nodeType];
  if (!node || typeof node !== "object") return [];
  const input = (node as { input?: unknown }).input;
  if (!input || typeof input !== "object") return [];
  const sections = input as { required?: unknown; optional?: unknown };
  for (const section of [sections.required, sections.optional]) {
    if (!section || typeof section !== "object") continue;
    const config = (section as Record<string, unknown>)[inputName];
    if (!Array.isArray(config) || !Array.isArray(config[0])) continue;
    return config[0].filter((value): value is string => typeof value === "string");
  }
  return [];
}

export function multimodalRuntimeSelection(
  objectInfo: Record<string, unknown>,
  modelId: string
): MultimodalRuntimeSelection {
  const definition = comfyMultimodalPromptModel(modelId);
  if (!definition) throw new Error("当前选择的提示词模型不是 ComfyUI 多模态模型。");
  const model = modelRelativePath(definition.targetDirectory, definition.modelFilename);
  const mmproj = modelRelativePath(definition.targetDirectory, definition.mmprojFilename);
  const acceptedModels = objectInfoEnumValues(objectInfo, "VisionLLMNode", "model");
  const acceptedMmprojs = objectInfoEnumValues(objectInfo, "VisionLLMNode", "mmproj");
  if (!acceptedModels.includes(model)) {
    throw new Error(
      `VisionLLMNode 尚未注册所选主模型：${model}。请确认文件位于登记目录，随后在设置页更新/重新安装 ComfyUI MultiModal Prompt Nodes 并重启 ComfyUI。`
    );
  }
  if (!acceptedMmprojs.includes(mmproj)) {
    throw new Error(
      `VisionLLMNode 尚未注册所选视觉投影文件：${mmproj}。该文件虽然可能已存在，但旧节点只识别 mmproj 前缀，无法安全用于 Qwen3.8。请在设置页更新/重新安装 ComfyUI MultiModal Prompt Nodes 并重启 ComfyUI。`
    );
  }
  return { model, mmproj };
}

function promptTargetLanguage(settings: Settings): "auto" | "zh" | "en" {
  return settings.promptLanguage === "zh" || settings.promptLanguage === "en"
    ? settings.promptLanguage
    : "auto";
}

function appendImageNodes(
  workflow: Record<string, PromptNode>,
  uploadedImages: readonly string[],
  targetNodeId: string
): void {
  if (!uploadedImages.length) return;
  let imageNodeId = "load-image-0";
  uploadedImages.forEach((filename, index) => {
    const nodeId = `load-image-${index}`;
    const budgetNodeId = `image-budget-${index}`;
    workflow[nodeId] = {
      class_type: "LoadImage",
      inputs: { image: filename }
    };
    workflow[budgetNodeId] = {
      class_type: "ImageScaleToTotalPixels",
      inputs: {
        image: [nodeId, 0],
        upscale_method: "lanczos",
        megapixels: 1,
        resolution_steps: 32
      }
    };
    if (index === 0) {
      imageNodeId = budgetNodeId;
      return;
    }
    const batchNodeId = `image-batch-${index}`;
    workflow[batchNodeId] = {
      class_type: "ImageBatch",
      inputs: {
        image1: [imageNodeId, 0],
        image2: [budgetNodeId, 0]
      }
    };
    imageNodeId = batchNodeId;
  });
  workflow[targetNodeId].inputs.image = [imageNodeId, 0];
}

export function buildMultimodalPromptWorkflow(
  request: EnhanceRequest,
  uploadedImages: readonly string[],
  settings: Settings,
  warmup = false,
  device: MultimodalDevice = "GPU",
  retainModel = false,
  runtimeSelection?: MultimodalRuntimeSelection
): Record<string, PromptNode> {
  const definition = comfyMultimodalPromptModel(settings.promptModelId);
  if (!definition) {
    throw new Error("当前选择的不是 ComfyUI 多模态提示词模型。");
  }
  const imageCount = request.imagePaths?.length ?? uploadedImages.length;
  const mode = request.h3PromptMode ?? inferH3PromptMode(
    Boolean(request.imagePath || imageCount > 0),
    imageCount > 1
  );
  const prompt = warmup
    ? "Reply with READY only."
    : request.mode === "image-edit"
      ? imageEditPromptInstruction(request)
      : h3PromptInstruction(request, settings.h3PromptPresets);
  const maxTokens = warmup
    // VisionLLMNode validates this input against its runtime schema.  Recent
    // MultiModal Prompt Nodes use a minimum of 64 tokens, so the warmup must
    // stay inside the same contract as a normal request instead of relying on
    // the old experimental value of 8.
    ? 64
    : request.mode === "image-edit"
      ? 768
      : mode === "R2V"
        ? 1536
        : 1024;
  const workflow: Record<string, PromptNode> = {
    "vision-llm": {
      class_type: "VisionLLMNode",
      inputs: {
        prompt,
        style: "raw",
        target_language: promptTargetLanguage(settings),
        model: runtimeSelection?.model ?? modelRelativePath(definition.targetDirectory, definition.modelFilename),
        mmproj: runtimeSelection?.mmproj ?? modelRelativePath(definition.targetDirectory, definition.mmprojFilename),
        max_tokens: maxTokens,
        // Keep the existing multimodal recommendation as an intentional
        // user-controlled range without allowing a
        // high-creativity prompt pass to destabilize H3 output.
        temperature: clamp(settings.promptCreativity, 0.2, 0.9),
        device,
        keep_model_loaded: retainModel
      }
    },
    preview: {
      class_type: "PreviewAny",
      inputs: { source: ["vision-llm", 0] }
    }
  };
  appendImageNodes(workflow, uploadedImages, "vision-llm");
  return workflow;
}

export async function enhancePromptWithMultimodalComfyUi(
  request: EnhanceRequest,
  settings: Settings,
  signal: AbortSignal,
  warmup = false,
  onProgress?: PromptProgressReporter,
  operationId: string = crypto.randomUUID(),
  retainModel = false,
  onSubmitted?: (promptId: string) => void
): Promise<string> {
  if (!request.prompt.trim() && !isH3ReferenceAutoPrompt(request)) throw new Error("请先输入需要扩写的提示词");
  validateH3ReferenceAutoPrompt(request);
  onProgress?.("checking", 5);
  const definition = comfyMultimodalPromptModel(settings.promptModelId);
  if (!definition) throw new Error("当前选择的提示词模型不是 ComfyUI 多模态模型。");
  const baseUrl = cleanBaseUrl(settings.comfyUrl);
  const operationStartedAt = Date.now();
  try {
    if (warmup || !retainModel) {
      try {
        await freeMemory(settings);
      } catch (error) {
        appLogger.warn("prompt", "multimodal-pre-release-failed", "Unable to release existing ComfyUI models before multimodal prompt generation", {
          error: error instanceof Error ? error.message : String(error)
        });
        throw new Error("无法在加载多模态提示词模型前释放 ComfyUI 已有模型；为避免显存冲突，本次扩写已停止。请先停止当前任务或重启 ComfyUI。", { cause: error });
      }
    }
    const residentDevice = retainModel &&
      retainedMultimodalDevice?.modelId === settings.promptModelId
      ? retainedMultimodalDevice.device
      : null;
    const metrics = residentDevice
      ? null
      : await getPerformanceMetrics(settings).catch(() => null);
    const device = residentDevice ?? multimodalDeviceFor(
      settings.promptModelId,
      metrics?.vramUsedBytes ?? null,
      metrics?.vramTotalBytes ?? null
    );
    appLogger.info("prompt", "multimodal-device-selected", "Selected multimodal prompt device", {
      modelId: settings.promptModelId,
      device,
      selection: residentDevice ? "retained" : "measured",
      vramUsedBytes: metrics?.vramUsedBytes ?? null,
      vramTotalBytes: metrics?.vramTotalBytes ?? null
    });
    const activityTimeoutMinutes = multimodalActivityTimeoutMinutes(
      settings.promptModelId,
      device
    );
    onProgress?.(
      "checking",
      10,
      device === "CPU" ? "GPU 显存余量不足，使用 CPU 推理以避免爆显存" : undefined
    );
    const objectInfo = await jsonRequest<Record<string, unknown>>(
      `${baseUrl}/object_info`,
      { signal }
    );
    const runtimeSelection = multimodalRuntimeSelection(
      objectInfo,
      settings.promptModelId
    );
    const uploadedImages = await Promise.all(
      (request.imagePaths ?? (request.imagePath ? [request.imagePath] : []))
        .filter(Boolean)
        .slice(0, 12)
        .map((filePath, index) => uploadInput(baseUrl, filePath, signal, `参考图 ${index + 1}`))
    );
      onProgress?.("uploading", 18);
    const prompt = buildMultimodalPromptWorkflow(
      request,
      uploadedImages,
      settings,
      warmup,
      device,
      retainModel,
      runtimeSelection
    );
    const missingNodes = missingWorkflowNodeTypes(prompt, objectInfo);
    if (missingNodes.length) {
      throw new Error(
        `当前 ComfyUI 未加载多模态提示词节点：${missingNodes.join("、")}。请安装/更新 ComfyUI MultiModal Prompt Nodes，并重启服务。`
      );
    }
    const clientId = `local-video-studio-multimodal-prompt-${operationId}`;
    const result = await jsonRequest<{ prompt_id?: string }>(`${baseUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, client_id: clientId }),
      signal
    });
    if (!result.prompt_id) throw new Error("ComfyUI 未返回提示词 Prompt ID");
    onSubmitted?.(result.prompt_id);
    const nodeTypes = Object.fromEntries(
      Object.entries(prompt).map(([id, value]) => [id, value.class_type])
    );
    appLogger.info("prompt", "comfy-submitted", "Multimodal prompt workflow submitted", {
      operationId,
      promptId: result.prompt_id,
      clientId,
      modelId: settings.promptModelId,
      device,
      activityTimeoutMinutes,
      nodeTypes: [...new Set(Object.values(nodeTypes))],
      inputImageCount: uploadedImages.length,
      maxTokens: prompt["vision-llm"]?.inputs.max_tokens ?? null
    });
    const history = await waitForTask(
      result.prompt_id,
      clientId,
      nodeTypes,
      settings,
      activityTimeoutMinutes,
      signal,
      (value, stage, determinate) => {
        const normalized = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
        onProgress?.(
          "generating",
          determinate ? Math.min(90, 25 + Math.round(normalized * 0.65)) : null,
          stage
        );
      },
      () => undefined,
      () => false,
      { operationId, modelId: settings.promptModelId }
    );
    onProgress?.("validating", 94);
    const output = extractStringNodeOutput(history, ["preview", "vision-llm"]);
    if (retainModel) {
      retainedMultimodalDevice = { modelId: settings.promptModelId, device };
    }
    appLogger.info("prompt", "comfy-output-extracted", "Multimodal prompt output extracted", {
      operationId,
      modelId: settings.promptModelId,
      outputLength: output.length,
      elapsedMs: Date.now() - operationStartedAt
    });
    if (warmup) return output;
    if (request.mode === "image-edit") {
      return normalizeQwenImageEditPromptOutput(output);
    }
    const imageCount = request.imagePaths?.length ?? 0;
    const mode = request.h3PromptMode ?? inferH3PromptMode(
      Boolean(request.imagePath || imageCount > 0),
      imageCount > 1
    );
    return normalizeH3PromptOutput(output, mode, request.h3DurationSeconds ?? 5);
  } finally {
    if (!retainModel) {
      const cleanupStartedAt = Date.now();
      try {
        await freeMemory(settings);
        appLogger.info("prompt", "cleanup-finished", "Multimodal prompt model cleanup finished", {
          operationId,
          modelId: settings.promptModelId,
          durationMs: Date.now() - cleanupStartedAt
        });
      } catch (error) {
        appLogger.error("prompt", "cleanup-failed", safeLogErrorMessage(error), {
          operationId,
          modelId: settings.promptModelId,
          durationMs: Date.now() - cleanupStartedAt
        });
      }
    }
  }
}

export async function warmMultimodalPromptModel(
  settings: Settings,
  signal: AbortSignal
): Promise<void> {
  await enhancePromptWithMultimodalComfyUi(
    {
      prompt: "加载提示词模型并返回 READY。",
      modelId: "prompt-runtime-warmup",
      mode: "faithful",
      h3PromptMode: "I2VA"
    },
    settings,
    signal,
    true,
    undefined,
    crypto.randomUUID(),
    true
  );
}
