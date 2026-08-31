import { loadUiLocale } from "../core/i18n";
export function bootstrapRenderer(options) {
    void options.application.getState().then(async (initialState) => {
        await loadUiLocale(initialState.settings.uiLocale).catch(() => undefined);
        options.setState(initialState);
        const [appVersion, runtime, promptRuntime] = await Promise.all([
            options.application.getAppVersion(),
            options.application.getComfyRuntimeState(),
            options.application.getPromptRuntimeState()
        ]);
        options.setComfyRuntimeState(runtime);
        options.setPromptRuntimeState(promptRuntime);
        options.setAppVersion(appVersion);
        document.title = `Local Video Studio v${appVersion}`;
        options.render();
        void options.refreshPerformanceMetrics();
        void options.refreshEnvironment(initialState.settings);
        void options.application.getBundledWorkflow(options.bundledWorkflowModelId(initialState.draft), initialState.draft.inputMode).then((bundled) => {
            if (bundled) {
                options.bundledWorkflows[options.bundledWorkflowKey(bundled.modelId, initialState.draft.inputMode)] = bundled;
                options.workflowCapabilities[bundled.path] = {
                    supportsEndImage: bundled.supportsEndImage,
                    supportsVideoExtension: bundled.supportsVideoExtension
                };
                if (!options.getState().draft.workflowPath) {
                    options.patchDraft({ workflowPath: bundled.path });
                }
            }
        }).catch((error) => {
            void options.application.reportRendererError(error instanceof Error ? error.message : String(error), { source: "bundled-workflow-load" }).catch(() => undefined);
        }).finally(() => options.render());
    });
}
