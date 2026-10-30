import type { Translate } from "../../src/core/i18n.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
import { createReadStream, promises as fs } from "node:fs";
import { createNativeTranslator } from "../ui-translator.js";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { Settings } from "../../src/types.js";
import { DLSS5_RUNTIME_BUNDLE_ID, AETHERSCALE_RUNTIME_BUNDLE_ID, KONOHAMARU_NODE_ID, KONOHAMARU_VIDEO2DLSSNR_RUNTIME_BUNDLE_ID } from "../../src/core/catalog/index.js";
import { customNodeMaintenanceDefinitions } from "../../src/core/catalog/dependencies/nodes.js";
import { depthAnythingBuiltinMetadataFile, DEPTH_ANYTHING_V2_SMALL_METADATA_RELATIVE_DIRECTORY } from "../../src/infrastructure/depth-anything-metadata.js";
import { konohamaruSoftwareCacheRoots } from "./konohamaru-runtime.js";
import { STRATA_ENGINE_FILES, STRATA_LLAMA_REVISION } from "../../src/core/catalog/dependencies/strata.js";
import { DLSS5_NODE_ID, DLSS5_RETIRED_DESKTOP_ASSET } from "../../src/core/catalog/dependencies/dlss5.js";
import { strataVectorForMode } from "../../src/core/strata-uncensored.js";
import { agentDirectory } from "./strata-agent-settings.js";
import { agentSoftwareCopyTargets } from "./strata-agent-software.js";
import { assertSharedPackagesIdle } from "./strata-agent-npm.js";
import { findComfyRoot } from "./comfy-discovery.js";
import { managedStrataDirectory, physicalPath, containsPath, resolvedStrataDirectory, strataManagedReceipt } from "./strata-installation.js";
import { removeSoftwareArtifact } from "./software-update-cleanup.js";
import { gitSoftwareFiles } from "./software-git-files.js";
import { removeDirectoryTreeWithoutAsar } from "./dlss5-runtime.js";
import { GpuResourceLease } from "./gpu-resource-lease.js";
import { withSoftwareMaintenance } from "./installation-cancellation.js";
import type { AppSoftwareCache, SoftwareCacheTarget } from "./cache-service.js";

const exec = promisify(execFile);
const nativeFs: Pick<typeof import("node:fs"), "promises" | "createReadStream"> = process.versions.electron
  ? createRequire(import.meta.url)("original-fs") : { promises: fs, createReadStream };
