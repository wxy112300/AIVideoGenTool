// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { createRenderCoordinator, type RenderCoordinatorOptions } from "../src/renderer/render-coordinator";
import { createRendererUiState } from "../src/renderer/ui-state";

function createCoordinator(
  root: HTMLElement,
  currentPage: "settings" | "history" | "history-detail" | "create" = "settings",
  renderCreate: () => string = () => ""
) {
  const state = createDefaultState();
  const ui = createRendererUiState();
  const noop = () => undefined;
  const renderOverlay = vi.fn();
  const renderSettings = vi.fn(() => `<input id="settings-test-input" name="settings-test-input" value="hello">`);
  const options: RenderCoordinatorOptions = {
    root,
    addPageCleanup: noop,
    getPage: () => currentPage,
    getState: () => state,
    getUiState: () => ui,
    getPerformanceMetrics: () => null,
    t: ((key: string) => key) as RenderCoordinatorOptions["t"],
    renderPages: {
      create: renderCreate,
      queue: () => "",
      history: () => "",
      historyDetail: () => `<div class="history-player"><video data-history-asset="asset-1" data-history-version="version-1" src="next.mp4"></video></div>`,
      imageHistoryDetail: () => "",
      settings: renderSettings
    },
    beforeRenderHistory: noop,
    closeAppLogContextMenu: noop,
    bindShell: noop,
    renderOverlay,
    beforeRenderQueue: noop,
    bindCreate: noop,
    bindQueue: noop,
    bindHistory: noop,
    bindHistoryNavigation: () => noop,
    bindSettings: noop,
    bindHistoryViewportControls: () => noop,
    restoreQueueScrollPosition: noop,
    restoreHistoryScrollPosition: noop,
    ensurePromptPacks: async () => undefined,
    syncAppLogPolling: noop,
    icon: () => "",
    escapeHtml: (value: unknown) => String(value)
  };
  return { coordinator: createRenderCoordinator(options), renderOverlay, renderSettings, options };
}

