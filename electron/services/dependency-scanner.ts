import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { customNodeCatalog } from "../../src/core/catalog/index.js";
import {
  compareReleaseVersions,
  normalizeReleaseVersion
} from "../../src/core/release-version.js";
import type { CustomNodeStatus, Settings } from "../../src/types.js";
import {
  ltxAudioVaeCompatible,
  videoHelperBatchCompatible
} from "./dependency-compatibility.js";

async function readPythonProjectVersion(directory: string): Promise<string> {
  if (!directory) return "";
  return fs.readFile(path.join(directory, "pyproject.toml"), "utf8")
    .then((source) => normalizeReleaseVersion(
      source.match(/^version\s*=\s*["']([^"']+)["']/m)?.[1] ?? ""
    ))
    .catch(() => "");
}

export function availableComfyNodeIds(objectInfo: unknown): Set<string> {
  return objectInfo && typeof objectInfo === "object" && !Array.isArray(objectInfo)
    ? new Set(Object.keys(objectInfo as Record<string, unknown>))
    : new Set<string>();
}

export async function readLatestComfyLog(
  comfyRoot: string
): Promise<{ content: string; modifiedAt: number }> {
  const appData =
    process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  const candidates = [path.join(appData, "ComfyUI", "logs", "comfyui.log")];
  const userDirectory = comfyRoot ? path.join(comfyRoot, "user") : "";
  if (userDirectory) {
    const entries = await fs.readdir(userDirectory, { withFileTypes: true }).catch(() => []);
    candidates.push(
      ...entries
        .filter((entry) => entry.isFile() && /^comfyui.*\.log$/i.test(entry.name))
        .map((entry) => path.join(userDirectory, entry.name))
    );
  }
  const available = (
    await Promise.all(
      candidates.map(async (filename) => ({
        filename,
        stat: await fs.stat(filename).catch(() => null)
      }))
    )
  )
    .filter((item) => item.stat?.isFile() && (item.stat.size ?? 0) > 0)
    .sort((left, right) => (right.stat?.mtimeMs ?? 0) - (left.stat?.mtimeMs ?? 0));
  return available[0]
    ? {
        content: await fs.readFile(available[0].filename, "utf8").catch(() => ""),
        modifiedAt: available[0].stat?.mtimeMs ?? 0
      }
    : { content: "", modifiedAt: 0 };
}

export async function scanCustomNodes(
  comfyRoot: string,
  settings: Settings,
  latestSpectrumVersion = ""
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
  const log = (await readLatestComfyLog(comfyRoot)).content;
  const logLines = log.split(/\r?\n/);
  const serviceNodeIds = await fetch(
    `${settings.comfyUrl.replace(/\/+$/, "")}/object_info`,
    { signal: AbortSignal.timeout(5_000) }
  )
    .then(async (response) => response.ok
      ? availableComfyNodeIds(await response.json())
      : null)
    .catch(() => null);
  const promptWriterEndpoint = customNodeCatalog.find(
    (definition) => definition.id === "minimax-h3-prompt-writer"
  )?.runtimeEndpoint;
  const h3PromptWriterLoaded = serviceNodeIds === null || !promptWriterEndpoint
    ? null
    : await fetch(`${settings.comfyUrl.replace(/\/+$/, "")}${promptWriterEndpoint}`, {
        signal: AbortSignal.timeout(5_000)
      }).then((response) => response.ok).catch(() => false);

  return Promise.all(customNodeCatalog.map(async (definition) => {
    const matchedName = definition.aliases.find((alias) =>
      installedDirectories.has(alias.toLowerCase())
    );
    const directory = matchedName
      ? installedDirectories.get(matchedName.toLowerCase()) ?? ""
      : "";
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
        : `无法读取版本；最低支持 v${definition.minimumVersion}，请更新节点后复检`;
    }
    const latestVersion = definition.id === "spectrum-minimax-h3"
      ? latestSpectrumVersion
      : "";
    const requiredNodeTypes = definition.nodeTypes;
    const runtimeVerified = serviceNodeIds !== null;
    const registered = definition.runtimeEndpoint
      ? h3PromptWriterLoaded !== false
      : !runtimeVerified || !requiredNodeTypes ||
        requiredNodeTypes.every((nodeType) => serviceNodeIds.has(nodeType));
    const pendingRestartError = Boolean(directory) && !compatibilityError &&
      !failed && requiredNodeTypes && runtimeVerified && !registered
      ? "节点文件已安装，但当前 ComfyUI 服务尚未加载全部必需模块；请重启服务后复检"
      : "";
    const loadError = compatibilityError || importErrorLine ||
      (failed ? "最近一次启动时导入失败" : "") || pendingRestartError;
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
      directory,
      required: definition.required,
      version,
      minimumVersion: definition.minimumVersion ?? "",
      recommendedVersion: definition.recommendedVersion ?? "",
      latestVersion,
      runtimeRequirement: definition.runtimeRequirement ?? "",
      bulkInstall: definition.bulkInstall !== false,
      updateAvailable: Boolean(
        compatibilityError || optionalUpdateRecommended ||
        (definition.recommendedVersion && (!version ||
          compareReleaseVersions(version, definition.recommendedVersion) < 0)) ||
        (version && latestVersion && compareReleaseVersions(version, latestVersion) < 0)
      )
    };
  }));
}
