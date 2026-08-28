// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { createRenderCoordinator, type RenderCoordinatorOptions } from "../src/renderer/render-coordinator";
import { createRendererUiState } from "../src/renderer/ui-state";

function createCoordinator(root: HTMLElement, currentPage: "settings" | "history-detail" = "settings") {
  const state = createDefaultState();
  const ui = createRendererUiState();
  const noop = () => undefined;
  const renderOverlay = vi.fn();
  const options: RenderCoordinatorOptions = {
    root,
    addPageCleanup: noop,
    getPage: () => currentPage,
    getState: () => state,
    getUiState: () => ui,
    getPerformanceMetrics: () => null,
    t: ((key: string) => key) as RenderCoordinatorOptions["t"],
    renderPages: {
      create: () => "",
      queue: () => "",
      history: () => "",
      historyDetail: () => `<div class="history-player"><video data-history-asset="asset-1" data-history-version="version-1" src="next.mp4"></video></div>`,
      imageHistoryDetail: () => "",
      settings: () => `<input id="settings-test-input" name="settings-test-input" value="hello">`
    },
    beforeRenderHistory: noop,
    closeAppLogContextMenu: noop,
    bindShell: noop,
    renderOverlay,
    beforeRenderQueue: noop,
    bindCreate: noop,
    bindQueue: noop,
    bindHistory: noop,
    bindSettings: noop,
    bindHistoryViewportControls: () => noop,
    restoreQueueScrollPosition: noop,
    restoreHistoryScrollPosition: noop,
    ensurePromptPacks: async () => undefined,
    syncAppLogPolling: noop,
    icon: () => "",
    escapeHtml: (value: unknown) => String(value)
  };
  return { coordinator: createRenderCoordinator(options), renderOverlay };
}

describe("render coordinator focus preservation", () => {
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
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

    const restored = root.querySelector<HTMLVideoElement>("video");
    if (!restored) throw new Error("restored video was not created");
    Object.defineProperties(restored, {
      readyState: { configurable: true, value: 1 },
      duration: { configurable: true, value: 60 }
    });
    restored.dispatchEvent(new Event("loadedmetadata"));
    await Promise.resolve();

    expect(restored.volume).toBeCloseTo(0.42);
    expect(restored.muted).toBe(true);
    expect(restored.currentTime).toBeCloseTo(12);
    expect(restored.playbackRate).toBeCloseTo(1.25);
    expect(play).toHaveBeenCalled();
    document.body.replaceChildren();
  });
});
