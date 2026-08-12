import type {
  AppApi,
  AppState,
  BundledWorkflow,
  Draft,
  EnvironmentScanResult,
  WorkflowCapabilities
} from "../types";
import { createTranslator, loadUiLocale } from "../core/i18n";
import { uiKeys } from "../core/i18n-keys";

export interface RendererBootstrapOptions {
  studio: AppApi;
  setState(nextState: AppState): void;
  getState(): AppState;
  setAppVersion(version: string): void;
  setEnvironmentScan(scan: EnvironmentScanResult | null): void;
  setEnvironmentScanError(message: string): void;
  bundledWorkflows: Record<string, BundledWorkflow>;
  workflowCapabilities: Record<string, WorkflowCapabilities>;
  bundledWorkflowKey(modelId: string, inputMode: Draft["inputMode"]): string;
  bundledWorkflowModelId(draft: Draft): string;
  enableSpectrumByDefaultIfAvailable(): void;
  patchDraft(patch: Partial<Draft>): void;
  render(): void;
  refreshPerformanceMetrics(): Promise<void>;
}

export function bootstrapRenderer(options: RendererBootstrapOptions): void {
  void options.studio.getState().then(async (initialState) => {
    await loadUiLocale(initialState.settings.uiLocale).catch(() => undefined);
    options.setState(initialState);
    const appVersion = await options.studio.getAppVersion();
    options.setAppVersion(appVersion);
    document.title = `Local Video Studio v${appVersion}`;
    options.render();
    void options.refreshPerformanceMetrics();
    void Promise.allSettled([
      options.studio.getBundledWorkflow(
        options.bundledWorkflowModelId(initialState.draft),
        initialState.draft.inputMode
      ),
      options.studio.scanEnvironment(initialState.settings)
    ]).then(([bundledResult, scanResult]) => {
      if (scanResult.status === "fulfilled") {
        options.setEnvironmentScanError("");
        options.setEnvironmentScan(scanResult.value);
        options.enableSpectrumByDefaultIfAvailable();
      } else {
        options.setEnvironmentScanError(
          createTranslator(initialState.settings.uiLocale).t(uiKeys.runtime.startupScanFailed, { error: scanResult.reason instanceof Error ? scanResult.reason.message : String(scanResult.reason) })
        );
      }
      if (bundledResult.status === "fulfilled" && bundledResult.value) {
        const bundled = bundledResult.value;
        options.bundledWorkflows[
          options.bundledWorkflowKey(bundled.modelId, initialState.draft.inputMode)
        ] = bundled;
        options.workflowCapabilities[bundled.path] = {
          supportsEndImage: bundled.supportsEndImage,
          supportsVideoExtension: bundled.supportsVideoExtension
        };
        if (!options.getState().draft.workflowPath) {
          options.patchDraft({ workflowPath: bundled.path });
        }
      }
      if (bundledResult.status === "rejected") {
        void options.studio.reportRendererError(
          bundledResult.reason instanceof Error
            ? bundledResult.reason.message
            : String(bundledResult.reason),
          { source: "bundled-workflow-load" }
        ).catch(() => undefined);
      }
      options.render();
    });
  });
}
