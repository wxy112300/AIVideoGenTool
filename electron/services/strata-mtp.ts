import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { STRATA_MTP_ASSET } from "../../src/core/catalog/models/strata.js";
import { containsPath, physicalPath } from "./strata-installation.js";
import type { StrataVerifiedAsset, verifyStrataAsset } from "./strata-model-preparation.js";

const files = ["experts.bin", "dense.bin", "dense.txt", "draft_vocab.bin"] as const;
export const STRATA_MTP_CJK_VOCAB = { tokens: 106299, sha256: "b1e1d3a7a9e4bf862dcd5923ce661fb59bbd07907e594df5cf86a62ac235cb91" };
export interface StrataMtpRecord {
  revision: string;
  source: StrataVerifiedAsset;
  directory: string;
  artifacts: { relative: string; bytes: number; mtimeMs: number; ctimeMs: number }[];
}

async function artifactFacts(directory: string): Promise<StrataMtpRecord["artifacts"]> {
  return Promise.all(files.map(async (relative) => {
    const stat = await fs.stat(path.join(directory, relative));
    if (!stat.isFile() || stat.size <= 0) throw new Error(`MTP 运行文件不完整：${relative}`);
    return { relative, bytes: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs };
  }));
}

/** Read-only completion validation. No downloads, tools, model load or repeated weight hashing. */
export async function validateStrataMtp(record: StrataMtpRecord, packDirectory: string): Promise<void> {
  if (!record || record.revision !== STRATA_MTP_ASSET.revision
    || !record.source || record.source.sha256 !== STRATA_MTP_ASSET.sha256 || record.source.bytes !== STRATA_MTP_ASSET.bytes
    || typeof record.directory !== "string" || !Array.isArray(record.artifacts)) throw new Error("MTP 准备记录无效。");
  const pack = await physicalPath(packDirectory);
  const directory = await physicalPath(record.directory);
  if (directory === pack || !containsPath(pack, directory)) throw new Error("MTP 派生目录不属于此 pack。");
  const stat = await fs.stat(record.source.filename);
  if (!stat.isFile() || stat.size !== record.source.bytes || stat.mtimeMs !== record.source.mtimeMs || stat.ctimeMs !== record.source.ctimeMs)
    throw new Error("MTP 权重在准备后改变，请重新准备。");
  const current = await artifactFacts(record.directory);
  if (JSON.stringify(current) !== JSON.stringify(record.artifacts)) throw new Error("MTP 运行文件在准备后改变，请重新准备。");
}

/** CPU-only preparation from the user's pinned GGUF; never call setup.py or mtp_fetch.py. */
export async function prepareStrataMtp(input: {
  installDirectory: string; packDirectory: string; filename: string;
  verifyAsset: typeof verifyStrataAsset;
  run(args: string[], timeoutMs: number): Promise<string>;
  signal?: AbortSignal; onLog?: (message: string) => void;
}): Promise<StrataMtpRecord> {
  const check = () => input.signal?.throwIfAborted();
  check();
  input.onLog?.("校验配套 MTP Q2_0 权重");
  const source = await input.verifyAsset(input.filename, STRATA_MTP_ASSET, input.signal);
  const tool = path.join(input.installDirectory, "tools", "mtp_rt.py");
  if (!(await fs.stat(tool).catch(() => null))?.isFile()) throw new Error("Strata 离线 MTP 转换工具缺失，请修复软件安装。");
  const vocab = await fs.readFile(path.join(input.installDirectory, "data", "draft_vocab.bin"));
  if (vocab.length !== STRATA_MTP_CJK_VOCAB.tokens * 4 || createHash("sha256").update(vocab).digest("hex") !== STRATA_MTP_CJK_VOCAB.sha256)
    throw new Error("Strata 中文 MTP 词表不匹配，请修复软件安装。");
  check();
  const directory = await fs.mkdtemp(path.join(input.packDirectory, "mtp-"));
  const pack = await physicalPath(input.packDirectory);
  if (!containsPath(pack, await physicalPath(directory))) throw new Error("MTP 派生目录在准备期间改变。");
  input.onLog?.("使用官方工具离线准备 MTP 运行文件");
  await input.run([tool, "--gguf", source.filename, "--out", directory], 180_000);
  check();
  await fs.writeFile(path.join(directory, "draft_vocab.bin"), vocab, { flag: "wx" });
  // Check the tensor index before publishing. The official converter emits 29 dense tensors.
  const index = (await fs.readFile(path.join(directory, "dense.txt"), "utf8")).trim().split(/\r?\n/u);
  const dense = await fs.stat(path.join(directory, "dense.bin"));
  const names = new Set<string>();
  for (const row of index) {
    const parts = row.split(/\s+/u);
    const offset = Number(parts[4]), bytes = Number(parts[5]);
    if (parts.length !== 6 || !["q8_0", "bf16", "f32"].includes(parts[1])
      || names.has(parts[0]) || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(bytes) || bytes <= 0
      || offset + bytes > dense.size) throw new Error("MTP dense 索引无效。");
    names.add(parts[0]);
  }
  if (index.length !== 29 || !(await fs.stat(path.join(directory, "experts.bin"))).isFile()) throw new Error("MTP 张量不完整。");
  const record = { revision: STRATA_MTP_ASSET.revision, source, directory, artifacts: await artifactFacts(directory) };
  // Capture source stability even when a converter failed to report concurrent replacement.
  await validateStrataMtp(record, input.packDirectory);
  input.onLog?.("MTP 运行文件与中文词表已就绪；未启动模型");
  return record;
}
