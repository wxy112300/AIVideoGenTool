import { createNativeTranslator } from "../ui-translator.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
import type { Settings, LlamaCppPythonStatus, UiLocale } from "../../src/types.js";
import { pythonProbeCache } from "./python-probe-cache.js";
import { LLAMA_CPP_PYTHON_JAMEPENG_VERSION, LLAMA_CPP_PYTHON_JAMEPENG_RELEASE_DATE, LLAMA_CPP_PYTHON_REPOSITORY } from "../../src/core/catalog/dependencies/llama-cpp-python.js";
export { LLAMA_CPP_PYTHON_JAMEPENG_VERSION, LLAMA_CPP_PYTHON_JAMEPENG_RELEASE_DATE } from "../../src/core/catalog/dependencies/llama-cpp-python.js";

export const LLAMA_CPP_PYTHON_REQUIREMENT = "llama-cpp-python>=0.3.34,<0.5";
export const LLAMA_CPP_PYTHON_WHEEL_ROOT =
  "https://abetlen.github.io/llama-cpp-python/whl";

const LLAMA_CPP_PYTHON_JAMEPENG_CUDA_VARIANTS = new Set([
  "cu124",
  "cu126",
  "cu128",
  "cu130",
  "cu131"
]);

// Verified against the published v0.4.5 Windows release assets. Reject an
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
  packageDirectory?: string;
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
      uiLocale?: UiLocale;
      cwd?: string;
      env?: NodeJS.ProcessEnv;
      timeoutMs?: number;
      onLog?: (message: string) => void;
    }
  ): Promise<string>;
}

