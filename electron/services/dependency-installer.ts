import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { customNodeDefinition } from "../../src/core/catalog/index.js";
import type { Settings } from "../../src/types.js";
import {
  prepareLtxVideo,
  prepareVideoHelperSuite
} from "./dependency-node-adapters.js";

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
    const commandEnvironment = runtime.downloadEnvironment(settings);
    report(runtime.proxyLogLabel(settings));
    report("正在定位所选 ComfyUI 的数据目录和 Python 环境……");
    const comfyRoot = await runtime.findComfyRoot(settings);
    if (!comfyRoot) throw new Error("没有找到 ComfyUI 数据目录。");
    const customNodesDirectory = path.join(comfyRoot, "custom_nodes");
    const targetDirectory = path.join(customNodesDirectory, definition.directoryName);
    const git = await runtime.findExecutable("git.exe");
    if (!git) throw new Error("缺少 Git，无法下载节点包。");
    await fs.mkdir(customNodesDirectory, { recursive: true });
    let videoHelperPrepared = false;

    if (await runtime.exists(targetDirectory)) {
      if (await runtime.exists(path.join(targetDirectory, ".git")) && definition.id !== "seedvr2") {
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
          definition.id === "seedvr2"
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
          if (definition.id === "video-helper-suite") {
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

    if (definition.id === "video-helper-suite" && !videoHelperPrepared) {
      report("正在应用 Video Helper Suite 兼容补丁……");
      await prepareVideoHelperSuite(targetDirectory, report);
    }
    if (definition.id === "ltx-video") {
      report("正在检查 LTX Video 兼容层……");
      await prepareLtxVideo(targetDirectory, report);
    }

    const isMultimodalPromptNodes = definition.id === "comfyui-multimodal-prompt-nodes";
    const requirements = path.join(targetDirectory, "requirements.txt");
    if (await runtime.exists(requirements)) {
      const python = await runtime.findComfyPython(settings, comfyRoot);
      if (!python) throw new Error("节点已下载，但没有找到所选 ComfyUI 的 Python 环境。");
      // MultiModal Prompt Nodes lists llama-cpp-python in requirements.txt,
      // but its README explicitly warns that the normal PyPI build can
      // overwrite the JamePeng build required for Qwen3.6 vision. Install
      // only the lightweight dependencies here; the backend is installed in
      // the dedicated block below.
      const requirementArgs = isMultimodalPromptNodes
        ? ["-m", "pip", "install", "dashscope>=1.20.0", "pillow>=10.0.0", "numpy>=1.24.0"]
        : ["-m", "pip", "install", "-r", requirements];
      report(
        isMultimodalPromptNodes
          ? "安装 MultiModal Prompt Nodes 的轻量依赖（跳过普通 llama-cpp-python，避免覆盖 Qwen3.6 后端）"
          : `安装 Python 依赖 ${requirements}`
      );
      const pipOutput = await runtime.runLoggedProcess(python, requirementArgs, {
        timeoutMs: 900_000,
        env: commandEnvironment,
        onLog: report
      });
      if (!pipOutput) report("pip：依赖已满足");
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
      const python = await runtime.findComfyPython(settings, comfyRoot);
      if (!python) throw new Error("MultiModal Prompt Nodes 已下载，但没有找到所选 ComfyUI 的 Python 环境。");
      report("安装 Qwen3.6 所需的 JamePeng llama-cpp-python 后端（GPU 多模态构建）……");
      const backendEnvironment = {
        ...commandEnvironment,
        CMAKE_ARGS: [
          commandEnvironment.CMAKE_ARGS,
          "-DGGML_CUDA=ON",
          "-DLLAMA_BUILD_EXAMPLES=OFF",
          "-DLLAMA_BUILD_TOOLS=OFF",
          "-DLLAMA_BUILD_TESTS=OFF",
          "-DLLAMA_BUILD_SERVER=OFF"
        ].filter(Boolean).join(" ")
      };
      const backendOutput = await runtime.runLoggedProcess(
        python,
        [
          "-m", "pip", "install", "--upgrade", "--no-cache-dir",
          "llama-cpp-python @ git+https://github.com/JamePeng/llama-cpp-python.git"
        ],
        {
          timeoutMs: 1_200_000,
          env: backendEnvironment,
          onLog: report
        }
      );
      if (!backendOutput) report("JamePeng llama-cpp-python：后端已满足");
      report("Qwen3.6 多模态后端安装完成；请重启 ComfyUI，设置页会验证 VisionLLMNode 与实际运行时。");
    }
    if (definition.id === "minimax-h3-prompt-writer") {
      const python = await runtime.findComfyPython(settings, comfyRoot);
      if (!python) throw new Error("Prompt Writer 已下载，但没有找到所选 ComfyUI 的 Python 环境。");
      const ggufRequirements = path.join(targetDirectory, "requirements-gguf.txt");
      if (!(await runtime.exists(ggufRequirements))) {
        throw new Error("Prompt Writer 缺少 requirements-gguf.txt，无法安装本地 GGUF 后端。");
      }
      report("安装 ComfyUI 内置 GGUF 运行时（CUDA wheel，不启动独立 llama-server）");
      const args = process.platform === "win32"
        ? [
            "-m", "pip", "install", "--only-binary=:all:",
            "--extra-index-url", "https://abetlen.github.io/llama-cpp-python/whl/cu130",
            "-r", ggufRequirements
          ]
        : ["-m", "pip", "install", "-r", ggufRequirements];
      const ggufOutput = await runtime.runLoggedProcess(python, args, {
        timeoutMs: 1_200_000,
        env: commandEnvironment,
        onLog: report
      });
      if (!ggufOutput) report("GGUF 运行依赖已满足");
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
      message: error instanceof Error ? error.message : String(error),
      log: installLog.join("\n\n")
    };
  }
}
