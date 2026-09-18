import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const page = readFileSync(path.resolve("src/renderer/pages/create/page.ts"), "utf8");
const viewModel = readFileSync(path.resolve("src/renderer/pages/create/view-model.ts"), "utf8");
const controller = readFileSync(path.resolve("src/renderer/pages/create/page-controller.ts"), "utf8");

describe("H3 latent save control contract", () => {
  it("keeps the existing select with exactly save/do-not-save options", () => {
    expect(page).toContain('<select id="h3-latent-save-mode"');
    expect(page).not.toContain('id="h3-latent-save-mode" type="checkbox"');
    expect(viewModel).toContain("saveLatentEnabled");
    expect(viewModel).toContain("saveLatentDisabled");
    expect(viewModel).toContain('["all", uiKeys.create.videoSettings.saveLatentEnabled]');
    expect(viewModel).toContain('["none", uiKeys.create.videoSettings.saveLatentDisabled]');
    expect(viewModel).toContain("h3LatentSaveModeTipKeys");
    expect(viewModel).toContain("data-description");
    expect(viewModel).toContain("title=\"${escapeHtml(t(h3LatentSaveModeTipKeys[mode]))}\"");
    expect(page).not.toContain("type=\"checkbox\"");
    expect(controller).toContain("HTMLSelectElement");
    expect(controller).toContain('value === "all"');
  });

  it("keeps explanations in the interactive field-info icon", () => {
    expect(page).toContain("jointAvLabelMarkup");
    expect(viewModel).toContain("fieldLabelWithTip(");
    expect(viewModel).toContain("saveLatentManagedTip");
  });
});
