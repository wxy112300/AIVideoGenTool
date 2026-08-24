import type { EnhanceRequest, PromptProgressReporter, Settings } from "../../src/types.js";
import {
  qwenVlPeftPromptModel
} from "../../src/core/prompt-models.js";
import {
  inferH3PromptMode,
  normalizeH3PromptOutput
} from "../../src/core/h3-prompt.js";
import { extractH3DialogueLocks } from "../../src/core/h3-dialogue.js";
import {
  isH3ReferenceAutoPrompt,
  validateH3ReferenceAutoPrompt
} from "../../src/core/h3-auto-prompter.js";
import { normalizeQwenImageEditPromptOutput } from "../../src/core/qwen-image-prompt.js";
import { missingWorkflowNodeTypes } from "../../src/core/workflow.js";
import { getApplicationLogger, safeLogErrorMessage } from "./app-logger.js";
import {
  extractStringNodeOutput,
  freeMemory,
  h3PromptInstruction,
  imageEditPromptInstruction,
  jsonRequest,
  uploadInput,
  waitForTask
} from "./comfy-ui.js";
import { ensureQwenVlManagedMetadata } from "./qwenvl-model-assets.js";

type PromptNode = { class_type: string; inputs: Record<string, unknown> };

type QwenVlNodeInfo = {
  input?: {
    required?: Record<string, unknown>;
    optional?: Record<string, unknown>;
  };
};

/**
 * The Qwen-VL node exposes model folders as a ComfyUI enum.  Unlike most
 * node inputs, this enum is built when the custom node module is imported and
 * can therefore be stale after a model is copied into the ComfyUI data
 * directory.  Keep the check here, next to the API workflow, so a bad enum
 * never reaches /prompt as a cryptic 400 validation error.
 */
function qwenVlInputChoices(
  objectInfo: Record<string, unknown>,
  nodeType: string,
  inputName: string
): string[] | null {
  const node = objectInfo[nodeType];
  if (!node || typeof node !== "object" || Array.isArray(node)) return null;
  const input = (node as QwenVlNodeInfo).input;
  if (!input || typeof input !== "object") return null;
  const descriptor = input.required?.[inputName] ?? input.optional?.[inputName];
  if (!Array.isArray(descriptor) || !Array.isArray(descriptor[0])) return null;
  return descriptor[0].filter((value): value is string => typeof value === "string");
}

function normalizedModelChoice(value: string): string {
  return value
    .replace(/\\/gu, "/")
    .replace(/\/+$/u, "")
    .split("/")
    .filter(Boolean)
    .at(-1)
    ?.trim()
    .toLocaleLowerCase() ?? "";
}

function modelChoiceMatches(choices: readonly string[], expected: string): boolean {
  const normalizedExpected = normalizedModelChoice(expected);
  return choices.some((choice) => normalizedModelChoice(choice) === normalizedExpected);
}

function formatRuntimeChoices(choices: readonly string[]): string {
  if (choices.length === 0) return "没有可选项";
  const visible = choices.slice(0, 8).join("、");
  return choices.length > 8 ? `${visible} 等 ${choices.length} 项` : visible;
}

export class QwenVlRuntimeValidationError extends Error {
  readonly nodeType: string;
  readonly inputName: string;
  readonly expected: string;
  readonly choices: readonly string[];
  readonly needsRuntimeRefresh: boolean;

  constructor(
    nodeType: string,
    inputName: string,
    expected: string,
    choices: readonly string[]
  ) {
    const onlyNone = choices.length === 1 && choices[0] === "(none)";
    const reason = onlyNone
      ? "当前节点只发现了 (none)，通常表示模型是在 ComfyUI 启动后才放入，或当前服务使用了另一份数据目录"
      : `当前节点可选项为：${formatRuntimeChoices(choices)}`;
    super(
      `Qwen-VL 运行时未找到 ${inputName} “${expected}”（${reason}）。` +
      "请确认当前 ComfyUI 数据目录下的模型路径，并重启 ComfyUI 让节点重新扫描；若服务由 Local Video Studio 管理会自动尝试刷新，外部启动的服务请手动重启后再扫描。"
    );
    this.name = "QwenVlRuntimeValidationError";
    this.nodeType = nodeType;
    this.inputName = inputName;
    this.expected = expected;
    this.choices = [...choices];
    this.needsRuntimeRefresh = onlyNone;
  }
}

/**
 * Turn the otherwise opaque Python errno into an actionable, portable repair
 * instruction. The repair is applied by the app's dependency installer to
 * the selected ComfyUI data directory; no machine-specific path is embedded.
 */
export function explainQwenVlRuntimeError(error: unknown): unknown {
  const message = error instanceof Error ? error.message : String(error);
  if (!/bad file descriptor|errno\s*9|0x?9\b/iu.test(message)) return error;
  if (/节点与工作流中执行一键修复/iu.test(message)) return error;
  return new Error(
    `${message}；ComfyUI Desktop 的日志句柄已失效，请在设置 → 节点与工作流中对 ComfyUI Qwen-VL LoRA 执行一键修复，然后重启 ComfyUI`
  );
}

