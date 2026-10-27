import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compileContinuumGroupWorkflow, type ContinuumGroupProfile } from "../src/core/long-video/group-workflow";
import type { ContinuumGroupRequest } from "../src/core/long-video/group-checkpoint";
import { submitContinuumGroup } from "../electron/services/long-video-continuum";
import { createDefaultSettings } from "../src/core/defaults";

const templatePath = new URL("../workflows/minimax_h3_continuum_v38_managed_extend_api.json", import.meta.url);
const template = () => JSON.parse(readFileSync(templatePath, "utf8"));
const request: ContinuumGroupRequest = { execution_id: "execution", step_id: "step-1", attempt_id: "attempt-1", project_id: "project", run_name: "new-run", planned_chunks: 2, expected_prefix_chunks: 0, expected_parent_revision_id: "" };
const profile: ContinuumGroupProfile = { diffusionModel: "model.safetensors", textEncoder: "clip.safetensors", videoVae: "vae.safetensors", width: 512, height: 512, seed: 42, steps: 8, sampler: "euler", scheduler: "simple", chunkSeconds: 5, prompts: ["First action", "Second action"], firstImage: "first.png", attention: "sage", lora: { filename: "turbo.safetensors", strength: 1 } };
afterEach(() => vi.restoreAllMocks());

describe("internal Continuum group adapter", () => {
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
