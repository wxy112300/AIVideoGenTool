import { createNativeTranslator } from "../ui-translator.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
import type { EnhanceRequest, Settings, PromptProgressReporter } from "../../src/types.js";
import { assertLongVideoPromptRequest, longVideoPromptTargets, parseLongVideoPromptResult, type LongVideoPromptResult } from "../../src/core/long-video/enhancement.js";
import { buildStrataPromptRequest, StrataPromptValidationError } from "./strata-prompt.js";
import type { StrataRuntimeOwner } from "./strata-runtime-owner.js";
import type { StrataChatRequest } from "./strata-service.js";
import { h3PromptPresetTextForRequest } from "../../src/core/prompts/h3/index.js";
import { h3DetailedExpansionGateInstruction } from "../../src/core/h3-prompt.js";
import { compileContinuumDetailText, continuumAllocationInstruction, continuumApprovedBeatsInstruction, continuumDirectorContract, continuumPlannerInstruction, continuumDetailInstruction, continuumDetailFormatIssues } from "../../src/core/prompts/h3/continuum.js";

const unwrap = (raw: string): string => raw.trim().replace(/^```(?:json|text)?\s*\n([\s\S]*?)\n```$/u, "$1").trim();
const validText = (value: unknown, maximum = 4000): value is string => typeof value === "string" && Boolean(value.trim()) && value.length <= maximum;
/** Canonicalize by stable IDs; exact repeated rows are idempotent, conflicting ones are ambiguous. */
function detailBatch(value: unknown, batch: Array<{ pageId: string }>): Array<{ pageId: string; text: string }> | null {
  const entries = (value as { segments?: unknown } | null)?.segments;
  if (!Array.isArray(entries)) return null;
  const expected = new Set(batch.map(p => p.pageId)), pages = new Map<string, { pageId: string; text: string }>();
  for (const entry of entries) {
    const page = entry as { pageId?: unknown; text?: unknown; overall_soundscape?: unknown; non_diegetic_music?: unknown } | null;
    if (!page || typeof page.pageId !== "string" || !expected.has(page.pageId) || !validText(page.text, 24000)) return null;
    const text = compileContinuumDetailText({ ...page, text: page.text });
    const previous = pages.get(page.pageId);
    if (previous && previous.text !== text) return null;
    pages.set(page.pageId, { pageId: page.pageId, text });
  }
  return pages.size === batch.length ? batch.map(p => pages.get(p.pageId)!) : null;
}

