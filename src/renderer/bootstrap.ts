import type {
  AppState,
  BundledWorkflow,
  ComfyRuntimeState,
  Draft,
  Settings,
  WorkflowCapabilities
} from "../types";
import { loadUiLocale } from "../core/i18n";
import type { PromptRuntimeState } from "../core/prompt-runtime-state";
import type { RendererApplicationApi } from "./studio-client";

export interface RendererBootstrapOptions {
  application: RendererApplicationApi;
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
  showStartupFailure?(message: string): void;
}

function startupErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function reportBootstrapError(
  options: RendererBootstrapOptions,
  source: string,
  error: unknown
): void {
  void options.application.reportRendererError(
    startupErrorMessage(error),
    { source }
  ).catch(() => undefined);
}

function hydrateStartupCall<T>(
  options: RendererBootstrapOptions,
  source: string,
  call: () => Promise<T>,
  apply: (value: T) => void
): void {
  void Promise.resolve()
    .then(call)
    .then((value) => {
      apply(value);
      options.render();
    })
    .catch((error) => reportBootstrapError(options, source, error));
}

function hydrateStartupRuntime(options: RendererBootstrapOptions): void {
  hydrateStartupCall(
    options,
    "startup-app-version",
    () => options.application.getAppVersion(),
    (appVersion) => {
      options.setAppVersion(appVersion);
      document.title = `Local Video Studio v${appVersion}`;
    }
  );
  hydrateStartupCall(
    options,
    "startup-comfy-runtime",
    () => options.application.getComfyRuntimeState(),
    (runtime) => options.setComfyRuntimeState(runtime)
  );
  hydrateStartupCall(
    options,
    "startup-prompt-runtime",
    () => options.application.getPromptRuntimeState(),
    (promptRuntime) => options.setPromptRuntimeState(promptRuntime)
  );
}

export function bootstrapRenderer(options: RendererBootstrapOptions): void {
  void Promise.resolve()
    .then(() => options.application.getState())
    .then(async (initialState) => {
      await loadUiLocale(initialState.settings.uiLocale).catch(() => undefined);
      options.setState(initialState);

      // The persisted state is the only first-render prerequisite. Runtime
      // snapshots and version metadata hydrate independently after the shell
      // has been scheduled, so a slow auxiliary IPC call cannot hold the UI.
      options.render();
      hydrateStartupRuntime(options);
      void Promise.resolve()
        .then(() => options.refreshPerformanceMetrics())
        .catch((error) => reportBootstrapError(options, "startup-performance", error));
      void Promise.resolve()
        .then(() => options.refreshEnvironment(initialState.settings))
        .catch((error) => reportBootstrapError(options, "startup-environment", error));

      void Promise.resolve()
        .then(() => options.application.getBundledWorkflow(
          options.bundledWorkflowModelId(initialState.draft),
          initialState.draft.inputMode
        ))
        .then(async (bundled) => {
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
            const capability = await options.application.inspectWorkflow(
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
        })
        .catch((error) => {
          reportBootstrapError(options, "bundled-workflow-load", error);
        })
        .finally(() => options.render());
    })
    .catch((error) => {
      const message = `工作区初始化失败：${startupErrorMessage(error)}`;
      options.showStartupFailure?.(message);
      reportBootstrapError(options, "renderer-bootstrap", error);
    });
}
