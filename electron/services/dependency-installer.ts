import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { customNodeDefinition } from "../../src/core/catalog/index.js";
import type { Settings } from "../../src/types.js";
import {
  patchH3PromptWriterLlamaCppCompatibility,
  prepareH3PromptWriter,
  prepareH3Gguf,
  prepareLtxVideo,
  prepareVideoHelperSuite
} from "./dependency-node-adapters.js";
import { installLlamaCppPythonPackage } from "./llama-cpp-python.js";

function normalizedRepositoryUrl(value: string): string {
  return value.trim().replace(/\/+$/u, "").replace(/\.git$/iu, "").toLowerCase();
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

const h3PromptWriterPatchFiles = [
  "backend/models/gguf_backend.py",
  "backend/runtime_diagnostics.py"
] as const;

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
async function h3PromptWriterHasOnlyAppPatch(
  targetDirectory: string,
  statusOutput: string,
  git: string,
  runtime: DependencyInstallerRuntime,
  commandEnvironment: NodeJS.ProcessEnv
): Promise<boolean> {
  const paths = statusOutput
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map(gitStatusPath);
  if (!paths.length || paths.some((filename) => !h3PromptWriterPatchFiles.includes(filename as typeof h3PromptWriterPatchFiles[number]))) {
    return false;
  }
  for (const filename of paths) {
    const current = await fs.readFile(path.join(targetDirectory, filename), "utf8").catch(() => null);
    if (current === null) return false;
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
    const expected = patchH3PromptWriterLlamaCppCompatibility(baseline);
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

export interface DependencyInstallerRuntime {
  downloadEnvironment(settings: Settings): NodeJS.ProcessEnv;
  proxyLogLabel(settings: Settings): string;
  findComfyRoot(settings: Settings): Promise<string>;
  findExecutable(command: string): Promise<string>;
  findComfyPython(settings: Settings, comfyRoot: string): Promise<string>;
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
      onLog?: (message: string) => void;
    }
  ): Promise<string>;
}

export async function installCustomNodePackage(
  nodeId: string,
  settings: Settings,
  runtime: DependencyInstallerRuntime,
  onLog?: (message: string) => void
): Promise<{ ok: boolean; message: string; log?: string }> {
  const definition = customNodeDefinition(nodeId);
  if (!definition) return { ok: false, message: "未知的节点包，已拒绝安装。" };

  const installLog: string[] = [];
  const report = (message: string) => {
    const normalized = message.trim();
    if (!normalized) return;
    installLog.push(normalized);
    onLog?.(normalized);
  };
  try {
    const commandEnvironment = withWindowsGitLongPaths(
      runtime.downloadEnvironment(settings)
    );
    report(runtime.proxyLogLabel(settings));
    if (process.platform === "win32") {
      report("Windows Git 长路径兼容已启用（仅限本次安装进程）");
    }
    report("正在定位所选 ComfyUI 的数据目录和 Python 环境……");
    const comfyRoot = await runtime.findComfyRoot(settings);
    if (!comfyRoot) throw new Error("没有找到 ComfyUI 数据目录。");
    const isMultimodalPromptNodes = definition.id === "comfyui-multimodal-prompt-nodes";
    const usesSharedLlamaRuntime = isMultimodalPromptNodes ||
      definition.id === "minimax-h3-prompt-writer";
    const customNodesDirectory = path.join(comfyRoot, "custom_nodes");
    const targetDirectory = path.join(customNodesDirectory, definition.directoryName);
    const git = await runtime.findExecutable("git.exe");
    if (!git) throw new Error("缺少 Git，无法下载节点包。");
    await fs.mkdir(customNodesDirectory, { recursive: true });
    let videoHelperPrepared = false;
    let h3GgufPrepared = false;

    if (await runtime.exists(targetDirectory)) {
      const isGitDirectory = await runtime.exists(path.join(targetDirectory, ".git"));
      let repositoryMatches = false;
      let repositoryStatusChecked = false;
      let repositoryDirty = false;
      let reuseAppPatchedRepository = false;
      if (isGitDirectory && definition.id !== "seedvr2") {
        const origin = await runtime.runLoggedProcess(
          git,
          ["-C", targetDirectory, "remote", "get-url", "origin"],
          { timeoutMs: 30_000, env: commandEnvironment }
        ).catch(() => "");
        repositoryMatches = normalizedRepositoryUrl(origin) ===
          normalizedRepositoryUrl(definition.repositoryUrl);
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
            const appPatchOnly = definition.id === "minimax-h3-prompt-writer" &&
              await h3PromptWriterHasOnlyAppPatch(
                targetDirectory,
                status,
                git,
                runtime,
                commandEnvironment
              );
            if (appPatchOnly) {
              const upstreamUnchanged = await h3PromptWriterUpstreamUnchanged(
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
      if (reuseAppPatchedRepository) {
        // The directory already contains the exact app-managed compatibility
        // patch and the remote HEAD is unchanged. Continue with the normal
        // dependency/runtime checks below without creating another backup.
      } else if (
        isGitDirectory &&
        repositoryMatches &&
        repositoryStatusChecked &&
        !repositoryDirty &&
        definition.id !== "seedvr2"
      ) {
        report(`更新 ${definition.repositoryUrl}`);
        const gitOutput = await runtime.runLoggedProcess(git, ["-C", targetDirectory, "pull", "--ff-only"], {
          timeoutMs: 300_000,
          env: commandEnvironment,
          onLog: report
        });
        if (!gitOutput) report("Git：已是最新版本");
      } else {
        const replacementDirectory = `${targetDirectory}.update-${crypto.randomUUID()}`;
        const backupRoot = path.join(comfyRoot, "node-backups");
        const backupDirectory = path.join(
          backupRoot,
          `${definition.directoryName}-${Date.now()}`
        );
        report(
          repositoryDirty
            ? "检测到节点仓库有本地修改，先备份旧目录并安装干净副本（不会丢失原目录）"
            : isGitDirectory && repositoryMatches && !repositoryStatusChecked
            ? "无法确认节点仓库状态，先备份旧目录并安装干净副本（不会覆盖本地修改）"
            : !repositoryMatches && isGitDirectory
            ? `检测到节点仓库已切换，备份旧目录并安装 ${definition.repositoryUrl}`
            : definition.id === "seedvr2"
            ? "SeedVR2 使用破坏性新版接口：下载干净上游副本并备份替换旧目录"
            : "目录由 ComfyUI Manager 管理，下载上游副本后安全替换"
        );
        try {
          const gitOutput = await runtime.runLoggedProcess(
            git,
            ["clone", "--depth", "1", definition.repositoryUrl, replacementDirectory],
            {
              timeoutMs: 600_000,
              env: commandEnvironment,
              onLog: report
            }
          );
          if (!gitOutput) report("Git：克隆完成");
          if (definition.id === "comfyui-gguf-h3") {
            report("正在应用 H3 GGUF 独立节点适配层……");
            await prepareH3Gguf(replacementDirectory, report);
            h3GgufPrepared = true;
          } else if (definition.id === "video-helper-suite") {
            report("正在应用 Video Helper Suite 兼容补丁……");
            await prepareVideoHelperSuite(replacementDirectory, report);
            videoHelperPrepared = true;
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
      }
    } else {
      report(`克隆 ${definition.repositoryUrl}`);
      const gitOutput = await runtime.runLoggedProcess(
        git,
        ["clone", "--depth", "1", definition.repositoryUrl, targetDirectory],
        {
          timeoutMs: 600_000,
          env: commandEnvironment,
          onLog: report
        }
      );
      if (!gitOutput) report("Git：克隆完成");
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
    if (definition.id === "minimax-h3-prompt-writer") {
      report("正在检查 H3 Prompt Writer 的 llama-cpp-python API 兼容层……");
      await prepareH3PromptWriter(targetDirectory, report);
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
      report("Qwen3.6 多模态后端已通过自检；请重启 ComfyUI，设置页会继续验证 VisionLLMNode。");
    }
    if (definition.id === "minimax-h3-prompt-writer") {
      report("正在安装并验证 H3 Prompt Writer 共用的 llama-cpp-python 后端……");
      const backend = await installLlamaCppPythonPackage(settings, runtime, report, {
        forceReinstall: false
      });
      if (!backend.ok) throw new Error(backend.message);
      report("H3 Prompt Writer 的 llama-cpp-python 后端已通过自检。");
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
