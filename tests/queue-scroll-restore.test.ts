// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clampQueueScrollPosition,
  createQueueScrollController
} from "../src/renderer/pages/queue/scroll-controller.ts";

const originalScrollY = Object.getOwnPropertyDescriptor(window, "scrollY");
const originalRequestAnimationFrame = window.requestAnimationFrame;
const originalCancelAnimationFrame = window.cancelAnimationFrame;
const originalScrollTo = window.scrollTo;
const originalHtmlScrollHeight = Object.getOwnPropertyDescriptor(document.documentElement, "scrollHeight");
const originalBodyScrollHeight = Object.getOwnPropertyDescriptor(document.body, "scrollHeight");

afterEach(() => {
  vi.restoreAllMocks();
  if (originalScrollY) Object.defineProperty(window, "scrollY", originalScrollY);
  if (originalHtmlScrollHeight) Object.defineProperty(document.documentElement, "scrollHeight", originalHtmlScrollHeight);
  if (originalBodyScrollHeight) Object.defineProperty(document.body, "scrollHeight", originalBodyScrollHeight);
  window.requestAnimationFrame = originalRequestAnimationFrame;
  window.cancelAnimationFrame = originalCancelAnimationFrame;
  window.scrollTo = originalScrollTo;
});

describe("queue scroll restoration", () => {
  it("clamps a saved position after a task is removed", () => {
    expect(clampQueueScrollPosition(1400, 1600, 900)).toBe(700);
    expect(clampQueueScrollPosition(420, 1600, 900)).toBe(420);
  });

  it("normalizes invalid and negative positions", () => {
    expect(clampQueueScrollPosition(-20, 1600, 900)).toBe(0);
    expect(clampQueueScrollPosition(Number.NaN, 1600, 900)).toBe(0);
    expect(clampQueueScrollPosition(200, 400, 900)).toBe(0);
  });

  it("keeps the first position when a second render starts before restoration", () => {
    let scrollY = 640;
    const frames: FrameRequestCallback[] = [];
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      get: () => scrollY
    });
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      value: 2400
    });
    Object.defineProperty(document.body, "scrollHeight", {
      configurable: true,
      value: 2400
    });
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = (() => undefined) as typeof window.cancelAnimationFrame;
    window.scrollTo = ((options?: ScrollToOptions | number, y?: number) => {
      scrollY = typeof options === "number" ? y ?? 0 : options?.top ?? 0;
    }) as typeof window.scrollTo;

    const controller = createQueueScrollController(() => "queue");
    controller.beforeRender();
    scrollY = 0;
    controller.restoreScrollPosition();
    controller.beforeRender();
    controller.restoreScrollPosition();

    frames[1]?.(0);
    expect(scrollY).toBe(640);
    frames[2]?.(0);
    expect(scrollY).toBe(640);
  });
});
