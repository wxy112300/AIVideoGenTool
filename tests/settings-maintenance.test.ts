// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderSettingsCacheDialog } from "../src/renderer/pages/settings/cache-dialog";
import { mountSettingsCacheController } from "../src/renderer/pages/settings/cache-controller";
import { createTranslator } from "../src/core/i18n";
import { icon, renderIcons } from "../src/renderer/shared/icons";
import { escapeHtml } from "../src/renderer/shared/dom";
import type { RendererContext } from "../src/renderer/contracts";
import type { AppCacheProgress } from "../src/types";

const snapshot = { currentSessionBytes: 10, temporaryBytes: 20, temporaryDirectoryCount: 2, totalBytes: 30, scannedAt: "now" };
const view = { open: true, snapshot, loading: false, clearing: false, error: "", running: false, result: null };
const options = { t: createTranslator("zh-CN").t, icon, escapeHtml, formatBytes: (value: number) => `${value} B` };
afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); });

describe("settings maintenance dialog", () => {
  it.each(["zh-CN", "zh-TW", "en-US"] as const)("shows actual scope totals without unsupported selectors (%s)", locale => {
    const root = document.createElement("div"); root.innerHTML = renderSettingsCacheDialog(view, { ...options, t: createTranslator(locale).t });
    renderIcons(root);
    expect(root.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(root.querySelector("#confirm-clear-app-cache")?.textContent).toContain("30 B");
    expect(root.querySelectorAll("i[data-lucide]")).toHaveLength(0);
  });
  it("blocks confirmation when a task is running and disables closing while clearing", () => {
    const root = document.createElement("div");
    root.innerHTML = renderSettingsCacheDialog({ ...view, running: true }, options);
    expect(root.querySelector<HTMLButtonElement>("#confirm-clear-app-cache")!.disabled).toBe(true);
    expect(root.querySelector('[role="status"]')?.textContent).toContain("当前有任务运行");
    root.innerHTML = renderSettingsCacheDialog({ ...view, clearing: true }, options);
    expect(root.querySelector<HTMLButtonElement>("#settings-cache-close")!.disabled).toBe(true);
    expect(root.querySelector<HTMLElement>("#app-cache-progress")!.hidden).toBe(false);
  });
  it("patches progress in the separate modal root without resetting focus; ignores late progress on the result", () => {
    const root = document.createElement("main"), modal = document.createElement("div"); document.body.append(root, modal);
    modal.innerHTML = renderSettingsCacheDialog({ ...view, clearing: true }, options);
    let progress!: (event: AppCacheProgress) => void;
    const cleanup = mountSettingsCacheController({ root, t: options.t, events: { onAppCacheProgress: (callback: typeof progress) => { progress = callback; return () => undefined; } } } as unknown as RendererContext, { loadAppCache: vi.fn(), clearAppCache: vi.fn() });
    try {
      const dialog = modal.querySelector<HTMLElement>('[role="dialog"]')!; dialog.focus();
      const event = { phase: "clearing-temporary" as const, current: 1, total: 4, processedBytes: 5, totalBytes: 20, startedAt: new Date().toISOString() };
      progress(event);
      expect(modal.querySelector("[role=progressbar]")?.getAttribute("aria-valuenow")).toBe("25");
      expect(document.activeElement).toBe(dialog);
      modal.innerHTML = renderSettingsCacheDialog({ ...view, result: { before: snapshot, after: snapshot, clearedBytes: 5, currentSessionCleared: true, skippedTemporaryDirectories: 1, errors: [] } }, options);
      progress({ ...event, phase: "completed", current: 4 });
      expect(modal.querySelector<HTMLElement>("#app-cache-progress")!.hidden).toBe(true);
      expect(modal.querySelector(".settings-maintenance-result")?.textContent).toContain("1 项");
    } finally { cleanup(); }
  });
});
