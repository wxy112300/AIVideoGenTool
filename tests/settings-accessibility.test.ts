import { describe, expect, it } from "vitest";
import { createDefaultState } from "../src/core/defaults";
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
  orderVideoProfiles: (profiles) => profiles,
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
    settingsH3PromptPreset: "faithful",
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
  it("exposes a roving tablist and keeps the scan action with its environment context", () => {
    const markup = renderSettingsPage(viewModel(), renderOptions);

    expect(markup).toContain('id="settings-category-tabs"');
    expect(markup).toContain('class="settings-sidebar" role="tablist"');
    expect(markup.match(/role="tab"[^>]*tabindex="0"/g)).toHaveLength(1);
    expect(markup).toContain('id="settings-tab-system"');
    expect(markup).toContain('aria-controls="settings-panel-system"');
    expect(markup).toContain('id="settings-panel-system" class="settings-content" role="tabpanel"');
    expect(markup).toContain('aria-labelledby="settings-tab-system"');
    expect(markup.match(/id="scan-environment"/g)).toHaveLength(1);
    expect(markup.indexOf('id="settings-environment-section"')).toBeLessThan(markup.indexOf('id="scan-environment"'));
  });

  it("marks the local save state without changing the save selector", () => {
    const markup = renderSettingsPage(viewModel({ settingsDirty: true, settingsSaving: true }), renderOptions);

    expect(markup).toContain('class="save-state dirty" role="status" aria-live="polite">settings.saving</span>');
    expect(markup).toContain('id="save-settings" aria-busy="true"');
    expect(markup).toContain('id="settings-panel-system" class="settings-content" role="tabpanel"');
    expect(markup).toContain('aria-busy="true"');
  });
});
