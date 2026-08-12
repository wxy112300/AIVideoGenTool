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
import { h3PromptPresetForMode } from "../../../core/h3-prompt-presets";
import { isMiniMaxH3Model, isMiniMaxH3R2vModel } from "../../../core/workflow";
import { promptSnippetFor } from "../../../core/prompt-suggestions";
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
  getPromptEnhanceMode(): PromptEnhanceMode;
  setPromptEnhanceMode(mode: PromptEnhanceMode): void;
  getH3PromptPreset(): H3PromptPreset;
  setH3PromptPreset(preset: H3PromptPreset): void;
  isPromptEnhancing(): boolean;
  setPromptEnhancing(value: boolean): void;
  setPromptRuntimeLoaded(value: boolean): void;
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
    resizePromptInput(promptInput);
    const versions = [...draft.promptVersions];
    const current = versions[draft.activePromptVersion];
    let activePromptVersion = draft.activePromptVersion;
    if (current?.label === "手动编辑") {
      versions[activePromptVersion] = { ...current, text: promptInput.value };
    } else {
      versions.splice(activePromptVersion + 1);
      versions.push({
        id: crypto.randomUUID(),
        label: "手动编辑",
        text: promptInput.value,
        createdAt: new Date().toISOString()
      });
      activePromptVersion = versions.length - 1;
    }
    options.patchDraft({ promptVersions: versions, activePromptVersion });
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
      draft.duration
    );
  }, { signal });
  if (promptInput) {
    resizePromptInput(promptInput);
    window.requestAnimationFrame(() => resizePromptInput(promptInput));
  }
  const initialDraft = getDraft();
  updatePromptWordCounter(
    promptInput?.value ?? "",
    initialDraft && isMiniMaxH3Model(initialDraft.modelId) ? h3PromptModeForDraft(initialDraft) : undefined,
    initialDraft?.duration ?? 0
  );

  root.querySelector("#prompt-prev")?.addEventListener("click", () => {
    const draft = getDraft();
    if (!draft) return;
    options.patchDraft({ activePromptVersion: Math.max(0, draft.activePromptVersion - 1) });
    options.context.requestRender();
  }, { signal });
  root.querySelector("#prompt-next")?.addEventListener("click", () => {
    const draft = getDraft();
    if (!draft) return;
    options.patchDraft({ activePromptVersion: Math.min(draft.promptVersions.length - 1, draft.activePromptVersion + 1) });
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
            `${h3ReferenceTag(draft.h3ReferenceSlots, slot.id)} = ${options.h3ReferenceRoleLabels[slot.role]}${slot.note ? `; ${slot.note}` : ""}`
          ).join("\n")
        : h3Mode === "FL2VA"
          ? "<Picture 1> = 首帧; <Picture 2> = 尾帧"
          : h3Mode === "I2VA"
            ? "<Picture 1> = 首帧"
            : h3Mode === "L2VA"
              ? "<Picture 1> = 尾帧"
              : "";
      const text = await options.context.studio.enhancePrompt({
        prompt: activePrompt(draft).text,
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
      const versions = [
        ...nextDraft.promptVersions.slice(0, nextDraft.activePromptVersion + 1),
        {
          id: crypto.randomUUID(),
          label: `扩写 ${nextDraft.promptVersions.filter((item) => item.label.startsWith("扩写")).length + 1}`,
          text,
          createdAt: new Date().toISOString()
        }
      ];
      options.patchDraft({ promptVersions: versions, activePromptVersion: versions.length - 1 });
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
    const template = createH3PromptTemplate(
      activePrompt(draft).text,
      draft.duration,
      {
        hasEndImage: Boolean(draft.endImagePath),
        hasStartImage: Boolean(draft.startImagePath),
        mode: h3PromptModeForDraft(draft),
        referenceSlots: draft.h3ReferenceSlots.map((slot) => ({
          mediaType: slot.mediaType,
          role: options.h3ReferenceRoleLabels[slot.role],
          note: slot.note
        }))
      }
    );
    const versions = [
      ...draft.promptVersions.slice(0, draft.activePromptVersion + 1),
      {
        id: crypto.randomUUID(),
        label: "H3 分镜模板",
        text: template.text,
        createdAt: new Date().toISOString()
      }
    ];
    options.patchDraft({ promptVersions: versions, activePromptVersion: versions.length - 1 });
    options.context.notify(`已创建 H3 ${template.mode} 官方结构模板（${template.effectiveDurationSeconds.toFixed(2)} 秒、${template.shotCount} 个镜头），原内容仍可通过左箭头找回。`);
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
    const template = createH3PromptFromBuilder(
      options.getH3PromptBuilder(),
      draft.duration,
      {
        hasEndImage: Boolean(draft.endImagePath),
        hasStartImage: Boolean(draft.startImagePath),
        mode: h3PromptModeForDraft(draft),
        referenceSlots: draft.h3ReferenceSlots.map((slot) => ({
          mediaType: slot.mediaType,
          role: options.h3ReferenceRoleLabels[slot.role],
          note: slot.note
        }))
      }
    );
    const versions = [
      ...draft.promptVersions.slice(0, draft.activePromptVersion + 1),
      {
        id: crypto.randomUUID(),
        label: "H3 构建器版本",
        text: template.text,
        createdAt: new Date().toISOString()
      }
    ];
    options.patchDraft({ promptVersions: versions, activePromptVersion: versions.length - 1 });
    options.context.notify(`已生成 H3 ${template.mode} 结构化提示词（${template.effectiveDurationSeconds.toFixed(2)} 秒），原内容仍可通过左箭头找回。`);
  }, { signal });

  return () => events.abort();
}
