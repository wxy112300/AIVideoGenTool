import { describe, expect, it } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import {
  installLlamaCppPythonPackage,
  llamaCppJamePengRepairWheel,
  llamaCppWheelIndexForCuda,
  llamaCppWheelSelectionForCuda,
  LLAMA_CPP_PYTHON_PROBE_SCRIPT,
  statusFromLlamaCppProbe,
  type LlamaCppPythonRuntime
} from "../electron/services/llama-cpp-python";

describe("llama-cpp-python runtime", () => {
  it("requires an explicit supported CUDA wheel index on Windows", () => {
    expect(llamaCppWheelIndexForCuda("13.0", "win32")).toContain("/cu130");
    expect(llamaCppWheelIndexForCuda("12.6", "win32")).toContain("/cu125");
    expect(llamaCppWheelIndexForCuda("12.9", "win32")).toContain("/cu125");
    expect(llamaCppWheelSelectionForCuda("12.9", "win32")).toEqual({
      requestedKey: "cu129",
      wheelKey: "cu125",
      exact: false
    });
    expect(llamaCppWheelIndexForCuda("13.1", "win32")).toBeNull();
    expect(llamaCppWheelIndexForCuda("13.0", "linux")).toBeNull();
  });

  it("distinguishes an installed CPU package from a CUDA-ready backend", () => {
    expect(statusFromLlamaCppProbe("python.exe", {
      packageVersion: "0.3.34",
      importable: true,
      gpuOffload: false,
      torchVersion: "2.10.0+cu130",
      cudaVersion: "13.0"
    })).toMatchObject({
      installed: true,
      importable: true,
      gpuOffload: false,
      ready: false,
      detail: "已安装，但当前是 CPU 后端；Gemma 需要 CUDA 后端"
    });
  });

  it("recognizes Windows illegal-instruction crashes as an installed but broken native runtime", () => {
    expect(statusFromLlamaCppProbe("python.exe", {
      packageVersion: "0.3.34",
      importable: false,
      gpuOffload: null,
      importError: "Windows Error 0xc000001d"
    })).toMatchObject({
      installed: true,
      ready: false,
      nativeCrash: true,
      nativeCrashCode: "0xC000001D"
    });
  });

  it("does not call a legacy Windows static backend ready after a shallow import check", () => {
    expect(statusFromLlamaCppProbe("python.exe", {
      packageVersion: "0.3.34",
      importable: true,
      gpuOffload: true,
      dynamicBackend: false,
      torchVersion: "2.8.0+cu129",
      cudaVersion: "12.9"
    })).toMatchObject({
      installed: true,
      ready: false,
      detail: expect.stringContaining("旧版或不可用")
    });
  });

  it("builds a pinned JamePeng dynamic-backend repair wheel for Python 3.12 / CUDA 12.9", () => {
    expect(llamaCppJamePengRepairWheel("12.9", "3.12.11", "win32"))
      .toContain("v0.3.46-cu128-win-20260808/llama_cpp_python-0.3.46%2Bcu128-cp312-cp312-win_amd64.whl");
  });

  it("rejects unpublished Python ABIs instead of constructing a wheel URL that will 404", () => {
    expect(llamaCppJamePengRepairWheel("12.9", "3.9.13", "win32")).toBeNull();
    expect(llamaCppJamePengRepairWheel("12.9", "3.15.0", "win32")).toBeNull();
  });

  it("loads PyTorch before llama_cpp so Windows CUDA DLLs are registered", () => {
    expect(LLAMA_CPP_PYTHON_PROBE_SCRIPT.indexOf("import torch")).toBeLessThan(
      LLAMA_CPP_PYTHON_PROBE_SCRIPT.indexOf("import llama_cpp")
    );
    expect(LLAMA_CPP_PYTHON_PROBE_SCRIPT).toContain("ggml_backend_load_all_from_path");
  });

  it("does not download the shared backend again when a node installer only needs to ensure it", async () => {
    const processCalls: string[][] = [];
    const runtime: LlamaCppPythonRuntime = {
      downloadEnvironment: () => ({}),
      proxyLogLabel: () => "代理：关闭",
      findComfyRoot: async () => "C:\\ComfyUI",
      findComfyPython: async () => "C:\\ComfyUI\\.venv\\Scripts\\python.exe",
      runLoggedProcess: async (_executable, args) => {
        processCalls.push(args);
        return JSON.stringify({
          pythonVersion: "3.12.11",
          packageVersion: "0.3.46+cu128",
          importable: true,
          gpuOffload: true,
          dynamicBackend: true,
          torchVersion: "2.8.0+cu129",
          cudaVersion: "12.9"
        });
      }
    };

    const result = await installLlamaCppPythonPackage(
      createDefaultState().settings,
      runtime,
      undefined,
      { forceReinstall: false }
    );

    expect(result.ok).toBe(true);
    expect(result.message).toContain("无需重复安装");
    expect(processCalls).toHaveLength(1);
  });

  it("installs the matching wheel and verifies the imported CUDA backend", async () => {
    const processCalls: string[][] = [];
    let probeCount = 0;
    const runtime: LlamaCppPythonRuntime = {
      downloadEnvironment: () => ({ TEST_RUNTIME: "1" }),
      proxyLogLabel: () => "代理：关闭",
      findComfyRoot: async () => "C:\\ComfyUI",
      findComfyPython: async () => "C:\\ComfyUI\\.venv\\Scripts\\python.exe",
      runLoggedProcess: async (_executable, args) => {
        processCalls.push(args);
        if (args[0] === "-c") {
          probeCount += 1;
          return JSON.stringify(probeCount === 1
            ? {
                pythonVersion: "3.12.11",
                packageVersion: "",
                importable: false,
                gpuOffload: null,
                torchVersion: "2.10.0+cu130",
                cudaVersion: "13.0"
              }
            : {
                pythonVersion: "3.12.11",
                packageVersion: "0.3.34",
                importable: true,
                gpuOffload: true,
                torchVersion: "2.10.0+cu130",
                cudaVersion: "13.0"
              });
        }
        return "pip completed";
      }
    };

    const result = await installLlamaCppPythonPackage(
      createDefaultState().settings,
      runtime
    );

    expect(result.ok).toBe(true);
    expect(processCalls[1]).toEqual(expect.arrayContaining([
      "--only-binary=:all:",
      "--no-cache-dir",
      "--no-deps",
      "--progress-bar=raw",
      "https://github.com/JamePeng/llama-cpp-python/releases/download/v0.3.46-cu130-win-20260808/llama_cpp_python-0.3.46%2Bcu130-cp312-cp312-win_amd64.whl"
    ]));
    expect(result.log).toContain("自检通过");
  });

  it("switches to the dynamic-backend repair wheel after a native crash", async () => {
    const processCalls: string[][] = [];
    let probeCount = 0;
    const runtime: LlamaCppPythonRuntime = {
      downloadEnvironment: () => ({ TEST_RUNTIME: "1" }),
      proxyLogLabel: () => "代理：关闭",
      findComfyRoot: async () => "C:\\ComfyUI",
      findComfyPython: async () => "C:\\ComfyUI\\.venv\\Scripts\\python.exe",
      runLoggedProcess: async (_executable, args) => {
        processCalls.push(args);
        if (args[0] === "-c") {
          probeCount += 1;
          return JSON.stringify(probeCount === 1
            ? {
                pythonVersion: "3.12.11",
                packageVersion: "0.3.34",
                importable: false,
                gpuOffload: null,
                torchVersion: "2.8.0+cu129",
                cudaVersion: "12.9",
                importError: "WinError -1073741795"
              }
            : {
                pythonVersion: "3.12.11",
                packageVersion: "0.3.46+cu128",
                importable: true,
                gpuOffload: true,
                torchVersion: "2.8.0+cu129",
                cudaVersion: "12.9"
              });
        }
        return "pip completed";
      }
    };

    const result = await installLlamaCppPythonPackage(
      createDefaultState().settings,
      runtime
    );

    expect(result.ok).toBe(true);
    expect(processCalls[1]).toEqual(expect.arrayContaining([
      "--force-reinstall",
      "--no-cache-dir",
      "--no-deps",
      "--progress-bar=raw",
      "https://github.com/JamePeng/llama-cpp-python/releases/download/v0.3.46-cu128-win-20260808/llama_cpp_python-0.3.46%2Bcu128-cp312-cp312-win_amd64.whl"
    ]));
    expect(result.log).toContain("动态 CUDA/CPU 后端");
  });

  it("turns pip raw download output into throttled readable progress", async () => {
    const messages: string[] = [];
    let probeCount = 0;
    const runtime: LlamaCppPythonRuntime = {
      downloadEnvironment: () => ({}),
      proxyLogLabel: () => "代理：关闭",
      findComfyRoot: async () => "C:\\ComfyUI",
      findComfyPython: async () => "C:\\ComfyUI\\.venv\\Scripts\\python.exe",
      runLoggedProcess: async (_executable, args, options) => {
        if (args[0] === "-c") {
          probeCount += 1;
          return JSON.stringify({
            pythonVersion: "3.12.11",
            packageVersion: probeCount === 1 ? "" : "0.3.46+cu128",
            importable: probeCount > 1,
            gpuOffload: probeCount > 1,
            dynamicBackend: probeCount > 1,
            torchVersion: "2.8.0+cu129",
            cudaVersion: "12.9"
          });
        }
        options.onLog?.("Progress 0 of 104857600");
        options.onLog?.("Progress 1048576 of 104857600");
        options.onLog?.("Progress 2097152 of 104857600");
        options.onLog?.("Progress 104857600 of 104857600");
        return "pip completed";
      }
    };

    const result = await installLlamaCppPythonPackage(
      createDefaultState().settings,
      runtime,
      (message) => messages.push(message)
    );

    expect(result.ok).toBe(true);
    expect(messages).toContain("下载进度：0% · 0.0 / 100.0 MB");
    expect(messages).not.toContain("下载进度：1% · 1.0 / 100.0 MB");
    expect(messages).toContain("下载进度：2% · 2.0 / 100.0 MB");
    expect(messages).toContain("下载进度：100% · 100.0 / 100.0 MB");
  });
});
