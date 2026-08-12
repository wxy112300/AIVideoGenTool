import type {
  AppLogSnapshot,
  AppState,
  EnvironmentScanResult,
  H3PromptPreset,
  ImagePromptPreset,
  LocalServiceKind,
  Settings
} from "../../../types";
import type { SettingsTab } from "../../contracts";
import { promptModelStatus } from "../../shared/status";
import type { SettingsPageViewModel } from "./page";

export interface SettingsViewModelDependencies {
  state: AppState;
  settingsDraft: Settings | null;
  environmentScan: EnvironmentScanResult | null;
  environmentScanning: boolean;
  environmentScanError: string;
  settingsTab: SettingsTab;
  settingsH3PromptPreset: H3PromptPreset;
  settingsImagePromptPreset: ImagePromptPreset;
  promptRuntimeLoaded: boolean;
  promptStarting: boolean;
  promptEnhancing: boolean;
  promptReleasing: boolean;
  serviceStarting: LocalServiceKind | null;
  serviceRestarting: LocalServiceKind | null;
  serviceForceStopping: boolean;
  serviceStatusMessage: string;
  comfyUpdating: boolean;
  comfyUpdateLog: string;
  environmentRepairing: string;
  environmentRepairLogs: Record<string, string>;
  workflowDependencyInstalling: string;
  workflowDependencyLogs: Record<string, string>;
  customNodeInstalling: string;
  customNodeLogs: Record<string, string>;
  coreDependencyRepairing: boolean;
  attentionAccelerationInstalling: boolean;
  attentionAccelerationLog: string;
  selectedInstallGuide: SettingsPageViewModel["selectedInstallGuide"];
  appLogs: AppLogSnapshot | null;
  appLogsLoading: boolean;
  appLogsError: string;
  settingsHaveUnsavedChanges(): boolean;
  promptRuntimeControlIcon(): string;
  promptRuntimeControlTitle(settings: Settings): string;
}

export function buildSettingsPageViewModel(
  options: SettingsViewModelDependencies
): SettingsPageViewModel {
  const settings = options.settingsDraft ?? options.state.settings;
  const promptRuntimeBusy = options.promptStarting ||
    options.promptEnhancing ||
    options.promptReleasing;
  return {
    settings,
    settingsDirty: options.settingsHaveUnsavedChanges(),
    environmentScan: options.environmentScan,
    environmentScanning: options.environmentScanning,
    environmentScanError: options.environmentScanError,
    settingsTab: options.settingsTab,
    settingsH3PromptPreset: options.settingsH3PromptPreset,
    settingsImagePromptPreset: options.settingsImagePromptPreset,
    promptStatus: promptModelStatus(settings, options.environmentScan),
    promptRuntimeLoaded: options.promptRuntimeLoaded,
    promptRuntimeBusy,
    promptRuntimeControlIconName: options.promptRuntimeControlIcon(),
    promptRuntimeControlTitle: options.promptRuntimeControlTitle(settings),
    queueRunning: options.state.queueRunning,
    hasRunningQueueTask: options.state.queue.some((task) => task.status === "running"),
    serviceStarting: options.serviceStarting,
    serviceRestarting: options.serviceRestarting,
    serviceForceStopping: options.serviceForceStopping,
    serviceBusy: Boolean(options.serviceStarting || options.serviceRestarting),
    serviceStatusMessage: options.serviceStatusMessage,
    comfyUpdating: options.comfyUpdating,
    comfyUpdateLog: options.comfyUpdateLog,
    environmentRepairing: options.environmentRepairing,
    environmentRepairLogs: options.environmentRepairLogs,
    workflowDependencyInstalling: options.workflowDependencyInstalling,
    workflowDependencyLogs: options.workflowDependencyLogs,
    customNodeInstalling: options.customNodeInstalling,
    customNodeLogs: options.customNodeLogs,
    coreDependencyRepairing: options.coreDependencyRepairing,
    attentionAccelerationInstalling: options.attentionAccelerationInstalling,
    attentionAccelerationLog: options.attentionAccelerationLog,
    selectedInstallGuide: options.selectedInstallGuide,
    installGuideModelDirectory:
      options.environmentScan?.modelDirectory ||
      options.settingsDraft?.modelDirectory ||
      options.state.settings.modelDirectory ||
      "ComfyUI\\models",
    appLogs: options.appLogs,
    appLogsLoading: options.appLogsLoading,
    appLogsError: options.appLogsError
  };
}
