import { describe, expect, it } from "vitest";
import { createDefaultImageEditDraft, createDefaultState } from "../src/core/defaults";
import { imageTaskFromDraft } from "../src/core/queue-task-factory";
import { modelCatalog } from "../src/core/catalog";
import { imageModelAdapterFor, imageModelCapabilityFor } from "../src/core/image-workflow";
import { compileMossImagePrompt, validateMossImageRuntimeSchema } from "../src/core/image-workflow/moss-image";
import { MOSS_IMAGE_ID, MOSS_NSFW_ID, MOSS_IMAGE_MODEL, MOSS_NSFW_MODEL, MOSS_TEXT_ENCODER } from "../src/core/moss-image-spec";
import { imageEditPromptContractForTarget } from "../src/core/image-prompt";
import { createDefaultQwenImagePromptPresets } from "../src/core/prompts/qwen-image-edit/content";
import { normalizeMultimodalPromptOutput } from "../electron/services/multimodal-prompt";
import { buildStrataPromptRequest } from "../electron/services/strata-prompt";
import { extractImageEditPromptFromWriter } from "../electron/services/h3-prompt-writer";

const layout = '{"caption":"A sign reading 春日","objects":[{"text":"春日  茶会","bbox":[0.1,0.1,0.8,0.4]}]}';
function task(modelId = MOSS_IMAGE_ID) {
  const draft = createDefaultImageEditDraft();
  Object.assign(draft, { modelId, qualityProfile: "comfy-25", pictures: [], aspectRatio: "16:9", targetResolution: 1080, seed: 42, outputCount: 2 });
  draft.promptVersions[0]!.text = layout;
  return imageTaskFromDraft(draft, undefined, { root: "C:/fixture", directory: "C:/fixture/Images", subfolder: "Images" });
}
describe("MOSS image integration", () => {
  it.each([MOSS_IMAGE_ID, MOSS_NSFW_ID])("keeps %s text-only, aligned and independent from Qwen editing", id => {
    const queued = task(id), adapter = imageModelAdapterFor(id)!;
    expect(queued.pictures).toEqual([]);
    expect(queued.outputWidth! % 16).toBe(0); expect(queued.outputHeight! % 16).toBe(0);
    expect(queued.runs).toHaveLength(2); expect(queued.runs.every(r => r.seed === 42)).toBe(true);
    expect(imageModelCapabilityFor(id)).toMatchObject({ maxPictures: 0, supportsTextOnly: true, supportsMask: false, supportsMarkup: false });
    const graph = adapter.buildWorkflow(queued, queued.runs[0]!);
    expect(adapter.validateWorkflow(graph)).toEqual([]);
    expect(graph.model?.inputs.unet_name).toBe(id === MOSS_NSFW_ID ? MOSS_NSFW_MODEL : MOSS_IMAGE_MODEL);
    expect(graph.clip?.inputs).toMatchObject({ clip_name: MOSS_TEXT_ENCODER, type: "moss_image" });
    expect(graph.positive?.inputs.text).toBe(layout);
    expect(graph.negative?.inputs.text).toBe("");
    expect(graph.sampler?.inputs).toMatchObject({ steps: 25, cfg: 2.5, sampler_name: "er_sde", scheduler: "simple", model: ["slg", 0] });
    expect(graph.slg?.inputs).toMatchObject({ single_layers: "22", end_percent: 0.5 });
    expect(Object.values(graph).some(n => /Qwen|Lora|SD3|LoadImage/u.test(n.class_type))).toBe(false);
    queued.qualityProfile = "quality-50";
    const qualityGraph = adapter.buildWorkflow(queued, queued.runs[0]!);
    expect(qualityGraph.sampler?.inputs).toMatchObject({ steps: 50, cfg: 3, sampler_name: "euler" });
    expect(qualityGraph.slg?.inputs.end_percent).toBe(1);
  });
  it("rejects references and invalid persisted recipes instead of silently pretending to edit", () => {
    expect(compileMossImagePrompt("edit", [{ id: "p", pictureNumber: 1, absolutePath: "fixture.png", width: 64, height: 64 }]).errors.join()).toContain("仅支持文生图");
    const queued = task(), adapter = imageModelAdapterFor(queued.modelId)!;
    queued.outputWidth = 1080;
    expect(() => adapter.buildWorkflow(queued, queued.runs[0]!)).toThrow("16");
    queued.outputWidth = 1024; queued.qualityProfile = "turbo-8";
    expect(() => adapter.buildWorkflow(queued, queued.runs[0]!)).toThrow("质量档位");
  });
  it("fails early when the core lacks the MOSS loader enum or SLG sockets", () => {
    expect(validateMossImageRuntimeSchema({ clip: { class_type: "CLIPLoader", inputs: { type: "moss_image" } } },
      { CLIPLoader: { input: { required: { type: [["qwen_image"]] } } } }).join()).toContain("不支持 moss_image");
    expect(validateMossImageRuntimeSchema({ slg: { class_type: "SkipLayerGuidanceDiTSimple", inputs: { single_layers: "22" } } }, {}).join()).toContain("升级并重启");
  });
  it("preserves layout text and routes shared enhancement presets to MOSS", () => {
    expect(compileMossImagePrompt(layout, []).prompt).toBe(layout);
    const contract = imageEditPromptContractForTarget(MOSS_IMAGE_ID, "faithful", createDefaultQwenImagePromptPresets().faithful);
    expect(contract).toContain("MOSS-Image"); expect(contract).toContain("JSON"); expect(contract).not.toContain("image-edit instruction");
    const request = { mode: "image-edit" as const, prompt: layout, modelId: "fixture", imageTargetModelId: MOSS_IMAGE_ID };
    expect(normalizeMultimodalPromptOutput(layout, request)).toBe(layout);
    expect(normalizeMultimodalPromptOutput(JSON.stringify({ detailed_description: layout }), request)).toBe(layout);
    expect(() => normalizeMultimodalPromptOutput('{"broken":', request)).toThrow("无效 JSON");
  });
  it("prioritizes the MOSS primary candidate without hiding its derivative or installation identities", () => {
    const ids = modelCatalog.list("image").map(e => e.definition.id);
    expect(ids.slice(0, 4)).toEqual(["qwen-image-2-1", MOSS_IMAGE_ID, MOSS_NSFW_ID, "qwen-image-2-1-turbo"]);
    expect(ids.indexOf(MOSS_IMAGE_ID)).toBeLessThan(ids.indexOf(MOSS_NSFW_ID));
    expect(ids.indexOf(MOSS_NSFW_ID)).toBeLessThan(ids.indexOf("z-image-turbo"));
    for (const id of [MOSS_IMAGE_ID, MOSS_NSFW_ID]) {
      const components = modelCatalog.get(id)!.definition.scan!.components;
      expect(components).toHaveLength(3);
      for (const c of components) {
        expect(c.patterns.some(p => p.test(`C:/fixture/${c.expected}`))).toBe(true);
        expect(c.installGuide?.sha256).toMatch(/^[a-f0-9]{64}$/u);
        expect(c.installGuide?.bytes).toBeGreaterThan(0);
      }
    }
  });
  it("uses the MOSS contract in the actual Strata request and writer extraction", async () => {
    const request = { mode: "image-edit" as const, prompt: layout, modelId: "fixture", imageTargetModelId: MOSS_IMAGE_ID,
      imageEditEnhanceMode: "faithful" as const, imageEditPresetText: createDefaultQwenImagePromptPresets().faithful };
    const payload = await buildStrataPromptRequest(request, createDefaultState().settings, new AbortController().signal);
    const serialized = JSON.stringify(payload);
    expect(serialized).toContain("MOSS-Image"); expect(serialized).not.toContain("Qwen Image 2.1");
    expect(serialized).not.toContain("image-edit instruction");
    expect(extractImageEditPromptFromWriter(`detailed_description: ${layout}`, MOSS_IMAGE_ID)).toBe(layout);
  });
});
