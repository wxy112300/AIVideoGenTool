import { positionFloating } from "../../shared/ui/floating";
import { icon, renderIcons } from "../../shared/icons";
import { BUILTIN_VIDEO_LORAS } from "../../../core/video-loras";
import { BUILTIN_IMAGE_LORAS } from "../../../core/image-loras";

interface MenuState { key: string; open: boolean; query: string; focus: string; }
const states = new WeakMap<HTMLElement, MenuState>();

/** Insert on click and stay open. Values still come from the scanned compatible catalog. */
export function mountLoraMenu(root: HTMLElement, add: (id: string) => Promise<void>, image = false): () => void {
  const trigger = root.querySelector<HTMLButtonElement>(image ? "#image-lora-menu-trigger" : "#add-video-lora");
  const source = root.querySelector<HTMLSelectElement>(image ? "#image-lora-to-add" : "#video-lora-to-add");
  if (!trigger || !source) return () => undefined;
  const key = image ? `image:${root.querySelector<HTMLSelectElement>('#image-edit-model')?.value}` : `${root.querySelector<HTMLSelectElement>("#model")?.value}:${root.querySelector('[data-input-mode][aria-pressed="true"]')?.getAttribute("data-input-mode")}`;
  const saved = states.get(root);
  const events = new AbortController(), { signal } = events;
  const menu = document.createElement("div");
  menu.id = "create-lora-menu";
  menu.className = "create-insert-menu create-lora-menu";
  menu.setAttribute("role", "dialog");
  menu.setAttribute("aria-label", trigger.textContent!.trim());
  menu.hidden = true;
  const search = document.createElement("input");
  search.type = "search"; search.className = "ui-field";
  search.placeholder = trigger.dataset.searchLabel!;
  search.setAttribute("aria-label", search.placeholder);
  const list = document.createElement("div"); list.className = "create-insert-list";
  const empty = document.createElement("p"); empty.textContent = [...source.options].some(option => option.value) ? trigger.dataset.noResultsLabel! : image ? source.options[0]?.textContent ?? trigger.dataset.emptyLabel! : trigger.dataset.emptyLabel!; empty.setAttribute("role", "status");
  menu.append(search, list, empty); document.body.append(menu);
  let busy = false;
  const groups = new Map<string, HTMLElement>();
  const order = new Map((image ? BUILTIN_IMAGE_LORAS : BUILTIN_VIDEO_LORAS).map((lora, index) => [lora.id, index]));
  for (const option of [...source.options].sort((a, b) => (order.get(a.value) ?? Infinity) - (order.get(b.value) ?? Infinity))) {
    if (!option.value) continue;
    const label = option.dataset.group ?? "LoRA";
    let section = groups.get(label);
    if (!section) {
      section = document.createElement("section"); section.setAttribute("aria-label", label);
      const heading = document.createElement("h3"); heading.textContent = label;
      section.append(heading); list.append(section); groups.set(label, section);
    }
    const button = document.createElement("button"); button.type = "button";
    button.dataset.addLora = option.value; button.disabled = option.disabled;
    button.innerHTML = icon((image ? option.dataset.selected === "true" : option.disabled) ? "check" : "plus");
    const name = document.createElement("span"); name.textContent = option.textContent;
    const family = document.createElement("small"); family.textContent = option.dataset.family ?? "";
    button.append(name, family); section.append(button);
    button.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      try { await add(option.value); } finally { busy = false; }
    }, { signal });
  }
  renderIcons(menu);
  root.addEventListener("create-controls-updated", () => {
    for (const button of list.querySelectorAll<HTMLButtonElement>("[data-add-lora]")) {
      const option = [...source.options].find(option => option.value === button.dataset.addLora);
      button.disabled = !option || option.disabled;
      button.querySelector("svg, i")?.remove(); button.insertAdjacentHTML("afterbegin", icon((image ? option?.dataset.selected === "true" : option?.disabled) ? "check" : "plus"));
    }
    renderIcons(menu);
  }, { signal });
  const filter = () => {
    const query = search.value.trim().toLocaleLowerCase();
    for (const section of groups.values()) {
      for (const button of section.querySelectorAll<HTMLButtonElement>("button")) button.hidden = !`${section.getAttribute("aria-label")} ${button.textContent}`.toLocaleLowerCase().includes(query);
      section.hidden = !section.querySelector("button:not([hidden])");
    }
    empty.hidden = [...groups.values()].some(section => !section.hidden);
    positionFloating(trigger, menu, 360);
  };
  const close = (focus = false) => { menu.hidden = true; trigger.setAttribute("aria-expanded", "false"); if (focus) trigger.focus(); };
  trigger.setAttribute("aria-controls", menu.id);
  trigger.addEventListener("click", () => {
    if (!menu.hidden) { close(true); return; }
    menu.hidden = false; trigger.setAttribute("aria-expanded", "true"); search.value = ""; filter(); search.focus();
  }, { signal });
  search.addEventListener("input", filter, { signal });
  document.addEventListener("pointerdown", event => { if (!menu.contains(event.target as Node) && !trigger.contains(event.target as Node)) close(); }, { signal });
  document.addEventListener("keydown", event => {
    if (menu.hidden) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); return; }
    if (event.key === "Tab") { close(); return; }
    if (!menu.contains(document.activeElement) || !["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    if (document.activeElement === search && ["Home", "End"].includes(event.key)) return;
    const buttons = [...list.querySelectorAll<HTMLButtonElement>("button:not([hidden]):not(:disabled)")];
    if (!buttons.length) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    event.preventDefault(); buttons[next]!.focus();
  }, { signal, capture: true });
  const reposition = () => { if (!menu.hidden) positionFloating(trigger, menu, 360); };
  window.addEventListener("resize", reposition, { signal });
  window.addEventListener("scroll", reposition, { signal, capture: true });
  if (saved?.key === key && saved.open) {
    menu.hidden = false; trigger.setAttribute("aria-expanded", "true"); search.value = saved.query; filter();
    const previous = [...list.querySelectorAll<HTMLButtonElement>("button")].find(button => button.dataset.addLora === saved.focus && !button.disabled);
    (previous ?? search).focus();
  }
  return () => {
    states.set(root, { key, open: !menu.hidden, query: search.value, focus: (document.activeElement as HTMLElement | null)?.dataset.addLora ?? "" });
    events.abort(); menu.remove();
  };
}
