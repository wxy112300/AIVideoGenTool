import { describe, expect, it } from "vitest";
import {
  createDefaultQwenImagePromptPresets,
  normalizeQwenImagePromptPresets,
  normalizeQwenImageEditPromptOutput,
  qwenImageEditPromptContract,
  qwenImageEditPromptUserContent
} from "../src/core/qwen-image-prompt.js";
import {
  imageEditPromptContractForTarget,
  imageEditPromptUserContentForTarget,
  qwenImageEditEnhancerContract
} from "../src/core/image-prompt.js";

describe("Qwen Image Edit prompt contract", () => {
  it("provides English faithful and detail-enhance rules", () => {
    const presets = createDefaultQwenImagePromptPresets();
    expect(presets.faithful).toContain("one concise, direct English paragraph");
    expect(presets["detail-enhance"]).toContain("visual feasibility");
    expect(presets.faithful).not.toMatch(/[\u3400-\u9fff]/u);
    expect(presets["detail-enhance"]).not.toMatch(/[\u3400-\u9fff]/u);
  });

  it("preserves custom rules and falls back to English defaults", () => {
    const normalized = normalizeQwenImagePromptPresets({
      faithful: "",
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

  it("selects a Z-Image-specific contract without changing the Qwen default", () => {
    const request = {
      prompt: "把视角改成低机位，并给窗台增加细致的木纹。",
      modelId: "qwen2.5-vl",
      imageTargetModelId: "z-image-turbo",
      mode: "image-edit" as const,
      imagePaths: ["source.png"],
      referenceContext: "Picture 1 = base image"
    };
    const contract = imageEditPromptContractForTarget("z-image-turbo", "detail-enhance");
    const content = imageEditPromptUserContentForTarget(request);
    expect(contract).toContain("Z-Image and Z-Image-Turbo");
    expect(contract).toContain("camera angle");
    expect(contract).toContain("Mask");
    expect(contract).toContain("negative prompts");
    expect(content).toContain("one reference image is supplied as Picture 1");
    expect(content).toContain("低机位");
    expect(imageEditPromptContractForTarget("qwen-image-edit-2511", "faithful")).toContain(
      "Qwen-Image-Edit-2511"
    );
  });

  it("selects the HiDream-O1 contract for layout, viewpoint, and local edits", () => {
    const request = {
      prompt: "把 Picture 1 改成低机位，并给招牌增加清晰的白色文字。",
      modelId: "qwen2.5-vl",
      imageTargetModelId: "hidream-o1-image",
      mode: "image-edit" as const,
      imagePaths: ["source.png"],
      referenceContext: "Picture 1 = base image"
    };
    const contract = imageEditPromptContractForTarget("hidream-o1-image", "detail-enhance");
    const content = imageEditPromptUserContentForTarget(request);
    expect(contract).toContain("HiDream-O1-Image Full");
    expect(contract).toContain("visible text");
    expect(contract).toContain("camera angle");
    expect(contract).toContain("Mask");
    expect(content).toContain("one reference image is supplied as Picture 1");
    expect(content).toContain("低机位");
  });
});
