// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModelComponentStatus } from "../src/types";
import { renderSettingsInstallGuideDialog } from "../src/renderer/pages/settings/fragments";
import { mountSettingsPageController, type SettingsPageControllerOptions } from "../src/renderer/pages/settings/page-controller";
import { modelComponentWithLocations, openModelComponentLocation } from "../src/renderer/pages/settings/model-location";

afterEach(() => { document.body.innerHTML = ""; });

function component(found: boolean, matches: string[]): ModelComponentStatus {
  return { label: "Model", expected: "model.safetensors", found, matches,
    installGuide: { sourceLabel: "Fixture", downloadUrl: "https://example.invalid/model", targetSubdirectory: "loras", recommendedFilename: "model.safetensors" } };
}

describe("model and LoRA folder action", () => {
  it("resolves scanner-relative models, separate prompt roots, RIFE node weights and absolute Strata files without changing scan data", () => {
    const scanned = component(true, ["loras/style.safetensors", "prompt_models/vision/model.gguf", "frame_interpolation/rife47.pth", "E:\\Strata\\model.gguf"]);
    const resolved = modelComponentWithLocations(scanned, { modelDirectory: "D:\\Models", promptModelDirectory: "F:\\Prompt", comfyRoot: "C:\\ComfyUI" });
    expect(resolved.matches).toEqual(["D:/Models/loras/style.safetensors", "F:/Prompt/vision/model.gguf", "D:/Models/prompt_models/vision/model.gguf", "D:/Models/frame_interpolation/rife47.pth", "C:/ComfyUI/custom_nodes/ComfyUI-Frame-Interpolation/ckpts/rife/rife47.pth", "E:\\Strata\\model.gguf"]);
    expect(scanned.matches[0]).toBe("loras/style.safetensors");
  });
  it.each(["diffusion_models/base.safetensors", "loras/style.safetensors", "text_encoders/encoder.gguf"])("clicking an installed %s reveals its scanned path", async file => {
    const selected = { profileName: "Fixture", component: component(true, [`D:/Actual model library/${file}`]) };
    document.body.innerHTML = renderSettingsInstallGuideDialog({ configuredModelDirectory: "C:/Default models", selectedInstallGuide: selected }, { icon: () => "", escapeHtml: value => value, t: key => key, locale: "zh-CN" });
    const showItemInFolder = vi.fn(async () => true), openDirectory = vi.fn(async () => true);
    const cleanup = mountSettingsPageController({ context: { root: document.body, hostCapabilities: { showItemInFolder, openDirectory }, notify: vi.fn(), t: key => key }, getInstallGuide: () => selected } as unknown as SettingsPageControllerOptions);
    try {
      document.querySelector<HTMLButtonElement>("#open-install-directory")!.click();
      await vi.waitFor(() => expect(showItemInFolder).toHaveBeenCalledWith(selected.component.matches[0]));
      expect(openDirectory).not.toHaveBeenCalled();
    } finally { cleanup(); }
  });

  it("keeps undownloaded components on the create-and-open directory path", async () => {
    const host = { showItemInFolder: vi.fn(async () => true), openDirectory: vi.fn(async () => true) };
    expect(await openModelComponentLocation(host, component(false, []), "D:/Models/loras")).toBe(true);
    expect(host.showItemInFolder).not.toHaveBeenCalled();
    expect(host.openDirectory).toHaveBeenCalledWith("D:/Models/loras");
  });

  it("tries surviving matches before creating/opening the target directory", async () => {
    const host = { showItemInFolder: vi.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("Missing")).mockResolvedValueOnce(true), openDirectory: vi.fn(async () => true) };
    expect(await openModelComponentLocation(host, component(true, ["", "D:/Gone", "D:/Moved", "E:/Existing/model.gguf"]), "D:/Models")).toBe(true);
    expect(host.showItemInFolder).toHaveBeenLastCalledWith("E:/Existing/model.gguf");
    expect(host.openDirectory).not.toHaveBeenCalled();
    host.showItemInFolder.mockResolvedValue(false);
    expect(await openModelComponentLocation(host, component(true, ["D:/Gone"]), "D:/Models")).toBe(true);
    expect(host.openDirectory).toHaveBeenCalledWith("D:/Models");
  });

  it("allows a found file without a configured download root and reports total failure", async () => {
    const selected = { profileName: "Fixture", component: component(true, ["E:/Library/model.gguf"]) };
    document.body.innerHTML = renderSettingsInstallGuideDialog({ configuredModelDirectory: "", selectedInstallGuide: selected }, { icon: () => "", escapeHtml: value => value, t: key => key, locale: "zh-CN" });
    expect(document.querySelector<HTMLButtonElement>("#open-install-directory")!.disabled).toBe(false);
    const host = { showItemInFolder: vi.fn(async () => false), openDirectory: vi.fn(async () => { throw new Error("Denied"); }) };
    expect(await openModelComponentLocation(host, selected.component, "")).toBe(false);
    expect(host.openDirectory).not.toHaveBeenCalled();
    expect(await openModelComponentLocation(host, selected.component, "D:/Models")).toBe(false);
  });
});
