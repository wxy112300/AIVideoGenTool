import { createNativeTranslator } from "../ui-translator.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
import type { EnhanceRequest, Settings, PromptProgressReporter } from "../../src/types.js";
import { assertLongVideoPromptRequest, longVideoPromptTargets, parseLongVideoPromptResult, type LongVideoPromptResult } from "../../src/core/long-video/enhancement.js";
import { buildStrataPromptRequest, StrataPromptValidationError } from "./strata-prompt.js";
import type { StrataRuntimeOwner } from "./strata-runtime-owner.js";
import type { StrataChatRequest } from "./strata-service.js";
import { defaultH3PromptPresets, h3PromptPresetTextForRequest } from "../../src/core/prompts/h3/index.js";
import { h3DetailedExpansionGateInstruction, h3DetailedExpansionMinimumWords, h3DetailedExpansionTargetWords } from "../../src/core/h3-prompt.js";
import { compileContinuumDetailText, continuumAllocatedBeat, continuumAllocationInstruction, continuumApprovedBeatsInstruction, continuumBoundaryExcerpt, continuumCarriedAudio, continuumDirectorContract, continuumOmitsScore, continuumPlannerInstruction, continuumDetailInstruction, continuumDetailFormatIssues, continuumDetailTimelineWords, continuumRequirementLabels, continuumWriterStyle, formatContinuumDetail } from "../../src/core/prompts/h3/continuum.js";

const unwrap = (raw: string): string => raw.trim().replace(/^```(?:json|text)?\s*\n([\s\S]*?)\n```$/u, "$1").trim();
const validText = (value: unknown, maximum = 4000): value is string => typeof value === "string" && Boolean(value.trim()) && value.length <= maximum;
function allocationText(page: { opening?: unknown; development?: unknown; handoff?: unknown; suggestion?: unknown; sourceRequirements?: unknown },
  locale: Settings["uiLocale"], brief: string): string | null {
  if (!validText(page.opening, 1000) || !validText(page.development, 1000) || !validText(page.handoff, 1000)) return null;
  const [opening, development, handoff, suggestion] = locale === "en-US" ? ["Opening", "Development", "Handoff", "AI suggestion"]
    : locale === "zh-TW" ? ["開場", "推進", "交接", "AI 建議"] : ["开场", "推进", "交接", "AI 建议"];
  const requirements = Array.isArray(page.sourceRequirements)
    ? [...new Set(page.sourceRequirements.filter(quote => validText(quote, 450) && brief.includes(quote.trim())).map(quote => quote.trim()))]
    : [];
  return [`${opening}: ${page.opening.trim()}`, `${development}: ${page.development.trim()}`,
    ...(requirements.length ? [`${continuumRequirementLabels[locale ?? "zh-CN"]}:\n${requirements.slice(0, 6).map(quote => `- ${quote}`).join("\n")}`] : []),
    ...(validText(page.suggestion, 500) ? [`${suggestion}: ${page.suggestion.trim()}`] : []),
    `${handoff}: ${page.handoff.trim()}`].join("\n\n");
}
/** Canonicalize by stable IDs; exact repeated rows are idempotent, conflicting ones are ambiguous. */
function detailBatch(value: unknown, batch: Array<{ pageId: string }>, format: "outline" | "detail", locale?: Settings["uiLocale"], omitScore = false, brief = ""): Array<{ pageId: string; text: string }> | null {
  const entries = (value as { segments?: unknown } | null)?.segments;
  if (!Array.isArray(entries)) return null;
  const expected = new Set(batch.map(p => p.pageId)), pages = new Map<string, { pageId: string; text: string }>();
  for (const entry of entries) {
    const page = entry as { pageId?: unknown; text?: unknown; opening?: unknown; development?: unknown; handoff?: unknown;
      suggestion?: unknown; sourceRequirements?: unknown; overall_soundscape?: unknown; non_diegetic_music?: unknown } | null;
    if (!page || typeof page.pageId !== "string" || !expected.has(page.pageId)) return null;
    const text = format === "outline"
      ? allocationText(page, locale, brief) ?? (validText(page.text) ? page.text : null)
      : validText(page.text, 24000) ? formatContinuumDetail(compileContinuumDetailText({ ...page, text: page.text }), omitScore) : null;
    if (text === null) return null;
    const previous = pages.get(page.pageId);
    if (previous && previous.text !== text) return null;
    pages.set(page.pageId, { pageId: page.pageId, text });
  }
  return pages.size === batch.length ? batch.map(p => pages.get(p.pageId)!) : null;
}

