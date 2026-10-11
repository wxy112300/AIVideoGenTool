import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { renameWithRetry } from "./filesystem-retry.js";
import { checkInstallationCancelled } from "./installation-cancellation.js";
import type { ConnectionResult, Settings, StrataInstallProgress } from "../../src/types.js";
import { STRATA_ENGINE_BYTES, STRATA_ENGINE_SHA256, STRATA_ENGINE_URL, STRATA_REVISION, STRATA_VERSION } from "../../src/core/catalog/dependencies/strata.js";

const receiptName = "lvs-strata-install.json";
export function managedStrataDirectory(): string {
  return path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "Local Video Studio", "strata", `v${STRATA_VERSION}-${STRATA_REVISION.slice(0, 8)}`);
}
export function resolvedStrataDirectory(settings: Pick<Settings, "strataInstallDirectory">): string {
  return settings.strataInstallDirectory?.trim() || managedStrataDirectory();
}
export async function strataManagedReceipt(root: string, complete = true): Promise<boolean> {
  try {
    const value = JSON.parse(await fs.readFile(path.join(root, receiptName), "utf8"));
    return value.owner === "local-video-studio" && value.revision === STRATA_REVISION && value.engineSha256 === STRATA_ENGINE_SHA256 && (!complete || Boolean(value.installedAt));
  } catch { return false; }
}
interface InstallationRuntime {
  download(url: string, destination: string, settings: Settings, onProgress?: (receivedBytes: number) => void): Promise<void>;
  findPython(settings: Settings): Promise<string>;
  environment(settings: Settings): NodeJS.ProcessEnv;
  run(executable: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; onLog?: (message: string) => void }): Promise<string>;
  managedDirectory?: string;
  verifyArchive?(filename: string): Promise<void>;
}
export async function verifyStrataEngineArchive(filename: string): Promise<void> {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(filename)) { checkInstallationCancelled(); digest.update(chunk); }
  if ((await fs.stat(filename)).size !== STRATA_ENGINE_BYTES || digest.digest("hex") !== STRATA_ENGINE_SHA256) throw new Error("Strata 引擎大小或 SHA-256 校验失败，未安装。");
}
let installing = false;

