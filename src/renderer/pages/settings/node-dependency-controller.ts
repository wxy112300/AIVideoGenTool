import type {
  EnvironmentScanResult,
  CustomNodeInstallMode,
  Settings,
  WorkflowDependencyStatus
} from "../../../types";
import { uiKeys } from "../../../core/i18n-keys";
import type { RendererCleanup, RendererContext } from "../../contracts";
import type { EnvironmentRefreshReason } from "../../environment-refresh-coordinator";
import { customNodeIdsForBulkAction } from "./node-install-queue";

export interface SettingsNodeDependencyControllerOptions {
  formSettings(): Settings;
  getEnvironmentScan(): EnvironmentScanResult | null;
  refreshEnvironment(
    settings: Settings,
    reason: EnvironmentRefreshReason
  ): Promise<EnvironmentScanResult | null>;
  setSettingsDraft(settings: Settings): void;
  enqueueCustomNodeInstall(
    nodeId: string,
    settings: Settings,
    mode?: CustomNodeInstallMode
  ): { accepted: boolean; position: number };
  requestCustomNodeUninstall(nodeId: string, name: string): void;
  setWorkflowDependencyInstalling(workflowId: string): void;
  getWorkflowDependencyLog(workflowId: string): string;
  setWorkflowDependencyLog(workflowId: string, log: string): void;
}

export function mountSettingsNodeDependencyController(
  context: RendererContext,
  options: SettingsNodeDependencyControllerOptions
): RendererCleanup {
  const events = new AbortController();
  const signal = events.signal;
  const root = context.root;
  const nodeActionMenus = [
    ...root.querySelectorAll<HTMLDetailsElement>(".node-action-menu")
  ];
  const closeNodeActionMenus = (except?: HTMLDetailsElement) => {
    nodeActionMenus.forEach((menu) => {
      if (menu !== except) menu.removeAttribute("open");
    });
  };
  const requestSettingsRender = () => {
    if (context.getRoute().page === "settings") context.requestRender();
  };

  nodeActionMenus.forEach((menu) => {
    menu.addEventListener("toggle", () => {
      if (menu.open) closeNodeActionMenus(menu);
    }, { signal });
  });
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(".node-action-menu")) {
      closeNodeActionMenus();
    }
  }, { signal });

  root.querySelectorAll<HTMLButtonElement>("[data-install-node]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopImmediatePropagation();
      closeNodeActionMenus();
      const nodeId = button.dataset.installNode;
      const mode = (button.dataset.nodeOperation || "install") as CustomNodeInstallMode;
      const state = context.getState();
      if (!nodeId) return;
      if (state?.queue.some((task) => task.status === "running")) {
        context.notify(context.t(uiKeys.settings.actions.runningTaskBlocked), { kind: "warning" });
        return;
      }
      const settings = options.formSettings();
      options.setSettingsDraft(settings);
      const queued = options.enqueueCustomNodeInstall(nodeId, settings, mode);
      if (!queued.accepted) {
        context.notify(context.t(uiKeys.settings.actions.nodeAlreadyQueued), {
          kind: "warning",
          renderPage: false
        });
      }
    }, { signal });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-uninstall-node]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopImmediatePropagation();
      const nodeId = button.dataset.uninstallNode;
      const node = options.getEnvironmentScan()?.customNodes.find((item) => item.id === nodeId);
      if (!nodeId || !node) return;
      closeNodeActionMenus();
      const state = context.getState();
      if (state?.queue.some((task) => task.status === "running")) {
        context.notify(context.t(uiKeys.settings.actions.runningTaskBlocked), { kind: "warning" });
        return;
      }
      options.requestCustomNodeUninstall(nodeId, node.name);
    }, { signal });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-rescan-node]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopImmediatePropagation();
      closeNodeActionMenus();
      const settings = options.formSettings();
      options.setSettingsDraft(settings);
      button.disabled = true;
      await options.refreshEnvironment(settings, "manual");
      requestSettingsRender();
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
      closeNodeActionMenus();
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
        const scan = await options.refreshEnvironment(settings, "dependency-change");
        if (scan) context.notify(result.message);
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
