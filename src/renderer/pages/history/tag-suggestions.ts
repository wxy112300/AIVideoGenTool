import { historyTagKey } from "../../../core/history-filter";
import { positionFloating } from "../../shared/ui/floating";

let nextTagList = 0;

/** A short frequent row stays in the layout; searching uses a viewport portal. */
export function mountInlineTagSuggestions(root: HTMLElement, field: HTMLInputElement, options: {
  getTags(): string[];
  getChoices(): string[];
  choose(value: string): void;
}) {
  const events = new AbortController(), { signal } = events;
  const row = root.querySelector<HTMLElement>("[data-history-tag-suggestions]");
  const popup = document.createElement("div");
  popup.className = "history-tag-completions";
  popup.id = `history-tag-completions-${++nextTagList}`;
  popup.setAttribute("role", "listbox");
  popup.setAttribute("aria-label", field.getAttribute("aria-label") ?? "");
  popup.hidden = true;
  let matches: string[] = [], active = -1, signature = "", commonSignature = "", composing = false;
  field.setAttribute("role", "combobox");
  field.setAttribute("aria-autocomplete", "list");
  field.setAttribute("aria-controls", popup.id);
  field.setAttribute("aria-expanded", "false");
  const close = () => {
    popup.hidden = true; popup.remove(); active = -1;
    field.setAttribute("aria-expanded", "false"); field.removeAttribute("aria-activedescendant");
  };
  const position = () => {
    if (popup.hidden) return;
    popup.style.width = `${Math.min(320, Math.max(220, field.getBoundingClientRect().width), window.innerWidth - 16)}px`;
    positionFloating(field, popup, 240);
  };
  const paintActive = () => {
    [...popup.children].forEach((element, index) => element.setAttribute("aria-selected", String(index === active)));
    if (active >= 0) {
      field.setAttribute("aria-activedescendant", `${popup.id}-${active}`);
      (popup.children[active] as HTMLElement)?.scrollIntoView?.({ block: "nearest" });
    } else field.removeAttribute("aria-activedescendant");
  };
  const refresh = () => {
    const assigned = new Set(options.getTags().map(historyTagKey));
    const choices = options.getChoices().filter(tag => !assigned.has(historyTagKey(tag)));
    const common = choices.slice(0, 4), nextCommon = JSON.stringify(common);
    if (row && nextCommon !== commonSignature) {
      commonSignature = nextCommon; row.replaceChildren();
      for (const tag of common) {
        const button = document.createElement("button"); button.type = "button";
        button.className = "history-tag-suggestion"; button.dataset.historyTagSuggestion = tag;
        button.textContent = tag; button.title = tag; row.append(button);
      }
    }
    const query = historyTagKey(field.value);
    if (!query || document.activeElement !== field || composing) { close(); return; }
    matches = choices.filter(tag => historyTagKey(tag).includes(query))
      .sort((a, b) => Number(historyTagKey(b).startsWith(query)) - Number(historyTagKey(a).startsWith(query))).slice(0, 20);
    if (!matches.length) { close(); return; }
    const next = JSON.stringify(matches);
    if (next !== signature) {
      signature = next; active = -1; popup.replaceChildren();
      matches.forEach((tag, index) => {
        const button = document.createElement("button"); button.type = "button"; button.tabIndex = -1;
        button.id = `${popup.id}-${index}`; button.setAttribute("role", "option");
        button.setAttribute("aria-selected", "false"); button.dataset.tagCompletion = String(index); button.textContent = tag;
        popup.append(button);
      });
    }
    popup.hidden = false; document.body.append(popup); field.setAttribute("aria-expanded", "true"); position(); paintActive();
  };
  const choose = (index: number) => { const value = matches[index]; if (value) { close(); options.choose(value); } };
  popup.addEventListener("pointerdown", event => event.preventDefault(), { signal });
  popup.addEventListener("click", event => {
    const button = (event.target as Element)?.closest<HTMLElement>("[data-tag-completion]");
    if (button) choose(Number(button.dataset.tagCompletion));
  }, { signal });
  field.addEventListener("focus", refresh, { signal });
  field.addEventListener("blur", close, { signal });
  field.addEventListener("compositionstart", () => { composing = true; close(); }, { signal });
  field.addEventListener("compositionend", () => { composing = false; refresh(); }, { signal });
  field.addEventListener("keydown", event => {
    if (event.isComposing || composing) return;
    if (event.key === "Escape" && !popup.hidden) { event.preventDefault(); event.stopImmediatePropagation(); close(); }
    else if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      refresh(); if (popup.hidden) return;
      event.preventDefault(); event.stopImmediatePropagation();
      active = active < 0 ? (event.key === "ArrowDown" ? 0 : matches.length - 1) : (active + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;
      paintActive();
    } else if (event.key === "Enter" && !popup.hidden && active >= 0) {
      event.preventDefault(); event.stopImmediatePropagation(); choose(active);
    }
  }, { signal });
  document.addEventListener("pointerdown", event => {
    if (event.target instanceof Node && event.target !== field && !popup.contains(event.target)) close();
  }, { signal });
  window.addEventListener("resize", position, { signal });
  window.addEventListener("scroll", position, { signal, capture: true, passive: true });
  return { refresh, close, dispose: () => { events.abort(); close(); } };
}
