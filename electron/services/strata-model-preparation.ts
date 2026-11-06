import { createNativeTranslator } from "../ui-translator.js";
import type { Translate } from "../../src/core/i18n.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { Settings } from "../../src/types.js";
import { STRATA_REVISION, STRATA_RELEASES, STRATA_COMPATIBLE_PACK_REVISIONS, STRATA_BUNDLED_LIBRARIES, STRATA_EXPERT_PROFILE } from "../../src/core/catalog/dependencies/strata.js";
import { strataModelGeometry } from "../../src/core/catalog/models/strata.js";
import { isStrataDeepSeek } from "../../src/core/catalog/models/strata-deepseek.js";
import { findPreparedDeepSeekRuntime, prepareDeepSeekRuntime, validatePreparedDeepSeekRuntime } from "./strata-deepseek-preparation.js";
import { validStrataPort } from "../../src/core/strata-preparation.js";
import { containsPath, isManagedStrataPath, managedStrataDirectory, physicalPath, resolvedStrataDirectory, strataManagedReceipt, strataInstalledRelease } from "./strata-installation.js";
import { scanStrataPreparation, type StrataFileInspector } from "./strata-preparation.js";
import { renameWithRetry } from "./filesystem-retry.js";
import { prepareStrataMtp, validateStrataMtp, type StrataMtpRecord } from "./strata-mtp.js";

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
export async function verifyStrataAsset(filename: string, expected: AssetExpectation, signal?: AbortSignal, onBytes?: (bytes: number) => void, t: Translate = createNativeTranslator(undefined).t): Promise<StrataVerifiedAsset> {
  signal?.throwIfAborted();
  const before = await fs.stat(filename);
  if (!before.isFile() || before.size !== expected.bytes) throw new Error(t(uiKeys.strataPreparation.assetSize, { file: path.basename(filename) }));
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
    throw new Error(t(uiKeys.strataPreparation.assetChanged, { file: path.basename(filename) }));
  }
  return { filename, bytes, sha256, mtimeMs: after.mtimeMs, ctimeMs: after.ctimeMs };
}

export function validateStrataRuntimePolicy(policy: StrataRuntimePolicy, t: Translate = createNativeTranslator(undefined).t): void {
  if (!Number.isSafeInteger(policy.maxContext) || policy.maxContext < 1024
    || !["q4_0", "k8v4"].includes(policy.kv)
    || !Number.isSafeInteger(policy.visionTokens) || policy.visionTokens < 1
    || typeof policy.visionGpu !== "boolean"
    || !Number.isSafeInteger(policy.vramReserveMiB) || policy.vramReserveMiB < 0) {
    throw new Error(t(uiKeys.strataPreparation.invalidPolicy));
  }
}

export function buildStrataRuntimeConfig(input: {
  installDirectory: string; packDirectory: string; shards: string[]; pleShard: string;
  projector: string; modelId: string; port: number; policy: StrataRuntimePolicy; mtpDirectory?: string;
  /** Only used to validate an exact, previously generated config before upgrading it. */
  sourceRevision?: string;
}, t: Translate = createNativeTranslator(undefined).t) {
  validateStrataRuntimePolicy(input.policy, t);
  const geometry = strataModelGeometry(input.modelId);
  if (!validStrataPort(input.port) || input.shards.length !== geometry.shardCount || !input.shards.includes(input.pleShard)) throw new Error(t(uiKeys.strataPreparation.invalidShards));
  const { policy } = input;
  return {
    exe: path.join(input.installDirectory, "engine", "strata.exe"), cwd: input.installDirectory,
    args: ["--pack", input.packDirectory, "--native", input.shards[0], "--ple-gguf", input.pleShard,
      "--expert-cache", "auto", "--prefill", "auto", "--spec", input.mtpDirectory ? "4" : "2",
      ...(input.mtpDirectory ? ["--spec-min-p", "0.5", "--mtp", input.mtpDirectory] : []), "--max-context", String(policy.maxContext),
      ...(policy.maxContext > 8192 ? ["--kv", policy.kv] : []), "--vision", "--vram-reserve-mib", String(policy.vramReserveMiB),
      geometry.compatBf16 ? "--mmap-experts" : "--resident-experts", "--expert-profile", path.join(input.installDirectory, STRATA_EXPERT_PROFILE)],
    log: path.join(input.packDirectory, "engine.log"),
    tokenizer: path.join(input.packDirectory, "tokenizer"), model_name: input.modelId,
    lib_dirs: [strataRuntimeLibraries(input.installDirectory, input.sourceRevision).directory],
    port: input.port, host: "127.0.0.1", lazy_load: true,
    vision: { exe: path.join(input.installDirectory, "engine", "strata-vision.exe"), mmproj: input.projector,
      model: input.shards[0], gpu: policy.visionGpu, max_tokens: policy.visionTokens }
  };
}

