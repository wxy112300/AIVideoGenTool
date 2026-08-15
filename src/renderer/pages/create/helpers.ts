import type {
  BundledWorkflow,
  Draft,
  EnvironmentScanResult,
  H3PromptMode,
  H3PromptPreset,
  H3ReferenceMediaType,
  H3ReferenceSlot,
  ImageEditDraft,
  PromptVersion,
  Settings,
  UiLocale,
  WorkflowCapabilities
} from "../../../types";
import { inferH3PromptMode, type H3PromptBuilderInput } from "../../../core/h3-prompt";
import { checkH3Prompt } from "../../../core/h3-prompt-check";
import { activePromptIndexForDraft, promptVersionsForDraft } from "../../../core/draft-prompts";
import {
  extensionSafetyForTask,
  frameInterpolationMultiplier,
  generationFrameCountForTask,
  isMiniMaxH3BoundaryExtensionModel,
  isMiniMaxH3Fl2vaModel,
  isMiniMaxH3Model,
  isMiniMaxH3R2vModel,
  outputFrameCountForTask
} from "../../../core/workflow";
import { h3PromptPackFor, qwenImagePromptPackFor } from "../../prompt-packs";
import type { PromptUi } from "../../../core/prompts/types.js";
import { escapeHtml } from "../../shared/dom";
import type { Translate } from "../../../core/i18n";
import { uiKeys } from "../../../core/i18n-keys";
import type { RendererContext } from "../../contracts";
import { countPromptWords, recommendedH3PromptWords } from "../../../core/prompt-count";
import { modelCatalog } from "../../../core/catalog";
import type { CreateModelOptionViewModel } from "./fragments";

export const h3ReferenceRolePromptLabels = {
  subject: "subject",
  scene: "scene / environment",
  style: "style / clothing",
  motion: "motion / pose",
  camera: "camera / composition",
  voice: "voice association",
  keyframe: "keyframe",
  other: "other reference"
};

export const imageReferenceRolePromptLabels = {
  base: "base image",
  person: "person",
  object: "object",
  pose: "pose",
  style: "style",
  background: "background",
  auto: "automatic reference"
};

export function activePrompt(draft: Draft, locale: UiLocale = "zh-CN"): PromptVersion {
  const promptVersions = promptVersionsForDraft(draft);
  const activePromptVersion = activePromptIndexForDraft(draft);
  return promptVersions[activePromptVersion] ??
    promptVersions.at(-1) ?? {
      id: crypto.randomUUID(),
      label: h3PromptPackFor(locale).ui.t("newVersion"),
      text: "",
      createdAt: new Date().toISOString()
    };
}

export function activeImagePrompt(draft: ImageEditDraft, locale: UiLocale = "zh-CN"): PromptVersion {
  return draft.promptVersions[draft.activePromptVersion] ??
    draft.promptVersions.at(-1) ?? {
      id: "image-prompt-fallback",
      label: qwenImagePromptPackFor(locale).ui.t("originalVersion"),
      text: "",
      createdAt: new Date().toISOString()
    };
}

export function h3PromptModeForDraft(draft: Draft): H3PromptMode {
  return inferH3PromptMode(
    Boolean(draft.startImagePath),
    Boolean(draft.endImagePath),
    isMiniMaxH3R2vModel(draft.modelId)
  );
}

export function interpolationEstimate(draft: Draft): {
  multiplier: 1 | 2 | 4;
  generatedFrames: number;
  outputFrames: number;
} {
  return {
    multiplier: frameInterpolationMultiplier(draft),
    generatedFrames: generationFrameCountForTask(draft),
    outputFrames: outputFrameCountForTask(draft)
  };
}

export function extensionSafetyForDraft(draft: Draft, settings: Settings) {
  return extensionSafetyForTask({
    ...draft,
    resolution: isMiniMaxH3Fl2vaModel(draft.modelId) || isMiniMaxH3R2vModel(draft.modelId)
      ? draft.resolution
      : settings.ltxExtensionResolution,
    maxGeneratedFrames: isMiniMaxH3Fl2vaModel(draft.modelId) || isMiniMaxH3R2vModel(draft.modelId)
      ? 362
      : settings.ltxExtensionFrames,
    overlapFrames: settings.ltxExtensionOverlapFrames,
    unloadBetweenStages: settings.ltxExtensionUnloadBetweenStages
  }, settings.uiLocale);
}

