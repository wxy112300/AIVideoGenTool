import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  AETHERSCALE_NODE_ID,
  customNodeDefinition,
  DLSS5_NODE_ID
} from "../../src/core/catalog/index.js";
import type { CustomNodeInstallMode, Settings } from "../../src/types.js";
import {
  dlss5DepthAnythingPatchFiles,
  patchH3PromptWriterSource,
  patchAetherScaleCarrierSource,
  aetherScaleCarrierPatchFiles,
  patchDlss5DepthAnythingSource,
  patchMmh3UltimateUpscaleSource,
  patchMultimodalPromptContextSize,
  patchMultimodalPromptProjectorDiscovery,
  patchMultimodalPromptQwen38Recognition,
  patchMultimodalPromptResidency,
  patchQwenVlComfyDesktopLogging,
  prepareDlss5DepthAnything,
  prepareAetherScaleCarrier,
  prepareH3PromptWriter,
  prepareMmh3UltimateUpscale,
  prepareH3Gguf,
  prepareLtxVideo,
  prepareMultimodalPromptNodes,
  prepareQwenVlComfyDesktopLogging,
  prepareVideoHelperSuite
} from "../../src/infrastructure/dependency-node-adapters.js";
import { depthAnythingBuiltinMetadataFile } from "../../src/infrastructure/depth-anything-metadata.js";
import { installLlamaCppPythonPackage } from "./llama-cpp-python.js";
import { isLocalComfyUrl } from "./comfy-endpoint.js";
import { removeDirectoryTreeWithoutAsar } from "./dlss5-runtime.js";
import { installAetherScaleRuntime, uninstallAetherScaleRuntime } from "./aetherscale-runtime.js";

function normalizedRepositoryUrl(value: string): string {
  return value.trim().replace(/\/+$/u, "").replace(/\.git$/iu, "").toLowerCase();
}

function normalizedGitRevision(value: string): string {
  return value.trim().split(/\r?\n/u)[0]?.trim().toLowerCase() ?? "";
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

function installationFailureMessage(error: unknown, details: string): string {
  const fallback = error instanceof Error ? error.message : String(error);
  if (/filename too long|unable to create file|unable to checkout/iu.test(details)) {
    return `${fallback}（检测到 Windows Git 长路径错误；安装器已自动启用进程级 longpaths。若仍失败，请启用系统长路径支持后重试。）`;
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
          : [];
  const paths = statusOutput
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map(gitStatusPath);
  if (!paths.length || paths.some((filename) => !patchFiles.includes(filename))) {
    return false;
  }
  for (const filename of paths) {
    const current = await fs.readFile(path.join(targetDirectory, filename), "utf8").catch(() => null);
    if (current === null) return false;
    let expected = "";
    if (nodeId === DLSS5_NODE_ID && filename !== "nodes.py") {
      expected = depthAnythingBuiltinMetadataFile(path.basename(filename));
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
  commandEnvironment: NodeJS.ProcessEnv
): Promise<void> {
  const filenames = (
    await Promise.all(h3PromptWriterPatchFiles.map(async (filename) => {
      const absolutePath = path.join(targetDirectory, filename);
      return await runtime.exists(absolutePath) ? absolutePath : "";
    }))
  ).filter(Boolean);
  if (!filenames.length) {
    throw new Error("MiniMax H3 Prompt Writer 没有可校验的 Python 源码文件。");
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
  report: (message: string) => void
): Promise<void> {
  const expectedRevision = normalizedGitRevision(revision);
  if (!expectedRevision) throw new Error("节点 catalog 缺少有效的 installRevision。");
  report(`正在固定节点 revision：${expectedRevision}`);
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
      `节点 revision 校验失败：实际 ${actualRevision || "未读取到"}，要求 ${expectedRevision}`
    );
  }
  report(`节点 revision 已校验：${actualRevision}`);
}

async function installBundledNodePackage(
  nodeId: string,
  definition: NonNullable<ReturnType<typeof customNodeDefinition>>,
  targetDirectory: string,
  comfyRoot: string,
  runtime: DependencyInstallerRuntime,
  report: (message: string) => void
): Promise<void> {
  const sourceDirectory = await runtime.resolveBundledNodeDirectory?.(
    nodeId,
    definition.directoryName
  ) ?? path.resolve(process.cwd(), "comfy_nodes", definition.directoryName);
  const packageMarker = path.join(sourceDirectory, "__init__.py");
  if (!await runtime.exists(packageMarker)) {
    throw new Error(`应用内置节点包不存在：${sourceDirectory}`);
  }
  const packageRevision = (await fs.readFile(path.join(sourceDirectory, "VERSION"), "utf8"))
    .trim();
  if (definition.installRevision && packageRevision !== definition.installRevision) {
    throw new Error(
      `应用内置节点包 revision 不匹配：当前 ${packageRevision || "未读取到"}，要求 ${definition.installRevision}`
    );
  }

  const replacementDirectory = `${targetDirectory}.update-${crypto.randomUUID()}`;
  const backupRoot = path.join(comfyRoot, "node-backups");
  const backupDirectory = path.join(
    backupRoot,
    `${definition.directoryName}-${Date.now()}`
  );
  report(`复制应用内置节点包：${sourceDirectory}`);
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
      await runtime.renameWithRetry(targetDirectory, backupDirectory);
      targetMovedToBackup = true;
    }
    try {
      await runtime.renameWithRetry(replacementDirectory, targetDirectory);
    } catch (error) {
      if (!runtime.retryableRenameError(error)) throw error;
      report("Windows 持续占用内置节点目录，自动改用文件复制完成替换");
      await fs.cp(replacementDirectory, targetDirectory, {
        recursive: true,
        force: false,
        errorOnExist: true
      });
    }
    if (targetExists) report(`旧目录已备份：${backupDirectory}`);
    report(`应用内置节点包已安装：${definition.name}`);
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
    await fs.rm(replacementDirectory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200
    });
  }
}

