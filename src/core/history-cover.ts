export const HISTORY_COVER_CACHE_VERSION = "history-cover-v3";

export function historyCoverSeed(assetId: string, versionId: string): number {
  let hash = 2166136261;
  for (const character of `${assetId}:${versionId}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function historyInitialCoverTime(duration: number, seed: number): number {
  const safeDuration = Math.max(0, Number.isFinite(duration) ? duration : 0);
  if (safeDuration <= 0.5) return safeDuration / 2;
  const positions = [0.2, 0.31, 0.43, 0.56, 0.68, 0.79];
  return Math.min(safeDuration - 0.1, Math.max(0.1, safeDuration * (positions[seed % positions.length] ?? 0.43)));
}

export function historyCoverCandidates(duration: number, seed: number): number[] {
  const safeDuration = Math.max(0, Number.isFinite(duration) ? duration : 0);
  if (safeDuration <= 0.5) return [safeDuration / 2];
  const positions = [0.18, 0.28, 0.38, 0.49, 0.6, 0.71, 0.82];
  return Array.from({ length: 4 }, (_, index) =>
    Math.min(safeDuration - 0.1, Math.max(0.1, safeDuration * (positions[(seed + index) % positions.length] ?? 0.49))));
}

/** Same exposure/detail heuristic for browser Canvas and host CPU extraction. */
export function scoreHistoryCoverPixels(pixels: ArrayLike<number>): number | null {
  if (!pixels.length || pixels.length % 4) return null;
  let brightnessTotal = 0;
  let brightnessSquaredTotal = 0;
  let saturationTotal = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index] ?? 0;
    const green = pixels[index + 1] ?? 0;
    const blue = pixels[index + 2] ?? 0;
    const brightness = red * 0.299 + green * 0.587 + blue * 0.114;
    brightnessTotal += brightness;
    brightnessSquaredTotal += brightness * brightness;
    saturationTotal += Math.max(red, green, blue) - Math.min(red, green, blue);
  }
  const count = pixels.length / 4;
  const average = brightnessTotal / count;
  const variance = Math.max(0, brightnessSquaredTotal / count - average * average);
  return Math.sqrt(variance) * 1.5 + saturationTotal / count * 0.35 - Math.abs(average - 128) * 0.35
    - (average < 18 || average > 242 ? 120 : 0);
}

export interface HistoryCoverKeyInput {
  assetId: string;
  versionId: string;
  createdAt: string;
  filename: string;
  absolutePath: string;
}

export function createHistoryCoverCacheKey(input: HistoryCoverKeyInput): string {
  return [
    HISTORY_COVER_CACHE_VERSION,
    input.assetId,
    input.versionId,
    input.createdAt,
    input.filename,
    input.absolutePath
  ].join(":");
}
