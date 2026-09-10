import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Settings } from "../../src/types.js";
import {
  KONOHAMARU_NODE_REVISION,
  KONOHAMARU_NEURAL_UPSTREAM_ADDON,
  KONOHAMARU_NEURAL_UPSTREAM_DOWNLOAD_URL,
  KONOHAMARU_NEURAL_UPSTREAM_RUNTIME_BUNDLE_ID,
  KONOHAMARU_NEURAL_UPSTREAM_SHA256,
  KONOHAMARU_NEURAL_UPSTREAM_RELEASE,
  KONOHAMARU_VIDEO2DLSSNR_ARCHIVE,
  KONOHAMARU_VIDEO2DLSSNR_ARCHIVE_BYTES,
  KONOHAMARU_VIDEO2DLSSNR_ARCHIVE_SHA256,
  KONOHAMARU_VIDEO2DLSSNR_DOWNLOAD_URL,
  KONOHAMARU_VIDEO2DLSSNR_RELEASE,
  KONOHAMARU_VIDEO2DLSSNR_RUNTIME_ARTIFACTS,
  KONOHAMARU_VIDEO2DLSSNR_RUNTIME_BUNDLE_ID,
  KONOHAMARU_VIDEO2DLSSNR_RUNTIME_FILES
} from "../../src/core/catalog/index.js";
import { removeDirectoryTreeWithoutAsar } from "./dlss5-runtime.js";

const LEGACY_RENODX_ADDON = "renodx-dlss5.addon64";
const DISABLED_RENODX_SUFFIX = ".disabled";
const VIDEO2DLSSNR_STAGING_PREFIX = ".konohamaru-video2dlssnr-staging-";
const VIDEO2DLSSNR_BACKUP_DIRECTORY = "video2dlssnr-backups";
const ALLOWED_DOWNLOAD_HOSTS = new Set([
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com"
]);

export interface KonohamaruRuntimeProcessOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  signal?: AbortSignal;
  onLog?: (message: string) => void;
}

export interface KonohamaruRuntimeInstallerDependencies {
  platform?: NodeJS.Platform;
  findExecutable(command: string): Promise<string>;
  findComfyPython?(settings: Settings, comfyRoot: string): Promise<string>;
  downloadEnvironment(settings: Settings, comfyRoot?: string): NodeJS.ProcessEnv;
  runLoggedProcess(
    executable: string,
    args: string[],
    options: KonohamaruRuntimeProcessOptions
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
  extractArchive?(
    archive: string,
    destination: string,
    python: string,
    environment: NodeJS.ProcessEnv,
    artifacts: readonly { archiveMember: string; filename: string; bytes: number }[],
    options: { signal?: AbortSignal; onLog?: (message: string) => void }
  ): Promise<readonly string[]>;
  randomId?: () => string;
}

export interface KonohamaruRuntimeOperationResult {
  ok: boolean;
  message: string;
  log?: string;
}

function hostDirectory(nodeDirectory: string): string {
  return path.join(nodeDirectory, "bin", "runtime", "host");
}

export function konohamaruVideo2dlssnrRuntimeDirectory(nodeDirectory: string): string {
  return path.join(nodeDirectory, "bin", "runtime", "video2dlssnr");
}

export function konohamaruNeuralUpstreamAddonPath(nodeDirectory: string): string {
  return path.join(hostDirectory(nodeDirectory), KONOHAMARU_NEURAL_UPSTREAM_ADDON);
}

function legacyRenoDxAddonPath(nodeDirectory: string): string {
  return path.join(hostDirectory(nodeDirectory), LEGACY_RENODX_ADDON);
}

function isAllowedDownloadUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (!ALLOWED_DOWNLOAD_HOSTS.has(host)) return false;
    if (host !== "github.com") return true;
    return new Set([
      new URL(KONOHAMARU_NEURAL_UPSTREAM_DOWNLOAD_URL).pathname,
      new URL(KONOHAMARU_VIDEO2DLSSNR_DOWNLOAD_URL).pathname
    ]).has(parsed.pathname);
  } catch {
    return false;
  }
}

