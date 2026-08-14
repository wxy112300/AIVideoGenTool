import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanCustomNodes } from "../electron/services/dependency-scanner";
import { createDefaultState } from "../src/core/defaults";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
});

describe("dependency scanner", () => {
  it("recognizes installed nodes while ComfyUI is offline", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-node-scan-"));
    temporaryDirectories.push(comfyRoot);
    const kjNodesDirectory = path.join(comfyRoot, "custom_nodes", "ComfyUI-KJNodes");
    await fs.mkdir(path.join(kjNodesDirectory, "nodes"), {
      recursive: true
    });
    await fs.writeFile(
      path.join(kjNodesDirectory, "nodes", "preview_override_node.py"),
      "class ModelPreviewOverrideKJ:\n    pass\n",
      "utf8"
    );
    const settings = {
      ...createDefaultState().settings,
      comfyUrl: "http://127.0.0.1:1"
    };

    const statuses = await scanCustomNodes(comfyRoot, settings);
    const kjNodes = statuses.find((status) => status.id === "kjnodes");
    const flashVsr = statuses.find((status) => status.id === "flashvsr");
    const multimodal = statuses.find((status) => status.id === "comfyui-multimodal-prompt-nodes");

    expect(kjNodes).toMatchObject({
      installed: true,
      runtimeVerified: false,
      loaded: true,
      directory: kjNodesDirectory
    });
    expect(flashVsr).toMatchObject({
      installed: false,
      runtimeVerified: false,
      loaded: false
    });
    expect(multimodal).toMatchObject({
      bulkInstall: true,
      minimumVersion: "1.0.15",
      runtimeRequirement: expect.stringContaining("预编译 wheel")
    });
  });

  it("marks an offline KJNodes installation without the H3 preview node for update", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-kjnodes-scan-"));
    temporaryDirectories.push(comfyRoot);
    await fs.mkdir(path.join(comfyRoot, "custom_nodes", "ComfyUI-KJNodes"), {
      recursive: true
    });

    const statuses = await scanCustomNodes(comfyRoot, {
      ...createDefaultState().settings,
      comfyUrl: "http://127.0.0.1:1"
    });
    const kjNodes = statuses.find((status) => status.id === "kjnodes");

    expect(kjNodes).toMatchObject({
      installed: true,
      runtimeVerified: false,
      loaded: true,
      updateAvailable: true
    });
    expect(kjNodes?.loadError).toBe("");
    expect(kjNodes?.updateNotice).toContain("H3 TAE 实时预览节点");
  });

  it("keeps a supported Spectrum version usable while recommending the pinned baseline", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-spectrum-scan-"));
    temporaryDirectories.push(comfyRoot);
    const spectrumDirectory = path.join(
      comfyRoot,
      "custom_nodes",
      "ComfyUI-Spectrum-MiniMax-H3"
    );
    await fs.mkdir(spectrumDirectory, { recursive: true });
    await fs.writeFile(
      path.join(spectrumDirectory, "pyproject.toml"),
      '[project]\nversion = "0.2.6"\n',
      "utf8"
    );

    const statuses = await scanCustomNodes(comfyRoot, {
      ...createDefaultState().settings,
      comfyUrl: "http://127.0.0.1:1"
    }, "0.2.7");
    const spectrum = statuses.find((status) => status.id === "spectrum-minimax-h3");

    expect(spectrum).toMatchObject({
      installed: true,
      loaded: true,
      version: "0.2.6",
      minimumVersion: "0.2.1",
      recommendedVersion: "0.2.7",
      latestVersion: "0.2.7",
      updateAvailable: true,
      loadError: ""
    });
  });
});
