/** Shared base presets for standard H3 generation and continuation. */
export const H3_BASE_RESOLUTIONS = [360, 480, 540, 640, 720, 768] as const;
export const H3_CUSTOM_RESOLUTION_RANGE = { min: 256, max: 1080, step: 16 } as const;
export interface VideoResolutionRange { min: number; max: number; step: number; }
export function isCustomVideoResolution(value: number, range: VideoResolutionRange | undefined): boolean {
  return Boolean(range && Number.isFinite(value) && value >= range.min && value <= range.max && (value - range.min) % range.step === 0);
}
export function clampCustomVideoResolution(value: number, range: VideoResolutionRange): number {
  return Math.max(range.min, Math.min(range.max, range.min + Math.round((value - range.min) / range.step) * range.step));
}

/**
 * Pick the resolution option that best preserves a source video's requested
 * short-edge resolution for the currently selected extension model.
 *
 * A history record may contain a resolution that the current model cannot
 * produce (for example, an older 1080p output). In that case the nearest
 * supported option is used; values above the supported range therefore land
 * on the highest available option and values below it land on the lowest.
 */
export function nearestSupportedVideoResolution(
  requested: number,
  supported: readonly number[],
  fallback: number,
  custom?: VideoResolutionRange
): number {
  if (isCustomVideoResolution(requested, custom)) return requested;
  const options = [...new Set(supported)]
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);
  if (!options.length) return fallback;
  if (!Number.isFinite(requested) || requested <= 0) {
    return options.includes(fallback) ? fallback : options[0]!;
  }
  return options.reduce((best, candidate) => {
    const candidateDistance = Math.abs(candidate - requested);
    const bestDistance = Math.abs(best - requested);
    // Prefer the higher option on an exact tie so a source between two
    // buckets does not lose detail unnecessarily.
    return candidateDistance < bestDistance ||
      (candidateDistance === bestDistance && candidate > best)
      ? candidate
      : best;
  }, options[0]!);
}
