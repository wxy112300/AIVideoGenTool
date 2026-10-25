import { positionFloating } from "./floating";
import { icon, renderIcons } from "../icons";

let nextSelectId = 0;

export interface SelectControl {
  trigger: HTMLButtonElement;
  sync(): void;
  dispose(): void;
}

/** The native element remains the only value source and keeps its change handlers. */
export function enhanceSelect(native: HTMLSelectElement): SelectControl {
  const events = new AbortController();
  const { signal } = events;
  const id = native.id || `ui-select-${++nextSelectId}`;
  const wrapper = document.createElement("span");
  wrapper.className = "ui-select";
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.id = `${id}-trigger`;
  trigger.className = "ui-select-trigger";
  trigger.setAttribute("role", "combobox");
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  const value = document.createElement("span");
  value.className = "ui-select-value";
  const caret = document.createElement("span");
  caret.className = "ui-select-caret";
  caret.innerHTML = icon("chevron-down");
  renderIcons(caret);
  caret.setAttribute("aria-hidden", "true");
  trigger.append(value, caret);
  const list = document.createElement("div");
  list.id = `${id}-listbox`;
  list.className = "ui-select-list";
  list.setAttribute("role", "listbox");
  trigger.setAttribute("aria-controls", list.id);
  const wasHidden = native.hidden;
  native.before(wrapper);
  wrapper.append(native, trigger);
  native.hidden = true;
  let open = false;
  let active = -1;
  let typed = "";
  let typedAt = 0;
  let repositionFrame = 0;
  const options = () => Array.from(native.options);
  const disabled = (option: HTMLOptionElement) => option.disabled || option.hidden ||
    (option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled);
  const selectable = () => options().map((option, index) => disabled(option) ? -1 : index).filter((index) => index >= 0);
  const labelledBy = native.getAttribute("aria-labelledby");
  if (labelledBy) trigger.setAttribute("aria-labelledby", labelledBy);
  else {
    const label = native.labels?.[0]?.cloneNode(true) as HTMLElement | undefined;
    label?.querySelectorAll("select,input,textarea,button,.field-info,[role=tooltip],[data-ui-tooltip-source]").forEach((node) => node.remove());
    const name = native.getAttribute("aria-label") || label?.textContent?.trim() || native.title;
    if (name) trigger.setAttribute("aria-label", name);
  }
  const describedBy = native.getAttribute("aria-describedby");
  if (describedBy) trigger.setAttribute("aria-describedby", describedBy);
  const close = () => {
    open = false;
    list.remove();
    trigger.setAttribute("aria-expanded", "false");
    trigger.removeAttribute("aria-activedescendant");
    wrapper.removeAttribute("data-open");
  };
  const setActive = (index: number) => {
    active = index;
    list.querySelectorAll<HTMLElement>("[role=option]").forEach((item) => {
      item.toggleAttribute("data-active", item.dataset.index === String(index));
    });
    const item = list.querySelector<HTMLElement>(`[data-index="${index}"]`);
    if (item) {
      trigger.setAttribute("aria-activedescendant", item.id);
      item.scrollIntoView?.({ block: "nearest" });
    }
  };
  let optionSignature = "";
  const renderOptions = () => {
    const signature = JSON.stringify(options().map(option => [option.value, option.label, option.selected, disabled(option), option.hidden, option.dataset.note, option.dataset.description, option.title, option.parentElement instanceof HTMLOptGroupElement ? option.parentElement.label : null]));
    if (signature === optionSignature) return false;
    optionSignature = signature;
    const fragment = document.createDocumentFragment();
    let previousGroup: Element | null = null;
    options().forEach((option, index) => {
      if (option.hidden) return;
      const group = option.parentElement;
      if (group instanceof HTMLOptGroupElement && group !== previousGroup) {
        const heading = document.createElement("div");
        heading.className = "ui-select-group";
        heading.setAttribute("role", "presentation");
        heading.textContent = group.label;
        fragment.append(heading);
      }
      previousGroup = group;
      const item = document.createElement("div");
      item.className = "ui-select-option";
      item.id = `${list.id}-${index}`;
      item.dataset.index = String(index);
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(option.selected));
      item.setAttribute("aria-disabled", String(disabled(option)));
      const check = document.createElement("span");
      check.className = "ui-select-check";
      check.textContent = option.selected ? "✓" : "";
      check.setAttribute("aria-hidden", "true");
      const text = document.createElement("span");
      text.textContent = option.label;
      item.append(check, text);
      const description = option.dataset.note || option.dataset.description || option.title;
      if (description) {
        const note = document.createElement("small");
        note.textContent = description;
        item.append(note);
      }
      fragment.append(item);
    });
    list.replaceChildren(fragment);
    return true;
  };
  const sync = () => {
    const label = native.selectedOptions[0]?.label ?? "";
    if (value.textContent !== label) value.textContent = label;
    const blocked = native.disabled || native.matches(":disabled");
    if (trigger.disabled !== blocked) trigger.disabled = blocked;
    // Field help belongs to its info control; option notes belong to the menu.
    // Copying the native title here makes either description obstruct selection.
    const invalid = native.getAttribute("aria-invalid") ?? "false";
    if (trigger.getAttribute("aria-invalid") !== invalid) trigger.setAttribute("aria-invalid", invalid);
    if (open) {
      if (blocked) close();
      else { if (renderOptions()) setActive(selectable().includes(active) ? active : native.selectedIndex); positionFloating(trigger, list, 320); }
    }
  };
  const show = () => {
    sync();
    if (native.disabled || native.matches(":disabled")) return;
    open = true;
    renderOptions();
    (document.fullscreenElement ?? document.body).append(list);
    list.classList.toggle("ui-in-dialog", Boolean(native.closest('[role="dialog"]')));
    list.style.minWidth = `${Math.min(trigger.getBoundingClientRect().width, 360)}px`;
    wrapper.setAttribute("data-open", "");
    trigger.setAttribute("aria-expanded", "true");
    positionFloating(trigger, list, 320);
    setActive(selectable().includes(native.selectedIndex) ? native.selectedIndex : (selectable()[0] ?? -1));
  };
  const choose = (index: number) => {
    const option = native.options[index];
    if (!option || disabled(option) || native.disabled || native.matches(":disabled")) return;
    const changed = native.selectedIndex !== index;
    close();
    native.selectedIndex = index;
    sync();
    trigger.focus({ preventScroll: true });
    if (changed) {
      native.dispatchEvent(new Event("input", { bubbles: true }));
      native.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };
  trigger.addEventListener("click", (event) => { event.preventDefault(); open ? close() : show(); }, { signal });
  trigger.addEventListener("keydown", (event) => {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    const indexes = selectable();
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      if (!open) { show(); if (event.key.startsWith("Arrow")) return; }
      const direction = event.key === "ArrowUp" ? -1 : 1;
      const next = event.key === "Home" ? indexes[0] : event.key === "End" ? indexes.at(-1) :
        indexes[Math.max(0, Math.min(indexes.length - 1, indexes.indexOf(active) + direction))];
      setActive(next ?? -1);
    } else if (event.key === "Escape" && open) {
      event.preventDefault(); event.stopPropagation(); close();
    } else if (event.key === "Tab") close();
    else if (["Enter", " "].includes(event.key)) {
      event.preventDefault(); event.stopPropagation(); open ? choose(active) : show();
    } else if (event.key.length === 1) {
      event.preventDefault();
      const now = Date.now();
      typed = now - typedAt > 650 ? event.key.toLocaleLowerCase() : typed + event.key.toLocaleLowerCase();
      typedAt = now;
      const query = [...typed].every((char) => char === typed[0]) ? typed[0]! : typed;
      const order = [...indexes.filter((index) => index > active), ...indexes.filter((index) => index <= active)];
      const match = order.find((index) => native.options[index]!.label.toLocaleLowerCase().startsWith(query));
      if (match !== undefined) open ? setActive(match) : choose(match);
    }
  }, { signal });
  list.addEventListener("pointerdown", (event) => event.preventDefault(), { signal });
  list.addEventListener("click", (event) => {
    const item = (event.target as Element).closest<HTMLElement>("[data-index]");
    if (item) choose(Number(item.dataset.index));
  }, { signal });
  document.addEventListener("pointerdown", (event) => {
    if (open && !wrapper.contains(event.target as Node) && !list.contains(event.target as Node)) close();
  }, { signal, capture: true });
  native.addEventListener("change", sync, { signal });
  native.form?.addEventListener("reset", () => queueMicrotask(sync), { signal });
  trigger.addEventListener("blur", close, { signal });
  native.addEventListener("invalid", (event) => { event.preventDefault(); trigger.focus(); }, { signal });
  const reposition = () => {
    if (!open || repositionFrame) return;
    repositionFrame = requestAnimationFrame(() => { repositionFrame = 0; positionFloating(trigger, list, 320); });
  };
  window.addEventListener("resize", reposition, { signal });
  window.addEventListener("scroll", reposition, { signal, capture: true, passive: true });
  const observer = new MutationObserver(sync);
  observer.observe(native, { childList: true, subtree: true, characterData: true, attributes: true });
  sync();
  return { trigger, sync, dispose() {
    events.abort(); observer.disconnect(); cancelAnimationFrame(repositionFrame); close();
    native.hidden = wasHidden;
    wrapper.replaceWith(native);
  } };
}
