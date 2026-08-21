import { describe, expect, it } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { createClearedDraft } from "../src/core/draft-defaults";
import {
  activateCreationDraft,
  creationDraftForMode,
  patchCreationDraftForMode,
  preserveLocalCreationDrafts
} from "../src/core/creation-drafts";

describe("creation draft isolation", () => {
  it("restores complete image-to-video and extension parameter snapshots", () => {
    const state = createDefaultState();
    const imageDraft = {
      ...state.draft,
      inputMode: "image" as const,
      modelId: "minimax_h3_fl2va_q3_gguf",
      resolution: 768 as const,
      duration: 10,
      seed: 101,
      h3ReferenceSlots: [{
        id: "image-slot-1",
        mediaType: "image" as const,
        mediaPath: "slot-1.png",
        role: "subject" as const,
        note: "Keep this subject"
      }]
    };
    activateCreationDraft(state, imageDraft);

    const extensionDraft = {
      ...state.draft,
      inputMode: "video" as const,
      modelId: "sulphur2",
      resolution: 480 as const,
      duration: 6,
      seed: 202,
      sourceVideoPath: "source.mp4",
      sourceVideoDuration: 12,
      trimEndSeconds: 8,
      h3ReferenceSlots: [{
        id: "extension-slot-1",
        mediaType: "video" as const,
        mediaPath: "source.mp4",
        role: "motion" as const,
        note: ""
      }]
    };
    activateCreationDraft(state, extensionDraft);

    expect(creationDraftForMode(state, "image")).toMatchObject({
      modelId: "minimax_h3_fl2va_q3_gguf",
      resolution: 768,
      duration: 10,
      seed: 101,
      sourceVideoPath: "",
      h3ReferenceSlots: [{
        id: "image-slot-1",
        mediaPath: "slot-1.png"
      }]
    });
    expect(creationDraftForMode(state, "video")).toMatchObject({
      modelId: "sulphur2",
      resolution: 480,
      duration: 6,
      seed: 202,
      sourceVideoPath: "source.mp4",
      trimEndSeconds: 8,
      h3ReferenceSlots: [{
        id: "extension-slot-1",
        mediaPath: "source.mp4"
      }]
    });

    const restoredImage = creationDraftForMode(state, "image");
    expect(restoredImage).toBeDefined();
    activateCreationDraft(state, restoredImage!);
    restoredImage!.modelId = "mutated-after-activation";
    restoredImage!.h3ReferenceSlots[0]!.mediaPath = "mutated-slot.png";

    expect(state.draft.modelId).toBe("minimax_h3_fl2va_q3_gguf");
    expect(state.draft.h3ReferenceSlots[0]?.mediaPath).toBe("slot-1.png");
    expect(state.videoExtensionDraft?.modelId).toBe("sulphur2");
    expect(state.videoExtensionDraft?.h3ReferenceSlots[0]?.mediaPath).toBe("source.mp4");
  });

  it("writes an asynchronous result to its origin snapshot after navigation", () => {
    const state = createDefaultState();
    const imageDraft = {
      ...state.draft,
      inputMode: "image" as const,
      promptVersions: [{
        id: "image-original",
        label: "Original",
        text: "image prompt",
        createdAt: "2026-01-01T00:00:00.000Z"
      }]
    };
    activateCreationDraft(state, imageDraft);
    activateCreationDraft(state, {
      ...state.draft,
      inputMode: "video",
      sourceVideoPath: "extension.mp4"
    });

    patchCreationDraftForMode(state, "image", (latestImageDraft) => ({
      promptVersions: [
        ...latestImageDraft.promptVersions,
        {
          id: "image-enhanced",
          label: "Enhanced",
          text: "enhanced image prompt",
          createdAt: "2026-01-01T00:01:00.000Z"
        }
      ],
      activePromptVersion: 1
    }), false);

    expect(state.draft.inputMode).toBe("video");
    expect(state.draft.sourceVideoPath).toBe("extension.mp4");
    expect(state.imageToVideoDraft?.promptVersions.at(-1)?.text).toBe("enhanced image prompt");
    expect(state.imageToVideoDraft?.activePromptVersion).toBe(1);
  });

  it("preserves all FL2VA and Motion Extend slots across stale save events", () => {
    const localState = createDefaultState();
    localState.imageToVideoDraft = {
      ...localState.draft,
      inputMode: "image",
      modelId: "minimax_h3_fl2va",
      h3ReferenceSlots: [{
        id: "fl2va-slot-1",
        mediaType: "image",
        mediaPath: "fl2va-slot-1.png",
        role: "subject",
        note: ""
      }, {
        id: "fl2va-slot-2",
        mediaType: "image",
        mediaPath: "fl2va-slot-2.png",
        role: "scene",
        note: "keep scene"
      }]
    };
    localState.videoExtensionDraft = {
      ...localState.draft,
      inputMode: "video",
      modelId: "minimax_h3_ref2va",
      sourceVideoPath: "motion-extend.mp4",
      h3ReferenceSlots: [{
        id: "motion-slot-1",
        mediaType: "video",
        mediaPath: "motion-extend.mp4",
        role: "motion",
        note: ""
      }, {
        id: "motion-slot-2",
        mediaType: "image",
        mediaPath: "motion-character.png",
        role: "subject",
        note: "keep character"
      }, {
        id: "motion-slot-3",
        mediaType: "video",
        mediaPath: "motion-reference.mp4",
        role: "camera",
        note: "keep camera"
      }]
    };
    const staleIncomingState = structuredClone(localState);
    localState.draft = structuredClone(localState.imageToVideoDraft);
    staleIncomingState.draft = structuredClone(localState.videoExtensionDraft);
    staleIncomingState.imageToVideoDraft!.h3ReferenceSlots = [];
    staleIncomingState.videoExtensionDraft!.h3ReferenceSlots = [];

    const merged = preserveLocalCreationDrafts(staleIncomingState, localState);

    expect(merged.imageToVideoDraft?.h3ReferenceSlots.map((slot) => slot.mediaPath)).toEqual([
      "fl2va-slot-1.png",
      "fl2va-slot-2.png"
    ]);
    expect(merged.videoExtensionDraft?.h3ReferenceSlots.map((slot) => slot.mediaPath)).toEqual([
      "motion-extend.mp4",
      "motion-character.png",
      "motion-reference.mp4"
    ]);
    expect(merged.draft.modelId).toBe("minimax_h3_fl2va");
    expect(merged.imageToVideoDraft?.modelId).toBe("minimax_h3_fl2va");
    expect(merged.videoExtensionDraft?.modelId).toBe("minimax_h3_ref2va");

    patchCreationDraftForMode(merged, "video", () => ({
      modelId: "minimax_h3_ref2va_q4"
    }), false);

    expect(merged.draft.modelId).toBe("minimax_h3_fl2va");
    expect(merged.imageToVideoDraft?.modelId).toBe("minimax_h3_fl2va");
    expect(merged.videoExtensionDraft?.modelId).toBe("minimax_h3_ref2va_q4");
  });

  it("clears only the active Motion Extend workspace", () => {
    const state = createDefaultState();
    activateCreationDraft(state, {
      ...state.draft,
      inputMode: "image",
      modelId: "minimax_h3_fl2va",
      h3ReferenceSlots: [{
        id: "fl2va-slot-1",
        mediaType: "image",
        mediaPath: "fl2va.png",
        role: "subject",
        note: ""
      }]
    });
    activateCreationDraft(state, {
      ...state.draft,
      inputMode: "video",
      modelId: "minimax_h3_ref2va",
      sourceVideoPath: "extend.mp4",
      h3ReferenceSlots: [{
        id: "extend-slot-1",
        mediaType: "video",
        mediaPath: "extend.mp4",
        role: "motion",
        note: ""
      }]
    });

    patchCreationDraftForMode(state, "video", (draft) => createClearedDraft(draft), true);

    expect(state.draft.inputMode).toBe("video");
    expect(state.draft.modelId).toBe("minimax_h3_ref2va");
    expect(state.draft.sourceVideoPath).toBe("");
    expect(state.draft.h3ReferenceSlots).toEqual([]);
    expect(state.imageToVideoDraft?.modelId).toBe("minimax_h3_fl2va");
    expect(state.imageToVideoDraft?.h3ReferenceSlots[0]?.mediaPath).toBe("fl2va.png");
  });
});