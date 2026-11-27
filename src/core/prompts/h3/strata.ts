import type { EnhanceRequest, H3PromptMode, H3PromptPreset, Settings } from "../../../types.js";
import { h3ExplicitConstraintSummary, h3PromptSectionSkeleton } from "../../h3-prompt.js";
import { h3AutoPromptInstruction, h3PromptModeForRequest, h3ShotPolicyForRequest, h3TimelineDurationForRequest,
  isH3NativeStateContinuationRequest, isH3ReferenceAutoPrompt } from "../../h3-auto-prompter.js";
import { h3ContentLockInstruction } from "../../h3-dialogue.js";
import { h3PromptPresetForMode, h3PromptPresetTextForRequest } from "./index.js";
import { h3LoraPromptInstruction } from "./loras.js";
import {
  formatH3PromptSkills,
  formatH3SkillCatalogForLazyLoad,
  selectH3PromptSkills,
  unloadedH3SkillCatalog
} from "./skills.js";
import { h3PromptOutputLanguageInstruction } from "../../prompt-language.js";
import { parsePromptAnnotations, promptAnnotationInstruction } from "../../prompt-annotations.js";

/** Realistic advisory prose range for Strata (Qwen 3.8 Flash Next) without 26B word-count inflation. */
export function strataH3WordGuidance(
  mode: H3PromptMode,
  durationSeconds: number,
  preset: H3PromptPreset
): { min: number; max: number } {
  const detailed = preset === "detailed-cinematic";
  const r2vBonus = mode === "R2V" ? 40 : 0;
  if (durationSeconds <= 6.5) return detailed ? { min: 140 + r2vBonus, max: 220 + r2vBonus } : { min: 90 + r2vBonus, max: 150 + r2vBonus };
  if (durationSeconds <= 11) return detailed ? { min: 190 + r2vBonus, max: 290 + r2vBonus } : { min: 130 + r2vBonus, max: 210 + r2vBonus };
  if (durationSeconds <= 16) return detailed ? { min: 240 + r2vBonus, max: 360 + r2vBonus } : { min: 170 + r2vBonus, max: 260 + r2vBonus };
  return detailed ? { min: 300 + r2vBonus, max: 450 + r2vBonus } : { min: 220 + r2vBonus, max: 340 + r2vBonus };
}

function strataModeContract(
  mode: H3PromptMode,
  duration: number,
  native: boolean,
  isExtension: boolean,
  previousChunk: number | undefined,
  referenceContext: string | undefined
): string {
  const refRule = referenceContext?.trim()
    ? "Use ONLY the supplied reference labels from the reference map; never invent extra labels."
    : "Do not invent <Subject N>, <Picture N>, <Video N>, or <Audio N> labels that were not supplied.";
  if (isExtension && native) {
    const opener = previousChunk && previousChunk > 0
      ? `Continuation of Chunk ${previousChunk}.`
      : "Continuation of the preceding segment.";
    return [
      "CONTINUUM CHUNK AUTHORING CONTRACT (native-state continuation):",
      `Author the visible NEW segment from 0.00 to ${duration.toFixed(2)} seconds in T2VA field shape (no <Picture 1>, <Video 1>, or alignment line—the attached boundary frame is inspection-only).`,
      `Begin integrated_multimodal_description with [Shot 1] ${opener} Continue directly from the outgoing pose, contact, momentum, camera trajectory, and sound without replaying completed actions.`
    ].join("\n");
  }
  if (isExtension) {
    const modeNote = mode === "R2V"
      ? "Motion Context R2V continuation: <Video 1> is the locked source video carrying motion and audio; the extracted boundary frame is inspection-only and must not become a <Picture N> anchor."
      : "FL2VA/I2VA boundary continuation: <Picture 1> is the exact final source frame and exact 0.00s opening frame of this new segment. Keep the official alignment line first.";
    return [
      "EXTENSION CONTINUITY CONTRACT:",
      `Author the visible NEW segment from 0.00 to ${duration.toFixed(2)} seconds, continuing seamlessly from the boundary state without replaying it.`,
      modeNote
    ].join("\n");
  }
  if (mode === "R2V") {
    return [
      "R2V FULL-REFERENCE CONTRACT:",
      refRule,
      "Output all six official sections in order: subject_definitions:, summary:, retention_analysis:, detailed_description:, overall_soundscape:, non_diegetic_music:.",
      "Keep each supplied reference distinct with one clear role (<Subject N> for reusable people/objects/scenes/styles, <Picture N> for concrete frame anchors, <Video N> for source video structure, <Audio N> for copied/referenced sound). Start summary with the actual task type (e.g. [reference generation], [keyframe completion], [video continuation], [video editing], [audio reuse]/[audio reference]). In retention_analysis, use fully_preserved, partially_preserved, attribute_transfer, weak_reference (or fully_copy / partially_copy / reference for audio)."
    ].join("\n");
  }
  const baseModeNote = mode === "FL2VA"
    ? "FL2VA keyframe bridge: keep the exact alignment line for Picture 1 (0.00s) and Picture 2 (end). Carry every subject's identity, clothing, role, and relative size consistently from Picture 1 to Picture 2 along one continuous physical path without restating either image as a static caption."
    : mode === "I2VA"
      ? "I2VA first-frame development: keep the exact alignment line for Picture 1 (0.00s), anchor briefly to the opening frame, and spend the timeline on what changes forward."
      : mode === "L2VA"
        ? "L2VA end-frame convergence: keep the exact alignment line for Picture 1 (end) and build a compatible causal path that settles cleanly onto that final frame."
        : "T2VA text-to-video: start directly with integrated_multimodal_description: (no image-alignment line).";
  return [baseModeNote, refRule].join("\n");
}

