// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { groupSettingsLoras, sharedSettingsComponentPaths } from "../src/renderer/pages/settings/model-presentation";
import { mountSettingsPageController, type SettingsPageControllerOptions } from "../src/renderer/pages/settings/page-controller";
import { renderSettingsModelScanCard, type SettingsModelScanCardOptions } from "../src/renderer/pages/settings/fragments";
import { VIDEO_LORA_DEFINITIONS, IMAGE_LORA_DEFINITIONS } from "../src/core/catalog/loras/definitions";
import type { ModelScanProfile } from "../src/types";

const profile = (id: string): ModelScanProfile => ({ id, name: "Localized name", category: "lora", badge: "", description: "", vram: "", available: false, integrated: true, components: [] });

describe("settings catalog interactions", () => {
  it("marks only scanned shared paths and keeps independent Strata roots separate", () => {
    const component = { label: "VAE", expected: "vae/model", found: true, matches: ["vae/model"] };
    expect([...sharedSettingsComponentPaths([{ ...profile("a"), components: [component] }, { ...profile("b"), components: [{ ...component, matches: ["VAE\\model"] }] }])]).toEqual(["vae/model"]);
    expect(sharedSettingsComponentPaths([{ ...profile("a"), managedBy: "strata", components: [component] }, { ...profile("b"), managedBy: "strata", components: [component] }]).size).toBe(0);
  });
  it("groups LoRAs by actual compatibility, keeps unknown future entries and preserves each once", () => {
    const profiles = [...IMAGE_LORA_DEFINITIONS, ...VIDEO_LORA_DEFINITIONS].map(item => profile(item.id));
    profiles.push(profile("future-adapter"));
    const groups = groupSettingsLoras(profiles);
    expect(groups[0].key).toBe("minimax-h3");
    expect(groups.find(group => group.key === "minimax-h3:r2v")?.profiles.length).toBeGreaterThan(0);
    expect(groups.find(group => group.key === "qwen-image")?.profiles.length).toBe(IMAGE_LORA_DEFINITIONS.length);
    expect(groups.at(-1)?.profiles[0].id).toBe("future-adapter");
    expect(groups.flatMap(group => group.profiles).map(item => item.id).sort()).toEqual(profiles.map(item => item.id).sort());
  });

  it("keeps each model's disclosure state across a remount and leaves other models closed", () => {
    const root = document.createElement("main"); document.body.append(root);
    const markup = '<details data-settings-disclosure-key="files:a"><summary>Files</summary><button>Source</button></details><details data-settings-disclosure-key="files:b"><summary>Other</summary></details>';
    const options = { context: { root } } as unknown as SettingsPageControllerOptions;
    root.innerHTML = markup;
    let cleanup = mountSettingsPageController(options);
    try {
      root.querySelector("details")!.open = true;
      cleanup(); root.innerHTML = markup; cleanup = mountSettingsPageController(options);
      expect(root.querySelector("details")!.open).toBe(true);
      expect(root.querySelectorAll("details")[1].open).toBe(false);
      root.querySelector("details")!.open = false;
      cleanup(); root.innerHTML = markup; cleanup = mountSettingsPageController(options);
      expect(root.querySelector("details")!.open).toBe(false);
    } finally { cleanup(); root.remove(); }
  });

  it("keeps optional and alternative files distinct from missing required groups", () => {
    const root = document.createElement("div");
    const component = { label: "File", expected: "file.safetensors", matches: [], found: false };
    const model = { ...profile("model"), category: "video" as const, available: true, components: [
      { ...component, found: true, alternativeGroup: "vae", matches: ["vae/fp16.safetensors"] },
      { ...component, alternativeGroup: "vae" }, { ...component, optional: true }
    ] };
    const options = { locale: "zh-CN", t: (key: string) => key, icon: () => "", escapeHtml: (text: string) => text, isGemmaPromptModel: () => false, isComfyMultimodalPromptModel: () => false, isQwenVlPeftPromptModel: () => false } as unknown as SettingsModelScanCardOptions;
    root.innerHTML = renderSettingsModelScanCard(model, options);
    expect(root.querySelector(".settings-files-collapsed")?.textContent).toBe("模型文件 1/3");
    expect(root.querySelectorAll(".component-row.missing")).toHaveLength(0);
    expect(root.querySelectorAll(".component-row.warning")).toHaveLength(2);
  });
});
