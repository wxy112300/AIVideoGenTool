import type {
  EnvironmentScanResult,
  LocalServiceKind,
  Settings
} from "../../../types";
import { uiKeys } from "../../../core/i18n-keys";
import type { RendererCleanup, RendererContext } from "../../contracts";
import type { EnvironmentRefreshReason } from "../../environment-refresh-coordinator";

export interface SettingsServiceControllerOptions {
  formSettings(): Settings;
  getEnvironmentScan(): EnvironmentScanResult | null;
  refreshEnvironment(
    settings: Settings,
    reason: EnvironmentRefreshReason
  ): Promise<EnvironmentScanResult | null>;
  setSettingsDraft(settings: Settings): void;
  setServiceStarting(kind: LocalServiceKind | null): void;
  setServiceRestarting(kind: LocalServiceKind | null): void;
  setServiceStatusMessage(message: string): void;
  setComfyUpdating(value: boolean): void;
  getComfyUpdateLog(): string;
  setComfyUpdateLog(log: string): void;
  requestForceStopConfirmation(): void;
  rememberModalFocus(): void;
}

export function mountSettingsServiceController(
  context: RendererContext,
  options: SettingsServiceControllerOptions
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
        const scan = await options.refreshEnvironment(settings, "service-change");
        if (scan) context.notify(result.message, { kind: result.ok ? "info" : "error" });
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
        const scan = await options.refreshEnvironment(settings, "service-change");
        if (scan) context.notify(result.message, { kind: result.ok ? "info" : "error" });
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
  }, { signal });

  root.querySelector("#update-comfyui")?.addEventListener("click", async () => {
    const settings = options.formSettings();
    const updateMode = options.getEnvironmentScan()?.comfyCompatibility.updateMode;
    options.setSettingsDraft(settings);
    options.setComfyUpdating(true);
    options.setComfyUpdateLog("");
    context.requestRender();
    try {
      const result = await context.studio.updateComfyUi(settings);
      options.setComfyUpdateLog(result.log || result.message);
      if (!result.ok) {
        context.notify(result.message, { kind: "error" });
      } else if (await options.refreshEnvironment(settings, "dependency-change")) {
        context.notify(result.message);
      }
      if (result.ok && updateMode === "git") {
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

  return () => events.abort();
}
