import { applyHistoryBatchTagOperation, historyBatchCommonTags, pruneHistoryBatchSelection, selectHistoryBatchIds, selectHistoryBatchRange, toggleHistoryBatchSelection } from "../../../core/history-batch";
import { historyTagNames } from "../../../core/history-filter";
import { historyAssetsByNewest, imageProjectsByNewest } from "./helpers";
import { historyTagChipMarkup, mountHistoryTagEditor, openHistoryTagEditor } from "./tags-controller";
import { renderIcons } from "../../shared/icons";
function stop(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
}
function visibleItems(context, options) {
    const state = context.getState();
    if (!state)
        return [];
    return options.getKind() === "video"
        ? historyAssetsByNewest(state.history, options.getFilter())
        : imageProjectsByNewest(state.imageHistory, options.getFilter());
}
function selectedItems(context, options) {
    const state = context.getState();
    if (!state)
        return [];
    const selected = new Set(options.getSelectedIds());
    return (options.getKind() === "video" ? state.history : state.imageHistory)
        .filter((item) => selected.has(item.id));
}
function batchTagChipOptions(context) {
    return {
        escapeHtml: (value) => {
            const element = document.createElement("span");
            element.textContent = value;
            return element.innerHTML;
        },
        icon: (name) => {
            const element = document.createElement("span");
            element.className = "ui-icon";
            element.dataset.lucide = name;
            return element.outerHTML;
        },
        editLabel: context.t("history.tags.edit"),
        removeLabel: context.t("history.tags.remove")
    };
}
function syncBatchTagsPanel(context, options) {
    const panel = context.root.querySelector("[data-history-batch-tags-root]");
    if (!panel)
        return;
    const items = selectedItems(context, options);
    const list = panel.querySelector("[data-history-tag-list]");
    if (list) {
        const common = historyBatchCommonTags(items);
        const chipOptions = batchTagChipOptions(context);
        list.innerHTML = common.length
            ? common.map((tag) => historyTagChipMarkup(tag, chipOptions)).join("")
            : `<span class="history-tags-empty">${context.t("history.batch.noCommonTags")}</span>`;
        renderIcons(list);
    }
    if (!items.length)
        panel.hidden = true;
}
function syncSelectionDom(context, options) {
    const visible = visibleItems(context, options);
    const visibleIds = new Set(visible.map((item) => item.id));
    const selectedIds = options.getSelectedIds().filter((id) => visibleIds.has(id));
    const allSelected = visible.length > 0 && selectedIds.length === visible.length;
    context.root.querySelectorAll("[data-history]").forEach((card) => {
        const id = card.dataset.history;
        const selected = Boolean(id && options.getSelectedIds().includes(id));
        card.classList.toggle("history-batch-selected", selected);
        const checkbox = card.querySelector("[data-history-batch-select]");
        if (checkbox)
            checkbox.checked = selected;
    });
    const count = context.root.querySelector("[data-history-batch-count]");
    if (count)
        count.textContent = context.t("history.batch.selected", {
            selected: selectedIds.length,
            total: visible.length
        });
    const selectAll = context.root.querySelector("[data-history-batch-action=select-all]");
    if (selectAll) {
        selectAll.disabled = visible.length === 0;
        selectAll.innerHTML = `<span class="ui-icon" data-lucide="${allSelected ? "check-square" : "square"}"></span>${context.t("history.batch.selectAll")}`;
        renderIcons(selectAll);
        selectAll.setAttribute("aria-label", context.t("history.batch.selectAll"));
        selectAll.setAttribute("aria-pressed", String(allSelected));
    }
    context.root.querySelectorAll("[data-history-batch-action=copy], [data-history-batch-action=tags], [data-history-batch-action=delete]").forEach((button) => {
        button.disabled = selectedIds.length === 0 || options.isBusy();
    });
    syncBatchTagsPanel(context, options);
}
export function mountHistoryBatchController(context, options) {
    const events = new AbortController();
    const signal = events.signal;
    const root = context.root;
    let selectionAnchorId = null;
    let pendingCheckboxClick = null;
    const setMode = (enabled) => {
        if (enabled === options.isBatchMode())
            return;
        options.setBatchMode(enabled);
        options.setTagsPanelOpen(false);
        options.setFilterPanelOpen(false);
        selectionAnchorId = null;
        pendingCheckboxClick = null;
        if (!enabled)
            options.clearSelection();
        context.reportUserAction("history-batch-mode", { enabled });
        context.requestRender();
    };
    const selectSelection = (assetId, shiftKey = false) => {
        const visibleIds = visibleItems(context, options).map((item) => item.id);
        const nextIds = shiftKey && selectionAnchorId !== null &&
            visibleIds.includes(selectionAnchorId) && visibleIds.includes(assetId)
            ? selectHistoryBatchRange(options.getSelectedIds(), visibleIds, selectionAnchorId, assetId)
            : toggleHistoryBatchSelection(options.getSelectedIds(), assetId);
        options.setSelectedIds(nextIds);
        selectionAnchorId = assetId;
        syncSelectionDom(context, options);
    };
    const handleBatchAction = (action) => {
        if (action === "exit") {
            setMode(false);
            return;
        }
        if (action === "select-all") {
            const visible = visibleItems(context, options).map((item) => item.id);
            options.setSelectedIds(selectHistoryBatchIds(options.getSelectedIds(), visible));
            selectionAnchorId = null;
            pendingCheckboxClick = null;
            syncSelectionDom(context, options);
            return;
        }
        const selected = pruneHistoryBatchSelection(options.getSelectedIds(), visibleItems(context, options).map((item) => item.id));
        if (!selected.length || options.isBusy())
            return;
        if (action === "tags") {
            options.setTagsPanelOpen(true);
            const tagsRoot = root.querySelector("[data-history-batch-tags-root]");
            if (tagsRoot) {
                tagsRoot.hidden = false;
                syncBatchTagsPanel(context, options);
                openHistoryTagEditor(tagsRoot);
            }
            else {
                context.requestRender();
            }
        }
        else if (action === "delete") {
            options.requestDelete(options.getKind(), selected);
        }
        else if (action === "copy") {
            options.setBusy(true);
            syncSelectionDom(context, options);
            void context.application.copyHistoryFiles(options.getKind(), selected)
                .then((result) => {
                context.notify(result.ok
                    ? result.missingCount
                        ? context.t("history.batch.copyPartial", { count: result.copiedCount, missing: result.missingCount })
                        : context.t("history.batch.copySuccess", { count: result.copiedCount })
                    : result.message || context.t("history.batch.copyFailed"), {
                    renderPage: false,
                    kind: result.ok ? "info" : "error"
                });
            })
                .catch((error) => context.notify(error instanceof Error ? error.message : context.t("history.batch.copyFailed"), {
                renderPage: false,
                kind: "error"
            }))
                .finally(() => {
                options.setBusy(false);
                syncSelectionDom(context, options);
            });
        }
    };
    root.addEventListener("click", (event) => {
        if (!options.isBatchMode()) {
            const toggle = (event.target instanceof Element)
                ? event.target.closest("[data-history-batch-toggle]")
                : null;
            if (toggle) {
                stop(event);
                setMode(true);
            }
            return;
        }
        const target = event.target instanceof Element ? event.target : null;
        const toggle = target?.closest("[data-history-batch-toggle]");
        if (toggle) {
            stop(event);
            setMode(false);
            return;
        }
        const action = target?.closest("[data-history-batch-action]")?.dataset.historyBatchAction;
        if (action) {
            stop(event);
            handleBatchAction(action);
            return;
        }
        if (target?.closest("[data-history-batch-tags-close]")) {
            stop(event);
            closeTagsPanel();
            return;
        }
        const checkbox = target?.closest("[data-history-batch-select]");
        if (checkbox) {
            const assetId = checkbox.dataset.historyBatchSelect;
            pendingCheckboxClick = assetId ? { assetId, shiftKey: event.shiftKey } : null;
            event.stopImmediatePropagation();
            return;
        }
        const checkboxWrap = target?.closest(".history-batch-checkbox-wrap");
        if (checkboxWrap) {
            const input = checkboxWrap.querySelector("[data-history-batch-select]");
            const assetId = input?.dataset.historyBatchSelect;
            pendingCheckboxClick = assetId ? { assetId, shiftKey: event.shiftKey } : null;
            event.stopImmediatePropagation();
            return;
        }
        const card = target?.closest("[data-open-history], [data-open-image-history]");
        if (!card || target?.closest(".history-media-badges, [data-history-curation], .history-detail-curation, .history-card-more, .history-preview-progress, [data-image-media-retry], [data-image-media-locate], .history-batch-checkbox-wrap, button, input, select, textarea, a"))
            return;
        const assetId = card.dataset.openHistory ?? card.dataset.openImageHistory;
        if (!assetId)
            return;
        stop(event);
        selectSelection(assetId, event.shiftKey);
    }, { capture: true, signal });
    root.addEventListener("change", (event) => {
        if (!options.isBatchMode())
            return;
        const target = event.target instanceof HTMLInputElement
            ? event.target.closest("[data-history-batch-select]")
            : null;
        if (!target)
            return;
        event.stopImmediatePropagation();
        const id = target.dataset.historyBatchSelect;
        if (!id)
            return;
        const pending = pendingCheckboxClick?.assetId === id ? pendingCheckboxClick : null;
        pendingCheckboxClick = null;
        if (pending?.shiftKey) {
            selectSelection(id, true);
            return;
        }
        const selected = new Set(options.getSelectedIds());
        if (target.checked)
            selected.add(id);
        else
            selected.delete(id);
        options.setSelectedIds([...selected]);
        selectionAnchorId = id;
        syncSelectionDom(context, options);
    }, { capture: true, signal });
    root.addEventListener("keydown", (event) => {
        if (!options.isBatchMode())
            return;
        const target = event.target instanceof Element ? event.target : null;
        const card = target?.closest("[data-open-history], [data-open-image-history]");
        if (!card || target !== card)
            return;
        if (event.key === "Enter") {
            stop(event);
            const assetId = card.dataset.openHistory ?? card.dataset.openImageHistory;
            if (assetId)
                selectSelection(assetId, event.shiftKey);
        }
        else if (event.key === " " || event.key === "Spacebar") {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }, { capture: true, signal });
    root.addEventListener("keyup", (event) => {
        if (!options.isBatchMode() || !(event.key === " " || event.key === "Spacebar"))
            return;
        const target = event.target instanceof Element ? event.target : null;
        const card = target?.closest("[data-open-history], [data-open-image-history]");
        if (!card || target !== card)
            return;
        stop(event);
        const assetId = card.dataset.openHistory ?? card.dataset.openImageHistory;
        if (assetId)
            selectSelection(assetId, event.shiftKey);
    }, { capture: true, signal });
    const tagsRoot = root.querySelector("[data-history-batch-tags-root]");
    const closeTagsPanel = () => {
        options.setTagsPanelOpen(false);
        const panel = root.querySelector("[data-history-batch-tags-root]");
        if (panel)
            panel.hidden = true;
    };
    tagsRoot?.querySelector("[data-history-batch-tags-close]")?.addEventListener("click", (event) => {
        stop(event);
        closeTagsPanel();
    }, { signal });
    const tagEditorCleanup = tagsRoot
        ? mountHistoryTagEditor(context, tagsRoot, {
            getTags: () => historyBatchCommonTags(selectedItems(context, options)),
            getAvailableTags: () => {
                const state = context.getState();
                return state ? historyTagNames(state.history, state.imageHistory, options.getKind()) : [];
            },
            escapeHtml: (value) => {
                const element = document.createElement("span");
                element.textContent = value;
                return element.innerHTML;
            },
            icon: (name) => {
                const element = document.createElement("span");
                element.className = "ui-icon";
                element.dataset.lucide = name;
                return element.outerHTML;
            },
            editLabel: context.t("history.tags.edit"),
            removeLabel: context.t("history.tags.remove"),
            emptyText: context.t("history.tags.empty"),
            duplicateText: context.t("history.tags.duplicate"),
            updateFailedText: context.t("history.tags.updateFailed"),
            isDuplicateTag: () => false,
            applyOperation: async (operation) => {
                const items = selectedItems(context, options);
                const updates = items.map((item) => ({
                    assetId: item.id,
                    patch: {
                        tags: applyHistoryBatchTagOperation(item.tags, operation)
                    }
                })).filter((update, index) => {
                    const original = items[index]?.tags ?? [];
                    return JSON.stringify(original) !== JSON.stringify(update.patch.tags);
                });
                if (updates.length)
                    options.setState(await context.application.updateHistoryMetadataBatch(updates));
            },
            onCommitted: () => {
                syncBatchTagsPanel(context, options);
                syncSelectionDom(context, options);
            }
        })
        : () => undefined;
    syncSelectionDom(context, options);
    return () => {
        events.abort();
        tagEditorCleanup();
    };
}
