import { describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { SettingsSaveCoordinator } from "../src/renderer/pages/settings/settings-save-coordinator";
import type { EnvironmentScanResult } from "../src/types";

describe("SettingsSaveCoordinator", () => {
  it("requests migration before saving a changed output directory", async () => {
    const state = createDefaultState();
    const nextSettings = {
      ...state.settings,
      outputDirectory: "D:\\ComfyUI\\output"
    };
    const saveSettings = vi.fn(async () => state);
    const requestDirectoryMigration = vi.fn();
    const coordinator = new SettingsSaveCoordinator({
      getState: () => state,
      getEnvironmentScan: () => ({
        outputDirectory: "C:\\ComfyUI\\output"
      } as EnvironmentScanResult),
      loadLocale: vi.fn(async () => undefined),
      saveSettings,
      saveImageDraft: vi.fn(async () => state),
      saveDraft: vi.fn(async () => state),
      getBundledWorkflow: vi.fn(async () => null),
      setState: vi.fn(),
      clearSettingsDraft: vi.fn(),
      syncSettingsDirtyUi: vi.fn(),
      deleteBundledWorkflow: vi.fn(),
      cacheBundledWorkflow: vi.fn(),
      refreshEnvironment: vi.fn(async () => null),
      requestDirectoryMigration,
      notifySaved: vi.fn(),
      requestRender: vi.fn()
    });

    await expect(coordinator.requestSave(nextSettings)).resolves.toBe("migration-required");
    expect(requestDirectoryMigration).toHaveBeenCalledWith(
      state.settings,
      nextSettings,
      "C:\\ComfyUI\\output",
      "D:\\ComfyUI\\output"
    );
    expect(saveSettings).not.toHaveBeenCalled();
  });
});
