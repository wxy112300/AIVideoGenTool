import { appendRifeFrames, frameInterpolationMultiplier } from "../workflow.js";
import type { Draft } from "../../types.js";
import type { ContinuumApiGraph, ContinuumGroupProfile } from "./group-workflow.js";
import type { LongVideoExecutionSnapshot } from "./execution.js";

export interface ContinuumDelivery { frameInterpolation: Draft["frameInterpolation"]; }
export function longVideoDeliveryMultiplier(profile: Pick<ContinuumGroupProfile, "delivery">): 1 | 2 | 4 {
  return frameInterpolationMultiplier({ frameInterpolation: profile.delivery?.frameInterpolation ?? "off" });
}
export function longVideoOutputFps(snapshot: Pick<LongVideoExecutionSnapshot, "profile">): number {
  return 24 * longVideoDeliveryMultiplier(snapshot.profile);
}

/** Lazy branch: intermediate group exports stay native; only the assembled full movie runs RIFE. */
export function appendContinuumDelivery(graph: ContinuumApiGraph, profile: ContinuumGroupProfile, chunks: number): void {
  const multiplier = longVideoDeliveryMultiplier(profile);
  if (multiplier === 1) return;
  const video = graph["16"];
  if (video?.class_type !== "CreateVideo" || !Array.isArray(video.inputs.images)) throw new Error("Missing full-movie delivery consumer");
  const frames = video.inputs.images;
  let id = Math.max(0, ...Object.keys(graph).map(k => Number(k) || 0)) + 1;
  const count = String(id++), complete = String(id++), unload = String(id++);
  graph[count] = { class_type: "GetImageSize", inputs: { image: frames } };
  graph[complete] = { class_type: "ComfyMathExpression", inputs: { expression: `a >= ${Math.round(chunks * profile.chunkSeconds * 24) - 1}`, "values.a": [count, 2] } };
  graph[unload] = { class_type: "VRAM_Debug", inputs: { image_pass: frames, empty_cache: true, gc_collect: true, unload_all_models: true } };
  const interpolated = appendRifeFrames(graph, [unload, 1], multiplier, true);
  id = Math.max(...Object.keys(graph).map(k => Number(k) || 0)) + 1;
  const choose = String(id++), fps = String(id++);
  graph[choose] = { class_type: "ComfySwitchNode", inputs: { switch: [complete, 2], on_false: frames, on_true: interpolated } };
  graph[fps] = { class_type: "ComfyMathExpression", inputs: { expression: `24 + ${24 * (multiplier - 1)} * a`, "values.a": [complete, 2] } };
  video.inputs.images = [choose, 0]; video.inputs.fps = [fps, 0];
}
