import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { Settings } from "../../src/types.js";
import { STRATA_MODEL_REVISION, STRATA_REVISION } from "../../src/core/catalog/dependencies/strata.js";
import { validStrataPort } from "../../src/core/strata-preparation.js";
import { containsPath, managedStrataDirectory, physicalPath, resolvedStrataDirectory, strataManagedReceipt } from "./strata-installation.js";
import { scanStrataPreparation, type StrataFileInspector } from "./strata-preparation.js";

export interface StrataRuntimePolicy {
  maxContext: number;
  kv: "q4_0" | "k8v4";
  visionTokens: number;
  visionGpu: boolean;
  vramReserveMiB: number;
}
export interface StrataVerifiedAsset {
  filename: string;
  bytes: number;
  sha256: string;
  mtimeMs: number;
  ctimeMs: number;
}
interface AssetExpectation { bytes: number; sha256: string }

/** Full identity check, not the Settings scanner's header/size readiness. */
export async function verifyStrataAsset(filename: string, expected: AssetExpectation, signal?: AbortSignal, onBytes?: (bytes: number) => void): Promise<StrataVerifiedAsset> {
  signal?.throwIfAborted();
  const before = await fs.stat(filename);
  if (!before.isFile() || before.size !== expected.bytes) throw new Error(`模型文件大小不符或仍在下载：${path.basename(filename)}`);
  const digest = createHash("sha256");
  let bytes = 0;
  let header = Buffer.alloc(0);
  for await (const chunk of createReadStream(filename, { signal })) {
    signal?.throwIfAborted();
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (header.length < 4) header = Buffer.concat([header, buffer.subarray(0, 4 - header.length)]);
    digest.update(buffer); bytes += buffer.length; onBytes?.(bytes);
  }
  const sha256 = digest.digest("hex");
  const after = await fs.stat(filename);
  if (header.toString("ascii") !== "GGUF" || sha256 !== expected.sha256 || bytes !== expected.bytes
    || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || before.ino !== after.ino) {
    throw new Error(`模型文件校验失败或在校验期间改变：${path.basename(filename)}`);
  }
  return { filename, bytes, sha256, mtimeMs: after.mtimeMs, ctimeMs: after.ctimeMs };
}

export function validateStrataRuntimePolicy(policy: StrataRuntimePolicy): void {
  if (!Number.isSafeInteger(policy.maxContext) || policy.maxContext < 1024
    || !["q4_0", "k8v4"].includes(policy.kv)
    || !Number.isSafeInteger(policy.visionTokens) || policy.visionTokens < 1
    || typeof policy.visionGpu !== "boolean"
    || !Number.isSafeInteger(policy.vramReserveMiB) || policy.vramReserveMiB < 0) {
    throw new Error("Strata 运行策略无效；上下文、视觉与显存策略必须显式提供。");
  }
}

export function buildStrataRuntimeConfig(input: {
  installDirectory: string; packDirectory: string; shards: string[]; pleShard: string;
  projector: string; modelId: string; port: number; policy: StrataRuntimePolicy;
}) {
  validateStrataRuntimePolicy(input.policy);
  if (!validStrataPort(input.port) || input.shards.length !== 2 || !input.shards.includes(input.pleShard)) throw new Error("Strata 模型分片或端口无效。");
  const { policy } = input;
  return {
    exe: path.join(input.installDirectory, "engine", "strata.exe"), cwd: input.installDirectory,
    args: ["--pack", input.packDirectory, "--native", input.shards[0], "--ple-gguf", input.pleShard,
      "--expert-cache", "auto", "--prefill", "auto", "--spec", "0", "--max-context", String(policy.maxContext),
      ...(policy.maxContext > 8192 ? ["--kv", policy.kv] : []), "--vision", "--vram-reserve-mib", String(policy.vramReserveMiB)],
    tokenizer: path.join(input.packDirectory, "tokenizer"), model_name: input.modelId,
    lib_dirs: [path.join(input.installDirectory, ".venv", "Lib", "site-packages", "nvidia", "cu13", "bin", "x86_64")],
    port: input.port, host: "127.0.0.1", lazy_load: true,
    vision: { exe: path.join(input.installDirectory, "engine", "strata-vision.exe"), mmproj: input.projector,
      model: input.shards[0], gpu: policy.visionGpu, max_tokens: policy.visionTokens }
  };
}

