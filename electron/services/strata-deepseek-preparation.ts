import { modelLibraryRoots } from "../../src/core/model-libraries.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { STRATA_REVISION } from "../../src/core/catalog/dependencies/strata.js";
import { validStrataPort } from "../../src/core/strata-preparation.js";
import { STRATA_DEEPSEEK_ASSETS, STRATA_DEEPSEEK_MODEL_ID, STRATA_DEEPSEEK_REVISION } from "../../src/core/catalog/models/strata-deepseek.js";
import type { Settings } from "../../src/types.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
import { createNativeTranslator } from "../ui-translator.js";
import type { Translate } from "../../src/core/i18n.js";
import { containsPath, physicalPath, resolvedStrataDirectory, strataInstalledRelease } from "./strata-installation.js";
import { scanStrataPreparation } from "./strata-preparation.js";
import { deepSeekEngineDirectory, deepSeekEngineIssue, hasDeepSeekEngine } from "./strata-deepseek-engine.js";
import { strataDerivedDataDirectory, verifyStrataAsset, validateStrataRuntimePolicy, type StrataModelPreparationRuntime, type StrataRuntimePolicy, type StrataVerifiedAsset } from "./strata-model-preparation.js";

const files = ["ds4.txt", "tensors.txt", "engram.bin", "expert-profile.bin", "tokenizer/vocab.json", "tokenizer/merges.txt", "tokenizer/token_type.json", "tokenizer/tokenizer.json", "tokenizer/chat_template.jinja"];
async function artifacts(pack: string) {
  return Promise.all(files.map(async relative => {
    const stat = await fs.stat(path.join(pack, relative));
    if (!stat.isFile() || !stat.size) throw new Error(`DeepSeek pack: ${relative}`);
    return { relative, bytes: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs };
  }));
}

export function buildDeepSeekRuntimeConfig(input: { install: string; pack: string; policy: StrataRuntimePolicy; port: number }) {
  validateStrataRuntimePolicy(input.policy);
  if (!validStrataPort(input.port) || input.policy.maxContext > 32768 || input.policy.maxContext < 8192) throw new Error("DeepSeek: invalid port / context (8K–32K)");
  const engine = deepSeekEngineDirectory(input.install);
  return { exe: path.join(engine, "strata-dsv41.exe"), cwd: input.install,
    args: ["--pack", input.pack, "--max-context", String(input.policy.maxContext), "--eos", "1", "--vision", "on",
      "--reserve-mib", String(Math.max(5120, input.policy.vramReserveMiB)), "--dspark", "auto", "--dspark-conf", "0.65",
      "--experts", "6", "--profile-readonly"],
    arch: "deepseek41", tokenizer: path.join(input.pack, "tokenizer"), model_name: STRATA_DEEPSEEK_MODEL_ID,
    log: path.join(input.pack, "engine.log"), lib_dirs: [engine], port: input.port, host: "127.0.0.1", lazy_load: true, engine_ready_s: 3600 };
}

