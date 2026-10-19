// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createJourney } from "./harness/create-journey";
import { estimatePromptTextTokens } from "../src/core/prompt-token-estimate";

let journey: Awaited<ReturnType<typeof createJourney>> | undefined;
afterEach(async () => { journey?.dispose(); journey = undefined; await new Promise(r => setTimeout(r, 370)); });
const settle = () => new Promise(r => setTimeout(r, 0));

describe("image editor actual controls (synthetic external ports)", () => {
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
    expect(document.activeElement).toBe(editor);
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
});