export interface StrataModelPreparationRuntime {
  run(executable: string, args: string[], options: { cwd: string; timeoutMs: number; signal?: AbortSignal; onLog?: (message: string) => void }): Promise<string>;
  /** Isolated test seams only; neither is exposed through IPC or Settings. */
  inspect?: StrataFileInspector;
  verifyAsset?: typeof verifyStrataAsset;
  dataDirectory?: string;
}

const pleInspection = [
  "import sys,json", "from pathlib import Path", "sys.path.insert(0,str(Path(sys.argv[1])/'tools'))",
  "from gguf_reader import GGUFFile",
  "hits=[i for i,p in enumerate(sys.argv[2:]) if any(t.name=='per_layer_token_embd.weight' for t in GGUFFile(Path(p)).tensors)]",
  "assert len(hits)==1, 'expected exactly one PLE table across the model shards'", "print(json.dumps({'pleShard':hits[0]}))"
].join("\n");
export const strataRequiredPackFiles = ["native_experts.txt", "index.txt", "dense.bin", "tokenizer/vocab.json", "tokenizer/merges.txt",
  "tokenizer/token_type.json", "tokenizer/tokenizer.json", "tokenizer/chat_template.jinja"];
const preparing = new Set<string>();

export function strataDerivedDataDirectory(): string {
  return path.join(path.dirname(managedStrataDirectory()), "data");
}

/** Reuse only a completed pack for this exact model/root/policy; invalid/failed directories stay untouched. */
export async function findPreparedStrataRuntime(
  settings: Settings, modelId: string, policy: StrataRuntimePolicy,
  options: { resolvedModelDirectory?: string; dataDirectory?: string; signal?: AbortSignal } = {}
): Promise<string | null> {
  const install = path.resolve(resolvedStrataDirectory(settings));
  const scan = await scanStrataPreparation(settings, undefined, options.resolvedModelDirectory);
  const profile = scan.profiles.find((item) => item.id === modelId);
  if (!scan.status.managedInstalled || !profile?.available) return null;
  const data = options.dataDirectory ?? strataDerivedDataDirectory();
  const entries = await fs.readdir(data, { withFileTypes: true }).catch(() => []);
  for (const entry of entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()).slice(-1000).reverse()) {
    options.signal?.throwIfAborted();
    const configPath = path.join(data, entry.name, "runtime.json");
    try {
      const receipt = JSON.parse(await fs.readFile(path.join(data, entry.name, "lvs-strata-model.json"), "utf8"));
      if (receipt.modelId !== modelId || !isDeepStrictEqual(receipt.policy, policy)
        || !Array.isArray(receipt.assets) || receipt.assets.length !== 3
        || !receipt.assets.every((asset: StrataVerifiedAsset, index: number) =>
          path.resolve(asset.filename) === path.resolve(profile.components[index].matches[0])
          && asset.bytes === profile.components[index].installGuide.bytes
          && asset.sha256 === profile.components[index].installGuide.sha256)) continue;
      if (await validatePreparedStrataRuntime(configPath, install) === modelId) return configPath;
    } catch { /* No completion/changed inputs: prepare a fresh transaction, never repair weights in place. */ }
  }
  return null;
}

/** A directory or JSON file alone is not a successfully prepared runtime. */
export async function validatePreparedStrataRuntime(configPath: string, installDirectory: string): Promise<string> {
  const packDirectory = path.dirname(path.resolve(configPath));
  const receipt = JSON.parse(await fs.readFile(path.join(packDirectory, "lvs-strata-model.json"), "utf8"));
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  if (receipt.owner !== "local-video-studio" || receipt.schema !== 1 || receipt.sourceRevision !== STRATA_REVISION
    || receipt.modelRevision !== STRATA_MODEL_REVISION || !receipt.preparedAt || receipt.mtp !== false
    || typeof receipt.modelId !== "string" || !Array.isArray(receipt.assets) || receipt.assets.length !== 3 || ![0, 1].includes(receipt.pleShard)) {
    throw new Error("Strata 模型准备记录无效，请重新准备。");
  }
  for (const asset of receipt.assets) {
    if (typeof asset.filename !== "string" || !Number.isSafeInteger(asset.bytes) || asset.bytes <= 0
      || typeof asset.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(asset.sha256)) throw new Error("Strata 模型准备记录不完整。");
    const stat = await fs.stat(asset.filename);
    if (!stat.isFile() || stat.size !== asset.bytes || stat.mtimeMs !== asset.mtimeMs || stat.ctimeMs !== asset.ctimeMs) throw new Error("模型在准备后改变，请重新准备。");
  }
  const expected = buildStrataRuntimeConfig({ installDirectory, packDirectory, shards: receipt.assets.slice(0, 2).map((asset: StrataVerifiedAsset) => asset.filename),
    pleShard: receipt.assets[receipt.pleShard].filename, projector: receipt.assets[2].filename, modelId: receipt.modelId,
    port: config.port, policy: receipt.policy });
  if (!isDeepStrictEqual(config, expected)) throw new Error("Strata 运行配置与准备记录不一致，请重新准备。");
  await validatePackFiles(packDirectory);
  if (!isDeepStrictEqual(receipt.artifacts, await strataPackArtifactFacts(packDirectory))) throw new Error("Strata pack/tokenizer 在准备后改变，请重新准备。");
  return receipt.modelId;
}

