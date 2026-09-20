import {
  historyTagKey,
  historyTagNames,
  normalizeHistoryTags
} from "../../../core/history-filter";
import type { AppState, HistoryMetadataPatch } from "../../../types";
import type { RendererCleanup, RendererContext } from "../../contracts";
import { renderIcons } from "../../shared/icons";

export type HistoryTagEditorOperation =
  | { kind: "add"; tag: string }
  | { kind: "remove"; tag: string }
  | { kind: "rename"; from: string; to: string };

const historyTagEditorOpenEvent = "history-tag-editor-open";

export interface HistoryTagChipMarkupOptions {
  escapeHtml(value: string): string;
  icon(name: string, className?: string): string;
  editLabel: string;
  removeLabel: string;
}

export function historyTagChipMarkup(
  tag: string,
  options: HistoryTagChipMarkupOptions
): string {
  return `<span class="history-tag-chip" data-history-tag-chip="${options.escapeHtml(tag)}"><button type="button" class="history-tag-chip-label" data-history-tag-edit="${options.escapeHtml(tag)}" title="${options.escapeHtml(options.editLabel)}">${options.escapeHtml(tag)}</button><button type="button" class="history-tag-chip-remove" data-history-tag-remove="${options.escapeHtml(tag)}" aria-label="${options.escapeHtml(options.removeLabel)}" title="${options.escapeHtml(options.removeLabel)}">${options.icon("x")}</button></span>`;
}

export interface HistoryTagEditorOptions {
  getTags(): string[];
  getAvailableTags(): string[];
  escapeHtml(value: string): string;
  icon(name: string, className?: string): string;
  editLabel: string;
  removeLabel: string;
  emptyText: string;
  duplicateText: string;
  updateFailedText: string;
  /** Batch editors may accept a tag that exists on only some selected items. */
  isDuplicateTag?(value: string, editingTag: string | null, currentTags: ReadonlyArray<string>): boolean;
  applyOperation(operation: HistoryTagEditorOperation): Promise<void>;
  onCommitted?(): void;
}

function stop(event: Event): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}

export function openHistoryTagEditor(tagsRoot: HTMLElement): void {
  tagsRoot.dispatchEvent(new Event(historyTagEditorOpenEvent));
}

export function mountHistoryTagEditor(
  context: RendererContext,
  tagsRoot: HTMLElement,
  options: HistoryTagEditorOptions
): RendererCleanup {
  const events = new AbortController();
  const signal = events.signal;
  let editingTag: string | null = null;
  let updateChain: Promise<void> = Promise.resolve();

  const chipOptions: HistoryTagChipMarkupOptions = {
    escapeHtml: options.escapeHtml,
    icon: options.icon,
    editLabel: options.editLabel,
    removeLabel: options.removeLabel
  };
  const renderList = (): void => {
    const list = tagsRoot.querySelector<HTMLElement>("[data-history-tag-list]");
    if (!list) return;
    const tags = normalizeHistoryTags(options.getTags());
    list.innerHTML = tags.length
      ? tags.map((tag) => historyTagChipMarkup(tag, chipOptions)).join("")
      : `<span class="history-tags-empty">${options.emptyText}</span>`;
    renderIcons(list);
  };
  const renderSuggestions = (query = ""): void => {
    const suggestionsRoot = tagsRoot.querySelector<HTMLElement>("[data-history-tag-suggestions]");
    if (!suggestionsRoot) return;
    const assigned = new Set(options.getTags().map(historyTagKey));
    const normalizedQuery = query.trim().toLowerCase();
    const suggestions = options.getAvailableTags().filter((tag) =>
      !assigned.has(historyTagKey(tag)) &&
      (!normalizedQuery || tag.toLowerCase().includes(normalizedQuery))
    );
    suggestionsRoot.innerHTML = suggestions.map((tag) => `<button type="button" class="history-tag-suggestion" data-history-tag-suggestion="${options.escapeHtml(tag)}">${options.escapeHtml(tag)}</button>`).join("");
  };
  const editor = (): HTMLElement | null => tagsRoot.querySelector<HTMLElement>("[data-history-tag-editor]");
  const input = (): HTMLInputElement | null => tagsRoot.querySelector<HTMLInputElement>("[data-history-tag-input]");
  const closeEditor = (): void => {
    editingTag = null;
    const target = editor();
    if (target) target.hidden = true;
    const field = input();
    if (field) field.value = "";
  };
  const openEditor = (value = ""): void => {
    const target = editor();
    const field = input();
    if (!target || !field) return;
    target.hidden = false;
    field.value = value;
    renderSuggestions(value);
    field.focus();
    field.select();
  };
  const commitOperation = (
    operation: HistoryTagEditorOperation,
    closeAfter = false
  ): Promise<void> => {
    updateChain = updateChain.then(async () => {
      try {
        await options.applyOperation(operation);
        options.onCommitted?.();
        renderList();
        renderSuggestions(input()?.value ?? "");
        if (closeAfter) closeEditor();
      } catch (error) {
        context.notify(error instanceof Error ? error.message : options.updateFailedText, {
          renderPage: false,
          kind: "error"
        });
      }
    });
    return updateChain;
  };
  const commitInput = async (): Promise<void> => {
    const field = input();
    const normalizedValue = normalizeHistoryTags([field?.value ?? ""])[0];
    if (!normalizedValue) return;
    const editTarget = editingTag;
    const editKey = editTarget ? historyTagKey(editTarget) : "";
    const currentTags = options.getTags();
    if (options.isDuplicateTag?.(normalizedValue, editTarget, currentTags) ??
      currentTags.some((tag) => historyTagKey(tag) === historyTagKey(normalizedValue) && historyTagKey(tag) !== editKey)) {
      context.notify(options.duplicateText, { renderPage: false, kind: "warning" });
      return;
    }
    const wasEditing = editTarget !== null;
    await commitOperation(
      editTarget
        ? { kind: "rename", from: editTarget, to: normalizedValue }
        : { kind: "add", tag: normalizedValue },
      wasEditing
    );
    if (!wasEditing && field && normalizeHistoryTags([field.value])[0] === normalizedValue) {
      field.value = "";
      renderSuggestions("");
      field.focus();
    }
  };

  tagsRoot.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const add = target.closest<HTMLElement>("[data-history-tag-add]");
    if (add) {
      stop(event);
      editingTag = null;
      openEditor();
      return;
    }
    const cancel = target.closest<HTMLElement>("[data-history-tag-cancel]");
    if (cancel) {
      stop(event);
      closeEditor();
      return;
    }
    const suggestion = target.closest<HTMLElement>("[data-history-tag-suggestion]");
    if (suggestion) {
      stop(event);
      const value = suggestion.dataset.historyTagSuggestion;
      if (value) void commitOperation({ kind: "add", tag: value });
      return;
    }
    const remove = target.closest<HTMLElement>("[data-history-tag-remove]");
    if (remove) {
      stop(event);
      const value = remove.dataset.historyTagRemove;
      if (value) void commitOperation({ kind: "remove", tag: value });
      return;
    }
    const edit = target.closest<HTMLElement>("[data-history-tag-edit]");
    if (edit) {
      stop(event);
      const value = edit.dataset.historyTagEdit;
      if (value) {
        editingTag = value;
        openEditor(value);
      }
    }
  }, { signal });
  tagsRoot.addEventListener(historyTagEditorOpenEvent, () => {
    editingTag = null;
    openEditor();
  }, { signal });
  input()?.addEventListener("input", () => renderSuggestions(input()?.value ?? ""), { signal });
  input()?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      stop(event);
      void commitInput();
    } else if (event.key === "Escape") {
      stop(event);
      closeEditor();
    }
  }, { signal });
  renderList();
  renderSuggestions();

  return () => events.abort();
}

