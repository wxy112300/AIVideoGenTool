// Design-system interaction helpers (classic script so prototypes open from file://).
(() => {
  const root = document.documentElement;
  const reducedMotion = () => root.dataset.motion === "reduced" || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cssMs = (name) => parseFloat(getComputedStyle(root).getPropertyValue(name)) || 0;
  const cssValue = (name) => getComputedStyle(root).getPropertyValue(name).trim();
  const ic = (name, extra = "") => `<i data-lucide="${name}" ${extra}></i>`;
  const icons = () => window.lucide?.createIcons({ attrs: { "stroke-width": 1.75 } });

  /* Edge light: `.lit` follows the pointer; inside `.lit-group`, nearby edges light up too. */
  function bindPointerLight() {
    let frame = 0;
    let last = null;
    document.addEventListener("pointermove", (event) => {
      last = event;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const target = last.target instanceof Element ? last.target : null;
        const group = target?.closest(".lit-group");
        const items = group ? group.querySelectorAll(".lit") : target?.closest(".lit") ? [target.closest(".lit")] : [];
        for (const item of items) {
          const rect = item.getBoundingClientRect();
          item.style.setProperty("--mx", `${last.clientX - rect.left}px`);
          item.style.setProperty("--my", `${last.clientY - rect.top}px`);
        }
      });
    }, { passive: true });
  }

  function bindSegmented(seg) {
    let thumb = seg.querySelector(".seg-thumb");
    if (!thumb) seg.prepend(thumb = Object.assign(document.createElement("span"), { className: "seg-thumb" }));
    const place = () => {
      const active = seg.querySelector('button[aria-pressed="true"]');
      if (!active) return;
      thumb.style.left = `${active.offsetLeft}px`;
      thumb.style.width = `${active.offsetWidth}px`;
    };
    seg.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button || button.getAttribute("aria-pressed") === "true") return;
      seg.querySelectorAll("button").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      place();
      seg.dispatchEvent(new CustomEvent("change", { detail: { value: button.dataset.value } }));
    });
    new ResizeObserver(place).observe(seg);
    place();
  }

  /** Styled listbox over a native <select>; the native element keeps value/change semantics. */
  function enhanceSelect(native) {
    if (native.closest(".select")) return native.closest(".select");
    const wrapper = document.createElement("div");
    wrapper.className = "select";
    if (native.dataset.size) wrapper.dataset.size = native.dataset.size;
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "select-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    if (native.getAttribute("aria-label")) trigger.setAttribute("aria-label", native.getAttribute("aria-label"));
    if (native.id) { trigger.id = `${native.id}-trigger`; document.querySelector(`label[for="${native.id}"]`)?.setAttribute("for", trigger.id); }
    const list = document.createElement("ul");
    list.className = "select-list";
    list.setAttribute("role", "listbox");
    list.id = `${native.id || `select-${Math.random().toString(36).slice(2)}`}-list`;
    trigger.setAttribute("aria-controls", list.id);
    native.hidden = true;
    native.after(wrapper);
    wrapper.append(native, trigger, list);
    let active = -1;
    let typed = "";
    let typedTimer = 0;
    const options = () => [...native.options];
    const render = () => {
      const selected = native.selectedOptions[0];
      // Ghost copies of every option keep the trigger as wide as its longest choice (DESIGN.md 6.2).
      trigger.innerHTML = `${selected?.dataset.icon ? ic(selected.dataset.icon) : ""}<span class="select-value">${options().map((option) => `<span class="ghost" aria-hidden="true">${option.textContent}</span>`).join("")}<span>${selected?.textContent ?? ""}</span></span>${ic("chevrons-up-down", 'class="select-caret"')}`;
      let group = "";
      list.innerHTML = options().map((option, index) => {
        const label = option.parentElement.tagName === "OPTGROUP" ? option.parentElement.label : "";
        const heading = label && label !== group ? `<li class="select-group" role="presentation">${(group = label)}</li>` : "";
        return `${heading}<li class="select-option" role="option" id="${list.id}-${index}" data-index="${index}" aria-selected="${option.selected}" aria-disabled="${option.disabled}">
          <span class="select-check">${option.selected ? ic("check") : ""}</span><span class="select-label">${option.textContent}</span>${option.dataset.note ? `<small>${option.dataset.note}</small>` : ""}</li>`;
      }).join("");
      icons();
    };
    const setActive = (index) => {
      active = index;
      list.querySelectorAll(".select-option").forEach((item) => item.toggleAttribute("data-active", Number(item.dataset.index) === index));
      const item = list.querySelector(`[data-index="${index}"]`);
      item?.scrollIntoView({ block: "nearest" });
      trigger.setAttribute("aria-activedescendant", item?.id ?? "");
    };
    const open = () => { wrapper.setAttribute("data-open", ""); trigger.setAttribute("aria-expanded", "true"); setActive(native.selectedIndex); };
    const close = () => { wrapper.removeAttribute("data-open"); trigger.setAttribute("aria-expanded", "false"); };
    const choose = (index) => {
      const option = native.options[index];
      if (!option || option.disabled) return;
      native.selectedIndex = index;
      native.dispatchEvent(new Event("change", { bubbles: true }));
      close();
      trigger.focus();
    };
    const step = (from, delta) => {
      const all = options();
      for (let index = from + delta; index >= 0 && index < all.length; index += delta) if (!all[index].disabled) return index;
      return from;
    };
    trigger.addEventListener("click", () => (wrapper.hasAttribute("data-open") ? close() : open()));
    list.addEventListener("pointermove", (event) => { const item = event.target.closest(".select-option"); if (item) setActive(Number(item.dataset.index)); });
    list.addEventListener("click", (event) => { const item = event.target.closest(".select-option"); if (item) choose(Number(item.dataset.index)); });
    trigger.addEventListener("keydown", (event) => {
      const isOpen = wrapper.hasAttribute("data-open");
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (!isOpen) return open();
        setActive(step(active, event.key === "ArrowDown" ? 1 : -1));
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        if (!isOpen) open();
        setActive(event.key === "Home" ? step(-1, 1) : step(options().length, -1));
      } else if ((event.key === "Enter" || event.key === " ") && isOpen) {
        event.preventDefault();
        choose(active);
      } else if (event.key === "Escape" || event.key === "Tab") {
        close();
      } else if (event.key.length === 1) {
        clearTimeout(typedTimer);
        typed += event.key.toLowerCase();
        typedTimer = setTimeout(() => (typed = ""), 600);
        const match = options().findIndex((option) => !option.disabled && option.textContent.toLowerCase().startsWith(typed));
        if (match >= 0) (isOpen ? setActive(match) : choose(match));
      }
    });
    document.addEventListener("pointerdown", (event) => { if (!wrapper.contains(event.target)) close(); });
    native.addEventListener("change", render);
    render();
    return wrapper;
  }

  /** Range + number + unit field. `data-band="min,max"` shades a recommended range. */
  function bindSlider(field) {
    const range = field.querySelector('input[type="range"]');
    const number = field.querySelector('input[type="number"]');
    const paint = () => {
      const min = Number(range.min), max = Number(range.max);
      field.style.setProperty("--fill", `${((Number(range.value) - min) / (max - min)) * 100}%`);
      if (field.dataset.band) {
        const [low, high] = field.dataset.band.split(",").map(Number);
        field.style.setProperty("--band-start", `${((low - min) / (max - min)) * 100}%`);
        field.style.setProperty("--band-end", `${((high - min) / (max - min)) * 100}%`);
      }
      range.setAttribute("aria-valuetext", `${range.value}${field.dataset.unit ?? ""}`);
    };
    range.addEventListener("input", () => { if (number) number.value = range.value; paint(); field.dispatchEvent(new CustomEvent("value", { detail: Number(range.value) })); });
    number?.addEventListener("change", () => {
      const value = Math.min(Number(range.max), Math.max(Number(range.min), Number(number.value) || Number(range.min)));
      number.value = range.value = String(value);
      paint();
      field.dispatchEvent(new CustomEvent("value", { detail: value }));
    });
    field.repaint = paint;
    paint();
  }

  /** Popover menus: `[data-menu-trigger]` toggles its next `.menu`. */
  function bindMenus() {
    document.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-menu-trigger]");
      // composedPath still holds nodes that a click handler re-rendered away, so inside clicks are recognised.
      const path = event.composedPath();
      document.querySelectorAll(".menu[data-open]").forEach((menu) => {
        const inside = path.includes(menu);
        if (inside && (menu.classList.contains("popover") || !event.target.closest(".menu-item"))) return;
        if (!trigger || menu.previousElementSibling !== trigger) { menu.removeAttribute("data-open"); menu.previousElementSibling?.setAttribute("aria-expanded", "false"); }
      });
      if (!trigger) return;
      const menu = trigger.nextElementSibling;
      const open = !menu.hasAttribute("data-open");
      menu.toggleAttribute("data-open", open);
      trigger.setAttribute("aria-expanded", String(open));
      if (open) menu.querySelector("button:not(:disabled), input")?.focus({ preventScroll: true });
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const menu = document.querySelector(".menu[data-open]");
      if (!menu) return;
      menu.removeAttribute("data-open");
      menu.previousElementSibling?.focus();
    });
  }

  /** Modal dialog with focus return; the initial focus target is `[data-autofocus]`. */
  function openDialog(dialog) {
    const opener = document.activeElement;
    dialog.hidden = false;
    dialog.setAttribute("data-open", "");
    (dialog.querySelector("[data-autofocus]") ?? dialog.querySelector("button"))?.focus();
    const close = () => {
      dialog.removeAttribute("data-open");
      setTimeout(() => { dialog.hidden = true; opener?.focus?.(); }, cssMs("--dur-2"));
      dialog.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
    const onClick = (event) => { if (event.target === dialog || event.target.closest("[data-close]")) close(); };
    const onKey = (event) => { if (event.key === "Escape") close(); };
    dialog.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return close;
  }

  function flip(elements) {
    const first = new Map(elements().map((element) => [element, element.getBoundingClientRect()]));
    return {
      play() {
        if (reducedMotion()) return;
        for (const element of elements()) {
          const before = first.get(element);
          if (!before) continue;
          const after = element.getBoundingClientRect();
          const dx = before.left - after.left, dy = before.top - after.top;
          if (dx || dy) element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: cssMs("--dur-4"), easing: cssValue("--ease-out") });
        }
      }
    };
  }

  function animateIn(element) {
    if (!element) return;
    return element.animate(reducedMotion() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "translateY(6px) scale(.98)" }, { opacity: 1, transform: "none" }],
      { duration: cssMs("--dur-3") || 120, easing: cssValue("--ease-out") });
  }

  async function animateOut(element) {
    const keyframes = reducedMotion() ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.9)" }];
    await element.animate(keyframes, { duration: cssMs("--dur-2") || 120, easing: cssValue("--ease-in"), fill: "forwards" }).finished;
    element.remove();
  }

  function tweenNumber(element, to, { decimals = 0, suffix = "" } = {}) {
    const from = Number(element.dataset.value ?? element.textContent.replace(/[^\d.-]/g, "")) || 0;
    element.dataset.value = String(to);
    if (reducedMotion()) { element.textContent = `${to.toFixed(decimals)}${suffix}`; return; }
    const start = performance.now();
    const duration = cssMs("--dur-4") * 1.4;
    const frame = (now) => {
      const t = Math.min(1, (now - start) / duration);
      element.textContent = `${(from + (to - from) * (1 - (1 - t) ** 3)).toFixed(decimals)}${suffix}`;
      if (t < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /* Top notifications: one stack centred in the top bar; newest on top pushes older ones down.
     success / info leave after 3 s, warning after 6 s, danger stays until closed. Hover pauses the timer. */
  const notifyLife = { success: 3000, info: 3000, warning: 6000, danger: 0 };
  const notifyMax = 4;
  const settle = (animation, ms) => Promise.race([animation.finished, new Promise((resolve) => setTimeout(resolve, ms))]).catch(() => {});
  function toast(message, { kind = "success", action = "", onAction = null, icon = "" } = {}) {
    let stack = document.querySelector(".notify-stack");
    if (!stack) {
      stack = Object.assign(document.createElement("div"), { className: "notify-stack" });
      stack.setAttribute("aria-live", "polite");
      document.body.append(stack);
    }
    const iconName = icon || { success: "circle-check", warning: "triangle-alert", danger: "circle-alert", info: "info" }[kind];
    const item = document.createElement("div");
    item.className = `notify ${kind}`;
    item.setAttribute("role", kind === "danger" ? "alert" : "status");
    item.innerHTML = `${ic(iconName, 'class="notify-icon"')}<span class="notify-message">${message}</span>${action ? `<button class="btn btn-plain btn-sm notify-action" type="button">${action}</button>` : ""}<button class="btn btn-icon btn-sm notify-close" type="button" aria-label="关闭通知">${ic("x")}</button>`;

    // FLIP: remember where the current notices are, insert the new one on top, then glide them down.
    const before = new Map([...stack.children].map((child) => [child, child.getBoundingClientRect().top]));
    stack.prepend(item);
    icons();
    const reduced = reducedMotion();
    if (!reduced) {
      before.forEach((top, child) => {
        const delta = top - child.getBoundingClientRect().top;
        if (delta) child.animate([{ transform: `translateY(${delta}px)` }, { transform: "none" }], { duration: 360, easing: "cubic-bezier(.2,.9,.25,1.05)" });
      });
      item.animate([{ opacity: 0, transform: "translateY(-14px) scale(.94)" }, { opacity: 1, transform: "none" }], { duration: 380, easing: "cubic-bezier(.2,.9,.25,1.1)" });
    } else {
      item.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
    }

    const leave = async () => {
      if (item.dataset.leaving) return;
      item.dataset.leaving = "true";
      clearTimeout(timer);
      const height = item.offsetHeight;
      const gap = parseFloat(getComputedStyle(stack).rowGap) || 0;
      const frames = reduced
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [{ opacity: 1, transform: "none", height: `${height}px`, marginBottom: "0px" },
           { opacity: 0, transform: "scale(.94)", height: "0px", marginBottom: `${-gap}px` }];
      item.style.overflow = "hidden";
      await settle(item.animate(frames, { duration: reduced ? 160 : 300, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" }), 420);
      item.remove();
    };
    let timer = 0;
    const life = notifyLife[kind] ?? 3000;
    const arm = () => { if (life) timer = setTimeout(leave, life); };
    item.addEventListener("pointerenter", () => clearTimeout(timer));
    item.addEventListener("pointerleave", () => { if (!item.dataset.leaving) arm(); });
    item.querySelector(".notify-close").addEventListener("click", leave);
    item.querySelector(".notify-action")?.addEventListener("click", () => { onAction?.(); leave(); });
    arm();
    [...stack.children].filter((child) => !child.dataset.leaving).slice(notifyMax).forEach((child) => child.querySelector(".notify-close").click());
    return { close: leave };
  }

  function contrast(foreground, background) {
    const parse = (color) => {
      if (color.startsWith("color(srgb")) return color.match(/[\d.]+/g).slice(0, 3).map(Number);
      const values = color.match(/[\d.]+/g).slice(0, 3).map(Number);
      return values.map((value) => value / 255);
    };
    const luminance = (color) => {
      const [r, g, b] = parse(color).map((value) => (value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4));
      return .2126 * r + .7152 * g + .0722 * b;
    };
    const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (light + .05) / (dark + .05);
  }

  /**
   * Single floating tooltip/hovercard for `[data-tip]`, `[data-tip-title]` and `[data-peek]`.
   * Lives in <body> so cards, overflow and stacking contexts cannot clip or cover it.
   */
  function bindTooltips() {
    const tip = document.body.appendChild(Object.assign(document.createElement("div"), { className: "tooltip", id: "ds-tooltip" }));
    tip.setAttribute("role", "tooltip");
    let target = null;
    let timer = 0;
    let warmUntil = 0;
    const selector = "[data-tip], [data-tip-title], [data-peek]";
    const hide = () => {
      clearTimeout(timer);
      if (target) { target.removeAttribute("aria-describedby"); warmUntil = performance.now() + 500; }
      target = null;
      tip.removeAttribute("data-open");
    };
    const place = () => {
      if (!target?.isConnected) return hide();
      const box = target.getBoundingClientRect();
      const width = tip.offsetWidth, height = tip.offsetHeight;
      const above = box.top - height - 8 >= 8;
      const top = above ? box.top - height - 8 : box.bottom + 8;
      const left = Math.min(window.innerWidth - width - 8, Math.max(8, box.left + box.width / 2 - width / 2));
      tip.style.setProperty("--from", above ? "3px" : "-3px");
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    };
    const show = (element) => {
      const title = element.dataset.tipTitle ?? "";
      const body = element.dataset.tip ?? "";
      const peek = element.dataset.peek ?? "";
      if (!title && !body && !peek) return;
      tip.className = `tooltip${!title && !peek && body.length <= 24 && !body.includes("\n") ? " compact" : ""}`;
      tip.innerHTML = "";
      if (peek) tip.append(Object.assign(document.createElement("div"), { className: "tip-peek", style: `background-image:${peek};aspect-ratio:${element.dataset.peekRatio ?? "16 / 10"}` }));
      if (title) tip.append(Object.assign(document.createElement("strong"), { textContent: title }));
      if (body) tip.append(Object.assign(document.createElement("div"), { className: title ? "tip-body" : "", textContent: body }));
      target = element;
      element.setAttribute("aria-describedby", tip.id);
      place();
      tip.setAttribute("data-open", "");
    };
    const schedule = (element) => {
      if (element === target) return;
      hide();
      timer = setTimeout(() => show(element), performance.now() < warmUntil ? 0 : 450);
    };
    document.addEventListener("pointerover", (event) => {
      const element = event.target instanceof Element ? event.target.closest(selector) : null;
      if (element) schedule(element);
      else if (target || timer) hide();
    });
    document.addEventListener("focusin", (event) => { const element = event.target.closest?.(selector); if (element?.matches(":focus-visible")) schedule(element); });
    document.addEventListener("focusout", hide);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") hide(); });
    window.addEventListener("scroll", hide, { passive: true, capture: true });
    // Live content (e.g. progress text) updates the open tooltip in place.
    new MutationObserver(() => { if (target) show(target); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-tip", "data-tip-title"] });
  }

  /**
   * Stable button label: the button reserves the width of its widest variant, so changing text never resizes it.
   * Wraps the button's text into `.btn-label` (live text + hidden ghost variants stacked in one grid cell).
   */
  function stableLabel(button, variants = []) {
    let label = button.querySelector(".btn-label");
    if (!label) {
      const texts = [...button.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      label = Object.assign(document.createElement("span"), { className: "btn-label" });
      label.append(Object.assign(document.createElement("span"), { className: "live", textContent: texts.map((node) => node.textContent).join("").trim() }));
      texts.forEach((node) => node.remove());
      button.append(label);
    }
    label.querySelectorAll(".ghost").forEach((ghost) => ghost.remove());
    for (const text of new Set([label.querySelector(".live").textContent, ...variants])) {
      const ghost = Object.assign(document.createElement("span"), { className: "ghost", textContent: text });
      ghost.setAttribute("aria-hidden", "true");
      label.append(ghost);
    }
    const live = label.querySelector(".live");
    return { get text() { return live.textContent; }, set text(value) { live.textContent = value; } };
  }

  /**
   * Turns a button into a progress control and back without changing its size.
   * `labels` lists every text the button can show (widest wins). set(null) = indeterminate; set(0..100) = determinate.
   */
  function progressButton(button, { labels = [] } = {}) {
    const label = stableLabel(button, labels);
    const original = { text: label.text, icon: button.firstElementChild.outerHTML, tip: button.dataset.tip, tipTitle: button.dataset.tipTitle };
    const ring = '<svg class="ring-progress" viewBox="0 0 16 16" aria-hidden="true"><circle class="track" cx="8" cy="8" r="6.5"/><circle class="bar" cx="8" cy="8" r="6.5" pathLength="100"/><rect class="stop" x="6" y="6" width="4" height="4" rx=".8"/></svg>';
    const setIcon = (html) => { button.firstElementChild.outerHTML = html; icons(); };
    const restoreTip = () => {
      if (original.tip == null) delete button.dataset.tip; else button.dataset.tip = original.tip;
      if (original.tipTitle == null) delete button.dataset.tipTitle; else button.dataset.tipTitle = original.tipTitle;
    };
    return {
      set(value, text) {
        if (!button.hasAttribute("data-progress")) setIcon(ring);
        button.removeAttribute("data-done");
        const indeterminate = value == null;
        button.setAttribute("data-progress", indeterminate ? "indeterminate" : "");
        if (!indeterminate) button.style.setProperty("--p", String(Math.round(value)));
        label.text = text ?? (indeterminate ? "准备中" : `${Math.round(value)}%`);
        delete button.dataset.tipTitle;
        button.dataset.tip = "点击取消";
      },
      done(text) {
        button.removeAttribute("data-progress");
        button.style.removeProperty("--p");
        button.setAttribute("data-done", "");
        setIcon(ic("check"));
        label.text = text;
        restoreTip();
      },
      reset() {
        button.removeAttribute("data-progress");
        button.removeAttribute("data-done");
        button.style.removeProperty("--p");
        setIcon(original.icon);
        label.text = original.text;
        restoreTip();
      },
      get active() { return button.hasAttribute("data-progress"); }
    };
  }

  window.DS = { ic, icons, reducedMotion, bindPointerLight, bindTooltips, bindSegmented, enhanceSelect, bindSlider, bindMenus, openDialog, flip, animateIn, animateOut, tweenNumber, toast, contrast, stableLabel, progressButton };
})();
