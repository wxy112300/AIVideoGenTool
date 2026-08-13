import type {
  EnvironmentIssue,
  EnvironmentScanResult,
  LocalServiceKind,
  Settings,
  WorkflowDependencyStatus
} from "../../../types";
import type { RendererCleanup, RendererContext } from "../../contracts";
import { uiKeys } from "../../../core/i18n-keys";
import { customNodeIdsForBulkAction } from "./node-install-queue";

export interface SettingsEnvironmentControllerOptions {
  formSettings(): Settings;
  getEnvironmentScan(): EnvironmentScanResult | null;
  setEnvironmentScan(scan: EnvironmentScanResult): void;
  setSettingsDraft(settings: Settings): void;
  setServiceStarting(kind: LocalServiceKind | null): void;
  setServiceRestarting(kind: LocalServiceKind | null): void;
  setServiceStatusMessage(message: string): void;
  setComfyUpdating(value: boolean): void;
  getComfyUpdateLog(): string;
  setComfyUpdateLog(log: string): void;
  setAttentionAccelerationInstalling(value: boolean): void;
  getAttentionAccelerationLog(): string;
  setAttentionAccelerationLog(log: string): void;
  setLlamaCppPythonInstalling(value: boolean): void;
  getLlamaCppPythonLog(): string;
  setLlamaCppPythonLog(log: string): void;
  setCoreDependencyRepairing(value: boolean): void;
  setEnvironmentRepairing(issueId: string): void;
  setEnvironmentRepairLog(issueId: EnvironmentIssue["id"], log: string): void;
  enqueueCustomNodeInstall(
    nodeId: string,
    settings: Settings
  ): { accepted: boolean; position: number };
  setWorkflowDependencyInstalling(workflowId: string): void;
  getWorkflowDependencyLog(workflowId: string): string;
  setWorkflowDependencyLog(workflowId: string, log: string): void;
  requestForceStopConfirmation(): void;
  rememberModalFocus(): void;
}

