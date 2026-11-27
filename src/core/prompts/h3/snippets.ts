import type { PromptSnippetDefinition } from "../types.js";
import { h3PhotorealisticQualitySeed } from "./visual-quality.js";

/**
 * Curated, H3-executable Quick-Insert snippets (zero LLM meta-directives, zero buzzword bloat).
 * Every snippet works directly when generating with MiniMax H3 AND acts as a clean intent anchor for Strata.
 */
export const h3SnippetDefinitions: readonly PromptSnippetDefinition[] = [
  // Visual craft & camera capture (kills waxy/plastic AI commercial look via concrete optics & physical micro-texture)
  { id: "visual-photorealistic-quality", groupId: "visual-craft", text: h3PhotorealisticQualitySeed },
  { id: "visual-macro-closeup", groupId: "visual-craft", text: "Extreme close-up on a 100mm macro lens with shallow optical falloff, laser-sharp unretouched skin pores and fine peach fuzz catching soft side light, warm subsurface scattering, fine vertical lip lines with subtle moist sheen, intricate multi-toned iris fibers with a wet waterline and scene-matched corneal catchlights, and gradual specular roll-off." },
  { id: "capture-35mm-natural", groupId: "visual-craft", text: "Shot on a 35mm lens in natural practical light with authentic lens depth, subtle organic grain, and realistic motion blur." },
  { id: "capture-85mm-portrait", groupId: "visual-craft", text: "Shot on an 85mm prime lens in soft directional window light with natural portrait compression, smooth highlight roll-off, subtle shadow-side bounce fill, and organic ungraded color." },
  { id: "capture-smartphone-1x", groupId: "visual-craft", text: "Shot on a 1x smartphone main camera with mild wide-angle perspective, ordinary exposure, slight handheld drift, and candid unpolished framing." },
  { id: "capture-documentary-handheld", groupId: "visual-craft", text: "Observational handheld documentary footage lit by existing practical light with responsive focus and natural ungraded color." },

  // Camera movement (one clean physical path per clip, single-take safe)
  { id: "camera-continuous-take", groupId: "camera-motion", text: "One continuous unbroken take from the first frame to the last, with no editorial cut; all reframing happens through smooth physical camera movement within [Shot 1]." },
  { id: "camera-static", groupId: "camera-motion", text: "Locked-off static camera holding steady framing while the subject performs the action." },
  { id: "camera-push-in", groupId: "camera-motion", text: "The camera pushes in slowly along a smooth physical dolly track toward the subject." },
  { id: "camera-pull-out-reveal", groupId: "camera-motion", text: "The camera pulls out slowly directly backward along the optical axis, progressively revealing the surrounding environment with realistic parallax." },
  { id: "camera-tracking", groupId: "camera-motion", text: "Smooth Steadicam tracking shot following the subject at a steady matching pace." },
  { id: "camera-orbit", groupId: "camera-motion", text: "Smooth continuous 180-degree horizontal orbit around the subject, settling cleanly on the opposite angle." },
  { id: "camera-low-angle-macro", groupId: "camera-motion", text: "Ultra-low-angle wide-macro probe lens skimming close to the surface, keeping the foreground subject sharp with deep readable environmental depth behind." },

  // Explicit authored cut (clearly marked [Shot 2] so it never causes accidental cuts in single-take mode)
  { id: "shot-close-up", groupId: "framing", text: "[Shot 2] At 00:02.500, the camera cuts to a close-up capturing the subject's face and subtle expression." },

  // Native H3 audio & verbatim dialogue syntax
  { id: "sound-no-music", groupId: "sound", text: "non_diegetic_music: N/A" },
  { id: "sound-ambience", groupId: "sound", text: "overall_soundscape: Natural room tone and quiet environmental ambience matched to the visible space." },
  { id: "dialogue-mandarin", groupId: "sound", text: "The speaker (S1) says: <d>[Chinese] Write the exact original dialogue here.</d>" },
  { id: "dialogue-english", groupId: "sound", text: "The speaker (S1) says: <d>[English] Write the exact spoken words here.</d>" },

  // Environmental micro-detail & exact visible text
  { id: "motion-breeze", groupId: "details", text: "A gentle breeze softly stirs loose hair strands and fabric folds in one consistent direction." },
  { id: "screen-text", groupId: "details", text: "Visible on-screen text reads exactly \"Write the original text here\" with its original spelling and punctuation." }
];
