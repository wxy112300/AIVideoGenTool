export const H3_MAX_DURATION_SECONDS = 30;
export const H3_CONTEXT_FRAMES = 22;

export function alignH3FrameCount(frames: number): number {
  const requested = Math.max(5, Math.round(frames));
  return requested + ((5 - (requested % 17) + 17) % 17);
}

export function h3FrameCountForSeconds(seconds: number): number {
  return alignH3FrameCount(seconds * 24);
}

export function h3MotionContextFrameCountForSeconds(seconds: number, contextFrames = H3_CONTEXT_FRAMES): number {
  return alignH3FrameCount(h3FrameCountForSeconds(seconds) + contextFrames);
}

export const H3_MAX_GENERATED_FRAMES = h3FrameCountForSeconds(H3_MAX_DURATION_SECONDS);
export const H3_MOTION_CONTEXT_MAX_FRAMES = h3MotionContextFrameCountForSeconds(H3_MAX_DURATION_SECONDS);

export type H3TemporalRoute = "generation" | "boundary" | "motion-context" | "continuum" | "continuum-legacy";

export function h3TemporalPlanForSeconds(seconds: number, route: H3TemporalRoute, contextFrames = H3_CONTEXT_FRAMES) {
  const requestedFrames = Math.round(seconds * 24);
  const generationFrames = h3FrameCountForSeconds(seconds);
  const continuum = route === "continuum" || route === "continuum-legacy";
  const prefixFrames = continuum || route === "motion-context" ? contextFrames : route === "boundary" ? 1 : 0;
  const target = Math.max(5, requestedFrames + prefixFrames);
  const lower = 5 + Math.max(0, Math.floor((target - 5) / 17)) * 17;
  const nearest = target - lower <= lower + 17 - target ? lower : lower + 17;
  const graphFrames = continuum ? nearest : generationFrames + (route === "motion-context" ? prefixFrames : 0);
  const sampledFrames = alignH3FrameCount(graphFrames);
  const rawNewFrames = Math.max(1, sampledFrames - prefixFrames);
  const outputFrames = route === "generation" ? sampledFrames : route === "continuum-legacy" ? rawNewFrames : requestedFrames;
  return {
    requestedSeconds: seconds,
    graphFrames,
    sampledFrames,
    prefixFrames,
    rawNewFrames,
    outputFrames,
    sampledSeconds: sampledFrames / 24,
    outputSeconds: outputFrames / 24
  };
}

export function parseH3Timecode(value: string): number | undefined {
  const match = /^(\d{1,2}):([0-5]\d)(?:\.(\d{1,3}))?$/.exec(value);
  if (!match) return undefined;
  return Number(match[1]) * 60 + Number(match[2]) + Number(`0.${match[3] ?? "0"}`);
}

export function h3MaxDurationForFrameBudget(
  frameCount: (seconds: number) => number,
  maxFrames: number,
  maxSeconds = H3_MAX_DURATION_SECONDS,
  minSeconds = 1
): number {
  const upper = Number.isFinite(maxSeconds) ? Math.floor(maxSeconds * 10) : H3_MAX_DURATION_SECONDS * 10;
  for (let tenths = upper; tenths >= minSeconds * 10; tenths -= 1) {
    if (frameCount(tenths / 10) <= maxFrames) return tenths / 10;
  }
  return minSeconds;
}