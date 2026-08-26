import { describe, expect, it } from "vitest";
import { defaultPrompt } from "../src/core/defaults";
import { defaultH3PromptPresets } from "../src/core/h3-prompt-presets";
import { h3PromptPackFor } from "../src/core/prompts/h3";
import { createDefaultQwenImagePromptPresets } from "../src/core/qwen-image-prompt";
import { promptSnippets } from "../src/core/prompt-suggestions";
import { renderImageEditPromptInstructionOptions } from "../src/renderer/pages/create/fragments";
import { createTranslator } from "../src/core/i18n";
import {
  h3ReferenceRolePromptLabels,
  imageReferenceRolePromptLabels
} from "../src/renderer/pages/create/helpers";

const cjkPattern = /[\u3400-\u9fff]/u;

describe("model-facing prompt language", () => {
  it("keeps built-in prompt values in English", () => {
    expect(defaultPrompt).not.toMatch(cjkPattern);
    expect(Object.values(defaultH3PromptPresets).every((value) => !cjkPattern.test(value))).toBe(true);
    expect(Object.values(createDefaultQwenImagePromptPresets()).every((value) => !cjkPattern.test(value))).toBe(true);
    expect(promptSnippets.every((snippet) => !cjkPattern.test(snippet.text))).toBe(true);
    expect(Object.values(h3ReferenceRolePromptLabels).every((value) => !cjkPattern.test(value))).toBe(true);
    expect(Object.values(imageReferenceRolePromptLabels).every((value) => !cjkPattern.test(value))).toBe(true);
  });

  it("keeps image shortcut values in English while allowing localized labels", () => {
    const markup = renderImageEditPromptInstructionOptions(
      (value) => String(value),
      createTranslator("zh-CN").t
    );
    const values = [...markup.matchAll(/<option value="([^"]*)"/gu)].map((match) => match[1] ?? "");
    expect(values.length).toBeGreaterThan(1);
    expect(values.every((value) => !cjkPattern.test(value))).toBe(true);
  });

  it("localizes the detailed cinematic preset without changing its model-facing text", () => {
    expect(h3PromptPackFor("zh-CN").presetLabels["detailed-cinematic"]).toBe("影视细节扩写");
    expect(h3PromptPackFor("zh-TW").presetLabels["detailed-cinematic"]).toBe("影視細節擴寫");
    expect(h3PromptPackFor("en-US").presetLabels["detailed-cinematic"]).toBe("Detailed cinematic expansion");
    expect(h3PromptPackFor("zh-CN").defaultPresets["detailed-cinematic"]).not.toMatch(cjkPattern);
  });
});