const identity = (name: string) => path.resolve(name).toLowerCase();
const repository = (value: string) => value.trim().replace(/\.git\/?$/iu, "").replace(/\/$/u, "").toLowerCase();
interface Candidate extends SoftwareCacheTarget { parent: string; owned?: Set<string>; git?: boolean; vectors?: boolean; package?: boolean; dlss5?: boolean }
interface Options {
  getSettings(): Settings;
  comfyRoot?(settings: Settings): Promise<string>;
  agentRoot?: string;
  withExclusive?<T>(work: () => Promise<T>): Promise<T>;
  assertIdle?(directories: string[]): Promise<void>;
  log?(message: string): void;
}
async function entries(directory: string) {
  const stat = await fs.lstat(directory).catch(() => null);
  return stat?.isDirectory() && !stat.isSymbolicLink() ? fs.readdir(directory, { withFileTypes: true }).catch(() => []) : [];
}
async function smallText(filename: string, t: Translate = createNativeTranslator(undefined).t) {
  const stat = await fs.lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw new Error(t(uiKeys.softwareCache.invalidReceipt));
  return fs.readFile(filename, "utf8");
}
async function sourceMatches(directory: string, url: string, t: Translate = createNativeTranslator(undefined).t) {
  try { return repository(/\[remote "origin"\][^[]*?url\s*=\s*([^\r\n]+)/u.exec(await smallText(path.join(directory, ".git/config"), t))?.[1] ?? "") === repository(url); }
  catch { return false; }
}
/** Unknown local data blocks deletion of that copy; cache cleanup never imports old data into live software. */
async function assertDisposable(candidate: Candidate, t: Translate = createNativeTranslator(undefined).t) {
  const tracked = candidate.git ? await gitSoftwareFiles(candidate.path) : new Set<string>();
  const strataSource = candidate.vectors && await sourceMatches(candidate.path, "https://github.com/Niko1221/Strata", t);
  const visit = async (directory: string, relative = "") => {
    if (candidate.vectors && relative === "third_party/llama.cpp" && await sourceMatches(directory, "https://github.com/ggml-org/llama.cpp", t)
      && (await smallText(path.join(directory, ".git/HEAD"), t).catch(() => "")).trim() === STRATA_LLAMA_REVISION) {
      for (const name of await gitSoftwareFiles(directory)) tracked.add(path.posix.join(relative, name));
    }
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const name = path.posix.join(relative, entry.name), filename = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(t(uiKeys.softwareCache.linkedDirectory, { path: filename }));
      if ([".git", ".venv", "node_modules", "__pycache__"].includes(entry.name)) continue;
      if (entry.isDirectory()) { await visit(filename, name); continue; }
      if (candidate.owned?.has(name)) continue;
      if (candidate.dlss5 && relative === DEPTH_ANYTHING_V2_SMALL_METADATA_RELATIVE_DIRECTORY
        && ["config.json", "preprocessor_config.json"].includes(entry.name)
        && await smallText(filename, t) === depthAnythingBuiltinMetadataFile(entry.name)) continue;
      if (candidate.dlss5 && /^\.dlss5-runtime-staging-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\//iu.test(name)
        && name.slice(name.indexOf("/") + 1) === DLSS5_RETIRED_DESKTOP_ASSET.relativePath) {
        const stat = await nativeFs.promises.lstat(filename);
        if (stat.isFile() && !stat.isSymbolicLink() && stat.size === DLSS5_RETIRED_DESKTOP_ASSET.bytes) {
          const digest = createHash("sha256");
          for await (const chunk of nativeFs.createReadStream(filename)) digest.update(chunk);
          if (digest.digest("hex") === DLSS5_RETIRED_DESKTOP_ASSET.sha256) continue;
        }
      }
      if (strataSource && tracked.has(name) && /^data\/(?:draft_vocab(?:_(?:en|fr|cyrillic))?|expert-profile(?:-(?:coder|sycl))?)\.bin$/u.test(name)) continue;
      if (candidate.vectors && [strataVectorForMode("builtin").relativePath, strataVectorForMode("community").relativePath, "data/lvs-control-vectors/NOTICE.txt"].includes(name)) continue;
      if (tracked.has(name) && /\.(?:png|jpe?g|webp|gif|mp4|mov|wav|mp3|flac)$/iu.test(name)) continue;
      if (/\.(?:gguf|safetensors|ckpt|pt|pth|onnx|bin|sqlite3?|db|mp4|mov|wav|mp3|flac)$/iu.test(name)) throw new Error(t(uiKeys.softwareCache.protectedData, { path: filename }));
      if (tracked.has(name) || candidate.package) continue;
      if (/\.(?:py|pyi|js|mjs|cjs|ts|tsx|jsx|css|html?|md|rst|dll|exe|pyd|lib|h|hpp|c|cpp|cu|cuh|bat|cmd|ps1|pyc|pyo|zip|tgz|addon64)$/iu.test(name)
        || /^(?:requirements[^/]*\.txt|VERSION|LICENSE[^/]*|NOTICE[^/]*|lvs-strata-(?:stage|install)\.json|download\.json)$/u.test(entry.name)) continue;
      if (/\.(?:ini|cfg|json|ya?ml|toml)$/iu.test(name)) throw new Error(t(uiKeys.softwareCache.localConfig, { path: filename }));
      throw new Error(t(uiKeys.softwareCache.unknownData, { path: filename }));
    }
  };
  if ((await fs.lstat(candidate.path)).isDirectory()) await visit(candidate.path);
}

