import { readFileSync, promises as fs } from "node:fs";
import path from "node:path";
import type { IpcMain } from "electron";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { modelCatalog } from "../src/core/catalog";
import { FASTH3_OMNI_MODEL_ID as modelId, FASTH3_OMNI_WORKFLOW_FILENAME as filename } from "../src/core/catalog/models/minimax_h3_omni/definition";
import { normalizeVideoDraft, videoModelSupportsDraftInput } from "../src/core/video-draft-normalization";
import { queueTaskFromDraft } from "../src/core/queue-task-factory";
import { H3_PDD_REF2VA_LORA } from "../src/core/video-loras";
import { modelCoreVersionBlockReason } from "../src/core/model-core-requirements";
import { evaluateModelProfiles } from "../electron/services/environment";
import { registerWorkflowIpc } from "../electron/workflow-ipc";
import { submitTask } from "../electron/services/comfy-ui";
import { generationSafetyForTask, h3WorkflowPathForInput, isMiniMaxH3Model, isMiniMaxH3R2vModel, renderWorkflow, validateApiWorkflow } from "../src/core/workflow";

const template = (name = filename) => JSON.parse(readFileSync(path.resolve("workflows", name), "utf8"));
function fixture() {
  const state = createDefaultState();
  state.draft = normalizeVideoDraft({ ...state.draft, modelId, workflowPath: path.resolve("workflows", filename),
    duration: 5, resolution: 480, spectrumMode: "balanced", videoLoras: [H3_PDD_REF2VA_LORA],
    h3ReferenceSlots: [{ id: "picture", mediaType: "image", mediaPath: "face.png", role: "subject", note: "identity" },
      { id: "video", mediaType: "video", mediaPath: "motion.mp4", role: "motion", note: "performance" }] });
  state.settings.h3SparseAttentionMode = "sol-attn";
  return { state, task: queueTaskFromDraft(state.draft, state) };
}
afterEach(() => vi.unstubAllGlobals());