/** This receipt is separate from Qwen's PLE/native/MTP schema. Source files are never rewritten. */
export async function validatePreparedDeepSeekRuntime(configPath: string, install: string, t: Translate = createNativeTranslator(undefined).t) {
  const pack = path.dirname(path.resolve(configPath));
  const receipt = JSON.parse(await fs.readFile(path.join(pack, "lvs-strata-model.json"), "utf8"));
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  if (receipt.owner !== "local-video-studio" || receipt.schema !== 2 || receipt.modelId !== STRATA_DEEPSEEK_MODEL_ID
    || receipt.sourceRevision !== strataInstalledRelease(install)?.revision || receipt.sourceRevision !== STRATA_REVISION
    || receipt.modelRevision !== STRATA_DEEPSEEK_REVISION || !receipt.preparedAt || !Array.isArray(receipt.assets)
    || receipt.assets.length !== STRATA_DEEPSEEK_ASSETS.length) throw new Error(t(uiKeys.strataPreparation.invalidReceipt));
  for (const [index, asset] of (receipt.assets as StrataVerifiedAsset[]).entries()) {
    const expected = STRATA_DEEPSEEK_ASSETS[index];
    if (asset.bytes !== expected.bytes || asset.sha256 !== expected.sha256 || path.basename(asset.filename) !== expected.filename)
      throw new Error(t(uiKeys.strataPreparation.invalidReceipt));
    const stat = await fs.stat(asset.filename);
    if (!stat.isFile() || stat.size !== asset.bytes || stat.mtimeMs !== asset.mtimeMs || stat.ctimeMs !== asset.ctimeMs)
      throw new Error(t(uiKeys.strataPreparation.modelChanged));
  }
  if (!await hasDeepSeekEngine(install)) throw new Error(t(uiKeys.strataPreparation.dependencyMissing, { file: await deepSeekEngineIssue(install) ?? deepSeekEngineDirectory(install) }));
  if (!isDeepStrictEqual(config, buildDeepSeekRuntimeConfig({ install, pack, policy: receipt.policy, port: config.port })))
    throw new Error(t(uiKeys.strataPreparation.configMismatch));
  if (!isDeepStrictEqual(receipt.artifacts, await artifacts(pack))) throw new Error(t(uiKeys.strataPreparation.packChanged));
  return STRATA_DEEPSEEK_MODEL_ID;
}

export async function findPreparedDeepSeekRuntime(settings: Settings, policy: StrataRuntimePolicy,
  options: { resolvedModelDirectory?: string; dataDirectory?: string; signal?: AbortSignal } = {}): Promise<string | null> {
  const install = path.resolve(resolvedStrataDirectory(settings));
  const scan = await scanStrataPreparation(settings, undefined, options.resolvedModelDirectory);
  const profile = scan.profiles.find(item => item.id === STRATA_DEEPSEEK_MODEL_ID);
  if (!profile?.available || !scan.status.managedInstalled || !scan.status.deepSeekEnginePresent) return null;
  const data = options.dataDirectory ?? strataDerivedDataDirectory();
  const entries = await fs.readdir(data, { withFileTypes: true }).catch(() => []);
  for (const entry of entries.filter(entry => entry.isDirectory() && !entry.isSymbolicLink()).slice(-1000).reverse()) {
    options.signal?.throwIfAborted();
    const configPath = path.join(data, entry.name, "runtime.json");
    try {
      const receipt = JSON.parse(await fs.readFile(path.join(data, entry.name, "lvs-strata-model.json"), "utf8"));
      if (!isDeepStrictEqual(receipt.policy, policy) || !Array.isArray(receipt.assets)
        || !receipt.assets.every((asset: StrataVerifiedAsset, index: number) => path.resolve(asset.filename) === path.resolve(profile.components[index]?.matches[0] ?? ""))) continue;
      await validatePreparedDeepSeekRuntime(configPath, install);
      return configPath;
    } catch { /* Incomplete or changed packs are retained; never repair source weights. */ }
  }
  return null;
}

