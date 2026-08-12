import path from "node:path";
import type { Settings } from "../../src/types.js";
import type { ComfyInstallation } from "./comfy-discovery.js";
import {
  comfyUiBundledFrontendArgs,
  comfyUiMemoryArgs,
  comfyUiRuntimeProfileForSettings
} from "./comfy-runtime-policy.js";
import { localEndpoint } from "./local-service-process.js";
import { getApplicationLogger } from "./app-logger.js";

const appLogger = getApplicationLogger();

export interface ComfyRuntimeServiceDependencies {
  findComfyRoot(settings: Settings): Promise<string>;
  findComfyInstallation(settings: Settings): Promise<ComfyInstallation | null>;
  applyComfyDesktopSettings(settings: Settings): Promise<void>;
  launchDetached(
    executable: string,
    args: string[],
    cwd?: string,
    env?: NodeJS.ProcessEnv
  ): Promise<void>;
  downloadEnvironment(settings: Settings): NodeJS.ProcessEnv;
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
}

export async function startComfyUiService(
  settings: Settings,
  dependencies: ComfyRuntimeServiceDependencies
): Promise<string> {
  const endpoint = localEndpoint(settings.comfyUrl, 8188);
  if (!endpoint) {
    throw new Error("一键启动只支持本机 ComfyUI 地址（localhost 或 127.0.0.1）。");
  }
  const comfyRoot = await dependencies.findComfyRoot(settings);
  const installation = await dependencies.findComfyInstallation(settings);
  if (installation?.type === "desktop" && !installation.sourceDirectory) {
    await dependencies.applyComfyDesktopSettings(settings);
    await dependencies.launchDetached(
      installation.executable,
      [],
      installation.directory,
      dependencies.downloadEnvironment(settings)
    );
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
    "-s",
    mainPy,
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
      path.join(comfyRoot, "temp"),
      "--database-url",
      `sqlite:///${path.join(comfyRoot, "user", "comfyui.db").replaceAll("\\", "/")}`
    );
  } else if (settings.outputDirectory.trim()) {
    args.push("--output-directory", directories.outputDirectory);
  }
  appLogger.info("comfy", "runtime-profile-launch", "Launching ComfyUI with an isolated runtime profile", {
    runtimeProfile,
    memoryArgs
  });
  await dependencies.launchDetached(
    python,
    args,
    sourceRoot,
    dependencies.downloadEnvironment(settings)
  );
  return `${settings.comfyUrl.replace(/\/+$/, "")}/system_stats`;
}
