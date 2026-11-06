import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createNativeTranslator } from "../electron/ui-translator.js";
import { prepareExtensionContext, prepareH3BoundaryFrame, prepareH3MotionContext, preparePromptExtensionFrame, finalizeExtensionOutput } from "../electron/services/extension-media.js";
import { withPromptExtensionMedia } from "../electron/services/prompt-extension-media.js";
import { withStrataReferenceMedia } from "../electron/services/strata-reference-media.js";
import type { EnhanceRequest, ExtensionQueueTask } from "../src/types.js";

const mocks = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  return { execFile: Object.assign(vi.fn(), { [promisify.custom]: mocks.run }) };
});
const locales = ["zh-CN", "en-US", "zh-TW"] as const;
let root: string;
let outputMode: "valid" | "empty" | "external" = "valid";
let frameCount = "48";
const externalError = new Error("FFmpeg EACCES · 原始診斷");
const signal = new AbortController().signal;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "extension-localization-"));
  outputMode = "valid"; frameCount = "48";
  mocks.run.mockReset().mockImplementation(async (tool: string, args: string[]) => {
    if (tool === "ffprobe") {
      return { stdout: args.includes("stream=nb_read_frames") ? frameCount : args.includes("format=duration") ? "10" : "0", stderr: "" };
    }
    if (outputMode === "external") throw externalError;
    await fs.writeFile(args.at(-1)!, outputMode === "empty" ? "" : "synthetic media output");
    return { stdout: "", stderr: "" };
  });
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
  // Production media helpers own these task-specific directories.
  for (const id of [path.basename(root), path.basename(root) + "-finalize", "prompt-" + path.basename(root)]) {
    await fs.rm(path.join(os.tmpdir(), "local-video-studio", id), { recursive: true, force: true });
  }
});
function task(): ExtensionQueueTask {
  return {
    id: path.basename(root), modelId: "minimax_h3_continuum",
    workflowPath: "workflows/minimax_h3_continuum_v38_extend_api.json",
    sourceVideoPath: path.join(root, "使用者來源.mp4"), trimStartSeconds: 0, trimEndSeconds: 1,
    sourceWidth: 96, sourceHeight: 64, fps: 24, duration: 1,
    resolution: 480, overlapFrames: 22, frameInterpolation: "off",
    prompt: "保留使用者正文"
  } as ExtensionQueueTask;
}
function request(): EnhanceRequest {
  return { prompt: "保留使用者正文", modelId: "minimax_h3_fl2va", h3PromptMode: "I2VA",
    extensionSource: { filePath: task().sourceVideoPath, trimStartSeconds: 2, trimEndSeconds: 8 } };
}
const promptDir = () => path.join(os.tmpdir(), "local-video-studio", "prompt-" + path.basename(root));

it.each(locales)("propagates %s through both default prompt media adapters without rewriting requests", async locale => {
  const t = createNativeTranslator(locale).t;
  const input = request(), frozen = structuredClone(input);
  const run = vi.fn(async (prepared: EnhanceRequest) => prepared);
  const expected = { "zh-CN": "找不到源视频文件", "en-US": "was not found", "zh-TW": "找不到來源影片檔案" }[locale];
  await expect(withPromptExtensionMedia(input, path.basename(root), signal, run, {}, t)).rejects.toThrow(expected);
  expect(run).not.toHaveBeenCalled(); expect(mocks.run).not.toHaveBeenCalled();
  await expect(preparePromptExtensionFrame({ ...input.extensionSource!, filePath: " " }, path.basename(root), signal, t))
    .rejects.toThrow({ "zh-CN": "缺少源视频路径", "en-US": "requires a source video path", "zh-TW": "缺少來源影片路徑" }[locale]);
  await expect(preparePromptExtensionFrame({ ...input.extensionSource!, trimEndSeconds: 1 }, path.basename(root), signal, t))
    .rejects.toThrow({ "zh-CN": "裁剪区间无效", "en-US": "trim range", "zh-TW": "裁剪範圍無效" }[locale]);
  const reference = { ...input, extensionSource: undefined, referenceMediaPaths: [input.extensionSource!.filePath] };
  await expect(withStrataReferenceMedia(reference, signal, run, { duration: async () => 10 }, t)).rejects.toThrow(expected);
  expect(run).not.toHaveBeenCalled();
  await fs.writeFile(input.extensionSource!.filePath, "original source bytes");
  const prepared = await withPromptExtensionMedia(input, path.basename(root), signal, run, {}, t);
  expect(prepared.prompt).toBe(input.prompt);
  expect(prepared.extensionSource).toEqual(input.extensionSource);
  expect(prepared.referenceContext).toContain("exact final frame at the selected trim end");
  expect(prepared.referenceContext).toContain("<Picture 1>");
  expect(input).toEqual(frozen);
  expect(await fs.readFile(input.extensionSource!.filePath, "utf8")).toBe("original source bytes");
  await expect(fs.stat(promptDir())).rejects.toMatchObject({ code: "ENOENT" });
});