function strataRuntimeLibraries(installDirectory: string, revision: string = strataInstalledRelease(installDirectory)?.revision ?? STRATA_REVISION) {
  const bundled = STRATA_RELEASES.find(release => release.revision === revision)?.bundledLibraries !== false;
  return { directory: bundled ? path.join(installDirectory, "engine")
    : path.join(installDirectory, ".venv", "Lib", "site-packages", "nvidia", "cu13", "bin", "x86_64"),
    files: bundled ? STRATA_BUNDLED_LIBRARIES : ["cublas64_13.dll", "cudart64_13.dll"] };
}

export interface StrataModelPreparationRuntime {
  run(executable: string, args: string[], options: { cwd: string; timeoutMs: number; signal?: AbortSignal; onLog?: (message: string) => void; uiLocale?: Settings["uiLocale"] }): Promise<string>;
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
const requiredPackFiles = (modelId = "") => [...strataRequiredPackFiles,
  ...(strataModelGeometry(modelId).compatBf16 ? ["conversions.json", "compat-bf16.json"] : [])];
const preparing = new Set<string>();

export function strataDerivedDataDirectory(): string {
  return path.join(path.dirname(managedStrataDirectory()), "data");
}

/** A newly downloaded optional MTP invalidates a retained non-MTP engine on the next request. */
export async function preparedStrataMtpMatchesSelection(configPath: string, settings: Settings, resolvedModelDirectory?: string): Promise<boolean> {
  if (isStrataDeepSeek(settings.promptModelId)) return true;
  const receipt = JSON.parse(await fs.readFile(path.join(path.dirname(configPath), "lvs-strata-model.json"), "utf8"));
  const scan = await scanStrataPreparation(settings, undefined, resolvedModelDirectory);
  const mtp = scan.profiles.find((profile) => profile.id === settings.promptModelId)?.components.find((component) => component.optional);
  return receipt.mtp === false ? !mtp?.found
    : Boolean(mtp?.found && path.resolve(mtp.matches[0]) === path.resolve(receipt.mtp.source.filename));
}

/** Reuse only a completed pack for this exact model/root/policy; invalid/failed directories stay untouched. */
export async function findPreparedStrataRuntime(
  settings: Settings, modelId: string, policy: StrataRuntimePolicy,
  options: { resolvedModelDirectory?: string; dataDirectory?: string; signal?: AbortSignal;
    run?: StrataModelPreparationRuntime["run"]; onLog?: (message: string) => void } = {}
): Promise<string | null> {
  if (isStrataDeepSeek(modelId)) return findPreparedDeepSeekRuntime(settings, policy, options);
  const t = createNativeTranslator(settings.uiLocale).t;
  const install = path.resolve(resolvedStrataDirectory(settings));
  const scan = await scanStrataPreparation(settings, undefined, options.resolvedModelDirectory);
  const profile = scan.profiles.find((item) => item.id === modelId);
  const geometry = strataModelGeometry(modelId);
  if (!scan.status.managedInstalled || !profile?.available) return null;
  const data = options.dataDirectory ?? strataDerivedDataDirectory();
  const entries = await fs.readdir(data, { withFileTypes: true }).catch(() => []);
  for (const entry of entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()).slice(-1000).reverse()) {
    options.signal?.throwIfAborted();
    const configPath = path.join(data, entry.name, "runtime.json");
    try {
      const receipt = JSON.parse(await fs.readFile(path.join(data, entry.name, "lvs-strata-model.json"), "utf8"));
      if (receipt.modelId !== modelId || !isDeepStrictEqual(receipt.policy, policy)
        || !Array.isArray(receipt.assets) || receipt.assets.length !== geometry.shardCount + 1
        || !receipt.assets.every((asset: StrataVerifiedAsset, index: number) =>
          path.resolve(asset.filename) === path.resolve(profile.components[index].matches[0])
          && asset.bytes === profile.components[index].installGuide.bytes
          && asset.sha256 === profile.components[index].installGuide.sha256)) continue;
      if (await validatePreparedStrataRuntime(configPath, install, { upgradeLegacyConfig: true, onLog: options.onLog }, t) !== modelId) continue;
    } catch { /* No completion/changed inputs: prepare a fresh transaction, never repair weights in place. */ }
    // Re-read after the exact legacy-config migration; prepare only MTP when it was added later.
    let receipt;
    try { receipt = JSON.parse(await fs.readFile(path.join(data, entry.name, "lvs-strata-model.json"), "utf8"));
      await validatePreparedStrataRuntime(configPath, install, undefined, t);
    } catch { continue; }
    const mtp = profile.components.find((component) => component.optional && component.found);
    if (mtp && receipt.mtp === false) {
      if (!options.run) return null;
      const run = (args: string[], timeoutMs: number) => options.run!(
        path.join(install, ".venv", "Scripts", "python.exe"), ["-B", ...args],
        { cwd: install, timeoutMs, signal: options.signal, onLog: options.onLog, uiLocale: settings.uiLocale });
      receipt.mtp = await prepareStrataMtp({ installDirectory: install, packDirectory: path.dirname(configPath),
        filename: mtp.matches[0], verifyAsset: (filename, expected, signal, onBytes) => verifyStrataAsset(filename, expected, signal, onBytes, t), run, signal: options.signal, onLog: options.onLog }, t);
      const config = buildStrataRuntimeConfig({ installDirectory: install, packDirectory: path.dirname(configPath),
        shards: receipt.assets.slice(0, geometry.shardCount).map((asset: StrataVerifiedAsset) => asset.filename),
        pleShard: receipt.assets[receipt.pleShard].filename, projector: receipt.assets[geometry.shardCount].filename,
        modelId, port: settings.strataPort, policy, mtpDirectory: receipt.mtp.directory }, t);
      await replaceJson(configPath, config);
      await replaceJson(path.join(path.dirname(configPath), "lvs-strata-model.json"), receipt);
      await validatePreparedStrataRuntime(configPath, install, undefined, t);
    }
    return configPath;
  }
  return null;
}

