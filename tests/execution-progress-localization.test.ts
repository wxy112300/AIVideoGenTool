import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultSettings } from "../src/core/defaults.js";
import { createNativeTranslator } from "../electron/ui-translator.js";
import { historyFailure, nodeStage, progressForNode, TaskStalledError, waitForTask, workProgressForNode } from "../electron/services/comfy-ui.js";

vi.mock("../electron/services/comfy-log-bridge.js", () => ({
  resolveComfyLogRoot: async () => "",
  ComfyLogBridge: class {
    async prime() {}
    async syncIncremental() {}
    async captureFailure() {}
  }
}));

class FixtureSocket {
  static latest: FixtureSocket;
  closed = false;
  binaryType = "";
  private listeners = new Map<string, Array<(event: any) => unknown>>();
  constructor(_url: string) { FixtureSocket.latest = this; }
  addEventListener(type: string, callback: (event: any) => unknown) {
    this.listeners.set(type, [...this.listeners.get(type) ?? [], callback]);
  }
  async emit(type: string, event: unknown = {}) {
    await Promise.all((this.listeners.get(type) ?? []).map(callback => callback(event)));
  }
  async message(type: string, data: Record<string, unknown>) {
    await this.emit("message", { data: JSON.stringify({ type, data }) });
  }
  close() { this.closed = true; }
}
const locales = ["zh-CN", "en-US", "zh-TW"] as const;
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("localized execution progress", () => {
  it("keeps every stage range, progress value and work unit across languages", () => {
    const classes = [undefined, "TextGenerate", "VHS_LoadVideo", "LoadVideo", "H3ContinuumLoadVideo", "AetherScaleMotionAnalysis", "NvidiaDLSSFrameInterpolation", "DLSS5DepthAnythingV2", "DLSS5OpticalFlow", "SeedVR2Preprocess", "VAEEncodeTiled", "SeedVR2TemporalChunk", "SeedVR2LoadDiTModel", "SeedVR2LoadVAEModel", "SeedVR2VideoUpscaler", "SeedVR2BlockSwap", "SeedVR2TemporalMerge", "SeedVR2PostProcessing", "ImageUpscaleWithModel", "ImageScale", "LoadImage", "CLIPLoader", "CLIPTextEncode", "SamplerCustomAdvanced", "H3ContinuumSamplerV38", "MMH3UltimateUpscale", "VRAM_Debug", "LocalVideoStudioH3RequireGpuVAE", "VHS_VideoCombine", "VAEDecodeAudio", "VAEDecode", "RIFE VFI", "ImageFromBatch", "CreateVideo", "SaveVideo", "H3ContinuumAssembleSeamV35", "使用者自订节点"];
    for (const uiLocale of locales) {
      const t = createNativeTranslator(uiLocale).t;
      for (const classType of classes) {
        const base = nodeStage(classType), localized = nodeStage(classType, t);
        expect({ ...localized, label: base.label }).toEqual(base);
        expect(progressForNode(classType, 3.35, 12, undefined, undefined, t).progress).toBe(progressForNode(classType, 3.35, 12).progress);
        if (uiLocale === "en-US" && classType !== "使用者自订节点") expect(localized.label).not.toMatch(/\p{Script=Han}/u);
      }
      expect(nodeStage("使用者自订节点", t).label).toBe("使用者自订节点");
      const source = { continuumNodeRoles: { source: "source-decode" as const } };
      expect(progressForNode("VAEDecode", 1, 2, source, "source", t)).toMatchObject({ progress: 9.5 });
      expect(workProgressForNode("MMH3UltimateUpscale", 3.35, 12, 0, 1000)).toMatchObject({ value: 3.35, max: 12, unit: "piece" });
      const piece = progressForNode("MMH3UltimateUpscale", 3.35, 12, undefined, undefined, t);
      expect(piece.label).toContain(uiLocale === "en-US" ? "Current piece 35%" : uiLocale === "zh-TW" ? "目前區塊 35%" : "当前块 35%");
      expect(new TaskStalledError(3, undefined, t)).toBeInstanceOf(TaskStalledError);
      expect(new TaskStalledError(3, "外部诊断", t).message).toContain("外部诊断");
    }
    expect(new TaskStalledError(3).message).toBe("任务连续 3 分钟未上报节点进展。");
  });

  it.each(locales)("preserves external failure details and localizes only wrappers (%s)", uiLocale => {
    const t = createNativeTranslator(uiLocale).t;
    expect(historyFailure({ status: { status_str: "success" } }, t)).toBe("");
    const raw = { status: { status_str: "error", messages: [["execution_error", { exception_type: "CUDAError", exception_message: "EACCES: 使用者文件" }]] } };
    expect(historyFailure(raw, t)).toBe("CUDAError: EACCES: 使用者文件");
    expect(historyFailure({ status: { status_str: "error" } }, t)).toContain(uiLocale === "en-US" ? "task ended: error" : uiLocale === "zh-TW" ? "任務結束：error" : "任务结束：error");
    const descriptor = { status: { status_str: "error", messages: [["execution_error", { exception_type: "OSError", exception_message: "[Errno 9] Bad file descriptor: 外部诊断" }]] } };
    expect(historyFailure(descriptor, t)).toContain("OSError: [Errno 9] Bad file descriptor: 外部诊断");
    expect(historyFailure(descriptor, t)).toContain(uiLocale === "en-US" ? "log handle is invalid" : uiLocale === "zh-TW" ? "日誌控制代碼已失效" : "日志句柄已失效");
  });
});

