import { promises as fs } from "node:fs";
import path from "node:path";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";

/** Only an explicitly selected child of an installation workspace, never the workspace itself. */
export async function removeSoftwareArtifact(parent: string, target: string, log: (message: string) => void,
  removeDirectory?: (directory: string) => Promise<void>): Promise<boolean> {
  try {
    const root = await fs.realpath(parent), absolute = path.resolve(target);
    const relative = path.relative(path.resolve(parent), absolute);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("清理目标超出安装目录");
    const stat = await fs.lstat(absolute).catch(error => { if (error.code === "ENOENT") return null; throw error; });
    if (!stat) return true;
    const actual = await fs.realpath(absolute), physicalRelative = path.relative(root, actual);
    if (stat.isSymbolicLink() || !physicalRelative || physicalRelative === ".." || physicalRelative.startsWith(`..${path.sep}`) || path.isAbsolute(physicalRelative)) throw new Error("清理目标包含重定向路径");
    if (stat.isDirectory() && removeDirectory) await removeDirectory(absolute);
    else await fs.rm(absolute, { recursive: stat.isDirectory(), force: false, maxRetries: 3, retryDelay: 200 });
    log(`已清理旧软件／临时文件：${absolute}`);
    return true;
  } catch (error) {
    log(`软件清理未完成：${target}；${error instanceof Error ? error.message : String(error)}。新版保持可用，请解除文件占用后重试更新。`);
    return false;
  }
}

/** Keep local weights/media/configuration, not a second copy of downloadable source code. */
export async function preserveSoftwareUserData(source: string, destination: string, softwareDirectories: readonly string[] = [], ownedFiles?: readonly string[], downloadableFiles: readonly string[] = []): Promise<void> {
  for (const root of [source, destination]) if ((await fs.lstat(root)).isSymbolicLink()) throw new Error(`软件目录含链接，请先移出再更新：${root}`);
  const extensions = /\.(?:gguf|safetensors|ckpt|pt|pth|bin|onnx|sqlite3?|db|png|jpe?g|webp|gif|mp4|mov|wav|mp3|flac)$/iu;
  const configuration = /(?:^|[\\/])(?:config|settings|user|presets?|workflows?|credentials?|secrets?|api[-_]?keys?)(?:[.\\/_-]|$)/iu;
  const visit = async (directory: string, relative = "") => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if ([".git", ".venv", "__pycache__", "node_modules"].includes(entry.name)) continue;
      const name = path.join(relative, entry.name), from = path.join(source, name), to = path.join(destination, name);
      if (softwareDirectories.some(directory => name.replaceAll("\\", "/") === directory)) continue;
      if (downloadableFiles.includes(name.replaceAll("\\", "/"))) continue;
      if (entry.isSymbolicLink()) throw new Error(`软件目录含链接，请先移出再更新：${from}`);
      if (entry.isDirectory()) { await visit(from, name); continue; }
      if (ownedFiles ? ownedFiles.includes(name.replaceAll("\\", "/")) : !extensions.test(name) && !/^\.env(?:\..+)?$/u.test(entry.name) && !(configuration.test(name) && /\.(?:json|ya?ml|toml|ini|cfg)$/iu.test(name))) continue;
      let parent = destination;
      for (const component of path.dirname(name).split(path.sep).filter(part => part !== ".")) {
        parent = path.join(parent, component);
        const stat = await fs.lstat(parent).catch(error => { if (error.code === "ENOENT") return null; throw error; });
        if (stat?.isSymbolicLink()) throw new Error(`目标目录含链接，请先移出再更新：${parent}`);
      }
      const existing = await fs.lstat(to).catch(error => { if (error.code === "ENOENT") return null; throw error; });
      // Never silently discard a local configuration/weight when the new package has the same name.
      if (existing) {
        const digest = async (file: string) => { const hash = createHash("sha256"); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest("hex"); };
        if (existing.isSymbolicLink() || !existing.isFile() || existing.size !== (await fs.stat(from)).size || await digest(from) !== await digest(to))
          throw new Error(`更新包与本地数据同名，请先将数据移到共享模型／用户目录：${from}`);
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
  accepts: (value: unknown) => boolean, current: string, log: (message: string) => void) {
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
      await preserveSoftwareUserData(candidate, current, [], [...receipt.ownedFiles, manifestName]);
      await removeSoftwareArtifact(parent, candidate, log);
    } catch (error) { log(`旧软件副本未清理：${candidate}；${String(error)}`); }
  }
  } catch (error) { log(`软件备份清理未完成：${backupRoot}；${String(error)}`); }
}
