import { describe, expect, it } from "vitest";
import { createDefaultImageEditDraft } from "../src/core/defaults";
import { normalizeImageEditDraft } from "../src/core/image-project";
import { clampCustomImageResolution, imageModelAdapterFor, normalizeImageTargetResolution } from "../src/core/image-workflow";
import { imageTaskFromDraft } from "../src/core/queue-task-factory";
import { MOSS_IMAGE_ID, MOSS_NSFW_ID } from "../src/core/moss-image-spec";

describe("free image short edges", () => {
  it("accepts intermediate values through draft restoration while rejecting invalid sizes", () => {
    for (const size of [800, 832, 1000, 1232, 2144]) {
      expect(normalizeImageTargetResolution(size)).toBe(size);
      expect(normalizeImageEditDraft({ ...createDefaultImageEditDraft(), targetResolution: size }).targetResolution).toBe(size);
    }
    for (const size of [0, 479, 2161, 1000.5, NaN, Infinity, "bad"]) expect(normalizeImageTargetResolution(size)).toBe("source");
    expect(clampCustomImageResolution(1000, 8)).toBe(1000);
    expect(clampCustomImageResolution(1000, 16)).toBe(1008);
    expect(clampCustomImageResolution(1000, 32)).toBe(992);
  });

  it.each([
    ["qwen-image-2-1", false, 1232],
    ["qwen-image-2-1", true, 1248],
    ["qwen-image-2-1-turbo", false, 1232],
    [MOSS_IMAGE_ID, false, 1232],
    [MOSS_NSFW_ID, false, 1232]
  ] as const)("carries a custom canvas into %s graph (reference=%s)", (modelId, reference, expected) => {
    const adapter = imageModelAdapterFor(modelId)!;
    expect(adapter).toBeTruthy();
    const draft = createDefaultImageEditDraft();
    Object.assign(draft, { modelId, qualityProfile: adapter.qualityProfiles[0]!.id, targetResolution: 1232, aspectRatio: "1:1",
      pictures: reference ? [{ id: "base", pictureNumber: 1, absolutePath: "fixture.png", width: 1280, height: 720 }] : [],
      outputCount: 1, seed: 42 });
    draft.promptVersions[0]!.text = "A ceramic cup.";
    const task = imageTaskFromDraft(draft, undefined, { root: "fixture", directory: "fixture/Images", subfolder: "Images" });
    expect(task.targetResolution).toBe(1232);
    expect([task.outputWidth, task.outputHeight]).toEqual([expected, expected]);
    const graph = adapter.buildWorkflow(task, task.runs[0]!);
    expect(adapter.validateWorkflow(graph, task.qualityProfile, reference)).toEqual([]);
    const latent = Object.values(graph).find(node => ["EmptyLatentImage", "EmptyFlux2LatentImage"].includes(node.class_type));
    expect(latent?.inputs).toMatchObject({ width: expected, height: expected });
  });
});
