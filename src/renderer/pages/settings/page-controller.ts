import type {
  EnvironmentScanResult,
  ModelComponentStatus,
  Settings
} from "../../../types";
import { directoryComparisonKey } from "./helpers";
import type { SettingsInstallGuideSelection } from "./fragments";
import type { RendererCleanup, RendererContext } from "../../contracts";

export interface SettingsPageControllerOptions {
  context: RendererContext;
  formSettings(): Settings;
  getEnvironmentScan(): EnvironmentScanResult | null;
  setSettingsDraft(settings: Settings | null): void;
  setInstallGuide(selection: SettingsInstallGuideSelection | null): void;
  getInstallGuide(): SettingsInstallGuideSelection | null;
  settingsHaveUnsavedChanges(): boolean;
  syncSettingsDirtyUi(): void;
  runEnvironmentScan(settings: Settings): Promise<void>;
  loadAppLogs(): void;
  togglePromptModel(): Promise<void>;
  saveSettingsFromUi(settings: Settings): Promise<void>;
  saveSettingsDirect(settings: Settings): Promise<void>;
  requestDirectoryMigration(
    previousSettings: Settings,
    nextSettings: Settings,
    oldDirectory: string,
    newDirectory: string
  ): void;
  openImageAssetLibrary(): void;
  rememberModalFocus(): void;
  restoreModalFocus(): void;
  bindModalFocus(dialog: HTMLElement, close: () => void, initialSelector?: string): void;
}

