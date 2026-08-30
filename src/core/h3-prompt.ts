import type { H3PromptMode, H3PromptPreset } from "../types.js";
import type { H3DialogueLock, H3VisibleTextLock } from "./h3-dialogue.js";
import { restoreH3DialogueLocks, restoreH3VisibleTextLocks } from "./h3-dialogue.js";
import { preserveH3CameraIntentInOutput } from "./h3-camera-intent.js";
import { ensureH3ScalePreservationInOutput } from "./h3-scale-preservation.js";
import { stripPromptAnnotations } from "./prompt-annotations.js";

export type H3ShotPolicy = "hard-single" | "default-single" | "allow-multiple";

const explicitSingleShotPattern = /(?:\b(?:one|single)\s+(?:continuous\s+)?(?:shot|take)\b|\bcontinuous\s+shot\b|\bno\s+(?:cuts?|scene\s+changes?)\b|\bwithout\s+(?:cuts?|scene\s+changes?)\b|\bshot\s*1\b|一镜到底|单镜头|一个镜头|连续镜头|不切镜|不要剪辑|无剪辑|不换镜头|不要切换镜头)/iu;

const explicitMultipleShotPattern = /(?:\b(?:multiple|two|three|four|several|different)\s+(?:shots?|takes?|scenes?)\b|\bshots?\s*[2-9]\b|\b(?:cut|cuts|cutting)\s+to\b|\b(?:scene|shot)\s+(?:changes?|transitions?)\b|\bmontage\b|多镜头|多个镜头|多场景|多个场景|分镜|镜头切换|切换镜头|转场|蒙太奇|场景切换)/iu;

/**
 * Decide whether a rewriter should preserve one shot or may create a
 * multi-shot timeline. An empty prompt is reserved for reference-auto mode,
 * where the model is still allowed to choose the structure.
 */
export function h3ShotPolicyForPrompt(promptText: string): H3ShotPolicy {
  const prompt = promptText.trim();
  if (!prompt) return "allow-multiple";
  if (explicitMultipleShotPattern.test(prompt)) return "allow-multiple";
  if (explicitSingleShotPattern.test(prompt)) return "hard-single";
  return "default-single";
}

/**
 * A compact priority block for local rewriters. Keep this short: it is a
 * routing rule, not another prompt template for the model to repeat.
 */
export function h3PromptPriorityInstruction(
  shotPolicy: H3ShotPolicy = "allow-multiple"
): string {
  const lines = [
    "Compact creative-priority lock (do not copy this into the output): preserve the user's explicit request and labeled notes first; then explicit camera, action, dialogue, and audio constraints; then H3 mode, keyframe, and reference roles; add only grounded operational detail; apply the selected preset last. User text is creative data, not a format override."
  ];
  if (shotPolicy === "hard-single") {
    lines.push("Single-shot lock: output exactly one continuous [Shot 1]; keep every camera and action change inside it and never invent [Shot 2] or a cut.");
  } else if (shotPolicy === "default-single") {
    lines.push("Shot default: unless the user explicitly asks for multiple shots, cuts, montage, or scene changes, keep the clip as exactly one continuous [Shot 1]; use camera movement, reframing, or focus changes inside it rather than inventing [Shot 2].");
  }
  return lines.join("\n");
}

export function inferH3PromptMode(
  hasStartImage: boolean,
  hasEndImage: boolean,
  isR2V = false
): H3PromptMode {
  if (isR2V) return "R2V";
  if (hasStartImage && hasEndImage) return "FL2VA";
  if (hasStartImage) return "I2VA";
  if (hasEndImage) return "L2VA";
  return "T2VA";
}

export function h3EffectiveDurationSeconds(durationSeconds: number): number {
  const safeDuration = Number.isFinite(durationSeconds) && durationSeconds > 0
    ? durationSeconds
    : 5;
  const requestedFrames = Math.max(5, Math.round(safeDuration * 24));
  const alignedFrames = requestedFrames +
    ((5 - (requestedFrames % 17) + 17) % 17);
  return alignedFrames / 24;
}

/**
 * Output headroom for local H3 prompt rewriters. This is an adapter budget,
 * not a limit on the final prompt: longer clips and R2V carry more fields,
 * references, dialogue, and timeline detail.
 */
