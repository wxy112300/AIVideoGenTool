import {
  historyTagKey,
  historyTagNames,
  normalizeHistoryTags
} from "../../../core/history-filter";
import type { AppState, HistoryMetadataPatch } from "../../../types";
import type { RendererCleanup, RendererContext } from "../../contracts";
import { renderIcons } from "../../shared/icons";

export interface HistoryTagsControllerOptions {
  setState(nextState: AppState): void;
  escapeHtml(value: string): string;
  icon(name: string, className?: string): string;
  updateHistoryMetadata(assetId: string, patch: HistoryMetadataPatch): Promise<AppState>;
}

function stop(event: Event): void {
  event.preventDefault();
  event.stopImmediatePropagation();
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
  const events = new AbortController();
  const signal = events.signal;
  const root = context.root;
  const tagsRoot = root.querySelector<HTMLElement>("[data-history-tags-root]");
  if (!tagsRoot) return () => events.abort();
  const assetId = tagsRoot.dataset.historyTagAsset ?? "";
  if (!assetId) return () => events.abort();
  let editingTag: string | null = null;
  let updateChain: Promise<void> = Promise.resolve();

  const availableTags = (): string[] => {
    const state = context.getState();
    if (!state) return [];
    return historyTagNames(state.history, state.imageHistory, isImageDetail(root) ? "image" : "video");
  };

  const chipMarkup = (tag: string): string => `<span class="history-tag-chip" data-history-tag-chip="${options.escapeHtml(tag)}"><button type="button" class="history-tag-chip-label" data-history-tag-edit="${options.escapeHtml(tag)}" title="${options.escapeHtml(context.t("history.tags.edit"))}">${options.escapeHtml(tag)}</button><button type="button" class="history-tag-chip-remove" data-history-tag-remove="${options.escapeHtml(tag)}" aria-label="${options.escapeHtml(context.t("history.tags.remove"))}" title="${options.escapeHtml(context.t("history.tags.remove"))}">${options.icon("x")}</button></span>`;

  const renderList = (tags: string[]): void => {
    const list = tagsRoot.querySelector<HTMLElement>("[data-history-tag-list]");
    if (!list) return;
    list.innerHTML = tags.length
      ? tags.map(chipMarkup).join("")
      : `<span class="history-tags-empty">${context.t("history.tags.empty")}</span>`;
    // Tag chips are updated in place to preserve the media/player and focus
    // state. The normal page render converts data-lucide placeholders, so do
    // the same for the newly inserted remove buttons here.
    renderIcons(list);
  };

  const renderSuggestions = (query = ""): void => {
    const suggestionsRoot = tagsRoot.querySelector<HTMLElement>("[data-history-tag-suggestions]");
    if (!suggestionsRoot) return;
    const assigned = new Set(currentTags(context, assetId).map(historyTagKey));
    const normalizedQuery = query.trim().toLowerCase();
    const suggestions = availableTags().filter((tag) =>
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

  const commitTags = (
    buildNext: (current: string[]) => string[] | null,
    closeAfter = false
  ): Promise<void> => {
    updateChain = updateChain.then(async () => {
      try {
        const current = currentTags(context, assetId);
        const nextTags = buildNext(current);
        if (!nextTags) return;
        const normalized = normalizeHistoryTags(nextTags);
        options.setState(await options.updateHistoryMetadata(assetId, { tags: normalized }));
        renderList(normalized);
        renderSuggestions(input()?.value ?? "");
        if (closeAfter) closeEditor();
      } catch (error) {
        context.notify(error instanceof Error ? error.message : context.t("history.tags.updateFailed"), {
          renderPage: false,
          kind: "error"
        });
      }
    });
    return updateChain;
  };

  const commitInput = async (): Promise<void> => {
    const field = input();
    const value = field?.value ?? "";
    const normalizedValue = normalizeHistoryTags([value])[0];
    if (!normalizedValue) return;
    const editTarget = editingTag;
    const wasEditing = editTarget !== null;
    const editKey = editTarget ? historyTagKey(editTarget) : "";
    await commitTags((existing) => {
      const duplicate = existing.some((tag) => historyTagKey(tag) === historyTagKey(normalizedValue) && historyTagKey(tag) !== editKey);
      if (duplicate) {
        context.notify(context.t("history.tags.duplicate"), { renderPage: false, kind: "warning" });
        return null;
      }
      return editTarget
        ? existing.map((tag) => historyTagKey(tag) === editKey ? normalizedValue : tag)
        : [...existing, normalizedValue];
    }, wasEditing);
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
      if (!value) return;
      void commitTags((existing) => [...existing, value]);
      return;
    }
    const remove = target.closest<HTMLElement>("[data-history-tag-remove]");
    if (remove) {
      stop(event);
      const value = remove.dataset.historyTagRemove;
      if (!value) return;
      void commitTags((existing) => existing.filter((tag) => historyTagKey(tag) !== historyTagKey(value)));
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
  renderSuggestions();

  return () => events.abort();
}
