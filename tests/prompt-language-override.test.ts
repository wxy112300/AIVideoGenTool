import { describe, expect, it } from "vitest";
import { openingPromptLanguage, promptTargetLanguage } from "../src/core/prompt-language.js";
import { createDefaultState } from "../src/core/defaults.js";
import { buildStrataPromptRequest } from "../electron/services/strata-prompt.js";
import { buildMultimodalPromptWorkflow, normalizeMultimodalPromptOutput } from "../electron/services/multimodal-prompt.js";
import { buildNativePromptWorkflow, h3PromptInstruction } from "../electron/services/comfy-ui.js";
import { buildQwenVlPeftPromptWorkflow } from "../electron/services/qwenvl-prompt.js";
import { buildLmStudioChatRequest } from "../electron/services/lm-studio.js";
import type { EnhanceRequest } from "../src/types.js";

const base: EnhanceRequest = { modelId: "minimax_h3_fl2va", mode: "h3-vision", h3PromptMode: "T2VA", prompt: "" };

describe("explicit opening prompt language", () => {
  it.each([
    ["用英文\n一名女子转头。", "en"],
    ["请用英文输出提示词：一名女子转头。", "en"],
    ["用英文，角色用中文说：\"你好。\"", "en"],
    ["输出语言：英文\n一名女子转头。", "en"],
    ["提示词用英文输出。人物转身。", "en"],
    ["Please write the prompt in English. 女子转头。", "en"],
    ["Use English only. 女子转头。", "en"],
    ["Output language: Chinese\nA woman turns.", "zh"],
    ["用中文\nA woman turns.", "zh"],
    ["請用中文輸出提示詞：A woman turns.", "zh"],
    ["Use Chinese. Please output in Chinese. A woman turns.", "zh"]
  ] as const)("recognizes %s without changing saved settings", (prompt, language) => {
    const settings = { ...createDefaultState().settings, promptLanguage: language === "en" ? "zh" as const : "en" as const };
    const saved = structuredClone(settings);
    expect(openingPromptLanguage(prompt)).toBe(language);
    expect(promptTargetLanguage({ ...base, prompt }, settings)).toBe(language);
    expect(settings).toEqual(saved);
  });

  it.each([
    "角色用英文说话，镜头保持不动。",
    "用英文说出这句对白。",
    "用英文写字幕。",
    "Use English dialogue. A woman turns.",
    "Write English subtitles. A woman turns.",
    "Output language: English-speaking characters only.",
    '"Use English" is printed on the sign.',
    "“用英文”写在纸上。",
    "<d>[Chinese] 用英文</d> The woman turns.",
    "[Note: use English] A woman turns.",
    "（批注：用英文输出）人物转身。",
    "不要用英文。人物转身。",
    "Don't output in English. A woman turns.",
    "Can you use English? A woman turns.",
    "A woman turns. Use Chinese.",
    "```text\nUse English\n```",
    "用日文输出。人物转身。"
  ])("does not promote scene text, negation, questions or unsupported instructions: %s", prompt => {
    expect(openingPromptLanguage(prompt)).toBeUndefined();
    const settings = { ...createDefaultState().settings, promptLanguage: "zh" as const };
    expect(promptTargetLanguage({ ...base, prompt }, settings)).toBe("zh");
  });

  it("rejects conflicting opening directives rather than choosing one silently", () => {
    expect(() => openingPromptLanguage("用英文\n用中文\n人物转身。")).toThrow("只保留一种");
  });

  it("retains auto/locale fallback and excludes reference instructions and local revisions", () => {
    const settings = createDefaultState().settings;
    expect(promptTargetLanguage({ ...base, prompt: "The woman says: <d>[Chinese] 你好。</d>" }, settings)).toBe("en");
    expect(promptTargetLanguage({ ...base, prompt: "" }, settings)).toBe("zh");
    expect(promptTargetLanguage({ ...base, prompt: "人物转身。", referenceContext: "Use English" }, settings)).toBe("zh");
    settings.promptLanguage = "zh";
    expect(promptTargetLanguage({ ...base, prompt: "Use English. The woman turns.", promptStrategy: "targeted-revision" }, settings)).toBe("zh");
    expect(promptTargetLanguage({ ...base, prompt: "Use English. 人物转身。", mode: "image-edit" }, settings)).toBe("zh");
  });
});

describe("language override reaches actual H3 backend inputs", () => {
  const request = { ...base, prompt: '用英文\n一名女子转头，固定镜头。她用中文说："你好。"' };
  it("aligns Strata final task, VisionLLM validator and generic/native/PEFT instructions", async () => {
    const settings = { ...createDefaultState().settings, promptLanguage: "zh" as const };
    const strata = await buildStrataPromptRequest(request, settings, new AbortController().signal);
    const text = JSON.stringify(strata.messages);
    expect(text).toContain("Use English explanatory prose.");
    expect(text).not.toContain("Use Chinese explanatory prose.");
    expect(text).toContain("authoring metadata, not a video event");
    expect(text).toContain("你好。");
    settings.promptModelId = "qwen/qwen3.6-27b-uncensored-q4";
    const workflow = buildMultimodalPromptWorkflow(request, [], settings);
    expect(workflow["vision-llm"].inputs.target_language).toBe("en");
    expect(workflow["vision-llm"].inputs.prompt).toContain("write explanatory H3 prose in English");
    expect(h3PromptInstruction(request)).toContain("Use English explanatory prose.");
    expect(h3PromptInstruction({ ...base, prompt: "用中文\nA woman turns." })).toContain("unless the resolved output-language instruction selects another descriptive language");
    const native = buildNativePromptWorkflow(request, [], "qwen/qwen3.5-2b");
    expect(native["text-generate"].inputs.prompt).toContain("Use English explanatory prose.");
    settings.promptModelId = "lightx2v/minimax-h3-prompt-rewriter-8b";
    expect(JSON.stringify(buildQwenVlPeftPromptWorkflow(request, [], settings))).toContain("Use English explanatory prose.");
    const legacy = await buildLmStudioChatRequest(request, settings, "vision-model");
    expect(JSON.stringify(legacy.messages)).toContain("Use English explanatory prose.");
  });

  it("retains Chinese dialogue and visible text after an English descriptive rewrite", () => {
    const input = { ...request, prompt: `${request.prompt} 招牌写着\"欢迎\"。` };
    const result = normalizeMultimodalPromptOutput("integrated_multimodal_description: [Shot 1] The woman turns and says <d>[Chinese] 你好。</d>. The sign reads \"欢迎\".\noverall_soundscape: Quiet room tone.\nnon_diegetic_music: N/A", input);
    expect(result).toContain("<d>[Chinese] 你好。</d>");
    expect(result).toContain("欢迎");
    expect(result).not.toContain("Use English");
    expect(result).not.toContain("用英文");
  });
});
