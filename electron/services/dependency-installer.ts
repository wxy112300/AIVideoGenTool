import { createNativeTranslator } from "../ui-translator.js";
import type { Translate } from "../../src/core/i18n.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
import crypto from "node:crypto";
import { checkInstallationCancelled } from "./installation-cancellation.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  AETHERSCALE_NODE_ID,
  customNodeDefinition,
  DLSS5_NODE_ID,
  KONOHAMARU_NODE_ID,
  KONOHAMARU_NEURAL_UPSTREAM_ADDON,
  KONOHAMARU_RUNTIME_FILES
} from "../../src/core/catalog/index.js";
import type { CustomNodeInstallMode, Settings } from "../../src/types.js";
import {
  dlss5DepthAnythingPatchFiles,
  patchH3PromptWriterSource,
  patchAetherScaleCarrierSource,
  aetherScaleCarrierPatchFiles,
  konohamaruNeuralUpstreamPatchFiles,
  KONOHAMARU_VIDEO2DLSSNR_SOURCE_FILENAME,
  konohamaruVideo2dlssnrSource,
  patchKonohamaruNeuralUpstreamSource,
  patchDlss5DepthAnythingSource,
  patchMmh3UltimateUpscaleSource,
  patchMultimodalPromptContextSize,
  patchMultimodalPromptProjectorDiscovery,
  patchMultimodalPromptQwen38Recognition,
  patchMultimodalPromptResidency,
  patchQwenVlComfyDesktopLogging,
  prepareDlss5DepthAnything,
  prepareKonohamaruNeuralUpstream,
  prepareAetherScaleCarrier,
  prepareH3PromptWriter,
  prepareMmh3UltimateUpscale,
  prepareH3Gguf,
  h3GgufInitSource,
  prepareLtxVideo,
  prepareMultimodalPromptNodes,
  prepareQwenVlComfyDesktopLogging,
  prepareVideoHelperSuite
} from "../../src/infrastructure/dependency-node-adapters.js";
import { depthAnythingBuiltinMetadataFile } from "../../src/infrastructure/depth-anything-metadata.js";
import { installLlamaCppPythonPackage } from "./llama-cpp-python.js";
import { pythonProbeCache } from "./python-probe-cache.js";
import { isLocalComfyUrl } from "./comfy-endpoint.js";
import { removeDirectoryTreeWithoutAsar } from "./dlss5-runtime.js";
import { preserveSoftwareUserData, removeSoftwareArtifact } from "./software-update-cleanup.js";
import { installAetherScaleRuntime, uninstallAetherScaleRuntime } from "./aetherscale-runtime.js";
import {
  installKonohamaruNeuralUpstreamRuntime,
  installKonohamaruVideo2dlssnrRuntime
} from "./konohamaru-runtime.js";

function normalizedRepositoryUrl(value: string): string {
  return value.trim().replace(/\/+$/u, "").replace(/\.git$/iu, "").toLowerCase();
}

function normalizedGitRevision(value: string): string {
  return value.trim().split(/\r?\n/u)[0]?.trim().toLowerCase() ?? "";
}

/** Modified tracked settings can be user data; only untouched tracked assets are disposable. */
async function downloadableNodeFiles(git: string, directory: string, runtime: DependencyInstallerRuntime, env: NodeJS.ProcessEnv) {
  try {
    const [tracked, changed] = await Promise.all([
      runtime.runLoggedProcess(git, ["-C", directory, "ls-files", "-z"], { timeoutMs: 30_000, env }),
      runtime.runLoggedProcess(git, ["-C", directory, "diff", "--name-only", "--no-renames", "-z", "HEAD", "--"], { timeoutMs: 30_000, env })
    ]);
    const modified = new Set(changed.split("\0"));
    return tracked.split("\0").filter(name => name && !modified.has(name));
  } catch { return []; } // Unknown provenance must not authorize deleting local data.
}

/**
 * Git for Windows keeps its own long-path switch even when the Windows
 * long-path policy is enabled.  Keep this scoped to the installer process so
 * node installation works for users who have never configured Git globally,
 * and so pip's VCS builds inherit the same setting for their submodules.
 */
export function withWindowsGitLongPaths(
  environment: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform
): NodeJS.ProcessEnv {
  if (platform !== "win32") return environment;
  return {
    ...environment,
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "core.longpaths",
    GIT_CONFIG_VALUE_0: "true"
  };
}