export interface HistoryTagsControllerOptions {
  setState(nextState: AppState): void;
  escapeHtml(value: string): string;
  icon(name: string, className?: string): string;
  updateHistoryMetadata(assetId: string, patch: HistoryMetadataPatch): Promise<AppState>;
}

function currentTags(context: RendererContext, assetId: string): string[] {
  const state = context.getState();
  return state?.history.find((item) => item.id === assetId)?.tags ??
    state?.imageHistory.find((item) => item.id === assetId)?.tags ??
    [];
}

function isImageDetail(root: HTMLElement): boolean {
  return root.dataset.historyKind === "image" || Boolean(root.querySelector(".image-history-detail-layout"));
}

export function mountHistoryTagsController(
  context: RendererContext,
  options: HistoryTagsControllerOptions
): RendererCleanup {
  const tagsRoot = context.root.querySelector<HTMLElement>("[data-history-tags-root][data-history-tag-asset]");
  if (!tagsRoot) return () => undefined;
  const assetId = tagsRoot.dataset.historyTagAsset ?? "";
  if (!assetId) return () => undefined;
  return mountHistoryTagEditor(context, tagsRoot, {
    getTags: () => currentTags(context, assetId),
    getAvailableTags: () => {
      const state = context.getState();
      return state ? historyTagNames(state.history, state.imageHistory, isImageDetail(context.root) ? "image" : "video") : [];
    },
    escapeHtml: options.escapeHtml,
    icon: options.icon,
    editLabel: context.t("history.tags.edit"),
    removeLabel: context.t("history.tags.remove"),
    emptyText: context.t("history.tags.empty"),
    duplicateText: context.t("history.tags.duplicate"),
    updateFailedText: context.t("history.tags.updateFailed"),
    applyOperation: async (operation) => {
      const current = currentTags(context, assetId);
      const next = operation.kind === "add"
        ? normalizeHistoryTags([...current, operation.tag])
        : operation.kind === "remove"
          ? normalizeHistoryTags(current.filter((tag) => historyTagKey(tag) !== historyTagKey(operation.tag)))
          : normalizeHistoryTags(current.map((tag) => historyTagKey(tag) === historyTagKey(operation.from) ? operation.to : tag));
      options.setState(await options.updateHistoryMetadata(assetId, { tags: next }));
    }
  });
}
