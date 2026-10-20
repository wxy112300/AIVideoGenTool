// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createJourney } from "./harness/create-journey";
import {
  QWEN_IMAGE_21_BFS_HEAD_LORA_ID as id,
  QWEN_IMAGE_21_BFS_HEAD_LORA_FILENAME as filename,
  QWEN_IMAGE_21_BFS_HEAD_PROMPT as prompt
} from "../src/core/catalog/loras/definitions";
import { imageLoraDefinition, imageLoraSelection, imageLoraConfigurationError, imagePromptForLoras } from "../src/core/image-loras";
import { imageTaskFromDraft } from "../src/core/queue-task-factory";
import { createDefaultState } from "../src/core/defaults";
import { buildQwenImage21Workflow, buildQwenImage21GgufWorkflow, buildQwenImage21GgufQ6Workflow, validateQwenImage21Workflow } from "../src/core/image-workflow";
import { modelCatalog } from "../src/core/catalog";
import type { ImageReference } from "../src/types";

const definition = imageLoraDefinition(id)!;
const picture = (number: number): ImageReference => ({
  id: `bfs-picture-${number}`, pictureNumber: number,
  absolutePath: `C:/fixture/bfs-${number}.png`, width: 1024, height: 1024
});
let journey: Awaited<ReturnType<typeof createJourney>> | undefined;
// jsdom omits CSS.escape; fixture IDs contain only CSS-safe ASCII characters.
beforeEach(() => vi.stubGlobal("CSS", { escape: (value: string) => value }));
afterEach(async () => { journey?.dispose(); journey = undefined; await new Promise(resolve => setTimeout(resolve, 370)); vi.unstubAllGlobals(); });
const settle = () => new Promise(resolve => setTimeout(resolve, 10));

