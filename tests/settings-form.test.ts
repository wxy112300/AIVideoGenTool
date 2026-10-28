import { describe, expect, it, vi } from "vitest";
import { readSettingsFromForm } from "../src/renderer/pages/settings/form";
import { createDefaultSettings } from "../src/core/defaults";

describe("settings form", () => {
  it("retains a saved model while its select has no scanned options, but accepts an explicit empty option", () => {
    const previousDocument = globalThis.document;
    const base = createDefaultSettings();
    const model = { value: "", tagName: "SELECT", selectedIndex: -1 };
    globalThis.document = { querySelector: vi.fn((id: string) => id === "#default-upscale-model" ? model : null) } as unknown as Document;
    try {
      expect(readSettingsFromForm(base, "official-storyboard", "faithful").defaultUpscaleModel).toBe(base.defaultUpscaleModel);
      model.selectedIndex = 0;
      expect(readSettingsFromForm(base, "official-storyboard", "faithful").defaultUpscaleModel).toBe("");
    } finally { globalThis.document = previousDocument; }
  });
  it("keeps detected ComfyUI paths automatic on browse, but reads an actual edit", () => {
    const previousDocument = globalThis.document;
    const base = { ...createDefaultSettings(), comfyInstallDirectory: "", comfyPythonPath: "" };
    const install = { value: "C:\\Detected\\ComfyUI", dataset: { autoDirectory: "C:\\Detected\\ComfyUI" } };
    const python = { value: "C:\\Detected\\python.exe", dataset: { autoDirectory: "C:\\Detected\\python.exe" } };
    globalThis.document = { querySelector: vi.fn((id: string) => id === "#comfy-install-directory" ? install : id === "#comfy-python-path" ? python : null) } as unknown as Document;
    try {
      const unchanged = readSettingsFromForm(base, "official-storyboard", "faithful");
      expect(unchanged).toEqual(base);
      python.value = "D:\\Other\\python.exe";
      expect(readSettingsFromForm(base, "official-storyboard", "faithful").comfyPythonPath).toBe(python.value);
    } finally { globalThis.document = previousDocument; }
  });
  it("reads reasoning effort and retains it when the Strata control is hidden", () => {
    const previous = globalThis.document, base = { ...createDefaultSettings(), strataReasoningEffort: "high" as const };
    globalThis.document = { querySelector: vi.fn(() => null) } as unknown as Document;
    try {
      expect(readSettingsFromForm(base, "official-storyboard", "faithful").strataReasoningEffort).toBe("high");
      globalThis.document = { querySelector: vi.fn((id: string) => id === "#strata-reasoning-effort" ? { value: "off" } : null) } as unknown as Document;
      expect(readSettingsFromForm(base, "official-storyboard", "faithful").strataReasoningEffort).toBe("off");
    } finally { globalThis.document = previous; }
  });
  it("reads one uncensored preference and retains it while its Strata control is hidden", () => {
    const previousDocument = globalThis.document;
    const base = { ...createDefaultSettings(), strataUncensored: true, strataUncensoredMode: "community" as const };
    const querySelector = vi.fn(() => null as unknown);
    globalThis.document = { querySelector } as unknown as Document;
    try {
      expect(readSettingsFromForm(base, "official-storyboard", "faithful").strataUncensored).toBe(true);
      expect(readSettingsFromForm(base, "official-storyboard", "faithful").strataUncensoredMode).toBe("community");
      querySelector.mockImplementation((...args: unknown[]) => args[0] === "#strata-uncensored" ? { value: "off" } : null);
      expect(readSettingsFromForm(base, "official-storyboard", "faithful").strataUncensored).toBe(false);
      expect(readSettingsFromForm(base, "official-storyboard", "faithful").strataUncensoredMode).toBe("off");
    } finally { globalThis.document = previousDocument; }
  });
  it("keeps preparation fields across tabs and reads visible Strata inputs", () => {
    const previousDocument = globalThis.document;
    const base = { ...createDefaultSettings(), strataModelDirectory: "D:\\Models", strataPort: 43129 };
    globalThis.document = { querySelector: vi.fn((selector: string) => selector === "#strata-install-directory" ? { value: " D:\\Strata " } : null) } as unknown as Document;
    try {
      const settings = readSettingsFromForm(base, "official-storyboard", "faithful");
      expect(settings).toMatchObject({ strataInstallDirectory: "D:\\Strata", strataModelDirectory: "D:\\Models", strataPort: 43129, promptModelId: base.promptModelId });
    } finally { globalThis.document = previousDocument; }
  });
  it("reads the selected UI locale instead of retaining the old locale", () => {
    const previousDocument = globalThis.document;
    globalThis.document = {
      querySelector: vi.fn((selector: string) =>
        selector === "#ui-locale"
          ? { value: "en-US" }
          : null
      )
    } as unknown as Document;

    try {
      const settings = readSettingsFromForm(
        createDefaultSettings(),
        "official-storyboard",
        "faithful"
      );
      expect(settings.uiLocale).toBe("en-US");
    } finally {
      globalThis.document = previousDocument;
    }
  });

  it("reads the selected auto-video seed and its edited instruction", () => {
    const previousDocument = globalThis.document;
    globalThis.document = {
      querySelector: vi.fn((selector: string) => {
        if (selector === "#h3-auto-prompt-seed-setting") return { value: "camera-discovery" };
        if (selector === "#h3-auto-prompt-seed-text") return { value: "CUSTOM AUTO DIRECTION" };
        return null;
      })
    } as unknown as Document;

    try {
      const settings = readSettingsFromForm(
        createDefaultSettings(),
        "official-storyboard",
        "faithful"
      );
      expect(settings.h3AutoPromptSeedId).toBe("camera-discovery");
      expect(settings.h3AutoPromptSeedInstructions["camera-discovery"]).toBe("CUSTOM AUTO DIRECTION");
    } finally {
      globalThis.document = previousDocument;
    }
  });

  it("reads the model download source and keeps the legacy mirror flag in sync", () => {
    const previousDocument = globalThis.document;
    globalThis.document = {
      querySelector: vi.fn((selector: string) =>
        selector === "#model-download-source"
          ? { value: "gitee" }
          : null
      )
    } as unknown as Document;

    try {
      const settings = readSettingsFromForm(
        createDefaultSettings(),
        "official-storyboard",
        "faithful"
      );
      expect(settings.hfMirrorEnabled).toBe(true);
      expect(settings.modelDownloadSource).toBe("gitee");
    } finally {
      globalThis.document = previousDocument;
    }
  });

  it("reads the selected queue isolation mode", () => {
    const previousDocument = globalThis.document;
    globalThis.document = {
      querySelector: vi.fn((selector: string) =>
        selector === "#queue-isolation-mode"
          ? { value: "model-change" }
          : null
      )
    } as unknown as Document;

    try {
      const settings = readSettingsFromForm(
        createDefaultSettings(),
        "official-storyboard",
        "faithful"
      );
      expect(settings.queueIsolationMode).toBe("model-change");
    } finally {
      globalThis.document = previousDocument;
    }
  });

  it("reads the selected VRAM stall watchdog window", () => {
    const previousDocument = globalThis.document;
    globalThis.document = {
      querySelector: vi.fn((selector: string) =>
        selector === "#vram-stall-watchdog-minutes"
          ? { value: "1" }
          : null
      )
    } as unknown as Document;

    try {
      const settings = readSettingsFromForm(
        createDefaultSettings(),
        "official-storyboard",
        "faithful"
      );
      expect(settings.vramStallWatchdogMinutes).toBe(1);
    } finally {
      globalThis.document = previousDocument;
    }
  });

  it("reads the selected H3 video VAE backend", () => {
    const previousDocument = globalThis.document;
    globalThis.document = {
      querySelector: vi.fn((selector: string) =>
        selector === "#h3-video-vae-mode"
          ? { value: "int8-convrot" }
          : null
      )
    } as unknown as Document;

    try {
      const settings = readSettingsFromForm(
        createDefaultSettings(),
        "official-storyboard",
        "faithful"
      );
      expect(settings.h3VideoVaeMode).toBe("int8-convrot");
    } finally {
      globalThis.document = previousDocument;
    }
  });
});