describe("FastH3 Omni independent H3 integration", () => {
  it("discovers its exact checkpoint offline and reuses the shared H3 components", () => {
    const entry = modelCatalog.get(modelId)!;
    const files = entry.definition.scan!.components.filter(component => !component.optional).map(component => component.expected);
    const profile = evaluateModelProfiles(files).find(profile => profile.id === modelId)!;
    expect(profile).toMatchObject({ available: true, integrated: true, runtimeVerified: false });
    expect(evaluateModelProfiles(files.filter(file => !file.includes("fasth3_omniref"))).find(p => p.id === modelId)?.available).toBe(false);
    expect(profile.components[0]?.installGuide).toMatchObject({ bytes: 22_213_723_064,
      revision: "82eff2a6eee6c962846879f4bab52610a4df24d3",
      sha256: "851b2dc9670ed864b7f1e951ac9da047d83b1c04ded9bfcc1a9e5bba0ee33f80" });
    expect(isMiniMaxH3Model(modelId)).toBe(true);
    expect(isMiniMaxH3R2vModel(modelId)).toBe(true);
    expect(videoModelSupportsDraftInput(modelId, "video")).toBe(false);
    expect(h3WorkflowPathForInput(filename, modelId, false)).toBe(filename);
  });

  it("freezes reference identity, eight steps, native FPS and an independent acceleration policy", () => {
    const { state, task } = fixture();
    expect(task).toMatchObject({ modelId, steps: 8, fps: 24, frameInterpolation: "off", spectrumMode: "off", videoLoras: [],
      h3SparseAttentionMode: "sol-attn", h3ExecutionPolicy: { turboProfile: "h3-fasth3-omni", sparseAttentionMode: "off", spectrumEnabled: false } });
    state.draft.h3ReferenceSlots[0]!.mediaPath = "changed.png";
    state.draft.modelId = "minimax_h3_ref2va";
    expect(task.h3ReferenceSlots?.map(slot => slot.mediaPath)).toEqual(["face.png", "motion.mp4"]);
    expect(task.modelId).toBe(modelId);
    expect(generationSafetyForTask({ ...task, duration: 5 }).safe).toBe(true);
    expect(generationSafetyForTask({ ...task, duration: 30 }).safe).toBe(false);
  });

  it("renders the real graph with ordered image/video/audio links and one eight-step PDD schedule", () => {
    const { task } = fixture();
    const graph = renderWorkflow(template(), task, { h3ReferenceImages: ["uploaded-face.png"], h3ReferenceVideos: ["uploaded-motion.mp4"] }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    expect(validateApiWorkflow(template()).valid).toBe(true);
    const nodes = Object.values(graph);
    expect(graph["1"]?.inputs.unet_name).toBe("fasth3_omniref_8step_pruned_int8_convrot.safetensors");
    expect(graph["14"]?.inputs).toMatchObject({ "ref_images.ref_image_0": ["5", 0], "ref_videos.ref_video_0": ["27", 0], "ref_video_audios.ref_video_audio_0": ["27", 2] });
    expect(nodes.filter(n => n.class_type === "LoadImage")).toHaveLength(1);
    expect(nodes.filter(n => n.class_type === "VHS_LoadVideoFFmpeg")).toHaveLength(1);
    expect(nodes.find(n => n.class_type === "KSamplerSelect")?.inputs.sampler_name).toBe("euler");
    expect(nodes.find(n => n.class_type === "BasicScheduler")?.inputs).toMatchObject({ steps: 8, scheduler: "simple" });
    expect(nodes.filter(n => n.class_type === "MiniMaxH3SigmaShift")).toHaveLength(1);
    expect(nodes.find(n => n.class_type === "MiniMaxH3SigmaShift")?.inputs).toMatchObject({ shift_video: 12, shift_audio: 3 });
    expect(nodes.some(n => ["LoraLoaderModelOnly", "SpectrumApplyMiniMaxH3", "BlockSparseAttention"].includes(n.class_type))).toBe(false);
    expect(JSON.stringify(graph)).not.toContain("{{");
    // All remaining links target real nodes after empty reference loaders were removed.
    for (const node of nodes) for (const input of Object.values(node.inputs)) {
      if (Array.isArray(input) && typeof input[0] === "string") expect(graph[input[0]]).toBeDefined();
    }
    const base = renderWorkflow(template("minimax_h3_r2v_api.json"), { ...task, modelId: "minimax_h3_ref2va", steps: 20 }, {}) as typeof graph;
    expect(Object.values(base).find(n => n.class_type === "KSamplerSelect")?.inputs.sampler_name).toBe("res_multistep");
    expect(Object.values(base).find(n => n.class_type === "BasicScheduler")?.inputs.steps).toBe(20);
  });

  it("serves a dedicated versioned bundled workflow and refuses to offer it for Extend", async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    registerWorkflowIpc({ ipc: { handle: (name, handler) => handlers.set(name, handler) } as unknown as IpcMain,
      fileSystem: fs, workflowRoots: [path.resolve("workflows")], logger: { info: vi.fn() }, getLtxExtensionModelProfile: () => "q3_k_m" });
    const get = handlers.get("workflow:get-bundled")!;
    expect(await get(undefined, modelId, "image")).toMatchObject({ modelId, path: path.resolve("workflows", filename), supportsEndImage: false, supportsVideoExtension: false,
      metadata: { comfyUi: { minimumVersion: "0.42.0" } } });
    expect(await get(undefined, modelId, "video")).toBeNull();
  });

  it.each(["0.39.0", "0.41.9", ""])("rejects core %s before reading or uploading media, including restored queued tasks", async version => {
    const { state, task } = fixture();
    const fetch = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("/system_stats")
      ? { system: { comfyui_version: version }, devices: [] } : {}), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    await expect(submitTask(task, state.settings, new AbortController().signal)).rejects.toThrow("0.42.0+");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(modelCoreVersionBlockReason("minimax_h3_ref2va", version)).toBe("");
  });
  it("accepts the supported core version without relabeling old H3 requirements", () => {
    expect(modelCoreVersionBlockReason(modelId, "0.42.0")).toBe("");
    expect(modelCoreVersionBlockReason(modelId, "0.42.1")).toBe("");
    expect(modelCoreVersionBlockReason(modelId, "v0.43.0")).toBe("");
  });
});
