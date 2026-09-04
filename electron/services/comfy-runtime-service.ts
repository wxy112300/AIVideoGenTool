import path from "node:path";
import type { Settings } from "../../src/types.js";
import type { ComfyInstallation } from "./comfy-discovery.js";
import {
  comfyUiBundledFrontendArgs,
  comfyUiMemoryArgs,
  comfyUiRuntimeProfileForSettings
} from "../../src/infrastructure/comfy-runtime-policy.js";
import { localEndpoint } from "./local-service-process.js";
import { getApplicationLogger } from "../../src/infrastructure/app-logger.js";

const appLogger = getApplicationLogger();
const ownedComfyProcessIds = new Set<number>();

export function appManagedComfyDatabaseFilename(
  port: number,
  ownerProcessId = process.pid
): string {
  return `comfyui.local-video-studio-${ownerProcessId}-${port}.db`;
}

export function ownedComfyProcessIdSnapshot(): readonly number[] {
  return [...ownedComfyProcessIds];
}

export function clearOwnedComfyProcessIds(): void {
  ownedComfyProcessIds.clear();
}

export function rememberOwnedComfyProcessId(processId: number): void {
  if (Number.isInteger(processId) && processId > 0) ownedComfyProcessIds.add(processId);
}

export function forgetOwnedComfyProcessId(processId: number): void {
  ownedComfyProcessIds.delete(processId);
}

export interface ComfyRuntimeServiceDependencies {
  findComfyRoot(settings: Settings): Promise<string>;
  findComfyInstallation(settings: Settings): Promise<ComfyInstallation | null>;
  applyComfyDesktopSettings(settings: Settings): Promise<void>;
  launchDetached(
    executable: string,
    args: string[],
    cwd?: string,
    env?: NodeJS.ProcessEnv,
    onExit?: (processId: number, code: number | null, signal: NodeJS.Signals | null) => void
  ): Promise<number>;
  /** Optional visible-console launcher for app-owned ComfyUI Python. */
  launchComfyUiVisible?(
    executable: string,
    args: string[],
    cwd?: string,
    env?: NodeJS.ProcessEnv,
    onExit?: (processId: number, code: number | null, signal: NodeJS.Signals | null) => void
  ): Promise<number>;
  isPortInUse(port: number): Promise<boolean>;
  downloadEnvironment(settings: Settings, comfyRoot?: string): NodeJS.ProcessEnv;
  exists(filename: string): Promise<boolean>;
  findComfyPython(
    settings: Settings,
    comfyRoot: string,
    installation?: ComfyInstallation | null
  ): Promise<string>;
  comfyDataDirectories(
    settings: Settings,
    comfyRoot: string
  ): { modelDirectory: string; outputDirectory: string };
  /** Optional pre-launch repair for source-based ComfyUI runtimes. */
  preflightComfyCoreDependencies?(
    sourceDirectory: string,
    pythonPath: string
  ): Promise<{ ok: boolean; message: string }>;
}

export interface ComfyRuntimeStartOptions {
  /** Use the normal visible console when omitted; automatic maintenance restarts can opt out. */
  visibleConsole?: boolean;
}

let pendingComfyUiStart: Promise<string> | null = null;
let ownedProcessExitListener: ((event: {
  processId: number;
  code: number | null;
  signal: NodeJS.Signals | null;
}) => void) | null = null;

export function setOwnedComfyProcessExitListener(
  listener: typeof ownedProcessExitListener
): void {
  ownedProcessExitListener = listener;
}

const windowsConsoleBootstrap = [
  "import ctypes, msvcrt, os, runpy, sys",
  "get_console_mode = ctypes.windll.kernel32.GetConsoleMode",
  "get_console_mode.argtypes = (ctypes.c_void_p, ctypes.POINTER(ctypes.c_uint32))",
  "set_console_mode = ctypes.windll.kernel32.SetConsoleMode",
  "set_console_mode.argtypes = (ctypes.c_void_p, ctypes.c_uint32)",
  "def bind_output_stream(name):",
  "    try:",
  "        stream = open('CONOUT$', 'w', encoding='utf-8', buffering=1)",
  "        handle = msvcrt.get_osfhandle(stream.fileno())",
  "        mode = ctypes.c_uint32()",
  "        if not handle or not get_console_mode(handle, ctypes.byref(mode)):",
  "            raise OSError('No writable console handle')",
  "        set_console_mode(handle, mode.value | 0x0004)",
  "    except Exception:",
  "        stream = open(os.devnull, 'w', encoding='utf-8')",
  "    setattr(sys, name, stream)",
  "    setattr(sys, '__' + name + '__', stream)",
  "for stream_name in ('stdout', 'stderr'):",
  "    bind_output_stream(stream_name)",
  "entry = sys.argv[1]",
  "sys.argv = sys.argv[1:]",
  "runpy.run_path(entry, run_name='__main__')"
].join("\n");

export function comfyUiPythonEntryArgs(
  mainPy: string,
  platform: NodeJS.Platform = process.platform
): string[] {
  return platform === "win32"
    ? ["-s", "-c", windowsConsoleBootstrap, mainPy]
    : ["-s", mainPy];
}

