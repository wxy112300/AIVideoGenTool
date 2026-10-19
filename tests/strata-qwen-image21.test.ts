import { describe, expect, it, vi } from "vitest";
import { buildStrataPromptRequest, enhancePromptWithStrata } from "../electron/services/strata-prompt";
import { strataQwenImage21InstructionParts, STRATA_QWEN_IMAGE21_PROFILE } from "../src/core/prompts/qwen-image-2-1/strata";
import { createDefaultImagePromptPresets, createDefaultState } from "../src/core/defaults";
import { compileQwenImage21Prompt } from "../src/core/image-workflow/qwen-image-2-1";
import type { EnhanceRequest } from "../src/types";

const settings = { ...createDefaultState().settings, promptModelId: "strata/qwen3.8-flash-next-iq3_xxs" };
const request: EnhanceRequest = { mode: "image-edit", origin: "image-edit", imageTargetModelId: "qwen-image-2-1",
  modelId: settings.promptModelId, prompt: "保持房间不变，摄影机向左换45度视角。", imageEditEnhanceMode: "detail-enhance" };
const signal = () => new AbortController().signal;

describe("Strata Qwen Image 2.1 authored editing profile", () => {
  it.each(["qwen-image-2-1", "qwen-image-2-1-turbo", "qwen-image-2-1-uncensored-gguf", "qwen-image-2-1-uncensored-gguf-q6"])("routes %s to a separate system contract and sends images before the brief", async imageTargetModelId => {
    const encode = vi.fn(async () => ({ type: "image_url" as const, image_url: { url: "data:image/png;base64,fixture" } }));
    const chat = await buildStrataPromptRequest({ ...request, imageTargetModelId, imagePaths: ["room.png"] }, settings, signal(), encode);
    expect(chat.messages[0]).toMatchObject({ role: "system" });
    expect(chat.messages[0].content).toContain(STRATA_QWEN_IMAGE21_PROFILE);
    const content = chat.messages[1].content;
    expect(content[0]).toMatchObject({ type: "image_url" });
    expect(JSON.stringify(content)).toContain(request.prompt);
    expect(chat).toMatchObject({ maxTokens: 4096, automaticOutputBudget: true, contextSize: 32768 });
    expect(chat.reasoning).toBeUndefined();
  });

  it("drops only exact old factory presets, preserving custom preferences and original data", () => {
    const defaults = createDefaultImagePromptPresets();
    const req = { ...request, imagePaths: ["room.png"], imageEditPresetText: defaults["detail-enhance"] };
    const parts = strataQwenImage21InstructionParts(req);
    expect(parts.contract).not.toContain(defaults["detail-enhance"]);
    expect(req.imageEditPresetText).toBe(defaults["detail-enhance"]);
    expect(strataQwenImage21InstructionParts({ ...req, imageEditPresetText: "Preserve my pencil medium." }).contract).toContain("Preserve my pencil medium.");
    expect(parts.contract).toContain("not the old projected composition");
    expect(parts.contract).toContain("Do not simultaneously lock the old perspective");
  });

  it("does not hallucinate an edit or reference in text-to-image mode and keeps faithful mode distinct", () => {
    const parts = strataQwenImage21InstructionParts({ ...request, imageEditEnhanceMode: "faithful" });
    expect(parts.contract).toContain("This is text-to-image");
    expect(parts.contract).not.toContain("Example — request:");
    expect(parts.contract).toContain("Faithful mode:");
    expect(parts.sourceData).toContain(request.prompt);
  });

  it.each([
    "移除右下角水印，保留左上角店名。", "修复压缩与模糊，保留脸和色彩。", "摄影机左移45度，场景布局不变。",
    "人物站起来举起自己的右手，服饰不变。", "移除右侧人物，保留左边两个人。", "把图2的人放到图1左侧，高度占画面1/3。",
    "在花瓶右边放一个20cm红色方块，不是画面20%。"
  ])("retains the complete task for an authored recipe: %s", prompt => {
    const parts = strataQwenImage21InstructionParts({ ...request, prompt, imagePaths: ["base.png", "donor.png"] });
    expect(parts.sourceData).toContain(prompt);
    expect(parts.contract).toContain("Removal / watermark cleanup:");
    expect(parts.contract).toContain("Size / placement:");
    expect(parts.contract).not.toContain("at least 450");
  });

  it("keeps stable sparse slots compatible with final guide insertion/remapping", () => {
    const req = { ...request, imagePaths: ["base.png", "person.png"],
      referenceContext: "Input image 1 / Slot 1 / Picture 1 = canvas\nInput image 2 / Slot 3 / Picture 3 = person" };
    const parts = strataQwenImage21InstructionParts(req);
    expect(parts.contract).toContain("stable Picture N");
    expect(parts.sourceData).toContain("Input image 2 / Slot 3 / Picture 3");
    const compiled = compileQwenImage21Prompt("Place the person from <image3> on the left of <image1>.", [
      { id: "base", pictureNumber: 1, absolutePath: "base.png", width: 1024, height: 1024, role: "base" },
      { id: "person", pictureNumber: 3, absolutePath: "person.png", width: 1024, height: 1024, role: "subject" }
    ]);
    expect(compiled.errors).toEqual([]);
    expect(compiled.prompt).toContain("<image2>");
    expect(compiled.prompt).not.toContain("<image3>");
  });

  it("leaves legacy image targets on their existing pack", async () => {
    const chat = await buildStrataPromptRequest({ ...request, imageTargetModelId: "qwen-image-edit-2511" }, settings, signal());
    expect(chat.messages).toHaveLength(1);
    expect(JSON.stringify(chat.messages)).not.toContain(STRATA_QWEN_IMAGE21_PROFILE);
    const revision = await buildStrataPromptRequest({ ...request, promptStrategy: "targeted-revision" }, settings, signal());
    expect(revision.messages).toHaveLength(1);
    expect(JSON.stringify(revision.messages)).not.toContain(STRATA_QWEN_IMAGE21_PROFILE);
    const explicitRewrite = await buildStrataPromptRequest({ ...request, promptStrategy: "rewrite" }, settings, signal());
    expect(explicitRewrite.messages[0].content).toContain(STRATA_QWEN_IMAGE21_PROFILE);
  });

  it("saves a valid short simple edit without a word gate and exposes the profile in progress logs", async () => {
    const onProgress = vi.fn(), owner = { chat: vi.fn(async () => "Remove the watermark; preserve everything else.") };
    expect(await enhancePromptWithStrata({ ...request, prompt: "去水印。" }, settings, owner, signal(), onProgress)).toBe("Remove the watermark; preserve everything else.");
    expect(onProgress.mock.calls[0][2]).toContain(STRATA_QWEN_IMAGE21_PROFILE);
  });
});
