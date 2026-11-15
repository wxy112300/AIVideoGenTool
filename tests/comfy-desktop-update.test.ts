import { afterEach, describe, expect, it, vi } from "vitest";
const { findInstallation, launchDesktop } = vi.hoisted(() => ({ findInstallation: vi.fn(), launchDesktop: vi.fn() }));
vi.mock("../electron/services/comfy-discovery", async importOriginal => ({
  ...await importOriginal<typeof import("../electron/services/comfy-discovery")>(), findComfyInstallation: findInstallation
}));
vi.mock("../electron/services/local-service-process", async importOriginal => ({
  ...await importOriginal<typeof import("../electron/services/local-service-process")>(), launchDesktopApplication: launchDesktop
}));
import { updateComfyUi } from "../electron/services/environment";
import { pythonProbeCache } from "../electron/services/python-probe-cache";
import { createDefaultSettings } from "../src/core/defaults";

afterEach(() => { vi.restoreAllMocks(); findInstallation.mockReset(); launchDesktop.mockReset(); });

describe("Desktop update entry", () => {
  it("opens the selected official executable without mutating Python probe readiness", async () => {
    findInstallation.mockResolvedValue({ type: "desktop", executable: "D:\\Desktop\\Comfy Desktop.exe" });
    launchDesktop.mockResolvedValue(123);
    const mutation = vi.spyOn(pythonProbeCache, "beginMutation");
    const invalidate = vi.spyOn(pythonProbeCache, "invalidate");
    await expect(updateComfyUi(createDefaultSettings())).resolves.toMatchObject({ ok: true });
    expect(launchDesktop).toHaveBeenCalledWith("D:\\Desktop\\Comfy Desktop.exe");
    expect(mutation).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("returns launch failure to the UI instead of reporting success", async () => {
    findInstallation.mockResolvedValue({ type: "desktop", executable: "missing.exe" });
    launchDesktop.mockRejectedValue(new Error("ENOENT"));
    await expect(updateComfyUi(createDefaultSettings())).resolves.toMatchObject({ ok: false, message: expect.stringContaining("ENOENT") });
  });
});
