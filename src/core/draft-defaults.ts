import type { Draft } from "../types.js";
import type { ImageEditDraft } from "../types.js";

export function createDefaultImageEditDraft(): ImageEditDraft {
  return {
    mode: "image-edit",
    pictures: [],
    nextPictureNumber: 1,
    promptVersions: [
      {
        id: crypto.randomUUID(),
        label: "原始",
        text: "",
        createdAt: new Date().toISOString()
      }
    ],
    activePromptVersion: 0,
    modelId: "qwen-image-edit-2511",
    qualityProfile: "balanced-20",
    aspectRatio: "source",
    targetResolution: "source",
    outputCount: 6,
    outputFormat: "png",
    seed: null
  };
}

export function createClearedDraft(current: Draft): Draft {
  return {
    ...current,
    startImagePath: "",
    sourceWidth: 0,
    sourceHeight: 0,
    endImagePath: "",
    sourceVideoPath: "",
    sourceVideoDuration: 0,
    trimStartSeconds: 0,
    trimEndSeconds: 0,
    sourceAssetId: undefined,
    sourceVersionId: undefined,
    promptVersions: [
      {
        id: crypto.randomUUID(),
        label: "新建",
        text: "",
        createdAt: new Date().toISOString()
      }
    ],
    activePromptVersion: 0,
    extensionPromptVersions: [
      {
        id: crypto.randomUUID(),
        label: "新建",
        text: "",
        createdAt: new Date().toISOString()
      }
    ],
    extensionActivePromptVersion: 0,
    h3ReferenceSlots: [],
    seed: null
  };
}
