import type { H3PromptMode } from "../types.js";

export interface H3PromptTemplate {
  text: string;
  shotCount: number;
  mode: H3PromptMode;
  effectiveDurationSeconds: number;
}

export interface H3PromptTemplateOptions {
  hasEndImage?: boolean;
  hasStartImage?: boolean;
  mode?: H3PromptMode;
  referenceSlots?: Array<{
    mediaType?: "image" | "video";
    role: string;
    note?: string;
  }>;
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

export type H3CameraMotion =
  | "static"
  | "push-in"
  | "pull-out"
  | "zoom-in"
  | "zoom-out"
  | "pan-left"
  | "pan-right"
  | "truck-left"
  | "truck-right"
  | "tilt-up"
  | "tilt-down"
  | "pedestal-up"
  | "pedestal-down"
  | "tracking"
  | "arc"
  | "pov"
  | "roll-clockwise"
  | "roll-counterclockwise"
  | "shake-slight";

export interface H3PromptBuilderInput {
  style: string;
  subject: string;
  action: string;
  continuity: string;
  physicalLock: string;
  cameraMotion: H3CameraMotion;
  cameraAmplitude: "small" | "large";
  cameraSpeed: "slow" | "fast";
  framing: string;
  diegeticSound: string;
  finalState: string;
  soundscape: string;
  music: string;
  dialogueSpeaker: string;
  dialogueLanguage: string;
  dialogueDelivery: string;
  dialogueText: string;
  onScreenText: string;
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

export function h3ExplicitConstraintSummary(promptText: string): string {
  const prompt = promptText.trim();
  if (!prompt) return "";
  const constraints: string[] = [];
  const completeSilence = /(?:\b(?:no|without)\s+(?:any\s+)?(?:sound|audio)\b|\b(?:silent|silence|muted?)\b|完全静音|全程静音|不要任何声音|没有任何声音|无任何声音|静音)/iu.test(prompt);
  const noMusic = /(?:\b(?:no|without)\s+(?:any\s+)?(?:background\s+)?(?:music|bgm|score|soundtrack)\b|\b(?:music|bgm|score|soundtrack)\s*[:=]\s*(?:none|off|disabled)\b|(?:无|不要|不需要|不加|取消)(?:背景)?(?:音乐|配乐|BGM|音轨))/iu.test(prompt);
  const noDialogue = /(?:\b(?:no|without)\s+(?:any\s+)?(?:dialogue|speech|talking|spoken\s+words|vocals?)\b|无对白|不要对白|无对话|不要说话|不要人声|无旁白)/iu.test(prompt);
  const noVisibleText = /(?:\b(?:no|without)\s+(?:any\s+)?(?:on[- ]screen\s+)?(?:text|subtitles?)\b|不要字幕|不要文字|无字幕|无文字|不要屏幕文字)/iu.test(prompt);
  const oneShot = /(?:\b(?:one|single)\s+(?:continuous\s+)?(?:shot|take)\b|\bcontinuous\s+shot\b|\bno\s+(?:cuts?|scene\s+changes?)\b|\bwithout\s+(?:cuts?|scene\s+changes?)\b|一镜到底|单镜头|一个镜头|连续镜头|不切镜|不要剪辑|无剪辑|不换镜头|不要切换镜头)/iu.test(prompt);

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
  durationSeconds: number
): string {
  const effectiveDuration = h3EffectiveDurationSeconds(durationSeconds);
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
  let prompt = promptText.trim();
  prompt = prompt.replace(/^```(?:text|markdown)?\s*/iu, "");
  prompt = prompt.replace(/\s*```$/u, "").trim();
  const alignmentLine = /^(?:For the target video, at 0\.00 seconds into the target video, <Picture 1> \(from \[Shot 1\]\) is fully referenced\.|How the reference pictures align with the target video —[^\r\n]+)\s*/iu;
  return prompt.replace(alignmentLine, "").trim();
}

export function normalizeH3PromptOutput(
  promptText: string,
  mode: H3PromptMode,
  durationSeconds: number
): string {
  const body = stripLeadingH3AlignmentInstructions(promptText);
  const alignment = h3AlignmentInstruction(mode, durationSeconds);
  if (!alignment) return body;
  return `${alignment}\n\n${body}`.trim();
}

function valueOrFallback(value: string, fallback: string): string {
  return value.trim() || fallback;
}

function promptModeForOptions(options: H3PromptTemplateOptions): H3PromptMode {
  if (options.mode) return options.mode;
  return inferH3PromptMode(
    options.hasStartImage ?? true,
    options.hasEndImage ?? false
  );
}

function referenceLines(
  referenceSlots: H3PromptTemplateOptions["referenceSlots"]
): string {
  if (!referenceSlots?.length) {
    return "Define each supplied <Subject N>, <Picture N>, <Video N>, or <Audio N> according to its actual role; do not invent a label that is not present in the reference map.";
  }
  const counts: Record<"image" | "video", number> = { image: 0, video: 0 };
  let subjectCount = 0;
  return referenceSlots.map((slot) => {
    const mediaType = slot.mediaType === "video" ? "video" : "image";
    counts[mediaType] += 1;
    const sourceLabel = `<${mediaType === "video" ? "Video" : "Picture"} ${counts[mediaType]}>`;
    const roleText = slot.role;
    const noteText = slot.note ? `: ${slot.note}` : "";
    const isFrameAnchor = /keyframe|first\s+frame|last\s+frame|frame\s+anchor|首帧|尾帧|关键帧|构图锚点/iu
      .test(`${roleText}${noteText}`);
    if (isFrameAnchor) {
      return `${sourceLabel} is a concrete frame or composition anchor: ${roleText}${noteText}.`;
    }
    subjectCount += 1;
    return `<Subject ${subjectCount}> is reusable ${roleText} content derived from ${sourceLabel}${noteText}.`;
  }).join("\n");
}

function cameraSentence(input: H3PromptBuilderInput): string {
  const motion: Record<H3CameraMotion, string> = {
    static: "holds a static shot",
    "push-in": "pushes in toward the subject",
    "pull-out": "pulls out directly backward along the same optical axis",
    "zoom-in": "zooms in while keeping the camera position stable",
    "zoom-out": "zooms out while keeping the camera position stable",
    "pan-left": "pans left from a stationary position",
    "pan-right": "pans right from a stationary position",
    "truck-left": "trucks left while maintaining the subject relationship",
    "truck-right": "trucks right while maintaining the subject relationship",
    "tilt-up": "tilts upward from a stationary position",
    "tilt-down": "tilts downward from a stationary position",
    "pedestal-up": "pedestals upward while keeping the lens direction stable",
    "pedestal-down": "pedestals downward while keeping the lens direction stable",
    tracking: "uses a smooth tracking shot and follows the subject",
    arc: "moves in a controlled arc around the subject",
    pov: "uses a POV camera from the subject's point of view",
    "roll-clockwise": "rolls clockwise around the lens axis",
    "roll-counterclockwise": "rolls counterclockwise around the lens axis",
    "shake-slight": "shakes slightly with restrained handheld motion"
  };
  if (input.cameraMotion === "static") return "The camera holds a static shot.";
  return `The camera ${motion[input.cameraMotion]} with ${input.cameraAmplitude} amplitude at ${input.cameraSpeed} speed.`;
}

function dialogueSentence(input: H3PromptBuilderInput): string {
  if (!input.dialogueText.trim()) return "";
  const speaker = valueOrFallback(input.dialogueSpeaker, "S1");
  const language = valueOrFallback(input.dialogueLanguage, "English");
  const delivery = valueOrFallback(input.dialogueDelivery, "a clear, natural voice");
  return `The speaker (${speaker}) uses ${delivery} and says exactly: <d>[${language}] ${input.dialogueText.trim()}</d>`;
}

export function createH3PromptFromBuilder(
  builder: H3PromptBuilderInput,
  durationSeconds: number,
  options: H3PromptTemplateOptions = {}
): H3PromptTemplate {
  const mode = promptModeForOptions(options);
  const effectiveDuration = h3EffectiveDurationSeconds(durationSeconds);
  const subject = valueOrFallback(
    builder.subject,
    "Describe the subject, environment, lighting, and initial composition."
  );
  const action = valueOrFallback(
    builder.action,
    "Begin with one small natural movement, then develop the main action in a clear causal sequence."
  );
  const continuity = valueOrFallback(
    builder.continuity,
    "Preserve the subject identity, appearance, clothing, body proportions, position, lighting, background, and important composition anchors."
  );
  const physicalLock = valueOrFallback(
    builder.physicalLock,
    "Keep the feet, hips, shoulders, head, and gaze physically consistent unless the action explicitly changes them."
  );
  const style = valueOrFallback(builder.style, "Live-action, cinematic and photorealistic.");
  const framing = valueOrFallback(
    builder.framing,
    "Keep the opening composition stable, then progress through a clear intermediate framing change before the final composition."
  );
  const finalState = valueOrFallback(
    builder.finalState,
    "The action completes and the shot settles into a clear final character state and final composition."
  );
  const diegeticSound = valueOrFallback(
    builder.diegeticSound,
    "Synchronize physical sounds and visible environmental responses with the actions on screen."
  );
  const dialogue = dialogueSentence(builder);
  const onScreenText = builder.onScreenText.trim()
    ? `Any visible sign, subtitle, label, or screen text reads exactly "${builder.onScreenText.trim()}".`
    : "";
  const timeline = [
    `[Shot 1] ${style} ${subject}`,
    continuity,
    action,
    physicalLock,
    dialogue,
    cameraSentence(builder),
    framing,
    diegeticSound,
    onScreenText,
    finalState
  ].filter(Boolean).join("\n\n");

  if (mode === "R2V") {
    const references = referenceLines(options.referenceSlots);
    const text = [
      "subject_definitions:",
      references,
      "",
      "summary:",
      `[reference generation] ${subject} Assign each defined Subject, Picture, Video, and Audio label a clear job in the target shot.`,
      "",
      "retention_analysis:",
      `${continuity} For each defined <Subject N>, <Picture N>, <Video N>, or <Audio N>, assign an official relation such as fully_preserved, attribute_transfer, weak_reference, fully_copy, or reference.`,
      "",
      "detailed_description:",
      timeline,
      "",
      "overall_soundscape:",
      valueOrFallback(builder.soundscape, "Natural ambient sound and subtle physical action sounds appropriate to the scene."),
      "",
      "non_diegetic_music:",
      valueOrFallback(builder.music, "N/A")
    ].join("\n");
    return { text, shotCount: 1, mode, effectiveDurationSeconds: effectiveDuration };
  }

  const referenceInstruction = h3AlignmentInstruction(mode, durationSeconds);
  const text = [
    ...(referenceInstruction ? [referenceInstruction, ""] : []),
    "integrated_multimodal_description:",
    timeline,
    "",
    "overall_soundscape:",
    valueOrFallback(builder.soundscape, "Natural ambient sound and subtle physical action sounds appropriate to the scene."),
    "",
    "non_diegetic_music:",
    valueOrFallback(builder.music, "N/A")
  ].join("\n");
  return { text, shotCount: 1, mode, effectiveDurationSeconds: effectiveDuration };
}

export function createH3PromptTemplate(
  currentPrompt: string,
  durationSeconds: number,
  options: H3PromptTemplateOptions = {}
): H3PromptTemplate {
  const mode = promptModeForOptions(options);
  const effectiveDuration = h3EffectiveDurationSeconds(durationSeconds);
  const current = currentPrompt.trim();
  if (mode === "R2V") {
    const references = referenceLines(options.referenceSlots);
    const text = [
      "subject_definitions:",
      references,
      "",
      "summary:",
      `[reference generation] The target video uses the reference assets to guide the subject, scene, style, motion, camera, and sound relationships. ${current || "Define each reusable Subject and assign a clear job to each Picture, Video, and Audio source."}`,
      "",
      "retention_analysis:",
      "For each defined <Subject N>, <Picture N>, <Video N>, or <Audio N>, state whether it is fully_preserved, partially_preserved, attribute_transfer, weak_reference, fully_copy, partially_copy, or reference.",
      "",
      "detailed_description:",
      "[Shot 1] Live-action, cinematic. Establish the target scene, visible actions, natural camera movement, and exactly where each defined <Subject N>, <Picture N>, <Video N>, and <Audio N> influences the shot. If a character speaks, use a stable speaker ID such as (S1) and put only the exact words inside <d>[Chinese] ...</d>.",
      "",
      "overall_soundscape:",
      "Natural ambient sound and subtle physical action sounds appropriate to the scene. Do not repeat dialogue or singing here.",
      "",
      "non_diegetic_music:",
      "N/A"
    ].join("\n");
    return {
      text,
      shotCount: 1,
      mode,
      effectiveDurationSeconds: effectiveDuration
    };
  }
  const referenceInstruction = h3AlignmentInstruction(mode, durationSeconds);
  const pathInstruction = mode === "FL2VA"
    ? "Describe one continuous path from the first-frame state to the exact final composition in <Picture 2>. Keep the subject identity, scene anchors, and lighting consistent; avoid unrelated cuts."
    : mode === "L2VA"
      ? "Treat <Picture 1> as the final frame, infer a plausible preceding state, and describe how the subject, objects, camera, and scene gradually converge on its final composition."
      : mode === "I2VA"
        ? "Develop the action forward from <Picture 1> while preserving the subject identity, clothing, scene anchors, and lighting."
        : "Construct the complete audiovisual timeline directly from the user's text without an image-alignment instruction; add only details consistent with the user's intent.";
  const text = [
    ...(referenceInstruction ? [referenceInstruction, ""] : []),
    "integrated_multimodal_description:",
    `[Shot 1] Live-action, cinematic. ${current || "Describe the subject, environment, visual style, lighting, and important scene anchors."} ${pathInstruction} Describe visible actions, natural camera motion, and synchronized diegetic sound along the timeline. If a character speaks, use a stable speaker ID such as (S1), describe the voice and delivery outside <d>, and put only the exact, untranslated words inside <d>[Chinese] ...</d>. No one speaks in this default template; replace this sentence when dialogue is needed.`,
    "",
    "overall_soundscape: Natural ambient sound and subtle physical action sounds appropriate to the scene. Do not repeat dialogue or singing here.",
    "",
    "non_diegetic_music: N/A"
  ].join("\n");

  return {
    text,
    shotCount: 1,
    mode,
    effectiveDurationSeconds: effectiveDuration
  };
}
