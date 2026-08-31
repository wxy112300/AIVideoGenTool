import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
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
} from "../../src/infrastructure/dependency-compatibility.js";
import { readComfyGitRevision } from "./comfy-discovery.js";
import {
  multimodalPromptRecognizesQwen38,
  qwenVlNeedsComfyDesktopLoggingShim,
  qwenVlNeedsCooperativeInterrupt
} from "../../src/infrastructure/dependency-node-adapters.js";

const execFileAsync = promisify(execFile);

export interface LocalNodeVersion {
  version: string;
  source: string;
}

export async function readLocalNodeVersion(directory: string): Promise<LocalNodeVersion> {
  if (!directory) return { version: "", source: "" };
  const readText = (filename: string) =>
    fs.readFile(path.join(directory, filename), "utf8").catch(() => "");

  const pyproject = await readText("pyproject.toml");
  const pyprojectVersion = normalizeReleaseVersion(
    pyproject.match(/^version\s*=\s*["']([^"']+)["']/m)?.[1] ?? ""
  );
  if (pyprojectVersion) return { version: pyprojectVersion, source: "pyproject.toml" };

  const packageJson = await readText("package.json");
  if (packageJson) {
    try {
      const packageVersion = normalizeReleaseVersion(
        String((JSON.parse(packageJson) as { version?: unknown }).version ?? "")
      );
      if (packageVersion) return { version: packageVersion, source: "package.json" };
    } catch {
      // Continue to other package-owned version sources.
    }
  }

  for (const filename of ["VERSION", "VERSION.txt", "version.txt"]) {
    const version = normalizeReleaseVersion((await readText(filename)).split(/\r?\n/u)[0] ?? "");
    if (version) return { version, source: filename };
  }

  for (const filename of ["__init__.py", "nodes.py"]) {
    const source = await readText(filename);
    const version = normalizeReleaseVersion(
      source.match(/^(?:__version__|VERSION)\s*=\s*["']([^"']+)["']/m)?.[1] ?? ""
    );
    if (version) return { version, source: filename };
  }

  return { version: "", source: "" };
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

type GitDirtyState = "clean" | "dirty" | "unknown";

async function gitDirtyState(directory: string): Promise<GitDirtyState> {
  if (!directory || !(await fs.stat(path.join(directory, ".git")).catch(() => null))) {
    return "unknown";
  }
  try {
    const { stdout } = await execFileAsync(
      process.platform === "win32" ? "git.exe" : "git",
      ["-C", directory, "status", "--porcelain", "--untracked-files=all"],
      { encoding: "utf8", timeout: 5_000, windowsHide: true }
    );
    return stdout.trim() ? "dirty" : "clean";
  } catch {
    return "unknown";
  }
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

async function directoryContainsNodeTypes(
  directory: string,
  nodeTypes: readonly string[]
): Promise<boolean> {
  const candidates = [
    "__init__.py",
    "nodes.py",
    "public_nodes.py",
    "memory_migration_node.py",
    path.join("h3_optimizations", "__init__.py"),
    path.join("h3_optimizations", "public_nodes.py"),
    path.join("h3_optimizations", "memory_migration_node.py")
  ];
  const sources = await Promise.all(candidates.map((filename) =>
    fs.readFile(path.join(directory, filename), "utf8").catch(() => "")
  ));
  return nodeTypes.some((nodeType) => sources.some((source) => source.includes(nodeType)));
}

async function findH3MemoryDirectories(
  entries: readonly import("node:fs").Dirent[],
  customNodesDirectory: string
): Promise<string[]> {
  if (!customNodesDirectory) return [];
  const definition = customNodeCatalog.find((item) => item.id === "h3-optimizations");
  if (!definition) return [];
  const repository = normalizedRepositoryUrl(definition.repositoryUrl);
  const aliases = new Set(definition.aliases.map((alias) => alias.toLowerCase()));
  const directories = entries.filter((entry) => entry.isDirectory());
  const matches = await Promise.all(directories.map(async (entry) => {
    const directory = path.join(customNodesDirectory, entry.name);
    if (aliases.has(entry.name.toLowerCase())) return directory;
    const remote = await gitRemoteUrl(directory);
    if (remote && normalizedRepositoryUrl(remote) === repository) return directory;
    return await directoryContainsNodeTypes(directory, definition.nodeTypes ?? [])
      ? directory
      : "";
  }));
  return matches.filter(Boolean);
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
      compatibilityNotice: joinUniqueNotices(versionNotice, compatibilityNotice)
    };
  }
  if (definition.minimumVersion && version &&
      compareReleaseVersions(version, definition.minimumVersion) < 0) {
    return {
      compatibilityState: "error",
      compatibilityNotice: `版本过低：当前 v${version}，最低支持 v${definition.minimumVersion}。`
    };
  }
  if (updateAvailable || compatibilityNotice) {
    return { compatibilityState: "warning", compatibilityNotice };
  }
  return {
    compatibilityState: "supported",
    // A stopped ComfyUI cannot prove registration, but the local package and
    // version checks are enough for a green static pass. Runtime registration
    // remains a separate pending evidence axis until ComfyUI is available.
    compatibilityNotice: runtimeVerified
      ? "版本与节点状态已读取；最终工作流兼容性仍由运行时检查确认。"
      : ""
  };
}