const probeScript = [
  "import importlib.metadata as metadata, json, platform, pathlib",
  "result = {'pythonVersion': platform.python_version(), 'packageVersion': '', 'importable': False, 'gpuOffload': None, 'torchVersion': '', 'cudaVersion': '', 'importError': '', 'dynamicBackend': None, 'backendError': ''}",
  "try:",
  "    distribution = metadata.distribution('llama-cpp-python')",
  "    result['packageVersion'] = distribution.version",
  "    for entry in distribution.files or []:",
  "        if entry.as_posix() == 'llama_cpp/__init__.py':",
  "            module_file = pathlib.Path(distribution.locate_file(entry)).resolve()",
  "            if module_file.is_file(): result['packageDirectory'] = str(module_file.parent)",
  "            break",
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
  "    module_file = pathlib.Path(llama_cpp.__file__).resolve()",
  "    if module_file.is_file(): result['packageDirectory'] = str(module_file.parent)",
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

export function emptyLlamaCppPythonStatus(pythonPath = "", locale: UiLocale = "zh-CN"): LlamaCppPythonStatus {
  const t = createNativeTranslator(locale).t;
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
    detail: pythonPath ? t(uiKeys.llamaInstaller.notInstalled) : t(uiKeys.llamaInstaller.pythonMissing),
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
  return `https://github.com/${LLAMA_CPP_PYTHON_REPOSITORY}/releases/download/${tag}/${encodeURIComponent(filename)}`;
}

export function statusFromLlamaCppProbe(
  pythonPath: string,
  probe: LlamaCppPythonProbe,
  error = "",
  locale: UiLocale = "zh-CN"
): LlamaCppPythonStatus {
  const t = createNativeTranslator(locale).t;
  const packageVersion = probe.packageVersion?.trim() ?? "";
  const importable = probe.importable === true;
  const gpuOffload = typeof probe.gpuOffload === "boolean" ? probe.gpuOffload : null;
  const importError = probe.importError?.trim() || error.trim();
  const backendError = probe.backendError?.trim() ?? "";
  const crashCode = nativeCrashCodeFrom([importError, error].filter(Boolean).join("\n"));
  const nativeCrash = Boolean(crashCode);
  const installed = Boolean(packageVersion || importable || nativeCrash);
  let detail = t(uiKeys.llamaInstaller.notInstalled);
  if (nativeCrash) {
    detail = t(uiKeys.llamaInstaller.nativeCrash, { code: crashCode });
  } else if (installed && !importable) {
    detail = t(uiKeys.llamaInstaller.importFailed, { error: importError ? `${locale === "en-US" ? ": " : "："}${importError}` : "" });
  } else if (importable && probe.dynamicBackend === false && process.platform === "win32") {
    detail = t(uiKeys.llamaInstaller.backendBroken, { error: backendError ? `${locale === "en-US" ? ": " : "："}${backendError}` : "" });
  } else if (importable && gpuOffload === false) {
    detail = t(uiKeys.llamaInstaller.cpuOnly);
  } else if (importable && gpuOffload === null) {
    detail = t(uiKeys.llamaInstaller.cudaUnknown);
  } else if (importable && gpuOffload === true) {
    detail = t(uiKeys.llamaInstaller.ready, { version: packageVersion ? ` · v${packageVersion}` : "" });
  }
  return {
    packageName: "llama-cpp-python",
    pythonPath,
    pythonVersion: probe.pythonVersion?.trim() ?? "",
    packageVersion,
    packageDirectory: probe.packageDirectory?.trim() || undefined,
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

export interface LlamaCppPythonProbeResult {
  probe: LlamaCppPythonProbe;
  error: string;
}

export function llamaCppStatusFromInspection(
  pythonPath: string,
  result: LlamaCppPythonProbeResult,
  locale: UiLocale = "zh-CN"
): LlamaCppPythonStatus {
  return pythonPath
    ? statusFromLlamaCppProbe(pythonPath, result.probe, result.error, locale)
    : emptyLlamaCppPythonStatus("", locale);
}

export async function inspectLlamaCppPython(
  pythonPath: string,
  runLoggedProcess: LlamaCppPythonRuntime["runLoggedProcess"],
  locale: UiLocale = "zh-CN"
): Promise<LlamaCppPythonStatus> {
  const result = await inspectLlamaCppPythonProbe(pythonPath, runLoggedProcess, locale);
  return llamaCppStatusFromInspection(pythonPath, result, locale);
}

export async function inspectLlamaCppPythonProbe(
  pythonPath: string,
  runLoggedProcess: LlamaCppPythonRuntime["runLoggedProcess"],
  locale: UiLocale = "zh-CN"
): Promise<LlamaCppPythonProbeResult> {
  if (!pythonPath) return { probe: {}, error: "" };
  try {
    const output = await runLoggedProcess(
      pythonPath,
      ["-c", probeScript],
      { timeoutMs: 30_000, uiLocale: locale }
    );
    const parsed = JSON.parse(lastJsonLine(output)) as LlamaCppPythonProbe;
    return { probe: parsed, error: "" };
  } catch (error) {
    const processError = error as LlamaCppProcessError;
    const output = processError.stdout ?? "";
    try {
      const parsed = JSON.parse(lastJsonLine(output)) as LlamaCppPythonProbe;
      return { probe: parsed, error: processError.message };
    } catch {
      return { probe: {
        pythonVersion: "",
        packageVersion: "",
        importable: false,
        gpuOffload: null,
        importError: processError.message
      }, error: processError.message };
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
 * same ComfyUI Python environment. Keep one in-process package transaction so
 * install, repair, and uninstall cannot modify the native DLLs at the same time.
 */
const sharedLlamaOperationLocks = new Map<string, Promise<LlamaCppInstallResult>>();

function sharedLlamaOperationKey(settings: Settings): string {
  return [
    settings.comfyInstallDirectory.trim().toLowerCase(),
    settings.comfyPythonPath.trim().toLowerCase()
  ].join("\u0000");
}

function sharedLlamaOperationLock(
  settings: Settings,
  onLog: ((message: string) => void) | undefined,
  operation: () => Promise<LlamaCppInstallResult>
): Promise<LlamaCppInstallResult> {
  const t = createNativeTranslator(settings.uiLocale).t;
  const key = sharedLlamaOperationKey(settings);
  const running = sharedLlamaOperationLocks.get(key);
  if (running) {
    onLog?.(t(uiKeys.llamaInstaller.waiting));
    return running;
  }
  const pending = operation();
  sharedLlamaOperationLocks.set(key, pending);
  return pending.finally(() => {
    if (sharedLlamaOperationLocks.get(key) === pending) {
      sharedLlamaOperationLocks.delete(key);
    }
  });
}

async function installLlamaCppPythonPackageUnlocked(
  settings: Settings,
  runtime: LlamaCppPythonRuntime,
  onLog?: (message: string) => void,
  options: { forceReinstall?: boolean } = {}
): Promise<LlamaCppInstallResult> {
  const t = createNativeTranslator(settings.uiLocale).t;
  const locale = settings.uiLocale;
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
    report(t(uiKeys.llamaInstaller.locating));
    const comfyRoot = await runtime.findComfyRoot(settings);
    if (!comfyRoot) throw new Error(t(uiKeys.llamaInstaller.rootMissing));
    const python = await runtime.findComfyPython(settings, comfyRoot);
    if (!python) throw new Error(t(uiKeys.llamaInstaller.pythonEnvironmentMissing));
    const before = await inspectLlamaCppPython(python, runtime.runLoggedProcess, settings.uiLocale);
    if (before.ready) {
      report(t(uiKeys.llamaInstaller.alreadyReady, { detail: before.detail }));
      if (options.forceReinstall === false) {
        return {
          ok: true,
          message: t(uiKeys.llamaInstaller.skipInstall),
          log: log.join("\n\n")
        };
      }
      report(t(uiKeys.llamaInstaller.explicitRepair));
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
          t(uiKeys.llamaInstaller.abiUnsupported, { python: before.pythonVersion, abi })
        );
      }
      throw new Error(
        t(uiKeys.llamaInstaller.cudaUnsupported, { cuda: before.cudaVersion || t(uiKeys.attentionInstaller.unknown) })
      );
    }
    if (repairWheel && before.nativeCrash) {
      report(
        t(uiKeys.llamaInstaller.crashRepair, { code: before.nativeCrashCode || "Windows illegal instruction", version: LLAMA_CPP_PYTHON_JAMEPENG_VERSION })
      );
    } else if (repairWheel) {
      report(
        t(uiKeys.llamaInstaller.dynamicInstall, { version: LLAMA_CPP_PYTHON_JAMEPENG_VERSION })
      );
    } else {
      report(
        wheelSelection && !wheelSelection.exact
          ? t(uiKeys.llamaInstaller.wheelFallback, { cuda: before.cudaVersion, fallback: cudaVersionLabelFromWheelKey(wheelSelection.wheelKey) })
          : wheelIndex
          ? t(uiKeys.llamaInstaller.wheelInstall, { cuda: before.cudaVersion })
          : t(uiKeys.llamaInstaller.installing)
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
        t(uiKeys.llamaInstaller.progress, { percent, current: (current / 1024 / 1024).toFixed(1), total: (total / 1024 / 1024).toFixed(1) })
      );
    };
    await runtime.runLoggedProcess(python, args, {
      uiLocale: settings.uiLocale,
      timeoutMs: repairWheel ? 2_700_000 : 1_800_000,
      env: environment,
      onLog: reportPipOutput
    });
    report(t(uiKeys.llamaInstaller.testing));
    const after = await inspectLlamaCppPython(python, runtime.runLoggedProcess, settings.uiLocale);
    if (!after.ready) {
      throw new Error(t(uiKeys.llamaInstaller.testFailed, { detail: after.detail, error: after.error ? (locale === "en-US" ? ` (${after.error})` : `（${after.error}）`) : "" }));
    }
    report(t(uiKeys.llamaInstaller.tested, { detail: after.detail }));
    return {
      ok: true,
      message: t(uiKeys.llamaInstaller.installed),
      log: log.join("\n\n")
    };
  } catch (error) {
    const processError = error as LlamaCppProcessError;
    const details = [processError.message, processError.stdout].filter(Boolean).join("\n");
    report(details);
    return {
      ok: false,
      message: processError.message || t(uiKeys.llamaInstaller.installFailed),
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
  return sharedLlamaOperationLock(settings, onLog, async () => {
    const finishMutation = pythonProbeCache.beginMutation();
    try {
      return await installLlamaCppPythonPackageUnlocked(settings, runtime, onLog, options);
    } finally {
      finishMutation();
      pythonProbeCache.invalidate(undefined, "mutation");
    }
  });
}

async function uninstallLlamaCppPythonPackageUnlocked(
  settings: Settings,
  runtime: LlamaCppPythonRuntime,
  onLog?: (message: string) => void
): Promise<LlamaCppInstallResult> {
  const t = createNativeTranslator(settings.uiLocale).t;
  const locale = settings.uiLocale;
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
    report(t(uiKeys.llamaInstaller.locating));
    const comfyRoot = await runtime.findComfyRoot(settings);
    if (!comfyRoot) throw new Error(t(uiKeys.llamaInstaller.rootMissing));
    const python = await runtime.findComfyPython(settings, comfyRoot);
    if (!python) throw new Error(t(uiKeys.llamaInstaller.pythonEnvironmentMissing));
    const before = await inspectLlamaCppPython(python, runtime.runLoggedProcess, settings.uiLocale);
    if (!before.installed) {
      report(t(uiKeys.llamaInstaller.absent));
      return {
        ok: true,
        message: t(uiKeys.llamaInstaller.skipUninstall),
        log: log.join("\n\n")
      };
    }
    report(t(uiKeys.llamaInstaller.uninstalling));
    await runtime.runLoggedProcess(
      python,
      [
        "-m", "pip", "uninstall", "--yes",
        "--disable-pip-version-check", "--no-input",
        "llama-cpp-python"
      ],
      {
        uiLocale: settings.uiLocale,
        timeoutMs: 600_000,
        env: environment,
        onLog: report
      }
    );
    report(t(uiKeys.llamaInstaller.checkingRemoved));
    const after = await inspectLlamaCppPython(python, runtime.runLoggedProcess, settings.uiLocale);
    if (after.installed) {
      throw new Error(t(uiKeys.llamaInstaller.stillInstalled));
    }
    report(t(uiKeys.llamaInstaller.removed));
    return {
      ok: true,
      message: t(uiKeys.llamaInstaller.uninstalled),
      log: log.join("\n\n")
    };
  } catch (error) {
    const processError = error as LlamaCppProcessError;
    const details = [processError.message, processError.stdout].filter(Boolean).join("\n");
    report(details);
    return {
      ok: false,
      message: processError.message || t(uiKeys.llamaInstaller.uninstallFailed),
      log: log.join("\n\n")
    };
  }
}

export async function uninstallLlamaCppPythonPackage(
  settings: Settings,
  runtime: LlamaCppPythonRuntime,
  onLog?: (message: string) => void
): Promise<LlamaCppInstallResult> {
  return sharedLlamaOperationLock(settings, onLog, async () => {
    const finishMutation = pythonProbeCache.beginMutation();
    try {
      return await uninstallLlamaCppPythonPackageUnlocked(settings, runtime, onLog);
    } finally {
      finishMutation();
      pythonProbeCache.invalidate(undefined, "mutation");
    }
  });
}
