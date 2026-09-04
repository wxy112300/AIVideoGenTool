import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  ConnectionResult,
  Dlss5RuntimeStatus,
  Settings
} from "../../src/types.js";
import {
  DLSS5_NODE_DIRECTORY,
  DLSS5_NODE_REVISION,
  DLSS5_RUNTIME_ARTIFACTS,
  DLSS5_RUNTIME_BUNDLE_ID,
  type Dlss5RuntimeArtifact
} from "../../src/core/catalog/index.js";
import { isLocalComfyUrl } from "./comfy-endpoint.js";

export const DLSS5_RUNTIME_CONFIG_FILENAME = "config.json";
export const DLSS5_RUNTIME_MANIFEST_FILENAME = "install-manifest.json";
export const DLSS5_RUNTIME_DOWNLOAD_DIRECTORY = "downloads";
export const DLSS5_RUNTIME_BACKUP_DIRECTORY = "dlss5-runtime-backups";
const DLSS5_RUNTIME_STAGING_PREFIX = ".dlss5-runtime-staging-";

const SHARED_CONFIG_KEYS = ["python", "temp_dir"] as const;
const REQUIRED_RUNTIME_FILES = ["python.exe", "vsdlsssr.dll", "nvngx_dlss.dll"] as const;

interface Dlss5RuntimeConfig {
  python?: unknown;
  sr_plugin?: unknown;
  sr_runtime?: unknown;
  temp_dir?: unknown;
  nr_plugin?: unknown;
  nr_runtime?: unknown;
  timeout_seconds?: unknown;
  vapourkit_release?: unknown;
  vapourkit_archive_sha256?: unknown;
}

interface Dlss5RuntimeInstallManifest {
  schemaVersion: 1;
  bundleId: string;
  nodeRevision: string;
  installedAt: string;
  artifacts: Array<{
    id: string;
    repository: string;
    releaseTag: string;
    assetName: string;
    url: string;
    sha256: string;
    archive: Dlss5RuntimeArtifact["archive"];
  }>;
  ownedFiles: string[];
}

export interface Dlss5RuntimeProcessOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  onLog?: (message: string) => void;
}

export interface Dlss5RuntimeInstallerDependencies {
  platform?: NodeJS.Platform;
  findComfyPython(settings: Settings, comfyRoot: string): Promise<string>;
  findExecutable(command: string): Promise<string>;
  downloadEnvironment(settings: Settings, comfyRoot?: string): NodeJS.ProcessEnv;
  runLoggedProcess(
    executable: string,
    args: string[],
    options: Dlss5RuntimeProcessOptions
  ): Promise<string>;
  renameWithRetry(source: string, target: string): Promise<void>;
  /** True for transient Windows file-lock errors. Kept for injected runtimes. */
  retryableRenameError(error: unknown): boolean;
  /** Test/local fixture hook. The destination is the temporary .partial file. */
  downloadFile?(
    url: string,
    destination: string,
    settings: Settings,
    options: { comfyRoot: string; signal?: AbortSignal; onLog?: (message: string) => void }
  ): Promise<void>;
  /** Test/local fixture hook. Implementations must extract only the validated entries. */
  extractArchive?(
    archive: string,
    destination: string,
    python: string,
    environment: NodeJS.ProcessEnv,
    options: { signal?: AbortSignal; onLog?: (message: string) => void }
  ): Promise<readonly string[]>;
  /** Local-fixture override; production always consumes the catalog manifest. */
  artifacts?: readonly Dlss5RuntimeArtifact[];
  randomId?: () => string;
  now?: () => Date;
}

export interface Dlss5RuntimeOperationResult extends ConnectionResult {
  status?: Dlss5RuntimeStatus;
}

function platformFor(deps?: Pick<Dlss5RuntimeInstallerDependencies, "platform">): NodeJS.Platform {
  return deps?.platform ?? process.platform;
}

function runtimeNodeDirectory(comfyRoot: string): string {
  return path.join(comfyRoot, "custom_nodes", DLSS5_NODE_DIRECTORY);
}

export function dlss5RuntimeDirectory(comfyRoot: string, nodeDirectory = ""): string {
  return path.join(nodeDirectory || runtimeNodeDirectory(comfyRoot), "runtime");
}

export function isPathInsideDirectory(root: string, candidate: string): boolean {
  if (!root || !candidate) return false;
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

/** Normalize an archive/manifest path without allowing absolute or parent escapes. */
export function safeRelativePath(value: string): string | null {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) return null;
  const normalized = value.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[a-z]:\//iu.test(normalized)) return null;
  const parts = normalized.split("/").filter(Boolean);
  if (!parts.length || parts.some((part) => part === "." || part === "..")) return null;
  return parts.join("/");
}

export function validateDlss5ArchiveEntries(
  entries: readonly string[]
): string[] {
  const normalized = entries.map((entry) => safeRelativePath(entry));
  if (normalized.some((entry) => !entry)) {
    throw new Error("DLSS5 runtime 归档包含不安全路径，已拒绝解压。");
  }
  const result = [...new Set(normalized as string[])];
  if (!result.length) throw new Error("DLSS5 runtime 归档为空，已拒绝安装。");
  return result;
}

export function validateDlss5ArtifactContents(
  entries: readonly string[],
  expectedFiles: readonly string[]
): string[] {
  const normalized = validateDlss5ArchiveEntries(entries);
  const basenames = new Set(normalized.map((entry) => path.basename(entry).toLowerCase()));
  const missing = expectedFiles.filter((filename) => !basenames.has(filename.toLowerCase()));
  if (missing.length) {
    const desktopPackage = basenames.has("app.asar") ||
      normalized.some((entry) => entry.toLowerCase().startsWith("resources/app.asar"));
    const detail = desktopPackage
      ? "该固定资产是 VapourKit 桌面应用包，不是 ComfyUI-DLSS5 所需的便携 runtime"
      : "固定资产内容与 catalog manifest 不一致";
    throw new Error(
      `DLSS5 runtime 归档缺少预期文件：${missing.join("、")}；${detail}。` +
      "安装已在解压前停止；需要上游发布包含这些文件的合法 runtime 后才能继续。"
    );
  }
  return normalized;
}

async function assertNoLinks(root: string): Promise<void> {
  const pending = [root];
  while (pending.length) {
    const current = pending.pop()!;
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        throw new Error(`DLSS5 runtime 归档包含符号链接：${entry.name}，已拒绝安装。`);
      }
      if (entry.isDirectory()) pending.push(path.join(current, entry.name));
    }
  }
}

async function retryDelay(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 100));
}

/**
 * Remove an extracted DLSS5 tree without asking Electron's ASAR-aware `rm`
 * implementation to inspect files such as `resources/app.asar`.
 */