async function sha256File(filename: string): Promise<string> {
  const digest = crypto.createHash("sha256");
  digest.update(await fs.readFile(filename));
  return digest.digest("hex");
}

async function lstatIsPresent(filename: string): Promise<boolean> {
  return Boolean(await fs.lstat(filename).catch(() => null));
}

/**
 * Check the app-managed upstream add-on without treating a renamed legacy
 * RenoDX backup as an active ReShade add-on.
 */
export async function konohamaruNeuralUpstreamRuntimeProblems(
  nodeDirectory: string
): Promise<string[]> {
  const problems: string[] = [];
  const addon = konohamaruNeuralUpstreamAddonPath(nodeDirectory);
  const legacy = legacyRenoDxAddonPath(nodeDirectory);
  const addonStat = await fs.lstat(addon).catch(() => null);
  if (!addonStat) {
    problems.push(`bin/runtime/host/${KONOHAMARU_NEURAL_UPSTREAM_ADDON}（缺失）`);
  } else if (!addonStat.isFile()) {
    problems.push(`bin/runtime/host/${KONOHAMARU_NEURAL_UPSTREAM_ADDON}（不是普通文件）`);
  } else if (addonStat.size === 0) {
    problems.push(`bin/runtime/host/${KONOHAMARU_NEURAL_UPSTREAM_ADDON}（空文件）`);
  } else {
    const digest = await sha256File(addon).catch(() => "");
    if (digest.toLowerCase() !== KONOHAMARU_NEURAL_UPSTREAM_SHA256) {
      problems.push(
        `bin/runtime/host/${KONOHAMARU_NEURAL_UPSTREAM_ADDON}（SHA-256=${digest || "未读取到"}）`
      );
    }
  }
  if (await lstatIsPresent(legacy)) {
    problems.push(
      `bin/runtime/host/${LEGACY_RENODX_ADDON}（旧 addon 仍处于 active host，不能与 neural-upstream 共存）`
    );
  }
  return problems;
}

function video2dlssnrRelativeFilename(filename: string): string {
  return `bin/runtime/video2dlssnr/${filename}`;
}

async function video2dlssnrRuntimeProblemsInDirectory(
  runtimeDirectory: string
): Promise<string[]> {
  const problems: string[] = [];
  for (const artifact of KONOHAMARU_VIDEO2DLSSNR_RUNTIME_ARTIFACTS) {
    const relativeFilename = video2dlssnrRelativeFilename(artifact.filename);
    const filename = path.join(runtimeDirectory, artifact.filename);
    const file = await fs.lstat(filename).catch(() => null);
    if (!file) {
      problems.push(`${relativeFilename}（缺失）`);
      continue;
    }
    if (!file.isFile()) {
      problems.push(`${relativeFilename}（不是普通文件）`);
      continue;
    }
    if (file.size !== artifact.bytes) {
      problems.push(`${relativeFilename}（bytes=${file.size}，要求 ${artifact.bytes}）`);
      continue;
    }
    const header = await fs.readFile(filename).then((bytes) => bytes.subarray(0, 160)).catch(() => null);
    if (!header || isGitLfsPointer(header)) {
      problems.push(`${relativeFilename}（Git LFS pointer 或不可读取）`);
    }
  }
  return problems;
}

export async function konohamaruVideo2dlssnrRuntimeProblems(
  nodeDirectory: string
): Promise<string[]> {
  return video2dlssnrRuntimeProblemsInDirectory(
    konohamaruVideo2dlssnrRuntimeDirectory(nodeDirectory)
  );
}

function isGitLfsPointer(bytes: Buffer): boolean {
  return bytes.toString("utf8").startsWith("version https://git-lfs.github.com/spec/v1");
}

