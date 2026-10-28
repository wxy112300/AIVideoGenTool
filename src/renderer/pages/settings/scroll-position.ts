interface SettingsScrollPosition {
  panelId: string;
  top: number;
  anchor?: { attribute: string; value: string; top: number };
}

/** Capture before teardown, while the old document still has its full height. */
export function captureSettingsScroll(root: HTMLElement): SettingsScrollPosition | null {
  const panel = root.querySelector<HTMLElement>(".settings-content[id]");
  if (!panel) return null;
  const boundary = root.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 0;
  const card = [...panel.querySelectorAll<HTMLElement>("[data-settings-node], [data-settings-runtime]")]
    .find(element => {
      const rect = element.getBoundingClientRect();
      return rect.bottom > boundary && rect.top < window.innerHeight;
    });
  const attribute = card?.hasAttribute("data-settings-node") ? "data-settings-node" : "data-settings-runtime";
  return {
    panelId: panel.id,
    top: window.scrollY,
    anchor: card ? { attribute, value: card.getAttribute(attribute)!, top: card.getBoundingClientRect().top } : undefined
  };
}

export function restoreSettingsScroll(root: HTMLElement, position: SettingsScrollPosition | null): void {
  const panel = root.querySelector<HTMLElement>(".settings-content[id]");
  if (!position || panel?.id !== position.panelId) return;
  const anchor = position.anchor;
  const card = anchor ? [...panel.querySelectorAll<HTMLElement>(`[${anchor.attribute}]`)]
    .find(element => element.getAttribute(anchor.attribute) === anchor.value) : undefined;
  const top = card && anchor
    ? window.scrollY + card.getBoundingClientRect().top - anchor.top
    : position.top;
  window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
}
