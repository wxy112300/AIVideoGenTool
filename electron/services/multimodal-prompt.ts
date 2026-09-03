import type {
  EnhanceRequest,
  PromptExecutionPreflight,
  PromptProgressReporter,
  Settings
} from "../../src/types.js";
import {
  comfyMultimodalPromptModel
} from "../../src/core/prompt-models.js";
import {
  inferH3PromptMode,
  h3PromptExpansionTokenBudget,
  normalizeH3PromptOutput
} from "../../src/core/h3-prompt.js";
import { h3PromptPresetForMode } from "../../src/core/h3-prompt-presets.js";
import {
  extractH3DialogueLocks,
  extractH3VisibleTextLocks,
  h3ContentLockInstruction,
  stripH3ContentFromSource
} from "../../src/core/h3-dialogue.js";
import {
  isH3ReferenceAutoPrompt,
  validateH3ReferenceAutoPrompt
} from "../../src/core/h3-auto-prompter.js";
import { normalizeQwenImageEditPromptOutput } from "../../src/core/qwen-image-prompt.js";
import { stripPromptAnnotations } from "../../src/core/prompt-annotations.js";
import { missingWorkflowNodeTypes } from "../../src/core/workflow.js";
import { getApplicationLogger, safeLogErrorMessage } from "../../src/infrastructure/app-logger.js";
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
const visionLlmMaxOutputTokens = 2048;
const minimumFreeVramForMultimodalModel: Record<string, number> = {
  "qwen/qwen3.6-27b-uncensored-q4": 20 * gib,
  "qwen/qwen3.8-27b-uncensored-q4": 20 * gib
};
let retainedMultimodalDevice: { modelId: string; device: MultimodalDevice } | null = null;

export function retainedMultimodalDeviceFor(modelId: string): MultimodalDevice | null {
  return retainedMultimodalDevice?.modelId === modelId
    ? retainedMultimodalDevice.device
    : null;
}
const appLogger = getApplicationLogger();

export function multimodalDeviceFor(
  modelId: string,
  vramUsedBytes: number | null,
  vramTotalBytes: number | null,
  allowCpuFallback = false
): MultimodalDevice {
  const preflight = multimodalExecutionPreflight(modelId, vramUsedBytes, vramTotalBytes);
  if (!preflight.requiresCpuConfirmation) return "GPU";
  if (allowCpuFallback) return "CPU";
  if (preflight.vramFreeBytes == null) {
    throw new Error(
      "无法确认 GPU 显存余量，已停止提示词增强；不会自动切换到 CPU。请关闭占用显存的程序后重试。"
    );
  }
  const freeVramGiB = (preflight.vramFreeBytes / gib).toFixed(1);
  const requiredVramGiB = ((preflight.requiredFreeVramBytes ?? 0) / gib).toFixed(0);
  throw new Error(
    `Qwen 27B GPU 推理需要至少 ${requiredVramGiB} GiB 空闲显存，当前约 ${freeVramGiB} GiB。` +
    "请关闭 Epic Games Launcher 等占用显存的程序后重试；应用不会自动切换到 CPU。"
  );
}

