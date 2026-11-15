// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createDefaultSettings } from "../src/core/defaults";
import type { EnvironmentScanResult } from "../src/types";
import type { RendererContext } from "../src/renderer/contracts";
import { renderSettingsEnvironmentOverview } from "../src/renderer/pages/settings/fragments";
import { mountSettingsPageController, type SettingsPageControllerOptions } from "../src/renderer/pages/settings/page-controller";
import { mountSettingsServiceController, type SettingsServiceControllerOptions } from "../src/renderer/pages/settings/service-controller";

const settings = createDefaultSettings();
const scan = (mode = "desktop") => ({ comfyCompatibility: { updateMode: mode } }) as EnvironmentScanResult;

describe("environment actions", () => {
  it("opens every missing prerequisite download through the host and reports failures", async () => {
    const urls = ["https://www.comfy.org/download", "https://nodejs.org/en/download", "https://git-scm.com/downloads", "https://ffmpeg.org/download.html", "https://developer.nvidia.com/cuda-downloads", "https://www.nvidia.com/Download/index.aspx"];
    const ids = ["comfyui", "node", "git", "ffmpeg", "cuda-toolkit", "nvidia"] as const;
    const root = document.createElement("div");
    root.innerHTML = renderSettingsEnvironmentOverview({
      environmentScan: { scannedAt: "2026-11-16" } as EnvironmentScanResult,
      environmentItems: ids.map((id, i) => ({ id, label: id, ok: false, tone: "missing", detail: "Missing", downloadUrl: urls[i] })),
      environmentScanning: false, environmentScanError: "", serviceStarting: null, serviceRestarting: null,
      serviceForceStopping: false, serviceStatusMessage: "", queueRunning: false, hasRunningQueueTask: false
    }, { icon: () => "", escapeHtml: value => value, t: key => key, locale: "en-US", formatScanTime: () => "now" });
    const openExternal = vi.fn().mockResolvedValue(true);
    const notify = vi.fn();
    const context = { root, notify, t: (key: string) => key, hostCapabilities: { openExternal } } as unknown as RendererContext;
    const cleanup = mountSettingsPageController({ context, formSettings: () => settings } as SettingsPageControllerOptions);
    const buttons = root.querySelectorAll<HTMLButtonElement>("[data-open-environment-download]");
    expect(buttons).toHaveLength(6);
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].click();
      await vi.waitFor(() => expect(openExternal).toHaveBeenLastCalledWith(urls[i]));
    }
    openExternal.mockRejectedValueOnce(new Error("browser failed"));
    buttons[0].click();
    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith(expect.any(String), { kind: "error" }));
    cleanup();
  });

  it.each(["desktop", "git"])("%s update gives immediate feedback; only git refreshes the environment", async mode => {
    const root = document.createElement("div");
    root.innerHTML = '<button id="update-comfyui">Open</button>';
    const updateComfyUi = vi.fn().mockResolvedValue({ ok: true, message: "Opened" });
    const refreshEnvironment = vi.fn().mockResolvedValue(scan(mode));
    const setComfyUpdating = vi.fn();
    const notify = vi.fn();
    const context = { root, application: { updateComfyUi }, notify, t: (key: string) => key,
      requestRender: vi.fn(), getRoute: () => ({ page: "settings" }) } as unknown as RendererContext;
    const options = { formSettings: () => settings, getEnvironmentScan: () => scan(mode),
      refreshEnvironment, setComfyUpdating, setSettingsDraft: vi.fn(), setComfyUpdateLog: vi.fn(),
      setServiceStatusMessage: vi.fn() } as unknown as SettingsServiceControllerOptions;
    const cleanup = mountSettingsServiceController(context, options);
    root.querySelector<HTMLButtonElement>("button")!.click();
    await vi.waitFor(() => expect(setComfyUpdating).toHaveBeenLastCalledWith(false));
    expect(updateComfyUi).toHaveBeenCalledWith(settings);
    expect(notify).toHaveBeenCalledWith("Opened");
    expect(refreshEnvironment).toHaveBeenCalledTimes(mode === "desktop" ? 0 : 1);
    cleanup();
  });
});
