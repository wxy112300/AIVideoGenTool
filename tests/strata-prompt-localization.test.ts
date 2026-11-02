import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createDefaultSettings } from "../src/core/defaults.js";
import { createNativeTranslator } from "../electron/ui-translator.js";
import { ensureQwenVlManagedMetadata, qwenVlManagedMetadata } from "../electron/services/qwenvl-model-assets.js";
import { downloadFileWithCurl } from "../electron/services/environment.js";
import { enhancePromptWithStrata, strataImageContent } from "../electron/services/strata-prompt.js";
import { withStrataReferenceMedia } from "../electron/services/strata-reference-media.js";
import type { StrataChatRequest } from "../electron/services/strata-service.js";

vi.mock("../electron/services/environment.js", async original => ({
  ...await original<typeof import("../electron/services/environment.js")>(), downloadFileWithCurl: vi.fn()
}));
const locales = ["zh-CN", "en-US", "zh-TW"] as const;
const roots: string[] = [];
async function fixture() { const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-strata-prompt-locale-")); roots.push(root); return root; }
afterEach(async () => {
  vi.restoreAllMocks(); vi.mocked(downloadFileWithCurl).mockReset();
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

it.each(locales)("prepares only Qwen metadata with localized progress and keeps model bytes (%s)", async uiLocale => {
  const root = await fixture(), weights = path.join(root, "使用者模型.safetensors"); await fs.writeFile(weights, "model bytes");
  vi.mocked(downloadFileWithCurl).mockImplementation(async (_url, target) => { await fs.writeFile(target, "{}"); });
  const progress = vi.fn(), settings = { ...createDefaultSettings(), modelDirectory: root, uiLocale };
  const result = await ensureQwenVlManagedMetadata(settings, undefined, progress);
  expect(result.downloaded).toEqual(qwenVlManagedMetadata.map(asset => asset.relativePath));
  expect(downloadFileWithCurl).toHaveBeenCalledTimes(qwenVlManagedMetadata.length);
  expect(progress.mock.calls[0]![2]).toContain(uiLocale === "en-US" ? "Preparing Qwen3-VL configuration" : uiLocale === "zh-TW" ? "準備 Qwen3-VL 設定" : "准备 Qwen3-VL 配置");
  for (const [url, target, requested] of vi.mocked(downloadFileWithCurl).mock.calls) {
    expect(url).toContain("/resolve/main/");
    expect(target).toContain(".part-"); expect(requested.uiLocale).toBe(uiLocale);
  }
  expect((await ensureQwenVlManagedMetadata(settings)).downloaded).toEqual([]);
  expect(downloadFileWithCurl).toHaveBeenCalledTimes(qwenVlManagedMetadata.length);
  expect(await fs.readFile(weights, "utf8")).toBe("model bytes");
});

it.each(locales)("localizes empty metadata failures, clears temporary files and allows retry (%s)", async uiLocale => {
  const root = await fixture(), settings = { ...createDefaultSettings(), modelDirectory: root, uiLocale };
  vi.mocked(downloadFileWithCurl).mockImplementation(async (_url, target) => { await fs.writeFile(target, ""); });
  await expect(ensureQwenVlManagedMetadata(settings)).rejects.toThrow(uiLocale === "en-US" ? "file is empty" : uiLocale === "zh-TW" ? "檔案為空" : "文件为空");
  const target = path.dirname(path.join(root, qwenVlManagedMetadata[0]!.relativePath));
  expect(await fs.readdir(target)).toEqual([]);
  vi.mocked(downloadFileWithCurl).mockImplementation(async () => { throw new Error("ECONNRESET: 外部诊断"); });
  await expect(ensureQwenVlManagedMetadata(settings)).rejects.toThrow("ECONNRESET: 外部诊断");
  expect(await fs.readdir(target)).toEqual([]);
  vi.mocked(downloadFileWithCurl).mockImplementation(async (_url, target) => { await fs.writeFile(target, "{}"); });
  expect((await ensureQwenVlManagedMetadata(settings)).downloaded).toHaveLength(qwenVlManagedMetadata.length);
});

it("preserves one shared in-flight metadata transaction and cancellation category", async () => {
  const root = await fixture(), settings = { ...createDefaultSettings(), modelDirectory: root, uiLocale: "en-US" as const };
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  vi.mocked(downloadFileWithCurl).mockImplementation(async (_url, target) => { await gate; await fs.writeFile(target, "{}"); });
  const first = ensureQwenVlManagedMetadata(settings);
  await vi.waitFor(() => expect(downloadFileWithCurl).toHaveBeenCalledOnce());
  const second = ensureQwenVlManagedMetadata(settings); release();
  expect(await second).toEqual(await first);
  expect(downloadFileWithCurl).toHaveBeenCalledTimes(qwenVlManagedMetadata.length);
  const controller = new AbortController(); controller.abort();
  await expect(ensureQwenVlManagedMetadata(settings, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
});

it("keeps Strata requests and generated user content identical while localizing stream progress", async () => {
  const bodies: StrataChatRequest[] = [], results: string[] = [];
  const request = { prompt: "把红色汽车改成蓝色，保留招牌上的「故乡」。", modelId: "qwen-image-edit", mode: "image-edit" as const, imageTargetModelId: "qwen-image-edit" };
  for (const uiLocale of locales) {
    const settings = { ...createDefaultSettings(), promptModelId: "strata/qwen3.8-flash-next-iq3_xxs", uiLocale, promptLanguage: "en" as const };
    const progress = vi.fn();
    const owner = { chat: vi.fn(async (chat: StrataChatRequest, _signal: AbortSignal, onText?: (delta: string) => void, onBudget?: (tokens: number) => void, onReasoning?: (count: number) => void) => {
      bodies.push(chat); onBudget?.(4000); onReasoning?.(23); onText?.("蓝色汽车"); return "蓝色汽车停在原处，招牌写着「故乡」。";
    }) };
    results.push(await enhancePromptWithStrata(request, settings, owner, new AbortController().signal, progress));
    const messages = progress.mock.calls.map(call => call[2]).join("\n");
    expect(messages).toContain(uiLocale === "en-US" ? "Output budget adjusted to 4000" : uiLocale === "zh-TW" ? "輸出預算自動調整為 4000" : "输出预算自动调整为 4000");
    expect(messages).toContain(uiLocale === "en-US" ? "Received 23 reasoning characters" : uiLocale === "zh-TW" ? "已接收 23 個思考字元" : "已接收 23 个思考字符");
    if (uiLocale === "en-US") expect(messages).not.toMatch(/\p{Script=Han}/u);
  }
  expect(bodies[1]).toEqual(bodies[0]); expect(bodies[2]).toEqual(bodies[0]);
  expect(results).toEqual(Array(3).fill("蓝色汽车停在原处，招牌写着「故乡」。"));
  expect(JSON.stringify(bodies[0])).toContain("故乡");
});

it.each(locales)("localizes image validation and sample limits while preserving files and cleanup (%s)", async uiLocale => {
  const root = await fixture(), t = createNativeTranslator(uiLocale).t, file = path.join(root, "使用者参考图.bmp");
  await fs.writeFile(file, "unsupported fixture");
  await expect(strataImageContent(file, new AbortController().signal, t)).rejects.toThrow(uiLocale === "en-US" ? "Unsupported Strata reference image format: 使用者参考图.bmp" : uiLocale === "zh-TW" ? "不支援此參考圖格式：使用者参考图.bmp" : "格式不支持：使用者参考图.bmp");
  expect(await fs.readFile(file, "utf8")).toBe("unsupported fixture");
  const cleanup = vi.fn(async () => {}), run = vi.fn(), prepareFrame = vi.fn(async () => ({ filePath: "frame.png", cleanup }));
  await expect(withStrataReferenceMedia({ prompt: "keep", modelId: "h3", imagePaths: Array.from({ length: 10 }, (_, index) => index + ".png"), referenceMediaPaths: ["参考视频.mp4"] },
    new AbortController().signal, run, { duration: async () => 5, prepareFrame }, t)).rejects.toThrow(uiLocale === "en-US" ? "exceed 12" : uiLocale === "zh-TW" ? "合計超過 12" : "合计超过 12");
  expect(prepareFrame).toHaveBeenCalledTimes(3); expect(cleanup).toHaveBeenCalledTimes(3); expect(run).not.toHaveBeenCalled();
});

it.each(["en-US", "zh-TW"] as const)("passes UI language into nested H3 output validation (%s)", async uiLocale => {
  const request = { prompt: "A visitor walks past a sign reading 故乡.", modelId: "minimax_h3_fl2va", mode: "h3-vision" as const, h3PromptMode: "T2VA" as const, h3PromptPreset: "detailed-cinematic" as const };
  const owner = { chat: vi.fn(async () => "A visitor walks past a sign.") };
  const error = await enhancePromptWithStrata(request, { ...createDefaultSettings(), uiLocale }, owner, new AbortController().signal, vi.fn()).then(() => null, failure => failure);
  expect(error).toMatchObject({ name: "StrataPromptValidationError" });
  expect(error.message.length).toBeGreaterThan(0);
  if (uiLocale === "en-US") expect(error.message).not.toMatch(/\p{Script=Han}/u);
  else expect(error.message).toMatch(/擴寫|輸出|時間線/u);
  expect(owner.chat).toHaveBeenCalledOnce();
  expect(request.prompt).toBe("A visitor walks past a sign reading 故乡.");
});
