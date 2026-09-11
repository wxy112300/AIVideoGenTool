import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const PYTHON_LAYOUT_PREFIX = "__LOCAL_VIDEO_STUDIO_PYTHON_LAYOUT__";
const LAYOUT_TIMEOUT_MS = 3_000;
const LAYOUT_MAX_BUFFER = 1024 * 1024;
const MAX_ENTRIES = 2_048;
const MAX_TEXT_BYTES = 4 * 1024 * 1024;
const MAX_PTH_BYTES = 256 * 1024;
const FINGERPRINT_CONCURRENCY = 16;

export interface ProbeIdentity {
  pythonPath: string;
  coreDirectory: string;
  dataDirectory: string;
}

export interface PythonDistributionManifest {
  name: string;
  metadataPath: string;
  recordPath: string;
  nativePaths: string[];
}

export interface PythonLayoutManifest {
  pythonPath: string;
  prefix: string;
  basePrefix: string;
  searchPaths: string[];
  pthFiles: string[];
  distributions: PythonDistributionManifest[];
  runtimePaths?: string[];
  environmentDigest: string;
}

export interface PythonFingerprintEntry {
  path: string;
  kind: "file" | "directory" | "missing";
  size: number;
  mtimeMs: number;
  contentDigest?: string;
}

export interface PythonFingerprintSnapshot {
  signature: string;
  manifest?: PythonLayoutManifest;
  entries: PythonFingerprintEntry[];
  cacheable: boolean;
  reason?: string;
  durationMs: number;
}

export interface PythonProbeFingerprintReader {
  read(
    identity: ProbeIdentity,
    previousManifest?: PythonLayoutManifest
  ): Promise<PythonFingerprintSnapshot>;
}

export interface PythonProbeFingerprintRunner {
  (
    python: string,
    args: readonly string[],
    options: {
      encoding: "utf8";
      timeout: number;
      windowsHide: true;
      maxBuffer: number;
    }
  ): Promise<{ stdout?: string; stderr?: string }>;
}

function normalizeForComparison(value: string): string {
  const normalized = path.normalize(value.trim()).replace(/[\\/]+/gu, path.sep);
  if (process.platform === "win32") return normalized.toLowerCase();
  return normalized;
}

export function canonicalizeProbePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return normalizeForComparison(path.resolve(trimmed));
}

export function probeIdentityKey(identity: ProbeIdentity): string {
  return [identity.pythonPath, identity.coreDirectory, identity.dataDirectory]
    .map(canonicalizeProbePath)
    .join("\u0000");
}

export function probeResourceKey(identity: ProbeIdentity): string {
  return canonicalizeProbePath(identity.pythonPath);
}

export async function resolveProbeIdentity(
  identity: ProbeIdentity
): Promise<ProbeIdentity | null> {
  if (!identity.pythonPath.trim()) return null;
  const resolveOne = async (value: string): Promise<string> => {
    if (!value.trim()) return "";
    try {
      // Use realpath as an existence/stability gate, but keep the canonical
      // caller spelling for the in-process key. Windows may return an 8.3
      // short path from realpath; mixing that form with later path.resolve
      // lookups would make a valid entry appear to belong to another identity.
      await fs.realpath(value);
      return canonicalizeProbePath(value);
    } catch {
      return "";
    }
  };
  const [pythonPath, coreDirectory, dataDirectory] = await Promise.all([
    resolveOne(identity.pythonPath),
    resolveOne(identity.coreDirectory),
    resolveOne(identity.dataDirectory)
  ]);
  if (!pythonPath || !coreDirectory || !dataDirectory) return null;
  return { pythonPath, coreDirectory, dataDirectory };
}

function boundedDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function layoutScript(): string {
  return [
    "import importlib.metadata as metadata, json, os, pathlib, sys",
    `PREFIX=${JSON.stringify(PYTHON_LAYOUT_PREFIX)}`,
    "names=['torch','torchvision','torchaudio','sageattention','triton','triton-windows','comfy-kitchen','llama-cpp-python']",
    "def distribution(name):",
    "    try:",
    "        item=metadata.distribution(name)",
    "        root=pathlib.Path(getattr(item,'_path',''))",
    "        native=[]",
    "        for file in (item.files or []):",
    "            value=str(file).replace('\\\\','/')",
    "            if value.lower().endswith(('.pyd','.dll','.so','.dylib')): native.append(str(root / file))",
    "        return {'name':name,'metadataPath':str(root/'METADATA'),'recordPath':str(root/'RECORD'),'nativePaths':native}",
    "    except Exception:",
    "        return None",
    "paths=[]",
    "for value in sys.path:",
    "    if value:",
    "        paths.append(str(pathlib.Path(value).resolve()))",
    "result={'pythonPath':str(pathlib.Path(sys.executable).resolve()),'prefix':sys.prefix,'basePrefix':getattr(sys,'base_prefix',sys.prefix),'searchPaths':paths,'pthFiles':[],'distributions':[],'environment':{key:os.environ.get(key,'') for key in ('PYTHONHOME','PYTHONPATH','PATH')}}",
    "for directory in paths:",
    "    try:",
    "        result['pthFiles'].extend(str(item) for item in pathlib.Path(directory).glob('*.pth'))",
    "    except Exception: pass",
    "for name in names:",
    "    item=distribution(name)",
    "    if item: result['distributions'].append(item)",
    "print(PREFIX+json.dumps(result,separators=(',',':')),flush=True)"
  ].join("\n");
}