export async function removeTemporaryNodeCheckout(
  directory: string,
  report: (message: string) => void,
  remove: typeof fs.rm = fs.rm,
  t: Translate = createNativeTranslator(undefined).t
): Promise<void> {
  try {
    await remove(directory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? "unknown";
    if (!["EACCES", "EBUSY", "ENOTEMPTY", "EPERM"].includes(code)) throw error;
    report(t(uiKeys.nodeInstaller.temporaryLocked, { directory: directory, code: code }));
  }
}

function installationFailureMessage(error: unknown, details: string, t: Translate): string {
  const fallback = error instanceof Error ? error.message : String(error);
  if (/filename too long|unable to create file|unable to checkout/iu.test(details)) {
    return t(uiKeys.nodeInstaller.longPathFailed, { reason: fallback });
  }
  return fallback;
}

function sharedLlamaRequirementPackages(source: string): {
  packages: string[];
  skippedLlama: number;
  skippedOptions: number;
} {
  const packages: string[] = [];
  let skippedLlama = 0;
  let skippedOptions = 0;
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.replace(/\s+#.*$/u, "").trim();
    if (!line || line.startsWith("#")) continue;
    if (/llama-cpp-python/iu.test(line)) {
      skippedLlama += 1;
      continue;
    }
    // Include files and index flags are intentionally not passed through the
    // shared-runtime path. The registered prompt nodes only use ordinary
    // package requirements; leaving these options out prevents a node update
    // from changing pip's global index or pulling a second backend.
    if (line.startsWith("-") || line.startsWith("--")) {
      skippedOptions += 1;
      continue;
    }
    packages.push(line);
  }
  return { packages, skippedLlama, skippedOptions };
}

export const h3PromptWriterPatchFiles = [
  "backend/models/gguf_adapters.py",
  "backend/models/gguf_backend.py",
  "backend/models/gguf/_backend.py",
  "backend/assembly.py",
  "backend/catalog.py",
  "backend/context.py",
  "backend/h3_pipeline.py",
  "backend/runtime_diagnostics.py"
] as const;
const multimodalPromptPatchFiles = ["vision_llm_node.py", "local_gguf_utils.py"] as const;
const qwenVlPatchFiles = ["nodes.py"] as const;
const mmh3PatchFiles = ["nodes/nodes.py"] as const;

function normalizeGitSource(source: string): string {
  return source.replace(/\r\n?/gu, "\n").replace(/\s+$/u, "");
}

function gitStatusPath(line: string): string {
  const value = line.slice(3).trim().replace(/^"|"$/gu, "");
  const renameSeparator = value.lastIndexOf(" -> ");
  return renameSeparator >= 0 ? value.slice(renameSeparator + 4) : value;
}

function isKonohamaruManagedRuntimePath(filename: string): boolean {
  const normalized = filename.replaceAll("\\", "/").toLowerCase();
  return normalized === "bin/runtime/host/renodx-dlss5.addon64" ||
    normalized.startsWith("bin/runtime/host/renodx-dlss5.addon64.disabled-") ||
    normalized === "bin/runtime/host/nvngx.dll.addon64" ||
    normalized.startsWith("bin/runtime/video2dlssnr/") ||
    normalized.startsWith("bin/runtime/video2dlssnr-backups/");
}

/**
 * The H3 compatibility shim is intentionally applied inside the node checkout
 * because the upstream Python imports need to see it at runtime. That makes
 * Git report the checkout as dirty. Compare the current files with the exact
 * output of our patch against HEAD so a future update can distinguish this
 * known change from a user's/manual edit.
 */
async function nodeHasOnlyAppPatch(
  nodeId: string,
  targetDirectory: string,
  statusOutput: string,
  git: string,
  runtime: DependencyInstallerRuntime,
  commandEnvironment: NodeJS.ProcessEnv
): Promise<boolean> {
  const patchFiles: readonly string[] = nodeId === "minimax-h3-prompt-writer"
    ? h3PromptWriterPatchFiles
    : nodeId === "comfyui-gguf-h3"
      ? ["__init__.py"]
    : nodeId === "comfyui-multimodal-prompt-nodes"
      ? multimodalPromptPatchFiles
      : nodeId === "comfyui-qwenvl-lora"
      ? qwenVlPatchFiles
      : nodeId === "mmh3-ultimate-upscale"
        ? mmh3PatchFiles
      : nodeId === DLSS5_NODE_ID
          ? dlss5DepthAnythingPatchFiles
      : nodeId === AETHERSCALE_NODE_ID
            ? aetherScaleCarrierPatchFiles
          : nodeId === KONOHAMARU_NODE_ID
            ? konohamaruNeuralUpstreamPatchFiles
          : [];
  const paths = statusOutput
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map(gitStatusPath);
  if (!paths.length || paths.some((filename) =>
    !patchFiles.includes(filename) &&
    !(nodeId === KONOHAMARU_NODE_ID && isKonohamaruManagedRuntimePath(filename))
  )) {
    return false;
  }
  for (const filename of paths) {
    if (nodeId === KONOHAMARU_NODE_ID && isKonohamaruManagedRuntimePath(filename)) continue;
    const current = await fs.readFile(path.join(targetDirectory, filename), "utf8").catch(() => null);
    if (current === null) return false;
    let expected = "";
    if (nodeId === "comfyui-gguf-h3") {
      expected = h3GgufInitSource;
    } else if (nodeId === DLSS5_NODE_ID && filename !== "nodes.py") {
      expected = depthAnythingBuiltinMetadataFile(path.basename(filename));
    } else if (
      nodeId === KONOHAMARU_NODE_ID &&
      filename === KONOHAMARU_VIDEO2DLSSNR_SOURCE_FILENAME
    ) {
      expected = konohamaruVideo2dlssnrSource;
    } else {
      let baseline = "";
      try {
        baseline = await runtime.runLoggedProcess(
          git,
          ["-C", targetDirectory, "show", `HEAD:${filename}`],
          { timeoutMs: 30_000, env: commandEnvironment }
        );
      } catch {
        return false;
      }
      expected = nodeId === "minimax-h3-prompt-writer"
        ? patchH3PromptWriterSource(baseline)
        : nodeId === "comfyui-multimodal-prompt-nodes"
          ? filename === "local_gguf_utils.py"
            ? patchMultimodalPromptProjectorDiscovery(baseline)
            : patchMultimodalPromptResidency(
                patchMultimodalPromptQwen38Recognition(
                  patchMultimodalPromptContextSize(baseline)
                )
              )
          : nodeId === "comfyui-qwenvl-lora"
            ? patchQwenVlComfyDesktopLogging(baseline)
          : nodeId === "mmh3-ultimate-upscale"
              ? patchMmh3UltimateUpscaleSource(baseline)
          : nodeId === AETHERSCALE_NODE_ID
                ? patchAetherScaleCarrierSource(baseline)
          : nodeId === KONOHAMARU_NODE_ID
                  ? patchKonohamaruNeuralUpstreamSource(baseline, filename)
                  : patchDlss5DepthAnythingSource(baseline);
    }
    if (normalizeGitSource(current) !== normalizeGitSource(expected)) return false;
  }
  return true;
}

async function h3PromptWriterUpstreamUnchanged(
  targetDirectory: string,
  git: string,
  runtime: DependencyInstallerRuntime,
  commandEnvironment: NodeJS.ProcessEnv
): Promise<boolean | null> {
  try {
    const localHead = (await runtime.runLoggedProcess(
      git,
      ["-C", targetDirectory, "rev-parse", "HEAD"],
      { timeoutMs: 30_000, env: commandEnvironment }
    )).trim().toLowerCase();
    const remoteHead = (await runtime.runLoggedProcess(
      git,
      ["-C", targetDirectory, "ls-remote", "origin", "HEAD"],
      { timeoutMs: 45_000, env: commandEnvironment }
    )).trim().match(/^([0-9a-f]{7,40})\s+/imu)?.[1]?.toLowerCase() ?? "";
    if (!/^[0-9a-f]{7,40}$/iu.test(localHead) || !remoteHead) return null;
    return localHead === remoteHead;
  } catch {
    return null;
  }
}

async function validateH3PromptWriterPythonSyntax(
  targetDirectory: string,
  python: string,
  runtime: DependencyInstallerRuntime,
  commandEnvironment: NodeJS.ProcessEnv,
  t: Translate
): Promise<void> {
  const filenames = (
    await Promise.all(h3PromptWriterPatchFiles.map(async (filename) => {
      const absolutePath = path.join(targetDirectory, filename);
      return await runtime.exists(absolutePath) ? absolutePath : "";
    }))
  ).filter(Boolean);
  if (!filenames.length) {
    throw new Error(t(uiKeys.nodeInstaller.pythonSourcesMissing));
  }
  await runtime.runLoggedProcess(
    python,
    [
      "-c",
      "import ast,pathlib,sys; [ast.parse(pathlib.Path(p).read_text(encoding='utf-8'), filename=p) for p in sys.argv[1:]]",
      ...filenames
    ],
    { timeoutMs: 30_000, env: commandEnvironment }
  );
}

export interface DependencyInstallerRuntime {
  downloadEnvironment(settings: Settings, comfyRoot?: string): NodeJS.ProcessEnv;
  proxyLogLabel(settings: Settings): string;
  findComfyRoot(settings: Settings): Promise<string>;
  findExecutable(command: string): Promise<string>;
  findComfyPython(settings: Settings, comfyRoot: string): Promise<string>;
  /** Resolve an app-owned node package without treating it as a Git checkout. */
  resolveBundledNodeDirectory?(nodeId: string, directoryName: string): Promise<string>;
  exists(filename: string): Promise<boolean>;
  retryableRenameError(error: unknown): boolean;
  renameWithRetry(
    source: string,
    target: string
  ): Promise<void>;
  runLoggedProcess(
    executable: string,
    args: string[],
    options: {
      cwd?: string;
      env?: NodeJS.ProcessEnv;
      timeoutMs?: number;
      signal?: AbortSignal;
      onLog?: (message: string) => void;
    }
  ): Promise<string>;
  /** Optional app-managed runtime transaction for the DLSS5 node. */
  installDlss5Runtime?(
    settings: Settings,
    comfyRoot: string,
    nodeDirectory: string,
    onLog?: (message: string) => void
  ): Promise<{ ok: boolean; message: string; log?: string }>;
  /** Optional app-managed neural-upstream add-on transaction for Konohamaru. */
  installKonohamaruNeuralUpstreamRuntime?(
    settings: Settings,
    comfyRoot: string,
    nodeDirectory: string,
    onLog?: (message: string) => void
  ): Promise<{ ok: boolean; message: string; log?: string }>;
  /** Optional app-managed video2dlssnr temporal backend transaction for Konohamaru. */
  installKonohamaruVideo2dlssnrRuntime?(
    settings: Settings,
    comfyRoot: string,
    nodeDirectory: string,
    onLog?: (message: string) => void
  ): Promise<{ ok: boolean; message: string; log?: string }>;
  /** Optional app-managed carrier transaction for the AetherScale node. */
  installAetherScaleRuntime?(
    settings: Settings,
    comfyRoot: string,
    nodeDirectory: string,
    onLog?: (message: string) => void
  ): Promise<{ ok: boolean; message: string; log?: string }>;
  uninstallAetherScaleRuntime?(
    settings: Settings,
    comfyRoot: string,
    nodeDirectory?: string,
    onLog?: (message: string) => void
  ): Promise<{ ok: boolean; message: string; log?: string }>;
}

async function ensurePinnedGitRevision(
  git: string,
  targetDirectory: string,
  revision: string,
  runtime: DependencyInstallerRuntime,
  commandEnvironment: NodeJS.ProcessEnv,
  report: (message: string) => void,
  t: Translate
): Promise<void> {
  const expectedRevision = normalizedGitRevision(revision);
  if (!expectedRevision) throw new Error(t(uiKeys.nodeInstaller.pinMissing));
  report(t(uiKeys.nodeInstaller.pinning, { revision: expectedRevision }));
  await runtime.runLoggedProcess(
    git,
    ["-C", targetDirectory, "fetch", "--depth", "1", "origin", expectedRevision],
    { timeoutMs: 300_000, env: commandEnvironment, onLog: report }
  );
  await runtime.runLoggedProcess(
    git,
    ["-C", targetDirectory, "checkout", "--detach", expectedRevision],
    { timeoutMs: 120_000, env: commandEnvironment, onLog: report }
  );
  const actualRevision = normalizedGitRevision(await runtime.runLoggedProcess(
    git,
    ["-C", targetDirectory, "rev-parse", "HEAD"],
    { timeoutMs: 30_000, env: commandEnvironment }
  ));
  if (actualRevision !== expectedRevision) {
    throw new Error(
      t(uiKeys.nodeInstaller.pinMismatch, { actual: actualRevision || t(uiKeys.nodeInstaller.unread), expected: expectedRevision })
    );
  }
  report(t(uiKeys.nodeInstaller.pinVerified, { revision: actualRevision }));
}

function isGitLfsPointer(bytes: Buffer): boolean {
  return bytes
    .subarray(0, 160)
    .toString("utf8")
    .startsWith("version https://git-lfs.github.com/spec/v1");
}

/**
 * Konohamaru ships native DLSS5 assets through Git LFS. A successful git
 * checkout is not sufficient: without LFS the files are tiny pointer text
 * files and the ComfyUI node only fails much later during execution.
 */
export async function verifyKonohamaruRuntimeArtifacts(
  targetDirectory: string,
  t: Translate = createNativeTranslator(undefined).t
): Promise<void> {
  const problems: string[] = [];
  for (const relativeFilename of KONOHAMARU_RUNTIME_FILES) {
    if (relativeFilename === `bin/runtime/host/${KONOHAMARU_NEURAL_UPSTREAM_ADDON}`) continue;
    const filename = path.join(targetDirectory, ...relativeFilename.split("/"));
    try {
      const bytes = await fs.readFile(filename);
      if (!bytes.byteLength || isGitLfsPointer(bytes)) {
        problems.push(`${relativeFilename}（Git LFS pointer）`);
      }
    } catch {
      problems.push(t(uiKeys.nodeInstaller.fileMissing, { file: relativeFilename }));
    }
  }
  if (problems.length) {
    throw new Error(
      t(uiKeys.nodeInstaller.lfsIncomplete, { files: problems.join(t(uiKeys.nodeInstaller.listSeparator)) })
    );
  }
}

async function installBundledNodePackage(
  nodeId: string,
  definition: NonNullable<ReturnType<typeof customNodeDefinition>>,
  targetDirectory: string,
  comfyRoot: string,
  runtime: DependencyInstallerRuntime,
  report: (message: string) => void,
  t: Translate
): Promise<string> {
  const sourceDirectory = await runtime.resolveBundledNodeDirectory?.(
    nodeId,
    definition.directoryName
  ) ?? path.resolve(process.cwd(), "comfy_nodes", definition.directoryName);
  const packageMarker = path.join(sourceDirectory, "__init__.py");
  if (!await runtime.exists(packageMarker)) {
    throw new Error(t(uiKeys.nodeInstaller.bundledMissing, { path: sourceDirectory }));
  }
  const packageRevision = (await fs.readFile(path.join(sourceDirectory, "VERSION"), "utf8"))
    .trim();
  if (definition.installRevision && packageRevision !== definition.installRevision) {
    throw new Error(
      t(uiKeys.nodeInstaller.bundledMismatch, { actual: packageRevision || t(uiKeys.nodeInstaller.unread), expected: definition.installRevision })
    );
  }

  const replacementDirectory = `${targetDirectory}.update-${crypto.randomUUID()}`;
  const backupRoot = path.join(comfyRoot, "node-backups");
  const backupDirectory = path.join(
    backupRoot,
    `${definition.directoryName}-${Date.now()}`
  );
  report(t(uiKeys.nodeInstaller.bundledCopy, { path: sourceDirectory }));
  let targetExists = false;
  let targetMovedToBackup = false;
  try {
    await fs.cp(sourceDirectory, replacementDirectory, {
      recursive: true,
      force: false,
      errorOnExist: true
    });
    await fs.mkdir(backupRoot, { recursive: true });
    targetExists = await runtime.exists(targetDirectory);
    if (targetExists) {
      const files = (await fs.readdir(sourceDirectory, { recursive: true, withFileTypes: true }))
        .filter(entry => entry.isFile()).map(entry => path.relative(sourceDirectory, path.join(entry.parentPath, entry.name)).replaceAll("\\", "/"));
      await preserveSoftwareUserData(targetDirectory, replacementDirectory, [], undefined, files, t);
    }
    checkInstallationCancelled();
    if (targetExists) {
      await runtime.renameWithRetry(targetDirectory, backupDirectory);
      targetMovedToBackup = true;
    }
    try {
      await runtime.renameWithRetry(replacementDirectory, targetDirectory);
    } catch (error) {
      if (!runtime.retryableRenameError(error)) throw error;
      report(t(uiKeys.nodeInstaller.bundledCopyFallback));
      await fs.cp(replacementDirectory, targetDirectory, {
        recursive: true,
        force: false,
        errorOnExist: true
      });
    }
    report(t(uiKeys.nodeInstaller.bundledInstalled, { name: definition.name }));
    return targetExists ? backupDirectory : "";
  } catch (error) {
    if (targetMovedToBackup) {
      await fs
        .rm(targetDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
        .catch(() => undefined);
      if (await runtime.exists(backupDirectory)) {
        await runtime.renameWithRetry(backupDirectory, targetDirectory).catch(() => undefined);
      }
    }
    throw error;
  } finally {
    await removeTemporaryNodeCheckout(replacementDirectory, report, undefined, t);
  }
}

async function installCustomNodePackageUnlocked(
  nodeId: string,
  settings: Settings,
  runtime: DependencyInstallerRuntime,
  onLog?: (message: string) => void,
  mode: CustomNodeInstallMode = "install"
): Promise<{ ok: boolean; message: string; log?: string }> {
  const t = createNativeTranslator(settings.uiLocale).t;
  const definition = customNodeDefinition(nodeId);
  if (!definition) return { ok: false, message: t(uiKeys.nodeInstaller.unknownInstall) };
  if (definition.retired) {
    return {
      ok: false,
      message: t(uiKeys.nodeInstaller.archived, { name: definition.name })
    };
  }
  if (!isLocalComfyUrl(settings.comfyUrl)) {
    return {
      ok: false,
      message: t(uiKeys.nodeInstaller.remoteInstall)
    };
  }
  if (definition.appInstallable === false) {
    return {
      ok: false,
      message: t(uiKeys.nodeInstaller.manualInstall, { name: definition.name })
    };
  }

  const installLog: string[] = [];
  const report = (message: string) => {
    const normalized = message.trim();
    if (!normalized) return;
    installLog.push(normalized);
    onLog?.(normalized);
  };
  const replaced: { parent: string; backup: string; target: string }[] = [];
  try {
    report(runtime.proxyLogLabel(settings));
    if (process.platform === "win32") {
      report(t(uiKeys.nodeInstaller.longPaths));
    }
    report(t(uiKeys.nodeInstaller.locating));
    const comfyRoot = await runtime.findComfyRoot(settings);
    if (!comfyRoot) throw new Error(t(uiKeys.nodeInstaller.dataMissing));
    const commandEnvironment = withWindowsGitLongPaths(
      runtime.downloadEnvironment(settings, comfyRoot)
    );
    const isMultimodalPromptNodes = definition.id === "comfyui-multimodal-prompt-nodes";
    const isQwenVlPeftNode = definition.id === "comfyui-qwenvl-lora";
    const usesSharedLlamaRuntime = isMultimodalPromptNodes ||
      definition.id === "minimax-h3-prompt-writer";
    const customNodesDirectory = path.join(comfyRoot, "custom_nodes");
    const targetDirectory = path.join(customNodesDirectory, definition.directoryName);
    await fs.mkdir(customNodesDirectory, { recursive: true });
    let videoHelperPrepared = false;
    let h3GgufPrepared = false;
    let h3PromptWriterPrepared = false;
    let dlss5Prepared = false;
    let aetherScalePrepared = false;

    if (definition.source === "bundled") {
      const backup = await installBundledNodePackage(
        nodeId,
        definition,
        targetDirectory,
        comfyRoot,
        runtime,
        report,
        t
      );
      if (backup) replaced.push({ parent: comfyRoot, backup, target: targetDirectory });
    } else {
      const git = await runtime.findExecutable("git.exe");
      if (!git) throw new Error(t(uiKeys.nodeInstaller.gitMissing));
      if (definition.requiresGitLfs) {
        report(t(uiKeys.nodeInstaller.checkingLfs));
        await runtime.runLoggedProcess(
          git,
          ["lfs", "version"],
          { timeoutMs: 30_000, env: commandEnvironment, onLog: report }
        );
      }
      if (await runtime.exists(targetDirectory)) {
      const isGitDirectory = await runtime.exists(path.join(targetDirectory, ".git"));
      let repositoryMatches = false;
      let repositoryStatusChecked = false;
      let repositoryDirty = false;
      let reuseAppPatchedRepository = false;
      let pinnedRevisionMatches = !definition.installRevision;
      if (isGitDirectory && definition.id !== "seedvr2") {
        const origin = await runtime.runLoggedProcess(
          git,
          ["-C", targetDirectory, "remote", "get-url", "origin"],
          { timeoutMs: 30_000, env: commandEnvironment }
        ).catch(() => "");
        repositoryMatches = normalizedRepositoryUrl(origin) ===
          normalizedRepositoryUrl(definition.repositoryUrl);
        if (repositoryMatches && definition.installRevision) {
          const currentRevision = await runtime.runLoggedProcess(
            git,
            ["-C", targetDirectory, "rev-parse", "HEAD"],
            { timeoutMs: 30_000, env: commandEnvironment }
          ).catch(() => "");
          pinnedRevisionMatches = normalizedGitRevision(currentRevision) ===
            normalizedGitRevision(definition.installRevision);
          if (!pinnedRevisionMatches) {
            report(
              t(uiKeys.nodeInstaller.pinReplace, { revision: definition.installRevision })
            );
          }
        }
      }
      if (isGitDirectory && repositoryMatches && definition.id !== "seedvr2") {
        try {
          const status = await runtime.runLoggedProcess(
            git,
            ["-C", targetDirectory, "status", "--porcelain", "--untracked-files=all"],
            { timeoutMs: 30_000, env: commandEnvironment }
          );
          repositoryStatusChecked = true;
          repositoryDirty = Boolean(status.trim());
          if (repositoryDirty) {
            const appPatchOnly = [
              "minimax-h3-prompt-writer",
              "comfyui-gguf-h3",
              "comfyui-multimodal-prompt-nodes",
              "comfyui-qwenvl-lora",
              "mmh3-ultimate-upscale",
              DLSS5_NODE_ID,
              AETHERSCALE_NODE_ID,
              KONOHAMARU_NODE_ID
            ].includes(definition.id) &&
              await nodeHasOnlyAppPatch(
                definition.id,
                targetDirectory,
                status,
                git,
                runtime,
                commandEnvironment
              );
            if (appPatchOnly) {
              const upstreamUnchanged = definition.installRevision
                ? pinnedRevisionMatches
                : await h3PromptWriterUpstreamUnchanged(
                    targetDirectory,
                    git,
                    runtime,
                    commandEnvironment
                  );
              if (upstreamUnchanged === true) {
                reuseAppPatchedRepository = true;
                report(
                  definition.installRevision
                    ? t(uiKeys.nodeInstaller.keepPinnedPatch)
                    : t(uiKeys.nodeInstaller.keepCurrentPatch)
                );
              } else if (upstreamUnchanged === false) {
                report(
                  definition.installRevision
                    ? t(uiKeys.nodeInstaller.replacePinCleanup)
                    : t(uiKeys.nodeInstaller.writerUpdateCleanup)
                );
              } else {
                report(
                  definition.installRevision
                    ? t(uiKeys.nodeInstaller.unknownPinCleanup)
                    : t(uiKeys.nodeInstaller.unknownWriterCleanup)
                );
              }
            } else {
              report(
                t(uiKeys.nodeInstaller.localChangesCleanup)
              );
            }
          }
        } catch {
          checkInstallationCancelled();
          // A status probe failure must never turn into an in-place pull. The
          // replacement path below is copy/backup based and is recoverable.
          report(
            t(uiKeys.nodeInstaller.unknownStateCleanup)
          );
        }
      }
      const replaceExistingCheckout = async (reason: string): Promise<void> => {
        const replacementDirectory = `${targetDirectory}.update-${crypto.randomUUID()}`;
        const backupRoot = path.join(comfyRoot, "node-backups");
        const backupDirectory = path.join(
          backupRoot,
          `${definition.directoryName}-${Date.now()}`
        );
        report(reason);
        try {
          const gitOutput = await runtime.runLoggedProcess(
            git,
            [
              "clone",
              "--progress",
              "--depth",
              "1",
              ...(definition.installRevision ? ["--no-checkout"] : []),
              definition.repositoryUrl,
              replacementDirectory
            ],
            {
              timeoutMs: 600_000,
              env: commandEnvironment,
              onLog: report
            }
          );
          if (!gitOutput) report(t(uiKeys.nodeInstaller.cloned));
          if (definition.installRevision) {
            await ensurePinnedGitRevision(
              git,
              replacementDirectory,
              definition.installRevision,
              runtime,
              commandEnvironment,
              report,
              t
            );
          }
          if (definition.id === "comfyui-gguf-h3") {
            report(t(uiKeys.nodeInstaller.applyH3));
            await prepareH3Gguf(replacementDirectory, report, t);
            h3GgufPrepared = true;
          } else if (definition.id === "video-helper-suite") {
            report(t(uiKeys.nodeInstaller.applyVhs));
            await prepareVideoHelperSuite(replacementDirectory, report, t);
            videoHelperPrepared = true;
          } else if (definition.id === "minimax-h3-prompt-writer") {
            report(t(uiKeys.nodeInstaller.checkWriter));
            await prepareH3PromptWriter(replacementDirectory, report, t);
            const python = await runtime.findComfyPython(settings, comfyRoot);
            if (!python) throw new Error(t(uiKeys.nodeInstaller.pythonMissing));
            report(t(uiKeys.nodeInstaller.validateWriter));
            await validateH3PromptWriterPythonSyntax(
              replacementDirectory,
              python,
              runtime,
              commandEnvironment,
              t
            );
            h3PromptWriterPrepared = true;
          } else if (definition.id === "mmh3-ultimate-upscale") {
            report(t(uiKeys.nodeInstaller.applyMmh3));
            await prepareMmh3UltimateUpscale(replacementDirectory, report, t);
          } else if (definition.id === DLSS5_NODE_ID) {
            report(t(uiKeys.nodeInstaller.applyDepth));
            await prepareDlss5DepthAnything(replacementDirectory, report, t);
            dlss5Prepared = true;
          } else if (definition.id === AETHERSCALE_NODE_ID) {
            report(t(uiKeys.nodeInstaller.applyCarrier));
            await prepareAetherScaleCarrier(replacementDirectory, report, t);
            aetherScalePrepared = true;
          }
          await fs.mkdir(backupRoot, { recursive: true });
          checkInstallationCancelled();
          await preserveSoftwareUserData(targetDirectory, replacementDirectory, [], undefined, await downloadableNodeFiles(git, targetDirectory, runtime, commandEnvironment), t);
          await runtime.renameWithRetry(targetDirectory, backupDirectory);
          try {
            try {
              await runtime.renameWithRetry(replacementDirectory, targetDirectory);
            } catch (error) {
              if (!runtime.retryableRenameError(error)) throw error;
              report(
                t(uiKeys.nodeInstaller.copyFallback)
              );
              await fs.cp(replacementDirectory, targetDirectory, {
                recursive: true,
                force: false,
                errorOnExist: true
              });
            }
          } catch (error) {
            await fs
              .rm(targetDirectory, {
                recursive: true,
                force: true,
                maxRetries: 5,
                retryDelay: 200
              })
              .catch(() => undefined);
            await runtime.renameWithRetry(backupDirectory, targetDirectory).catch(
              () => undefined
            );
            throw error;
          }
          replaced.push({ parent: comfyRoot, backup: backupDirectory, target: targetDirectory });
          report(t(uiKeys.nodeInstaller.stagedOld));
        } finally {
          await removeTemporaryNodeCheckout(replacementDirectory, report, undefined, t);
        }
      };
      if (mode === "reinstall") {
        await replaceExistingCheckout(
          t(uiKeys.nodeInstaller.cleanReinstall)
        );
      } else if (reuseAppPatchedRepository) {
        // The directory already contains the exact app-managed compatibility
        // patch and either matches its catalog pin or has an unchanged remote
        // HEAD. Continue with the normal dependency/runtime checks below
        // without creating another backup.
      } else if (
        definition.installRevision &&
        isGitDirectory &&
        repositoryMatches &&
        pinnedRevisionMatches &&
        repositoryStatusChecked &&
        !repositoryDirty
      ) {
        report(t(uiKeys.nodeInstaller.pinnedSkip, { revision: definition.installRevision }));
      } else if (
        isGitDirectory &&
        repositoryMatches &&
        repositoryStatusChecked &&
        !repositoryDirty &&
        definition.id !== "seedvr2" &&
        (!definition.installRevision || pinnedRevisionMatches)
      ) {
        report(t(uiKeys.nodeInstaller.updating, { url: definition.repositoryUrl }));
        try {
          const gitOutput = await runtime.runLoggedProcess(git, ["-C", targetDirectory, "pull", "--progress", "--ff-only"], {
            timeoutMs: 300_000,
            env: commandEnvironment,
            onLog: report
          });
          if (!gitOutput) report(t(uiKeys.nodeInstaller.upToDate));
        } catch (error) {
          const processError = error as Error & { stdout?: string; stderr?: string };
          const details = [processError.message, processError.stdout, processError.stderr]
            .filter(Boolean)
            .join("\n");
          if (!/fast-forward|non-fast-forward|diverging branches/iu.test(details)) {
            throw error;
          }
          await replaceExistingCheckout(
            t(uiKeys.nodeInstaller.divergedCleanup)
          );
        }
      } else {
        await replaceExistingCheckout(
          repositoryDirty
            ? t(uiKeys.nodeInstaller.dirtyCleanup)
            : isGitDirectory && repositoryMatches && !repositoryStatusChecked
            ? t(uiKeys.nodeInstaller.uncheckedCleanup)
            : definition.installRevision && isGitDirectory && repositoryMatches && !pinnedRevisionMatches
            ? t(uiKeys.nodeInstaller.mismatchedPinCleanup, { revision: definition.installRevision })
            : !repositoryMatches && isGitDirectory
            ? t(uiKeys.nodeInstaller.repositoryChanged, { url: definition.repositoryUrl })
            : definition.id === "seedvr2"
            ? t(uiKeys.nodeInstaller.seedvrClean)
            : t(uiKeys.nodeInstaller.managerClean)
        );
      }
    } else {
      report(t(uiKeys.nodeInstaller.cloning, { url: definition.repositoryUrl }));
      const gitOutput = await runtime.runLoggedProcess(
        git,
        [
          "clone",
          "--progress",
          "--depth",
          "1",
          ...(definition.installRevision ? ["--no-checkout"] : []),
          definition.repositoryUrl,
          targetDirectory
        ],
        {
          timeoutMs: 600_000,
          env: commandEnvironment,
          onLog: report
        }
      );
      if (!gitOutput) report(t(uiKeys.nodeInstaller.cloned));
      if (definition.installRevision) {
        await ensurePinnedGitRevision(
          git,
          targetDirectory,
          definition.installRevision,
          runtime,
          commandEnvironment,
          report,
          t
        );
      }
      }
    }

    if (definition.id === KONOHAMARU_NODE_ID) {
      report(t(uiKeys.nodeInstaller.lfsDownloading));
      const git = await runtime.findExecutable("git.exe");
      if (!git) throw new Error(t(uiKeys.nodeInstaller.lfsGitMissing));
      await runtime.runLoggedProcess(
        git,
        ["-C", targetDirectory, "lfs", "pull"],
        { timeoutMs: 600_000, env: commandEnvironment, onLog: report }
      );
      await verifyKonohamaruRuntimeArtifacts(targetDirectory, t);
      report(t(uiKeys.nodeInstaller.lfsVerified));
      if (!runtime.installKonohamaruNeuralUpstreamRuntime) {
        throw new Error(t(uiKeys.nodeInstaller.neuralUnavailable));
      }
      report(t(uiKeys.nodeInstaller.neuralInstalling));
      const upstreamRuntimeResult = await runtime.installKonohamaruNeuralUpstreamRuntime(
        settings,
        comfyRoot,
        targetDirectory,
        report
      );
      if (upstreamRuntimeResult.log) report(upstreamRuntimeResult.log);
      if (!upstreamRuntimeResult.ok) throw new Error(upstreamRuntimeResult.message);
      if (!runtime.installKonohamaruVideo2dlssnrRuntime) {
        throw new Error(t(uiKeys.nodeInstaller.temporalUnavailable));
      }
      report(t(uiKeys.nodeInstaller.temporalInstalling));
      const video2dlssnrRuntimeResult = await runtime.installKonohamaruVideo2dlssnrRuntime(
        settings,
        comfyRoot,
        targetDirectory,
        report
      );
      if (video2dlssnrRuntimeResult.log) report(video2dlssnrRuntimeResult.log);
      if (!video2dlssnrRuntimeResult.ok) throw new Error(video2dlssnrRuntimeResult.message);
    }

    if (definition.id === "comfyui-gguf-h3" && !h3GgufPrepared) {
      report(t(uiKeys.nodeInstaller.checkH3));
      await prepareH3Gguf(targetDirectory, report, t);
    }
    if (definition.id === "video-helper-suite" && !videoHelperPrepared) {
      report(t(uiKeys.nodeInstaller.applyVhs));
      await prepareVideoHelperSuite(targetDirectory, report, t);
    }
    if (definition.id === "ltx-video") {
      report(t(uiKeys.nodeInstaller.checkLtx));
      await prepareLtxVideo(targetDirectory, report, t);
    }
    if (definition.id === "mmh3-ultimate-upscale") {
      report(t(uiKeys.nodeInstaller.checkMmh3));
      await prepareMmh3UltimateUpscale(targetDirectory, report, t);
    }
    if (definition.id === DLSS5_NODE_ID && !dlss5Prepared) {
      report(t(uiKeys.nodeInstaller.checkDepth));
      await prepareDlss5DepthAnything(targetDirectory, report, t);
    }
    if (definition.id === AETHERSCALE_NODE_ID && !aetherScalePrepared) {
      report(t(uiKeys.nodeInstaller.checkCarrier));
      await prepareAetherScaleCarrier(targetDirectory, report, t);
    }
    if (definition.id === KONOHAMARU_NODE_ID) {
      report(t(uiKeys.nodeInstaller.checkKonohamaru));
      await prepareKonohamaruNeuralUpstream(targetDirectory, report, t);
    }
    if (definition.id === "minimax-h3-prompt-writer" && !h3PromptWriterPrepared) {
      report(t(uiKeys.nodeInstaller.checkWriter));
      await prepareH3PromptWriter(targetDirectory, report, t);
      const python = await runtime.findComfyPython(settings, comfyRoot);
      if (!python) throw new Error(t(uiKeys.nodeInstaller.pythonMissing));
      report(t(uiKeys.nodeInstaller.validateWriter));
      await validateH3PromptWriterPythonSyntax(
        targetDirectory,
        python,
        runtime,
        commandEnvironment,
        t
      );
    }
    if (isMultimodalPromptNodes) {
      report(t(uiKeys.nodeInstaller.checkMultimodal));
      await prepareMultimodalPromptNodes(targetDirectory, report, t);
    }
    if (isQwenVlPeftNode) {
      report(t(uiKeys.nodeInstaller.checkQwen));
      await prepareQwenVlComfyDesktopLogging(targetDirectory, report, t);
    }

    const requirements = path.join(targetDirectory, "requirements.txt");
    if (await runtime.exists(requirements)) {
      const python = await runtime.findComfyPython(settings, comfyRoot);
      if (!python) throw new Error(t(uiKeys.nodeInstaller.pythonMissing));
      if (usesSharedLlamaRuntime) {
        const requirementSource = await fs.readFile(requirements, "utf8");
        const filtered = sharedLlamaRequirementPackages(requirementSource);
        const packages = [...new Map(
          (isMultimodalPromptNodes
            ? ["dashscope>=1.20.0", "pillow>=10.0.0", "numpy>=1.24.0", ...filtered.packages]
            : filtered.packages
          ).map((value) => [value.toLowerCase(), value] as const)
        ).values()];
        if (filtered.skippedLlama > 0) {
          report(
            t(uiKeys.nodeInstaller.skipLlama, { count: filtered.skippedLlama })
          );
        }
        if (filtered.skippedOptions > 0) {
          report(t(uiKeys.nodeInstaller.skipPipOptions, { count: filtered.skippedOptions }));
        }
        if (packages.length > 0) {
          report(
            isMultimodalPromptNodes
              ? t(uiKeys.nodeInstaller.multimodalLight)
              : t(uiKeys.nodeInstaller.writerLight)
          );
          const pipOutput = await runtime.runLoggedProcess(
            python,
            ["-m", "pip", "install", ...packages],
            {
              timeoutMs: 900_000,
              env: commandEnvironment,
              onLog: report
            }
          );
          if (!pipOutput) report(t(uiKeys.nodeInstaller.pipSatisfied));
        } else {
          report(
            isMultimodalPromptNodes
              ? t(uiKeys.nodeInstaller.multimodalNoExtra)
              : t(uiKeys.nodeInstaller.writerNoExtra)
          );
        }
      } else {
        report(t(uiKeys.nodeInstaller.pipInstalling, { path: requirements }));
        const pipOutput = await runtime.runLoggedProcess(
          python,
          ["-m", "pip", "install", "-r", requirements],
          {
            timeoutMs: 900_000,
            env: commandEnvironment,
            onLog: report
          }
        );
        if (!pipOutput) report(t(uiKeys.nodeInstaller.pipSatisfied));
      }
    } else {
      if (isMultimodalPromptNodes) {
        const python = await runtime.findComfyPython(settings, comfyRoot);
        if (!python) throw new Error(t(uiKeys.nodeInstaller.multimodalPythonMissing));
        report(t(uiKeys.nodeInstaller.multimodalNoRequirements));
        await runtime.runLoggedProcess(
          python,
          ["-m", "pip", "install", "dashscope>=1.20.0", "pillow>=10.0.0", "numpy>=1.24.0"],
          {
            timeoutMs: 900_000,
            env: commandEnvironment,
            onLog: report
          }
        );
      } else {
        report(t(uiKeys.nodeInstaller.noRequirements));
      }
    }
    if (isMultimodalPromptNodes) {
      report(t(uiKeys.nodeInstaller.sharedBackendInstalling));
      const backend = await installLlamaCppPythonPackage(settings, runtime, report, {
        forceReinstall: false
      });
      if (!backend.ok) throw new Error(backend.message);
      report(t(uiKeys.nodeInstaller.sharedBackendReady));
    }
    if (definition.id === "minimax-h3-prompt-writer") {
      report(t(uiKeys.nodeInstaller.writerBackendInstalling));
      const backend = await installLlamaCppPythonPackage(settings, runtime, report, {
        forceReinstall: false
      });
      if (!backend.ok) throw new Error(backend.message);
      report(t(uiKeys.nodeInstaller.writerBackendReady));
    }
    if (isQwenVlPeftNode) {
      const python = await runtime.findComfyPython(settings, comfyRoot);
      if (!python) throw new Error(t(uiKeys.nodeInstaller.qwenPythonMissing));
      report(t(uiKeys.nodeInstaller.qwenDependencies));
      const pipOutput = await runtime.runLoggedProcess(
        python,
        ["-m", "pip", "install", "transformers>=4.57.1", "peft>=0.18.0", "accelerate>=1.10.0", "safetensors>=0.5.0", "pillow>=10.0.0", "bitsandbytes"],
        {
          timeoutMs: 900_000,
          env: commandEnvironment,
          onLog: report
        }
      );
      if (!pipOutput) report(t(uiKeys.nodeInstaller.qwenSatisfied));
      report(t(uiKeys.nodeInstaller.qwenReady));
    }
    if (definition.id === DLSS5_NODE_ID) {
      if (!runtime.installDlss5Runtime) {
        throw new Error(t(uiKeys.nodeInstaller.dlssUnavailable));
      }
      report(t(uiKeys.nodeInstaller.dlssInstalling));
      const runtimeResult = await runtime.installDlss5Runtime(
        settings,
        comfyRoot,
        targetDirectory,
        report
      );
      if (runtimeResult.log) report(runtimeResult.log);
      if (!runtimeResult.ok) throw new Error(runtimeResult.message);
    }
    if (definition.id === AETHERSCALE_NODE_ID) {
      if (!runtime.installAetherScaleRuntime) {
        throw new Error(t(uiKeys.nodeInstaller.carrierUnavailable));
      }
      report(t(uiKeys.nodeInstaller.carrierInstalling));
      const runtimeResult = await runtime.installAetherScaleRuntime(
        settings,
        comfyRoot,
        targetDirectory,
        report
      );
      if (runtimeResult.log) report(runtimeResult.log);
      if (!runtimeResult.ok) throw new Error(runtimeResult.message);
    }
    for (const previous of replaced) await removeSoftwareArtifact(previous.parent, previous.backup, report, undefined, t);
    replaced.length = 0; // The new installation is verified; cleanup must never trigger rollback.
    // Clear historical software-only copies for this node, not unrelated node/user backups.
    const backupRoot = path.join(comfyRoot, "node-backups");
    const backupStat = await fs.lstat(backupRoot).catch(() => null);
    const backups = backupStat?.isDirectory() && !backupStat.isSymbolicLink() ? await fs.readdir(backupRoot, { withFileTypes: true }).catch(error => { report(t(uiKeys.nodeInstaller.cleanupFailed, { reason: String(error) })); return []; }) : [];
    for (const entry of backups) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || !entry.name.startsWith(`${definition.directoryName}-`) || !/^\d+$/u.test(entry.name.slice(definition.directoryName.length + 1))) continue;
      const candidate = path.join(backupRoot, entry.name);
      try {
        const config = await fs.readFile(path.join(candidate, ".git", "config"), "utf8");
        const origin = /\[remote "origin"\][^[]*?url\s*=\s*([^\r\n]+)/u.exec(config)?.[1] ?? "";
        if (normalizedRepositoryUrl(origin) !== normalizedRepositoryUrl(definition.repositoryUrl)) continue;
        await preserveSoftwareUserData(candidate, targetDirectory, [], undefined, await downloadableNodeFiles("git.exe", candidate, runtime, commandEnvironment), t);
        await removeSoftwareArtifact(comfyRoot, candidate, report, undefined, t);
      } catch (error) { report(t(uiKeys.nodeInstaller.copyNotRemoved, { path: candidate, reason: String(error) })); }
    }
    return {
      ok: true,
      message: t(uiKeys.nodeInstaller.installed, { name: definition.name }),
      log: installLog.join("\n\n")
    };
  } catch (error) {
    for (const previous of replaced.reverse()) {
      if (await removeSoftwareArtifact(previous.parent, previous.target, report, undefined, t)) {
        await runtime.renameWithRetry(previous.backup, previous.target).catch(restoreError => report(t(uiKeys.nodeInstaller.restoreFailed, { reason: String(restoreError), path: previous.backup })));
      }
    }
    const processError = error as Error & { stdout?: string; stderr?: string };
    const details = [
      processError.message,
      processError.stdout,
      processError.stderr
    ].filter(Boolean).join("\n");
    report(details);
    return {
      ok: false,
      message: installationFailureMessage(error, details, t),
      log: installLog.join("\n\n")
    };
  }
}

export async function installCustomNodePackage(
  nodeId: string,
  settings: Settings,
  runtime: DependencyInstallerRuntime,
  onLog?: (message: string) => void,
  mode: CustomNodeInstallMode = "install"
): Promise<{ ok: boolean; message: string; log?: string }> {
  const finishMutation = pythonProbeCache.beginMutation();
  try {
    return await installCustomNodePackageUnlocked(nodeId, settings, runtime, onLog, mode);
  } finally {
    finishMutation();
    pythonProbeCache.invalidate(undefined, "mutation");
  }
}

async function uninstallCustomNodePackageUnlocked(
  nodeId: string,
  settings: Settings,
  runtime: Pick<DependencyInstallerRuntime, "findComfyRoot" | "uninstallAetherScaleRuntime">,
  onLog?: (message: string) => void
): Promise<{ ok: boolean; message: string; log?: string }> {
  const t = createNativeTranslator(settings.uiLocale).t;
  const definition = customNodeDefinition(nodeId);
  if (!definition) return { ok: false, message: t(uiKeys.nodeInstaller.unknownUninstall) };
  if (!isLocalComfyUrl(settings.comfyUrl)) {
    return {
      ok: false,
      message: t(uiKeys.nodeInstaller.remoteUninstall)
    };
  }
  if (definition.appInstallable === false) {
    return {
      ok: false,
      message: t(uiKeys.nodeInstaller.manualUninstall, { name: definition.name })
    };
  }
  try {
    onLog?.(t(uiKeys.nodeInstaller.locatingNode, { name: definition.name }));
    const comfyRoot = await runtime.findComfyRoot(settings);
    if (!comfyRoot) throw new Error(t(uiKeys.nodeInstaller.dataMissing));
    const customNodesDirectory = path.join(comfyRoot, "custom_nodes");
    onLog?.(t(uiKeys.nodeInstaller.checkingNode));
    const entries = await fs.readdir(customNodesDirectory, { withFileTypes: true }).catch(() => []);
    const knownNames = new Set([
      definition.directoryName,
      ...definition.aliases
    ].map((name) => name.toLowerCase()));
    const installedDirectories = entries
      .filter((entry) => entry.isDirectory() && knownNames.has(entry.name.toLowerCase()))
      .map((entry) => path.join(customNodesDirectory, entry.name));
    if (!installedDirectories.length) {
      return { ok: false, message: t(uiKeys.nodeInstaller.notInstalled, { name: definition.name }) };
    }
    for (const directory of installedDirectories) {
      if (definition.id === AETHERSCALE_NODE_ID && runtime.uninstallAetherScaleRuntime) {
        const carrierResult = await runtime.uninstallAetherScaleRuntime(
          settings,
          comfyRoot,
          directory,
          onLog
        );
        if (carrierResult.log) onLog?.(carrierResult.log);
        if (!carrierResult.ok) throw new Error(carrierResult.message);
      }
      onLog?.(t(uiKeys.nodeInstaller.removing, { path: directory }));
      if (definition.id === DLSS5_NODE_ID) {
        await removeDirectoryTreeWithoutAsar(directory);
      } else {
        await fs.rm(directory, {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 200
        });
      }
      onLog?.(t(uiKeys.nodeInstaller.removed, { path: directory }));
    }
    return {
      ok: true,
      message: t(uiKeys.nodeInstaller.uninstalled, { name: definition.name }),
      log: installedDirectories.map((directory) => t(uiKeys.nodeInstaller.deleted, { path: directory })).join("\n")
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function uninstallCustomNodePackage(
  nodeId: string,
  settings: Settings,
  runtime: Pick<DependencyInstallerRuntime, "findComfyRoot" | "uninstallAetherScaleRuntime">,
  onLog?: (message: string) => void
): Promise<{ ok: boolean; message: string; log?: string }> {
  const finishMutation = pythonProbeCache.beginMutation();
  try {
    return await uninstallCustomNodePackageUnlocked(nodeId, settings, runtime, onLog);
  } finally {
    finishMutation();
    pythonProbeCache.invalidate(undefined, "mutation");
  }
}
