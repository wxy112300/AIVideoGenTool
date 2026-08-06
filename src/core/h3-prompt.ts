export interface H3PromptTemplate {
  text: string;
  shotCount: number;
  mode: "I2VA" | "FL2VA" | "R2V";
  effectiveDurationSeconds: number;
}

export interface H3PromptTemplateOptions {
  hasEndImage?: boolean;
  mode?: "I2VA" | "FL2VA" | "R2V";
  referenceSlots?: Array<{ role: string; note?: string }>;
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

function effectiveDurationSeconds(durationSeconds: number): number {
  const safeDuration = Number.isFinite(durationSeconds) && durationSeconds > 0
    ? durationSeconds
    : 5;
  const requestedFrames = Math.max(5, Math.round(safeDuration * 24));
  const alignedFrames = requestedFrames +
    ((5 - (requestedFrames % 17) + 17) % 17);
  return alignedFrames / 24;
}

function valueOrFallback(value: string, fallback: string): string {
  return value.trim() || fallback;
}

function referenceLines(
  referenceSlots: H3PromptTemplateOptions["referenceSlots"]
): string {
  return referenceSlots?.length
    ? referenceSlots.map((slot, index) =>
        `<Picture ${index + 1}> is a ${slot.role} reference${slot.note ? `: ${slot.note}` : "."}`
      ).join("\n")
    : "<Picture 1> is the primary reference image; preserve the visual information that matters to the target shot.";
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
  const mode = options.mode ?? (options.hasEndImage ? "FL2VA" : "I2VA");
  const effectiveDuration = effectiveDurationSeconds(durationSeconds);
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
      `[reference generation] ${subject} Assign each reference picture a clear job in the target shot.`,
      "",
      "retention_analysis:",
      `${continuity} State which attributes from each <Picture N> are fully preserved, transferred, or used as a weak reference.`,
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

  const referenceInstruction = mode === "FL2VA"
    ? `How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the ${effectiveDuration.toFixed(2)}-second mark of the target video.`
    : "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.";
  const text = [
    referenceInstruction,
    "",
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
  const mode = options.mode ?? (options.hasEndImage ? "FL2VA" : "I2VA");
  const effectiveDuration = effectiveDurationSeconds(durationSeconds);
  const current = currentPrompt.trim();
  if (mode === "R2V") {
    const references = referenceLines(options.referenceSlots);
    const text = [
      "subject_definitions:",
      references,
      "",
      "summary:",
      `[reference generation] The target video uses the reference pictures to guide the subject, scene, style, motion, and camera relationships. ${current || "Describe the target video and assign a clear job to each reference picture."}`,
      "",
      "retention_analysis:",
      "State which visual attributes from each <Picture N> are fully preserved, transferred, or used as a weak reference.",
      "",
      "detailed_description:",
      "[Shot 1] Live-action, cinematic. Describe the target scene, visible actions, natural camera movement, and exactly where each <Picture N> influences the shot. If a character speaks, use a stable speaker ID such as (S1) and put only the exact words inside <d>[Chinese] ...</d>.",
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
  const referenceInstruction = mode === "FL2VA"
    ? `How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the ${effectiveDuration.toFixed(2)}-second mark of the target video.`
    : "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.";
  const pathInstruction = mode === "FL2VA"
    ? "Describe one continuous path from the first-frame state to the exact final composition in <Picture 2>. Keep the subject identity, scene anchors, and lighting consistent; avoid unrelated cuts."
    : "Develop the action forward from <Picture 1> while preserving the subject identity, clothing, scene anchors, and lighting.";
  const text = [
    referenceInstruction,
    "",
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
