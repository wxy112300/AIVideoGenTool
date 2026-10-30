import { createNativeTranslator } from "../ui-translator.js";
import type { Translate } from "../../src/core/i18n.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
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
import { gitSoftwareFiles } from "./software-git-files.js";
import { fetchStrataSource } from "./strata-source-fetch.js";
import type { ConnectionResult, Settings, StrataInstallProgress } from "../../src/types.js";
import { STRATA_ENGINE_BYTES, STRATA_ENGINE_FILES, STRATA_ENGINE_SHA256, STRATA_ENGINE_URL, STRATA_ENGINE_VERSION, STRATA_ENGINE_MANIFEST_SHA256, STRATA_REVISION, STRATA_VERSION, STRATA_RELEASES } from "../../src/core/catalog/dependencies/strata.js";

const receiptName = "lvs-strata-install.json";
const vectorDirectories = ["data/lvs-control-vectors", "data/experimental-speed-projection"];
async function preserveStrataUserData(source: string, destination: string, t: Translate = createNativeTranslator(undefined).t) {
  const head = (await fs.readFile(path.join(source, ".git", "HEAD"), "utf8").catch(() => "")).trim();
  const release = strataInstalledRelease(source, false) ?? STRATA_RELEASES.find(release => release.revision === head);
  const downloadable = release ? await gitSoftwareFiles(source, { repository: "https://github.com/Niko1221/Strata", revision: release.revision }) : new Set<string>();
  await preserveSoftwareUserData(source, destination, vectorDirectories, undefined, [...downloadable], t);
}
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
export async function verifyStrataEngineArchive(filename: string, t: Translate = createNativeTranslator(undefined).t): Promise<void> {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(filename)) { checkInstallationCancelled(); digest.update(chunk); }
  if ((await fs.stat(filename)).size !== STRATA_ENGINE_BYTES || digest.digest("hex") !== STRATA_ENGINE_SHA256) throw new Error(t(uiKeys.strataRuntime.archiveInvalid));
}
let installing = false;

type StrataUninstallSettings = Pick<Settings, "strataInstallDirectory" | "modelDirectory" | "strataModelDirectory" | "comfyInstallDirectory"> & Partial<Pick<Settings, "uiLocale">>;
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
  const t = createNativeTranslator(settings.uiLocale).t;
  const root = path.resolve(options.managedDirectory ?? resolvedStrataDirectory(settings));
  if (!options.managedDirectory && !isManagedStrataPath(root)) {
    throw new Error(t(uiKeys.strataRuntime.manualUninstall));
  }
  if (settings.strataInstallDirectory.trim() && !isManagedStrataPath(settings.strataInstallDirectory) && pathIdentity(path.resolve(settings.strataInstallDirectory.trim())) !== pathIdentity(root)) {
    throw new Error(t(uiKeys.strataRuntime.manualUninstall));
  }
  const stat = await fs.lstat(root).catch(() => null);
  if (!stat?.isDirectory() || stat.isSymbolicLink() || !await strataManagedReceipt(root, false)) {
    throw new Error(t(uiKeys.strataRuntime.uninstallMissing));
  }
  const actualRoot = await physicalPath(root);
  const protectedDirectories = [settings.modelDirectory, settings.strataModelDirectory,
    settings.comfyInstallDirectory.trim() ? path.join(settings.comfyInstallDirectory, "models") : "",
    ...(options.protectedDirectories ?? [])].filter((directory) => directory.trim());
  for (const directory of protectedDirectories) {
    const actualModels = await physicalPath(directory);
    if (containsPath(actualRoot, actualModels) || containsPath(actualModels, actualRoot)) {
      throw new Error(t(uiKeys.strataRuntime.modelOverlap));
    }
  }
  return root;
}
export async function canUninstallStrata(settings: StrataUninstallSettings, options: StrataUninstallOptions = {}): Promise<boolean> {
  try { await checkedUninstallRoot(settings, options); return true; } catch { return false; }
}
/** Only the exact app-owned runtime; never remove siblings, shared weights or manual installs. */
export async function uninstallStrataRuntime(settings: StrataUninstallSettings, onProgress?: (message: string) => void, options: StrataUninstallOptions = {}): Promise<ConnectionResult> {
  const t = createNativeTranslator(settings.uiLocale).t;
  if (installing) return { ok: false, message: t(uiKeys.strataRuntime.busy) };
  installing = true;
  const logs: string[] = [];
  const log = (message: string) => { logs.push(message); onProgress?.(message); };
  try {
    const root = await checkedUninstallRoot(settings, options);
    log(t(uiKeys.strataRuntime.uninstalling, { path: root }));
    await fs.rm(root, { recursive: true, force: false });
    log(t(uiKeys.strataRuntime.uninstalledLog));
    return { ok: true, message: t(uiKeys.strataRuntime.uninstalled), log: logs.join("\n") };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(message);
    return { ok: false, message, log: logs.join("\n") };
  } finally { installing = false; }
}