describe("render coordinator focus preservation", () => {
  it("restores the same Settings panel after installation rebuilds collapse the document", async () => {
    const root = document.createElement("div"); document.body.append(root);
    const { coordinator, options } = createCoordinator(root);
    options.renderPages.settings = () => '<div id="settings-panel-nodes" class="settings-content"><article data-settings-node="lower-node">Install</article></div>';
    coordinator.render(); await new Promise(resolve => setTimeout(resolve, 0));
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    Object.defineProperty(window, "scrollY", { configurable: true, value: 1600 });
    const card = root.querySelector<HTMLElement>("[data-settings-node]")!;
    vi.spyOn(card, "getBoundingClientRect").mockReturnValue({ top: 120, bottom: 360 } as DOMRect);
    options.bindSettings = () => {
      // In Chromium replacing a long tree can clamp scrollY to zero.
      Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
      vi.spyOn(root.querySelector<HTMLElement>("[data-settings-node]")!, "getBoundingClientRect")
        .mockReturnValue({ top: 1840, bottom: 2080 } as DOMRect);
    };
    coordinator.render(); await new Promise(resolve => setTimeout(resolve, 0));
    expect(scroll).toHaveBeenLastCalledWith({ top: 1720, behavior: "instant" });
    scroll.mockClear();
    options.renderPages.settings = () => '<div id="settings-panel-models" class="settings-content"></div>';
    options.bindSettings = () => undefined;
    coordinator.render(); await new Promise(resolve => setTimeout(resolve, 0));
    expect(scroll).not.toHaveBeenCalled();
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    scroll.mockRestore(); root.remove();
  });
  it("preserves an open History picker across an unrelated refresh and appends new facets", async () => {
    const root = document.createElement("div"); document.body.append(root);
    const panel = (extra = "", locale = "zh-CN") => `<div data-history-filter-panel data-history-filter-context="video:${locale}"><div data-history-picker="models"><div class="history-picker-list"><label><input data-history-model="old">Old</label>${extra}</div></div><div data-history-picker="tags" hidden><div class="history-picker-list"><div data-history-tag-row="scene">Scene</div></div></div></div>`;
    root.innerHTML = panel();
    const previous = root.firstElementChild, input = root.querySelector<HTMLInputElement>("input")!; input.focus();
    const { coordinator, options } = createCoordinator(root, "history");
    options.renderPages.history = () => panel('<label><input data-history-model="new">New</label>');
    coordinator.render(); await vi.waitFor(() => expect(root.querySelector('[data-history-model="new"]')).not.toBeNull());
    expect(root.querySelector("[data-history-filter-panel]")).toBe(previous);
    expect(root.querySelector("[data-history-model=old]")).toBe(input); expect(document.activeElement).toBe(input);
    expect([...root.querySelectorAll<HTMLElement>("[data-history-model]")].map(e => e.dataset.historyModel)).toEqual(["old", "new"]);
    options.renderPages.history = () => panel("", "en-US");
    coordinator.render(); await vi.waitFor(() => expect(root.querySelector('[data-history-filter-context="video:en-US"]')).not.toBeNull());
    expect(root.querySelector("[data-history-filter-panel]")).not.toBe(previous); root.remove();
  });
  it("keeps a composing rich editor attached until composition ends, then applies the deferred refresh", async () => {
    const root = document.createElement("div"); document.body.append(root);
    root.innerHTML = '<div id="rich-composing" data-rich-composing contenteditable="true" tabindex="0">你好</div>';
    const editor = root.firstElementChild!;
    const render = vi.fn(() => '<div id="after-compose">你好</div>');
    const { coordinator } = createCoordinator(root, "create", render);
    coordinator.render(); coordinator.render();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(root.firstElementChild).toBe(editor); expect(render).not.toHaveBeenCalled();
    editor.removeAttribute("data-rich-composing");
    editor.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(render).toHaveBeenCalledOnce(); expect(root.querySelector("#after-compose")).not.toBeNull();
    root.remove();
  });
  it("restores a keyboard-focusable info host after an unrelated refresh", async () => {
    const root = document.createElement("div"); document.body.append(root);
    const markup = '<span id="info-host" tabindex="0">Info</span>';
    root.innerHTML = markup;
    root.querySelector<HTMLElement>("#info-host")!.focus();
    const { coordinator } = createCoordinator(root, "create", () => markup);
    coordinator.render(); await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    expect(document.activeElement).toBe(root.querySelector("#info-host"));
    root.remove();
  });
  it("coalesces event refreshes in one frame while keeping explicit renders immediate", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const callbacks: FrameRequestCallback[] = [];
    const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callbacks.push(callback);
        return callbacks.length;
      });
    const cancelAnimationFrame = vi.spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => undefined);
    const { coordinator, renderSettings } = createCoordinator(root);

    coordinator.requestRender();
    coordinator.requestRender();

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(renderSettings).not.toHaveBeenCalled();
    callbacks.shift()?.(0);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    expect(renderSettings).toHaveBeenCalledTimes(1);

    coordinator.requestRender();
    coordinator.render();
    callbacks.shift()?.(0);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(renderSettings).toHaveBeenCalledTimes(2);
    requestAnimationFrame.mockRestore();
    cancelAnimationFrame.mockRestore();
    root.remove();
  });

  it("restores an edited input and its selection after a full page render", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    root.innerHTML = `<input id="settings-test-input" name="settings-test-input" value="hello">`;
    const input = root.querySelector<HTMLInputElement>("#settings-test-input");
    if (!input) throw new Error("test input was not created");
    input.focus();
    input.setSelectionRange(1, 4, "forward");

    const { coordinator, renderOverlay } = createCoordinator(root);
    coordinator.render();
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

    const restored = root.querySelector<HTMLInputElement>("#settings-test-input");
    expect(restored).not.toBeNull();
    expect(document.activeElement).toBe(restored);
    expect(restored?.selectionStart).toBe(1);
    expect(restored?.selectionEnd).toBe(4);
    expect(restored?.selectionDirection).toBe("forward");
    expect(renderOverlay).toHaveBeenCalledTimes(1);
    expect(root.querySelector(".dialog-backdrop")).toBeNull();
  });

  it("restores volume, mute, position, and playback rate after rebuilding the detail player", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    root.innerHTML = `<div class="history-player"><video data-history-asset="asset-1" data-history-version="version-1" src="old.mp4"></video></div>`;
    const previous = root.querySelector<HTMLVideoElement>("video");
    if (!previous) throw new Error("previous video was not created");
    Object.defineProperties(previous, {
      currentTime: { configurable: true, value: 12 },
      paused: { configurable: true, value: false },
      muted: { configurable: true, writable: true, value: true },
      volume: { configurable: true, writable: true, value: 0.42 },
      playbackRate: { configurable: true, writable: true, value: 1.25 }
    });
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    const { coordinator } = createCoordinator(root, "history-detail");
    coordinator.render();
    await vi.waitFor(() => {
      expect(root.querySelector("video")).not.toBe(previous);
      expect(root.dataset.pagePresenting).toBeUndefined();
    });

    const restored = root.querySelector<HTMLVideoElement>("video");
    if (!restored) throw new Error("restored video was not created");
    Object.defineProperties(restored, {
      readyState: { configurable: true, value: 1 },
      duration: { configurable: true, value: 60 }
    });
    restored.dispatchEvent(new Event("loadedmetadata"));
    await vi.waitFor(() => expect(play).toHaveBeenCalled());

    expect(restored.volume).toBeCloseTo(0.42);
    expect(restored.muted).toBe(true);
    expect(restored.currentTime).toBeCloseTo(12);
    expect(restored.playbackRate).toBeCloseTo(1.25);
    expect(play).toHaveBeenCalled();
    document.body.replaceChildren();
  });

  it("reuses the Extend video element and keeps its locked frame across state renders", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    root.innerHTML = `<div class="video-editor"><video id="source-video" src="studio-media://draft/video?source=clip.mp4"></video></div>`;
    const previous = root.querySelector<HTMLVideoElement>("#source-video");
    if (!previous) throw new Error("previous video was not created");
    Object.defineProperties(previous, {
      currentTime: { configurable: true, writable: true, value: 4.2 },
      paused: { configurable: true, value: true },
      muted: { configurable: true, writable: true, value: true },
      volume: { configurable: true, writable: true, value: 0.42 },
      playbackRate: { configurable: true, writable: true, value: 1.25 },
      readyState: { configurable: true, value: 1 },
      duration: { configurable: true, value: 10 }
    });
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    const renderCreate = vi.fn(() => `<div class="video-editor"><video id="source-video" src="studio-media://draft/video?source=clip.mp4"></video></div>`);
    const { coordinator } = createCoordinator(root, "create", renderCreate);

    coordinator.render();
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

    const restored = root.querySelector<HTMLVideoElement>("#source-video");
    expect(restored).toBe(previous);
    expect(restored?.currentTime).toBeCloseTo(4.2);
    expect(restored?.muted).toBe(true);
    expect(restored?.volume).toBeCloseTo(0.42);
    expect(restored?.playbackRate).toBeCloseTo(1.25);
    expect(renderCreate).toHaveBeenCalledTimes(1);
    document.body.replaceChildren();
  });

  it("cleans up the old Extend video when a different source is selected", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    root.innerHTML = `<div class="video-editor"><video id="source-video" src="studio-media://draft/video?source=old.mp4"></video></div>`;
    const previous = root.querySelector<HTMLVideoElement>("#source-video");
    if (!previous) throw new Error("previous video was not created");
    Object.defineProperties(previous, {
      paused: { configurable: true, value: true },
      readyState: { configurable: true, value: 1 }
    });
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    const renderCreate = vi.fn(() => `<div class="video-editor"><video id="source-video" src="studio-media://draft/video?source=new.mp4"></video></div>`);
    const { coordinator } = createCoordinator(root, "create", renderCreate);

    coordinator.render();
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

    const restored = root.querySelector<HTMLVideoElement>("#source-video");
    expect(restored).not.toBe(previous);
    expect(previous.getAttribute("src")).toBeNull();
    document.body.replaceChildren();
  });
});
