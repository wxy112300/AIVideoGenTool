import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonStore } from "../electron/store.js";
import { StateFileSafety, stateDigest } from "../electron/services/state-file-safety.js";
import { APP_SCHEMA_VERSION, createDefaultState } from "../src/core/defaults.js";

const directories: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const directory of directories.splice(0)) await fs.rm(directory, { recursive: true, force: true }); });
async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studio-safe-state-"));
  directories.push(directory);
  const filename = path.join(directory, "studio-state.json");
  return { directory, filename, safety: new StateFileSafety(filename) };
}
const errno = (code: string) => Object.assign(new Error(code), { code });

describe("historical state protection", () => {
  it("initializes only a genuinely new profile and backs it up", async () => {
    const { filename } = await fixture();
    const loaded = await new JsonStore(filename).load();
    expect(loaded.history).toEqual([]);
    expect(await fs.readdir(`${filename}.backups`)).toHaveLength(1);
  });

  it.each(["{truncated", "null", "{}", '{"settings":{},"draft":{},"history":{}}'])("preserves unreadable state without a backup (%s)", async raw => {
    const { filename } = await fixture();
    await fs.writeFile(filename, raw);
    const store = new JsonStore(filename);
    await expect(store.load()).rejects.toThrow("not been replaced");
    await expect(store.flush()).rejects.toThrow("recovery is required");
    await expect(store.update(state => { state.history = []; })).rejects.toThrow("recovery is required");
    expect(await fs.readFile(filename, "utf8")).toBe(raw);
  });

  it("restores the newest verified backup, preserves corrupt bytes and logs the source", async () => {
    const { directory, filename, safety } = await fixture();
    const original = createDefaultState();
    original.settings.outputDirectory = "历史输出/包含空格";
    const raw = JSON.stringify({ ...original, futureExtension: { preserved: [1, 2, 3] } });
    await safety.backup(raw);
    await fs.writeFile(filename, "partial write");
    const loaded = await new JsonStore(filename).load();
    expect(loaded.settings.outputDirectory).toBe(original.settings.outputDirectory);
    expect(loaded).toHaveProperty("futureExtension.preserved", [1, 2, 3]);
    const evidence = (await fs.readdir(directory)).find(name => name.includes(".corrupt-"))!;
    expect(await fs.readFile(path.join(directory, evidence), "utf8")).toBe("partial write");
    expect(await fs.readFile(`${filename}.recovery.jsonl`, "utf8")).toContain(stateDigest(raw));
  });

  it("recovers a missing primary rather than initializing an empty library", async () => {
    const { filename, safety } = await fixture();
    const state = createDefaultState(); state.settings.outputDirectory = "Retained";
    await safety.backup(JSON.stringify(state));
    expect((await new JsonStore(filename).load()).settings.outputDirectory).toBe("Retained");
  });

  it("never treats an invalid backup directory and missing primary as a new profile", async () => {
    const { filename, safety } = await fixture();
    await fs.mkdir(safety.directory);
    await fs.writeFile(path.join(safety.directory, `${"a".repeat(64)}.json`), "{}");
    await expect(new JsonStore(filename).load()).rejects.toThrow("no verified backup");
    await expect(fs.stat(filename)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not initialize a missing primary when migration evidence remains", async () => {
    const { filename } = await fixture();
    await fs.writeFile(`${filename}.library-migration.json`, '{"phase":"switched"}');
    await expect(new JsonStore(filename).load()).rejects.toThrow("no verified backup");
    await expect(fs.stat(filename)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects syntactically valid state with lost history instead of persisting an empty collection", async () => {
    const { filename } = await fixture(), state = createDefaultState();
    const raw = JSON.stringify({ ...state, history: undefined });
    await fs.writeFile(filename, raw);
    await expect(new JsonStore(filename).load()).rejects.toThrow("no verified backup");
    expect(await fs.readFile(filename, "utf8")).toBe(raw);
  });

  it("does not fall back to an older backup for a newer application's schema", async () => {
    const { filename, safety } = await fixture();
    await safety.backup(JSON.stringify(createDefaultState()));
    const raw = JSON.stringify({ ...createDefaultState(), schemaVersion: APP_SCHEMA_VERSION + 1 });
    await fs.writeFile(filename, raw);
    await expect(new JsonStore(filename).load()).rejects.toThrow("newer application");
    expect(await fs.readFile(filename, "utf8")).toBe(raw);
  });

  it("does not hide read permission errors by restoring or writing defaults", async () => {
    const { filename, safety } = await fixture();
    const raw = JSON.stringify(createDefaultState());
    await fs.writeFile(filename, raw); await safety.backup(raw);
    const read = fs.readFile.bind(fs);
    vi.spyOn(fs, "readFile").mockImplementation((async (...args: Parameters<typeof fs.readFile>) => {
      if (args[0] === filename) throw errno("EACCES");
      return read(...args);
    }) as typeof fs.readFile);
    await expect(new JsonStore(filename).load()).rejects.toThrow("EACCES");
    vi.restoreAllMocks();
    expect(await fs.readFile(filename, "utf8")).toBe(raw);
  });

  it("rolls back a failed save in memory and preserves the primary, then accepts a retry", async () => {
    const { filename } = await fixture();
    const store = new JsonStore(filename); await store.load();
    const before = store.get(), raw = await fs.readFile(filename, "utf8");
    const write = fs.open.bind(fs);
    vi.spyOn(fs, "open").mockImplementation((async (...args: Parameters<typeof fs.open>) => {
      if (String(args[0]).endsWith(".tmp")) throw errno("ENOSPC");
      return write(...args);
    }) as typeof fs.open);
    await expect(store.update(state => { state.settings.outputDirectory = "Unsaved"; })).rejects.toMatchObject({ code: "ENOSPC" });
    expect(store.get()).toEqual(before);
    expect(await fs.readFile(filename, "utf8")).toBe(raw);
    vi.restoreAllMocks();
    await store.update(state => { state.settings.outputDirectory = "Saved"; });
    expect((await new JsonStore(filename).load()).settings.outputDirectory).toBe("Saved");
  });

  it("does not swallow migration persistence failures and reinitialize the history", async () => {
    const { filename, safety } = await fixture();
    const raw = JSON.stringify({ ...createDefaultState(), schemaVersion: 2 });
    await fs.writeFile(filename, raw); await safety.backup(raw);
    const rename = fs.rename.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (to === filename) throw errno("ENOSPC");
      return rename(from, to);
    });
    await expect(new JsonStore(filename).load()).rejects.toThrow("ENOSPC");
    expect(await fs.readFile(filename, "utf8")).toBe(raw);
  });

  it("serializes overlapping mutations without persisting rejected changes", async () => {
    const { filename } = await fixture();
    const store = new JsonStore(filename); await store.load();
    const outcomes = await Promise.allSettled([
      store.update(state => { state.settings.outputDirectory = "Rejected"; throw new Error("abort"); }),
      store.update(state => { state.settings.imageOutputDirectory = "Accepted"; })
    ]);
    expect(outcomes.map(item => item.status)).toEqual(["rejected", "fulfilled"]);
    const loaded = await new JsonStore(filename).load();
    expect(loaded.settings.outputDirectory).not.toBe("Rejected");
    expect(loaded.settings.imageOutputDirectory).toBe("Accepted");
  });

  it("rejects a stale writer instead of overwriting external changes", async () => {
    const { filename } = await fixture();
    const first = new JsonStore(filename); await first.load();
    const second = new JsonStore(filename); await second.load();
    await first.update(state => { state.settings.outputDirectory = "New authoritative edit"; });
    await expect(second.update(state => { state.settings.outputDirectory = "Stale edit"; })).rejects.toThrow("outside this writer");
    expect((await new JsonStore(filename).load()).settings.outputDirectory).toBe("New authoritative edit");
  });

  it("prunes only verified managed generations and keeps daily recovery points", async () => {
    const { safety } = await fixture();
    await fs.mkdir(safety.directory);
    const corrupt = path.join(safety.directory, `${"b".repeat(64)}.json`);
    await fs.writeFile(corrupt, "bad");
    let activeHash = "";
    for (let index = 0; index < 25; index++) {
      const raw = JSON.stringify({ ...createDefaultState(), serial: index });
      const sha256 = stateDigest(raw);
      if (!index) activeHash = sha256;
      await fs.writeFile(path.join(safety.directory, `${sha256}.json`), JSON.stringify({ format: 1, savedAt: `2026-10-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`, sha256, raw }));
    }
    await safety.prune(activeHash);
    expect(await fs.readdir(safety.directory)).toHaveLength(16);
    expect(await fs.stat(path.join(safety.directory, `${activeHash}.json`))).toBeTruthy();
    await safety.prune();
    expect(await fs.readdir(safety.directory)).toHaveLength(15);
    expect(await fs.readFile(corrupt, "utf8")).toBe("bad");
  });
});
