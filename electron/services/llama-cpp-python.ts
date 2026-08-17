import type { Settings, LlamaCppPythonStatus } from "../../src/types.js";

export const LLAMA_CPP_PYTHON_REQUIREMENT = "llama-cpp-python>=0.3.34,<0.4";
export const LLAMA_CPP_PYTHON_WHEEL_ROOT =
  "https://abetlen.github.io/llama-cpp-python/whl";

/** Pinned Windows wheel with dynamically loaded CUDA and CPU backends. */
export const LLAMA_CPP_PYTHON_JAMEPENG_VERSION = "0.3.46";
export const LLAMA_CPP_PYTHON_JAMEPENG_RELEASE_DATE = "20260808";

const LLAMA_CPP_PYTHON_JAMEPENG_CUDA_VARIANTS = new Set([
  "cu124",
  "cu126",
  "cu128",
  "cu130",
  "cu131"
]);

// Verified against the published v0.3.46 Windows release assets. Reject an
// unknown ABI before pip starts so another computer gets an actionable error
// instead of a long download followed by a GitHub 404.
export const LLAMA_CPP_PYTHON_JAMEPENG_PYTHON_ABIS = [
  "cp310",
  "cp311",
  "cp312",
  "cp313",
  "cp314"
] as const;
const LLAMA_CPP_PYTHON_JAMEPENG_ABI_SET = new Set<string>(
  LLAMA_CPP_PYTHON_JAMEPENG_PYTHON_ABIS
);

const LLAMA_CPP_PYTHON_JAMEPENG_CUDA_FALLBACKS: Record<string, string> = {
  cu125: "cu124",
  cu127: "cu126",
  cu129: "cu128",
  cu132: "cu131"
};

/**
 * The upstream Windows wheel index is published for selected CUDA minor
 * versions.  PyTorch can report a CUDA minor for which abetlen does not have
 * a dedicated wheel (for example, cu129).  Keep this table explicit rather
 * than guessing from the display version so an unsupported runtime never
 * silently falls back to a CPU wheel or a source build.
 */
const LLAMA_CPP_PYTHON_WHEEL_VARIANTS = new Set([
  "cu118",
  "cu121",
  "cu122",
  "cu123",
  "cu124",
  "cu125",
  "cu130",
  "cu132"
]);

// The upstream index currently has no cu126/cu128/cu129 pages.  Use the
// nearest published CUDA 12.x wheel instead of generating a 404 index URL.
// Treat these as explicit, self-checked fallbacks rather than exact matches;
// the import/GPU probe below must still pass after pip finishes.
const LLAMA_CPP_PYTHON_WHEEL_FALLBACKS: Record<string, string> = {
  cu126: "cu125",
  cu128: "cu125",
  cu129: "cu125"
};

export interface LlamaCppWheelSelection {
  requestedKey: string;
  wheelKey: string;
  exact: boolean;
}

function cudaVersionLabelFromWheelKey(key: string): string {
  const match = key.match(/^cu(\d)(\d)(\d)$/u);
  return match ? `${match[1]}${match[2]}.${match[3]}` : key;
}

