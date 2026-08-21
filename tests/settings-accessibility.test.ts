import { describe, expect, it } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import type { EnvironmentScanResult, ModelScanProfile } from "../src/types";
import {
  renderSettingsPage,
  type SettingsPageOptions,
  type SettingsPageViewModel
} from "../src/renderer/pages/settings/page";

const state = createDefaultState();
const translate: SettingsPageOptions["t"] = (key) => key;
const renderOptions = {
  t: translate,
  defaultH3PromptPresets: {},
  h3AutoPromptSeeds: [],
  defaultImagePromptPresets: {},
  h3PromptPresetDescriptions: {},
  imagePromptPresetLabels: {},
  imagePromptPresetDescriptions: {},
  icon: (name: string) => `<i data-lucide="${name}"></i>`,
  escapeHtml: (value: string) => value,
  formatBytes: () => "0 B",
  formatScanTime: () => "time",
  orderVideoProfiles: (profiles: ModelScanProfile[]) => profiles,
  getImageQualityProfiles: () => [],
  isGemmaPromptModel: () => false,
  isComfyMultimodalPromptModel: () => false,
  isQwenVlPeftPromptModel: () => false,
  videoLoraInfoButton: () => "",
  isImageModelSelectable: () => true,
  imageWorkflowStatus: () => "",
  h3PromptPresetOptions: () => "",
  renderAppLogTerminal: () => ""
} as unknown as SettingsPageOptions;

function viewModel(overrides: Partial<SettingsPageViewModel> = {}): SettingsPageViewModel {
  return {
    settings: state.settings,
    settingsDirty: false,
    settingsSaving: false,
    environmentScan: null,
    comfyConnected: false,
    environmentScanning: false,
    environmentScanError: "",
    settingsTab: "system",
    settingsH3PromptPreset: "official-storyboard",
    settingsImagePromptPreset: "faithful",
    promptStatus: { ready: false, detail: "" },
    promptRuntimeLoaded: false,
    promptRuntimeBusy: false,
    promptRuntimeControlIconName: "play",
    promptRuntimeControlTitle: "Prompt runtime",
    queueRunning: false,
    hasRunningQueueTask: false,
    serviceStarting: null,
    serviceRestarting: null,
    serviceForceStopping: false,
    serviceBusy: false,
    serviceStatusMessage: "",
    comfyUpdating: false,
    comfyUpdateLog: "",
    environmentRepairing: "",
    environmentRepairLogs: {},
    workflowDependencyInstalling: "",
    workflowDependencyLogs: {},
    customNodeInstalling: "",
    customNodeInstallQueue: [],
    customNodeInstallBatch: [],
    customNodeInstallPhase: "idle",
    customNodeLogs: {},
    coreDependencyRepairing: false,
    attentionAccelerationInstalling: false,
    attentionAccelerationLog: "",
    llamaCppPythonInstalling: false,
    llamaCppPythonLog: "",
    selectedInstallGuide: null,
    installGuideModelDirectory: "ComfyUI\\models",
    appLogs: null,
    appLogsLoading: false,
    appLogsError: "",
    ...overrides
  };
}