function joinUniqueNotices(...notices: string[]): string {
  return [...new Set(notices.filter(Boolean))].join("；");
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

export interface H3PromptWriterRuntimeProbe {
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

export async function inspectH3PromptWriterRuntime(
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
  const h3MemoryDirectories = await findH3MemoryDirectories(entries, customNodesDirectory);
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
  const dirtyStateCache = new Map<string, Promise<GitDirtyState>>();
  const readDirtyState = (directory: string): Promise<GitDirtyState> => {
    if (!directory) return Promise.resolve("unknown");
    const cached = dirtyStateCache.get(directory);
    if (cached) return cached;
    const pending = gitDirtyState(directory);
    dirtyStateCache.set(directory, pending);
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
      : definition.id === "h3-optimizations"
        ? exactDirectory || h3MemoryDirectories[0] || ""
      : exactDirectory;
    const duplicateDirectories = definition.id === "h3-motion-context"
      ? motionContextDirectories.filter((candidate) => candidate !== directory)
      : definition.id === "h3-optimizations"
        ? h3MemoryDirectories.filter((candidate) => candidate !== directory)
      : [];
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
    } else if (definition.id === "comfyui-qwenvl-lora" && directory) {
      const source = await fs
        .readFile(path.join(directory, "nodes.py"), "utf8")
        .catch(() => "");
      if (source && (qwenVlNeedsComfyDesktopLoggingShim(source) || qwenVlNeedsCooperativeInterrupt(source))) {
        // This is a file-level compatibility check, not runtime proof. It
        // lets an offline scan explain why the node can be installed yet fail
        // later on ComfyUI Desktop, and gives the installer a deterministic
        // repair target for every machine/data directory.
        const notice = qwenVlNeedsCooperativeInterrupt(source)
          ? "节点缺少提示词生成的协作式中断支持；取消可能无法及时生效，请执行一键修复并重启服务"
          : "节点仍直接写入 stdout；ComfyUI Desktop 可能触发 Bad file descriptor，请执行一键修复并重启服务";
        compatibilityNotice = notice;
        updateNotice = notice;
        optionalUpdateRecommended = true;
      }
    } else if (definition.id === "comfyui-multimodal-prompt-nodes" && directory) {
      const [visionSource, discoverySource] = await Promise.all([
        fs.readFile(path.join(directory, "vision_llm_node.py"), "utf8").catch(() => ""),
        fs.readFile(path.join(directory, "local_gguf_utils.py"), "utf8").catch(() => "")
      ]);
      const qwen38Compatible = !visionSource ||
        multimodalPromptRecognizesQwen38(visionSource);
      const projectorDiscoveryCompatible = !discoverySource ||
        discoverySource.includes("def _is_mmproj_filename(");
      if (!qwen38Compatible || !projectorDiscoveryCompatible) {
        const notice = "节点尚未适配 Qwen3.8 的 vision 投影文件；文件可能已存在但不会出现在 VisionLLMNode 列表中，请执行一键修复并重启 ComfyUI";
        compatibilityNotice = notice;
        updateNotice = notice;
        optionalUpdateRecommended = true;
      }
    }
    const localVersion = await readLocalNodeVersion(directory);
    const version = localVersion.version;
    const belowRecommendedVersion = Boolean(
      directory && version && definition.recommendedVersion &&
      compareReleaseVersions(version, definition.recommendedVersion) < 0
    );
    if (belowRecommendedVersion) {
      updateNotice = [
        updateNotice,
        `发现项目推荐版本更新：当前 v${version}，推荐 v${definition.recommendedVersion}`
      ].filter(Boolean).join("；");
    }
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
    const remoteVersion = latestNodeVersions[definition.id] ||
      (definition.id === "spectrum-minimax-h3"
        ? latestSpectrumVersion
        : definition.id === "h3-motion-context"
          ? latestMotionContextVersion
          : "") || definition.latestVersion || "";
    const latestVersion = /^v?\d+(?:[.-]\d+)+(?:[-+][0-9A-Za-z.-]+)?$/u.test(remoteVersion)
      ? normalizeReleaseVersion(remoteVersion)
      : "";
    const detectedRevision = await readRevision(directory);
    const sourceRemote = definition.id === "h3-optimizations"
      ? await gitRemoteUrl(directory)
      : "";
    const revisionDirtyState = definition.id === "h3-optimizations"
      ? await readDirtyState(directory)
      : undefined;
    const requiredNodeTypes = definition.nodeTypes;
    // Prompt Writer exposes a more specific runtime contract than
    // /object_info. If its status/models endpoints respond, use that as
    // runtime evidence even when ComfyUI's broad object-info request is
    // temporarily unavailable during startup.
    const runtimeVerified = serviceNodeIds !== null || (
      definition.id === "minimax-h3-prompt-writer" &&
      h3PromptWriterRuntime.loaded === true
    );
    const runtimeMissingNodeTypes = serviceNodeIds !== null && requiredNodeTypes
      ? requiredNodeTypes.filter((nodeType) => !serviceNodeIds.has(nodeType))
      : [];
    const endpointRuntimeFailed = definition.id === "minimax-h3-prompt-writer" &&
      Boolean(directory) && runtimeVerified && h3PromptWriterRuntime.loaded === false;
    const runtimeRepairable = endpointRuntimeFailed || Boolean(
      directory && runtimeVerified && requiredNodeTypes?.length &&
      runtimeMissingNodeTypes.length === requiredNodeTypes.length
    );
    const registered = definition.runtimeEndpoint
      ? h3PromptWriterRuntime.loaded !== false
      : !runtimeVerified || !requiredNodeTypes ||
        runtimeMissingNodeTypes.length === 0;
    const pendingRestartError = Boolean(directory) && !compatibilityError &&
      requiredNodeTypes && runtimeVerified && !registered
      ? runtimeRepairable
        ? `节点文件已安装，但当前服务未注册任何基础节点：${runtimeMissingNodeTypes.join("、")}。请执行修复/更新以重新安装节点依赖并重启复检；若仍失败，请查看本次 ComfyUI 启动日志中的节点导入错误`
        : `节点文件已安装，但当前服务未注册：${runtimeMissingNodeTypes.join("、")}。重复安装通常无效，请查看本次 ComfyUI 启动日志中的节点导入错误`
      : "";
    const duplicateNotice = duplicateDirectories.length
      ? definition.id === "h3-motion-context"
        ? `检测到 ${duplicateDirectories.length + 1} 个 H3 Motion Context 副本；只保留一个副本，否则运行时 patch 可能冲突。`
        : definition.id === "h3-optimizations"
          ? `检测到 ${duplicateDirectories.length + 1} 个 H3 Optimizations 副本；只保留一个副本，否则 H3 Memory 节点来源可能不明确。`
          : ""
      : "";
    const loadError = compatibilityError ||
      (definition.id === "minimax-h3-prompt-writer" && directory ? h3PromptWriterRuntime.error : "") ||
      pendingRestartError;
    const updateAvailable = Boolean(
      compatibilityError || optionalUpdateRecommended ||
      (definition.recommendedVersion && !version) || belowRecommendedVersion
    );
    const compatibility = compatibilityForNode(
      definition,
      Boolean(directory),
      version,
      detectedRevision,
      runtimeVerified,
      loadError,
      updateAvailable,
      joinUniqueNotices(
        compatibilityNotice,
        updateNotice,
        pendingRestartError,
        duplicateNotice
      )
    );
    return {
      id: definition.id,
      name: definition.name,
      purpose: definition.purpose,
      repositoryUrl: definition.repositoryUrl,
      installed: Boolean(directory),
      loaded: Boolean(directory) && !loadError && registered,
      runtimeVerified,
      runtimeMissingNodeTypes,
      runtimeRepairable,
      loadError,
      updateNotice,
      runtimeNotice: definition.id === "minimax-h3-prompt-writer"
        ? h3PromptWriterRuntime.notice
        : "",
      directory,
      required: definition.required,
      version,
      versionSource: localVersion.source || (detectedRevision ? ".git/HEAD" : ""),
      minimumVersion: definition.minimumVersion ?? "",
      recommendedVersion: definition.recommendedVersion ?? "",
      latestVersion,
      detectedRevision,
      sourceRemote,
      revisionDirtyState,
      compatibilityState: compatibility.compatibilityState,
      compatibilityNotice: compatibility.compatibilityNotice,
      compatibilityEvidence: definition.compatibilityEvidence
        ? [...definition.compatibilityEvidence]
        : [],
      knownBadRanges: definition.knownBadRanges ? [...definition.knownBadRanges] : [],
      duplicateDirectories,
      runtimeRequirement: definition.runtimeRequirement ?? "",
      bulkInstall: definition.bulkInstall !== false,
      appInstallable: definition.appInstallable !== false,
      updateAvailable
    };
  }));
}
