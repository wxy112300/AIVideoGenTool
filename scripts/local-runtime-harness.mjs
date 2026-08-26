import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const promptWriterNodeId = "minimax-h3-prompt-writer";
const promptWriterEndpoint = "/h3studio/status";
const supportedActions = new Set([
  "probe-prompt-writer",
  "scan",
  "restart-comfy",
  "repair-prompt-writer"
]);

export function defaultStudioStatePath(
  environment = process.env,
  platform = process.platform
) {
  if (platform === "win32" && environment.APPDATA) {
    return path.join(environment.APPDATA, "ai-video-gen-tool", "studio-state.json");
  }
  return path.join(
    environment.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
    "ai-video-gen-tool",
    "studio-state.json"
  );
}

export function parseHarnessArgs(argv) {
  let action = "probe-prompt-writer";
  let statePath = "";
  let json = false;
  let help = false;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--json") {
      json = true;
    } else if (value === "--help" || value === "-h") {
      help = true;
    } else if (value === "--state") {
      statePath = argv[index + 1] || "";
      index += 1;
      if (!statePath) throw new Error("--state 需要一个 studio-state.json 路径。");
    } else if (value?.startsWith("--")) {
      throw new Error(`未知参数：${value}`);
    } else if (value) {
      action = value;
    }
  }
  if (!help && !supportedActions.has(action)) {
    throw new Error(`未知操作：${action}`);
  }
  return { action, statePath, json, help };
}

export async function loadHarnessSettings(statePath) {
  const source = await fs.readFile(statePath, "utf8").catch((error) => {
    throw new Error(`无法读取应用状态 ${statePath}：${error.message}`);
  });
  const state = JSON.parse(source);
  if (!state?.settings || typeof state.settings !== "object") {
    throw new Error(`应用状态缺少 settings：${statePath}`);
  }
  if (typeof state.settings.comfyUrl !== "string" || !state.settings.comfyUrl.trim()) {
    throw new Error(`应用状态缺少有效的 comfyUrl：${statePath}`);
  }
  return state.settings;
}

export function summarizePromptWriterNode(scan) {
  const node = scan?.customNodes?.find((candidate) => candidate.id === promptWriterNodeId);
  return node
    ? {
        id: node.id,
        installed: node.installed,
        loaded: node.loaded,
        runtimeVerified: node.runtimeVerified,
        runtimeRepairable: node.runtimeRepairable === true,
        version: node.version,
        loadError: node.loadError,
        runtimeNotice: node.runtimeNotice || "",
        directory: node.directory
      }
    : {
        id: promptWriterNodeId,
        installed: false,
        loaded: false,
        runtimeVerified: false,
        runtimeRepairable: false,
        version: "",
        loadError: "环境扫描没有返回 MiniMax H3 Prompt Writer。",
        runtimeNotice: "",
        directory: ""
      };
}

function harnessHelp() {
  return [
    "Local Video Studio runtime harness",
    "",
    "Usage:",
    "  npm.cmd run harness:comfy -- probe-prompt-writer [--json]",
    "  npm.cmd run harness:comfy -- scan [--json]",
    "  npm.cmd run harness:comfy -- restart-comfy [--json]",
    "  npm.cmd run harness:comfy -- repair-prompt-writer [--json]",
    "",
    "Options:",
    "  --state <path>  使用指定的 studio-state.json；默认读取当前用户的应用状态",
    "  --json          输出机器可读 JSON"
  ].join("\n");
}

async function importBuiltService(relativePath) {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const filename = path.join(repositoryRoot, "dist", "electron", "electron", "services", relativePath);
  await fs.access(filename).catch(() => {
    throw new Error(`缺少已构建服务 ${filename}；请先运行 npm.cmd run build。`);
  });
  return import(pathToFileURL(filename).href);
}