export async function strataPackArtifactFacts(directory: string) {
  return Promise.all(strataRequiredPackFiles.map(async (relative) => {
    const stat = await fs.stat(path.join(directory, relative));
    return { relative, bytes: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs };
  }));
}

async function validatePackFiles(directory: string): Promise<void> {
  for (const relative of strataRequiredPackFiles) {
    const stat = await fs.stat(path.join(directory, relative)).catch(() => null);
    if (!stat?.isFile() || stat.size === 0) throw new Error(`pack/tokenizer 不完整：${relative}`);
  }
  const vocab = JSON.parse(await fs.readFile(path.join(directory, "tokenizer/vocab.json"), "utf8"));
  const types = JSON.parse(await fs.readFile(path.join(directory, "tokenizer/token_type.json"), "utf8"));
  const tokenizer = JSON.parse(await fs.readFile(path.join(directory, "tokenizer/tokenizer.json"), "utf8"));
  if (!vocab || Array.isArray(vocab) || typeof vocab !== "object" || !Object.keys(vocab).length
    || !Array.isArray(types) || types.length !== Object.keys(vocab).length || tokenizer.vocab_size !== types.length) throw new Error("tokenizer 内容不完整或不一致。");
  const ids = Object.values(vocab);
  const merges = (await fs.readFile(path.join(directory, "tokenizer/merges.txt"), "utf8")).trimEnd().split(/\r?\n/u);
  if (new Set(ids).size !== ids.length || !ids.every((id) => typeof id === "number" && Number.isSafeInteger(id) && id >= 0 && id < ids.length)
    || !types.every((type) => Number.isInteger(type)) || !merges.every((merge) => merge.split(" ").length === 2)) throw new Error("tokenizer token 或合并规则无效。");
}

