import { afterEach, expect, it, vi } from "vitest";
import { submitTask } from "../electron/services/comfy-ui";
import { createDefaultState } from "../src/core/defaults";
import { upscaleTaskFromRequest } from "../src/core/queue-task-factory";
import { H3_REFINER_ID, H3_REFINER_NODES } from "../src/core/h3-refiner";
import { TESSERA_ID, TESSERA_NODES } from "../src/core/tessera";
import type { HistoryAsset } from "../src/types";

afterEach(() => vi.unstubAllGlobals());
it.each([H3_REFINER_ID, TESSERA_ID])("passes the backend GPU telemetry into the actual %s prompt submission", async modelId => {
  const state = createDefaultState();
  state.history = [{ id: "a", prompt: "A person walking", versions: [{ id: "v", outputFilename: "source.mp4" }] }] as HistoryAsset[];
  const task = upscaleTaskFromRequest({ modelId, sourceAssetId: "a", sourceVersionId: "v", sourceFilePath: "source.mp4", sourceFilename: "source.mp4",
    sourceWidth: 1344, sourceHeight: 768, duration: 15.1, fps: 24, targetHeight: 2160, tileMode: "safe", faceRestore: false }, state);
  const info = Object.fromEntries([...H3_REFINER_NODES, ...TESSERA_NODES].map(id => [id, {}]));
  info.ModelAttentionBackend = { input: { required: { model: ["MODEL"], attention: ["COMBO", { options: ["pytorch attention", "comfy kitchen attention"] }] } } };
  for (const [id, names] of [["LocalVideoStudioH3RefinerPrepare", ["images", "fps", "width", "height"]], ["LocalVideoStudioH3RefinerOutput", ["images", "frame_count", "width", "height"]], ["LocalVideoStudioH3RefinerLoraGuard", ["base", "model", "adapter"]]] as const) {
    info[id] = { input: { required: Object.fromEntries(names.map(name => [name, ["STRING"]])) } };
  }
  let availableGiB = 23;
  const prompts: Array<Record<string, { inputs: Record<string, unknown> }>> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith("/object_info")) return Response.json(info);
    if (url.endsWith("/system_stats")) return Response.json({ system: { comfyui_version: "0.46.0", ram_free: 40 * 1024 ** 3 }, devices: [{ type: "cuda", vram_total: 24 * 1024 ** 3, vram_free: availableGiB * 1024 ** 3 }] });
    expect(url.endsWith("/prompt")).toBe(true);
    prompts.push(JSON.parse(options!.body as string).prompt);
    return Response.json({ prompt_id: "hardware-profile" });
  }));
  const before = structuredClone(task);
  await submitTask(task, state.settings, new AbortController().signal, { uploadedUpscaleSource: "uploaded.mp4" });
  if (modelId === TESSERA_ID) expect(prompts[0]!.refine!.inputs.spatial_tile).toBe("high_vram");
  else expect(prompts[0]!.spatial!.inputs.tile_width).toBe(1024);
  availableGiB = 8;
  await submitTask(task, state.settings, new AbortController().signal, { uploadedUpscaleSource: "uploaded.mp4" });
  if (modelId === TESSERA_ID) expect(prompts[1]!.refine!.inputs.temporal_tile).toBe("low_vram");
  else expect(prompts[1]!.spatial!.inputs.tile_width).toBe(640);
  expect(task).toEqual(before);
});