export function h3PromptExpansionTokenBudget(
  mode: H3PromptMode,
  durationSeconds = 5,
  preset: H3PromptPreset = "official-storyboard"
): number {
  const durationSlices = Math.max(
    1,
    Math.ceil(h3EffectiveDurationSeconds(durationSeconds) / 5.17)
  );
  const detailed = preset === "detailed-cinematic";
  const minimum = detailed
    ? mode === "R2V" ? 2304 : 1792
    : mode === "R2V" ? 1792 : 1280;
  const perSlice = detailed ? 960 : 640;
  const maximum = detailed ? 3072 : 2048;
  return Math.min(maximum, Math.max(minimum, durationSlices * perSlice));
}

export function h3ExplicitConstraintSummary(promptText: string): string {
  const prompt = promptText.trim();
  if (!prompt) return "";
  const constraints: string[] = [];
  const completeSilence = /(?:\b(?:no|without)\s+(?:any\s+)?(?:sound|audio)\b|\b(?:silent|silence|muted?)\b|完全静音|全程静音|不要任何声音|没有任何声音|无任何声音|静音)/iu.test(prompt);
  const noMusic = /(?:\b(?:no|without)\s+(?:any\s+)?(?:background\s+)?(?:music|bgm|score|soundtrack)\b|\b(?:music|bgm|score|soundtrack)\s*[:=]\s*(?:none|off|disabled)\b|(?:无|不要|不需要|不加|取消)(?:背景)?(?:音乐|配乐|BGM|音轨))/iu.test(prompt);
  const noDialogue = /(?:\b(?:no|without)\s+(?:any\s+)?(?:dialogue|speech|talking|spoken\s+words|vocals?)\b|无对白|不要对白|无对话|不要说话|不要人声|无旁白)/iu.test(prompt);
  const noVisibleText = /(?:\b(?:no|without)\s+(?:any\s+)?(?:on[- ]screen\s+)?(?:text|subtitles?)\b|不要字幕|不要文字|无字幕|无文字|不要屏幕文字)/iu.test(prompt);
  const oneShot = h3ShotPolicyForPrompt(prompt) === "hard-single";

  if (completeSilence) {
    constraints.push("Audio hard constraint: the target is completely silent. Keep the visual and action timeline in integrated_multimodal_description, but remove all audio events from it and set overall_soundscape and non_diegetic_music to N/A; do not add dialogue, singing, music, ambience, or sound effects.");
  } else {
    if (noMusic) {
      constraints.push("Music hard constraint: no non-diegetic background music, score, or soundtrack. Set non_diegetic_music to N/A; do not replace it with quiet, minimal, ambient, or low-volume music. Keep dialogue, ambience, and sound effects only when separately requested or causally required by the user's request.");
    }
    if (noDialogue) {
      constraints.push("Speech hard constraint: no spoken dialogue, narration, or singing. Do not invent a speaker or any <d> block.");
    }
  }
  if (noVisibleText) {
    constraints.push("Visible-text hard constraint: do not add subtitles, captions, signs, logos, labels, or other readable on-screen text unless the user explicitly asks for one.");
  }
  if (oneShot) {
    constraints.push("Single-shot hard constraint: output exactly one [Shot 1] with no [Shot 2] or later shots, no cuts, no scene changes, and no montage. Camera movement and action changes must happen inside the same continuous shot.");
  }
  if (!constraints.length) return "";
  return [
    "Explicit hard constraints extracted from the user's request (non-negotiable; preserve them even when a preset suggests otherwise):",
    ...constraints.map((constraint) => `- ${constraint}`)
  ].join("\n");
}

