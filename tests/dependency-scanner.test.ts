import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readLocalNodeVersion,
  scanCustomNodes
} from "../electron/services/dependency-scanner";
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
  it("reads local node versions from package-owned metadata in priority order", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-node-version-"));
    temporaryDirectories.push(root);
    const fixtures = [
      ["pyproject", "pyproject.toml", '[project]\nversion = "1.2.3"\n', "1.2.3"],
      ["package", "package.json", '{"version":"2.3.4"}', "2.3.4"],
      ["version-file", "VERSION", "v3.4.5\n", "3.4.5"],
      ["python", "__init__.py", '__version__ = "4.5.6"\n', "4.5.6"]
    ] as const;
    for (const [name, filename, content, expected] of fixtures) {
      const directory = path.join(root, name);
      await fs.mkdir(directory);
      await fs.writeFile(path.join(directory, filename), content, "utf8");
      expect(await readLocalNodeVersion(directory)).toMatchObject({ version: expected });
    }
  });

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
      updateNotice: expect.stringContaining("推荐 v0.4.1"),
      compatibilityState: "warning",
      runtimeNotice: expect.stringContaining("发现 1 个模型")
    });
    expect(writer?.compatibilityNotice).toContain("推荐 v0.4.1");
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
      compatibilityState: "warning",
      runtimeNotice: expect.stringContaining("未加载 CUDA 后端")
    });
  });

  it("marks an installed Prompt Writer with an HTTP endpoint failure as repairable", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-h3-runtime-failed-"));
    temporaryDirectories.push(comfyRoot);
    const writerDirectory = path.join(
      comfyRoot,
      "custom_nodes",
      "ComfyUI-MiniMaxH3-Prompt-Writer"
    );
    await fs.mkdir(writerDirectory, { recursive: true });
    await fs.writeFile(
      path.join(writerDirectory, "pyproject.toml"),
      '[project]\nversion = "0.4.1"\n',
      "utf8"
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/object_info")) {
        return new Response(JSON.stringify({}), { status: 200 });
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
      loaded: false,
      runtimeVerified: true,
      runtimeRepairable: true,
      loadError: "MiniMax H3 Prompt Writer 运行接口不可用（HTTP 404）"
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

  it("recognizes H3 Optimizations by package markers and keeps it app-installable", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-h3-memory-scan-"));
    temporaryDirectories.push(comfyRoot);
    const directory = path.join(comfyRoot, "custom_nodes", "H3-Optimizations");
    await fs.mkdir(path.join(directory, "h3_optimizations"), { recursive: true });
    await fs.writeFile(
      path.join(directory, "pyproject.toml"),
      "[project]\nname = 'h3-optimizations'\nversion = '0.2.20'\n",
      "utf8"
    );
    await fs.writeFile(
      path.join(directory, "h3_optimizations", "public_nodes.py"),
      "NODE_CLASS_MAPPINGS = {'H3MemoryOptimization': H3MemoryOptimization}\n",
      "utf8"
    );

    const statuses = await scanCustomNodes(comfyRoot, {
      ...createDefaultState().settings,
      comfyUrl: "http://127.0.0.1:1"
    });
    const h3Memory = statuses.find((status) => status.id === "h3-optimizations");

    expect(h3Memory).toMatchObject({
      installed: true,
      loaded: true,
      runtimeVerified: false,
      directory,
      version: "0.2.20",
      minimumVersion: "0.2.16",
      recommendedVersion: "0.2.20",
      latestVersion: "0.2.20",
      appInstallable: true,
      bulkInstall: false,
      updateAvailable: false,
      revisionDirtyState: "unknown"
    });
  });

  it("reports duplicate H3 Optimizations directories without selecting them as one install", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-h3-memory-duplicates-"));
    temporaryDirectories.push(comfyRoot);
    const first = path.join(comfyRoot, "custom_nodes", "manual-h3-memory");
    const second = path.join(comfyRoot, "custom_nodes", "H3-Optimizations");
    for (const directory of [first, second]) {
      await fs.mkdir(path.join(directory, "h3_optimizations"), { recursive: true });
      await fs.writeFile(
        path.join(directory, "h3_optimizations", "memory_migration_node.py"),
        "class H3MemoryOptimization: pass\n",
        "utf8"
      );
    }

    const statuses = await scanCustomNodes(comfyRoot, {
      ...createDefaultState().settings,
      comfyUrl: "http://127.0.0.1:1"
    });
    const h3Memory = statuses.find((status) => status.id === "h3-optimizations");

    expect(h3Memory?.directory).toBe(second);
    expect(h3Memory?.duplicateDirectories).toEqual([first]);
    expect(h3Memory?.compatibilityState).toBe("warning");
    expect(h3Memory?.compatibilityNotice).toContain("H3 Optimizations");
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

  it("marks a fully unregistered KJNodes package as runtime repairable", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-kjnodes-runtime-"));
    temporaryDirectories.push(comfyRoot);
    const kjNodesDirectory = path.join(comfyRoot, "custom_nodes", "comfyui-kjnodes");
    await fs.mkdir(path.join(kjNodesDirectory, "nodes"), { recursive: true });
    await fs.writeFile(
      path.join(kjNodesDirectory, "nodes", "preview_override_node.py"),
      "class ModelPreviewOverrideKJ:\n    pass\n",
      "utf8"
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).endsWith("/object_info")) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    const statuses = await scanCustomNodes(
      comfyRoot,
      { ...createDefaultState().settings, comfyUrl: "http://127.0.0.1:8188" },
      "",
      "http://127.0.0.1:8188"
    );
    const kjNodes = statuses.find((status) => status.id === "kjnodes");

    expect(kjNodes).toMatchObject({
      installed: true,
      runtimeVerified: true,
      loaded: false,
      runtimeMissingNodeTypes: ["VRAM_Debug", "PathchSageAttentionKJ"],
      runtimeRepairable: true
    });
  });

  it("does not repair a package when at least one baseline node registered", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-kjnodes-partial-"));
    temporaryDirectories.push(comfyRoot);
    const kjNodesDirectory = path.join(comfyRoot, "custom_nodes", "comfyui-kjnodes");
    await fs.mkdir(path.join(kjNodesDirectory, "nodes"), { recursive: true });
    await fs.writeFile(
      path.join(kjNodesDirectory, "nodes", "preview_override_node.py"),
      "class ModelPreviewOverrideKJ:\n    pass\n",
      "utf8"
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).endsWith("/object_info")) {
        return new Response(JSON.stringify({ VRAM_Debug: {} }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    const statuses = await scanCustomNodes(
      comfyRoot,
      { ...createDefaultState().settings, comfyUrl: "http://127.0.0.1:8188" },
      "",
      "http://127.0.0.1:8188"
    );
    const kjNodes = statuses.find((status) => status.id === "kjnodes");

    expect(kjNodes).toMatchObject({
      runtimeMissingNodeTypes: ["PathchSageAttentionKJ"],
      runtimeRepairable: false
    });
  });

  it("marks an unpatched Qwen-VL node for the Desktop stdout repair while offline", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-qwenvl-scan-"));
    temporaryDirectories.push(comfyRoot);
    const nodeDirectory = path.join(comfyRoot, "custom_nodes", "comfyui_qwenvl_lora");
    await fs.mkdir(nodeDirectory, { recursive: true });
    await fs.writeFile(
      path.join(nodeDirectory, "nodes.py"),
      "class QwenVLModelLoader:\n    pass\n\n    print('loading')\n",
      "utf8"
    );

    const statuses = await scanCustomNodes(comfyRoot, {
      ...createDefaultState().settings,
      comfyUrl: "http://127.0.0.1:1"
    });
    const qwenVl = statuses.find((status) => status.id === "comfyui-qwenvl-lora");

    expect(qwenVl).toMatchObject({
      installed: true,
      loaded: true,
      updateAvailable: true,
      compatibilityState: "warning"
    });
    expect(qwenVl?.updateNotice).toContain("Bad file descriptor");
  });

  it("marks MultiModal Prompt Nodes without Qwen3.8 projector discovery for repair", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-multimodal-scan-"));
    temporaryDirectories.push(comfyRoot);
    const nodeDirectory = path.join(
      comfyRoot,
      "custom_nodes",
      "ComfyUI-MultiModal-Prompt-Nodes"
    );
    await fs.mkdir(nodeDirectory, { recursive: true });
    await Promise.all([
      fs.writeFile(
        path.join(nodeDirectory, "pyproject.toml"),
        '[project]\nversion = "1.0.15"\n',
        "utf8"
      ),
      fs.writeFile(
        path.join(nodeDirectory, "vision_llm_node.py"),
        "def _infer_is_qwen35(model_name_lower):\n    return 'qwen3.6' in model_name_lower\n",
        "utf8"
      ),
      fs.writeFile(
        path.join(nodeDirectory, "local_gguf_utils.py"),
        "def discover_local_gguf_models():\n    pass\n",
        "utf8"
      )
    ]);

    const statuses = await scanCustomNodes(comfyRoot, {
      ...createDefaultState().settings,
      comfyUrl: "http://127.0.0.1:1"
    });
    const multimodal = statuses.find(
      (status) => status.id === "comfyui-multimodal-prompt-nodes"
    );

    expect(multimodal).toMatchObject({
      installed: true,
      loaded: true,
      updateAvailable: true,
      compatibilityState: "warning"
    });
    expect(multimodal?.updateNotice).toContain("Qwen3.8");
    expect(multimodal?.updateNotice).toContain("一键修复");
    expect(multimodal?.compatibilityNotice).toBe(multimodal?.updateNotice);
  });

  it("offers an update when the installed node is below the catalog recommendation", async () => {
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
      recommendedVersion: "0.2.22",
      latestVersion: "0.2.7",
      updateAvailable: true,
      loadError: ""
    });
    expect(spectrum?.updateNotice).toContain("当前 v0.2.6，推荐 v0.2.22");
  });

  it("shows generic cached releases without making them actionable updates", async () => {
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
      updateAvailable: false
    });
  });

  it("ignores non-version GitHub release names", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-release-name-scan-"));
    temporaryDirectories.push(comfyRoot);
    await fs.mkdir(path.join(comfyRoot, "custom_nodes", "ComfyUI-Frame-Interpolation"), {
      recursive: true
    });

    const statuses = await scanCustomNodes(
      comfyRoot,
      { ...createDefaultState().settings, comfyUrl: "http://127.0.0.1:1" },
      "",
      "",
      "",
      { "frame-interpolation": "models" }
    );

    expect(statuses.find((status) => status.id === "frame-interpolation")?.latestVersion).toBe("");
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
    }, "0.2.16", "", "0.3.1");
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
