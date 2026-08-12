import type {
  EnvironmentIssue,
  EnvironmentScanResult,
  LocalServiceKind,
  Settings
} from "../../../types";
import type { RendererCleanup, RendererContext } from "../../contracts";
import { uiKeys } from "../../../core/i18n-keys";

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
  setCoreDependencyRepairing(value: boolean): void;
  setEnvironmentRepairing(issueId: string): void;
  setEnvironmentRepairLog(issueId: EnvironmentIssue["id"], log: string): void;
  setCustomNodeInstalling(nodeId: string): void;
  getCustomNodeLog(nodeId: string): string;
  setCustomNodeLog(nodeId: string, log: string): void;
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
        context.notify(result.message);
      } catch (error) {
        options.setServiceStarting(null);
        const message = context.t(uiKeys.settings.actions.startFailed, { error: error instanceof Error ? error.message : String(error) });
        options.setServiceStatusMessage(message);
        context.notify(message);
      }
      context.requestRender();
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
        context.notify(result.message);
      } catch (error) {
        options.setServiceRestarting(null);
        const message = context.t(uiKeys.settings.actions.restartFailed, { error: error instanceof Error ? error.message : String(error) });
        options.setServiceStatusMessage(message);
        context.notify(message);
      }
      context.requestRender();
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
      context.notify(result.message);
      if (result.ok && options.getEnvironmentScan()?.comfyCompatibility.updateMode === "git") {
        options.setServiceStatusMessage(context.t(uiKeys.settings.actions.updateCompleted));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.setComfyUpdateLog(message);
      context.notify(context.t(uiKeys.settings.actions.comfyUpdateFailed, { error: message }));
    } finally {
      options.setComfyUpdating(false);
      context.requestRender();
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
      context.notify(result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.setAttentionAccelerationLog(
        [options.getAttentionAccelerationLog(), message].filter(Boolean).join("\n")
      );
      context.notify(context.t(uiKeys.settings.actions.attentionInstallFailed, { error: message }));
    } finally {
      options.setAttentionAccelerationInstalling(false);
      context.requestRender();
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
      context.notify(result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.setComfyUpdateLog(
        [options.getComfyUpdateLog(), message].filter(Boolean).join("\n\n")
      );
      context.notify(context.t(uiKeys.settings.actions.coreNodeProcessFailed, { error: message }));
    } finally {
      options.setCoreDependencyRepairing(false);
      context.requestRender();
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
        context.notify(result.message);
      } catch (error) {
        options.setEnvironmentRepairing("");
        const message = error instanceof Error ? error.message : String(error);
        options.setEnvironmentRepairLog(issueId, message);
        context.notify(context.t(uiKeys.settings.actions.environmentRepairFailed, { error: message }));
      }
      context.requestRender();
    }, { signal });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-install-node]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopImmediatePropagation();
      const nodeId = button.dataset.installNode;
      const state = context.getState();
      if (!nodeId) return;
      if (state?.queue.some((task) => task.status === "running")) {
        context.notify(context.t(uiKeys.settings.actions.runningTaskBlocked));
        return;
      }
      const settings = options.formSettings();
      options.setSettingsDraft(settings);
      options.setCustomNodeInstalling(nodeId);
      context.requestRender();
      try {
        const result = await context.studio.installCustomNode(nodeId, settings);
        if (!result.ok) throw new Error(result.message);
        options.setCustomNodeLog(nodeId, result.log || result.message);
        const restarted = await context.studio.restartLocalService("comfy", settings);
        options.setCustomNodeLog(
          nodeId,
          [options.getCustomNodeLog(nodeId), context.t(uiKeys.settings.actions.comfyRestartLog, { message: restarted.message })]
            .filter(Boolean)
            .join("\n\n")
        );
        if (!restarted.ok) {
          throw new Error(context.t(uiKeys.settings.actions.nodeRestartFailed, { message: restarted.message }));
        }
        const message = context.t(uiKeys.settings.actions.comfyRestarted, { message: result.message });
        const scan = await context.studio.scanEnvironment(settings);
        options.setEnvironmentScan(scan);
        if (!scan.customNodes.find((node) => node.id === nodeId)?.loaded) {
          throw new Error(context.t(uiKeys.settings.actions.nodeReadyCheckFailed));
        }
        context.notify(message);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        options.setCustomNodeLog(
          nodeId,
          [options.getCustomNodeLog(nodeId), message].filter(Boolean).join("\n\n")
        );
        context.notify(context.t(uiKeys.settings.actions.nodeInstallFailed, { message }));
      } finally {
        options.setCustomNodeInstalling("");
        context.requestRender();
      }
    }, { signal });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-install-workflow]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopImmediatePropagation();
      const workflowId = button.dataset.installWorkflow as "minimax_h3_i2v" | undefined;
      if (!workflowId) return;
      const settings = options.formSettings();
      options.setSettingsDraft(settings);
      options.setWorkflowDependencyInstalling(workflowId);
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
        context.notify(context.t(uiKeys.settings.actions.workflowInstallFailed, { message }));
      } finally {
        options.setWorkflowDependencyInstalling("");
        context.requestRender();
      }
    }, { signal });
  });

  return () => events.abort();
}
