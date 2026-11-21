import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { h3TimedGuideIssue, resolveH3TimedGuides } from "../src/core/h3-timed-guides";
import { queueTaskFromDraft } from "../src/core/queue-task-factory";
import { renderWorkflow } from "../src/core/workflow";
import { normalizeVideoDraft } from "../src/core/video-draft-normalization";
import type { H3TimedGuide } from "../src/types";

describe("H3 timed guides", () => {
  it("repairs existing numbered gaps and keeps the prompt pointing to the same slot", () => {
    const { draft } = createDefaultState();
    const loaded = normalizeVideoDraft({
      ...draft,
      promptVersions: [{ ...draft.promptVersions[0]!, text: "Follow <Picture 3>." }],
      h3GuideEditor: { active: true, nextPicture: 4, slots: [
        { picture: 2, mediaPath: "", seconds: null },
        { picture: 3, mediaPath: "later.png", seconds: null }
      ] }
    });
    expect(loaded.h3GuideEditor?.slots).toEqual([
      { picture: 1, mediaPath: "", seconds: null },
      { picture: 2, mediaPath: "later.png", seconds: null }
    ]);
    expect(loaded.promptVersions[0]?.text).toBe("Follow <Picture 2>.");
    expect(normalizeVideoDraft(loaded)).toEqual(loaded);
  });

  it("uses the R2V reference image links for timed inputs and preserves the prompt Picture tags", () => {
    const workflowPath = "workflows/minimax_h3_r2v_api.json";
    const state = createDefaultState();
    const draft = {
      ...state.draft, modelId: "minimax_h3_ref2va", workflowPath, duration: 5,
      h3ReferenceGuidesEnabled: true,
      h3ReferenceSlots: [
        { id: "a", mediaType: "image", mediaPath: "first.png", role: "subject", note: "", guideSeconds: 2 },
        { id: "b", mediaType: "image", mediaPath: "opening.png", role: "subject", note: "", guideSeconds: 0 }
      ]
    } as const;
    const task = queueTaskFromDraft({ ...draft, h3ReferenceSlots: [...draft.h3ReferenceSlots] }, state);
    task.prompt = "<Picture 1> turns toward <Picture 2>.";
    const graph = renderWorkflow(JSON.parse(readFileSync(workflowPath, "utf8")), task, {
      h3ReferenceImages: ["uploaded-first.png", "uploaded-opening.png"]
    }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    const [sourceId, source] = Object.entries(graph).find(([, node]) => node.class_type === "MiniMaxH3ReferenceToVideo")!;
    const [[openingId, opening], [laterId, later]] = Object.entries(graph).filter(([, node]) => node.class_type === "MiniMaxH3AddGuide");
    expect(source.inputs.prompt).toBe(task.prompt);
    expect(source.inputs.first_frame).toBeUndefined();
    expect(opening.inputs).toMatchObject({ positive: [sourceId, 0], latent: [sourceId, 1], image: source.inputs["ref_images.ref_image_1"], frame_idx: 0 });
    expect(later.inputs).toMatchObject({ positive: [openingId, 0], latent: [sourceId, 1], image: source.inputs["ref_images.ref_image_0"], frame_idx: 48 });
    expect(Object.values(graph).find(node => node.class_type === "BasicGuider")?.inputs.conditioning).toEqual([laterId, 0]);
    expect(Object.values(graph).filter(node => node.class_type === "LoadImage")).toHaveLength(2);
  });

  const slots: H3TimedGuide[] = [
    { picture: 1, mediaPath: "first.png", seconds: 0 },
    { picture: 2, mediaPath: "tail.png", seconds: "end" },
    { picture: 3, mediaPath: "middle.png", seconds: 1.5 }
  ];

  it("rejects collisions after rounding and resolves the symbolic end against native H3 frames", () => {
    expect(h3TimedGuideIssue([...slots, { picture: 4, mediaPath: "collision.png", seconds: 1.501 }], 5)).toBe("duplicate");
    expect(h3TimedGuideIssue([...slots, { picture: 4, mediaPath: "outside.png", seconds: 2 }], 1)).toBe("time");
    expect(resolveH3TimedGuides(slots, 5).map(guide => [guide.picture, guide.frame])).toEqual([[1, 0], [3, 36], [2, 123]]);
  });

  it("uses native opening conditioning and chains uploaded images into the real graph before sampling", () => {
    const workflowPath = "workflows/minimax_h3_i2v_api.json";
    const state = createDefaultState();
    const task = queueTaskFromDraft({
      ...state.draft, workflowPath, duration: 5,
      promptVersions: [{ ...state.draft.promptVersions[0]!, text: "The subject turns at <Picture 3>." }],
      h3GuideEditor: { active: true, nextPicture: 4, slots }
    }, state);
    const workflow = renderWorkflow(JSON.parse(readFileSync(workflowPath, "utf8")), task, {
      h3TimedGuideFiles: { 1: "uploaded-first.png", 2: "uploaded-middle.png", 3: "uploaded-tail.png" }
    }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    const [sourceId, source] = Object.entries(workflow).find(([, node]) => node.class_type === "MiniMaxH3ImageToVideo")!;
    const [[middleId, middle], [tailId, tail]] = Object.entries(workflow).filter(([, node]) => node.class_type === "MiniMaxH3AddGuide");
    expect(source.inputs.prompt).toBe("The subject turns at the keyframe at 1.5s.");
    expect(source.inputs.last_frame).toBeUndefined();
    expect(middle.inputs).toMatchObject({ positive: [sourceId, 0], latent: [sourceId, 1], frame_idx: 36 });
    expect(tail.inputs).toMatchObject({ positive: [middleId, 0], latent: [sourceId, 1], frame_idx: 123 });
    expect(Object.values(workflow).find(node => node.class_type === "BasicGuider")?.inputs.conditioning).toEqual([tailId, 0]);
    for (const [link, filename] of [[source.inputs.first_frame, "uploaded-first.png"], [middle.inputs.image, "uploaded-middle.png"], [tail.inputs.image, "uploaded-tail.png"]] as const) {
      expect(workflow[(link as [string, number])[0]].inputs.image).toBe(filename);
    }
  });
});
