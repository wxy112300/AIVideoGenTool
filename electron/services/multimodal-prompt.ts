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

function cleanBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

function modelRelativePath(directory: string, filename: string): string {
  return `${directory.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")}/${filename}`;
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
    workflow[nodeId] = {
      class_type: "LoadImage",
      inputs: { image: filename }
    };
    if (index === 0) return;
    const batchNodeId = `image-batch-${index}`;
    workflow[batchNodeId] = {
      class_type: "ImageBatch",
      inputs: {
        image1: [imageNodeId, 0],
        image2: [nodeId, 0]
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
  warmup = false
): Record<string, PromptNode> {
  const definition = comfyMultimodalPromptModel(settings.promptModelId);
  if (!definition) {
    throw new Error("当前选择的不是 Qwen3.6 ComfyUI 多模态提示词模型。");
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
    ? 8
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
        model: modelRelativePath(definition.targetDirectory, definition.modelFilename),
        mmproj: modelRelativePath(definition.targetDirectory, definition.mmprojFilename),
        max_tokens: maxTokens,
        // 0.7 is the Qwen3.6 instruct recommendation; keep the existing
        // setting as an intentional user-controlled range without allowing a
        // high-creativity prompt pass to destabilize H3 output.
        temperature: clamp(settings.promptCreativity, 0.2, 0.9),
        device: "GPU"
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
  onProgress?: PromptProgressReporter
): Promise<string> {
  if (!request.prompt.trim() && !isH3ReferenceAutoPrompt(request)) throw new Error("请先输入需要扩写的提示词");
  validateH3ReferenceAutoPrompt(request);
  onProgress?.("checking", 5);
  const definition = comfyMultimodalPromptModel(settings.promptModelId);
  if (!definition) throw new Error("当前选择的提示词模型不是 Qwen3.6 ComfyUI 多模态模型。");
  const baseUrl = cleanBaseUrl(settings.comfyUrl);
  try {
    const objectInfo = await jsonRequest<Record<string, unknown>>(
      `${baseUrl}/object_info`,
      { signal }
    );
    const uploadedImages = await Promise.all(
      (request.imagePaths ?? (request.imagePath ? [request.imagePath] : []))
        .filter(Boolean)
        .slice(0, 12)
        .map((filePath, index) => uploadInput(baseUrl, filePath, signal, `参考图 ${index + 1}`))
    );
      onProgress?.("uploading", 18);
    const prompt = buildMultimodalPromptWorkflow(request, uploadedImages, settings, warmup);
    const missingNodes = missingWorkflowNodeTypes(prompt, objectInfo);
    if (missingNodes.length) {
      throw new Error(
        `当前 ComfyUI 未加载 Qwen3.6 提示词节点：${missingNodes.join("、")}。请安装/更新 ComfyUI MultiModal Prompt Nodes，并重启服务。`
      );
    }
    const clientId = `local-video-studio-qwen36-prompt-${crypto.randomUUID()}`;
    const result = await jsonRequest<{ prompt_id?: string }>(`${baseUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, client_id: clientId }),
      signal
    });
    if (!result.prompt_id) throw new Error("ComfyUI 未返回提示词 Prompt ID");
    const nodeTypes = Object.fromEntries(
      Object.entries(prompt).map(([id, value]) => [id, value.class_type])
    );
    const history = await waitForTask(
      result.prompt_id,
      clientId,
      nodeTypes,
      settings,
      5,
      signal,
      (value, stage) => {
        const normalized = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
        onProgress?.("generating", Math.min(90, 25 + Math.round(normalized * 0.65)), stage);
      },
      () => undefined
    );
    onProgress?.("validating", 94);
    const output = extractStringNodeOutput(history, ["preview", "vision-llm"]);
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
    // VisionLLMNode unloads its own manager after execution. `/free` is the
    // second safety boundary so H3 never inherits Qwen3.6's VRAM/context state.
    await freeMemory(settings).catch(() => undefined);
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
    true
  );
}