export function orderVideoProfiles<T extends { id: string }>(profiles: ReadonlyArray<T>): T[] {
  return [...profiles].sort((left, right) =>
    (modelCatalog.get(right.id)?.definition.order ?? (isMiniMaxH3Model(right.id) ? 1 : 0)) -
    (modelCatalog.get(left.id)?.definition.order ?? (isMiniMaxH3Model(left.id) ? 1 : 0))
  );
}

/**
 * A model selector is scoped to the current creation mode. In particular,
 * video extension is not a generic video capability: the selected model must
 * explicitly declare support for the extension workflow (or be backed by a
 * workflow that has already been inspected). Keeping this rule here prevents
 * unsupported models from appearing as selectable options and avoids a late
 * failure after the user has filled the rest of the form.
 */
export function modelSupportsCreateInputMode(
  modelId: string,
  inputMode: Draft["inputMode"],
  selected: boolean,
  workflowPath: string,
  workflowCapabilities: Readonly<Record<string, WorkflowCapabilities>>,
  bundledWorkflows: Readonly<Record<string, BundledWorkflow>>
): boolean {
  const definition = modelCatalog.get(modelId)?.definition;
  const declaredInputModes = definition?.inputModes;
  if (declaredInputModes && !declaredInputModes.includes(inputMode)) return false;
  if (inputMode !== "video") return true;

  const declaredExtensionSupport = definition?.capabilities?.supportsVideoExtension;
  if (declaredExtensionSupport !== undefined) return declaredExtensionSupport;

  // Older catalog entries and user-supplied workflows may not have a catalog
  // capability. Preserve the already validated workflow fallback for those
  // entries, but never infer extension support from a display name alone.
  if (isMiniMaxH3BoundaryExtensionModel(modelId) || isMiniMaxH3R2vModel(modelId)) {
    return true;
  }
  return selected
    ? workflowCapabilities[workflowPath]?.supportsVideoExtension === true
    : bundledWorkflows[`${modelId}:${inputMode}`]?.supportsVideoExtension === true;
}

export function createModelOptionViewModels(
  draft: Draft,
  environmentScan: EnvironmentScanResult | null,
  workflowCapabilities: Readonly<Record<string, WorkflowCapabilities>>,
  bundledWorkflows: Readonly<Record<string, BundledWorkflow>>,
  t: Translate
): CreateModelOptionViewModel[] {
  const scanned = environmentScan
    ? orderVideoProfiles(
        environmentScan.modelProfiles.filter((profile) => profile.category === "video")
      )
    : undefined;
  const profiles = scanned?.length
    ? scanned
    : modelCatalog.list("video").map((entry) => ({
        id: entry.definition.id,
        name: modelCatalog.localized(entry.definition.id)?.name ?? entry.definition.id,
        available: true,
        integrated: true
      }));
  return profiles
    .filter((profile) => modelSupportsCreateInputMode(
      profile.id,
      draft.inputMode,
      draft.modelId === profile.id,
      draft.workflowPath,
      workflowCapabilities,
      bundledWorkflows
    ))
    .map((profile) => {
      const selected = draft.modelId === profile.id;
      const supportsVideoExtension = modelSupportsCreateInputMode(
        profile.id,
        draft.inputMode,
        selected,
        draft.workflowPath,
        workflowCapabilities,
        bundledWorkflows
      );
      const unavailable = !profile.available ||
        profile.integrated === false ||
        (draft.inputMode === "video" && !supportsVideoExtension);
      const suffix = !profile.available
        ? t(uiKeys.create.modelStatus.missingComponent)
        : profile.integrated === false
          ? t(uiKeys.create.modelStatus.workflowPending)
          : draft.inputMode === "video" && !supportsVideoExtension
            ? t(uiKeys.create.modelStatus.extensionCheckFailed)
            : "";
      const catalogCapabilities = modelCatalog.get(profile.id)?.definition.capabilities;
      const modeLabel = draft.inputMode === "video"
        ? catalogCapabilities?.supportsReferenceSlots
          ? t(uiKeys.create.modelStatus.motionContextRecommended)
          : catalogCapabilities?.supportsEndFrame
            ? t(uiKeys.create.modelStatus.endFrameCompatible)
            : ""
        : "";
      return {
        id: profile.id,
        name: profile.name,
        selected,
        unavailable,
        modeLabel,
        suffix
      };
    });
}

