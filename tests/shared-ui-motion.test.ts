// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { moveListItem, mountSortable } from "../src/renderer/shared/ui/sortable";
import { mountTwoColumnMasonry } from "../src/renderer/shared/ui/masonry";
import { paintProgressButton } from "../src/renderer/shared/ui/feedback";
import { reducedMotion } from "../src/renderer/shared/ui/motion";
import { mountSegmented } from "../src/renderer/shared/ui/segmented";

afterEach(() => { document.body.replaceChildren(); delete document.documentElement.dataset.motion; vi.unstubAllGlobals(); });

describe("shared motion and list interaction", () => {
  it("moves and animates the indicator when selection changes without a tree replacement", async () => {
    document.body.innerHTML = '<div><button id="one" aria-pressed="true">One</button><button id="two" aria-pressed="false">Two</button></div>';
    const group = document.querySelector("div")!, buttons = group.querySelectorAll("button");
    for (const [index, button] of [...buttons].entries()) Object.defineProperties(button, { offsetLeft: { value: index*80 }, offsetWidth: { value: 80 } });
    const cancel = vi.fn(); group.animate = vi.fn(() => ({ cancel } as unknown as Animation));
    const dispose = mountSegmented(group, undefined, () => undefined);
    buttons[0]!.setAttribute("aria-pressed", "false"); buttons[1]!.setAttribute("aria-pressed", "true");
    await Promise.resolve();
    expect(group.style.getPropertyValue("--segment-left")).toBe("80px");
    expect(group.animate).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ pseudoElement: "::before" }));
    dispose(); expect(cancel).toHaveBeenCalled();
  });
  it("moves an item without mutating a queued or draft input array", () => {
    const original = Object.freeze(["a", "b", "c"]);
    expect(moveListItem(original, 0, 2)).toEqual(["b", "c", "a"]);
    expect(original).toEqual(["a", "b", "c"]);
    expect(moveListItem(original, -1, 3)).toEqual(original);
  });
  it("animates id-less choices such as layout, upscale and reasoning, but not repeated refreshes", async () => {
    document.body.innerHTML = '<div><button aria-pressed="true">One</button><button aria-pressed="false">Two</button></div>';
    const group = document.querySelector("div")!, buttons = group.querySelectorAll("button");
    for (const [index, button] of [...buttons].entries()) Object.defineProperties(button, { offsetLeft: { value: index * 80 }, offsetWidth: { value: 80 } });
    group.animate = vi.fn(() => ({ cancel: vi.fn() } as unknown as Animation));
    const dispose = mountSegmented(group, undefined, () => undefined);
    buttons[0]!.setAttribute("aria-pressed", "false"); buttons[1]!.setAttribute("aria-pressed", "true");
    await Promise.resolve();
    expect(group.animate).toHaveBeenCalledOnce();
    buttons[1]!.setAttribute("aria-pressed", "true");
    await Promise.resolve();
    expect(group.animate).toHaveBeenCalledOnce();
    dispose();
  });
  it("only sorts from a focused handle, respects boundaries and removes handlers on disposal", () => {
    document.body.innerHTML = '<div id="list"><div data-sortable-item><button data-sortable-handle>A</button><input></div><div data-sortable-item><button data-sortable-handle>B</button></div></div>';
    const list = document.querySelector<HTMLElement>("#list")!;
    const move = vi.fn(); const dispose = mountSortable(list, move);
    const handles = list.querySelectorAll("button");
    handles[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })); expect(move).not.toHaveBeenCalled();
    handles[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })); expect(move).toHaveBeenLastCalledWith(1, 0);
    list.querySelector("input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); expect(move).toHaveBeenCalledTimes(1);
    dispose(); handles[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); expect(move).toHaveBeenCalledTimes(1);
  });
  it("preserves node identity and original order when two columns collapse", () => {
    let change: (() => void) | undefined;
    const media = { matches: false, addEventListener: (_: string, callback: () => void) => { change = callback; }, removeEventListener: vi.fn() };
    vi.stubGlobal("matchMedia", () => media);
    const root = document.createElement("div"); document.body.append(root);
    const items = Array.from({ length: 4 }, (_, index) => Object.assign(document.createElement("article"), { textContent: String(index) })); root.append(...items);
    const dispose = mountTwoColumnMasonry(root);
    expect([...root.children[0]!.children]).toEqual([items[0], items[2]]);
    expect([...root.children[1]!.children]).toEqual([items[1], items[3]]);
    media.matches = true; change?.(); expect([...root.children]).toEqual(items);
    dispose(); expect([...root.children]).toEqual(items); expect(media.removeEventListener).toHaveBeenCalled();
  });
  it("balances uneven detail cards once without moving them when a disclosure changes height", () => {
    let change: (() => void) | undefined;
    const media = { matches: false, addEventListener: (_: string, callback: () => void) => { change = callback; }, removeEventListener: vi.fn() };
    vi.stubGlobal("matchMedia", () => media);
    const root = document.createElement("div"); document.body.append(root);
    const heights = [400, 100, 100, 100];
    const items = heights.map((height, index) => {
      const node = document.createElement("article"); node.textContent = String(index);
      vi.spyOn(node, "getBoundingClientRect").mockImplementation(() => ({ height: heights[index] ?? height }) as DOMRect);
      return node;
    });
    root.append(...items); const dispose = mountTwoColumnMasonry(root, "balanced");
    expect([...root.children[0]!.children]).toEqual([items[0]]);
    expect([...root.children[1]!.children]).toEqual([items[1], items[2], items[3]]);
    heights[1] = 600; change?.();
    expect([...root.children[1]!.children]).toEqual([items[1], items[2], items[3]]);
    media.matches = true; change?.(); expect([...root.children]).toEqual(items);
    dispose();
  });
  it("never enables a blocked operation or fabricates progress, and honors explicit standard motion", () => {
    const button = document.createElement("button"); button.disabled = true; button.setAttribute("aria-busy", "true");
    paintProgressButton(button); expect(button.hasAttribute("data-ui-indeterminate")).toBe(true); expect(button.disabled).toBe(true);
    paintProgressButton(button, 67); expect(button.style.getPropertyValue("--ui-progress")).toBe("67%");
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    expect(reducedMotion()).toBe(true); document.documentElement.dataset.motion = "standard"; expect(reducedMotion()).toBe(false);
    document.documentElement.dataset.motion = "reduced"; expect(reducedMotion()).toBe(true);
  });
});
