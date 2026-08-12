import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  installWorkflowDependencyPackage,
  scanWorkflowDependencies,
  workflowDependenciesFor,
  type WorkflowDependencyRuntime
} from "../electron/services/dependency-workflows";
import { createDefaultState } from "../src/core/defaults";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
});

function runtimeFor(
  comfyRoot: string,
  downloadedContent: string
): WorkflowDependencyRuntime {
  return {
    findComfyRoot: async () => comfyRoot,
    findExecutable: async () => "curl.exe",
    normalizeProxyUrl: (value) => value,
    downloadEnvironment: () => ({ ...process.env }),
    proxyLogLabel: () => "代理：关闭",
    runLoggedProcess: async (_executable, args, options) => {
      const outputIndex = args.indexOf("--output");
      const output = args[outputIndex + 1];
      await fs.writeFile(output, downloadedContent, "utf8");
      options.onLog?.("download progress");
      return "download progress";
    }
  };
}

describe("workflow dependency service", () => {
  it("scans the portable target below the selected ComfyUI root", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-workflow-scan-"));
    temporaryDirectories.push(comfyRoot);
    const target = workflowDependenciesFor(comfyRoot)[0].path;

    expect((await scanWorkflowDependencies(comfyRoot))[0].installed).toBe(false);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, "{}", "utf8");
    expect((await scanWorkflowDependencies(comfyRoot))[0]).toMatchObject({
      installed: true,
      path: target
    });
  });

  it("validates a download before replacing the installed workflow", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-workflow-install-"));
    temporaryDirectories.push(comfyRoot);
    const settings = createDefaultState().settings;

    const installed = await installWorkflowDependencyPackage(
      "minimax_h3_i2v",
      settings,
      runtimeFor(comfyRoot, '{"version":1}')
    );
    const target = workflowDependenciesFor(comfyRoot)[0].path;
    expect(installed.ok).toBe(true);
    expect(await fs.readFile(target, "utf8")).toBe('{"version":1}');

    const rejected = await installWorkflowDependencyPackage(
      "minimax_h3_i2v",
      settings,
      runtimeFor(comfyRoot, "not json")
    );
    expect(rejected.ok).toBe(false);
    expect(await fs.readFile(target, "utf8")).toBe('{"version":1}');
    expect((await fs.readdir(path.dirname(target))).filter((name) =>
      name.endsWith(".download")
    )).toEqual([]);
  });
});
