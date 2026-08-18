import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { customNodeCatalog } from "../../src/core/catalog/index.js";
import {
  compareReleaseVersions,
  normalizeReleaseVersion
} from "../../src/core/release-version.js";
import type { CustomNodeStatus, Settings } from "../../src/types.js";
import type {
  CatalogCustomNodeDefinition,
  DependencyBadRange
} from "../../src/core/catalog/dependencies/types.js";
import {
  ltxAudioVaeCompatible,
  videoHelperBatchCompatible
} from "./dependency-compatibility.js";
import { readComfyGitRevision } from "./comfy-discovery.js";

async function readPythonProjectVersion(directory: string): Promise<string> {
  if (!directory) return "";
  return fs.readFile(path.join(directory, "pyproject.toml"), "utf8")
    .then((source) => normalizeReleaseVersion(
      source.match(/^version\s*=\s*["']([^"']+)["']/m)?.[1] ?? ""
    ))
    .catch(() => "");
}

function normalizedRepositoryUrl(value: string): string {
  return value
    .trim()
    .replace(/^git\+/, "")
    .replace(/^https?:\/\//i, "")
    .replace(/^git@github\.com:/i, "github.com/")
    .replace(/\.git$/i, "")
    .replace(/\/+$/u, "")
    .toLowerCase();
}

async function gitRemoteUrl(directory: string): Promise<string> {
  const source = await fs.readFile(path.join(directory, ".git", "config"), "utf8")
    .catch(() => "");
  return source.match(/\[remote\s+"origin"\][\s\S]*?\n\s*url\s*=\s*([^\r\n]+)/i)?.[1]?.trim() ?? "";
}

async function directoryContainsMotionContextNodes(directory: string): Promise<boolean> {
  const candidates = [
    "nodes.py",
    "patch_layout.py",
    "__init__.py",
    path.join("nodes", "motion_context_node.py")
  ];
  const sources = await Promise.all(candidates.map((filename) =>
    fs.readFile(path.join(directory, filename), "utf8").catch(() => "")
  ));
  const combined = sources.join("\n");
  return [
    "MiniMaxH3MotionContext",
    "MiniMaxH3MotionContextTrim",
    "MiniMaxH3MotionContextSaveLatent",
    "MiniMaxH3MotionContextLoadLatent"
  ].some((nodeType) => combined.includes(nodeType));
}

async function findMotionContextDirectories(
  entries: readonly import("node:fs").Dirent[],
  customNodesDirectory: string
): Promise<string[]> {
  if (!customNodesDirectory) return [];
  const repository = normalizedRepositoryUrl(
    "https://github.com/NikoDemon80/ComfyUI-H3-Motion-Context.git"
  );
  const directories = entries.filter((entry) => entry.isDirectory());
  const matches = await Promise.all(directories.map(async (entry) => {
    const directory = path.join(customNodesDirectory, entry.name);
    const exactName = entry.name.toLowerCase() === "comfyui-h3-motion-context";
    if (exactName) return directory;
    const remote = await gitRemoteUrl(directory);
    if (remote && normalizedRepositoryUrl(remote) === repository) return directory;
    return await directoryContainsMotionContextNodes(directory) ? directory : "";
  }));
  return matches.filter(Boolean);
}

function badRangeMatches(
  range: DependencyBadRange,
  version: string,
  revision: string
): boolean {
  const revisionMatch = Boolean(revision) && (
    range.revisionFrom === revision ||
    range.revisionTo === revision ||
    Boolean(range.revisionFrom && range.revisionTo &&
      range.revisionFrom <= revision && revision <= range.revisionTo)
  );
  if (revisionMatch) return true;
  if (!version || (!range.versionFrom && !range.versionTo)) return false;
  const atLeastFrom = !range.versionFrom || compareReleaseVersions(version, range.versionFrom) >= 0;
  const atMostTo = !range.versionTo || compareReleaseVersions(version, range.versionTo) <= 0;
  return atLeastFrom && atMostTo;
}

function compatibilityForNode(
  definition: CatalogCustomNodeDefinition,
  installed: boolean,
  version: string,
  revision: string,
  runtimeVerified: boolean,
  loadError: string,
  updateAvailable: boolean,
  compatibilityNotice: string
): Pick<CustomNodeStatus, "compatibilityState" | "compatibilityNotice"> {
  if (!installed) return { compatibilityState: "unknown", compatibilityNotice: "" };
  if (loadError) {
    const pendingRestart = /尚未加载|重启/u.test(loadError);
    return {
      compatibilityState: pendingRestart ? "warning" : "error",
      compatibilityNotice
    };
  }
  const knownBad = definition.knownBadRanges?.find((range) =>
    badRangeMatches(range, version, revision)
  );
  if (knownBad) return { compatibilityState: "error", compatibilityNotice: knownBad.reason };
  if (!version && definition.minimumVersion) {
    const versionNotice = `已安装但未读取到版本号；最低支持 v${definition.minimumVersion}，请在 Git 元数据可用时重新扫描。`;
    return {
      compatibilityState: "warning",
      compatibilityNotice: [versionNotice, compatibilityNotice].filter(Boolean).join("；")
    };
  }
  if (definition.minimumVersion && version &&
      compareReleaseVersions(version, definition.minimumVersion) < 0) {
    return {
      compatibilityState: "error",
      compatibilityNotice: `版本过低：当前 v${version}，最低支持 v${definition.minimumVersion}。`
    };
  }
  if (updateAvailable || !runtimeVerified || compatibilityNotice) {
    return { compatibilityState: "warning", compatibilityNotice };
  }
  return {
    compatibilityState: "supported",
    compatibilityNotice: "版本与节点状态已读取；最终工作流兼容性仍由运行时检查确认。"
  };
}

export function availableComfyNodeIds(objectInfo: unknown): Set<string> {
  return objectInfo && typeof objectInfo === "object" && !Array.isArray(objectInfo)
    ? new Set(Object.keys(objectInfo as Record<string, unknown>))
    : new Set<string>();
}

export interface ComfyLogFileInfo {
  filename: string;
  size: number;
  modifiedAt: number;
}

/**
 * Find the log file belonging to the selected ComfyUI installation.
 *
 * ComfyUI Desktop and manual/portable installs use different locations, so
 * the scanner keeps the same candidate order used by the environment panel.
 * The filename is intentionally returned separately from the content so the
 * runtime log bridge can tail a growing file without rereading the whole log.
 */
export async function latestComfyLogFile(
  comfyRoot: string
): Promise<ComfyLogFileInfo | null> {
  const appData =
    process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  const candidates: Array<{ filename: string; priority: number }> = [];
  const userDirectory = comfyRoot ? path.join(comfyRoot, "user") : "";
  if (userDirectory) {
    const entries = await fs.readdir(userDirectory, { withFileTypes: true }).catch(() => []);
    candidates.push(
      ...entries
        .filter((entry) => entry.isFile() && /^comfyui.*\.log$/i.test(entry.name))
        .map((entry) => ({
          filename: path.join(userDirectory, entry.name),
          priority: 0
        }))
    );
  }
  if (comfyRoot) {
    candidates.push({
      filename: path.join(comfyRoot, "logs", "comfyui.log"),
      priority: 0
    });
  }
  candidates.push({
    filename: path.join(appData, "ComfyUI", "logs", "comfyui.log"),
    priority: 1
  });
  const available = (
    await Promise.all(
      candidates.map(async (candidate) => ({
        ...candidate,
        stat: await fs.stat(candidate.filename).catch(() => null)
      }))
    )
  )
    .filter((item) => item.stat?.isFile() && (item.stat.size ?? 0) > 0)
    .sort((left, right) =>
      left.priority - right.priority ||
      (right.stat?.mtimeMs ?? 0) - (left.stat?.mtimeMs ?? 0)
    );
  const selected = available[0];
  return selected?.stat
    ? {
        filename: selected.filename,
        size: selected.stat.size ?? 0,
        modifiedAt: selected.stat.mtimeMs ?? 0
      }
    : null;
}

export async function readLatestComfyLog(
  comfyRoot: string
): Promise<{ content: string; modifiedAt: number; filename?: string }> {
  const selected = await latestComfyLogFile(comfyRoot);
  if (!selected) return { content: "", modifiedAt: 0 };
  return {
    content: await fs.readFile(selected.filename, "utf8").catch(() => ""),
    modifiedAt: selected.modifiedAt,
    filename: selected.filename
  };
}

interface H3PromptWriterRuntimeProbe {
  loaded: boolean | null;
  error: string;
  notice: string;
}

interface H3PromptWriterRuntimeDiagnostics {
  status?: unknown;
  message?: unknown;
  error?: unknown;
  return_code_hex?: unknown;
  gpu_offload?: unknown;
  backend?: unknown;
}

/**
 * The Prompt Writer 0.3.x diagnostic endpoint runs a small native probe which
 * can report `gpu_offload: false` before the ComfyUI Python process has loaded
 * its CUDA backend. That probe is useful evidence, but it must not override
 * the app's torch-first shared llama-cpp-python probe (the latter is the
 * authoritative check used before a Gemma/Qwen GGUF request).
 */
function promptWriterDiagnosticNotice(
  diagnostics: H3PromptWriterRuntimeDiagnostics | undefined
): string {
  if (!diagnostics || String(diagnostics.status ?? "").toLowerCase() !== "ok") return "";
  const backend = typeof diagnostics.backend === "string"
    ? diagnostics.backend.trim()
    : "";
  if (diagnostics.gpu_offload === false && !backend) {
    return "节点自带诊断探针未加载 CUDA 后端；应用侧共享 llama-cpp-python 自检作为最终运行依据，不代表当前生成接口失败。";
  }
  return "";
}

async function inspectH3PromptWriterRuntime(
  serviceRoot: string,
  runtimeEndpoint: string
): Promise<H3PromptWriterRuntimeProbe> {
  if (!serviceRoot || !runtimeEndpoint) {
    return { loaded: null, error: "", notice: "" };
  }
  try {
    const statusResponse = await fetch(`${serviceRoot}${runtimeEndpoint}`, {
      signal: AbortSignal.timeout(5_000)
    });
    if (!statusResponse.ok) {
      return {
        loaded: false,
        error: `MiniMax H3 Prompt Writer 运行接口不可用（HTTP ${statusResponse.status}）`,
        notice: ""
      };
    }
    const modelsResponse = await fetch(`${serviceRoot}/h3studio/models`, {
      signal: AbortSignal.timeout(5_000)
    });
    if (!modelsResponse.ok) {
      return {
        loaded: false,
        error: `MiniMax H3 Prompt Writer 模型接口不可用（HTTP ${modelsResponse.status}）`,
        notice: ""
      };
    }
    const modelBody = await modelsResponse.json().catch(() => ({})) as {
      models?: unknown;
    };
    const modelCount = Array.isArray(modelBody.models) ? modelBody.models.length : 0;
    let error = "";
    const diagnosticsResponse = await fetch(
      `${serviceRoot}/h3studio/runtime/gguf/diagnostics`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: true }),
        signal: AbortSignal.timeout(20_000)
      }
    ).catch(() => null);
    let diagnosticNotice = "";
    if (diagnosticsResponse?.ok) {
      const diagnosticsBody = await diagnosticsResponse.json().catch(() => ({})) as {
        diagnostics?: H3PromptWriterRuntimeDiagnostics;
      };
      const diagnostics = diagnosticsBody.diagnostics;
      const status = String(diagnostics?.status ?? "").toLowerCase();
      const detail = [diagnostics?.message, diagnostics?.error]
        .filter((value) => typeof value === "string" && value.trim())
        .join("：");
      const code = String(diagnostics?.return_code_hex ?? "").toUpperCase();
      if (status === "crashed" && (code === "0XC000001D" || /illegal instruction|非法指令/iu.test(detail))) {
        error = `H3 Prompt Writer GGUF 运行库崩溃：${code || "0xC000001D"}${detail ? `（${detail}）` : ""}`;
      } else if (["crashed", "timeout", "invalid_response"].includes(status)) {
        error = `H3 Prompt Writer 运行时自检失败：${detail || status}`;
      }
      diagnosticNotice = promptWriterDiagnosticNotice(diagnostics);
    }
    return {
      loaded: !error,
      error,
      notice: [
        modelCount
          ? `H3 Prompt Writer 运行接口已响应，发现 ${modelCount} 个模型`
          : "H3 Prompt Writer 节点已加载，但当前没有发现 GGUF 模型；节点本身无需重复安装",
        diagnosticNotice
      ].filter(Boolean).join("；")
    };
  } catch {
    return {
      // A stopped/offline ComfyUI is an unknown state, not an import failure.
      // Keep the file scan useful while allowing a connected service to prove
      // the node through /h3studio/status and /h3studio/models below.
      loaded: null,
      error: "",
      notice: ""
    };
  }
}

