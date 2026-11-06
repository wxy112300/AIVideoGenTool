import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { expect, it } from "vitest";
import { JsonStore } from "../electron/store.js";
import { createNativeTranslator } from "../electron/ui-translator.js";
import { LibraryRecordStore } from "../electron/services/library-record-store.js";
import { StateFileSafety, StateRecoveryError, stateDigest } from "../electron/services/state-file-safety.js";
import { UserDataMigration } from "../electron/services/user-data-migration.js";
import { createDefaultState, APP_SCHEMA_VERSION } from "../src/core/defaults.js";
import { LIBRARY_DESTINATION_CONFLICT } from "../src/core/library-storage-errors.js";

const languages = [
  ["zh-CN", "未被默认值替换", "没有可用的已验证备份", "身份无效或重复", "必须先恢复资料", "更新版本", "迁移记录无效", "迁移期间旧用户资料发生变化"],
  ["en-US", "not been replaced", "no verified backup", "Invalid or duplicate", "recovery is required", "newer application", "Invalid user data migration record", "changed during migration"],
  ["zh-TW", "未被預設值取代", "沒有可用的已驗證備份", "身分無效或重複", "必須先復原資料", "較新版本", "移轉記錄無效", "移轉期間舊使用者資料發生變化"]
] as const;

it.each(languages)("recovers %s from the saved state before startup refusal and keeps error causes and original bytes", async (locale, open, backup, identity, recovery, newer) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-storage-locale-"));
  const filename = path.join(root, "使用者資料.json"), state = createDefaultState(); state.settings.uiLocale = locale;
  const store = new JsonStore(filename);
  try {
    const invalid = { ...state, queue: [{ id: "重複-id" }, { id: "重複-id" }] }, raw = JSON.stringify(invalid);
    await fs.writeFile(filename, raw);
    const error = await store.load().catch(error => error);
    expect(error).toBeInstanceOf(StateRecoveryError); expect(error.message).toContain(open);
    expect(error.cause).toBeInstanceOf(StateRecoveryError); expect(error.cause.message).toContain(backup);
    expect(error.cause.cause).toBeInstanceOf(StateRecoveryError); expect(error.cause.cause.message).toContain(identity);
    expect(error.cause.cause.message).toContain("queue");
    await expect(store.flush()).rejects.toThrow(recovery);
    expect(await fs.readFile(filename, "utf8")).toBe(raw); expect(await fs.readdir(root)).toEqual([path.basename(filename)]);
    const safety = new StateFileSafety(filename);
    await safety.backup(JSON.stringify(state));
    const future = JSON.stringify({ ...state, schemaVersion: APP_SCHEMA_VERSION + 1 }); await fs.writeFile(filename, future);
    await expect(safety.read()).rejects.toThrow(newer);
    expect(await fs.readFile(filename, "utf8")).toBe(future);
    expect((await fs.readdir(root)).some(name => name.includes("corrupt-") || name.endsWith("recovery.jsonl"))).toBe(false);
  } finally { await store.close(); await fs.rm(root, { recursive: true, force: true }); }
});

async function files(root: string, relative = ""): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
    const name = path.join(relative, entry.name);
    if (entry.isDirectory()) Object.assign(result, await files(root, name));
    else result[name] = await fs.readFile(path.join(root, name), "utf8");
  }
  return result;
}

it("changes existing record-store diagnostics without changing content addresses, long text, no-op commits or conflict markers", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-record-locale-"));
  try {
    let t = createNativeTranslator("zh-CN").t;
    const library = path.join(root, "library"), sourceHash = stateDigest("same source"), libraryId = "11111111-1111-4111-8111-111111111111";
    const records = await LibraryRecordStore.create(library, sourceHash, libraryId, () => t);
    const collections = { history: [{ id: "作品", prompt: '招牌「春日」，保持原文。'.repeat(240), unknown: { label: "使用者自訂" } }], imageHistory: [] };
    const pointer = await records.prepare(collections, null), before = await files(library);
    for (const locale of ["zh-CN", "en-US", "zh-TW"]) {
      t = createNativeTranslator(locale).t;
      expect(await records.load(pointer.commit)).toEqual(collections);
      expect(await records.prepare(collections, pointer.commit)).toEqual(pointer);
      const reopened = await LibraryRecordStore.open(pointer, () => t);
      expect(await reopened.load(pointer.commit)).toEqual(collections);
      await expect(LibraryRecordStore.create(library, stateDigest("different source"), undefined, () => t)).rejects.toThrow(LIBRARY_DESTINATION_CONFLICT);
      expect(await files(library)).toEqual(before);
    }
    const commitFile = path.join(library, "commits", `${pointer.commit}.json`), commit = JSON.parse(await fs.readFile(commitFile, "utf8"));
    const recordHash = commit.history[0].hash, recordFile = path.join(library, "records", `${recordHash}.json`);
    await fs.writeFile(recordFile, "damaged record bytes");
    for (const [locale, damaged] of [["zh-CN", "已损坏"], ["en-US", "Damaged library"], ["zh-TW", "已損壞"]] as const) {
      t = createNativeTranslator(locale).t;
      await expect(records.load(pointer.commit)).rejects.toThrow(damaged);
      await expect(records.load(pointer.commit)).rejects.toThrow(recordHash);
      expect(await fs.readFile(recordFile, "utf8")).toBe("damaged record bytes");
      expect(await fs.readFile(commitFile, "utf8")).toBe(before[path.join("commits", `${pointer.commit}.json`)]);
    }
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

it.each(languages)("uses %s before validating a migration journal and preserves all originals until verification recovers", async (locale, _open, _backup, _identity, _recovery, _newer, manifest, changed) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-user-migration-locale-"));
  try {
    const source = path.join(root, "legacy"), destination = path.join(root, "Documents", "Data");
    const image = path.join(source, "clipboard-inputs", "原圖.png"); await fs.mkdir(path.dirname(image), { recursive: true });
    const state = createDefaultState(); state.settings.uiLocale = locale; state.draft.startImagePath = image;
    state.draft.promptVersions[0]!.text = `保留使用者正文 ${image}`;
    const raw = JSON.stringify(state); await fs.writeFile(path.join(source, "studio-state.json"), raw); await fs.writeFile(image, "original bytes");
    await fs.mkdir(destination, { recursive: true });
    const marker = path.join(destination, "user-data-migration.json"); await fs.writeFile(marker, JSON.stringify({ format: 0 }));
    const migration = new UserDataMigration(source, destination);
    await expect(migration.prepare()).rejects.toThrow(manifest);
    expect(await fs.readFile(path.join(source, "studio-state.json"), "utf8")).toBe(raw);
    await fs.unlink(marker); await migration.prepare();
    expect(await fs.readFile(path.join(destination, "migration-backup", "studio-state.json"), "utf8")).toBe(raw);
    expect(await fs.readFile(path.join(destination, "studio-state.json"), "utf8")).toBe(raw);
    await fs.writeFile(image, "changed source bytes");
    await expect(migration.finish()).rejects.toThrow(changed);
    expect(await fs.readFile(image, "utf8")).toBe("changed source bytes");
    expect(await fs.readFile(path.join(source, "studio-state.json"), "utf8")).toBe(raw);
    await fs.writeFile(image, "original bytes"); await migration.finish();
    await expect(fs.stat(image)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.readFile(path.join(destination, "clipboard-inputs", "原圖.png"), "utf8")).toBe("original bytes");
    expect(await fs.readFile(path.join(destination, "migration-backup", "studio-state.json"), "utf8")).toBe(raw);
    expect(JSON.parse(await fs.readFile(marker, "utf8")).phase).toBe("complete");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
