// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createDefaultSettings } from "../src/core/defaults";
import type { RendererContext } from "../src/renderer/contracts";
import { renderDependencyActionSplit } from "../src/renderer/pages/settings/dependency-actions";
import { mountSettingsNodeDependencyController } from "../src/renderer/pages/settings/node-dependency-controller";
import { renderStrataPreparationPanel } from "../src/renderer/pages/settings/strata-preparation";
import type { StrataPreparationStatus } from "../src/types";

const settings = createDefaultSettings();
const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const renderOptions = { locale: settings.uiLocale, escapeHtml, icon: (name: string) => `<i data-lucide="${name}"></i>`, location: 'D:\\Comfy UI\\custom_nodes\\A & "B"', locationAvailable: true };

function mount(root: HTMLElement, showItemInFolder = vi.fn(async () => true)) {
  const notify = vi.fn(), enqueue = vi.fn(), uninstall = vi.fn(), openExternal = vi.fn(async () => true);
  const cleanup = mountSettingsNodeDependencyController({
    root, getState: () => ({ queue: [{ status: "running" }] }), getRoute: () => ({ page: "settings" }),
    requestRender: vi.fn(), hostCapabilities: { showItemInFolder, openExternal }, notify
  } as unknown as RendererContext, {
    formSettings: () => settings, getEnvironmentScan: () => null, refreshEnvironment: vi.fn(async () => null),
    setSettingsDraft: vi.fn(), enqueueCustomNodeInstall: enqueue, requestCustomNodeUninstall: uninstall,
    setLlamaCppPythonInstalling: vi.fn(), getLlamaCppPythonLog: () => "", setLlamaCppPythonLog: vi.fn(), requestLlamaCppPythonUninstall: vi.fn()
  });
  return { cleanup, notify, enqueue, uninstall, showItemInFolder, openExternal };
}

