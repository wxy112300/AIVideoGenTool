import { beforeAll, describe, expect, it } from "vitest";
import { createTranslator, loadUiLocale } from "../src/core/i18n";
import { modelCatalog } from "../src/core/catalog";
import { imageModelCapabilityFor } from "../src/core/image-workflow";
import { imageModelOptionNote } from "../src/renderer/shared/image-option-label";

beforeAll(async () => { await Promise.all([loadUiLocale("en-US"), loadUiLocale("zh-TW")]); });

describe("image model picker copy", () => {
  it.each(["zh-CN", "zh-TW", "en-US"] as const)("keeps input differences concise and accurate (%s)", locale => {
    const { t } = createTranslator(locale);
    for (const model of modelCatalog.list("image")) {
      const note = imageModelOptionNote(model.definition.id, t);
      const capability = imageModelCapabilityFor(model.definition.id);
      expect(note.length).toBeLessThan(60);
      expect(note).not.toMatch(/safetensors|checkpoint|ComfyUI|offload|Python|workflow|工作流/);
      if (capability.maxPictures && !capability.operation) expect(note).toContain(String(capability.maxPictures));
      if (capability.operation === "inpaint") expect(note).toMatch(/蒙版|遮罩|mask/i);
    }
  });
});
