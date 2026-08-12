import type { PromptSnippetDefinition } from "../types.js";

export const h3SnippetDefinitions: readonly PromptSnippetDefinition[] = [
  { id: "continuity-reference-lock", groupId: "continuity", text: "Preserve the subject identity, appearance, clothing, body proportions, position, lighting, background, and important composition anchors from <Picture 1>." },
  { id: "continuity-body-gaze-lock", groupId: "continuity", text: "The subject's feet, hips, shoulders, head, and gaze remain oriented in the same direction unless the action explicitly changes them." },
  { id: "motion-causal-onset", groupId: "motion-reaction", text: "The subject takes one natural breath and makes a small preparatory movement before the main action begins; the visible physical response develops continuously." },
  { id: "motion-vocal-anatomy", groupId: "motion-reaction", text: "The lips, jaw, cheeks, throat, breathing, and chest respond naturally and visibly to the spoken performance." },
  { id: "camera-push-in", groupId: "camera-motion", text: "The camera pushes in with small amplitude at slow speed toward the subject." },
  { id: "camera-pull-out-reveal", groupId: "camera-motion", text: "The camera pulls out directly backward along the same optical axis with large amplitude at slow speed, progressively revealing the environment through realistic parallax." },
  { id: "camera-pedestal-up", groupId: "camera-motion", text: "The camera pedestals upward with small amplitude at slow speed while the primary camera movement continues smoothly." },
  { id: "camera-restrictions", groupId: "camera-motion", text: "The camera does not orbit, move sideways, change direction, or use a digital zoom; the viewpoint changes only through the specified physical camera path." },
  { id: "camera-pan-right", groupId: "camera-motion", text: "The camera pans right with small amplitude at slow speed, revealing the space beyond the subject." },
  { id: "camera-tracking", groupId: "camera-motion", text: "The camera uses a smooth tracking shot and follows the subject at a steady pace." },
  { id: "camera-static", groupId: "camera-motion", text: "The camera holds a static shot while the subject performs the action." },
  { id: "shot-close-up", groupId: "framing", text: "The shot cuts to a close-up that keeps the subject's face and key expression clearly visible." },
  { id: "shot-wide", groupId: "framing", text: "The shot opens to a wide view that establishes the surrounding environment and spatial relationship." },
  { id: "shot-framing-progression", groupId: "framing", text: "The framing progresses continuously through a close-up, chest-up view, full-body view, and wide environmental composition; each change comes from physical camera movement rather than artificial subject shrinking." },
  { id: "motion-turn", groupId: "subject-motion", text: "The subject turns slowly toward the camera, moves naturally, and holds the final pose." },
  { id: "motion-breeze", groupId: "subject-motion", text: "A light breeze moves the subject's hair and clothing with subtle, physically consistent motion." },
  { id: "sound-ambience", groupId: "sound", text: "overall_soundscape: Natural ambient sound, subtle movement sounds, and quiet room tone appropriate to the scene." },
  { id: "sound-synchronized-action", groupId: "sound", text: "Synchronize each diegetic sound with the visible action and environmental response that produces it." },
  { id: "sound-spatial-echo", groupId: "sound", text: "The direct sound becomes quieter as the camera moves away; delayed reflections arrive from the left and then the right, becoming progressively quieter, darker, and more diffuse." },
  { id: "sound-no-music", groupId: "sound", text: "non_diegetic_music: N/A" },
  { id: "dialogue-mandarin", groupId: "dialogue", text: "The speaker (S1) speaks Mandarin Chinese with a clear, natural voice and says exactly: <d>[Chinese] Write the exact original dialogue here.</d>" },
  { id: "dialogue-english", groupId: "dialogue", text: "The speaker (S1) uses a clear, natural English voice and says exactly: <d>[English] Write the exact spoken words here.</d>" },
  { id: "screen-text", groupId: "screen-text", text: "Any visible sign, subtitle, label, or neon text reads exactly \"Write the original text here\"; preserve its original punctuation without translation." }
];
