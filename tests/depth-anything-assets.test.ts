import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultState } from "../src/core/defaults.js";
import {
  DEPTH_ANYTHING_V2_SMALL_MODEL_FILENAME,
  DEPTH_ANYTHING_V2_SMALL_MODEL_SUBDIRECTORY,
  DEPTH_ANYTHING_V2_SMALL_REPOSITORY,
  DEPTH_ANYTHING_V2_SMALL_REVISION
} from "../src/core/catalog/models/depth-anything.js";
import {
  comfyDepthAnythingModelDirectory,
  prepareDepthAnythingAssets,
  scanDepthAnythingAssets
} from "../electron/services/depth-anything-assets.js";

const temporaryDirectories: string[] = [];
const requiredFiles = [DEPTH_ANYTHING_V2_SMALL_MODEL_FILENAME];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
});

async function createModel(modelRoot: string): Promise<{
  directory: string;
  modelFile: string;
}> {
  const directory = path.join(
    modelRoot,
    ...DEPTH_ANYTHING_V2_SMALL_MODEL_SUBDIRECTORY.split("/")
  );
  const modelFile = path.join(directory, DEPTH_ANYTHING_V2_SMALL_MODEL_FILENAME);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(modelFile, "fixture model weight", "utf8");
  return { directory, modelFile };
}

describe("Depth Anything asset service", () => {
  it("scans the normal ComfyUI model directory offline", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-depth-scan-"));
    temporaryDirectories.push(root);
    const modelsRoot = path.join(root, "models");
    const { directory, modelFile } = await createModel(modelsRoot);

    const status = await scanDepthAnythingAssets(root);

    expect(status).toMatchObject({
      repository: DEPTH_ANYTHING_V2_SMALL_REPOSITORY,
      revision: DEPTH_ANYTHING_V2_SMALL_REVISION,
      cacheDirectory: directory,
      source: "external",
      available: true,
      missingFiles: [],
      runtimeVerified: false
    });
    expect(status.foundFiles).toEqual([modelFile]);
    expect(status.modelFiles).toEqual([
      `${DEPTH_ANYTHING_V2_SMALL_MODEL_SUBDIRECTORY}/${DEPTH_ANYTHING_V2_SMALL_MODEL_FILENAME}`
    ]);
  });

  it("ignores the legacy Hugging Face snapshot and requires only the weight", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-depth-cache-"));
    temporaryDirectories.push(root);
    const legacySnapshot = path.join(
      root,
      ".local-video-studio",
      "huggingface",
      "models--depth-anything--Depth-Anything-V2-Small-hf",
      "snapshots",
      DEPTH_ANYTHING_V2_SMALL_REVISION
    );
    await fs.mkdir(legacySnapshot, { recursive: true });
    await Promise.all([
      "config.json",
      "preprocessor_config.json",
      DEPTH_ANYTHING_V2_SMALL_MODEL_FILENAME
    ].map((filename) => fs.writeFile(path.join(legacySnapshot, filename), filename, "utf8")));

    const status = await scanDepthAnythingAssets(root);

    expect(status.available).toBe(false);
    expect(status.foundFiles).toEqual([]);
    expect(status.modelFiles).toEqual([]);
    expect(status.missingFiles).toEqual(requiredFiles);
  });

  it("supports a configured external ComfyUI model root", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-depth-external-"));
    temporaryDirectories.push(root);
    const externalRoot = path.join(root, "shared-models");
    const { modelFile } = await createModel(externalRoot);

    const status = await scanDepthAnythingAssets(path.join(root, "comfy"), {
      modelDirectories: [externalRoot]
    });

    expect(status).toMatchObject({
      source: "external",
      available: true,
      missingFiles: []
    });
    expect(status.foundFiles).toEqual([modelFile]);
    expect(status.modelFiles).toEqual([
      `${DEPTH_ANYTHING_V2_SMALL_MODEL_SUBDIRECTORY}/${DEPTH_ANYTHING_V2_SMALL_MODEL_FILENAME}`
    ]);
  });

  it("reports the user-managed weight without invoking a downloader", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-depth-prepare-"));
    temporaryDirectories.push(root);
    const modelsRoot = path.join(root, "models");
    const settings = {
      ...createDefaultState().settings,
      comfyUrl: "http://127.0.0.1:8188"
    };
    const logs: string[] = [];

    const missing = await prepareDepthAnythingAssets(
      settings,
      root,
      [modelsRoot],
      (message) => logs.push(message)
    );

    expect(missing.ok).toBe(false);
    expect(missing.status?.missingFiles).toEqual(requiredFiles);
    expect(missing.message).toContain("内置");
    expect(missing.message).toContain(DEPTH_ANYTHING_V2_SMALL_MODEL_FILENAME);
    expect(logs).toEqual([missing.message]);

    await createModel(modelsRoot);
    const ready = await prepareDepthAnythingAssets(settings, root, [modelsRoot]);
    expect(ready.ok).toBe(true);
    expect(ready.status).toMatchObject({
      available: true,
      missingFiles: []
    });
    expect(ready.message).toContain("内置");
  });

  it("refuses a remote endpoint without inspecting or changing local files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-depth-remote-"));
    temporaryDirectories.push(root);
    const result = await prepareDepthAnythingAssets(
      {
        ...createDefaultState().settings,
        comfyUrl: "https://comfy.example.test"
      },
      root
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("远程 ComfyUI");
    expect(await fs.stat(comfyDepthAnythingModelDirectory(root)).catch(() => null))
      .toBeNull();
  });
});