export function promptSnippetOptions(
  escapeHtml: (value: unknown) => string,
  locale: UiLocale = "zh-CN"
): string {
  const snippets = h3PromptPackFor(locale).snippets;
  return [...new Set(snippets.map((snippet) => snippet.group))]
    .map((group) => `<optgroup label="${escapeHtml(group)}">${snippets
      .filter((snippet) => snippet.group === group)
      .map((snippet) => `<option value="${escapeHtml(snippet.id)}">${escapeHtml(snippet.label)}</option>`)
      .join("")}</optgroup>`)
    .join("");
}

export function insertPromptSnippet(
  promptInput: HTMLTextAreaElement,
  snippet: string
): void {
  if (!snippet) return;
  const start = promptInput.selectionStart;
  const end = promptInput.selectionEnd;
  const before = promptInput.value.slice(0, start);
  const after = promptInput.value.slice(end);
  const prefix = before && !/\s$/u.test(before) ? "\n" : "";
  const suffix = after && !/^\s/u.test(after) ? "\n" : "";
  promptInput.focus();
  promptInput.setRangeText(
    `${prefix}${snippet}${suffix}`,
    start,
    end,
    "end"
  );
  promptInput.dispatchEvent(new Event("input", { bubbles: true }));
}

export function imageFileIsSupported(file: File): boolean {
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp|bmp)$/i.test(file.name);
}

export function updatePromptWordCounter(
  promptText: string,
  mode: H3PromptMode | undefined,
  durationSeconds: number,
  ui: PromptUi = h3PromptPackFor("zh-CN").ui
): void {
  const counter = document.querySelector<HTMLElement>("#prompt-word-counter");
  if (!counter) return;
  const count = countPromptWords(promptText);
  if (!mode) {
    counter.className = "prompt-word-counter";
    counter.textContent = ui.t("wordCount", { count });
    return;
  }
  const limit = recommendedH3PromptWords(mode, durationSeconds);
  const overLimit = count > limit;
  counter.className = `prompt-word-counter ${overLimit ? "warning" : ""}`;
  counter.textContent = overLimit
    ? ui.t("wordCountOverLimit", { count, limit })
    : ui.t("wordCountSuggestion", { count, limit });
}

export function updateImagePromptWordCounter(
  promptText: string,
  ui: PromptUi = h3PromptPackFor("zh-CN").ui
): void {
  const counter = document.querySelector<HTMLElement>("#image-prompt-word-counter");
  if (!counter) return;
  counter.className = "prompt-word-counter";
  counter.textContent = ui.t("imageWordCount", { count: countPromptWords(promptText) });
}

export function resizePromptInput(promptInput: HTMLTextAreaElement): void {
  promptInput.style.height = "auto";
  const styles = window.getComputedStyle(promptInput);
  const minHeight = Number.parseFloat(styles.minHeight) || 0;
  const maxHeight = Number.parseFloat(styles.maxHeight);
  const contentHeight = promptInput.scrollHeight;
  const height = Number.isFinite(maxHeight)
    ? Math.min(contentHeight, maxHeight)
    : contentHeight;
  promptInput.style.height = `${Math.max(minHeight, height)}px`;
  promptInput.style.overflowY = Number.isFinite(maxHeight) && contentHeight > maxHeight
    ? "auto"
    : "hidden";
}

