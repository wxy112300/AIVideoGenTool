import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { createNativeTranslator } from "../electron/ui-translator.js";
import { imageModelAdapters } from "../src/core/image-workflow/registry.js";
import { createDefaultImageEditDraft } from "../src/core/defaults.js";
import { imageTaskFromDraft } from "../src/core/queue-task-factory.js";
import { validateH3ComfyWorkflow } from "../src/core/h3-workflow-contract.js";
import { imageLoraConfigurationError } from "../src/core/image-loras.js";
import { imageAspectRatioOptionsFor, imageResolutionOptionsFor } from "../src/core/image-workflow/shared.js";
import type { ImageLoraSelection, ImageReference } from "../src/types.js";
import type { ImageGenerationQueueTask } from "../src/types.js";
import { submitImageTask } from "../electron/services/comfy-ui.js";

afterEach(() => vi.unstubAllGlobals());

function picture(): ImageReference {
  return { id: "base", pictureNumber: 1, absolutePath: "使用者/底圖.png", width: 1024, height: 1024,
    mask: { documentPath: "使用者/mask.json", maskPath: "使用者/mask.png", revision: 1, regionCount: 1, updatedAt: "2026-11-03T00:00:00Z" } };
}
it.each(Object.values(imageModelAdapters))("preserves $id prompts, graphs and validation decisions across all languages", adapter => {
  const draft = createDefaultImageEditDraft();
  draft.modelId = adapter.id; draft.qualityProfile = adapter.qualityProfiles[0]!.id;
  draft.format = adapter.supportedFormats[0]!;
  draft.pictures = adapter.supportsTextOnly ? [] : [picture()];
  draft.promptVersions[0]!.text = adapter.requiresPrompt === false ? "" : draft.pictures.length
    ? "保留 Picture 1 的招牌「春日」與对白。" : 'A sign reading "春日" beside a tea shop.';
  const task = imageTaskFromDraft(draft, undefined, { root: "", directory: "", subfolder: "Images" });
  const before = structuredClone(task), run = task.runs[0]!;
  const graph = adapter.buildWorkflow(task, run);
  const compiled = adapter.compilePrompt(task.prompt, task.pictures);
  const missing = adapter.validateWorkflow({}, task.qualityProfile, true);
  for (const locale of ["zh-CN", "en-US", "zh-TW"] as const) {
    const t = createNativeTranslator(locale).t;
    expect(adapter.compilePrompt(task.prompt, task.pictures, t)).toEqual(compiled);
    expect(adapter.buildWorkflow(task, run, t)).toEqual(graph);
    expect(adapter.validateWorkflow(graph, task.qualityProfile, true, undefined, t))
      .toEqual(adapter.validateWorkflow(graph, task.qualityProfile, true));
    const errors = adapter.validateWorkflow({}, task.qualityProfile, true, undefined, t);
    expect(errors.length).toBe(missing.length); expect(errors.length).toBeGreaterThan(0);
    if (locale === "en-US") expect(errors.join(" ")).not.toMatch(/\p{Script=Han}/u);
    const schema = adapter.validateRuntimeSchema?.(graph, {}, t);
    if (schema) { expect(schema.length).toBeGreaterThan(0); if (locale === "en-US") expect(schema.join(" ")).not.toMatch(/\p{Script=Han}/u); }
  }
  expect(task).toEqual(before);
});

it.each([
  "minimax_h3_fl2va_first_pass_av_api.json",
  "minimax_h3_fl2va_second_sample_av_api.json",
  "minimax_h3_fl2va_learned_3d_second_sample_av_api.json",
  "minimax_h3_fl2va_ultimate_tiled_second_sample_av_api.json",
  "minimax_h3_continuum_v38_extend_api.json",
  "minimax_h3_continuum_v38_managed_extend_api.json"
])("keeps %s static graph and rejection rules identical in three languages", filename => {
  const graph = JSON.parse(readFileSync("workflows/" + filename, "utf8"));
  const before = structuredClone(graph), baseline = validateH3ComfyWorkflow(graph);
  expect(baseline.valid).toBe(true);
  for (const locale of ["zh-CN", "en-US", "zh-TW"] as const) {
    const t = createNativeTranslator(locale).t;
    expect(validateH3ComfyWorkflow(graph, t)).toEqual(baseline);
    const broken = structuredClone(graph) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    const saver = Object.values(broken).find(node => node.class_type === "LocalVideoStudioH3SaveJointAV");
    if (saver) saver.inputs.filename = "使用者/invalid.safetensors";
    else {
      const sampler = Object.values(broken).find(node => node.class_type === "H3ContinuumSamplerV38")!;
      sampler.inputs.run_storage = "unsafe";
    }
    const rejected = validateH3ComfyWorkflow(broken, t), defaultRejected = validateH3ComfyWorkflow(broken);
    expect(rejected.valid).toBe(false); expect(rejected.kind).toBe(defaultRejected.kind);
    expect(rejected.errors.length).toBe(defaultRejected.errors.length);
    if (locale === "en-US") expect(rejected.errors.join(" ")).not.toMatch(/\p{Script=Han}/u);
  }
  expect(graph).toEqual(before);
});

it.each(["en-US", "zh-TW"] as const)("localizes %s reference errors and options while preserving values and raw names", locale => {
  const t = createNativeTranslator(locale).t;
  const qwen = imageModelAdapters["qwen-image-2-1"]!;
  const invalid = { ...picture(), absolutePath: "" };
  const errors = qwen.compilePrompt("Picture 1", [invalid], t).errors;
  expect(errors.join(" ")).toContain(locale === "en-US" ? "has no image" : "尚未新增圖片");
  const ratio = imageAspectRatioOptionsFor(1024, 1024, 0, 0, t);
  const size = imageResolutionOptionsFor(1024, 1024, 0, 0, "source", 8, t);
  expect(ratio.map(({ value }) => value)).toEqual(imageAspectRatioOptionsFor(1024, 1024).map(({ value }) => value));
  expect(size.map(({ value }) => value)).toEqual(imageResolutionOptionsFor(1024, 1024).map(({ value }) => value));
  expect(ratio[0]!.label).toContain(locale === "en-US" ? "Source" : "原圖");
  const lora = { id: "user-lora", name: "使用者LoRA" } as ImageLoraSelection;
  expect(imageLoraConfigurationError([lora], qwen.id, 1, t)).toContain("使用者LoRA");
  expect(imageLoraConfigurationError([lora], qwen.id, 1, t)).toContain(locale === "en-US" ? "not registered" : "尚未登錄");
});

it.each(["en-US", "zh-TW"] as const)("forwards %s from image submission into adapter errors before upload or POST", async uiLocale => {
  const request = vi.fn(async () => Response.json({})); vi.stubGlobal("fetch", request);
  const task = { modelId: "qwen-image-2-1", prompt: "Picture 1", pictures: [{ ...picture(), absolutePath: "" }] } as ImageGenerationQueueTask;
  const { createDefaultState } = await import("../src/core/defaults.js");
  await expect(submitImageTask(task, { id: "run", index: 0, seed: 42, status: "waiting" },
    { ...createDefaultState().settings, uiLocale }, new AbortController().signal))
    .rejects.toThrow(uiLocale === "en-US" ? "has no image" : "尚未新增圖片");
  expect(request).toHaveBeenCalledOnce();
});
