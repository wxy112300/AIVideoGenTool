import { promises as fs } from "node:fs";
import path from "node:path";
import type { EnhanceRequest, Settings, PromptProgressReporter } from "../../src/types.js";
import { multimodalPromptInstruction, multimodalPromptTargetLanguage, normalizeMultimodalPromptOutput } from "./multimodal-prompt.js";
import type { StrataChatRequest, StrataContentPart } from "./strata-service.js";
import { STRATA_NON_THINKING_SAMPLING } from "./strata-service.js";
import { strataH3InstructionParts } from "../../src/core/prompts/h3/strata.js";
import { missingH3SourceTimepoints } from "../../src/core/h3-timing.js";
import { unwrapH3ModelOutput } from "../../src/core/h3-prompt.js";
import { h3PromptModeForRequest } from "../../src/core/h3-auto-prompter.js";
import type { StrataRuntimePolicy } from "./strata-model-preparation.js";
import type { StrataRuntimeOwner } from "./strata-runtime-owner.js";
import { withStrataReferenceMedia } from "./strata-reference-media.js";
import { supportsStrataUncensored } from "../../src/core/strata-uncensored.js";

/** Completed, healthy inference whose text fails product validation; not a transport/resource failure. */
export class StrataPromptValidationError extends Error { override name = "StrataPromptValidationError"; }
function validatedOutput(output: string, request: EnhanceRequest): string {
  try { return normalizeMultimodalPromptOutput(output, request); }
  catch (error) { throw new StrataPromptValidationError(error instanceof Error ? error.message : String(error)); }
}

/** Stable preparation identity. Hardware admission/reserve is a transient launch overlay,
 * not a reason to rehash/repack weights whenever available RAM changes. */
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
  encodeImage: typeof strataImageContent = strataImageContent,
  evaluation?: { layout: "structured" | "flat"; dossier?: string; reasoning?: StrataChatRequest["reasoning"] }
): Promise<StrataChatRequest> {
  const paths = [...new Set(request.imagePaths ?? (request.imagePath ? [request.imagePath] : []))].filter(Boolean);
  if (paths.length > 12) throw new Error("Strata 每次最多接收 12 张参考图。");
  // Adopt only the bounded, explicitly authored single-picture path evaluated on real weights.
  // Other modes, Extend, auto seeds, image editing and targeted revisions keep their existing Pack.
  const profile = evaluation ?? (request.mode === "h3-vision" && request.h3PromptMode === "I2VA"
    && request.h3PromptPreset === "detailed-cinematic" && paths.length === 1 && request.prompt.trim()
    && !request.extensionSource && !request.promptStrategy
    ? { layout: "structured" as const, reasoning: { effort: "medium" as const, budgetTokens: 2048 } } : undefined);
  const parts = profile?.layout === "structured"
    ? strataH3InstructionParts(request, settings, profile.dossier, multimodalPromptTargetLanguage(request, settings)) : undefined;
  const instruction = parts ? parts.sourceData : multimodalPromptInstruction(request, settings);
  const maxTokens = request.mode === "image-edit" ? 4096 : 8192;
  const content: StrataContentPart[] = [{ type: "text", text: instruction }];
  let encodedBytes = instruction.length;
  for (const filename of paths) {
    const image = await encodeImage(filename, signal);
    encodedBytes += image.type === "image_url" ? image.image_url.url.length : 0;
    if (encodedBytes > 48 * 1024 ** 2) throw new Error("参考图合计超过请求大小限制，请缩小图片后重试。");
    content.push(image);
  }
  if (parts) content.push({ type: "text", text: parts.task });
  signal.throwIfAborted();
  return { modelId: settings.promptModelId, messages: [
    ...(parts ? [{ role: "system" as const, content: parts.contract }] : []), { role: "user", content }],
    maxTokens, contextSize: 32768, visionTokensPerImage: 1024, automaticOutputBudget: true,
    uncensored: settings.strataUncensored === true && supportsStrataUncensored(settings.promptModelId),
    // Use the model's official profile without changing saved creativity for other backends.
    temperature: profile?.reasoning ? 1 : STRATA_NON_THINKING_SAMPLING.temperature,
    ...(profile?.reasoning ? { reasoning: profile.reasoning } : {}) };
}

export async function enhancePromptWithStrata(
  request: EnhanceRequest, settings: Settings, owner: Pick<StrataRuntimeOwner, "chat">,
  signal: AbortSignal, onProgress: PromptProgressReporter,
  beforeChat?: (chat: StrataChatRequest) => Promise<void>
): Promise<string> {
  onProgress("uploading", null, "正在准备参考图");
  return withStrataReferenceMedia(request, signal, async (prepared) => {
    const chat = await buildStrataPromptRequest(prepared, settings, signal);
    await beforeChat?.(chat);
    signal.throwIfAborted();
    let characters = 0;
    let outputBudget = chat.maxTokens;
    onProgress("generating", null, chat.reasoning
      ? `正在规划与扩写 · 思考预算 ${chat.reasoning.budgetTokens} tokens · 输出空间自动计算`
      : "正在生成 · 输出空间自动计算");
    let output = await owner.chat(chat, signal, (delta) => {
      characters += delta.length;
      onProgress("generating", null, `已生成 ${characters} 字符 · 输出预算 ${outputBudget} tokens`);
    }, (tokens) => {
      outputBudget = tokens;
      onProgress("generating", null, `输出预算自动调整为 ${tokens} tokens · 含思考，仍在 ${chat.contextSize} 上下文内`);
    });
    signal.throwIfAborted();
    onProgress("validating", null, "正在验证完整结果");
    let result = validatedOutput(output, request);
    if (chat.reasoning && request.h3PromptPreset === "detailed-cinematic") {
      const mode = h3PromptModeForRequest(request), duration = request.h3DurationSeconds ?? 5;
      const missing = missingH3SourceTimepoints(request.prompt, unwrapH3ModelOutput(output, mode), mode, duration);
      if (missing.length) {
        onProgress("generating", null, `正在补全明确时间点 ${missing.join("、")} 秒 · 最多一次纠正`);
        const repair: StrataChatRequest = { ...chat, reasoning: undefined, temperature: STRATA_NON_THINKING_SAMPLING.temperature,
          messages: [...chat.messages, { role: "assistant", content: output }, { role: "user", content:
            `The candidate omits these explicitly requested times from the MAIN timeline: ${missing.join(", ")} seconds. Read the original brief, identify each event at those times and integrate it into its proper interval. Return the COMPLETE corrected H3 prompt, not a patch or checklist. Preserve all existing correct details and exact speech. Do not merely list the numbers, invent events or alter other event times.` }] };
        // Same owner, full original context, official tokenizer, no queue or unbounded retry.
        output = await owner.chat(repair, signal, undefined, (tokens) =>
          onProgress("generating", null, `纠正调用输出预算自动调整为 ${tokens} tokens · 含完整原稿与候选`));
        signal.throwIfAborted();
        result = validatedOutput(output, request);
        const remaining = missingH3SourceTimepoints(request.prompt, unwrapH3ModelOutput(output, mode), mode, duration);
        if (remaining.length) throw new StrataPromptValidationError(`影视细节扩写仍缺少明确时间点 ${remaining.join("、")} 秒；一次纠正后未通过，原提示词保持不变。`);
      }
    }
    return result;
  });
}