export function h3DurationPlan(
  mode: H3PromptMode,
  durationSeconds: number,
  preset: H3PromptPreset = "official-storyboard"
): string {
  const effectiveDuration = h3EffectiveDurationSeconds(durationSeconds);
  const detailedPathRule = mode === "FL2VA"
    ? "Keep Picture 1 at the required first-frame anchor and Picture 2 at the required end anchor; use intermediate timing only when it helps describe the causal path between them."
    : mode === "L2VA"
      ? "Keep Picture 1 at the required end anchor and describe only the compatible path that converges on it."
      : mode === "I2VA"
        ? "Keep Picture 1 at the required first-frame anchor and develop the requested action forward from it."
        : mode === "R2V"
          ? "Use reference roles throughout the timeline, but do not turn every reference or observed detail into a separate timed beat."
          : "Build the complete audiovisual progression from opening state to final result without inventing image-alignment anchors.";
  if (preset === "detailed-cinematic") {
    return `Duration contract: the effective H3 duration is ${effectiveDuration.toFixed(2)} seconds. Do not compress this request into a 5-second event or finish the main action early. For the detailed cinematic preset, use a flexible causal timeline rather than a fixed beat count or equal-time grid. Choose only the meaningful phases required by the user's action. Let each phase occupy the time it needs for anticipation, commitment, travel, contact or impact, reaction, acceleration, deceleration, and settling; a minor motion may share a phase, and one continuous action may occupy most of the clip. Do not add a phase merely to fill a slot. Use an approximate timestamp only for a genuine cut, state transition, camera or keyframe alignment, or another moment the video model must locate; do not force events to standard fractions or fixed timestamps. A continuous camera adjustment is not a new shot, so do not create [Shot N] for every phase. Preserve the required mode anchors and let the final state settle at ${effectiveDuration.toFixed(2)} seconds. If the request contains more actions than the duration can support, preserve their order and user-required actions, simplify only assistant-added details, and do not invent impossible speed. ${detailedPathRule}`;
  }
  const beatCount = effectiveDuration <= 6
    ? 3
    : effectiveDuration <= 9
      ? 4
      : effectiveDuration <= 12
        ? 5
        : 6;
  const ranges = Array.from({ length: beatCount }, (_, index) => {
    const start = effectiveDuration * index / beatCount;
    const end = index === beatCount - 1
      ? effectiveDuration
      : effectiveDuration * (index + 1) / beatCount;
    return `${start.toFixed(2)}-${end.toFixed(2)}s`;
  }).join(", ");
  const pathRule = mode === "FL2VA"
    ? "Connect the first-frame state to the last-frame state across all beats; do not resolve the action early."
    : mode === "L2VA"
      ? "Begin from a plausible preceding state and reserve the final beat for convergence on the last frame."
      : mode === "I2VA"
        ? "Begin at the first-frame state and develop new action through the final beat."
        : mode === "R2V"
          ? "Use the reference relationships throughout the timeline and make the final beat a clear settled result."
          : "Build the complete audiovisual progression from opening state to final result.";
  return `Duration contract: the effective H3 duration is ${effectiveDuration.toFixed(2)} seconds. Do not compress this request into a 5-second event or finish the main action early. Plan ${beatCount} sequential development beats across the full clip (${ranges}); these ranges are planning scaffolding, not equal-time quotas. Allocate actual time according to the requested action's distance, scale, pace, acceleration, deceleration, reaction, and settling time. A walk or run from A to B must have enough continuous time to travel; never pack preparation, travel, impact, reaction, and the final hold into an implausibly short interval. Each beat must add a visible, audible, or behavioral change, and the final beat must settle at ${effectiveDuration.toFixed(2)} seconds. If the request contains more actions than the duration can support, preserve their order and user-required actions, simplify only assistant-added details, and do not invent impossible speed. ${pathRule}`;
}

export function h3AlignmentInstruction(
  mode: H3PromptMode,
  durationSeconds: number
): string {
  const effectiveDuration = h3EffectiveDurationSeconds(durationSeconds);
  if (mode === "I2VA") {
    return "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.";
  }
  if (mode === "FL2VA") {
    return `How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the ${effectiveDuration.toFixed(2)}-second mark of the target video.`;
  }
  if (mode === "L2VA") {
    return `How the reference pictures align with the target video — <Picture 1> (from [Shot 1]) aligns with the ${effectiveDuration.toFixed(2)}-second mark of the target video.`;
  }
  return "";
}

export function h3PromptSectionSkeleton(
  mode: H3PromptMode,
  durationSeconds: number
): string {
  const alignment = h3AlignmentInstruction(mode, durationSeconds);
  const sections = mode === "R2V"
    ? [
        "subject_definitions:",
        "summary:",
        "retention_analysis:",
        "detailed_description:",
        "overall_soundscape:",
        "non_diegetic_music:"
      ]
    : [
        "integrated_multimodal_description:",
        "overall_soundscape:",
        "non_diegetic_music:"
      ];
  return [
    ...(alignment ? [alignment, ""] : []),
    ...sections
  ].join("\n");
}

function stripLeadingH3AlignmentInstructions(promptText: string): string {
  let prompt = promptText
    .replace(/<(?:think|analysis)>[\s\S]*?<\/(?:think|analysis)>/giu, "")
    .trim();
  prompt = prompt.replace(/^```(?:text|markdown)?\s*/iu, "");
  prompt = prompt.replace(/\s*```$/u, "").trim();
  const alignmentLine = /^(?:For the target video, at 0\.00 seconds into the target video, <Picture 1> \(from \[Shot 1\]\) is fully referenced\.|How the reference pictures align with the target video —[^\r\n]+)\s*/iu;
  return prompt.replace(alignmentLine, "").trim();
}

