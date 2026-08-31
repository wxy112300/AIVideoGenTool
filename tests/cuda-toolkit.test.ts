import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  discoverCudaToolkit,
  withCudaToolkitEnvironment
} from "../src/infrastructure/cuda-toolkit";

describe("CUDA Toolkit discovery", () => {
  it("uses nvcc from PATH when the app process can see it", async () => {
    const nvcc = path.join("C:\\Program Files", "NVIDIA GPU Computing Toolkit", "CUDA", "v13.0", "bin", "nvcc.exe");
    const result = await discoverCudaToolkit({
      findExecutable: async () => nvcc,
      exists: async (filename) => filename.toLowerCase() === nvcc.toLowerCase()
    }, {}, "win32");

    expect(result).toMatchObject({
      root: path.dirname(path.dirname(nvcc)),
      nvcc,
      source: "path"
    });
  });

  it("falls back to CUDAToolkit_ROOT when PATH is stale", async () => {
    const root = path.join("D:", "CUDA", "v13.0");
    const nvcc = path.join(root, "bin", "nvcc.exe");
    const result = await discoverCudaToolkit({
      findExecutable: async () => "",
      exists: async (filename) => filename.toLowerCase() === nvcc.toLowerCase()
    }, { CUDAToolkit_ROOT: root }, "win32");

    expect(result).toEqual({ root, nvcc, source: "environment" });
  });

  it("adds Toolkit variables and bin directory to the build environment", () => {
    const root = path.join("C:", "CUDA", "v13.0");
    const result = withCudaToolkitEnvironment({ PATH: "C:\\Windows\\System32" }, root, "win32");

    expect(result).toMatchObject({
      CUDAToolkit_ROOT: root,
      CUDA_PATH: root,
      CUDA_HOME: root
    });
    expect(result.PATH?.split(path.delimiter)[0]).toBe(path.join(root, "bin"));
  });
});
