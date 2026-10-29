import type {
  EnvironmentScanResult,
  ModelComponentStatus,
  Settings
} from "../../../types";
import type { EnvironmentRefreshReason } from "../../environment-refresh-coordinator";
import type { SettingsInstallGuideSelection } from "./fragments";
import type { RendererCleanup, RendererContext } from "../../contracts";
import { MODEL_DOWNLOAD_INVALID, rewriteHuggingFaceDownloadUrl } from "../../../core/download-url";
import { uiKeys } from "../../../core/i18n-keys";
import { outputDirectoryWithinRoot } from "./helpers";
import { modelComponentWithLocations, openModelComponentLocation } from "./model-location";
import { LIBRARY_DESTINATION_CONFLICT, LIBRARY_DESTINATION_OCCUPIED } from "../../../core/library-storage-errors";
import { strataModelRoot, strataProfileModelRoot, strataPreparationMatchesSettings, strataPreparationProfiles } from "../../../core/strata-preparation";

// UI-only disclosure state survives a scan/remount without entering persisted settings.
const modelDisclosures = new WeakMap<HTMLElement, Map<string, boolean>>();

export interface SettingsPageControllerOptions {
  context: RendererContext;
  formSettings(): Settings;
  getEnvironmentScan(): EnvironmentScanResult | null;
  setSettingsDraft(settings: Settings | null): void;
  setInstallGuide(selection: SettingsInstallGuideSelection | null): void;
  getInstallGuide(): SettingsInstallGuideSelection | null;
  settingsHaveUnsavedChanges(): boolean;
  syncSettingsDirtyUi(): void;
  runEnvironmentScan(
    settings: Settings,
    reason?: EnvironmentRefreshReason
  ): Promise<EnvironmentScanResult | null>;
  loadAppLogs(): void;
  togglePromptModel(): Promise<void>;
  requestSaveSettings(settings: Settings): Promise<"saved" | "migration-required">;
  openImageAssetLibrary(): void;
  rememberModalFocus(): void;
  requestOverlayRender?(): void;
  restoreModalFocus?(): void;
  bindModalFocus?(dialog: HTMLElement, close: () => void, initialSelector?: string): void;
}

