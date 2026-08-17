import { promises as fs } from "node:fs";
import path from "node:path";
import type { EnhanceRequest, H3PromptMode, PromptProgressReporter, Settings } from "../../src/types.js";
import { managedPromptModel } from "../../src/core/prompt-models.js";
import {
  h3AutoPromptInstruction,
  isH3ReferenceAutoPrompt,
  validateH3ReferenceAutoPrompt
} from "../../src/core/h3-auto-prompter.js";
import {
  normalizeQwenImageEditPromptOutput,
  qwenImageEditPromptContract
} from "../../src/core/qwen-image-prompt.js";

interface WriterModel {
  id: string;
  name?: string;
  path?: string;
  projector?: string | null;
  runtime_ready?: boolean;
  missing_dependencies?: string[];
  setup_message?: string | null;
}

interface WriterErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export interface H3PromptWriterRuntimeDiagnostics {
  status?: string;
  message?: string;
  return_code_hex?: string;
  error?: string;
  error_type?: string;
  gpu_offload?: boolean | null;
  package_version?: string | null;
}

function baseUrl(settings: Pick<Settings, "comfyUrl">): string {
  return settings.comfyUrl.replace(/\/+$/, "");
}

async function writerRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const rawBody = await response.text().catch(() => "");
    let body: WriterErrorBody = {};
    try {
      body = rawBody ? JSON.parse(rawBody) as WriterErrorBody : {};
    } catch {
      // Older Writer versions can return an HTML/plain-text 500 page.
    }
    if (response.status === 404 && url.includes("/h3studio/")) {
      throw new Error("当前 ComfyUI 未加载 MiniMax H3 Prompt Writer。请在设置 → 节点与工作流中一键安装/更新，然后重启 ComfyUI。");
    }
    const message = body.error?.message || rawBody.trim() || `HTTP ${response.status}`;
    const details = body.error?.details ? `（${JSON.stringify(body.error.details)}）` : "";
    if (/(?:0xC000001D|-1073741795|illegal instruction|非法指令)/iu.test(`${message}${details}`)) {
      throw new Error(
        `H3 Prompt Writer 的 GGUF 原生运行库因 Windows 0xC000001D 非法指令崩溃。当前 llama-cpp-python wheel 与 CPU 指令集不兼容；请到设置 → 提示词扩写点击“重新安装/修复”，应用会切换兼容的动态 CPU 后端。${details}`
      );
    }
    throw new Error(`H3 Prompt Writer：${message}${details}`);
  }
  return await response.json() as T;
}