interface LlamaCppPythonProbe {
  pythonVersion?: string;
  packageVersion?: string;
  importable?: boolean;
  gpuOffload?: boolean | null;
  torchVersion?: string;
  cudaVersion?: string;
  importError?: string;
  dynamicBackend?: boolean | null;
  backendError?: string;
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
  "result = {'pythonVersion': platform.python_version(), 'packageVersion': '', 'importable': False, 'gpuOffload': None, 'torchVersion': '', 'cudaVersion': '', 'importError': '', 'dynamicBackend': None, 'backendError': ''}",
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
  // JamePeng 0.3.39+ wheels ship CUDA and CPU implementations as dynamic
  // backend DLLs. Merely importing llama_cpp leaves those DLLs unregistered,
  // which made the old probe incorrectly report a working CUDA wheel as CPU
  // only. Mirror Llama.__init__ and register the packaged backends first.
  "    try:",
  "        import ctypes, pathlib",
  "        from llama_cpp._ggml import ggml_backend_load_all_from_path",
  "        lib_dir = pathlib.Path(llama_cpp.__file__).resolve().parent / 'lib'",
  "        ggml_backend_load_all_from_path(ctypes.c_char_p(str(lib_dir).encode('utf-8')))",
  "        result['dynamicBackend'] = True",
  "    except (ImportError, AttributeError): result['dynamicBackend'] = False",
  "    except Exception as backend_error:",
  "        result['dynamicBackend'] = False",
  "        result['backendError'] = str(backend_error)",
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

function nativeCrashCodeFrom(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "";
  const windowsCode = normalized.match(/0xC000001D/iu)?.[0];
  if (windowsCode) return `0x${windowsCode.slice(2).toUpperCase()}`;
  if (/-1073741795\b/u.test(normalized)) return "-1073741795";
  if (/3221225501\b/u.test(normalized)) return "0xC000001D";
  return /(?:illegal instruction|非法指令)/iu.test(normalized)
    ? "illegal-instruction"
    : "";
}

function pythonAbiFromVersion(version: string): string {
  const match = version.trim().match(/^(\d+)\.(\d+)/u);
  return match ? `cp${match[1]}${match[2]}` : "";
}

function jamePengCudaSelection(cudaVersion: string): { requestedKey: string; wheelKey: string } | null {
  const match = cudaVersion.trim().match(/^(\d+)\.(\d+)/u);
  if (!match) return null;
  const requestedKey = `cu${match[1]}${match[2]}`;
  const wheelKey = LLAMA_CPP_PYTHON_JAMEPENG_CUDA_VARIANTS.has(requestedKey)
    ? requestedKey
    : LLAMA_CPP_PYTHON_JAMEPENG_CUDA_FALLBACKS[requestedKey] ?? "";
  return wheelKey ? { requestedKey, wheelKey } : null;
}

/**
 * Return the pinned dynamic-backend wheel used for a compatible Windows
 * instruction crash. `null` means this Python/CUDA pair is not published by
 * the pinned release and the caller should keep the normal wheel path.
 */
export function llamaCppJamePengRepairWheel(
  cudaVersion: string,
  pythonVersion: string,
  platform: NodeJS.Platform = process.platform
): string | null {
  if (platform !== "win32") return null;
  const selection = jamePengCudaSelection(cudaVersion);
  const abi = pythonAbiFromVersion(pythonVersion);
  if (!selection || !LLAMA_CPP_PYTHON_JAMEPENG_ABI_SET.has(abi)) return null;
  const tag = `v${LLAMA_CPP_PYTHON_JAMEPENG_VERSION}-${selection.wheelKey}-win-${LLAMA_CPP_PYTHON_JAMEPENG_RELEASE_DATE}`;
  const filename = `llama_cpp_python-${LLAMA_CPP_PYTHON_JAMEPENG_VERSION}+${selection.wheelKey}-${abi}-${abi}-win_amd64.whl`;
  return `https://github.com/JamePeng/llama-cpp-python/releases/download/${tag}/${encodeURIComponent(filename)}`;
}

export function statusFromLlamaCppProbe(
  pythonPath: string,
  probe: LlamaCppPythonProbe,
  error = ""
): LlamaCppPythonStatus {
  const packageVersion = probe.packageVersion?.trim() ?? "";
  const importable = probe.importable === true;
  const gpuOffload = typeof probe.gpuOffload === "boolean" ? probe.gpuOffload : null;
  const importError = probe.importError?.trim() || error.trim();
  const backendError = probe.backendError?.trim() ?? "";
  const crashCode = nativeCrashCodeFrom([importError, error].filter(Boolean).join("\n"));
  const nativeCrash = Boolean(crashCode);
  const installed = Boolean(packageVersion || importable || nativeCrash);
  let detail = "尚未安装 llama-cpp-python";
  if (nativeCrash) {
    detail = `llama-cpp-python 原生运行库崩溃（${crashCode}，Windows 非法指令）。当前 wheel 与 CPU 指令集不兼容；请点击“重新安装/修复”切换兼容的动态 CPU 后端。`;
  } else if (installed && !importable) {
    detail = `llama-cpp-python 已安装，但无法导入${importError ? `：${importError}` : ""}`;
  } else if (importable && probe.dynamicBackend === false && process.platform === "win32") {
    detail = `已安装旧版或不可用的 Windows 原生后端；请执行修复安装${backendError ? `：${backendError}` : ""}`;
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
    ready: importable && gpuOffload === true && !(process.platform === "win32" && probe.dynamicBackend === false),
    detail,
    error: importError,
    nativeCrash,
    nativeCrashCode: crashCode || undefined
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
  const selection = llamaCppWheelSelectionForCuda(cudaVersion, platform);
  return selection
    ? `${LLAMA_CPP_PYTHON_WHEEL_ROOT}/${selection.wheelKey}`
    : null;
}

export function llamaCppWheelSelectionForCuda(
  cudaVersion: string,
  platform: NodeJS.Platform = process.platform
): LlamaCppWheelSelection | null {
  if (platform !== "win32") return null;
  const match = cudaVersion.trim().match(/^(\d+)\.(\d+)/u);
  if (!match) return null;
  const requestedKey = `cu${match[1]}${match[2]}`;
  const wheelKey = LLAMA_CPP_PYTHON_WHEEL_VARIANTS.has(requestedKey)
    ? requestedKey
    : LLAMA_CPP_PYTHON_WHEEL_FALLBACKS[requestedKey] ?? "";
  if (!wheelKey) return null;
  return {
    requestedKey,
    wheelKey,
    exact: requestedKey === wheelKey
  };
}

type LlamaCppInstallResult = { ok: boolean; message: string; log?: string };

/**
 * Both H3 Prompt Writer and MultiModal Prompt Nodes load this package from the
 * same ComfyUI Python environment. Keep one in-process install transaction so
 * two cards cannot pip-replace the shared native DLLs at the same time.
 */
const sharedLlamaInstallLocks = new Map<string, Promise<LlamaCppInstallResult>>();

function sharedLlamaInstallKey(settings: Settings): string {
  return [
    settings.comfyInstallDirectory.trim().toLowerCase(),
    settings.comfyPythonPath.trim().toLowerCase()
  ].join("\u0000");
}

async function installLlamaCppPythonPackageUnlocked(
  settings: Settings,
  runtime: LlamaCppPythonRuntime,
  onLog?: (message: string) => void,
  options: { forceReinstall?: boolean } = {}
): Promise<LlamaCppInstallResult> {
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
      report(`当前探针显示 llama-cpp-python 已就绪：${before.detail}`);
      if (options.forceReinstall === false) {
        return {
          ok: true,
          message: "llama-cpp-python 已经就绪，无需重复安装。",
          log: log.join("\n\n")
        };
      }
      report("这是一次显式的修复操作，将继续重装并在完成后重新自检……");
    }
    // Use the portable dynamic-backend wheel for every supported Windows
    // installation, not only after a known crash. The older static wheels can
    // pass import/GPU checks and still crash with 0xC000001D while loading a
    // real GGUF model on a different CPU.
    const repairWheel = llamaCppJamePengRepairWheel(
      before.cudaVersion,
      before.pythonVersion
    );
    const wheelSelection = llamaCppWheelSelectionForCuda(before.cudaVersion);
    const wheelIndex = wheelSelection
      ? `${LLAMA_CPP_PYTHON_WHEEL_ROOT}/${wheelSelection.wheelKey}`
      : null;
    if (process.platform === "win32" && !repairWheel) {
      const abi = pythonAbiFromVersion(before.pythonVersion);
      if (abi && !LLAMA_CPP_PYTHON_JAMEPENG_ABI_SET.has(abi)) {
        throw new Error(
          `当前 ComfyUI 使用 Python ${before.pythonVersion}（${abi}），固定的 Windows CUDA 后端只提供 Python 3.10–3.14。请切换到受支持的 ComfyUI Python 后再修复。`
        );
      }
      throw new Error(
        `当前 ComfyUI Python 的 PyTorch CUDA 版本为 ${before.cudaVersion || "未知"}，固定的 Windows 后端没有匹配的预编译 wheel；已拒绝回退到 CPU 或源码编译。支持 CUDA 12.4/12.6/12.8/13.0/13.1，并兼容映射 12.5/12.7/12.9/13.2。`
      );
    }
    if (repairWheel && before.nativeCrash) {
      report(
        `检测到 ${before.nativeCrashCode || "Windows 非法指令"}：当前 llama-cpp-python wheel 在本机加载时崩溃；改用 JamePeng ${LLAMA_CPP_PYTHON_JAMEPENG_VERSION} 动态 CUDA/CPU 后端进行修复，不会启动独立 llama-server……`
      );
    } else if (repairWheel) {
      report(
        `安装 JamePeng ${LLAMA_CPP_PYTHON_JAMEPENG_VERSION} Windows CUDA 动态后端；下载约 299 MB，网络较慢时可能需要 10–20 分钟……`
      );
    } else {
      report(
        wheelSelection && !wheelSelection.exact
          ? `CUDA ${before.cudaVersion} 没有专用预编译 wheel，改用官方发布的 CUDA ${cudaVersionLabelFromWheelKey(wheelSelection.wheelKey)} 预编译后端并在安装后自检（不会启动独立 llama-server）……`
          : wheelIndex
          ? `安装 CUDA ${before.cudaVersion} 预编译后端（不会启动独立 llama-server）……`
          : "安装 llama-cpp-python 后端……"
      );
    }
    const args = [
      "-m", "pip", "install", "--upgrade",
      ...(before.installed ? ["--force-reinstall"] : []),
      "--disable-pip-version-check", "--no-input", "--no-cache-dir",
      "--no-deps", "--progress-bar=raw",
      "--only-binary=:all:"
    ];
    if (repairWheel) {
      args.push(repairWheel);
    } else {
      if (wheelIndex) args.push("--extra-index-url", wheelIndex);
      args.push(LLAMA_CPP_PYTHON_REQUIREMENT);
    }
    let lastDownloadPercent = -2;
    const reportPipOutput = (message: string) => {
      const progress = message.trim().match(/^Progress\s+(\d+)\s+of\s+(\d+)$/u);
      if (!progress) {
        report(message);
        return;
      }
      const current = Number(progress[1]);
      const total = Number(progress[2]);
      if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) return;
      const percent = Math.min(100, Math.floor((current / total) * 100));
      if (percent < 100 && percent < lastDownloadPercent + 2) return;
      lastDownloadPercent = percent;
      report(
        `下载进度：${percent}% · ${(current / 1024 / 1024).toFixed(1)} / ${(total / 1024 / 1024).toFixed(1)} MB`
      );
    };
    await runtime.runLoggedProcess(python, args, {
      timeoutMs: repairWheel ? 2_700_000 : 1_800_000,
      env: environment,
      onLog: reportPipOutput
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

export async function installLlamaCppPythonPackage(
  settings: Settings,
  runtime: LlamaCppPythonRuntime,
  onLog?: (message: string) => void,
  options: { forceReinstall?: boolean } = {}
): Promise<LlamaCppInstallResult> {
  const key = sharedLlamaInstallKey(settings);
  const running = sharedLlamaInstallLocks.get(key);
  if (running) {
    onLog?.("检测到同一 ComfyUI 的共享 llama-cpp-python 正在安装/修复，等待现有事务完成，不会重复替换 DLL……");
    return running;
  }
  const operation = installLlamaCppPythonPackageUnlocked(
    settings,
    runtime,
    onLog,
    options
  );
  sharedLlamaInstallLocks.set(key, operation);
  try {
    return await operation;
  } finally {
    if (sharedLlamaInstallLocks.get(key) === operation) {
      sharedLlamaInstallLocks.delete(key);
    }
  }
}