export function validateQwenVlRuntimeChoices(
  objectInfo: Record<string, unknown>,
  settings: Settings
): void {
  const definition = qwenVlPeftPromptModel(settings.promptModelId);
  if (!definition) return;
  const expectedBase = modelFolderName(
    definition.baseModelDirectory,
    definition.baseModelName ?? "qwen3-vl-8b-instruct"
  );
  const expectedAdapter = modelFolderName(
    definition.adapterDirectory,
    definition.adapterName ?? "minimax-h3-prompt-rewriter-8b"
  );
  const checks = [
    {
      nodeType: "QwenVLModelLoader",
      inputName: "model_name",
      expected: expectedBase
    },
    {
      nodeType: "QwenVLLoRALoader",
      inputName: "lora_name",
      expected: expectedAdapter
    }
  ] as const;
  for (const check of checks) {
    const choices = qwenVlInputChoices(objectInfo, check.nodeType, check.inputName);
    // Older versions of the node may not expose an enum in object_info.  The
    // class-type check still protects the workflow in that case; only reject
    // when ComfyUI explicitly returned a selectable list that omits the file.
    if (choices && !modelChoiceMatches(choices, check.expected)) {
      throw new QwenVlRuntimeValidationError(
        check.nodeType,
        check.inputName,
        check.expected,
        choices
      );
    }
  }
}

const appLogger = getApplicationLogger();

function cleanBaseUrl(url: string): string {
  return url.replace(/\/+$/u, "");
}

function modelFolderName(value: string | undefined, fallback: string): string {
  return value?.replace(/\\/gu, "/").split("/").filter(Boolean).at(-1) || fallback;
}

function imagePathForRequest(request: EnhanceRequest): string | null {
  const candidates = [
    ...(request.imagePaths ?? []),
    request.imagePath ?? ""
  ].filter(Boolean);
  const image = candidates.find((value) =>
    /\.(?:png|jpe?g|webp|bmp|gif)$/iu.test(value)
  );
  return image || null;
}

function promptForRequest(request: EnhanceRequest, settings: Settings, warmup: boolean): string {
  if (warmup) return "Reply with READY only. Do not describe the placeholder image.";
  return request.mode === "image-edit"
    ? imageEditPromptInstruction(request)
    : h3PromptInstruction(request, settings.h3PromptPresets);
}

/**
 * Build the API graph for Dangocan/comfyui_qwenvl_lora.  The node package
 * intentionally owns Transformers/PEFT loading; the app only supplies the
 * bound base-folder name, adapter-folder name, and H3 instruction.
 */
export function buildQwenVlPeftPromptWorkflow(
  request: EnhanceRequest,
  uploadedImage: string | null,
  settings: Settings,
  warmup = false
): Record<string, PromptNode> {
  const definition = qwenVlPeftPromptModel(settings.promptModelId);
  if (!definition) throw new Error("当前选择的不是 Qwen3-VL PEFT 提示词模型。");
  const baseDirectory = definition.baseModelDirectory ?? "LLM/Qwen-VL/qwen3-vl-8b-instruct";
  const adapterDirectory = definition.adapterDirectory ?? "LLM/Qwen-VL-LoRA/minimax-h3-prompt-rewriter-8b";
  const mode = request.h3PromptMode ?? inferH3PromptMode(
    Boolean(request.imagePath || request.imagePaths?.length),
    (request.imagePaths?.length ?? 0) > 1
  );
  const prompt = promptForRequest(request, settings, warmup);
  const workflow: Record<string, PromptNode> = {
    "qwenvl-model": {
      class_type: "QwenVLModelLoader",
      inputs: {
        model_name: modelFolderName(baseDirectory, definition.baseModelName ?? "qwen3-vl-8b-instruct"),
        quantization: "4-bit (VRAM-friendly)",
        attention_mode: "sdpa",
        device: "auto",
        use_compile: false
      }
    },
    "qwenvl-lora": {
      class_type: "QwenVLLoRALoader",
      inputs: {
        model: ["qwenvl-model", 0],
        lora_name: modelFolderName(adapterDirectory, definition.adapterName ?? "minimax-h3-prompt-rewriter-8b"),
        strength: 1.0
      }
    },
    "qwenvl-caption": {
      class_type: "QwenVLCaption",
      inputs: {
        model: ["qwenvl-lora", 0],
        prompt,
        max_new_tokens: warmup ? 64 : mode === "R2V" ? 1536 : 1280
      }
    }
  };
  if (uploadedImage) {
    workflow["qwenvl-image"] = {
      class_type: "LoadImage",
      inputs: { image: uploadedImage }
    };
    workflow["qwenvl-image-budget"] = {
      class_type: "ImageScaleToTotalPixels",
      inputs: {
        image: ["qwenvl-image", 0],
        upscale_method: "lanczos",
        megapixels: 1,
        resolution_steps: 32
      }
    };
    workflow["qwenvl-caption"]!.inputs.image = ["qwenvl-image-budget", 0];
  } else {
    workflow["qwenvl-image"] = {
      class_type: "EmptyImage",
      inputs: { width: 64, height: 64, batch_size: 1, color: 0 }
    };
    workflow["qwenvl-caption"]!.inputs.image = ["qwenvl-image", 0];
  }
  return workflow;
}

