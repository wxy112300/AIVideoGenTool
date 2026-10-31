import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import { normalizeAppearance } from "../src/core/appearance.js";

const fakes = vi.hoisted(() => ({ windows: [] as any[] }));
vi.mock("electron", () => ({ BrowserWindow: class {
  destroyed = false;
  options: unknown;
  webContents = { setWindowOpenHandler: vi.fn(), on: vi.fn(), executeJavaScript: vi.fn(async () => undefined) };
  show = vi.fn(); setTitle = vi.fn(); focus = vi.fn(); restore = vi.fn();
  loadURL = vi.fn(async () => undefined); on = vi.fn();
  constructor(options: unknown) { this.options = options; fakes.windows.push(this); }
  isDestroyed() { return this.destroyed; } isMinimized() { return false; }
  destroy() { this.destroyed = true; }
} }));
import { LibraryStartupWindow } from "../electron/library-startup-window.js";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); fakes.windows.splice(0); });
const progress = { operation: "migration" as const, stage: "write" as const, locale: "zh-CN" as const, appearance: normalizeAppearance(undefined), completed: 0, total: 1000 };

describe("library startup window lifetime", () => {
  it("never opens a migration window for an existing library, even across slow restarts", async () => {
    vi.useFakeTimers();
    for (let restart = 0; restart < 2; restart++) {
      const host = new LibraryStartupWindow("unused", vi.fn());
      host.update({ ...progress, operation: "opening", stage: "loading" });
      await vi.advanceTimersByTimeAsync(60000);
      host.update({ ...progress, operation: "opening", stage: "loading", completed: 999 });
      await vi.advanceTimersByTimeAsync(60000);
      host.update({ ...progress, operation: "opening", stage: "complete", completed: 1000 });
      await vi.advanceTimersByTimeAsync(1000);
      expect(fakes.windows).toHaveLength(0);
      host.close();
    }
  });

  it("does not flash a window for a completed fast migration or create one after startup failed", async () => {
    vi.useFakeTimers();
    const fast = new LibraryStartupWindow("unused", vi.fn());
    fast.update(progress); fast.update({ ...progress, stage: "complete" });
    await vi.advanceTimersByTimeAsync(1000); expect(fakes.windows).toHaveLength(0); fast.close();
    const failed = new LibraryStartupWindow("unused", vi.fn());
    failed.update(progress); failed.close();
    await vi.advanceTimersByTimeAsync(1000); expect(fakes.windows).toHaveLength(0);
  });

  it("coalesces record events into one read-only window and drops queued work after handoff", async () => {
    vi.useFakeTimers();
    vi.spyOn(fs, "readdir").mockResolvedValue(["index-fixture.css"] as any);
    vi.spyOn(fs, "readFile").mockResolvedValue(":root{--canvas:#111;--text-1:#eee}");
    const host = new LibraryStartupWindow("assets", vi.fn());
    for (let i = 0; i < 100; i++) host.update({ ...progress, completed: i });
    await vi.advanceTimersByTimeAsync(250);
    expect(fakes.windows).toHaveLength(1);
    const window = fakes.windows[0];
    expect(window.options.webPreferences).toEqual({ sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false });
    expect(window.show).toHaveBeenCalledOnce();
    const before = window.webContents.executeJavaScript.mock.calls.length;
    for (let i = 100; i < 1000; i++) host.update({ ...progress, completed: i });
    await vi.advanceTimersByTimeAsync(100);
    expect(window.webContents.executeJavaScript.mock.calls.length).toBe(before + 1);
    expect(window.webContents.executeJavaScript.mock.calls.at(-1)[0]).toContain('"completed":999');
    host.update({ ...progress, completed: 1000 }); host.close();
    await vi.advanceTimersByTimeAsync(1000);
    expect(window.destroyed).toBe(true); expect(window.webContents.executeJavaScript.mock.calls.length).toBe(before + 1);
  });
  it("reuses the same window for user-data scan, copy, reference update and cleanup", async () => {
    vi.useFakeTimers();
    vi.spyOn(fs, "readdir").mockResolvedValue([] as any);
    const host = new LibraryStartupWindow("assets", vi.fn());
    host.update({ ...progress, scope: "user-data", stage: "scan", completed: undefined, total: undefined });
    await vi.advanceTimersByTimeAsync(250);
    expect(fakes.windows).toHaveLength(1);
    const window = fakes.windows[0];
    expect(window.show).toHaveBeenCalledOnce();
    for (const stage of ["write", "verify", "commit", "cleanup"] as const) {
      host.update({ ...progress, scope: "user-data", stage, completed: 4, total: 10 });
      await vi.advanceTimersByTimeAsync(100);
      expect(window.webContents.executeJavaScript.mock.calls.at(-1)[0]).toContain(`"stage":"${stage}"`);
      expect(window.webContents.executeJavaScript.mock.calls.at(-1)[0]).toContain("正在迁移用户资料");
    }
    expect(fakes.windows).toHaveLength(1); host.close(); expect(window.destroyed).toBe(true);
  });
});
