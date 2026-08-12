import { describe, expect, it } from "vitest";
import { h3PromptPackFor, qwenImagePromptPackFor } from "../src/core/prompts";

describe("prompt packs", () => {
  it("localizes snippet indexes without translating inserted prompt text", () => {
    const zhSnippet = h3PromptPackFor("zh-CN").snippets.find((snippet) => snippet.id === "camera-push-in");
    const twSnippet = h3PromptPackFor("zh-TW").snippets.find((snippet) => snippet.id === "camera-push-in");
    const enSnippet = h3PromptPackFor("en-US").snippets.find((snippet) => snippet.id === "camera-push-in");

    expect(zhSnippet?.label).toBe("慢速推近");
    expect(twSnippet?.label).toBe("慢速推近");
    expect(enSnippet?.label).toBe("Slow push-in");
    expect(zhSnippet?.text).toBe(enSnippet?.text);
    expect(zhSnippet?.text).toContain("The camera pushes in");
  });

  it("keeps model-facing preset content stable across locales", () => {
    const zhPack = h3PromptPackFor("zh-CN");
    const twPack = h3PromptPackFor("zh-TW");
    const enPack = h3PromptPackFor("en-US");
    expect(zhPack.defaultPresets).toEqual(enPack.defaultPresets);
    expect(twPack.defaultPresets).toEqual(enPack.defaultPresets);
    expect(qwenImagePromptPackFor("zh-CN").defaultPresets)
      .toEqual(qwenImagePromptPackFor("en-US").defaultPresets);
  });
});