const preparing = new Set<string>();
export async function prepareDeepSeekRuntime(settings: Settings, policy: StrataRuntimePolicy, runtime: StrataModelPreparationRuntime,
  options: { resolvedModelDirectory?: string; signal?: AbortSignal; onLog?: (message: string) => void } = {}) {
  const t = createNativeTranslator(settings.uiLocale).t;
  validateStrataRuntimePolicy(policy, t);
  const install = path.resolve(resolvedStrataDirectory(settings));
  const key = install.toLowerCase();
  if (preparing.has(key)) throw new Error(t(uiKeys.strataPreparation.preparing));
  preparing.add(key);
  const { signal, onLog } = options;
  try {
    signal?.throwIfAborted();
    const scan = await scanStrataPreparation(settings, runtime.inspect, options.resolvedModelDirectory);
    if (!scan.status.managedInstalled || !scan.status.sourcePresent || scan.status.installedRevision !== STRATA_REVISION)
      throw new Error(t(uiKeys.strataPreparation.installIncomplete));
    if (!scan.status.deepSeekEnginePresent) throw new Error(t(uiKeys.strataPreparation.dependencyMissing, { file: await deepSeekEngineIssue(install) ?? deepSeekEngineDirectory(install) }));
    const profile = scan.profiles.find(item => item.id === STRATA_DEEPSEEK_MODEL_ID)!;
    if (!profile.available) throw new Error(t(uiKeys.strataPreparation.modelsMissing));
    const data = path.resolve(runtime.dataDirectory ?? strataDerivedDataDirectory());
    const actualData = await physicalPath(data);
    for (const root of [...modelLibraryRoots(settings, options.resolvedModelDirectory), install, options.resolvedModelDirectory ?? settings.modelDirectory, ...profile.components.map(item => path.dirname(item.matches[0]))].filter(Boolean)) {
      const actualRoot = await physicalPath(root);
      if (containsPath(actualRoot, actualData) || containsPath(actualData, actualRoot)) throw new Error(t(uiKeys.strataPreparation.directoryOverlap));
    }
    const assets: StrataVerifiedAsset[] = [];
    for (const component of profile.components) {
      signal?.throwIfAborted();
      onLog?.(t(uiKeys.strataPreparation.verifying, { label: component.label }));
      assets.push(await (runtime.verifyAsset ?? verifyStrataAsset)(component.matches[0],
        { bytes: component.installGuide.bytes!, sha256: component.installGuide.sha256! }, signal));
    }
    if (await physicalPath(data) !== actualData) throw new Error(t(uiKeys.strataPreparation.directoryChanged));
    await fs.mkdir(data, { recursive: true });
    const pack = await fs.mkdtemp(path.join(data, "deepseek41-iq2_xxs-"));
    const python = path.join(install, ".venv", "Scripts", "python.exe");
    // Explicit shards exclude the metadata-only Unsloth GGUF from backbone discovery.
    await runtime.run(python, ["-B", path.join(install, "tools/dsv41/pack_gguf.py"), "--model", path.dirname(assets[0].filename), "--out", pack,
      "--shards", ...assets.slice(0, 4).map(asset => asset.filename), "--engram", assets[4].filename, "--engram-meta", assets[5].filename,
      "--mmproj", assets[6].filename, "--dspark-gguf", assets[7].filename], { cwd: install, timeoutMs: 600_000, signal, onLog, uiLocale: settings.uiLocale });
    await fs.copyFile(path.join(install, "data/dsv41/profile-2.00.bin"), path.join(pack, "expert-profile.bin"));
    const engine = deepSeekEngineDirectory(install);
    await runtime.run(path.join(engine, "strata-dsv41.exe"), ["--pack", pack, "--pack-info"],
      { cwd: engine, timeoutMs: 120_000, signal, onLog, uiLocale: settings.uiLocale });
    for (const asset of assets) {
      const stat = await fs.stat(asset.filename);
      if (stat.size !== asset.bytes || stat.mtimeMs !== asset.mtimeMs || stat.ctimeMs !== asset.ctimeMs) throw new Error(t(uiKeys.strataPreparation.sourceChanged));
    }
    const configPath = path.join(pack, "runtime.json"), receiptPath = path.join(pack, "lvs-strata-model.json");
    const config = buildDeepSeekRuntimeConfig({ install, pack, policy, port: settings.strataPort });
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), { flag: "wx" });
    signal?.throwIfAborted();
    await fs.writeFile(receiptPath, JSON.stringify({ owner: "local-video-studio", schema: 2, modelId: STRATA_DEEPSEEK_MODEL_ID,
      sourceRevision: STRATA_REVISION, modelRevision: STRATA_DEEPSEEK_REVISION, policy, assets, artifacts: await artifacts(pack), preparedAt: new Date().toISOString() }, null, 2), { flag: "wx" });
    return { configPath, receiptPath, packDirectory: pack, modelId: STRATA_DEEPSEEK_MODEL_ID };
  } finally { preparing.delete(key); }
}
