import type { H3PromptPreset, H3ReferenceRole } from "../../../types.js";
import type { PromptPresetLocale, PromptSnippetLocale, PromptUiLocale } from "../types.js";

export const uiLocale: PromptUiLocale = {
  newVersion: "New prompt",
  previousVersion: "Previous prompt version",
  nextVersion: "Next prompt version",
  enhanceMode: "Enhancement mode",
  sulphurNativeEnhance: "Sulphur native enhancement (recommended)",
  faithfulEnhance: "Faithful rewrite (requires Instruct model)",
  optimizing: "Optimizing…",
  optimizePrompt: "Optimize prompt",
  autoPrompt: "Enhance prompt",
  autoPromptHint: "The prompt is blank; create a varied motion and camera concept from the reference media.",
  autoPromptMissingMedia: "Reference-driven auto drafting needs at least one reference image or video.",
  snippetPicker: "Quick insert",
  snippetPlaceholder: "Choose a visual quality, camera, action, sound, or dialogue preset",
  insertSnippet: "Insert",
  extensionR2vTitle: "H3 R2V Motion Context (recommended)",
  extensionBoundaryTitle: "H3 end-frame continuation (compatible)",
  extensionR2vLatentDescription: "Carries the last 22 motion frames and 32 kHz audio from the previous segment; head context is trimmed automatically. The previous latent was found, so lossy re-encoding will be skipped. Spectrum is forced off.",
  extensionR2vFallbackDescription: "Carries the last 22 motion frames and 32 kHz audio from the previous segment; head context is trimmed automatically. Pixel/audio fallback is active and a latent will be saved for the next continuation. Spectrum is forced off.",
  extensionBoundaryDescription: "Generates a new segment from the final frame of the retained clip and keeps H3 native audio; no extra node is required, but boundary motion may change.",
  manualEditVersion: "Manual edit",
  expandedVersion: "Expanded {count}",
  wordCount: "{count} words",
  wordCountOverLimit: "{count} words · above the suggested {limit}-word limit; you can continue typing",
  wordCountSuggestion: "{count} words · suggested limit: {limit}",
  imageWordCount: "{count} words",
  promptCheckTitle: "H3 prompt check"
};

export const presetLocale: Record<H3PromptPreset, PromptPresetLocale> = {
  "official-storyboard": { label: "General cinematic timeline", description: "Organize a complete audiovisual timeline using the official H3 fields." },
  "reference-faithful": { label: "Reference faithful", description: "Minimize unsupported invention and protect identity, composition, and continuity." },
  "continuous-motion": { label: "Continuous single shot", description: "Write one causal continuous shot with physical motion and a settled ending." },
  "dialogue-sound": { label: "Dialogue and native sound", description: "Prioritize dialogue, performance, ambience, action sounds, and native music timing." },
  "beat-storyboard": { label: "Beat storyboard", description: "Break the duration into clear beats, shot timing, camera movement, and sound events." },
  "product-brand": { label: "Product and brand demo", description: "Protect product identity and verified copy while emphasizing functional actions and a clear close." },
  "music-video": { label: "Music video and lyrics", description: "Design song, lyrics, performance, beat, and spatial typography as one timeline." },
  "narrative-animation": { label: "Stylized narrative animation", description: "Keep character identity, causal story, performance rhythm, and shot continuity stable." },
  "multi-reference": { label: "Multi-reference orchestration", description: "Assign stable roles to R2V images, video, and audio references." }
};

export const referenceRoleLocale: Record<H3ReferenceRole, string> = {
  subject: "Subject",
  scene: "Scene / environment",
  style: "Style / clothing",
  motion: "Motion / pose",
  camera: "Camera / composition",
  voice: "Voice association",
  keyframe: "Keyframe",
  other: "Other reference"
};

export const snippetLocale: Record<string, PromptSnippetLocale> = {
  "continuity-reference-lock": { group: "Reference and continuity", label: "Lock reference identity and composition" },
  "continuity-body-gaze-lock": { group: "Reference and continuity", label: "Lock body and gaze direction" },
  "visual-live-action-human": { group: "Visual realism and materials", label: "Believable live-action human" },
  "visual-anti-cg-plastic": { group: "Visual realism and materials", label: "Avoid CG, toy, and plastic look" },
  "visual-natural-materials": { group: "Visual realism and materials", label: "Natural skin and material detail" },
  "visual-natural-light": { group: "Visual realism and materials", label: "Natural light and exposure" },
  "capture-smartphone-1x": { group: "Capture and camera feel", label: "Older smartphone 1x realism" },
  "capture-documentary-handheld": { group: "Capture and camera feel", label: "Documentary handheld feel" },
  "motion-causal-onset": { group: "Motion and reaction", label: "Natural action onset" },
  "motion-vocal-anatomy": { group: "Motion and reaction", label: "Physical response to dialogue" },
  "camera-push-in": { group: "Camera motion", label: "Slow push-in" },
  "camera-pull-out-reveal": { group: "Camera motion", label: "Pull out and reveal the environment" },
  "camera-pedestal-up": { group: "Camera motion", label: "Pedestal with the camera" },
  "camera-restrictions": { group: "Camera motion", label: "Prevent accidental orbiting" },
  "camera-pan-right": { group: "Camera motion", label: "Pan right" },
  "camera-tracking": { group: "Camera motion", label: "Tracking shot" },
  "camera-static": { group: "Camera motion", label: "Static camera" },
  "shot-close-up": { group: "Framing", label: "Cut to close-up" },
  "shot-wide": { group: "Framing", label: "Open to a wide view" },
  "shot-framing-progression": { group: "Framing", label: "Continuous framing progression" },
  "motion-turn": { group: "Subject motion", label: "Turn toward camera" },
  "motion-breeze": { group: "Subject motion", label: "Subtle breeze detail" },
  "sound-ambience": { group: "Sound", label: "Ambient sound" },
  "sound-synchronized-action": { group: "Sound", label: "Synchronize sound and action" },
  "sound-spatial-echo": { group: "Sound", label: "Spatial echo decay" },
  "sound-no-music": { group: "Sound", label: "No background music" },
  "dialogue-mandarin": { group: "Dialogue", label: "Mandarin dialogue" },
  "dialogue-english": { group: "Dialogue", label: "English dialogue and ID" },
  "screen-text": { group: "On-screen text", label: "Lock on-screen text" }
};
