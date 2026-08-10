import { describe, expect, it } from "vitest";
import {
  createDefaultQwenImagePromptPresets,
  normalizeQwenImagePromptPresets,
  normalizeQwenImageEditPromptOutput,
  qwenImageEditPromptContract,
  qwenImageEditPromptUserContent
} from "../src/core/qwen-image-prompt.js";
import { qwenImageEditEnhancerContract } from "../src/core/image-prompt.js";

describe("Qwen Image Edit prompt contract", () => {
  it("provides English faithful and detail-enhance rules", () => {
    const presets = createDefaultQwenImagePromptPresets();
    expect(presets.faithful).toContain("one concise, direct English paragraph");
    expect(presets["detail-enhance"]).toContain("visual feasibility");
    expect(presets.faithful).not.toMatch(/[\u3400-\u9fff]/u);
    expect(presets["detail-enhance"]).not.toMatch(/[\u3400-\u9fff]/u);
  });

  it("migrates the previous Chinese built-in defaults but preserves custom rules", () => {
    const normalized = normalizeQwenImagePromptPresets({
      faithful: "只整理和细化用户明确提出的图片编辑意图，不得新增或推断人物、物品、背景、文字、Logo、水印、动作、风格、材质、光照或构图。保持用户明确的主体、编辑范围和限制不变。",
      "detail-enhance": "My custom image editing policy."
    });

    expect(normalized.faithful).not.toMatch(/[\u3400-\u9fff]/u);
    expect(normalized["detail-enhance"]).toBe("My custom image editing policy.");
  });

  it("describes Qwen edit operations without H3 video fields", () => {
    const contract = qwenImageEditPromptContract("detail-enhance", "CUSTOM RULE");
    const content = qwenImageEditPromptUserContent({
      prompt: "把 Picture 2 的人物放到 Picture 1 的场景中。",
      modelId: "qwen-image-edit-2511",
      mode: "image-edit",
      referenceContext: "Picture 1 = base image\nPicture 2 = person"
    });

    expect(contract).toContain("add, delete, or replace");
    expect(contract).toContain("visible text");
    expect(contract).toContain("CUSTOM RULE");
    expect(contract).not.toContain("integrated_multimodal_description");
    expect(contract).not.toContain("non_diegetic_music");
    expect(content).toContain("Output only the final English image-edit prompt");
    expect(content).toContain("Picture 2");
  });

  it("normalizes wrapped model output to one clean paragraph", () => {
    expect(normalizeQwenImageEditPromptOutput(
      "```text\ndetailed_description:\nReplace the sign.\noverall_soundscape:\nN/A\n```"
    )).toBe("Replace the sign.");
  });

  it("keeps the legacy image prompt import aligned with the Qwen contract", () => {
    expect(qwenImageEditEnhancerContract("faithful", "CUSTOM RULE")).toBe(
      qwenImageEditPromptContract("faithful", "CUSTOM RULE")
    );
  });
});
