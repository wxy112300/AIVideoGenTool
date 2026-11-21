import { describe, expect, it, vi } from "vitest";
import { QueueMutationService } from "../electron/queue-mutation-service";
import { createDefaultState } from "../src/core/defaults";
import { upscaleTaskFromRequest } from "../src/core/queue-task-factory";
import { TESSERA_ID } from "../src/core/tessera";
import { H3_REFINER_ID } from "../src/core/h3-refiner";
import type { AppState, HistoryAsset, UpscaleQueueTask, UpscaleTaskEditRequest, EnvironmentScanResult } from "../src/types";
import type { StateRepository } from "../electron/ports/state-repository";

function fixture(modelId = "seedvr2") {
  let state = createDefaultState();
  state.history = [{ id: "asset", prompt: "Source", versions: [{ id: "version", outputFilename: "source.mp4", width: 1344, height: 768, fps: 30, duration: 15.1 }] }] as HistoryAsset[];
  const task = upscaleTaskFromRequest({ modelId, sourceAssetId: "asset", sourceVersionId: "version", sourceFilePath: "source.mp4", sourceFilename: "source.mp4",
    sourceWidth: 1344, sourceHeight: 768, fps: 30, duration: 15.1, targetHeight: 2160, tileMode: "safe", faceRestore: false }, state);
  task.status = "failed"; task.error = "previous failure"; task.comfyPromptId = "old-prompt";
  state.queue = [task];
  const store = { get: () => state, getSettings: () => state.settings,
    update: async (mutator: (value: AppState) => void) => { const next = structuredClone(state); mutator(next); state = next; return next; } } as StateRepository;
  const environment = { modelProfiles: [{ id: "qwen-image-2-1", available: true, components: ["diffusion_models/qwen_image_2.1_int8_convrot.safetensors", "text_encoders/qwen3vl_8b_int8_convrot.safetensors", "vae/qwen_image_2.1_vae_bf16.safetensors"].map(file => ({ found: true, matches: ["C:/models/" + file] })) }] } as EnvironmentScanResult;
  const service = new QueueMutationService({ store, logger: {} as never, sendState: vi.fn(), getCachedEnvironmentScanForQueue: () => environment });
  const patch = (modelId: string): UpscaleTaskEditRequest => ({ modelId, upscaleMode: "pixel", targetHeight: 2160, targetWidth: 3780, targetOutputHeight: 2160,
    tileMode: "safe", faceRestore: false, outputFilename: "output.mp4", workflowPath: `builtin:upscale/${modelId}` });
  return { task, store, service, environment, patch };
}

describe("failed Upscale recipe editing", () => {
  it("switches a failed pixel task to Tessera in place and reconstructs the recipe", async () => {
    const f = fixture(); const before = structuredClone(f.task);
    const state = await f.service.updateUpscale(f.task.id, f.patch(TESSERA_ID));
    expect(state.queue).toHaveLength(1);
    expect(state.queue[0]).toMatchObject({ id: before.id, createdAt: before.createdAt, seed: before.seed, sourceAssetId: "asset", sourceVersionId: "version",
      sourceFilePath: before.sourceFilePath, modelId: TESSERA_ID, status: "waiting", fps: 24, tessera: { sourceFps: 30 } });
    expect(state.queue[0]!.error).toBeUndefined(); expect(state.queue[0]!.comfyPromptId).toBeUndefined();
  });
  it("repairs a legacy Tessera task missing its snapshot instead of locking out the editor", async () => {
    const f = fixture(TESSERA_ID); delete f.task.tessera;
    const state = await f.service.updateUpscale(f.task.id, f.patch(TESSERA_ID));
    expect((state.queue[0] as UpscaleQueueTask).tessera?.recipe).toBeTruthy();
  });
  it("can leave Tessera for SeedVR2 or Refiner without leaking old snapshots", async () => {
    for (const model of ["seedvr2", H3_REFINER_ID]) {
      const f = fixture(TESSERA_ID);
      const state = await f.service.updateUpscale(f.task.id, f.patch(model));
      const task = state.queue[0] as UpscaleQueueTask;
      expect(task.modelId).toBe(model); expect(task.tessera).toBeUndefined();
      expect(task.fps).toBe(model === H3_REFINER_ID ? 24 : 30);
      expect(!!task.h3Refiner).toBe(model === H3_REFINER_ID);
    }
  });
  it("can enable/change/disable Qwen when editing and rejects an unavailable model transactionally", async () => {
    const f = fixture(TESSERA_ID);
    const on = { ...f.patch(TESSERA_ID), tesseraAnchor: { enabled: true, modelId: "qwen-image-2-1" } };
    await f.service.updateUpscale(f.task.id, on);
    expect((f.store.get().queue[0] as UpscaleQueueTask).tessera?.anchor?.modelId).toBe("qwen-image-2-1");
    const before = structuredClone(f.store.get()); f.environment.modelProfiles[0]!.available = false;
    await expect(f.service.updateUpscale(f.task.id, on)).rejects.toThrow();
    expect(f.store.get()).toEqual(before);
    await f.service.updateUpscale(f.task.id, { ...f.patch(TESSERA_ID), tesseraAnchor: { enabled: false } });
    expect((f.store.get().queue[0] as UpscaleQueueTask).tessera?.anchor).toBeUndefined();
  });
  it("never rewrites a running execution", async () => {
    const f = fixture(TESSERA_ID); f.task.status = "running";
    const before = structuredClone(f.store.get());
    await expect(f.service.updateUpscale(f.task.id, f.patch("seedvr2"))).rejects.toThrow();
    expect(f.store.get()).toEqual(before);
  });
});
