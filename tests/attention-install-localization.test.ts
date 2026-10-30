import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultSettings } from "../src/core/defaults.js";
import { installAttentionAcceleration } from "../electron/services/environment.js";
import { inspectAttentionPython } from "../electron/services/attention-python-probe.js";
import { findComfyRoot, findComfyInstallation } from "../electron/services/comfy-discovery.js";
import { spawn } from "node:child_process";
import { H3_COMFY_KITCHEN_VERSION } from "../src/core/catalog/index.js";

vi.mock("../electron/services/comfy-discovery.js", async (original) => ({
  ...await original<typeof import("../electron/services/comfy-discovery.js")>(),
  findComfyRoot: vi.fn(),
  findComfyInstallation: vi.fn()
}));
vi.mock("../electron/services/attention-python-probe.js", async (original) => ({
  ...await original<typeof import("../electron/services/attention-python-probe.js")>(),
  inspectAttentionPython: vi.fn()
}));
vi.mock("node:child_process", async (original) => {
  const actual = await original<typeof import("node:child_process")>();
  const { EventEmitter } = await import("node:events");
  const { PassThrough } = await import("node:stream");
  const execFile = Object.assign(vi.fn(), {
    [Symbol.for("nodejs.util.promisify.custom")]: async () => ({ stdout: "Python 3.12.0", stderr: "" })
  });
  return {
    ...actual,
    execFile,
    spawn: vi.fn(() => {
      const child = Object.assign(new EventEmitter(), {
        stdout: new PassThrough(), stderr: new PassThrough()
      });
      queueMicrotask(() => {
        child.stdout.write("external diagnostic: 原文\n");
        child.stdout.end(); child.stderr.end(); child.emit("close", 0);
      });
      return child;
    })
  };
});

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("Attention installation messages", () => {
  it("keeps installation commands and external output identical across languages", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "attention-locale-"));
    const nodeDirectory = path.join(root, "custom_nodes", "ComfyUI-KJNodes", "nodes");
    await fs.mkdir(nodeDirectory, { recursive: true });
    await fs.writeFile(path.join(nodeDirectory, "model_optimization_nodes.py"),
      "PathchSageAttentionKJ optimized_attention_override 2**31 q.contiguous() k.contiguous() v.contiguous()");
    vi.mocked(findComfyRoot).mockResolvedValue(root);
    vi.mocked(findComfyInstallation).mockResolvedValue({ sourceDirectory: root } as never);
    vi.mocked(inspectAttentionPython).mockResolvedValue({
      probeState: "complete", pythonVersion: "3.12.0",
      torchVersion: "2.10.0+cu130", torchvisionVersion: "0.25.0+cu130",
      torchaudioVersion: "2.10.0+cu130", cudaVersion: "13.0",
      gpuName: "Test GPU", gpuArchitecture: "8.9",
      comfyKitchenVersion: H3_COMFY_KITCHEN_VERSION, comfyKitchenBackends: ["cuda"],
      sageAttentionVersion: "2.2.0+cu130torch2.10", sageNativeReady: true, tritonVersion: "3.6.0"
    });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    let baseline: unknown;
    try {
      for (const [uiLocale, message, stage] of [
        ["en-US", "The H3 inference acceleration environment is installed and passed the CUDA self-test.", "Running the CUDA Attention self-test…"],
        ["zh-TW", "H3 推論加速環境已安裝並通過 CUDA 自我檢測。", "正在執行 CUDA Attention 自我檢測……"],
        ["zh-CN", "H3 推理加速环境已安装并通过 CUDA 自检。", "正在运行 CUDA Attention 自检……"]
      ] as const) {
        vi.mocked(spawn).mockClear();
        const logs: string[] = [];
        const result = await installAttentionAcceleration({
          ...createDefaultSettings(), uiLocale, comfyPythonPath: process.execPath
        }, line => logs.push(line));
        expect(result).toMatchObject({ ok: true, message });
        expect(logs).toContain(stage);
        expect(logs).toContain("external diagnostic: 原文");
        expect(result.log).toContain("external diagnostic: 原文");
        const commands = vi.mocked(spawn).mock.calls.map(([exe, args]) => [exe, args]);
        expect(commands).toHaveLength(3);
        expect(commands[0]?.[1]).toContain("triton-windows>=3.6,<3.7");
        expect(commands[1]?.[1]).toContain("sageattention==2.2.0+cu130torch2.10");
        if (baseline) expect(commands).toEqual(baseline);
        else baseline = commands;
      }
      const complete = await vi.mocked(inspectAttentionPython)();
      vi.mocked(inspectAttentionPython)
        .mockResolvedValueOnce(complete)
        .mockResolvedValueOnce(complete)
        .mockResolvedValueOnce({ probeState: "failed", probeStage: "native-import", probeError: "EACCES: 外部原文" });
      const failed = await installAttentionAcceleration({
        ...createDefaultSettings(), uiLocale: "en-US", comfyPythonPath: process.execPath
      });
      expect(failed).toMatchObject({
        ok: false,
        message: "Post-installation check failed: H3 environment detection did not complete (native-import): EACCES: 外部原文. Scan again; these results cannot determine whether dependencies are missing."
      });
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });

  it.each([
    ["en-US", "Select a complete ComfyUI installation and data directory in Settings first.", "Proxy: off"],
    ["zh-TW", "請先在設定中選擇完整的 ComfyUI 安裝與資料目錄。", "代理伺服器：關閉"],
    ["zh-CN", "请先在设置中选择完整的 ComfyUI 安装和数据目录。", "代理：关闭"]
  ] as const)("reports missing installation in %s without a subprocess", async (uiLocale, message, proxy) => {
    vi.mocked(findComfyRoot).mockResolvedValue("");
    vi.mocked(findComfyInstallation).mockResolvedValue(null);
    const logs: string[] = [];
    const result = await installAttentionAcceleration({ ...createDefaultSettings(), uiLocale }, line => logs.push(line));
    expect(result).toMatchObject({ ok: false, message });
    expect(logs).toEqual([proxy, message]);
    expect(spawn).not.toHaveBeenCalled();
    expect(inspectAttentionPython).not.toHaveBeenCalled();
  });

  it.each([
    ["en-US", "SageAttention 2.2 requires an SM 8.0+ NVIDIA GPU; detected 使用者 GPU / SM 7.5."],
    ["zh-TW", "SageAttention 2.2 需要 SM 8.0+ NVIDIA GPU；目前偵測結果為 使用者 GPU / SM 7.5。"]
  ] as const)("preserves device identity in the %s GPU guard", async (uiLocale, message) => {
    vi.mocked(findComfyRoot).mockResolvedValue("isolated-comfy");
    vi.mocked(findComfyInstallation).mockResolvedValue({ sourceDirectory: "isolated-comfy" } as never);
    vi.mocked(inspectAttentionPython).mockResolvedValue({
      probeState: "complete", gpuName: "使用者 GPU", gpuArchitecture: "7.5"
    });
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const result = await installAttentionAcceleration({
      ...createDefaultSettings(), uiLocale, comfyPythonPath: process.execPath
    });
    expect(result).toMatchObject({ ok: false, message });
    expect(spawn).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
