import type { H3PromptPreset } from "../../../types.js";

/**
 * Core H3 expansion presets shown in Create & Settings dropdowns.
 * Other preset IDs remain in `defaultH3PromptPresets` for full backwards compatibility
 * with saved drafts/settings, as their specialized rules are now handled automatically by
 * mode routing and modular Craft Skills.
 */
export const h3CorePromptPresetOrder: readonly H3PromptPreset[] = [
  "detailed-cinematic",
  "official-storyboard",
  "continuous-motion",
  "beat-storyboard",
  "annotation-revision",
  "multi-reference"
];

/**
 * Single source of truth for H3 style presets (shown verbatim in Settings and sent verbatim to
 * Strata, Continuum, and legacy prompt backends—zero hidden overrides).
 */
export const defaultH3PromptPresets: Record<H3PromptPreset, string> = {
  "detailed-cinematic": [
    "Expand every user-specified subject, action, order, camera path, timing, and sound into rich, grounded physical execution: preparation, weight transfer, gaze and micro-expression cues, solid surface contact, affected reactions, motivated camera response, and causally synced audio.",
    "Use attached references as identity and staging anchors, spending prose on observable change rather than static inventory or filler."
  ].join("\n"),
  "official-storyboard": [
    "Write a crisp, faithful H3 production timeline with clear framing, concrete observable action, motivated camera motion, and causally synchronized sound.",
    "Stay close to the author's brief without unnecessary embellishment; let the video model render naturally from clean staging."
  ].join("\n"),
  "continuous-motion": [
    "Stage the entire clip as ONE continuous unbroken take with no cuts or scene resets.",
    "Connect preparation, primary action, physical reaction, and settled ending through smooth continuous camera momentum and grounded body mechanics."
  ].join("\n"),
  "beat-storyboard": [
    "Structure the clip as crisp chronological beats with clear visual ownership, purposeful pacing, and clean sound landings.",
    "Use a timed `[Shot 2]` cut only when a new framing delivers essential story or spatial information; preserve identity, lighting, and screen direction across cuts."
  ].join("\n"),
  "annotation-revision": [
    "Treat the current prompt as an approved draft and apply every labeled editorial annotation to its immediately preceding passage only.",
    "Keep all unmarked passages unchanged and return no annotation markers or note text."
  ].join("\n"),
  "multi-reference": [
    "Assign every supplied reference one explicit, stable role across subject_definitions, summary, retention_analysis, and detailed_description using only the supplied labels.",
    "State clearly what identity, framing, motion, or audio attribute each reference contributes and keep those bindings consistent throughout the timeline."
  ].join("\n"),
  // Legacy presets kept for backwards compatibility with older saved drafts/settings
  "reference-faithful": "Prioritize recognizable subject identity, wardrobe, spatial layout, and visual anchors from the attached reference(s), focusing prose conservatively on what changes over time.",
  "dialogue-sound": "Treat spoken lines, lip and jaw articulation, breaths, and causally synchronized diegetic sound as first-class timeline beats while keeping quoted dialogue verbatim.",
  "product-brand": "Keep product silhouette, finish, colors, controls, and verified in-frame text exact; stage concrete physical handling or mechanism instead of generic marketing adjectives.",
  "music-video": "Align visible performance, movement, and camera rhythm to the musical phrasing and beats while keeping lyrics verbatim.",
  "narrative-animation": "Build a readable causal mini-story with clear silhouettes, anticipation, follow-through, and consistent stylized art direction across every beat."
};

const legacyDefaultOpenings: Partial<Record<H3PromptPreset, string>> = {
  "official-storyboard": "Create a focused production prompt, not a caption, but do not rewrite the reference image pixel by pixel.",
  "detailed-cinematic": "Create the most fully developed, production-ready H3 prompt among the available presets.",
  "reference-faithful": "Create a complete H3 prompt with concrete visual, action, camera, audio, dialogue, and continuity details; do not return a short caption.",
  "continuous-motion": "Create a complete H3 prompt with enough concrete detail for the video model to execute the action; do not compress the result into a short sentence.",
  "dialogue-sound": "Treat H3's native audio as a co-equal production track, not as a post-processing note.",
  "beat-storyboard": "Plan the requested duration as a compact, executable beat timeline instead of a loose montage.",
  "product-brand": "For a product, interface, or brand-led request, treat supplied product images, UI, logos, colors, materials, and verified copy as authoritative identity anchors.",
  "music-video": "Treat the supplied song, beat, lyrics, or audio reference as the master temporal structure.",
  "narrative-animation": "For a story or stylized-animation request, build a causal mini-story rather than a sequence of disconnected pretty shots.",
  "annotation-revision": "Treat the current prompt as an approved draft. Apply every labeled editorial annotation to its immediately preceding passage and revise only those marked passages.",
  "multi-reference": "Create a complete H3 R2V-style prompt, not a short caption. Understand the user's intended result and map every supplied reference to a precise job in the final video."
};

const legacyDefaultEndings: Partial<Record<H3PromptPreset, string>> = {
  "official-storyboard": "instead of rendering the metaphor as an animal or device.",
  "detailed-cinematic": "Return only the final H3 prompt.",
  "reference-faithful": "and reserve the final beat for the ending state.",
  "continuous-motion": "and do not end the action before the requested clip ends.",
  "dialogue-sound": "only when the user explicitly requests its absence.",
  "beat-storyboard": "and must remain faithful to every explicit user requirement.",
  "product-brand": "fake HUD, or unverified sales claim.",
  "music-video": "and do not repeat locked lyrics in the other sound fields.",
  "narrative-animation": "or invented plot that competes with the user's idea.",
  "annotation-revision": "fail instead of rewriting the rest of the draft.",
  "multi-reference": "when every sentence adds grounded information."
};

/**
 * Detect untouched pre-modular legacy 26B default presets persisted in older state.json files
 * so they can upgrade cleanly to the lean unified defaults without touching user-edited text.
 */
export function isLegacyDefaultH3PromptPreset(preset: H3PromptPreset, value: string): boolean {
  const normalized = value.replace(/\r\n?/gu, "\n").trim();
  const start = legacyDefaultOpenings[preset];
  const end = legacyDefaultEndings[preset];
  if (!start || !end) return false;
  return normalized.startsWith(start) && normalized.endsWith(end);
}

export function createDefaultH3PromptPresets(): Record<H3PromptPreset, string> {
  return { ...defaultH3PromptPresets };
}