describe("localized ComfyUI wait protocol", () => {
  function wait(uiLocale: typeof locales[number], signal = new AbortController().signal, onProgress = vi.fn(), minutes = 5) {
    vi.stubGlobal("WebSocket", FixtureSocket);
    return waitForTask("owned-prompt", "owned-client", { sampler: "MMH3UltimateUpscale" }, { ...createDefaultSettings(), comfyUrl: "http://fixture.invalid", uiLocale }, minutes, signal, onProgress, vi.fn());
  }

  it.each(locales)("localizes WebSocket stages and terminal progress while retaining IDs and values (%s)", async uiLocale => {
    const onProgress = vi.fn(), calls: string[] = [];
    const result = { prompt: [0, "owned-prompt", {}, { client_id: "owned-client" }], status: { completed: true, status_str: "success" }, outputs: { preview: { text: ["用户输出"] } } };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes("/history")) {
        await FixtureSocket.latest.message("execution_error", { prompt_id: "other-prompt", exception_message: "Unrelated failure" });
        await FixtureSocket.latest.message("executing", { prompt_id: "owned-prompt", node: "sampler" });
        await FixtureSocket.latest.message("progress", { prompt_id: "owned-prompt", node: "sampler", value: 3.35, max: 12 });
        await FixtureSocket.latest.message("executed", { prompt_id: "owned-prompt", node: "sampler" });
        return new Response(JSON.stringify({ "owned-prompt": result }));
      }
      return new Response('{"queue_running":[]}');
    }));
    expect(await wait(uiLocale, undefined, onProgress)).toEqual(result);
    expect(onProgress.mock.calls.some(([value, label]) => value === 32.4 && label.includes(uiLocale === "en-US" ? "Current piece 35%" : uiLocale === "zh-TW" ? "目前區塊 35%" : "当前块 35%"))).toBe(true);
    expect(onProgress.mock.calls.at(-1)).toEqual([100, uiLocale === "en-US" ? "Completed" : "已完成", false, undefined]);
    expect(calls.map(url => new URL(url).pathname)).toEqual(["/history", "/queue"]);
    expect(FixtureSocket.latest.closed).toBe(true);
  });

  it.each(locales)("localizes interruption without changing rejection and socket cleanup (%s)", async uiLocale => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/history")) await FixtureSocket.latest.message("execution_interrupted", { prompt_id: "owned-prompt" });
      return new Response("{}");
    }));
    const settled = wait(uiLocale).then(() => null, error => error);
    await vi.advanceTimersByTimeAsync(2001);
    const error = await settled;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe(uiLocale === "en-US" ? "ComfyUI task was interrupted" : uiLocale === "zh-TW" ? "ComfyUI 任務已中止" : "ComfyUI 任务已中止");
    expect(FixtureSocket.latest.closed).toBe(true);
  });

  it.each(locales)("keeps the stalled error type at the same inactivity deadline (%s)", async uiLocale => {
    vi.useFakeTimers();
    const network = vi.fn(async () => new Response("{}")); vi.stubGlobal("fetch", network);
    const settled = wait(uiLocale, undefined, undefined, 0.001).then(() => null, error => error);
    await vi.advanceTimersByTimeAsync(2001);
    const error = await settled;
    expect(error).toBeInstanceOf(TaskStalledError);
    expect(error.name).toBe("TaskStalledError");
    expect(error.message).toContain(uiLocale === "en-US" ? "no node progress reported" : uiLocale === "zh-TW" ? "未回報節點進展" : "未上报节点进展");
    expect(network).toHaveBeenCalledTimes(2);
    expect(FixtureSocket.latest.closed).toBe(true);
  });

  it.each(locales)("keeps the disconnected-service branch after two failures (%s)", async uiLocale => {
    vi.useFakeTimers();
    const network = vi.fn(async () => {
      await FixtureSocket.latest.emit("open");
      await FixtureSocket.latest.emit("close", { code: 1006, reason: "外部断线" });
      throw new Error("ECONNRESET: 外部诊断");
    });
    vi.stubGlobal("fetch", network);
    const settled = wait(uiLocale).then(() => null, error => error);
    await vi.advanceTimersByTimeAsync(2001);
    const error = await settled;
    expect(error).toBeInstanceOf(TaskStalledError);
    expect(error.message).toContain(uiLocale === "en-US" ? "connection was lost" : uiLocale === "zh-TW" ? "連線中斷" : "连接中断");
    expect(network).toHaveBeenCalledTimes(2);
    expect(FixtureSocket.latest.closed).toBe(true);
  });

  it.each(locales)("rejects owned failed history while ignoring another client's record (%s)", async uiLocale => {
    const onProgress = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("/history") ? {
      foreign: { prompt: [0, "other", {}, { client_id: "other-client" }], status: { status_str: "error", messages: [["execution_error", { exception_message: "FOREIGN" }]] } },
      owned: { prompt: [0, "owned-prompt", {}, { client_id: "owned-client" }], status: { status_str: "error" } }
    } : {}))));
    await expect(wait(uiLocale, undefined, onProgress)).rejects.toThrow(uiLocale === "en-US" ? "ComfyUI task ended: error" : uiLocale === "zh-TW" ? "ComfyUI 任務結束：error" : "ComfyUI 任务结束：error");
    expect(onProgress).not.toHaveBeenCalledWith(100, expect.anything(), expect.anything(), expect.anything());
    expect(FixtureSocket.latest.closed).toBe(true);
  });

  it("preserves caller cancellation reasons without translating or replacing them", async () => {
    vi.useFakeTimers();
    const controller = new AbortController(), reason = new Error("使用者取消");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
    const settled = wait("en-US", controller.signal).then(() => null, error => error);
    await vi.advanceTimersByTimeAsync(1); controller.abort(reason);
    expect(await settled).toBe(reason);
    expect(FixtureSocket.latest.closed).toBe(true);
  });
});