async function probePromptWriter(settings) {
  const scanner = await importBuiltService("dependency-scanner.js");
  const serviceRoot = settings.comfyUrl.replace(/\/+$/u, "");
  const healthResponse = await fetch(`${serviceRoot}/system_stats`, {
    signal: AbortSignal.timeout(3_000)
  }).catch(() => null);
  if (!healthResponse?.ok) {
    return {
      action: "probe-prompt-writer",
      endpoint: `${serviceRoot}${promptWriterEndpoint}`,
      ok: false,
      loaded: null,
      error: "ComfyUI 接口不可用，尚未执行 Prompt Writer 运行时探针。",
      notice: ""
    };
  }
  const probe = await scanner.inspectH3PromptWriterRuntime(
    serviceRoot,
    promptWriterEndpoint
  );
  return {
    action: "probe-prompt-writer",
    endpoint: `${serviceRoot}${promptWriterEndpoint}`,
    ok: probe.loaded === true,
    ...probe
  };
}

export async function runHarnessAction(action, settings) {
  if (action === "probe-prompt-writer") return probePromptWriter(settings);

  process.env.LOCAL_VIDEO_STUDIO_RUNTIME_HARNESS = "1";
  const environment = await importBuiltService("environment.js");
  if (action === "scan") {
    const scan = await environment.scanEnvironment(settings, "dependencies");
    const node = summarizePromptWriterNode(scan);
    return {
      action,
      ok: node.installed && node.loaded && !node.loadError,
      scannedAt: scan.scannedAt,
      comfyRoot: scan.comfyRoot,
      comfyUrl: scan.comfyUrl,
      promptWriter: node
    };
  }

  if (action === "restart-comfy") {
    const restart = await environment.restartLocalService("comfy", settings);
    const probe = restart.ok ? await probePromptWriter(settings) : null;
    return {
      action,
      ok: restart.ok && probe?.ok === true,
      restart,
      probe
    };
  }

  const progress = [];
  const install = await environment.installCustomNode(
    promptWriterNodeId,
    settings,
    (message) => progress.push(message)
  );
  if (!install.ok) {
    return { action, ok: false, install, restart: null, probe: null, progress };
  }
  const restart = await environment.restartLocalService("comfy", settings);
  const probe = restart.ok ? await probePromptWriter(settings) : null;
  return {
    action,
    ok: install.ok && restart.ok && probe?.ok === true,
    install,
    restart,
    probe,
    progress
  };
}

function humanResult(result) {
  const lines = [`操作：${result.action}`, `结果：${result.ok ? "成功" : "失败"}`];
  if (result.endpoint) lines.push(`接口：${result.endpoint}`);
  if (result.notice) lines.push(`状态：${result.notice}`);
  if (result.error) lines.push(`错误：${result.error}`);
  if (result.install) lines.push(`安装：${result.install.message}`);
  if (result.restart) lines.push(`重启：${result.restart.message}`);
  if (result.probe?.notice) lines.push(`复检：${result.probe.notice}`);
  if (result.probe?.error) lines.push(`复检错误：${result.probe.error}`);
  if (result.promptWriter) {
    lines.push(
      `Prompt Writer：v${result.promptWriter.version || "unknown"} · ` +
      `${result.promptWriter.loaded ? "已加载" : "未加载"}`
    );
    if (result.promptWriter.loadError) lines.push(`错误：${result.promptWriter.loadError}`);
  }
  if (result.progress?.length) {
    lines.push("", "安装日志：", ...result.progress);
  }
  return lines.join("\n");
}

async function main() {
  const options = parseHarnessArgs(process.argv.slice(2));
  if (options.help) {
    console.log(harnessHelp());
    return;
  }
  const statePath = path.resolve(options.statePath || defaultStudioStatePath());
  const settings = await loadHarnessSettings(statePath);
  const result = await runHarnessAction(options.action, settings);
  console.log(options.json ? JSON.stringify(result, null, 2) : humanResult(result));
  if (!result.ok) process.exitCode = 1;
}

const invokedDirectly = process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
