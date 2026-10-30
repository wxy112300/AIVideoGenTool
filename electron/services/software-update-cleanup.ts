import { createNativeTranslator } from "../ui-translator.js";
import type { Translate } from "../../src/core/i18n.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";

/** Only an explicitly selected child of an installation workspace, never the workspace itself. */
export async function removeSoftwareArtifact(parent: string, target: string, log: (message: string) => void,
  removeDirectory?: (directory: string) => Promise<void>, t: Translate = createNativeTranslator(undefined).t): Promise<boolean> {
  try {
    const root = await fs.realpath(parent), absolute = path.resolve(target);
    const relative = path.relative(path.resolve(parent), absolute);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(t(uiKeys.softwareCleanup.outside));
    const stat = await fs.lstat(absolute).catch(error => { if (error.code === "ENOENT") return null; throw error; });
    if (!stat) return true;
    const actual = await fs.realpath(absolute), physicalRelative = path.relative(root, actual);
    if (stat.isSymbolicLink() || !physicalRelative || physicalRelative === ".." || physicalRelative.startsWith(`..${path.sep}`) || path.isAbsolute(physicalRelative)) throw new Error(t(uiKeys.softwareCleanup.redirected));
    if (stat.isDirectory() && removeDirectory) await removeDirectory(absolute);
    else await fs.rm(absolute, { recursive: stat.isDirectory(), force: false, maxRetries: 3, retryDelay: 200 });
    log(t(uiKeys.softwareCleanup.removed, { path: absolute }));
    return true;
  } catch (error) {
    log(t(uiKeys.softwareCleanup.failed, { path: target, reason: error instanceof Error ? error.message : String(error) }));
    return false;
  }
}

/** Keep local weights/media/configuration, not a second copy of downloadable source code. */
export async function preserveSoftwareUserData(source: string, destination: string, softwareDirectories: readonly string[] = [], ownedFiles?: readonly string[], downloadableFiles: readonly string[] = [], t: Translate = createNativeTranslator(undefined).t): Promise<void> {
  for (const root of [source, destination]) if ((await fs.lstat(root)).isSymbolicLink()) throw new Error(t(uiKeys.softwareCleanup.sourceLink, { path: root }));
  const extensions = /\.(?:gguf|safetensors|ckpt|pt|pth|bin|onnx|sqlite3?|db|png|jpe?g|webp|gif|mp4|mov|wav|mp3|flac)$/iu;
  const configuration = /(?:^|[\\/])(?:config|settings|user|presets?|workflows?|credentials?|secrets?|api[-_]?keys?)(?:[.\\/_-]|$)/iu;
  const visit = async (directory: string, relative = "") => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if ([".git", ".venv", "__pycache__", "node_modules"].includes(entry.name)) continue;
      const name = path.join(relative, entry.name), from = path.join(source, name), to = path.join(destination, name);
      if (softwareDirectories.some(directory => name.replaceAll("\\", "/") === directory)) continue;
      if (downloadableFiles.includes(name.replaceAll("\\", "/"))) continue;
      if (entry.isSymbolicLink()) throw new Error(t(uiKeys.softwareCleanup.sourceLink, { path: from }));
      if (entry.isDirectory()) { await visit(from, name); continue; }
      if (ownedFiles ? ownedFiles.includes(name.replaceAll("\\", "/")) : !extensions.test(name) && !/^\.env(?:\..+)?$/u.test(entry.name) && !(configuration.test(name) && /\.(?:json|ya?ml|toml|ini|cfg)$/iu.test(name))) continue;
      let parent = destination;
      for (const component of path.dirname(name).split(path.sep).filter(part => part !== ".")) {
        parent = path.join(parent, component);
        const stat = await fs.lstat(parent).catch(error => { if (error.code === "ENOENT") return null; throw error; });
        if (stat?.isSymbolicLink()) throw new Error(t(uiKeys.softwareCleanup.targetLink, { path: parent }));
      }
      const existing = await fs.lstat(to).catch(error => { if (error.code === "ENOENT") return null; throw error; });
      // Never silently discard a local configuration/weight when the new package has the same name.
      if (existing) {
        const digest = async (file: string) => { const hash = createHash("sha256"); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest("hex"); };
        if (existing.isSymbolicLink() || !existing.isFile() || existing.size !== (await fs.stat(from)).size || await digest(from) !== await digest(to))
          throw new Error(t(uiKeys.softwareCleanup.dataConflict, { path: from }));
        continue;
      }
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.copyFile(from, to, 1);
    }
  };
  await visit(source);
}

/** Collect older app-created runtime copies after the selected replacement is verified. */
export async function cleanupManifestSoftwareBackups(parent: string, backupRoot: string, manifestName: string,
  accepts: (value: unknown) => boolean, current: string, log: (message: string) => void, t: Translate = createNativeTranslator(undefined).t) {
  try {
  const stat = await fs.lstat(backupRoot).catch(() => null);
  if (!stat?.isDirectory() || stat.isSymbolicLink()) return;
  const relative = path.relative(await fs.realpath(parent), await fs.realpath(backupRoot));
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return;
  for (const entry of await fs.readdir(backupRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !/^\d+-[a-z0-9_-]+$/iu.test(entry.name)) continue;
    const candidate = path.join(backupRoot, entry.name);
    try {
      const manifest = path.join(candidate, manifestName), file = await fs.lstat(manifest);
      if (!file.isFile() || file.isSymbolicLink() || file.size > 1024 * 1024) continue;
      const receipt = JSON.parse(await fs.readFile(manifest, "utf8"));
      if (!accepts(receipt) || !Array.isArray(receipt.ownedFiles) || !receipt.ownedFiles.every((name: unknown) => typeof name === "string")) continue;
      await preserveSoftwareUserData(candidate, current, [], [...receipt.ownedFiles, manifestName], undefined, t);
      await removeSoftwareArtifact(parent, candidate, log, undefined, t);
    } catch (error) { log(t(uiKeys.softwareCleanup.copyRetained, { path: candidate, reason: String(error) })); }
  }
  } catch (error) { log(t(uiKeys.softwareCleanup.backupRetained, { path: backupRoot, reason: String(error) })); }
}
