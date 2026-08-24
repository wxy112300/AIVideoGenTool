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

const missingLora: ModelScanProfile = {
  id: "minimax-h3-camera-motion-v1",
  name: "MiniMax H3 Camera Motion v1",
  category: "lora",
  badge: "H3 专属 · 运镜",
  description: "增强推近、拉远、环绕、跟拍和航拍等镜头运动。",
  vram: "LoRA · camera motion · strength 0.8",
  available: false,
  integrated: true,
  components: [{
    label: "Camera Motion LoRA",
    expected: "loras/camera_motion_h3_lora_v1_3000_pruned.safetensors",
    found: false,
    optional: false,
    matches: []
  }]
};

describe("Settings LoRA card layout", () => {
  it("separates the decision summary from progressive usage details", () => {
    const markup = renderSettingsModelScanCard(missingLora, options);

    expect(markup).toContain("model-profile missing lora-profile");
    expect(markup).toContain("lora-profile-summary");
    expect(markup).toContain("lora-profile-hardware");
    expect(markup).toContain("lora-profile-guide");
    expect(markup).toContain("model-profile-guide");
    expect(markup).toContain("component-row missing");
    expect(markup).toContain("component-state");
    expect(markup).toContain("circle-alert");
    expect(markup).toContain("<strong>Camera Motion LoRA</strong>");
    expect(markup).toContain("settings.system.scanCardMissing");
    expect(markup).toContain("loras/camera_motion_h3_lora_v1_3000_pruned.safetensors");
    expect(markup).toContain("settings.system.scanCardMissingCount");
    expect(markup).toContain("shared.lora.effects");
    expect(markup).toContain("shared.lora.stacking");
    expect(markup).toContain("shared.lora.compatibility");
    expect(markup).not.toContain("video-lora-info");
    expect(markup).not.toContain("lora-profile-purpose");
    expect(markup).not.toContain("lora-profile-overview");
    expect(markup).not.toContain("lora-profile-status");
    expect(markup).not.toContain("model-profile-details");
    expect(markup).not.toContain("profile-label");
    expect(markup).not.toContain("shared.lora.strength");
    expect(markup).not.toContain("shared.lora.source");
    expect(markup).not.toContain("settings.system.scanCardEvidence");
    expect(markup).not.toContain("settings.system.scanCardNodeNotRequired");
    expect(markup).not.toContain("settings.system.scanCardRuntimeNotRequired");
  });
});
