import { defaultHistoryFilter, historyTagKey, normalizeHistoryFilter, normalizeHistoryTags } from "../../../core/history-filter";
function stop(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
}
function ratingValue(value) {
    const number = Number(value);
    return number >= 0.5 && number <= 5 && Number.isInteger(number * 2)
        ? number
        : null;
}
function syncPanelDom(root, open) {
    const panel = root.querySelector("[data-history-filter-panel]");
    const toggle = root.querySelector("[data-history-filter-toggle]");
    if (panel) {
        panel.hidden = !open;
        panel.classList.toggle("is-open", open);
    }
    toggle?.setAttribute("aria-expanded", String(open));
}
export function mountHistoryFilterController(context, options) {
    const events = new AbortController();
    const signal = events.signal;
    const root = context.root;
    const commit = (patch) => {
        options.setFilter(normalizeHistoryFilter({ ...options.getFilter(), ...patch }));
        context.reportUserAction("history-filter-change", patch);
        context.requestRender();
    };
    root.querySelector("[data-history-filter-toggle]")?.addEventListener("click", (event) => {
        stop(event);
        const open = !options.getPanelOpen();
        options.setPanelOpen(open);
        syncPanelDom(root, open);
    }, { signal });
    document.addEventListener("pointerdown", (event) => {
        if (!options.getPanelOpen())
            return;
        const target = event.target;
        if (target instanceof Node && root.querySelector("[data-history-filter-anchor]")?.contains(target))
            return;
        options.setPanelOpen(false);
        syncPanelDom(root, false);
    }, { signal });
    root.querySelectorAll("[data-history-filter-field]").forEach((field) => {
        field.addEventListener("change", (event) => {
            stop(event);
            const name = field.dataset.historyFilterField;
            if (!name)
                return;
            if (name === "favoriteOnly" && field instanceof HTMLInputElement) {
                commit({ favoriteOnly: field.checked });
            }
            else if (name === "minRating" || name === "maxRating") {
                commit({ [name]: ratingValue(field.value) });
            }
            else if (name === "minDuration") {
                const value = Number(field.value);
                commit({ minDuration: Number.isFinite(value) && value >= 0 ? value : null });
            }
            else if (name === "modelId") {
                commit({ modelId: field.value });
            }
            else if (name === "sort") {
                commit({ sort: field.value });
            }
        }, { signal });
    });
    root.querySelectorAll("[data-history-filter-tag]").forEach((button) => {
        button.addEventListener("click", (event) => {
            stop(event);
            const value = button.dataset.historyFilterTag;
            if (!value)
                return;
            const current = normalizeHistoryTags(options.getFilter().tags);
            const key = historyTagKey(value);
            const next = current.some((tag) => historyTagKey(tag) === key)
                ? current.filter((tag) => historyTagKey(tag) !== key)
                : [...current, value];
            commit({ tags: next });
        }, { signal });
    });
    root.querySelector("[data-history-filter-clear]")?.addEventListener("click", (event) => {
        stop(event);
        options.setFilter({ ...defaultHistoryFilter });
        context.reportUserAction("history-filter-clear");
        context.requestRender();
    }, { signal });
    return () => events.abort();
}
