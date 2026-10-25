// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createHistoryLayoutController } from "../src/renderer/pages/history/layout-controller";
import type { RendererContext } from "../src/renderer/contracts";
afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); window.scrollY = 0; });
it("corrects a restored card's layout before the first animation frame can expose it", () => {
  document.body.innerHTML = '<main><article class="history-gallery-item" data-history="asset"></article></main>';
  const root = document.querySelector("main")!, card = root.querySelector<HTMLElement>("article")!;
  let documentTop = 600;
  card.getBoundingClientRect = () => ({ top: documentTop - window.scrollY, height: 200 } as DOMRect);
  Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, value: 4000 });
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  vi.spyOn(window, "scrollTo").mockImplementation(((o: ScrollToOptions) => { window.scrollY = o.top ?? 0; }) as typeof window.scrollTo);
  vi.spyOn(window, "scrollBy").mockImplementation(((o: ScrollToOptions) => { window.scrollY += o.top ?? 0; }) as typeof window.scrollBy);
  const context = { root, getRoute: () => ({ page: "history", historyKind: "video" }) } as unknown as RendererContext;
  const controller = createHistoryLayoutController(context, vi.fn());
  window.scrollY = 400; controller.captureHistoryScrollPosition("asset");
  window.scrollY = 0; documentTop += 160;
  controller.restoreScrollPosition();
  expect(window.scrollY).toBe(560);
  controller.beforeRender();
});
it("lets an explicit scroll intent cancel a pending detail-return correction", () => {
  document.body.innerHTML = '<main><div class="history-gallery"><article class="history-gallery-item" data-history="asset"></article></div></main>';
  const root = document.querySelector("main")!, card = root.querySelector<HTMLElement>("article")!;
  card.getBoundingClientRect = () => ({ top: 600 - window.scrollY, height: 200, bottom: 800 - window.scrollY, left: 0, right: 300, width: 300, x: 0, y: 600 - window.scrollY, toJSON() {} });
  Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, value: 3000 });
  const frames = new Map<number, FrameRequestCallback>(); let id = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { frames.set(++id, callback); return id; });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(key => { frames.delete(key); });
  vi.spyOn(window, "scrollTo").mockImplementation(((options: ScrollToOptions) => { window.scrollY = options.top ?? 0; }) as typeof window.scrollTo);
  const context = { root, getRoute: () => ({ page: "history", historyKind: "video" }) } as unknown as RendererContext;
  const controller = createHistoryLayoutController(context, vi.fn());
  const dispose = controller.bindViewportControls(); window.scrollY = 400;
  controller.captureHistoryScrollPosition("asset"); window.scrollY = 0; controller.restoreScrollPosition();
  expect(window.scrollY).toBe(400); expect(frames.size).toBeGreaterThan(0);
  window.dispatchEvent(new WheelEvent("wheel")); window.scrollY = 100;
  for (const [key, callback] of frames) { frames.delete(key); callback(0); }
  expect(window.scrollY).toBe(100); expect(frames.size).toBe(0); dispose();
});