function activityTimeoutMinutes(): number {
  return 12;
}

export async function enhancePromptWithQwenVlPeft(
  request: EnhanceRequest,
  settings: Settings,
  signal: AbortSignal,
  warmup = false,
  onProgress?: PromptProgressReporter,
  operationId: string = crypto.randomUUID(),
  retainModel = false,
  onSubmitted?: (promptId: string) => void
): Promise<string> {
  if (!request.prompt.trim() && !isH3ReferenceAutoPrompt(request)) {
    throw new Error("请先输入需要扩写的提示词");
  }
  validateH3ReferenceAutoPrompt(request);
  const definition = qwenVlPeftPromptModel(settings.promptModelId);
  if (!definition) throw new Error("当前选择的不是 Qwen3-VL PEFT 提示词模型。");
  const baseUrl = cleanBaseUrl(settings.comfyUrl);
  const startedAt = Date.now();
  try {
    onProgress?.("checking", 5);
    await ensureQwenVlManagedMetadata(settings, signal, onProgress);
    if (warmup || !retainModel) await freeMemory(settings);
    const objectInfo = await jsonRequest<Record<string, unknown>>(
      `${baseUrl}/object_info`,
      { signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) }
    );
    validateQwenVlRuntimeChoices(objectInfo, settings);
    const sourceImage = imagePathForRequest(request);
    const uploadedImage = sourceImage
      ? await uploadInput(baseUrl, sourceImage, signal, "提示词参考图")
      : null;
    onProgress?.("uploading", 18);
    const prompt = buildQwenVlPeftPromptWorkflow(request, uploadedImage, settings, warmup);
    const missingNodes = missingWorkflowNodeTypes(prompt, objectInfo);
    if (missingNodes.length) {
      throw new Error(
        `当前 ComfyUI 未加载 Qwen3-VL Prompt LoRA 节点：${missingNodes.join("、")}。请在设置 → 节点与工作流中安装/更新 ComfyUI Qwen-VL LoRA，然后重启服务。`
      );
    }
    const clientId = `local-video-studio-qwenvl-prompt-${operationId}`;
    const result = await jsonRequest<{ prompt_id?: string }>(`${baseUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, client_id: clientId }),
      signal
    });
    if (!result.prompt_id) throw new Error("ComfyUI 未返回 Qwen3-VL 提示词 Prompt ID");
    onSubmitted?.(result.prompt_id);
    const nodeTypes = Object.fromEntries(
      Object.entries(prompt).map(([id, value]) => [id, value.class_type])
    );
    appLogger.info("prompt", "qwenvl-peft-submitted", "Qwen3-VL PEFT prompt workflow submitted", {
      operationId,
      promptId: result.prompt_id,
      clientId,
      modelId: settings.promptModelId,
      inputImage: Boolean(uploadedImage),
      nodeTypes: [...new Set(Object.values(nodeTypes))]
    });
    const history = await waitForTask(
      result.prompt_id,
      clientId,
      nodeTypes,
      settings,
      activityTimeoutMinutes(),
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
    const output = extractStringNodeOutput(history, ["qwenvl-caption"]);
    if (warmup) return output;
    if (request.mode === "image-edit") return normalizeQwenImageEditPromptOutput(output);
    const imageCount = request.imagePaths?.length ?? 0;
    const mode = request.h3PromptMode ?? inferH3PromptMode(
      Boolean(request.imagePath || imageCount > 0),
      imageCount > 1
    );
    return normalizeH3PromptOutput(
      output,
      mode,
      request.h3DurationSeconds ?? 5,
      extractH3DialogueLocks(request.prompt)
    );
  } catch (error) {
    const reportedError = explainQwenVlRuntimeError(error);
    appLogger.error("prompt", "qwenvl-peft-failed", safeLogErrorMessage(reportedError), {
      operationId,
      modelId: settings.promptModelId,
      durationMs: Date.now() - startedAt
    });
    throw reportedError;
  } finally {
    if (!retainModel) {
      try {
        await freeMemory(settings);
        appLogger.info("prompt", "qwenvl-peft-cleanup-finished", "Qwen3-VL PEFT prompt model cleanup finished", {
          operationId,
          modelId: settings.promptModelId
        });
      } catch (error) {
        appLogger.error("prompt", "qwenvl-peft-cleanup-failed", safeLogErrorMessage(error), {
          operationId,
          modelId: settings.promptModelId
        });
      }
    }
  }
}

export async function warmQwenVlPeftPromptModel(
  settings: Settings,
  signal: AbortSignal
): Promise<void> {
  await enhancePromptWithQwenVlPeft(
    {
      prompt: "加载 Qwen3-VL Prompt Rewriter 并返回 READY。",
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
