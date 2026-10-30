import { createNativeTranslator } from "../ui-translator.js";
import type { Translate } from "../../src/core/i18n.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
import crypto from "node:crypto";
import { checkInstallationCancelled } from "./installation-cancellation.js";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { cleanupManifestSoftwareBackups, removeSoftwareArtifact } from "./software-update-cleanup.js";
import { promisify } from "node:util";
import type {
  AetherScaleWorkerState,
  AetherScaleRuntimeStatus,
  ConnectionResult,
  Settings
} from "../../src/types.js";
import {
  AETHERSCALE_CARRIER_RUNTIME_FILES_MANIFEST,
  AETHERSCALE_CARRIER_RUNTIME_FILES,
  AETHERSCALE_CARRIER_ARCHIVE,
  AETHERSCALE_CARRIER_ARCHIVE_BYTES,
  AETHERSCALE_CARRIER_ARCHIVE_SHA256,
  AETHERSCALE_CARRIER_DOWNLOAD_URL,
  AETHERSCALE_CARRIER_RELEASE,
  AETHERSCALE_CARRIER_SOURCE,
  AETHERSCALE_NODE_ID,
  AETHERSCALE_NODE_DIRECTORY,
  AETHERSCALE_NODE_REVISION,
  AETHERSCALE_RUNTIME_BUNDLE_ID,
  type AetherScaleCarrierRuntimeFile
} from "../../src/core/catalog/index.js";
import {
  isPathInsideDirectory,
  removeDirectoryTreeWithoutAsar,
  safeRelativePath
} from "./dlss5-runtime.js";
import { isLocalComfyUrl } from "./comfy-endpoint.js";

const execFileAsync = promisify(execFile);

export const AETHERSCALE_CARRIER_MANIFEST_FILENAME = "carrier_manifest.json";
export const AETHERSCALE_CARRIER_DOWNLOAD_DIRECTORY = "downloads";
export const AETHERSCALE_CARRIER_BACKUP_DIRECTORY = "aetherscale-carrier-backups";
export const AETHERSCALE_GPU_PREFERENCE_REGISTRY_PATH =
  "Software\\Microsoft\\DirectX\\UserGpuPreferences";
export const AETHERSCALE_GPU_PREFERENCE_VALUE = "GpuPreference=2;";
export const AETHERSCALE_CARRIER_WORKER_STATE_FILENAME = "carrier_process.json";
const AETHERSCALE_CARRIER_STAGING_PREFIX = ".aetherscale-carrier-staging-";
const AETHERSCALE_MUTABLE_RUNTIME_FILE_MAX_BYTES = 64 * 1024;

interface AetherScaleCarrierManifestFile {
  archive_member: string;
  bytes: number;
  sha256: string;
}

interface AetherScaleCarrierInstallManifest {
  schemaVersion: 1;
  provider: "aetherscale-carrier";
  bundleId: typeof AETHERSCALE_RUNTIME_BUNDLE_ID;
  nodeRevision: typeof AETHERSCALE_NODE_REVISION;
  installedAt: string;
  source: typeof AETHERSCALE_CARRIER_SOURCE;
  release: typeof AETHERSCALE_CARRIER_RELEASE;
  archive: typeof AETHERSCALE_CARRIER_ARCHIVE;
  archiveBytes: typeof AETHERSCALE_CARRIER_ARCHIVE_BYTES;
  archive_url: typeof AETHERSCALE_CARRIER_DOWNLOAD_URL;
  archive_sha256: typeof AETHERSCALE_CARRIER_ARCHIVE_SHA256;
  files: Record<string, AetherScaleCarrierManifestFile>;
  ownedFiles: string[];
}

export interface AetherScaleGpuPreferenceRecord {
  workerPath: string;
  previousValue: string | null;
  appliedValue: typeof AETHERSCALE_GPU_PREFERENCE_VALUE;
  owned: boolean;
}

export interface AetherScaleWorkerCleanupResult extends ConnectionResult {
  processId?: number;
  verified?: boolean;
}

/**
 * The upstream carrier writes this per-executable preference but does not
 * restore it. Keep the ownership rule in the app domain so a future worker
 * adapter can restore only the value it actually replaced.
 */
export function createAetherScaleGpuPreferenceRecord(
  workerPath: string,
  previousValue: string | null
): AetherScaleGpuPreferenceRecord {
  return {
    workerPath: path.resolve(workerPath),
    previousValue,
    appliedValue: AETHERSCALE_GPU_PREFERENCE_VALUE,
    owned: true
  };
}

export function shouldRestoreAetherScaleGpuPreference(
  record: AetherScaleGpuPreferenceRecord,
  currentValue: string | null
): boolean {
  return record.owned && currentValue === record.appliedValue;
}

export interface AetherScaleRuntimeProcessOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  signal?: AbortSignal;
  onLog?: (message: string) => void;
}

export interface AetherScaleRuntimeInstallerDependencies {
  platform?: NodeJS.Platform;
  findComfyPython(settings: Settings, comfyRoot: string): Promise<string>;
  findExecutable(command: string): Promise<string>;
  downloadEnvironment(settings: Settings, comfyRoot?: string): NodeJS.ProcessEnv;
  runLoggedProcess(
    executable: string,
    args: string[],
    options: AetherScaleRuntimeProcessOptions
  ): Promise<string>;
  renameWithRetry(source: string, target: string): Promise<void>;
  retryableRenameError(error: unknown): boolean;
  downloadFile?(
    url: string,
    destination: string,
    settings: Settings,
    options: {
      comfyRoot: string;
      signal?: AbortSignal;
      onLog?: (message: string) => void;
    }
  ): Promise<void | string>;
  /** Test hook. Implementations must extract only the catalogued six members. */
  extractArchive?(
    archive: string,
    destination: string,
    python: string,
    environment: NodeJS.ProcessEnv,
    options: {
      signal?: AbortSignal;
      onLog?: (message: string) => void;
      files: readonly AetherScaleCarrierRuntimeFile[];
    }
  ): Promise<readonly string[]>;
  randomId?: () => string;
  now?: () => Date;
}

export interface AetherScaleRuntimeOperationResult extends ConnectionResult {
  status?: AetherScaleRuntimeStatus;
}

function platformFor(deps?: Pick<AetherScaleRuntimeInstallerDependencies, "platform">): NodeJS.Platform {
  return deps?.platform ?? process.platform;
}

function defaultNodeDirectory(comfyRoot: string): string {
  return path.join(comfyRoot, "custom_nodes", AETHERSCALE_NODE_DIRECTORY);
}