async function downloadNeuralUpstreamAddon(
  destination: string,
  settings: Settings,
  comfyRoot: string,
  environment: NodeJS.ProcessEnv,
  deps: KonohamaruRuntimeInstallerDependencies,
  options: { signal?: AbortSignal; onLog?: (message: string) => void }
): Promise<void> {
  if (options.signal?.aborted) throw new Error("Konohamaru neural-upstream 安装已取消。");
  if (deps.downloadFile) {
    const finalUrl = await deps.downloadFile(
      KONOHAMARU_NEURAL_UPSTREAM_DOWNLOAD_URL,
      destination,
      settings,
      { comfyRoot, signal: options.signal, onLog: options.onLog }
    );
    if (typeof finalUrl === "string" && !isAllowedDownloadUrl(finalUrl)) {
      throw new Error(`neural-upstream 下载重定向到未允许的地址：${finalUrl}`);
    }
    return;
  }
  const curl = await deps.findExecutable("curl.exe");
  if (!curl) throw new Error("没有找到 curl，无法下载 neural-upstream DLSS5 addon。");
  const args = [
    "-fL",
    "--retry", "2",
    "--connect-timeout", "20",
    "--progress-bar",
    "--output", destination,
    KONOHAMARU_NEURAL_UPSTREAM_DOWNLOAD_URL,
    "--write-out", "\nLVS_FINAL_URL:%{url_effective}\n"
  ];
  if (settings.proxyEnabled && settings.proxyUrl.trim()) {
    args.splice(1, 0, "--proxy", settings.proxyUrl.trim());
  }
  const output = await deps.runLoggedProcess(curl, args, {
    env: environment,
    timeoutMs: 1_800_000,
    onLog: options.onLog,
    signal: options.signal
  });
  const finalUrl = output.match(/LVS_FINAL_URL:(https?:\/\/[^\s]+)/iu)?.[1] ?? "";
  if (!finalUrl || !isAllowedDownloadUrl(finalUrl)) {
    throw new Error(
      `neural-upstream 下载最终地址未通过 HTTPS/GitHub host allowlist 校验：${finalUrl || "未读取到"}`
    );
  }
  if (options.signal?.aborted) throw new Error("Konohamaru neural-upstream 安装已取消。");
}

async function downloadVideo2dlssnrArchive(
  destination: string,
  settings: Settings,
  comfyRoot: string,
  environment: NodeJS.ProcessEnv,
  deps: KonohamaruRuntimeInstallerDependencies,
  options: { signal?: AbortSignal; onLog?: (message: string) => void }
): Promise<void> {
  if (options.signal?.aborted) throw new Error("Konohamaru video2dlssnr 安装已取消。");
  if (deps.downloadFile) {
    const finalUrl = await deps.downloadFile(
      KONOHAMARU_VIDEO2DLSSNR_DOWNLOAD_URL,
      destination,
      settings,
      { comfyRoot, signal: options.signal, onLog: options.onLog }
    );
    if (typeof finalUrl === "string" && !isAllowedDownloadUrl(finalUrl)) {
      throw new Error(`video2dlssnr 下载重定向到未允许的地址：${finalUrl}`);
    }
    return;
  }
  const curl = await deps.findExecutable("curl.exe");
  if (!curl) throw new Error("没有找到 curl，无法下载 video2dlssnr runtime。");
  const args = [
    "-fL",
    "--retry", "2",
    "--connect-timeout", "20",
    "--progress-bar",
    "--output", destination,
    KONOHAMARU_VIDEO2DLSSNR_DOWNLOAD_URL,
    "--write-out", "\nLVS_FINAL_URL:%{url_effective}\n"
  ];
  if (settings.proxyEnabled && settings.proxyUrl.trim()) {
    args.splice(1, 0, "--proxy", settings.proxyUrl.trim());
  }
  const output = await deps.runLoggedProcess(curl, args, {
    env: environment,
    timeoutMs: 1_800_000,
    onLog: options.onLog,
    signal: options.signal
  });
  const finalUrl = output.match(/LVS_FINAL_URL:(https?:\/\/[^\s]+)/iu)?.[1] ?? "";
  if (!finalUrl || !isAllowedDownloadUrl(finalUrl)) {
    throw new Error(
      `video2dlssnr 下载最终地址未通过 HTTPS/GitHub host allowlist 校验：${finalUrl || "未读取到"}`
    );
  }
  if (options.signal?.aborted) throw new Error("Konohamaru video2dlssnr 安装已取消。");
}