describe("dependency action menus", () => {
  it.each([false, true])("puts Strata uninstall inside the existing menu only for app-owned software (owned=%s)", (owned) => {
    const root = document.createElement("main");
    const status = { configuredInstallDirectory: "", installDirectory: "D:\\managed-strata", sourcePresent: true, enginePresent: true, managedInstalled: true, managedUninstallable: owned } as StrataPreparationStatus;
    root.innerHTML = renderStrataPreparationPanel(settings,status,escapeHtml);
    const uninstall = root.querySelector<HTMLButtonElement>("[data-uninstall-strata]");
    expect(Boolean(uninstall)).toBe(owned);
    if(owned) {
      expect(uninstall!.closest(".node-action-menu-popover")).not.toBeNull();
      expect(uninstall!.textContent).toBe("卸载");
      root.innerHTML = renderStrataPreparationPanel(settings,status,escapeHtml,{installing:true});
      expect(root.querySelector<HTMLButtonElement>("[data-uninstall-strata]")!.disabled).toBe(true);
    }
    root.innerHTML = renderStrataPreparationPanel(settings,undefined,escapeHtml);
    expect(root.querySelector("[data-uninstall-strata], .node-action-menu")).toBeNull();
  });
  it.each([true, false])("escapes actual installed locations and omits menus for uninstalled dependencies (available=%s)", (available) => {
    const root = document.createElement("main");
    root.innerHTML = renderDependencyActionSplit('<button data-install-node="example">Install</button>', { ...renderOptions, locationAvailable: available });
    if (!available) {
      expect(root.querySelector("[data-install-node]")).not.toBeNull();
      expect(root.querySelector(".node-action-menu")).toBeNull();
      expect(root.querySelector("[data-open-node-location]")).toBeNull();
      return;
    }
    const button = root.querySelector<HTMLButtonElement>("[data-open-node-location]")!;
    expect(button.dataset.openNodeLocation).toBe(renderOptions.location);
    expect(button.disabled).toBe(!available);
    expect(button.textContent).toBe("打开位置");
    expect(button.classList.contains("node-action-menu-item")).toBe(true);
    expect(button.classList.contains("secondary")).toBe(false);
    expect(button.parentElement?.classList.contains("node-action-menu-popover")).toBe(true);
    expect(root.querySelector("summary")?.getAttribute("aria-label")).toBe("更多节点操作");
    expect(root.querySelector("[data-uninstall-node]")).toBeNull();
  });

  it("hides the entire popup on collapse, uses an existing opaque surface token and keeps labels on one line", () => {
    const css = readFileSync("src/styles/06-settings-layout.css", "utf8");
    const style = document.createElement("style");
    style.textContent = [...css.matchAll(/^\.node-action-menu[^\n]+/gm)].map(([rule]) => rule).join("\n");
    document.head.append(style);
    const root = document.createElement("main"); document.body.append(root);
    root.innerHTML = renderDependencyActionSplit("<button>Install</button>", renderOptions);
    try {
      const menu = root.querySelector("details")!, popup = root.querySelector<HTMLElement>(".node-action-menu-popover")!, button = popup.querySelector("button")!;
      expect(menu.open).toBe(false);
      expect(getComputedStyle(popup).display).toBe("none");
      menu.open = true;
      expect(getComputedStyle(popup).display).toBe("grid");
      expect(getComputedStyle(button).whiteSpace).toBe("nowrap");
      expect(getComputedStyle(popup).width).toBe("max-content");
      expect(style.textContent).toContain("background: var(--ux-surface-raised)");
      expect(style.textContent).not.toContain("var(--raised)");
      menu.open = false;
      expect(getComputedStyle(popup).display).toBe("none");
    } finally { root.remove(); style.remove(); }
  });

  it("omits an empty location instead of showing an unusable menu", () => {
    const root = document.createElement("main");
    root.innerHTML = renderDependencyActionSplit("<button>Install</button>", { ...renderOptions, location: " ", locationAvailable: true });
    expect(root.querySelector("[data-open-node-location], .node-action-menu")).toBeNull();
  });

  it("preserves an installed dependency's uninstall menu when its location is unknown", () => {
    const root = document.createElement("main");
    root.innerHTML = renderDependencyActionSplit("<button>Reinstall</button>", { ...renderOptions, location: "", locationAvailable: false, menuActions: '<button data-uninstall-node="example">Uninstall</button>' });
    expect(root.querySelector(".node-action-menu [data-uninstall-node]")).not.toBeNull();
    expect(root.querySelector("[data-open-node-location]")).toBeNull();
  });

  it("keeps manual-only source actions and closes their location menu without installing", async () => {
    const root = document.createElement("main");
    root.innerHTML = renderDependencyActionSplit('<button data-open-node-source="https://example.invalid/node">Source</button>', renderOptions);
    const controls = mount(root);
    try {
      const menu = root.querySelector("details")!; menu.open = true;
      root.querySelector<HTMLButtonElement>("[data-open-node-source]")!.click();
      await vi.waitFor(() => expect(controls.openExternal).toHaveBeenCalledWith("https://example.invalid/node"));
      expect(menu.open).toBe(false); expect(controls.enqueue).not.toHaveBeenCalled();
    } finally { controls.cleanup(); }
  });

  it.each(["success", "missing", "exception"] as const)("closes the menu and delegates the clicked path without changing installations or blocking on running tasks (%s)", async (result) => {
    const root = document.createElement("main"); document.body.append(root);
    root.innerHTML = renderDependencyActionSplit("<button>Install</button>", renderOptions);
    const reveal = vi.fn(async () => { if (result === "exception") throw new Error("Explorer unavailable"); return result === "success"; });
    const controls = mount(root, reveal);
    try {
      const menu = root.querySelector("details")!; menu.open = true;
      root.querySelector<HTMLButtonElement>("[data-open-node-location]")!.click();
      await vi.waitFor(() => expect(reveal).toHaveBeenCalledWith(renderOptions.location));
      expect(menu.open).toBe(false);
      if (result === "success") expect(controls.notify).not.toHaveBeenCalled();
      else await vi.waitFor(() => expect(controls.notify).toHaveBeenCalledWith(expect.stringContaining("请重新扫描"), { kind: "error", renderPage: false }));
      expect(controls.enqueue).not.toHaveBeenCalled(); expect(controls.uninstall).not.toHaveBeenCalled();
    } finally { controls.cleanup(); root.remove(); }
  });

  it("keeps disabled actions inert, only one menu open, and closes on outside clicks; cleans up listeners", () => {
    const root = document.createElement("main"); document.body.append(root);
    root.innerHTML = renderDependencyActionSplit("<button>Reinstall</button>", renderOptions) + renderDependencyActionSplit("<button>Update</button>", renderOptions);
    root.querySelector<HTMLButtonElement>("[data-open-node-location]")!.disabled = true;
    const controls = mount(root);
    try {
      const [first, second] = [...root.querySelectorAll("details")];
      first.open = true; first.dispatchEvent(new Event("toggle"));
      root.querySelector<HTMLButtonElement>("[data-open-node-location]")!.click();
      expect(controls.showItemInFolder).not.toHaveBeenCalled();
      second.open = true; second.dispatchEvent(new Event("toggle"));
      expect(first.open).toBe(false); expect(second.open).toBe(true);
      document.body.click(); expect(second.open).toBe(false);
      controls.cleanup(); second.open = true; document.body.click(); expect(second.open).toBe(true);
    } finally { controls.cleanup(); root.remove(); }
  });

  it("uses the same split button for Strata, reveals source/engine evidence but not a stale or speculative path", () => {
    const configured = { ...settings, strataInstallDirectory: "D:\\Strata" };
    const status = { configuredInstallDirectory: configured.strataInstallDirectory, installDirectory: configured.strataInstallDirectory, sourcePresent: true, enginePresent: false } as StrataPreparationStatus;
    const root = document.createElement("main");
    root.innerHTML = renderStrataPreparationPanel(configured, status, escapeHtml, { icon: renderOptions.icon });
    expect(root.querySelector(".node-action-split #install-strata.node-action-main")).not.toBeNull();
    expect(root.querySelector<HTMLButtonElement>("[data-open-node-location]")!.disabled).toBe(false);
    expect(root.querySelector<HTMLButtonElement>("[data-open-node-location]")!.dataset.openNodeLocation).toBe("D:\\Strata");
    expect(root.querySelector("[data-uninstall-node]")).toBeNull();
    for (const scan of [undefined, { ...status, configuredInstallDirectory: "D:\\Old" }, { ...status, sourcePresent: false }]) {
      root.innerHTML = renderStrataPreparationPanel(configured, scan, escapeHtml);
      expect(root.querySelector("[data-open-node-location], .node-action-menu")).toBeNull();
    }
  });
});