/** CPU preparation only. No setup.py, downloads, MTP, native engine, or model service. */
export async function prepareStrataModelRuntime(
  settings: Settings, modelId: string, policy: StrataRuntimePolicy, runtime: StrataModelPreparationRuntime,
  options: { resolvedModelDirectory?: string; signal?: AbortSignal; onLog?: (message: string) => void } = {}
): Promise<{ configPath: string; packDirectory: string; receiptPath: string; modelId: string }> {
  validateStrataRuntimePolicy(policy);
  if (!validStrataPort(settings.strataPort)) throw new Error("Strata 端口无效（不能使用8080）。");
  const install = path.resolve(resolvedStrataDirectory(settings));
  const key = process.platform === "win32" ? install.toLowerCase() : install;
  if (preparing.has(key)) throw new Error("Strata 模型准备正在执行。");
  preparing.add(key);
  let output = "";
  const { signal, onLog } = options;
  const check = () => signal?.throwIfAborted();
  try {
    check();
    const scan = await scanStrataPreparation(settings, runtime.inspect, options.resolvedModelDirectory);
    const profile = scan.profiles.find((candidate) => candidate.id === modelId);
    if (!profile) throw new Error("不支持该 Strata 模型。");
    if (!scan.status.managedInstalled || !scan.status.sourcePresent || !scan.status.enginePresent || !await strataManagedReceipt(install)) throw new Error("Strata 管理安装未完成，请重新扫描或重装。");
    if (!profile.available) throw new Error("模型分片或视觉投影尚未完整下载；未创建 pack 或修改模型。");
    const firstDirectory = path.resolve(path.dirname(profile.components[0].matches[0]));
    const secondDirectory = path.resolve(path.dirname(profile.components[1].matches[0]));
    if (firstDirectory !== secondDirectory) throw new Error("两份模型分片必须位于同一目录，才能由官方 pack 工具读取；原文件未修改。");
    const python = path.join(install, ".venv", "Scripts", "python.exe");
    const libs = path.join(install, ".venv", "Lib", "site-packages", "nvidia", "cu13", "bin", "x86_64");
    for (const filename of [python, ...["iq_pack.py", "strata_tokenizer.py", "gguf_reader.py"].map((name) => path.join(install, "tools", name)),
      ...["cublas64_13.dll", "cudart64_13.dll"].map((name) => path.join(libs, name))]) {
      if (!(await fs.stat(filename).catch(() => null))?.isFile()) throw new Error(`Strata 准备依赖缺失：${filename}`);
    }
    const data = path.resolve(runtime.dataDirectory ?? strataDerivedDataDirectory());
    const actualData = await physicalPath(data);
    for (const protectedRoot of [install, options.resolvedModelDirectory ?? settings.modelDirectory, scan.status.modelDirectory,
      ...profile.components.map((component) => path.dirname(component.matches[0]))].filter(Boolean)) {
      const actualRoot = await physicalPath(protectedRoot);
      if (containsPath(actualRoot, actualData) || containsPath(actualData, actualRoot)) throw new Error("Strata 派生目录与软件或共享模型目录重叠，拒绝写入。");
    }
    const assets: StrataVerifiedAsset[] = [];
    for (const component of profile.components) {
      check(); onLog?.(`校验 ${component.label}`);
      const { bytes, sha256 } = component.installGuide;
      if (!bytes || !sha256) throw new Error("模型 catalog 缺少完整校验信息。");
      let lastPercent = -1;
      assets.push(await (runtime.verifyAsset ?? verifyStrataAsset)(component.matches[0], { bytes, sha256 }, signal, (verified) => {
        const percent = Math.floor(verified / bytes * 100);
        if (percent !== lastPercent) { lastPercent = percent; onLog?.(`SHA-256 · ${component.label} · ${percent}%`); }
      }));
    }
    const shards = assets.slice(0, 2).map((asset) => asset.filename);
    const run = (args: string[], timeoutMs: number) => runtime.run(python, ["-B", ...args], { cwd: install, timeoutMs, signal, onLog });
    check();
    const header = JSON.parse(await run(["-c", pleInspection, install, ...shards], 120_000));
    if (![0, 1].includes(header.pleShard)) throw new Error("模型 PLE 分片检查失败。");
    check();
    if (await physicalPath(data) !== actualData) throw new Error("Strata 派生目录在校验期间改变，拒绝写入。");
    await fs.mkdir(data, { recursive: true });
    output = await fs.mkdtemp(path.join(data, `qwen-flash-next-${modelId.split("-").at(-1)}-`));
    onLog?.(`准备 pack/tokenizer：${output}`);
    await run([path.join(install, "tools", "iq_pack.py"), "--gguf", shards[0], "--out", output], 600_000);
    check();
    await validatePackFiles(output);
    for (const asset of assets) {
      const current = await fs.stat(asset.filename);
      if (current.size !== asset.bytes || current.mtimeMs !== asset.mtimeMs || current.ctimeMs !== asset.ctimeMs) throw new Error("模型在准备期间改变，未发布运行配置。");
    }
    check();
    const config = buildStrataRuntimeConfig({ installDirectory: install, packDirectory: output, shards, pleShard: shards[header.pleShard],
      projector: assets[2].filename, modelId, port: settings.strataPort, policy });
    const configPath = path.join(output, "runtime.json");
    const receiptPath = path.join(output, "lvs-strata-model.json");
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), { flag: "wx" });
    check();
    await fs.writeFile(receiptPath, JSON.stringify({ owner: "local-video-studio", schema: 1, modelId, sourceRevision: STRATA_REVISION,
      modelRevision: STRATA_MODEL_REVISION, assets, artifacts: await strataPackArtifactFacts(output), policy, pleShard: header.pleShard, mtp: false, preparedAt: new Date().toISOString() }, null, 2), { flag: "wx" });
    onLog?.("pack/tokenizer 与运行配置已准备；未加载模型、未验证推理。");
    return { configPath, packDirectory: output, receiptPath, modelId };
  } catch (error) {
    if (output) onLog?.(`未完成派生文件保留供检查：${output}（没有完成记录）`);
    throw error;
  } finally { preparing.delete(key); }
}
