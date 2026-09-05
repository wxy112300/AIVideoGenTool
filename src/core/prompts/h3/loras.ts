import type { VideoLoraSelection } from "../../../types.js";

export interface H3LoraPromptProfile {
  id: string;
  triggerWord?: string;
  instruction: string;
  usage: string;
}

/**
 * Prompt-side guidance for optional H3 adapters. This is deliberately separate
 * from workflow metadata: it helps the prompt model express the selected
 * adapter's useful visual intent without asking it to construct ComfyUI nodes.
 */
export const h3LoraPromptLibrary: Readonly<Record<string, H3LoraPromptProfile>> = {
  "minimax-h3-equi360": {
    id: "minimax-h3-equi360",
    triggerWord: "equirect360",
    instruction: "When the user requests a 360-degree or immersive environment, describe a full equirectangular spherical projection with the horizon near the vertical middle and a complete environment wrapping around the viewer. Preserve the user's subject, action, camera intent, and soundscape; do not invent a headset or stereoscopic view.",
    usage: "This adapter is for mono 360° equirectangular T2VA output. Keep the layout sentence concise and place it after the trigger; prefer static-camera or locked-tripod wording when it fits the user's request. Do not claim stereo, VR180, reference-image control, or 8-step Turbo support."
  },
  "minimax-h3-vr180-sbs": {
    id: "minimax-h3-vr180-sbs",
    triggerWord: "vr180sbs",
    instruction: "When the user requests VR180 stereo, describe one 180-degree scene as a side-by-side layout: the left half is the left-eye view and the right half is the right-eye view of the same scene, nearly identical with a slight horizontal offset. Preserve the user's subject, action, camera, timing, audio, and reference constraints; never turn it into top-bottom stereo, a mono 360-degree equirectangular panorama, or unsupported headset metadata prose.",
    usage: "Use the fixed layout sentence after the trigger and keep the adapter at strength 1.0 with native H3 21:9, 768p output. The app injects vr180sbs separately; do not repeat it as scene prose. Do not claim I2V, 8-step Turbo, or automatic 2:1 spherical packaging; those remain outside the validated path."
  },
  "minimax-h3-camera-motion-v1": {
    id: "minimax-h3-camera-motion-v1",
    triggerWord: "camera motion",
    instruction: "When the user asks for a cinematic camera move, clarify one coherent optical camera path and preserve the requested subject, action, framing, timing, and reference identity. When it fits the shot, retain natural optical depth of field, lens falloff, and restrained handheld micro-shake; do not force camera movement, shallow focus, or shake onto a static shot.",
    usage: "This is a camera/motion adapter, not a subject or action adapter. Keep explicit push-in, pull-out, orbit, tracking, aerial, static-camera, timing, and framing constraints authoritative. When combined with Realism People, keep the camera path restrained and avoid contradictory moves."
  },
  "minimax-h3-facial-realism-closeup": {
    id: "minimax-h3-facial-realism-closeup",
    triggerWord: "Facial Realism",
    instruction: "When the request calls for a human face, favor believable close-up facial performance: natural skin texture, eyes, blinks, small gaze shifts, subtle expression changes, and restrained facial micro-motion. Protect the referenced person's identity and do not beautify, age, reshape, or invent facial details.",
    usage: "This is a quality/content adapter, not an acceleration or camera-motion adapter. Do not force a close-up when the user requests another framing; keep all requested action, camera, audio, and reference roles intact."
  },
  "minimax-h3-realism-people": {
    id: "minimax-h3-realism-people",
    triggerWord: "r34l1sm",
    instruction: "For human-centered shots, favor natural skin texture, visible pores, believable translucency, restrained highlights, and lifelike facial expression and hand motion; reduce oily shine and plastic or CG-looking skin without making skin gritty or changing identity. Do not turn a non-human or non-people request into a portrait.",
    usage: "This is a broad people-realism adapter. Keep any close-up emphasis subordinate to the user's requested framing, and do not invent camera motion or content that the user did not request. When combined with Camera Motion, keep optical and handheld cues subtle and let the user's explicit camera direction win."
  }
};

export function h3LoraPromptProfileFor(id: string): H3LoraPromptProfile | undefined {
  return h3LoraPromptLibrary[id];
}

function selectionLabel(lora: VideoLoraSelection): string {
  const name = lora.name.trim() || lora.id;
  const id = lora.id.trim() || "unknown";
  const strength = Number.isFinite(lora.strength) ? `, strength ${lora.strength}` : "";
  return `${name} [${id}, purpose ${lora.purpose}${strength}]`;
}

/**
 * Return a hidden execution-context block for the H3 prompt enhancers.
 * Empty selection intentionally produces no extra prompt instructions.
 */
export function h3LoraPromptInstruction(
  loras: readonly VideoLoraSelection[] | undefined
): string {
  const selected = (loras ?? [])
    .filter((lora) => lora.id.trim())
    .filter((lora, index, values) => values.findIndex((candidate) => candidate.id === lora.id) === index);
  if (!selected.length) return "";

  return [
    "Selected H3 LoRA context (execution metadata, not user-authored content):",
    "The user has enabled the following optional LoRA adapters. Tailor the generated H3 prompt only where an adapter supports the user's intent. Preserve explicit content, reference identity, framing, camera, timing, dialogue, audio, and mode constraints. Do not mention this metadata, explain the adapter, or emit workflow commentary in the final prompt. The application injects execution trigger words separately, so do not repeat trigger words as scene prose.",
    ...selected.map((lora) => {
      const profile = h3LoraPromptProfileFor(lora.id);
      const trigger = profile?.triggerWord || lora.promptPrefixes?.filter(Boolean).join(", ") || "";
      const metadata = `- Adapter: ${selectionLabel(lora)}${trigger ? `; canonical trigger: ${trigger}` : ""}`;
      if (!profile) {
        return `${metadata}\n  Guidance: Treat this as an optional adapter; preserve user intent and do not invent unsupported effects.`;
      }
      return [
        metadata,
        `  Guidance: ${profile.instruction}`,
        `  Usage: ${profile.usage}`
      ].join("\n");
    })
  ].join("\n\n");
}
