// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { modelCatalog, customNodeCatalog } from "../src/core/catalog";
import { createTranslator, loadUiLocale } from "../src/core/i18n";
import { localizeNodeRuntimeRequirement } from "../src/core/catalog/dependencies/localized";
import { localizeModelResourceText, localizeModelScanProfile } from "../src/renderer/shared/model-profile-labels";
import { renderSettingsModelScanCard } from "../src/renderer/pages/settings/fragments";
import { settingsNodePurpose } from "../src/renderer/pages/settings/copy";
import { escapeHtml } from "../src/renderer/shared/dom";
import type { ModelScanProfile } from "../src/types";

describe("Settings catalog display localization", () => {
  it("renders every built-in model's component labels and resource explanation in English without changing evidence", async () => {
    await loadUiLocale("en-US");
    const t = createTranslator("en-US").t;
    for (const entry of modelCatalog.entries) {
      const scans = [entry.definition.scan, ...Object.values(entry.definition.scanVariants ?? {})].filter(s => s != null);
      for (const scan of scans) {
        const profile: ModelScanProfile = {
          id: entry.definition.id, name: entry.locales["zh-CN"]?.name ?? entry.definition.id,
          category: entry.definition.category, badge: "", description: "", vram: scan.vram,
          available: false, integrated: true,
          components: scan.components.map(c => ({ ...c, found: false, matches: [] }))
        };
        const before = structuredClone(profile);
        const root = document.createElement("div");
        root.innerHTML = renderSettingsModelScanCard(profile, {
          t, locale: "en-US", escapeHtml, icon: () => "",
          isGemmaPromptModel: () => false, isComfyMultimodalPromptModel: () => false,
          isQwenVlPeftPromptModel: () => false, videoLoraInfoButton: () => "", imageWorkflowStatus: () => ""
        });
        const labels = [...root.querySelectorAll(".settings-component-line strong")].map(n => n.textContent);
        expect(labels.join(" "), profile.id).not.toMatch(/\p{Script=Han}/u);
        expect(root.querySelector(".model-meta-line")?.textContent ?? "", profile.id).not.toMatch(/\p{Script=Han}/u);
        expect(root.querySelector("h3")?.textContent, profile.id).not.toMatch(/\p{Script=Han}/u);
        const copy = root.cloneNode(true) as HTMLElement;
        copy.querySelectorAll("code").forEach(node => node.remove());
        expect(copy.textContent, profile.id).not.toMatch(/\p{Script=Han}/u);
        expect(profile).toEqual(before);
        expect([...root.querySelectorAll(".component-row code")].map(n => n.textContent)).toEqual(scan.components.map(c => c.expected));
      }
    }
  });

  it("localizes every registered node's purpose and requirements while preserving unknown metadata", async () => {
    await loadUiLocale("en-US");
    const t = createTranslator("en-US").t;
    for (const node of customNodeCatalog) {
      expect(localizeNodeRuntimeRequirement(node.id, node.runtimeRequirement ?? "", createTranslator("zh-CN").t), node.id).toBe(node.runtimeRequirement ?? "");
      expect(settingsNodePurpose("en-US", node.id, node.purpose), node.id).not.toMatch(/\p{Script=Han}/u);
      expect(localizeNodeRuntimeRequirement(node.id, node.runtimeRequirement ?? "", t), node.id).not.toMatch(/\p{Script=Han}/u);
    }
    const unknown: ModelScanProfile = { id: "user-model", name: "用户模型", category: "video", badge: "用户标签", description: "保留说明", vram: "用户测量", available: true, integrated: true, components: [] };
    expect(localizeModelScanProfile(unknown, "en-US", t)).toBe(unknown);
    expect(localizeModelResourceText("C:\\用户模型\\model.safetensors", t)).toBe("C:\\用户模型\\model.safetensors");
    expect(localizeNodeRuntimeRequirement("future-node", "第三方原始说明", t)).toBe("第三方原始说明");
  });
});