async function restoreMovedFile(
  source: string | undefined,
  destination: string,
  deps: KonohamaruRuntimeInstallerDependencies
): Promise<void> {
  if (!source || !await lstatIsPresent(source)) return;
  if (await lstatIsPresent(destination)) return;
  await deps.renameWithRetry(source, destination).catch(() => undefined);
}

/**
 * Install the official neural-upstream ReShade add-on into Konohamaru's
 * existing host runtime. The operation is deliberately file-scoped and keeps
 * every replaced addon recoverable instead of deleting a user's runtime.
 */
export async function installKonohamaruNeuralUpstreamRuntime(
  settings: Settings,
  comfyRoot: string,
  nodeDirectory: string,
  deps: KonohamaruRuntimeInstallerDependencies,
  onLog?: (message: string) => void
): Promise<KonohamaruRuntimeOperationResult> {
  if ((deps.platform ?? process.platform) !== "win32") {
    return {
      ok: false,
      message: "Konohamaru neural-upstream runtime 当前只支持 Windows。"
    };
  }
  const host = hostDirectory(nodeDirectory);
  const addon = konohamaruNeuralUpstreamAddonPath(nodeDirectory);
  const legacy = legacyRenoDxAddonPath(nodeDirectory);
  const existingProblems = await konohamaruNeuralUpstreamRuntimeProblems(nodeDirectory);
  if (!existingProblems.length) {
    onLog?.(`neural-upstream ${KONOHAMARU_NEURAL_UPSTREAM_RELEASE} addon 已就绪（${KONOHAMARU_NEURAL_UPSTREAM_RUNTIME_BUNDLE_ID}）`);
    return {
      ok: true,
      message: `neural-upstream ${KONOHAMARU_NEURAL_UPSTREAM_RELEASE} runtime 已就绪。`
    };
  }

  await fs.mkdir(host, { recursive: true });
  const partial = `${addon}.${deps.randomId?.() ?? crypto.randomUUID()}.partial`;
  const environment = deps.downloadEnvironment(settings, comfyRoot);
  let previousAddon: string | undefined;
  let disabledLegacy: string | undefined;
  let installedAddon = false;
  try {
    onLog?.(`正在下载 neural-upstream ${KONOHAMARU_NEURAL_UPSTREAM_RELEASE} addon……`);
    await downloadNeuralUpstreamAddon(partial, settings, comfyRoot, environment, deps, { onLog });
    const digest = await sha256File(partial);
    if (digest.toLowerCase() !== KONOHAMARU_NEURAL_UPSTREAM_SHA256) {
      throw new Error(
        `neural-upstream addon SHA-256 校验失败：${digest}，要求 ${KONOHAMARU_NEURAL_UPSTREAM_SHA256}`
      );
    }
    const partialStat = await fs.stat(partial);
    if (!partialStat.isFile() || partialStat.size === 0) {
      throw new Error("neural-upstream addon 下载结果为空，已拒绝安装。");
    }

    if (await lstatIsPresent(addon)) {
      previousAddon = `${addon}.previous-${Date.now()}`;
      await deps.renameWithRetry(addon, previousAddon);
      onLog?.(`已保留旧 neural-upstream addon 备份：${path.basename(previousAddon)}`);
    }
    if (await lstatIsPresent(legacy)) {
      disabledLegacy = `${legacy}${DISABLED_RENODX_SUFFIX}-${Date.now()}`;
      await deps.renameWithRetry(legacy, disabledLegacy);
      onLog?.(`已将旧 RenoDX addon 隔离为：${path.basename(disabledLegacy)}`);
    }
    await deps.renameWithRetry(partial, addon);
    installedAddon = true;
    const finalProblems = await konohamaruNeuralUpstreamRuntimeProblems(nodeDirectory);
    if (finalProblems.length) {
      throw new Error(`neural-upstream runtime 安装后复检失败：${finalProblems.join("、")}`);
    }
    onLog?.(`neural-upstream ${KONOHAMARU_NEURAL_UPSTREAM_RELEASE} addon 已安装并通过 SHA-256 复检`);
    return {
      ok: true,
      message: `neural-upstream ${KONOHAMARU_NEURAL_UPSTREAM_RELEASE} runtime 已安装并通过复检。`
    };
  } catch (error) {
    if (installedAddon && await lstatIsPresent(addon)) {
      await fs.rm(addon, { force: true }).catch(() => undefined);
    }
    await restoreMovedFile(previousAddon, addon, deps);
    await restoreMovedFile(disabledLegacy, legacy, deps);
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    };
  } finally {
    await fs.rm(partial, { force: true }).catch(() => undefined);
  }
}
const VIDEO2DLSSNR_ZIP_EXTRACT_SCRIPT = String.raw`import json
import pathlib
import stat
import sys
import zipfile
from pathlib import PurePosixPath

archive = pathlib.Path(sys.argv[1])
destination = pathlib.Path(sys.argv[2])
expected = json.loads(sys.argv[3])

with zipfile.ZipFile(archive) as bundle:
    infos = bundle.infolist()
    names = [info.filename for info in infos]
    for info in infos:
        normalized = info.filename.replace("\\", "/")
        parts = PurePosixPath(normalized).parts
        if (
            not normalized
            or normalized.startswith("/")
            or (parts and len(parts[0]) == 2 and parts[0][1] == ":")
            or any(part in ("", ".", "..") for part in parts)
            or stat.S_ISLNK((info.external_attr >> 16) & 0o170000)
        ):
            raise RuntimeError(f"unsafe archive path: {info.filename!r}")
    available = set(names)
    for item in expected:
        member = str(item["archiveMember"])
        filename = str(item["filename"])
        output_parts = PurePosixPath(filename.replace("\\", "/")).parts
        if len(output_parts) != 1 or output_parts[0] != filename:
            raise RuntimeError(f"unsafe output filename: {filename!r}")
        if member not in available:
            raise RuntimeError(f"missing archive member: {member}")
        data = bundle.read(member)
        expected_bytes = int(item["bytes"])
        if len(data) != expected_bytes:
            raise RuntimeError(
                f"archive member {member} has {len(data)} bytes; expected {expected_bytes}"
            )
        target = destination / filename
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

print(json.dumps(names, ensure_ascii=False))
`;

