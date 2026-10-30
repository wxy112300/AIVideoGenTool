import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { shell } from "electron";
import { registerMediaIpc, type MediaIpcDependencies } from "../electron/media-ipc";
import type { UiLocale } from "../src/types";

vi.mock("electron", () => ({ shell: { showItemInFolder: vi.fn() }, protocol: {} }));
const fixtures: string[] = [];
afterEach(async () => { for (const fixture of fixtures.splice(0)) await fs.rm(fixture, { recursive: true, force: true }); vi.clearAllMocks(); });

function revealHandler(resolveSourcePath = vi.fn(async (_filename: string): Promise<string | null> => null), getUiLocale?: () => UiLocale) {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const logger = { info: vi.fn(), warn: vi.fn() };
  registerMediaIpc({ ipc: { handle: (channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler) }, protocol: {}, service: { resolveSourcePath }, logger, paths: { clipboardFilesDirectory: "unused" }, getUiLocale } as unknown as MediaIpcDependencies);
  return { reveal: (filename: unknown) => handlers.get("file:show-in-folder")!(undefined, filename), handlers, resolveSourcePath, logger };
}

describe("read-only file and dependency location reveal", () => {
  it("reports missing media in the newly selected language without changing IPC result shape", async () => {
    let locale: UiLocale = "en-US";
    const { handlers } = revealHandler(undefined, () => locale);
    const open = () => handlers.get("file:open-system-player")!(undefined, "missing.mp4");
    expect(await open()).toEqual({ ok: false, message: "Video file not found. It may have been moved, renamed, or deleted." });
    locale = "zh-TW";
    expect(await open()).toEqual({ ok: false, message: "找不到影片檔案，可能已被移動、重新命名或刪除。" });
    locale = "zh-CN";
    expect(await open()).toEqual({ ok: false, message: "视频文件不存在，可能已被移动、重命名或删除。" });
  });
  it("reveals an existing directory without going through History file repair", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studio-reveal-")); fixtures.push(directory);
    const { reveal, resolveSourcePath, logger } = revealHandler();
    expect(await reveal(directory)).toBe(true);
    expect(shell.showItemInFolder).toHaveBeenCalledWith(path.resolve(directory));
    expect(resolveSourcePath).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith("settings", "show-directory-succeeded", expect.any(String), { directory: path.resolve(directory) });
  });

  it("never creates a disappeared installation directory, nor opens an empty path", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "studio-reveal-")); fixtures.push(parent);
    const missing = path.join(parent, "missing-node");
    const { reveal } = revealHandler();
    expect(await reveal(missing)).toBe(false); expect(await reveal(123)).toBe(false);
    await expect(fs.stat(missing)).rejects.toMatchObject({ code: "ENOENT" });
    expect(shell.showItemInFolder).not.toHaveBeenCalled();
  });

  it("preserves History's file relocation resolution and event semantics", async () => {
    const resolved = path.resolve("relocated.mp4");
    const resolveSourcePath = vi.fn(async () => resolved);
    const { reveal, logger } = revealHandler(resolveSourcePath);
    expect(await reveal("old.mp4")).toBe(true);
    expect(resolveSourcePath).toHaveBeenCalledWith("old.mp4");
    expect(shell.showItemInFolder).toHaveBeenCalledWith(resolved);
    expect(logger.info).toHaveBeenCalledWith("history", "show-file-succeeded", expect.any(String), { filename: resolved, repairedPath: true });
  });
});
