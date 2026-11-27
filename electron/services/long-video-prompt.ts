import { createNativeTranslator } from "../ui-translator.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
import type { EnhanceRequest, Settings, PromptProgressReporter } from "../../src/types.js";
import { assertLongVideoPromptRequest, longVideoPromptTargets, parseLongVideoPromptResult, type LongVideoPromptResult } from "../../src/core/long-video/enhancement.js";
import { buildStrataPromptRequest, StrataPromptValidationError } from "./strata-prompt.js";
import type { StrataRuntimeOwner } from "./strata-runtime-owner.js";
import type { StrataChatRequest } from "./strata-service.js";
import { h3PromptPresetTextForRequest } from "../../src/core/prompts/h3/index.js";
import {
  formatH3PromptSkills,
  formatH3SkillCatalogForAllocation,
  mergeH3PromptSkills,
  resolveH3SkillsByIds,
  selectH3PromptSkills,
  type H3PromptSkill
} from "../../src/core/prompts/h3/skills.js";
import {
  compileContinuumDetailText,
  continuumAllocatedBeat,
  continuumAllocationInstruction,
  continuumBoundaryExcerpt,
  continuumCarriedAudio,
  continuumDetailExamples,
  continuumDetailFormatIssues,
  continuumDetailInstruction,
  continuumDirectorContract,
  continuumOmitsScore,
  formatContinuumAllocationBeat,
  formatContinuumDetail,
  formatContinuumStoryBible,
  parseContinuumChunkBlocks
} from "../../src/core/prompts/h3/continuum.js";

const COHESIVE_BATCH_SIZE = 6;
const LONG_VIDEO_PRESENCE_PENALTY = 0.2;

const unwrap = (raw: string): string => raw
  .replace(/<(?:think|analysis)>[\s\S]*?<\/(?:think|analysis)>/giu, "")
  .trim()
  .replace(/^```(?:json|text|markdown|md)?\s*\n([\s\S]*?)\n```$/u, "$1")
  .trim();

const validText = (value: unknown, maximum = 4000): value is string =>
  typeof value === "string" && Boolean(value.trim()) && value.length <= maximum;

function parseJsonObject(raw: string): unknown {
  const cleaned = unwrap(raw);
  try { return JSON.parse(cleaned); }
  catch {
    const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new SyntaxError("Invalid JSON response");
  }
}

/** Canonicalize allocation or JSON detail rows by stable pageId. */
function parseStructuredBatch(
  value: unknown,
  batch: Array<{ pageId: string }>,
  format: "outline" | "detail",
  locale: Settings["uiLocale"] = "zh-CN",
  omitScore = false
): { storyBible?: string; skills?: string[]; segments: Array<{ pageId: string; text: string }> } | null {
  const record = value as { bible?: unknown; summary?: unknown; skills?: unknown; segments?: unknown } | null;
  const entries = record?.segments;
  if (!Array.isArray(entries)) return null;
  const expected = new Set(batch.map(p => p.pageId));
  const pages = new Map<string, { pageId: string; text: string }>();
  for (const entry of entries) {
    const page = entry as {
      pageId?: unknown; text?: unknown; transition?: unknown; action?: unknown; camera?: unknown;
      audio?: unknown; endState?: unknown; opening?: unknown; development?: unknown; handoff?: unknown;
      suggestion?: unknown; outline?: unknown; overall_soundscape?: unknown; non_diegetic_music?: unknown;
    } | null;
    if (!page || typeof page.pageId !== "string" || !expected.has(page.pageId)) return null;
    const text = format === "outline"
      ? formatContinuumAllocationBeat(page, locale) ?? (validText(page.text) ? page.text.trim() : validText(page.outline) ? page.outline.trim() : null)
      : validText(page.text, 24000) ? formatContinuumDetail(compileContinuumDetailText({ ...page, text: page.text }), omitScore) : null;
    if (text === null) return null;
    const previous = pages.get(page.pageId);
    if (previous && previous.text !== text) return null;
    pages.set(page.pageId, { pageId: page.pageId, text });
  }
  if (pages.size !== batch.length) return null;
  const storyBible = format === "outline"
    ? formatContinuumStoryBible((record?.bible ?? record?.summary) as Parameters<typeof formatContinuumStoryBible>[0], locale)
    : undefined;
  const rawSkills = format === "outline" && Array.isArray(record?.skills)
    ? record.skills
      .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
      .map((item) => item.trim().toLowerCase())
    : [];
  const skills = rawSkills.length ? [...new Set(rawSkills)] : undefined;
  return {
    ...(storyBible ? { storyBible } : {}),
    ...(skills ? { skills } : {}),
    segments: batch.map(p => pages.get(p.pageId)!)
  };
}

