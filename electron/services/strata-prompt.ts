import { createNativeTranslator } from "../ui-translator.js";
import type { Translate } from "../../src/core/i18n.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { EnhanceRequest, Settings, PromptProgressReporter } from "../../src/types.js";
import { multimodalPromptInstruction, multimodalPromptTargetLanguage, normalizeMultimodalPromptOutput } from "./multimodal-prompt.js";
import type { StrataChatRequest, StrataContentPart } from "./strata-service.js";
import { strataH3InstructionParts } from "../../src/core/prompts/h3/strata.js";
import { missingH3SourceTimepoints } from "../../src/core/h3-timing.js";
import { h3TimelineDurationForRequest } from "../../src/core/h3-auto-prompter.js";
import { unwrapH3ModelOutput } from "../../src/core/h3-prompt.js";
import { h3PromptModeForRequest } from "../../src/core/h3-auto-prompter.js";
import type { StrataRuntimePolicy } from "./strata-model-preparation.js";
import type { StrataRuntimeOwner } from "./strata-runtime-owner.js";
import { withStrataReferenceMedia } from "./strata-reference-media.js";
import { supportsStrataUncensored, strataUncensoredMode } from "../../src/core/strata-uncensored.js";
import { normalizeStrataReasoningEffort } from "../../src/core/strata-reasoning.js";
import { isQwenImage21TargetModel } from "../../src/core/image-prompt.js";
import { strataQwenImage21InstructionParts, STRATA_QWEN_IMAGE21_PROFILE } from "../../src/core/prompts/qwen-image-2-1/strata.js";

/** Completed, healthy inference whose text fails product validation; not a transport/resource failure. */
export class StrataPromptValidationError extends Error { override name = "StrataPromptValidationError"; }
function usesQwenImage21Profile(request: EnhanceRequest): boolean {
  return request.mode === "image-edit" && (!request.promptStrategy || request.promptStrategy === "rewrite")
    && isQwenImage21TargetModel(request.imageTargetModelId);
}
function validatedOutput(output: string, request: EnhanceRequest, locale: Settings["uiLocale"] = "zh-CN"): string {
  try { return normalizeMultimodalPromptOutput(output, request, locale); }
  catch (error) { throw new StrataPromptValidationError(error instanceof Error ? error.message : String(error)); }
}

/** Stable preparation identity. Hardware admission/reserve is a transient launch overlay,
 * not a reason to rehash/repack weights whenever available RAM changes. */
export function strataPromptPolicy(_settings: Pick<Settings, "vramReserveGb">): StrataRuntimePolicy {
  return { maxContext: 32768, kv: "k8v4", visionTokens: 1024, visionGpu: true,
    vramReserveMiB: 2048 };
}

export async function strataImageContent(filename: string, signal: AbortSignal, t: Translate = createNativeTranslator(undefined).t): Promise<StrataContentPart> {
  signal.throwIfAborted();
  const stat = await fs.stat(filename);
  if (!stat.isFile() || stat.size === 0 || stat.size > 32 * 1024 ** 2) throw new Error(t(uiKeys.strataPrompt.imageSize));
  const bytes = await fs.readFile(filename, { signal });
  const mime = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png"
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg"
    : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" ? "image/webp" : null;
  if (!mime) throw new Error(t(uiKeys.strataPrompt.imageFormat, { file: path.basename(filename) }));
  signal.throwIfAborted();
  return { type: "image_url", image_url: { url: `data:${mime};base64,${bytes.toString("base64")}` } };
}

export async function buildStrataPromptRequest(
  request: EnhanceRequest, settings: Settings, signal: AbortSignal,
  encodeImage: typeof strataImageContent = strataImageContent,
  evaluation?: { layout: "structured" | "flat"; dossier?: string; reasoning?: StrataChatRequest["reasoning"] }
): Promise<StrataChatRequest> {
  const t = createNativeTranslator(settings.uiLocale).t;
  const paths = [...new Set(request.imagePaths ?? (request.imagePath ? [request.imagePath] : []))].filter(Boolean);
  if (paths.length > 12) throw new Error(t(uiKeys.strataPrompt.tooManyImages));
  // One compiler for every full H3 rewrite: no mode-specific layout or runtime policy.
  // The Pack owns reference/continuation differences; targeted edits keep their splice contract.
  const profile = evaluation ?? (request.mode === "h3-vision"
    && request.promptStrategy !== "targeted-revision"
    ? { layout: "structured" as const } : undefined);
  const policy = strataPromptPolicy(settings);
  const effort = normalizeStrataReasoningEffort(settings.strataReasoningEffort);
  // Upstream 0 means automatic thinking with answer_room, NOT disabled thinking.
  const reasoning = evaluation?.reasoning ?? (effort === "off" ? undefined : { effort, budgetTokens: 0 });
  const imageParts = usesQwenImage21Profile(request)
    ? strataQwenImage21InstructionParts(request) : undefined;
  const parts = imageParts ?? (profile?.layout === "structured"
    ? strataH3InstructionParts(request, settings, profile.dossier, multimodalPromptTargetLanguage(request, settings)) : undefined);
  const instruction = parts ? parts.sourceData : multimodalPromptInstruction(request, settings);
  const maxTokens = request.mode === "image-edit" ? 4096 : 8192;
  const content: StrataContentPart[] = imageParts ? [] : [{ type: "text", text: instruction }];
  let encodedBytes = instruction.length;
  for (const filename of paths) {
    const image = await encodeImage(filename, signal, t);
    encodedBytes += image.type === "image_url" ? image.image_url.url.length : 0;
    if (encodedBytes > 48 * 1024 ** 2) throw new Error(t(uiKeys.strataPrompt.requestTooLarge));
    content.push(image);
  }
  if (imageParts) content.push({ type: "text", text: instruction });
  if (parts) content.push({ type: "text", text: parts.task });
  signal.throwIfAborted();
  return { modelId: settings.promptModelId, messages: [
    ...(parts ? [{ role: "system" as const, content: parts.contract }] : []), { role: "user", content }],
    maxTokens, contextSize: policy.maxContext, visionTokensPerImage: policy.visionTokens, automaticOutputBudget: true,
    uncensored: strataUncensoredMode(settings) !== "off" && supportsStrataUncensored(settings.promptModelId),
    uncensoredMode: supportsStrataUncensored(settings.promptModelId) ? strataUncensoredMode(settings) : "off",
    // Use the model's official profile without changing saved creativity for other backends.
    temperature: reasoning ? 1 : 0.7, reasoning };
}

