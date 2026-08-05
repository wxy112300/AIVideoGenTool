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

function effectiveDurationSeconds(durationSeconds: number): number {
  const safeDuration = Number.isFinite(durationSeconds) && durationSeconds > 0
    ? durationSeconds
    : 5;
  const requestedFrames = Math.max(5, Math.round(safeDuration * 24));
  const alignedFrames = requestedFrames +
    ((5 - (requestedFrames % 17) + 17) % 17);
  return alignedFrames / 24;
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
    const references = options.referenceSlots?.length
      ? options.referenceSlots.map((slot, index) =>
          `<Picture ${index + 1}> is a ${slot.role} reference${slot.note ? `: ${slot.note}` : "."}`
        ).join("\n")
      : "<Picture 1> is the primary reference image; describe its role and the visual information to preserve.";
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