async function readWriterRuntimeDiagnostics(
  root: string,
  signal: AbortSignal
): Promise<H3PromptWriterRuntimeDiagnostics | null> {
  try {
    const response = await fetch(`${root}/h3studio/runtime/gguf/diagnostics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: true }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)])
    });
    if (!response.ok) return null;
    const body = await response.json() as {
      diagnostics?: H3PromptWriterRuntimeDiagnostics;
    };
    return body.diagnostics || null;
  } catch (error) {
    if (signal.aborted) throw error;
    // This endpoint was added after the first public node release. Older
    // nodes still support status/models and remain usable without diagnostics.
    return null;
  }
}

export function validateH3PromptWriterRuntime(
  diagnostics: H3PromptWriterRuntimeDiagnostics | null | undefined
): void {
  if (!diagnostics) return;
  const status = diagnostics.status?.toLowerCase() || "";
  const code = diagnostics.return_code_hex?.toUpperCase() || "";
  const detail = [diagnostics.message, diagnostics.error].filter(Boolean).join("：");
  if (status === "crashed" && (code === "0XC000001D" || /illegal instruction|非法指令/iu.test(detail))) {
    throw new Error(
      `H3 Prompt Writer 的 GGUF 原生运行库因 Windows ${code || "0xC000001D"} 非法指令崩溃。当前 llama-cpp-python wheel 与 CPU 指令集不兼容；请到设置 → 提示词扩写点击“重新安装/修复”，应用会切换兼容的动态 CPU 后端。${detail ? `（${detail}）` : ""}`
    );
  }
  if (["crashed", "timeout", "invalid_response"].includes(status)) {
    throw new Error(`H3 Prompt Writer 的 GGUF 运行时自检失败：${detail || status}。请到设置 → 提示词扩写查看运行依赖日志并修复。`);
  }
}

export async function testH3PromptWriter(
  settings: Pick<Settings, "comfyUrl">,
  signal?: AbortSignal
): Promise<{ version: string; models: WriterModel[]; diagnostics: H3PromptWriterRuntimeDiagnostics | null }> {
  const root = baseUrl(settings);
  const [status, catalog] = await Promise.all([
    writerRequest<{ version?: string }>(`${root}/h3studio/status`, {
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5_000)]) : AbortSignal.timeout(5_000)
    }),
    writerRequest<{ models?: WriterModel[] }>(`${root}/h3studio/models`, {
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5_000)]) : AbortSignal.timeout(5_000)
    })
  ]);
  const diagnostics = await readWriterRuntimeDiagnostics(
    root,
    signal || new AbortController().signal
  );
  return { version: status.version || "未知", models: catalog.models || [], diagnostics };
}

function writerMode(mode?: H3PromptMode, imageEdit = false): "T2VA" | "I2VA" | "FL2VA" | "L2VA" | "Reference" {
  if (imageEdit) return "Reference";
  return mode === "R2V" ? "Reference" : mode || "I2VA";
}

export function extractImageEditPromptFromWriter(value: string): string {
  const field = value.match(
    /(?:^|\n)\s*(?:[*#\s]*)(?:detailed_description|integrated_multimodal_description)\s*:\s*([\s\S]*?)(?=\n\s*(?:[*#\s]*)(?:subject_definitions|summary|retention_analysis|overall_soundscape|non_diegetic_music)\s*:|$)/iu
  );
  const extracted = field?.[1]?.trim() || value.trim();
  return normalizeQwenImageEditPromptOutput(extracted);
}

function imageEditSystemPrompt(request: EnhanceRequest): string {
  return qwenImageEditPromptContract(
    request.imageEditEnhanceMode === "faithful" ? "faithful" : "detail-enhance",
    request.imageEditPresetText,
    "writer"
  );
}

export function promptWriterModelForSelection(
  models: WriterModel[],
  logicalModelId: string
): WriterModel {
  const definition = managedPromptModel(logicalModelId);
  if (!definition) throw new Error("所选模型不是 H3 Prompt Writer 支持的 Gemma GGUF 模型。");
  const expected = definition.modelFilename.toLowerCase();
  const model = models.find((candidate) =>
    path.basename(candidate.path || candidate.id).toLowerCase() === expected
  );
  if (!model) {
    throw new Error(
      `ComfyUI 尚未在 models/LLM 中找到 ${definition.modelFilename}。请将 GGUF 与匹配的 mmproj-BF16.gguf 放在同一个独立子目录。`
    );
  }
  if (model.runtime_ready === false) {
    const missing = model.missing_dependencies?.join("、") || "GGUF 运行依赖";
    throw new Error(`H3 Prompt Writer 模型尚未就绪，缺少：${missing}${model.setup_message ? `。${model.setup_message}` : ""}`);
  }
  return model;
}

async function uploadMedia(
  root: string,
  sessionId: string,
  mode: ReturnType<typeof writerMode>,
  filenames: string[],
  signal: AbortSignal
): Promise<void> {
  if (!filenames.length) return;
  const form = new FormData();
  form.set("session_id", sessionId);
  form.set("mode", mode);
  for (const filename of filenames) {
    const bytes = await fs.readFile(filename, { signal });
    form.append("file", new Blob([bytes]), path.basename(filename));
  }
  await writerRequest(`${root}/h3studio/media/upload`, {
    method: "POST",
    body: form,
    signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)])
  });
}

export async function releaseH3PromptWriter(
  settings: Pick<Settings, "comfyUrl">
): Promise<boolean> {
  const response = await writerRequest<{ unload_requested?: boolean }>(
    `${baseUrl(settings)}/h3studio/unload`,
    { method: "POST", signal: AbortSignal.timeout(15_000) }
  );
  return Boolean(response.unload_requested);
}

export async function enhancePromptWithH3PromptWriter(
  request: EnhanceRequest,
  settings: Settings,
  signal: AbortSignal,
  onProgress?: PromptProgressReporter
): Promise<string> {
  if (!request.prompt.trim() && !isH3ReferenceAutoPrompt(request)) throw new Error("请先输入需要优化的提示词");
  validateH3ReferenceAutoPrompt(request);
  onProgress?.("checking", 5);
  const imageEdit = request.mode === "image-edit";
  const root = baseUrl(settings);
  const mode = writerMode(request.h3PromptMode, imageEdit);
  const sessionId = crypto.randomUUID();
  const mediaPaths = (request.referenceMediaPaths || request.imagePaths || (request.imagePath ? [request.imagePath] : []))
    .filter(Boolean)
    .slice(0, 12);
  const cancel = () => {
    void fetch(`${root}/h3studio/cancel`, { method: "POST" }).catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const { models, diagnostics } = await testH3PromptWriter(settings, signal);
    const model = promptWriterModelForSelection(models, settings.promptModelId);
    validateH3PromptWriterRuntime(diagnostics);
    await uploadMedia(root, sessionId, mode, mediaPaths, signal);
    onProgress?.("uploading", 18);
    onProgress?.("loading-model", 24);
    const creativeBrief = isH3ReferenceAutoPrompt(request)
      ? h3AutoPromptInstruction(request)
      : [request.prompt.trim(), request.referenceContext?.trim()]
          .filter(Boolean)
          .join("\n\n参考素材角色：\n");
    onProgress?.("generating", null);
    const result = await writerRequest<{ prompt?: string }>(`${root}/h3studio/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        creative_brief: creativeBrief,
        model_id: model.id,
        session_id: sessionId,
        ...(imageEdit ? { system_prompt_override: imageEditSystemPrompt(request) } : {}),
        aspect_ratio: request.h3AspectRatio || "16:9",
        duration_seconds: request.h3DurationSeconds || 5,
        thinking: false,
        unload_after: true,
        context_profile: "auto",
        kv_cache: "auto"
      }),
      signal
    });
    onProgress?.("validating", 94);
    if (!result.prompt?.trim()) throw new Error("H3 Prompt Writer 没有返回可用的提示词。");
    return imageEdit
      ? extractImageEditPromptFromWriter(result.prompt)
      : result.prompt.trim();
  } finally {
    onProgress?.("unloading", 98);
    signal.removeEventListener("abort", cancel);
    void fetch(`${root}/h3studio/media?session_id=${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(10_000)
    }).catch(() => undefined);
  }
}