export function aetherScaleCarrierDirectory(
  comfyRoot: string,
  nodeDirectory = ""
): string {
  return path.join(nodeDirectory || defaultNodeDirectory(comfyRoot), "runtime", "carrier");
}

export function aetherScaleCarrierRuntimeDirectory(
  comfyRoot: string,
  nodeDirectory = ""
): string {
  return path.join(aetherScaleCarrierDirectory(comfyRoot, nodeDirectory), "runtime");
}

export function aetherScaleCarrierManifestPath(
  comfyRoot: string,
  nodeDirectory = ""
): string {
  return path.join(
    aetherScaleCarrierDirectory(comfyRoot, nodeDirectory),
    AETHERSCALE_CARRIER_MANIFEST_FILENAME
  );
}

export function aetherScaleCarrierWorkerPath(
  comfyRoot: string,
  nodeDirectory = ""
): string {
  return path.join(
    aetherScaleCarrierRuntimeDirectory(comfyRoot, nodeDirectory),
    "nvngx.dll"
  );
}

export function aetherScaleCarrierWorkerStatePath(
  comfyRoot: string,
  nodeDirectory = ""
): string {
  return path.join(
    aetherScaleCarrierDirectory(comfyRoot, nodeDirectory),
    AETHERSCALE_CARRIER_WORKER_STATE_FILENAME
  );
}

function blankAetherScaleRuntimeStatus(
  runtimeDirectory: string,
  manifestPath: string,
  workerPath: string,
  state: AetherScaleRuntimeStatus["state"] = "unknown",
  error = ""
): AetherScaleRuntimeStatus {
  return {
    state,
    provider: "aetherscale-carrier",
    bundleId: AETHERSCALE_RUNTIME_BUNDLE_ID,
    nodeRevision: "",
    runtimeDirectory,
    manifestPath,
    workerPath,
    source: "",
    installed: false,
    manifestValid: false,
    carrierReady: false,
    motionReady: false,
    vfxReady: false,
    runtimeValidated: false,
    smokeValidated: false,
    pythonPath: "",
    missingFiles: [...AETHERSCALE_CARRIER_RUNTIME_FILES],
    unexpectedFiles: [],
    incompatibleFiles: [],
    error
  };
}

export function emptyAetherScaleRuntimeStatus(
  runtimeDirectory: string,
  state: AetherScaleRuntimeStatus["state"] = "unknown",
  error = "",
  manifestPath = "",
  workerPath = ""
): AetherScaleRuntimeStatus {
  return blankAetherScaleRuntimeStatus(
    runtimeDirectory,
    manifestPath || path.join(path.dirname(runtimeDirectory), AETHERSCALE_CARRIER_MANIFEST_FILENAME),
    workerPath || path.join(runtimeDirectory, "nvngx.dll"),
    state,
    error
  );
}

async function fileExists(filename: string): Promise<boolean> {
  return Boolean(await fs.stat(filename).catch(() => null));
}

async function listFiles(root: string): Promise<string[]> {
  if (!root || !(await fileExists(root))) return [];
  const result: string[] = [];
  const pending = [root];
  while (pending.length && result.length < 100_000) {
    const current = pending.pop()!;
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const relative = safeRelativePath(path.relative(root, absolute));
      if (!relative) continue;
      if (entry.isDirectory()) {
        pending.push(absolute);
      } else {
        result.push(relative);
      }
    }
  }
  return result.sort((left, right) => left.localeCompare(right));
}

async function assertNoLinks(root: string, t: Translate = createNativeTranslator(undefined).t): Promise<void> {
  if (!(await fileExists(root))) return;
  const pending = [root];
  while (pending.length) {
    const current = pending.pop()!;
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        throw new Error(t(uiKeys.aetherRuntime.symlink, { file: entry.name }));
      }
      if (entry.isDirectory()) pending.push(path.join(current, entry.name));
    }
  }
}

async function sha256File(filename: string): Promise<string> {
  const digest = crypto.createHash("sha256");
  for await (const chunk of createReadStream(filename)) { checkInstallationCancelled(); digest.update(chunk); }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAetherScaleWorkerState(
  value: unknown,
  expectedWorkerPath: string,
  expectedRuntimeDirectory: string
): AetherScaleWorkerState | null {
  if (!isRecord(value)) return null;
  const processId = Number(value.pid);
  const parentProcessId = Number(value.parent_pid);
  const workerPath = typeof value.worker === "string" ? value.worker : "";
  const runtimeDirectory = typeof value.runtime === "string" ? value.runtime : "";
  const startedAtSeconds = Number(value.started_at);
  if (
    !Number.isInteger(processId) || processId <= 0 ||
    !Number.isInteger(parentProcessId) || parentProcessId <= 0 ||
    !workerPath || !runtimeDirectory ||
    !Number.isFinite(startedAtSeconds) || startedAtSeconds <= 0
  ) return null;
  const resolvedWorkerPath = path.resolve(workerPath);
  const resolvedRuntimeDirectory = path.resolve(runtimeDirectory);
  if (
    resolvedWorkerPath.toLowerCase() !== path.resolve(expectedWorkerPath).toLowerCase() ||
    resolvedRuntimeDirectory.toLowerCase() !== path.resolve(expectedRuntimeDirectory).toLowerCase()
  ) return null;
  return {
    processId,
    parentProcessId,
    workerPath: resolvedWorkerPath,
    runtimeDirectory: resolvedRuntimeDirectory,
    startedAt: new Date(startedAtSeconds * 1000).toISOString()
  };
}

async function readAetherScaleWorkerState(
  statePath: string,
  workerPath: string,
  runtimeDirectory: string
): Promise<AetherScaleWorkerState | null> {
  return parseAetherScaleWorkerState(
    await readJson<unknown>(statePath),
    workerPath,
    runtimeDirectory
  );
}

function validCarrierManifest(value: unknown): value is AetherScaleCarrierInstallManifest {
  if (!isRecord(value)) return false;
  if (
    value.schemaVersion !== 1 ||
    value.provider !== "aetherscale-carrier" ||
    value.bundleId !== AETHERSCALE_RUNTIME_BUNDLE_ID ||
    value.nodeRevision !== AETHERSCALE_NODE_REVISION ||
    value.source !== AETHERSCALE_CARRIER_SOURCE ||
    value.release !== AETHERSCALE_CARRIER_RELEASE ||
    value.archive !== AETHERSCALE_CARRIER_ARCHIVE ||
    value.archiveBytes !== AETHERSCALE_CARRIER_ARCHIVE_BYTES ||
    value.archive_url !== AETHERSCALE_CARRIER_DOWNLOAD_URL ||
    value.archive_sha256 !== AETHERSCALE_CARRIER_ARCHIVE_SHA256 ||
    typeof value.installedAt !== "string" ||
    !isRecord(value.files) ||
    !Array.isArray(value.ownedFiles)
  ) return false;
  const ownedFiles = value.ownedFiles;
  if (!ownedFiles.every((item) => typeof item === "string" && Boolean(safeRelativePath(item)))) {
    return false;
  }
  const expectedOwnedFiles = new Set([
    AETHERSCALE_CARRIER_MANIFEST_FILENAME,
    ...AETHERSCALE_CARRIER_RUNTIME_FILES.map((filename) => `runtime/${filename}`)
  ]);
  if (ownedFiles.length !== expectedOwnedFiles.size ||
      ownedFiles.some((filename) => !expectedOwnedFiles.has(filename))) {
    return false;
  }
  const files = value.files as Record<string, unknown>;
  return AETHERSCALE_CARRIER_RUNTIME_FILES_MANIFEST.every((expected) => {
    const candidate = files[expected.filename];
    return isRecord(candidate) &&
      candidate.archive_member === expected.archiveMember &&
      candidate.bytes === expected.bytes &&
      candidate.sha256 === expected.sha256;
  });
}

function parseJsonLine<T>(output: string, t: Translate = createNativeTranslator(undefined).t): T {
  for (const line of output.split(/\r?\n/u).reverse()) {
    const candidate = line.trim();
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Keep looking for the final machine-readable line after Python logs.
    }
  }
  throw new Error(t(uiKeys.aetherRuntime.invalidJson));
}