/** A directory or JSON file alone is not a successfully prepared runtime. */
export async function validatePreparedStrataRuntime(
  configPath: string, installDirectory: string, options: { upgradeLegacyConfig?: boolean; onLog?: (message: string) => void } = {}, t: Translate = createNativeTranslator(undefined).t
): Promise<string> {
  const packDirectory = path.dirname(path.resolve(configPath));
  const receipt = JSON.parse(await fs.readFile(path.join(packDirectory, "lvs-strata-model.json"), "utf8"));
  if (isStrataDeepSeek(receipt.modelId)) return validatePreparedDeepSeekRuntime(configPath, installDirectory, t);
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  const geometry = strataModelGeometry(receipt.modelId);
  const installedRevision = strataInstalledRelease(installDirectory)?.revision ?? STRATA_REVISION;
  const revisionChanged = receipt.sourceRevision !== installedRevision;
  const compatibleRevision = options.upgradeLegacyConfig === true && installedRevision === STRATA_REVISION
    && STRATA_COMPATIBLE_PACK_REVISIONS.some(revision => revision === receipt.sourceRevision);
  if (receipt.owner !== "local-video-studio" || receipt.schema !== 1 || (revisionChanged && !compatibleRevision)
    || receipt.modelRevision !== geometry.revision || !receipt.preparedAt || (receipt.mtp !== false && (!receipt.mtp || typeof receipt.mtp !== "object"))
    || typeof receipt.modelId !== "string" || !Array.isArray(receipt.assets) || receipt.assets.length !== geometry.shardCount + 1
    || !Number.isInteger(receipt.pleShard) || receipt.pleShard < 0 || receipt.pleShard >= geometry.shardCount) {
    throw new Error(t(uiKeys.strataPreparation.invalidReceipt));
  }
  for (const asset of receipt.assets) {
    if (typeof asset.filename !== "string" || !Number.isSafeInteger(asset.bytes) || asset.bytes <= 0
      || typeof asset.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(asset.sha256)) throw new Error(t(uiKeys.strataPreparation.incompleteReceipt));
    const stat = await fs.stat(asset.filename);
    if (!stat.isFile() || stat.size !== asset.bytes || stat.mtimeMs !== asset.mtimeMs || stat.ctimeMs !== asset.ctimeMs) throw new Error(t(uiKeys.strataPreparation.modelChanged));
  }
  if (receipt.mtp !== false) await validateStrataMtp(receipt.mtp, packDirectory, t);
  const expected = buildStrataRuntimeConfig({ installDirectory, packDirectory, shards: receipt.assets.slice(0, geometry.shardCount).map((asset: StrataVerifiedAsset) => asset.filename),
    pleShard: receipt.assets[receipt.pleShard].filename, projector: receipt.assets[geometry.shardCount].filename, modelId: receipt.modelId,
    port: config.port, policy: receipt.policy, mtpDirectory: receipt.mtp === false ? undefined : receipt.mtp.directory }, t);
  // Only the exact app-generated 0.65.1 launch shape is eligible for this derived-config repair.
  // Sources, pack artifacts and receipt must still pass every check before any write.
  const previous = { ...expected, args: expected.args.map((arg) => arg === "--resident-experts" ? "--mmap-experts" : arg).concat("--resident-budget-gib", "16") };
  const { log: _log, ...legacyExpected } = previous;
  legacyExpected.args = previous.args.slice(0, -5).map((arg, index, args) => args[index - 1] === "--spec" ? "0" : arg);
  const upgrade = !geometry.compatBf16 && options.upgradeLegacyConfig === true && receipt.mtp === false
    && (isDeepStrictEqual(config, previous) || isDeepStrictEqual(config, legacyExpected));
  // Same source revision, only the managed software location changed. Do not duplicate the pack.
  const formerInstall = typeof config.cwd === "string" ? config.cwd : "";
  const relocate = (value: unknown): unknown => {
    if (typeof value === "string") return value === formerInstall ? installDirectory : value.startsWith(`${formerInstall}${path.sep}`) ? installDirectory + value.slice(formerInstall.length) : value;
    if (Array.isArray(value)) return value.map(relocate);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, relocate(item)]));
    return value;
  };
  const relocation = options.upgradeLegacyConfig === true && formerInstall && isManagedStrataPath(formerInstall)
    && isManagedStrataPath(installDirectory) && isDeepStrictEqual(relocate(config), expected);
  const sameOrManagedLocation = formerInstall === installDirectory || (isManagedStrataPath(formerInstall) && isManagedStrataPath(installDirectory));
  const revisionUpgrade = revisionChanged && compatibleRevision && sameOrManagedLocation && (isDeepStrictEqual(config, expected) || isDeepStrictEqual(config,
    buildStrataRuntimeConfig({ installDirectory: formerInstall, packDirectory,
      shards: receipt.assets.slice(0, geometry.shardCount).map((asset: StrataVerifiedAsset) => asset.filename),
      pleShard: receipt.assets[receipt.pleShard].filename, projector: receipt.assets[geometry.shardCount].filename,
      modelId: receipt.modelId, port: config.port, policy: receipt.policy,
      mtpDirectory: receipt.mtp === false ? undefined : receipt.mtp.directory, sourceRevision: receipt.sourceRevision }, t)));
  if ((!revisionUpgrade && revisionChanged) || (!upgrade && !relocation && !revisionUpgrade && !isDeepStrictEqual(config, expected))) throw new Error(t(uiKeys.strataPreparation.configMismatch));
  await validatePackFiles(packDirectory, receipt.modelId, t);
  if (!isDeepStrictEqual(receipt.artifacts, await strataPackArtifactFacts(packDirectory, receipt.modelId))) throw new Error(t(uiKeys.strataPreparation.packChanged));
  if (revisionUpgrade) {
    const header = await fs.open(path.join(packDirectory, "native_experts.txt"), "r");
    const prefix = Buffer.alloc(128);
    try { await header.read(prefix, 0, prefix.length, 0); } finally { await header.close(); }
    if (!/^# strata native experts v[34]:/u.test(prefix.toString("utf8"))) throw new Error(t(uiKeys.strataPreparation.packIncompatible));
  }
  if (upgrade || relocation || revisionUpgrade) {
    await replaceJson(configPath, expected);
  }
  if (revisionUpgrade) {
    await replaceJson(path.join(packDirectory, "lvs-strata-model.json"), { ...receipt,
      packSourceRevision: receipt.packSourceRevision ?? receipt.sourceRevision, sourceRevision: installedRevision });
    options.onLog?.(t(uiKeys.strataPreparation.packUpgrade, { previous: receipt.sourceRevision.slice(0, 8), current: installedRevision.slice(0, 8) }));
  }
  return receipt.modelId;
}

