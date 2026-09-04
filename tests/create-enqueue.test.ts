import { describe, expect, it } from "vitest";
import { createDefaultImageEditDraft } from "../src/core/defaults";
import type { ImageReference, ModelScanProfile } from "../src/types";
import {
  generationSafetyForCreateDraft,
  imageEditEnqueueBlockReason,
  resolutionAfterJointAvPreference,
  selectedVideoResolution,
  videoEnqueueBlockReason,
  videoResolutionOptionsForDraft
} from "../src/renderer/pages/create/view-model";
import { createDefaultDraft } from "../src/core/defaults";
import { isImageModelSelectable } from "../src/renderer/shared/status";

function videoCheck(overrides: Partial<Parameters<typeof videoEnqueueBlockReason>[0]> = {}) {
  return videoEnqueueBlockReason({
    promptText: "prompt",
    extending: false,
    isR2V: false,
    videoReady: true,
    trimDuration: 2,
    workflowPath: "workflow.json",
    supportsVideoExtension: true,
    safetySafe: true,
    safetyMessage: "unsafe",
    h3MotionContextReady: true,
    spectrumReady: true,
    r2vSlotsReady: true,
    startImagePath: "start.png",
    turboCoreBlockReason: "",
    turboLoraBlockReason: "",
    selectedLoraBlockReason: "",
    ...overrides
  });
}