export function validateAetherScaleArchiveEntries(
  entries: readonly string[],
  t: Translate = createNativeTranslator(undefined).t
): string[] {
  const normalized = entries.map((entry) => safeRelativePath(entry));
  if (normalized.some((entry) => !entry)) {
    throw new Error(t(uiKeys.aetherRuntime.unsafeArchive));
  }
  const unique = [...new Set(normalized as string[])];
  const expected = AETHERSCALE_CARRIER_RUNTIME_FILES_MANIFEST.map((file) => file.archiveMember);
  const missing = expected.filter((member) => !unique.includes(member));
  if (missing.length) {
    throw new Error(t(uiKeys.aetherRuntime.missingMembers, { files: missing.join(t(uiKeys.nodeInstaller.listSeparator)) }));
  }
  return unique;
}

/**
 * The extractor writes the six audited members directly into the staged
 * runtime directory. Keep this check relative to that directory so a root
 * file such as `dxgi.dll` is not mistaken for a nested path (`path.dirname`
 * returns `.` for a root-relative filename).
 */
export function findUnexpectedAetherScaleStagedFiles(
  files: readonly string[]
): string[] {
  return files.filter((filename) => {
    const normalized = safeRelativePath(filename);
    return normalized === null ||
      normalized.includes("/") ||
      !AETHERSCALE_CARRIER_RUNTIME_FILES.includes(
        normalized as typeof AETHERSCALE_CARRIER_RUNTIME_FILES[number]
      );
  });
}

const PYTHON_ZIP_EXTRACT_SCRIPT = [
  "import json,pathlib,sys,zipfile",
  "archive=pathlib.Path(sys.argv[1])",
  "destination=pathlib.Path(sys.argv[2])",
  "expected=json.loads(sys.argv[3])",
  "with zipfile.ZipFile(archive, 'r') as bundle:",
  "    names=bundle.namelist()",
  "    unsafe=[]",
  "    for name in names:",
  "        normalized=name.replace('\\\\','/')",
  "        parts=pathlib.PurePosixPath(normalized).parts",
  "        if not normalized or normalized.startswith('/') or pathlib.PureWindowsPath(name).is_absolute() or '..' in parts:",
  "            unsafe.append(name)",
  "    if unsafe:",
  "        raise RuntimeError('archive contains unsafe paths: ' + repr(unsafe[:5]))",
  "    name_set=set(names)",
  "    for item in expected:",
  "        member=item['archiveMember']",
  "        if member not in name_set:",
  "            raise RuntimeError('missing archive member: ' + member)",
  "        target=destination / item['filename']",
  "        target.parent.mkdir(parents=True, exist_ok=True)",
  "        target.write_bytes(bundle.read(member))",
  "    print(json.dumps(names))"
].join("\n");

async function extractAetherScaleArchive(
  archive: string,
  destination: string,
  python: string,
  environment: NodeJS.ProcessEnv,
  deps: AetherScaleRuntimeInstallerDependencies,
  options: {
    signal?: AbortSignal;
    onLog?: (message: string) => void;
  },
  t: Translate = createNativeTranslator(undefined).t
): Promise<readonly string[]> {
  if (options.signal?.aborted) throw new Error(t(uiKeys.aetherRuntime.cancelled));
  const output = await deps.runLoggedProcess(
    python,
    [
      "-c",
      PYTHON_ZIP_EXTRACT_SCRIPT,
      archive,
      destination,
      JSON.stringify(AETHERSCALE_CARRIER_RUNTIME_FILES_MANIFEST)
    ],
    { env: environment, timeoutMs: 900_000, onLog: options.onLog, signal: options.signal }
  );
  const entries = parseJsonLine<unknown>(output, t);
  if (!Array.isArray(entries) || entries.some((entry) => typeof entry !== "string")) {
    throw new Error(t(uiKeys.aetherRuntime.invalidListing));
  }
  return validateAetherScaleArchiveEntries(entries, t);
}

const AETHERSCALE_ALLOWED_CARRIER_DOWNLOAD_HOSTS = new Set([
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com"
]);

function isAllowedAetherScaleCarrierDownloadUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return false;
    if (!AETHERSCALE_ALLOWED_CARRIER_DOWNLOAD_HOSTS.has(parsed.hostname.toLowerCase())) {
      return false;
    }
    return parsed.hostname.toLowerCase() !== "github.com" ||
      parsed.pathname === new URL(AETHERSCALE_CARRIER_DOWNLOAD_URL).pathname;
  } catch {
    return false;
  }
}

