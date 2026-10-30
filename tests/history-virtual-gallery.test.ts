// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { historyWindowIndexes, layoutHistoryWindow } from "../src/renderer/pages/history/virtual-layout";
import { mountVirtualHistory, prepareVirtualHistory, refreshVirtualHistory, registerHistoryWindow, virtualHistoryBox } from "../src/renderer/pages/history/virtual-gallery";

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); window.scrollY = 0; });
const items = Array.from({ length: 1500 }, (_, i) => ({ id: `asset-${i}`, ratio: [16 / 9, 9 / 16, 1][i % 3]! }));

it.each(["masonry", "album"] as const)("computes the full %s extent while selecting only viewport records", mode => {
  const layout = layoutHistoryWindow(items, 1100, mode);
  expect(layout.boxes).toHaveLength(1500);
  expect(layout.height).toBeGreaterThan(10000);
  const columns = new Map<number, typeof layout.boxes>();
  for (const box of layout.boxes) { const rows = columns.get(box.left) ?? []; const last = rows.at(-1); if (last) expect(box.top).toBeGreaterThanOrEqual(last.top + last.height + 7.9); rows.push(box); columns.set(box.left, rows); }
  const initial = historyWindowIndexes(layout, 0, 1800);
  const deep = historyWindowIndexes(layout, 30000, 31800);
  expect(initial.length).toBeGreaterThan(0); expect(initial.length).toBeLessThan(80);
  expect(deep.length).toBeGreaterThan(0); expect(deep.some(i => initial.includes(i))).toBe(false);
  expect(historyWindowIndexes(layout, 30000, 31800, 0)).toContain(0);
});

it("recalculates a retained virtual gallery when the column preference changes at the same width", () => {
  const previous = document.documentElement.dataset.historyMasonryColumns;
  document.documentElement.dataset.historyMasonryColumns = "3";
  const { root, gallery } = galleryFixture();
  const cleanup = mountVirtualHistory(root, () => () => undefined);
  try {
    const before = virtualHistoryBox(gallery, "asset-0")!.width;
    document.documentElement.dataset.historyMasonryColumns = "6";
    refreshVirtualHistory(gallery);
    expect(virtualHistoryBox(gallery, "asset-0")!.width).toBeLessThan(before);
    expect(gallery.children.length).toBeLessThan(160);
    const layout = layoutHistoryWindow(items, 1200, "album", 47, 10);
    expect(new Set(layout.boxes.map(box => box.left)).size).toBe(10);
  } finally {
    cleanup();
    if (previous === undefined) delete document.documentElement.dataset.historyMasonryColumns;
    else document.documentElement.dataset.historyMasonryColumns = previous;
  }
});

it("repaints cached cards after timeline measurement calculates a resized layout first", () => {
  let notify: ResizeObserverCallback | undefined;
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { notify = callback; }
    observe() {} disconnect() {}
  });
  const { root, gallery } = galleryFixture();
  let width = 1100;
  Object.defineProperty(gallery, "clientWidth", { get: () => width, configurable: true });
  vi.spyOn(window, "scrollBy").mockImplementation(() => undefined);
  const cleanup = mountVirtualHistory(root, () => () => undefined);
  try {
    const first = gallery.firstElementChild as HTMLElement;
    const before = first.style.width;
    width = 440;
    const expected = virtualHistoryBox(gallery, "asset-0")!;
    expect(first.style.width).toBe(before);
    notify!([], {} as ResizeObserver);
    expect(gallery.firstElementChild).toBe(first);
    expect(first.style.width).toBe(`${expected.width}px`);
    expect(first.style.width).not.toBe(before);
    expect([...gallery.children].every(node => (node as HTMLElement).style.left === "0px")).toBe(true);
  } finally { cleanup(); vi.unstubAllGlobals(); }
});

function galleryFixture() {
  const root = document.createElement("div"); document.body.append(root);
  const token = registerHistoryWindow(items, index => `<article class="history-gallery-item" data-history="asset-${index}" data-history-order="${index}" tabindex="0"><button>More</button></article>`);
  root.innerHTML = `<section class="history-gallery masonry" data-history-virtual="${token}"></section>`;
  const gallery = root.firstElementChild as HTMLElement;
  Object.defineProperty(gallery, "clientWidth", { value: 1100, configurable: true });
  gallery.getBoundingClientRect = () => ({ top: -window.scrollY, width: 1100 }) as DOMRect;
  vi.spyOn(window, "scrollTo").mockImplementation((options: ScrollToOptions | number) => { window.scrollY = typeof options === "number" ? options : options.top ?? 0; });
  prepareVirtualHistory(root);
  return { root, gallery };
}

it("mounts a bounded window, releases departed resources, preserves focused nodes and unmounts all subscriptions", () => {
  const { root, gallery } = galleryFixture();
  const mount = vi.fn(() => vi.fn());
  const cleanup = mountVirtualHistory(root, mount);
  const first = gallery.firstElementChild as HTMLElement; first.focus();
  const total = gallery.children.length; expect(total).toBeGreaterThan(0); expect(total).toBeLessThan(80);
  const firstCleanup = mount.mock.results[0]!.value;
  window.scrollY = 30000; refreshVirtualHistory(gallery);
  expect(first.isConnected).toBe(true); expect(document.activeElement).toBe(first); expect(firstCleanup).not.toHaveBeenCalled();
  first.blur(); refreshVirtualHistory(gallery);
  expect(first.isConnected).toBe(false); expect(firstCleanup).toHaveBeenCalledOnce();
  expect(gallery.children.length).toBeLessThan(80);
  expect(virtualHistoryBox(gallery, "asset-1499")).toBeDefined();
  cleanup();
  for (const result of mount.mock.results) expect(result.value).toHaveBeenCalledOnce();
});

it("keeps chronological keyboard navigation reachable across window boundaries", () => {
  const { root, gallery } = galleryFixture();
  const cleanup = mountVirtualHistory(root, () => () => undefined);
  const last = gallery.lastElementChild as HTMLElement;
  const index = Number(last.dataset.historyOrder), button = last.querySelector("button")!;
  button.focus(); button.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
  expect((document.activeElement as HTMLElement).dataset.historyOrder).toBe(String(index + 1));
  expect(gallery.children.length).toBeLessThan(80);
  cleanup();
});

it("remounts a preserved gallery at a new anchor without leaving stale window nodes", () => {
  const { root, gallery } = galleryFixture();
  const dispose = mountVirtualHistory(root, () => () => undefined);
  const old = gallery.firstElementChild!;
  dispose();
  window.scrollY = 30000;
  const next = mountVirtualHistory(root, () => () => undefined);
  expect(old.isConnected).toBe(false);
  expect(gallery.children.length).toBeGreaterThan(0);
  expect(gallery.children.length).toBeLessThan(80);
  expect([...gallery.children].every(node => Number((node as HTMLElement).dataset.historyOrder) > 0)).toBe(true);
  next();
});
