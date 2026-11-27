import type { EnhanceRequest, H3PromptMode, H3PromptPreset, Settings } from "../../../types.js";
import { h3DurationPlan, h3ExplicitConstraintSummary, h3PromptSectionSkeleton } from "../../h3-prompt.js";
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

import { countPromptWords } from "../../prompt-count.js";

/** Grounded cinematic prose range for Strata (Qwen 3.8 Flash Next): rich execution detail without filler. */
export function strataH3WordGuidance(
  mode: H3PromptMode,
  durationSeconds: number,
  preset: H3PromptPreset,
  sourcePrompt = ""
): { min: number; max: number } {
  const detailed = preset === "detailed-cinematic";
  const r2vBonus = mode === "R2V" ? 60 : 0;
  const sourceWords = countPromptWords(sourcePrompt);
  const denseBonus = sourceWords > 100 ? Math.min(180, Math.round((sourceWords - 100) * 0.8)) : 0;
  let base: { min: number; max: number };
  if (durationSeconds <= 6.5) base = detailed ? { min: 320, max: 480 } : { min: 180, max: 280 };
  else if (durationSeconds <= 11) base = detailed ? { min: 450, max: 680 } : { min: 260, max: 400 };
  else if (durationSeconds <= 16) base = detailed ? { min: 580, max: 850 } : { min: 340, max: 520 };
  else base = detailed ? { min: 700, max: 1020 } : { min: 420, max: 640 };
  return {
    min: base.min + r2vBonus + Math.round(denseBonus * 0.6),
    max: base.max + r2vBonus + denseBonus
  };
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
      `Author the visible NEW segment from 0.00 to ${duration.toFixed(2)} seconds in T2VA field shape (no <Picture 1>, <Video 1>, or alignment line). Begin integrated_multimodal_description with [Shot 1] ${opener} Follow the active Continuum continuity skill below.`
    ].join("\n");
  }
  if (isExtension) {
    const modeNote = mode === "R2V"
      ? "Motion Context R2V continuation: <Video 1> is the locked source video; boundary image is inspection-only."
      : "FL2VA/I2VA boundary continuation: <Picture 1> is the exact final source frame and 0.00s opening frame. Keep the official alignment line first.";
    return [
      "EXTENSION CONTINUITY CONTRACT:",
      `Author the visible NEW segment from 0.00 to ${duration.toFixed(2)} seconds following the active Continuum continuity skill below.`,
      modeNote
    ].join("\n");
  }
  if (mode === "R2V") {
    return [
      "R2V FULL-REFERENCE CONTRACT:",
      refRule,
      "Output all six official sections in order as plain text: subject_definitions:, summary:, retention_analysis:, detailed_description:, overall_soundscape:, non_diegetic_music:.",
      "Give every supplied asset ONE clear, stable job: <Subject N> for reusable people/objects/scenes/styles, <Picture N> only for concrete frame anchors, <Video N> for source video structure (never derived from itself), <Audio N> for copied/referenced sound. Keep each label's meaning and ownership identical across all six sections without blending separate subjects.",
      "Begin summary with the exact bracketed task type (e.g. [reference generation], [keyframe completion], [video continuation], [video editing], [audio reuse]/[audio reference]). In retention_analysis, use only official markers (fully_preserved, partially_preserved, attribute_transfer, weak_reference; or fully_copy / partially_copy / reference for audio) with no speaker IDs."
    ].join("\n");
  }
  const baseModeNote = mode === "FL2VA"
    ? "FL2VA keyframe bridge: H3 sees <Picture 1> (0.00s) and <Picture 2> (end). Keep the alignment line first. Pair each person across Picture 1 and Picture 2 by stable visual traits and motion continuity—NEVER by screen side or pixel size. Resolve Picture 1-only objects cleanly, keep both anchors in-shot (no early morph/cut), and converge onto Picture 2 only in the final frames."
    : mode === "I2VA"
      ? "I2VA first-frame motion: H3 sees <Picture 1> as Frame 0. Keep the alignment line first. Open from <Picture 1>'s real framing and pose (never teleport at 0.00s; resolve any held object before hands take another action), use <=15 words to anchor distinct subjects, and spend >=80% on evolving motion, interaction, camera travel, and sound."
      : mode === "L2VA"
        ? "L2VA end-frame convergence: keep the alignment line for Picture 1 (end), infer one natural starting state, and converge smoothly onto Picture 1 only in the final frames."
        : "T2VA text-to-video: start directly with integrated_multimodal_description: (no alignment line).";
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

  const isExtension = Boolean(request.extensionSource);
  const skillContext = {
    sourcePrompt: source,
    supplementalContext: context,
    mode,
    preset,
    durationSeconds: duration,
    hasReferenceMedia,
    isExtension,
    isNativeContinuum: native,
    previousChunk: request.continuumPreviousChunk
  };
  const activeSkills = selectH3PromptSkills(skillContext);
  const activeSkillIds = activeSkills.map((skill) => skill.id);
  const skillsBlock = formatH3PromptSkills(activeSkills, skillContext);
  const unloadedCatalogSkills = hasReferenceMedia ? unloadedH3SkillCatalog(activeSkillIds, false) : [];
  const unloadedSkillIds = unloadedCatalogSkills.map((skill) => skill.id);
  const lazyCatalogBlock = unloadedSkillIds.length ? formatH3SkillCatalogForLazyLoad(activeSkillIds, false) : "";

  const wordRange = strataH3WordGuidance(mode, duration, preset, source);
  const detailedExpansionRule = preset === "detailed-cinematic"
    ? " Develop EVERY user-requested action beat into rich, concrete cinematic execution: anticipation, balance and weight transfer, limb/footwork mechanics, surface/skin/fabric response, gaze and facial micro-expressions, affected-subject reaction, smooth continuous camera choreography, and causally synced sound—never compress the action into a thin summary."
    : "";
  const densityLine = language === "en"
    ? `Target length & motion focus (advisory): develop roughly ${wordRange.min}–${wordRange.max} grounded English words in the main timeline for ${duration.toFixed(2)}s.${detailedExpansionRule} Keep >=80% of the prose on active chronological movement, physical interaction, camera travel, and sound—never waste words recapping static image details H3 already sees.`
    : `Target length & motion focus (advisory): develop roughly ${Math.round(wordRange.min * 1.8)}–${Math.round(wordRange.max * 1.8)} grounded Chinese characters in the main timeline for ${duration.toFixed(2)}s.${detailedExpansionRule} Keep >=80% of the prose on active chronological movement, physical interaction, camera travel, and sound—never waste words recapping static image details.`;

  const contract = [
    "ROLE (TWO LAYERS): You (Qwen) are a prompt compiler translating the user's brief and reference image(s) into ONE audiovisual prompt consumed directly by MiniMax H3 (24fps video + 32kHz stereo audio, no negative-prompt channel). All rules and skills below are private instructions for YOU—output ONLY concrete visual, physical, camera, and audio prose that H3 can render.",
    [
      "H3 PITFALLS — WRONG vs RIGHT (learn these exact translations):",
      "1. Identity & age bleed — WRONG: brief says 'tiny girl (age 18)' -> writing 'a giant 18-year-old woman' or confusing the two people. | RIGHT: every character is a separate person; keep 'age 18' ONLY on the tiny adult woman, omit unknown age/details on others, never guess unseen traits.",
      "2. Static image recap (I2VA/FL2VA) — WRONG: listing outfits, text/logos, furniture, or walls from <Picture 1>. | RIGHT: 1 short identifying tag (<=15 words total), then immediately describe action at 0.0s (>=80% motion, contact, camera, sound).",
      "3. Negative / meta / toy leaks — WRONG: 'NOT a figure, no talking, no music, no jitter, preserve lighting'. | RIGHT: positive visuals ('tiny adult woman', 'lips stay softly closed as she breathes quietly') and `non_diegetic_music: N/A`.",
      "4. Frame-0 teleport & hard cuts — WRONG: <Picture 1> is wide yet 0.00s starts in macro close-up, or jumping from 'wide shot' to 'close-up'/'overhead view'. | RIGHT: start from <Picture 1>'s real framing and glide along ONE smooth continuous track.",
      "5. Audio section mixing — WRONG: putting dialogue, voice quality, shot labels, timestamps, or 'no music' inside `overall_soundscape:`. | RIGHT: dialogue (e.g. `the young woman (S1) says: <d>[English] ...</d>`) + action-synced SFX in main timeline; ONLY ambient/foley (1–4 sentences, ZERO speech/voice/music mention) in `overall_soundscape:`; score (1–3 sentences) or `N/A` in `non_diegetic_music:`.",
      "6. Blocked A→B shortcuts & casual brief wording — WRONG: brief casually says 'crawls into pocket/waistband' or 'walks up to the shoulder' -> clipping through closed cloth/door, teleporting across a height gap, or rushing a long climb in 1s. | RIGHT: decode the real physical intent behind rough phrasing, stage concrete obstacle-clearing steps (pull open a visible gap, climb over a rim, unlatch a door, step around), and allocate realistic travel speed across the full duration."
    ].join("\n"),
    [
      "CORE H3 RULES:",
      "- Casual intent translation & action semantics: decode rough/informal briefs into physically grounded execution without inventing unrelated plots. Preserve every requested subject, actor→action→target, verb meaning, repetition, timing, and late camera trajectory (e.g. entry + orbit). Silently fix draft typos/slips ('dogging'→'dodging', 'setting'→'sitting', inverted role slips) and merge repeated camera starts into one path. Never generalize named body parts, weaken repeated motion into one hold, add clothing over a bare surface, or replace subject travel with camera-only motion.",
      "- Framing & camera grammar: keep shot size consistent with visible body range (close-up = head/shoulders, medium = waist up, full shot = head to toe). Describe camera moves in natural grammatical prose combining motion type + amplitude + speed (e.g. 'the camera pushes in slowly', 'glides in a smooth 180-degree horizontal arc shot', 'tracks steadily alongside', 'tilts gently upward', or holds a static shot), using ONE primary trajectory per phase.",
      shotPolicy === "allow-multiple"
        ? "- Multi-shot structure: keep requested cuts using `[Shot 1]` (untimed) then `[Shot 2] At 00:SS.mmm, ...` with strictly increasing local timestamps."
        : "- Strict single-take lock: write `[Shot 1]` ONCE at the start of the timeline, open with an unbroken single-take phrase ('In one continuous unbroken shot...'), and connect all reframing smoothly along one track so H3 never invents a hard cut."
    ].join("\n"),
    h3DurationPlan(mode, duration, preset, duration),
    strataModeContract(mode, duration, native, Boolean(request.extensionSource), request.continuumPreviousChunk, request.referenceContext),
    densityLine,
    skillsBlock,
    lazyCatalogBlock,
    "Required output skeleton (exact English ASCII headings once; put the alignment line ONLY at the top, and begin `integrated_multimodal_description:` directly with `[Shot 1] `):",
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

  const worksheet = hasReferenceMedia
    ? [
        "PRIVATE THINKING WORKSHEET (fill silently inside `<think>`—NEVER print in the final answer):",
        "1. INTENT: decode the user's real goal behind rough/casual wording—exact subjects, verbs, camera trajectory, dialogue/sound, ending.",
        "2. IMAGE GROUND TRUTH (scan the ENTIRE attached image(s), including small subjects on limbs/surfaces/corners):",
        "   - Frame 0 real framing & visual style:",
        "   - Subject A (visible traits + ONLY brief notes meant for A; omit unknown age/details):",
        "   - Subject B if any (visible traits + ONLY brief notes meant for B; exact tight visual ratio vs nearest small landmark):",
        `3. A→B ROUTE, OBSTACLES & TIME BUDGET (${duration.toFixed(2)}s): from Frame 0's real start A to target B, check what blocks a straight path (closed fabric/door/rim, height gap, limb, object), pick the concrete physical action to clear/cross it (pull open a visible gap, climb over, unlatch, step around), and divide realistic travel speed across Beat 1 → Beat 2 → Beat 3 (>=80% motion/camera/sound).`,
        "4. SELF-CHECK before outputting: one `[Shot 1]`? passable A→B route (zero clipping/teleporting)? zero age/trait bleed? <=15-word static anchor? zero toy/'figure'/negative/meta words? `overall_soundscape:` has ONLY ambient/foley (zero speech/voice/music mention)?"
      ].join("\n")
    : [
        "PRIVATE THINKING WORKSHEET (fill silently inside `<think>`—NEVER print in the final answer):",
        "1. INTENT & SUBJECT LEDGER: decode the user's real goal behind casual wording—verbs, camera path, dialogue/sound, and separate identity handles (zero age/trait bleed).",
        `2. A→B ROUTE, OBSTACLES & TIME BUDGET (${duration.toFixed(2)}s): check what blocks direct travel from A to B (barrier, height gap, closed fabric/door), plan concrete obstacle-clearing steps, and pace realistic travel speed across Beat 1 → Beat 2 → Beat 3.`,
        "3. SELF-CHECK before outputting: one `[Shot 1]`? passable A→B route (zero clipping/teleporting)? zero toy/'figure'/negative/meta words? `overall_soundscape:` has ONLY ambient/foley (zero speech/voice/music mention)?"
      ].join("\n");

  const task = [
    worksheet,
    `FINAL TASK: Write ONLY the final ${duration.toFixed(2)}-second ${mode} H3 prompt starting with the exact required alignment/field skeleton.`,
    h3PromptOutputLanguageInstruction(request, { uiLocale: settings.uiLocale, promptLanguage: language }),
    "Keep dialogue, lyrics, and visible text verbatim in their original language (English language tag inside `<d>[Chinese] ...</d>`)."
  ].filter(Boolean).join("\n");

  return { contract, sourceData, task, activeSkillIds, unloadedSkillIds, skillContext };
}
