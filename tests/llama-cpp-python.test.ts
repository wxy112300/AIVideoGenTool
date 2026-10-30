import { describe, expect, it } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import {
  installLlamaCppPythonPackage,
  llamaCppJamePengRepairWheel,
  llamaCppWheelIndexForCuda,
  llamaCppWheelSelectionForCuda,
  LLAMA_CPP_PYTHON_PROBE_SCRIPT,
  statusFromLlamaCppProbe,
  uninstallLlamaCppPythonPackage,
  type LlamaCppPythonRuntime
} from "../electron/services/llama-cpp-python";

describe("llama-cpp-python runtime", () => {
  it("localizes install/uninstall feedback while preserving wheel commands and raw logs", async () => {
    let baseline: string[][] | undefined;
    for (const [uiLocale, installed, uninstalled, progress] of [
      ["en-US", "llama-cpp-python is installed and passed the CUDA self-test. Restart ComfyUI before using Gemma prompt expansion.", "llama-cpp-python uninstalled.", "Download: 100% · 1.0 / 1.0 MB"],
      ["zh-TW", "llama-cpp-python 已安裝並通過 CUDA 自我檢測。請重新啟動 ComfyUI 後再使用 Gemma 擴寫。", "llama-cpp-python 已解除安裝。", "下載進度：100% · 1.0 / 1.0 MB"],
      ["zh-CN", "llama-cpp-python 已安装并通过 CUDA 自检。请重启 ComfyUI 后再使用 Gemma 扩写。", "llama-cpp-python 已卸载。", "下载进度：100% · 1.0 / 1.0 MB"]
    ] as const) {
      let present = false;
      const commands: string[][] = [];
      const logs: string[] = [];
      const runtime: LlamaCppPythonRuntime = {
        downloadEnvironment: () => ({}), proxyLogLabel: () => "proxy diagnostic",
        findComfyRoot: async () => "isolated-comfy", findComfyPython: async () => "isolated-python",
        runLoggedProcess: async (_executable, args, options) => {
          commands.push(args);
          expect(options.uiLocale).toBe(uiLocale);
          if (args[0] === "-c") return JSON.stringify({
            pythonVersion: "3.12.11", packageVersion: present ? "0.4.5+cu130" : "",
            importable: present, gpuOffload: present, dynamicBackend: true,
            cudaVersion: "13.0", torchVersion: "2.10.0+cu130",
            packageDirectory: "使用者套件/llama_cpp"
          });
          present = args.includes("install");
          options.onLog?.("Progress 1048576 of 1048576");
          options.onLog?.("external EACCES: 使用者檔案");
          return "pip complete";
        }
      };
      const settings = { ...createDefaultState().settings, uiLocale };
      const install = await installLlamaCppPythonPackage(settings, runtime, line => logs.push(line));
      expect(install).toMatchObject({ ok: true, message: installed });
      expect(logs).toContain(progress);
      expect(install.log).toContain("external EACCES: 使用者檔案");
      const uninstall = await uninstallLlamaCppPythonPackage(settings, runtime);
      expect(uninstall).toMatchObject({ ok: true, message: uninstalled });
      expect(uninstall.log).toContain("external EACCES: 使用者檔案");
      if (baseline) expect(commands).toEqual(baseline);
      else baseline = commands;
      expect(commands.filter(args => args.includes("pip"))).toHaveLength(2);
    }
  });

  it.each([
    ["en-US", "llama-cpp-python is installed but cannot be imported: DLL missing: 原文"],
    ["zh-TW", "llama-cpp-python 已安裝，但無法匯入：DLL missing: 原文"]
  ] as const)("preserves probe identity and raw diagnostics in %s", (locale, detail) => {
    const probe = { packageVersion: "0.4.5", packageDirectory: "使用者/llama_cpp", importError: "DLL missing: 原文" };
    const base = statusFromLlamaCppProbe("使用者/python.exe", probe);
    const localized = statusFromLlamaCppProbe("使用者/python.exe", probe, "", locale);
    expect(localized).toEqual({ ...base, detail });
    const crash = statusFromLlamaCppProbe("使用者/python.exe", { importError: "Windows 0xc000001d: 原文" }, "", locale);
    expect(crash).toMatchObject({ nativeCrash: true, nativeCrashCode: "0xC000001D", error: "Windows 0xc000001d: 原文" });
    expect(crash.detail).toContain("0xC000001D");
  });

  it.each([
    ["en-US", "The ComfyUI data directory was not found."],
    ["zh-TW", "找不到 ComfyUI 資料目錄。"]
  ] as const)("rejects missing data in %s before launching Python or pip", async (uiLocale, message) => {
    let ran = false;
    const runtime: LlamaCppPythonRuntime = {
      downloadEnvironment: () => ({}), proxyLogLabel: () => "proxy diagnostic",
      findComfyRoot: async () => "", findComfyPython: async () => { throw new Error("must not resolve Python"); },
      runLoggedProcess: async () => { ran = true; throw new Error("must not launch"); }
    };
    const settings = { ...createDefaultState().settings, uiLocale };
    expect(await installLlamaCppPythonPackage(settings, runtime)).toMatchObject({ ok: false, message });
    expect(await uninstallLlamaCppPythonPackage(settings, runtime)).toMatchObject({ ok: false, message });
    expect(ran).toBe(false);
  });

  it("preserves the discovered package directory even when native import fails, without guessing from Python", () => {
    const pythonPath = "C:\\Selected\\Scripts\\python.exe";
    expect(statusFromLlamaCppProbe(pythonPath, {
      packageVersion: "0.3.46", packageDirectory: " D:\\Packages\\llama_cpp ", importable: false, importError: "DLL missing"
    })).toMatchObject({ installed: true, ready: false, pythonPath, packageDirectory: "D:\\Packages\\llama_cpp" });
    expect(statusFromLlamaCppProbe(pythonPath, { packageVersion: "0.3.46" }).packageDirectory).toBeUndefined();
    expect(LLAMA_CPP_PYTHON_PROBE_SCRIPT.indexOf("distribution.locate_file(entry)")).toBeLessThan(LLAMA_CPP_PYTHON_PROBE_SCRIPT.indexOf("import torch"));
  });
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

  it("uninstalls only the llama-cpp-python package and verifies it is gone", async () => {
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
                packageVersion: "0.3.46+cu128",
                importable: true,
                gpuOffload: true,
                dynamicBackend: true,
                torchVersion: "2.8.0+cu129",
                cudaVersion: "12.9"
              }
            : {
                pythonVersion: "3.12.11",
                packageVersion: "",
                importable: false,
                gpuOffload: null,
                torchVersion: "2.8.0+cu129",
                cudaVersion: "12.9"
              });
        }
        return "Successfully uninstalled llama-cpp-python";
      }
    };

    const result = await uninstallLlamaCppPythonPackage(
      createDefaultState().settings,
      runtime
    );

    expect(result.ok).toBe(true);
    expect(processCalls).toContainEqual(expect.arrayContaining([
      "-m",
      "pip",
      "uninstall",
      "--yes",
      "llama-cpp-python"
    ]));
    expect(result.log).toContain("已确认 llama-cpp-python 已移除");
  });

  it("builds a pinned JamePeng dynamic-backend repair wheel for Python 3.12 / CUDA 12.9", () => {
    expect(llamaCppJamePengRepairWheel("12.9", "3.12.11", "win32"))
      .toContain("v0.4.5-cu128-win-20261025/llama_cpp_python-0.4.5%2Bcu128-cp312-cp312-win_amd64.whl");
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

  it("serializes concurrent repairs for the same ComfyUI Python", async () => {
    const processCalls: string[][] = [];
    let probeCount = 0;
    let pipRunning = false;
    let overlappingPip = false;
    const runtime: LlamaCppPythonRuntime = {
      downloadEnvironment: () => ({}),
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
                packageVersion: "0.3.46+cu130",
                importable: true,
                gpuOffload: true,
                dynamicBackend: true,
                torchVersion: "2.10.0+cu130",
                cudaVersion: "13.0"
              });
        }
        if (args.includes("pip")) {
          if (pipRunning) overlappingPip = true;
          pipRunning = true;
          await new Promise((resolve) => setTimeout(resolve, 10));
          pipRunning = false;
        }
        return "pip complete";
      }
    };

    const settings = createDefaultState().settings;
    const [first, second] = await Promise.all([
      installLlamaCppPythonPackage(settings, runtime),
      installLlamaCppPythonPackage(settings, runtime)
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(overlappingPip).toBe(false);
    expect(processCalls.filter((args) => args.includes("pip"))).toHaveLength(1);
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
      "https://github.com/JamePeng/llama-cpp-python/releases/download/v0.4.5-cu130-win-20261025/llama_cpp_python-0.4.5%2Bcu130-cp312-cp312-win_amd64.whl"
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
      "https://github.com/JamePeng/llama-cpp-python/releases/download/v0.4.5-cu128-win-20261025/llama_cpp_python-0.4.5%2Bcu128-cp312-cp312-win_amd64.whl"
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