export async function scanCustomNodes(
  comfyRoot: string,
  settings: Settings,
  latestSpectrumVersion = "",
  runtimeBaseUrl = "",
  latestMotionContextVersion = "",
  latestNodeVersions: Readonly<Record<string, string>> = {}
): Promise<CustomNodeStatus[]> {
  const customNodesDirectory = comfyRoot
    ? path.join(comfyRoot, "custom_nodes")
    : "";
  const entries = customNodesDirectory
    ? await fs.readdir(customNodesDirectory, { withFileTypes: true }).catch(() => [])
    : [];
  const installedDirectories = new Map(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => [entry.name.toLowerCase(), path.join(customNodesDirectory, entry.name)])
  );
  const motionContextDirectories = await findMotionContextDirectories(entries, customNodesDirectory);
  const log = (await readLatestComfyLog(comfyRoot)).content;
  const logLines = log.split(/\r?\n/);
  const serviceRoot = (runtimeBaseUrl || settings.comfyUrl).replace(/\/+$/, "");
  const serviceNodeIds = await fetch(
    `${serviceRoot}/object_info`,
    { signal: AbortSignal.timeout(5_000) }
  )
    .then(async (response) => response.ok
      ? availableComfyNodeIds(await response.json())
      : null)
    .catch(() => null);
  const promptWriterEndpoint = customNodeCatalog.find(
    (definition) => definition.id === "minimax-h3-prompt-writer"
  )?.runtimeEndpoint;
  const h3PromptWriterRuntime = await inspectH3PromptWriterRuntime(
    promptWriterEndpoint ? serviceRoot : "",
    promptWriterEndpoint || ""
  );

  const revisionCache = new Map<string, Promise<string>>();
  const readRevision = (directory: string): Promise<string> => {
    if (!directory) return Promise.resolve("");
    const cached = revisionCache.get(directory);
    if (cached) return cached;
    const pending = readComfyGitRevision(directory);
    revisionCache.set(directory, pending);
    return pending;
  };

  return Promise.all(customNodeCatalog.map(async (definition) => {
    const matchedName = definition.aliases.find((alias) =>
      installedDirectories.has(alias.toLowerCase())
    );
    const exactDirectory = matchedName
      ? installedDirectories.get(matchedName.toLowerCase()) ?? ""
      : "";
    const directory = definition.id === "h3-motion-context"
      ? exactDirectory || motionContextDirectories[0] || ""
      : exactDirectory;
    const duplicateDirectories = definition.id === "h3-motion-context"
      ? motionContextDirectories.filter((candidate) => candidate !== directory)
      : [];
    const failed =
      Boolean(directory) &&
      (logLines.some((line) =>
        line.trim().endsWith(`(IMPORT FAILED): ${directory}`)
      ) ||
        logLines.some((line) =>
          line.includes(`Cannot import ${directory} module`)
        ));
    const importErrorLine = failed
      ? [...logLines]
          .reverse()
          .find((line) => line.includes(`Cannot import ${directory} module`))
          ?.replace(/^.*?Cannot import /, "Cannot import ")
      : "";
    let compatibilityError = "";
    let compatibilityNotice = "";
    let updateNotice = "";
    let optionalUpdateRecommended = false;
    if (definition.id === "video-helper-suite" && directory) {
      compatibilityError = await Promise.all([
        fs.readFile(path.join(directory, "videohelpersuite", "utils.py"), "utf8"),
        fs.readFile(path.join(directory, "videohelpersuite", "nodes.py"), "utf8"),
        fs.readFile(
          path.join(directory, "videohelpersuite", "load_video_nodes.py"),
          "utf8"
        )
      ])
        .then(([utilsSource, nodesSource, loadVideoSource]) =>
          videoHelperBatchCompatible(utilsSource, nodesSource, loadVideoSource)
            ? ""
            : "版本过旧：不兼容当前 ComfyUI 的分批视频队列，请更新节点"
        )
        .catch(() => "无法读取 VideoHelperSuite 版本文件");
    } else if (definition.id === "ltx-video" && directory) {
      compatibilityError = await fs
        .readFile(path.join(directory, "low_vram_loaders.py"), "utf8")
        .then((source) =>
          ltxAudioVaeCompatible(source)
            ? ""
            : "AudioVAE 加载接口过旧：不兼容当前 ComfyUI，请修复/更新节点"
        )
        .catch(() => "无法读取 ComfyUI-LTXVideo 版本文件");
    } else if (definition.id === "seedvr2" && directory) {
      compatibilityError = await Promise.all([
        fs.readFile(path.join(directory, "src", "interfaces", "dit_model_loader.py"), "utf8"),
        fs.readFile(path.join(directory, "src", "interfaces", "vae_model_loader.py"), "utf8"),
        fs.readFile(path.join(directory, "src", "interfaces", "video_upscaler.py"), "utf8")
      ])
        .then(() => "")
        .catch(() => "旧版 SeedVR2 单体节点已不再支持；请更新到 2.5.24+ 模块化节点");
    } else if (definition.id === "kjnodes" && directory) {
      const previewSourceAvailable = await fs
        .readFile(path.join(directory, "nodes", "preview_override_node.py"), "utf8")
        .then((source) => source.includes("ModelPreviewOverrideKJ"))
        .catch(() => false);
      optionalUpdateRecommended = !previewSourceAvailable;
      updateNotice = !previewSourceAvailable
        ? "当前 KJNodes 缺少可选的 H3 TAE 实时预览节点；更新后可启用实时预览"
        : serviceNodeIds !== null && !serviceNodeIds.has("ModelPreviewOverrideKJ")
          ? "H3 TAE 实时预览文件已安装，但当前服务尚未加载；重启 ComfyUI 后可用"
          : "";
    }
    const version = await readPythonProjectVersion(directory);
    const belowMinimumVersion = Boolean(
      directory && definition.minimumVersion &&
      (!version || compareReleaseVersions(version, definition.minimumVersion) < 0)
    );
    if (!compatibilityError && belowMinimumVersion) {
      compatibilityError = version
        ? `版本过低：当前 v${version}，最低支持 v${definition.minimumVersion}`
        : "";
      compatibilityNotice = version
        ? ""
        : `已安装但未读取到版本号；最低支持 v${definition.minimumVersion}，请重新扫描确认。`;
    }
    // Keep the two positional values for callers from older builds while all
    // catalog entries can now receive the same cached GitHub release lookup.
    const latestVersion = latestNodeVersions[definition.id] ||
      (definition.id === "spectrum-minimax-h3"
        ? latestSpectrumVersion
        : definition.id === "h3-motion-context"
          ? latestMotionContextVersion
          : "") || definition.latestVersion || "";
    const detectedRevision = await readRevision(directory);
    const requiredNodeTypes = definition.nodeTypes;
    // Prompt Writer exposes a more specific runtime contract than
    // /object_info. If its status/models endpoints respond, use that as
    // runtime evidence even when ComfyUI's broad object-info request is
    // temporarily unavailable during startup.
    const runtimeVerified = serviceNodeIds !== null || (
      definition.id === "minimax-h3-prompt-writer" &&
      h3PromptWriterRuntime.loaded === true
    );
    const registered = definition.runtimeEndpoint
      ? h3PromptWriterRuntime.loaded !== false
      : !runtimeVerified || !requiredNodeTypes ||
        (serviceNodeIds !== null && requiredNodeTypes.every((nodeType) => serviceNodeIds.has(nodeType)));
    const pendingRestartError = Boolean(directory) && !compatibilityError &&
      !failed && requiredNodeTypes && runtimeVerified && !registered
      ? "节点文件已安装，但当前 ComfyUI 服务尚未加载全部必需模块；请重启服务后复检"
      : "";
    const duplicateNotice = duplicateDirectories.length
      ? `检测到 ${duplicateDirectories.length + 1} 个 H3 Motion Context 副本；只保留一个副本，否则运行时 patch 可能冲突。`
      : "";
    const loadError = compatibilityError || importErrorLine ||
      (definition.id === "minimax-h3-prompt-writer" && directory ? h3PromptWriterRuntime.error : "") ||
      (failed ? "最近一次启动时导入失败" : "") || pendingRestartError;
    const updateAvailable = Boolean(
      compatibilityError || optionalUpdateRecommended ||
      (definition.recommendedVersion && (!version ||
        compareReleaseVersions(version, definition.recommendedVersion) < 0)) ||
      (version && latestVersion && compareReleaseVersions(version, latestVersion) < 0)
    );
    const compatibility = compatibilityForNode(
      definition,
      Boolean(directory),
      version,
      detectedRevision,
      runtimeVerified,
      loadError,
      updateAvailable,
      compatibilityNotice || updateNotice || pendingRestartError || duplicateNotice
    );
    return {
      id: definition.id,
      name: definition.name,
      purpose: definition.purpose,
      repositoryUrl: definition.repositoryUrl,
      installed: Boolean(directory),
      loaded: Boolean(directory) && !loadError && registered,
      runtimeVerified,
      loadError,
      updateNotice,
      runtimeNotice: definition.id === "minimax-h3-prompt-writer"
        ? h3PromptWriterRuntime.notice
        : "",
      directory,
      required: definition.required,
      version,
      minimumVersion: definition.minimumVersion ?? "",
      recommendedVersion: definition.recommendedVersion ?? "",
      latestVersion,
      detectedRevision,
      compatibilityState: compatibility.compatibilityState,
      compatibilityNotice: compatibility.compatibilityNotice,
      compatibilityEvidence: definition.compatibilityEvidence
        ? [...definition.compatibilityEvidence]
        : [],
      knownBadRanges: definition.knownBadRanges ? [...definition.knownBadRanges] : [],
      duplicateDirectories,
      runtimeRequirement: definition.runtimeRequirement ?? "",
      bulkInstall: definition.bulkInstall !== false,
      updateAvailable
    };
  }));
}
