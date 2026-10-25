// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { CustomNodeInstallQueue } from "../src/renderer/pages/settings/node-install-queue";
import { mountSettingsNodeDependencyController, type SettingsNodeDependencyControllerOptions } from "../src/renderer/pages/settings/node-dependency-controller";
import type { RendererContext } from "../src/renderer/contracts";
import { icon, renderIcons } from "../src/renderer/shared/icons";

describe("dependency queue controls", () => {
  it("expands advanced runtime fields locally and keeps edited values on collapse", () => {
    const root = document.createElement("main"); document.body.append(root);
    root.innerHTML = '<button data-settings-disclosure="advanced" aria-expanded="false">Advanced</button><div id="advanced" hidden><input value="43127"></div>';
    const cleanup = mountSettingsNodeDependencyController({ root } as unknown as RendererContext, {} as SettingsNodeDependencyControllerOptions);
    try {
      const button = root.querySelector("button")!, content = root.querySelector<HTMLElement>("#advanced")!, input = root.querySelector("input")!;
      button.click(); expect(content.hidden).toBe(false); expect(button.getAttribute("aria-expanded")).toBe("true");
      input.value = "43130"; button.click(); expect(content.hidden).toBe(true);
      button.click(); expect(input.value).toBe("43130"); expect(root.querySelector("input")).toBe(input);
    } finally { cleanup(); root.remove(); }
  });
  it("renders the waiting and repair icons used only by installation states", () => {
    const root = document.createElement("div");
    root.innerHTML = icon("clock-3") + icon("wrench");
    renderIcons(root);
    expect(root.querySelectorAll("i[data-lucide]")).toHaveLength(0);
    expect(root.querySelectorAll("svg")).toHaveLength(2);
  });
  it("routes the waiting-only button to atomic removal and leaves the running install alone", async () => {
    const state = createDefaultState(), logs: Record<string, string> = {};
    let finish!: (value: { ok: boolean; cancelled: boolean; message: string }) => void;
    const install = vi.fn(() => new Promise<{ ok: boolean; cancelled: boolean; message: string }>(resolve => { finish = resolve; }));
    const cancelInstall = vi.fn();
    const queue = new CustomNodeInstallQueue({
      install, cancelInstall, restart: vi.fn(), scan: vi.fn(async () => null), nodeName: id => id,
      getLog: id => logs[id] || "", setLog: (id, log) => { logs[id] = log; }, notify: vi.fn(), onSnapshot: vi.fn(),
      messages: { queued: id => id, processing: "working", restartLog: s => s, installFailed: s => s,
        restartFailed: s => s, manualRestartRequired: s => s, readyCheckFailed: s => s, completed: () => "done" }
    });
    queue.enqueue("active", state.settings); queue.enqueue("waiting", state.settings);
    const root = document.createElement("main");
    root.innerHTML = '<button id="cancel-waiting-node-installs">Cancel waiting</button>';
    const cancelWaitingCustomNodes = vi.fn(() => queue.cancelWaiting());
    const cleanup = mountSettingsNodeDependencyController({ root } as unknown as RendererContext, {
      cancelWaitingCustomNodes
    } as unknown as SettingsNodeDependencyControllerOptions);
    try {
      root.querySelector<HTMLButtonElement>("button")!.click();
      expect(cancelWaitingCustomNodes).toHaveReturnedWith(1);
      expect(queue.snapshot().activeNodeId).toBe("active");
      expect(queue.snapshot().queuedNodeIds).toEqual([]);
      expect(cancelInstall).not.toHaveBeenCalled();
    } finally { cleanup(); finish({ ok: false, cancelled: true, message: "test cleanup" }); await queue.waitForIdle(); }
    expect(install).toHaveBeenCalledTimes(1);
  });

  it("closes an action menu on Escape and returns focus to its trigger", () => {
    const root = document.createElement("main");
    document.body.append(root);
    root.innerHTML = '<details class="node-action-menu" open><summary>Actions</summary><button>Locate</button></details>';
    const cleanup = mountSettingsNodeDependencyController({ root } as unknown as RendererContext, {} as SettingsNodeDependencyControllerOptions);
    try {
      root.querySelector<HTMLButtonElement>("button")!.focus();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      expect(root.querySelector("details")!.open).toBe(false);
      expect(document.activeElement).toBe(root.querySelector("summary"));
    } finally { cleanup(); root.remove(); }
  });
});
