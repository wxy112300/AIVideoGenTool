import { describe, expect, it } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import {
  activateCreationDraft,
  creationDraftForMode,
  patchCreationDraftForMode
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
});