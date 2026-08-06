import type { H3PromptPreset } from "../types.js";

export const defaultH3PromptPresets: Record<H3PromptPreset, string> = {
  "official-storyboard": [
    "Create a complete production prompt, not a short caption or summary. When reference media is supplied, infer the visible subject, environment, materials, lighting, composition, and visual style from it; for T2VA, build those details coherently from the user's intent.",
    "Respect the selected H3 mode exactly: T2VA starts directly with the three core fields; I2VA develops forward from the first frame; FL2VA connects the first and last frames; L2VA converges on the final frame; R2V uses the six full-reference sections.",
    "Use the official H3 structured prompt format shown in the scaffold below and keep its section order. Inside integrated_multimodal_description or detailed_description, write a practical storyboard with 2-4 concrete shots only when the mode, duration, and request support cuts.",
    "Cover the full generation plan: opening state, subject identity and continuity, cause of motion, body mechanics, object and environment response, shot progression, camera path, final state, ambient sound, sound effects, music, exact dialogue, and visible text. Aim for roughly 250-450 English words for a 5-second prompt, scaling with duration.",
    "Make the result feel like a production-ready director's shot sheet rather than generic adjectives such as cinematic, dynamic, or realistic."
  ].join("\n"),
  "reference-faithful": [
    "Create a complete H3 prompt with concrete visual, action, camera, audio, dialogue, and continuity details; do not return a short caption.",
    "Use the same official H3 section names and order as the scaffold. Prioritize reference fidelity over invention: inspect the subject, clothing, pose, geometry, lighting, environment, and composition, then add only details visible in the reference or explicitly requested by the user.",
    "Adapt the reference path to the selected mode: first-frame anchor for I2VA, continuous interpolation for FL2VA, final-frame convergence for L2VA, and Subject/Picture/Video/Audio role definitions for R2V.",
    "Use one or two shots unless the selected mode or user explicitly requires more. Keep camera movement and action physically conservative, preserve identity and scene anchors, and describe what changes over time instead of listing static features. Aim for roughly 220-380 English words for a 5-second T2VA/I2VA/FL2VA/L2VA prompt."
  ].join("\n"),
  "continuous-motion": [
    "Create a complete H3 prompt with enough concrete detail for the video model to execute the action; do not compress the result into a short sentence.",
    "Use the official H3 section names and order, but write one continuous shot with no cuts or scene changes. Cover the complete causal chain: initial state, preparation, action, body and environment response, camera path, final settled state, synchronized sound, dialogue, and visible text when requested.",
    "Keep every movement physically connected and chronological. Replace vague adjectives with observable actions, contact, weight shift, gaze, momentum, framing, and audio cues. Aim for roughly 220-380 English words for a 5-second prompt."
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
