import { describe, expect, it } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import {
  installLlamaCppPythonPackage,
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

  it("loads PyTorch before llama_cpp so Windows CUDA DLLs are registered", () => {
    expect(LLAMA_CPP_PYTHON_PROBE_SCRIPT.indexOf("import torch")).toBeLessThan(
      LLAMA_CPP_PYTHON_PROBE_SCRIPT.indexOf("import llama_cpp")
    );
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
                packageVersion: "",
                importable: false,
                gpuOffload: null,
                torchVersion: "2.10.0+cu130",
                cudaVersion: "13.0"
              }
            : {
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
      "--extra-index-url",
      "https://abetlen.github.io/llama-cpp-python/whl/cu130",
      "llama-cpp-python>=0.3.34,<0.4"
    ]));
    expect(result.log).toContain("自检通过");
  });
});