export function multimodalExecutionPreflight(
  modelId: string,
  vramUsedBytes: number | null,
  vramTotalBytes: number | null
): PromptExecutionPreflight {
  const requiredFreeVramBytes = minimumFreeVramForMultimodalModel[modelId] ?? null;
  const vramFreeBytes = vramUsedBytes == null || vramTotalBytes == null
    ? null
    : Math.max(0, vramTotalBytes - vramUsedBytes);
  return {
    requiresCpuConfirmation: requiredFreeVramBytes != null &&
      (vramFreeBytes == null || vramFreeBytes < requiredFreeVramBytes),
    modelId,
    vramUsedBytes,
    vramTotalBytes,
    vramFreeBytes,
    requiredFreeVramBytes
  };
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

export function multimodalPromptTargetLanguage(
  request: EnhanceRequest,
  settings: Pick<Settings, "promptLanguage" | "uiLocale">
): "zh" | "en" {
  if (settings.promptLanguage === "zh" || settings.promptLanguage === "en") {
    return settings.promptLanguage;
  }
  const userText = request.prompt.trim() || request.referenceContext?.trim() || "";
  const descriptiveText = stripH3ContentFromSource(userText);
  if (descriptiveText) return /\p{Script=Han}/u.test(descriptiveText) ? "zh" : "en";
  return settings.uiLocale?.startsWith("zh") ? "zh" : "en";
}

function multimodalLanguageValidatorCompatibilityInstruction(
  sourcePrompt: string
): string {
  const dialogueLocks = extractH3DialogueLocks(sourcePrompt);
  const visibleTextLocks = extractH3VisibleTextLocks(sourcePrompt);
  const literals = [...dialogueLocks, ...visibleTextLocks]
    .map((lock) => lock.text)
    .filter((text, index, all) => all.indexOf(text) === index);
  if (!literals.length) return "";
  const intermediateForms = [
    ...dialogueLocks.map((lock) => `<d>[${lock.language}] ${JSON.stringify(lock.text)}</d>`),
    ...visibleTextLocks.map((lock) => JSON.stringify(lock.text))
  ];
  return [
    "VisionLLM language-check compatibility (intermediate output only; do not include this note in the final prompt): the external language validator runs before the application's H3 cleanup and accepts a locked non-target-language literal only when it remains inside quote marks.",
    "Hard intermediate-format override for this VisionLLM call: supersede the unquoted <d> examples above. For every locked dialogue or visible-text literal below, preserve the exact original characters and keep them inside ASCII double quotes in the intermediate response. For dialogue, use <d>[Language] \"exact words\"</d>. Do not translate, paraphrase, or alter the quoted content; the application removes this temporary wrapper after validation.",
    `Intermediate forms: ${intermediateForms.join(", ")}`,
    `Locked literals: ${literals.map((literal) => JSON.stringify(literal)).join(", ")}`
  ].join("\n");
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
  const preset = h3PromptPresetForMode(mode, request.h3PromptPreset);
  const targetLanguage = warmup
    ? "en"
    : multimodalPromptTargetLanguage(request, settings);
  const basePrompt = warmup
    ? "Reply with READY only."
    : request.mode === "image-edit"
      ? imageEditPromptInstruction(request)
      : h3PromptInstruction(request, settings.h3PromptPresets);
  const sourcePrompt = stripPromptAnnotations(request.prompt);
  const contentLockInstruction = request.mode === "image-edit"
    ? ""
    : h3ContentLockInstruction(sourcePrompt);
  const languageValidatorInstruction = request.mode === "image-edit"
    ? ""
    : multimodalLanguageValidatorCompatibilityInstruction(sourcePrompt);
  const prompt = warmup
    ? basePrompt
    : [
        basePrompt,
        targetLanguage === "zh"
          ? "Output language override: write explanatory H3 prose and field descriptions in Chinese. This does not apply to dialogue, lyrics, voiceover words, or visible text: preserve each user's original language, characters, and punctuation exactly, including every dialogue lock. Return only the final prompt; do not include analysis, reasoning, planning notes, or a preface."
          : "Output language override: write explanatory H3 prose and field descriptions in English. This does not apply to dialogue, lyrics, voiceover words, or visible text: preserve each user's original language, characters, and punctuation exactly, including every dialogue lock. Return only the final prompt; do not include analysis, reasoning, planning notes, or a preface.",
        contentLockInstruction,
        languageValidatorInstruction
      ].join("\n\n");
  const maxTokens = warmup
    // VisionLLMNode validates this input against its runtime schema.  Recent
    // MultiModal Prompt Nodes use a minimum of 64 tokens, so the warmup must
    // stay inside the same contract as a normal request instead of relying on
    // the old experimental value of 8.
    ? 64
    : request.mode === "image-edit"
      ? 768
      : Math.min(
          visionLlmMaxOutputTokens,
          h3PromptExpansionTokenBudget(mode, request.h3DurationSeconds ?? 5, preset)
        );
  const workflow: Record<string, PromptNode> = {
    "vision-llm": {
      class_type: "VisionLLMNode",
      inputs: {
        prompt,
        style: "raw",
        target_language: targetLanguage,
        model: runtimeSelection?.model ?? modelRelativePath(definition.targetDirectory, definition.modelFilename),
        mmproj: runtimeSelection?.mmproj ?? modelRelativePath(definition.targetDirectory, definition.mmprojFilename),
        max_tokens: maxTokens,
        // Keep a bounded, duration-aware range while leaving enough headroom
        // for dialogue, references, and longer H3 timelines.
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
    if (residentDevice === "CPU" && request.allowCpuFallback !== true) {
      throw new Error("当前提示词模型驻留在 CPU；本次运行尚未获得继续使用 CPU 的确认。");
    }
    const metrics = residentDevice
      ? null
      : await getPerformanceMetrics(settings).catch(() => null);
    const device = residentDevice ?? multimodalDeviceFor(
      settings.promptModelId,
      metrics?.vramUsedBytes ?? null,
      metrics?.vramTotalBytes ?? null,
      request.allowCpuFallback === true
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
      10
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
    const sourcePrompt = stripPromptAnnotations(request.prompt);
    const imageCount = request.imagePaths?.length ?? 0;
    const mode = request.h3PromptMode ?? inferH3PromptMode(
      Boolean(request.imagePath || imageCount > 0),
      imageCount > 1
    );
    return normalizeH3PromptOutput(
      output,
      mode,
      request.h3DurationSeconds ?? 5,
      extractH3DialogueLocks(sourcePrompt),
      extractH3VisibleTextLocks(sourcePrompt),
      sourcePrompt,
      request.prompt
    );
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
  signal: AbortSignal,
  allowCpuFallback = false
): Promise<void> {
  await enhancePromptWithMultimodalComfyUi(
    {
      prompt: "加载提示词模型并返回 READY。",
      modelId: "prompt-runtime-warmup",
      mode: "faithful",
      h3PromptMode: "I2VA",
      allowCpuFallback
    },
    settings,
    signal,
    true,
    undefined,
    crypto.randomUUID(),
    true
  );
}