export async function installCustomNodePackage(
  nodeId: string,
  settings: Settings,
  runtime: DependencyInstallerRuntime,
  onLog?: (message: string) => void,
  mode: CustomNodeInstallMode = "install"
): Promise<{ ok: boolean; message: string; log?: string }> {
  const definition = customNodeDefinition(nodeId);
  if (!definition) return { ok: false, message: "未知的节点包，已拒绝安装。" };
  if (!isLocalComfyUrl(settings.comfyUrl)) {
    return {
      ok: false,
      message: "远程 ComfyUI 仅支持连接，应用不会安装或修改本地节点。"
    };
  }
  if (definition.appInstallable === false) {
    return {
      ok: false,
      message: `${definition.name} 仅支持手动安装；应用不会下载、更新或修改该节点。请打开项目源码页后安装并重启 ComfyUI。`
    };
  }

  const installLog: string[] = [];
  const report = (message: string) => {
    const normalized = message.trim();
    if (!normalized) return;
    installLog.push(normalized);
    onLog?.(normalized);
  };
  try {
    report(runtime.proxyLogLabel(settings));
    if (process.platform === "win32") {
      report("Windows Git 长路径兼容已启用（仅限本次安装进程）");
    }
    report("正在定位所选 ComfyUI 的数据目录和 Python 环境……");
    const comfyRoot = await runtime.findComfyRoot(settings);
    if (!comfyRoot) throw new Error("没有找到 ComfyUI 数据目录。");
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
      await installBundledNodePackage(
        nodeId,
        definition,
        targetDirectory,
        comfyRoot,
        runtime,
        report
      );
    } else {
      const git = await runtime.findExecutable("git.exe");
      if (!git) throw new Error("缺少 Git，无法下载节点包。");
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
              `当前节点 revision 与 catalog pin 不符，将安全替换为 ${definition.installRevision}`
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
              "comfyui-multimodal-prompt-nodes",
              "comfyui-qwenvl-lora",
              "mmh3-ultimate-upscale",
              DLSS5_NODE_ID,
              AETHERSCALE_NODE_ID
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
              const upstreamUnchanged = definition.id === DLSS5_NODE_ID || definition.id === AETHERSCALE_NODE_ID
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
                  "检测到的修改仅是本程序兼容层，且上游没有新提交；保留当前目录，不重复克隆"
                );
              } else if (upstreamUnchanged === false) {
                report("检测到 H3 Prompt Writer 上游有新提交，将备份旧目录并安装新副本");
              } else {
                report("无法确认 H3 Prompt Writer 上游提交；为安全起见，将备份旧目录后更新");
              }
            } else {
              report(
                "检测到节点目录存在本地修改（可能来自兼容补丁）；不会直接覆盖原目录，改用安全副本更新并保留备份"
              );
            }
          }
        } catch {
          // A status probe failure must never turn into an in-place pull. The
          // replacement path below is copy/backup based and is recoverable.
          report(
            "无法读取节点仓库的本地状态；为避免覆盖本地修改，改用安全副本更新并保留备份"
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
          if (!gitOutput) report("Git：克隆完成");
          if (definition.installRevision) {
            await ensurePinnedGitRevision(
              git,
              replacementDirectory,
              definition.installRevision,
              runtime,
              commandEnvironment,
              report
            );
          }
          if (definition.id === "comfyui-gguf-h3") {
            report("正在应用 H3 GGUF 独立节点适配层……");
            await prepareH3Gguf(replacementDirectory, report);
            h3GgufPrepared = true;
          } else if (definition.id === "video-helper-suite") {
            report("正在应用 Video Helper Suite 兼容补丁……");
            await prepareVideoHelperSuite(replacementDirectory, report);
            videoHelperPrepared = true;
          } else if (definition.id === "minimax-h3-prompt-writer") {
            report("正在检查 H3 Prompt Writer 的 llama-cpp-python API 兼容层……");
            await prepareH3PromptWriter(replacementDirectory, report);
            const python = await runtime.findComfyPython(settings, comfyRoot);
            if (!python) throw new Error("节点已下载，但没有找到所选 ComfyUI 的 Python 环境。");
            report("正在校验 H3 Prompt Writer 的 Python 源码语法……");
            await validateH3PromptWriterPythonSyntax(
              replacementDirectory,
              python,
              runtime,
              commandEnvironment
            );
            h3PromptWriterPrepared = true;
          } else if (definition.id === "mmh3-ultimate-upscale") {
            report("正在应用 MMH3 1440p 兼容补丁……");
            await prepareMmh3UltimateUpscale(replacementDirectory, report);
          } else if (definition.id === DLSS5_NODE_ID) {
            report("正在应用 DLSS5 Depth Anything 本地模型适配层……");
            await prepareDlss5DepthAnything(replacementDirectory, report);
            dlss5Prepared = true;
          } else if (definition.id === AETHERSCALE_NODE_ID) {
            report("正在应用 AetherScale carrier 注册表回收适配层……");
            await prepareAetherScaleCarrier(replacementDirectory, report);
            aetherScalePrepared = true;
          }
          await fs.mkdir(backupRoot, { recursive: true });
          await runtime.renameWithRetry(targetDirectory, backupDirectory);
          try {
            try {
              await runtime.renameWithRetry(replacementDirectory, targetDirectory);
            } catch (error) {
              if (!runtime.retryableRenameError(error)) throw error;
              report(
                "Windows 持续占用新目录，自动改用文件复制完成替换"
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
          report(`旧目录已备份：${backupDirectory}`);
        } finally {
          await fs.rm(replacementDirectory, {
            recursive: true,
            force: true,
            maxRetries: 5,
            retryDelay: 200
          });
        }
      };
      if (mode === "reinstall") {
        await replaceExistingCheckout(
          "正在执行干净重装：先备份当前目录，再安装上游副本"
        );
      } else if (reuseAppPatchedRepository) {
        // The directory already contains the exact app-managed compatibility
        // patch and the remote HEAD is unchanged. Continue with the normal
        // dependency/runtime checks below without creating another backup.
      } else if (
        definition.installRevision &&
        isGitDirectory &&
        repositoryMatches &&
        pinnedRevisionMatches &&
        repositoryStatusChecked &&
        !repositoryDirty
      ) {
        report(`节点已固定在 catalog revision ${definition.installRevision}，跳过更新`);
      } else if (
        isGitDirectory &&
        repositoryMatches &&
        repositoryStatusChecked &&
        !repositoryDirty &&
        definition.id !== "seedvr2" &&
        (!definition.installRevision || pinnedRevisionMatches)
      ) {
        report(`更新 ${definition.repositoryUrl}`);
        try {
          const gitOutput = await runtime.runLoggedProcess(git, ["-C", targetDirectory, "pull", "--ff-only"], {
            timeoutMs: 300_000,
            env: commandEnvironment,
            onLog: report
          });
          if (!gitOutput) report("Git：已是最新版本");
        } catch (error) {
          const processError = error as Error & { stdout?: string; stderr?: string };
          const details = [processError.message, processError.stdout, processError.stderr]
            .filter(Boolean)
            .join("\n");
          if (!/fast-forward|non-fast-forward|diverging branches/iu.test(details)) {
            throw error;
          }
          await replaceExistingCheckout(
            "检测到本地分支与上游已分叉，无法安全快进；先备份旧目录并安装干净副本（不会丢失原目录）"
          );
        }
      } else {
        await replaceExistingCheckout(
          repositoryDirty
            ? "检测到节点仓库有本地修改，先备份旧目录并安装干净副本（不会丢失原目录）"
            : isGitDirectory && repositoryMatches && !repositoryStatusChecked
            ? "无法确认节点仓库状态，先备份旧目录并安装干净副本（不会覆盖本地修改）"
            : definition.installRevision && isGitDirectory && repositoryMatches && !pinnedRevisionMatches
            ? `当前节点 revision 不符合 catalog pin，备份旧目录并安装 ${definition.installRevision}`
            : !repositoryMatches && isGitDirectory
            ? `检测到节点仓库已切换，备份旧目录并安装 ${definition.repositoryUrl}`
            : definition.id === "seedvr2"
            ? "SeedVR2 使用破坏性新版接口：下载干净上游副本并备份替换旧目录"
            : "目录由 ComfyUI Manager 管理，下载上游副本后安全替换"
        );
      }
    } else {
      report(`克隆 ${definition.repositoryUrl}`);
      const gitOutput = await runtime.runLoggedProcess(
        git,
        [
          "clone",
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
      if (!gitOutput) report("Git：克隆完成");
      if (definition.installRevision) {
        await ensurePinnedGitRevision(
          git,
          targetDirectory,
          definition.installRevision,
          runtime,
          commandEnvironment,
          report
        );
      }
      }
    }

    if (definition.id === "comfyui-gguf-h3" && !h3GgufPrepared) {
      report("正在检查 H3 GGUF 独立节点适配层……");
      await prepareH3Gguf(targetDirectory, report);
    }
    if (definition.id === "video-helper-suite" && !videoHelperPrepared) {
      report("正在应用 Video Helper Suite 兼容补丁……");
      await prepareVideoHelperSuite(targetDirectory, report);
    }
    if (definition.id === "ltx-video") {
      report("正在检查 LTX Video 兼容层……");
      await prepareLtxVideo(targetDirectory, report);
    }
    if (definition.id === "mmh3-ultimate-upscale") {
      report("正在检查 MMH3 1440p 兼容补丁……");
      await prepareMmh3UltimateUpscale(targetDirectory, report);
    }
    if (definition.id === DLSS5_NODE_ID && !dlss5Prepared) {
      report("正在检查 DLSS5 Depth Anything 本地模型适配层……");
      await prepareDlss5DepthAnything(targetDirectory, report);
    }
    if (definition.id === AETHERSCALE_NODE_ID && !aetherScalePrepared) {
      report("正在检查 AetherScale carrier 注册表回收适配层……");
      await prepareAetherScaleCarrier(targetDirectory, report);
    }
    if (definition.id === "minimax-h3-prompt-writer" && !h3PromptWriterPrepared) {
      report("正在检查 H3 Prompt Writer 的 llama-cpp-python API 兼容层……");
      await prepareH3PromptWriter(targetDirectory, report);
      const python = await runtime.findComfyPython(settings, comfyRoot);
      if (!python) throw new Error("节点已下载，但没有找到所选 ComfyUI 的 Python 环境。");
      report("正在校验 H3 Prompt Writer 的 Python 源码语法……");
      await validateH3PromptWriterPythonSyntax(
        targetDirectory,
        python,
        runtime,
        commandEnvironment
      );
    }
    if (isMultimodalPromptNodes) {
      report("正在检查 MultiModal Prompt Nodes 的 GGUF 上下文配置……");
      await prepareMultimodalPromptNodes(targetDirectory, report);
    }
    if (isQwenVlPeftNode) {
      report("正在检查 Qwen-VL LoRA 的 ComfyUI Desktop 日志兼容层……");
      await prepareQwenVlComfyDesktopLogging(targetDirectory, report);
    }

    const requirements = path.join(targetDirectory, "requirements.txt");
    if (await runtime.exists(requirements)) {
      const python = await runtime.findComfyPython(settings, comfyRoot);
      if (!python) throw new Error("节点已下载，但没有找到所选 ComfyUI 的 Python 环境。");
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
            `已跳过节点 requirements.txt 中的 ${filtered.skippedLlama} 项 llama-cpp-python 要求，避免覆盖共享后端`
          );
        }
        if (filtered.skippedOptions > 0) {
          report(`已跳过 ${filtered.skippedOptions} 项节点级 pip 参数；共享运行时不接管全局索引设置`);
        }
        if (packages.length > 0) {
          report(
            isMultimodalPromptNodes
              ? "安装 MultiModal Prompt Nodes 的轻量依赖（llama-cpp-python 由共享运行时统一管理）"
              : "安装 H3 Prompt Writer 的非 llama Python 依赖（共享 llama-cpp-python 由统一运行时管理）"
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
          if (!pipOutput) report("pip：依赖已满足");
        } else {
          report(
            isMultimodalPromptNodes
              ? "MultiModal Prompt Nodes 没有额外 Python 依赖，使用共享 llama-cpp-python 后端"
              : "H3 Prompt Writer 的 requirements.txt 为空；不会因更新节点改动共享 llama-cpp-python"
          );
        }
      } else {
        report(`安装 Python 依赖 ${requirements}`);
        const pipOutput = await runtime.runLoggedProcess(
          python,
          ["-m", "pip", "install", "-r", requirements],
          {
            timeoutMs: 900_000,
            env: commandEnvironment,
            onLog: report
          }
        );
        if (!pipOutput) report("pip：依赖已满足");
      }
    } else {
      if (isMultimodalPromptNodes) {
        const python = await runtime.findComfyPython(settings, comfyRoot);
        if (!python) throw new Error("MultiModal Prompt Nodes 已下载，但没有找到所选 ComfyUI 的 Python 环境。");
        report("节点没有 requirements.txt，直接安装 MultiModal 的轻量依赖（不安装普通 llama-cpp-python）");
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
        report("未发现 requirements.txt，无需安装额外 Python 依赖");
      }
    }
    if (isMultimodalPromptNodes) {
      report("正在安装并验证提示词模型共用的 JamePeng llama-cpp-python 后端……");
      const backend = await installLlamaCppPythonPackage(settings, runtime, report, {
        forceReinstall: false
      });
      if (!backend.ok) throw new Error(backend.message);
      report("多模态提示词后端已通过自检；请重启 ComfyUI，设置页会继续验证 VisionLLMNode。");
    }
    if (definition.id === "minimax-h3-prompt-writer") {
      report("正在安装并验证 H3 Prompt Writer 共用的 llama-cpp-python 后端……");
      const backend = await installLlamaCppPythonPackage(settings, runtime, report, {
        forceReinstall: false
      });
      if (!backend.ok) throw new Error(backend.message);
      report("H3 Prompt Writer 的 llama-cpp-python 后端已通过自检。");
    }
    if (isQwenVlPeftNode) {
      const python = await runtime.findComfyPython(settings, comfyRoot);
      if (!python) throw new Error("Qwen-VL LoRA 节点已下载，但没有找到所选 ComfyUI 的 Python 环境。");
      report("正在补齐 Qwen-VL LoRA 的运行依赖（不安装 llama-cpp-python）……");
      const pipOutput = await runtime.runLoggedProcess(
        python,
        ["-m", "pip", "install", "transformers>=4.57.1", "peft>=0.18.0", "accelerate>=1.10.0", "safetensors>=0.5.0", "pillow>=10.0.0", "bitsandbytes"],
        {
          timeoutMs: 900_000,
          env: commandEnvironment,
          onLog: report
        }
      );
      if (!pipOutput) report("Qwen-VL LoRA 依赖已满足");
      report("Qwen-VL LoRA 依赖处理完成；请重启 ComfyUI 后重新扫描节点。 ");
    }
    if (definition.id === DLSS5_NODE_ID) {
      if (!runtime.installDlss5Runtime) {
        throw new Error("DLSS5 runtime 安装器未接入当前应用运行时。");
      }
      report("正在安装 DLSS5 SR runtime（固定 VapourKit manifest）……");
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
        throw new Error("AetherScale carrier runtime 安装器未接入当前应用运行时。");
      }
      report("正在安装 AetherScale carrier runtime（固定六文件白名单）……");
      const runtimeResult = await runtime.installAetherScaleRuntime(
        settings,
        comfyRoot,
        targetDirectory,
        report
      );
      if (runtimeResult.log) report(runtimeResult.log);
      if (!runtimeResult.ok) throw new Error(runtimeResult.message);
    }
    return {
      ok: true,
      message: `${definition.name} 已安装或更新。请重启 ComfyUI 后复检。`,
      log: installLog.join("\n\n")
    };
  } catch (error) {
    const processError = error as Error & { stdout?: string; stderr?: string };
    const details = [
      processError.message,
      processError.stdout,
      processError.stderr
    ].filter(Boolean).join("\n");
    report(details);
    return {
      ok: false,
      message: installationFailureMessage(error, details),
      log: installLog.join("\n\n")
    };
  }
}