function defaultRunner(): PythonProbeFingerprintRunner {
  return async (python, args, options) => {
    const result = await execFileAsync(python, [...args], options);
    return { stdout: result.stdout, stderr: result.stderr };
  };
}

function lastLayoutJson(stdout: string): string {
  return stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.includes(PYTHON_LAYOUT_PREFIX))
    .map((line) => line.slice(line.indexOf(PYTHON_LAYOUT_PREFIX) + PYTHON_LAYOUT_PREFIX.length).trim())
    .at(-1) ?? "";
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedDistribution(value: unknown): PythonDistributionManifest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const name = asString(record.name);
  const metadataPath = canonicalizeProbePath(asString(record.metadataPath));
  const recordPath = canonicalizeProbePath(asString(record.recordPath));
  const nativePaths = Array.isArray(record.nativePaths)
    ? record.nativePaths
      .filter((item): item is string => typeof item === "string")
      .map(canonicalizeProbePath)
      .filter(Boolean)
    : [];
  if (!name || !metadataPath || !recordPath) return null;
  return { name, metadataPath, recordPath, nativePaths };
}

function normalizedManifest(
  identity: ProbeIdentity,
  value: unknown
): PythonLayoutManifest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const searchPaths = Array.isArray(record.searchPaths)
    ? record.searchPaths
      .filter((item): item is string => typeof item === "string")
      .map(canonicalizeProbePath)
      .filter(Boolean)
    : [];
  const pthFiles = Array.isArray(record.pthFiles)
    ? record.pthFiles
      .filter((item): item is string => typeof item === "string")
      .map(canonicalizeProbePath)
      .filter(Boolean)
    : [];
  const distributions = Array.isArray(record.distributions)
    ? record.distributions
      .map(normalizedDistribution)
      .filter((item): item is PythonDistributionManifest => Boolean(item))
    : [];
  const environment = record.environment && typeof record.environment === "object"
    ? record.environment as Record<string, unknown>
    : {};
  const environmentDigest = boundedDigest(JSON.stringify({
    PYTHONHOME: asString(environment.PYTHONHOME),
    PYTHONPATH: asString(environment.PYTHONPATH),
    PATH: asString(environment.PATH)
  }));
  const pythonPath = canonicalizeProbePath(asString(record.pythonPath)) ||
    canonicalizeProbePath(identity.pythonPath);
  const pythonDirectory = pythonPath ? path.dirname(pythonPath) : "";
  const executableStem = pythonPath
    ? path.basename(pythonPath, path.extname(pythonPath))
    : "";
  const runtimePaths = [
    pythonPath,
    pythonDirectory ? path.join(pythonDirectory, "pyvenv.cfg") : "",
    executableStem && pythonDirectory
      ? path.join(pythonDirectory, `${executableStem}._pth`)
      : "",
    executableStem && pythonDirectory
      ? path.join(pythonDirectory, `${executableStem}.dll`)
      : ""
  ].map(canonicalizeProbePath).filter(Boolean);
  const manifest: PythonLayoutManifest = {
    pythonPath,
    prefix: canonicalizeProbePath(asString(record.prefix)),
    basePrefix: canonicalizeProbePath(asString(record.basePrefix)),
    searchPaths: [...new Set(searchPaths)],
    pthFiles: [...new Set(pthFiles)],
    distributions,
    runtimePaths: [...new Set(runtimePaths)],
    environmentDigest
  };
  if (!manifest.pythonPath || !manifest.prefix || !manifest.basePrefix || !manifest.searchPaths.length) {
    return null;
  }
  return manifest;
}

function manifestPaths(manifest: PythonLayoutManifest): string[] {
  const values = new Set<string>([
    manifest.pythonPath,
    manifest.prefix,
    manifest.basePrefix,
    ...(manifest.runtimePaths ?? []),
    ...manifest.searchPaths,
    ...manifest.pthFiles
  ]);
  for (const distribution of manifest.distributions) {
    values.add(distribution.metadataPath);
    values.add(distribution.recordPath);
    distribution.nativePaths.forEach((value) => values.add(value));
  }
  return [...values].filter(Boolean);
}

async function readTextDigest(filename: string): Promise<{ digest?: string; error?: string; bytes?: number }> {
  try {
    const source = await fs.readFile(filename);
    if (source.byteLength > MAX_PTH_BYTES) return { error: "pth-budget", bytes: source.byteLength };
    return { digest: boundedDigest(source.toString("utf8")), bytes: source.byteLength };
  } catch {
    return { error: "pth-read" };
  }
}