async function downloadAetherScaleArchive(
  partialDestination: string,
  settings: Settings,
  comfyRoot: string,
  environment: NodeJS.ProcessEnv,
  deps: AetherScaleRuntimeInstallerDependencies,
  options: { signal?: AbortSignal; onLog?: (message: string) => void }
): Promise<void> {
  const t = createNativeTranslator(settings.uiLocale).t;
  if (options.signal?.aborted) throw new Error(t(uiKeys.aetherRuntime.cancelled));
  if (deps.downloadFile) {
    const finalUrl = await deps.downloadFile(AETHERSCALE_CARRIER_DOWNLOAD_URL, partialDestination, settings, {
      comfyRoot,
      signal: options.signal,
      onLog: options.onLog
    });
    if (typeof finalUrl === "string" && !isAllowedAetherScaleCarrierDownloadUrl(finalUrl)) {
      throw new Error(t(uiKeys.aetherRuntime.redirectDenied, { url: finalUrl }));
    }
    return;
  }
  const curl = await deps.findExecutable("curl.exe");
  if (!curl) throw new Error(t(uiKeys.aetherRuntime.curlMissing));
  const args = [
    "-fL",
    "--retry", "2",
    "--connect-timeout", "20",
    "--progress-bar",
    "--output", partialDestination,
    AETHERSCALE_CARRIER_DOWNLOAD_URL,
    "--write-out", "\nLVS_FINAL_URL:%{url_effective}\n"
  ];
  if (settings.proxyEnabled) args.splice(1, 0, "--proxy", settings.proxyUrl.trim());
  const output = await deps.runLoggedProcess(curl, args, {
    env: environment,
    timeoutMs: 1_800_000,
    onLog: options.onLog,
    signal: options.signal
  });
  const finalUrl = output.match(/LVS_FINAL_URL:(https?:\/\/[^\s]+)/iu)?.[1] ?? "";
  if (!finalUrl || !isAllowedAetherScaleCarrierDownloadUrl(finalUrl)) {
    throw new Error(
      t(uiKeys.aetherRuntime.finalUrlDenied, { url: finalUrl || t(uiKeys.konohamaruRuntime.unread) })
    );
  }
  if (options.signal?.aborted) throw new Error(t(uiKeys.aetherRuntime.cancelled));
}

export function isAetherScaleRuntimeMutationAllowed(
  expected: Pick<AetherScaleCarrierRuntimeFile, "mutableAfterRuntime">,
  allowRuntimeMutations: boolean
): boolean {
  return allowRuntimeMutations && expected.mutableAfterRuntime === true;
}

async function verifyCarrierFiles(
  runtimeDirectory: string,
  options: { allowRuntimeMutations?: boolean } = {}
): Promise<{ missingFiles: string[]; incompatibleFiles: string[] }> {
  const missingFiles: string[] = [];
  const incompatibleFiles: string[] = [];
  await Promise.all(AETHERSCALE_CARRIER_RUNTIME_FILES_MANIFEST.map(async (expected) => {
    const filename = path.join(runtimeDirectory, expected.filename);
    const stat = await fs.lstat(filename).catch(() => null);
    if (!stat?.isFile()) {
      if (stat?.isSymbolicLink()) incompatibleFiles.push(`${expected.filename}:symbolic-link`);
      else missingFiles.push(expected.filename);
      return;
    }
    if (isAetherScaleRuntimeMutationAllowed(expected, options.allowRuntimeMutations === true)) {
      if (stat.size === 0 || stat.size > AETHERSCALE_MUTABLE_RUNTIME_FILE_MAX_BYTES) {
        incompatibleFiles.push(`${expected.filename}:bytes=${stat.size}`);
      }
      return;
    }
    if (stat.size !== expected.bytes) {
      incompatibleFiles.push(`${expected.filename}:bytes=${stat.size}`);
      return;
    }
    const digest = await sha256File(filename);
    if (digest.toLowerCase() !== expected.sha256.toLowerCase()) {
      incompatibleFiles.push(`${expected.filename}:sha256=${digest}`);
      return;
    }
    if (expected.peMachine === "x64") {
      const handle = await fs.open(filename, "r");
      try {
        const header = Buffer.alloc(512);
        const read = await handle.read(header, 0, header.length, 0);
        const peOffset = read.bytesRead >= 64 ? header.readInt32LE(0x3c) : -1;
        const isX64 = peOffset >= 0 && peOffset + 6 <= read.bytesRead &&
          header[peOffset] === 0x50 && header[peOffset + 1] === 0x45 &&
          header[peOffset + 2] === 0 && header[peOffset + 3] === 0 &&
          header.readUInt16LE(peOffset + 4) === 0x8664;
        if (!isX64) incompatibleFiles.push(`${expected.filename}:not-x64-pe`);
      } finally {
        await handle.close();
      }
    }
  }));
  return {
    missingFiles: [...new Set(missingFiles)].sort(),
    incompatibleFiles: [...new Set(incompatibleFiles)].sort()
  };
}

async function copyUnownedCarrierFiles(
  existingCarrier: string,
  stagedCarrier: string,
  report: (message: string) => void,
  t: Translate = createNativeTranslator(undefined).t
): Promise<void> {
  const owned = new Set([
    AETHERSCALE_CARRIER_MANIFEST_FILENAME,
    ...AETHERSCALE_CARRIER_RUNTIME_FILES.map((filename) => `runtime/${filename}`)
  ]);
  for (const relative of await listFiles(existingCarrier)) {
    if (owned.has(relative) || relative === AETHERSCALE_CARRIER_WORKER_STATE_FILENAME) continue;
    const source = path.join(existingCarrier, relative);
    const destination = path.join(stagedCarrier, relative);
    const stat = await fs.lstat(source);
    if (!stat.isFile()) continue;
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
    report(t(uiKeys.aetherRuntime.preserved, { file: relative }));
  }
}

function carrierManifest(
  now: Date
): AetherScaleCarrierInstallManifest {
  const files = Object.fromEntries(AETHERSCALE_CARRIER_RUNTIME_FILES_MANIFEST.map((file) => [
    file.filename,
    {
      archive_member: file.archiveMember,
      bytes: file.bytes,
      sha256: file.sha256
    }
  ]));
  return {
    schemaVersion: 1,
    provider: "aetherscale-carrier",
    bundleId: AETHERSCALE_RUNTIME_BUNDLE_ID,
    nodeRevision: AETHERSCALE_NODE_REVISION,
    installedAt: now.toISOString(),
    source: AETHERSCALE_CARRIER_SOURCE,
    release: AETHERSCALE_CARRIER_RELEASE,
    archive: AETHERSCALE_CARRIER_ARCHIVE,
    archiveBytes: AETHERSCALE_CARRIER_ARCHIVE_BYTES,
    archive_url: AETHERSCALE_CARRIER_DOWNLOAD_URL,
    archive_sha256: AETHERSCALE_CARRIER_ARCHIVE_SHA256,
    files,
    ownedFiles: [
      AETHERSCALE_CARRIER_MANIFEST_FILENAME,
      ...AETHERSCALE_CARRIER_RUNTIME_FILES.map((filename) => `runtime/${filename}`)
    ].sort((left, right) => left.localeCompare(right))
  };
}

