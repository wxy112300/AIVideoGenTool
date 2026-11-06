import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import type { Settings } from "../../src/types.js";
import { STRATA_DSV41_BYTES, STRATA_DSV41_FILES, STRATA_DSV41_MANIFEST_SHA256, STRATA_DSV41_PREVIOUS_MANIFEST_SHA256, STRATA_DSV41_SHA256, STRATA_DSV41_URL, STRATA_DSV41_VERSION } from "../../src/core/catalog/dependencies/strata-deepseek.js";
import { checkInstallationCancelled } from "./installation-cancellation.js";

export const deepSeekEngineDirectory = (install: string) => path.join(install, "engine-dsv41");
export async function hasDeepSeekEngine(install: string, includePrevious = false): Promise<boolean> {
  const root = deepSeekEngineDirectory(install);
  try {
    const manifest = await fs.readFile(path.join(root, "engine-component.json"));
    const accepted: readonly string[] = includePrevious ? [STRATA_DSV41_MANIFEST_SHA256, ...STRATA_DSV41_PREVIOUS_MANIFEST_SHA256] : [STRATA_DSV41_MANIFEST_SHA256];
    return accepted.includes(createHash("sha256").update(manifest).digest("hex"))
      && (await Promise.all(STRATA_DSV41_FILES.map(file => fs.stat(path.join(root, file)).then(stat => stat.isFile() && stat.size > 0)))).every(Boolean);
  } catch { return false; }
}

/** Called inside the existing software replacement transaction; never downloads model weights. */
export async function installDeepSeekEngine(install: string, settings: Settings, runtime: {
  download(url: string, destination: string, settings: Settings, onProgress?: (bytes: number) => void, onLog?: (message: string) => void, totalBytes?: number): Promise<void>;
  run(executable: string, args: string[], options: { cwd?: string; timeoutMs?: number; onLog?: (message: string) => void }): Promise<string>;
}, log: (message: string) => void, progress?: (bytes: number) => void): Promise<void> {
  const root = deepSeekEngineDirectory(install);
  const archive = path.join(install, "strata-dsv41.tar.gz");
  log(`DeepSeek engine ${STRATA_DSV41_VERSION} · ${(STRATA_DSV41_BYTES / 1e6).toFixed(1)} MB`);
  await runtime.download(STRATA_DSV41_URL, archive, settings, progress, log, STRATA_DSV41_BYTES);
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(archive)) { checkInstallationCancelled(); digest.update(chunk); }
  if ((await fs.stat(archive)).size !== STRATA_DSV41_BYTES || digest.digest("hex") !== STRATA_DSV41_SHA256) throw new Error("DeepSeek engine: SHA-256 / size mismatch");
  await fs.mkdir(root, { recursive: true });
  await runtime.run("tar.exe", ["-xzf", archive, "-C", root], { cwd: install, onLog: log });
  if (!await hasDeepSeekEngine(install)) throw new Error("DeepSeek engine: incomplete package / manifest mismatch");
  await runtime.run(path.join(install, ".venv", "Scripts", "python.exe"), ["-B", "-c",
    `from pathlib import Path; from strata_control import signing,engine_component as ec; signing.install_component_verifier(signing.load_trusted_keys()); c=ec.read_manifest(Path('engine-dsv41')); assert c.entrypoint=='strata-dsv41.exe' and c.version=='${STRATA_DSV41_VERSION}' and c.platform=='windows-x86_64' and c.backend=='cuda'; ec.verify_signature(c,{ec.ENV_REQUIRE_SIGNED:'1'}); ec.verify(c,full=True)`],
  { cwd: install, timeoutMs: 120_000, onLog: log });
  checkInstallationCancelled();
  await fs.unlink(archive);
}
