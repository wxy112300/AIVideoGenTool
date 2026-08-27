import { describe, expect, it } from "vitest";
import type { ModelScanProfile } from "../src/types";
import {
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
    expect(markup).toContain("settings.system.scanCardResourcePolicy");
    expect(markup).toContain("settings.system.scanCardRecommendedHardware");
    expect(markup).toContain("settings.system.scanCardFileComplete");
    expect(markup).not.toContain("settings.system.scanCardEvidence");
    expect(markup).not.toContain("settings.system.scanCardNodeNotRequired");
    expect(markup).not.toContain("settings.system.scanCardRuntimeNotRequired");
    expect(markup).not.toContain("model.meta.fileReady");
    expect(markup).not.toContain("model.meta.workflowPending");
  });

  it("puts prompt backend dependencies in the model description instead of a scan-status line", () => {
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

    expect(markup).toContain("<p class=\"muted\">A multimodal prompt model. · 通过 ComfyUI Prompt Writer 处理视频和图片提示词</p>");
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

    expect(markup).toContain("<p class=\"muted\">A model that needs a runtime node. · 缺少运行节点：UpscaleNode</p>");
    expect(markup).not.toContain("settings.system.scanCardEvidence");
    expect(markup).not.toContain("settings.system.scanCardRuntimeNotRequired");
  });
});
