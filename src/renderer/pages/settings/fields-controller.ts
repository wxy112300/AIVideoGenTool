import { createDefaultQwenImagePromptPresets } from "../../prompt-packs";
import { imageModelCapabilityFor, imageOutputCountMax } from "../../../core/image-workflow";
import { createDefaultH3PromptPresets } from "../../prompt-packs";
import { createDefaultH3AutoPromptSeedInstructions } from "../../../core/prompts/h3/auto-seeds";
import { isManagedPromptModel } from "../../../core/prompt-models";
import type {
  H3PromptPreset,
  ImagePromptPreset,
  Settings
} from "../../../types";
import type { RendererCleanup, RendererContext, SettingsTab } from "../../contracts";
import { uiKeys } from "../../../core/i18n-keys";

export interface SettingsFieldsControllerOptions {
  formSettings(): Settings;
  setH3PromptPreset(preset: H3PromptPreset): void;
  setImagePromptPreset(preset: ImagePromptPreset): void;
  setSettingsDraft(settings: Settings | null): void;
  setSettingsTab(tab: SettingsTab): void;
  hasUnsavedChanges(): boolean;
  syncSettingsDirtyUi(): void;
}

export function mountSettingsFieldsController(
  context: RendererContext,
  options: SettingsFieldsControllerOptions
): RendererCleanup {
  const events = new AbortController();
  const signal = events.signal;
  const root = context.root;

  root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    ".settings-content input, .settings-content textarea, .settings-content select"
  ).forEach((input) => {
    const update = () => {
      options.setSettingsDraft(options.formSettings());
      options.syncSettingsDirtyUi();
    };
    input.addEventListener("input", update, { signal });
    input.addEventListener("change", update, { signal });
  });

  const imageCountRange = root.querySelector<HTMLInputElement>("#image-output-count");
  const imageCountNumber = root.querySelector<HTMLInputElement>("#image-output-count-number");
  const syncImageCount = (value: string) => {
    const count = Math.min(imageOutputCountMax, Math.max(1, Number(value) || 1));
    if (imageCountRange) imageCountRange.value = String(count);
    if (imageCountNumber) imageCountNumber.value = String(count);
    options.setSettingsDraft(options.formSettings());
    options.syncSettingsDirtyUi();
  };
  imageCountRange?.addEventListener("input", () => syncImageCount(imageCountRange.value), { signal });
  imageCountNumber?.addEventListener("input", () => syncImageCount(imageCountNumber.value), { signal });

  root.querySelector("#prompt-model-id")?.addEventListener("change", (event) => {
    const modelId = (event.currentTarget as HTMLSelectElement).value;
    if (isManagedPromptModel(modelId)) {
      options.setSettingsDraft(options.formSettings());
      context.notify(context.t(uiKeys.settings.promptWriterRuntime));
    }
  }, { signal });

  root.querySelector("#default-image-model")?.addEventListener("change", () => {
    const settings = options.formSettings();
    const capability = imageModelCapabilityFor(settings.defaultImageModel);
    const qualityProfile = capability.qualityProfiles.some(
      (profile) => profile.id === settings.defaultImageQualityProfile
    )
      ? settings.defaultImageQualityProfile
      : capability.qualityProfiles[0]?.id ?? "native";
    options.setSettingsDraft({ ...settings, defaultImageQualityProfile: qualityProfile });
    context.requestRender();
  }, { signal });

  root.querySelector("#h3-prompt-preset-setting")?.addEventListener("change", (event) => {
    options.setSettingsDraft(options.formSettings());
    options.setH3PromptPreset((event.currentTarget as HTMLSelectElement).value as H3PromptPreset);
    context.requestRender();
  }, { signal });

  root.querySelector("#image-prompt-preset-setting")?.addEventListener("change", (event) => {
    options.setSettingsDraft(options.formSettings());
    options.setImagePromptPreset((event.currentTarget as HTMLSelectElement).value as ImagePromptPreset);
    context.requestRender();
  }, { signal });

  root.querySelector("#restore-h3-prompt-presets")?.addEventListener("click", () => {
    options.setSettingsDraft({
      ...options.formSettings(),
      h3PromptPresets: createDefaultH3PromptPresets()
    });
    context.requestRender();
    context.notify(context.t(uiKeys.settings.actions.h3PresetRestored));
  }, { signal });

  root.querySelector("#restore-h3-auto-prompt-seeds")?.addEventListener("click", () => {
    options.setSettingsDraft({
      ...options.formSettings(),
      h3AutoPromptSeedId: "",
      h3AutoPromptSeedInstructions: createDefaultH3AutoPromptSeedInstructions()
    });
    context.requestRender();
    context.notify(context.t(uiKeys.settings.actions.h3PresetRestored));
  }, { signal });

  root.querySelector("#restore-image-prompt-presets")?.addEventListener("click", () => {
    options.setSettingsDraft({
      ...options.formSettings(),
      imagePromptPresets: createDefaultQwenImagePromptPresets()
    });
    context.requestRender();
    context.notify(context.t(uiKeys.settings.actions.imagePresetRestored));
  }, { signal });

  root.querySelector<HTMLInputElement>("#proxy-enabled")?.addEventListener("change", () => {
    options.setSettingsDraft(options.formSettings());
    context.requestRender();
  }, { signal });

  root.querySelector<HTMLInputElement>("#auto-retry-failed-tasks")?.addEventListener("change", () => {
    options.setSettingsDraft(options.formSettings());
    context.requestRender();
  }, { signal });

  root.querySelector<HTMLButtonElement>("#discard-settings")?.addEventListener("click", () => {
    if (!options.hasUnsavedChanges()) return;
    options.setSettingsDraft(null);
    void context.studio.setSettingsDirty(false).catch(() => undefined);
    context.requestRender();
  }, { signal });

  const restoreSettingsTabView = (nextTab: SettingsTab, scrollLeft: number, scrollTop: number): void => {
    let attempts = 0;
    const restore = () => {
      attempts += 1;
      if (context.getRoute().page !== "settings") return;
      const target = root.querySelector<HTMLButtonElement>(`#settings-tab-${nextTab}[aria-selected="true"]`);
      if (!target) {
        if (attempts < 60) window.requestAnimationFrame(restore);
        return;
      }
      target.focus({ preventScroll: true });
      target.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      window.scrollTo({ left: scrollLeft, top: scrollTop, behavior: "auto" });
    };
    window.requestAnimationFrame(restore);
  };

  const selectSettingsTab = (nextTab: SettingsTab, preserveFocus: boolean) => {
    const scrollLeft = window.scrollX;
    const scrollTop = window.scrollY;
    options.setSettingsDraft(options.formSettings());
    options.setSettingsTab(nextTab);
    context.reportUserAction("settings-tab", { tab: nextTab });
    context.requestRender();
    if (preserveFocus) restoreSettingsTabView(nextTab, scrollLeft, scrollTop);
  };

  const settingsTabs = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-settings-tab]"));
  settingsTabs.forEach((button, index) => {
    button.addEventListener("click", () => {
      const nextTab = button.dataset.settingsTab as SettingsTab | undefined;
      if (!nextTab) return;
      selectSettingsTab(nextTab, true);
    }, { signal });
    button.addEventListener("keydown", (event) => {
      const key = event.key;
      const nextIndex = key === "Home"
        ? 0
        : key === "End"
          ? settingsTabs.length - 1
          : key === "ArrowRight" || key === "ArrowDown"
            ? (index + 1) % settingsTabs.length
            : key === "ArrowLeft" || key === "ArrowUp"
              ? (index - 1 + settingsTabs.length) % settingsTabs.length
              : -1;
      if (nextIndex < 0 || !settingsTabs[nextIndex]) return;
      event.preventDefault();
      const nextTab = settingsTabs[nextIndex].dataset.settingsTab as SettingsTab | undefined;
      if (nextTab) selectSettingsTab(nextTab, true);
    }, { signal });
  });

  return () => events.abort();
}
