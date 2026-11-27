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
  annotationRevisionMissing: "Annotation revision needs at least one note, for example (Note: replace this passage with ...).",
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
  wordCountGuidance: "{count} words · reference range {min}–{max} words",
  imageWordCount: "{count} words",
  promptCheckTitle: "H3 prompt check"
};

export const presetLocale: Record<H3PromptPreset, PromptPresetLocale> = {
  "official-storyboard": { label: "General cinematic timeline", description: "Organize a complete audiovisual timeline using the official H3 fields." },
  "detailed-cinematic": { label: "Detailed cinematic expansion", description: "Expand the original intent with grounded action, camera, visual, material, lighting, sound, and timeline detail." },
  "reference-faithful": { label: "Reference faithful", description: "Minimize unsupported invention and protect identity, composition, and continuity." },
  "continuous-motion": { label: "Continuous single shot", description: "Write one causal continuous shot with physical motion and a settled ending." },
  "dialogue-sound": { label: "Dialogue and native sound", description: "Prioritize dialogue, performance, ambience, action sounds, and native music timing." },
  "beat-storyboard": { label: "Beat storyboard", description: "Break the duration into clear beats, shot timing, camera movement, and sound events." },
  "product-brand": { label: "Product and brand demo", description: "Protect product identity and verified copy while emphasizing functional actions and a clear close." },
  "music-video": { label: "Music video and lyrics", description: "Design song, lyrics, performance, beat, and spatial typography as one timeline." },
  "narrative-animation": { label: "Stylized narrative animation", description: "Keep character identity, causal story, performance rhythm, and shot continuity stable." },
  "annotation-revision": { label: "Annotation revision", description: "Treat the current Prompt as approved and revise only passages followed by a labeled note; keep everything else unchanged." },
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
  "visual-photorealistic-quality": { group: "Visual craft & optics", label: "Natural live-action texture (anti-plastic)" },
  "capture-35mm-natural": { group: "Visual craft & optics", label: "35mm natural practical light" },
  "capture-smartphone-1x": { group: "Visual craft & optics", label: "Smartphone 1x candid realism" },
  "capture-documentary-handheld": { group: "Visual craft & optics", label: "Handheld documentary light" },
  "camera-continuous-take": { group: "Camera motion", label: "One continuous take · no cuts" },
  "camera-static": { group: "Camera motion", label: "Locked-off static shot" },
  "camera-push-in": { group: "Camera motion", label: "Slow dolly push-in" },
  "camera-pull-out-reveal": { group: "Camera motion", label: "Pull-out environment reveal" },
  "camera-tracking": { group: "Camera motion", label: "Smooth tracking shot" },
  "camera-orbit": { group: "Camera motion", label: "Smooth 180° orbit" },
  "camera-low-angle-macro": { group: "Camera motion", label: "Ultra-low wide-macro probe lens" },
  "shot-close-up": { group: "Cut & framing", label: "Cut to close-up [Shot 2]" },
  "sound-no-music": { group: "Sound & dialogue", label: "No background music (N/A)" },
  "sound-ambience": { group: "Sound & dialogue", label: "Natural room tone & ambience" },
  "dialogue-mandarin": { group: "Sound & dialogue", label: "Mandarin dialogue template" },
  "dialogue-english": { group: "Sound & dialogue", label: "English dialogue template" },
  "motion-breeze": { group: "Details & text", label: "Gentle breeze on hair & fabric" },
  "screen-text": { group: "Details & text", label: "Lock exact on-screen text" }
};