export async function uninstallCustomNodePackage(
  nodeId: string,
  settings: Settings,
  runtime: Pick<DependencyInstallerRuntime, "findComfyRoot" | "uninstallAetherScaleRuntime">,
  onLog?: (message: string) => void
): Promise<{ ok: boolean; message: string; log?: string }> {
  const definition = customNodeDefinition(nodeId);
  if (!definition) return { ok: false, message: "未知的节点包，已拒绝卸载。" };
  if (!isLocalComfyUrl(settings.comfyUrl)) {
    return {
      ok: false,
      message: "远程 ComfyUI 仅支持连接，应用不会卸载或修改本地节点。"
    };
  }
  if (definition.appInstallable === false) {
    return {
      ok: false,
      message: `${definition.name} 仅支持手动安装；应用不会卸载或移动该节点目录。`
    };
  }
  try {
    onLog?.(`正在查找 ${definition.name} 的安装目录……`);
    const comfyRoot = await runtime.findComfyRoot(settings);
    if (!comfyRoot) throw new Error("没有找到 ComfyUI 数据目录。");
    const customNodesDirectory = path.join(comfyRoot, "custom_nodes");
    onLog?.("正在检查节点是否存在……");
    const entries = await fs.readdir(customNodesDirectory, { withFileTypes: true }).catch(() => []);
    const knownNames = new Set([
      definition.directoryName,
      ...definition.aliases
    ].map((name) => name.toLowerCase()));
    const installedDirectories = entries
      .filter((entry) => entry.isDirectory() && knownNames.has(entry.name.toLowerCase()))
      .map((entry) => path.join(customNodesDirectory, entry.name));
    if (!installedDirectories.length) {
      return { ok: false, message: `${definition.name} 未安装，无需卸载。` };
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
      onLog?.(`正在删除节点目录：${directory}`);
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
      onLog?.(`节点目录已删除：${directory}`);
    }
    return {
      ok: true,
      message: `${definition.name} 已卸载。需要时可通过一键安装重新下载。`,
      log: installedDirectories.map((directory) => `已删除：${directory}`).join("\n")
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}