describe("Settings accessibility markup", () => {
  it("exposes a roving tablist and keeps the scan action reachable from the page header", () => {
    const markup = renderSettingsPage(viewModel(), renderOptions);

    expect(markup).toContain('id="settings-category-tabs"');
    expect(markup).toContain('class="settings-sidebar" role="tablist"');
    expect(markup.match(/role="tab"[^>]*tabindex="0"/g)).toHaveLength(1);
    expect(markup).toContain('id="settings-tab-system"');
    expect(markup).toContain('aria-controls="settings-panel-system"');
    expect(markup).toContain('id="settings-panel-system" class="settings-content" role="tabpanel"');
    expect(markup).toContain('aria-labelledby="settings-tab-system"');
    expect(markup.match(/id="scan-environment"/g)).toHaveLength(1);
    expect(markup.indexOf('id="scan-environment"')).toBeLessThan(markup.indexOf('id="settings-environment-section"'));
    expect(markup).toContain('class="button-row settings-heading-actions is-clean"');
    expect(markup).toContain('class="settings-tool-actions"');
    expect(markup).toContain('class="settings-commit-actions"');
    expect(markup).not.toContain('>settings.saved</span>');
    expect(markup).toContain('id="connection-result" class="connection-result muted" role="status" aria-live="polite"');
    expect(markup).toContain('id="force-stop-comfy"');
    expect(markup).toContain('class="secondary destructive button-with-icon" id="force-stop-comfy"');
  });

  it("keeps the manual scan action available on non-system Settings tabs", () => {
    const markup = renderSettingsPage(viewModel({ settingsTab: "lora" }), renderOptions);

    expect(markup).toContain('id="settings-panel-lora" class="settings-content" role="tabpanel"');
    expect(markup).toContain('id="scan-environment"');
    expect(markup).not.toContain('id="settings-environment-section"');
  });

  it("marks the local save state without changing the save selector", () => {
    const markup = renderSettingsPage(viewModel({ settingsDirty: true, settingsSaving: true }), renderOptions);

    expect(markup).toContain('class="button-row settings-heading-actions is-dirty"');
    expect(markup).toContain('class="save-state dirty" role="status" aria-live="polite" aria-atomic="true">settings.saving</span>');
    expect(markup).toContain('id="save-settings" aria-busy="true"');
    expect(markup).toContain('id="settings-panel-system" class="settings-content" role="tabpanel"');
    expect(markup).toContain('aria-busy="true"');
  });

  it("keeps the primary save action after the discard action in the commit group", () => {
    const markup = renderSettingsPage(viewModel({ settingsDirty: true }), renderOptions);

    const commitStart = markup.indexOf('class="settings-commit-actions"');
    const discardIndex = markup.indexOf('id="discard-settings"');
    const saveIndex = markup.indexOf('id="save-settings"');

    expect(commitStart).toBeGreaterThan(-1);
    expect(commitStart).toBeLessThan(discardIndex);
    expect(discardIndex).toBeLessThan(saveIndex);
  });

  it("keeps H3 upgrade feedback mounted and marks acceleration repairs in the sidebar", () => {
    const environmentScan = {
      comfyInstallType: "desktop",
      attentionAcceleration: {
        ready: false,
        supported: true
      },
      pythonRuntimes: []
    } as unknown as EnvironmentScanResult;
    const idleMarkup = renderSettingsPage(viewModel({ settingsTab: "acceleration" }), renderOptions);
    const installingMarkup = renderSettingsPage(viewModel({
      settingsTab: "acceleration",
      environmentScan,
      attentionAccelerationInstalling: true,
      attentionAccelerationLog: "正在升级 PyTorch"
    }), renderOptions);

    expect(idleMarkup).toContain('id="attention-install-log-details"  hidden');
    expect(idleMarkup).toContain('id="attention-install-log"></pre>');
    expect(installingMarkup).toContain('id="attention-install-progress" aria-live="polite"');
    expect(installingMarkup).toContain('role="progressbar" aria-label="H3 环境升级进度"');
    expect(installingMarkup).toContain('id="attention-install-stage">正在升级 PyTorch</strong>');
    expect(installingMarkup).toContain('id="attention-install-log-details" open');
    expect(installingMarkup).toContain('id="settings-tab-acceleration"');
    expect(installingMarkup).toContain('class="settings-tab-label">settings.tab.acceleration<span class="settings-update-dot" role="img" aria-label="待安装/修复" title="待安装/修复"></span>');
    expect(installingMarkup).toContain("检测到 ComfyUI Desktop");
    expect(installingMarkup).toContain("建议先在 Desktop 中将 PyTorch 切换为 2.9.1+cu130");
    expect(idleMarkup).not.toContain("检测到 ComfyUI Desktop");
  });
});
