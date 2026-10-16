import { promises as fs, constants } from "node:fs";
import path from "node:path";
import { STRATA_ENGINE_BYTES, STRATA_ENGINE_SHA256, STRATA_ENGINE_URL, STRATA_REVISION } from "../../src/core/catalog/dependencies/strata.js";
import { checkInstallationCancelled } from "./installation-cancellation.js";

const asset = { url: STRATA_ENGINE_URL, bytes: STRATA_ENGINE_BYTES, sha256: STRATA_ENGINE_SHA256, revision: STRATA_REVISION };
type Asset = typeof asset;
type Runtime = { run(exe: string, args: string[], cwd: string, timeoutMs: number): Promise<string>; log(message: string): void };

async function childDirectory(parent: string, name: string): Promise<string> {
  const directory = path.join(parent, name);
  await fs.mkdir(directory, { recursive: true });
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || path.dirname(await fs.realpath(directory)) !== await fs.realpath(parent)) throw new Error("下载缓存目录不是独立管理目录，未写入。");
  return directory;
}

/** Persistent, asset-keyed software cache. Legacy stages are copied, never moved/deleted. */
export async function prepareStrataDownloadCache(parent: string, runtime: Runtime, expected: Asset = asset): Promise<string> {
  checkInstallationCancelled();
  if (!/^[a-f0-9]{40}$/u.test(expected.revision) || !/^[a-f0-9]{64}$/u.test(expected.sha256)
    || !Number.isSafeInteger(expected.bytes) || expected.bytes <= 0) throw new Error("引擎下载身份无效。");
  const cacheRoot = await childDirectory(parent, "downloads");
  const directory = await childDirectory(cacheRoot, `engine-${expected.revision}-${expected.sha256}`);
  const metadata = path.join(directory, "download.json"), archive = path.join(directory, "engine.zip");
  const identity = { owner: "local-video-studio", ...expected };
  const stat = await fs.lstat(metadata).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  if (stat) {
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096 || JSON.stringify(JSON.parse(await fs.readFile(metadata, "utf8"))) !== JSON.stringify(identity)) throw new Error("下载缓存来源记录不匹配，未覆盖原文件。");
    return archive;
  }
  if ((await fs.readdir(directory)).length) throw new Error("下载缓存目录已有未知文件，未覆盖原文件。");
  await fs.writeFile(metadata, JSON.stringify(identity), { flag: "wx" });
  // Pre-resume installers left no download receipt. Import at most one matching Git stage.
  const candidates = (await fs.readdir(parent, { withFileTypes: true })).filter(entry => entry.isDirectory() && !entry.isSymbolicLink() && /^\.install-[a-z0-9]+$/iu.test(entry.name)).slice(-20).reverse();
  for (const entry of candidates) {
    checkInstallationCancelled();
    const stage = path.join(parent, entry.name), source = path.join(stage, "engine.zip");
    const file = await fs.lstat(source).catch(() => null);
    if (!file?.isFile() || file.isSymbolicLink() || file.nlink !== 1 || file.size < 4 || file.size > expected.bytes) continue;
    const handle = await fs.open(source, "r");
    const header = Buffer.alloc(4);
    try { await handle.read(header, 0, 4, 0); } finally { await handle.close(); }
    if (!header.equals(Buffer.from([0x50, 0x4b, 3, 4]))) continue;
    try {
      if ((await runtime.run("git.exe", ["-C", stage, "rev-parse", "HEAD"], parent, 5000)).trim() !== expected.revision) continue;
      const origin = (await runtime.run("git.exe", ["-C", stage, "config", "--get", "remote.origin.url"], parent, 5000)).trim();
      if (!/^https:\/\/github\.com\/Niko1221\/Strata(?:\.git)?\/?$/iu.test(origin)) continue;
    } catch { checkInstallationCancelled(); continue; }
    checkInstallationCancelled();
    await fs.copyFile(source, archive, constants.COPYFILE_EXCL);
    runtime.log(`复用上次保留的引擎半包 ${(file.size / 1_000_000).toFixed(1)} MB；原文件保留`);
    break;
  }
  return archive;
}