export function mountSettingsPageController(
  options: SettingsPageControllerOptions
): RendererCleanup {
  const events = new AbortController();
  const signal = events.signal;
  const root = options.context.root;
  const acceptsOutputDirectory = (directory: string): boolean => {
    const scan = options.getEnvironmentScan();
    const outputRoot = scan?.comfyRoot ? `${scan.comfyRoot}/output` : scan?.outputDirectory || "";
    if (outputDirectoryWithinRoot(directory, outputRoot)) return true;
    options.context.notify(options.context.t(uiKeys.settings.system.outputWithinComfy), { kind: "error", renderPage: false });
    return false;
  };
  root.querySelector("[data-pick-environment-comfy]")?.addEventListener("click", () => {
    root.querySelector<HTMLButtonElement>("#pick-comfy-install-directory")?.click();
  }, { signal });
  const disclosures = modelDisclosures.get(root) ?? new Map<string, boolean>();
  modelDisclosures.set(root, disclosures);
  root.querySelectorAll<HTMLDetailsElement>("[data-settings-disclosure-key]").forEach(details => {
    const key = details.dataset.settingsDisclosureKey!;
    details.open = disclosures.get(key) ?? false;
    details.addEventListener("toggle", () => { disclosures.set(key, details.open); }, { signal });
  });

  root.querySelector("#release-prompt-model")?.addEventListener("click", () => {
    void options.togglePromptModel();
  }, { signal });

  root.querySelector<HTMLSelectElement>("#comfy-python-candidate")?.addEventListener("change", (event) => {
    const selectedPath = (event.currentTarget as HTMLSelectElement).value;
    if (!selectedPath) return;
    const input = root.querySelector<HTMLInputElement>("#comfy-python-path");
    if (!input) return;
    input.value = selectedPath;
    const settings = options.formSettings();
    options.setSettingsDraft(settings);
    options.context.reportUserAction("select-comfy-python", { source: "scan-candidate" });
    void options.runEnvironmentScan(settings);
  }, { signal });

  root.querySelector<HTMLButtonElement>("#pick-comfy-python")?.addEventListener("click", async () => {
    const selectedPath = await options.context.hostCapabilities.pickPython();
    const input = root.querySelector<HTMLInputElement>("#comfy-python-path");
    if (!selectedPath || !input) return;
    input.value = selectedPath;
    const settings = options.formSettings();
    options.setSettingsDraft(settings);
    options.context.reportUserAction("select-comfy-python", { source: "file-picker" });
    await options.runEnvironmentScan(settings);
  }, { signal });

  root.querySelectorAll<HTMLButtonElement>("[data-install-profile]").forEach((button) => {
    button.addEventListener("click", async () => {
      options.rememberModalFocus();
      options.setSettingsDraft(options.formSettings());
      const settings = options.formSettings();
      const profile = [...(options.getEnvironmentScan()?.modelProfiles ?? []), ...strataPreparationProfiles(settings.uiLocale)].find(
        (item) => item.id === button.dataset.installProfile
      );
      const component = profile?.components[Number(button.dataset.installComponent)];
      if (!profile || !component) return;
      const status = options.getEnvironmentScan()?.strataPreparation;
      const targetRoot = strataProfileModelRoot(strataPreparationMatchesSettings(settings, status)
        ? status!.modelDirectory
        : settings.modelDirectory.trim() ? strataModelRoot(settings) : "", profile.id);
      const selection: SettingsInstallGuideSelection = {
        profileName: profile.name,
        component: modelComponentWithLocations(component, {
          modelDirectory: options.getEnvironmentScan()?.modelDirectory || settings.modelDirectory,
          promptModelDirectory: settings.promptModelDirectory,
          comfyRoot: options.getEnvironmentScan()?.comfyRoot || ""
        }),
        ...(profile.managedBy === "strata" ? { targetRoot } : {})
      };
      options.setInstallGuide(selection);
      (options.requestOverlayRender ?? options.context.requestRender)();
      if (profile.managedBy === "strata" && !targetRoot) {
        try {
          const scanned = (await options.runEnvironmentScan(settings))?.strataPreparation;
          if (options.getInstallGuide() === selection && strataPreparationMatchesSettings(options.formSettings(), scanned)) {
            options.setInstallGuide({ ...selection, targetRoot: strataProfileModelRoot(scanned!.modelDirectory, profile.id) });
            (options.requestOverlayRender ?? options.context.requestRender)();
          }
        } catch (error) {
          options.context.notify(error instanceof Error ? error.message : String(error), { kind: "error" });
        }
      }
    }, { signal });
  });

  // Kept as a compatibility path for callers that still render the guide
  // inside the settings root. Production uses the persistent modal root in
  // main.ts, so these queries are no-ops there.
  const closeInstallGuide = () => {
    options.setInstallGuide(null);
    (options.requestOverlayRender ?? options.context.requestRender)();
    options.restoreModalFocus?.();
  };
  root.querySelector("#close-install-guide")?.addEventListener("click", closeInstallGuide, { signal });
  root.querySelector("#dismiss-install-guide")?.addEventListener("click", closeInstallGuide, { signal });
  root.querySelector("#install-guide-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeInstallGuide();
  }, { signal });
  const installGuide = root.querySelector<HTMLElement>(".install-guide-dialog");
  if (installGuide) options.bindModalFocus?.(installGuide, closeInstallGuide, "#dismiss-install-guide");
  root.querySelector("#open-install-download")?.addEventListener("click", async () => {
    const selected = options.getInstallGuide();
    if (!selected) return;
    const guide = selected.component.installGuide;
    if (!guide) return;
    const url = rewriteHuggingFaceDownloadUrl(
      guide.downloadUrl,
      options.formSettings()
    );
    const opened = await options.context.hostCapabilities.openExternal(url);
    if (!opened) options.context.notify(options.context.t(uiKeys.settings.actions.downloadPageFailed), { kind: "error" });
  }, { signal });
  root.querySelector("#open-install-directory")?.addEventListener("click", async (event) => {
    const directory = (event.currentTarget as HTMLButtonElement).dataset.installDirectory?.trim() || "";
    const opened = await openModelComponentLocation(options.context.hostCapabilities, options.getInstallGuide()?.component, directory);
    if (!opened) options.context.notify(options.context.t(uiKeys.settings.actions.openDirectoryFailed), { kind: "error" });
  }, { signal });

  root.querySelectorAll<HTMLButtonElement>("[data-settings-open-path]").forEach((button) => {
    button.addEventListener("click", async () => {
      const input = root.querySelector<HTMLInputElement>(`#${button.dataset.settingsOpenPath}`);
      const directory = input?.value.trim();
      if (!directory) return;
      try {
        const opened = await options.context.hostCapabilities.openDirectory(directory);
        if (!opened) options.context.notify(options.context.t(uiKeys.settings.actions.openDirectoryFailed), { kind: "error" });
      } catch (error) {
        options.context.notify(error instanceof Error ? error.message : String(error), { kind: "error" });
      }
    }, { signal });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-open-environment-download]").forEach((button) => {
    button.addEventListener("click", async () => {
      const sourceUrl = button.dataset.openEnvironmentDownload?.trim();
      if (!sourceUrl) return;
      const url = rewriteHuggingFaceDownloadUrl(sourceUrl, options.formSettings());
      const opened = await options.context.hostCapabilities.openExternal(url);
      if (!opened) options.context.notify(options.context.t(uiKeys.settings.actions.downloadPageFailed), { kind: "error" });
    }, { signal });
  });

  root.querySelector("#scan-environment")?.addEventListener("click", () => {
    const settings = options.formSettings();
    options.setSettingsDraft(settings);
    void options.runEnvironmentScan(settings, "manual");
  }, { signal });

  root.querySelector("#verify-python-runtime")?.addEventListener("click", () => {
    const settings = options.formSettings();
    options.setSettingsDraft(settings);
    void options.runEnvironmentScan(settings, "runtime-verification");
  }, { signal });

  root.querySelector("#save-settings")?.addEventListener("click", async () => {
    const customUrl = root.querySelector<HTMLInputElement>("#model-download-custom-url");
    if (customUrl?.required && !customUrl.reportValidity()) return;
    const state = options.context.getState();
    if (!state) return;
    const nextSettings = options.formSettings();
    try {
      await options.requestSaveSettings(nextSettings);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const key = message.includes(LIBRARY_DESTINATION_OCCUPIED) ? uiKeys.settings.system.libraryDestinationOccupied
        : message.includes(LIBRARY_DESTINATION_CONFLICT) ? uiKeys.settings.system.libraryDestinationConflict
        : message.includes(MODEL_DOWNLOAD_INVALID) ? uiKeys.settings.system.downloadInvalid : undefined;
      options.context.notify(key ? options.context.t(key) : message.replace(/^Error invoking remote method ['"][^'"]+['"]: (?:StateRecoveryError: )?/, ""), { renderPage: false, kind: "error" });
    }
  }, { signal });

  root.querySelectorAll<HTMLElement>("[data-test]").forEach((button) => {
    button.addEventListener("click", async () => {
      options.context.reportUserAction("connection-test", { kind: button.dataset.test });
      const resultElement = root.querySelector<HTMLElement>("#connection-result");
      if (!resultElement) return;
      resultElement.textContent = options.context.t(uiKeys.settings.actions.connectionPending);
      try {
        const result = await options.context.application.testConnection("comfy", options.formSettings());
        resultElement.className = `connection-result ${result.ok ? "success" : "error"}`;
        resultElement.textContent = result.message;
        options.context.notify(result.message, { kind: result.ok ? "info" : "error" });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        resultElement.className = "connection-result error";
        resultElement.textContent = message;
        options.context.notify(message, { kind: "error" });
      }
    }, { signal });
  });

  root.querySelector("#use-scanned-comfy")?.addEventListener("click", async () => {
    const scan = options.getEnvironmentScan();
    if (!scan?.comfyRoot) return;
    const current = options.formSettings();
    const result = await options.requestSaveSettings({
      ...current,
      comfyInstallDirectory: scan.comfyInstallDirectory || current.comfyInstallDirectory,
      modelDirectory: scan.modelDirectory,
      outputDirectory: scan.outputDirectory
    });
    if (result === "saved") {
      options.context.notify(options.context.t(uiKeys.settings.actions.scannedPathsApplied));
    }
  }, { signal });

  root.querySelector("#pick-comfy-install-directory")?.addEventListener("click", async () => {
    const input = root.querySelector<HTMLInputElement>("#comfy-install-directory");
    const directory = await options.context.hostCapabilities.pickDirectory();
    if (!directory || !input) return;
    input.value = directory;
    const settings = options.formSettings();
    options.setSettingsDraft(settings);
    await options.runEnvironmentScan(settings);
  }, { signal });

  root.querySelectorAll<HTMLElement>("[data-select-comfy-install]").forEach((button) => {
    button.addEventListener("click", async () => {
      const directory = button.dataset.selectComfyInstall;
      const input = root.querySelector<HTMLInputElement>("#comfy-install-directory");
      if (!directory || !input) return;
      input.value = directory;
      const settings = options.formSettings();
      options.setSettingsDraft(settings);
      await options.runEnvironmentScan(settings);
    }, { signal });
  });

  root.querySelector("#pick-model-directory")?.addEventListener("click", async () => {
    const directory = await options.context.hostCapabilities.pickDirectory();
    const input = root.querySelector<HTMLInputElement>("#model-directory");
    if (!directory || !input) return;
    input.value = directory;
    const settings = options.formSettings();
    options.setSettingsDraft(settings);
    void options.runEnvironmentScan(settings);
  }, { signal });

  root.querySelector("#pick-output-directory")?.addEventListener("click", async () => {
    const input = root.querySelector<HTMLInputElement>("#output-directory");
    const directory = await options.context.hostCapabilities.pickDirectory(input?.value, true);
    if (!directory || !input) return;
    if (!acceptsOutputDirectory(directory)) return;
    input.value = directory;
    const settings = options.formSettings();
    options.setSettingsDraft(settings);
    void options.runEnvironmentScan(settings);
  }, { signal });

  root.querySelector("#pick-image-output-directory")?.addEventListener("click", async () => {
    const input = root.querySelector<HTMLInputElement>("#image-output-directory");
    const directory = await options.context.hostCapabilities.pickDirectory(input?.value, true);
    if (!directory || !input) return;
    if (!acceptsOutputDirectory(directory)) return;
    input.value = directory;
    options.setSettingsDraft(options.formSettings());
    options.syncSettingsDirtyUi();
  }, { signal });

  root.querySelector("#pick-image-input-library-directory")?.addEventListener("click", async () => {
    const input = root.querySelector<HTMLInputElement>("#image-input-library-directory");
    const directory = await options.context.hostCapabilities.pickDirectory(input?.value, true);
    if (!directory || !input) return;
    input.value = directory;
    options.setSettingsDraft(options.formSettings());
    options.syncSettingsDirtyUi();
  }, { signal });

  for (const field of ["library-directory"]) {
    root.querySelector(`#pick-${field}`)?.addEventListener("click", async () => {
      const input = root.querySelector<HTMLInputElement>(`#${field}`);
      const directory = await options.context.hostCapabilities.pickDirectory(input?.value, true);
      if (!directory || !input) return;
      input.value = directory;
      options.setSettingsDraft(options.formSettings());
      options.syncSettingsDirtyUi();
    }, { signal });
  }

  root.querySelector("#open-image-asset-library")?.addEventListener("click", () => {
    if (options.settingsHaveUnsavedChanges()) {
      options.context.notify(options.context.t(uiKeys.settings.actions.saveLibraryFirst), { renderPage: false });
      return;
    }
    options.openImageAssetLibrary();
  }, { signal });

  root.querySelector("[data-pick-prompt-model-directory]")?.addEventListener("click", async () => {
    const directory = await options.context.hostCapabilities.pickDirectory();
    const input = root.querySelector<HTMLInputElement>("#prompt-model-directory");
    if (!directory || !input) return;
    input.value = directory;
    const settings = options.formSettings();
    options.setSettingsDraft(settings);
    void options.runEnvironmentScan(settings);
  }, { signal });

  root.querySelectorAll<HTMLElement>("[data-pick-lm-install]").forEach((button) => {
    button.addEventListener("click", async () => {
      const directory = await options.context.hostCapabilities.pickDirectory();
      if (!directory) return;
      const input = root.querySelector<HTMLInputElement>("#lm-install-directory");
      if (input) input.value = directory;
      const result = await options.requestSaveSettings({
        ...options.formSettings(),
        lmStudioInstallDirectory: directory
      });
      if (result === "saved") {
        options.context.notify(options.context.t(uiKeys.settings.actions.lmStudioSaved));
      }
    }, { signal });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-pick-strata-directory]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.pickStrataDirectory;
      if (id !== "strata-install-directory") return;
      const input = root.querySelector<HTMLInputElement>("#" + id);
      const directory = await options.context.hostCapabilities.pickDirectory(input?.value);
      if (!directory || !input) return;
      input.value = directory;
      const settings = options.formSettings();
      options.setSettingsDraft(settings);
      options.syncSettingsDirtyUi();
      void options.runEnvironmentScan(settings);
    }, { signal });
  });

  return () => {
    root.querySelectorAll<HTMLDetailsElement>("[data-settings-disclosure-key]").forEach(details => {
      disclosures.set(details.dataset.settingsDisclosureKey!, details.open);
    });
    events.abort();
  };
}
