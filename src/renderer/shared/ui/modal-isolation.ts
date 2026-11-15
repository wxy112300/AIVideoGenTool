const modalSelector = '[aria-modal="true"]:not(dialog)';

/** Keep custom dialogs' background inert without changing their focus/close policy.
 * Native modal dialogs already isolate their own background. */
export function mountModalIsolation(root: HTMLElement): () => void {
  const candidates = new Set<HTMLElement>();
  const owned = new Set<HTMLElement>();
  const collect = (node: HTMLElement) => {
    if (node.matches(modalSelector)) candidates.add(node);
    node.querySelectorAll<HTMLElement>(modalSelector).forEach(dialog => candidates.add(dialog));
  };
  const visible = (dialog: HTMLElement) => {
    for (let node: HTMLElement | null = dialog; node; node = node.parentElement) {
      if (node.hidden || getComputedStyle(node).display === "none") return false;
    }
    return true;
  };
  const sync = () => {
    for (const dialog of candidates) if (!root.contains(dialog) || !dialog.matches(modalSelector)) candidates.delete(dialog);
    const dialogs = [...candidates].filter(visible).sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    const dialog = dialogs.at(-1);
    const desired = new Set<HTMLElement>();
    if (dialog) {
      const allowed: HTMLElement[] = [dialog];
      // Shared select/tooltip portals remain outside clipped dialog content.
      dialog.querySelectorAll<HTMLElement>("[aria-controls], [aria-describedby]").forEach(control => {
        for (const id of `${control.getAttribute("aria-controls") ?? ""} ${control.getAttribute("aria-describedby") ?? ""}`.split(/\s+/)) {
          const portal = document.getElementById(id);
          if (portal?.matches(".ui-select-list, .ui-tooltip") && root.contains(portal)) allowed.push(portal);
        }
      });
      const isolate = (parent: HTMLElement) => {
        for (const child of parent.children) {
          if (!(child instanceof HTMLElement) || child.matches("script, style, link")) continue;
          if (allowed.includes(child)) continue;
          if (allowed.some(element => child.contains(element))) isolate(child);
          else desired.add(child);
        }
      };
      isolate(root);
    }
    for (const element of owned) if (!desired.has(element)) {
      element.removeAttribute("inert"); owned.delete(element);
    }
    for (const element of desired) if (!element.hasAttribute("inert")) {
      element.setAttribute("inert", ""); owned.add(element);
    }
  };
  collect(root);
  sync();
  const observer = new MutationObserver(records => {
    let changed = candidates.size > 0;
    for (const record of records) {
      if (record.type === "attributes" && record.target instanceof HTMLElement && record.target.matches(modalSelector)) {
        candidates.add(record.target); changed = true;
      }
      for (const node of record.addedNodes) if (node instanceof HTMLElement) {
        const previous = candidates.size;
        collect(node); changed ||= candidates.size !== previous;
      }
    }
    if (changed) sync();
  });
  observer.observe(root, { subtree: true, childList: true, attributes: true,
    attributeFilter: ["hidden", "open", "aria-modal", "aria-controls", "aria-describedby"] });
  return () => {
    observer.disconnect();
    owned.forEach(element => element.removeAttribute("inert"));
    owned.clear(); candidates.clear();
  };
}