function singleDetailText(raw: string, page: { pageId: string }, omitScore: boolean): string | null {
  const text = unwrap(raw);
  const blocks = parseContinuumChunkBlocks(text);
  if (blocks.length === 1 && blocks[0]!.pageId === page.pageId) {
    return validText(blocks[0]!.rawText, 24000) ? formatContinuumDetail(blocks[0]!.rawText, omitScore) : null;
  }
  if (!text.startsWith("{")) return validText(text, 24000) ? formatContinuumDetail(text, omitScore) : null;
  try { return parseStructuredBatch(JSON.parse(text), [page], "detail", undefined, omitScore)?.segments[0]?.text ?? null; }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return null;
  }
}

function parseDetailBatchOutput(
  raw: string,
  batch: Array<{ pageId: string }>,
  omitScore: boolean
): Map<string, { formatted: string | null; raw: string }> {
  const cleaned = unwrap(raw);
  const resolved = new Map<string, { formatted: string | null; raw: string }>();
  const expected = new Set(batch.map(p => p.pageId));
  const blocks = parseContinuumChunkBlocks(cleaned);
  if (blocks.length) {
    for (const block of blocks) {
      if (!expected.has(block.pageId) || !validText(block.rawText, 24000)) continue;
      const formatted = formatContinuumDetail(block.rawText, omitScore);
      const previous = resolved.get(block.pageId);
      if (previous && previous.raw !== block.rawText) return new Map();
      resolved.set(block.pageId, { formatted, raw: block.rawText });
    }
    return resolved;
  }
  if (cleaned.startsWith("{")) {
    try {
      const parsed = parseStructuredBatch(parseJsonObject(cleaned), batch, "detail", undefined, omitScore);
      if (parsed) for (const segment of parsed.segments) resolved.set(segment.pageId, { formatted: segment.text, raw: segment.text });
    } catch { /* fall through to repair */ }
  }
  return resolved;
}

