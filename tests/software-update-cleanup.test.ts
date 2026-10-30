import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanupManifestSoftwareBackups, preserveSoftwareUserData, removeSoftwareArtifact } from "../electron/services/software-update-cleanup";
import { cleanupAgentSoftwareCopies } from "../electron/services/strata-agent-software";
import { createNativeTranslator } from "../electron/ui-translator";

const roots: string[] = [];
async function fixture() { const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-software-cleanup-")); roots.push(root); return root; }
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
describe("software update disk ownership", () => {
  it.each([
    ["en-US", "Cleanup target is outside the installation directory", "The update package conflicts with local data of the same name.", "Software cleanup did not finish:"],
    ["zh-TW", "清理目標超出安裝目錄", "更新套件與本機資料同名", "軟體清理未完成："]
  ] as const)("preserves ownership and raw errors with %s cleanup messages", async (locale, outsideReason, collision, failed) => {
    const root = await fixture(), outside = await fixture();
    const source = path.join(root, "使用者-old"), target = path.join(root, "new");
    await fs.mkdir(source); await fs.mkdir(target);
    const name = "settings.json";
    await fs.writeFile(path.join(source, name), "user settings");
    await fs.writeFile(path.join(target, name), "package settings");
    const t = createNativeTranslator(locale).t;
    await expect(preserveSoftwareUserData(source, target, [], undefined, [], t)).rejects.toThrow(collision);
    expect(await fs.readFile(path.join(source, name), "utf8")).toBe("user settings");
    expect(await fs.readFile(path.join(target, name), "utf8")).toBe("package settings");
    const messages: string[] = [];
    expect(await removeSoftwareArtifact(root, outside, message => messages.push(message), undefined, t)).toBe(false);
    expect(messages.at(-1)).toContain(outsideReason);
    const remove = vi.fn(async () => { throw new Error("EBUSY: 外部原文"); });
    expect(await removeSoftwareArtifact(root, source, message => messages.push(message), remove, t)).toBe(false);
    expect(messages.at(-1)).toContain(failed);
    expect(messages.at(-1)).toContain("EBUSY: 外部原文");
    expect(await fs.readFile(path.join(source, name), "utf8")).toBe("user settings");
    expect((await fs.stat(outside)).isDirectory()).toBe(true);
  });

  it("runs an ASAR-safe remover only after validating the exact contained directory", async () => {
    const root = await fixture(), outside = await fixture(), old = path.join(root, "old");
    await fs.mkdir(old);
    const removeDirectory = vi.fn(async (directory: string) => { await fs.rm(directory, { recursive: true }); });
    const log = () => {};
    expect(await removeSoftwareArtifact(root, root, log, removeDirectory)).toBe(false);
    expect(await removeSoftwareArtifact(root, outside, log, removeDirectory)).toBe(false);
    const link = path.join(root, "redirect"); await fs.symlink(outside, link, "junction");
    expect(await removeSoftwareArtifact(root, link, log, removeDirectory)).toBe(false);
    expect(removeDirectory).not.toHaveBeenCalled();
    expect(await removeSoftwareArtifact(root, old, log, removeDirectory)).toBe(true);
    expect(removeDirectory).toHaveBeenCalledExactlyOnceWith(old);
    expect(await fs.stat(outside)).toBeTruthy();
  });
  it("collects only identified historical runtime copies and preserves unowned files", async () => {
    const root = await fixture(), backupRoot = path.join(root, "backups"), old = path.join(backupRoot, "123-old"), current = path.join(root, "current");
    await fs.mkdir(old, { recursive: true }); await fs.mkdir(current);
    await fs.writeFile(path.join(old, "manifest.json"), JSON.stringify({ owner: "fixture", ownedFiles: ["runtime.dll"] }));
    await fs.writeFile(path.join(old, "runtime.dll"), "old binary"); await fs.writeFile(path.join(old, "notes.txt"), "user notes");
    const unknown = path.join(backupRoot, "456-unknown"); await fs.mkdir(unknown); await fs.writeFile(path.join(unknown, "keep.txt"), "keep");
    await cleanupManifestSoftwareBackups(root, backupRoot, "manifest.json", value => (value as { owner: string }).owner === "fixture", current, () => {});
    await expect(fs.stat(old)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.readFile(path.join(current, "notes.txt"), "utf8")).toBe("user notes");
    expect(await fs.readFile(path.join(unknown, "keep.txt"), "utf8")).toBe("keep");
  });
  it("cleans old npm software copies and archives, not diagnostic or Claude configuration data", async () => {
    const root = await fixture(), work = path.join(root, "installations", "11111111-1111-1111-1111-111111111111");
    await fs.mkdir(path.join(work, "previous-packages"), { recursive: true }); await fs.mkdir(path.join(work, "previous-bins"));
    await fs.writeFile(path.join(work, "plan.json"), JSON.stringify({ items: [{ name: "@cloudcli-ai/cloudcli" }] }));
    await fs.writeFile(path.join(work, "cloud.tgz"), "archive"); await fs.writeFile(path.join(work, "result.json"), "diagnostic");
    const user = path.join(root, ".claude"); await fs.mkdir(user); await fs.writeFile(path.join(user, "settings.json"), "user config");
    await cleanupAgentSoftwareCopies(root, () => {});
    expect((await fs.readdir(work)).sort()).toEqual(["plan.json", "result.json"]);
    expect(await fs.readFile(path.join(user, "settings.json"), "utf8")).toBe("user config");
  });
  it("deletes only an exact owned child, refusing workspace roots, siblings and junctions", async () => {
    const root = await fixture(), outside = await fixture(), old = path.join(root, "old");
    await fs.mkdir(old); await fs.writeFile(path.join(old, "runtime.dll"), "old binary");
    const messages: string[] = [], log = (message: string) => messages.push(message);
    expect(await removeSoftwareArtifact(root, root, log)).toBe(false);
    expect(await removeSoftwareArtifact(root, outside, log)).toBe(false);
    const link = path.join(root, "redirect"); await fs.symlink(outside, link, "junction");
    expect(await removeSoftwareArtifact(root, link, log)).toBe(false);
    expect(await removeSoftwareArtifact(root, old, log)).toBe(true);
    await expect(fs.stat(old)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await fs.stat(outside)).isDirectory()).toBe(true);
    expect(messages.some(message => message.includes("未完成"))).toBe(true);
  });
  it("moves forward local weights, media and config, not source/cache, and refuses data collisions", async () => {
    const root = await fixture(), old = path.join(root, "old"), current = path.join(root, "current");
    await fs.mkdir(path.join(old, "models"), { recursive: true }); await fs.mkdir(current);
    await fs.writeFile(path.join(old, "models", "custom.gguf"), "user weight");
    await fs.writeFile(path.join(old, "settings.json"), '{"local":true}');
    await fs.writeFile(path.join(old, "__init__.py"), "old source");
    await preserveSoftwareUserData(old, current);
    expect(await fs.readFile(path.join(current, "models", "custom.gguf"), "utf8")).toBe("user weight");
    expect(await fs.readFile(path.join(current, "settings.json"), "utf8")).toContain("local");
    await expect(fs.stat(path.join(current, "__init__.py"))).rejects.toMatchObject({ code: "ENOENT" });
    await fs.writeFile(path.join(current, "settings.json"), '{"new":true}');
    await expect(preserveSoftwareUserData(old, current)).rejects.toThrow("同名");
    expect(await fs.readFile(path.join(old, "settings.json"), "utf8")).toContain("local");
    await preserveSoftwareUserData(old, current, [], undefined, ["settings.json"]);
    expect(await fs.readFile(path.join(current, "settings.json"), "utf8")).toContain("new");
  });
  it("does not copy local data through a junction in the replacement package", async () => {
    const root = await fixture(), outside = await fixture(), old = path.join(root, "old"), current = path.join(root, "current");
    await fs.mkdir(path.join(old, "models"), { recursive: true }); await fs.mkdir(current);
    await fs.writeFile(path.join(old, "models", "local.gguf"), "user model");
    await fs.symlink(outside, path.join(current, "models"), "junction");
    await expect(preserveSoftwareUserData(old, current)).rejects.toThrow("目标目录含链接");
    expect(await fs.readdir(outside)).toEqual([]);
  });
});
