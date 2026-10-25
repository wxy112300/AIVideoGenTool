// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { createJourney } from "./harness/create-journey";
import { H3_FACE_SWAP_LORA_ID as id, H3_FACE_SWAP_LORA_FILENAME as filename } from "../src/core/catalog/loras/definitions";
import { videoLoraDefinition, videoLoraSelection, videoLoraConfigurationIssues, videoPromptForLoras, videoLoraCompatibleWithDraft } from "../src/core/video-loras";
import { modelCatalog } from "../src/core/catalog";
import { createDefaultState } from "../src/core/defaults";
import { queueTaskFromDraft } from "../src/core/queue-task-factory";
import { renderWorkflow } from "../src/core/workflow";
import { h3LoraPromptInstruction } from "../src/core/prompts/h3/loras";
import type { H3ReferenceSlot } from "../src/types";

const lora = videoLoraSelection(videoLoraDefinition(id)!);
const image: H3ReferenceSlot = { id: "face", mediaType: "image", mediaPath: "face.png", role: "subject", note: "replacement face" };
const video: H3ReferenceSlot = { id: "original", mediaType: "video", mediaPath: "original.mp4", role: "motion", note: "source performance" };
const slots = [image, video];
const issues = (references: H3ReferenceSlot[]) => videoLoraConfigurationIssues({ modelId: "minimax_h3_ref2va", inputMode: "image", videoLoras: [lora], h3ReferenceSlots: references, spectrumMode: "off", attentionMode: "pytorch" });
let journey: Awaited<ReturnType<typeof createJourney>> | undefined;
afterEach(async () => { journey?.dispose(); journey = undefined; await new Promise(resolve => setTimeout(resolve, 370)); });
const settle = () => new Promise(resolve => setTimeout(resolve, 10));

describe("H3 Ref2VA FaceSwap", () => {
  it("limits the adapter to ordinary R2V and both required media types", () => {
    expect(videoLoraCompatibleWithDraft(lora, "minimax_h3_ref2va", "image")).toBe(true);
    for (const model of ["minimax_h3_fl2va", "minimax_h3_ref2va_int4", "minimax_h3_continuum"]) {
      expect(videoLoraCompatibleWithDraft(lora, model, "image")).toBe(false);
    }
    expect(videoLoraCompatibleWithDraft(lora, "minimax_h3_ref2va", "video")).toBe(false);
    for (const references of [[], [image], [video], [image, { ...video, mediaPath: "" }], [image, video, { ...video, id: "extra" }]]) {
      expect(issues(references)).toContainEqual(expect.objectContaining({ severity: "error", code: `references:${id}` }));
    }
    expect(issues(slots)).toEqual([]);
    expect(h3LoraPromptInstruction([lora])).toContain("<Picture 1>");
    expect(h3LoraPromptInstruction([lora])).toContain("<Video 1>");
    expect(issues([image, { ...image, id: "second-face" }, video])).toEqual([]);
    const scan = modelCatalog.get(id)!.definition.scan!;
    expect(scan.components[0]!.installGuide).toMatchObject({
      revision: "b2a5823ca64bc78d91725fbfcc576095bfceb764", bytes: 65623904,
      sha256: "1e032cf519cc143f434e67516d8ad0aacf4c6e146315b2dcc3b1c2800470326d"
    });
    expect(scan.components[0]!.patterns.some(pattern => pattern.test(`loras/${filename}`))).toBe(true);
    for (const locale of ["zh-CN", "zh-TW", "en-US"] as const) {
      expect(modelCatalog.localized(id, locale)?.description).toBeTruthy();
    }
  });

  it("builds a native R2V LoRA chain, freezes inputs, and rejects missing references at graph construction", () => {
    const state = createDefaultState();
    Object.assign(state.draft, { modelId: "minimax_h3_ref2va", workflowPath: "workflows/minimax_h3_r2v_api.json", videoLoras: [structuredClone(lora)], h3ReferenceSlots: structuredClone(slots), steps: 20, attentionMode: "pytorch", spectrumMode: "off" });
    state.draft.promptVersions[0]!.text = "Replace the person in <Video 1> with the face from <Picture 1>.";
    const task = queueTaskFromDraft(state.draft, state);
    state.draft.h3ReferenceSlots[0]!.mediaPath = "another-face.png";
    state.draft.videoLoras[0]!.strength = 0.2;
    const source = JSON.parse(readFileSync("workflows/minimax_h3_r2v_api.json", "utf8"));
    const graph = renderWorkflow(source, task, { h3ReferenceImages: ["face.png"], h3ReferenceVideos: ["original.mp4"] }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    expect(task.h3ReferenceSlots?.[0]?.mediaPath).toBe("face.png");
    expect(Object.values(graph).filter(node => node.class_type === "LoraLoaderModelOnly")).toEqual([
      expect.objectContaining({ inputs: expect.objectContaining({ lora_name: filename, strength_model: 1 }) })
    ]);
    expect(Object.values(graph).find(node => node.class_type === "MiniMaxH3ReferenceToVideo")?.inputs.prompt).toBe(`Faceswap, ${task.prompt}`);
    expect(Object.values(graph).find(node => node.class_type === "BasicScheduler")?.inputs.steps).toBe(20);
    expect(Object.values(graph).some(node => /CRT|AIToolkit/u.test(node.class_type))).toBe(false);
    expect(() => renderWorkflow(source, { ...task, h3ReferenceSlots: [image] })).toThrow("恰好一段原视频");
    expect(videoPromptForLoras("Faceswap, keep the same lighting.", [lora])).toBe("Faceswap, keep the same lighting.");
  });

  it("uses actual Add and Enqueue controls after source-video recovery and protects the queued snapshot", async () => {
    const h = journey = await createJourney({ modelId: "minimax_h3_ref2va", workflowPath: "workflows/minimax_h3_r2v_api.json", h3ReferenceSlots: [image], videoLoras: [], duration: 2, spectrumMode: "off" });
    expect(h.element<HTMLSelectElement>("#video-lora-to-add").querySelector(`option[value="${id}"]`)).toBeNull();
    h.scan.modelProfiles.push({ id, name: lora.name, category: "lora", available: true, integrated: true, components: [{ matches: [`C:/fixture/models/loras/${filename}`] }] } as typeof h.scan.modelProfiles[number]);
    h.render();
    h.element("#add-video-lora").click();
    document.querySelector<HTMLButtonElement>(`[data-add-lora="${id}"]`)!.click(); await settle();
    h.input("#prompt-input", "Replace the face using Picture 1, keep the motion from Video 1.");
    expect(h.element("#enqueue").disabled).toBe(true);
    expect(h.root.textContent).toContain("H3 FaceSwap 需要至少一张参考人脸");
    h.element("#enqueue").click(); await settle();
    expect(h.application.enqueue).not.toHaveBeenCalled();
    h.state().draft.h3ReferenceSlots = structuredClone(slots); h.render();
    expect(h.element("#enqueue").disabled).toBe(false);
    h.element("#enqueue").click(); await settle();
    expect(h.application.enqueue).toHaveBeenCalledOnce();
    expect(h.state().queue[0]).toMatchObject({ id: expect.any(String), modelId: "minimax_h3_ref2va", videoLoras: [{ id, filename, strength: 1 }], h3ReferenceSlots: [{ mediaPath: "face.png" }, { mediaPath: "original.mp4" }] });
    h.state().draft.h3ReferenceSlots[0]!.mediaPath = "changed.png";
    expect(h.state().queue[0]?.h3ReferenceSlots?.[0]?.mediaPath).toBe("face.png");
  });
});
