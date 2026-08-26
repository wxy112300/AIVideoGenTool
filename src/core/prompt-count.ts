import type { H3PromptMode, H3PromptPreset } from "../types.js";

export function countPromptWords(text: string): number {
  const normalized = text.trim();
  if (!normalized) return 0;
  const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
  let count = 0;
  for (const segment of segmenter.segment(normalized)) {
    if (segment.isWordLike) count += 1;
  }
  return count;
}

export interface H3PromptWordRange {
  min: number;
  max: number;
}

/**
 * Returns a soft writing reference for the editor. H3 has no universal word
 * ceiling here: the useful length depends on mode, duration, dialogue, shot
 * count, and reference complexity. Keep this deliberately separate from the
 * model output-token budget.
 */
export function h3PromptWordRange(
  mode: H3PromptMode,
  durationSeconds = 5,
  preset: H3PromptPreset = "official-storyboard"
): H3PromptWordRange {
  const safeDuration = Number.isFinite(durationSeconds) && durationSeconds > 0
    ? durationSeconds
    : 5;
  const minimum = mode === "R2V"
    ? Math.max(350, Math.round(170 + safeDuration * 36))
    : Math.max(250, Math.round(100 + safeDuration * 30));
  const maximum = preset === "detailed-cinematic"
    ? Math.max(900, Math.round(560 + safeDuration * 68))
    : Math.max(500, Math.round(300 + safeDuration * 40));
  return { min: minimum, max: maximum };
}
