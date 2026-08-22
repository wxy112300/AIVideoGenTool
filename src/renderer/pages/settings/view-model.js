import { promptModelStatus } from "../../shared/status";
export function buildSettingsPageViewModel(options) {
    const settings = options.settingsDraft ?? options.state.settings;
    const promptRuntimeBusy = options.promptStarting ||
        options.promptEnhancing ||
        options.promptReleasing;
    return {
        settings,
        settingsDirty: options.settingsHaveUnsavedChanges(),
        settingsSaving: options.settingsSaving,
        environmentScan: options.environmentScan,
        comfyConnected: options.comfyConnected,
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
        customNodeInstallQueue: options.customNodeInstallQueue,
        customNodeInstallBatch: options.customNodeInstallBatch,
        customNodeInstallPhase: options.customNodeInstallPhase,
        customNodeLogs: options.customNodeLogs,
        coreDependencyRepairing: options.coreDependencyRepairing,
        attentionAccelerationInstalling: options.attentionAccelerationInstalling,
        attentionAccelerationLog: options.attentionAccelerationLog,
        llamaCppPythonInstalling: options.llamaCppPythonInstalling,
        llamaCppPythonLog: options.llamaCppPythonLog,
        selectedInstallGuide: options.selectedInstallGuide,
        installGuideModelDirectory: options.environmentScan?.modelDirectory ||
            options.settingsDraft?.modelDirectory ||
            options.state.settings.modelDirectory ||
            "ComfyUI\\models",
        appLogs: options.appLogs,
        appLogsLoading: options.appLogsLoading,
        appLogsError: options.appLogsError
    };
}
