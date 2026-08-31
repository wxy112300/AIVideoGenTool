import type { H3PromptPreset } from "../../../types.js";

export const defaultH3PromptPresets: Record<H3PromptPreset, string> = {
  "official-storyboard": [
    "Create a focused production prompt, not a caption, but do not rewrite the reference image pixel by pixel. Treat the user's explicit content as authoritative. Use only the reference anchors that help establish identity and composition, then spend most of the prompt on what changes and what the video model must execute.",
    "Respect the selected H3 mode exactly: T2VA starts directly with the three core fields; I2VA develops forward from the first frame; FL2VA connects the first and last frames; L2VA converges on the final frame; R2V uses the six full-reference sections.",
    "Use the official H3 structured prompt format and keep its section order. For a 5-second I2VA or FL2VA request, prefer one continuous shot unless the user asks for cuts; use multiple shots only when they add necessary new information.",
    "Cover the action chain: why movement starts, preparation, small body and gaze changes, weight and momentum, object/environment response, camera path, atmosphere, synchronized sound, dialogue, and the final state. Scale the detail to the actual duration plan; do not compress a long request into a 5-second event.",
    "Make the result feel alive through observable micro-actions and atmosphere, not through generic adjectives or a long list of static clothing and background details.",
    "Translate metaphorical scale or viewpoint phrases into executable camera behavior: use reference-derived relative scale, preserve a real human's proportions, and keep any route continuous instead of rendering the metaphor as an animal or device."
  ].join("\n"),
  "detailed-cinematic": [
    "Create a high-detail, production-ready H3 prompt from the user's original idea and supplied reference media, optimizing for actionable information density rather than maximum length. First understand and preserve the intended subjects, relationships, setting, action, style, dialogue, visible text, timing, and restrictions; do not replace the idea with a different story.",
    "Use the reference as an anchor, not a transcript. State identity, opening pose, composition, and other action-critical facts once. For I2VA, develop forward from the first frame; for FL2VA, describe the causal path between the two exact endpoints without restating either image; for L2VA, describe the minimum compatible path that converges on the final frame; for R2V, define each supplied Picture, Video, Audio, and Subject role once and keep the labels exact.",
    "Write the timeline in causal playback order: opening state → reason or trigger → preparation → primary action → physical mechanics or contact → reaction from affected subjects or objects → motivated camera response → consequential secondary motion → final state. When one character affects another, describe the other's observable perception and response when supported by the request; do not invent a new plot event. Prefer one continuous shot unless the user or reference structure requires a cut.",
    "Add only the smallest scene-grounded details needed to make the requested result executable: gaze and expression, body mechanics, hand-object contact, cloth or hair movement, inertia, focus or exposure changes, motivated lighting changes, or synchronized sound. Do not add decorative sunlight, generic atmosphere, extra background activity, material inventories, or repeated reference-image prose unless it changes the requested action, camera readability, continuity, or sound. Do not invent characters, locations, important props, plot events, visible text, dialogue, music, or major appearance changes, and never override an explicit constraint.",
    "Use flexible timing: do not create equal-duration phases or add a phase merely to fill a slot. Let anticipation, travel, contact, reaction, acceleration, deceleration, and settling occupy the time they need. Use a timestamp or [Shot N] only for a genuine cut, state transition, camera/keyframe alignment, or other meaningful temporal anchor; a continuous camera adjustment is not a new shot. Keep a user-locked viewpoint, angle, or tracking path stable unless a change is explicitly requested.",
    "Use one primary camera behavior per meaningful action phase, with a clear subject target, direction, amplitude, and speed. Treat camera terms as viewpoint instructions, not as an object in the scene, unless the user explicitly describes a physical camera device. Treat sound and atmosphere as causal or explicitly requested, not as filler.",
    "When the brief uses ant-size, ant's view, insect-eye, or Micro-FPV as shorthand, infer the tiny subject's scale from the supplied reference and nearby geometry rather than a fixed measurement. Keep the invisible camera close to the same support surface and approximately at the tiny subject's height; if the brief gives an orbit angle such as 180 degrees, preserve that exact sweep and stop at its endpoint.",
    "Treat the original prompt as a change brief: preserve its facts once, separate PRESERVE, CHANGE, and INFER information, and spend extra detail on the requested change, causal interactions, camera route, observable reactions, sound, continuity, and the final state instead of repeating the reference image.",
    "Use the official H3 fields and exact field order for the selected mode. Keep explanatory prose in English when required by the H3 contract, but preserve dialogue, lyrics, voiceover words, and visible text exactly in the user's original language. There is no fixed 350-500 or 500-word target for this preset: expand only while each sentence controls a visible, audible, temporal, or continuity-relevant result, and delete repeated or decorative detail before shortening a necessary action or reaction. Return only the final H3 prompt."
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
  "dialogue-sound": [
    "Treat H3's native audio as a co-equal production track, not as a post-processing note. Make every important sound happen at the visible cause and at the correct point in the timeline.",
    "Use stable speaker IDs such as (S1) and (S2). Preserve user-provided dialogue, lyrics, and visible text exactly in their original language; never invent speech, singing, narration, or a speaker that the user did not request.",
    "Put dialogue, singing, diegetic music, and synchronized sound in integrated_multimodal_description. Keep full-video ambience and physical sounds in overall_soundscape, and audience-only score in non_diegetic_music without repeating the same event.",
    "Describe voice quality, delivery, breath, lip movement, and audio continuity only when they help the requested performance. Use N/A for a sound category only when the user explicitly requests its absence."
  ].join("\n"),
  "beat-storyboard": [
    "Plan the requested duration as a compact, executable beat timeline instead of a loose montage. For every necessary beat, establish its time range or cut time, composition, one primary action, camera behavior, transition, sound or dialogue, and ending state.",
    "Use as few shots as the duration needs: prefer one continuous shot for a short action, and add a cut only when it introduces new information about the subject, space, state, viewpoint, or time. Later shot times must increase strictly and remain inside the clip.",
    "Shape rhythm with setup, preparation, commitment, impact, brake, and settle. Keep one visual owner per beat, make transitions arise from action or camera direction, and preserve identity, spatial direction, props, lighting, and audio across cuts.",
    "Return the normal H3 output fields, not a planning table or explanation. The beat plan belongs inside the required timeline field and must remain faithful to every explicit user requirement."
  ].join("\n"),
  "product-brand": [
    "For a product, interface, or brand-led request, treat supplied product images, UI, logos, colors, materials, and verified copy as authoritative identity anchors. Do not recolor, redesign, approximate, or invent a logo, feature, metric, claim, or interface detail.",
    "Build a product-specific cause-and-effect path: hero reveal, interaction or mechanism, material or functional detail, visible result, and a stable closing when the duration supports it. Give each beat one primary action and keep the product silhouette readable.",
    "Preserve the real product body color, finish, proportions, controls, and distinctive geometry. Use concrete movements such as opening, rotating, sliding, folding, snapping, lighting, or pressing instead of generic premium adjectives or decorative technology effects.",
    "When in-frame copy is requested, keep each line exact, concise, single-line, and integrated into the composition; never turn it into a subtitle bar, text wall, grid, fake HUD, or unverified sales claim."
  ].join("\n"),
  "music-video": [
    "Treat the supplied song, beat, lyrics, or audio reference as the master temporal structure. Lock the requested lyrics and spoken words exactly; never invent, paraphrase, translate, or replace them unless the user asks.",
    "Map visual beats, camera changes, performance gestures, typography, and transitions to meaningful musical events such as lyric phrases, breaths, downbeats, snares, drops, or sustained holds. Keep one coherent visual and audio language across the clip.",
    "Separate character, scene, and typography roles when references are supplied. On-screen lyrics are a designed spatial layer, not an automatic subtitle bar; keep words readable, away from eyes and mouths during important performance, and synchronized with the vocal event.",
    "For a short single clip, use only the necessary shots and preserve continuous audio across them. Put vocals and diegetic music in the timeline, audience-only score in non_diegetic_music, and do not repeat locked lyrics in the other sound fields."
  ].join("\n"),
  "narrative-animation": [
    "For a story or stylized-animation request, build a causal mini-story rather than a sequence of disconnected pretty shots. Preserve the user's premise, character goals, emotional turn, and requested ending.",
    "Establish reusable character identity, scene landmarks, props, and visual style before the action. Each beat must change a visible state through intention, anticipation, action, reaction, and a settled result; keep continuity across every shot.",
    "Describe readable silhouettes, facial performance, gaze, body mechanics, secondary motion, and camera timing. Use animation-specific motion such as squash and stretch, stepped stop-motion movement, layered parallax, or tactile props only when the requested style calls for it.",
    "Make the prompt executable at the supplied duration: use clear shot timing, purposeful transitions, synchronized sound, and no storyboard labels, panel layouts, or invented plot that competes with the user's idea."
  ].join("\n"),
  "multi-reference": [
    "Create a complete H3 R2V-style prompt, not a short caption. Understand the user's intended result and map every supplied reference to a precise job in the final video.",
    "Use the official R2V label semantics: <Subject N> identifies reusable people, objects, scenes, styles, actions, or poses; <Picture N> is reserved for a concrete frame or composition anchor; <Video N> identifies a source video's editing, continuation, camera, or temporal structure; <Audio N> identifies copied or referenced sound.",
    "Choose task types from the actual reference role: keyframe completion, reference generation, video editing, video continuation, audio reuse, or audio reference. Do not classify an asset merely because a video or audio file is present, and do not invent labels that are not supplied.",
    "Use the exact labels supplied in the reference map and keep their meaning stable across every section. Explain which identity, scene, style, pose, motion, camera, keyframe, source-video, or sound attribute each reference contributes and what must remain consistent. If a reference video soundtrack is supplied, keep its Audio and Video roles paired in meaning.",
    "Use the official R2V section order from the scaffold: subject_definitions, summary, retention_analysis, detailed_description, overall_soundscape, non_diegetic_music. Start summary with the actual task type, use fixed retention relations such as fully_preserved, attribute_transfer, weak_reference, fully_copy, or reference, and write a chronological detailed_description with roughly 350-500 English words as a starting range for a simple 5-second generation prompt. Expand for dialogue, multiple shots, complex references, or longer duration when every sentence adds grounded information."
  ].join("\n")
};

export function createDefaultH3PromptPresets(): Record<H3PromptPreset, string> {
  return { ...defaultH3PromptPresets };
}