async function directDirectoryEntries(directory: string): Promise<PythonFingerprintEntry[]> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const result: PythonFingerprintEntry[] = [];
    for (const entry of entries) {
      const filename = path.join(directory, entry.name);
      const stat = await fs.stat(filename).catch(() => null);
      if (!stat) continue;
      result.push({
        path: canonicalizeProbePath(filename),
        kind: entry.isDirectory() ? "directory" : "file",
        size: stat.size,
        mtimeMs: stat.mtimeMs
      });
    }
    return result;
  } catch {
    return [];
  }
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  worker: (value: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;
  const run = async (): Promise<void> => {
    while (true) {
      const index = cursor++;
      if (index >= values.length) return;
      results[index] = await worker(values[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, run));
  return results;
}

export async function fingerprintPythonLayout(
  manifest: PythonLayoutManifest,
  startedAt = Date.now()
): Promise<PythonFingerprintSnapshot> {
  const paths = manifestPaths(manifest);
  if (paths.length > MAX_ENTRIES) {
    return {
      signature: "",
      manifest,
      entries: [],
      cacheable: false,
      reason: "fingerprint-budget",
      durationMs: Math.max(0, Date.now() - startedAt)
    };
  }
  let uncacheableReason = "";
  let pthBytes = 0;
  const baseEntries = await mapWithConcurrency(paths, async (filename) => {
    const stat = await fs.stat(filename).catch(() => null);
    if (!stat) return { path: filename, kind: "missing" as const, size: 0, mtimeMs: 0 };
    const entry: PythonFingerprintEntry = {
      path: filename,
      kind: stat.isDirectory() ? "directory" : "file",
      size: stat.size,
      mtimeMs: stat.mtimeMs
    };
    if (manifest.pthFiles.includes(filename)) {
      const text = await readTextDigest(filename);
      pthBytes += text.bytes ?? 0;
      if (text.error) {
        uncacheableReason = text.error === "pth-budget"
          ? "fingerprint-budget"
          : "fingerprint-read";
        return entry;
      }
      if (text.digest) entry.contentDigest = text.digest;
    }
    return entry;
  }, FINGERPRINT_CONCURRENCY);
  const directoryEntries = await mapWithConcurrency(
    manifest.searchPaths,
    (directory) => directDirectoryEntries(directory),
    FINGERPRINT_CONCURRENCY
  );
  const entries = [...baseEntries, ...directoryEntries.flat()]
    .sort((left, right) => left.path.localeCompare(right.path));
  if (entries.length > MAX_ENTRIES) {
    return {
      signature: "",
      manifest,
      entries: entries.slice(0, MAX_ENTRIES),
      cacheable: false,
      reason: "fingerprint-budget",
      durationMs: Math.max(0, Date.now() - startedAt)
    };
  }
  if (uncacheableReason) {
    return {
      signature: "",
      manifest,
      entries,
      cacheable: false,
      reason: uncacheableReason,
      durationMs: Math.max(0, Date.now() - startedAt)
    };
  }
  if (pthBytes > MAX_TEXT_BYTES) {
    return {
      signature: "",
      manifest,
      entries,
      cacheable: false,
      reason: "fingerprint-budget",
      durationMs: Math.max(0, Date.now() - startedAt)
    };
  }
  const signature = boundedDigest(JSON.stringify({
    pythonPath: manifest.pythonPath,
    prefix: manifest.prefix,
    basePrefix: manifest.basePrefix,
    runtimePaths: manifest.runtimePaths ?? [],
    environmentDigest: manifest.environmentDigest,
    entries
  }));
  return {
    signature,
    manifest,
    entries,
    cacheable: true,
    durationMs: Math.max(0, Date.now() - startedAt)
  };
}

export function createPythonProbeFingerprintReader(
  options: { runner?: PythonProbeFingerprintRunner; now?: () => number } = {}
): PythonProbeFingerprintReader {
  const runner = options.runner ?? defaultRunner();
  const now = options.now ?? Date.now;
  return {
    async read(identity, previousManifest) {
      const startedAt = now();
      if (previousManifest) return fingerprintPythonLayout(previousManifest, startedAt);
      try {
        const result = await runner(
          identity.pythonPath,
          ["-c", layoutScript()],
          {
            encoding: "utf8",
            timeout: LAYOUT_TIMEOUT_MS,
            windowsHide: true,
            maxBuffer: LAYOUT_MAX_BUFFER
          }
        );
        const parsed = JSON.parse(lastLayoutJson(result.stdout ?? "")) as unknown;
        const manifest = normalizedManifest(identity, parsed);
        if (!manifest) {
          return {
            signature: "",
            entries: [],
            cacheable: false,
            reason: "layout-invalid",
            durationMs: Math.max(0, now() - startedAt)
          };
        }
        return fingerprintPythonLayout(manifest, startedAt);
      } catch {
        return {
          signature: "",
          entries: [],
          cacheable: false,
          reason: "layout-helper-failed",
          durationMs: Math.max(0, now() - startedAt)
        };
      }
    }
  };
}
