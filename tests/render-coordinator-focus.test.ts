// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { createRenderCoordinator, type RenderCoordinatorOptions } from "../src/renderer/render-coordinator";
import { createRendererUiState } from "../src/renderer/ui-state";

function createCoordinator(root: HTMLElement) {
  const state = createDefaultState();
  const ui = createRendererUiState();
  const noop = () => undefined;
  const renderOverlay = vi.fn();
  const options: RenderCoordinatorOptions = {
    root,
    addPageCleanup: noop,
    getPage: () => "settings",
    getState: () => state,
    getUiState: () => ui,
    t: ((key: string) => key) as RenderCoordinatorOptions["t"],
    renderPages: {
      create: () => "",
      queue: () => "",
      history: () => "",
      historyDetail: () => "",
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
});
