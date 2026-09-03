import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("bundled Electron assets", () => {
  it("copies custom nodes and application-owned workflows into the Electron build", async () => {
    const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "lvs-bundled-assets-"));
    temporaryDirectories.push(repositoryRoot);
    await Promise.all([
      mkdir(path.join(repositoryRoot, "comfy_nodes", "LocalVideoStudio-H3"), { recursive: true }),
      mkdir(path.join(repositoryRoot, "workflows"), { recursive: true })
    ]);
    await Promise.all([
      writeFile(path.join(repositoryRoot, "comfy_nodes", "LocalVideoStudio-H3", "__init__.py"), ""),
      writeFile(
        path.join(repositoryRoot, "workflows", "minimax_h3_fl2va_learned_3d_second_sample_av_api.json"),
        "{}"
      )
    ]);

    const result = spawnSync(
      process.execPath,
      [path.resolve("scripts/copy-bundled-comfy-nodes.mjs"), repositoryRoot],
      { encoding: "utf8" }
    );

    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(path.join(
      repositoryRoot,
      "dist",
      "electron",
      "comfy_nodes",
      "LocalVideoStudio-H3",
      "__init__.py"
    ))).toBe(true);
    expect(existsSync(path.join(
      repositoryRoot,
      "dist",
      "electron",
      "workflows",
      "minimax_h3_fl2va_learned_3d_second_sample_av_api.json"
    ))).toBe(true);
  });
});