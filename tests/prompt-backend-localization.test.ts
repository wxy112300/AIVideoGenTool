import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDefaultSettings } from "../src/core/defaults.js";
import { createNativeTranslator } from "../electron/ui-translator.js";
import { buildMultimodalPromptWorkflow, multimodalDeviceFor, multimodalPromptFailureDiagnostic, multimodalPromptOutputDiagnostics, releaseMultimodalPromptModel } from "../electron/services/multimodal-prompt.js";
import { buildQwenVlPeftPromptWorkflow, explainQwenVlRuntimeError, QwenVlRuntimeValidationError, validateQwenVlRuntimeChoices } from "../electron/services/qwenvl-prompt.js";
import { buildLmStudioChatRequest, enhancePrompt, unloadLmStudioModels } from "../electron/services/lm-studio.js";
import { startLlamaPromptModel } from "../electron/services/llama-server.js";
import { buildNativePromptWorkflow, enhancePromptWithComfyUi, extractStringNodeOutput, freeMemory, interrupt, jsonRequest, testComfyUi, uploadInput } from "../electron/services/comfy-ui.js";

const locales = ["zh-CN", "en-US", "zh-TW"] as const;
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

describe("Prompt backend localization boundaries", () => {
  it("keeps all four backend requests unchanged across UI languages, including Chinese user content", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.25);
    const request = { prompt: 'A visitor says "你好" beside a sign reading "故乡".', modelId: "minimax_h3_fl2va", h3PromptMode: "T2VA" as const, mode: "h3-vision" as const };
    const results = [];
    for (const uiLocale of locales) {
      const settings = { ...createDefaultSettings(), uiLocale, promptLanguage: "en" as const };
      results.push({
        native: buildNativePromptWorkflow(request, [], "qwen/qwen3.5-2b", false, settings.h3PromptPresets, uiLocale),
        multimodal: buildMultimodalPromptWorkflow(request, [], { ...settings, promptModelId: "qwen/qwen3.8-27b-uncensored-q4" }, false, "GPU", false, undefined, 16384),
        qwen: buildQwenVlPeftPromptWorkflow(request, [], { ...settings, promptModelId: "lightx2v/minimax-h3-prompt-rewriter-8b" }),
        lm: await buildLmStudioChatRequest(request, settings, "qwen-instruct")
      });
    }
    expect(results[1]).toEqual(results[0]); expect(results[2]).toEqual(results[0]);
    expect(JSON.stringify(results[0])).toContain("你好");
    expect(JSON.stringify(results[0])).toContain("故乡");
  });

  it.each(locales)("preserves GPU/CPU decisions and runtime diagnosis facts (%s)", uiLocale => {
    const t = createNativeTranslator(uiLocale).t, id = "qwen/qwen3.8-27b-uncensored-q4";
    expect(() => multimodalDeviceFor(id, null, null, false, t)).toThrow(uiLocale === "en-US" ? "could not be determined" : uiLocale === "zh-TW" ? "無法確認" : "无法确认");
    expect(multimodalDeviceFor(id, null, null, true, t)).toBe("CPU");
    expect(multimodalDeviceFor(id, 0, 24 * 1024 ** 3, false, t)).toBe("GPU");
    const diagnostic = multimodalPromptOutputDiagnostics("用户输出", "T2VA", 100, { completion_tokens: 100, finish_reason: "length" });
    expect(diagnostic).toMatchObject({ completionTokens: 100, finishReason: "length", suspectedTruncation: true });
    expect(multimodalPromptFailureDiagnostic(diagnostic, t)).toContain(uiLocale === "en-US" ? "length limit may have been reached" : uiLocale === "zh-TW" ? "疑似達到" : "疑似达到");
  });

  it.each(locales)("keeps Qwen refresh flags and raw choices independent of translated errors (%s)", uiLocale => {
    const settings = { ...createDefaultSettings(), uiLocale, promptModelId: "lightx2v/minimax-h3-prompt-rewriter-8b" };
    for (const choices of [["(none)"], ["使用者模型", ...Array.from({ length: 9 }, (_, i) => "model-" + i)]]) {
      let error: unknown;
      try { validateQwenVlRuntimeChoices({ QwenVLModelLoader: { input: { required: { model_name: [choices] } } } }, settings); } catch (caught) { error = caught; }
      expect(error).toBeInstanceOf(QwenVlRuntimeValidationError);
      const failure = error as QwenVlRuntimeValidationError;
      expect(failure).toMatchObject({ nodeType: "QwenVLModelLoader", inputName: "model_name", choices, needsRuntimeRefresh: choices[0] === "(none)" });
      expect(failure.message).toContain(uiLocale === "en-US" ? "runtime did not find" : uiLocale === "zh-TW" ? "執行環境未找到" : "运行时未找到");
      if (choices[0] !== "(none)") expect(failure.message).toContain("使用者模型");
    }
    const raw = new Error("[Errno 9] Bad file descriptor: 外部诊断");
    const explained = explainQwenVlRuntimeError(raw, createNativeTranslator(uiLocale).t) as Error;
    expect(explained.message).toContain(raw.message);
    for (const nextLocale of locales) expect(explainQwenVlRuntimeError(explained, createNativeTranslator(nextLocale).t)).toBe(explained);
    expect(explainQwenVlRuntimeError(new Error("EACCES"))).toMatchObject({ message: "EACCES" });
  });

  it.each(["en-US", "zh-TW"] as const)("localizes HTTP/upload/empty-output errors and keeps external details (%s)", async uiLocale => {
    const t = createNativeTranslator(uiLocale).t;
    const settings = { ...createDefaultSettings(), uiLocale };
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-prompt-locale-")); roots.push(root);
    const file = path.join(root, "使用者参考图.png"); await fs.writeFile(file, "fixture");
    const network = vi.fn(async () => new Response("EACCES: 外部诊断", { status: 503 }));
    vi.stubGlobal("fetch", network);
    await expect(jsonRequest("http://fixture.invalid", undefined, t)).rejects.toThrow(uiLocale === "en-US" ? "returned HTTP 503: EACCES: 外部诊断" : "回傳 HTTP 503：EACCES: 外部诊断");
    await expect(uploadInput("http://fixture.invalid", file, new AbortController().signal, "使用者参考图", t)).rejects.toThrow(uiLocale === "en-US" ? "Failed to upload 使用者参考图" : "上傳使用者参考图失敗");
    await expect(freeMemory(settings)).rejects.toThrow(uiLocale === "en-US" ? "release GPU memory" : "釋放顯示記憶體");
    await expect(interrupt(settings)).rejects.toThrow(uiLocale === "en-US" ? "interrupt the task" : "中止任務");
    await expect(releaseMultimodalPromptModel(settings)).rejects.toThrow(uiLocale === "en-US" ? "model unload failed" : "模型卸載失敗");
    expect(() => extractStringNodeOutput({ outputs: {} }, ["preview"], t)).toThrow(uiLocale === "en-US" ? "usable prompt text" : "可用的提示詞文字");
    expect(extractStringNodeOutput({ outputs: { preview: { text: ["用户生成内容"] } } }, ["preview"], t)).toBe("用户生成内容");
    expect(await fs.readFile(file, "utf8")).toBe("fixture");
  });

  it.each(["en-US", "zh-TW"] as const)("uses the settings locale for native preflight and compatibility providers (%s)", async uiLocale => {
    const settings = { ...createDefaultSettings(), uiLocale };
    const network = vi.fn(async () => new Response("{}", { status: 200 })); vi.stubGlobal("fetch", network);
    await expect(enhancePromptWithComfyUi({ prompt: "", modelId: "fixture" }, settings, new AbortController().signal)).rejects.toThrow(uiLocale === "en-US" ? "Enter a prompt" : "請先輸入");
    await expect(enhancePrompt({ prompt: "用户正文", modelId: "fixture" }, { ...settings, promptUseLmStudio: false })).rejects.toThrow(uiLocale === "en-US" ? "LM Studio is disabled" : "目前已關閉");
    expect(await startLlamaPromptModel({ ...settings, promptModelId: "fixture" })).toMatchObject({ ok: false, message: expect.stringContaining(uiLocale === "en-US" ? "not an app-managed" : "不屬於") });
    expect(network).not.toHaveBeenCalled();
    network.mockImplementation(async () => new Response('{"devices":[]}', { status: 200 }));
    await expect(testComfyUi(settings)).resolves.toContain(uiLocale === "en-US" ? "Service is healthy" : "服務狀態正常");
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 403 })) as typeof fetch;
    await expect(unloadLmStudioModels(settings, fetchImpl)).rejects.toThrow(uiLocale === "en-US" ? "Could not read loaded" : "無法讀取");
  });
});
