import type {
  EnvironmentIssue,
  EnvironmentScanResult,
  Settings
} from "../../../types";
import type { RendererCleanup, RendererContext } from "../../contracts";
import { uiKeys } from "../../../core/i18n-keys";
import type { EnvironmentRefreshReason } from "../../environment-refresh-coordinator";

export interface SettingsEnvironmentControllerOptions {
  formSettings(): Settings;
  getEnvironmentScan(): EnvironmentScanResult | null;
  refreshEnvironment(
    settings: Settings,
    reason: EnvironmentRefreshReason
  ): Promise<EnvironmentScanResult | null>;
  setSettingsDraft(settings: Settings): void;
  setAttentionAccelerationInstalling(value: boolean): void;
  getAttentionAccelerationLog(): string;
  setAttentionAccelerationLog(log: string): void;
  setEnvironmentRepairing(issueId: string): void;
  setEnvironmentRepairLog(issueId: EnvironmentIssue["id"], log: string): void;
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

  root.querySelector("#install-attention-acceleration")?.addEventListener("click", async () => {
    const settings = options.formSettings();
    options.setSettingsDraft(settings);
    options.setAttentionAccelerationInstalling(true);
    options.setAttentionAccelerationLog("");
    context.requestRender();
    try {
      const result = await context.application.installAttentionAcceleration(settings);
      options.setAttentionAccelerationLog(
        result.log || options.getAttentionAccelerationLog() || result.message
      );
      const scan = await options.refreshEnvironment(settings, "dependency-change");
      if (scan) context.notify(result.message, { kind: result.ok ? "info" : "error" });
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

  root.querySelectorAll<HTMLButtonElement>("[data-repair-issue]").forEach((button) => {
    button.addEventListener("click", async () => {
      const issueId = button.dataset.repairIssue as EnvironmentIssue["id"];
      const settings = options.formSettings();
      options.setSettingsDraft(settings);
      options.setEnvironmentRepairing(issueId);
      context.requestRender();
      try {
        const result = await context.application.repairEnvironmentIssue(issueId, settings);
        options.setEnvironmentRepairLog(issueId, result.log || result.message);
        options.setEnvironmentRepairing("");
        const scan = await options.refreshEnvironment(settings, "dependency-change");
        if (scan) context.notify(result.message, { kind: result.ok ? "info" : "error" });
      } catch (error) {
        options.setEnvironmentRepairing("");
        const message = error instanceof Error ? error.message : String(error);
        options.setEnvironmentRepairLog(issueId, message);
        context.notify(context.t(uiKeys.settings.actions.environmentRepairFailed, { error: message }), { kind: "error" });
      }
      requestSettingsRender();
    }, { signal });
  });

  return () => events.abort();
}