function singleDetailText(raw: string, page: { pageId: string }, omitScore: boolean): string | null {
  const text = unwrap(raw);
  if (!text.startsWith("{")) return validText(text, 24000) ? formatContinuumDetail(text, omitScore) : null;
  try { return detailBatch(JSON.parse(text), [page], "detail", undefined, omitScore)?.[0]?.text ?? null; }
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
  const mode = request.h3PromptMode ?? "I2VA";
  const duration = planRequest.layout.chunkSeconds;
  const savedStyle = settings.h3PromptPresets[preset]?.trim();
  const style = savedStyle && savedStyle !== defaultH3PromptPresets[preset].trim()
    ? h3PromptPresetTextForRequest(preset, savedStyle)
    : continuumWriterStyle[preset];
  const writingStyle = `Prose style (${preset}). Apply within the user's action, camera and continuity requirements and this response format.\n${style}`;
  const chat = async (instruction: string, label: string, writeDetails = false) => {
    signal.throwIfAborted();
    const grounding = images.length ? "" : "\nThis is text-to-video. There is no reference image. Establish the opening from the user's brief and carry that composition forward.";
    const current: StrataChatRequest = { ...base, messages: [{ role: "system", content: writeDetails
      ? `${continuumDirectorContract}${grounding}\n\n${writingStyle}` : continuumDirectorContract + grounding },
      { role: "user", content: [...images, { type: "text", text: request.referenceContext
        ? `${request.referenceContext}\n\n${instruction}` : instruction }] }] };
    await beforeChat(current); progress("generating", null, label);
    let characters = 0, outputBudget = current.maxTokens;
    const raw = await owner.chat(current, signal, delta => { characters += delta.length; progress("generating", null, `${label} · ${characters}`); },
      tokens => { outputBudget = tokens; },
      count => progress("generating", null, `${label} · ${t(uiKeys.strataPrompt.reasoning, { count, tokens: outputBudget })}`));
    signal.throwIfAborted(); return raw;
  };
  const chatJson = async (instruction: string, label: string, writeDetails = false): Promise<unknown> =>
    JSON.parse(unwrap(await chat(instruction, label, writeDetails)));
  const originalStory = `ORIGINAL STORY AND USER REQUIREMENTS:\n${planRequest.brief.text}`;
  const omitScore = continuumOmitsScore(planRequest.brief.text);
  const source = JSON.stringify(planRequest.segments.map(page => ({ pageId: page.pageId, locked: page.locked, text: page.text || page.outline })));
  const slots = planRequest.segments.map((page, index) => ({ pageId: page.pageId,
    startSeconds: index * planRequest.layout.chunkSeconds, endSeconds: (index + 1) * planRequest.layout.chunkSeconds }));
  const targets = longVideoPromptTargets(planRequest);
  const pageContext = (page: typeof targets[number], adopted: LongVideoPromptResult["segments"],
    planned: Array<{ pageId: string; outline: string }> = []) => {
    const index = planRequest.segments.indexOf(page);
    const plannedText = (entry: typeof page) => entry.text.trim() || planned.find(item => item.pageId === entry.pageId)?.outline || entry.outline;
    const previous = planRequest.segments[index - 1];
    const next = planRequest.segments[index + 1];
    const previousText = previous ? adopted.find(entry => entry.pageId === previous.pageId)?.text ?? plannedText(previous) : "";
    const completedBeat = (entry: typeof page) => continuumAllocatedBeat(plannedText(entry)) ?? continuumAllocatedBeat(entry.outline);
    const recentHandoffs = planRequest.segments.slice(Math.max(0, index - 3), Math.max(0, index - 1)).map(entry => ({
      pageId: entry.pageId,
      completedBeat: completedBeat(entry),
      exit: continuumBoundaryExcerpt(adopted.find(item => item.pageId === entry.pageId)?.text ?? plannedText(entry), "handoff")
    })).filter(entry => entry.exit || entry.completedBeat);
    return {
      pageId: page.pageId, position: index + 1, total: slots.length,
      currentDirection: plannedText(page),
      ...(page.userEditedDirection && { userEditedDirection: true }),
      ...(recentHandoffs.length && { recentHandoffs }),
      ...(previous && { previousPageId: previous.pageId, previousBeat: completedBeat(previous), previousExit: continuumBoundaryExcerpt(previousText, "handoff"),
        previousAudio: continuumCarriedAudio(previousText) }),
      ...(next && { nextEntry: continuumBoundaryExcerpt(plannedText(next), "opening") })
    };
  };
  if (planRequest.operation === "allocate") {
    const raw = await chatJson(`${continuumAllocationInstruction}\n${originalStory}\nCURRENT PAGES:\n${source}\nTIME WINDOWS:\n${JSON.stringify(slots)}\nREQUESTED PAGE IDS:\n${JSON.stringify(targets.map(p => p.pageId))}`, t(uiKeys.strataPrompt.moviePlanning));
    const segments = detailBatch(raw, targets, "outline", settings.uiLocale, false, planRequest.brief.text);
    if (!segments) throw new StrataPromptValidationError(t(uiKeys.strataPrompt.planIncomplete));
    const encoded = JSON.stringify({ schemaVersion: 1, scriptId: planRequest.scriptId, revision: planRequest.revision,
      segments: segments.map(page => ({ ...page, outline: page.text.slice(0, 4000) })) });
    parseLongVideoPromptResult(encoded, planRequest);
    return encoded;
  }
  if (planRequest.operation === "expand") {
    const result: LongVideoPromptResult = { schemaVersion: 1, scriptId: planRequest.scriptId, revision: planRequest.revision, segments: [] };
    const outlineFor = (page: typeof targets[number]) => page.outline.trim() || page.text.trim().slice(0, 4000);
    for (const page of targets) {
      const index = planRequest.segments.indexOf(page);
      const detailed = preset === "detailed-cinematic";
      const density = detailed ? h3DetailedExpansionGateInstruction(mode, duration, page.text, "integrated_multimodal_description") : "";
      const instruction = [
        continuumDetailInstruction(duration, true), density,
        continuumApprovedBeatsInstruction,
        originalStory,
        `REQUESTED PAGE AND ADJACENT BOUNDARIES:\n${JSON.stringify(pageContext(page, result.segments))}`
      ].filter(Boolean).join("\n\n");
      const label = t(uiKeys.strataPrompt.batchProgress, { first: index + 1, last: index + 1, total: slots.length });
      const raw = await chat(instruction, label, true);
      let detail = singleDetailText(raw, page, omitScore);
      const formatIssues = detail ? continuumDetailFormatIssues(detail, duration) : ["Return the single prompt in plain text using all five markers in the requested order."];
      const words = detail ? continuumDetailTimelineWords(detail) : 0;
      const issues = [...formatIssues];
      if (detailed && detail && words < h3DetailedExpansionMinimumWords(mode, duration, page.text)) {
        const target = h3DetailedExpansionTargetWords(mode, duration, page.text);
        issues.push(`The action timeline has only ${words} grounded words. Expand it toward ${target} with physical staging, camera response and the final handoff. Keep the approved actions and avoid padding or adding plot beats.`);
      }
      if (issues.length) {
        const correction = `Correct the following formatting issues without shortening the cinematic detail or changing actions and timing within the shot.\n${issues.join("\n")}\nDRAFT:\n${detail ?? raw.slice(0, 24000)}`;
        const revised = singleDetailText(await chat(`${instruction}\n\n${correction}`, label, true), page, omitScore);
        if (revised && !continuumDetailFormatIssues(revised, duration).length &&
            (formatIssues.length || continuumDetailTimelineWords(revised) > words)) detail = revised;
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
  const planned = await chatJson(`${continuumPlannerInstruction}\n${originalStory}\nCURRENT PAGES:\n${source}\nTIME WINDOWS (relative to requested new movie portion):\n${JSON.stringify(slots)}`, t(uiKeys.strataPrompt.moviePlanning));
  const plannedValue = planned as { summary: string; segments: Array<{ pageId: string; outline: string }> };
  if (!plannedValue || !validText(plannedValue.summary, 16000) || !Array.isArray(plannedValue.segments) || plannedValue.segments.length !== slots.length ||
      plannedValue.segments.some((p, index) => p?.pageId !== slots[index]!.pageId || !validText(p.outline))) throw new StrataPromptValidationError(t(uiKeys.strataPrompt.planIncomplete));
  const result: LongVideoPromptResult = { schemaVersion: 1, scriptId: planRequest.scriptId, revision: planRequest.revision, segments: [] };
  for (let offset = 0; offset < targets.length; offset += 3) {
    const batch = targets.slice(offset, offset + 3);
    const coverage = preset === "detailed-cinematic" ? `\nPer-page action timeline target (grounded words): ${JSON.stringify(batch.map(p => ({
      pageId: p.pageId, target: h3DetailedExpansionTargetWords(mode, duration, p.text)
    })))}.` : "";
    const raw = await chatJson([
      continuumDetailInstruction(duration), continuumApprovedBeatsInstruction, originalStory,
      `PROPOSED STORY SUMMARY (subordinate to the original story and current pages):\n${plannedValue.summary}`,
      `REQUESTED PAGES AND ADJACENT BOUNDARIES:\n${JSON.stringify(batch.map(page => pageContext(page, result.segments, plannedValue.segments)))}`,
      coverage
    ].filter(Boolean).join("\n\n"), t(uiKeys.strataPrompt.batchProgress, {
      first: offset + 1, last: Math.min(offset + 3, targets.length), total: targets.length
    }), true);
    const details = detailBatch(raw, batch, "detail", undefined, omitScore);
    if (!details) throw new StrataPromptValidationError(t(uiKeys.strataPrompt.detailsIncomplete));
    result.segments.push(...details.map(p => ({ ...p, outline: plannedValue.segments.find(s => s.pageId === p.pageId)!.outline })));
  }
  progress("validating", null, t(uiKeys.strataPrompt.movieValidating));
  const encoded = JSON.stringify(result); parseLongVideoPromptResult(encoded, planRequest); return encoded;
}