/** Software only. Never execute setup.py, a native engine or download weights. */
export async function installStrataRuntime(settings: Settings, runtime: InstallationRuntime, onProgress?: (message: string, progress?: StrataInstallProgress) => void): Promise<ConnectionResult> {
  const t = createNativeTranslator(settings.uiLocale).t;
  if (installing) return { ok: false, message: t(uiKeys.strataRuntime.installBusy) };
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
    if (process.platform !== "win32") throw new Error(t(uiKeys.strataRuntime.windowsOnly));
    if (settings.strataInstallDirectory.trim() && !isManagedStrataPath(settings.strataInstallDirectory) && path.resolve(settings.strataInstallDirectory).toLowerCase() !== root.toLowerCase()) {
      throw new Error(t(uiKeys.strataRuntime.manualSelected));
    }
    const targetStat = await fs.lstat(root).catch(() => null);
    if (targetStat?.isSymbolicLink() || (targetStat && !await strataManagedReceipt(root, false))) throw new Error(t(uiKeys.strataRuntime.unknownTarget));
    const python = await runtime.findPython(settings);
    if (!python) throw new Error(t(uiKeys.strataRuntime.pythonMissing));
    await fs.mkdir(path.dirname(root), { recursive: true });
    try { await run(python, ["-c", "import sys, venv; assert sys.version_info >= (3,10), 'Python 3.10+ required'"], path.dirname(root)); }
    catch { checkInstallationCancelled(); throw new Error(t(uiKeys.strataRuntime.venvMissing)); }
    staging = await fs.mkdtemp(path.join(path.dirname(root), ".install-"));
    await fs.writeFile(path.join(staging, "lvs-strata-stage.json"), JSON.stringify({ owner: "local-video-studio" }));
    log(t(uiKeys.strataRuntime.source, { version: STRATA_VERSION }));
    stage("source");
    await run("git.exe", ["init", staging], staging);
    await run("git.exe", ["remote", "add", "origin", "https://github.com/Niko1221/Strata.git"], staging);
    await fetchStrataSource(staging, ["--depth=1", "origin", STRATA_REVISION], run, log, t);
    await run("git.exe", ["checkout", "--detach", "FETCH_HEAD"], staging);
    const revision = (await run("git.exe", ["rev-parse", "HEAD"], staging)).trim();
    if (revision !== STRATA_REVISION) throw new Error(t(uiKeys.strataRuntime.revisionMismatch));
    await installStrataGgufPython(staging, run, log, t);
    log(t(uiKeys.strataRuntime.downloadEngine));
    stage("download", 0);
    archive = await prepareStrataDownloadCache(path.dirname(root), { run, log }, undefined, t);
    await runtime.download(STRATA_ENGINE_URL, archive, settings, (receivedBytes) => stage("download", receivedBytes), log);
    stage("verify");
    try { await (runtime.verifyArchive ? runtime.verifyArchive(archive) : verifyStrataEngineArchive(archive, t)); }
    catch (error) {
      checkInstallationCancelled();
      await removeSoftwareArtifact(path.dirname(root), archive, log, undefined, t);
      log(t(uiKeys.strataRuntime.badArchiveRemoved));
      throw error;
    }
    stage("extract");
    await fs.mkdir(path.join(staging, "engine"), { recursive: true });
    await run("tar.exe", ["-xzf", archive, "-C", path.join(staging, "engine")], staging);
    for (const name of STRATA_ENGINE_FILES) {
      if (!(await fs.stat(path.join(staging, name))).size) throw new Error(t(uiKeys.strataRuntime.engineFileMissing, { name: name }));
    }
    // The archive hash pins the package; also check its independently published component identity.
    const manifestBytes = await fs.readFile(path.join(staging, "engine", "engine-component.json"));
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    if (createHash("sha256").update(manifestBytes).digest("hex") !== STRATA_ENGINE_MANIFEST_SHA256
      || manifest.version !== STRATA_ENGINE_VERSION || manifest.platform !== "windows-x86_64" || manifest.backend !== "cuda") throw new Error(t(uiKeys.strataRuntime.manifestMismatch));
    checkInstallationCancelled();
    const vector = STRATA_COMMUNITY_VECTOR;
    stage("assets");
    log(t(uiKeys.strataRuntime.vectorPreparing, { id: vector.id, bytes: vector.bytes }));
    const vectorFile = path.join(staging, vector.relativePath);
    await fs.mkdir(path.dirname(vectorFile), { recursive: true });
    await runtime.download(vector.source, vectorFile, settings, undefined, log, vector.bytes);
    checkInstallationCancelled();
    await verifyStrataControlVector(staging, "community");
    await verifyStrataControlVector(staging, "builtin");
    await fs.writeFile(path.join(path.dirname(vectorFile), "NOTICE.txt"),
      `Community vector by sergqwer, derived from Qwen3.8-Flash-Next. Qwen Community License 1.0 applies.\nSource and license notice: ${vector.notice}\nRevision: ${vector.revision}\nSHA-256: ${vector.sha256}\nExperimental refusal-reduction projection; not a guarantee of output quality or refusal-free behavior.\n`, "utf8");
    log(t(uiKeys.strataRuntime.vectorVerified, { id: vector.id, first: vector.firstLayer, last: vector.lastLayer }));
    // Publish before creating venv: Windows scripts retain their absolute paths.
    checkInstallationCancelled();
    // A crash during pip must remain app-owned/retryable, but never installed.
    await fs.writeFile(path.join(staging, receiptName), JSON.stringify({ owner: "local-video-studio", revision: STRATA_REVISION, engineSha256: STRATA_ENGINE_SHA256 }), "utf8");
    if (await strataManagedReceipt(root, false)) {
      await preserveStrataUserData(root, staging, t);
      const candidate = `${root}.backup-${Date.now()}`;
      await renameWithRetry(root, candidate);
      backup = candidate;
    }
    checkInstallationCancelled();
    await renameWithRetry(staging, root); staging = ""; published = true;
    log(t(uiKeys.strataRuntime.venvCreating));
    stage("python");
    await run(python, ["-m", "venv", "--copies", path.join(root, ".venv")], root);
    const isolatedPython = path.join(root, ".venv", "Scripts", "python.exe");
    stage("packages");
    await run(isolatedPython, ["-m", "pip", "install", "--no-cache-dir", "--only-binary=:all:", "-r", path.join(root, "requirements.txt")], root, 1_800_000);
    log(t(uiKeys.strataRuntime.checking));
    stage("check");
    await run(isolatedPython, ["-c", "import numpy,jinja2,regex,yaml,tqdm,requests,PIL,psutil,truststore; from pathlib import Path; from strata_control.engine_component import read_manifest,verify; verify(read_manifest(Path('engine')),full=True)"], root);
    checkInstallationCancelled();
    await fs.writeFile(path.join(root, receiptName), JSON.stringify({ owner: "local-video-studio", version: STRATA_VERSION, revision: STRATA_REVISION, engineSha256: STRATA_ENGINE_SHA256, installedAt: new Date().toISOString() }), "utf8");
    log(t(uiKeys.strataRuntime.installedLog, { path: root }));
    stage("complete");
    // The temporary old copy exists only until installation validation succeeds.
    if (backup) { await removeSoftwareArtifact(path.dirname(root), backup, log, undefined, t); backup = ""; }
    await cleanupStrataSoftware(settings, root, log).catch(error => log(t(uiKeys.strataRuntime.cleanupFailed, { reason: String(error) })));
    return { ok: true, message: t(uiKeys.strataRuntime.installed), log: logs.join("\n") };
  } catch (error) {
    stage("recovery");
    const message = error instanceof Error ? error.message : String(error);
    log(message);
    if (published) {
      await removeSoftwareArtifact(path.dirname(root), root, log, undefined, t);
    }
    if (backup) await renameWithRetry(backup, root).catch((restoreError) => log(t(uiKeys.strataRuntime.restoreFailed, { path: backup, reason: String(restoreError) })));
    if (staging) await removeSoftwareArtifact(path.dirname(root), staging, log, undefined, t);
    if (archive) log(t(uiKeys.strataRuntime.cacheRetained, { path: archive }));
    return { ok: false, message, log: logs.join("\n") };
  } finally {
    installing = false;
  }
}