export async function removeDirectoryTreeWithoutAsar(
  root: string,
  attempts = 5
): Promise<void> {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  });
  for (const entry of entries) {
    const filename = path.join(root, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      await removeDirectoryTreeWithoutAsar(filename, attempts);
      continue;
    }
    let removed = false;
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts && !removed; attempt += 1) {
      try {
        await fs.unlink(filename);
        removed = true;
      } catch (error) {
        lastError = error;
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          removed = true;
          break;
        }
        if (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES") throw error;
        if (attempt + 1 < attempts) await retryDelay();
      }
    }
    if (!removed && lastError) throw lastError;
  }
  let removedRoot = false;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts && !removedRoot; attempt += 1) {
    try {
      await fs.rmdir(root);
      removedRoot = true;
    } catch (error) {
      lastError = error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        removedRoot = true;
        break;
      }
      if (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES" && code !== "ENOTEMPTY") {
        throw error;
      }
      if (attempt + 1 < attempts) await retryDelay();
    }
  }
  if (!removedRoot && lastError) throw lastError;
}

async function removeStaleDlss5RuntimeStaging(
  nodeDirectory: string,
  currentStagingRoot: string,
  report: (message: string) => void
): Promise<void> {
  const entries = await fs.readdir(nodeDirectory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (
      !entry.isDirectory() ||
      entry.isSymbolicLink() ||
      !entry.name.startsWith(DLSS5_RUNTIME_STAGING_PREFIX)
    ) continue;
    const stagingRoot = path.join(nodeDirectory, entry.name);
    if (path.resolve(stagingRoot) === path.resolve(currentStagingRoot)) continue;
    try {
      await removeDirectoryTreeWithoutAsar(stagingRoot);
      report(`已清理上一次失败的 DLSS5 runtime 暂存目录：${entry.name}`);
    } catch (error) {
      report(`上一次 DLSS5 runtime 暂存目录暂时无法清理，将继续使用新的暂存目录：${entry.name}（${error instanceof Error ? error.message : String(error)}）`);
    }
  }
}

async function fileExists(filename: string): Promise<boolean> {
  return Boolean(await fs.stat(filename).catch(() => null));
}

async function listFiles(root: string): Promise<string[]> {
  if (!root || !(await fileExists(root))) return [];
  const result: string[] = [];
  const pending = [root];
  while (pending.length > 0 && result.length < 100_000) {
    const current = pending.pop()!;
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const filename = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(filename);
      } else if (entry.isFile()) {
        const relative = safeRelativePath(path.relative(root, filename));
        if (relative) result.push(relative);
      }
    }
  }
  return result.sort((left, right) => left.localeCompare(right));
}

async function findFileByBasename(
  root: string,
  basename: string
): Promise<{ absolute: string; relative: string } | null> {
  const files = await listFiles(root);
  const match = files.find((filename) =>
    path.basename(filename).toLowerCase() === basename.toLowerCase()
  );
  return match ? { absolute: path.join(root, match), relative: match } : null;
}

async function sha256File(filename: string): Promise<string> {
  const digest = crypto.createHash("sha256");
  for await (const chunk of createReadStream(filename)) digest.update(chunk);
  return digest.digest("hex");
}

async function readJson<T>(filename: string): Promise<T | null> {
  const source = await fs.readFile(filename, "utf8").catch(() => "");
  if (!source) return null;
  try {
    return JSON.parse(source) as T;
  } catch {
    return null;
  }
}

function validManifest(value: unknown): value is Dlss5RuntimeInstallManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const manifest = value as Partial<Dlss5RuntimeInstallManifest>;
  if (
    manifest.schemaVersion !== 1 ||
    manifest.bundleId !== DLSS5_RUNTIME_BUNDLE_ID ||
    manifest.nodeRevision !== DLSS5_NODE_REVISION ||
    !Array.isArray(manifest.artifacts) ||
    !Array.isArray(manifest.ownedFiles)
  ) return false;
  if (!manifest.ownedFiles.every((filename) => Boolean(safeRelativePath(filename)))) return false;
  if (!manifest.artifacts.length) return false;
  return manifest.artifacts.every((artifact) => {
    if (!artifact || typeof artifact !== "object") return false;
    const item = artifact as Partial<Dlss5RuntimeInstallManifest["artifacts"][number]>;
    return typeof item.id === "string" &&
      typeof item.repository === "string" &&
      typeof item.releaseTag === "string" &&
      typeof item.assetName === "string" &&
      typeof item.url === "string" &&
      typeof item.sha256 === "string" &&
      /^[a-f0-9]{64}$/iu.test(item.sha256) &&
      (item.archive === "7z" || item.archive === "zip" || item.archive === "file");
  });
}

function blankDlss5RuntimeStatus(
  runtimeDirectory: string,
  state: Dlss5RuntimeStatus["state"] = "unknown",
  error = ""
): Dlss5RuntimeStatus {
  return {
    state,
    bundleId: DLSS5_RUNTIME_BUNDLE_ID,
    nodeRevision: "",
    runtimeDirectory,
    configPath: path.join(runtimeDirectory, DLSS5_RUNTIME_CONFIG_FILENAME),
    manifestPath: path.join(runtimeDirectory, DLSS5_RUNTIME_MANIFEST_FILENAME),
    source: "",
    installed: false,
    configValid: false,
    srReady: false,
    nrReady: false,
    runtimeValidated: false,
    pythonPath: "",
    srPluginPath: "",
    srRuntimePath: "",
    missingFiles: [...REQUIRED_RUNTIME_FILES, DLSS5_RUNTIME_CONFIG_FILENAME],
    unexpectedFiles: [],
    error
  };
}

function stringConfigValue(config: Dlss5RuntimeConfig, key: keyof Dlss5RuntimeConfig): string {
  const value = config[key];
  return typeof value === "string" ? value.trim() : "";
}

function resolveOwnedConfigPath(
  runtimeDirectory: string,
  config: Dlss5RuntimeConfig,
  key: "python" | "sr_plugin" | "sr_runtime" | "temp_dir" | "nr_plugin" | "nr_runtime"
): { value: string; error: string } {
  const raw = stringConfigValue(config, key);
  if (!raw) return { value: "", error: `${key} 未配置` };
  const value = path.resolve(raw);
  if (!isPathInsideDirectory(runtimeDirectory, value)) {
    return { value: "", error: `${key} 路径超出 DLSS5 runtime 目录，已拒绝使用` };
  }
  return { value, error: "" };
}

