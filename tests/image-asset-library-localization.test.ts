import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { ImageAssetLibraryService } from "../electron/services/image-asset-library-service.js";
import { createNativeTranslator } from "../electron/ui-translator.js";
import { createDefaultState } from "../src/core/defaults.js";
import { archiveImagePaths, archiveImageReferences, organizeImageAssetLibrary } from "../src/infrastructure/image-asset-library.js";
import type { ImageAssetLibraryProgress, ImageReference } from "../src/types.js";

const languages = [
  ["zh-CN", "正在检查", "正在归档", "正在校验", "正在保存", "正在清理", "队列已开始运行", "图片素材不存在", "哈希文件校验失败"],
  ["en-US", "Checking", "Archiving", "Verifying", "Saving", "Cleaning up", "queue has started running", "Image asset does not exist", "hash file failed verification"],
  ["zh-TW", "正在檢查", "正在封存", "正在驗證", "正在儲存", "正在清理", "佇列已開始執行", "圖片素材不存在", "雜湊檔案驗證失敗"]
] as const;
const picture = (filename: string): ImageReference => ({ id: "source-picture", pictureNumber: 1, absolutePath: filename, width: 8, height: 8 });

it("uses the saved language through the real native adapter without changing archived identity or protected references", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-asset-pipeline-locale-"));
  try {
    const source = path.join(root, "使用者原圖.png"), library = path.join(root, "library"), bytes = "original picture bytes";
    await fs.writeFile(source, bytes);
    const hash = createHash("sha256").update(bytes).digest("hex"), archived = path.join(library, "sources", `${hash}.png`);
    const base = createDefaultState(); base.imageDraft.pictures = [picture(source)]; base.draft.startImagePath = source;
    let state = structuredClone(base);
    const progress: ImageAssetLibraryProgress[] = [];
    const update = vi.fn(async (mutator: (value: typeof state) => void) => { mutator(state); return state; });
    const service = new ImageAssetLibraryService({
      store: { get: () => state, getSettings: () => state.settings, load: async () => state, update },
      logger: { info: vi.fn(), error: vi.fn() }, sendState: vi.fn(), resolveLibraryDirectory: async () => library,
      events: { publish: (_event, value) => { progress.push(value as ImageAssetLibraryProgress); } }
    });
    let firstReferences: ImageReference[] | undefined;
    for (const [locale, checking, archiving, verifying, committing, cleaning] of languages) {
      state = structuredClone(base); state.settings.uiLocale = locale; progress.length = 0;
      expect(await service.scan()).toMatchObject({ totalReferences: 1, archiveCandidates: 1, missingReferences: [] });
      expect(progress[0]).toMatchObject({ phase: "scanning", current: 1, total: 1, message: `${checking} 使用者原圖.png` });
      progress.length = 0;
      expect(await service.organize()).toMatchObject({ archivedFiles: 1, updatedReferences: 2, scan: { managedReferences: 1, archiveCandidates: 0 } });
      for (const [phase, message] of [["archiving", archiving], ["verifying", verifying], ["committing", committing]]) {
        expect(progress.find(value => value.phase === phase)?.message).toContain(message);
      }
      expect(state.imageDraft.pictures[0]).toMatchObject({ absolutePath: archived, originalPath: source, contentHash: hash, managedRelativePath: `sources/${hash}.png` });
      expect(state.draft.startImagePath).toBe(archived);
      firstReferences ??= structuredClone(state.imageDraft.pictures);
      expect(state.imageDraft.pictures).toEqual(firstReferences);
      const orphan = path.join(library, "sources", "孤立圖片.png"); await fs.writeFile(orphan, "unreferenced bytes");
      progress.length = 0;
      expect(await service.cleanup([source, archived, orphan])).toMatchObject({ cleanedFiles: 1, cleanedBytes: Buffer.byteLength("unreferenced bytes") });
      expect(progress.find(value => value.phase === "cleaning")?.message).toContain(cleaning);
      expect(await fs.readFile(source, "utf8")).toBe(bytes); expect(await fs.readFile(archived, "utf8")).toBe(bytes);
      await expect(fs.stat(orphan)).rejects.toMatchObject({ code: "ENOENT" });
      expect(state.imageDraft.pictures).toEqual(firstReferences);
    }
    expect(update).toHaveBeenCalledTimes(3);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

it.each(languages)("keeps %s missing inputs and corrupt archives blocked without overwriting either file", async (locale, _scan, _archive, _verify, _commit, _clean, _queue, missing, mismatch) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-asset-hash-locale-"));
  try {
    const library = path.join(root, "library"), source = path.join(root, "保留原圖.png"), absent = path.join(root, "遺失原圖.png");
    const t = createNativeTranslator(locale).t;
    await expect(archiveImagePaths([absent], library, t)).rejects.toThrow(missing);
    await expect(archiveImageReferences([picture(absent)], library, t)).rejects.toThrow(absent);
    await fs.writeFile(source, "source bytes");
    const hash = createHash("sha256").update("source bytes").digest("hex"), destination = path.join(library, "sources", `${hash}.png`);
    await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.writeFile(destination, "corrupt archived bytes");
    const references = [picture(source)], before = structuredClone(references);
    await expect(archiveImagePaths([source], library, t)).rejects.toThrow(mismatch);
    await expect(archiveImageReferences(references, library, t)).rejects.toThrow(mismatch);
    const state = createDefaultState(); state.imageDraft.pictures = references;
    const stateBefore = structuredClone(state);
    await expect(organizeImageAssetLibrary(state, library, undefined, t)).rejects.toThrow(destination);
    expect(state).toEqual(stateBefore); expect(references).toEqual(before);
    expect(await fs.readFile(source, "utf8")).toBe("source bytes");
    expect(await fs.readFile(destination, "utf8")).toBe("corrupt archived bytes");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

it.each(languages)("stops %s cleanup if the queue starts after the service preflight", async (locale, _scan, _archive, _verify, _commit, _clean, message) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-asset-cleanup-locale-"));
  try {
    const library = path.join(root, "library"), orphan = path.join(library, "sources", "保留圖片.png");
    await fs.mkdir(path.dirname(orphan), { recursive: true }); await fs.writeFile(orphan, "keep these bytes");
    const state = createDefaultState(); state.settings.uiLocale = locale;
    const update = vi.fn();
    const service = new ImageAssetLibraryService({
      store: { get: () => state, getSettings: () => state.settings, load: async () => state, update },
      logger: { info: vi.fn(), error: vi.fn() }, sendState: vi.fn(), resolveLibraryDirectory: async () => library,
      events: { publish: (_event, value) => { if ((value as ImageAssetLibraryProgress).phase === "cleaning") state.queueRunning = true; } }
    });
    await expect(service.cleanup([orphan])).rejects.toThrow(message);
    expect(service.isRunning()).toBe(false); expect(update).not.toHaveBeenCalled();
    expect(await fs.readFile(orphan, "utf8")).toBe("keep these bytes");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
