import { readFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { STRATA_RELEASES } from "../../src/core/catalog/dependencies/strata.js";
import { STRATA_DSV41_SOURCE_DIRECTORY, STRATA_DSV41_SOURCE_REVISION, STRATA_DSV41_SOURCE_VERSION } from "../../src/core/catalog/dependencies/strata-deepseek.js";
import { fetchStrataSource } from "./strata-source-fetch.js";
import { gitSoftwareFiles } from "./software-git-files.js";
import { checkInstallationCancelled } from "./installation-cancellation.js";
import type { Translate } from "../../src/core/i18n.js";

/** Old installations use their own source; new Qwen source no longer imports DeepSeek. */
export function deepSeekSourceDirectory(install: string): string {
  try {
    const receipt = JSON.parse(readFileSync(path.join(install, "lvs-strata-install.json"), "utf8"));
    const release = STRATA_RELEASES.find(item => item.revision === receipt.revision);
    if (release && "separateDeepSeekSource" in release && release.separateDeepSeekSource)
      return path.join(install, STRATA_DSV41_SOURCE_DIRECTORY);
  } catch { /* Installation validation reports an absent/untrusted receipt. */ }
  return install;
}

/** Only fixed, tracked compatibility software is disposable; untracked user files remain protected. */
export async function deepSeekSourceSoftwareFiles(install: string): Promise<string[]> {
  const files = await gitSoftwareFiles(path.join(install, STRATA_DSV41_SOURCE_DIRECTORY),
    { repository: "https://github.com/Niko1221/Strata", revision: STRATA_DSV41_SOURCE_REVISION });
  return [...files].map(name => `${STRATA_DSV41_SOURCE_DIRECTORY}/${name}`);
}

/** Part of the existing update transaction: source only, shared venv, no engine or model execution. */
export async function installDeepSeekSource(install: string,
  run: (executable: string, args: string[], cwd: string, timeoutMs?: number) => Promise<string>,
  log: (message: string) => void, t: Translate): Promise<void> {
  const root = path.join(install, STRATA_DSV41_SOURCE_DIRECTORY);
  log(`DeepSeek compatibility source ${STRATA_DSV41_SOURCE_VERSION} · ${STRATA_DSV41_SOURCE_REVISION}`);
  await fs.mkdir(root);
  await run("git.exe", ["init", root], root);
  await run("git.exe", ["remote", "add", "origin", "https://github.com/Niko1221/Strata.git"], root);
  await run("git.exe", ["config", "core.longpaths", "true"], root);
  await run("git.exe", ["config", "http.version", "HTTP/1.1"], root);
  await run("git.exe", ["sparse-checkout", "init", "--cone"], root);
  await run("git.exe", ["sparse-checkout", "set", "serve", "tools", "strata_control", "data", "third_party/project-maya"], root);
  await fetchStrataSource(root, ["--depth=1", "--filter=blob:none", "origin", STRATA_DSV41_SOURCE_REVISION], run, log, t);
  await run("git.exe", ["checkout", "--detach", "FETCH_HEAD"], root);
  if ((await run("git.exe", ["rev-parse", "HEAD"], root)).trim() !== STRATA_DSV41_SOURCE_REVISION)
    throw new Error("DeepSeek compatibility source: revision mismatch");
  for (const relative of ["serve/server.py", "serve/ds_pictures.py", "serve/frontend.py", "tools/dsv41/pack_gguf.py", "data/dsv41/profile-2.00.bin"]) {
    checkInstallationCancelled();
    if (!(await fs.stat(path.join(root, relative)).catch(() => null))?.size)
      throw new Error(`DeepSeek compatibility source: missing ${relative}`);
  }
}