function throwIfAborted(signal?: AbortSignal, t: Translate = createNativeTranslator(undefined).t): void {
  checkInstallationCancelled();
  if (signal?.aborted) throw new Error(t(uiKeys.aetherRuntime.cancelled));
}

async function removeStaleStaging(
  nodeDirectory: string,
  currentStagingRoot: string,
  report: (message: string) => void,
  t: Translate = createNativeTranslator(undefined).t
): Promise<void> {
  const entries = await fs.readdir(nodeDirectory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink() ||
        !entry.name.startsWith(AETHERSCALE_CARRIER_STAGING_PREFIX)) continue;
    const stagingRoot = path.join(nodeDirectory, entry.name);
    if (path.resolve(stagingRoot) === path.resolve(currentStagingRoot)) continue;
    await removeDirectoryTreeWithoutAsar(stagingRoot).then(
      () => report(t(uiKeys.aetherRuntime.stagingRemoved, { directory: entry.name })),
      (error) => report(t(uiKeys.aetherRuntime.stagingRetained, { reason: error instanceof Error ? error.message : String(error) }))
    );
  }
}

export async function scanAetherScaleRuntime(
  comfyRoot: string,
  nodeDirectory = "",
  pythonPath = "",
  platform: NodeJS.Platform = process.platform,
  t: Translate = createNativeTranslator(undefined).t
): Promise<AetherScaleRuntimeStatus> {
  const carrierDirectory = aetherScaleCarrierDirectory(comfyRoot, nodeDirectory);
  const runtimeDirectory = aetherScaleCarrierRuntimeDirectory(comfyRoot, nodeDirectory);
  const manifestPath = aetherScaleCarrierManifestPath(comfyRoot, nodeDirectory);
  const workerPath = aetherScaleCarrierWorkerPath(comfyRoot, nodeDirectory);
  const workerStatePath = aetherScaleCarrierWorkerStatePath(comfyRoot, nodeDirectory);
  if (platform !== "win32") {
    return emptyAetherScaleRuntimeStatus(
      runtimeDirectory,
      "offline",
      t(uiKeys.aetherRuntime.scanWindowsOnly),
      manifestPath,
      workerPath
    );
  }
  const status = blankAetherScaleRuntimeStatus(
    runtimeDirectory,
    manifestPath,
    workerPath,
    "missing"
  );
  status.pythonPath = pythonPath;
  const carrierStat = await fs.stat(carrierDirectory).catch(() => null);
  status.installed = Boolean(carrierStat?.isDirectory());
  const files = await listFiles(runtimeDirectory);
  const manifestValue = await readJson<unknown>(manifestPath);
  const manifest = validCarrierManifest(manifestValue) ? manifestValue : null;
  status.manifestValid = Boolean(manifest);
  status.source = manifest ? "app-managed" : files.length ? "manual" : "";
  status.nodeRevision = manifest?.nodeRevision ?? "";
  const workerState = await readAetherScaleWorkerState(
    workerStatePath,
    workerPath,
    runtimeDirectory
  );
  if (workerState) status.workerState = workerState;
  status.unexpectedFiles = findUnexpectedAetherScaleStagedFiles(files);
  const verified = await verifyCarrierFiles(runtimeDirectory, { allowRuntimeMutations: true });
  status.missingFiles = verified.missingFiles;
  status.incompatibleFiles = verified.incompatibleFiles;
  status.vfxReady = Boolean(
    await fileExists(path.join(path.dirname(path.dirname(carrierDirectory)), "vendor", "nvidia_vfx", "__init__.py"))
  );
  status.carrierReady = status.manifestValid &&
    status.missingFiles.length === 0 && status.incompatibleFiles.length === 0;
  status.motionReady = status.carrierReady;
  if (!status.installed && !files.length) {
    status.state = "missing";
  } else if (!status.carrierReady) {
    status.state = "invalid";
    const details = [
      !status.manifestValid ? t(uiKeys.aetherRuntime.manifestInvalid) : "",
      status.missingFiles.length ? t(uiKeys.aetherRuntime.missingFiles, { files: status.missingFiles.join(t(uiKeys.nodeInstaller.listSeparator)) }) : "",
      status.incompatibleFiles.length ? t(uiKeys.aetherRuntime.invalidFiles, { files: status.incompatibleFiles.join(t(uiKeys.nodeInstaller.listSeparator)) }) : ""
    ].filter(Boolean);
    status.error = details.join("；");
  } else {
    status.state = "ready";
    if (status.unexpectedFiles.length) {
      status.error = t(uiKeys.aetherRuntime.unregistered, { files: status.unexpectedFiles.join(t(uiKeys.nodeInstaller.listSeparator)) });
    }
  }
  return status;
}

interface AetherScaleWorkerProcessInspection {
  exists: boolean;
  verified: boolean;
  processId: number;
  parentProcessId: number;
  executablePath: string;
  commandLine: string;
  parentCommandLine: string;
  error?: string;
}

const AETHERSCALE_WORKER_PROCESS_QUERY = [
  "$pidValue = [int]$env:LVS_AETHER_WORKER_PID",
  "$expectedParent = [int]$env:LVS_AETHER_PARENT_PID",
  "$expectedWorker = [IO.Path]::GetFullPath($env:LVS_AETHER_WORKER_PATH).ToLowerInvariant()",
  "$worker = Get-CimInstance Win32_Process -Filter (\"ProcessId = \" + $pidValue)",
  "if (-not $worker) {",
  "  [pscustomobject]@{ exists = $false; verified = $false; processId = $pidValue; parentProcessId = 0; executablePath = ''; commandLine = ''; parentCommandLine = '' } | ConvertTo-Json -Compress",
  "  exit 0",
  "}",
  "$parent = Get-CimInstance Win32_Process -Filter (\"ProcessId = \" + $expectedParent)",
  "$executablePath = [string]$worker.ExecutablePath",
  "$commandLine = [string]$worker.CommandLine",
  "$parentCommandLine = [string]$parent.CommandLine",
  "$workerMatches = $executablePath -and ([IO.Path]::GetFullPath($executablePath).ToLowerInvariant() -eq $expectedWorker)",
  "$commandMatches = $commandLine -match '(?i)(^|\\s)--video(\\s|$)'",
  "$parentMatches = $parent -and (([string]$parent.ExecutablePath -match '(?i)python') -or ($parentCommandLine -match '(?i)ComfyUI|main\\.py'))",
  "[pscustomobject]@{ exists = $true; verified = [bool]($workerMatches -and ([int]$worker.ParentProcessId -eq $expectedParent) -and $commandMatches -and $parentMatches); processId = [int]$worker.ProcessId; parentProcessId = [int]$worker.ParentProcessId; executablePath = $executablePath; commandLine = $commandLine; parentCommandLine = $parentCommandLine } | ConvertTo-Json -Compress"
].join(" ");