async function replaceJson(filename: string, value: unknown): Promise<void> {
  const temporary = `${filename}.next-${randomUUID()}`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2), { flag: "wx" });
  await renameWithRetry(temporary, filename);
}

export async function strataPackArtifactFacts(directory: string, modelId = "") {
  return Promise.all(requiredPackFiles(modelId).map(async (relative) => {
    const stat = await fs.stat(path.join(directory, relative));
    return { relative, bytes: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs };
  }));
}

async function validatePackFiles(directory: string, modelId = "", t: Translate = createNativeTranslator(undefined).t): Promise<void> {
  for (const relative of requiredPackFiles(modelId)) {
    const stat = await fs.stat(path.join(directory, relative)).catch(() => null);
    if (!stat?.isFile() || stat.size === 0) throw new Error(t(uiKeys.strataPreparation.packIncomplete, { file: relative }));
  }
  const vocab = JSON.parse(await fs.readFile(path.join(directory, "tokenizer/vocab.json"), "utf8"));
  const types = JSON.parse(await fs.readFile(path.join(directory, "tokenizer/token_type.json"), "utf8"));
  const tokenizer = JSON.parse(await fs.readFile(path.join(directory, "tokenizer/tokenizer.json"), "utf8"));
  if (!vocab || Array.isArray(vocab) || typeof vocab !== "object" || !Object.keys(vocab).length
    || !Array.isArray(types) || types.length !== Object.keys(vocab).length || tokenizer.vocab_size !== types.length) throw new Error(t(uiKeys.strataPreparation.tokenizerIncomplete));
  const ids = Object.values(vocab);
  const merges = (await fs.readFile(path.join(directory, "tokenizer/merges.txt"), "utf8")).trimEnd().split(/\r?\n/u);
  if (new Set(ids).size !== ids.length || !ids.every((id) => typeof id === "number" && Number.isSafeInteger(id) && id >= 0 && id < ids.length)
    || !types.every((type) => Number.isInteger(type)) || !merges.every((merge) => merge.split(" ").length === 2)) throw new Error(t(uiKeys.strataPreparation.tokenizerInvalid));
}

