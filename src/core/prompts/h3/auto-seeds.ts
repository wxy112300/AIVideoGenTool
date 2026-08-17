import type { H3PromptMode } from "../../../types.js";

export interface H3AutoPromptSeed {
  id: string;
  label: string;
  tags: readonly string[];
  instruction: string;
}

export const h3AutoPromptSeeds: readonly H3AutoPromptSeed[] = [
  {
    id: "visible-affordance",
    label: "Visible affordance",
    tags: ["object", "interaction", "physical"],
    instruction: "Choose the most visually meaningful subject or object that is actually present and animate a natural interaction with its visible affordance: opening, turning, touching, lifting, catching, unfolding, sliding, or responding. Keep the action physically executable and never add an unsupported object."
  },
  {
    id: "gaze-and-intent",
    label: "Gaze and intent",
    tags: ["performance", "micro-motion", "character"],
    instruction: "Build the motion around a readable change of attention: a subject notices something already visible, shifts gaze or posture, prepares, and responds with a small but expressive action. If no person is visible, apply the same idea to the dominant object or environmental feature without inventing a person."
  },
  {
    id: "camera-discovery",
    label: "Camera discovery",
    tags: ["camera", "reveal", "composition"],
    instruction: "Use a motivated camera move that discovers information already latent in the composition: a slow push, pull, pan, tilt, arc, or tracking move. Let the camera change reveal a relationship or detail in the image, then settle in a stronger final composition."
  },
  {
    id: "environmental-cascade",
    label: "Environmental cascade",
    tags: ["environment", "secondary-motion", "atmosphere"],
    instruction: "Start a small environmental change supported by the image, then let it create a chain of grounded secondary motion: fabric, hair, leaves, reflections, dust, steam, water, light, or shadows. Do not add weather or effects unless the image gives evidence for them."
  },
  {
    id: "cause-and-effect",
    label: "Cause and effect",
    tags: ["action", "reaction", "continuity"],
    instruction: "Design one clear causal action with preparation, commitment, contact or exertion, visible reaction, and a settled ending. Favor a complete mini-event over a vague loop, and preserve the subject's identity, geometry, and screen direction throughout."
  },
  {
    id: "playful-surprise",
    label: "Playful surprise",
    tags: ["playful", "surprise", "interaction"],
    instruction: "Create one unexpected but harmless beat that follows from what is visibly present: a curious glance, a small interruption, a near miss, a playful response, or a reveal caused by the subject's movement. Keep the surprise plausible, concise, and visually legible rather than turning it into an invented story."
  },
  {
    id: "documentary-moment",
    label: "Documentary moment",
    tags: ["natural", "observational", "single-shot"],
    instruction: "Treat the image as the opening of an observed real moment. Use restrained, imperfect micro-actions, natural body weight, breathing, eye movement, environmental response, and a quiet handheld or static camera. Make the scene feel caught in motion, not staged as a montage."
  },
  {
    id: "material-response",
    label: "Material response",
    tags: ["material", "close-up", "light"],
    instruction: "Choose a visible material or surface and make its response to motion the creative focus: fabric folds, liquid ripples, glass reflections, metal vibration, paper movement, skin and hair motion, or changing highlights. Keep the material and lighting direction faithful to the reference."
  },
  {
    id: "spatial-journey",
    label: "Spatial journey",
    tags: ["movement", "camera", "space"],
    instruction: "Give the visible subject a short journey through the existing spatial layout: approach, pass, turn, lean, rotate, or shift position while respecting depth, obstacles, scale, and the image's established geometry. Use camera movement to support the journey and end with a stable readable pose."
  },
  {
    id: "rhythmic-beats",
    label: "Rhythmic beats",
    tags: ["rhythm", "timing", "motion"],
    instruction: "Shape the full duration as a small rhythm of anticipation, action, reaction, and hold. Use repeated motion only when each repetition changes the subject, camera, or environment. The final beat must resolve naturally instead of stopping mid-action."
  },
  {
    id: "contrast-and-settle",
    label: "Contrast and settle",
    tags: ["contrast", "lighting", "ending"],
    instruction: "Create a restrained visual contrast over time, such as stillness to motion, shadow to light, closed to open, distant to near, or tension to release, using only changes that can grow out of the reference. Preserve the original scene while giving the ending a clear emotional and physical settle."
  },
  {
    id: "subject-pair",
    label: "Subject interplay",
    tags: ["relationship", "interaction", "multi-subject"],
    instruction: "If two or more visible subjects are present, design a readable exchange of attention, spacing, gesture, or object use between them. If only one subject is present, create an interaction between that subject and the visible environment instead. Never introduce a new participant."
  },
  {
    id: "mini-narrative",
    label: "Mini narrative",
    tags: ["story", "intention", "ending"],
    instruction: "Turn the reference into the beginning, middle, and end of one tiny visual story without inventing a new setting: establish the visible state, introduce a grounded intention or trigger, show the resulting action and reaction, and finish on a changed but coherent state."
  },
  {
    id: "stillness-break",
    label: "Stillness break",
    tags: ["subtle", "reveal", "micro-motion"],
    instruction: "Begin with a convincing hold on the reference image, then break the stillness with one precise observable cue: a blink, breath, turn, tremor, shadow shift, object response, or camera drift. Gradually build only as much motion as the scene can support and return to a controlled final hold."
  }
];

export function h3AutoPromptSeedFor(
  mode: H3PromptMode,
  requestedId?: string,
  excludedIds: readonly string[] = [],
  random: () => number = Math.random
): H3AutoPromptSeed {
  const modeSeeds = h3AutoPromptSeeds.filter((seed) =>
    mode === "R2V" || seed.tags.length > 0
  );
  const requested = requestedId ? modeSeeds.find((seed) => seed.id === requestedId) : undefined;
  if (requested) return requested;
  const availableSeeds = modeSeeds.filter((seed) => !excludedIds.includes(seed.id));
  const candidates = availableSeeds.length ? availableSeeds : modeSeeds;
  const index = Math.min(candidates.length - 1, Math.floor(Math.max(0, random()) * candidates.length));
  return candidates[index] ?? h3AutoPromptSeeds[0]!;
}

export function createDefaultH3AutoPromptSeedInstructions(): Record<string, string> {
  return Object.fromEntries(
    h3AutoPromptSeeds.map((seed) => [seed.id, seed.instruction])
  );
}