describe("BFS Qwen Image 2.1 head swap", () => {
  it("detects only the matching weight and exposes pinned download identity and all localized guides", () => {
    const component = definition.scan.components[0]!;
    expect(component.patterns.some(pattern => pattern.test(`models/loras/${filename}`))).toBe(true);
    expect(component.patterns.some(pattern => pattern.test(`models\\loras\\${filename}`))).toBe(true);
    for (const wrong of ["bfs_head_v1_qwen_2.1.safetensors", "bfs_head_v5_2511_original.safetensors", "bfs_head_v1_flux-klein_4b.safetensors"]) {
      expect(component.patterns.some(pattern => pattern.test(`loras/${wrong}`))).toBe(false);
    }
    expect(component.installGuide).toMatchObject({
      revision: "0ca3913ade4b4ada458d60c232354e8586c4c181", bytes: 260096144,
      sha256: "d1d748d5601077f3b6d05766f6823510e901970d916afa404a97e85dc92fa88e", license: "MIT"
    });
    for (const locale of ["zh-CN", "zh-TW", "en-US"] as const) {
      expect(modelCatalog.localized(id, locale)?.description).toContain("Picture 1");
      expect(modelCatalog.localized(id, locale)?.description).toContain("Picture 2");
    }
    expect(imageLoraConfigurationError([imageLoraSelection(definition)], "qwen-image-2-1-turbo", 2)).toContain("不兼容");
    expect(imageLoraConfigurationError([imageLoraSelection(definition)], "qwen-image-edit-2511", 2)).toContain("不兼容");
  });

  it.each([
    ["qwen-image-2-1", buildQwenImage21Workflow],
    ["qwen-image-2-1-uncensored-gguf", buildQwenImage21GgufWorkflow],
    ["qwen-image-2-1-uncensored-gguf-q6", buildQwenImage21GgufQ6Workflow]
  ] as const)("freezes the ordered references and routes BFS before the cache for %s", (modelId, build) => {
    const draft = createDefaultState().imageDraft;
    Object.assign(draft, { modelId, qualityProfile: "preview-25", pictures: [picture(1), picture(2)], imageLoras: [imageLoraSelection(definition)] });
    draft.promptVersions[0]!.text = prompt;
    const task = imageTaskFromDraft(draft, undefined, { root: "C:/fixture", directory: "C:/fixture/Images", subfolder: "Images" });
    draft.pictures.reverse();
    draft.imageLoras[0]!.strength = 0.2;
    draft.promptVersions[0]!.text = "Another edit";
    const graph = build(task, task.runs[0]!);
    expect(task.pictures.map(value => value.id)).toEqual(["bfs-picture-1", "bfs-picture-2"]);
    expect(task.prompt).toBe(prompt);
    expect(graph.imageLora).toMatchObject({ class_type: "LoraLoaderModelOnly", inputs: { model: ["model", 0], lora_name: filename, strength_model: 1 } });
    expect(graph.cache?.inputs.model).toEqual(["imageLora", 0]);
    expect(graph.positive?.inputs["images.image_1"]).toEqual(["image-bfs-picture-1", 0]);
    expect(graph.positive?.inputs["images.image_2"]).toEqual(["image-bfs-picture-2", 0]);
    expect(graph.positive?.inputs.prompt).toBe(prompt);
    expect(graph.apg).toBeUndefined();
    if (modelId === "qwen-image-2-1") expect(validateQwenImage21Workflow(graph, "preview-25", true)).toEqual([]);
    expect(() => build({ ...task, pictures: [picture(1)] }, task.runs[0]!)).toThrow("不存在的 Picture 2");
    expect(imageLoraConfigurationError(task.imageLoras, modelId, 1)).toContain("Picture 2 为参考人脸/头部");
    expect(() => build({ ...task, pictures: [picture(1), picture(2), picture(3)] }, task.runs[0]!)).toThrow("需要正好 2 张 Picture");
    expect(imagePromptForLoras("Keep the smile.", task.imageLoras)).toBe("head_swap: Keep the smile.");
    expect(imagePromptForLoras(prompt, task.imageLoras)).toBe(prompt);
  });

  it("recovers from a missing weight and missing face, then clicks the real enqueue control", async () => {
    const h = journey = await createJourney();
    h.scan.modelProfiles.push({ id: "qwen-image-2-1", name: "Qwen 2.1", category: "image", available: true, integrated: true, components: [], missingCustomNodeIds: [], missingCustomNodeNames: [] } as typeof h.scan.modelProfiles[number]);
    h.coordinator.patchImageDraft({ modelId: "qwen-image-2-1", qualityProfile: "preview-25", pictures: [picture(1)] });
    h.setMode("image-edit");
    expect(h.element<HTMLSelectElement>("#image-lora-to-add").querySelector(`option[value="${id}"]`)).toBeNull();
    h.scan.modelProfiles.push({ id, name: definition.name, category: "lora", available: true, integrated: true, components: [{ matches: [`C:/fixture/models/loras/${filename}`] }] } as typeof h.scan.modelProfiles[number]);
    h.render();
    h.input("#image-lora-to-add", id, "change");
    h.element("#add-image-lora").click(); await settle();
    expect(h.element<HTMLTextAreaElement>("#image-edit-prompt-input").value).toBe(prompt);
    expect(h.root.textContent).toContain("Picture 2 为参考人脸/头部");
    expect(h.element("#enqueue-image-edit").disabled).toBe(true);
    h.element("#enqueue-image-edit").click(); await settle();
    expect(h.application.enqueueImageEdit).not.toHaveBeenCalled();
    h.coordinator.patchImageDraft({ pictures: [picture(1), picture(2)] }); h.render();
    expect(h.element("#enqueue-image-edit").disabled).toBe(false);
    h.element("#enqueue-image-edit").click(); await settle();
    expect(h.application.enqueueImageEdit).toHaveBeenCalledOnce();
    expect(h.state().queue[0]).toMatchObject({ id: expect.any(String), prompt, imageLoras: [{ id, strength: 1 }] });
    h.input("#image-edit-prompt-input", "Keep the expression.");
    expect(h.state().queue[0]?.prompt).toBe(prompt);
    h.coordinator.patchImageDraft({ pictures: [{ ...picture(1), markup: { documentPath: "guide.json", renderedPath: "guide.png", revision: 1, objectCount: 1, summary: "A", updatedAt: "2026-10-20" } }, picture(2)] }); h.render();
    expect(h.element("#enqueue-image-edit").disabled).toBe(true);
    h.coordinator.patchImageDraft({ pictures: [picture(1), picture(2)] }); h.render();
    h.element(`[data-remove-image-lora="${id}"]`).click(); await settle();
    h.input("#image-lora-to-add", id, "change"); h.element("#add-image-lora").click(); await settle();
    expect(h.element<HTMLTextAreaElement>("#image-edit-prompt-input").value).toBe("Keep the expression.");
  });
});
