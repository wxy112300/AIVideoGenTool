import { describe, expect, it, vi } from "vitest";
import { minimaxH3ImageAdapter as adapter } from "../src/core/image-workflow/minimax-h3-image";
import { minimaxH3ImageW4a8Adapter } from "../src/core/image-workflow/minimax-h3-image";
import { createDefaultImageEditDraft, createDefaultState } from "../src/core/defaults";
import { imageTaskFromDraft } from "../src/core/queue-task-factory";
import { normalizeImageEditDraft, imageEditPicturesForVersion } from "../src/core/image-project";
import { renderImageWorkflow } from "../src/core/image-workflow";
import { imageEditPromptContractForTarget, imageEditPromptUserContentForTarget } from "../src/core/image-prompt";
import { buildStrataPromptRequest } from "../electron/services/strata-prompt";
import { submitImageTask } from "../electron/services/comfy-ui";
import type { ImageReferenceSnapshot } from "../src/types";

function task(pictures: ImageReferenceSnapshot[] = [], targetResolution = 4096) {
  const draft = { ...createDefaultImageEditDraft(), modelId: adapter.id, qualityProfile: "native-6", pictures,
    targetResolution, aspectRatio: "1:1" as const, seed: 42,
    promptVersions: [{ id: "p", label: "test", text: pictures.length ? "Keep <Picture 3>." : "A garden", createdAt: "2026-11-11" }], activePromptVersion: 0 };
  // Legacy INT8 execution snapshots retain their original recipe after UI retirement.
  return imageTaskFromDraft(draft, undefined, { root: "", directory: "", subfolder: "Images" });
}
const picture = (number: number): ImageReferenceSnapshot => ({ id: `p${number}`, pictureNumber: number, absolutePath: `${number}.png`, width: 1278, height: 719 });

