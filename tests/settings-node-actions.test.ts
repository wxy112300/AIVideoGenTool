// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createDefaultSettings } from "../src/core/defaults";
import type { RendererContext } from "../src/renderer/contracts";
import { renderDependencyActionSplit } from "../src/renderer/pages/settings/dependency-actions";
import { renderDependencyFeedback, updateDependencyGitProgress } from "../src/renderer/pages/settings/dependency-presentation";
import { createStableLabels } from "../src/renderer/shared/ui/feedback";
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
  it("patches Git progress in place and restores waiting animation for the next stage", () => {
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    const root = document.createElement("div"); document.body.append(root);
    root.innerHTML = renderDependencyActionSplit("", { ...renderOptions, cancellation: { id: "custom-node:example" } }) + renderDependencyFeedback(settings.uiLocale, "custom-node:example", "", true);
    const button = root.querySelector<HTMLElement>("[data-install-active]")!;
    const rail = root.querySelector<HTMLElement>(".settings-install-rail")!;
    const label = button.querySelector(".node-running-label")!;
    const runningText = label.textContent;
    try {
      updateDependencyGitProgress("custom-node:example", "Receiving objects: 47% (47/100)");
      expect(button.dataset.installPercent).toBe("47");
      expect(label.textContent).toBe("47%");
      expect(rail.firstElementChild?.getAttribute("style")).toContain("47%");
      updateDependencyGitProgress("custom-node:example", "正在检查运行环境");
      expect(button.dataset.installPercent).toBe("indeterminate");
      expect(label.textContent).toBe(runningText);
      expect(root.querySelector("[data-install-active]")).toBe(button);
      expect(rail.classList.contains("determinate")).toBe(false);
    } finally { root.remove(); vi.unstubAllGlobals(); }
  });
  it("does not keep a dependency's queued width after returning to update", () => {
    const reserve = createStableLabels();
    const button = document.createElement("button");
    button.className = "node-action-main ui-stable-label";
    button.dataset.installNode = "example";
    button.style.setProperty("--ui-label-width", "180px");
    button.textContent = "更新";
    reserve(button);
    expect(button.style.getPropertyValue("--ui-label-width")).toBe("");
    expect(button.classList.contains("ui-stable-label")).toBe(false);
  });
  it.each(["settings-node-grid", "settings-lora-grid"])("mounts independent columns with retained cards and original narrow order for %s", (className) => {
    let listener = () => {};
    const media = { matches: false, addEventListener: vi.fn((_name, callback) => { listener = callback; }), removeEventListener: vi.fn() };
    vi.stubGlobal("matchMedia", vi.fn(() => media));
    const host = document.createElement("main");
    const root = document.createElement("div"); root.className = className; host.append(root);
    root.innerHTML = '<article id="a"></article><article id="b"></article><article id="c"></article><article id="d"></article>';
    const cards = Array.from(root.children);
    const { cleanup } = mount(host);
    try {
      expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 1100px)");
      expect(Array.from(root.children[0]!.children)).toEqual([cards[0], cards[2]]);
      expect(Array.from(root.children[1]!.children)).toEqual([cards[1], cards[3]]);
      media.matches = true; listener();
      expect(Array.from(root.children)).toEqual(cards);
      media.matches = false; listener();
      expect(root.children[0]!.firstElementChild).toBe(cards[0]);
    } finally { cleanup(); vi.unstubAllGlobals(); }
    expect(Array.from(root.children)).toEqual(cards);
    expect(media.removeEventListener).toHaveBeenCalled();
  });

  it("shows an indeterminate rail before the first log and collapses only completed logs", () => {
    const root = document.createElement("div");
    root.innerHTML = renderDependencyFeedback(settings.uiLocale, "custom-node:example", "", true);
    expect(root.querySelector(".settings-install-rail")).not.toBeNull();
    expect(root.querySelector("[data-dependency-install-log]")).not.toBeNull();
    root.innerHTML = renderDependencyFeedback(settings.uiLocale, "custom-node:example", "done", false);
    expect(root.querySelector(".settings-install-rail")).toBeNull();
    expect(root.querySelector("details")?.open).toBe(false);
    root.innerHTML = renderDependencyFeedback(settings.uiLocale, "strata", "download", true, false);
    expect(root.querySelector(".settings-install-rail")).toBeNull();
  });
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
    expect(root.querySelector("summary")?.hasAttribute("title")).toBe(false);
    expect(root.querySelector("[data-uninstall-node]")).toBeNull();
  });

  it("hides the entire popup on collapse, uses an existing opaque surface token and keeps labels on one line", () => {
    const css = readFileSync("src/styles/structure.css", "utf8");
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
      expect(style.textContent).toContain("background: var(--surface-3)");
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