export function h3PromptCheckMarkup(
  promptText: string,
  hasEndImage: boolean,
  mode: H3PromptMode | undefined,
  hasImageReference: boolean,
  hasVideoReference: boolean,
  durationSeconds: number,
  escapeHtml: (value: unknown) => string,
  ui: PromptUi = h3PromptPackFor("zh-CN").ui
): string {
  const result = checkH3Prompt(promptText, {
    hasEndImage,
    mode,
    hasImageReference,
    hasVideoReference,
    durationSeconds
  });
  return `<div id="h3-prompt-check" class="h3-prompt-check ${result.valid ? "valid" : "warning"}" aria-live="polite">
    <div class="h3-prompt-check-heading"><strong>${ui.t("promptCheckTitle")}</strong><span>${escapeHtml(result.summary)}</span></div>
    ${result.items.length ? `<ul>${result.items.map((item) => `<li>${escapeHtml(item.message)}</li>`).join("")}</ul>` : ""}
  </div>`;
}

export function h3PromptPresetOptions(
  selected: H3PromptPreset,
  includeMultiReference: boolean,
  locale: UiLocale = "zh-CN"
): string {
  const pack = h3PromptPackFor(locale);
  return pack.presetOrder
    .filter((preset) => includeMultiReference || preset !== "multi-reference")
    .map((preset) => `<option value="${preset}" data-description="${escapeHtml(pack.presetDescriptions[preset])}" title="${escapeHtml(pack.presetDescriptions[preset])}" ${selected === preset ? "selected" : ""}>${escapeHtml(pack.presetLabels[preset])}</option>`)
    .join("");
}

export function createDefaultH3PromptBuilder(): H3PromptBuilderInput {
  return {
    style: "",
    subject: "",
    action: "",
    continuity: "",
    physicalLock: "",
    cameraMotion: "static",
    cameraAmplitude: "small",
    cameraSpeed: "slow",
    framing: "",
    diegeticSound: "",
    finalState: "",
    soundscape: "",
    music: "N/A",
    dialogueSpeaker: "S1",
    dialogueLanguage: "Chinese",
    dialogueDelivery: "a clear, natural voice",
    dialogueText: "",
    onScreenText: ""
  };
}

export function newH3ReferenceSlot(
  mediaPath = "",
  mediaType: H3ReferenceMediaType = "image"
): H3ReferenceSlot {
  return {
    id: crypto.randomUUID(),
    mediaType,
    mediaPath,
    role: "subject",
    note: ""
  };
}

export function h3ReferenceTag(slots: H3ReferenceSlot[], slotId: string): string {
  const index = slots.findIndex((slot) => slot.id === slotId);
  if (index < 0) return "<Picture 1>";

  const slot = slots[index]!;
  const ordinal = slots
    .slice(0, index + 1)
    .filter((item) => item.mediaType === slot.mediaType)
    .length;
  return `<${slot.mediaType === "video" ? "Video" : "Picture"} ${ordinal}>`;
}

export async function loadImagePreview(
  context: RendererContext,
  filename: string,
  targetId: string,
  patchDraft: (patch: Partial<Draft>) => void
): Promise<void> {
  if (!filename) return;
  const dataUrl = await context.studio.readImage(filename);
  const image = context.root.querySelector<HTMLImageElement>(`#${targetId}`);
  if (!image || !dataUrl) return;
  image.addEventListener("load", () => {
    if (!image.naturalWidth || !image.naturalHeight) return;
    image.closest<HTMLElement>(".drop-zone")?.style.setProperty(
      "--image-ratio",
      `${image.naturalWidth} / ${image.naturalHeight}`
    );
    const state = context.getState();
    if (
      targetId === "start-preview" &&
      state &&
      (state.draft.sourceWidth !== image.naturalWidth ||
        state.draft.sourceHeight !== image.naturalHeight)
    ) {
      patchDraft({
        sourceWidth: image.naturalWidth,
        sourceHeight: image.naturalHeight
      });
    }
  }, { once: true });
  image.src = dataUrl;
}
