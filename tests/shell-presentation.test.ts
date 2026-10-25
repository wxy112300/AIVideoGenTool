// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPagePresentation, yieldPresentationTurn, mountShellGeometry } from "../src/renderer/shell/presentation";
import { tweenText } from "../src/renderer/shared/ui/tween";
import { normalizeAppearance } from "../src/core/appearance";
import { applyAppearance } from "../src/renderer/shared/ui/appearance";
import { mountAppearanceSettings, renderAppearanceSettings } from "../src/renderer/pages/settings/appearance";
import { createTranslator } from "../src/core/i18n";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); document.body.innerHTML = ""; window.scrollY = 0; applyAppearance(undefined); });

describe("route presentation", () => {
  it("shows pending feedback for a slow module commit and cleans it on navigation away", async () => {
    const root = document.createElement("div"), presentation = createPagePresentation(root, () => "Loading");
    await presentation.update("create", async () => undefined);
    let finish!: () => void;
    const opening = presentation.update("history", () => new Promise<void>(resolve => { finish = resolve; }));
    expect(document.querySelector(".history-navigation-loading")?.textContent).toBe("Loading");
    await presentation.update("settings", async () => undefined);
    expect(document.querySelector(".history-navigation-loading")).toBeNull();
    finish(); await opening;
    expect(root.dataset.pagePresenting).toBeUndefined();
  });
  it("paints a loading status before a cold detail commit and removes it on completion", async () => {
    const root = document.createElement("div"), presentation = createPagePresentation(root, () => "Loading detail");
    await presentation.update("history", async () => undefined);
    let finish!: () => void;
    const opening = presentation.update("history-detail", () => new Promise<void>(resolve => { finish = resolve; }));
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    expect(document.querySelector('.history-navigation-loading[role="status"]')?.textContent).toBe("Loading detail");
    finish(); await opening;
    expect(document.querySelector(".history-navigation-loading")).toBeNull();
  });
  it("does not restart a visible departure when the same destination receives an async refresh", async () => {
    const root = document.createElement("div"), presentation = createPagePresentation(root);
    await presentation.update("history", async () => { root.innerHTML = '<div class="app-shell"><main><div class="history-gallery"></div></main></div>'; });
    let finish!: () => void;
    const cancel = vi.fn(), animate = vi.fn(() => ({ cancel, finished: new Promise<void>(resolve => { finish = resolve; }), effect: { updateTiming: vi.fn() } } as unknown as Animation));
    root.querySelector<HTMLElement>(".history-gallery")!.animate = animate;
    const obsolete = vi.fn(async () => undefined), latest = vi.fn(async () => undefined);
    const first = presentation.update("history-detail", obsolete);
    const refreshed = presentation.update("history-detail", latest);
    expect(animate).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();
    finish(); await Promise.all([first, refreshed]);
    expect(obsolete).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
  });
  it.each(["history-detail", "image-history-detail"] as const)("pairs list entry and return for %s without animating navigation", async detailPage => {
    const root = document.createElement("div");
    const presentation = createPagePresentation(root);
    const animate = vi.fn(() => ({ cancel: vi.fn(), finished: Promise.resolve(), effect: { updateTiming: vi.fn() } } as unknown as Animation));
    const list = () => {
      root.innerHTML = '<div class="app-shell"><header class="topbar"></header><main><div class="history-heading"></div><div class="history-gallery"></div></main></div>';
      root.querySelectorAll<HTMLElement>(".topbar, .history-heading, .history-gallery").forEach(element => { element.animate = animate; });
    };
    await presentation.update("history", async () => list());
    animate.mockClear();
    const oldGallery = root.querySelector(".history-gallery");
    await presentation.update(detailPage, async () => {
      root.innerHTML = '<div class="app-shell"><header class="topbar"></header><main><div class="history-media-detail"><div class="history-detail-back"></div><section class="hero"></section></div></main></div>';
      root.querySelectorAll<HTMLElement>(".topbar, .history-detail-back, .hero").forEach(element => { element.animate = animate; });
    });
    expect(animate.mock.instances).toEqual([oldGallery, root.querySelector(".hero")]);
    expect(animate.mock.calls[0][0]).toEqual([{ opacity: 1, transform: "translateX(0)" }, { opacity: 0, transform: "translateX(-10px)" }]);
    expect(animate.mock.calls[1][0][0]).toEqual({ opacity: 0, transform: "translateX(24px)" });
    expect(animate.mock.calls[1][1]).toMatchObject({ duration: 220 });
    animate.mockClear();
    await presentation.update("history", async () => list());
    expect(animate.mock.calls[0][0][1]).toEqual({ opacity: 0, transform: "translateX(18px)" });
    expect(animate.mock.calls[1][0][0]).toEqual({ opacity: 0, transform: "translateX(-14px)" });
    expect(animate.mock.calls[1][1]).toMatchObject({ duration: 180 });
  });

  it("a new navigation interrupts the departure before an obsolete detail can mount", async () => {
    const root = document.createElement("div"), presentation = createPagePresentation(root);
    await presentation.update("history", async () => { root.innerHTML = '<div class="app-shell"><main><div class="history-gallery"></div></main></div>'; });
    let reject!: (error: Error) => void;
    const cancel = vi.fn(() => reject(new Error("cancelled")));
    root.querySelector<HTMLElement>(".history-gallery")!.animate = () => ({ cancel, finished: new Promise<void>((_, fail) => { reject = fail; }), effect: { updateTiming: vi.fn() } } as unknown as Animation);
    const obsolete = vi.fn(async () => undefined);
    const opening = presentation.update("history-detail", obsolete);
    await presentation.update("queue", async () => { root.innerHTML = '<div class="app-shell"><main><section>queue</section></main></div>'; });
    await opening;
    expect(cancel).toHaveBeenCalled();
    expect(obsolete).not.toHaveBeenCalled();
    expect(root.textContent).toBe("queue");
    expect(root.dataset.pagePresenting).toBeUndefined();
  });

  it("reduced motion skips the departure and removes directional transforms", async () => {
    const root = document.createElement("div"), presentation = createPagePresentation(root);
    await presentation.update("history", async () => undefined);
    document.documentElement.dataset.motion = "reduced";
    const animate = vi.fn(() => ({ cancel: vi.fn() } as unknown as Animation));
    await presentation.update("history-detail", async () => {
      root.innerHTML = '<div class="history-media-detail"><div class="history-detail-back"></div><section></section></div>';
      root.querySelector<HTMLElement>("section")!.animate = animate;
    });
    expect(animate).toHaveBeenCalledOnce();
    expect(animate.mock.calls[0][0]).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(animate.mock.calls[0][1]).toMatchObject({ duration: 120 });
  });
  it("resets a departing deep list without resetting a returning history anchor", async () => {
    const root = document.createElement("div");
    const presentation = createPagePresentation(root);
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    await presentation.update("history", async () => undefined);
    window.scrollY = 1800;
    await presentation.update("create", async () => undefined);
    expect(scroll).toHaveBeenCalledTimes(1);
    await presentation.update("history", async () => undefined);
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("positions the sticky filter beneath the measured heading when narrow navigation wraps", () => {
    document.body.innerHTML = '<header class="topbar"></header><div class="history-heading"></div>';
    const header = document.querySelector<HTMLElement>("header")!;
    const heading = document.querySelector<HTMLElement>(".history-heading")!;
    header.getBoundingClientRect = () => ({ height: 92 } as DOMRect);
    let headingHeight = 96;
    heading.getBoundingClientRect = () => ({ height: headingHeight } as DOMRect);
    let measure: () => void = () => undefined;
    const observe = vi.fn(), disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { measure = callback; }
      observe = observe; disconnect = disconnect;
    });
    const dispose = mountShellGeometry();
    expect(document.documentElement.style.getPropertyValue("--history-heading-height")).toBe("96px");
    expect(observe).toHaveBeenCalledWith(heading);
    headingHeight = 56; measure();
    expect(document.documentElement.style.getPropertyValue("--history-heading-height")).toBe("56px");
    dispose(); expect(disconnect).toHaveBeenCalledOnce();
  });
  it("reveals changed sections without replaying their animation on ordinary refreshes", async () => {
    const root = document.createElement("div"); document.body.append(root);
    const presentation = createPagePresentation(root);
    await presentation.update("queue", async () => undefined);
    const markup = (mode: string) => `<button id="${mode}" data-input-mode aria-pressed="true"></button><section class="create-prompt-card"><input id="focused"></section>`;
    await presentation.update("create", async () => { root.innerHTML = markup("image"); });
    await presentation.update("create", async () => undefined);
    const animate = vi.fn(() => ({ cancel: vi.fn() } as unknown as Animation));
    await presentation.update("create", async () => {
      root.innerHTML = markup("video"); root.querySelector<HTMLElement>("section")!.animate = animate;
      root.querySelector<HTMLInputElement>("input")!.focus();
    });
    expect(animate).toHaveBeenCalledOnce();
    expect(document.activeElement?.id).toBe("focused");
    await presentation.update("create", async () => undefined);
    expect(animate).toHaveBeenCalledOnce();
    delete (document as Partial<Document>).startViewTransition;
  });
  it("lets staged History layout settle in real frames without invoking document capture", async () => {
    const root = document.createElement("div");
    const presentation = createPagePresentation(root);
    await presentation.update("create", async () => undefined);
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { queueMicrotask(() => callback(0)); return 1; });
    const capture = vi.fn();
    Object.defineProperty(document, "startViewTransition", { configurable: true, value: capture });
    let mounted = false;
    await presentation.update("history", async () => { await yieldPresentationTurn(); mounted = true; });
    expect(mounted).toBe(true);
    expect(raf).toHaveBeenCalledTimes(3);
    expect(capture).not.toHaveBeenCalled();
    delete (document as Partial<Document>).startViewTransition;
  });
  it("does not let a superseded render change the active route or first-frame gate", async () => {
    const root = document.createElement("div");
    const presentation = createPagePresentation(root);
    let release!: () => void;
    const old = presentation.update("create", () => new Promise<void>((resolve) => { release = resolve; }));
    await presentation.update("queue", async () => undefined);
    release(); await old;
    expect(root.dataset.presenting).toBeUndefined();
    const transition = vi.fn();
    Object.defineProperty(document, "startViewTransition", { configurable: true, value: transition });
    await presentation.update("queue", async () => undefined);
    expect(transition).not.toHaveBeenCalled();
    delete (document as Partial<Document>).startViewTransition;
  });
  it("reveals controls without fading the shell or using a native snapshot overlay", async () => {
    const root = document.createElement("div"); document.body.append(root);
    const presentation = createPagePresentation(root);
    const transition = vi.fn((callback: () => Promise<void>) => ({
      ready: Promise.resolve(), finished: Promise.resolve(), skipTransition: vi.fn(), updateCallbackDone: callback()
    }));
    vi.stubGlobal("document", document);
    Object.defineProperty(document, "startViewTransition", { configurable: true, value: transition });
    await presentation.update("create", async () => {
      expect(root.dataset.presenting).toBe("true");
      root.innerHTML = '<div class="app-shell"><input id="prompt"></div>';
      root.querySelector<HTMLInputElement>("input")!.focus();
    });
    expect(root.dataset.presenting).toBeUndefined();
    await presentation.update("create", async () => undefined);
    expect(transition).not.toHaveBeenCalled();
    await presentation.update("queue", async () => undefined);
    expect(transition).not.toHaveBeenCalled();
    expect(document.activeElement?.id).toBe("prompt");
    delete (document as Partial<Document>).startViewTransition;
  });

  it("fades the list while leaving shell, title and filters visible and unanimated", async () => {
    const root = document.createElement("div");
    const presentation = createPagePresentation(root);
    await presentation.update("create", async () => undefined);
    const animate = vi.fn(() => ({ cancel: vi.fn() } as unknown as Animation));
    const commit = vi.fn(async () => {
      root.innerHTML = '<div class="app-shell"><header class="topbar"></header><main><section class="page-heading history-heading"></section><section class="history-context"></section><div class="history-gallery"></div></main></div>';
      root.querySelectorAll<HTMLElement>(".topbar, .history-heading, .history-context, .history-gallery").forEach(element => { element.animate = animate; });
      expect(root.dataset.pagePresenting).toBe("true");
    });
    await presentation.update("history", commit);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(animate).toHaveBeenCalledOnce();
    expect(animate.mock.instances[0]).toBe(root.querySelector(".history-gallery"));
    expect(root.dataset.pagePresenting).toBeUndefined();
  });
});

