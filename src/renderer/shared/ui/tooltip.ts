import { positionFloating } from "./floating";

let nextTooltip = 0;

/** Retain legacy rich descriptions as hidden sources, rather than extra overlays. */
export function prepareTooltipSources(scope: ParentNode): void {
  const occurrences = new Map<string, number>();
  scope.querySelectorAll<HTMLElement>('[role="tooltip"]:not(.ui-tooltip), [data-ui-tooltip-source]').forEach((source) => {
    if (source.closest(".ui-tooltip")) return;
    const owner = source.parentElement;
    if (!owner || owner === document.body) return;
    const identity = owner.getAttribute("aria-label") || source.textContent || "info";
    let hash = 2166136261;
    for (const character of identity) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    const key = (hash >>> 0).toString(36);
    const count = occurrences.get(key) ?? 0; occurrences.set(key, count + 1);
    source.id ||= `ui-tooltip-source-${key}-${count}`;
    if (owner.hasAttribute("tabindex")) owner.id ||= `${source.id}-anchor`;
    source.dataset.uiTooltipSource = "";
    source.removeAttribute("role");
    source.hidden = true;
    owner.dataset.uiTooltipContent = source.id;
  });
}

/** One rich tooltip for the whole application, including body portals. */
export function mountTooltip(root: HTMLElement): () => void {
  const events = new AbortController();
  const { signal } = events;
  const tip = document.createElement("div");
  tip.className = "ui-tooltip";
  tip.id = `ui-tooltip-${++nextTooltip}`;
  tip.setAttribute("role", "tooltip");
  let owner: HTMLElement | null = null;
  let previousDescription: string | null = null;
  let timer: number | undefined;
  let lastClosed = 0;
  let contentSignature = "";
  const hide = () => {
    window.clearTimeout(timer);
    if (owner) {
      if (previousDescription === null) owner.removeAttribute("aria-describedby");
      else owner.setAttribute("aria-describedby", previousDescription);
    }
    previousDescription = null; owner = null; tip.remove(); lastClosed = Date.now();
  };
  const content = (element: HTMLElement) => element.dataset.uiTooltipContent ? document.getElementById(element.dataset.uiTooltipContent) : null;
  const text = (element: HTMLElement) => content(element)?.textContent || element.getAttribute("title") || element.dataset.uiTooltip || "";
  const updateContent = (element: HTMLElement) => {
    const source = content(element);
    const signature = `${source?.innerHTML ?? text(element)}\u0000${element.dataset.uiTooltipImage ?? ""}\u0000${element.dataset.uiTooltipVideo ?? ""}`;
    if (signature === contentSignature && tip.hasChildNodes()) return;
    contentSignature = signature;
    if (source) {
      const clone = source.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("[id]").forEach((item) => item.removeAttribute("id"));
      tip.replaceChildren(...Array.from(clone.childNodes));
    } else {
      tip.textContent = text(element);
      const url = element.dataset.uiTooltipImage || element.dataset.uiTooltipVideo;
      if (url) {
        const media = document.createElement(element.dataset.uiTooltipVideo ? "video" : "img");
        media.className = "ui-tooltip-media"; media.src = url;
        if (media instanceof HTMLVideoElement) { media.muted = true; media.preload = "metadata"; media.playsInline = true; }
        else media.alt = "";
        tip.prepend(media);
        media.addEventListener("load", () => { if (owner === element) positionFloating(element, tip); }, { once: true });
        media.addEventListener("loadedmetadata", () => { if (owner === element) positionFloating(element, tip); }, { once: true });
      }
    }
  };
  const schedule = (element: HTMLElement) => {
    if (element === owner) return;
    const quick = Date.now() - lastClosed < 300;
    hide();
    const message = text(element);
    if (!message) return;
    // Suppress the browser tooltip, retaining the value for future visits.
    if (element.hasAttribute("title")) { element.dataset.uiTooltip = message; element.removeAttribute("title"); }
    owner = element;
    previousDescription = element.getAttribute("aria-describedby");
    timer = window.setTimeout(() => {
      if (owner !== element || !element.isConnected) return;
      updateContent(element);
      (document.fullscreenElement ?? document.body).append(tip);
      const descriptions = previousDescription?.split(/\s+/).filter((id) => id !== element.dataset.uiTooltipContent) ?? [];
      element.setAttribute("aria-describedby", [...descriptions, tip.id].filter(Boolean).join(" "));
      positionFloating(element, tip);
    }, quick ? 80 : 450);
  };
  const target = (event: Event) => event.target instanceof Element ? event.target.closest<HTMLElement>("[title], [data-ui-tooltip], [data-ui-tooltip-content]") : null;
  root.addEventListener("pointerover", (event) => { const element = target(event); if (element) schedule(element); }, { signal });
  root.addEventListener("pointerout", (event) => {
    if (owner && !(event.relatedTarget instanceof Node && owner.contains(event.relatedTarget))) hide();
  }, { signal });
  root.addEventListener("focusin", (event) => { const element = target(event); if (element) schedule(element); }, { signal });
  root.addEventListener("focusout", hide, { signal });
  root.addEventListener("click", (event) => { const element = target(event); if (element?.matches("[data-tooltip-toggle]")) schedule(element); }, { signal });
  root.addEventListener("pointerdown", hide, { signal, capture: true });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") hide(); }, { signal });
  window.addEventListener("scroll", () => {
    // Focusing an offscreen info control may itself scroll the viewport.
    // Keep its keyboard tooltip scheduled; pointer-only tips close on scroll.
    if (owner?.contains(document.activeElement)) {
      if (tip.isConnected) positionFloating(owner, tip);
    } else hide();
  }, { signal, capture: true, passive: true });
  window.addEventListener("resize", hide, { signal });
  const observer = new MutationObserver(() => {
    if (!owner) return;
    if (!owner.isConnected) { hide(); return; }
    if (owner.title) { owner.dataset.uiTooltip = owner.title; owner.removeAttribute("title"); }
    if (tip.isConnected) { updateContent(owner); positionFloating(owner, tip); }
  });
  observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["title", "data-ui-tooltip", "data-ui-tooltip-image", "data-ui-tooltip-video"] });
  return () => { events.abort(); observer.disconnect(); hide(); };
}
