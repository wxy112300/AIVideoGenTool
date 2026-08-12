import { createDefaultImagePromptPresets } from "../../../core/defaults";
import { imageModelCapabilityFor } from "../../../core/image-workflow";
import { createDefaultH3PromptPresets } from "../../../core/h3-prompt-presets";
import { isManagedPromptModel } from "../../../core/prompt-models";
import type {
  H3PromptPreset,
  ImagePromptPreset,
  Settings
} from "../../../types";
import type { RendererCleanup, RendererContext, SettingsTab } from "../../contracts";

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
    const count = Math.min(10, Math.max(1, Number(value) || 1));
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
      context.notify("该 Gemma GGUF 由当前 ComfyUI 的 H3 Prompt Writer 运行，扩写完成后会自动卸载。");
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
    context.notify("扩写预设已恢复默认，请保存设置后生效。");
  }, { signal });

  root.querySelector("#restore-image-prompt-presets")?.addEventListener("click", () => {
    options.setSettingsDraft({
      ...options.formSettings(),
      imagePromptPresets: createDefaultImagePromptPresets()
    });
    context.requestRender();
    context.notify("图片提示词预设已恢复默认，请保存设置后生效。");
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

  root.querySelectorAll<HTMLElement>("[data-settings-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextTab = button.dataset.settingsTab as SettingsTab | undefined;
      if (!nextTab) return;
      options.setSettingsDraft(options.formSettings());
      options.setSettingsTab(nextTab);
      context.reportUserAction("settings-tab", { tab: nextTab });
      context.requestRender();
    }, { signal });
  });

  return () => events.abort();
}