describe("appearance and telemetry", () => {
  it("normalizes older or malformed preferences and restores all four attributes", () => {
    expect(normalizeAppearance({ accent: "invalid", depth: "3", motion: "standard", palette: "sand" })).toEqual({
      accent: "azure", depth: "1", motion: "standard", palette: "sand"
    });
    applyAppearance({ accent: "red", depth: "0", motion: "reduced", palette: "mauve" });
    expect(document.documentElement.dataset.accent).toBe("red");
    expect(document.documentElement.dataset.motion).toBe("reduced");
  });

  it("supports keyboard appearance selection and rolls back a failed save", async () => {
    document.body.innerHTML = renderAppearanceSettings(undefined, createTranslator("en-US").t);
    const save = vi.fn().mockRejectedValue(new Error("disk"));
    const failed = vi.fn();
    const dispose = mountAppearanceSettings(document.body, save, failed);
    const azure = document.getElementById("appearance-accent-azure")!;
    azure.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(document.documentElement.dataset.accent).toBe("sky");
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ accent: "sky" }));
    await vi.waitFor(() => expect(failed).toHaveBeenCalledOnce());
    expect(document.documentElement.dataset.accent).toBe("azure");
    expect(azure.getAttribute("aria-checked")).toBe("true");
    dispose();
    document.getElementById("appearance-accent-green")!.click();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("lands on the latest numeric value and skips interpolation in reduced motion", () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callbacks.push(callback); return callbacks.length; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const value = document.createElement("span"); value.textContent = "20.0/64.0G"; document.body.append(value);
    tweenText(value, "40.0/64.0G");
    callbacks.shift()!(0); callbacks.shift()!(180);
    expect(Number(value.textContent!.split("/")[0])).toBeGreaterThan(20);
    expect(Number(value.textContent!.split("/")[0])).toBeLessThan(40);
    callbacks.shift()!(400);
    expect(value.textContent).toBe("40.0/64.0G");
    document.documentElement.dataset.motion = "reduced";
    tweenText(value, "55.1/64.0G");
    expect(value.textContent).toBe("55.1/64.0G");
    tweenText(value, "--/--");
    expect(value.textContent).toBe("--/--");
  });
});