async function inspectAetherScaleWorkerProcess(
  state: AetherScaleWorkerState,
  expectedWorkerPath: string
): Promise<AetherScaleWorkerProcessInspection> {
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", AETHERSCALE_WORKER_PROCESS_QUERY],
      {
        encoding: "utf8",
        timeout: 10_000,
        windowsHide: true,
        env: {
          ...process.env,
          LVS_AETHER_WORKER_PID: String(state.processId),
          LVS_AETHER_PARENT_PID: String(state.parentProcessId),
          LVS_AETHER_WORKER_PATH: expectedWorkerPath
        }
      }
    );
    const value = JSON.parse(stdout.trim()) as Record<string, unknown>;
    return {
      exists: value.exists === true,
      verified: value.verified === true,
      processId: Number(value.processId) || state.processId,
      parentProcessId: Number(value.parentProcessId) || 0,
      executablePath: String(value.executablePath ?? ""),
      commandLine: String(value.commandLine ?? ""),
      parentCommandLine: String(value.parentCommandLine ?? "")
    };
  } catch (error) {
    return {
      exists: false,
      verified: false,
      processId: state.processId,
      parentProcessId: state.parentProcessId,
      executablePath: "",
      commandLine: "",
      parentCommandLine: "",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function clearAetherScaleWorkerState(
  statePath: string,
  expectedWorkerPath: string,
  expectedRuntimeDirectory: string,
  processId: number
): Promise<void> {
  const state = await readAetherScaleWorkerState(
    statePath,
    expectedWorkerPath,
    expectedRuntimeDirectory
  );
  if (state?.processId !== processId) return;
  await fs.unlink(statePath).catch(() => undefined);
}

/**
 * Terminate only the carrier worker that proved ownership through the
 * adapter-published PID, executable path, --video command line, and ComfyUI
 * parent process. A mismatched or unverifiable process is never killed.
 */
export async function terminateAetherScaleWorker(
  comfyRoot: string,
  nodeDirectory = "",
  onLog?: (message: string) => void,
  t: Translate = createNativeTranslator(undefined).t
): Promise<AetherScaleWorkerCleanupResult> {
  if (!comfyRoot || (nodeDirectory && !isPathInsideDirectory(comfyRoot, nodeDirectory))) {
    return {
      ok: false,
      verified: false,
      message: t(uiKeys.aetherRuntime.workerWrongTarget)
    };
  }
  if (process.platform !== "win32") {
    return { ok: false, message: t(uiKeys.aetherRuntime.workerWindowsOnly) };
  }
  const workerPath = aetherScaleCarrierWorkerPath(comfyRoot, nodeDirectory);
  const runtimeDirectory = aetherScaleCarrierRuntimeDirectory(comfyRoot, nodeDirectory);
  const statePath = aetherScaleCarrierWorkerStatePath(comfyRoot, nodeDirectory);
  const state = await readAetherScaleWorkerState(
    statePath,
    workerPath,
    runtimeDirectory
  );
  if (!state) {
    if (await fileExists(statePath)) {
      return {
        ok: false,
        verified: false,
        message: t(uiKeys.aetherRuntime.workerUnverified)
      };
    }
    return { ok: true, message: t(uiKeys.aetherRuntime.workerAbsent) };
  }
  const inspection = await inspectAetherScaleWorkerProcess(state, workerPath);
  if (inspection.error) {
    return {
      ok: false,
      verified: false,
      processId: state.processId,
      message: t(uiKeys.aetherRuntime.workerInspectFailed, { pid: state.processId, reason: inspection.error })
    };
  }
  if (!inspection.exists) {
    await clearAetherScaleWorkerState(
      statePath,
      workerPath,
      runtimeDirectory,
      state.processId
    );
    onLog?.(t(uiKeys.aetherRuntime.workerStateRemoved, { pid: state.processId }));
    return {
      ok: true,
      verified: true,
      processId: state.processId,
      message: t(uiKeys.aetherRuntime.workerExited, { pid: state.processId })
    };
  }
  if (!inspection.verified) {
    return {
      ok: false,
      verified: false,
      processId: state.processId,
      message: t(uiKeys.aetherRuntime.workerOwnershipDenied, { pid: state.processId })
    };
  }
  onLog?.(t(uiKeys.aetherRuntime.workerTerminating, { pid: state.processId }));
  try {
    await execFileAsync(
      "taskkill.exe",
      ["/PID", String(state.processId), "/F"],
      { encoding: "utf8", timeout: 10_000, windowsHide: true }
    );
  } catch (error) {
    const afterFailure = await inspectAetherScaleWorkerProcess(state, workerPath);
    if (afterFailure.exists) {
      return {
        ok: false,
        verified: afterFailure.verified,
        processId: state.processId,
        message: t(uiKeys.aetherRuntime.workerTerminateFailed, { pid: state.processId, reason: error instanceof Error ? error.message : String(error) })
      };
    }
  }
  let finalInspection = inspection;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    finalInspection = await inspectAetherScaleWorkerProcess(state, workerPath);
    if (!finalInspection.exists) break;
  }
  if (finalInspection.exists) {
    return {
      ok: false,
      verified: finalInspection.verified,
      processId: state.processId,
      message: t(uiKeys.aetherRuntime.workerStillPresent, { pid: state.processId })
    };
  }
  await clearAetherScaleWorkerState(
    statePath,
    workerPath,
    runtimeDirectory,
    state.processId
  );
  return {
    ok: true,
    verified: true,
    processId: state.processId,
    message: t(uiKeys.aetherRuntime.workerTerminated, { pid: state.processId })
  };
}

async function ensureAetherScaleWorkerStopped(
  comfyRoot: string,
  nodeDirectory: string,
  platform: NodeJS.Platform,
  report: (message: string) => void,
  t: Translate = createNativeTranslator(undefined).t
): Promise<void> {
  const workerPath = aetherScaleCarrierWorkerPath(comfyRoot, nodeDirectory);
  const runtimeDirectory = aetherScaleCarrierRuntimeDirectory(comfyRoot, nodeDirectory);
  const statePath = aetherScaleCarrierWorkerStatePath(comfyRoot, nodeDirectory);
  if (!(await fileExists(statePath))) return;
  const state = await readAetherScaleWorkerState(
    statePath,
    workerPath,
    runtimeDirectory
  );
  if (!state) {
    throw new Error(t(uiKeys.aetherRuntime.updateUnverifiedWorker));
  }
  if (platform !== "win32") {
    throw new Error(t(uiKeys.aetherRuntime.updateWorkerPlatform));
  }
  const inspection = await inspectAetherScaleWorkerProcess(state, workerPath);
  if (inspection.error) {
    throw new Error(t(uiKeys.aetherRuntime.updateWorkerInspect, { reason: inspection.error }));
  }
  if (inspection.exists) {
    throw new Error(
      inspection.verified
        ? t(uiKeys.aetherRuntime.updateWorkerRunning, { pid: state.processId })
        : t(uiKeys.aetherRuntime.updateOwnershipDenied, { pid: state.processId })
    );
  }
  await clearAetherScaleWorkerState(
    statePath,
    workerPath,
    runtimeDirectory,
    state.processId
  );
  report(t(uiKeys.aetherRuntime.exitedStateRemoved, { pid: state.processId }));
}

export async function installAetherScaleRuntime(
  settings: Settings,
  comfyRoot: string,
  nodeDirectory: string,
  deps: AetherScaleRuntimeInstallerDependencies,
  onLog?: (message: string) => void,
  signal?: AbortSignal
): Promise<AetherScaleRuntimeOperationResult> {
  const t = createNativeTranslator(settings.uiLocale).t;
  const log: string[] = [];
  const report = (message: string) => {
    const normalized = message.trim();
    if (!normalized) return;
    log.push(normalized);
    onLog?.(normalized);
  };
  if (!isLocalComfyUrl(settings.comfyUrl)) {
    return { ok: false, message: t(uiKeys.aetherRuntime.remoteInstall) };
  }
  if (platformFor(deps) !== "win32") {
    return { ok: false, message: t(uiKeys.aetherRuntime.windowsOnly) };
  }
  if (!comfyRoot || !nodeDirectory || !isPathInsideDirectory(comfyRoot, nodeDirectory)) {
    return { ok: false, message: t(uiKeys.aetherRuntime.installWrongTarget) };
  }
  if (AETHERSCALE_CARRIER_RUNTIME_FILES_MANIFEST.length !== AETHERSCALE_CARRIER_RUNTIME_FILES.length) {
    return { ok: false, message: t(uiKeys.aetherRuntime.manifestIncomplete) };
  }
  const id = deps.randomId?.() ?? crypto.randomUUID();
  const stagingRoot = path.join(nodeDirectory, `${AETHERSCALE_CARRIER_STAGING_PREFIX}${id}`);
  const stagedCarrier = path.join(stagingRoot, "carrier");
  const stagedRuntime = path.join(stagedCarrier, "runtime");
  const archiveDirectory = path.join(stagingRoot, AETHERSCALE_CARRIER_DOWNLOAD_DIRECTORY);
  const partialArchive = path.join(archiveDirectory, `${AETHERSCALE_CARRIER_ARCHIVE}.partial`);
  const archive = path.join(archiveDirectory, AETHERSCALE_CARRIER_ARCHIVE);
  const carrierDirectory = aetherScaleCarrierDirectory(comfyRoot, nodeDirectory);
  const runtimeDirectory = aetherScaleCarrierRuntimeDirectory(comfyRoot, nodeDirectory);
  const environment = deps.downloadEnvironment(settings, comfyRoot);
  let backupDirectory = "";
  let previousMovedToBackup = false;
  let promoted = false;
  try {
    throwIfAborted(signal, t);
    await ensureAetherScaleWorkerStopped(
      comfyRoot,
      nodeDirectory,
      platformFor(deps),
      report, t
    );
    await removeStaleStaging(nodeDirectory, stagingRoot, report, t);
    const python = await deps.findComfyPython(settings, comfyRoot);
    if (!python) throw new Error(t(uiKeys.aetherRuntime.pythonMissing));
    report(t(uiKeys.aetherRuntime.extracting, { path: python }));
    await fs.mkdir(archiveDirectory, { recursive: true });
    report(t(uiKeys.aetherRuntime.downloading, { release: AETHERSCALE_CARRIER_RELEASE, archive: AETHERSCALE_CARRIER_ARCHIVE }));
    await downloadAetherScaleArchive(partialArchive, settings, comfyRoot, environment, deps, {
      signal,
      onLog: report
    });
    const archiveStat = await fs.stat(partialArchive).catch(() => null);
    if (!archiveStat?.isFile() || archiveStat.size <= 0) {
      throw new Error(t(uiKeys.aetherRuntime.downloadIncomplete));
    }
    if (archiveStat.size !== AETHERSCALE_CARRIER_ARCHIVE_BYTES) {
      throw new Error(t(uiKeys.aetherRuntime.truncated, { actual: archiveStat.size, expected: AETHERSCALE_CARRIER_ARCHIVE_BYTES }));
    }
    const archiveSha256 = await sha256File(partialArchive);
    if (archiveSha256.toLowerCase() !== AETHERSCALE_CARRIER_ARCHIVE_SHA256.toLowerCase()) {
      throw new Error(t(uiKeys.aetherRuntime.hashFailed, { expected: AETHERSCALE_CARRIER_ARCHIVE_SHA256, actual: archiveSha256 }));
    }
    await deps.renameWithRetry(partialArchive, archive);
    report(t(uiKeys.aetherRuntime.hashVerified, { digest: archiveSha256 }));
    await fs.mkdir(stagedRuntime, { recursive: true });
    const archiveEntries = await (deps.extractArchive
      ? deps.extractArchive(archive, stagedRuntime, python, environment, {
          signal,
          onLog: report,
          files: AETHERSCALE_CARRIER_RUNTIME_FILES_MANIFEST
        })
      : extractAetherScaleArchive(archive, stagedRuntime, python, environment, deps, {
          signal,
          onLog: report
    }, t));
    validateAetherScaleArchiveEntries(archiveEntries, t);
    await assertNoLinks(stagedCarrier, t);
    const stagedFiles = await listFiles(stagedRuntime);
    const unexpectedStaged = findUnexpectedAetherScaleStagedFiles(stagedFiles);
    if (unexpectedStaged.length) {
      throw new Error(t(uiKeys.aetherRuntime.unexpectedStaged, { files: unexpectedStaged.join(t(uiKeys.nodeInstaller.listSeparator)) }));
    }
    const stagedVerification = await verifyCarrierFiles(stagedRuntime);
    if (stagedVerification.missingFiles.length || stagedVerification.incompatibleFiles.length) {
      throw new Error(t(uiKeys.aetherRuntime.verificationFailed, { files: [...stagedVerification.missingFiles, ...stagedVerification.incompatibleFiles].join(t(uiKeys.nodeInstaller.listSeparator)) }));
    }
    await copyUnownedCarrierFiles(carrierDirectory, stagedCarrier, report, t);
    const manifest = carrierManifest(deps.now?.() ?? new Date());
    await fs.writeFile(
      path.join(stagedCarrier, AETHERSCALE_CARRIER_MANIFEST_FILENAME),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    );
    await fs.mkdir(path.dirname(carrierDirectory), { recursive: true });
    const current = await fs.lstat(carrierDirectory).catch(() => null);
    if (current) {
      const backupRoot = path.join(comfyRoot, AETHERSCALE_CARRIER_BACKUP_DIRECTORY);
      backupDirectory = path.join(backupRoot, `${Date.now()}-${id}`);
      await fs.mkdir(backupRoot, { recursive: true });
      report(t(uiKeys.aetherRuntime.backingUp));
      await deps.renameWithRetry(carrierDirectory, backupDirectory);
      previousMovedToBackup = true;
    }
    throwIfAborted(signal, t);
    try {
      await deps.renameWithRetry(stagedCarrier, carrierDirectory);
      promoted = true;
    } catch (error) {
      if (!deps.retryableRenameError(error)) throw error;
      report(t(uiKeys.aetherRuntime.copyFallback));
      await fs.cp(stagedCarrier, carrierDirectory, {
        recursive: true,
        force: false,
        errorOnExist: true
      });
      promoted = true;
    }
    const status = await scanAetherScaleRuntime(comfyRoot, nodeDirectory, python, platformFor(deps), t);
    if (!status.carrierReady) {
      throw new Error(t(uiKeys.aetherRuntime.recheckFailed, { reason: status.error || status.missingFiles.join(t(uiKeys.nodeInstaller.listSeparator)) }));
    }
    if (backupDirectory) { await removeSoftwareArtifact(comfyRoot, backupDirectory, report, undefined, t); backupDirectory = ""; }
    await cleanupManifestSoftwareBackups(comfyRoot, path.join(comfyRoot, AETHERSCALE_CARRIER_BACKUP_DIRECTORY), AETHERSCALE_CARRIER_MANIFEST_FILENAME, validCarrierManifest, carrierDirectory, report, t);
    report(t(uiKeys.aetherRuntime.installedLog));
    return {
      ok: true,
      message: t(uiKeys.aetherRuntime.installed),
      log: log.join("\n\n"),
      status
    };
  } catch (error) {
    if (previousMovedToBackup && backupDirectory) {
      if (promoted) await removeDirectoryTreeWithoutAsar(carrierDirectory).catch(() => undefined);
      await deps.renameWithRetry(backupDirectory, carrierDirectory).catch(() => undefined);
    } else if (promoted) {
      await removeDirectoryTreeWithoutAsar(carrierDirectory).catch(() => undefined);
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

export async function uninstallAetherScaleRuntime(
  settings: Settings,
  comfyRoot: string,
  nodeDirectory = "",
  onLog?: (message: string) => void
): Promise<AetherScaleRuntimeOperationResult> {
  const t = createNativeTranslator(settings.uiLocale).t;
  if (!isLocalComfyUrl(settings.comfyUrl)) {
    return { ok: false, message: t(uiKeys.aetherRuntime.remoteUninstall) };
  }
  if (!comfyRoot || (nodeDirectory && !isPathInsideDirectory(comfyRoot, nodeDirectory))) {
    return { ok: false, message: t(uiKeys.aetherRuntime.uninstallWrongTarget) };
  }
  const carrierDirectory = aetherScaleCarrierDirectory(comfyRoot, nodeDirectory);
  const runtimeDirectory = aetherScaleCarrierRuntimeDirectory(comfyRoot, nodeDirectory);
  const manifestPath = aetherScaleCarrierManifestPath(comfyRoot, nodeDirectory);
  const manifestValue = await readJson<unknown>(manifestPath);
  if (!validCarrierManifest(manifestValue)) {
    return {
      ok: false,
      message: t(uiKeys.aetherRuntime.uninstallUnowned)
    };
  }
  if (process.platform === "win32") {
    const worker = await terminateAetherScaleWorker(comfyRoot, nodeDirectory, onLog, t);
    if (!worker.ok) {
      return {
        ok: false,
        message: worker.message,
        log: worker.message
      };
    }
  }
  const removed: string[] = [];
  try {
    const owned = manifestValue.ownedFiles
      .map((filename) => safeRelativePath(filename))
      .filter((filename): filename is string => Boolean(filename));
    for (const relative of owned.sort((left, right) => depthOf(right) - depthOf(left))) {
      const target = path.join(carrierDirectory, relative);
      if (!isPathInsideDirectory(carrierDirectory, target)) {
        throw new Error(t(uiKeys.aetherRuntime.manifestOutside, { file: relative }));
      }
      try {
        await fs.unlink(target);
        removed.push(relative);
        onLog?.(t(uiKeys.aetherRuntime.deleted, { file: relative }));
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") continue;
        throw error;
      }
    }
    const directories = [...new Set(removed.flatMap((relative) => {
      const result: string[] = [];
      let current = path.dirname(relative);
      while (current !== ".") {
        result.push(current);
        current = path.dirname(current);
      }
      return result;
    }))].sort((left, right) => depthOf(right) - depthOf(left));
    for (const relative of directories) {
      await fs.rmdir(path.join(carrierDirectory, relative)).catch(() => undefined);
    }
    await fs.rmdir(runtimeDirectory).catch(() => undefined);
    await fs.rmdir(carrierDirectory).catch(() => undefined);
    return {
      ok: true,
      message: removed.length
        ? t(uiKeys.aetherRuntime.uninstalled)
        : t(uiKeys.aetherRuntime.alreadyAbsent),
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

export const AETHERSCALE_RUNTIME_PROVIDER_ID = AETHERSCALE_NODE_ID;