async function extractVideo2dlssnrArchive(
  archive: string,
  destination: string,
  python: string,
  environment: NodeJS.ProcessEnv,
  deps: KonohamaruRuntimeInstallerDependencies,
  onLog?: (message: string) => void,
  signal?: AbortSignal
): Promise<void> {
  if (deps.extractArchive) {
    await deps.extractArchive(
      archive,
      destination,
      python,
      environment,
      KONOHAMARU_VIDEO2DLSSNR_RUNTIME_ARTIFACTS,
      { signal, onLog }
    );
    return;
  }
  await deps.runLoggedProcess(
    python,
    [
      "-c",
      VIDEO2DLSSNR_ZIP_EXTRACT_SCRIPT,
      archive,
      destination,
      JSON.stringify(KONOHAMARU_VIDEO2DLSSNR_RUNTIME_ARTIFACTS)
    ],
    { env: environment, timeoutMs: 600_000, onLog, signal }
  );
}

async function removeVideo2dlssnrPath(filename: string): Promise<void> {
  const entry = await fs.lstat(filename).catch(() => null);
  if (!entry) return;
  if (entry.isDirectory() && !entry.isSymbolicLink()) {
    await removeDirectoryTreeWithoutAsar(filename);
    return;
  }
  await fs.unlink(filename);
}