/** Cohesive single-session/multi-turn director pipeline under the existing single Strata owner. */
export async function enhanceLongVideoWithStrata(
  request: EnhanceRequest,
  settings: Settings,
  owner: Pick<StrataRuntimeOwner, "chat">,
  signal: AbortSignal,
  progress: PromptProgressReporter,
  beforeChat: (chat: StrataChatRequest) => Promise<void>
): Promise<string> {
  const t = createNativeTranslator(settings.uiLocale).t;
  const planRequest = request.longVideo!;
  assertLongVideoPromptRequest(planRequest);
  const base = await buildStrataPromptRequest(request, settings, signal);
  const images = base.messages.flatMap(m => Array.isArray(m.content) ? m.content : []).filter(p => p.type === "image_url");
  const preset = request.h3PromptPreset ?? "detailed-cinematic";
  const duration = planRequest.layout.chunkSeconds;
  const style = h3PromptPresetTextForRequest(preset, settings.h3PromptPresets[preset]);
  const grounding = images.length ? "" : "\n\nThis is text-to-video with no reference image. Establish the opening clearly from the user's brief and carry it forward.";
  const longVideoSkillContext = {
    sourcePrompt: planRequest.brief.text,
    supplementalContext: [request.referenceContext, ...planRequest.segments.map(s => s.text || s.outline)].filter(Boolean).join("\n"),
    mode: "T2VA" as const,
    preset,
    durationSeconds: duration,
    hasReferenceMedia: images.length > 0,
    isLongVideo: true
  };
  const sharedSkills = selectH3PromptSkills(longVideoSkillContext);
  const allocationSkillsBlock = formatH3PromptSkills(sharedSkills, longVideoSkillContext, { includeExamples: false });
  const allocationCatalogBlock = formatH3SkillCatalogForAllocation(sharedSkills.map((skill) => skill.id));
  const buildDetailSystemPrompt = (skills: readonly H3PromptSkill[]): string => [
    `${continuumDirectorContract}${grounding}`,
    `Style direction (${preset}): ${style}`,
    formatH3PromptSkills(skills, longVideoSkillContext),
    continuumDetailExamples
  ].filter(Boolean).join("\n\n");
  const allocationSystemPrompt = [
    `${continuumDirectorContract}${grounding}`,
    allocationSkillsBlock,
    allocationCatalogBlock
  ].filter(Boolean).join("\n\n");

  const runMessages = async (
    messages: StrataChatRequest["messages"],
    label: string,
    onStreamDelta?: (accumulated: string) => void
  ): Promise<string> => {
    signal.throwIfAborted();
    const current: StrataChatRequest = {
      ...base,
      presencePenalty: LONG_VIDEO_PRESENCE_PENALTY,
      messages
    };
    await beforeChat(current);
    progress("generating", null, label);
    let accumulated = "", outputBudget = current.maxTokens;
    const raw = await owner.chat(
      current,
      signal,
      delta => {
        accumulated += delta;
        onStreamDelta?.(accumulated);
        progress("generating", null, `${label} · ${accumulated.length}`);
      },
      tokens => { outputBudget = tokens; },
      count => progress("generating", null, `${label} · ${t(uiKeys.strataPrompt.reasoning, { count, tokens: outputBudget })}`)
    );
    signal.throwIfAborted();
    return raw;
  };

  const userContent = (text: string, includeImages: boolean): StrataChatRequest["messages"][number]["content"] => {
    const body = request.referenceContext && includeImages ? `${request.referenceContext}\n\n${text}` : text;
    return includeImages && images.length ? [...images, { type: "text", text: body }] : body;
  };

  const originalStory = `ORIGINAL STORY AND USER REQUIREMENTS:\n${planRequest.brief.text}`;
  const omitScore = continuumOmitsScore(planRequest.brief.text);
  const prefixChunks = planRequest.layout.prefixChunks;
  const totalPlannedChunks = prefixChunks + planRequest.segments.length;
  const slots = planRequest.segments.map((page, index) => ({
    pageId: page.pageId,
    chunkNumber: prefixChunks + index + 1,
    window: `${(prefixChunks + index) * duration}–${(prefixChunks + index + 1) * duration}s`
  }));
  const targets = longVideoPromptTargets(planRequest);
  const existingSource = JSON.stringify(planRequest.segments.map((page, index) => ({
    chunk: prefixChunks + index + 1, pageId: page.pageId, locked: page.locked, text: page.text || page.outline
  })));

  const runAllocation = async (): Promise<{ storyBible?: string; skills?: string[]; segments: Array<{ pageId: string; text: string }> }> => {
    const instruction = [
      continuumAllocationInstruction,
      originalStory,
      `CHUNK WINDOWS (${duration}s each):\n${JSON.stringify(slots)}`,
      `CURRENT PAGES:\n${existingSource}`,
      `REQUESTED UNLOCKED PAGE IDS:\n${JSON.stringify(targets.map(p => p.pageId))}`
    ].join("\n\n");
    const raw = await runMessages([
      { role: "system", content: allocationSystemPrompt },
      { role: "user", content: userContent(instruction, true) }
    ], t(uiKeys.strataPrompt.moviePlanning));
    let parsedJson: unknown;
    try { parsedJson = parseJsonObject(raw); }
    catch { throw new StrataPromptValidationError(t(uiKeys.strataPrompt.planIncomplete)); }
    const parsed = parseStructuredBatch(parsedJson, targets, "outline", settings.uiLocale, false);
    if (!parsed) throw new StrataPromptValidationError(t(uiKeys.strataPrompt.planIncomplete));
    return parsed;
  };

  if (planRequest.operation === "allocate") {
    const allocated = await runAllocation();
    const encoded = JSON.stringify({
      schemaVersion: 1,
      scriptId: planRequest.scriptId,
      revision: planRequest.revision,
      ...(allocated.storyBible ? { storyBible: allocated.storyBible } : {}),
      segments: allocated.segments.map(page => ({ ...page, outline: page.text.slice(0, 4000) }))
    });
    parseLongVideoPromptResult(encoded, planRequest);
    return encoded;
  }

  let storyBible = planRequest.storyBible?.trim() || undefined;
  let activeDetailSkills: readonly H3PromptSkill[] = sharedSkills;
  const allocatedMap = new Map<string, string>();
  if (!planRequest.operation) {
    const allocated = await runAllocation();
    storyBible = allocated.storyBible ?? storyBible;
    if (allocated.skills?.length) {
      activeDetailSkills = mergeH3PromptSkills(activeDetailSkills, resolveH3SkillsByIds(allocated.skills, true));
    }
    for (const seg of allocated.segments) {
      allocatedMap.set(seg.pageId, seg.text);
      const sourcePage = planRequest.segments.find(p => p.pageId === seg.pageId);
      if (sourcePage && !sourcePage.text.trim()) {
        progress("generating", null, t(uiKeys.strataPrompt.moviePlanning), {
          scriptId: planRequest.scriptId,
          revision: planRequest.revision,
          stage: "allocation",
          segment: { pageId: seg.pageId, text: seg.text, outline: seg.text.slice(0, 4000) }
        });
      }
    }
  }
  const detailSystemPrompt = buildDetailSystemPrompt(activeDetailSkills);

  const outlineFor = (page: typeof targets[number]) =>
    allocatedMap.get(page.pageId)?.slice(0, 4000) || page.outline.trim() || page.text.trim().slice(0, 4000);
  const directionFor = (page: typeof targets[number]) =>
    page.text.trim() || allocatedMap.get(page.pageId) || page.outline.trim();

  const buildPageContext = (page: typeof targets[number], adopted: LongVideoPromptResult["segments"]) => {
    const index = planRequest.segments.indexOf(page);
    const previous = planRequest.segments[index - 1];
    const next = planRequest.segments[index + 1];
    const previousText = previous ? adopted.find(entry => entry.pageId === previous.pageId)?.text ?? directionFor(previous) : "";
    const completedBeat = (entry: typeof page) => continuumAllocatedBeat(directionFor(entry)) ?? continuumAllocatedBeat(entry.outline);
    const recentHandoffs = planRequest.segments.slice(Math.max(0, index - 3), Math.max(0, index - 1)).map(entry => ({
      pageId: entry.pageId,
      completedBeat: completedBeat(entry),
      exit: continuumBoundaryExcerpt(adopted.find(item => item.pageId === entry.pageId)?.text ?? directionFor(entry), "handoff")
    })).filter(entry => entry.exit || entry.completedBeat);
    return {
      pageId: page.pageId,
      chunkNumber: prefixChunks + index + 1,
      totalChunks: totalPlannedChunks,
      currentDirection: directionFor(page),
      ...(page.userEditedDirection && { userEditedDirection: true }),
      ...(recentHandoffs.length && { recentHandoffs }),
      ...(previous ? {
        previousPageId: previous.pageId,
        previousChunkNumber: prefixChunks + index,
        previousBeat: completedBeat(previous),
        previousExit: continuumBoundaryExcerpt(previousText, "handoff"),
        previousAudio: continuumCarriedAudio(previousText)
      } : prefixChunks > 0 ? {
        previousChunkNumber: prefixChunks
      } : {}),
      ...(next && { nextEntry: continuumBoundaryExcerpt(directionFor(next), "opening") })
    };
  };

  const repairSinglePage = async (
    page: typeof targets[number],
    adopted: LongVideoPromptResult["segments"],
    draft: string | null,
    issues: string[],
    label: string
  ): Promise<string> => {
    const context = buildPageContext(page, adopted);
    const instruction = [
      continuumDetailInstruction(duration, preset, true),
      ...(storyBible ? [`STORY BIBLE:\n${storyBible}`] : []),
      originalStory,
      `TARGET CHUNK CONTEXT:\n${JSON.stringify(context)}`,
      `Fix ONLY these structural issues while preserving the intended actions, continuity, and concise pacing:\n- ${issues.join("\n- ")}`,
      ...(draft ? [`DRAFT TO FIX:\n${draft.slice(0, 16000)}`] : [])
    ].join("\n\n");
    const revisedRaw = await runMessages([
      { role: "system", content: detailSystemPrompt },
      { role: "user", content: userContent(instruction, true) }
    ], label);
    const revised = singleDetailText(revisedRaw, page, omitScore);
    if (!revised || continuumDetailFormatIssues(revised, duration).length) {
      throw new StrataPromptValidationError(t(uiKeys.strataPrompt.continuumDetailFormat));
    }
    return revised;
  };

  const result: LongVideoPromptResult = {
    schemaVersion: 1,
    scriptId: planRequest.scriptId,
    revision: planRequest.revision,
    ...(storyBible ? { storyBible } : {}),
    segments: []
  };

  // Single-page rewrite / assisted mode: one focused plain-text call.
  if (targets.length === 1) {
    const page = targets[0]!;
    const index = planRequest.segments.indexOf(page);
    const label = t(uiKeys.strataPrompt.batchProgress, { first: prefixChunks + index + 1, last: prefixChunks + index + 1, total: totalPlannedChunks });
    const instruction = [
      continuumDetailInstruction(duration, preset, true),
      ...(storyBible ? [`STORY BIBLE:\n${storyBible}`] : []),
      originalStory,
      `TARGET CHUNK CONTEXT:\n${JSON.stringify(buildPageContext(page, result.segments))}`
    ].join("\n\n");
    const raw = await runMessages([
      { role: "system", content: detailSystemPrompt },
      { role: "user", content: userContent(instruction, true) }
    ], label);
    let detail = singleDetailText(raw, page, omitScore);
    const issues = detail ? continuumDetailFormatIssues(detail, duration) : ["Return the complete H3 prompt with integrated_multimodal_description, overall_soundscape, and non_diegetic_music."];
    if (issues.length) detail = await repairSinglePage(page, result.segments, detail ?? raw, issues, label);
    const segment = { pageId: page.pageId, text: detail!, outline: outlineFor(page) };
    result.segments.push(segment);
    progress("generating", null, label, { scriptId: planRequest.scriptId, revision: planRequest.revision, segment });
    progress("validating", null, t(uiKeys.strataPrompt.movieValidating));
    const encoded = JSON.stringify(result);
    parseLongVideoPromptResult(encoded, planRequest);
    return encoded;
  }

  // Cohesive single-session / multi-turn director expansion (up to 6 chunks per turn in ONE conversation).
  const conversation: StrataChatRequest["messages"] = [{ role: "system", content: detailSystemPrompt }];
  const emitted = new Set<string>();

  for (let offset = 0; offset < targets.length; offset += COHESIVE_BATCH_SIZE) {
    const batch = targets.slice(offset, offset + COHESIVE_BATCH_SIZE);
    const firstChunk = prefixChunks + planRequest.segments.indexOf(batch[0]!) + 1;
    const lastChunk = prefixChunks + planRequest.segments.indexOf(batch.at(-1)!) + 1;
    const label = t(uiKeys.strataPrompt.batchProgress, { first: firstChunk, last: lastChunk, total: totalPlannedChunks });
    const batchIndices = new Set(batch.map(p => planRequest.segments.indexOf(p)));
    const batchContext = batch.map(page => {
      const idx = planRequest.segments.indexOf(page);
      const prev = planRequest.segments[idx - 1];
      const next = planRequest.segments[idx + 1];
      const prevAdopted = prev ? result.segments.find(s => s.pageId === prev.pageId)?.text : undefined;
      const includePrev = prev && !batchIndices.has(idx - 1);
      const includeNext = next && !batchIndices.has(idx + 1);
      return {
        chunkNumber: prefixChunks + idx + 1,
        pageId: page.pageId,
        direction: directionFor(page),
        ...(page.userEditedDirection && { userEditedDirection: true }),
        ...(includePrev ? {
          previousChunkNumber: prefixChunks + idx,
          previousExit: continuumBoundaryExcerpt(prevAdopted ?? directionFor(prev), "handoff"),
          previousAudio: continuumCarriedAudio(prevAdopted ?? directionFor(prev))
        } : idx === 0 && prefixChunks > 0 ? {
          previousChunkNumber: prefixChunks
        } : {}),
        ...(includeNext ? { nextEntry: continuumBoundaryExcerpt(directionFor(next), "opening") } : {})
      };
    });

    const isFirstTurn = offset === 0;
    const turnInstruction = isFirstTurn
      ? [
          continuumDetailInstruction(duration, preset, false),
          ...(storyBible ? [`STORY BIBLE:\n${storyBible}`] : []),
          originalStory,
          `REQUESTED CHUNKS TO WRITE IN ORDER (${batch.length} of ${totalPlannedChunks} total):\n${JSON.stringify(batchContext)}`
        ].join("\n\n")
      : [
          `Continue seamlessly from the previous chunk you just wrote. Write ONLY the next ${batch.length} chunks in exact order using the same '=== CHUNK <pageId> ===' plain-text format, keeping the same cast, props, camera discipline, and local 0–${duration}s clock.`,
          `NEXT REQUESTED CHUNKS:\n${JSON.stringify(batchContext)}`
        ].join("\n\n");

    conversation.push({ role: "user", content: userContent(turnInstruction, isFirstTurn) });

    // Stream-adopt each completed chunk as soon as the next === CHUNK === header starts.
    const batchExpected = new Map(batch.map(p => [p.pageId, p]));
    const raw = await runMessages(conversation, label, accumulated => {
      const blocks = parseContinuumChunkBlocks(accumulated);
      if (blocks.length < 2) return;
      for (const block of blocks.slice(0, -1)) {
        if (emitted.has(block.pageId)) continue;
        const page = batchExpected.get(block.pageId);
        if (!page || !validText(block.rawText, 24000)) continue;
        const formatted = formatContinuumDetail(block.rawText, omitScore);
        if (!formatted || continuumDetailFormatIssues(formatted, duration).length) continue;
        emitted.add(block.pageId);
        progress("generating", null, label, {
          scriptId: planRequest.scriptId,
          revision: planRequest.revision,
          segment: { pageId: page.pageId, text: formatted, outline: outlineFor(page) }
        });
      }
    });

    conversation.push({ role: "assistant", content: raw });
    const parsed = parseDetailBatchOutput(raw, batch, omitScore);

    for (const page of batch) {
      const chunkNum = prefixChunks + planRequest.segments.indexOf(page) + 1;
      const singleLabel = t(uiKeys.strataPrompt.batchProgress, { first: chunkNum, last: chunkNum, total: totalPlannedChunks });
      const entry = parsed.get(page.pageId);
      let detail: string | null = entry?.formatted ?? null;
      const diagnosticSource = detail ?? entry?.raw ?? null;
      const issues = diagnosticSource
        ? continuumDetailFormatIssues(diagnosticSource, duration)
        : [`Missing valid H3 prompt block for chunk ${chunkNum} (${page.pageId}).`];
      if (!detail && !issues.length) issues.push("Include all three H3 fields in exact order: integrated_multimodal_description:, overall_soundscape:, and non_diegetic_music:.");
      if (issues.length) {
        detail = await repairSinglePage(page, result.segments, diagnosticSource, issues, singleLabel);
      }
      const segment = { pageId: page.pageId, text: detail!, outline: outlineFor(page) };
      result.segments.push(segment);
      if (!emitted.has(page.pageId)) {
        emitted.add(page.pageId);
        progress("generating", null, singleLabel, {
          scriptId: planRequest.scriptId,
          revision: planRequest.revision,
          segment
        });
      }
    }
  }

  progress("validating", null, t(uiKeys.strataPrompt.movieValidating));
  const encoded = JSON.stringify(result);
  parseLongVideoPromptResult(encoded, planRequest);
  return encoded;
}
