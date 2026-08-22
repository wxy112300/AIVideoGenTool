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
import type { PromptRuntimeState } from "../core/prompt-runtime-state";

export interface RendererBootstrapOptions {
  studio: AppApi;
  setState(nextState: AppState): void;
  setComfyRuntimeState(state: ComfyRuntimeState): void;
  setPromptRuntimeState(state: PromptRuntimeState): void;
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
    const [appVersion, runtime, promptRuntime] = await Promise.all([
      options.studio.getAppVersion(),
      options.studio.getComfyRuntimeState(),
      options.studio.getPromptRuntimeState()
    ]);
    options.setComfyRuntimeState(runtime);
    options.setPromptRuntimeState(promptRuntime);
    options.setAppVersion(appVersion);
    document.title = `Local Video Studio v${appVersion}`;
    options.render();
    void options.refreshPerformanceMetrics();
    void options.refreshEnvironment(initialState.settings);

    void options.studio.getBundledWorkflow(
      options.bundledWorkflowModelId(initialState.draft),
      initialState.draft.inputMode
    ).then(async (bundled) => {
      if (bundled) {
        options.bundledWorkflows[
          options.bundledWorkflowKey(bundled.modelId, initialState.draft.inputMode)
        ] = bundled;
        options.workflowCapabilities[bundled.path] = {
          supportsEndImage: bundled.supportsEndImage,
          supportsVideoExtension: bundled.supportsVideoExtension
        };
        const currentDraft = options.getState().draft;
        if (
          !currentDraft.workflowPath &&
          currentDraft.modelId === initialState.draft.modelId &&
          currentDraft.inputMode === initialState.draft.inputMode
        ) {
          options.patchDraft({ workflowPath: bundled.path });
        }
      }
      const workflowPath = initialState.draft.workflowPath;
      if (workflowPath && workflowPath !== bundled?.path) {
        const capability = await options.studio.inspectWorkflow(
          workflowPath,
          initialState.draft.modelId
        );
        const currentDraft = options.getState().draft;
        if (
          currentDraft.workflowPath === workflowPath &&
          currentDraft.modelId === initialState.draft.modelId
        ) {
          options.workflowCapabilities[workflowPath] = capability;
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