it.each(locales)("keeps %s extraction fallback, causes and crop protection", async locale => {
  const t = createNativeTranslator(locale).t, source = request().extensionSource!;
  await fs.writeFile(source.filePath, "source bytes");
  await expect(preparePromptExtensionFrame({ ...source, trimStartSeconds: 10, trimEndSeconds: 12 }, path.basename(root), signal, t))
    .rejects.toThrow({ "zh-CN": "裁剪起点已超出", "en-US": "beyond the source video duration", "zh-TW": "裁剪起點已超出" }[locale]);
  expect(mocks.run.mock.calls.every(([tool]) => tool === "ffprobe")).toBe(true);
  mocks.run.mockClear(); outputMode = "empty";
  const missing = await preparePromptExtensionFrame(source, path.basename(root), signal, t).catch(error => error);
  expect(missing.message).toContain({ "zh-CN": "可用的续写末帧", "en-US": "usable final frame", "zh-TW": "可用的續寫末影格" }[locale]);
  expect(missing.cause.message).toContain({ "zh-CN": "秒生成边界帧", "en-US": "seconds", "zh-TW": "秒產生邊界影格" }[locale]);
  const calls = mocks.run.mock.calls.filter(([tool]) => tool === "ffmpeg");
  expect(calls).toHaveLength(7);
  expect(calls.map(([, args]) => Number(args[args.indexOf("-ss") + 1]))).toEqual([
    8 - 1 / 24, 8 - 1 / 24, 8 - 1 / 24 - 1 / 48, expect.closeTo(8 - 2 / 24, 12), 8 - 4 / 24, 8 - 9 / 24, 8 - 1 / 24 - 0.5
  ]);
  await expect(fs.stat(promptDir())).rejects.toMatchObject({ code: "ENOENT" });
  outputMode = "external";
  const external = await preparePromptExtensionFrame(source, path.basename(root), signal, t).catch(error => error);
  expect(external.cause).toBe(externalError);
  expect(await fs.readFile(source.filePath, "utf8")).toBe("source bytes");
});

it("localizes empty context output without changing FFmpeg commands or task data", async () => {
  const input = task(), frozen = structuredClone(input);
  const commands: unknown[] = [];
  outputMode = "empty";
  for (const locale of locales) {
    mocks.run.mockClear();
    const t = createNativeTranslator(locale).t;
    const expected = {
      "zh-CN": ["续写上下文视频", "H3 接续边界帧", "H3 运动与音频上下文"],
      "en-US": ["extension context video", "H3 continuation boundary frame", "H3 motion and audio context"],
      "zh-TW": ["續寫上下文影片", "H3 接續邊界影格", "H3 動作與音訊上下文"]
    }[locale];
    for (const [index, prepare] of [prepareExtensionContext, prepareH3BoundaryFrame, prepareH3MotionContext].entries()) {
      await expect(prepare(input, signal, t)).rejects.toThrow(expected[index]);
    }
    commands.push(mocks.run.mock.calls.map(([tool, args]) => [tool, args]));
  }
  expect(commands[1]).toEqual(commands[0]); expect(commands[2]).toEqual(commands[0]);
  expect(input).toEqual(frozen);
});

it("keeps concat frame checks before replacement and preserves source/generated bytes on failure", async () => {
  const input = task(), generated = path.join(root, "generated.mp4");
  await fs.writeFile(input.sourceVideoPath, "source bytes");
  await fs.writeFile(generated, "generated bytes");
  const commands: unknown[] = [];
  for (const locale of locales) {
    const t = createNativeTranslator(locale).t;
    for (const count of ["49", "N/A"]) {
      mocks.run.mockClear(); frameCount = count;
      const error = await finalizeExtensionOutput(input, generated, signal, t).catch(error => error);
      expect(error.message).toContain({ "zh-CN": "期望 48 帧", "en-US": "expected 48 frames", "zh-TW": "預期 48 影格" }[locale]);
      expect(error.message).toContain(count === "49" ? "49" : { "zh-CN": "无法读取", "en-US": "unreadable", "zh-TW": "無法讀取" }[locale]);
      expect(await fs.readFile(generated, "utf8")).toBe("generated bytes");
      expect(await fs.readdir(root)).toEqual(expect.arrayContaining(["generated.mp4", "使用者來源.mp4"]));
      expect(await fs.readdir(root)).toHaveLength(2);
      await expect(fs.stat(path.join(os.tmpdir(), "local-video-studio", input.id + "-finalize"))).rejects.toMatchObject({ code: "ENOENT" });
    }
    mocks.run.mockClear(); frameCount = "48";
    await finalizeExtensionOutput(input, generated, signal, t);
    expect(await fs.readFile(generated, "utf8")).toBe("synthetic media output");
    expect(await fs.readFile(input.sourceVideoPath, "utf8")).toBe("source bytes");
    commands.push(mocks.run.mock.calls.map(([tool, args]) => [tool, args]));
    await fs.writeFile(generated, "generated bytes");
  }
  expect(commands[1]).toEqual(commands[0]); expect(commands[2]).toEqual(commands[0]);
});
