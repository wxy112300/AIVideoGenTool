import { describe, expect, it } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { upscaleTaskFromRequest } from "../src/core/queue-task-factory";
import { H3_REFINER_ID, H3_REFINER_NODES, buildH3RefinerWorkflow, h3RefinerGeometry } from "../src/core/h3-refiner";
import { h3ComfyWorkflowRuntimeIssues } from "../src/core/h3-workflow-contract";
import { isMiniMaxH3Model } from "../src/core/workflow";
import { persistVideoHistoryResult } from "../electron/queue-history";
import type { HistoryAsset, UpscaleRequest } from "../src/types";

function fixture(targetHeight: 1080 | 1440 | 2160 = 2160) {
  const state = createDefaultState();
  state.history = [{ id: "source", prompt: "A fox walking.", versions: [{ id: "v1", outputFilename: "source.mp4" }] } as HistoryAsset];
  const request: UpscaleRequest = {
    modelId: H3_REFINER_ID, sourceAssetId: "source", sourceVersionId: "v1", sourceFilePath: "source.mp4",
    sourceFilename: "source.mp4", sourceWidth: 1920, sourceHeight: 1080,
    duration: 5, fps: 30, targetHeight, tileMode: "fast", faceRestore: true
  };
  const info = Object.fromEntries(H3_REFINER_NODES.map(id => [id, {}]));
  info.ModelAttentionBackend = { input: { required: { attention: [["pytorch attention", "comfy kitchen attention"]] } } };
  info.LocalVideoStudioH3RefinerPrepare = { input: { required: { images: ["IMAGE"], fps: ["FLOAT"], width: ["INT"], height: ["INT"] } } };
  info.LocalVideoStudioH3RefinerOutput = { input: { required: { images: ["IMAGE"], frame_count: ["INT"], width: ["INT"], height: ["INT"] } } };
  info.LocalVideoStudioH3RefinerLoraGuard = { input: { required: { base: ["MODEL"], model: ["MODEL"], adapter: ["STRING"] } } };
  return { state, request, info, task: upscaleTaskFromRequest(request, state) };
}

describe("Kijai H3 Refiner Upscale", () => {
  it("publishes a derived version with its source and an independent recipe snapshot", () => {
    const { state, task } = fixture();
    persistVideoHistoryResult(state, { task, completedAt: "2026-10-29T12:00:00Z", promptId: "p-refiner",
      comfyOutputs: {}, files: [{ filename: "output.mp4", subfolder: "", type: "output" }], id: () => "derived" });
    const version = state.history[0]!.versions[1]!;
    expect(version).toMatchObject({ sourceAssetId: "source", sourceVersionId: "v1", width: 3840, height: 2160,
      fps: 24, upscaleProvider: "kijai-h3-refiner", h3Refiner: { prompt: "A fox walking." } });
    task.h3Refiner!.prompt = "Changed queue copy";
    expect(version.h3Refiner!.prompt).toBe("A fox walking.");
    expect(JSON.parse(JSON.stringify(state)).history[0].versions[1].h3Refiner.recipe).toBeTruthy();
  });
  it("delivers exact landscape/portrait 4K while computing on the H3 grid", () => {
    expect(h3RefinerGeometry(1920, 1080, 2160)).toMatchObject({ outputWidth: 3840, outputHeight: 2160, canvasWidth: 3840, canvasHeight: 2176 });
    expect(h3RefinerGeometry(1080, 1920, 2160)).toMatchObject({ outputWidth: 2160, outputHeight: 3840, canvasWidth: 2176, canvasHeight: 3840 });
    expect(h3RefinerGeometry(1920, 1080, 1080).canvasHeight).toBe(1088);
    expect(() => h3RefinerGeometry(10000, 500, 2160)).toThrow("8192px");
  });

  it("freezes a mode-specific recipe without inheriting Create LoRAs or changing settings", () => {
    const { state, task } = fixture();
    const before = structuredClone(task.h3Refiner);
    state.settings.h3VideoVaeMode = "fp16";
    state.history[0]!.prompt = "Changed later";
    expect(task.h3Refiner).toEqual(before);
    expect(task).toMatchObject({ fps: 24, targetWidth: 3840, targetOutputHeight: 2160, tileMode: "safe", faceRestore: false });
    expect(task.h3Refiner?.sourceFps).toBe(30);
    expect(task.h3Refiner?.turbo).toContain("v1.2");
    expect(task.h3NativeInput).toBeUndefined();
    expect(task.outputFilename).toContain("h3-refiner");
    expect(isMiniMaxH3Model(H3_REFINER_ID)).toBe(false);
  });

  it("preserves source audio and removes only internal grid padding after decoding", () => {
    const { task, info } = fixture();
    const graph = buildH3RefinerWorkflow(task, "uploaded.mp4", info);
    expect(graph.source!.inputs).toMatchObject({ video: "uploaded.mp4", force_rate: 24, frame_load_cap: 0, custom_width: 1344, custom_height: 768 });
    expect(graph.video!.inputs).toMatchObject({ audio: ["source", 2], fps: 24, images: ["restore", 0] });
    expect(graph.restore!.inputs).toMatchObject({ frame_count: ["prepare", 1], width: 3840, height: 2160 });
    expect(graph.sample!.inputs).toMatchObject({ cfg: 1, sigmas: ["prepare", 4] });
    expect(graph.clip!.inputs.type).toBe("minimax");
    expect(Object.values(graph).some(node => node.class_type === "DisableNoise")).toBe(false);
    expect(h3ComfyWorkflowRuntimeIssues(graph, info)).toEqual([]);
  });

  it("uses a second learned upscale for wide 4K instead of extrapolating one pass beyond 4x", () => {
    const { task, info } = fixture();
    const wide = { ...task, sourceWidth: 2400, sourceHeight: 720, targetWidth: 7200, targetOutputHeight: 2160 };
    const graph = buildH3RefinerWorkflow(wide, "source.mp4", info);
    expect(graph["intermediate-upscale"]!.inputs["mode.width"]).toBe(3616);
    expect(graph.av!.inputs.video_latent).toEqual(["intermediate-upscale", 0]);
    expect(h3ComfyWorkflowRuntimeIssues(graph, info)).toEqual([]);
  });

  it("rejects missing nodes, unsupported durations, stale geometry and mismatched recipes", () => {
    const { task, request, state, info } = fixture();
    expect(() => upscaleTaskFromRequest({ ...request, duration: 16 }, state)).toThrow("15 秒");
    expect(() => upscaleTaskFromRequest({ ...request, sourceVersionId: "gone" }, state)).toThrow("源版本");
    expect(() => buildH3RefinerWorkflow(task, "source.mp4", {})).toThrow("缺少节点");
    expect(() => buildH3RefinerWorkflow({ ...task, targetWidth: 4000 }, "source.mp4", info)).toThrow("冻结快照");
    expect(() => buildH3RefinerWorkflow({ ...task, h3Refiner: undefined }, "source.mp4", info)).toThrow("配方快照");
    expect(() => buildH3RefinerWorkflow(task, "source.mp4", { ...info, LocalVideoStudioH3RefinerPrepare: {} })).toThrow("schema 不兼容");
  });
});
