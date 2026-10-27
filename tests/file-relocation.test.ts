import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createDefaultState } from "../src/core/defaults.js";
import { finishRelocation, planRelocation, prepareRelocation, recoverRelocations, relocationJournal, rollbackRelocation } from "../electron/services/file-relocation.js";
import { validateMediaDirectories } from "../electron/services/settings-storage-migration.js";

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
async function fixture(kind: "video" | "image" | "library" = "video") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-move-")); roots.push(root);
  const source = path.join(root, "old"), target = path.join(root, "new"), stateFile = path.join(root, "state.json");
  await fs.mkdir(source); const file = path.join(source, "precious.mp4"); await fs.writeFile(file, "precious\0bytes");
  const tx = await planRelocation(kind, source, target, [file], relocationJournal(stateFile, kind));
  return { root, source, target, file, tx, stateFile };
}
describe("recoverable real file relocation", () => {
  it("renames on the same volume without copying, retains identity and leaves no old file", async () => {
    const f = await fixture(), inode = (await fs.stat(f.file)).ino, copy = vi.spyOn(fs, "copyFile");
    await prepareRelocation(f.tx); await finishRelocation(f.tx);
    expect(copy).not.toHaveBeenCalled(); expect((await fs.stat(f.tx.entries[0].target)).ino).toBe(inode);
    await expect(fs.stat(f.file)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.readFile(f.tx.entries[0].target, "utf8")).toBe("precious\0bytes");
  });
  it("uses a verified cross-volume transfer then removes the source only after commit", async () => {
    const f = await fixture(), rename = fs.rename.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => { if (from === f.file) throw Object.assign(new Error("EXDEV"), { code: "EXDEV" }); return rename(from, to); });
    await prepareRelocation(f.tx);
    expect(await fs.readFile(f.file, "utf8")).toBe("precious\0bytes");
    await finishRelocation(f.tx);
    await expect(fs.stat(f.file)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.readFile(f.tx.entries[0].target, "utf8")).toBe("precious\0bytes");
  });
  it.each(["video", "image", "library"] as const)("recovers interrupted %s moves from the durable old locator", async kind => {
    const f = await fixture(kind), state = createDefaultState();
    state.settings.outputDirectory = f.source; state.settings.imageOutputDirectory = f.source;
    if (kind === "library") state.libraryStorage = { format: 1, directory: f.source, libraryId: "fixture", commit: "fixture" };
    await prepareRelocation(f.tx); await recoverRelocations(f.stateFile, state);
    expect(await fs.readFile(f.file, "utf8")).toBe("precious\0bytes");
    await expect(fs.stat(f.tx.entries[0].target)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(f.tx.journal)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("finishes a committed move on restart and never restores the old source", async () => {
    const f = await fixture(), state = createDefaultState(); state.settings.outputDirectory = f.target;
    await prepareRelocation(f.tx); await recoverRelocations(f.stateFile, state);
    await expect(fs.stat(f.file)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.readFile(f.tx.entries[0].target, "utf8")).toBe("precious\0bytes");
  });
  it("refuses conflicting destinations without changing either file", async () => {
    const f = await fixture(); await fs.mkdir(f.target); await fs.writeFile(f.tx.entries[0].target, "different");
    await expect(planRelocation("video", f.source, f.target, [f.file], f.tx.journal)).rejects.toThrow("校验失败");
    expect(await fs.readFile(f.file, "utf8")).toBe("precious\0bytes"); expect(await fs.readFile(f.tx.entries[0].target, "utf8")).toBe("different");
  });
  it("restores an already moved file when a later file fails", async () => {
    const f = await fixture(), second = path.join(f.source, "second.mp4"); await fs.writeFile(second, "second");
    const tx = await planRelocation("video", f.source, f.target, [f.file, second], f.tx.journal), rename = fs.rename.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => { if (from === second) throw new Error("EACCES"); return rename(from, to); });
    await expect(prepareRelocation(tx)).rejects.toThrow("EACCES");
    expect(await fs.readFile(f.file, "utf8")).toBe("precious\0bytes"); expect(await fs.readFile(second, "utf8")).toBe("second");
  });
  it("preserves a preexisting identical destination on rollback", async () => {
    const f = await fixture(); await fs.mkdir(f.target); await fs.copyFile(f.file, f.tx.entries[0].target);
    const tx = await planRelocation("video", f.source, f.target, [f.file], f.tx.journal);
    await prepareRelocation(tx); await rollbackRelocation(tx);
    expect(await fs.readFile(f.tx.entries[0].target, "utf8")).toBe("precious\0bytes");
    expect(await fs.readFile(f.file, "utf8")).toBe("precious\0bytes");
  });
  it("keeps the source and journal when destination integrity is lost before cleanup", async () => {
    const f = await fixture(), rename = fs.rename.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => { if (from === f.file) throw Object.assign(new Error("EXDEV"), { code: "EXDEV" }); return rename(from, to); });
    await prepareRelocation(f.tx); await fs.writeFile(f.tx.entries[0].target, "damaged");
    await expect(finishRelocation(f.tx)).rejects.toThrow("校验失败");
    expect(await fs.readFile(f.file, "utf8")).toBe("precious\0bytes"); expect(await fs.stat(f.tx.journal)).toBeTruthy();
  });
  it.each(["outputDirectory", "imageOutputDirectory"] as const)("confines %s to the selected ComfyUI output root", async field => {
    const f = await fixture(), settings = createDefaultState().settings; settings[field] = f.source;
    await expect(validateMediaDirectories(settings, { ...settings, [field]: path.join(f.root, "outside") }, async () => f.source)).rejects.toThrow("ComfyUI output");
    const changes = await validateMediaDirectories(settings, { ...settings, [field]: path.join(f.source, "inside") }, async () => f.source);
    expect(changes).toHaveLength(1);
  });
  it("rejects a junction that redirects an output folder outside ComfyUI", async () => {
    const f = await fixture(), outside = path.join(f.root, "outside"), link = path.join(f.source, "link"), settings = createDefaultState().settings;
    await fs.mkdir(outside); await fs.symlink(outside, link, "junction"); settings.imageOutputDirectory = f.source;
    await expect(validateMediaDirectories(settings, { ...settings, imageOutputDirectory: link }, async () => f.source)).rejects.toThrow("链接");
  });
  it("uses Videos and Images for blank automatic settings", async () => {
    const f = await fixture(), settings = createDefaultState().settings;
    const changes = await validateMediaDirectories(settings, { ...settings, outputDirectory: path.join(f.source, "Video New"), imageOutputDirectory: path.join(f.source, "Image New") }, async () => f.source);
    expect(changes.map(change => change.source)).toEqual([path.join(f.source, "Videos"), path.join(f.source, "Images")]);
  });
});