describe("create enqueue preflight checks", () => {
  const readyImageProfile = (id: string): ModelScanProfile => ({
    id, name: id, category: "image", badge: "", description: "", vram: "",
    available: true, integrated: true, missingCustomNodeIds: [],
    missingCustomNodeNames: [], components: []
  });

  it("only enables image model selection after its required model files are detected", () => {
    const profile = readyImageProfile("lama-inpaint");
    expect(isImageModelSelectable(profile)).toBe(true);
    profile.available = false;
    expect(isImageModelSelectable(profile)).toBe(false);
  });

  it("refreshes image-edit prompt blocking state after the prompt is filled", () => {
    const draft = createDefaultImageEditDraft();
    const picture: ImageReference = {
      id: "picture-1",
      pictureNumber: 1,
      absolutePath: "start.png",
      width: 992,
      height: 519,
      role: "base"
    };
    draft.pictures = [picture];
    expect(imageEditEnqueueBlockReason(draft, undefined)).toBe("请先填写图片编辑 Prompt");
    draft.promptVersions[0]!.text = "移除选中物体";
    expect(imageEditEnqueueBlockReason(draft, readyImageProfile(draft.modelId))).toBe("");
  });

  it("allows Z-Image text-to-image enqueue without a reference picture", () => {
    const draft = createDefaultImageEditDraft();
    draft.modelId = "z-image-turbo";
    draft.qualityProfile = "turbo-8";
    draft.pictures = [];
    expect(imageEditEnqueueBlockReason(draft, readyImageProfile(draft.modelId))).toBe("请先填写图片编辑 Prompt");
    draft.promptVersions[0]!.text = "A quiet mountain village at dawn.";
    expect(imageEditEnqueueBlockReason(draft, readyImageProfile(draft.modelId))).toBe("");
  });

  it("allows OmniGen2 text-to-image enqueue without a reference picture", () => {
    const draft = createDefaultImageEditDraft();
    draft.modelId = "omnigen2";
    draft.qualityProfile = "native";
    draft.pictures = [];
    expect(imageEditEnqueueBlockReason(draft, readyImageProfile(draft.modelId))).toBe("请先填写图片编辑 Prompt");
    draft.promptVersions[0]!.text = "A quiet mountain village at dawn.";
    expect(imageEditEnqueueBlockReason(draft, readyImageProfile(draft.modelId))).toBe("");
  });

  it("allows LaMa without a prompt only after a mask is saved", () => {
    const draft = createDefaultImageEditDraft();
    draft.modelId = "lama-inpaint";
    draft.qualityProfile = "natural";
    draft.pictures = [{
      id: "picture-1", pictureNumber: 1, absolutePath: "start.png",
      width: 992, height: 519, role: "base"
    }];
    expect(imageEditEnqueueBlockReason(draft, undefined)).toBe("请先在原图上绘制并保存 Mask");
    draft.pictures[0]!.mask = {
      documentPath: "mask.fabric.json", maskPath: "mask.png",
      revision: 1, regionCount: 1, updatedAt: "2026-08-13T00:00:00.000Z"
    };
    expect(imageEditEnqueueBlockReason(draft, readyImageProfile(draft.modelId))).toBe("");
  });

  it("blocks enqueue when an installed image model is missing its required node package", () => {
    const draft = createDefaultImageEditDraft();
    draft.modelId = "lama-inpaint";
    draft.pictures = [{
      id: "picture-1", pictureNumber: 1, absolutePath: "start.png",
      width: 992, height: 519, role: "base",
      mask: {
        documentPath: "mask.fabric.json", maskPath: "mask.png",
        revision: 1, regionCount: 1, updatedAt: "2026-08-13T00:00:00.000Z"
      }
    }];
    const profile = readyImageProfile(draft.modelId);
    profile.requiredCustomNodeIds = ["inpaint-nodes"];
    profile.missingCustomNodeIds = ["inpaint-nodes"];
    profile.missingCustomNodeNames = ["ComfyUI Inpaint Nodes"];

    expect(imageEditEnqueueBlockReason(draft, profile)).toContain("缺少必需节点：ComfyUI Inpaint Nodes");
  });

  it("checks the image-to-video prompt after its required start image", () => {
    expect(videoCheck({ promptText: "", startImagePath: "start.png" })).toBe("请先填写提示词");
    expect(videoCheck({ promptText: "camera pushes in" })).toBe("");
  });

  it("allows an H3 T2VA task without a start image", () => {
    expect(videoCheck({ startImagePath: "", allowTextOnly: true })).toBe("");
    expect(videoCheck({ startImagePath: "", allowTextOnly: false })).toBe("请先选择首帧图片");
  });

  it("offers Create 1080 only for base FL2VA with JointAV and no LoRA", () => {
    const draft = createDefaultDraft();
    expect(videoResolutionOptionsForDraft(draft, false, true)).toContain(1080);
    expect(videoResolutionOptionsForDraft(draft, false, false)).not.toContain(1080);
    expect(videoResolutionOptionsForDraft({ ...draft, h3SaveJointAv: false }, false, true)).not.toContain(1080);
    expect(videoResolutionOptionsForDraft({ ...draft, modelId: "minimax_h3_fl2va_q3_gguf" }, false, true)).not.toContain(1080);
    expect(videoResolutionOptionsForDraft({ ...draft, videoLoras: [{
      id: "fixture", name: "Fixture", filename: "fixture.safetensors", strength: 1
    }] }, false, true)).not.toContain(1080);
    expect(videoResolutionOptionsForDraft(draft, true, true)).not.toContain(1080);
    expect(videoResolutionOptionsForDraft(draft, false, true)).not.toContain(1440);
  });

  it("falls back from 1080 to the preceding tier when JointAV saving is disabled", () => {
    expect(resolutionAfterJointAvPreference(1080, false)).toBe(768);
    expect(resolutionAfterJointAvPreference(1080, true)).toBe(1080);
    expect(resolutionAfterJointAvPreference(720, false)).toBe(720);
    expect(selectedVideoResolution(1080, [360, 480, 540, 720, 768])).toBe(768);
  });

  it("validates Create 1080 against its 720p first pass", () => {
    const draft = { ...createDefaultDraft(), resolution: 1080 as const };
    const safety = generationSafetyForCreateDraft(draft, "zh-CN");
    expect(safety.safe).toBe(true);
    expect(safety.message).not.toContain("只允许 360/480/540/720/768");
  });

  it("checks video-extension trim and prompt conditions in order", () => {
    expect(videoCheck({
      extending: true,
      videoReady: true,
      trimDuration: 0,
      startImagePath: ""
    })).toBe("请设置有效的视频保留范围");
    expect(videoCheck({
      extending: true,
      videoReady: true,
      trimDuration: 2,
      promptText: ""
    })).toBe("请先填写提示词");
    expect(videoCheck({ extending: true, trimDuration: 2 })).toBe("");
  });

  it("requires a Native AV artifact for Continuum extension", () => {
    expect(videoCheck({
      extending: true,
      isContinuum: true,
      continuumArtifactReady: false
    })).toBe("请先选择或拖入 output/h3-native-av 下的 Native AV safetensors 文件");
    expect(videoCheck({
      extending: true,
      isContinuum: true,
      continuumArtifactReady: true
    })).toBe("");
  });
});
