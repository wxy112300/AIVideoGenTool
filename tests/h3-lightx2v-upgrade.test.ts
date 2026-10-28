import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createDefaultDraft } from "../src/core/defaults";
import { modelCatalog } from "../src/core/catalog";
import { normalizeVideoDraft } from "../src/core/video-draft-normalization";
import {
  BUILTIN_VIDEO_LORAS, H3_TURBO_LORA, H3_TURBO_8STEP_V1_LORA, H3_REF2V_TURBO_LORA,
  normalizeVideoLoras, normalizeHistoryVideoLoras, videoLorasForCreation
} from "../src/core/video-loras";
import { applyMiniMaxH3Ref2vTurboSampling, workflowSupportsH3TurboSampling } from "../src/core/workflow";
import { normalizeVideoSteps, resolveVideoGenerationPolicy } from "../src/core/video-policy";

const cases = [
  { current: H3_TURBO_LORA, old: "minimax_h3_fl2v_turbo_4step_v1.2_768p_comfyui_bf16.safetensors", modelId: "minimax_h3_fl2va", steps: 4, videoShift: 6, oldSampler: "euler", oldShift: 6 },
  { current: H3_TURBO_8STEP_V1_LORA, old: "minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors", modelId: "minimax_h3_fl2va", steps: 8, videoShift: 6, oldSampler: "er_sde", oldShift: 12 },
  { current: H3_REF2V_TURBO_LORA, old: "minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors", modelId: "minimax_h3_ref2va", steps: 4, videoShift: 12, oldSampler: "euler", oldShift: 12 }
] as const;
type Graph = Record<string, { class_type?: string; inputs?: Record<string, unknown> }>;
function graph(): Graph {
  return JSON.parse(readFileSync(new URL("../workflows/minimax_h3_fl2va_turbo_api.json", import.meta.url), "utf8"));
}

describe("LightX2V weight replacement", () => {
  it.each(cases)("replaces the active $current.name entry without accepting its old file as ready", ({ current, old }) => {
    expect(BUILTIN_VIDEO_LORAS.filter(lora => lora.id === current.id)).toHaveLength(1);
    const component = modelCatalog.get(current.id)!.definition.scan.components[0]!;
    expect(component.patterns.some(pattern => pattern.test(`loras/${old}`))).toBe(false);
    expect(component.patterns.some(pattern => pattern.test(`loras/${current.filename}`))).toBe(true);
    expect(component.installGuide?.downloadUrl).toContain("/30f485ed874aa44c8183348ad361c5eabad318da/");
  });

  it.each(cases)("upgrades creation only and preserves queued/history $current.id filenames and strength", ({ current, old, modelId }) => {
    const snapshot = { ...current, filename: `MiniMax-H3/${old}`, strength: current === H3_TURBO_LORA ? 1 : 0.75 };
    const before = structuredClone(snapshot);
    expect(normalizeVideoLoras([snapshot])[0]).toMatchObject({ filename: before.filename, strength: before.strength });
    expect(normalizeHistoryVideoLoras([snapshot])[0]).toMatchObject({ filename: before.filename, strength: before.strength });
    const draft = normalizeVideoDraft({ ...createDefaultDraft(), modelId, videoLoras: [snapshot] });
    expect(draft.videoLoras[0]).toMatchObject({ filename: current.filename, strength: 1 });
    expect(videoLorasForCreation([{ ...snapshot, strength: 0.6 }])[0]!.strength).toBe(0.6);
    expect(videoLorasForCreation([{ ...snapshot, filename: "custom/my-conversion.safetensors" }])[0]!.filename)
      .toBe("custom/my-conversion.safetensors");
    expect(snapshot).toEqual(before);
  });

  it.each(cases)("uses the new recipe and retains the old queued $current.id recipe", ({ current, old, modelId, steps, videoShift, oldSampler, oldShift }) => {
    const task = { taskType: "generation" as const, modelId, videoLoras: [{ ...current, filename: `MiniMax-H3/${current.filename}` }] };
    const currentGraph = graph();
    if (current === H3_REF2V_TURBO_LORA) {
      currentGraph["reference"] = { class_type: "MiniMaxH3ReferenceToVideo", inputs: {} };
    }
    const templateBefore = structuredClone(currentGraph);
    expect(workflowSupportsH3TurboSampling(currentGraph, { ...task, applySamplingRecipe: true })).toBe(true);
    expect(currentGraph).toEqual(templateBefore);
    applyMiniMaxH3Ref2vTurboSampling(currentGraph, task);
    expect(currentGraph["7"]!.inputs!.sampler_name).toBe("euler");
    expect(currentGraph["8"]!.inputs!.scheduler).toBe("simple");
    expect(currentGraph["21"]!.inputs).toMatchObject({ shift_video: videoShift, shift_audio: 3 });
    expect(workflowSupportsH3TurboSampling(currentGraph, task)).toBe(true);
    if (current === H3_REF2V_TURBO_LORA) {
      const missingReference = structuredClone(currentGraph);
      delete missingReference["reference"];
      expect(workflowSupportsH3TurboSampling(missingReference, task)).toBe(false);
    }
    currentGraph["8"]!.inputs!.scheduler = "beta";
    expect(workflowSupportsH3TurboSampling(currentGraph, task)).toBe(false);
    const policy = resolveVideoGenerationPolicy({ ...task, inputMode: "image" });
    expect(policy.steps.options).toEqual([steps]);
    expect(normalizeVideoSteps(6, policy)).toBe(steps);

    const oldTask = { ...task, videoLoras: [{ ...current, filename: old, strength: 0.75 }] };
    const oldGraph = graph();
    applyMiniMaxH3Ref2vTurboSampling(oldGraph, oldTask);
    expect(oldGraph["7"]!.inputs!.sampler_name).toBe(oldSampler);
    expect(oldGraph["8"]!.inputs!.scheduler).toBe("beta");
    expect(oldGraph["21"]!.inputs).toMatchObject({ shift_video: oldShift, shift_audio: 3 });
  });
});
