import { describe, expect, it } from "vitest";
import {
  createClearedDraft,
  createDefaultDraft,
  createDefaultImageEditDraft,
  createDefaultSettings
} from "../src/core/defaults";
import { migrateLegacyComfyUrl } from "../electron/store";

describe("draft defaults", () => {
  it("keeps the starter prompt for a new install", () => {
    const draft = createDefaultDraft();
    expect(draft.promptVersions[0]?.text).not.toBe("");
    expect(draft.promptVersions[0]?.text).not.toMatch(/[\u3400-\u9fff]/u);
    expect(draft.duration).toBe(5);
    expect(draft.fps).toBe(24);
    expect(draft.frameInterpolation).toBe("off");
    expect(draft.inputMode).toBe("image");
    expect(draft.modelId).toBe("minimax_h3_fl2va");
    expect(draft.spectrumMode).toBe("off");
    expect(draft.spectrumModelAwareMode).toBe("off");
    expect(draft.h3MemoryOptimizationMode).toBe("off");
    expect(draft.h3MemoryOptimizationUserSet).toBe(false);
    expect(draft.h3MemoryChunkRows).toBe(4096);
    expect(draft.sourceVideoPath).toBe("");
    expect(draft.trimStartSeconds).toBe(0);
    expect(draft.trimEndSeconds).toBe(0);
    expect(createDefaultSettings().vramReserveGb).toBe(1);
    expect(createDefaultSettings().autoRetryFailedTasks).toBe(true);
    expect(createDefaultSettings().autoRetryCount).toBe(2);
    expect(createDefaultSettings().queueIsolationMode).toBe("lora");
    expect(createDefaultSettings().uiLocale).toBe("zh-CN");
    expect(createDefaultSettings().defaultVideoModel).toBe("minimax_h3_fl2va");
    expect(createDefaultSettings().defaultExtensionModel).toBe("minimax_h3_ref2va");
    expect(createDefaultImageEditDraft().qualityProfile).toBe("balanced-20");
    expect(createDefaultImageEditDraft().aspectRatio).toBe("source");
    expect(createDefaultImageEditDraft().targetResolution).toBe("source");
    expect(createDefaultImageEditDraft().outputCount).toBe(1);
    expect(createDefaultSettings().defaultImageQualityProfile).toBe("balanced-20");
    expect(createDefaultSettings().imageOutputCount).toBe(1);
    expect(createDefaultSettings().ltxExtensionModelProfile).toBe("q3_k_m");
    expect(createDefaultSettings().ltxExtensionResolution).toBe(360);
    expect(createDefaultSettings().ltxExtensionFrames).toBe(49);
    expect(createDefaultSettings().ltxExtensionOverlapFrames).toBe(16);
    expect(createDefaultSettings().ltxExtensionUnloadBetweenStages).toBe(true);
    expect(createDefaultSettings().ltxExtensionTimeoutMinutes).toBe(20);
    expect(createDefaultSettings().lmStudioInstallDirectory).toBe("");
    expect(createDefaultSettings().promptUseLmStudio).toBe(false);
    expect(createDefaultSettings().promptModelId).toBe("community/gemma-4-e4b-unconcerned-q5");
    expect(createDefaultSettings().h3AutoPromptSeedId).toBe("");
    expect(createDefaultSettings().hfMirrorEnabled).toBe(false);
    expect(Object.keys(createDefaultSettings().h3AutoPromptSeedInstructions).length).toBeGreaterThan(10);
    expect(createDefaultSettings().promptModelDirectory).toBe("");
    expect(createDefaultSettings().imageOutputDirectory).toBe("");
    expect(createDefaultSettings().imageInputLibraryDirectory).toBe("");
    expect(createDefaultSettings().imagePromptPresets.faithful).not.toBe("");
    expect(createDefaultSettings().imagePromptPresets["detail-enhance"]).not.toBe("");
  });

  it("uses 8188 as the ComfyUI default and migrates only the legacy 8000 default", () => {
    expect(createDefaultSettings().comfyUrl).toBe("http://127.0.0.1:8188");
    expect(migrateLegacyComfyUrl("http://127.0.0.1:8000")).toBe(
      "http://127.0.0.1:8188"
    );
    expect(migrateLegacyComfyUrl("http://127.0.0.1:18188")).toBe(
      "http://127.0.0.1:18188"
    );
  });

  it("clears user content while retaining the selected generation setup", () => {
    const current = {
      ...createDefaultDraft(),
      modelId: "wan22_5b",
      workflowPath: "wan.json",
      startImagePath: "start.png",
      endImagePath: "end.png",
      inputMode: "video" as const,
      sourceVideoPath: "source.mp4",
      sourceVideoDuration: 12.5,
      trimStartSeconds: 1.2,
      trimEndSeconds: 9.8,
      sourceAssetId: "asset-1",
      sourceVersionId: "version-2",
      seed: 42
    };
    const cleared = createClearedDraft(current);

    expect(cleared.startImagePath).toBe("");
    expect(cleared.endImagePath).toBe("");
    expect(cleared.inputMode).toBe("video");
    expect(cleared.sourceVideoPath).toBe("");
    expect(cleared.sourceVideoDuration).toBe(0);
    expect(cleared.trimStartSeconds).toBe(0);
    expect(cleared.trimEndSeconds).toBe(0);
    expect(cleared.sourceAssetId).toBeUndefined();
    expect(cleared.sourceVersionId).toBeUndefined();
    expect(cleared.promptVersions).toHaveLength(1);
    expect(cleared.promptVersions[0]?.text).toBe("");
    expect(cleared.seed).toBeNull();
    expect(cleared.modelId).toBe("wan22_5b");
    expect(cleared.workflowPath).toBe("wan.json");
    expect(cleared.fps).toBe(current.fps);
  });
});
