// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createJourney } from "./harness/create-journey";
import { estimatePromptTextTokens } from "../src/core/prompt-token-estimate";

let journey: Awaited<ReturnType<typeof createJourney>> | undefined;
beforeEach(() => vi.stubGlobal("CSS", { escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/gu, character => `\\${character}`) }));
afterEach(async () => { journey?.dispose(); journey = undefined; await new Promise(r => setTimeout(r, 370)); vi.unstubAllGlobals(); });
const settle = () => new Promise(r => setTimeout(r, 0));

describe("image editor actual controls (synthetic external ports)", () => {
  it("deletes Slot 1, promotes the remaining reference, and allows deleting the last slot", async () => {
    const h = journey = await createJourney();
    h.coordinator.patchImageDraft({ modelId: "qwen-image-2-1", pictures: [
      { id: "base", pictureNumber: 1, absolutePath: "base.png", width: 1280, height: 720, role: "base" },
      { id: "ref", pictureNumber: 2, absolutePath: "ref.png", width: 640, height: 640, role: "style" }
    ] }); h.setMode("image-edit");
    h.input("#image-edit-prompt-input", "Use Picture 2 as the style.");
    h.element('[data-remove-image-picture="base"]').click(); await settle();
    expect(h.state().imageDraft.pictures).toMatchObject([{ id: "ref", pictureNumber: 1, role: "base", absolutePath: "ref.png" }]);
    expect(h.state().imageDraft.promptVersions[h.state().imageDraft.activePromptVersion].text).toContain("Picture 1");
    expect(document.querySelector('[data-remove-image-picture="base"]')).toBeNull();
    h.element('[data-remove-image-picture="ref"]').click(); await settle();
    expect(h.state().imageDraft.pictures).toEqual([]);
    expect(document.querySelector('[data-remove-image-picture]')).toBeNull();
    expect(h.element("#image-picture-drop-zone")).toBeTruthy();
  });
  it("keeps references optional for text-to-image and uses the selected locale for quality and word count", async () => {
    const h = journey = await createJourney({}, "en-US");
    h.coordinator.patchImageDraft({ modelId: "qwen-image-2-1", pictures: [], qualityProfile: "native" }); h.setMode("image-edit");
    expect(h.element(".image-picture-empty").textContent).toContain("optional");
    expect(h.element("#image-edit-quality").textContent).toContain("Official native");
    expect(h.element('#image-edit-model option[value="qwen-image-2-1"]').textContent).toContain("official T2I/editing");
    h.input("#image-edit-prompt-input", "A small garden");
    expect(h.element("#image-prompt-word-counter").textContent).toBe("3 words");
  });
  it("keeps quick sizes and free custom input separate while updating count and Seed in place", async () => {
    const h = journey = await createJourney();
    h.coordinator.patchImageDraft({ modelId: "qwen-image-2-1", pictures: [
      { id: "base", pictureNumber: 1, absolutePath: "base.png", width: 1280, height: 720 }
    ] }); h.setMode("image-edit");
    const editor = h.element("#image-edit-prompt-input-rich"), slider = h.element<HTMLInputElement>("[data-image-resolution-slider]");
    expect([...h.root.querySelectorAll<HTMLElement>("[data-image-resolution]")].map(button => button.dataset.imageResolution)).toEqual(["source", "720", "1024", "1080", "1536", "2160"]);
    h.element('[data-image-resolution="1024"]').click();
    expect(h.state().imageDraft.targetResolution).toBe(1024);
    expect(h.element("[data-image-custom-resolution-panel]").hidden).toBe(true);
    h.element("[data-image-custom-resolution]").click();
    expect(h.element("[data-image-custom-resolution-panel]").hidden).toBe(false);
    h.input("[data-image-resolution-slider]", "800");
    expect(h.state().imageDraft.targetResolution).toBe(800);
    expect(slider.value).toBe("800");
    expect(h.element('[data-image-custom-resolution]').getAttribute("aria-pressed")).toBe("true");
    h.input("[data-image-resolution-number]", "1000", "change");
    expect(h.state().imageDraft.targetResolution).toBe(992);
    h.input("#image-edit-aspect-ratio", "1:1", "change");
    expect(h.element("[data-image-output-dimensions]").textContent).toBe("992 × 992");
    h.input("[data-image-count-number]", "4", "change");
    expect(h.state().imageDraft.outputCount).toBe(4);
    expect(h.element("[data-image-submit-summary]").textContent).toContain("4 张");
    h.element("#random-image-edit-seed").click(); expect(h.state().imageDraft.seed).not.toBeNull();
    h.element("#clear-image-edit-seed").click(); expect(h.state().imageDraft.seed).toBeNull();
    expect(h.element("#image-edit-prompt-input-rich")).toBe(editor);
    expect(h.element("[data-image-resolution-slider]")).toBe(slider);
  });
  it.each(["lama-inpaint", "birefnet-background-removal"])("keeps %s free of sampling, Seed, resolution and LoRA controls", async modelId => {
    const h = journey = await createJourney(); h.coordinator.patchImageDraft({ modelId }); h.setMode("image-edit");
    expect(document.querySelector("#image-edit-seed")).toBeNull();
    expect(document.querySelector("[data-image-resolution-slider]")).toBeNull();
    expect(document.querySelector("#image-edit-count")).toBeNull();
    expect(document.querySelector("#image-lora-menu-trigger")).toBeNull();
    expect(h.element<HTMLSelectElement>("#image-edit-quality").closest("label")?.hidden).toBe(true);
  });
  it("restores a free size as Custom and keeps its queued canvas frozen", async () => {
    const h = journey = await createJourney();
    h.scan.modelProfiles.push({ id: "qwen-image-2-1", name: "Qwen", category: "image", available: true, integrated: true,
      components: [], missingCustomNodeIds: [], missingCustomNodeNames: [] } as typeof h.scan.modelProfiles[number]);
    h.coordinator.patchImageDraft({ modelId: "qwen-image-2-1", pictures: [], targetResolution: 832, aspectRatio: "1:1" });
    h.setMode("image-edit");
    expect(h.element("[data-image-custom-resolution-panel]").hidden).toBe(false);
    expect(h.element<HTMLInputElement>("[data-image-resolution-number]").value).toBe("832");
    h.input("#image-edit-prompt-input", "A ceramic cup.");
    h.element("#enqueue-image-edit").click();
    await new Promise(r => setTimeout(r, 10));
    expect(h.state().queue[0]).toMatchObject({ targetResolution: 832, outputWidth: 832, outputHeight: 832 });
    h.input("[data-image-resolution-slider]", "848");
    expect(h.state().imageDraft.targetResolution).toBe(848);
    expect(h.state().queue[0]).toMatchObject({ targetResolution: 832, outputWidth: 832 });
  });
  it("clears reference content while retaining Slot identity and inserts repeatedly from the image menu", async () => {
    const h = journey = await createJourney();
    h.coordinator.patchImageDraft({ modelId: "qwen-image-2-1", pictures: [
      { id: "base", pictureNumber: 1, absolutePath: "base.png", width: 1280, height: 720 },
      { id: "reference", pictureNumber: 2, absolutePath: "reference.png", width: 720, height: 1280,
        contentHash: "a".repeat(64), originalPath: "original.png", managedRelativePath: "references/reference.png" }
    ] }); h.setMode("image-edit");
    h.input("#image-edit-prompt-input", "Use Picture 2 for the background.");
    h.element('[data-clear-image-picture="reference"]').click(); await settle();
    expect(h.state().imageDraft.pictures[1]).toMatchObject({ id: "reference", pictureNumber: 2, absolutePath: "", width: 0, height: 0 });
    expect(h.state().imageDraft.pictures[1]?.contentHash).toBeUndefined();
    expect(h.state().imageDraft.pictures[1]?.originalPath).toBeUndefined();
    expect(h.element<HTMLTextAreaElement>("#image-edit-prompt-input").value).toContain("Picture 2");
    h.element("#image-prompt-insert-trigger").click();
    const menu = document.querySelector<HTMLElement>("#create-prompt-insert-menu")!;
    const item = menu.querySelector<HTMLButtonElement>("[data-prompt-snippet]")!;
    item.click(); const first = h.element<HTMLTextAreaElement>("#image-edit-prompt-input").value;
    item.click(); expect(h.element<HTMLTextAreaElement>("#image-edit-prompt-input").value.length).toBeGreaterThan(first.length);
    expect(menu.hidden).toBe(false);
    const search = menu.querySelector<HTMLInputElement>('input[type=search]')!;
    search.value = "no-such-instruction"; search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(menu.querySelector<HTMLElement>('p[role=status]')!.hidden).toBe(false);
  });
  it.each(["moss-image-sft", "moss-image-pornmaster"])("recovers missing prompt and submits %s through the visible controls", async modelId => {
    const h = journey = await createJourney();
    h.scan.modelProfiles.push({ id: modelId, name: modelId, category: "image", available: true, integrated: true,
      components: [], missingCustomNodeIds: [], missingCustomNodeNames: [] } as typeof h.scan.modelProfiles[number]);
    h.coordinator.patchImageDraft({ modelId, qualityProfile: "comfy-25", pictures: [], seed: 42, outputCount: 2 });
    h.setMode("image-edit");
    expect(h.element("#enqueue-image-edit").disabled).toBe(true);
    expect(document.querySelector("#image-picture-drop-zone")).toBeNull();
    expect(document.querySelector(".image-picture-empty")).toBeNull();
    expect(document.querySelector("#image-edit-instruction")).toBeNull();
    const editor = h.element<HTMLTextAreaElement>("#image-edit-prompt-input");
    editor.focus(); h.input("#image-edit-prompt-input", 'A ceramic teapot beside a sign reading "春日".');
    expect(document.activeElement).toBe(h.element("#image-edit-prompt-input-rich"));
    expect(h.element("#enqueue-image-edit").disabled).toBe(false);
    h.element("#enqueue-image-edit").click(); await new Promise(r => setTimeout(r, 10));
    const queued = h.state().queue[0];
    expect(queued?.id).toBeTruthy();
    expect(queued).toMatchObject({ modelId, taskType: "image-generation", qualityProfile: "comfy-25", pictures: [] });
    h.input("#image-edit-prompt-input", "Another scene.");
    expect(queued?.prompt).toContain("ceramic teapot");
  });
  it("clears content without changing model/steps, updates token estimate in place and recovers enqueue", async () => {
    const h = journey = await createJourney();
    h.scan.modelProfiles.push({ id: "qwen-image-2-1", name: "Qwen 2.1", category: "image",
      available: true, integrated: true, components: [], missingCustomNodeIds: [], missingCustomNodeNames: [] } as typeof h.scan.modelProfiles[number]);
    h.coordinator.patchImageDraft({ modelId: "qwen-image-2-1", qualityProfile: "native", seed: 13,
      projectId: "source-project", parentVersionId: "source-version", outputCount: 2 });
    h.setMode("image-edit");
    h.input("#image-edit-prompt-input", "Remove the watermark.");
    const quality = h.state().imageDraft.qualityProfile;
    h.element("#clear-image-edit-draft").click(); await settle();
    expect(h.state().imageDraft).toMatchObject({ modelId: "qwen-image-2-1", qualityProfile: quality, seed: 13, outputCount: 2 });
    expect(h.state().imageDraft.projectId).toBeUndefined();
    expect(h.element<HTMLSelectElement>("#image-edit-model").value).toBe("qwen-image-2-1");
    expect(h.element<HTMLSelectElement>("#image-edit-quality").value).toBe(quality);
    expect(h.element("#enqueue-image-edit").disabled).toBe(true);
    expect(h.element("[data-image-token-estimate]").textContent).toBe("0 tokens");
    const editor = h.element<HTMLTextAreaElement>("#image-edit-prompt-input");
    editor.focus(); h.input("#image-edit-prompt-input", "A red cup beside a vase.");
    expect(document.activeElement).toBe(h.element("#image-edit-prompt-input-rich"));
    expect(h.element("[data-image-token-estimate]").textContent).toBe(`${estimatePromptTextTokens(editor.value)} tokens`);
    expect(h.element("#enqueue-image-edit").disabled).toBe(false);
    h.element("#enqueue-image-edit").click();
    await new Promise(r => setTimeout(r, 10));
    expect(h.application.enqueueImageEdit).toHaveBeenCalledOnce();
    await expect(h.application.enqueueImageEdit.mock.results[0]?.value).resolves.toHaveProperty("queue");
    expect(h.state().queue).toHaveLength(1);
    expect(h.state().queue[0]).toMatchObject({ taskType: "image-generation", modelId: "qwen-image-2-1", qualityProfile: quality });
    expect(h.state().queue[0]?.id).toBeTruthy();
    h.input("#image-edit-prompt-input", "A blue cup.");
    expect(h.state().queue[0]?.prompt).toBe("A red cup beside a vase.");
  });

  it("uses the image target and actual enhancement button without mutating generation parameters", async () => {
    const h = journey = await createJourney();
    h.coordinator.patchImageDraft({ modelId: "qwen-image-2-1-turbo", qualityProfile: "turbo-8" });
    h.setMode("image-edit");
    h.element("#enhance-prompt").click(); await settle();
    expect(h.enhancePrompt).not.toHaveBeenCalled();
    h.input("#image-edit-prompt-input", "同一房间，摄影机向左换45度视角。");
    const configuration = { modelId: h.state().imageDraft.modelId, qualityProfile: h.state().imageDraft.qualityProfile };
    h.enhancePrompt.mockResolvedValueOnce("Show the same room from a camera position 45 degrees to the left, retaining its physical arrangement.");
    h.element("#enhance-prompt").click();
    await new Promise(r => setTimeout(r, 10));
    expect(h.enhancePrompt.mock.calls[0]?.[0]).toMatchObject({ mode: "image-edit", imageTargetModelId: "qwen-image-2-1-turbo" });
    expect(h.state().imageDraft.promptVersions).toHaveLength(2);
    expect(h.state().imageDraft).toMatchObject(configuration);
    expect(h.state().queue).toHaveLength(0);
  });
  it("retains a previous editor reference until explicit removal, then recovers MOSS enqueue", async () => {
    const h = journey = await createJourney();
    h.scan.modelProfiles.push({ id: "moss-image-sft", name: "MOSS", category: "image", available: true, integrated: true,
      components: [], missingCustomNodeIds: [], missingCustomNodeNames: [] } as typeof h.scan.modelProfiles[number]);
    h.coordinator.patchImageDraft({ modelId: "moss-image-sft", qualityProfile: "comfy-25",
      pictures: [{ id: "old-base", pictureNumber: 1, absolutePath: "fixture.png", width: 1024, height: 1024 }] });
    h.setMode("image-edit"); h.input("#image-edit-prompt-input", "A ceramic teapot.");
    expect(h.element("#enqueue-image-edit").disabled).toBe(true);
    expect(h.state().imageDraft.pictures[0]?.absolutePath).toBe("fixture.png");
    expect(document.querySelector("[data-markup-image-picture]")).toBeNull();
    expect(document.querySelector("[data-mask-image-picture]")).toBeNull();
    h.element('[data-remove-image-picture="old-base"]').click(); await settle();
    expect(h.element("#enqueue-image-edit").disabled).toBe(false);
    h.enhancePrompt.mockResolvedValueOnce("A ceramic teapot on a wooden table.");
    h.element("#enhance-prompt").click(); await new Promise(r => setTimeout(r, 10));
    expect(h.enhancePrompt.mock.calls[0]?.[0]).toMatchObject({ mode: "image-edit", imageTargetModelId: "moss-image-sft" });
    expect(h.state().imageDraft.promptVersions).toHaveLength(2);
  });
});
