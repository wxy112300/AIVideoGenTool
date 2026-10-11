import type {
  EnvironmentScanResult,
  CustomNodeInstallMode,
  Settings
} from "../../../types";
import { compareDependencyIds } from "../../../core/catalog";
import { uiKeys } from "../../../core/i18n-keys";
import type { RendererCleanup, RendererContext } from "../../contracts";
import type { EnvironmentRefreshReason } from "../../environment-refresh-coordinator";
import { customNodeIdsForBulkAction } from "./node-install-queue";
import { settingsText } from "./copy";
import { strataPreparationMatchesSettings } from "../../../core/strata-preparation";

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
  setLlamaCppPythonInstalling(value: boolean): void;
  getLlamaCppPythonLog(): string;
  setLlamaCppPythonLog(log: string): void;
  requestLlamaCppPythonUninstall(): void;
  requestStrataUninstall?(directory: string): void;
  setStrataInstalling?(value: boolean): void;
  getStrataLog?(): string;
  setStrataLog?(log: string): void;
  cancelCustomNodeInstall?(nodeId: string): Promise<import("../../../types").ConnectionResult>;
  setDependencyInstallCancelling?(id: string, value: boolean): void;
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

  root.querySelectorAll<HTMLButtonElement>("[data-cancel-dependency-install]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopImmediatePropagation();
      const id = button.dataset.cancelDependencyInstall;
      if (!id || button.disabled) return;
      closeNodeActionMenus();
      button.disabled = true;
      options.setDependencyInstallCancelling?.(id, true);
      requestSettingsRender();
      try {
        const result = id.startsWith("custom-node:") && options.cancelCustomNodeInstall
          ? await options.cancelCustomNodeInstall(id.slice("custom-node:".length))
          : await context.application.cancelDependencyInstall(id);
        context.notify(result.message, { kind: result.ok ? "info" : "warning", renderPage: false });
      } catch (error) {
        context.notify(error instanceof Error ? error.message : String(error), { kind: "error", renderPage: false });
      } finally {
        options.setDependencyInstallCancelling?.(id, false);
        requestSettingsRender();
      }
    }, { signal });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-open-node-location]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopImmediatePropagation();
      closeNodeActionMenus();
      const location = button.dataset.openNodeLocation?.trim();
      if (!location || button.disabled) return;
      try {
        if (await context.hostCapabilities.showItemInFolder(location)) return;
      } catch {
        // Missing paths and host failures use the same actionable recovery message.
      }
      context.notify(settingsText(options.formSettings().uiLocale, "nodes.openLocationFailed"), { kind: "error", renderPage: false });
    }, { signal });
  });

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

  root.querySelector<HTMLButtonElement>("#install-llama-cpp-python")?.addEventListener("click", async (event) => {
    event.stopImmediatePropagation();
    closeNodeActionMenus();
    const state = context.getState();
    if (state?.queue.some((task) => task.status === "running")) {
      context.notify(context.t(uiKeys.settings.actions.runningTaskBlocked), { kind: "warning" });
      return;
    }
    const settings = options.formSettings();
    options.setSettingsDraft(settings);
    options.setLlamaCppPythonInstalling(true);
    options.setLlamaCppPythonLog("");
    context.requestRender();
    try {
      const result = await context.application.installLlamaCppPython(settings);
      options.setLlamaCppPythonLog(result.log || result.message);
      const scan = await options.refreshEnvironment(settings, "dependency-change");
      if (scan && !result.cancelled) context.notify(result.message, { kind: result.ok ? "info" : "error" });
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

  root.querySelector<HTMLButtonElement>("#install-strata")?.addEventListener("click", async (event) => {
    event.stopImmediatePropagation();
    closeNodeActionMenus();
    if (context.getState()?.queue.some((task) => task.status === "running")) {
      context.notify(context.t(uiKeys.settings.actions.runningTaskBlocked), { kind: "warning" });
      return;
    }
    const settings = options.formSettings();
    options.setSettingsDraft(settings);
    options.setStrataInstalling?.(true);
    options.setStrataLog?.("");
    context.requestRender();
    try {
      const result = await context.application.installStrata(settings);
      options.setStrataLog?.(result.log || result.message);
      await options.refreshEnvironment(settings, "dependency-change");
      if (!result.cancelled) context.notify(result.message, { kind: result.ok ? "info" : "error" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.setStrataLog?.([options.getStrataLog?.(), message].filter(Boolean).join("\n"));
      context.notify(message, { kind: "error" });
    } finally { options.setStrataInstalling?.(false); requestSettingsRender(); }
  }, { signal });

  root.querySelector<HTMLButtonElement>("[data-uninstall-strata]")?.addEventListener("click", (event) => {
    event.stopImmediatePropagation();
    const button = event.currentTarget as HTMLButtonElement;
    if (button.disabled) return;
    closeNodeActionMenus();
    if (context.getState()?.queue.some((task) => task.status === "running")) {
      context.notify(context.t(uiKeys.settings.actions.runningTaskBlocked), { kind: "warning" });
      return;
    }
    const settings = options.formSettings(), status = options.getEnvironmentScan()?.strataPreparation;
    if (!strataPreparationMatchesSettings(settings, status) || !status?.managedUninstallable) return;
    options.setSettingsDraft(settings);
    options.requestStrataUninstall?.(status.installDirectory);
  }, { signal });

  root.querySelector<HTMLButtonElement>("[data-uninstall-llama-cpp-python]")?.addEventListener("click", (event) => {
    event.stopImmediatePropagation();
    closeNodeActionMenus();
    const state = context.getState();
    if (state?.queue.some((task) => task.status === "running")) {
      context.notify(context.t(uiKeys.settings.actions.runningTaskBlocked), { kind: "warning" });
      return;
    }
    if (!options.getEnvironmentScan()?.llamaCppPython?.installed) return;
    options.requestLlamaCppPythonUninstall();
  }, { signal });

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

  root.querySelectorAll<HTMLButtonElement>("[data-open-node-source]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopImmediatePropagation();
      closeNodeActionMenus();
      const sourceUrl = button.dataset.openNodeSource?.trim();
      if (!sourceUrl) return;
      const opened = await context.hostCapabilities.openExternal(sourceUrl);
      if (!opened) {
        context.notify(context.t(uiKeys.settings.actions.downloadPageFailed), { kind: "error" });
      }
    }, { signal });
  });

  root.querySelector<HTMLButtonElement>("#install-all-custom-nodes")?.addEventListener("click", () => {
    const state = context.getState();
    if (state?.queue.some((task) => task.status === "running")) {
      context.notify(context.t(uiKeys.settings.actions.runningTaskBlocked), { kind: "warning" });
      return;
    }
    const nodes = [...(options.getEnvironmentScan()?.customNodes ?? [])].sort((left, right) =>
      compareDependencyIds(left.id, right.id)
    );
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

  return () => events.abort();
}
