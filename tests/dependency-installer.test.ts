import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installCustomNodePackage,
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
  it("runs the shared clone path and streams progress", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-node-install-"));
    temporaryDirectories.push(comfyRoot);
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
      runLoggedProcess: async (_executable, args, options) => {
        processCalls.push(args);
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
});
