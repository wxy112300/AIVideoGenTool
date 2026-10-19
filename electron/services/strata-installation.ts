import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { renameWithRetry } from "./filesystem-retry.js";
import { checkInstallationCancelled } from "./installation-cancellation.js";
import { prepareStrataDownloadCache } from "./strata-download-cache.js";
import { installStrataGgufPython } from "./strata-gguf-python.js";
import { STRATA_COMMUNITY_VECTOR } from "../../src/core/strata-uncensored.js";
import { verifyStrataControlVector } from "./strata-uncensored.js";
import { removeSoftwareArtifact, preserveSoftwareUserData } from "./software-update-cleanup.js";
import type { ConnectionResult, Settings, StrataInstallProgress } from "../../src/types.js";
import { STRATA_ENGINE_BYTES, STRATA_ENGINE_SHA256, STRATA_ENGINE_URL, STRATA_REVISION, STRATA_VERSION, STRATA_RELEASES } from "../../src/core/catalog/dependencies/strata.js";

const receiptName = "lvs-strata-install.json";
const vectorDirectories = ["data/lvs-control-vectors", "data/experimental-speed-projection"];
export function managedStrataDirectory(release?: { version: string; revision: string }): string {
  return path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "Local Video Studio", "strata", release ? `v${release.version}-${release.revision.slice(0, 8)}` : "runtime");
}
export function isManagedStrataPath(directory: string): boolean {
  const root = path.resolve(directory), current = path.resolve(managedStrataDirectory());
  return root.toLowerCase() === current.toLowerCase() ||
    (path.dirname(root).toLowerCase() === path.dirname(current).toLowerCase() && /^v\d+\.\d+\.\d+(?:\.\d+)?-[a-f0-9]{8}$/iu.test(path.basename(root)));
}
export function strataInstalledRelease(root: string, complete = true): typeof STRATA_RELEASES[number] | undefined {
  try {
    const value = JSON.parse(readFileSync(path.join(root, receiptName), "utf8"));
    if (value.owner !== "local-video-studio" || (complete && !value.installedAt)) return undefined;
    return STRATA_RELEASES.find((release) => value.revision === release.revision && value.engineSha256 === release.engineSha256
      && (!value.version || value.version === release.version));
  } catch { return undefined; }
}
export function resolvedStrataDirectory(settings: Pick<Settings, "strataInstallDirectory">): string {
  const selected = settings.strataInstallDirectory?.trim();
  if (selected && !isManagedStrataPath(selected)) return selected;
  const current = managedStrataDirectory();
  if (strataInstalledRelease(current) && existsSync(path.join(current, ".venv", "Scripts", "python.exe"))) return current;
  for (const release of STRATA_RELEASES) {
    const root = managedStrataDirectory(release);
    if (strataInstalledRelease(root) && existsSync(path.join(root, ".venv", "Scripts", "python.exe"))) return root;
  }
  return selected && strataInstalledRelease(selected) ? selected : managedStrataDirectory();
}
export async function strataManagedReceipt(root: string, complete = true): Promise<boolean> {
  try {
    const stat = await fs.lstat(path.join(root, receiptName));
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8192) return false;
    const receipt = JSON.parse(await fs.readFile(path.join(root, receiptName), "utf8"));
    return receipt.owner === "local-video-studio" && /^[a-f0-9]{40}$/u.test(receipt.revision) && /^[a-f0-9]{64}$/u.test(receipt.engineSha256) && (!complete || Boolean(receipt.installedAt));
  } catch { return false; }
}
interface InstallationRuntime {
  download(url: string, destination: string, settings: Settings, onProgress?: (receivedBytes: number) => void, onLog?: (message: string) => void, totalBytes?: number): Promise<void>;
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
  const root = path.resolve(options.managedDirectory ?? resolvedStrataDirectory(settings));
  if (!options.managedDirectory && !isManagedStrataPath(root)) {
    throw new Error("手动安装目录不由应用卸载，原文件未修改。");
  }
  if (settings.strataInstallDirectory.trim() && !isManagedStrataPath(settings.strataInstallDirectory) && pathIdentity(path.resolve(settings.strataInstallDirectory.trim())) !== pathIdentity(root)) {
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
    log("Strata 已卸载，共享模型与独立用户数据保留。");
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
  let archive = "";
  let env: NodeJS.ProcessEnv | undefined;
  const run = (executable: string, args: string[], cwd: string, timeoutMs = 600_000) => runtime.run(executable, args, { cwd, env, timeoutMs, onLog: log });
  try {
    checkInstallationCancelled();
    stage("prepare");
    env = runtime.environment(settings);
    if (process.platform !== "win32") throw new Error("Strata 一键安装目前仅支持 Windows NVIDIA 版本。");
    if (settings.strataInstallDirectory.trim() && !isManagedStrataPath(settings.strataInstallDirectory) && path.resolve(settings.strataInstallDirectory).toLowerCase() !== root.toLowerCase()) {
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
    await fs.writeFile(path.join(staging, "lvs-strata-stage.json"), JSON.stringify({ owner: "local-video-studio" }));
    log(`获取 Strata v${STRATA_VERSION} 固定源码（不下载模型）`);
    stage("source");
    await run("git.exe", ["init", staging], staging);
    await run("git.exe", ["remote", "add", "origin", "https://github.com/Niko1221/Strata.git"], staging);
    await run("git.exe", ["fetch", "--depth=1", "origin", STRATA_REVISION], staging);
    await run("git.exe", ["checkout", "--detach", "FETCH_HEAD"], staging);
    const revision = (await run("git.exe", ["rev-parse", "HEAD"], staging)).trim();
    if (revision !== STRATA_REVISION) throw new Error("Strata 源码提交校验失败。");
    await installStrataGgufPython(staging, run, log);
    log("下载并校验 NVIDIA 引擎");
    stage("download", 0);
    archive = await prepareStrataDownloadCache(path.dirname(root), { run, log });
    await runtime.download(STRATA_ENGINE_URL, archive, settings, (receivedBytes) => stage("download", receivedBytes), log);
    stage("verify");
    try { await (runtime.verifyArchive ?? verifyStrataEngineArchive)(archive); }
    catch (error) {
      checkInstallationCancelled();
      await removeSoftwareArtifact(path.dirname(root), archive, log);
      log("已清理校验失败的引擎包；再次更新将重新下载");
      throw error;
    }
    const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
    const expandScript = `$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath ${literal(archive)} -DestinationPath ${literal(path.join(staging, "engine"))} -Force`;
    stage("extract");
    await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(expandScript, "utf16le").toString("base64")], staging);
    for (const name of ["strata.exe", "strata-vision.exe", "BUILD.json"]) {
      if (!(await fs.stat(path.join(staging, "engine", name))).size) throw new Error(`引擎缺少 ${name}`);
    }
    checkInstallationCancelled();
    const vector = STRATA_COMMUNITY_VECTOR;
    stage("assets");
    log(`准备社区控制向量 ${vector.id}（${vector.bytes} bytes，不下载模型）`);
    const vectorFile = path.join(staging, vector.relativePath);
    await fs.mkdir(path.dirname(vectorFile), { recursive: true });
    await runtime.download(vector.source, vectorFile, settings, undefined, log, vector.bytes);
    checkInstallationCancelled();
    await verifyStrataControlVector(staging, "community");
    await verifyStrataControlVector(staging, "builtin");
    await fs.writeFile(path.join(path.dirname(vectorFile), "NOTICE.txt"),
      `Community vector by sergqwer, derived from Qwen3.8-Flash-Next. Qwen Community License 1.0 applies.\nSource and license notice: ${vector.notice}\nRevision: ${vector.revision}\nSHA-256: ${vector.sha256}\nExperimental refusal-reduction projection; not a guarantee of output quality or refusal-free behavior.\n`, "utf8");
    log(`控制向量 SHA-256 校验通过：${vector.id}，作用层 ${vector.firstLayer}..${vector.lastLayer}`);
    // Publish before creating venv: Windows scripts retain their absolute paths.
    checkInstallationCancelled();
    // A crash during pip must remain app-owned/retryable, but never installed.
    await fs.writeFile(path.join(staging, receiptName), JSON.stringify({ owner: "local-video-studio", revision: STRATA_REVISION, engineSha256: STRATA_ENGINE_SHA256 }), "utf8");
    if (await strataManagedReceipt(root, false)) {
      await preserveSoftwareUserData(root, staging, vectorDirectories);
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
    await run(isolatedPython, ["-m", "pip", "install", "--no-cache-dir", "--only-binary=:all:", "-r", path.join(root, "requirements.txt"), "nvidia-cublas==13.0.2.14", "nvidia-cuda-runtime==13.0.96"], root, 1_800_000);
    log("检查 Python 包及 CUDA DLL 文件（不加载 GPU）");
    stage("check");
    await run(isolatedPython, ["-c", "import numpy,jinja2,regex,yaml,tqdm,requests,PIL,psutil; import pathlib,sys; p=pathlib.Path(sys.prefix)/'Lib/site-packages/nvidia'; assert list(p.rglob('cublas64_13.dll')) and list(p.rglob('cudart64_13.dll')), 'CUDA DLL files missing'"], root);
    checkInstallationCancelled();
    await fs.writeFile(path.join(root, receiptName), JSON.stringify({ owner: "local-video-studio", version: STRATA_VERSION, revision: STRATA_REVISION, engineSha256: STRATA_ENGINE_SHA256, installedAt: new Date().toISOString() }), "utf8");
    log(`运行组件安装完成：${root}`);
    stage("complete");
    // The temporary old copy exists only until installation validation succeeds.
    if (backup) { await removeSoftwareArtifact(path.dirname(root), backup, log); backup = ""; }
    await cleanupStrataSoftware(settings, root, log).catch(error => log(`旧软件清理未完成：${String(error)}；新版安装保持可用。`));
    return { ok: true, message: "Strata 运行组件已安装。模型文件齐备后，可通过现有提示词按钮完成首次准备与加载。", log: logs.join("\n") };
  } catch (error) {
    stage("recovery");
    const message = error instanceof Error ? error.message : String(error);
    log(message);
    if (published) {
      await removeSoftwareArtifact(path.dirname(root), root, log);
    }
    if (backup) await renameWithRetry(backup, root).catch((restoreError) => log(`旧安装保留在 ${backup}；恢复失败：${String(restoreError)}`));
    if (staging) await removeSoftwareArtifact(path.dirname(root), staging, log);
    if (archive) log(`引擎下载缓存保留在：${archive}`);
    return { ok: false, message, log: logs.join("\n") };
  } finally {
    installing = false;
  }
}

/** Called after a verified install only; never walk shared models or private Agent/GUI data. */
async function cleanupStrataSoftware(settings: Settings, root: string, log: (message: string) => void) {
  const parent = path.dirname(root);
  for (const entry of await fs.readdir(parent, { withFileTypes: true })) {
    const candidate = path.join(parent, entry.name);
    if (!entry.isDirectory() || entry.isSymbolicLink() || candidate === root) continue;
    if (/^(?:v\d+\.\d+\.\d+(?:\.\d+)?-[a-f0-9]{8}|runtime)(?:\.(?:backup|failed)-\d+)?$/iu.test(entry.name) && await strataManagedReceipt(candidate, false)) {
      try {
        await checkedUninstallRoot({ ...settings, strataInstallDirectory: candidate }, { managedDirectory: candidate });
        await preserveSoftwareUserData(candidate, root, vectorDirectories);
        await removeSoftwareArtifact(parent, candidate, log);
      } catch (error) { log(`旧软件未清理：${candidate}；${String(error)}`); }
    } else if (/^\.install-[a-z0-9]+$/iu.test(entry.name)) {
      try {
        const marker = await fs.readFile(path.join(candidate, "lvs-strata-stage.json"), "utf8").catch(() => "{}");
        let owned = JSON.parse(marker).owner === "local-video-studio";
        if (!owned) {
          const config = await fs.readFile(path.join(candidate, ".git", "config"), "utf8").catch(() => "");
          const head = (await fs.readFile(path.join(candidate, ".git", "HEAD"), "utf8").catch(() => "")).trim();
          owned = /\[remote "origin"\][^[]*?url\s*=\s*https:\/\/github\.com\/Niko1221\/Strata(?:\.git)?\s*(?:\r?\n|$)/u.test(config) && /^[a-f0-9]{40}$/u.test(head);
        }
        if (owned) {
          await preserveSoftwareUserData(candidate, root, vectorDirectories);
          await removeSoftwareArtifact(parent, candidate, log);
        }
      } catch (error) { log(`旧安装暂存未清理：${candidate}；${String(error)}`); }
    }
  }
  const downloads = path.join(parent, "downloads");
  for (const entry of await fs.readdir(downloads, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !/^engine-[a-f0-9]{40}-[a-f0-9]{64}$/iu.test(entry.name)) continue;
    const directory = path.join(downloads, entry.name);
    try {
      const receipt = JSON.parse(await fs.readFile(path.join(directory, "download.json"), "utf8"));
      if (receipt.owner === "local-video-studio" && entry.name === `engine-${receipt.revision}-${receipt.sha256}`) await removeSoftwareArtifact(parent, directory, log);
    } catch { /* Do not remove unknown downloads. */ }
  }
}
