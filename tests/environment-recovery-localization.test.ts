import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults.js";
import { createNativeTranslator } from "../electron/ui-translator.js";
import { prepareDepthAnythingAssets } from "../electron/services/depth-anything-assets.js";
import { recoverLibraryLocation } from "../electron/services/library-location-recovery.js";
import { StateRecoveryError } from "../electron/services/state-file-safety.js";
import { promptVersionDisplayLabel } from "../src/renderer/shared/prompt-version-label.js";

it.each([
  ["zh-CN", "远程 ComfyUI", "没有找到", "请只下载", "已找到用户提供"],
  ["en-US", "Remote ComfyUI", "was not found", "Download only", "user-provided"],
  ["zh-TW", "遠端 ComfyUI", "找不到", "請只下載", "使用者提供"]
] as const)("keeps %s Depth Anything preparation offline and user-managed", async (locale, remote, rootMissing, download, found) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-depth-locale-"));
  try {
    const settings = createDefaultState().settings; settings.uiLocale = locale;
    const onLog = vi.fn();
    await expect(prepareDepthAnythingAssets({ ...settings, comfyUrl: "https://remote.test" }, root, [], onLog))
      .resolves.toMatchObject({ ok: false, message: expect.stringContaining(remote) });
    await expect(prepareDepthAnythingAssets(settings, "", [], onLog))
      .resolves.toMatchObject({ ok: false, message: expect.stringContaining(rootMissing) });
    expect(onLog).not.toHaveBeenCalled(); expect(await fs.readdir(root)).toEqual([]);
    const missing = await prepareDepthAnythingAssets(settings, root, [], onLog);
    expect(missing).toMatchObject({ ok: false, message: expect.stringContaining(download) });
    expect(missing.message).toContain("model.safetensors");
    expect(await fs.readdir(root)).toEqual([]);
    const targetDirectory = missing.status!.cacheDirectory;
    expect(targetDirectory.startsWith(root + path.sep)).toBe(true);
    await fs.mkdir(targetDirectory, { recursive: true });
    const file = path.join(targetDirectory, "model.safetensors"); await fs.writeFile(file, "user-managed fixture bytes");
    const ready = await prepareDepthAnythingAssets(settings, root, [], onLog);
    expect(ready).toMatchObject({ ok: true, message: expect.stringContaining(found), status: { available: true, runtimeVerified: false, foundFiles: [file] } });
    expect(await fs.readFile(file, "utf8")).toBe("user-managed fixture bytes");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

it.each([
  ["zh-CN", "绝对", "空的目标目录"],
  ["en-US", "absolute", "empty destination"],
  ["zh-TW", "絕對", "空的目標目錄"]
] as const)("preserves source state on %s library recovery refusal and allows an empty destination", async (locale, absolute, empty) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-recovery-locale-"));
  try {
    const state = createDefaultState(); state.settings.uiLocale = locale;
    const filename = path.join(root, "studio-state.json"), raw = JSON.stringify(state), t = createNativeTranslator(locale).t;
    await fs.writeFile(filename, raw);
    await expect(recoverLibraryLocation(filename, "relative", t)).rejects.toThrow(absolute);
    const occupied = path.join(root, "使用者目錄"); await fs.mkdir(occupied); await fs.writeFile(path.join(occupied, "保留.txt"), "user bytes");
    await expect(recoverLibraryLocation(filename, occupied, t)).rejects.toBeInstanceOf(StateRecoveryError);
    await expect(recoverLibraryLocation(filename, occupied, t)).rejects.toThrow(empty);
    expect(await fs.readFile(filename, "utf8")).toBe(raw);
    expect(await fs.readFile(path.join(occupied, "保留.txt"), "utf8")).toBe("user bytes");
    const destination = path.join(root, "empty"); await fs.mkdir(destination);
    await recoverLibraryLocation(filename, destination, t);
    const recovered = JSON.parse(await fs.readFile(filename, "utf8"));
    expect(recovered).toEqual({ ...state, settings: { ...state.settings, libraryDirectory: destination } });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

it("localizes the shipped promptless label only for display and preserves custom labels and snapshots", () => {
  const state = createDefaultState(); state.imageDraft.promptVersions[0]!.label = "无需 Prompt";
  const before = structuredClone(state);
  for (const [locale, label] of [["zh-CN", "无需 Prompt"], ["en-US", "No Prompt Needed"], ["zh-TW", "無需 Prompt"]] as const) {
    const t = createNativeTranslator(locale).t;
    expect(promptVersionDisplayLabel(state.imageDraft.promptVersions[0]!.label, t)).toBe(label);
    expect(promptVersionDisplayLabel("使用者的无需 Prompt版本", t)).toBe("使用者的无需 Prompt版本");
    expect(state).toEqual(before);
  }
});
