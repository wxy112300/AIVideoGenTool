import { describe, expect, it } from "vitest";
import { createTranslator } from "../src/core/i18n";
import { createDefaultDraft } from "../src/core/defaults";
import { createModelOptionViewModels } from "../src/renderer/pages/create/helpers";

describe("creation model mode filtering", () => {
  it("hides video models that do not support the extension workflow", () => {
    const draft = {
      ...createDefaultDraft(),
      inputMode: "video" as const,
      modelId: "minimax_h3_fl2va",
      workflowPath: ""
    };
    const options = createModelOptionViewModels(
      draft,
      null,
      {},
      {},
      createTranslator("zh-CN").t
    );
    const ids = options.map((option) => option.id);
    expect(ids).toContain("minimax_h3_fl2va");
    expect(ids).toContain("minimax_h3_ref2va");
    expect(ids).toContain("sulphur2");
    expect(ids).not.toContain("minimax_h3_fl2va_q3_gguf");
    expect(ids).not.toContain("wan22_5b");
    expect(ids).not.toContain("hunyuan15");
  });
});
