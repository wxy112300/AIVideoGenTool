import { describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonStore, replaceStateFile } from "../electron/store.js";
import { createDefaultState } from "../src/core/defaults.js";

function fileError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

describe("Windows state file replacement", () => {
  it("retries transient EPERM rename failures", async () => {
    const rename = vi
      .fn()
      .mockRejectedValueOnce(fileError("EPERM"))
      .mockRejectedValueOnce(fileError("EBUSY"))
      .mockResolvedValueOnce(undefined);
    const copyFile = vi.fn();
    const waits: number[] = [];

    await replaceStateFile("state.tmp", "state.json", {
      attempts: 4,
      retryDelayMs: 10,
      rename,
      copyFile,
      wait: async (milliseconds) => {
        waits.push(milliseconds);
      }
    });

    expect(rename).toHaveBeenCalledTimes(3);
    expect(copyFile).not.toHaveBeenCalled();
    expect(waits).toEqual([10, 20]);
  });

  it("falls back to copying a complete temporary file when rename stays locked", async () => {
    const rename = vi.fn().mockRejectedValue(fileError("EPERM"));
    const copyFile = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(undefined);

    await replaceStateFile("state.tmp", "state.json", {
      attempts: 2,
      retryDelayMs: 0,
      rename,
      copyFile,
      remove,
      wait: async () => undefined
    });

    expect(rename).toHaveBeenCalledTimes(2);
    expect(copyFile).toHaveBeenCalledWith("state.tmp", "state.json");
    expect(remove).toHaveBeenCalledWith("state.tmp", { force: true });
  });

  it("does not hide non-locking filesystem failures", async () => {
    const rename = vi.fn().mockRejectedValue(fileError("ENOENT"));
    const copyFile = vi.fn();

    await expect(
      replaceStateFile("state.tmp", "state.json", { rename, copyFile })
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(copyFile).not.toHaveBeenCalled();
  });
});

describe("queue lock recovery", () => {
  it("persists queueRunning=false when reopening after an interrupted run", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-store-"));
    const filename = path.join(directory, "studio-state.json");
    const state = { ...createDefaultState(), queueRunning: true };
    await fs.writeFile(filename, JSON.stringify(state), "utf8");

    try {
      const store = new JsonStore(filename);
      const loaded = await store.load();
      expect(loaded.queueRunning).toBe(false);
      const persisted = JSON.parse(await fs.readFile(filename, "utf8")) as {
        queueRunning: boolean;
      };
      expect(persisted.queueRunning).toBe(false);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
