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
 * Written as Layer-1 teacher guidance for local reasoning VLMs (e.g. Qwen3.8-Flash-Next)
 * targeting Layer-2 MiniMax H3 audiovisual prose (positive-only, no bracket camera tags).
 */
export const defaultH3PromptPresets: Record<H3PromptPreset, string> = {
  "detailed-cinematic": [
    "Expand every user-specified subject, action, order, camera path, timing, and sound into rich, full-bodied cinematic execution.",
    "Devote roughly 70% of the timeline to concrete body mechanics and reactions (anticipation, weight transfer, footwork, grip, gaze, micro-expressions, skin/cloth/surface response) and 30% to smooth motivated camera travel and causally synced sound.",
    "Treat attached reference images as Frame-0 identity and staging anchors: identify each distinct subject briefly, then put >=80% of the prose into active motion and observable change rather than recapping static outfits or room decor."
  ].join("\n"),
  "official-storyboard": [
    "Write a crisp, faithful H3 production timeline with a clear opening shot size, chronological beat progression, concrete physical action (not stiff summaries like 'turns and smiles'), ONE clean motivated camera trajectory, and causally synchronized diegetic sound.",
    "Stay close to the author's brief without extra subplot or empty quality buzzwords; keep ambient/foley cleanly in overall_soundscape and audience score (or N/A) in non_diegetic_music."
  ].join("\n"),
  "continuous-motion": [
    "Stage the entire clip as ONE continuous unbroken take inside [Shot 1] from start to finish with zero cuts or scene resets.",
    "Connect preparation, primary action, physical reaction, and settled ending through continuous physical camera momentum and persistent spatial landmarks so lighting, identity, and geometry stay locked across the full duration."
  ].join("\n"),
  "beat-storyboard": [
    "Structure the clip as 2–3 crisp chronological story beats with clear visual ownership, purposeful pacing, and clean sound landings.",
    "Use a timed [Shot 2] cut only when a new framing or perspective delivers essential story information; preserve character identity, eye-lines, screen direction, lighting, and continuous audio across every cut."
  ].join("\n"),
  "annotation-revision": [
    "Treat the current prompt as an approved draft and apply every labeled editorial annotation strictly to its immediately preceding passage.",
    "Keep all unmarked passages unchanged, absorb each note into natural positive H3 prose, and leave zero annotation markers or commentary behind."
  ].join("\n"),
  "multi-reference": [
    "Assign every supplied asset ONE explicit, stable job across subject_definitions, summary, retention_analysis, and detailed_description using only the supplied labels (<Subject N> for reusable identity/objects/styles, <Picture N> for frame anchors, <Video N> for source video structure, <Audio N> for referenced sound).",
    "State clearly what each reference contributes and keep separate people, objects, and audio roles strictly isolated throughout the timeline."
  ].join("\n"),
  // Legacy presets kept for backwards compatibility with older saved drafts/settings
  "reference-faithful": "Prioritize recognizable subject identity, wardrobe, spatial layout, and visual anchors from the attached reference(s), focusing prose conservatively on grounded movement and observable change.",
  "dialogue-sound": "Treat spoken lines, lip and jaw articulation, natural breaths, and causally synchronized diegetic sound as first-class timeline beats while keeping quoted dialogue verbatim in the main timeline.",
  "product-brand": "Keep product silhouette, finish, colors, controls, and verified in-frame text exact; stage concrete physical handling or mechanism in natural lighting instead of generic marketing adjectives.",
  "music-video": "Align visible performance, body rhythm, and smooth camera tempo to the musical phrasing and beats while keeping lyrics verbatim in the main timeline.",
  "narrative-animation": "Build a readable causal mini-story with clear silhouettes, anticipation, follow-through, and consistent stylized medium grammar across every beat."
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
