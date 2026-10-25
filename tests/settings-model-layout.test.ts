// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { ModelScanProfile } from "../src/types";
import { settingsNodePurpose } from "../src/renderer/pages/settings/copy";
import {
  renderSettingsInstallGuideDialog,
  renderSettingsModelScanCard,
  type SettingsModelScanCardOptions
} from "../src/renderer/pages/settings/fragments";

const options: SettingsModelScanCardOptions = {
  icon: (name) => `<i data-lucide="${name}"></i>`,
  escapeHtml: (value) => value,
  t: (key) => key,
  locale: "zh-CN",
  isGemmaPromptModel: () => false,
  isComfyMultimodalPromptModel: () => false,
  isQwenVlPeftPromptModel: () => false,
  videoLoraInfoButton: () => "",
  imageWorkflowStatus: () => ""
};

const component = (label = "Model file", found = true) => ({
  label,
  expected: "diffusion_models/model.safetensors",
  found,
  matches: found ? ["diffusion_models/model.safetensors"] : [],
  installGuide: {
    sourceLabel: "Model source",
    downloadUrl: "https://example.invalid/model",
    targetSubdirectory: "diffusion_models",
    recommendedFilename: "model.safetensors"
  }
});

describe("Settings model card layout", () => {
  it("uses the current language instead of stale scan descriptions and keeps unknown node purposes", () => {
    const profile: ModelScanProfile = { id: "strata/qwen3.8-flash-next-iq3_xxs", name: "旧中文名称", category: "prompt", badge: "", description: "旧中文扫描缓存", vram: "24 GB", available: true, integrated: true, components: [] };
    const root = document.createElement("div"); root.innerHTML = renderSettingsModelScanCard(profile, { ...options, locale: "en-US" });
    expect(root.querySelector(".settings-model-description")?.textContent).toBe("Multimodal prompt model with image understanding and MTP acceleration.");
    expect(root.textContent).not.toContain("旧中文");
    expect(root.querySelector(".model-meta-line")?.textContent).toBe("24 GB");
    expect(profile.description).toBe("旧中文扫描缓存");
    expect(settingsNodePurpose("en-US", "h3-continuum", "旧描述")).toContain("continuation");
    expect(settingsNodePurpose("zh-TW", "h3-motion-context", "旧描述")).toContain("來源影片");
    expect(settingsNodePurpose("en-US", "future-node", "Future purpose")).toBe("Future purpose");
  });
  it.each(["zh-CN", "zh-TW", "en-US"] as const)("shows located files without download instructions for an installed component (%s)", locale => {
    const markup = renderSettingsInstallGuideDialog({ configuredModelDirectory: "C:\\models", selectedInstallGuide: { profileName: "Video", component: component() } }, { ...options, locale });
    const root = document.createElement("div"); root.innerHTML = markup;
    expect(markup).not.toContain("settings.system.installGuideDownloadInstruction");
    expect(root.querySelector("#open-install-download")?.textContent).toBe(locale === "en-US" ? "View source" : locale === "zh-TW" ? "檢視來源" : "查看来源");
    expect(root.querySelectorAll(".install-guide-fields code").length).toBeGreaterThanOrEqual(3);
    expect(root.querySelector("#open-install-directory")?.hasAttribute("disabled")).toBe(false);
  });
  it("does not attach ComfyUI TextGenerate dependencies to Strata preparation", () => {
    const markup = renderSettingsModelScanCard({ id: "strata/example", name: "Strata", category: "prompt", managedBy: "strata", badge: "Preparation", description: "Independent runtime", vram: "24GB", available: true, integrated: false, components: [component()] }, options);
    expect(markup).not.toContain("TextGenerate");
    expect(markup).toContain("settings.system.scanCardIntegrationPending");
  });
  it("keeps only useful resource metadata beside the top-right availability status", () => {
    const profile: ModelScanProfile = {
      id: "video-model",
      name: "Video model",
      category: "video",
      badge: "Native",
      description: "A useful model description.",
      vram: "24 GB",
      available: true,
      integrated: true,
      components: [component()]
    };

    const markup = renderSettingsModelScanCard(profile, options);

    expect(markup).toContain("A useful model description.");
    expect(markup).toContain("model-meta-line");
    expect(markup).not.toContain("settings.system.scanCardResourcePolicy");
    const root = document.createElement("div"); root.innerHTML = markup;
    expect(root.querySelector(".model-meta-line")?.textContent).toBe("24 GB");
    expect(root.querySelector(".model-hardware-recommendation")).toBeNull();
    expect(markup).toContain("settings.system.scanCardFileComplete");
    expect(markup).not.toContain("settings.system.scanCardEvidence");
    expect(markup).not.toContain("settings.system.scanCardNodeNotRequired");
    expect(markup).not.toContain("settings.system.scanCardRuntimeNotRequired");
    expect(markup).not.toContain("model.meta.fileReady");
    expect(markup).not.toContain("model.meta.workflowPending");
  });

  it("keeps the localized prompt description free of redundant backend and scan-status copy", () => {
    const profile: ModelScanProfile = {
      id: "community/gemma-4-e4b-unconcerned-q5",
      name: "Gemma 4 E4B",
      category: "prompt",
      badge: "Uncensored",
      description: "A multimodal prompt model.",
      vram: "Q5 · 6 GB",
      available: true,
      integrated: true,
      requiredCustomNodeIds: ["minimax-h3-prompt-writer"],
      missingCustomNodeIds: [],
      components: [component("Gemma GGUF")]
    };

    const markup = renderSettingsModelScanCard(profile, {
      ...options,
      isGemmaPromptModel: () => true
    });

    const root = document.createElement("div"); root.innerHTML = markup;
    expect(root.querySelector(".settings-model-description")?.textContent).toContain("多模态");
    expect(root.querySelector(".settings-model-description")?.textContent).not.toContain("通过 ComfyUI Prompt Writer");
    expect(markup).not.toContain("model.meta.gemmaReady");
    expect(markup).not.toContain("settings.system.scanCardEvidence");
  });

  it("keeps missing runtime dependencies actionable without restoring scan-status boilerplate", () => {
    const profile: ModelScanProfile = {
      id: "runtime-model",
      name: "Runtime model",
      category: "upscale",
      badge: "Native",
      description: "A model that needs a runtime node.",
      vram: "12 GB",
      available: true,
      integrated: true,
      runtimeVerified: true,
      runtimeReady: false,
      runtimeMissingNodes: ["UpscaleNode"],
      components: [component()]
    };

    const markup = renderSettingsModelScanCard(profile, options);

    const root = document.createElement("div"); root.innerHTML = markup;
    expect(root.querySelector(".settings-model-blocker")?.textContent).toBe("缺少运行节点：UpscaleNode");
    expect(root.querySelector(".settings-model-blocker")?.closest("details")).toBeNull();
    expect(markup).not.toContain("settings.system.scanCardEvidence");
    expect(markup).not.toContain("settings.system.scanCardRuntimeNotRequired");
  });

  it("starts files collapsed and exposes the prototype's labeled download action for missing components", () => {
    const profile: ModelScanProfile = {
      id: "minimax_h3_fl2va",
      name: "MiniMax H3 FL2VA",
      category: "video",
      badge: "FL2VA",
      description: "H3 model",
      vram: "20 GB",
      available: false,
      integrated: true,
      components: [component("H3 base model", false)]
    };

    const markup = renderSettingsModelScanCard(profile, options);
    const root = document.createElement("div"); root.innerHTML = markup;
    const action = root.querySelector<HTMLButtonElement>("[data-install-profile]")!;
    expect(action.dataset.installProfile).toBe("minimax_h3_fl2va");
    expect(action.dataset.installComponent).toBe("0");
    expect(action.getAttribute("aria-label")).toContain("H3 base model");
    expect(action.textContent).toBe("下载");
    expect(action.querySelector('[data-lucide="download"]')).not.toBeNull();
    expect(root.querySelector<HTMLDetailsElement>(".settings-model-files")?.open).toBe(false);
    expect(root.querySelector(".settings-files-collapsed")?.textContent).toContain("模型文件 0/1");
  });

  it("shows pinned revision, size, and hash in the install guide", () => {
    const baseComponent = component("H3 base model", false);
    const markup = renderSettingsInstallGuideDialog({
      configuredModelDirectory: "C:\\ComfyUI\\models",
      selectedInstallGuide: {
        profileName: "MiniMax H3 FL2VA",
        component: {
          ...baseComponent,
          installGuide: {
            ...baseComponent.installGuide,
            revision: "revision-1234567890",
            bytes: 2048,
            sha256: "hash-123"
          }
        }
      }
    }, {
      icon: options.icon,
      escapeHtml: options.escapeHtml,
      t: options.t,
      locale: options.locale
    });

    expect(markup).toContain("revision-1234567890");
    expect(markup).toContain("2.00 KB");
    expect(markup).toContain("hash-123");
  });

});