/** CPU preparation only. No setup.py, downloads or model service; DeepSeek's --pack-info only inspects files. */
export async function prepareStrataModelRuntime(
  settings: Settings, modelId: string, policy: StrataRuntimePolicy, runtime: StrataModelPreparationRuntime,
  options: { resolvedModelDirectory?: string; signal?: AbortSignal; onLog?: (message: string) => void } = {}
): Promise<{ configPath: string; packDirectory: string; receiptPath: string; modelId: string }> {
  if (isStrataDeepSeek(modelId)) return prepareDeepSeekRuntime(settings, policy, runtime, options);
  const t = createNativeTranslator(settings.uiLocale).t;
  validateStrataRuntimePolicy(policy, t);
  if (!validStrataPort(settings.strataPort)) throw new Error(t(uiKeys.strataPreparation.invalidPort));
  const install = path.resolve(resolvedStrataDirectory(settings));
  const key = process.platform === "win32" ? install.toLowerCase() : install;
  if (preparing.has(key)) throw new Error(t(uiKeys.strataPreparation.preparing));
  preparing.add(key);
  let output = "";
  const { signal, onLog } = options;
  const check = () => signal?.throwIfAborted();
  try {
    check();
    const scan = await scanStrataPreparation(settings, runtime.inspect, options.resolvedModelDirectory);
    const profile = scan.profiles.find((candidate) => candidate.id === modelId);
    const geometry = strataModelGeometry(modelId);
    if (!profile) throw new Error(t(uiKeys.strataPreparation.unsupported));
    if (!scan.status.managedInstalled || !scan.status.sourcePresent || !scan.status.enginePresent || !await strataManagedReceipt(install)) throw new Error(t(uiKeys.strataPreparation.installIncomplete));
    if (!profile.available) throw new Error(t(uiKeys.strataPreparation.modelsMissing));
    const shardDirectories = new Set(profile.components.slice(0, geometry.shardCount).map(component => path.resolve(path.dirname(component.matches[0]))));
    if (shardDirectories.size !== 1) throw new Error(t(uiKeys.strataPreparation.shardDirectories));
    const python = path.join(install, ".venv", "Scripts", "python.exe");
    const libs = strataRuntimeLibraries(install);
    for (const filename of [python, ...["iq_pack.py", "strata_tokenizer.py", "gguf_reader.py"].map((name) => path.join(install, "tools", name)),
      ...libs.files.map((name) => path.join(libs.directory, name))]) {
      if (!(await fs.stat(filename).catch(() => null))?.isFile()) throw new Error(t(uiKeys.strataPreparation.dependencyMissing, { file: filename }));
    }
    const data = path.resolve(runtime.dataDirectory ?? strataDerivedDataDirectory());
    const actualData = await physicalPath(data);
    for (const protectedRoot of [install, options.resolvedModelDirectory ?? settings.modelDirectory, scan.status.modelDirectory,
      ...profile.components.filter((component) => component.found).map((component) => path.dirname(component.matches[0]))].filter(Boolean)) {
      const actualRoot = await physicalPath(protectedRoot);
      if (containsPath(actualRoot, actualData) || containsPath(actualData, actualRoot)) throw new Error(t(uiKeys.strataPreparation.directoryOverlap));
    }
    const assets: StrataVerifiedAsset[] = [];
    if (geometry.compatBf16 || profile.components.some((component) => component.optional && component.found)) {
      onLog?.(t(uiKeys.strataPreparation.checkingParser));
      try {
        await runPreparationParserCheck(python, install, runtime, signal, settings.uiLocale);
      } catch {
        check();
        throw new Error(t(uiKeys.strataPreparation.parserMissing));
      }
    }
    for (const component of profile.components.filter((item) => !item.optional)) {
      check(); onLog?.(t(uiKeys.strataPreparation.verifying, { label: component.label }));
      const { bytes, sha256 } = component.installGuide;
      if (!bytes || !sha256) throw new Error(t(uiKeys.strataPreparation.catalogIncomplete));
      let lastPercent = -1;
      assets.push(await (runtime.verifyAsset ?? ((filename, expected, signal, onBytes) => verifyStrataAsset(filename, expected, signal, onBytes, t)))(component.matches[0], { bytes, sha256 }, signal, (verified) => {
        const percent = Math.floor(verified / bytes * 100);
        if (percent !== lastPercent) { lastPercent = percent; onLog?.(`SHA-256 · ${component.label} · ${percent}%`); }
      }));
    }
    const shards = assets.slice(0, geometry.shardCount).map((asset) => asset.filename);
    const run = (args: string[], timeoutMs: number) => runtime.run(python, ["-B", ...args], { cwd: install, timeoutMs, signal, onLog, uiLocale: settings.uiLocale });
    check();
    const header = JSON.parse(await run(["-c", pleInspection, install, ...shards], 120_000));
    if (!Number.isInteger(header.pleShard) || header.pleShard < 0 || header.pleShard >= geometry.shardCount) throw new Error(t(uiKeys.strataPreparation.pleFailed));
    check();
    if (await physicalPath(data) !== actualData) throw new Error(t(uiKeys.strataPreparation.directoryChanged));
    await fs.mkdir(data, { recursive: true });
    output = await fs.mkdtemp(path.join(data, `qwen-flash-next-${modelId.split("-").at(-1)}-`));
    onLog?.(t(uiKeys.strataPreparation.preparingPack, { path: output }));
    onLog?.(t(uiKeys.strataPreparation.modelPreparing, { model: modelId, count: geometry.shardCount, compat: String(geometry.compatBf16) }));
    await run([path.join(install, "tools", "iq_pack.py"), "--gguf", shards[0], "--out", output,
      ...(geometry.compatBf16 ? ["--compat-bf16"] : [])], 600_000);
    check();
    await validatePackFiles(output, modelId, t);
    for (const asset of assets) {
      const current = await fs.stat(asset.filename);
      if (current.size !== asset.bytes || current.mtimeMs !== asset.mtimeMs || current.ctimeMs !== asset.ctimeMs) throw new Error(t(uiKeys.strataPreparation.sourceChanged));
    }
    check();
    const mtpComponent = profile.components.find((component) => component.optional && component.found);
    const mtp: StrataMtpRecord | false = mtpComponent
      ? await prepareStrataMtp({ installDirectory: install, packDirectory: output, filename: mtpComponent.matches[0],
        verifyAsset: runtime.verifyAsset ?? ((filename, expected, signal, onBytes) => verifyStrataAsset(filename, expected, signal, onBytes, t)), run, signal, onLog }, t)
      : false;
    if (!mtp) onLog?.(t(uiKeys.strataPreparation.mtpSkipped));
    const config = buildStrataRuntimeConfig({ installDirectory: install, packDirectory: output, shards, pleShard: shards[header.pleShard],
      projector: assets[geometry.shardCount].filename, modelId, port: settings.strataPort, policy, mtpDirectory: mtp ? mtp.directory : undefined }, t);
    const configPath = path.join(output, "runtime.json");
    const receiptPath = path.join(output, "lvs-strata-model.json");
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), { flag: "wx" });
    check();
    await fs.writeFile(receiptPath, JSON.stringify({ owner: "local-video-studio", schema: 1, modelId, sourceRevision: strataInstalledRelease(install)?.revision ?? STRATA_REVISION,
      modelRevision: geometry.revision, assets, artifacts: await strataPackArtifactFacts(output, modelId), policy, pleShard: header.pleShard, mtp, preparedAt: new Date().toISOString() }, null, 2), { flag: "wx" });
    onLog?.(t(uiKeys.strataPreparation.complete));
    return { configPath, packDirectory: output, receiptPath, modelId };
  } catch (error) {
    if (output) onLog?.(t(uiKeys.strataPreparation.incompleteRetained, { path: output }));
    throw error;
  } finally { preparing.delete(key); }
}

async function runPreparationParserCheck(python: string, install: string, runtime: StrataModelPreparationRuntime, signal?: AbortSignal, uiLocale?: Settings["uiLocale"]): Promise<void> {
  await runtime.run(python, ["-B", "-c",
    "import sys; from pathlib import Path; sys.path.insert(0,str(Path(sys.argv[1])/'tools')); from _paths import add_gguf_py; add_gguf_py(); import gguf; assert hasattr(gguf,'GGUFReader')",
    install], { cwd: install, timeoutMs: 30_000, signal, uiLocale });
}
