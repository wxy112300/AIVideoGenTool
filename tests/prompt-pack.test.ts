import { describe, expect, it } from "vitest";
import { h3PromptPackFor, qwenImagePromptPackFor } from "../src/core/prompts";

describe("prompt packs", () => {
  it("exposes the purified H3-executable visual craft snippet with localized indexes in every H3 mode", () => {
    const snippets = (["zh-CN", "zh-TW", "en-US"] as const).map(locale =>
      h3PromptPackFor(locale).snippets.find(snippet => snippet.id === "visual-photorealistic-quality")!);
    expect(snippets.map(snippet => snippet.label)).toEqual([
      "真实皮肤与织物质感（去塑料感）", "真實皮膚與織物質感（去塑膠感）", "Natural skin & fabric realism (anti-plastic)"
    ]);
    expect(snippets[0].text).toBe(snippets[1].text);
    expect(snippets[0].text).toBe(snippets[2].text);
    expect(snippets[0].text).toContain("Live-action photographic texture");
    expect(snippets[0].text).toContain("natural skin pores");
    expect(snippets[0].text).toContain("interlocking fabric weave");
    expect(snippets[0].text).not.toMatch(/Preserve the requested action|choose only details|negative_prompt|8K|masterpiece|oil painting|CGI/iu);
    expect(h3PromptPackFor("zh-CN").snippets).toHaveLength(20);
    for (const id of ["visual-macro-closeup", "capture-85mm-portrait"]) {
      const zh = h3PromptPackFor("zh-CN").snippets.find(snippet => snippet.id === id);
      const en = h3PromptPackFor("en-US").snippets.find(snippet => snippet.id === id);
      const tw = h3PromptPackFor("zh-TW").snippets.find(snippet => snippet.id === id);
      expect(zh?.text).toBeTruthy();
      expect(zh?.text).toBe(en?.text);
      expect(zh?.text).toBe(tw?.text);
      expect(zh?.label).not.toBe(en?.label);
    }
  });

  it("localizes snippet indexes without translating inserted prompt text", () => {
    const zhSnippet = h3PromptPackFor("zh-CN").snippets.find((snippet) => snippet.id === "camera-push-in");
    const twSnippet = h3PromptPackFor("zh-TW").snippets.find((snippet) => snippet.id === "camera-push-in");
    const enSnippet = h3PromptPackFor("en-US").snippets.find((snippet) => snippet.id === "camera-push-in");

    expect(zhSnippet?.label).toBe("慢速推近");
    expect(twSnippet?.label).toBe("慢速推近");
    expect(enSnippet?.label).toBe("Slow dolly push-in");
    expect(zhSnippet?.text).toBe(enSnippet?.text);
    expect(zhSnippet?.text).toContain("The camera pushes in");
  });

  it("provides a localized one-take shortcut with a stable model-facing lock", () => {
    const zhSnippet = h3PromptPackFor("zh-CN").snippets.find((snippet) => snippet.id === "camera-continuous-take");
    const twSnippet = h3PromptPackFor("zh-TW").snippets.find((snippet) => snippet.id === "camera-continuous-take");
    const enSnippet = h3PromptPackFor("en-US").snippets.find((snippet) => snippet.id === "camera-continuous-take");

    expect(zhSnippet?.label).toBe("一镜到底 · 禁止切镜头");
    expect(twSnippet?.label).toBe("一鏡到底 · 禁止切鏡頭");
    expect(enSnippet?.label).toBe("One continuous take · no cuts");
    expect(zhSnippet?.text).toBe(twSnippet?.text);
    expect(zhSnippet?.text).toBe(enSnippet?.text);
    expect(zhSnippet?.text).toContain("One continuous unbroken take");
    expect(zhSnippet?.text).toContain("no editorial cut");
    expect(zhSnippet?.text).not.toMatch(/dissolves|wipes|montage|shot resets|teleportation/iu);
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