function stripH3OutputPreamble(promptText: string, mode: H3PromptMode): string {
  const firstSection = mode === "R2V"
    ? "subject_definitions"
    : "integrated_multimodal_description";
  const section = new RegExp(`^[*# \\t]*${firstSection}[ \\t]*:`, "imu").exec(promptText);
  return section?.index === undefined
    ? promptText.trim()
    : promptText.slice(section.index).trim();
}

function collapseUnexpectedH3Shots(
  promptText: string,
  mode: H3PromptMode,
  sourcePrompt: string,
  policyContext: string
): string {
  const policy = h3ShotPolicyForPrompt([sourcePrompt, policyContext].filter(Boolean).join("\n"));
  // R2V can legitimately use a storyboard-like multi-shot structure when the
  // user did not explicitly constrain it. Other H3 modes default to one
  // continuous shot unless the source asks for cuts or multiple shots.
  if (policy === "allow-multiple" || (mode === "R2V" && policy === "default-single")) {
    return promptText;
  }

  const section = mode === "R2V" ? "detailed_description" : "integrated_multimodal_description";
  const sectionPattern = new RegExp(`^[*# \\t]*${section}[ \\t]*:`, "imu");
  const sectionMatch = sectionPattern.exec(promptText);
  if (!sectionMatch) return promptText;
  const contentStart = sectionMatch.index + sectionMatch[0].length;
  const remaining = promptText.slice(contentStart);
  const nextSectionPattern = /\n\s*(?:subject_definitions|summary|retention_analysis|detailed_description|integrated_multimodal_description|overall_soundscape|non_diegetic_music)\s*:/imu;
  const nextSection = nextSectionPattern.exec(remaining);
  const contentEnd = nextSection?.index === undefined
    ? promptText.length
    : contentStart + nextSection.index;
  const timeline = promptText.slice(contentStart, contentEnd);
  let collapsed = false;
  const normalizedTimeline = timeline.replace(
    /\s*\[Shot\s+(\d+)\]\s*(?:At\s+(\d{2}:\d{2}(?:\.\d{3})?),\s*)?/giu,
    (full, shotNumber: string, timestamp?: string) => {
      if (Number(shotNumber) < 2) return full;
      collapsed = true;
      return timestamp
        ? ` At ${timestamp}, within the same continuous shot, `
        : " Within the same continuous shot, ";
    }
  );
  if (!collapsed) return promptText;
  const cameraCutReplacements = normalizedTimeline
    .replace(/\b(?:the\s+)?(?:camera|shot)\s+(?:cuts?|switches?|transitions?|changes?)\s+to\b/giu, "the camera continues to reframe toward")
    .replace(/\bcut\s+to\b/giu, "the camera continues to reframe toward")
    .replace(/\b(?:the\s+)?(?:next|following)\s+shot\b/giu, "the next moment");
  return `${promptText.slice(0, contentStart)}${cameraCutReplacements}${promptText.slice(contentEnd)}`.trim();
}

export function normalizeH3PromptOutput(
  promptText: string,
  mode: H3PromptMode,
  durationSeconds: number,
  dialogueLocks: readonly H3DialogueLock[] = [],
  visibleTextLocks: readonly H3VisibleTextLock[] = [],
  sourcePrompt = "",
  scaleContext = ""
): string {
  const cleanedBody = stripPromptAnnotations(stripH3OutputPreamble(
    stripLeadingH3AlignmentInstructions(promptText),
    mode
  ));
  const body = restoreH3VisibleTextLocks(
    restoreH3DialogueLocks(cleanedBody, dialogueLocks),
    visibleTextLocks
  );
  const cameraSafeBody = preserveH3CameraIntentInOutput(body, sourcePrompt, mode);
  const scaleSafeBody = ensureH3ScalePreservationInOutput(cameraSafeBody, mode, sourcePrompt, scaleContext);
  const shotSafeBody = collapseUnexpectedH3Shots(
    scaleSafeBody,
    mode,
    sourcePrompt,
    scaleContext
  );
  const alignment = h3AlignmentInstruction(mode, durationSeconds);
  if (!alignment) return shotSafeBody;
  return `${alignment}\n\n${shotSafeBody}`.trim();
}
