import { createNativeTranslator } from "../ui-translator.js";
import type { Translate } from "../../src/core/i18n.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
import { isMossImageModel } from "../../src/core/moss-image-spec.js";
import { normalizeMossImagePromptOutput } from "../../src/core/moss-image-prompt.js";
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
  h3PromptExpansionTokenBudget,
  h3PromptNodeOutputLimit,
  assertH3PromptOutputBudget,
  normalizeH3PromptOutput
} from "../../src/core/h3-prompt.js";
import { h3PromptPresetForMode } from "../../src/core/h3-prompt-presets.js";
import {
  extractH3DialogueLocks,
  extractH3VisibleTextLocks,
  h3ContentLockInstruction
} from "../../src/core/h3-dialogue.js";
import {
  h3PromptModeForRequest,
  isH3NativeStateContinuationRequest,
  isH3ReferenceAutoPrompt,
  validateH3ReferenceAutoPrompt
} from "../../src/core/h3-auto-prompter.js";
import { normalizeQwenImageEditPromptOutput } from "../../src/core/qwen-image-prompt.js";
import { applyPromptRevision, stripPromptAnnotations } from "../../src/core/prompt-annotations.js";
import { countPromptWords } from "../../src/core/prompt-count.js";
import { promptTargetLanguage } from "../../src/core/prompt-language.js";
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
  allowCpuFallback = false, t: Translate = createNativeTranslator(undefined).t
): MultimodalDevice {
  const preflight = multimodalExecutionPreflight(modelId, vramUsedBytes, vramTotalBytes);
  if (!preflight.requiresCpuConfirmation) return "GPU";
  if (allowCpuFallback) return "CPU";
  if (preflight.vramFreeBytes == null) {
    throw new Error(
      t(uiKeys.promptBackend.vramUnknown)
    );
  }
  const freeVramGiB = (preflight.vramFreeBytes / gib).toFixed(1);
  const requiredVramGiB = ((preflight.requiredFreeVramBytes ?? 0) / gib).toFixed(0);
  throw new Error(
    t(uiKeys.promptBackend.vramInsufficient, { required: requiredVramGiB, free: freeVramGiB }) +
    t(uiKeys.promptBackend.vramRecovery)
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
  settings: Pick<Settings, "comfyUrl"> & Partial<Pick<Settings, "uiLocale">>
): Promise<boolean> {
  const t = createNativeTranslator(settings.uiLocale).t;
  retainedMultimodalDevice = null;
  const response = await fetch(
    `${cleanBaseUrl(settings.comfyUrl)}/local-video-studio/multimodal-prompt/unload`,
    { method: "POST", signal: AbortSignal.timeout(15_000) }
  );
  if (!response.ok) throw new Error(t(uiKeys.promptBackend.unloadFailed, { status: response.status }));
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
  modelId: string, t: Translate = createNativeTranslator(undefined).t
): MultimodalRuntimeSelection {
  const definition = comfyMultimodalPromptModel(modelId);
  if (!definition) throw new Error(t(uiKeys.promptBackend.multimodalModelRequired));
  const model = modelRelativePath(definition.targetDirectory, definition.modelFilename);
  const mmproj = modelRelativePath(definition.targetDirectory, definition.mmprojFilename);
  const acceptedModels = objectInfoEnumValues(objectInfo, "VisionLLMNode", "model");
  const acceptedMmprojs = objectInfoEnumValues(objectInfo, "VisionLLMNode", "mmproj");
  if (!acceptedModels.includes(model)) {
    throw new Error(
      t(uiKeys.promptBackend.modelNotRegistered, { model: model })
    );
  }
  if (!acceptedMmprojs.includes(mmproj)) {
    throw new Error(
      t(uiKeys.promptBackend.projectorNotRegistered, { file: mmproj })
    );
  }
  return { model, mmproj };
}

export function multimodalPromptTargetLanguage(
  request: EnhanceRequest,
  settings: Pick<Settings, "promptLanguage" | "uiLocale">
): "zh" | "en" {
  return promptTargetLanguage(request, settings);
}

export function multimodalRuntimeMaxOutputTokens(
  objectInfo: Record<string, unknown>
): number {
  return h3PromptNodeOutputLimit(objectInfo, "VisionLLMNode", "max_tokens");
}

interface MultimodalRuntimeDiagnostics {
  finish_reason?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  max_tokens?: number;
}

export interface MultimodalPromptOutputDiagnostics {
  recognizedFields: string[];
  mainTimelineWords: number;
  outputWords: number;
  estimatedOutputTokens: number | null;
  requestedMaxTokens: number;
  finishReason: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  suspectedTruncation: boolean;
}

export function multimodalPromptOutputDiagnostics(
  output: string,
  mode: ReturnType<typeof h3PromptModeForRequest>,
  requestedMaxTokens: number,
  runtime: MultimodalRuntimeDiagnostics = {}
): MultimodalPromptOutputDiagnostics {
  const fields = [
    "subject_definitions",
    "summary",
    "retention_analysis",
    "detailed_description",
    "integrated_multimodal_description",
    "overall_soundscape",
    "non_diegetic_music"
  ];
  const recognizedFields = fields.filter((field) =>
    new RegExp(`^${field}\\s*:`, "imu").test(output)
  );
  const mainField = mode === "R2V" ? "detailed_description" : "integrated_multimodal_description";
  const mainMatch = new RegExp(`^${mainField}\\s*:`, "imu").exec(output);
  let timeline = "";
  if (mainMatch) {
    const remaining = output.slice(mainMatch.index + mainMatch[0].length);
    const nextField = /\n\s*(?:subject_definitions|summary|retention_analysis|detailed_description|integrated_multimodal_description|overall_soundscape|non_diegetic_music)\s*:/imu.exec(remaining);
    timeline = nextField?.index === undefined ? remaining : remaining.slice(0, nextField.index);
  }
  const finishReason = typeof runtime.finish_reason === "string" ? runtime.finish_reason : "";
  const completionTokens = Number.isFinite(runtime.completion_tokens)
    ? Math.max(0, Math.trunc(Number(runtime.completion_tokens)))
    : null;
  const promptTokens = Number.isFinite(runtime.prompt_tokens)
    ? Math.max(0, Math.trunc(Number(runtime.prompt_tokens)))
    : null;
  const totalTokens = Number.isFinite(runtime.total_tokens)
    ? Math.max(0, Math.trunc(Number(runtime.total_tokens)))
    : null;
  return {
    recognizedFields,
    mainTimelineWords: countPromptWords(timeline),
    outputWords: countPromptWords(output),
    estimatedOutputTokens: null,
    requestedMaxTokens,
    finishReason,
    promptTokens,
    completionTokens,
    totalTokens,
    suspectedTruncation: finishReason === "length" ||
      (completionTokens !== null && completionTokens >= requestedMaxTokens - 8)
  };
}

export function multimodalPromptFailureDiagnostic(
  diagnostics: MultimodalPromptOutputDiagnostics, t: Translate = createNativeTranslator(undefined).t
): string {
  const tokenDetail = diagnostics.completionTokens === null
    ? t(uiKeys.promptBackend.tokensUnknown)
    : t(uiKeys.promptBackend.tokenCount, { count: diagnostics.completionTokens, limit: diagnostics.requestedMaxTokens });
  if (diagnostics.suspectedTruncation) {
    return t(uiKeys.promptBackend.truncationDiagnostic, { tokens: tokenDetail, reason: diagnostics.finishReason || t(uiKeys.promptBackend.unknown) });
  }
  if (diagnostics.finishReason) {
    return diagnostics.completionTokens === null
      ? t(uiKeys.promptBackend.lengthUnknownDiagnostic, { reason: diagnostics.finishReason, tokens: tokenDetail })
      : t(uiKeys.promptBackend.earlyStopDiagnostic, { reason: diagnostics.finishReason, tokens: tokenDetail });
  }
  return t(uiKeys.promptBackend.diagnosticsMissing);
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

/** Shared Pack semantics; only VisionLLM needs its intermediate language-validator wrapper. */
export function multimodalPromptInstruction(request: EnhanceRequest, settings: Settings, visionLlm = false): string {
  const language = multimodalPromptTargetLanguage(request, settings);
  return [
    request.mode === "image-edit" ? imageEditPromptInstruction(request) : h3PromptInstruction(request, settings.h3PromptPresets, settings.uiLocale),
    request.mode === "image-edit" ? "" : language === "zh"
      ? "Write explanatory H3 prose in Chinese; keep official H3 field names in English ASCII. Preserve user dialogue, lyrics and visible text verbatim in their original language. Return only the final prompt, without reasoning or a preface."
      : "Write explanatory H3 prose in English; keep official H3 field names in English ASCII. Preserve user dialogue, lyrics and visible text verbatim in their original language. Return only the final prompt, without reasoning or a preface.",
    request.mode === "image-edit" ? "" : h3ContentLockInstruction(stripPromptAnnotations(request.prompt)),
    visionLlm && request.mode !== "image-edit" ? multimodalLanguageValidatorCompatibilityInstruction(stripPromptAnnotations(request.prompt)) : ""
  ].filter(Boolean).join("\n\n");
}

export function normalizeMultimodalPromptOutput(output: string, request: EnhanceRequest, locale: Settings["uiLocale"] = "zh-CN"): string {
  if (request.promptStrategy === "targeted-revision") return applyPromptRevision(request.prompt, output, locale);
  if (request.mode === "image-edit" && isMossImageModel(request.imageTargetModelId)) return normalizeMossImagePromptOutput(output);
  if (request.mode === "image-edit") return normalizeQwenImageEditPromptOutput(output);
  const source = stripPromptAnnotations(request.prompt);
  const continuation = isH3NativeStateContinuationRequest(request);
  return normalizeH3PromptOutput(output, h3PromptModeForRequest(request), request.h3DurationSeconds ?? 5,
    extractH3DialogueLocks(source), extractH3VisibleTextLocks(source), source, request.prompt,
    continuation, continuation, request.continuumPreviousChunk, request.h3PromptPreset, locale);
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
  runtimeSelection?: MultimodalRuntimeSelection,
  runtimeMaxOutputTokens = 2048
): Record<string, PromptNode> {
  const t = createNativeTranslator(settings.uiLocale).t;
  const definition = comfyMultimodalPromptModel(settings.promptModelId);
  if (!definition) {
    throw new Error(t(uiKeys.promptBackend.multimodalWorkflowModelRequired));
  }
  const mode = h3PromptModeForRequest(request);
  const preset = h3PromptPresetForMode(mode, request.h3PromptPreset);
  const targetLanguage = warmup
    ? "en"
    : multimodalPromptTargetLanguage(request, settings);
  const basePrompt = warmup
    ? "Reply with READY only."
    : request.mode === "image-edit"
      ? imageEditPromptInstruction(request)
      : h3PromptInstruction(request, settings.h3PromptPresets, settings.uiLocale);
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
          ? "Output language override: write explanatory H3 prose in Chinese, but keep every official H3 field name exactly in its required English ASCII form, including integrated_multimodal_description, overall_soundscape, and non_diegetic_music. This does not apply to dialogue, lyrics, voiceover words, or visible text: preserve each user's original language, characters, and punctuation exactly, including every dialogue lock. Return only the final prompt; do not include analysis, reasoning, planning notes, or a preface."
          : "Output language override: write explanatory H3 prose in English and keep every official H3 field name exactly in its required English ASCII form. This does not apply to dialogue, lyrics, voiceover words, or visible text: preserve each user's original language, characters, and punctuation exactly, including every dialogue lock. Return only the final prompt; do not include analysis, reasoning, planning notes, or a preface.",
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
      : h3PromptExpansionTokenBudget(mode, request.h3DurationSeconds ?? 5, preset, request.prompt);
  assertH3PromptOutputBudget(maxTokens, runtimeMaxOutputTokens, "MultiModal Qwen", settings.uiLocale);
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
  const t = createNativeTranslator(settings.uiLocale).t;
  if (!request.prompt.trim() && !isH3ReferenceAutoPrompt(request)) throw new Error(t(uiKeys.promptBackend.promptRequired));
  validateH3ReferenceAutoPrompt(request, settings.uiLocale);
  onProgress?.("checking", 5);
  const definition = comfyMultimodalPromptModel(settings.promptModelId);
  if (!definition) throw new Error(t(uiKeys.promptBackend.multimodalModelRequired));
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
        throw new Error(t(uiKeys.promptBackend.releaseFailed), { cause: error });
      }
    }
    const residentDevice = retainModel &&
      retainedMultimodalDevice?.modelId === settings.promptModelId
      ? retainedMultimodalDevice.device
      : null;
    if (residentDevice === "CPU" && request.allowCpuFallback !== true) {
      throw new Error(t(uiKeys.promptBackend.cpuConfirmationRequired));
    }
    const metrics = residentDevice
      ? null
      : await getPerformanceMetrics(settings).catch(() => null);
    const device = residentDevice ?? multimodalDeviceFor(
      settings.promptModelId,
      metrics?.vramUsedBytes ?? null,
      metrics?.vramTotalBytes ?? null,
      request.allowCpuFallback === true, t
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
      { signal }, t
    );
    const runtimeSelection = multimodalRuntimeSelection(
      objectInfo,
      settings.promptModelId, t
    );
    const runtimeMaxOutputTokens = multimodalRuntimeMaxOutputTokens(objectInfo);
    const uploadedImages = await Promise.all(
      (request.imagePaths ?? (request.imagePath ? [request.imagePath] : []))
        .filter(Boolean)
        .slice(0, 12)
        .map((filePath, index) => uploadInput(baseUrl, filePath, signal, t(uiKeys.promptBackend.referenceImage, { number: index + 1 }), t))
    );
      onProgress?.("uploading", 18);
    const prompt = buildMultimodalPromptWorkflow(
      request,
      uploadedImages,
      settings,
      warmup,
      device,
      retainModel,
      runtimeSelection,
      runtimeMaxOutputTokens
    );
    const missingNodes = missingWorkflowNodeTypes(prompt, objectInfo);
    if (missingNodes.length) {
      throw new Error(
        t(uiKeys.promptBackend.multimodalNodesMissing, { nodes: missingNodes.join(t(uiKeys.nodeInstaller.listSeparator)) })
      );
    }
    const clientId = `local-video-studio-multimodal-prompt-${operationId}`;
    const result = await jsonRequest<{ prompt_id?: string }>(`${baseUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, client_id: clientId }),
      signal
    }, t);
    if (!result.prompt_id) throw new Error(t(uiKeys.promptBackend.promptIdMissing));
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
    const output = extractStringNodeOutput(history, ["preview", "vision-llm"], t);
    const runtimeDiagnostics = await jsonRequest<MultimodalRuntimeDiagnostics>(
      `${baseUrl}/local-video-studio/multimodal-prompt/diagnostics`,
      { signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]) }, t
    ).catch(() => ({}));
    const requestedMaxTokens = Number(prompt["vision-llm"]?.inputs.max_tokens ?? 0);
    const outputDiagnostics = multimodalPromptOutputDiagnostics(
      output,
      h3PromptModeForRequest(request),
      requestedMaxTokens,
      runtimeDiagnostics
    );
    if (retainModel) {
      retainedMultimodalDevice = { modelId: settings.promptModelId, device };
    }
    appLogger.info("prompt", "comfy-output-extracted", "Multimodal prompt output extracted", {
      operationId,
      modelId: settings.promptModelId,
      outputLength: output.length,
      ...outputDiagnostics,
      elapsedMs: Date.now() - operationStartedAt
    });
    if (warmup) return output;
    if (request.promptStrategy === "targeted-revision") {
      return applyPromptRevision(request.prompt, output, settings.uiLocale);
    }
    if (request.mode === "image-edit") {
      return normalizeQwenImageEditPromptOutput(output);
    }
    try {
      return normalizeMultimodalPromptOutput(output, request, settings.uiLocale);
    } catch (error) {
      const diagnostic = multimodalPromptFailureDiagnostic(outputDiagnostics, t);
      appLogger.warn("prompt", "comfy-output-validation-failed", "Multimodal prompt output failed validation", {
        operationId,
        modelId: settings.promptModelId,
        error: safeLogErrorMessage(error),
        ...outputDiagnostics
      });
      throw new Error(`${safeLogErrorMessage(error)} ${diagnostic}`, { cause: error });
    }
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
