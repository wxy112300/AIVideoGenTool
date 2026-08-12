import type {
  Draft,
  H3PromptPreset,
  H3PromptMode,
  H3ReferenceRole,
  PromptEnhanceMode
} from "../../../types";
import type { H3PromptBuilderInput } from "../../../core/h3-prompt";
import {
  createH3PromptFromBuilder,
  createH3PromptTemplate
} from "../../../core/h3-prompt";
import {
  activePromptIndexForDraft,
  promptPatchForDraft,
  promptVersionsForDraft
} from "../../../core/draft-prompts";
import { h3PromptPackFor, h3PromptPresetForMode, promptSnippetFor } from "../../prompt-packs";
import { isMiniMaxH3Model, isMiniMaxH3R2vModel } from "../../../core/workflow";
import type { RendererCleanup, RendererContext } from "../../contracts";
import {
  activePrompt,
  h3PromptModeForDraft,
  h3ReferenceTag,
  insertPromptSnippet,
  resizePromptInput,
  updatePromptWordCounter
} from "./helpers";

export interface CreatePromptControllerOptions {
  context: RendererContext;
  patchDraft(patch: Partial<Draft>): void;
  setWorkflowCapability(path: string, capability: { supportsEndImage: boolean; supportsVideoExtension: boolean }): void;
  syncPromptEnqueueUi(promptText: string): void;
  updateH3PromptCheck(promptText: string, hasEndImage: boolean, mode?: H3PromptMode, hasVideoReference?: boolean): void;
  h3ReferenceRoleLabels: Record<H3ReferenceRole, string>;
  h3ReferenceRolePromptLabels: Record<H3ReferenceRole, string>;
  getPromptEnhanceMode(): PromptEnhanceMode;
  setPromptEnhanceMode(mode: PromptEnhanceMode): void;
  getH3PromptPreset(): H3PromptPreset;
  setH3PromptPreset(preset: H3PromptPreset): void;
  isPromptEnhancing(): boolean;
  setPromptEnhancing(value: boolean): void;
  setPromptRuntimeLoaded(value: boolean): void;
  clearPromptVersion(): void;
  undoPromptEdit(): boolean;
  redoPromptEdit(): boolean;
  invalidatePromptEditHistory(): void;
  togglePromptModel(): Promise<void>;
  getH3PromptBuilder(): H3PromptBuilderInput;
  setH3PromptBuilder(builder: H3PromptBuilderInput): void;
  createDefaultH3PromptBuilder(): H3PromptBuilderInput;
}

