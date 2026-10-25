// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createDefaultSettings } from "../src/core/defaults";
import type { RendererContext } from "../src/renderer/contracts";
import { renderDependencyActionSplit } from "../src/renderer/pages/settings/dependency-actions";
import { mountSettingsNodeDependencyController } from "../src/renderer/pages/settings/node-dependency-controller";
import type { ConnectionResult } from "../src/types";

const settings = createDefaultSettings();
const options = { locale: settings.uiLocale, escapeHtml: (text: string) => text, icon: () => "", location: "", locationAvailable: false };
describe("Settings install cancellation", () => {
  it.each([[false, false, "取消安装"], [true, false, "移出队列"], [false, true, "正在取消…"]])("uses one main button and no menu when uninstalled (queued=%s pending=%s)", (queued, pending, label) => {
    const root = document.createElement("main");
    root.innerHTML = renderDependencyActionSplit('<button data-install-node="example">Install</button>', { ...options, cancellation: { id: "custom-node:example", queued: Boolean(queued), pending: Boolean(pending) } });
    const button = root.querySelector<HTMLButtonElement>("[data-cancel-dependency-install]")!;
    expect(button.getAttribute("aria-label")).toBe(label); expect(button.disabled).toBe(Boolean(pending));
    expect(button.querySelector(".node-cancel-label")?.textContent ?? button.textContent).toBe(label);
    expect(Boolean(button.querySelector(".settings-progress-ring"))).toBe(!queued);
    expect(root.querySelector("[data-install-node], summary")).toBeNull();
  });

  it.each(["custom-node:example", "python-runtime:strata", "python-runtime:llama-cpp-python", "attention-acceleration"])("actual cancel click targets %s even when generation is running, with no duplicate click", async (id) => {
    const root = document.createElement("main"); document.body.append(root);
    root.innerHTML = renderDependencyActionSplit("", { ...options, cancellation: { id } });
    let finish!: (result: ConnectionResult) => void;
    const cancel = vi.fn(() => new Promise<ConnectionResult>((done) => { finish = done; })), setCancelling = vi.fn(), notify = vi.fn();
    const cleanup = mountSettingsNodeDependencyController({ root, getState: () => ({ queue: [{ status: "running" }] }), getRoute: () => ({ page: "settings" }), requestRender: vi.fn(), application: { cancelDependencyInstall: cancel }, notify } as unknown as RendererContext, {
      formSettings: () => settings, getEnvironmentScan: () => null, refreshEnvironment: vi.fn(async () => null), setSettingsDraft: vi.fn(), enqueueCustomNodeInstall: vi.fn(), requestCustomNodeUninstall: vi.fn(),
      setLlamaCppPythonInstalling: vi.fn(), getLlamaCppPythonLog: () => "", setLlamaCppPythonLog: vi.fn(), requestLlamaCppPythonUninstall: vi.fn(),
      cancelCustomNodeInstall: cancel, setDependencyInstallCancelling: setCancelling
    });
    try {
      const button = root.querySelector<HTMLButtonElement>("button")!; button.click(); button.click();
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(cancel).toHaveBeenCalledWith(id.startsWith("custom-node:") ? "example" : id);
      expect(setCancelling).toHaveBeenCalledWith(id, true);
      expect(button.disabled).toBe(true);
      finish({ ok: true, cancelled: true, message: "cancelled" });
      await vi.waitFor(() => expect(setCancelling).toHaveBeenLastCalledWith(id, false));
      expect(notify).toHaveBeenCalledWith("cancelled", expect.objectContaining({ kind: "info" }));
    } finally { cleanup(); root.remove(); }
  });
});
