import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import type { Translate } from "../../src/core/i18n.js";
import type { Settings } from "../../src/types.js";
import { STRATA_DSV41_BYTES, STRATA_DSV41_FILES, STRATA_DSV41_MANIFEST_SHA256, STRATA_DSV41_PREVIOUS_MANIFEST_SHA256, STRATA_DSV41_SHA256, STRATA_DSV41_SOURCE_REVISION, STRATA_DSV41_URL, STRATA_DSV41_VERSION } from "../../src/core/catalog/dependencies/strata-deepseek.js";
import { createNativeTranslator } from "../ui-translator.js";
import { checkInstallationCancelled } from "./installation-cancellation.js";
import { removeSoftwareArtifact } from "./software-update-cleanup.js";
import { deepSeekSourceDirectory } from "./strata-deepseek-source.js";
import { prepareStrataDownloadCache } from "./strata-download-cache.js";

export const deepSeekEngineDirectory = (install: string) => path.join(install, "engine-dsv41");
export async function deepSeekEngineIssue(install: string, includePrevious = true): Promise<string | null> {
  const root = deepSeekEngineDirectory(install);
  const manifestPath = path.join(root, "engine-component.json");
  let checking = manifestPath;
  try {
    const manifest = await fs.readFile(manifestPath);
    const accepted: readonly string[] = includePrevious ? [STRATA_DSV41_MANIFEST_SHA256, ...STRATA_DSV41_PREVIOUS_MANIFEST_SHA256] : [STRATA_DSV41_MANIFEST_SHA256];
    const digest = createHash("sha256").update(manifest).digest("hex");
    if (!accepted.includes(digest)) return `${manifestPath} (manifest SHA-256: ${digest}; expected: ${STRATA_DSV41_MANIFEST_SHA256})`;
    for (const file of STRATA_DSV41_FILES) {
      checking = path.join(root, file);
      const stat = await fs.stat(checking);
      if (!stat.isFile() || !stat.size) return `${checking} (empty or not a file)`;
    }
    return null;
  } catch (error) { return `${checking} (${(error as NodeJS.ErrnoException).code ?? String(error)})`; }
}
export async function hasDeepSeekEngine(install: string, includePrevious = true): Promise<boolean> {
  return await deepSeekEngineIssue(install, includePrevious) === null;
}

type DeepSeekInstallRuntime = {
  download(url: string, destination: string, settings: Settings, onProgress?: (bytes: number) => void, onLog?: (message: string) => void, totalBytes?: number): Promise<void>;
  run(executable: string, args: string[], options: { cwd?: string; timeoutMs?: number; onLog?: (message: string) => void }): Promise<string>;
};

async function verifyInstalledDeepSeekEngine(install: string, runtime: Pick<DeepSeekInstallRuntime, "run">, log: (message: string) => void): Promise<void> {
  const root = deepSeekEngineDirectory(install);
  if (!await hasDeepSeekEngine(install, false)) throw new Error("DeepSeek engine: incomplete package / manifest mismatch");
  await runtime.run(path.join(install, ".venv", "Scripts", "python.exe"), ["-B", "-c",
    `import sys; from pathlib import Path; from strata_control import signing,engine_component as ec; signing.install_component_verifier(signing.load_trusted_keys()); c=ec.read_manifest(Path(sys.argv[1])); assert c.entrypoint=='strata-dsv41.exe' and c.version=='${STRATA_DSV41_VERSION}' and c.platform=='windows-x86_64' and c.backend=='cuda'; ec.verify_signature(c,{ec.ENV_REQUIRE_SIGNED:'1'}); ec.verify(c,full=True)`, root],
  { cwd: deepSeekSourceDirectory(install), timeoutMs: 120_000, onLog: log });
}

async function tryReuseVerifiedDeepSeekEngine(
  install: string, sourceInstall: string, runtime: Pick<DeepSeekInstallRuntime, "run">, log: (message: string) => void
): Promise<boolean> {
  if (!await hasDeepSeekEngine(sourceInstall, false)) return false;
  const sourceRoot = deepSeekEngineDirectory(sourceInstall);
  const targetRoot = deepSeekEngineDirectory(install);
  try {
    const sourceStat = await fs.lstat(sourceRoot);
    if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) return false;
    await fs.mkdir(targetRoot, { recursive: true });
    for (const file of STRATA_DSV41_FILES) {
      checkInstallationCancelled();
      const sourceFile = path.join(sourceRoot, file);
      const stat = await fs.lstat(sourceFile);
      if (!stat.isFile() || stat.isSymbolicLink() || !stat.size) throw new Error(`DeepSeek engine: invalid local file ${file}`);
      await fs.copyFile(sourceFile, path.join(targetRoot, file));
    }
    await verifyInstalledDeepSeekEngine(install, runtime, log);
    log(`DeepSeek engine ${STRATA_DSV41_VERSION} · reused verified local component`);
    return true;
  } catch (error) {
    checkInstallationCancelled();
    await fs.rm(targetRoot, { recursive: true, force: true }).catch(() => undefined);
    log(`DeepSeek engine ${STRATA_DSV41_VERSION} · local copy verification failed, downloading fresh package (${error instanceof Error ? error.message : String(error)})`);
    return false;
  }
}

/** Called inside the existing software replacement transaction; never downloads model weights. */
export async function installDeepSeekEngine(
  install: string, settings: Settings, runtime: DeepSeekInstallRuntime,
  log: (message: string) => void, progress?: (bytes: number) => void,
  options: { reuseFrom?: string; t?: Translate } = {}
): Promise<void> {
  const t = options.t ?? createNativeTranslator(settings.uiLocale).t;
  if (options.reuseFrom && await tryReuseVerifiedDeepSeekEngine(install, options.reuseFrom, runtime, log)) {
    progress?.(STRATA_DSV41_BYTES);
    return;
  }
  const root = deepSeekEngineDirectory(install);
  const parent = path.dirname(install);
  const archive = await prepareStrataDownloadCache(parent, {
    run: (exe, args, cwd, timeoutMs) => runtime.run(exe, args, { cwd, timeoutMs, onLog: log }), log
  }, { url: STRATA_DSV41_URL, bytes: STRATA_DSV41_BYTES, sha256: STRATA_DSV41_SHA256, revision: STRATA_DSV41_SOURCE_REVISION }, t);
  log(`DeepSeek engine ${STRATA_DSV41_VERSION} · ${(STRATA_DSV41_BYTES / 1e6).toFixed(1)} MB`);
  await runtime.download(STRATA_DSV41_URL, archive, settings, progress, log, STRATA_DSV41_BYTES);
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(archive)) { checkInstallationCancelled(); digest.update(chunk); }
  if ((await fs.stat(archive)).size !== STRATA_DSV41_BYTES || digest.digest("hex") !== STRATA_DSV41_SHA256) {
    await removeSoftwareArtifact(parent, archive, log, undefined, t).catch(() => undefined);
    throw new Error("DeepSeek engine: SHA-256 / size mismatch");
  }
  await fs.mkdir(root, { recursive: true });
  await runtime.run("tar.exe", ["-xzf", archive, "-C", root], { cwd: install, onLog: log });
  await verifyInstalledDeepSeekEngine(install, runtime, log);
  checkInstallationCancelled();
  await fs.unlink(archive).catch(() => undefined);
}
