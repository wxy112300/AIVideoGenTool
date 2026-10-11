import { promises as fs } from "node:fs";
import path from "node:path";
import type { EnhanceRequest, Settings, PromptProgressReporter } from "../../src/types.js";
import { assertDetailedCinematicExpansion } from "../../src/core/h3-prompt.js";
import { h3PromptModeForRequest } from "../../src/core/h3-auto-prompter.js";
import { estimateH3TextTokens } from "../../src/core/h3-token-count.js";
import { multimodalPromptInstruction, normalizeMultimodalPromptOutput } from "./multimodal-prompt.js";
import type { StrataChatRequest, StrataContentPart } from "./strata-service.js";
import type { StrataRuntimePolicy } from "./strata-model-preparation.js";
import type { StrataRuntimeOwner } from "./strata-runtime-owner.js";
import { withStrataReferenceMedia } from "./strata-reference-media.js";

/** Bounded 4090-oriented baseline, no MTP/downloads or silent CPU fallback. */
export function strataPromptPolicy(_settings: Pick<Settings, "vramReserveGb">): StrataRuntimePolicy {
  return { maxContext: 32768, kv: "k8v4", visionTokens: 1024, visionGpu: true,
    vramReserveMiB: 2048 };
}

export async function strataImageContent(filename: string, signal: AbortSignal): Promise<StrataContentPart> {
  signal.throwIfAborted();
  const stat = await fs.stat(filename);
  if (!stat.isFile() || stat.size === 0 || stat.size > 32 * 1024 ** 2) throw new Error("参考图为空或超过 32 MiB，请缩小图片后重试。");
  const bytes = await fs.readFile(filename, { signal });
  const mime = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png"
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg"
    : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" ? "image/webp" : null;
  if (!mime) throw new Error(`Strata 参考图格式不支持：${path.basename(filename)}；请使用 PNG、JPEG 或 WebP。`);
  signal.throwIfAborted();
  return { type: "image_url", image_url: { url: `data:${mime};base64,${bytes.toString("base64")}` } };
}

export async function buildStrataPromptRequest(
  request: EnhanceRequest, settings: Settings, signal: AbortSignal,
  encodeImage: typeof strataImageContent = strataImageContent
): Promise<StrataChatRequest> {
  const paths = [...new Set(request.imagePaths ?? (request.imagePath ? [request.imagePath] : []))].filter(Boolean);
  if (paths.length > 12) throw new Error("Strata 每次最多接收 12 张参考图。");
  const instruction = multimodalPromptInstruction(request, settings);
  // A language-aware estimate for early feedback, followed by the server's real tokenizer check.
  const maxTokens = request.mode === "image-edit" ? 4096 : 8192;
  if (estimateH3TextTokens(instruction) + paths.length * 1024 + maxTokens + 1024 > 32768) {
    throw new Error("提示词与参考图超过当前 32K 上下文预算；请缩短输入或减少参考图。不会截断原始指令。");
  }
  const content: StrataContentPart[] = [{ type: "text", text: instruction }];
  let encodedBytes = instruction.length;
  for (const filename of paths) {
    const image = await encodeImage(filename, signal);
    encodedBytes += image.type === "image_url" ? image.image_url.url.length : 0;
    if (encodedBytes > 48 * 1024 ** 2) throw new Error("参考图合计超过请求大小限制，请缩小图片后重试。");
    content.push(image);
  }
  signal.throwIfAborted();
  return { modelId: settings.promptModelId, messages: [{ role: "user", content }],
    maxTokens, contextSize: 32768, visionTokensPerImage: 1024,
    temperature: Math.min(1, Math.max(0.2, settings.promptCreativity)) };
}

export async function enhancePromptWithStrata(
  request: EnhanceRequest, settings: Settings, owner: Pick<StrataRuntimeOwner, "chat">,
  signal: AbortSignal, onProgress: PromptProgressReporter
): Promise<string> {
  onProgress("uploading", null, "正在准备参考图");
  return withStrataReferenceMedia(request, signal, async (prepared) => {
    const chat = await buildStrataPromptRequest(prepared, settings, signal);
    let characters = 0;
    onProgress("generating", null, `正在生成 · 输出预算 ${chat.maxTokens} tokens`);
    const output = await owner.chat(chat, signal, (delta) => {
      characters += delta.length;
      onProgress("generating", null, `已生成 ${characters} 字符 · 输出预算 ${chat.maxTokens} tokens`);
    });
    signal.throwIfAborted();
    onProgress("validating", null, "正在验证完整结果");
    const result = normalizeMultimodalPromptOutput(output, request);
    if (request.h3PromptPreset === "detailed-cinematic") {
      assertDetailedCinematicExpansion(result, h3PromptModeForRequest(request), request.h3DurationSeconds ?? 5, request.prompt);
    }
    return result;
  });
}