function strataPresetDirective(preset: H3PromptPreset, savedText?: string): string {
  return h3PromptPresetTextForRequest(preset, savedText);
}

/** Lean, skill-driven Strata compiler for single-clip H3 enhancement (T2VA/I2VA/FL2VA/L2VA/R2V/Extend). */
export function strataH3InstructionParts(request: EnhanceRequest, settings: Settings, dossier = "", language: "zh" | "en" = "zh") {
  if (request.mode === "image-edit" || request.promptStrategy === "targeted-revision") {
    throw new Error("分层实验仅用于完整 H3 提示词增强，不改变图片编辑或批注修订。");
  }
  const mode = h3PromptModeForRequest(request);
  const duration = h3TimelineDurationForRequest(request);
  const preset = h3PromptPresetForMode(mode, request.h3PromptPreset);
  const native = isH3NativeStateContinuationRequest(request);
  const parsed = parsePromptAnnotations(request.prompt);
  const source = parsed.prompt.trim();
  const context = [request.referenceContext, ...parsed.annotations.map(note => note.text)].filter(Boolean).join("\n");
  const shotPolicy = h3ShotPolicyForRequest(request);
  const hasReferenceMedia = Boolean(request.imagePath || request.imagePaths?.length || request.extensionSource);

  const skillContext = {
    sourcePrompt: source,
    supplementalContext: context,
    mode,
    preset,
    durationSeconds: duration,
    hasReferenceMedia
  };
  const activeSkills = selectH3PromptSkills(skillContext);
  const activeSkillIds = activeSkills.map((skill) => skill.id);
  const skillsBlock = formatH3PromptSkills(activeSkills, skillContext);
  const unloadedCatalogSkills = hasReferenceMedia ? unloadedH3SkillCatalog(activeSkillIds, false) : [];
  const unloadedSkillIds = unloadedCatalogSkills.map((skill) => skill.id);
  const lazyCatalogBlock = unloadedSkillIds.length ? formatH3SkillCatalogForLazyLoad(activeSkillIds, false) : "";

  const wordRange = strataH3WordGuidance(mode, duration, preset);
  const densityLine = language === "en"
    ? `Target length (advisory): roughly ${wordRange.min}–${wordRange.max} grounded English words in the main timeline for ${duration.toFixed(2)}s. Every sentence must carry observable action, spatial relation, camera behavior, or sound—never pad with filler or repeated static inventory.`
    : `Target length (advisory): roughly ${Math.round(wordRange.min * 1.8)}–${Math.round(wordRange.max * 1.8)} grounded Chinese characters in the main timeline for ${duration.toFixed(2)}s. Keep every sentence concrete and observable—never pad with filler.`;

  const contract = [
    "You are a film director writing production prompts for MiniMax H3. Return ONLY the complete final H3 prompt—no preamble, planning notes, checklists, or Markdown code fences.",
    "Priority & grounding: the author's explicit subjects, role-action ownership, action order, timing, camera path, exact dialogue/visible text, and ending are ground truth. Inspect the entire attached image(s) carefully—including small subjects in corners, foreground surfaces, hands, or near feet—to ground visible identity, wardrobe, exact spatial position, geography, and lighting; never swap subject roles or invent extra characters, props, locations, dialogue, or music not supported by the brief or references.",
    "Brief synthesis: merge repeated camera starts into ONE chronological path; silently fix obvious draft typos or role slips from context (e.g. 'dogging'→'dodging', 'setting'→'sitting', or an inverted subject slip); absorb pasted meta-instructions ('Preserve the requested action...', 'NOT a figure') into concrete observable prose; and on dense briefs keep beats compact inside ONE unbroken flow while preserving explicit late camera trajectories (such as entry + orbit) without dropping moves or cutting.",
    "Positive-only H3 conditioning: H3 has no negative-prompt channel. Describe only what IS visible and audible; convert user exclusions (e.g., no score, no extra people, no plastic look, no jitter) into positive visual/audio choices and `non_diegetic_music: N/A`—never write negative keyword lists or put 'no music / no score' inside `overall_soundscape:`.",
    shotPolicy === "allow-multiple"
      ? "Shot structure: preserve the requested multi-shot cuts inside the main timeline field using `[Shot 1]` (untimed) followed by `[Shot 2] At 00:SS.mmm, ...` with strictly increasing local timestamps inside the clip duration."
      : "Shot structure (strict single-take lock): use ONE continuous `[Shot 1]` written ONCE at the very start of the timeline (never repeat `[Shot 1]` on subsequent paragraphs), and explicitly establish an unbroken single-take camera in the opening prose (e.g., 'In one continuous unbroken shot...'). Prevent H3 from inventing spontaneous cuts: never jump abruptly between contradictory shot sizes or angles (such as writing 'wide shot' and later 'close-up', 'overhead view', or 'reverse angle'); connect every reframing through smooth physical camera motion (gliding closer, tilting up, panning smoothly along one continuous track).",
    strataModeContract(mode, duration, native, Boolean(request.extensionSource), request.continuumPreviousChunk, request.referenceContext),
    densityLine,
    skillsBlock,
    lazyCatalogBlock,
    "Required output skeleton (write each heading once in exact English ASCII; begin the main timeline body with `[Shot 1] `, never replacing the heading):",
    h3PromptSectionSkeleton(mode, duration, native)
  ].filter(Boolean).join("\n\n");

  const hardConstraints = h3ExplicitConstraintSummary(source);
  const sourceData = [
    dossier ? `PRODUCTION FACTS AND CONTINUITY DOSSIER (source data, not style):\n${dossier}` : "",
    source ? `AUTHOR'S BRIEF:\n${source}` : "",
    request.referenceContext ? `REFERENCE ROLES:\n${request.referenceContext}` : "",
    promptAnnotationInstruction(parsed),
    hardConstraints,
    h3ContentLockInstruction(source),
    isH3ReferenceAutoPrompt(request) ? h3AutoPromptInstruction(request) : "",
    h3LoraPromptInstruction(request.videoLoras),
    `STYLE DIRECTION (${preset}):\n${strataPresetDirective(preset, settings.h3PromptPresets[preset])}`
  ].filter(Boolean).join("\n\n");

  const task = [
    `FINAL TASK: Write the complete ${duration.toFixed(2)}-second ${mode} H3 prompt from the brief, references, and active craft skills.`,
    h3PromptOutputLanguageInstruction(request, { uiLocale: settings.uiLocale, promptLanguage: language }),
    "Keep dialogue, lyrics, and visible text verbatim in their original language (using English language tags inside `<d>[Chinese] ...</d>`). Output only the final H3 prompt starting with the exact required alignment/field skeleton."
  ].filter(Boolean).join("\n");

  return { contract, sourceData, task, activeSkillIds, unloadedSkillIds, skillContext };
}
