import { alignH3FrameCount, H3_CONTEXT_FRAMES } from "../h3-temporal.js";

/** Product limits, not additional model/weight defaults. */
export const CONTINUUM_LAYOUT_LIMITS = { maxSeconds: 120, maxChunks: 16, minChunkSeconds: 4, maxChunkSeconds: 15 } as const;

export interface LongVideoLayout {
  origin: "create" | "extend";
  requestedSeconds: number;
  targetFrames: number;
  chunkSeconds: number;
  prefixChunks: number;
  chunks: number;
  totalChunks: number;
}

export function suggestLongVideoChunks(seconds: number): { min: number; max: number; suggested: number } {
  checkSeconds(seconds);
  const min = Math.ceil(seconds / 15);
  const max = seconds < 5 ? 1 : Math.min(16, Math.floor(seconds / 5));
  return { min, max, suggested: Math.max(min, Math.min(max, Math.ceil(seconds / 10))) };
}

function checkSeconds(seconds: number): void {
  if (!Number.isFinite(seconds) || seconds < 4 || seconds > 120) throw new Error("Long video duration must be 4–120 seconds");
}

// Python round() in the reviewed upstream sequence uses ties-to-even.
function upstreamFrameRound(value: number): number {
  const lower = Math.floor(value);
  return value - lower === 0.5 ? lower + (lower % 2) : Math.round(value);
}

export function createLongVideoLayout(seconds: number, chunks = suggestLongVideoChunks(seconds).suggested): LongVideoLayout {
  checkSeconds(seconds);
  const chunkSeconds = seconds / chunks;
  if (!Number.isInteger(chunks) || chunks < 1 || chunks > 16 || chunkSeconds < 4 || chunkSeconds > 15) {
    throw new Error("Layout requires 1–16 equal chunks of 4–15 seconds");
  }
  return { origin: "create", requestedSeconds: seconds, targetFrames: Math.round(seconds * 24), chunkSeconds, prefixChunks: 0, chunks, totalChunks: chunks };
}

/** A non-representable request is returned for explicit confirmation, never silently rounded. */
export function proposeLongVideoExtension(seconds: number, prefixChunks: number, chunkSeconds: number): {
  exact: boolean; requestedSeconds: number; proposedSeconds: number; layout: LongVideoLayout;
} {
  checkSeconds(seconds);
  if (!Number.isInteger(prefixChunks) || prefixChunks < 1 || prefixChunks >= 16 ||
      !Number.isFinite(chunkSeconds) || chunkSeconds < 4 || chunkSeconds > 15) throw new Error("Invalid frozen Run capacity/duration");
  const chunks = Math.ceil(seconds / chunkSeconds - 1e-9);
  if (prefixChunks + chunks > 16 || chunks * chunkSeconds > 120) throw new Error("Run has insufficient remaining capacity");
  const proposedSeconds = chunks * chunkSeconds;
  return { exact: Math.abs(seconds - proposedSeconds) < 1e-6, requestedSeconds: seconds, proposedSeconds,
    layout: { origin: "extend", requestedSeconds: proposedSeconds, targetFrames: Math.round(proposedSeconds * 24), chunkSeconds, prefixChunks, chunks, totalChunks: prefixChunks + chunks } };
}

export function assertLongVideoLayout(layout: LongVideoLayout): void {
  if (!["create", "extend"].includes(layout.origin)) throw new Error("Invalid layout origin");
  const expected = layout.origin === "create" ? createLongVideoLayout(layout.requestedSeconds, layout.chunks)
    : proposeLongVideoExtension(layout.requestedSeconds, layout.prefixChunks, layout.chunkSeconds).layout;
  if ((Object.keys(expected) as Array<keyof LongVideoLayout>).some(key => layout[key] !== expected[key])) {
    throw new Error("Inconsistent confirmed layout");
  }
}

/** Ordinary 22-frame groups only. Terminal merges/adaptive context require actual manifest plans.
 * This predicts raw grid contributions; it never certifies decoded media or fills missing frames.
 */
export function projectLongVideoFrames(layout: LongVideoLayout, retainedPrefixFrames = 0) {
  assertLongVideoLayout(layout);
  if (layout.prefixChunks > 0 && (!Number.isInteger(retainedPrefixFrames) || retainedPrefixFrames < 1)) throw new Error("Actual retained prefix frames required");
  if (!layout.prefixChunks && retainedPrefixFrames !== 0) throw new Error("New Run cannot have retained prefix frames");
  let retained = retainedPrefixFrames;
  const groups = Array.from({ length: layout.chunks }, (_, index) => {
    const logicalChunk = layout.prefixChunks + index + 1;
    const contextFrames = logicalChunk === 1 ? 0 : H3_CONTEXT_FRAMES;
    const desired = upstreamFrameRound(logicalChunk * layout.chunkSeconds * 24);
    const requested = Math.max(1, desired - retained);
    const target = contextFrames + requested;
    const lower = 5 + Math.max(0, Math.floor((target - 5) / 17)) * 17;
    const sampledFrames = contextFrames === 0 ? alignH3FrameCount(requested)
      : (target - lower <= lower + 17 - target ? lower : lower + 17);
    const netFrames = sampledFrames - contextFrames;
    const startFrame = retained;
    retained += netFrames;
    return { logicalChunk, contextFrames, sampledFrames, trimFrames: contextFrames, netFrames, startFrame, endFrame: retained };
  });
  const target = Math.round(layout.totalChunks * layout.chunkSeconds * 24);
  return { groups, retainedFrames: retained, targetFrames: target, tailTrimFrames: Math.max(0, retained - target), shortfallFrames: Math.max(0, target - retained) };
}