export async function scanDlss5Runtime(
  comfyRoot: string,
  nodeDirectory = ""
): Promise<Dlss5RuntimeStatus> {
  const runtimeDirectory = dlss5RuntimeDirectory(comfyRoot, nodeDirectory);
  if (!comfyRoot) return blankDlss5RuntimeStatus(runtimeDirectory, "missing");
  const runtimeStat = await fs.stat(runtimeDirectory).catch(() => null);
  if (!runtimeStat?.isDirectory()) return blankDlss5RuntimeStatus(runtimeDirectory, "missing");

  const status = blankDlss5RuntimeStatus(runtimeDirectory, "invalid");
  status.installed = true;
  const files = await listFiles(runtimeDirectory);
  const manifestValue = await readJson<unknown>(status.manifestPath);
  const manifest = validManifest(manifestValue) ? manifestValue : null;
  status.source = manifest ? "app-managed" : "manual";
  status.nodeRevision = manifest?.nodeRevision ?? "";
  if (manifestValue && !manifest) {
    status.error = "install-manifest.json 无效或与当前 catalog runtime 不匹配";
  }
  const ownedFiles = manifest?.ownedFiles ?? [];
  status.unexpectedFiles = manifest
    ? files.filter((filename) => !ownedFiles.includes(filename))
    : [];

  const config = await readJson<Dlss5RuntimeConfig>(status.configPath);
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    status.error = status.error || "runtime/config.json 缺失或不是有效 JSON";
    status.missingFiles = [...REQUIRED_RUNTIME_FILES, DLSS5_RUNTIME_CONFIG_FILENAME];
    return status;
  }

  const resolved = Object.fromEntries(
    SHARED_CONFIG_KEYS.map((key) => [key, resolveOwnedConfigPath(runtimeDirectory, config, key)])
  ) as Record<typeof SHARED_CONFIG_KEYS[number], { value: string; error: string }>;
  const configErrors = SHARED_CONFIG_KEYS
    .map((key) => resolved[key].error)
    .filter(Boolean);
  const optionalSrPlugin = stringConfigValue(config, "sr_plugin");
  const optionalSrRuntime = stringConfigValue(config, "sr_runtime");
  const srPlugin = optionalSrPlugin
    ? resolveOwnedConfigPath(runtimeDirectory, config, "sr_plugin")
    : { value: "", error: "" };
  const srRuntime = optionalSrRuntime
    ? resolveOwnedConfigPath(runtimeDirectory, config, "sr_runtime")
    : { value: "", error: "" };
  const srConfigErrors = srPlugin.error || srRuntime.error ||
    Boolean(optionalSrPlugin) !== Boolean(optionalSrRuntime)
    ? ["SR runtime 配置必须同时提供且路径必须位于 managed runtime 内"]
    : [];
  const optionalNrPlugin = stringConfigValue(config, "nr_plugin");
  const optionalNrRuntime = stringConfigValue(config, "nr_runtime");
  const nrPlugin = optionalNrPlugin
    ? resolveOwnedConfigPath(runtimeDirectory, config, "nr_plugin")
    : { value: "", error: "" };
  const nrRuntime = optionalNrRuntime
    ? resolveOwnedConfigPath(runtimeDirectory, config, "nr_runtime")
    : { value: "", error: "" };
  const nrConfigErrors = nrPlugin.error || nrRuntime.error ||
    Boolean(optionalNrPlugin) !== Boolean(optionalNrRuntime)
    ? ["NR runtime 配置必须同时提供且路径必须位于 managed runtime 内"]
    : [];

  status.configValid = configErrors.length === 0;
  status.pythonPath = resolved.python.value;
  status.srPluginPath = srPlugin.value;
  status.srRuntimePath = srRuntime.value;
  if (nrPlugin.value) status.nrPluginPath = nrPlugin.value;
  if (nrRuntime.value) status.nrRuntimePath = nrRuntime.value;
  if (configErrors.length || srConfigErrors.length || nrConfigErrors.length) {
    status.error = [status.error, ...configErrors, ...srConfigErrors, ...nrConfigErrors]
      .filter(Boolean)
      .join("；");
  }

  const missing: string[] = [];
  for (const [label, filename] of [
    ["python.exe", resolved.python.value],
    ["vsdlsssr.dll", srPlugin.value],
    ["nvngx_dlss.dll", srRuntime.value]
  ] as const) {
    if (!filename || !(await fileExists(filename))) missing.push(label);
  }
  if (!status.configValid) missing.push(DLSS5_RUNTIME_CONFIG_FILENAME);
  status.missingFiles = [...new Set(missing)];
  status.nrReady = status.configValid && Boolean(nrPlugin.value && nrRuntime.value) &&
    await fileExists(nrPlugin.value) && await fileExists(nrRuntime.value);
  status.srReady = status.configValid && srConfigErrors.length === 0 &&
    Boolean(srPlugin.value && srRuntime.value) &&
    await fileExists(srPlugin.value) && await fileExists(srRuntime.value);
  status.state = status.srReady || status.nrReady
    ? "ready"
    : status.error
      ? "invalid"
      : "missing";
  return status;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw new Error("DLSS5 安装已取消。");
}

function parseJsonLine<T>(output: string): T {
  for (const line of output.split(/\r?\n/u).reverse()) {
    const candidate = line.trim();
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Continue until the command's final JSON line is found.
    }
  }
  throw new Error("DLSS5 runtime 归档清单不是有效 JSON。");
}

const DLSS5_SEVEN_ZIP_COMMANDS = ["7z.exe", "7zz.exe"] as const;

/** Parse the stable technical-listing fields emitted by 7-Zip's `-slt` mode. */
export function parseSevenZipArchiveEntries(output: string): string[] {
  const lines = output.split(/\r?\n/u);
  const headerSeparator = lines.findIndex((line) => /^-{3,}$/u.test(line.trim()));
  const entryLines = headerSeparator >= 0 ? lines.slice(headerSeparator + 1) : lines;
  return entryLines.flatMap((line) => {
    const match = line.match(/^\s*Path = (.*)$/u);
    const entry = match?.[1]?.trim();
    return entry ? [entry] : [];
  });
}

function standardSevenZipPaths(): string[] {
  const roots = [
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    process.env.LOCALAPPDATA
  ].filter((value): value is string => Boolean(value?.trim()));
  return [...new Set(roots.flatMap((root) => [
    path.join(root, "7-Zip", "7z.exe"),
    path.join(root, "7-Zip", "7zz.exe"),
    path.join(root, "Programs", "7-Zip", "7z.exe"),
    path.join(root, "Programs", "7-Zip", "7zz.exe")
  ]))];
}

async function findDlss5SevenZip(
  deps: Dlss5RuntimeInstallerDependencies
): Promise<string> {
  const checked = new Set<string>();
  const candidates: string[] = [];
  for (const command of DLSS5_SEVEN_ZIP_COMMANDS) {
    const executable = await deps.findExecutable(command).catch(() => "");
    if (executable) candidates.push(executable);
  }
  candidates.push(...standardSevenZipPaths());
  for (const candidate of candidates) {
    const key = path.resolve(candidate).toLowerCase();
    if (checked.has(key)) continue;
    checked.add(key);
    if (await fileExists(candidate)) return candidate;
  }
  return "";
}

