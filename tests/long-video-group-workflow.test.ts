import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compileContinuumGroupWorkflow, type ContinuumGroupProfile } from "../src/core/long-video/group-workflow";
import type { ContinuumGroupRequest } from "../src/core/long-video/group-checkpoint";
import { submitContinuumGroup } from "../electron/services/long-video-continuum";
import { createDefaultSettings } from "../src/core/defaults";
import { createLongVideoLayout } from "../src/core/long-video/layout";
import { longVideoGuideCues, longVideoGuideSamplingPrompt } from "../src/core/long-video/timed-guides";
import { deriveContinuumReferenceRouting } from "../src/core/long-video/reference-routing";
import { missingH3VideoReference } from "../src/core/h3-reference";

const templatePath = new URL("../workflows/minimax_h3_continuum_v38_managed_extend_api.json", import.meta.url);
const template = () => JSON.parse(readFileSync(templatePath, "utf8"));
const request: ContinuumGroupRequest = { execution_id: "execution", step_id: "step-1", attempt_id: "attempt-1", project_id: "project", run_name: "new-run", planned_chunks: 2, expected_prefix_chunks: 0, expected_parent_revision_id: "" };
const profile: ContinuumGroupProfile = { diffusionModel: "model.safetensors", textEncoder: "clip.safetensors", videoVae: "vae.safetensors", width: 512, height: 512, seed: 42, steps: 8, sampler: "euler", scheduler: "simple", chunkSeconds: 5, prompts: ["First action", "Second action"], firstImage: "first.png", attention: "sage", lora: { filename: "turbo.safetensors", strength: 1 } };
afterEach(() => vi.restoreAllMocks());

