// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultSettings } from "../src/core/defaults";
import { renderSettingsPathField } from "../src/renderer/pages/settings/path-field";
import { readSettingsFromForm } from "../src/renderer/pages/settings/form";
import { mountSettingsPageController, type SettingsPageControllerOptions } from "../src/renderer/pages/settings/page-controller";

afterEach(() => { document.body.innerHTML = ""; });

describe("editable settings path row", () => {
  it("lets the environment row choose the configured ComfyUI installation through the existing picker", async () => {
    document.body.innerHTML = '<button data-pick-environment-comfy></button><button id="pick-comfy-install-directory"></button><input id="comfy-install-directory">';
    const settings = createDefaultSettings();
    const pickDirectory = vi.fn(async () => "D:\\Selected ComfyUI");
    const setSettingsDraft = vi.fn(), scan = vi.fn(async () => null);
    const cleanup = mountSettingsPageController({
      context: { root: document.body, hostCapabilities: { pickDirectory } },
      formSettings: () => ({ ...settings, comfyInstallDirectory: document.querySelector<HTMLInputElement>("input")!.value }),
      setSettingsDraft, runEnvironmentScan: scan
    } as unknown as SettingsPageControllerOptions);
    try {
      document.querySelector<HTMLButtonElement>("[data-pick-environment-comfy]")!.click();
      await vi.waitFor(() => expect(scan).toHaveBeenCalled());
      expect(pickDirectory).toHaveBeenCalledTimes(1);
      expect(setSettingsDraft.mock.calls[0]?.[0].comfyInstallDirectory).toBe("D:\\Selected ComfyUI");
    } finally { cleanup(); }
  });
  function render() {
    const automatic = 'D:\\素材 & "references"';
    document.body.innerHTML = renderSettingsPathField({
      id: "image-input-library-directory", pickerId: "pick-image-input-library-directory",
      label: "Input library", value: automatic, automatic, placeholder: "Auto",
      chooseLabel: "Choose directory", openLabel: "Open directory", icon: () => ""
    });
    return document.querySelector<HTMLInputElement>("input")!;
  }

  it("keeps the detected input library automatic until the user edits it", () => {
    const input = render();
    const base = { ...createDefaultSettings(), imageInputLibraryDirectory: "" };
    expect(input.labels?.[0]?.textContent).toBe("Input library");
    expect(readSettingsFromForm(base, "official-storyboard", "faithful").imageInputLibraryDirectory).toBe("");
    input.value = "D:\\My inputs";
    expect(readSettingsFromForm(base, "official-storyboard", "faithful").imageInputLibraryDirectory).toBe(input.value);
  });

  it("opens the current edited path and reports host failure without saving the draft", async () => {
    const input = render();
    const openDirectory = vi.fn(async () => false), notify = vi.fn(), save = vi.fn();
    const cleanup = mountSettingsPageController({
      context: { root: document.body, hostCapabilities: { openDirectory }, notify, t: (key: string) => key },
      requestSaveSettings: save
    } as unknown as SettingsPageControllerOptions);
    try {
      input.value = "D:\\Edited path";
      document.querySelector<HTMLButtonElement>("[data-settings-open-path]")!.click();
      await vi.waitFor(() => expect(notify).toHaveBeenCalled());
      expect(openDirectory).toHaveBeenCalledWith(input.value);
      expect(save).not.toHaveBeenCalled();
      input.value = "";
      document.querySelector<HTMLButtonElement>("[data-settings-open-path]")!.click();
      expect(openDirectory).toHaveBeenCalledTimes(1);
    } finally { cleanup(); }
  });
});
