import { historyTagKey, historyTagNames, normalizeHistoryTags } from "../../../core/history-filter";
import { renderIcons } from "../../shared/icons";
const historyTagEditorOpenEvent = "history-tag-editor-open";
export function historyTagChipMarkup(tag, options) {
    return `<span class="history-tag-chip" data-history-tag-chip="${options.escapeHtml(tag)}"><button type="button" class="history-tag-chip-label" data-history-tag-edit="${options.escapeHtml(tag)}" title="${options.escapeHtml(options.editLabel)}">${options.escapeHtml(tag)}</button><button type="button" class="history-tag-chip-remove" data-history-tag-remove="${options.escapeHtml(tag)}" aria-label="${options.escapeHtml(options.removeLabel)}" title="${options.escapeHtml(options.removeLabel)}">${options.icon("x")}</button></span>`;
}
function stop(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
}
export function openHistoryTagEditor(tagsRoot) {
    tagsRoot.dispatchEvent(new Event(historyTagEditorOpenEvent));
}
export function mountHistoryTagEditor(context, tagsRoot, options) {
    const events = new AbortController();
    const signal = events.signal;
    let editingTag = null;
    let updateChain = Promise.resolve();
    const chipOptions = {
        escapeHtml: options.escapeHtml,
        icon: options.icon,
        editLabel: options.editLabel,
        removeLabel: options.removeLabel
    };
    const renderList = () => {
        const list = tagsRoot.querySelector("[data-history-tag-list]");
        if (!list)
            return;
        const tags = normalizeHistoryTags(options.getTags());
        list.innerHTML = tags.length
            ? tags.map((tag) => historyTagChipMarkup(tag, chipOptions)).join("")
            : `<span class="history-tags-empty">${options.emptyText}</span>`;
        renderIcons(list);
    };
    const renderSuggestions = (query = "") => {
        const suggestionsRoot = tagsRoot.querySelector("[data-history-tag-suggestions]");
        if (!suggestionsRoot)
            return;
        const assigned = new Set(options.getTags().map(historyTagKey));
        const normalizedQuery = query.trim().toLowerCase();
        const suggestions = options.getAvailableTags().filter((tag) => !assigned.has(historyTagKey(tag)) &&
            (!normalizedQuery || tag.toLowerCase().includes(normalizedQuery)));
        suggestionsRoot.innerHTML = suggestions.map((tag) => `<button type="button" class="history-tag-suggestion" data-history-tag-suggestion="${options.escapeHtml(tag)}">${options.escapeHtml(tag)}</button>`).join("");
    };
    const editor = () => tagsRoot.querySelector("[data-history-tag-editor]");
    const input = () => tagsRoot.querySelector("[data-history-tag-input]");
    const closeEditor = () => {
        editingTag = null;
        const target = editor();
        if (target)
            target.hidden = true;
        const field = input();
        if (field)
            field.value = "";
    };
    const openEditor = (value = "") => {
        const target = editor();
        const field = input();
        if (!target || !field)
            return;
        target.hidden = false;
        field.value = value;
        renderSuggestions(value);
        field.focus();
        field.select();
    };
    const commitOperation = (operation, closeAfter = false) => {
        updateChain = updateChain.then(async () => {
            try {
                await options.applyOperation(operation);
                options.onCommitted?.();
                renderList();
                renderSuggestions(input()?.value ?? "");
                if (closeAfter)
                    closeEditor();
            }
            catch (error) {
                context.notify(error instanceof Error ? error.message : options.updateFailedText, {
                    renderPage: false,
                    kind: "error"
                });
            }
        });
        return updateChain;
    };
    const commitInput = async () => {
        const field = input();
        const normalizedValue = normalizeHistoryTags([field?.value ?? ""])[0];
        if (!normalizedValue)
            return;
        const editTarget = editingTag;
        const editKey = editTarget ? historyTagKey(editTarget) : "";
        const currentTags = options.getTags();
        if (options.isDuplicateTag?.(normalizedValue, editTarget, currentTags) ??
            currentTags.some((tag) => historyTagKey(tag) === historyTagKey(normalizedValue) && historyTagKey(tag) !== editKey)) {
            context.notify(options.duplicateText, { renderPage: false, kind: "warning" });
            return;
        }
        const wasEditing = editTarget !== null;
        await commitOperation(editTarget
            ? { kind: "rename", from: editTarget, to: normalizedValue }
            : { kind: "add", tag: normalizedValue }, wasEditing);
        if (!wasEditing && field && normalizeHistoryTags([field.value])[0] === normalizedValue) {
            field.value = "";
            renderSuggestions("");
            field.focus();
        }
    };
    tagsRoot.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement))
            return;
        const add = target.closest("[data-history-tag-add]");
        if (add) {
            stop(event);
            editingTag = null;
            openEditor();
            return;
        }
        const cancel = target.closest("[data-history-tag-cancel]");
        if (cancel) {
            stop(event);
            closeEditor();
            return;
        }
        const suggestion = target.closest("[data-history-tag-suggestion]");
        if (suggestion) {
            stop(event);
            const value = suggestion.dataset.historyTagSuggestion;
            if (value)
                void commitOperation({ kind: "add", tag: value });
            return;
        }
        const remove = target.closest("[data-history-tag-remove]");
        if (remove) {
            stop(event);
            const value = remove.dataset.historyTagRemove;
            if (value)
                void commitOperation({ kind: "remove", tag: value });
            return;
        }
        const edit = target.closest("[data-history-tag-edit]");
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
        }
        else if (event.key === "Escape") {
            stop(event);
            closeEditor();
        }
    }, { signal });
    renderList();
    renderSuggestions();
    return () => events.abort();
}
function currentTags(context, assetId) {
    const state = context.getState();
    return state?.history.find((item) => item.id === assetId)?.tags ??
        state?.imageHistory.find((item) => item.id === assetId)?.tags ??
        [];
}
function isImageDetail(root) {
    return root.dataset.historyKind === "image" || Boolean(root.querySelector(".image-history-detail-layout"));
}
export function mountHistoryTagsController(context, options) {
    const tagsRoot = context.root.querySelector("[data-history-tags-root][data-history-tag-asset]");
    if (!tagsRoot)
        return () => undefined;
    const assetId = tagsRoot.dataset.historyTagAsset ?? "";
    if (!assetId)
        return () => undefined;
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
