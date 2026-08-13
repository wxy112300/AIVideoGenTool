import type { H3PromptMode } from "../types.js";
import { h3EffectiveDurationSeconds } from "./h3-prompt.js";

/**
 * The reusable part of the community Auto Prompter contract.
 *
 * It deliberately stays in core instead of the Electron service: every prompt
 * backend (Gemma, native Qwen, or the ComfyUI Qwen3.6 node) receives the same
 * reference-role and retention rules. The model adapter only changes how the
 * text is produced.
 */
export function h3AutoPrompterContract(
  mode: H3PromptMode,
  durationSeconds: number,
  referenceContext?: string
): string {
  const duration = h3EffectiveDurationSeconds(durationSeconds);
  const referenceRule = referenceContext?.trim()
    ? "Use the supplied reference map as the only source of Subject/Picture/Video/Audio labels."
    : "If no reference map is supplied, do not invent Subject/Picture/Video/Audio labels.";
  const modeRule = mode === "R2V"
    ? [
      "R2V is reference-led: define every supplied reference first, then explain what is retained, transferred, copied, or used only as a weak visual cue.",
      "Use the six sections subject_definitions, summary, retention_analysis, detailed_description, overall_soundscape, and non_diegetic_music in that exact order.",
      "Use <Subject N> for reusable visible content, <Picture N> only for a concrete frame or composition anchor, <Video N> for a source video's edit/continuation/camera/time structure, and <Audio N> for copied or referenced sound. Keep each label's meaning stable across all six sections.",
      "Choose the summary prefix from the actual task relationship: [keyframe completion], [reference generation], [video editing], [video continuation], [audio reuse], and [audio reference]. Combine required types with +; the presence of a video or audio file alone does not select a type.",
      "In retention_analysis, use fully_preserved, partially_preserved, attribute_transfer, or weak_reference for visual labels; use fully_copy, partially_copy, reference, or weak_reference for audio labels. Do not treat an assistant-added action or background as a loss of reference fidelity.",
      "The detailed_description must turn those relationships into a continuous playback timeline; never dump an image caption or a list of disconnected objects.",
      `For a typical reference-generation clip, target roughly 350-500 grounded English words in detailed_description across the ${duration.toFixed(2)}-second timeline. Never pad unsupported detail merely to reach a word count.`
      ]
    : [
        "For I2VA/FL2VA/L2VA, keep the first/last frame alignment line exact and describe the transition rather than re-describing a frame as a static poster.",
        "Use integrated_multimodal_description for the visual and motion timeline; keep soundscape and music in their dedicated fields.",
        "T2VA has no image-alignment line. FL2VA bridges the opening and ending frames in one continuous path when possible; I2VA starts from the first frame; L2VA reserves the final beat for convergence on the last frame."
      ];
  return [
    "Community Auto Prompter compatibility contract (adapted for Local Video Studio):",
    `Target mode: ${mode}; effective duration: ${duration.toFixed(2)} seconds.`,
    referenceRule,
    ...modeRule,
    "Preserve the user's explicit constraints, named entities, dialogue, visible text, timing, and audio requirements. Do not invent a reference, speaker, logo, subtitle, music cue, or safety disclaimer.",
    "Separate visual identity from motion: describe who/what remains consistent, then describe action, camera, timing, and settling. Avoid repeated visual inventories across beats.",
    "Assign speaker IDs (S1), (S2), and so on in first-vocal-event order; keep the same ID across shots. Put only the language tag and exact user-provided words inside <d>[Language] ...</d>; keep voice identity and delivery outside the tag. Use <scenetrans> when a line continues across a cut and <cutoff> when speech ends with the video.",
    "Keep dialogue, singing, and shot-synchronized diegetic sounds in the main timeline. overall_soundscape summarizes full-video ambience and physical sounds; non_diegetic_music describes only audience-heard score. A directly reused audio signal uses copy markers; a timbre, rhythm, or style cue uses reference markers.",
    "If a video or audio reference cannot be inspected by the active local vision backend, use only the user's declared description and role. Never pretend that an unheard audio track or unobserved video detail was analyzed.",
    "When music is not requested, use N/A for non_diegetic_music; when silence is explicit, use N/A for both audio fields. Do not replace a hard no-music constraint with 'subtle' or 'minimal' music.",
    "Output only the requested H3 fields in the official order. Do not output analysis, markdown fences, labels such as 'here is', or an explanation outside the fields."
  ].join("\n");
}
