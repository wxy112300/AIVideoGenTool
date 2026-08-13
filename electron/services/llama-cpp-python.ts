import type { Settings, LlamaCppPythonStatus } from "../../src/types.js";

export const LLAMA_CPP_PYTHON_REQUIREMENT = "llama-cpp-python>=0.3.34,<0.4";
export const LLAMA_CPP_PYTHON_WHEEL_ROOT =
  "https://abetlen.github.io/llama-cpp-python/whl";

interface LlamaCppPythonProbe {
  pythonVersion?: string;
  packageVersion?: string;
  importable?: boolean;
  gpuOffload?: boolean | null;
  torchVersion?: string;
  cudaVersion?: string;
  importError?: string;
}

interface LlamaCppProcessError extends Error {
  stdout?: string;
}

export interface LlamaCppPythonRuntime {
  downloadEnvironment(settings: Settings): NodeJS.ProcessEnv;
  proxyLogLabel(settings: Settings): string;
  findComfyRoot(settings: Settings): Promise<string>;
  findComfyPython(settings: Settings, comfyRoot: string): Promise<string>;
  runLoggedProcess(
    executable: string,
    args: string[],
    options: {
      cwd?: string;
      env?: NodeJS.ProcessEnv;
      timeoutMs?: number;
      onLog?: (message: string) => void;
    }
  ): Promise<string>;
}

const probeScript = [
  "import importlib.metadata as metadata, json, platform",
  "result = {'pythonVersion': platform.python_version(), 'packageVersion': '', 'importable': False, 'gpuOffload': None, 'torchVersion': '', 'cudaVersion': '', 'importError': ''}",
  "try: result['packageVersion'] = metadata.version('llama-cpp-python')",
  "except Exception: pass",
  // On Windows the CUDA wheel's llama.dll depends on the CUDA DLLs that
  // PyTorch registers while it is imported. Importing llama_cpp first can
  // therefore report a misleading \"could not find module\" error even when
  // the installed wheel is correct and ComfyUI itself can load it.
  "try:",
  "    import torch",
  "    result['torchVersion'] = str(torch.__version__)",
  "    result['cudaVersion'] = str(torch.version.cuda or '')",
  "except Exception: pass",
  "try:",
  "    import llama_cpp",
  "    result['importable'] = True",
  "    support = getattr(llama_cpp, 'llama_supports_gpu_offload', None)",
  "    if support is None: support = getattr(getattr(llama_cpp, 'llama_cpp', None), 'llama_supports_gpu_offload', None)",
  "    if support is not None: result['gpuOffload'] = bool(support())",
  "except Exception as error: result['importError'] = str(error)",
  "print(json.dumps(result, ensure_ascii=False))"
].join("\n");

// Exported for the focused installer test so the Windows DLL load ordering
// remains intentional when this probe is refactored.
export const LLAMA_CPP_PYTHON_PROBE_SCRIPT = probeScript;

function emptyStatus(pythonPath = ""): LlamaCppPythonStatus {
  return {
    packageName: "llama-cpp-python",
    pythonPath,
    pythonVersion: "",
    packageVersion: "",
    torchVersion: "",
    cudaVersion: "",
    installed: false,
    importable: false,
    gpuOffload: null,
    ready: false,
    detail: pythonPath ? "尚未安装 llama-cpp-python" : "未找到所选 ComfyUI Python",
    error: ""
  };
}

function lastJsonLine(output: string): string {
  return output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1) ?? "";
}

export function statusFromLlamaCppProbe(
  pythonPath: string,
  probe: LlamaCppPythonProbe,
  error = ""
): LlamaCppPythonStatus {
  const packageVersion = probe.packageVersion?.trim() ?? "";
  const importable = probe.importable === true;
  const gpuOffload = typeof probe.gpuOffload === "boolean" ? probe.gpuOffload : null;
  const installed = Boolean(packageVersion || importable);
  const importError = probe.importError?.trim() || error.trim();
  let detail = "尚未安装 llama-cpp-python";
  if (installed && !importable) {
    detail = `llama-cpp-python 已安装，但无法导入${importError ? `：${importError}` : ""}`;
  } else if (importable && gpuOffload === false) {
    detail = "已安装，但当前是 CPU 后端；Gemma 需要 CUDA 后端";
  } else if (importable && gpuOffload === null) {
    detail = "已导入，但无法确认 CUDA 后端；请执行修复安装";
  } else if (importable && gpuOffload === true) {
    detail = `CUDA 后端已就绪${packageVersion ? ` · v${packageVersion}` : ""}`;
  }
  return {
    packageName: "llama-cpp-python",
    pythonPath,
    pythonVersion: probe.pythonVersion?.trim() ?? "",
    packageVersion,
    torchVersion: probe.torchVersion?.trim() ?? "",
    cudaVersion: probe.cudaVersion?.trim() ?? "",
    installed,
    importable,
    gpuOffload,
    ready: importable && gpuOffload === true,
    detail,
    error: importError
  };
}

