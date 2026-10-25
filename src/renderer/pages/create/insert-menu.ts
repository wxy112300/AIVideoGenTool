import { positionFloating } from "../../shared/ui/floating";

interface InsertMenuState { key: string; open: boolean; query: string; selection: number[]; focus: "search" | "prompt" | string; }
const menuStates = new WeakMap<HTMLElement, InsertMenuState>();

/** The existing native options remain the single source of snippet identities. */
export function mountPromptInsertMenu(root: HTMLElement, insert: (id: string) => void, image = false,
  controls?: { trigger: HTMLButtonElement; source: HTMLSelectElement; prompt: HTMLTextAreaElement }): () => void {
  const trigger = controls?.trigger ?? root.querySelector<HTMLButtonElement>(image ? "#image-prompt-insert-trigger" : "#insert-prompt-snippet");
  const source = controls?.source ?? root.querySelector<HTMLSelectElement>(image ? "#image-edit-instruction" : "#prompt-snippet");
  const prompt = controls?.prompt ?? root.querySelector<HTMLTextAreaElement>(image ? "#image-edit-prompt-input" : "#prompt-input");
  if (!trigger || !source || !prompt) return () => undefined;
  const key = image ? `image:${root.querySelector<HTMLSelectElement>('#image-edit-model')?.value}` : `${root.querySelector('[data-input-mode][aria-pressed="true"]')?.getAttribute("data-input-mode")}:${root.querySelector<HTMLSelectElement>('#model')?.value}`;
  const saved = menuStates.get(root);
  const events = new AbortController();
  const { signal } = events;
  const menu = document.createElement("div");
  menu.id = controls ? `${trigger.id}-menu` : "create-prompt-insert-menu";
  menu.className = "create-insert-menu";
  menu.setAttribute("role", "dialog");
  menu.setAttribute("aria-label", trigger.textContent!.trim());
  menu.hidden = true;
  const search = document.createElement("input");
  search.type = "search";
  search.className = "ui-field";
  search.placeholder = trigger.dataset.searchLabel!;
  search.setAttribute("aria-label", search.placeholder);
  const list = document.createElement("div");
  list.className = "create-insert-list";
  const empty = document.createElement("p");
  empty.textContent = trigger.dataset.emptyLabel!;
  empty.hidden = true;
  empty.setAttribute("role", "status");
  menu.append(search, list, empty);
  document.body.append(menu);
  let selection = saved?.key === key && saved.open ? saved.selection : [prompt.selectionStart, prompt.selectionEnd];
  const remember = () => { selection = [prompt.selectionStart, prompt.selectionEnd]; };
  for (const event of ["select", "input", "keyup", "pointerup"]) prompt.addEventListener(event, remember, { signal });
  trigger.addEventListener("pointerdown", remember, { signal });
  const close = (restore = false) => {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (restore && trigger.isConnected) trigger.focus();
  };
  const filter = () => {
    const query = search.value.trim().toLocaleLowerCase();
    for (const group of list.children) {
      let shown = 0;
      group.querySelectorAll<HTMLButtonElement>("button").forEach(button => {
        button.hidden = !`${group.getAttribute("aria-label")} ${button.textContent}`.toLocaleLowerCase().includes(query);
        if (!button.hidden) shown++;
      });
      (group as HTMLElement).hidden = shown === 0;
    }
    empty.hidden = Boolean(list.querySelector('button:not([hidden])'));
    positionFloating(trigger, menu);
  };
  const optionGroups = source.querySelectorAll("optgroup");
  for (const group of optionGroups.length ? optionGroups : [source]) {
    const section = document.createElement("section");
    section.setAttribute("aria-label", group instanceof HTMLOptGroupElement ? group.label : trigger.textContent!.trim());
    const heading = document.createElement("h3"); heading.textContent = section.getAttribute("aria-label");
    section.append(heading);
    for (const option of group.querySelectorAll("option")) {
      if (!option.value) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.promptSnippet = option.value;
      button.textContent = option.textContent;
      button.addEventListener("click", () => {
        prompt.setSelectionRange(selection[0]!, selection[1]!);
        insert(option.value);
        remember();
      }, { signal });
      section.append(button);
    }
    list.append(section);
  }
  trigger.setAttribute("aria-controls", menu.id);
  trigger.addEventListener("click", () => {
    if (!menu.hidden) { close(true); return; }
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    search.value = "";
    filter();
    search.focus();
  }, { signal });
  search.addEventListener("input", filter, { signal });
  document.addEventListener("pointerdown", event => {
    if (!menu.contains(event.target as Node) && !trigger.contains(event.target as Node)) close();
  }, { signal });
  document.addEventListener("keydown", event => {
    if (menu.hidden) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); return; }
    if (event.key === "Tab") { close(); return; }
    if (!menu.contains(document.activeElement) || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    // Home/End in the search box keep their native text-editing meaning.
    if (document.activeElement === search && ["Home", "End"].includes(event.key)) return;
    const items = [...list.querySelectorAll<HTMLButtonElement>('button:not([hidden])')];
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 :
      event.key === "ArrowDown" ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
    event.preventDefault(); items[next]!.focus();
  }, { signal, capture: true });
  window.addEventListener("resize", () => { if (!menu.hidden) positionFloating(trigger, menu); }, { signal });
  window.addEventListener("scroll", () => { if (!menu.hidden) positionFloating(trigger, menu); }, { signal, capture: true });
  if (saved?.key === key && saved.open) {
    menu.hidden = false; trigger.setAttribute("aria-expanded", "true"); search.value = saved.query; filter();
    if (saved.focus === "search") search.focus();
    else if (saved.focus === "prompt") { prompt.focus(); prompt.setSelectionRange(selection[0]!, selection[1]!); }
    else [...list.querySelectorAll<HTMLButtonElement>("button")].find(button => button.dataset.promptSnippet === saved.focus)?.focus();
  }
  return () => {
    menuStates.set(root, { key, open: !menu.hidden, query: search.value, selection,
      focus: document.activeElement === search ? "search" : document.activeElement === prompt || (document.activeElement as HTMLElement | null)?.dataset.richSource === prompt.id ? "prompt" : (document.activeElement as HTMLElement | null)?.dataset.promptSnippet ?? "" });
    events.abort(); menu.remove();
  };
}