/** Called after a verified install only; never walk shared models or private Agent/GUI data. */
async function cleanupStrataSoftware(settings: Settings, root: string, log: (message: string) => void) {
  const t = createNativeTranslator(settings.uiLocale).t;
  const parent = path.dirname(root);
  for (const entry of await fs.readdir(parent, { withFileTypes: true })) {
    const candidate = path.join(parent, entry.name);
    if (!entry.isDirectory() || entry.isSymbolicLink() || candidate === root) continue;
    if (/^(?:v\d+\.\d+\.\d+(?:\.\d+)?-[a-f0-9]{8}|runtime)(?:\.(?:backup|failed)-\d+)?$/iu.test(entry.name) && await strataManagedReceipt(candidate, false)) {
      try {
        await checkedUninstallRoot({ ...settings, strataInstallDirectory: candidate }, { managedDirectory: candidate });
        await preserveStrataUserData(candidate, root, t);
        await removeSoftwareArtifact(parent, candidate, log, undefined, t);
      } catch (error) { log(t(uiKeys.strataRuntime.oldSoftwareRetained, { path: candidate, reason: String(error) })); }
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
          await preserveStrataUserData(candidate, root, t);
          await removeSoftwareArtifact(parent, candidate, log, undefined, t);
        }
      } catch (error) { log(t(uiKeys.strataRuntime.oldStageRetained, { path: candidate, reason: String(error) })); }
    }
  }
  const downloads = path.join(parent, "downloads");
  for (const entry of await fs.readdir(downloads, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !/^engine-[a-f0-9]{40}-[a-f0-9]{64}$/iu.test(entry.name)) continue;
    const directory = path.join(downloads, entry.name);
    try {
      const receipt = JSON.parse(await fs.readFile(path.join(directory, "download.json"), "utf8"));
      if (receipt.owner === "local-video-studio" && entry.name === `engine-${receipt.revision}-${receipt.sha256}`) await removeSoftwareArtifact(parent, directory, log, undefined, t);
    } catch { /* Do not remove unknown downloads. */ }
  }
}