async function startComfyUiServiceImpl(
  settings: Settings,
  dependencies: ComfyRuntimeServiceDependencies,
  options: ComfyRuntimeStartOptions
): Promise<string> {
  const endpoint = localEndpoint(settings.comfyUrl, 8188);
  if (!endpoint) {
    throw new Error("一键启动只支持本机 ComfyUI 地址（localhost 或 127.0.0.1）。");
  }
  if (await dependencies.isPortInUse(endpoint.port)) {
    appLogger.info("comfy", "startup-skipped-existing-listener", "ComfyUI startup skipped because the configured port is already in use", {
      port: endpoint.port
    });
    return `${settings.comfyUrl.replace(/\/+$/, "")}/system_stats`;
  }
  const comfyRoot = await dependencies.findComfyRoot(settings);
  const installation = await dependencies.findComfyInstallation(settings);
  if (installation?.type === "desktop" && !installation.sourceDirectory) {
    await dependencies.applyComfyDesktopSettings(settings);
    const processId = await dependencies.launchDetached(
      installation.executable,
      [],
      installation.directory,
      dependencies.downloadEnvironment(settings, comfyRoot),
      handleOwnedProcessExit
    );
    ownedComfyProcessIds.add(processId);
    return `${settings.comfyUrl.replace(/\/+$/, "")}/system_stats`;
  }
  const sourceRoot = installation?.sourceDirectory || comfyRoot;
  if (!sourceRoot) throw new Error("没有找到 ComfyUI 核心程序目录。");

  const mainPy = path.join(sourceRoot, "main.py");
  if (!(await dependencies.exists(mainPy))) {
    throw new Error(
      `找到了 ComfyUI 目录 ${sourceRoot}，但缺少 main.py；请先安装完整的 ComfyUI 程序。`
    );
  }
  const python = await dependencies.findComfyPython(settings, comfyRoot, installation);
  if (!python) {
    throw new Error("找到了 ComfyUI main.py，但没有找到可用的 Python 运行环境。");
  }
  if (dependencies.preflightComfyCoreDependencies) {
    const preflight = await dependencies.preflightComfyCoreDependencies(sourceRoot, python);
    if (!preflight.ok) {
      throw new Error(`ComfyUI 核心依赖检查未通过：${preflight.message}`);
    }
  }

  const bundledFrontend = path.join(
    sourceRoot,
    "web_custom_versions",
    "desktop_app",
    "index.html"
  );
  const directories = dependencies.comfyDataDirectories(settings, comfyRoot || sourceRoot);
  const runtimeProfile = comfyUiRuntimeProfileForSettings(settings);
  const memoryArgs = comfyUiMemoryArgs(settings);
  const args = [
    ...comfyUiPythonEntryArgs(mainPy),
    "--listen",
    endpoint.host,
    "--port",
    String(endpoint.port),
    "--disable-auto-launch",
    "--preview-method",
    "auto",
    ...memoryArgs
  ];
  if (settings.modelDirectory.trim()) {
    args.push("--models-directory", directories.modelDirectory);
  }
  args.push(
    ...comfyUiBundledFrontendArgs(
      sourceRoot,
      await dependencies.exists(bundledFrontend)
    )
  );
  if (comfyRoot && comfyRoot !== sourceRoot) {
    args.push(
      "--base-directory",
      comfyRoot,
      "--user-directory",
      path.join(comfyRoot, "user"),
      "--input-directory",
      path.join(comfyRoot, "input"),
      "--output-directory",
      directories.outputDirectory,
      "--temp-directory",
      path.join(comfyRoot, "temp")
    );
  } else if (settings.outputDirectory.trim()) {
    args.push("--output-directory", directories.outputDirectory);
  }
  const databaseRoot = comfyRoot || sourceRoot;
  const databaseFilename = appManagedComfyDatabaseFilename(endpoint.port);
  args.push(
    "--database-url",
    `sqlite:///${path.join(databaseRoot, "user", databaseFilename).replaceAll("\\", "/")}`
  );
  appLogger.info("comfy", "runtime-profile-launch", "Launching ComfyUI with an isolated runtime profile", {
    runtimeProfile,
    memoryArgs,
    databaseFilename
  });
  const environment = dependencies.downloadEnvironment(settings, comfyRoot);
  const launchComfyUi = options.visibleConsole === false
    ? dependencies.launchDetached
    : dependencies.launchComfyUiVisible ?? dependencies.launchDetached;
  const processId = await launchComfyUi(
    python,
    args,
    sourceRoot,
    environment,
    handleOwnedProcessExit
  );
  ownedComfyProcessIds.add(processId);
  appLogger.info("comfy", "runtime-process-launched", "ComfyUI process launched", {
    childProcessId: processId,
    port: endpoint.port
  });
  return `${settings.comfyUrl.replace(/\/+$/, "")}/system_stats`;
}

function handleOwnedProcessExit(
  processId: number,
  code: number | null,
  signal: NodeJS.Signals | null
): void {
  forgetOwnedComfyProcessId(processId);
  appLogger.info("comfy", "owned-process-exited", "An app-started ComfyUI process exited", {
    childProcessId: processId,
    code,
    signal: signal ?? ""
  });
  ownedProcessExitListener?.({ processId, code, signal });
}

export async function startComfyUiService(
  settings: Settings,
  dependencies: ComfyRuntimeServiceDependencies,
  options: ComfyRuntimeStartOptions = {}
): Promise<string> {
  if (pendingComfyUiStart) return pendingComfyUiStart;
  const start = startComfyUiServiceImpl(settings, dependencies, options);
  pendingComfyUiStart = start;
  try {
    return await start;
  } finally {
    if (pendingComfyUiStart === start) pendingComfyUiStart = null;
  }
}
