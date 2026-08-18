import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { scanCustomNodes } from "../electron/services/dependency-scanner";
import { createDefaultState } from "../src/core/defaults";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
});

describe("dependency scanner", () => {
  it("runs the H3 Prompt Writer status, model, and diagnostics probe after service startup", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-h3-runtime-scan-"));
    temporaryDirectories.push(comfyRoot);
    const writerDirectory = path.join(
      comfyRoot,
      "custom_nodes",
      "ComfyUI-MiniMaxH3-Prompt-Writer"
    );
    await fs.mkdir(writerDirectory, { recursive: true });
    await fs.writeFile(
      path.join(writerDirectory, "pyproject.toml"),
      '[project]\nversion = "0.3.2"\n',
      "utf8"
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/object_info")) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      if (url.endsWith("/h3studio/status")) {
        return new Response(JSON.stringify({ version: "0.3.2" }), { status: 200 });
      }
      if (url.endsWith("/h3studio/models")) {
        return new Response(JSON.stringify({ models: [{ id: "gemma.gguf" }] }), { status: 200 });
      }
      if (url.endsWith("/h3studio/runtime/gguf/diagnostics")) {
        return new Response(JSON.stringify({ diagnostics: { status: "ready" } }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    const statuses = await scanCustomNodes(
      comfyRoot,
      { ...createDefaultState().settings, comfyUrl: "http://127.0.0.1:8188" },
      "",
      "http://127.0.0.1:8188"
    );
    const writer = statuses.find((status) => status.id === "minimax-h3-prompt-writer");

    expect(writer).toMatchObject({
      installed: true,
      runtimeVerified: true,
      loaded: true,
      loadError: "",
      updateNotice: "",
      compatibilityState: "supported",
      runtimeNotice: expect.stringContaining("发现 1 个模型")
    });
    expect(writer?.compatibilityNotice).toContain("版本与节点状态已读取");
  });

  it("uses Prompt Writer runtime endpoints when object_info is temporarily unavailable", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-h3-runtime-evidence-"));
    temporaryDirectories.push(comfyRoot);
    const writerDirectory = path.join(
      comfyRoot,
      "custom_nodes",
      "ComfyUI-MiniMaxH3-Prompt-Writer"
    );
    await fs.mkdir(writerDirectory, { recursive: true });
    await fs.writeFile(
      path.join(writerDirectory, "pyproject.toml"),
      '[project]\nversion = "0.3.2"\n',
      "utf8"
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/object_info")) {
        return new Response("starting", { status: 503 });
      }
      if (url.endsWith("/h3studio/status")) {
        return new Response(JSON.stringify({ version: "0.3.2" }), { status: 200 });
      }
      if (url.endsWith("/h3studio/models")) {
        return new Response(JSON.stringify({ models: [{ id: "gemma.gguf" }] }), { status: 200 });
      }
      if (url.endsWith("/h3studio/runtime/gguf/diagnostics")) {
        return new Response(JSON.stringify({ diagnostics: {
          status: "ok",
          gpu_offload: false,
          backend: null
        } }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    const statuses = await scanCustomNodes(
      comfyRoot,
      { ...createDefaultState().settings, comfyUrl: "http://127.0.0.1:8188" },
      "",
      "http://127.0.0.1:8188"
    );
    const writer = statuses.find((status) => status.id === "minimax-h3-prompt-writer");

    expect(writer).toMatchObject({
      installed: true,
      runtimeVerified: true,
      loaded: true,
      loadError: "",
      compatibilityState: "supported",
      runtimeNotice: expect.stringContaining("未加载 CUDA 后端")
    });
  });

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
      recommendedVersion: "0.2.15",
      latestVersion: "0.2.7",
      updateAvailable: true,
      loadError: ""
    });
  });

  it("uses the generic cached release map for every catalog node", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-generic-node-release-"));
    temporaryDirectories.push(comfyRoot);
    const multimodalDirectory = path.join(
      comfyRoot,
      "custom_nodes",
      "ComfyUI-MultiModal-Prompt-Nodes"
    );
    await fs.mkdir(multimodalDirectory, { recursive: true });
    await fs.writeFile(
      path.join(multimodalDirectory, "pyproject.toml"),
      '[project]\nversion = "1.0.15"\n',
      "utf8"
    );

    const statuses = await scanCustomNodes(
      comfyRoot,
      { ...createDefaultState().settings, comfyUrl: "http://127.0.0.1:1" },
      "",
      "",
      "",
      { "comfyui-multimodal-prompt-nodes": "1.0.16" }
    );
    const multimodal = statuses.find((status) => status.id === "comfyui-multimodal-prompt-nodes");

    expect(multimodal).toMatchObject({
      version: "1.0.15",
      latestVersion: "1.0.16",
      updateAvailable: true
    });
  });

  it("keeps an installed node with an unreadable version in a warning state", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-version-warning-"));
    temporaryDirectories.push(comfyRoot);
    const spectrumDirectory = path.join(
      comfyRoot,
      "custom_nodes",
      "ComfyUI-Spectrum-MiniMax-H3"
    );
    await fs.mkdir(spectrumDirectory, { recursive: true });

    const statuses = await scanCustomNodes(comfyRoot, {
      ...createDefaultState().settings,
      comfyUrl: "http://127.0.0.1:1"
    });
    const spectrum = statuses.find((status) => status.id === "spectrum-minimax-h3");

    expect(spectrum).toMatchObject({
      installed: true,
      loadError: "",
      compatibilityState: "warning",
      compatibilityNotice: expect.stringContaining("未读取到版本号"),
      updateAvailable: true
    });
  });

  it("requires Motion Context 0.3.1 and reports renamed duplicate copies", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-motion-context-scan-"));
    temporaryDirectories.push(comfyRoot);
    const customNodesRoot = path.join(comfyRoot, "custom_nodes");
    const primaryDirectory = path.join(customNodesRoot, "ComfyUI-H3-Motion-Context");
    const duplicateDirectory = path.join(customNodesRoot, "h3-motion-context-fork");
    await fs.mkdir(primaryDirectory, { recursive: true });
    await fs.mkdir(duplicateDirectory, { recursive: true });
    await fs.writeFile(
      path.join(primaryDirectory, "pyproject.toml"),
      '[project]\nversion = "0.3.0"\n',
      "utf8"
    );
    await fs.writeFile(
      path.join(duplicateDirectory, "nodes.py"),
      "class MiniMaxH3MotionContext:\n"
        + "class MiniMaxH3MotionContextTrim:\n"
        + "class MiniMaxH3MotionContextSaveLatent:\n"
        + "class MiniMaxH3MotionContextLoadLatent:\n",
      "utf8"
    );

    const statuses = await scanCustomNodes(comfyRoot, {
      ...createDefaultState().settings,
      comfyUrl: "http://127.0.0.1:1"
    }, "0.2.15", "", "0.3.1");
    const motionContext = statuses.find((status) => status.id === "h3-motion-context");

    expect(motionContext).toMatchObject({
      installed: true,
      directory: primaryDirectory,
      version: "0.3.0",
      minimumVersion: "0.3.1",
      recommendedVersion: "0.3.1",
      latestVersion: "0.3.1",
      updateAvailable: true,
      compatibilityState: "error",
      duplicateDirectories: [duplicateDirectory]
    });
    expect(motionContext?.compatibilityNotice).toContain("2 个 H3 Motion Context 副本");
  });
});