export async function inspectLlamaCppPython(
  pythonPath: string,
  runLoggedProcess: LlamaCppPythonRuntime["runLoggedProcess"]
): Promise<LlamaCppPythonStatus> {
  if (!pythonPath) return emptyStatus();
  try {
    const output = await runLoggedProcess(
      pythonPath,
      ["-c", probeScript],
      { timeoutMs: 30_000 }
    );
    const parsed = JSON.parse(lastJsonLine(output)) as LlamaCppPythonProbe;
    return statusFromLlamaCppProbe(pythonPath, parsed);
  } catch (error) {
    const processError = error as LlamaCppProcessError;
    const output = processError.stdout ?? "";
    try {
      const parsed = JSON.parse(lastJsonLine(output)) as LlamaCppPythonProbe;
      return statusFromLlamaCppProbe(
        pythonPath,
        parsed,
        processError.message
      );
    } catch {
      return statusFromLlamaCppProbe(pythonPath, {
        pythonVersion: "",
        packageVersion: "",
        importable: false,
        gpuOffload: null,
        importError: processError.message
      }, processError.message);
    }
  }
}

export function llamaCppWheelIndexForCuda(
  cudaVersion: string,
  platform: NodeJS.Platform = process.platform
): string | null {
  if (platform !== "win32") return null;
  const match = cudaVersion.trim().match(/^(\d+)\.(\d+)/u);
  if (!match) return null;
  const key = `cu${match[1]}${match[2]}`;
  // These are the CUDA variants published by the upstream Windows wheel index.
  // Refuse an unknown runtime instead of silently falling back to a CPU/source build.
  if (!["cu121", "cu122", "cu123", "cu124", "cu125", "cu126", "cu128", "cu129", "cu130"].includes(key)) {
    return null;
  }
  return `${LLAMA_CPP_PYTHON_WHEEL_ROOT}/${key}`;
}

export async function installLlamaCppPythonPackage(
  settings: Settings,
  runtime: LlamaCppPythonRuntime,
  onLog?: (message: string) => void
): Promise<{ ok: boolean; message: string; log?: string }> {
  const log: string[] = [];
  const report = (message: string) => {
    const normalized = message.trim();
    if (!normalized) return;
    log.push(normalized);
    onLog?.(normalized);
  };
  try {
    const environment = runtime.downloadEnvironment(settings);
    report(runtime.proxyLogLabel(settings));
    report("正在定位所选 ComfyUI Python，并检查 llama-cpp-python……");
    const comfyRoot = await runtime.findComfyRoot(settings);
    if (!comfyRoot) throw new Error("没有找到 ComfyUI 数据目录。");
    const python = await runtime.findComfyPython(settings, comfyRoot);
    if (!python) throw new Error("没有找到所选 ComfyUI 的 Python 环境。");
    const before = await inspectLlamaCppPython(python, runtime.runLoggedProcess);
    if (before.ready) {
      report(`llama-cpp-python 已就绪：${before.detail}`);
      return { ok: true, message: "llama-cpp-python 已经就绪，无需重复安装。", log: log.join("\n\n") };
    }
    const wheelIndex = llamaCppWheelIndexForCuda(before.cudaVersion);
    if (process.platform === "win32" && !wheelIndex) {
      throw new Error(
        `当前 ComfyUI Python 的 PyTorch CUDA 版本为 ${before.cudaVersion || "未知"}，没有匹配的预编译 llama-cpp-python wheel；已拒绝回退到 CPU 或源码编译。`
      );
    }
    report(
      wheelIndex
        ? `安装 CUDA ${before.cudaVersion} 预编译后端（不会启动独立 llama-server）……`
        : "安装 llama-cpp-python 后端……"
    );
    const args = [
      "-m", "pip", "install", "--upgrade",
      ...(before.installed ? ["--force-reinstall"] : []),
      "--disable-pip-version-check", "--no-input",
      "--only-binary=:all:"
    ];
    if (wheelIndex) args.push("--extra-index-url", wheelIndex);
    args.push(LLAMA_CPP_PYTHON_REQUIREMENT);
    await runtime.runLoggedProcess(python, args, {
      timeoutMs: 1_200_000,
      env: environment,
      onLog: report
    });
    report("pip 安装完成，正在执行 import 与 CUDA 后端自检……");
    const after = await inspectLlamaCppPython(python, runtime.runLoggedProcess);
    if (!after.ready) {
      throw new Error(`安装后自检未通过：${after.detail}${after.error ? `（${after.error}）` : ""}`);
    }
    report(`自检通过：${after.detail}`);
    return {
      ok: true,
      message: "llama-cpp-python 已安装并通过 CUDA 自检。请重启 ComfyUI 后再使用 Gemma 扩写。",
      log: log.join("\n\n")
    };
  } catch (error) {
    const processError = error as LlamaCppProcessError;
    const details = [processError.message, processError.stdout].filter(Boolean).join("\n");
    report(details);
    return {
      ok: false,
      message: processError.message || "llama-cpp-python 安装失败",
      log: log.join("\n\n")
    };
  }
}
