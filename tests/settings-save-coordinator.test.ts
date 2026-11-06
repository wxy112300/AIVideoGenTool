import { describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { SettingsSaveCoordinator } from "../src/renderer/pages/settings/settings-save-coordinator";
import type { EnvironmentScanResult } from "../src/types";

describe("SettingsSaveCoordinator", () => {
  it("refreshes localized environment and node notices after a language-only save", async () => {
    let state = createDefaultState();
    const refreshEnvironment = vi.fn(async () => ({} as EnvironmentScanResult));
    const notifySaved = vi.fn();
    const coordinator = new SettingsSaveCoordinator({
      getState: () => state, getEnvironmentScan: () => null, loadLocale: vi.fn(async () => undefined),
      saveSettings: vi.fn(async settings => ({ ...state, settings })),
      saveImageDraft: vi.fn(async () => undefined), saveDraft: vi.fn(async () => undefined),
      getBundledWorkflow: vi.fn(async () => null), setState: next => { state = next; },
      clearSettingsDraft: vi.fn(), syncSettingsDirtyUi: vi.fn(), deleteBundledWorkflow: vi.fn(),
      cacheBundledWorkflow: vi.fn(), refreshEnvironment, requestDirectoryMigration: vi.fn(),
      notifySaved, requestRender: vi.fn()
    });
    for (const uiLocale of ["en-US", "zh-TW"] as const) {
      await coordinator.requestSave({ ...state.settings, uiLocale });
      expect(refreshEnvironment).toHaveBeenLastCalledWith(state.settings);
      expect(state.settings.uiLocale).toBe(uiLocale);
    }
    expect(refreshEnvironment).toHaveBeenCalledTimes(2);
    // Saving unchanged language should not trigger another expensive environment scan.
    await coordinator.requestSave(state.settings);
    expect(refreshEnvironment).toHaveBeenCalledTimes(2);
    expect(notifySaved).toHaveBeenCalledTimes(3);
  });
  it("preserves the settings draft and skips model/scan effects for immediate appearance", async () => {
    const state = createDefaultState();
    const clearSettingsDraft = vi.fn(), refreshEnvironment = vi.fn(async () => null), loadLocale = vi.fn(async () => undefined);
    const appearance = { accent: "green", palette: "sand", depth: "2", motion: "reduced" } as const;
    const saved = { ...state, settings: { ...state.settings, appearance } };
    const saveSettings = vi.fn(async () => saved), setState = vi.fn(), updateDraftAppearance = vi.fn();
    const coordinator = new SettingsSaveCoordinator({
      getState: () => state, getEnvironmentScan: () => null, loadLocale, saveSettings,
      saveImageDraft: vi.fn(async () => undefined), saveDraft: vi.fn(async () => undefined),
      getBundledWorkflow: vi.fn(async () => null), setState, clearSettingsDraft, updateDraftAppearance,
      syncSettingsDirtyUi: vi.fn(), deleteBundledWorkflow: vi.fn(), cacheBundledWorkflow: vi.fn(),
      refreshEnvironment, requestDirectoryMigration: vi.fn(), notifySaved: vi.fn(), requestRender: vi.fn()
    });
    await coordinator.saveAppearance(appearance);
    expect(saveSettings).toHaveBeenCalledWith({ ...state.settings, appearance }, "appearance");
    expect(setState).toHaveBeenCalledWith(saved);
    expect(updateDraftAppearance).toHaveBeenCalledWith(appearance);
    expect(clearSettingsDraft).not.toHaveBeenCalled();
    expect(refreshEnvironment).not.toHaveBeenCalled();
    expect(loadLocale).not.toHaveBeenCalled();
  });
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