describe("internal Continuum group adapter", () => {
  it("connects a native tail independently from the opening frame", () => {
    const graph = compileContinuumGroupWorkflow(template(), { ...request, execution_mode: "full_run" },
      { ...profile, executionMode: "full_run", lastImage: "native-tail.png" });
    const link = graph["12"].inputs.last_frame as [string, number];
    expect(graph[link[0]].inputs.image).toBe("native-tail.png");
    expect(graph["12"].inputs.first_frame).toEqual(["8", 0]);
    const tailOnly = compileContinuumGroupWorkflow(template(), { ...request, execution_mode: "full_run" },
      { ...profile, executionMode: "full_run", firstImage: undefined, lastImage: "native-tail.png" });
    expect(tailOnly["12"].inputs.first_frame).toBeUndefined();
    const tailOnlyLink = tailOnly["12"].inputs.last_frame as [string, number];
    expect(tailOnly[tailOnlyLink[0]].inputs.image).toBe("native-tail.png");
  });

  it("feeds up to nine R2V images through native reference sockets and reuses the timed image", () => {
    const refImages = Array.from({ length: 9 }, (_, index) => `picture-${index + 1}.png`);
    const graph = compileContinuumGroupWorkflow(template(), { ...request, execution_mode: "full_run" }, {
      ...profile, firstImage: undefined, lora: undefined, attention: "sdpa", executionMode: "full_run",
      referenceImages: refImages, timedGuides: [{ picture: 4, filename: refImages[3]!, absoluteFrame: 124 }],
      prompts: ["<Picture 1> enters.", "<Picture 4> turns."],
      h3: { modelId: "minimax_h3_ref2va", videoLoras: [], sparseAttentionMode: "off",
        runtimeMode: "compatibility", comfyCompilerMode: "disabled", spectrumModelAwareMode: "off" }
    });
    const sampler = graph["12"].inputs;
    expect(sampler.first_frame).toBeUndefined();
    expect(sampler.sequence_prompt).toContain("<Picture 4>");
    const imageFor = (link: unknown) => graph[(link as [string, number])[0]].inputs.image;
    expect([1, 2, 3].map(n => imageFor(sampler[`reference_image_${n}`]))).toEqual(refImages.slice(0, 3));
    const bundle = graph[(sampler.image_references as [string, number])[0]];
    expect(bundle.class_type).toBe("H3ContinuumReferenceImages");
    expect(Object.values(bundle.inputs).map(imageFor)).toEqual(refImages.slice(3));
    const guide = graph[(sampler.guide as [string, number])[0]];
    expect(guide.inputs).toMatchObject({ image: bundle.inputs.reference_image_4, absolute_frame: 124 });
    expect(Object.values(graph).filter(node => node.class_type === "LoadImage")).toHaveLength(9);
  });

  it("compiles H3ContinuumSamplerV39 + H3ContinuumReferenceImagesV39 for per-chunk routing with fixed slot indices", () => {
    const routing = deriveContinuumReferenceRouting(
      ["@R1 enters alone.", "<Picture 1> meets <Picture 3>."],
      ["hero.png", "", "rival.png"]
    );
    expect(routing).toEqual({
      mode: "per_chunk",
      selectors: { R1: "all", R2: "off", R3: "2", R4: "off", R5: "off", R6: "off", R7: "off", R8: "off", R9: "off" }
    });
    const graph = compileContinuumGroupWorkflow(template(), request, {
      ...profile, firstImage: undefined, lora: undefined, attention: "sdpa",
      referenceImages: ["hero.png", "", "rival.png"],
      referenceRouting: routing,
      timedGuides: [{ picture: 3, filename: "rival.png", absoluteFrame: 124 }],
      prompts: ["@R1 enters alone.", "@R1 meets @R3."],
      h3: { modelId: "minimax_h3_ref2va", videoLoras: [], sparseAttentionMode: "off",
        runtimeMode: "compatibility", comfyCompilerMode: "disabled", spectrumModelAwareMode: "off" }
    });
    expect(graph["12"].class_type).toBe("H3ContinuumSamplerV39");
    expect(graph["12"].inputs.reference_image_1).toBeUndefined();
    expect(graph["12"].inputs.image_references).toBeUndefined();
    const refLink = graph["12"].inputs.reference_images as [string, number];
    const refNode = graph[refLink[0]]!;
    expect(refNode.class_type).toBe("H3ContinuumReferenceImagesV39");
    expect(refNode.inputs).toMatchObject({
      reference_use: "Per chunk",
      reference_r1_chunks: "all",
      reference_r2_chunks: "off",
      reference_r3_chunks: "2"
    });
    expect(refNode.inputs.reference_image_2).toBeUndefined();
    const img1 = graph[(refNode.inputs.reference_image_1 as [string, number])[0]]!;
    const img3 = graph[(refNode.inputs.reference_image_3 as [string, number])[0]]!;
    expect(img1.inputs.image).toBe("hero.png");
    expect(img3.inputs.image).toBe("rival.png");
    const guide = graph[(graph["12"].inputs.guide as [string, number])[0]]!;
    expect(guide.inputs).toMatchObject({ image: refNode.inputs.reference_image_3, absolute_frame: 124 });
    expect(Object.values(graph).filter(node => node.class_type === "LoadImage")).toHaveLength(2);
    expect(missingH3VideoReference("@R1 meets @R2.", [
      { id: "1", mediaType: "image", mediaPath: "hero.png", role: "subject", note: "" },
      { id: "2", mediaType: "image", mediaPath: "", role: "subject", note: "" }
    ])).toBe("@R2");
  });

  it("blocks V3.9 per-chunk submission before POST when /object_info lacks V3.9 nodes", async () => {
    const v39Profile: ContinuumGroupProfile = {
      ...profile, firstImage: undefined, lora: undefined, attention: "sdpa",
      referenceImages: ["hero.png", "rival.png"],
      referenceRouting: { mode: "per_chunk", selectors: { R1: "1", R2: "2", R3: "off", R4: "off", R5: "off", R6: "off", R7: "off", R8: "off", R9: "off" } },
      prompts: ["@R1 alone.", "@R2 arrives."],
      h3: { modelId: "minimax_h3_ref2va", videoLoras: [], sparseAttentionMode: "off",
        runtimeMode: "compatibility", comfyCompilerMode: "disabled", spectrumModelAwareMode: "off" }
    };
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ H3ContinuumSamplerV38: {} })));
    await expect(submitContinuumGroup(createDefaultSettings(), templatePath.pathname.replace(/^\/(\w:)/, "$1"), request, v39Profile, new AbortController().signal))
      .rejects.toThrow(/H3ContinuumSamplerV39/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("passes assembled frame numbers across the snapped seam and leaves the official sampler in place", () => {
    const cues = longVideoGuideCues([
      { picture: 1, mediaPath: "before.png", seconds: 123 / 24 },
      { picture: 2, mediaPath: "after.png", seconds: 124 / 24 },
      { picture: 3, mediaPath: "tail.png", seconds: 10 }
    ], createLongVideoLayout(10, 2));
    expect(cues.map(cue => [cue.picture, cue.frame, cue.segment, cue.localSeconds])).toEqual([
      [1, 123, 1, 123 / 24], [2, 124, 2, 0], [3, 239, 2, 115 / 24]
    ]);
    expect(longVideoGuideSamplingPrompt("A turn at <Picture 2>.", cues, 2)).toContain("keyframe at 0s");
    const graph = compileContinuumGroupWorkflow(template(), { ...request, execution_mode: "full_run" }, {
      ...profile, executionMode: "full_run", firstImage: undefined,
      timedGuides: cues.map(cue => ({ picture: cue.picture, filename: cue.mediaPath, absoluteFrame: cue.frame }))
    });
    const nodes = Object.entries(graph).filter(([, node]) => node.class_type === "LocalVideoStudioH3ContinuumTimedGuide");
    expect(nodes.map(([, node]) => node.inputs.absolute_frame)).toEqual([123, 124, 239]);
    expect(nodes[1]![1].inputs.previous).toEqual([nodes[0]![0], 0]);
    expect(graph["12"]).toMatchObject({ class_type: "H3ContinuumSamplerV38", inputs: { guide: [nodes[2]![0], 0] } });
    expect(graph["12"].inputs.first_frame).toBeUndefined();
  });
  it("uses official Full Run for a frozen fresh sequence and keeps legacy Review unchanged", () => {
    const graph = compileContinuumGroupWorkflow(template(), { ...request, execution_mode: "full_run" }, { ...profile, executionMode: "full_run", spectrumMode: "balanced" });
    expect(graph["12"].inputs.generation_mode).toBe("Full Run");
    expect(graph["12"].inputs.show_preview).toBe(template()["12"].inputs.show_preview);
    expect(graph["24"].inputs.execution_mode).toBe("full_run");
    expect(Object.values(graph).some(n => n.class_type === "SpectrumApplyMiniMaxH3")).toBe(true);
    expect(compileContinuumGroupWorkflow(template(), request, profile)["12"].inputs.generation_mode).toBe("Review Each Chunk");
    expect(() => compileContinuumGroupWorkflow(template(), request, { ...profile, executionMode: "full_run" })).toThrow(/Full Run/);
  });
  it.each(["rife2x", "rife4x"] as const)("supports high-resolution delivery with %s without changing sampling or audio", interpolation => {
    const raw = compileContinuumGroupWorkflow(template(), request, { ...profile, width: 3840, height: 2160 });
    const delivered = compileContinuumGroupWorkflow(template(), request, { ...profile, width: 3840, height: 2160, delivery: { frameInterpolation: interpolation } });
    expect(delivered["12"]).toEqual(raw["12"]);
    expect(delivered["16"].inputs.audio).toEqual(raw["16"].inputs.audio);
    expect(Object.values(raw).some(n => n.class_type === "RIFE VFI")).toBe(false);
    const branch = Object.values(delivered).find(n => n.class_type === "ComfySwitchNode")!;
    expect(branch.inputs.on_false).toEqual(raw["16"].inputs.images);
    expect(delivered["16"].inputs.images).not.toEqual(raw["16"].inputs.images);
    expect(Object.values(delivered).find(n => n.class_type === "RIFE VFI")!.inputs.multiplier).toBe(interpolation === "rife2x" ? 2 : 4);
  });
  it("keeps Triton Sage and Spectrum in the frozen graph without silently selecting CUDA or SDPA", () => {
    const graph = compileContinuumGroupWorkflow(template(), request, { ...profile, attention: "sage-triton", spectrumMode: "balanced" });
    expect(graph["5"].class_type).toBe("LocalVideoStudioH3ManagedSageAttention");
    expect(graph["5"].inputs).toMatchObject({ sage_attention: "sageattn_qk_int8_pv_fp16_triton", allow_compile: true, model: ["30", 0] });
    const [id, spectrum] = Object.entries(graph).find(([, n]) => n.class_type === "SpectrumApplyMiniMaxH3")!;
    expect(spectrum.inputs.model).toEqual(["5", 0]);
    expect(graph["12"].inputs.model).toEqual([id, 0]);
    expect(graph["7"].inputs.model).toEqual([id, 0]);
  });
  it("applies the frozen optional Spectrum choice to both consumers without changing its input profile", () => {
    const frozen = { ...profile, spectrumMode: "balanced" as const };
    const before = structuredClone(frozen);
    const graph = compileContinuumGroupWorkflow(template(), request, frozen);
    const entry = Object.entries(graph).find(([, node]) => node.class_type === "SpectrumApplyMiniMaxH3")!;
    expect(entry).toBeDefined();
    expect(graph["12"].inputs.model).toEqual([entry[0], 0]);
    expect(graph["7"].inputs.model).toEqual([entry[0], 0]);
    expect(entry[1].inputs).toMatchObject({ enabled: true, model: ["5", 0], offline_smoothing_replay: false });
    expect(frozen).toEqual(before);
    expect(Object.values(compileContinuumGroupWorkflow(template(), request, profile)).some(n => n.class_type === "SpectrumApplyMiniMaxH3")).toBe(false);
  });
  it("derives a separate new-Run graph and freezes the complete layout and original first image", () => {
    const source = template(), original = JSON.stringify(source);
    const first = compileContinuumGroupWorkflow(source, request, profile);
    expect(JSON.stringify(source)).toBe(original);
    expect(first["24"].class_type).toBe("LocalVideoStudioH3ContinuumGroupReceipt");
    expect(first["24"].inputs.expected_prefix_chunks).toBe(0);
    expect(first["12"].inputs.control_after_generate).toBeUndefined();
    expect(first["12"].inputs).toMatchObject({ chunks: 2, chunk_seconds: 5, run_name: "new-run", sequence_prompt: JSON.stringify(profile.prompts), first_frame: ["8", 0], generation_mode: "Review Each Chunk" });
    const next = compileContinuumGroupWorkflow(source, { ...request, step_id: "step-2", expected_prefix_chunks: 1, expected_parent_revision_id: "actual-head" }, profile);
    expect(next["12"]).toEqual(first["12"]);
    expect(next["24"].inputs.expected_parent_revision_id).toBe("actual-head");
    expect(next["5"].class_type).toBe("LocalVideoStudioH3ManagedSageAttention");
    expect(next["5"].inputs.allow_compile).toBe(true);
    expect(next["30"].inputs.model).toEqual(["1", 0]);
  });
  it("retains an explicit no-LoRA/SDPA path and never sends an empty first image", () => {
    const graph = compileContinuumGroupWorkflow(template(), request, { ...profile, attention: "sdpa", lora: undefined, firstImage: undefined });
    expect(graph["30"]).toBeUndefined(); expect(graph["5"]).toBeUndefined(); expect(graph["8"]).toBeUndefined();
    expect(graph["12"].inputs.first_frame).toBeUndefined();
    expect(graph["12"].inputs.model).toEqual(["1", 0]);
    expect(graph["7"].inputs.model).toEqual(["1", 0]);
  });
  it("rejects an unbound continuation, illegal layout and implicit missing prompts", () => {
    expect(() => compileContinuumGroupWorkflow(template(), { ...request, expected_prefix_chunks: 1 }, profile)).toThrow(/prefix/);
    expect(() => compileContinuumGroupWorkflow(template(), { ...request, planned_chunks: 17 }, profile)).toThrow();
    expect(() => compileContinuumGroupWorkflow(template(), request, { ...profile, prompts: ["Only one"] })).toThrow();
  });
  it.each(["guard", "busy"])("blocks submission before GPU work when %s is unavailable", async failure => {
    const graph = compileContinuumGroupWorkflow(template(), request, profile);
    const schema = Object.fromEntries(Object.values(graph).map(node => [node.class_type, { input: { required: Object.fromEntries(Object.keys(node.inputs).map(key => [key, ["STRING"]])) } }]));
    Object.assign(schema.LocalVideoStudioH3ContinuumGroupReceipt.input, { optional: failure === "guard" ? {} : { expected_prefix_chunks: ["INT"], expected_parent_revision_id: ["STRING"], sampling_evidence_version: ["INT"] } });
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async url => new Response(JSON.stringify(String(url).endsWith("/object_info") ? schema : { queue_running: ["occupied"], queue_pending: [] })));
    await expect(submitContinuumGroup(createDefaultSettings(), templatePath.pathname.replace(/^\/(\w:)/, "$1"), request, profile, new AbortController().signal)).rejects.toThrow(failure === "guard" ? /guard/ : /idle/);
    expect(fetch.mock.calls.every(([url]) => !String(url).endsWith("/prompt"))).toBe(true);
  });
});
