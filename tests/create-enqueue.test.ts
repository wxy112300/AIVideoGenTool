import { describe, expect, it } from "vitest";
import { createDefaultImageEditDraft } from "../src/core/defaults";
import type { ImageReference } from "../src/types";
import {
  imageEditEnqueueBlockReason,
  videoEnqueueBlockReason
} from "../src/renderer/pages/create/view-model";

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
    expect(imageEditEnqueueBlockReason(draft, undefined)).toBe("");
  });

  it("checks the image-to-video prompt after its required start image", () => {
    expect(videoCheck({ promptText: "", startImagePath: "start.png" })).toBe("请先填写提示词");
    expect(videoCheck({ promptText: "camera pushes in" })).toBe("");
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
});