type StrataUninstallSettings = Pick<Settings, "strataInstallDirectory" | "modelDirectory" | "strataModelDirectory" | "comfyInstallDirectory">;
interface StrataUninstallOptions { managedDirectory?: string; protectedDirectories?: string[] }
const pathIdentity = (value: string) => process.platform === "win32" ? value.toLowerCase() : value;
export async function physicalPath(filename: string): Promise<string> {
  const resolved = path.resolve(filename);
  try { return await fs.realpath(resolved); }
  catch (error) {
    if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
    const parent = path.dirname(resolved);
    return parent === resolved ? resolved : path.join(await physicalPath(parent), path.basename(resolved));
  }
}
export function containsPath(parent: string, child: string): boolean {
  const relative = path.relative(pathIdentity(parent), pathIdentity(child));
  return !relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
async function checkedUninstallRoot(settings: StrataUninstallSettings, options: StrataUninstallOptions): Promise<string> {
  const root = path.resolve(options.managedDirectory ?? managedStrataDirectory());
  if (settings.strataInstallDirectory.trim() && pathIdentity(path.resolve(settings.strataInstallDirectory.trim())) !== pathIdentity(root)) {
    throw new Error("手动安装目录不由应用卸载，原文件未修改。");
  }
  const stat = await fs.lstat(root).catch(() => null);
  if (!stat?.isDirectory() || stat.isSymbolicLink() || !await strataManagedReceipt(root, false)) {
    throw new Error("未找到可卸载的应用管理 Strata 安装，请重新扫描。原文件未修改。");
  }
  const actualRoot = await physicalPath(root);
  const protectedDirectories = [settings.modelDirectory, settings.strataModelDirectory,
    settings.comfyInstallDirectory.trim() ? path.join(settings.comfyInstallDirectory, "models") : "",
    ...(options.protectedDirectories ?? [])].filter((directory) => directory.trim());
  for (const directory of protectedDirectories) {
    const actualModels = await physicalPath(directory);
    if (containsPath(actualRoot, actualModels) || containsPath(actualModels, actualRoot)) {
      throw new Error("Strata 安装目录与模型目录重叠，拒绝卸载以保护共享模型。请先调整目录并重新扫描。");
    }
  }
  return root;
}
export async function canUninstallStrata(settings: StrataUninstallSettings, options: StrataUninstallOptions = {}): Promise<boolean> {
  try { await checkedUninstallRoot(settings, options); return true; } catch { return false; }
}
/** Only the exact app-owned runtime; never remove siblings, shared weights or manual installs. */
export async function uninstallStrataRuntime(settings: StrataUninstallSettings, onProgress?: (message: string) => void, options: StrataUninstallOptions = {}): Promise<ConnectionResult> {
  if (installing) return { ok: false, message: "Strata 正在安装或卸载，请等待当前操作完成。" };
  installing = true;
  const logs: string[] = [];
  const log = (message: string) => { logs.push(message); onProgress?.(message); };
  try {
    const root = await checkedUninstallRoot(settings, options);
    log(`卸载 Strata 运行组件：${root}`);
    await fs.rm(root, { recursive: true, force: false });
    log("Strata 已卸载，共享模型、独立数据目录和旧安装备份保留。");
    return { ok: true, message: "Strata 已卸载，共享模型文件保留。", log: logs.join("\n") };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(message);
    return { ok: false, message, log: logs.join("\n") };
  } finally { installing = false; }
}

/** Software only. Never execute setup.py, a native engine or download weights. */
export async function installStrataRuntime(settings: Settings, runtime: InstallationRuntime, onProgress?: (message: string, progress?: StrataInstallProgress) => void): Promise<ConnectionResult> {
  if (installing) return { ok: false, message: "Strata 正在安装，请等待当前操作完成。" };
  installing = true;
  const logs: string[] = [];
  const log = (message: string) => { logs.push(message); onProgress?.(message); };
  const stage = (value: StrataInstallProgress["stage"], receivedBytes?: number) => onProgress?.("", {
    stage: value,
    ...(receivedBytes === undefined ? {} : { receivedBytes, totalBytes: STRATA_ENGINE_BYTES, percent: Math.min(100, Math.max(0, Math.floor(receivedBytes * 100 / STRATA_ENGINE_BYTES))) })
  });
  const root = path.resolve(runtime.managedDirectory ?? managedStrataDirectory());
  let staging = "";
  let backup = "";
  let published = false;
  let env: NodeJS.ProcessEnv | undefined;
  const run = (executable: string, args: string[], cwd: string, timeoutMs = 600_000) => runtime.run(executable, args, { cwd, env, timeoutMs, onLog: log });
  try {
    checkInstallationCancelled();
    stage("prepare");
    env = runtime.environment(settings);
    if (process.platform !== "win32") throw new Error("Strata 一键安装目前仅支持 Windows NVIDIA 版本。");
    if (settings.strataInstallDirectory.trim() && path.resolve(settings.strataInstallDirectory).toLowerCase() !== root.toLowerCase()) {
      throw new Error("当前选择的是手动安装目录。清空高级设置中的运行目录后，可使用应用管理安装；原目录不会被修改。");
    }
    const targetStat = await fs.lstat(root).catch(() => null);
    if (targetStat?.isSymbolicLink() || (targetStat && !await strataManagedReceipt(root, false))) throw new Error("安装目标已有非应用管理文件，拒绝覆盖。请在详情中检查目录。");
    const python = await runtime.findPython(settings);
    if (!python) throw new Error("未找到 Python。请在运行时设置中选择支持 venv 的 Python 3.10+，然后重试。");
    await fs.mkdir(path.dirname(root), { recursive: true });
    try { await run(python, ["-c", "import sys, venv; assert sys.version_info >= (3,10), 'Python 3.10+ required'"], path.dirname(root)); }
    catch { checkInstallationCancelled(); throw new Error("当前 Python 不支持独立 venv。请在运行时设置中选择标准 Python 3.10+（不要选择 Portable embedded Python）后重试。"); }
    staging = await fs.mkdtemp(path.join(path.dirname(root), ".install-"));
    log(`获取 Strata v${STRATA_VERSION} 固定源码（不下载模型）`);
    stage("source");
    await run("git.exe", ["init", staging], staging);
    await run("git.exe", ["remote", "add", "origin", "https://github.com/Niko1221/Strata.git"], staging);
    await run("git.exe", ["fetch", "--depth=1", "origin", STRATA_REVISION], staging);
    await run("git.exe", ["checkout", "--detach", "FETCH_HEAD"], staging);
    const revision = (await run("git.exe", ["rev-parse", "HEAD"], staging)).trim();
    if (revision !== STRATA_REVISION) throw new Error("Strata 源码提交校验失败。");
    log("下载并校验 NVIDIA 引擎");
    stage("download", 0);
    const archive = path.join(staging, "engine.zip");
    await runtime.download(STRATA_ENGINE_URL, archive, settings, (receivedBytes) => stage("download", receivedBytes));
    stage("verify");
    await (runtime.verifyArchive ?? verifyStrataEngineArchive)(archive);
    const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
    const expandScript = `$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath ${literal(archive)} -DestinationPath ${literal(path.join(staging, "engine"))} -Force`;
    stage("extract");
    await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(expandScript, "utf16le").toString("base64")], staging);
    for (const name of ["strata.exe", "strata-vision.exe", "BUILD.json"]) {
      if (!(await fs.stat(path.join(staging, "engine", name))).size) throw new Error(`引擎缺少 ${name}`);
    }
    // Publish before creating venv: Windows scripts retain their absolute paths.
    checkInstallationCancelled();
    // A crash during pip must remain app-owned/retryable, but never installed.
    await fs.writeFile(path.join(staging, receiptName), JSON.stringify({ owner: "local-video-studio", revision: STRATA_REVISION, engineSha256: STRATA_ENGINE_SHA256 }), "utf8");
    if (await strataManagedReceipt(root, false)) {
      const candidate = `${root}.backup-${Date.now()}`;
      await renameWithRetry(root, candidate);
      backup = candidate;
    }
    checkInstallationCancelled();
    await renameWithRetry(staging, root); staging = ""; published = true;
    log("创建独立 Python 环境（不修改 ComfyUI Python 包）");
    stage("python");
    await run(python, ["-m", "venv", "--copies", path.join(root, ".venv")], root);
    const isolatedPython = path.join(root, ".venv", "Scripts", "python.exe");
    stage("packages");
    await run(isolatedPython, ["-m", "pip", "install", "--only-binary=:all:", "-r", path.join(root, "requirements.txt"), "nvidia-cublas==13.0.2.14", "nvidia-cuda-runtime==13.0.96"], root, 1_800_000);
    log("检查 Python 包及 CUDA DLL 文件（不加载 GPU）");
    stage("check");
    await run(isolatedPython, ["-c", "import numpy,jinja2,regex,yaml,tqdm,requests,PIL,psutil; import pathlib,sys; p=pathlib.Path(sys.prefix)/'Lib/site-packages/nvidia'; assert list(p.rglob('cublas64_13.dll')) and list(p.rglob('cudart64_13.dll')), 'CUDA DLL files missing'"], root);
    checkInstallationCancelled();
    await fs.writeFile(path.join(root, receiptName), JSON.stringify({ owner: "local-video-studio", version: STRATA_VERSION, revision: STRATA_REVISION, engineSha256: STRATA_ENGINE_SHA256, installedAt: new Date().toISOString() }), "utf8");
    log(`运行组件安装完成：${root}`);
    stage("complete");
    if (backup) log(`旧安装保留在：${backup}`);
    return { ok: true, message: "Strata 运行组件已安装。模型文件齐备后，可通过现有提示词按钮完成首次准备与加载。", log: logs.join("\n") };
  } catch (error) {
    stage("recovery");
    const message = error instanceof Error ? error.message : String(error);
    log(message);
    if (published) {
      const failed = `${root}.failed-${Date.now()}`;
      try { await renameWithRetry(root, failed); log(`失败安装保留在：${failed}`); }
      catch (moveError) { log(`失败安装仍位于 ${root}；移动失败：${String(moveError)}`); }
    }
    if (backup) await renameWithRetry(backup, root).catch((restoreError) => log(`旧安装保留在 ${backup}；恢复失败：${String(restoreError)}`));
    if (staging) log(`未完成下载保留在：${staging}`);
    return { ok: false, message, log: logs.join("\n") };
  } finally {
    installing = false;
  }
}