describe("official MiniMax H3 Image workflow", () => {
  it("keeps W4A8 and existing INT8 execution snapshots independent", () => {
    const old = task([], 2048);
    const lowVram = { ...old, modelId: "minimax-h3-image-w4a8" };
    expect(minimaxH3ImageW4a8Adapter.buildWorkflow(lowVram, lowVram.runs[0]!).clip?.inputs.device).toBe("cpu");
    expect(adapter.buildWorkflow(old, old.runs[0]!).clip?.inputs.device).toBe("default");
    expect(minimaxH3ImageW4a8Adapter.buildWorkflow(lowVram, lowVram.runs[0]!).model?.inputs.unet_name).toBe("minimax_h3_image_pruned_w4a8.safetensors");
    expect(adapter.buildWorkflow(old, old.runs[0]!).model?.inputs.unet_name).toBe("minimax_h3_image_pruned_int8_convrot.safetensors");
    expect(old.diffusionModelFilename).toBeUndefined();
    const frozen = { ...lowVram, diffusionModelFilename: "frozen/minimax_h3_image_pruned_w4a8.safetensors" };
    expect(minimaxH3ImageW4a8Adapter.buildWorkflow(frozen, frozen.runs[0]!).model?.inputs.unet_name).toBe(frozen.diffusionModelFilename);
  });
  it("retains 4096 through draft and queue, freezing the 6-step native graph", () => {
    const queued = task();
    expect([queued.outputWidth, queued.outputHeight]).toEqual([4096, 4096]);
    const graph = adapter.buildWorkflow(queued, queued.runs[0]!);
    expect(adapter.validateWorkflow(graph)).toEqual([]);
    expect(graph.sampler?.inputs).toMatchObject({ steps: 6, cfg: 1, sampler_name: "euler", scheduler: "simple", latent_image: ["conditioning", 1], model: ["model", 0] });
    expect(graph.clip?.inputs.type).toBe("minimax");
    expect(graph.conditioning?.inputs).toMatchObject({ width: 4096, height: 4096, prompt: "A garden" });
    expect(Object.values(graph).some(n => /Audio|Video|Lora|Spectrum|ModelSampling/u.test(n.class_type))).toBe(false);
  });
  it("maps stable Picture labels into ordered dotted inputs and uploaded filenames", () => {
    const queued = task([picture(3), picture(7)]);
    queued.pictures = [picture(3), picture(7)];
    const graph = adapter.buildWorkflow(queued, queued.runs[0]!);
    expect(graph.conditioning?.inputs.prompt).toBe("Keep <Picture 1>.");
    expect(graph.conditioning?.inputs["images.image_2"]).toEqual(["image-2", 0]);
    const schema: Record<string, unknown> = {};
    for (const node of Object.values(graph)) schema[node.class_type] = { input: { required: Object.fromEntries(Object.keys(node.inputs).map(key => [key, ["ANY"]])) } };
    schema.LoadImage = { input: { required: { image: [["already-on-server.png"]] } } };
    expect(adapter.validateRuntimeSchema!(graph, schema)).toEqual([]);
    const rendered = renderImageWorkflow(graph, ["uploaded-3.png", "uploaded-7.png"], []);
    expect(rendered["image-2"]?.inputs.image).toBe("uploaded-7.png");
    expect(adapter.validateWorkflow(rendered, undefined, false)).toEqual([]);
  });
  it("supports 16 references and rejects a seventeenth or a missing numbered source", () => {
    expect(adapter.compilePrompt("Keep <Picture 16>.", Array.from({ length: 16 }, (_, i) => picture(i + 1))).errors).toEqual([]);
    expect(adapter.compilePrompt("Keep <Picture 17>.", Array.from({ length: 17 }, (_, i) => picture(i + 1))).errors.length).toBeGreaterThan(0);
    expect(adapter.compilePrompt("Keep <Picture 2>.", [picture(1)]).errors.length).toBeGreaterThan(0);
    const refs = Array.from({ length: 16 }, (_, i) => picture(i + 1));
    expect(imageEditPicturesForVersion({ modelId: adapter.id, file: { filename: "result.png", subfolder: "", type: "output", absolutePath: "result.png" }, width: 4096, height: 4096, references: refs })).toHaveLength(16);
  });
  it("keeps old models at their existing resolution range and aligns H3 source output", () => {
    expect(normalizeImageEditDraft({ ...createDefaultImageEditDraft(), modelId: "qwen-image-2-1", targetResolution: 4096 }).targetResolution).toBe("source");
    const queued = task(); queued.outputWidth = 1278;
    expect(() => adapter.buildWorkflow(queued, queued.runs[0]!)).toThrow("32");
    queued.outputWidth = 4096; queued.qualityProfile = "quality-50";
    expect(() => adapter.buildWorkflow(queued, queued.runs[0]!)).toThrow("native-6");
    const draft = { ...createDefaultImageEditDraft(), modelId: adapter.id, qualityProfile: "native-6", targetResolution: 2688, aspectRatio: "21:9" as const, pictures: [] };
    const wide = imageTaskFromDraft(normalizeImageEditDraft(draft), undefined, { root: "", directory: "", subfolder: "" });
    expect([wide.outputWidth, wide.outputHeight]).toEqual([6272, 2688]);
    const source = imageTaskFromDraft(normalizeImageEditDraft({ ...draft, targetResolution: "source", aspectRatio: "source", pictures: [picture(1)] }), undefined, { root: "", directory: "", subfolder: "" });
    expect([source.outputWidth, source.outputHeight]).toEqual([1280, 704]);
  });
  it("uses official source/relationship/change guidance in the real enhancer request", async () => {
    expect(imageEditPromptContractForTarget(adapter.id, "faithful")).toContain("<Subject N> is fully preserved.");
    const request = { mode: "image-edit" as const, modelId: "fixture", imageTargetModelId: adapter.id,
      prompt: "Replace the cup; preserve '你好'." };
    expect(imageEditPromptUserContentForTarget(request)).toContain("Text-to-image: no references");
    const edited = { ...request, imagePaths: ["a.png"], referenceContext: "<Picture 3> is the source." };
    expect(imageEditPromptUserContentForTarget(edited)).toContain("source definitions");
    const payload = await buildStrataPromptRequest(edited, createDefaultState().settings, new AbortController().signal,
      async () => ({ type: "image_url", image_url: { url: "data:image/png;base64,AA==" } }));
    expect(JSON.stringify(payload)).toContain("MiniMax H3 Image");
    expect(JSON.stringify(payload)).toContain("<Picture 3>");
  });
  it("rejects an old core before uploading images or submitting a prompt", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async input => new Response(JSON.stringify(String(input).endsWith("system_stats")
      ? { system: { comfyui_version: "0.44.0" } } : {}), { status: 200, headers: { "content-type": "application/json" } }));
    try {
      const queued = task();
      await expect(submitImageTask(queued, queued.runs[0]!, createDefaultState().settings, new AbortController().signal)).rejects.toThrow("0.45.0");
      expect(fetch.mock.calls.every(([input]) => !String(input).includes("/upload/") && !String(input).endsWith("/prompt"))).toBe(true);
    } finally { fetch.mockRestore(); }
  });
  it("submits using an installed nested INT8 encoder and validates its loader enum", async () => {
    const queued = task(), graph = adapter.buildWorkflow(queued, queued.runs[0]!);
    const schema: Record<string, unknown> = {};
    for (const node of Object.values(graph)) schema[node.class_type] = { input: { required: Object.fromEntries(Object.keys(node.inputs).map(key => [key, ["ANY"]])) } };
    schema.CLIPLoader = { input: { required: { clip_name: [["shared/qwen3vl_32b_minimax_h3_int8_convrot.safetensors"]], type: [["minimax"]], device: [["default"]] } } };
    schema.UNETLoader = { input: { required: { unet_name: [["minimax_h3_image_pruned_int8_convrot.safetensors"]], weight_dtype: [["default"]] } } };
    schema.VAELoader = { input: { required: { vae_name: [["minimax_h3_image_vae_fp16.safetensors"]] } } };
    let submitted = "";
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/prompt")) submitted = String(init?.body);
      const value = url.endsWith("system_stats") ? { system: { comfyui_version: "0.45.0" } } : url.endsWith("object_info") ? schema : { prompt_id: "h3-image-task" };
      return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
    });
    try {
      expect((await submitImageTask(queued, queued.runs[0]!, createDefaultState().settings, new AbortController().signal)).promptId).toBe("h3-image-task");
      expect(submitted).toContain("shared/qwen3vl_32b_minimax_h3_int8_convrot.safetensors");
      schema.CLIPLoader = { input: { required: { clip_name: [["shared/qwen3vl_32b_minimax_h3_int8_convrot.safetensors"]], type: [["qwen_image"]], device: [["default"]] } } };
      await expect(submitImageTask(queued, queued.runs[0]!, createDefaultState().settings, new AbortController().signal)).rejects.toThrow("minimax");
    } finally { fetch.mockRestore(); }
  });
  it("submits W4A8 only with its paired NVFP4 encoder, without falling back to INT8", async () => {
    const queued = { ...task([], 2048), modelId: "minimax-h3-image-w4a8" };
    const graph = minimaxH3ImageW4a8Adapter.buildWorkflow(queued, queued.runs[0]!);
    const schema: Record<string, unknown> = {};
    for (const node of Object.values(graph)) schema[node.class_type] = { input: { required: Object.fromEntries(Object.keys(node.inputs).map(key => [key, ["ANY"]])) } };
    const encoder = "shared/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors";
    schema.CLIPLoader = { input: { required: { clip_name: [[encoder]], type: [["minimax"]], device: [["default", "cpu"]] } } };
    schema.UNETLoader = { input: { required: { unet_name: [["minimax_h3_image_pruned_w4a8.safetensors", "minimax_h3_image_pruned_int8_convrot.safetensors"]], weight_dtype: [["default"]] } } };
    schema.VAELoader = { input: { required: { vae_name: [["minimax_h3_image_vae_fp16.safetensors"]] } } };
    let submitted = "";
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/prompt")) submitted = String(init?.body);
      return new Response(JSON.stringify(url.endsWith("system_stats") ? { system: { comfyui_version: "0.45.0" } } : url.endsWith("object_info") ? schema : { prompt_id: "w4a8-task" }), { headers: { "content-type": "application/json" } });
    });
    try {
      await submitImageTask(queued, queued.runs[0]!, createDefaultState().settings, new AbortController().signal);
      expect(submitted).toContain("minimax_h3_image_pruned_w4a8.safetensors");
      expect(submitted).toContain(encoder);
      expect(submitted).not.toContain("pruned_int8_convrot");
      schema.CLIPLoader = { input: { required: { clip_name: [["qwen3vl_32b_minimax_h3_int8_convrot.safetensors"]] } } };
      await expect(submitImageTask(queued, queued.runs[0]!, createDefaultState().settings, new AbortController().signal)).rejects.toThrow("clip_name missing");
    } finally { fetch.mockRestore(); }
  });
});
