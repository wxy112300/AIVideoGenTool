import { promises as fs } from "node:fs";
import path from "node:path";
import { versionAtLeast } from "./comfy-compatibility.js";

/**
 * ComfyUI's video input API started importing these enums from PyAV.  The
 * older 16.x wheels can satisfy ComfyUI's broad `av>=16` requirement while
 * still failing during the first import, so the runtime probe below is more
 * authoritative than pip's dependency resolver alone.
 */
export const COMFY_CORE_PYAV_MINIMUM_VERSION = "17.1.0";

const videoTypeSourceCandidates = [
  path.join("comfy_api", "latest", "_input_impl", "video_types.py"),
  path.join("comfy_api", "latest", "_input", "video_types.py"),
  path.join("comfy_api", "input_impl", "video_types.py"),
  path.join("comfy_api", "input", "video_types.py")
] as const;

export interface ComfyCoreProcessRunner {
  (
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

export interface ComfyCorePythonDependencyStatus {
  sourceFile: string;
  featureDetected: boolean;
  pythonPath: string;
  installedVersion: string;
  minimumVersion: string;
  importReady: boolean | null;
  needsRepair: boolean;
  detail: string;
}

export interface ComfyCorePythonDependencyRepairResult {
  ok: boolean;
  message: string;
  log?: string;
  status: ComfyCorePythonDependencyStatus;
}

function sourceUsesVideoColorEnums(source: string): boolean {
  return /from\s+av\.video\.reformatter\s+import/iu.test(source) &&
    /\bColorPrimaries\b/u.test(source) &&
    /\bColorTrc\b/u.test(source);
}

async function findVideoTypeSource(sourceDirectory: string): Promise<string> {
  if (!sourceDirectory) return "";
  for (const relativeFilename of videoTypeSourceCandidates) {
    const filename = path.join(sourceDirectory, relativeFilename);
    const source = await fs.readFile(filename, "utf8").catch(() => "");
    if (source && sourceUsesVideoColorEnums(source)) return filename;
  }
  return "";
}

const pyavProbe = [
  "import importlib.metadata as metadata",
  "import json",
  "result = {'version': '', 'importReady': False, 'error': ''}",
  "try:",
  "    result['version'] = metadata.version('av')",
  "except Exception as error:",
  "    result['error'] = f'{type(error).__name__}: {error}'",
  "try:",
  "    from av.video.reformatter import ColorPrimaries, ColorRange, ColorTrc",
  "except Exception as error:",
  "    result['error'] = f'{type(error).__name__}: {error}'",
  "else:",
  "    result['importReady'] = True",
  "print(json.dumps(result, ensure_ascii=False))"
].join("\n");

function parseProbeOutput(output: string): {
  version: string;
  importReady: boolean;
  error: string;
} {
  for (const line of output.split(/\r?\n/u).reverse()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      return {
        version: typeof parsed.version === "string" ? parsed.version : "",
        importReady: parsed.importReady === true,
        error: typeof parsed.error === "string" ? parsed.error : ""
      };
    } catch {
      // Continue in case a Python wrapper printed another JSON-looking line.
    }
  }
  return { version: "", importReady: false, error: "未收到有效的 PyAV 检查结果" };
}

function processErrorDetail(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const value = error as { message?: unknown; stdout?: unknown; stderr?: unknown };
  return [value.message, value.stdout, value.stderr]
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .join("\n") || String(error);
}

function statusDetail(input: {
  featureDetected: boolean;
  pythonPath: string;
  installedVersion: string;
  importReady: boolean | null;
  probeError?: string;
}): string {
  if (!input.featureDetected) return "当前 ComfyUI 核心没有使用新版视频输入 API，无需执行此兼容修复。";
  if (!input.pythonPath) return "检测到新版视频输入 API，但没有找到所选 ComfyUI Python 环境。";
  if (input.importReady === true && versionAtLeast(input.installedVersion, COMFY_CORE_PYAV_MINIMUM_VERSION)) {
    return `PyAV ${input.installedVersion} 已提供新版视频输入 API 所需的枚举。`;
  }
  const current = input.installedVersion || "未安装或无法读取";
  const reason = input.probeError ? ` 导入检查：${input.probeError}` : "";
  return `当前 PyAV ${current} 与新版视频输入 API 不兼容，需要 PyAV >=${COMFY_CORE_PYAV_MINIMUM_VERSION}。${reason}`;
}

export async function inspectComfyCorePythonDependency(
  sourceDirectory: string,
  pythonPath: string,
  runProcess: ComfyCoreProcessRunner,
  environment: NodeJS.ProcessEnv = process.env
): Promise<ComfyCorePythonDependencyStatus> {
  const sourceFile = await findVideoTypeSource(sourceDirectory);
  if (!sourceFile) {
    return {
      sourceFile: "",
      featureDetected: false,
      pythonPath,
      installedVersion: "",
      minimumVersion: COMFY_CORE_PYAV_MINIMUM_VERSION,
      importReady: null,
      needsRepair: false,
      detail: statusDetail({
        featureDetected: false,
        pythonPath,
        installedVersion: "",
        importReady: null
      })
    };
  }

  if (!pythonPath) {
    return {
      sourceFile,
      featureDetected: true,
      pythonPath,
      installedVersion: "",
      minimumVersion: COMFY_CORE_PYAV_MINIMUM_VERSION,
      importReady: null,
      needsRepair: false,
      detail: statusDetail({
        featureDetected: true,
        pythonPath,
        installedVersion: "",
        importReady: null
      })
    };
  }

  let probe = { version: "", importReady: false, error: "" };
  try {
    const output = await runProcess(
      pythonPath,
      ["-s", "-c", pyavProbe],
      { cwd: sourceDirectory, env: environment, timeoutMs: 30_000 }
    );
    probe = parseProbeOutput(output);
  } catch (error) {
    probe.error = processErrorDetail(error);
  }
  const needsRepair = !probe.importReady ||
    !versionAtLeast(probe.version, COMFY_CORE_PYAV_MINIMUM_VERSION);
  return {
    sourceFile,
    featureDetected: true,
    pythonPath,
    installedVersion: probe.version,
    minimumVersion: COMFY_CORE_PYAV_MINIMUM_VERSION,
    importReady: probe.importReady,
    needsRepair,
    detail: statusDetail({
      featureDetected: true,
      pythonPath,
      installedVersion: probe.version,
      importReady: probe.importReady,
      probeError: probe.error
    })
  };
}

export async function repairComfyCorePythonDependency(
  sourceDirectory: string,
  pythonPath: string,
  environment: NodeJS.ProcessEnv,
  runProcess: ComfyCoreProcessRunner,
  onLog?: (message: string) => void
): Promise<ComfyCorePythonDependencyRepairResult> {
  const log: string[] = [];
  const report = (message: string) => {
    const normalized = message.trim();
    if (!normalized) return;
    log.push(normalized);
    onLog?.(normalized);
  };
  const before = await inspectComfyCorePythonDependency(
    sourceDirectory,
    pythonPath,
    runProcess,
    environment
  );
  if (!before.featureDetected) {
    return {
      ok: true,
      message: "当前 ComfyUI 核心不需要 PyAV 兼容修复。",
      status: before
    };
  }
  if (!pythonPath) {
    return {
      ok: false,
      message: before.detail,
      log: before.detail,
      status: before
    };
  }
  if (!before.needsRepair) {
    return {
      ok: true,
      message: "PyAV 已兼容，无需重复安装。",
      status: before
    };
  }

  report(`检测到新版 ComfyUI 视频输入 API；正在将 PyAV 更新到 >=${COMFY_CORE_PYAV_MINIMUM_VERSION}。`);
  try {
    const output = await runProcess(
      pythonPath,
      [
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "--no-input",
        "--prefer-binary",
        "--upgrade",
        `av>=${COMFY_CORE_PYAV_MINIMUM_VERSION}`
      ],
      {
        cwd: sourceDirectory,
        env: environment,
        timeoutMs: 900_000,
        onLog: report
      }
    );
    if (output.trim()) report(output);
  } catch (error) {
    const detail = processErrorDetail(error);
    report(detail);
    return {
      ok: false,
      message: `PyAV 自动修复失败：${detail}`,
      log: log.join("\n"),
      status: before
    };
  }

  const after = await inspectComfyCorePythonDependency(
    sourceDirectory,
    pythonPath,
    runProcess,
    environment
  );
  if (after.needsRepair) {
    report(after.detail);
    return {
      ok: false,
      message: `PyAV 已执行更新，但兼容性检查仍未通过：${after.detail}`,
      log: log.join("\n"),
      status: after
    };
  }
  report(`PyAV ${after.installedVersion} 导入检查通过。`);
  return {
    ok: true,
    message: `PyAV 已自动修复为 ${after.installedVersion}，ComfyUI 可以继续启动。`,
    log: log.join("\n"),
    status: after
  };
}