export function mountSettingsEnvironmentController(
  context: RendererContext,
  options: SettingsEnvironmentControllerOptions
): RendererCleanup {
  const events = new AbortController();
  const signal = events.signal;
  const root = context.root;
  const requestSettingsRender = () => {
    if (context.getRoute().page === "settings") context.requestRender();
  };

  root.querySelectorAll<HTMLButtonElement>("[data-start-service]").forEach((button) => {
    button.addEventListener("click", async () => {
      const kind = button.dataset.startService as LocalServiceKind;
      const settings = options.formSettings();
      options.setSettingsDraft(settings);
      options.setServiceStarting(kind);
      options.setServiceStatusMessage(
        kind === "comfy"
          ? context.t(uiKeys.settings.actions.serviceStartingComfy)
          : context.t(uiKeys.settings.actions.serviceStartingLmStudio)
      );
      context.requestRender();
      try {
        const result = await context.studio.startLocalService(kind, settings);
        options.setServiceStarting(null);
        options.setServiceStatusMessage(result.message);
        options.setEnvironmentScan(await context.studio.scanEnvironment(settings));
        context.notify(result.message, { kind: result.ok ? "info" : "error" });
      } catch (error) {
        options.setServiceStarting(null);
        const message = context.t(uiKeys.settings.actions.startFailed, { error: error instanceof Error ? error.message : String(error) });
        options.setServiceStatusMessage(message);
        context.notify(message, { kind: "error" });
      }
      requestSettingsRender();
    }, { signal });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-restart-service]").forEach((button) => {
    button.addEventListener("click", async () => {
      const kind = button.dataset.restartService as LocalServiceKind;
      const settings = options.formSettings();
      options.setSettingsDraft(settings);
      options.setServiceRestarting(kind);
      options.setServiceStatusMessage(context.t(uiKeys.settings.actions.serviceRestartingComfy));
      context.requestRender();
      try {
        const result = await context.studio.restartLocalService(kind, settings);
        options.setServiceRestarting(null);
        options.setServiceStatusMessage(result.message);
        options.setEnvironmentScan(await context.studio.scanEnvironment(settings));
        context.notify(result.message, { kind: result.ok ? "info" : "error" });
      } catch (error) {
        options.setServiceRestarting(null);
        const message = context.t(uiKeys.settings.actions.restartFailed, { error: error instanceof Error ? error.message : String(error) });
        options.setServiceStatusMessage(message);
        context.notify(message, { kind: "error" });
      }
      requestSettingsRender();
    }, { signal });
  });

  root.querySelector("#force-stop-comfy")?.addEventListener("click", () => {
    options.rememberModalFocus();
    options.setSettingsDraft(options.formSettings());
    options.requestForceStopConfirmation();
    context.requestRender();
  }, { signal });

  root.querySelector("#update-comfyui")?.addEventListener("click", async () => {
    const settings = options.formSettings();
    options.setSettingsDraft(settings);
    options.setComfyUpdating(true);
    options.setComfyUpdateLog("");
    context.requestRender();
    try {
      const result = await context.studio.updateComfyUi(settings);
      options.setComfyUpdateLog(result.log || result.message);
      context.notify(result.message, { kind: result.ok ? "info" : "error" });
      if (result.ok && options.getEnvironmentScan()?.comfyCompatibility.updateMode === "git") {
        options.setServiceStatusMessage(context.t(uiKeys.settings.actions.updateCompleted));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.setComfyUpdateLog(message);
      context.notify(context.t(uiKeys.settings.actions.comfyUpdateFailed, { error: message }), { kind: "error" });
    } finally {
      options.setComfyUpdating(false);
      requestSettingsRender();
    }
  }, { signal });

  root.querySelector("#install-attention-acceleration")?.addEventListener("click", async () => {
    const settings = options.formSettings();
    options.setSettingsDraft(settings);
    options.setAttentionAccelerationInstalling(true);
    options.setAttentionAccelerationLog("");
    context.requestRender();
    try {
      const result = await context.studio.installAttentionAcceleration(settings);
      options.setAttentionAccelerationLog(
        result.log || options.getAttentionAccelerationLog() || result.message
      );
      options.setEnvironmentScan(await context.studio.scanEnvironment(settings));
      context.notify(result.message, { kind: result.ok ? "info" : "error" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.setAttentionAccelerationLog(
        [options.getAttentionAccelerationLog(), message].filter(Boolean).join("\n")
      );
      context.notify(context.t(uiKeys.settings.actions.attentionInstallFailed, { error: message }), { kind: "error" });
    } finally {
      options.setAttentionAccelerationInstalling(false);
      requestSettingsRender();
    }
  }, { signal });

  root.querySelector("#install-llama-cpp-python")?.addEventListener("click", async () => {
    const settings = options.formSettings();
    options.setSettingsDraft(settings);
    options.setLlamaCppPythonInstalling(true);
    options.setLlamaCppPythonLog("");
    context.requestRender();
    try {
      const result = await context.studio.installLlamaCppPython(settings);
      options.setLlamaCppPythonLog(result.log || result.message);
      options.setEnvironmentScan(await context.studio.scanEnvironment(settings));
      context.notify(result.message, { kind: result.ok ? "info" : "error" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.setLlamaCppPythonLog(
        [options.getLlamaCppPythonLog(), message].filter(Boolean).join("\n")
      );
      context.notify(message, { kind: "error" });
    } finally {
      options.setLlamaCppPythonInstalling(false);
      requestSettingsRender();
    }
  }, { signal });

  root.querySelector("#repair-h3-core")?.addEventListener("click", async () => {
    const settings = options.formSettings();
    options.setSettingsDraft(settings);
    options.setCoreDependencyRepairing(true);
    options.setComfyUpdateLog("");
    context.requestRender();
    try {
      const scan = options.getEnvironmentScan();
      if (!scan?.comfyCompatibility.checkedFrom) {
        const started = await context.studio.startLocalService("comfy", settings);
        options.setComfyUpdateLog(started.message);
        const nextScan = await context.studio.scanEnvironment(settings);
        options.setEnvironmentScan(nextScan);
        if (nextScan.comfyCompatibility.h3CoreSupported) {
          context.notify(context.t(uiKeys.settings.actions.h3CoreLoaded));
          return;
        }
      }
      const updateMode = options.getEnvironmentScan()?.comfyCompatibility.updateMode;
      const result = await context.studio.updateComfyUi(settings);
      options.setComfyUpdateLog(
        [options.getComfyUpdateLog(), result.log || result.message]
          .filter(Boolean)
          .join("\n\n")
      );
      if (!result.ok) throw new Error(result.message);
      if (updateMode === "git") {
        const restarted = await context.studio.restartLocalService("comfy", settings);
        options.setComfyUpdateLog(`${options.getComfyUpdateLog()}\n\n${restarted.message}`);
        options.setEnvironmentScan(await context.studio.scanEnvironment(settings));
      }
      context.notify(result.message, { kind: result.ok ? "info" : "error" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.setComfyUpdateLog(
        [options.getComfyUpdateLog(), message].filter(Boolean).join("\n\n")
      );
      context.notify(context.t(uiKeys.settings.actions.coreNodeProcessFailed, { error: message }), { kind: "error" });
    } finally {
      options.setCoreDependencyRepairing(false);
      requestSettingsRender();
    }
  }, { signal });

  root.querySelectorAll<HTMLButtonElement>("[data-repair-issue]").forEach((button) => {
    button.addEventListener("click", async () => {
      const issueId = button.dataset.repairIssue as EnvironmentIssue["id"];
      const settings = options.formSettings();
      options.setSettingsDraft(settings);
      options.setEnvironmentRepairing(issueId);
      context.requestRender();
      try {
        const result = await context.studio.repairEnvironmentIssue(issueId, settings);
        options.setEnvironmentRepairLog(issueId, result.log || result.message);
        options.setEnvironmentRepairing("");
        options.setEnvironmentScan(await context.studio.scanEnvironment(settings));
        context.notify(result.message, { kind: result.ok ? "info" : "error" });
      } catch (error) {
        options.setEnvironmentRepairing("");
        const message = error instanceof Error ? error.message : String(error);
        options.setEnvironmentRepairLog(issueId, message);
        context.notify(context.t(uiKeys.settings.actions.environmentRepairFailed, { error: message }), { kind: "error" });
      }
      requestSettingsRender();
    }, { signal });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-install-node]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopImmediatePropagation();
      const nodeId = button.dataset.installNode;
      const state = context.getState();
      if (!nodeId) return;
      if (state?.queue.some((task) => task.status === "running")) {
        context.notify(context.t(uiKeys.settings.actions.runningTaskBlocked), { kind: "warning" });
        return;
      }
      const settings = options.formSettings();
      options.setSettingsDraft(settings);
      const queued = options.enqueueCustomNodeInstall(nodeId, settings);
      if (!queued.accepted) {
        context.notify(context.t(uiKeys.settings.actions.nodeAlreadyQueued), {
          kind: "warning",
          renderPage: false
        });
      }
    }, { signal });
  });

  root.querySelector<HTMLButtonElement>("#install-all-custom-nodes")?.addEventListener("click", () => {
    const state = context.getState();
    if (state?.queue.some((task) => task.status === "running")) {
      context.notify(context.t(uiKeys.settings.actions.runningTaskBlocked), { kind: "warning" });
      return;
    }
    const nodes = options.getEnvironmentScan()?.customNodes ?? [];
    const settings = options.formSettings();
    options.setSettingsDraft(settings);
    let accepted = 0;
    for (const nodeId of customNodeIdsForBulkAction(nodes)) {
      if (options.enqueueCustomNodeInstall(nodeId, settings).accepted) accepted += 1;
    }
    if (accepted > 0) {
      context.notify(context.t(uiKeys.settings.actions.nodeBulkQueued, { count: accepted }), {
        kind: "info",
        renderPage: false
      });
    } else {
      context.notify(context.t(uiKeys.settings.actions.nodeAlreadyQueued), {
        kind: "warning",
        renderPage: false
      });
    }
  }, { signal });

  root.querySelectorAll<HTMLButtonElement>("[data-install-workflow]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopImmediatePropagation();
      const workflowId = button.dataset.installWorkflow as WorkflowDependencyStatus["id"] | undefined;
      if (!workflowId) return;
      const settings = options.formSettings();
      options.setSettingsDraft(settings);
      options.setWorkflowDependencyInstalling(workflowId);
      options.setWorkflowDependencyLog(workflowId, context.t("settings.nodes.installing"));
      context.requestRender();
      try {
        const result = await context.studio.installWorkflowDependency(workflowId, settings);
        options.setWorkflowDependencyLog(workflowId, result.log || result.message);
        if (!result.ok) throw new Error(result.message);
        options.setEnvironmentScan(await context.studio.scanEnvironment(settings));
        context.notify(result.message);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        options.setWorkflowDependencyLog(
          workflowId,
          options.getWorkflowDependencyLog(workflowId) || message
        );
        context.notify(context.t(uiKeys.settings.actions.workflowInstallFailed, { message }), { kind: "error" });
      } finally {
        options.setWorkflowDependencyInstalling("");
        requestSettingsRender();
      }
    }, { signal });
  });

  return () => events.abort();
}
