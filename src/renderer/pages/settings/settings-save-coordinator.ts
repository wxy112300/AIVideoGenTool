import { imageModelCapabilityFor } from "../../../core/image-workflow";
import type {
  AppState,
  BundledWorkflow,
  Draft,
  EnvironmentScanResult,
  Settings,
  SettingsSaveMode
} from "../../../types";
import { directoryComparisonKey } from "./helpers";

export interface SettingsSaveCoordinatorDependencies {
  getState(): AppState;
  getEnvironmentScan(): EnvironmentScanResult | null;
  loadLocale(locale: Settings["uiLocale"]): Promise<void>;
  saveSettings(settings: Settings, mode: SettingsSaveMode): Promise<AppState>;
  saveImageDraft(draft: AppState["imageDraft"]): Promise<AppState>;
  saveDraft(draft: Draft): Promise<AppState>;
  getBundledWorkflow(modelId: string, inputMode: Draft["inputMode"]): Promise<BundledWorkflow | null>;
  setState(state: AppState): void;
  clearSettingsDraft(): void;
  syncSettingsDirtyUi(): void;
  deleteBundledWorkflow(modelId: string, inputMode: Draft["inputMode"]): void;
  cacheBundledWorkflow(workflow: BundledWorkflow, inputMode: Draft["inputMode"]): void;
  refreshEnvironment(settings: Settings): Promise<EnvironmentScanResult | null>;
  requestDirectoryMigration(
    previousSettings: Settings,
    nextSettings: Settings,
    oldDirectory: string,
    newDirectory: string
  ): void;
  notifySaved(proxyChanged: boolean, mode: SettingsSaveMode): void;
  requestRender(): void;
}

export type SettingsSaveRequestResult = "saved" | "migration-required";

export class SettingsSaveCoordinator {
  constructor(private readonly dependencies: SettingsSaveCoordinatorDependencies) {}

  async requestSave(nextSettings: Settings): Promise<SettingsSaveRequestResult> {
    const previousSettings = this.dependencies.getState().settings;
    const scannedOutputDirectory = this.dependencies.getEnvironmentScan()?.outputDirectory || "";
    const oldDirectory = previousSettings.outputDirectory || scannedOutputDirectory;
    const newDirectory = nextSettings.outputDirectory || scannedOutputDirectory;
    if (directoryComparisonKey(oldDirectory) !== directoryComparisonKey(newDirectory)) {
      this.dependencies.requestDirectoryMigration(
        previousSettings,
        nextSettings,
        oldDirectory,
        newDirectory
      );
      return "migration-required";
    }
    await this.save(nextSettings);
    return "saved";
  }

  async save(
    nextSettings: Settings,
    mode: SettingsSaveMode = "apply"
  ): Promise<void> {
    const previousState = this.dependencies.getState();
    const previousSettings = previousState.settings;
    const previousProfile = previousSettings.ltxExtensionModelProfile;
    const imageModelChanged = previousSettings.defaultImageModel !== nextSettings.defaultImageModel;
    const pathsChanged = this.pathsChanged(previousSettings, nextSettings);
    const proxyChanged = previousSettings.proxyEnabled !== nextSettings.proxyEnabled ||
      previousSettings.proxyUrl !== nextSettings.proxyUrl;

    await this.dependencies.loadLocale(nextSettings.uiLocale);
    let savedState = await this.dependencies.saveSettings(nextSettings, mode);
    this.dependencies.clearSettingsDraft();
    this.dependencies.setState(savedState);
    this.dependencies.syncSettingsDirtyUi();

    if (imageModelChanged && savedState.imageDraft.modelId === previousSettings.defaultImageModel) {
      const capability = imageModelCapabilityFor(nextSettings.defaultImageModel);
      const qualityProfile = capability.qualityProfiles.some(
        (profile) => profile.id === savedState.imageDraft.qualityProfile
      )
        ? savedState.imageDraft.qualityProfile
        : capability.qualityProfiles[0]?.id ?? "native";
      savedState = await this.dependencies.saveImageDraft({
        ...savedState.imageDraft,
        modelId: nextSettings.defaultImageModel,
        qualityProfile
      });
      this.dependencies.setState(savedState);
    }

    if (savedState.settings.ltxExtensionModelProfile !== previousProfile) {
      this.dependencies.deleteBundledWorkflow("sulphur2", "image");
      this.dependencies.deleteBundledWorkflow("sulphur2", "video");
      if (savedState.draft.modelId === "sulphur2") {
        const bundled = await this.dependencies.getBundledWorkflow(
          "sulphur2",
          savedState.draft.inputMode
        );
        if (bundled) {
          this.dependencies.cacheBundledWorkflow(bundled, savedState.draft.inputMode);
          savedState = await this.dependencies.saveDraft({
            ...savedState.draft,
            workflowPath: bundled.path
          });
          this.dependencies.setState(savedState);
        }
      }
    }

    const requiresEnvironmentRefresh = pathsChanged ||
      savedState.settings.ltxExtensionModelProfile !== previousProfile;
    const environmentRefreshed = !requiresEnvironmentRefresh ||
      Boolean(await this.dependencies.refreshEnvironment(savedState.settings));
    if (environmentRefreshed) {
      this.dependencies.notifySaved(proxyChanged, mode);
    }
    this.dependencies.requestRender();
  }

  private pathsChanged(previous: Settings, next: Settings): boolean {
    return previous.comfyInstallDirectory !== next.comfyInstallDirectory ||
      previous.comfyPythonPath !== next.comfyPythonPath ||
      previous.modelDirectory !== next.modelDirectory ||
      previous.outputDirectory !== next.outputDirectory ||
      previous.imageOutputDirectory !== next.imageOutputDirectory ||
      previous.imageInputLibraryDirectory !== next.imageInputLibraryDirectory ||
      previous.lmStudioInstallDirectory !== next.lmStudioInstallDirectory ||
      previous.promptModelDirectory !== next.promptModelDirectory ||
      previous.promptLlamaServerPath !== next.promptLlamaServerPath;
  }
}