export async function enhancePromptWithStrata(
  request: EnhanceRequest, settings: Settings, owner: Pick<StrataRuntimeOwner, "chat">,
  signal: AbortSignal, onProgress: PromptProgressReporter,
  beforeChat?: (chat: StrataChatRequest) => Promise<void>
): Promise<string> {
  const t = createNativeTranslator(settings.uiLocale).t;
  onProgress("uploading", null, usesQwenImage21Profile(request)
    ? t(uiKeys.strataPrompt.preparingProfileImages, { profile: STRATA_QWEN_IMAGE21_PROFILE }) : t(uiKeys.strataPrompt.preparingImages));
  return withStrataReferenceMedia(request, signal, async (prepared) => {
    const chat = await buildStrataPromptRequest(prepared, settings, signal);
    await beforeChat?.(chat);
    signal.throwIfAborted();
    let characters = 0;
    let outputBudget = chat.maxTokens;
    onProgress("generating", null, chat.reasoning
      ? t(uiKeys.strataPrompt.planning, { budget: chat.reasoning.budgetTokens ? t(uiKeys.strataPrompt.reasoningBudget, { tokens: chat.reasoning.budgetTokens }) : t(uiKeys.strataPrompt.automaticReasoning) })
      : t(uiKeys.strataPrompt.generating));
    let output = await owner.chat(chat, signal, (delta) => {
      characters += delta.length;
      onProgress("generating", null, t(uiKeys.strataPrompt.generated, { count: characters, tokens: outputBudget }));
    }, (tokens) => {
      outputBudget = tokens;
      onProgress("generating", null, t(uiKeys.strataPrompt.budgetAdjusted, { tokens: tokens, reasoning: chat.reasoning ? t(uiKeys.strataPrompt.includingReasoning) : "", context: String(chat.contextSize) }));
    }, (count) => onProgress("generating", null,
      t(uiKeys.strataPrompt.reasoning, { count: count, tokens: outputBudget })));
    signal.throwIfAborted();
    onProgress("validating", null, t(uiKeys.strataPrompt.validating));
    let result = validatedOutput(output, request, settings.uiLocale);
    if (chat.messages[0]?.role === "system" && request.mode === "h3-vision"
      && request.h3PromptPreset === "detailed-cinematic") {
      const mode = h3PromptModeForRequest(request), duration = request.h3DurationSeconds ?? 5;
      const missing = missingH3SourceTimepoints(request.prompt, unwrapH3ModelOutput(output, mode), mode, duration, h3TimelineDurationForRequest(request));
      if (missing.length) {
        onProgress("generating", null, t(uiKeys.strataPrompt.repairTimes, { times: missing.join(t(uiKeys.nodeInstaller.listSeparator)) }));
        const repair: StrataChatRequest = { ...chat,
          messages: [...chat.messages, { role: "assistant", content: output }, { role: "user", content:
            `The candidate omits these explicitly requested times from the MAIN timeline: ${missing.join(", ")} seconds. Read the original brief, identify each event at those times and integrate it into its proper interval. Return the COMPLETE corrected H3 prompt, not a patch or checklist. Preserve all existing correct details and exact speech. Do not merely list the numbers, invent events or alter other event times.` }] };
        // Same owner, full original context, official tokenizer, no queue or unbounded retry.
        output = await owner.chat(repair, signal, undefined, (tokens) =>
          onProgress("generating", null, t(uiKeys.strataPrompt.repairBudget, { tokens: tokens })));
        signal.throwIfAborted();
        result = validatedOutput(output, request, settings.uiLocale);
        const remaining = missingH3SourceTimepoints(request.prompt, unwrapH3ModelOutput(output, mode), mode, duration, h3TimelineDurationForRequest(request));
        if (remaining.length) throw new StrataPromptValidationError(t(uiKeys.strataPrompt.timesStillMissing, { times: remaining.join(t(uiKeys.nodeInstaller.listSeparator)) }));
      }
    }
    return result;
  }, undefined, t);
}
