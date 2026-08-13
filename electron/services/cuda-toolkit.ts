import { promises as fs } from "node:fs";
import path from "node:path";

export interface CudaToolkitDiscovery {
  root: string;
  nvcc: string;
  source: "path" | "environment" | "default";
}

export interface CudaToolkitRuntime {
  findExecutable(command: string): Promise<string>;
  exists(filename: string): Promise<boolean>;
}

function uniquePaths(paths: readonly (string | undefined)[]): string[] {
  const seen = new Set<string>();
  return paths.filter((candidate): candidate is string => {
    if (!candidate) return false;
    const normalized = candidate.trim();
    if (!normalized) return false;
    const key = path.normalize(normalized).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((candidate) => path.normalize(candidate.trim()));
}

/**
 * Return likely CUDA Toolkit roots without assuming that the app process was
 * restarted after the Toolkit installer changed PATH.  The NVIDIA installer
 * normally uses the Program Files layout, while CUDAToolkit_ROOT/CUDA_PATH
 * cover custom installations and CI environments.
 */
export async function cudaToolkitCandidateRoots(
  environment: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): Promise<Array<{ root: string; source: CudaToolkitDiscovery["source"] }>> {
  const candidates: Array<{ root: string; source: CudaToolkitDiscovery["source"] }> = [];
  const add = (root: string | undefined, source: CudaToolkitDiscovery["source"]) => {
    if (root?.trim()) candidates.push({ root: root.trim(), source });
  };

  for (const variable of ["CUDAToolkit_ROOT", "CUDA_PATH", "CUDA_HOME"]) {
    add(environment[variable], "environment");
  }

  if (platform === "win32") {
    const programFiles = [
      environment.ProgramW6432,
      environment.ProgramFiles,
      "C:\\Program Files"
    ];
    for (const parent of uniquePaths(programFiles)) {
      const cudaParent = path.join(parent, "NVIDIA GPU Computing Toolkit", "CUDA");
      const entries = await fs.readdir(cudaParent, { withFileTypes: true }).catch(() => []);
      const versions = entries
        .filter((entry) => entry.isDirectory() && /^v\d+(?:\.\d+)+$/iu.test(entry.name))
        .sort((left, right) => right.name.localeCompare(left.name, undefined, { numeric: true }))
        .map((entry) => path.join(cudaParent, entry.name));
      for (const root of versions) add(root, "default");
    }
  }

  const seen = new Set<string>();
  return candidates.filter(({ root }) => {
    const key = path.normalize(root).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function discoverCudaToolkit(
  runtime: CudaToolkitRuntime,
  environment: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): Promise<CudaToolkitDiscovery | null> {
  const executable = platform === "win32" ? "nvcc.exe" : "nvcc";
  const fromPath = await runtime.findExecutable(executable).catch(() => "");
  if (fromPath && await runtime.exists(fromPath)) {
    return {
      root: path.dirname(path.dirname(path.normalize(fromPath))),
      nvcc: path.normalize(fromPath),
      source: "path"
    };
  }

  const candidates = await cudaToolkitCandidateRoots(environment, platform);
  for (const candidate of candidates) {
    const nvcc = path.join(candidate.root, "bin", executable);
    if (await runtime.exists(nvcc)) {
      return {
        root: path.normalize(candidate.root),
        nvcc: path.normalize(nvcc),
        source: candidate.source
      };
    }
  }
  return null;
}

export function withCudaToolkitEnvironment(
  environment: NodeJS.ProcessEnv,
  root: string,
  platform: NodeJS.Platform = process.platform
): NodeJS.ProcessEnv {
  const bin = path.join(root, "bin");
  const pathValue = [bin, environment.PATH].filter(Boolean).join(path.delimiter);
  return {
    ...environment,
    CUDAToolkit_ROOT: root,
    CUDA_PATH: root,
    ...(platform === "win32" ? { CUDA_HOME: root } : {}),
    PATH: pathValue
  };
}