export function mountSettingsPageController(
  options: SettingsPageControllerOptions
): RendererCleanup {
  const events = new AbortController();
  const signal = events.signal;
  const root = options.context.root;

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
    const selectedPath = await options.context.studio.pickPython();
    const input = root.querySelector<HTMLInputElement>("#comfy-python-path");
    if (!selectedPath || !input) return;
    input.value = selectedPath;
    const settings = options.formSettings();
    options.setSettingsDraft(settings);
    options.context.reportUserAction("select-comfy-python", { source: "file-picker" });
    await options.runEnvironmentScan(settings);
  }, { signal });

  root.querySelectorAll<HTMLButtonElement>("[data-install-profile]").forEach((button) => {
    button.addEventListener("click", () => {
      options.rememberModalFocus();
      options.setSettingsDraft(options.formSettings());
      const profile = options.getEnvironmentScan()?.modelProfiles.find(
        (item) => item.id === button.dataset.installProfile
      );
      const component = profile?.components[Number(button.dataset.installComponent)];
      if (!profile || !component) return;
      options.setInstallGuide({ profileName: profile.name, component });
      options.context.requestRender();
    }, { signal });
  });

  const closeInstallGuide = () => {
    options.setInstallGuide(null);
    options.context.requestRender();
    options.restoreModalFocus();
  };
  root.querySelector("#close-install-guide")?.addEventListener("click", closeInstallGuide, { signal });
  root.querySelector("#dismiss-install-guide")?.addEventListener("click", closeInstallGuide, { signal });
  root.querySelector("#install-guide-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeInstallGuide();
  }, { signal });
  const installGuide = root.querySelector<HTMLElement>(".install-guide-dialog");
  if (installGuide) options.bindModalFocus(installGuide, closeInstallGuide, "#dismiss-install-guide");
  root.querySelector("#open-install-download")?.addEventListener("click", async () => {
    const selected = options.getInstallGuide();
    if (!selected) return;
    const opened = await options.context.studio.openExternal(selected.component.installGuide.downloadUrl);
    if (!opened) options.context.notify("下载页面无法打开，请检查链接或系统浏览器设置。");
  }, { signal });

  root.querySelector("#scan-environment")?.addEventListener("click", () => {
    const settings = options.formSettings();
    options.setSettingsDraft(settings);
    void options.runEnvironmentScan(settings);
  }, { signal });

  root.querySelector("#save-settings")?.addEventListener("click", async () => {
    const state = options.context.getState();
    if (!state) return;
    const previousSettings = state.settings;
    const nextSettings = options.formSettings();
    const scan = options.getEnvironmentScan();
    const oldDirectory = previousSettings.outputDirectory || scan?.outputDirectory || "";
    const newDirectory = nextSettings.outputDirectory || scan?.outputDirectory || "";
    if (directoryComparisonKey(oldDirectory) !== directoryComparisonKey(newDirectory)) {
      options.rememberModalFocus();
      options.requestDirectoryMigration(previousSettings, nextSettings, oldDirectory, newDirectory);
      return;
    }
    try {
      await options.saveSettingsFromUi(nextSettings);
    } catch (error) {
      options.context.notify(error instanceof Error ? error.message : String(error), { renderPage: false });
    }
  }, { signal });

  root.querySelectorAll<HTMLElement>("[data-test]").forEach((button) => {
    button.addEventListener("click", async () => {
      options.context.reportUserAction("connection-test", { kind: button.dataset.test });
      const resultElement = root.querySelector<HTMLElement>("#connection-result");
      if (!resultElement) return;
      resultElement.textContent = "正在连接…";
      const result = await options.context.studio.testConnection("comfy", options.formSettings());
      resultElement.className = `connection-result ${result.ok ? "success" : "error"}`;
      resultElement.textContent = result.message;
    }, { signal });
  });

  root.querySelector("#use-scanned-comfy")?.addEventListener("click", async () => {
    const scan = options.getEnvironmentScan();
    if (!scan?.comfyRoot) return;
    const current = options.formSettings();
    await options.saveSettingsDirect({
      ...current,
      comfyInstallDirectory: scan.comfyInstallDirectory || current.comfyInstallDirectory,
      modelDirectory: scan.modelDirectory,
      outputDirectory: scan.outputDirectory
    });
    options.setSettingsDraft(null);
    options.context.notify("已采用扫描到的 ComfyUI 模型和输出目录。");
  }, { signal });

  root.querySelector("#pick-comfy-install-directory")?.addEventListener("click", async () => {
    const input = root.querySelector<HTMLInputElement>("#comfy-install-directory");
    const directory = await options.context.studio.pickDirectory();
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
    const directory = await options.context.studio.pickDirectory();
    const input = root.querySelector<HTMLInputElement>("#model-directory");
    if (!directory || !input) return;
    input.value = directory;
    const settings = options.formSettings();
    options.setSettingsDraft(settings);
    void options.runEnvironmentScan(settings);
  }, { signal });

  root.querySelector("#pick-output-directory")?.addEventListener("click", async () => {
    const input = root.querySelector<HTMLInputElement>("#output-directory");
    const directory = await options.context.studio.pickDirectory(input?.value, true);
    if (!directory || !input) return;
    input.value = directory;
    const settings = options.formSettings();
    options.setSettingsDraft(settings);
    void options.runEnvironmentScan(settings);
  }, { signal });

  root.querySelector("#pick-image-output-directory")?.addEventListener("click", async () => {
    const input = root.querySelector<HTMLInputElement>("#image-output-directory");
    const directory = await options.context.studio.pickDirectory(input?.value, true);
    if (!directory || !input) return;
    input.value = directory;
    options.setSettingsDraft(options.formSettings());
    options.syncSettingsDirtyUi();
  }, { signal });

  root.querySelector("#pick-image-input-library-directory")?.addEventListener("click", async () => {
    const input = root.querySelector<HTMLInputElement>("#image-input-library-directory");
    const directory = await options.context.studio.pickDirectory(input?.value, true);
    if (!directory || !input) return;
    input.value = directory;
    options.setSettingsDraft(options.formSettings());
    options.syncSettingsDirtyUi();
  }, { signal });

  root.querySelector("#open-image-asset-library")?.addEventListener("click", () => {
    if (options.settingsHaveUnsavedChanges()) {
      options.context.notify("请先保存素材库目录设置，再开始整理。", { renderPage: false });
      return;
    }
    options.openImageAssetLibrary();
  }, { signal });

  root.querySelector("[data-pick-prompt-model-directory]")?.addEventListener("click", async () => {
    const directory = await options.context.studio.pickDirectory();
    const input = root.querySelector<HTMLInputElement>("#prompt-model-directory");
    if (!directory || !input) return;
    input.value = directory;
    const settings = options.formSettings();
    options.setSettingsDraft(settings);
    void options.runEnvironmentScan(settings);
  }, { signal });

  root.querySelectorAll<HTMLElement>("[data-pick-lm-install]").forEach((button) => {
    button.addEventListener("click", async () => {
      const directory = await options.context.studio.pickDirectory();
      if (!directory) return;
      const input = root.querySelector<HTMLInputElement>("#lm-install-directory");
      if (input) input.value = directory;
      await options.saveSettingsDirect({
        ...options.formSettings(),
        lmStudioInstallDirectory: directory
      });
      options.setSettingsDraft(null);
      const state = options.context.getState();
      if (state) await options.runEnvironmentScan(state.settings);
      options.context.notify("已保存 LM Studio 安装目录并重新扫描。");
    }, { signal });
  });

  return () => events.abort();
}
