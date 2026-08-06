import type { H3PromptPreset } from "../types.js";
import type { H3PromptMode } from "../types.js";

export function h3PromptPresetForMode(
  mode: H3PromptMode,
  requestedPreset: H3PromptPreset = "official-storyboard"
): H3PromptPreset {
  return mode === "R2V" || requestedPreset !== "multi-reference"
    ? requestedPreset
    : "official-storyboard";
}

export const defaultH3PromptPresets: Record<H3PromptPreset, string> = {
  "official-storyboard": [
    "Create a focused production prompt, not a caption, but do not rewrite the reference image pixel by pixel. Treat the user's explicit content as authoritative. Use one or two concise visual anchors for the subject and opening composition, then spend the detail budget on what changes.",
    "Respect the selected H3 mode exactly: T2VA starts directly with the three core fields; I2VA develops forward from the first frame; FL2VA connects the first and last frames; L2VA converges on the final frame; R2V uses the six full-reference sections.",
    "Use the official H3 structured prompt format and keep its section order. For a 5-second I2VA or FL2VA request, prefer one continuous shot unless the user asks for cuts; use multiple shots only when they add necessary new information.",
    "Cover the action chain: why movement starts, preparation, small body and gaze changes, weight and momentum, object/environment response, camera path, atmosphere, synchronized sound, dialogue, and the final state. Scale the detail to the actual duration plan; do not compress a long request into a 5-second event.",
    "Make the result feel alive through observable micro-actions and atmosphere, not through generic adjectives or a long list of static clothing and background details."
  ].join("\n"),
  "reference-faithful": [
    "Create a complete H3 prompt with concrete visual, action, camera, audio, dialogue, and continuity details; do not return a short caption.",
    "Use the same official H3 section names and order as the scaffold. Prioritize the user's explicit content first, then retain only identity, pose, composition anchors, and visual facts from the reference that matter to the requested movement or continuity.",
    "Adapt the reference path to the selected mode: first-frame anchor for I2VA, continuous interpolation for FL2VA, final-frame convergence for L2VA, and Subject/Picture/Video/Audio role definitions for R2V.",
    "Use one continuous shot by default for I2VA/FL2VA/L2VA. Keep camera movement and action physically conservative, but devote most of the prompt to what changes over time, micro-motion, atmosphere, and sound. Scale the number of sequential beats to the actual duration and reserve the final beat for the ending state."
  ].join("\n"),
  "continuous-motion": [
    "Create a complete H3 prompt with enough concrete detail for the video model to execute the action; do not compress the result into a short sentence.",
    "Use the official H3 section names and order, but write one continuous shot with no cuts or scene changes. Cover the complete causal chain: initial state, preparation, action, body and environment response, camera path, final settled state, synchronized sound, dialogue, and visible text when requested.",
    "Keep every movement physically connected and chronological. Preserve the user's explicit terms, then replace vague adjectives with observable actions, contact, weight shift, gaze, momentum, framing, atmosphere, and audio cues. Follow the dynamic duration plan and do not end the action before the requested clip ends."
  ].join("\n"),
  "multi-reference": [
    "Create a complete H3 R2V-style prompt, not a short caption. Understand the user's intended result and map every supplied reference to a precise job in the final video.",
    "Use the official R2V label semantics: <Subject N> identifies reusable people, objects, scenes, styles, actions, or poses; <Picture N> is reserved for a concrete frame or composition anchor; <Video N> identifies a source video's editing, continuation, camera, or temporal structure; <Audio N> identifies copied or referenced sound.",
    "Use the exact labels supplied in the reference map and keep their meaning stable across every section. Explain which identity, scene, style, pose, motion, camera, or sound attribute each reference contributes and what must remain consistent.",
    "Use the official R2V section order from the scaffold: subject_definitions, summary, retention_analysis, detailed_description, overall_soundscape, non_diegetic_music. Start summary with the actual task type, use fixed retention relations such as fully_preserved, attribute_transfer, weak_reference, fully_copy, or reference, and write a chronological detailed_description with approximately 350-500 English words for a 5-second generation prompt."
  ].join("\n")
};

export function createDefaultH3PromptPresets(): Record<H3PromptPreset, string> {
  return { ...defaultH3PromptPresets };
}