export function mountCreatePromptController(
  options: CreatePromptControllerOptions
): RendererCleanup {
  const events = new AbortController();
  const signal = events.signal;
  const root = options.context.root;
  const getDraft = () => options.context.getState()?.draft;
  const promptUi = () => h3PromptPackFor(options.context.getState()?.settings.uiLocale).ui;

  root.querySelector("#pick-workflow")?.addEventListener("click", async () => {
    const filename = await options.context.studio.pickWorkflow();
    if (!filename) return;
    options.setWorkflowCapability(
      filename,
      await options.context.studio.inspectWorkflow(filename)
    );
    options.patchDraft({ workflowPath: filename });
    options.context.requestRender();
  }, { signal });

  const promptInput = root.querySelector<HTMLTextAreaElement>("#prompt-input");
  const promptSnippetSelect = root.querySelector<HTMLSelectElement>("#prompt-snippet");
  const insertSnippetButton = root.querySelector<HTMLButtonElement>("#insert-prompt-snippet");
  const updateSnippetButton = () => {
    if (insertSnippetButton) insertSnippetButton.disabled = !promptSnippetSelect?.value;
  };
  promptSnippetSelect?.addEventListener("change", updateSnippetButton, { signal });
  insertSnippetButton?.addEventListener("click", () => {
    if (!promptInput || !promptSnippetSelect) return;
    insertPromptSnippet(promptInput, promptSnippetFor(promptSnippetSelect.value));
    promptSnippetSelect.value = "";
    updateSnippetButton();
  }, { signal });

  promptInput?.addEventListener("input", () => {
    const draft = getDraft();
    if (!draft) return;
    options.invalidatePromptEditHistory();
    resizePromptInput(promptInput);
    const versions = [...promptVersionsForDraft(draft)];
    const activePromptVersion = activePromptIndexForDraft(draft);
    const current = versions[activePromptVersion];
    let nextActivePromptVersion = activePromptVersion;
    if (current?.label === promptUi().t("manualEditVersion")) {
      versions[activePromptVersion] = { ...current, text: promptInput.value };
    } else {
      versions.splice(activePromptVersion + 1);
      versions.push({
        id: crypto.randomUUID(),
        label: promptUi().t("manualEditVersion"),
        text: promptInput.value,
        createdAt: new Date().toISOString()
      });
      nextActivePromptVersion = versions.length - 1;
    }
    options.patchDraft(promptPatchForDraft(draft, versions, nextActivePromptVersion));
    options.syncPromptEnqueueUi(promptInput.value);
    options.updateH3PromptCheck(
      promptInput.value,
      Boolean(draft.endImagePath),
      h3PromptModeForDraft(draft),
      draft.h3ReferenceSlots.some((slot) => slot.mediaType === "video")
    );
    updatePromptWordCounter(
      promptInput.value,
      isMiniMaxH3Model(draft.modelId) ? h3PromptModeForDraft(draft) : undefined,
      draft.duration,
      promptUi()
    );
  }, { signal });
  if (promptInput) {
    resizePromptInput(promptInput);
    window.requestAnimationFrame(() => resizePromptInput(promptInput));
  }
  const focusPromptInput = () => {
    window.requestAnimationFrame(() => {
      const nextInput = root.querySelector<HTMLTextAreaElement>("#prompt-input");
      if (!nextInput) return;
      nextInput.focus();
      nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
    });
  };
  promptInput?.addEventListener("keydown", (event) => {
    const modifier = event.ctrlKey || event.metaKey;
    if (!modifier || event.altKey) return;
    const key = event.key.toLowerCase();
    const undo = key === "z" && !event.shiftKey;
    const redo = key === "y" || (key === "z" && event.shiftKey);
    const handled = undo
      ? options.undoPromptEdit()
      : redo
        ? options.redoPromptEdit()
        : false;
    if (!handled) return;
    event.preventDefault();
    event.stopPropagation();
    options.context.requestRender();
    focusPromptInput();
  }, { signal });
  const initialDraft = getDraft();
  updatePromptWordCounter(
    promptInput?.value ?? "",
    initialDraft && isMiniMaxH3Model(initialDraft.modelId) ? h3PromptModeForDraft(initialDraft) : undefined,
    initialDraft?.duration ?? 0,
    promptUi()
  );

  root.querySelector("#clear-prompt")?.addEventListener("click", (event) => {
    event.stopImmediatePropagation();
    const draft = getDraft();
    if (!draft) return;
    options.clearPromptVersion();
    options.context.requestRender();
    focusPromptInput();
  }, { signal });

  root.querySelector("#prompt-prev")?.addEventListener("click", () => {
    const draft = getDraft();
    if (!draft) return;
    options.invalidatePromptEditHistory();
    const promptVersions = [...promptVersionsForDraft(draft)];
    const activePromptVersion = activePromptIndexForDraft(draft);
    options.patchDraft(promptPatchForDraft(
      draft,
      promptVersions,
      Math.max(0, activePromptVersion - 1)
    ));
    options.context.requestRender();
  }, { signal });
  root.querySelector("#prompt-next")?.addEventListener("click", () => {
    const draft = getDraft();
    if (!draft) return;
    options.invalidatePromptEditHistory();
    const promptVersions = [...promptVersionsForDraft(draft)];
    const activePromptVersion = activePromptIndexForDraft(draft);
    options.patchDraft(promptPatchForDraft(
      draft,
      promptVersions,
      Math.min(promptVersions.length - 1, activePromptVersion + 1)
    ));
    options.context.requestRender();
  }, { signal });
  root.querySelector("#prompt-enhance-mode")?.addEventListener("change", (event) => {
    const draft = getDraft();
    if (!draft) return;
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (isMiniMaxH3Model(draft.modelId)) options.setH3PromptPreset(value as H3PromptPreset);
    else options.setPromptEnhanceMode(value as PromptEnhanceMode);
  }, { signal });
  root.querySelector("#release-prompt-model-create")?.addEventListener("click", () => {
    void options.togglePromptModel();
  }, { signal });

  root.querySelector("#enhance-prompt")?.addEventListener("click", async (event) => {
    event.stopImmediatePropagation();
    if (options.isPromptEnhancing()) return;
    const draft = getDraft();
    if (!draft) return;
    options.setPromptEnhancing(true);
    options.context.requestRender();
    try {
      const isCurrentH3 = isMiniMaxH3Model(draft.modelId);
      const h3Mode = h3PromptModeForDraft(draft);
      const selectedEnhanceMode = options.getPromptEnhanceMode();
      const requestMode: PromptEnhanceMode = isCurrentH3
        ? "h3-vision"
        : selectedEnhanceMode === "h3-vision" ? "sulphur-native" : selectedEnhanceMode;
      const isH3Vision = requestMode === "h3-vision";
      const h3ImagePaths = isMiniMaxH3R2vModel(draft.modelId)
        ? draft.h3ReferenceSlots
            .filter((slot) => slot.mediaType === "image" && slot.mediaPath)
            .map((slot) => slot.mediaPath)
        : [draft.startImagePath, draft.endImagePath].filter(Boolean);
      const referenceContext = isMiniMaxH3R2vModel(draft.modelId)
        ? draft.h3ReferenceSlots.map((slot) =>
            `${h3ReferenceTag(draft.h3ReferenceSlots, slot.id)} = ${options.h3ReferenceRolePromptLabels[slot.role]}${slot.note ? `; ${slot.note}` : ""}`
          ).join("\n")
        : h3Mode === "FL2VA"
          ? "<Picture 1> = first frame; <Picture 2> = last frame"
          : h3Mode === "I2VA"
            ? "<Picture 1> = first frame"
            : h3Mode === "L2VA"
              ? "<Picture 1> = last frame"
              : "";
      const text = await options.context.studio.enhancePrompt({
        prompt: activePrompt(draft, options.context.getState()?.settings.uiLocale).text,
        modelId: draft.modelId,
        mode: requestMode,
        imagePath: draft.startImagePath || undefined,
        imagePaths: isH3Vision ? h3ImagePaths : undefined,
        h3PromptMode: h3Mode,
        h3PromptPreset: isCurrentH3
          ? h3PromptPresetForMode(h3Mode, options.getH3PromptPreset())
          : undefined,
        h3DurationSeconds: draft.duration,
        h3AspectRatio: draft.ratio === "source"
          ? draft.sourceHeight > draft.sourceWidth ? "9:16" : "16:9"
          : draft.ratio,
        referenceMediaPaths: isMiniMaxH3R2vModel(draft.modelId)
          ? draft.h3ReferenceSlots.map((slot) => slot.mediaPath).filter(Boolean)
          : [draft.startImagePath, draft.endImagePath].filter(Boolean),
        referenceContext: isH3Vision ? referenceContext : undefined
      });
      options.setPromptRuntimeLoaded(true);
      const nextDraft = getDraft();
      if (!nextDraft) return;
      options.invalidatePromptEditHistory();
      const nextPromptVersions = promptVersionsForDraft(nextDraft);
      const nextActivePromptVersion = activePromptIndexForDraft(nextDraft);
      const versions = [
        ...nextPromptVersions.slice(0, nextActivePromptVersion + 1),
        {
          id: crypto.randomUUID(),
          label: promptUi().t("expandedVersion", { count: nextPromptVersions.filter((item) => item.label.startsWith(promptUi().t("expandedVersion", { count: "" }).trim())).length + 1 }),
          text,
          createdAt: new Date().toISOString()
        }
      ];
      options.patchDraft(promptPatchForDraft(nextDraft, versions, versions.length - 1));
    } catch (error) {
      options.context.notify(error instanceof Error ? error.message : String(error));
    } finally {
      options.setPromptEnhancing(false);
      options.context.requestRender();
    }
  }, { signal });

  root.querySelector("#h3-prompt-template")?.addEventListener("click", () => {
    const draft = getDraft();
    if (!draft) return;
    options.invalidatePromptEditHistory();
    const template = createH3PromptTemplate(
      activePrompt(draft, options.context.getState()?.settings.uiLocale).text,
      draft.duration,
      {
        hasEndImage: Boolean(draft.endImagePath),
        hasStartImage: Boolean(draft.startImagePath),
        mode: h3PromptModeForDraft(draft),
        referenceSlots: draft.h3ReferenceSlots.map((slot) => ({
          mediaType: slot.mediaType,
          role: options.h3ReferenceRolePromptLabels[slot.role],
          note: slot.note
        }))
      }
    );
    const promptVersions = promptVersionsForDraft(draft);
    const activePromptVersion = activePromptIndexForDraft(draft);
    const versions = [
      ...promptVersions.slice(0, activePromptVersion + 1),
      {
        id: crypto.randomUUID(),
        label: promptUi().t("h3TemplateVersion"),
        text: template.text,
        createdAt: new Date().toISOString()
      }
    ];
    options.patchDraft(promptPatchForDraft(draft, versions, versions.length - 1));
    options.context.notify(promptUi().t("templateCreated", {
      mode: template.mode,
      duration: template.effectiveDurationSeconds.toFixed(2),
      shots: template.shotCount
    }));
  }, { signal });

  root.querySelectorAll<HTMLElement>("[data-h3-builder]").forEach((field) => {
    const updateBuilder = (event: Event) => {
      const key = (event.currentTarget as HTMLElement).dataset.h3Builder as keyof H3PromptBuilderInput | undefined;
      if (!key) return;
      const target = event.currentTarget as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      options.setH3PromptBuilder({ ...options.getH3PromptBuilder(), [key]: target.value } as H3PromptBuilderInput);
    };
    field.addEventListener("input", updateBuilder, { signal });
    field.addEventListener("change", updateBuilder, { signal });
  });
  root.querySelector("#h3-builder-reset")?.addEventListener("click", () => {
    options.setH3PromptBuilder(options.createDefaultH3PromptBuilder());
    options.context.requestRender();
  }, { signal });
  root.querySelector("#h3-builder-generate")?.addEventListener("click", () => {
    const draft = getDraft();
    if (!draft) return;
    options.invalidatePromptEditHistory();
    const template = createH3PromptFromBuilder(
      options.getH3PromptBuilder(),
      draft.duration,
      {
        hasEndImage: Boolean(draft.endImagePath),
        hasStartImage: Boolean(draft.startImagePath),
        mode: h3PromptModeForDraft(draft),
        referenceSlots: draft.h3ReferenceSlots.map((slot) => ({
          mediaType: slot.mediaType,
          role: options.h3ReferenceRolePromptLabels[slot.role],
          note: slot.note
        }))
      }
    );
    const promptVersions = promptVersionsForDraft(draft);
    const activePromptVersion = activePromptIndexForDraft(draft);
    const versions = [
      ...promptVersions.slice(0, activePromptVersion + 1),
      {
        id: crypto.randomUUID(),
        label: promptUi().t("h3BuilderVersion"),
        text: template.text,
        createdAt: new Date().toISOString()
      }
    ];
    options.patchDraft(promptPatchForDraft(draft, versions, versions.length - 1));
    options.context.notify(promptUi().t("builderCreated", {
      mode: template.mode,
      duration: template.effectiveDurationSeconds.toFixed(2)
    }));
  }, { signal });

  return () => events.abort();
}