/** Only software roots already managed by this app; no drive-wide scan, network or model hashing. */
export function createManagedSoftwareCache(options: Options): AppSoftwareCache {
  const t: Translate = (key, params, fallback) =>
    createNativeTranslator(options.getSettings().uiLocale).t(key, params, fallback);
  async function discover(): Promise<Candidate[]> {
    const settings = options.getSettings(), candidates: Candidate[] = [];
    const add = async (parent: string, filename: string, proof: string, extra: Partial<Candidate> = {}) => {
      const stat = await fs.lstat(filename).catch(() => null);
      if (!stat || stat.isSymbolicLink()) return;
      const actualParent = await physicalPath(parent), actual = await physicalPath(filename);
      if (identity(actual) === identity(actualParent) || !containsPath(actualParent, actual)) return;
      for (const protectedRoot of [settings.modelDirectory, settings.strataModelDirectory, settings.outputDirectory,
        settings.comfyInstallDirectory ? path.join(settings.comfyInstallDirectory, "models") : ""].filter(Boolean)) {
        const protectedPath = await physicalPath(protectedRoot);
        if (containsPath(actual, protectedPath) || containsPath(protectedPath, actual)) return;
      }
      candidates.push({ path: filename, parent, identity: createHash("sha256").update(`${proof}:${stat.dev}:${stat.ino}:${stat.mtimeMs}:${stat.ctimeMs}`).digest("hex"), ...extra });
    };
    const strataRoot = path.dirname(managedStrataDirectory()), selected = resolvedStrataDirectory(settings);
    const automatic = resolvedStrataDirectory({ strataInstallDirectory: "" });
    const haveCurrent = await strataManagedReceipt(automatic);
    for (const entry of await entries(strataRoot)) {
      if (!entry.isDirectory()) continue;
      const filename = path.join(strataRoot, entry.name);
      if ([selected, automatic, managedStrataDirectory()].some(current => identity(current) === identity(filename))) continue;
      if (/^(?:v\d+\.\d+\.\d+(?:\.\d+)?-[a-f0-9]{8}|runtime)(?:\.(?:backup|failed)-\d+)?$/iu.test(entry.name) && await strataManagedReceipt(filename, false)) {
        if (!haveCurrent && !/\.(?:backup|failed)-\d+$/u.test(entry.name)) continue;
        await add(strataRoot, filename, await smallText(path.join(filename, "lvs-strata-install.json"), t), { git: true, vectors: true, owned: new Set(STRATA_ENGINE_FILES) });
      } else if (/^\.install-[a-z0-9]+$/iu.test(entry.name)) {
        const marker = await smallText(path.join(filename, "lvs-strata-stage.json"), t).catch(() => "{}");
        try { if (JSON.parse(marker).owner === "local-video-studio" || await sourceMatches(filename, "https://github.com/Niko1221/Strata", t)) await add(strataRoot, filename, marker, { git: true, vectors: true, owned: new Set(STRATA_ENGINE_FILES) }); }
        catch { /* Malformed marker is not ownership. */ }
      }
    }
    const downloads = path.join(strataRoot, "downloads");
    for (const entry of await entries(downloads)) {
      if (!entry.isDirectory() || !/^engine-[a-f0-9]{40}-[a-f0-9]{64}$/u.test(entry.name)) continue;
      const filename = path.join(downloads, entry.name);
      try {
        const proof = await smallText(path.join(filename, "download.json"), t), receipt = JSON.parse(proof);
        if (receipt.owner === "local-video-studio" && entry.name === `engine-${receipt.revision}-${receipt.sha256}`) {
          const owned = new Set(["download.json", "engine.zip", ...(await entries(filename)).filter(file => /^engine\.zip\.invalid-\d+$/u.test(file.name)).map(file => file.name)]);
          await add(strataRoot, filename, proof, { owned });
        }
      } catch { /* Not our cache. */ }
    }
    const comfy = await (options.comfyRoot ?? findComfyRoot)(settings);
    if (comfy) {
      const definitions = customNodeMaintenanceDefinitions().filter(node => node.appInstallable !== false || node.retired);
      for (const entry of await entries(path.join(comfy, "node-backups"))) {
        const definition = definitions.find(node => entry.name.startsWith(`${node.directoryName}-`) && /^\d+$/u.test(entry.name.slice(node.directoryName.length + 1)));
        if (!definition || !entry.isDirectory()) continue;
        const filename = path.join(comfy, "node-backups", entry.name);
        if (await sourceMatches(filename, definition.repositoryUrl, t)) await add(comfy, filename, await smallText(path.join(filename, ".git/config"), t), { git: true, dlss5: definition.id === DLSS5_NODE_ID });
        else if (definition.source === "bundled") {
          const version = await smallText(path.join(filename, "VERSION"), t).catch(() => "");
          if (version.trim() && (await fs.lstat(path.join(filename, "__init__.py")).catch(() => null))?.isFile()) await add(comfy, filename, version);
        }
      }
      for (const entry of await entries(path.join(comfy, "custom_nodes"))) {
        const definition = definitions.find(node => entry.name.startsWith(`${node.directoryName}.update-`) && /^[a-f0-9-]{36}$/iu.test(entry.name.slice(node.directoryName.length + 8)));
        const filename = path.join(comfy, "custom_nodes", entry.name);
        if (definition && entry.isDirectory() && await sourceMatches(filename, definition.repositoryUrl, t)) await add(comfy, filename, await smallText(path.join(filename, ".git/config"), t), { git: true, dlss5: definition.id === DLSS5_NODE_ID });
      }
      const konohamaru = definitions.find(node => node.id === KONOHAMARU_NODE_ID);
      if (konohamaru) {
        const node = path.join(comfy, "custom_nodes", konohamaru.directoryName);
        const roots = konohamaruSoftwareCacheRoots(node);
        if (await sourceMatches(node, konohamaru.repositoryUrl, t)) {
          for (const prefix of roots.addons) for (const entry of await entries(path.dirname(prefix))) {
            if (entry.isFile() && entry.name.startsWith(path.basename(prefix)) && /^\d+$/u.test(entry.name.slice(path.basename(prefix).length))) await add(comfy, path.join(path.dirname(prefix), entry.name), prefix);
          }
        }
        for (const entry of await entries(roots.backups)) {
          if (!entry.isDirectory() || !/^\d+-[a-z0-9_-]+$/iu.test(entry.name)) continue;
          const filename = path.join(roots.backups, entry.name);
          try {
            const proof = await smallText(path.join(filename, "install-manifest.json"), t), manifest = JSON.parse(proof);
            if (manifest.schemaVersion === 1 && manifest.bundleId === KONOHAMARU_VIDEO2DLSSNR_RUNTIME_BUNDLE_ID && Array.isArray(manifest.ownedFiles) && manifest.ownedFiles.every((name: unknown) => typeof name === "string" && !name.includes("..") && !path.isAbsolute(name))) await add(comfy, filename, proof, { owned: new Set([...manifest.ownedFiles, "install-manifest.json"]) });
          } catch { /* Unknown backup. */ }
        }
      }
      for (const [folder, manifestName, accepts] of [
        ["dlss5-runtime-backups", "install-manifest.json", (value: Record<string, unknown>) => value.bundleId === DLSS5_RUNTIME_BUNDLE_ID],
        ["aetherscale-carrier-backups", "carrier_manifest.json", (value: Record<string, unknown>) => value.provider === "aetherscale-carrier" && value.bundleId === AETHERSCALE_RUNTIME_BUNDLE_ID]
      ] as const) {
        for (const entry of await entries(path.join(comfy, folder))) {
          if (!entry.isDirectory() || !/^\d+-[a-z0-9_-]+$/iu.test(entry.name)) continue;
          const filename = path.join(comfy, folder, entry.name);
          try {
            const proof = await smallText(path.join(filename, manifestName), t), manifest = JSON.parse(proof);
            if (manifest.schemaVersion === 1 && accepts(manifest) && Array.isArray(manifest.ownedFiles) && manifest.ownedFiles.every((name: unknown) => typeof name === "string" && !name.includes("..") && !path.isAbsolute(name)))
              await add(comfy, filename, proof, { owned: new Set([...manifest.ownedFiles, manifestName]) });
          } catch { /* Unknown runtime. */ }
        }
      }
    }
    const agent = options.agentRoot ?? agentDirectory();
    for (const filename of await agentSoftwareCopyTargets(agent)) await add(agent, filename, "agent-install-plan", { package: true });
    return candidates;
  }
  async function withCleanup<T>(work: () => Promise<T>): Promise<T> {
    if (options.withExclusive) return options.withExclusive(work);
    return withSoftwareMaintenance(async () => {
      const lease = new GpuResourceLease("studio", async () => false, { allowHandoff: false });
      await lease.acquire();
      try {
        await (options.assertIdle ?? assertSharedPackagesIdle)((await discover()).map(candidate => candidate.path));
        return await work();
      } finally { await lease.release(); }
    }, options.getSettings().uiLocale);
  }
  return {
    inspect: discover,
    withCleanup,
    clear: async target => {
      try {
      const fresh = (await discover()).find(candidate => identity(candidate.path) === identity(target.path) && candidate.identity === target.identity);
      if (!fresh) throw new Error(t(uiKeys.softwareCache.ownershipChanged, { path: target.path }));
      await assertDisposable(fresh, t);
      const messages: string[] = [];
      const removed = await removeSoftwareArtifact(fresh.parent, fresh.path, message => { messages.push(message); options.log?.(message); }, removeDirectoryTreeWithoutAsar, createNativeTranslator(options.getSettings().uiLocale).t);
      if (!removed) throw new Error(messages.at(-1) ?? t(uiKeys.softwareCache.failed));
      } catch (error) { options.log?.(t(uiKeys.softwareCache.cacheRetained, { reason: error instanceof Error ? error.message : String(error) })); throw error; }
    }
  };
}