function singleDetailText(raw: string, page: { pageId: string }): string | null {
  const text = unwrap(raw);
  if (!text.startsWith("{")) return validText(text, 24000) ? text : null;
  try { return detailBatch(JSON.parse(text), [page])?.[0]?.text ?? null; }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return null;
  }
}
/** Planner and bounded detail batches share the existing single prompt operation/owner. */
export async function enhanceLongVideoWithStrata(request: EnhanceRequest, settings: Settings, owner: Pick<StrataRuntimeOwner, "chat">,
  signal: AbortSignal, progress: PromptProgressReporter, beforeChat: (chat: StrataChatRequest) => Promise<void>): Promise<string> {
  const t = createNativeTranslator(settings.uiLocale).t;
  const planRequest = request.longVideo!; assertLongVideoPromptRequest(planRequest);
  const base = await buildStrataPromptRequest(request, settings, signal);
  const images = base.messages.flatMap(m => Array.isArray(m.content) ? m.content : []).filter(p => p.type === "image_url");
  const preset = request.h3PromptPreset ?? "detailed-cinematic";
  const contract = [
    continuumDirectorContract,
    planRequest.operation === "allocate" ? "" : `Low-priority prose style (${preset}); apply its creative preferences within the requested output format and avoid repeating the complete film timeline in each page:\n${h3PromptPresetTextForRequest(preset, settings.h3PromptPresets[preset])}`
  ].filter(Boolean).join("\n");
  const chat = async (instruction: string, label: string) => {
    signal.throwIfAborted();
    const current: StrataChatRequest = { ...base, messages: [{ role: "system", content: contract },
      { role: "user", content: [...images, { type: "text", text: request.referenceContext
        ? `${request.referenceContext}\n\n${instruction}` : instruction }] }] };
    await beforeChat(current); progress("generating", null, label);
    let characters = 0, outputBudget = current.maxTokens;
    const raw = await owner.chat(current, signal, delta => { characters += delta.length; progress("generating", null, `${label} · ${characters}`); },
      tokens => { outputBudget = tokens; },
      count => progress("generating", null, `${label} · ${t(uiKeys.strataPrompt.reasoning, { count, tokens: outputBudget })}`));
    signal.throwIfAborted(); return raw;
  };
  const chatJson = async (instruction: string, label: string): Promise<unknown> => JSON.parse(unwrap(await chat(instruction, label)));
  const source = JSON.stringify(planRequest);
  const slots = planRequest.segments.map((page, index) => ({ pageId: page.pageId,
    startSeconds: index * planRequest.layout.chunkSeconds, endSeconds: (index + 1) * planRequest.layout.chunkSeconds }));
  const targets = longVideoPromptTargets(planRequest);
  if (planRequest.operation === "allocate") {
    const raw = await chatJson(`${continuumAllocationInstruction}\nSOURCE:\n${source}\nTIME WINDOWS:\n${JSON.stringify(slots)}\nREQUESTED PAGE IDS:\n${JSON.stringify(targets.map(p => p.pageId))}`, t(uiKeys.strataPrompt.moviePlanning));
    const segments = detailBatch(raw, targets);
    if (!segments) throw new StrataPromptValidationError(t(uiKeys.strataPrompt.planIncomplete));
    const encoded = JSON.stringify({ schemaVersion: 1, scriptId: planRequest.scriptId, revision: planRequest.revision,
      segments: segments.map(page => ({ ...page, outline: page.text })) });
    parseLongVideoPromptResult(encoded, planRequest);
    return encoded;
  }
  if (planRequest.operation === "expand") {
    const result: LongVideoPromptResult = { schemaVersion: 1, scriptId: planRequest.scriptId, revision: planRequest.revision, segments: [] };
    const outlineFor = (page: typeof targets[number]) => page.outline.trim() || page.text.trim().slice(0, 4000);
    const plan = planRequest.segments.map(page => ({ pageId: page.pageId, outline: outlineFor(page), locked: page.locked }));
    for (const page of targets) {
      const index = planRequest.segments.indexOf(page);
      const previous = planRequest.segments[index - 1];
      const prior = previous && (result.segments.find(detail => detail.pageId === previous.pageId) ?? previous);
      const duration = planRequest.layout.chunkSeconds;
      const density = preset === "detailed-cinematic" ? h3DetailedExpansionGateInstruction(request.h3PromptMode ?? "I2VA", duration, page.text) : "";
      const instruction = [
        continuumDetailInstruction(duration, true), density,
        continuumApprovedBeatsInstruction,
        `ORIGINAL STORY:\n${planRequest.brief.text}`,
        `APPROVED SEGMENT ORDER:\n${JSON.stringify(plan)}`,
        `PREVIOUS SEGMENT:\n${JSON.stringify(prior ?? null)}`,
        `REQUESTED PAGE:\n${JSON.stringify(page)}`
      ].filter(Boolean).join("\n\n");
      const label = t(uiKeys.strataPrompt.batchProgress, { first: index + 1, last: index + 1, total: slots.length });
      const raw = await chat(instruction, label);
      let detail = singleDetailText(raw, page);
      const issues = detail ? continuumDetailFormatIssues(detail, duration) : ["Return the single prompt in plain text using the three requested headings."];
      if (issues.length) {
        const correction = `Correct the following formatting issues without shortening the cinematic detail or changing actions and timing within the shot.\n${issues.join("\n")}\nDRAFT:\n${detail ?? raw.slice(0, 24000)}`;
        detail = singleDetailText(await chat(`${instruction}\n\n${correction}`, label), page);
        if (!detail || continuumDetailFormatIssues(detail, duration).length) {
          throw new StrataPromptValidationError(t(uiKeys.strataPrompt.continuumDetailFormat));
        }
      }
      if (!detail) throw new StrataPromptValidationError(t(uiKeys.strataPrompt.detailsIncomplete));
      const segment = { pageId: page.pageId, text: detail, outline: outlineFor(page) };
      result.segments.push(segment);
      progress("generating", null, label, { scriptId: planRequest.scriptId, revision: planRequest.revision, segment });
    }
    progress("validating", null, t(uiKeys.strataPrompt.movieValidating));
    const encoded = JSON.stringify(result);
    parseLongVideoPromptResult(encoded, planRequest);
    return encoded;
  }
  const planned = await chatJson(`${continuumPlannerInstruction}\nSOURCE:\n${source}\nTIME WINDOWS (relative to requested new movie portion):\n${JSON.stringify(slots)}`, t(uiKeys.strataPrompt.moviePlanning));
  const plannedValue = planned as { summary: string; segments: Array<{ pageId: string; outline: string }> };
  if (!plannedValue || !validText(plannedValue.summary, 16000) || !Array.isArray(plannedValue.segments) || plannedValue.segments.length !== slots.length ||
      plannedValue.segments.some((p, index) => p?.pageId !== slots[index]!.pageId || !validText(p.outline))) throw new StrataPromptValidationError(t(uiKeys.strataPrompt.planIncomplete));
  const result: LongVideoPromptResult = { schemaVersion: 1, scriptId: planRequest.scriptId, revision: planRequest.revision,
    ...(!planRequest.targetPageId && !planRequest.brief.locked ? { brief: plannedValue.summary } : {}), segments: [] };
  for (let offset = 0; offset < targets.length; offset += 3) {
    const batch = targets.slice(offset, offset + 3);
    const raw = await chatJson(`${continuumDetailInstruction(planRequest.layout.chunkSeconds)}\nSOURCE:\n${source}\nCOMPLETE PLAN:\n${JSON.stringify(plannedValue)}\nMOST RECENT ADOPTED DETAIL:\n${JSON.stringify(result.segments.at(-1) ?? null)}\nREQUESTED PAGES:\n${JSON.stringify(batch.map(p => ({ ...p, slot: slots.find(s => s.pageId === p.pageId) })))}`, t(uiKeys.strataPrompt.batchProgress, { first: offset + 1, last: Math.min(offset + 3, targets.length), total: targets.length })) as { segments: Array<{ pageId: string; text: string }> };
    const details = detailBatch(raw, batch);
    if (!details) throw new StrataPromptValidationError(t(uiKeys.strataPrompt.detailsIncomplete));
    result.segments.push(...details.map(p => ({ ...p, outline: plannedValue.segments.find(s => s.pageId === p.pageId)!.outline })));
  }
  progress("validating", null, t(uiKeys.strataPrompt.movieValidating));
  const encoded = JSON.stringify(result); parseLongVideoPromptResult(encoded, planRequest); return encoded;
}