const PY7ZR_SCRIPT = [
  "import json,pathlib,sys,py7zr",
  "mode=sys.argv[1]",
  "archive=pathlib.Path(sys.argv[2])",
  "with py7zr.SevenZipFile(archive, mode='r') as bundle:",
  "    names=bundle.getnames()",
  "    if mode == 'check':",
  "        expected={value.lower() for value in sys.argv[3:]}",
  "        unsafe=[name for name in names if '\\x00' in name or pathlib.PurePosixPath(name.replace('\\\\','/')).is_absolute() or pathlib.PureWindowsPath(name).is_absolute() or '..' in pathlib.PurePosixPath(name.replace('\\\\','/')).parts]",
  "        if unsafe: raise RuntimeError('archive contains unsafe paths')",
  "        found=sorted({pathlib.PurePosixPath(name.replace('\\\\','/')).name.lower() for name in names} & expected)",
  "        print(json.dumps(found))",
  "    else:",
  "        bundle.extractall(path=pathlib.Path(sys.argv[3]))"
].join("\n");

async function extractDlss5ArchiveWithPython(
  archive: string,
  destination: string,
  python: string,
  environment: NodeJS.ProcessEnv,
  deps: Dlss5RuntimeInstallerDependencies,
  expectedFiles: readonly string[],
  options: { signal?: AbortSignal; onLog?: (message: string) => void }
): Promise<readonly string[]> {
  throwIfAborted(options.signal);
  const listed = await deps.runLoggedProcess(
    python,
    ["-c", PY7ZR_SCRIPT, "check", archive, ...expectedFiles],
    { env: environment, timeoutMs: 300_000, onLog: options.onLog }
  );
  const parsedEntries = parseJsonLine<unknown>(listed);
  if (!Array.isArray(parsedEntries) || parsedEntries.some((entry) => typeof entry !== "string")) {
    throw new Error("DLSS5 runtime 归档清单不是字符串数组，已拒绝解压。");
  }
  const entries = validateDlss5ArtifactContents(parsedEntries, expectedFiles);
  throwIfAborted(options.signal);
  await deps.runLoggedProcess(
    python,
    ["-c", PY7ZR_SCRIPT, "extract", archive, destination],
    { env: environment, timeoutMs: 600_000, onLog: options.onLog }
  );
  return entries;
}

async function extractDlss5ArchiveWithSevenZip(
  archive: string,
  destination: string,
  sevenZip: string,
  environment: NodeJS.ProcessEnv,
  deps: Dlss5RuntimeInstallerDependencies,
  expectedFiles: readonly string[],
  options: { signal?: AbortSignal; onLog?: (message: string) => void }
): Promise<readonly string[]> {
  throwIfAborted(options.signal);
  const listed = await deps.runLoggedProcess(
    sevenZip,
    ["l", "-slt", "-ba", "-sccUTF-8", archive],
    { env: environment, timeoutMs: 300_000, onLog: options.onLog }
  );
  const entries = validateDlss5ArtifactContents(
    parseSevenZipArchiveEntries(listed),
    expectedFiles
  );
  throwIfAborted(options.signal);
  await deps.runLoggedProcess(
    sevenZip,
    ["x", "-y", "-aoa", "-sccUTF-8", `-o${destination}`, archive],
    { env: environment, timeoutMs: 600_000, onLog: options.onLog }
  );
  return entries;
}

