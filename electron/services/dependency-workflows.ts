import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  workflowDependencyCatalog,
  workflowDependencyDefinition
} from "../../src/core/catalog/index.js";
import type { Settings, WorkflowDependencyStatus } from "../../src/types.js";

export interface WorkflowDependencyRuntime {
  findComfyRoot(settings: Settings): Promise<string>;
  findExecutable(command: string): Promise<string>;
  normalizeProxyUrl(value: string): string;
  downloadEnvironment(settings: Settings): NodeJS.ProcessEnv;
  proxyLogLabel(settings: Settings): string;
  runLoggedProcess(
    executable: string,
    args: string[],
    options: {
      env?: NodeJS.ProcessEnv;
      timeoutMs?: number;
      onLog?: (message: string) => void;
    }
  ): Promise<string>;
}

async function exists(filename: string): Promise<boolean> {
  return fs.stat(filename).then((stat) => stat.isFile()).catch(() => false);
}

export function workflowDependenciesFor(comfyRoot: string): WorkflowDependencyStatus[] {
  return workflowDependencyCatalog.map((definition) => ({
    id: definition.id,
    name: definition.name,
    purpose: definition.purpose,
    installed: false,
    path: comfyRoot ? path.join(comfyRoot, ...definition.targetSegments) : "",
    sourceUrl: definition.sourceUrl
  }));
}

export async function scanWorkflowDependencies(
  comfyRoot: string
): Promise<WorkflowDependencyStatus[]> {
  return Promise.all(workflowDependenciesFor(comfyRoot).map(async (workflow) => ({
    ...workflow,
    installed: Boolean(workflow.path) && await exists(workflow.path)
  })));
}

export async function installWorkflowDependencyPackage(
  workflowId: WorkflowDependencyStatus["id"],
  settings: Settings,
  runtime: WorkflowDependencyRuntime,
  onLog?: (message: string) => void
): Promise<{ ok: boolean; message: string; log?: string }> {
  const definition = workflowDependencyDefinition(workflowId);
  if (!definition) {
    return { ok: false, message: "未知的工作流依赖，已拒绝安装。" };
  }
  const installLog: string[] = [];
  const report = (message: string) => {
    const normalized = message.trim();
    if (!normalized) return;
    installLog.push(normalized);
    onLog?.(normalized);
  };
  report(runtime.proxyLogLabel(settings));
  let temporaryFile = "";
  try {
    const comfyRoot = await runtime.findComfyRoot(settings);
    if (!comfyRoot) throw new Error("没有找到 ComfyUI 数据目录。");
    const workflow = workflowDependenciesFor(comfyRoot).find(
      (candidate) => candidate.id === definition.id
    );
    if (!workflow) throw new Error("工作流依赖定义不完整，已停止安装。");
    const targetDirectory = path.dirname(workflow.path);
    await fs.mkdir(targetDirectory, { recursive: true });
    temporaryFile = path.join(
      targetDirectory,
      `.${definition.id}-${crypto.randomUUID()}.download`
    );
    const curl = await runtime.findExecutable("curl.exe");
    if (!curl) throw new Error("没有找到 curl，无法下载官方工作流。");
    const args = ["-fL", "--retry", "2", "--connect-timeout", "20"];
    if (settings.proxyEnabled) {
      args.push("--proxy", runtime.normalizeProxyUrl(settings.proxyUrl));
    }
    args.push(workflow.sourceUrl, "--output", temporaryFile);
    report(`下载 ${workflow.sourceUrl}`);
    const output = await runtime.runLoggedProcess(curl, args, {
      timeoutMs: 180_000,
      env: runtime.downloadEnvironment(settings),
      onLog: report
    });
    if (!output) report("官方工作流下载完成");
    report("正在校验工作流 JSON……");
    const source = await fs.readFile(temporaryFile, "utf8");
    const parsed = JSON.parse(source) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("下载的工作流不是有效 JSON 对象。");
    }
    await fs.copyFile(temporaryFile, workflow.path);
    report(`已安装：${workflow.path}`);
    return {
      ok: true,
      message: `${definition.name} 已安装到 ComfyUI。`,
      log: installLog.join("\n\n")
    };
  } catch (error) {
    report(error instanceof Error ? error.message : String(error));
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      log: installLog.join("\n\n")
    };
  } finally {
    if (temporaryFile) await fs.rm(temporaryFile, { force: true }).catch(() => undefined);
  }
}
