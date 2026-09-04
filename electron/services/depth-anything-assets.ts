import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  ConnectionResult,
  DepthAnythingAssetStatus,
  Settings
} from "../../src/types.js";
import {
  DEPTH_ANYTHING_V2_SMALL_MODEL_FILENAME,
  DEPTH_ANYTHING_V2_SMALL_MODEL_SUBDIRECTORY,
  DEPTH_ANYTHING_V2_SMALL_REPOSITORY,
  DEPTH_ANYTHING_V2_SMALL_REVISION
} from "../../src/core/catalog/models/depth-anything.js";
import { isLocalComfyUrl } from "./comfy-endpoint.js";

/** Only the user-managed weight participates in the asset readiness check. */
export const DEPTH_ANYTHING_REQUIRED_FILES = [
  DEPTH_ANYTHING_V2_SMALL_MODEL_FILENAME
] as const;

export interface DepthAnythingScanOptions {
  /** Explicit model roots used by ComfyUI or an embedding host. */
  modelDirectories?: readonly string[];
}

interface ModelInspection {
  root: string;
  directory: string;
  modelFile: string;
}

function uniquePaths(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of paths) {
    const normalized = value.trim();
    if (!normalized) continue;
    const resolved = path.resolve(normalized);
    const key = resolved.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(resolved);
  }
  return result;
}

const modelSubdirectoryParts = DEPTH_ANYTHING_V2_SMALL_MODEL_SUBDIRECTORY.split("/");

export function comfyDepthAnythingModelDirectory(comfyRoot: string): string {
  return path.join(comfyRoot, "models", ...modelSubdirectoryParts);
}

async function fileExists(filename: string): Promise<boolean> {
  const stat = await fs.stat(filename).catch(() => null);
  return stat?.isFile() === true;
}

function emptyStatus(
  modelDirectory: string,
  error = ""
): DepthAnythingAssetStatus {
  return {
    repository: DEPTH_ANYTHING_V2_SMALL_REPOSITORY,
    revision: DEPTH_ANYTHING_V2_SMALL_REVISION,
    cacheDirectory: modelDirectory,
    source: "",
    modelFiles: [],
    foundFiles: [],
    missingFiles: [...DEPTH_ANYTHING_REQUIRED_FILES],
    available: false,
    pythonPath: "",
    runtimeVerified: false,
    error
  };
}

export function emptyDepthAnythingStatus(
  modelDirectory: string,
  error = ""
): DepthAnythingAssetStatus {
  return emptyStatus(modelDirectory, error);
}

/**
 * Inspect the normal ComfyUI model directory. Hugging Face caches are
 * intentionally ignored: the app ships the two metadata JSON files and the
 * only external model asset is the safetensors weight in the catalog path.
 */
export async function scanDepthAnythingAssets(
  comfyRoot: string,
  options: DepthAnythingScanOptions = {}
): Promise<DepthAnythingAssetStatus> {
  const modelRoots = uniquePaths([
    ...(options.modelDirectories ?? []),
    ...(comfyRoot ? [path.join(comfyRoot, "models")] : [])
  ]);
  const inspections: ModelInspection[] = [];
  for (const root of modelRoots) {
    const directory = path.join(root, ...modelSubdirectoryParts);
    const modelFile = path.join(directory, DEPTH_ANYTHING_V2_SMALL_MODEL_FILENAME);
    if (await fileExists(modelFile)) inspections.push({ root, directory, modelFile });
  }
  const foundFiles = inspections.map((inspection) => inspection.modelFile);
  const modelFiles = inspections.map((inspection) =>
    path.relative(inspection.root, inspection.modelFile).replaceAll(path.sep, "/")
  );
  const preferredDirectory = path.join(
    modelRoots[0] ?? "",
    ...modelSubdirectoryParts
  );
  return {
    repository: DEPTH_ANYTHING_V2_SMALL_REPOSITORY,
    revision: DEPTH_ANYTHING_V2_SMALL_REVISION,
    cacheDirectory: inspections[0]?.directory ?? preferredDirectory,
    source: inspections.length ? "external" : "",
    modelFiles,
    foundFiles,
    missingFiles: inspections.length ? [] : [...DEPTH_ANYTHING_REQUIRED_FILES],
    available: inspections.length > 0,
    pythonPath: "",
    runtimeVerified: false,
    error: ""
  };
}

/**
 * Kept behind the old admin IPC name for compatibility with existing
 * renderer builds. It performs no download and no Python invocation; it only
 * reports whether the user-managed weight is present and where to put it.
 */
export async function prepareDepthAnythingAssets(
  settings: Settings,
  comfyRoot: string,
  modelDirectories: readonly string[] = [],
  onLog?: (message: string) => void
): Promise<ConnectionResult & { status?: DepthAnythingAssetStatus }> {
  if (!isLocalComfyUrl(settings.comfyUrl)) {
    return {
      ok: false,
      message: "远程 ComfyUI 仅支持连接，应用不会安装本地 Depth Anything 资产。"
    };
  }
  if (!comfyRoot) {
    return { ok: false, message: "没有找到 ComfyUI 数据目录，无法检查 Depth Anything。" };
  }
  const status = await scanDepthAnythingAssets(comfyRoot, { modelDirectories });
  if (status.available) {
    const message = "Depth Anything 配置已由应用内置，且已找到用户提供的 model.safetensors。";
    onLog?.(message);
    return { ok: true, message, status };
  }
  const modelDirectory = path.join(
    modelDirectories[0] || path.join(comfyRoot, "models"),
    ...modelSubdirectoryParts
  );
  const message = `Depth Anything 配置已由应用内置；请只下载 ${DEPTH_ANYTHING_V2_SMALL_MODEL_FILENAME} 并放入 ${modelDirectory}。`;
  onLog?.(message);
  return { ok: false, message, status };
}
