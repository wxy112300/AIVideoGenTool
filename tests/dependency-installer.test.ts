import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installCustomNodePackage,
  withWindowsGitLongPaths,
  type DependencyInstallerRuntime
} from "../electron/services/dependency-installer";
import { createDefaultState } from "../src/core/defaults";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
});

async function exists(filename: string): Promise<boolean> {
  return fs.stat(filename).then(() => true).catch(() => false);
}

describe("dependency installer", () => {
  it("passes Git long-path configuration to Windows child processes", () => {
    const environment = {
      PATH: "C:\\Git\\cmd",
      GIT_CONFIG_COUNT: "4"
    };
    const configured = withWindowsGitLongPaths(environment, "win32");

    expect(configured).toMatchObject({
      PATH: environment.PATH,
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "core.longpaths",
      GIT_CONFIG_VALUE_0: "true"
    });
    expect(withWindowsGitLongPaths(environment, "linux")).toBe(environment);
  });

  it("runs the shared clone path and streams progress", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-node-install-"));
    temporaryDirectories.push(comfyRoot);
    const processCalls: string[][] = [];
    const processEnvironments: NodeJS.ProcessEnv[] = [];
    const runtime: DependencyInstallerRuntime = {
      downloadEnvironment: () => ({ ...process.env }),
      proxyLogLabel: () => "代理：关闭",
      findComfyRoot: async () => comfyRoot,
      findExecutable: async () => "git.exe",
      findComfyPython: async () => "python.exe",
      exists,
      retryableRenameError: () => false,
      renameWithRetry: async (source, target) => fs.rename(source, target),
      runLoggedProcess: async (_executable, args, options) => {
        processCalls.push(args);
        if (options.env) processEnvironments.push(options.env);
        options.onLog?.("clone progress");
        if (args[0] === "clone") {
          await fs.mkdir(args.at(-1)!, { recursive: true });
        }
        return "clone progress";
      }
    };
    const onLog = vi.fn();

    const result = await installCustomNodePackage(
      "kjnodes",
      createDefaultState().settings,
      runtime,
      onLog
    );

    expect(result.ok).toBe(true);
    expect(processCalls).toEqual([
      expect.arrayContaining(["clone", "--depth", "1"])
    ]);
    expect(await exists(path.join(comfyRoot, "custom_nodes", "ComfyUI-KJNodes")))
      .toBe(true);
    expect(onLog).toHaveBeenCalledWith("clone progress");
    if (process.platform === "win32") {
      expect(processEnvironments[0]).toMatchObject({
        GIT_CONFIG_KEY_0: "core.longpaths",
        GIT_CONFIG_VALUE_0: "true"
      });
    }
    expect(result.log).toContain("无需安装额外 Python 依赖");
  });

  it("rejects unknown packages before touching the runtime", async () => {
    const findComfyRoot = vi.fn(async () => "");
    const runtime: DependencyInstallerRuntime = {
      downloadEnvironment: () => ({}),
      proxyLogLabel: () => "",
      findComfyRoot,
      findExecutable: async () => "",
      findComfyPython: async () => "",
      exists: async () => false,
      retryableRenameError: () => false,
      renameWithRetry: async () => undefined,
      runLoggedProcess: async () => ""
    };

    await expect(installCustomNodePackage(
      "not-a-node",
      createDefaultState().settings,
      runtime
    )).resolves.toMatchObject({ ok: false, message: expect.stringContaining("未知") });
    expect(findComfyRoot).not.toHaveBeenCalled();
  });

  it("fails the optional Qwen3.6 node before cloning when CUDA Toolkit is unavailable", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-multimodal-preflight-"));
    temporaryDirectories.push(comfyRoot);
    const processCalls: string[][] = [];
    const runtime: DependencyInstallerRuntime = {
      downloadEnvironment: () => ({ ...process.env }),
      proxyLogLabel: () => "",
      findComfyRoot: async () => comfyRoot,
      findExecutable: async (command) => command === "git.exe" ? "git.exe" : "",
      findComfyPython: async () => "python.exe",
      exists: async () => false,
      retryableRenameError: () => false,
      renameWithRetry: async () => undefined,
      runLoggedProcess: async (_executable, args) => {
        processCalls.push(args);
        return "";
      }
    };

    const result = await installCustomNodePackage(
      "comfyui-multimodal-prompt-nodes",
      createDefaultState().settings,
      runtime
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("CUDA Toolkit");
    expect(result.message).toContain("nvcc");
    expect(processCalls).toEqual([]);
  });

  it("installs H3 GGUF beside the legacy GGUF package without replacing it", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-gguf-migrate-"));
    temporaryDirectories.push(comfyRoot);
    const legacyDirectory = path.join(comfyRoot, "custom_nodes", "ComfyUI-GGUF");
    const h3Directory = path.join(comfyRoot, "custom_nodes", "ComfyUI-GGUF-H3");
    await fs.mkdir(path.join(legacyDirectory, ".git"), { recursive: true });
    await fs.writeFile(path.join(legacyDirectory, "legacy.txt"), "city96");
    const processCalls: string[][] = [];
    const runtime: DependencyInstallerRuntime = {
      downloadEnvironment: () => ({ ...process.env }),
      proxyLogLabel: () => "代理：关闭",
      findComfyRoot: async () => comfyRoot,
      findExecutable: async () => "git.exe",
      findComfyPython: async () => "python.exe",
      exists,
      retryableRenameError: () => false,
      renameWithRetry: async (source, target) => fs.rename(source, target),
      runLoggedProcess: async (_executable, args) => {
        processCalls.push(args);
        if (args[0] === "clone") {
          const cloneDirectory = args.at(-1)!;
          await fs.mkdir(cloneDirectory, { recursive: true });
          await fs.writeFile(
            path.join(cloneDirectory, "nodes.py"),
            'NODE_CLASS_MAPPINGS = {"UnetLoaderGGUFAdvanced": object, "CLIPLoaderGGUF": object}\n'
          );
          await fs.writeFile(path.join(cloneDirectory, "__init__.py"), "");
        }
        return "";
      }
    };

    const result = await installCustomNodePackage(
      "comfyui-gguf-h3",
      createDefaultState().settings,
      runtime
    );

    expect(result.ok).toBe(true);
    expect(processCalls.some((args) => args[0] === "pull")).toBe(false);
    expect(processCalls.some((args) =>
      args[0] === "clone" && args.includes("https://github.com/molbal/ComfyUI-GGUF.git")
    )).toBe(true);
    expect(await exists(path.join(legacyDirectory, "legacy.txt"))).toBe(true);
    expect(await exists(h3Directory)).toBe(true);
    expect(await fs.readFile(path.join(h3Directory, "__init__.py"), "utf8"))
      .toContain("H3UnetLoaderGGUFAdvanced");
  });

  it("restores the shared city96 GGUF package after an older H3 migration", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-gguf-restore-"));
    temporaryDirectories.push(comfyRoot);
    const targetDirectory = path.join(comfyRoot, "custom_nodes", "ComfyUI-GGUF");
    await fs.mkdir(path.join(targetDirectory, ".git"), { recursive: true });
    await fs.writeFile(path.join(targetDirectory, "old-molbal.txt"), "molbal");
    const processCalls: string[][] = [];
    const runtime: DependencyInstallerRuntime = {
      downloadEnvironment: () => ({ ...process.env }),
      proxyLogLabel: () => "代理：关闭",
      findComfyRoot: async () => comfyRoot,
      findExecutable: async () => "git.exe",
      findComfyPython: async () => "python.exe",
      exists,
      retryableRenameError: () => false,
      renameWithRetry: async (source, target) => fs.rename(source, target),
      runLoggedProcess: async (_executable, args) => {
        processCalls.push(args);
        if (args[0] === "remote") return "https://github.com/molbal/ComfyUI-GGUF.git";
        if (args[0] === "clone") await fs.mkdir(args.at(-1)!, { recursive: true });
        return "";
      }
    };

    const result = await installCustomNodePackage(
      "comfyui-gguf",
      createDefaultState().settings,
      runtime
    );

    expect(result.ok).toBe(true);
    expect(processCalls.some((args) =>
      args[0] === "clone" && args.includes("https://github.com/city96/ComfyUI-GGUF.git")
    )).toBe(true);
    expect(await exists(path.join(targetDirectory, "old-molbal.txt"))).toBe(false);
    expect((await fs.readdir(path.join(comfyRoot, "node-backups"))).some((name) =>
      name.startsWith("ComfyUI-GGUF-")
    )).toBe(true);
  });
});