/**
 * Install the official video2dlssnr temporal feature-18 backend. Only the
 * four files used by the raw-frame protocol are promoted; the archive's
 * bundled FFmpeg is intentionally not copied because the node already owns
 * the app-selected FFmpeg/FFprobe pair.
 */
export async function installKonohamaruVideo2dlssnrRuntime(
  settings: Settings,
  comfyRoot: string,
  nodeDirectory: string,
  deps: KonohamaruRuntimeInstallerDependencies,
  onLog?: (message: string) => void
): Promise<KonohamaruRuntimeOperationResult> {
  if ((deps.platform ?? process.platform) !== "win32") {
    return {
      ok: false,
      message: "Konohamaru video2dlssnr runtime 当前只支持 Windows。"
    };
  }
  const existingProblems = await konohamaruVideo2dlssnrRuntimeProblems(nodeDirectory);
  if (!existingProblems.length) {
    onLog?.(`video2dlssnr ${KONOHAMARU_VIDEO2DLSSNR_RELEASE} runtime 已就绪（${KONOHAMARU_VIDEO2DLSSNR_RUNTIME_BUNDLE_ID}）`);
    return {
      ok: true,
      message: `video2dlssnr ${KONOHAMARU_VIDEO2DLSSNR_RELEASE} runtime 已就绪。`
    };
  }

  const token = (deps.randomId?.() ?? crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/gu, "-");
  const stagingRoot = path.join(nodeDirectory, `${VIDEO2DLSSNR_STAGING_PREFIX}${token}`);
  const partialArchive = path.join(
    stagingRoot,
    "downloads",
    `${KONOHAMARU_VIDEO2DLSSNR_ARCHIVE}.partial`
  );
  const archive = path.join(
    stagingRoot,
    "downloads",
    KONOHAMARU_VIDEO2DLSSNR_ARCHIVE
  );
  const stagedRuntime = path.join(stagingRoot, "runtime");
  const runtimeDirectory = konohamaruVideo2dlssnrRuntimeDirectory(nodeDirectory);
  const backupDirectory = path.join(
    nodeDirectory,
    "bin",
    "runtime",
    VIDEO2DLSSNR_BACKUP_DIRECTORY
  );
  const backup = path.join(backupDirectory, `${Date.now()}-${token}`);
  const log: string[] = [];
  const report = (message: string) => {
    const normalized = message.trim();
    if (!normalized) return;
    log.push(normalized);
    onLog?.(normalized);
  };
  const environment = deps.downloadEnvironment(settings, comfyRoot);
  let movedExisting = false;
  let promoted = false;
  try {
    await removeDirectoryTreeWithoutAsar(stagingRoot).catch(() => undefined);
    await fs.mkdir(path.join(stagingRoot, "downloads"), { recursive: true });
    await fs.mkdir(stagedRuntime, { recursive: true });
    report(`正在下载 video2dlssnr ${KONOHAMARU_VIDEO2DLSSNR_RELEASE} runtime……`);
    await downloadVideo2dlssnrArchive(
      partialArchive,
      settings,
      comfyRoot,
      environment,
      deps,
      { onLog: report }
    );
    const archiveStat = await fs.stat(partialArchive);
    if (!archiveStat.isFile() || archiveStat.size !== KONOHAMARU_VIDEO2DLSSNR_ARCHIVE_BYTES) {
      throw new Error(
        `video2dlssnr 归档大小校验失败：实际 ${archiveStat.size} bytes，要求 ${KONOHAMARU_VIDEO2DLSSNR_ARCHIVE_BYTES}。`
      );
    }
    const digest = await sha256File(partialArchive);
    if (digest.toLowerCase() !== KONOHAMARU_VIDEO2DLSSNR_ARCHIVE_SHA256) {
      throw new Error(
        `video2dlssnr 归档 SHA-256 校验失败：实际 ${digest}，要求 ${KONOHAMARU_VIDEO2DLSSNR_ARCHIVE_SHA256}。`
      );
    }
    await deps.renameWithRetry(partialArchive, archive);
    report(`video2dlssnr 归档已校验：${digest}`);

    const python = deps.findComfyPython
      ? await deps.findComfyPython(settings, comfyRoot)
      : await deps.findExecutable("python.exe");
    if (!python) throw new Error("没有找到当前 ComfyUI Python，无法安全解压 video2dlssnr runtime。");
    report("使用当前 ComfyUI Python 仅解压 video2dlssnr 所需的四个 runtime 文件……");
    await extractVideo2dlssnrArchive(
      archive,
      stagedRuntime,
      python,
      environment,
      deps,
      report
    );
    const stagedProblems = await video2dlssnrRuntimeProblemsInDirectory(stagedRuntime);
    if (stagedProblems.length) {
      throw new Error(`video2dlssnr 暂存 runtime 复检失败：${stagedProblems.join("、")}`);
    }
    await fs.writeFile(
      path.join(stagedRuntime, "install-manifest.json"),
      JSON.stringify({
        schemaVersion: 1,
        bundleId: KONOHAMARU_VIDEO2DLSSNR_RUNTIME_BUNDLE_ID,
        nodeRevision: KONOHAMARU_NODE_REVISION,
        release: KONOHAMARU_VIDEO2DLSSNR_RELEASE,
        archive: {
          name: KONOHAMARU_VIDEO2DLSSNR_ARCHIVE,
          bytes: KONOHAMARU_VIDEO2DLSSNR_ARCHIVE_BYTES,
          sha256: KONOHAMARU_VIDEO2DLSSNR_ARCHIVE_SHA256,
          url: KONOHAMARU_VIDEO2DLSSNR_DOWNLOAD_URL
        },
        installedAt: new Date().toISOString(),
        ownedFiles: KONOHAMARU_VIDEO2DLSSNR_RUNTIME_FILES
      }, null, 2),
      "utf8"
    );

    if (await lstatIsPresent(runtimeDirectory)) {
      await fs.mkdir(backupDirectory, { recursive: true });
      await deps.renameWithRetry(runtimeDirectory, backup);
      movedExisting = true;
      report(`已保留旧 video2dlssnr runtime 备份：${path.basename(backup)}`);
    }
    await deps.renameWithRetry(stagedRuntime, runtimeDirectory);
    promoted = true;
    const finalProblems = await konohamaruVideo2dlssnrRuntimeProblems(nodeDirectory);
    if (finalProblems.length) {
      throw new Error(`video2dlssnr runtime 安装后复检失败：${finalProblems.join("、")}`);
    }
    report(`video2dlssnr ${KONOHAMARU_VIDEO2DLSSNR_RELEASE} runtime 已安装并通过完整性复检`);
    return {
      ok: true,
      message: `video2dlssnr ${KONOHAMARU_VIDEO2DLSSNR_RELEASE} runtime 已安装并通过完整性复检。`,
      log: log.join("\n")
    };
  } catch (error) {
    if (promoted) await removeVideo2dlssnrPath(runtimeDirectory).catch(() => undefined);
    if (movedExisting) await restoreMovedFile(backup, runtimeDirectory, deps);
    const message = error instanceof Error ? error.message : String(error);
    report(message);
    return { ok: false, message, log: log.join("\n") };
  } finally {
    await removeDirectoryTreeWithoutAsar(stagingRoot).catch(() => undefined);
  }
}
