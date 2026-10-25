import { enhanceSelect, type SelectControl } from "./select";
import { mountTooltip, prepareTooltipSources } from "./tooltip";
import { createStableLabels, mountPointerLight, paintProgressButton } from "./feedback";
import { mountSegmented, type SegmentPosition } from "./segmented";
import { renderIcons } from "../icons";

let refreshActive: ((root: ParentNode) => void) | undefined;

/** Assign visual roles while markup is still inert. Custom media elements may
 * synchronously read layout as soon as the tree connects to the document. */
export function primeSharedUi(scope: ParentNode): HTMLButtonElement[] {
  const buttons = [...scope.querySelectorAll<HTMLButtonElement>("button.primary, button.secondary, button.ghost, button.icon-button")]
    .filter((button) => !button.closest(".history-player, .extend-video-player, .image-markup-editor, [data-ui-skip]"));
  buttons.forEach((button) => button.classList.add("ui-button"));
  scope.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=hidden]), textarea").forEach((input) => {
    if (!input.closest(".history-player, .extend-video-player, [data-ui-skip]")) input.classList.add("ui-field");
  });
  scope.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach((input) => {
    if (!input.closest(".history-player, .extend-video-player, [data-ui-skip]")) input.classList.add("ui-range");
  });
  scope.querySelectorAll<HTMLInputElement>('input[type="checkbox"], input[type="radio"]').forEach((input) => input.classList.add("ui-check"));
  return buttons;
}

export function replaceSharedUiMarkup(root: HTMLElement, markup: string): void {
  const template = document.createElement("template");
  template.innerHTML = markup;
  primeSharedUi(template.content);
  renderIcons(template.content);
  root.replaceChildren(template.content);
}

/** Called synchronously at the end of rendering, before restoring focus. */
export function refreshSharedUi(root: ParentNode): void { refreshActive?.(root); }

/** Programmatic value/bounds changes do not emit native input events. */
export function paintRangeFill(input: HTMLInputElement): void {
  const min = Number(input.min || 0), max = Number(input.max || 100);
  const fill = max > min ? Math.max(0, Math.min(100, (Number(input.value) - min) / (max - min) * 100)) : 0;
  input.style.setProperty("--ui-range-fill", `${fill}%`);
  input.style.setProperty("--ui-range-ratio", String(fill / 100));
}

export function mountSharedUi(root: HTMLElement): () => void {
  const controls = new Map<HTMLSelectElement, SelectControl>();
  const segments = new Map<HTMLElement, () => void>();
  const positions = new Map<string, SegmentPosition>();
  const events = new AbortController();
  const { signal } = events;
  let disposed = false;
  const disposeTooltip = mountTooltip(root);
  const disposePointerLight = mountPointerLight(root);
  const stableLabel = createStableLabels();
  const refresh = (scope: ParentNode) => {
    if (disposed) return;
    const buttons = primeSharedUi(scope);
    for (const [element, dispose] of segments) if (!root.contains(element)) { dispose(); segments.delete(element); }
    scope.querySelectorAll<HTMLElement>('[data-ui-segmented]').forEach(group => {
      if (segments.has(group)) return;
      const key = group.dataset.uiSegmented!;
      segments.set(group, mountSegmented(group, positions.get(key), position => positions.set(key, position)));
    });
    prepareTooltipSources(scope);
    for (const [native, control] of controls) {
      if (!root.contains(native)) { control.dispose(); controls.delete(native); }
    }
    scope.querySelectorAll<HTMLSelectElement>("select:not([multiple]):not([size]):not([data-native-select])").forEach((native) => {
      if (native.closest(".history-player, .extend-video-player, [data-ui-skip]")) return;
      if (!controls.has(native) && !native.hidden) controls.set(native, enhanceSelect(native));
      else controls.get(native)?.sync();
    });
    buttons.forEach((button) => paintProgressButton(button));
    scope.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach((input) => {
      if (input.closest(".history-player, .extend-video-player, [data-ui-skip]")) return;
      paintRangeFill(input);
    });
    buttons.forEach(stableLabel);
  };
  root.addEventListener("input", (event) => {
    if (event.target instanceof HTMLInputElement && event.target.classList.contains("ui-range")) paintRangeFill(event.target);
  }, { signal });
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes" && record.target instanceof HTMLButtonElement) paintProgressButton(record.target);
    }
    // Media, decoded covers and tooltip text do not introduce UI controls.
    // Refresh only parents that gained controls, coalescing overlapping scopes.
    const scopes = new Set<ParentNode>();
    const selector = 'button, select, input, textarea, [data-ui-segmented], [role="tooltip"], [data-ui-tooltip-source]';
    for (const record of records) {
      if (record.type !== "childList" || !root.contains(record.target)) continue;
      if ([...record.addedNodes].some(node => node instanceof HTMLElement && !node.closest(".ui-select-list, .ui-tooltip") && (node.matches(selector) || node.querySelector(selector)))) scopes.add(record.target as ParentNode);
    }
    const parents = [...scopes].filter(scope => ![...scopes].some(other => other !== scope && (other as Node).contains(scope as Node)));
    parents.forEach(refresh);
    if (records.some((record) => record.removedNodes.length)) {
      for (const [native, control] of controls) if (!root.contains(native)) { control.dispose(); controls.delete(native); }
      for (const [element, dispose] of segments) if (!root.contains(element)) { dispose(); segments.delete(element); }
    }
  });
  refreshActive = refresh;
  refresh(root);
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-busy"] });
  return () => {
    disposed = true; observer.disconnect(); events.abort(); disposeTooltip(); disposePointerLight();
    if (refreshActive === refresh) refreshActive = undefined;
    controls.forEach((control) => control.dispose()); controls.clear();
    segments.forEach(dispose => dispose()); segments.clear(); positions.clear();
  };
}
