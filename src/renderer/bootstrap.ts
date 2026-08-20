import type {
  AppApi,
  AppState,
  BundledWorkflow,
  ComfyRuntimeState,
  Draft,
  Settings,
  WorkflowCapabilities
} from "../types";
import { loadUiLocale } from "../core/i18n";

export interface RendererBootstrapOptions {
  studio: AppApi;
  setState(nextState: AppState): void;
  setComfyRuntimeState(state: ComfyRuntimeState): void;
  getState(): AppState;
  setAppVersion(version: string): void;
  refreshEnvironment(settings: Settings): Promise<unknown>;
  bundledWorkflows: Record<string, BundledWorkflow>;
  workflowCapabilities: Record<string, WorkflowCapabilities>;
  bundledWorkflowKey(modelId: string, inputMode: Draft["inputMode"]): string;
  bundledWorkflowModelId(draft: Draft): string;
  patchDraft(patch: Partial<Draft>): void;
  render(): void;
  refreshPerformanceMetrics(): Promise<void>;
}

export function bootstrapRenderer(options: RendererBootstrapOptions): void {
  void options.studio.getState().then(async (initialState) => {
    await loadUiLocale(initialState.settings.uiLocale).catch(() => undefined);
    options.setState(initialState);
    const [appVersion, runtime] = await Promise.all([
      options.studio.getAppVersion(),
      options.studio.getComfyRuntimeState()
    ]);
    options.setComfyRuntimeState(runtime);
    options.setAppVersion(appVersion);
    document.title = `Local Video Studio v${appVersion}`;
    options.render();
    void options.refreshPerformanceMetrics();
    void options.refreshEnvironment(initialState.settings);

    void options.studio.getBundledWorkflow(
      options.bundledWorkflowModelId(initialState.draft),
      initialState.draft.inputMode
    ).then((bundled) => {
      if (bundled) {
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
    }).catch((error) => {
        void options.studio.reportRendererError(
          error instanceof Error ? error.message : String(error),
          { source: "bundled-workflow-load" }
        ).catch(() => undefined);
    }).finally(() => options.render());
  });
}