async function extractDlss5Archive(
  archive: string,
  destination: string,
  python: string,
  environment: NodeJS.ProcessEnv,
  deps: Dlss5RuntimeInstallerDependencies,
  expectedFiles: readonly string[],
  options: { signal?: AbortSignal; onLog?: (message: string) => void }
): Promise<readonly string[]> {
  options.onLog?.("使用当前 ComfyUI Python 的 py7zr 检查并解压 runtime……");
  try {
    return await extractDlss5ArchiveWithPython(
      archive,
      destination,
      python,
      environment,
      deps,
      expectedFiles,
      options
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const sevenZip = await findDlss5SevenZip(deps);
    if (!sevenZip) throw new Error(`py7zr 解压 DLSS5 runtime 失败：${detail}`);
    options.onLog?.(`py7zr 不可用，回退到原生 7-Zip：${sevenZip}`);
    return extractDlss5ArchiveWithSevenZip(
      archive,
      destination,
      sevenZip,
      environment,
      deps,
      expectedFiles,
      options
    );
  }
}

async function downloadDlss5Archive(
  artifact: Dlss5RuntimeArtifact,
  partialDestination: string,
  settings: Settings,
  comfyRoot: string,
  environment: NodeJS.ProcessEnv,
  deps: Dlss5RuntimeInstallerDependencies,
  options: { signal?: AbortSignal; onLog?: (message: string) => void }
): Promise<void> {
  throwIfAborted(options.signal);
  if (deps.downloadFile) {
    await deps.downloadFile(artifact.url, partialDestination, settings, {
      comfyRoot,
      signal: options.signal,
      onLog: options.onLog
    });
    return;
  }
  const curl = await deps.findExecutable("curl.exe");
  if (!curl) throw new Error("没有找到 curl，无法下载 DLSS5 runtime。");
  const args = [
    "-fL",
    "--retry", "2",
    "--connect-timeout", "20",
    "--progress-bar",
    "--output", partialDestination,
    artifact.url
  ];
  if (settings.proxyEnabled) {
    args.splice(1, 0, "--proxy", settings.proxyUrl.trim());
  }
  await deps.runLoggedProcess(
    curl,
    args,
    { env: environment, timeoutMs: 1_800_000, onLog: options.onLog }
  );
  throwIfAborted(options.signal);
}

async function copyUnownedFiles(
  existingRuntime: string,
  stagedRuntime: string,
  ownedFiles: readonly string[],
  report: (message: string) => void
): Promise<void> {
  const owned = new Set(ownedFiles);
  const existingFiles = await listFiles(existingRuntime);
  const stagedFiles = new Set(await listFiles(stagedRuntime));
  for (const relative of existingFiles) {
    if (owned.has(relative)) continue;
    const source = path.join(existingRuntime, relative);
    const destination = path.join(stagedRuntime, relative);
    if (stagedFiles.has(relative)) continue;
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
    stagedFiles.add(relative);
    report(`保留 runtime 未知文件：${relative}`);
  }
}

function runtimeArtifactManifest(artifact: Dlss5RuntimeArtifact) {
  return {
    id: artifact.id,
    repository: artifact.repository,
    releaseTag: artifact.releaseTag,
    assetName: artifact.assetName,
    url: artifact.url,
    sha256: artifact.sha256,
    archive: artifact.archive
  };
}

async function copyDirectoryFiles(sourceRoot: string, destinationRoot: string): Promise<void> {
  for (const relative of await listFiles(sourceRoot)) {
    const destination = path.join(destinationRoot, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(path.join(sourceRoot, relative), destination);
  }
}

function pinnedNrArtifacts(
  artifacts: readonly Dlss5RuntimeArtifact[]
): Record<"python" | "vapoursynth" | "numpy" | "vapourkit" | "dlss-nr", Dlss5RuntimeArtifact> | null {
  const result = Object.fromEntries(artifacts.map((artifact) => [artifact.id, artifact])) as
    Partial<Record<"python" | "vapoursynth" | "numpy" | "vapourkit" | "dlss-nr", Dlss5RuntimeArtifact>>;
  return result.python && result.vapoursynth && result.numpy && result.vapourkit && result["dlss-nr"]
    ? result as Record<"python" | "vapoursynth" | "numpy" | "vapourkit" | "dlss-nr", Dlss5RuntimeArtifact>
    : null;
}

async function installPinnedDlss5NrRuntime(
  settings: Settings,
  comfyRoot: string,
  nodeDirectory: string,
  deps: Dlss5RuntimeInstallerDependencies,
  artifacts: readonly Dlss5RuntimeArtifact[],
  onLog?: (message: string) => void,
  signal?: AbortSignal
): Promise<Dlss5RuntimeOperationResult> {
  const log: string[] = [];
  const report = (message: string) => {
    const normalized = message.trim();
    if (!normalized) return;
    log.push(normalized);
    onLog?.(normalized);
  };
  const artifactMap = pinnedNrArtifacts(artifacts);
  if (!artifactMap) return { ok: false, message: "DLSS5 catalog 的 NR runtime manifest 不完整。" };
  const unavailable = artifacts.find((artifact) => artifact.unavailableReason);
  if (unavailable) {
    return { ok: false, message: `DLSS5 runtime 当前无法自动安装：${unavailable.unavailableReason}` };
  }

  const runtimeDirectory = dlss5RuntimeDirectory(comfyRoot, nodeDirectory);
  const id = deps.randomId?.() ?? crypto.randomUUID();
  const stagingRoot = path.join(nodeDirectory, `${DLSS5_RUNTIME_STAGING_PREFIX}${id}`);
  const stagedRuntime = path.join(stagingRoot, "runtime");
  const archiveDirectory = path.join(stagingRoot, DLSS5_RUNTIME_DOWNLOAD_DIRECTORY);
  const extractedDirectory = path.join(stagingRoot, "extracted");
  const environment = deps.downloadEnvironment(settings, comfyRoot);
  const extractedRoots = new Map<string, string>();
  let promoted = false;
  let previousMovedToBackup = false;
  let backupDirectory = "";

  try {
    throwIfAborted(signal);
    await removeStaleDlss5RuntimeStaging(nodeDirectory, stagingRoot, report);
    const comfyPython = await deps.findComfyPython(settings, comfyRoot);
    if (!comfyPython) throw new Error("没有找到当前选中 ComfyUI 的 Python，无法安装 DLSS5 runtime。");
    report(`使用当前选中的 ComfyUI Python执行安全解压：${comfyPython}`);
    await fs.mkdir(archiveDirectory, { recursive: true });
    await fs.mkdir(extractedDirectory, { recursive: true });
    await fs.mkdir(path.join(stagedRuntime, DLSS5_RUNTIME_DOWNLOAD_DIRECTORY), { recursive: true });

    for (const artifact of artifacts) {
      throwIfAborted(signal);
      const safeAssetName = safeRelativePath(artifact.assetName);
      if (!safeAssetName || safeAssetName.includes("/")) {
        throw new Error(`DLSS5 runtime artifact 文件名不安全：${artifact.assetName}`);
      }
      const partialArchive = path.join(archiveDirectory, `${artifact.id}-${safeAssetName}.partial`);
      const archive = path.join(archiveDirectory, `${artifact.id}-${safeAssetName}`);
      report(`下载固定 runtime 组件：${artifact.releaseTag} · ${artifact.assetName}`);
      await downloadDlss5Archive(
        artifact,
        partialArchive,
        settings,
        comfyRoot,
        environment,
        deps,
        { signal, onLog: report }
      );
      const archiveStat = await fs.stat(partialArchive).catch(() => null);
      if (!archiveStat?.isFile() || archiveStat.size <= 0) {
        throw new Error(`${artifact.assetName} 下载未生成完整文件。`);
      }
      if (artifact.bytes !== undefined && archiveStat.size !== artifact.bytes) {
        throw new Error(
          `${artifact.assetName} 下载疑似截断：收到 ${archiveStat.size} bytes，要求 ${artifact.bytes} bytes。`
        );
      }
      const actualSha256 = await sha256File(partialArchive);
      if (actualSha256.toLowerCase() !== artifact.sha256.toLowerCase()) {
        throw new Error(
          `${artifact.assetName} SHA-256 校验失败：要求 ${artifact.sha256}，实际 ${actualSha256}。`
        );
      }
      await deps.renameWithRetry(partialArchive, archive);
      report(`${artifact.assetName} SHA-256 已校验：${actualSha256}`);

      const destination = path.join(extractedDirectory, artifact.id);
      await fs.mkdir(destination, { recursive: true });
      const entries = await (deps.extractArchive
        ? deps.extractArchive(archive, destination, comfyPython, environment, { signal, onLog: report })
        : extractDlss5Archive(
            archive,
            destination,
            comfyPython,
            environment,
            deps,
            artifact.expectedFiles,
            { signal, onLog: report }
          ));
      validateDlss5ArtifactContents(entries, artifact.expectedFiles);
      await assertNoLinks(destination);
      extractedRoots.set(artifact.id, destination);
      await fs.copyFile(
        archive,
        path.join(stagedRuntime, DLSS5_RUNTIME_DOWNLOAD_DIRECTORY, artifact.assetName)
      );
    }

    const pythonRoot = extractedRoots.get("python")!;
    const isolatedPythonRoot = path.join(stagedRuntime, "python");
    await copyDirectoryFiles(pythonRoot, isolatedPythonRoot);
    const isolatedPython = await findFileByBasename(isolatedPythonRoot, "python.exe");
    const pythonPathFile = await findFileByBasename(isolatedPythonRoot, "python313._pth");
    if (!isolatedPython || !pythonPathFile) {
      throw new Error("Python 3.13 embeddable 组件缺少 python.exe 或 python313._pth。");
    }
    const sitePackages = path.join(isolatedPythonRoot, "Lib", "site-packages");
    await fs.mkdir(sitePackages, { recursive: true });

    const vapourSynthRoot = extractedRoots.get("vapoursynth")!;
    const vapourSynthWheel = await findFileByBasename(
      vapourSynthRoot,
      "vapoursynth-79-cp312-abi3-win_amd64.whl"
    );
    if (!vapourSynthWheel) throw new Error("VapourSynth R79 归档缺少 ABI3 wheel。");
    const vapourSynthEntries = await (deps.extractArchive
      ? deps.extractArchive(
          vapourSynthWheel.absolute,
          sitePackages,
          comfyPython,
          environment,
          { signal, onLog: report }
        )
      : extractDlss5Archive(
          vapourSynthWheel.absolute,
          sitePackages,
          comfyPython,
          environment,
          deps,
          ["vapoursynth.pyd"],
          { signal, onLog: report }
        ));
    validateDlss5ArtifactContents(vapourSynthEntries, ["vapoursynth.pyd"]);
    await copyDirectoryFiles(extractedRoots.get("numpy")!, sitePackages);

    const pluginDirectory = path.join(stagedRuntime, "plugins");
    await fs.mkdir(pluginDirectory, { recursive: true });
    const nrPlugin = await findFileByBasename(extractedRoots.get("vapourkit")!, "vsdlssnr.dll");
    const nrRuntime = await findFileByBasename(extractedRoots.get("dlss-nr")!, "nvngx_dlssnr.dll");
    if (!nrPlugin || !nrRuntime) throw new Error("NR wrapper 或 NVIDIA runtime 未通过组装检查。");
    const stagedNrPlugin = path.join(pluginDirectory, "vsdlssnr.dll");
    const stagedNrRuntime = path.join(pluginDirectory, "nvngx_dlssnr.dll");
    await fs.copyFile(nrPlugin.absolute, stagedNrPlugin);
    await fs.copyFile(nrRuntime.absolute, stagedNrRuntime);

    const pathLines = (await fs.readFile(pythonPathFile.absolute, "utf8"))
      .split(/\r?\n/u)
      .filter((line) => line.trim() && line.trim() !== "#import site" && line.trim() !== "import site");
    if (!pathLines.some((line) => line.trim().toLowerCase() === "lib\\site-packages")) {
      pathLines.push("Lib\\site-packages");
    }
    pathLines.push("import site");
    await fs.writeFile(pythonPathFile.absolute, `${pathLines.join("\r\n")}\r\n`, "utf8");

    const targetPython = path.join(
      runtimeDirectory,
      path.relative(stagedRuntime, isolatedPython.absolute)
    );
    const targetNrPlugin = path.join(runtimeDirectory, "plugins", "vsdlssnr.dll");
    const targetNrRuntime = path.join(runtimeDirectory, "plugins", "nvngx_dlssnr.dll");
    const targetTemp = path.join(runtimeDirectory, "temp");
    await fs.mkdir(path.join(stagedRuntime, "temp"), { recursive: true });
    const config: Dlss5RuntimeConfig = {
      python: targetPython,
      nr_plugin: targetNrPlugin,
      nr_runtime: targetNrRuntime,
      temp_dir: targetTemp,
      timeout_seconds: 0,
      vapourkit_release: artifactMap.vapourkit.releaseTag,
      vapourkit_archive_sha256: artifactMap.vapourkit.sha256
    };
    await fs.writeFile(
      path.join(stagedRuntime, DLSS5_RUNTIME_CONFIG_FILENAME),
      `${JSON.stringify(config, null, 2)}\n`,
      "utf8"
    );

    const pluginSelfCheck = [
      "import sys,numpy,vapoursynth as vs",
      "vs.core.std.LoadPlugin(path=sys.argv[1])",
      "assert hasattr(vs.core, 'dlssnr')",
      "assert hasattr(vs.core.dlssnr, 'Enhance')",
      "print('DLSS5_NR_SELF_CHECK_OK')"
    ].join(";");
    await deps.runLoggedProcess(
      isolatedPython.absolute,
      ["-c", pluginSelfCheck, stagedNrPlugin],
      { cwd: isolatedPythonRoot, env: environment, timeoutMs: 120_000, onLog: report }
    );
    report("隔离 Python、NumPy、VapourSynth 与 vsdlssnr plugin 注册自检通过。");

    throwIfAborted(signal);
    const previousManifest = await readJson<unknown>(
      path.join(runtimeDirectory, DLSS5_RUNTIME_MANIFEST_FILENAME)
    );
    const previousOwnedFiles = validManifest(previousManifest) ? previousManifest.ownedFiles : [];
    const newOwnedFiles = await listFiles(stagedRuntime);
    await copyUnownedFiles(runtimeDirectory, stagedRuntime, previousOwnedFiles, report);
    const ownedFiles = [...new Set([
      ...newOwnedFiles,
      DLSS5_RUNTIME_MANIFEST_FILENAME
    ])].sort((left, right) => left.localeCompare(right));
    const manifest: Dlss5RuntimeInstallManifest = {
      schemaVersion: 1,
      bundleId: DLSS5_RUNTIME_BUNDLE_ID,
      nodeRevision: DLSS5_NODE_REVISION,
      installedAt: (deps.now?.() ?? new Date()).toISOString(),
      artifacts: artifacts.map(runtimeArtifactManifest),
      ownedFiles
    };
    await fs.writeFile(
      path.join(stagedRuntime, DLSS5_RUNTIME_MANIFEST_FILENAME),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    );

    if (await fs.stat(runtimeDirectory).catch(() => null)) {
      const backupRoot = path.join(comfyRoot, DLSS5_RUNTIME_BACKUP_DIRECTORY);
      backupDirectory = path.join(backupRoot, `${Date.now()}-${id}`);
      await fs.mkdir(backupRoot, { recursive: true });
      report("正在备份现有 DLSS5 runtime，以便失败时恢复……");
      await deps.renameWithRetry(runtimeDirectory, backupDirectory);
      previousMovedToBackup = true;
    }
    throwIfAborted(signal);
    try {
      await deps.renameWithRetry(stagedRuntime, runtimeDirectory);
      promoted = true;
    } catch (error) {
      if (backupDirectory) {
        await fs.rm(runtimeDirectory, { recursive: true, force: true }).catch(() => undefined);
        await deps.renameWithRetry(backupDirectory, runtimeDirectory).catch(() => undefined);
        backupDirectory = "";
        throw new Error(
          `DLSS5 runtime 原子替换失败，已尝试回滚：${error instanceof Error ? error.message : String(error)}`
        );
      }
      throw error;
    }
    const status = await scanDlss5Runtime(comfyRoot, nodeDirectory);
    if (!status.nrReady) {
      throw new Error(`DLSS5 NR runtime 安装后复扫未通过：${status.error || status.missingFiles.join("、")}`);
    }
    report("DLSS5 基础 NR runtime 已原子安装；SR 与 guided NR 继续按独立能力检查。");
    return {
      ok: true,
      message: "DLSS5 基础 NR runtime 已安装并通过隔离 Python/plugin 自检；请重启 ComfyUI 后复检节点。",
      log: log.join("\n\n"),
      status
    };
  } catch (error) {
    if (backupDirectory && previousMovedToBackup) {
      if (promoted) {
        await fs.rm(runtimeDirectory, { recursive: true, force: true }).catch(() => undefined);
      }
      await deps.renameWithRetry(backupDirectory, runtimeDirectory).catch(() => undefined);
    }
    const message = error instanceof Error ? error.message : String(error);
    report(message);
    return { ok: false, message, log: log.join("\n\n") };
  } finally {
    await removeDirectoryTreeWithoutAsar(stagingRoot).catch(() => undefined);
  }
}

export async function installDlss5Runtime(
  settings: Settings,
  comfyRoot: string,
  nodeDirectory: string,
  deps: Dlss5RuntimeInstallerDependencies,
  onLog?: (message: string) => void,
  signal?: AbortSignal
): Promise<Dlss5RuntimeOperationResult> {
  const log: string[] = [];
  const report = (message: string) => {
    const normalized = message.trim();
    if (!normalized) return;
    log.push(normalized);
    onLog?.(normalized);
  };
  if (!isLocalComfyUrl(settings.comfyUrl)) {
    return { ok: false, message: "远程 ComfyUI 仅支持连接，应用不会安装本地 DLSS5 runtime。" };
  }
  if (platformFor(deps) !== "win32") {
    return { ok: false, message: "DLSS5 runtime 当前仅支持 Windows。" };
  }
  if (!comfyRoot || !nodeDirectory || !isPathInsideDirectory(comfyRoot, nodeDirectory)) {
    return { ok: false, message: "DLSS5 runtime 安装目标不是当前 ComfyUI 数据目录，已拒绝操作。" };
  }
  const artifacts = deps.artifacts ?? DLSS5_RUNTIME_ARTIFACTS;
  if (pinnedNrArtifacts(artifacts)) {
    return installPinnedDlss5NrRuntime(
      settings,
      comfyRoot,
      nodeDirectory,
      deps,
      artifacts,
      onLog,
      signal
    );
  }
  const artifact = artifacts.find((item) => item.id === "vapourkit");
  if (!artifact) return { ok: false, message: "DLSS5 catalog 缺少 VapourKit runtime manifest。" };
  if (artifact.unavailableReason) {
    return {
      ok: false,
      message: `DLSS5 runtime 当前无法自动安装：${artifact.unavailableReason}`
    };
  }
  const safeAssetName = safeRelativePath(artifact.assetName);
  if (!safeAssetName || safeAssetName.includes("/")) {
    return { ok: false, message: "DLSS5 runtime artifact 文件名不安全，已拒绝安装。" };
  }

  const runtimeDirectory = dlss5RuntimeDirectory(comfyRoot, nodeDirectory);
  const id = deps.randomId?.() ?? crypto.randomUUID();
  const stagingRoot = path.join(nodeDirectory, `.dlss5-runtime-staging-${id}`);
  const stagedRuntime = path.join(stagingRoot, "runtime");
  const archiveDirectory = path.join(stagingRoot, DLSS5_RUNTIME_DOWNLOAD_DIRECTORY);
  const partialArchive = path.join(archiveDirectory, `${safeAssetName}.partial`);
  const archive = path.join(archiveDirectory, safeAssetName);
  const environment = deps.downloadEnvironment(settings, comfyRoot);
  let promoted = false;
  let previousMovedToBackup = false;
  let backupDirectory = "";
  try {
    throwIfAborted(signal);
    await removeStaleDlss5RuntimeStaging(nodeDirectory, stagingRoot, report);
    const python = await deps.findComfyPython(settings, comfyRoot);
    if (!python) throw new Error("没有找到当前选中 ComfyUI 的 Python，无法安装 DLSS5 runtime。");
    report(`使用当前选中的 ComfyUI Python：${python}`);
    await fs.mkdir(archiveDirectory, { recursive: true });
    report(`下载固定 VapourKit runtime：${artifact.releaseTag} · ${artifact.assetName}`);
    await downloadDlss5Archive(
      artifact,
      partialArchive,
      settings,
      comfyRoot,
      environment,
      deps,
      { signal, onLog: report }
    );
    const archiveStat = await fs.stat(partialArchive).catch(() => null);
    if (!archiveStat?.isFile() || archiveStat.size <= 0) {
      throw new Error("DLSS5 runtime 下载未生成完整归档文件。");
    }
    if (artifact.bytes !== undefined && archiveStat.size !== artifact.bytes) {
      throw new Error(
        `DLSS5 runtime 下载疑似截断：收到 ${archiveStat.size} bytes，要求 ${artifact.bytes} bytes。`
      );
    }
    const actualSha256 = await sha256File(partialArchive);
    if (actualSha256.toLowerCase() !== artifact.sha256.toLowerCase()) {
      throw new Error(
        `DLSS5 runtime SHA-256 校验失败：要求 ${artifact.sha256}，实际 ${actualSha256}。`
      );
    }
    await deps.renameWithRetry(partialArchive, archive);
    report(`VapourKit SHA-256 已校验：${actualSha256}`);

    // Extract directly into the staged runtime. Electron's patched fs.cp walks
    // any file named `app.asar` as an ASAR package and rejects the valid
    // VapourKit payload before it can be promoted.
    await fs.mkdir(stagedRuntime, { recursive: true });
    report("使用当前 ComfyUI Python 解压并检查 runtime 归档……");
    const archiveEntries = await (deps.extractArchive
      ? deps.extractArchive(archive, stagedRuntime, python, environment, { signal, onLog: report })
      : extractDlss5Archive(
          archive,
          stagedRuntime,
          python,
          environment,
          deps,
              artifact.expectedFiles,
          { signal, onLog: report }
        ));
            validateDlss5ArtifactContents(archiveEntries, artifact.expectedFiles);
    await assertNoLinks(stagedRuntime);
    await fs.mkdir(path.join(stagedRuntime, DLSS5_RUNTIME_DOWNLOAD_DIRECTORY), { recursive: true });
    await fs.copyFile(archive, path.join(stagedRuntime, DLSS5_RUNTIME_DOWNLOAD_DIRECTORY, artifact.assetName));

    const foundRequired = await Promise.all(
      artifact.expectedFiles.map((filename) => findFileByBasename(stagedRuntime, filename))
    );
    if (foundRequired.some((match) => !match)) {
      const missing = artifact.expectedFiles.filter((_filename, index) => !foundRequired[index]);
      throw new Error(`DLSS5 runtime 归档缺少预期文件：${missing.join("、")}`);
    }
    const pythonFile = foundRequired[0]!;
    const srPluginFile = foundRequired[1]!;
    const srRuntimeFile = foundRequired[2]!;
    const targetPython = path.resolve(runtimeDirectory, pythonFile.relative);
    const targetSrPlugin = path.resolve(runtimeDirectory, srPluginFile.relative);
    const targetSrRuntime = path.resolve(runtimeDirectory, srRuntimeFile.relative);
    const targetTemp = path.join(runtimeDirectory, "temp");
    await fs.mkdir(path.join(stagedRuntime, "temp"), { recursive: true });
    const config: Dlss5RuntimeConfig = {
      python: targetPython,
      sr_plugin: targetSrPlugin,
      sr_runtime: targetSrRuntime,
      temp_dir: targetTemp,
      timeout_seconds: 0,
      vapourkit_release: artifact.releaseTag,
      vapourkit_archive_sha256: artifact.sha256
    };
    await fs.writeFile(
      path.join(stagedRuntime, DLSS5_RUNTIME_CONFIG_FILENAME),
      `${JSON.stringify(config, null, 2)}\n`,
      "utf8"
    );

    throwIfAborted(signal);
    const previousManifest = await readJson<unknown>(path.join(runtimeDirectory, DLSS5_RUNTIME_MANIFEST_FILENAME));
    const previousOwnedFiles = validManifest(previousManifest) ? previousManifest.ownedFiles : [];
    const newOwnedFiles = await listFiles(stagedRuntime);
    await copyUnownedFiles(runtimeDirectory, stagedRuntime, previousOwnedFiles, report);
    const ownedFiles = [...new Set([
      ...newOwnedFiles,
      DLSS5_RUNTIME_MANIFEST_FILENAME
    ])].sort((left, right) => left.localeCompare(right));
    const manifest: Dlss5RuntimeInstallManifest = {
      schemaVersion: 1,
      bundleId: DLSS5_RUNTIME_BUNDLE_ID,
      nodeRevision: DLSS5_NODE_REVISION,
      installedAt: (deps.now?.() ?? new Date()).toISOString(),
      artifacts: [runtimeArtifactManifest(artifact)],
      ownedFiles
    };
    await fs.writeFile(
      path.join(stagedRuntime, DLSS5_RUNTIME_MANIFEST_FILENAME),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    );

    const targetStat = await fs.stat(runtimeDirectory).catch(() => null);
    if (targetStat) {
      const backupRoot = path.join(comfyRoot, DLSS5_RUNTIME_BACKUP_DIRECTORY);
      backupDirectory = path.join(backupRoot, `${Date.now()}-${id}`);
      await fs.mkdir(backupRoot, { recursive: true });
      report("正在备份现有 DLSS5 runtime，以便失败时恢复……");
      await deps.renameWithRetry(runtimeDirectory, backupDirectory);
      previousMovedToBackup = true;
    }
    throwIfAborted(signal);
    try {
      await deps.renameWithRetry(stagedRuntime, runtimeDirectory);
      promoted = true;
    } catch (error) {
      if (backupDirectory) {
        await fs.rm(runtimeDirectory, { recursive: true, force: true }).catch(() => undefined);
        await deps.renameWithRetry(backupDirectory, runtimeDirectory).catch(() => undefined);
        backupDirectory = "";
        throw new Error(
          `DLSS5 runtime 原子替换失败，已尝试回滚：${error instanceof Error ? error.message : String(error)}`
        );
      }
      throw error;
    }
    report("DLSS5 SR runtime 已原子安装；NR 未随本阶段下载或启用。");
    const status = await scanDlss5Runtime(comfyRoot, nodeDirectory);
    if (!status.srReady) throw new Error(`DLSS5 runtime 安装后复扫未通过：${status.error || status.missingFiles.join("、")}`);
    return {
      ok: true,
      message: "DLSS5 SR runtime 已安装并通过离线文件/config 检查；请重启 ComfyUI 后再做运行时复检。",
      log: log.join("\n\n"),
      status
    };
  } catch (error) {
    if (backupDirectory && previousMovedToBackup) {
      if (promoted) {
        await fs.rm(runtimeDirectory, { recursive: true, force: true }).catch(() => undefined);
      }
      await deps.renameWithRetry(backupDirectory, runtimeDirectory).catch(() => undefined);
    }
    const message = error instanceof Error ? error.message : String(error);
    report(message);
    return { ok: false, message, log: log.join("\n\n") };
  } finally {
    await removeDirectoryTreeWithoutAsar(stagingRoot).catch(() => undefined);
  }
}

function depthOf(relative: string): number {
  return relative.split(/[\\/]/u).length;
}

export async function uninstallDlss5Runtime(
  settings: Settings,
  comfyRoot: string,
  nodeDirectory = "",
  onLog?: (message: string) => void
): Promise<Dlss5RuntimeOperationResult> {
  if (!isLocalComfyUrl(settings.comfyUrl)) {
    return { ok: false, message: "远程 ComfyUI 仅支持连接，应用不会卸载本地 DLSS5 runtime。" };
  }
  if (!comfyRoot || (nodeDirectory && !isPathInsideDirectory(comfyRoot, nodeDirectory))) {
    return { ok: false, message: "DLSS5 runtime 卸载目标不是当前 ComfyUI 数据目录，已拒绝操作。" };
  }
  const runtimeDirectory = dlss5RuntimeDirectory(comfyRoot, nodeDirectory);
  const manifestPath = path.join(runtimeDirectory, DLSS5_RUNTIME_MANIFEST_FILENAME);
  const manifestValue = await readJson<unknown>(manifestPath);
  if (!validManifest(manifestValue)) {
    return {
      ok: false,
      message: "未找到有效的 DLSS5 app-owned install manifest；为保护手工文件，未执行卸载。"
    };
  }
  const manifest = manifestValue;
  const owned = manifest.ownedFiles
    .map((filename) => safeRelativePath(filename))
    .filter((filename): filename is string => Boolean(filename));
  const removed: string[] = [];
  try {
    for (const relative of owned.sort((left, right) => depthOf(right) - depthOf(left))) {
      const filename = path.join(runtimeDirectory, relative);
      if (!isPathInsideDirectory(runtimeDirectory, filename)) {
        throw new Error(`install manifest 路径超出 runtime 目录：${relative}`);
      }
      try {
        await fs.unlink(filename);
        removed.push(relative);
        onLog?.(`已删除 app-owned runtime 文件：${relative}`);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") continue;
        if (code === "EISDIR" || code === "EPERM") {
          await fs.rmdir(filename).catch((directoryError: unknown) => {
            if ((directoryError as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          });
          continue;
        }
        throw error;
      }
    }
    const directories = [...new Set(removed.flatMap((filename) => {
      const ancestors: string[] = [];
      let directory = path.dirname(filename);
      while (directory !== ".") {
        ancestors.push(directory);
        directory = path.dirname(directory);
      }
      return ancestors;
    }))]
      .filter((directory) => directory !== ".")
      .sort((left, right) => depthOf(right) - depthOf(left));
    for (const relative of directories) {
      await fs.rmdir(path.join(runtimeDirectory, relative)).catch(() => undefined);
    }
    await fs.rmdir(runtimeDirectory).catch(() => undefined);
    return {
      ok: true,
      message: removed.length
        ? "DLSS5 app-owned runtime 文件已卸载；未登记的手工文件已保留。"
        : "DLSS5 app-owned runtime 已不存在；未登记的手工文件已保留。",
      log: removed.join("\n")
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      log: removed.join("\n")
    };
  }
}

export function emptyDlss5RuntimeStatus(
  runtimeDirectory: string,
  state: Dlss5RuntimeStatus["state"] = "unknown",
  error = ""
): Dlss5RuntimeStatus {
  return blankDlss5RuntimeStatus(runtimeDirectory, state, error);
}
