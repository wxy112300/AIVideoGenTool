import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  h3PromptWriterPatchFiles,
  installCustomNodePackage,
  uninstallCustomNodePackage,
  withWindowsGitLongPaths,
  type DependencyInstallerRuntime
} from "../electron/services/dependency-installer";
import {
  aetherScaleCarrierPatchFiles,
  dlss5DepthAnythingPatchFiles,
  patchAetherScaleCarrierSource,
  patchH3PromptWriterGemmaChatHandler,
  patchH3PromptWriterAutomaticContextLadder,
  patchH3PromptWriterBriefLimit,
  patchH3PromptWriterLlamaCppCompatibility,
  patchH3PromptWriterOutputBudget,
  patchDlss5DepthAnythingSource,
  patchMultimodalPromptContextSize,
  patchMultimodalPromptProjectorDiscovery,
  patchMultimodalPromptQwen38Recognition,
  patchMultimodalPromptResidency,
  patchMmh3UltimateUpscaleSource,
  patchQwenVlComfyDesktopLogging,
  patchQwenVlCooperativeInterrupt,
  prepareDlss5DepthAnything,
  prepareH3PromptWriter,
  prepareMultimodalPromptNodes
} from "../src/infrastructure/dependency-node-adapters";
import { createDefaultState } from "../src/core/defaults";
import { DLSS5_NODE_REVISION } from "../src/core/catalog";

const dlss5DepthAnythingSource = [
  "from transformers import AutoImageProcessor, AutoModelForDepthEstimation",
  "from pathlib import Path",
  "PACKAGE = Path(__file__).resolve().parent",
  "PROJECT = PACKAGE.parent",
  "_DEPTH_CACHE = {}",
  "",
  "class DLSS5DepthAnythingV2:",
  "    MODELS = {\"Small (recommended)\": \"depth-anything/Depth-Anything-V2-Small-hf\"}",
  "",
  "    def estimate(self, images, model, temporal_normalization, chunk_size):",
  "        model_id = self.MODELS[model]",
  "        device = \"cuda\"",
  "        key = (model_id, str(device))",
  "        if key not in _DEPTH_CACHE:",
  "            processor = AutoImageProcessor.from_pretrained(model_id)",
  "            network = (",
  "                AutoModelForDepthEstimation.from_pretrained(model_id).eval().to(device)",
  "            )",
  ""
].join("\n");

const aetherScaleCarrierSource = [
  "import subprocess",
  "from pathlib import Path",
  "from typing import Any",
  "",
  "CARRIER_ROOT = Path(__file__).resolve().parent",
  "CARRIER_RUNTIME = CARRIER_ROOT / \"runtime\"",
  "WORKER = CARRIER_RUNTIME / \"nvngx.dll\"",
  "CARRIER_MANIFEST = CARRIER_ROOT / \"carrier_manifest.json\"",
  "",
  "class CarrierError(RuntimeError):",
  "    pass",
  "",
  "def _set_windows_gpu_preference(executable: Path, preference: str) -> dict[str, Any]:",
  "    info = {",
  "        \"requested\": preference,",
  "        \"worker\": str(executable.resolve()),",
  "        \"applied\": False,",
  "        \"registry_value\": None,",
  "    }",
  "    with winreg.CreateKeyEx(",
  "        winreg.HKEY_CURRENT_USER,",
  "        key_path,",
  "        0,",
  "        winreg.KEY_SET_VALUE | winreg.KEY_QUERY_VALUE,",
  "    ) as key:",
  "            winreg.SetValueEx(",
  "                key,",
  "                str(executable.resolve()),",
  "                0,",
  "                winreg.REG_SZ,",
  "                value,",
  "            )",
  "",
  "def process_carrier(",
  "    images,",
  "):",
  "    gpu_routing = _set_windows_gpu_preference(WORKER, carrier_gpu)",
  "    creation_flags = getattr(subprocess, \"CREATE_NO_WINDOW\", 0)",
  "    proc = subprocess.Popen(",
  "        [str(WORKER), \"--video\"],",
  "        cwd=str(CARRIER_RUNTIME),",
  "        stdin=subprocess.PIPE,",
  "        stdout=subprocess.PIPE,",
  "        stderr=subprocess.PIPE,",
  "        creationflags=creation_flags,",
  "    )",
  "    assert proc.stdin and proc.stdout and proc.stderr",
  "    if motion_source in (\"auto\", \"internal_dis\"):",
  "        try:",
  "            internal_guide = _TemporalGuide(w, h, flow_width=640)",
  "        except CarrierError:",
  "            if motion_source == \"internal_dis\":",
  "                proc.terminate()",
  "                raise",
  "    try:",
  "        for i in range(batch):",
  "            pass",
  "        pass",
  "        t.join(timeout=2)",
  "        if code:",
  "            raise CarrierError(\"failed\")",
  "    except Exception:",
  "        try:",
  "            proc.terminate()",
  "        except Exception:",
  "            pass",
  "        raise",
].join("\n");

describe("MMH3 Ultimate Upscale adapter", () => {
  const pinnedSource = `def sample_piece(piece, cond, model, noise, sampler, sigmas, negative, cfg):
    callback = latent_preview.prepare_callback(guider.model_patcher, sigmas.shape[-1] - 1, x0_output)
    samples = guider.sample(
        noise.generate_noise(latent), latent_image, sampler, sigmas,
    )
    samples = samples.to(comfy.model_management.intermediate_device())

def spatial_process(chunk_v, chunk_a, cond, sp, model, noise, sampler, sigmas, negative, cfg,
                    fun_control=None, inpaint=None):
                out = sample_piece(piece, cond_tile, model, noise, sampler, sigmas, negative, cfg)

        segments_debug = []
        tiles_debug = []

                    fun_control=fun_control, inpaint=inpaint_param,
                )
                out = sample_piece(piece, cond_i, model, noise, sampler, sigmas, negative, cfg)

            # 3. pin frame-0 keyframe to the previous chunk's re-sampled frame
            if i > 0 and acc_v is not None:
                cond_i = anchor_conditioning(cond_i, acc_v, f0, anchor_strength)`;

  it("pins the first source token and aggregates repeated tile progress", () => {
    const patched = patchMmh3UltimateUpscaleSource(pinnedSource.replace(/\n/gu, "\r\n"));

    expect(patched).toContain("else chunk_v");
    expect(patched).toContain('comfy.utils.ProgressBar(len(bounds) * pieces_per_chunk)');
    expect(patched).toContain('progress_state["piece"] + piece_progress');
    expect(patched).toContain("progress_state=progress_state");
    expect(patchMmh3UltimateUpscaleSource(patched)).toBe(patched);
  });

  it("fails closed when the pinned source layout changes", () => {
    expect(() => patchMmh3UltimateUpscaleSource("def sample_piece(): pass\n"))
      .toThrow("MMH3 Ultimate Upscale 源码缺少");
  });
});

describe("Qwen-VL cooperative interrupt adapter", () => {
  const source = [
    "from transformers import AutoProcessor, BitsAndBytesConfig",
    "import folder_paths",
    "",
    "class QwenVLCaption:",
    "    def caption(self, model, image, prompt, max_new_tokens):",
    "        with torch.no_grad():",
    "            generated_ids = m.generate(**inputs, max_new_tokens=max_new_tokens)",
    ""
  ].join("\n");

  it("checks the official ComfyUI interrupt flag during token generation", () => {
    const patched = patchQwenVlCooperativeInterrupt(source);
    expect(patched).toContain("throw_exception_if_processing_interrupted()");
    expect(patched).toContain("stopping_criteria=_lvs_stopping_criteria");
    expect(patchQwenVlCooperativeInterrupt(patched)).toBe(patched);
  });

  it("refuses to alter an unknown node layout", () => {
    expect(() => patchQwenVlCooperativeInterrupt("import folder_paths\nclass QwenVLCaption: pass\n"))
      .toThrow("源码结构与协作式中断适配不匹配");
  });
});

describe("DLSS5 Depth Anything local-weight adapter", () => {
  it("patches the Small profile to use the user-managed safetensors weight", () => {
    const patched = patchDlss5DepthAnythingSource(
      dlss5DepthAnythingSource.replace(/\n/gu, "\r\n")
    );

    expect(dlss5DepthAnythingPatchFiles).toEqual([
      "nodes.py",
      "assets/depth-anything-v2-small/config.json",
      "assets/depth-anything-v2-small/preprocessor_config.json"
    ]);
    expect(patched).toContain("Local Video Studio Depth Anything local-weight compatibility layer");
    expect(patched).toContain("model.safetensors");
    expect(patched).toContain("AutoConfig");
    expect(patched).toContain("local_files_only=True");
    expect(patched).toContain("use_safetensors=True");
    expect(patchDlss5DepthAnythingSource(patched)).toBe(patched);
  });

  it("writes the built-in JSON metadata into the installed node package", async () => {
    const targetDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-dlss5-depth-adapter-"));
    temporaryDirectories.push(targetDirectory);
    await fs.writeFile(path.join(targetDirectory, "nodes.py"), dlss5DepthAnythingSource, "utf8");
    const reports: string[] = [];

    await prepareDlss5DepthAnything(targetDirectory, (message) => reports.push(message));

    const metadataDirectory = path.join(targetDirectory, "assets", "depth-anything-v2-small");
    const config = JSON.parse(await fs.readFile(path.join(metadataDirectory, "config.json"), "utf8")) as {
      model_type?: string;
    };
    const preprocessor = JSON.parse(
      await fs.readFile(path.join(metadataDirectory, "preprocessor_config.json"), "utf8")
    ) as { image_processor_type?: string };
    expect(config.model_type).toBe("depth_anything");
    expect(preprocessor.image_processor_type).toBe("DPTImageProcessor");
    expect((await fs.readFile(path.join(targetDirectory, "nodes.py"), "utf8")))
      .toContain("local_files_only=True");
    expect(reports.join("\n")).toContain("内置 JSON 元数据");
  });
});

describe("AetherScale carrier registry adapter", () => {
  it("records the previous per-worker preference and restores it on every worker exit path", () => {
    const patched = patchAetherScaleCarrierSource(aetherScaleCarrierSource.replace(/\n/gu, "\r\n"));

    expect(aetherScaleCarrierPatchFiles).toEqual(["backend/carrier.py"]);
    expect(patched).toContain("Local Video Studio AetherScale carrier registry ownership guard");
    expect(patched).toContain("previous_value, previous_type = winreg.QueryValueEx");
    expect(patched).toContain("_lvs_restore_windows_gpu_preference(gpu_routing)");
    expect(patched).toContain("_lvs_check_comfy_interrupt()");
    expect(patched).toContain("_lvs_write_worker_state(proc)");
    expect(patched).toContain("_lvs_clear_worker_state(proc.pid)");
    expect(patched).toContain("except Exception:\n        _lvs_restore_windows_gpu_preference(gpu_routing)\n        raise");
    expect(patchAetherScaleCarrierSource(patched)).toBe(patched);
  });

  it("fails closed when the pinned carrier source layout changes", () => {
    expect(() => patchAetherScaleCarrierSource("def process_carrier(): pass\n"))
      .toThrow("ComfyUI-AetherScale 源码缺少");
  });
});

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
  it("rejects all app-managed node mutations for remote ComfyUI", async () => {
    const remoteSettings = {
      ...createDefaultState().settings,
      comfyUrl: "https://comfy.example.test"
    };
    const runtime = {
      downloadEnvironment: () => ({}),
      proxyLogLabel: () => "代理：关闭",
      findComfyRoot: async () => "",
      findExecutable: async () => "",
      findComfyPython: async () => "",
      exists: async () => false,
      retryableRenameError: () => false,
      renameWithRetry: async () => undefined,
      runLoggedProcess: async () => ""
    } satisfies DependencyInstallerRuntime;

    await expect(installCustomNodePackage(
      "flashvsr",
      remoteSettings,
      runtime
    )).resolves.toMatchObject({
      ok: false,
      message: "远程 ComfyUI 仅支持连接，应用不会安装或修改本地节点。"
    });
    await expect(uninstallCustomNodePackage(
      "flashvsr",
      remoteSettings,
      { findComfyRoot: async () => "" }
    )).resolves.toMatchObject({
      ok: false,
      message: "远程 ComfyUI 仅支持连接，应用不会卸载或修改本地节点。"
    });
  });

  it("permanently uninstalls a catalog node so it can be downloaded again", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-node-uninstall-"));
    temporaryDirectories.push(comfyRoot);
    const nodeDirectory = path.join(
      comfyRoot,
      "custom_nodes",
      "ComfyUI-MiniMaxH3-Prompt-Writer"
    );
    await fs.mkdir(nodeDirectory, { recursive: true });
    await fs.writeFile(path.join(nodeDirectory, "marker.txt"), "installed", "utf8");
    const logs: string[] = [];

    const result = await uninstallCustomNodePackage(
      "minimax-h3-prompt-writer",
      createDefaultState().settings,
      {
        findComfyRoot: async () => comfyRoot
      },
      (message) => logs.push(message)
    );

    expect(result.ok).toBe(true);
    expect(await exists(nodeDirectory)).toBe(false);
    expect(result.message).toContain("一键安装重新下载");
    expect(await exists(path.join(comfyRoot, "node-backups"))).toBe(false);
    expect(logs).toEqual(expect.arrayContaining([
      expect.stringContaining("正在查找"),
      expect.stringContaining("正在删除节点目录"),
      expect.stringContaining("节点目录已删除")
    ]));
  });

  it("uninstalls the DLSS5 node directory even when its runtime manifest is missing", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-dlss5-node-uninstall-"));
    temporaryDirectories.push(comfyRoot);
    const nodeDirectory = path.join(comfyRoot, "custom_nodes", "ComfyUI-DLSS5");
    await fs.mkdir(path.join(nodeDirectory, "runtime"), { recursive: true });
    await fs.writeFile(path.join(nodeDirectory, "runtime", "README.md"), "failed install", "utf8");
    await fs.mkdir(path.join(nodeDirectory, "runtime", "resources"), { recursive: true });
    await fs.writeFile(path.join(nodeDirectory, "runtime", "resources", "app.asar"), "invalid asar", "utf8");
    await fs.writeFile(path.join(nodeDirectory, "failed-marker.txt"), "remove", "utf8");

    const result = await uninstallCustomNodePackage(
      "comfyui-dlss5",
      createDefaultState().settings,
      { findComfyRoot: async () => comfyRoot }
    );

    expect(result.ok, result.message).toBe(true);
    expect(await exists(nodeDirectory)).toBe(false);
    expect(result.message).toContain("一键安装重新下载");
  });

  it("recognizes every app-owned H3 Prompt Writer patch file", () => {
    expect(h3PromptWriterPatchFiles).toContain("backend/catalog.py");
  });

  it("falls back to llama-cpp-python 0.3.46's ggml log callback name", () => {
    const source = "            from llama_cpp import llama_log_callback\r\n";

    const patched = patchH3PromptWriterLlamaCppCompatibility(source);

    expect(patched).toContain("            try:\n");
    expect(patched).toContain("                from llama_cpp import llama_log_callback\n");
    expect(patched).toContain("            except ImportError:\n");
    expect(patched).toContain("                from llama_cpp import ggml_log_callback as llama_log_callback");
    expect(patchH3PromptWriterLlamaCppCompatibility(patched)).toBe(patched);
  });

  it("makes H3 Prompt Writer cleanup compatible with llama-cpp-python 0.3.46", () => {
    const source = [
      "    def unload(self) -> None:",
      "        if self.model is not None:",
      "            self.model.close()",
      "        if self.chat_handler is not None:",
      "            self.chat_handler._exit_stack.close()",
      "        self.model = None",
      "        self.chat_handler = None",
      "        self.model_id = None",
      "        self.runtime_signature = None",
      "        gc.collect()"
    ].join("\n");

    const patched = patchH3PromptWriterLlamaCppCompatibility(source);

    expect(patched).toContain("chat_handler.close()");
    expect(patched).toContain("getattr(chat_handler, \"_exit_stack\", None)");
    expect(patched).not.toContain("self.chat_handler._exit_stack.close()");
    expect(patchH3PromptWriterLlamaCppCompatibility(patched)).toBe(patched);
  });

  it("uses Gemma 4's native multimodal handler without changing the Qwen path", () => {
    const source = [
      "                from llama_cpp.llama_chat_format import MTMDChatHandler",
      "",
      "                self.chat_handler = MTMDChatHandler(",
      "                    clip_model_path=model_info[\"projector\"],",
      "                    verbose=False,",
      "                    use_gpu=True,",
      "                )",
      "                self.model = Llama(**llama_options)",
      "                        self.chat_handler.verbose = False",
      "                        with _quiet_mtmd_info():"
    ].join("\n");

    const patched = patchH3PromptWriterGemmaChatHandler(source);

    expect(patched).toContain(
      "from llama_cpp.llama_chat_format import Gemma4ChatHandler, MTMDChatHandler"
    );
    expect(patched).toContain(
      'if model_info.get("architecture_adapter") == "gemma":'
    );
    expect(patched).toContain("self.chat_handler = Gemma4ChatHandler(");
    expect(patched).toContain("self.chat_handler = MTMDChatHandler(");
    expect(patched).toContain("self.chat_handler.enable_thinking = (");
    expect(patched).toContain(")\n                        with _quiet_mtmd_info():");
    expect(patched).not.toContain(")                        with _quiet_mtmd_info():");
    expect(patchH3PromptWriterGemmaChatHandler(patched)).toBe(patched);
  });

  it("allows long H3 briefs without changing the Music3 limit", () => {
    const source = [
      "def _validated_generation_context(source):",
      "    brief = source.get(\"creative_brief\")",
      "    if len(brief) > 2000:",
      "        raise AssemblyError(\"BRIEF_TOO_LONG\", \"Creative brief cannot exceed 2,000 characters.\")",
      "",
      "def assemble_request(body):",
      "    brief = _required_text(body, \"creative_brief\", \"Creative brief\")",
      "    if len(brief) > 2000:",
      "        raise AssemblyError(\"BRIEF_TOO_LONG\", \"Creative brief cannot exceed 2,000 characters.\")",
      "",
      "def _validated_music_caption_context(source):",
      "    brief = source.get(\"creative_brief\")",
      "    if len(brief) > 2000:",
      "        raise AssemblyError(\"BRIEF_TOO_LONG\", \"Music brief cannot exceed 2,000 characters.\")"
    ].join("\n");

    const patched = patchH3PromptWriterBriefLimit(source);

    expect(patched).toContain("if len(brief) > 20_000:");
    expect(patched).toContain("Creative brief cannot exceed 20,000 characters.");
    expect(patched).not.toContain("Creative brief cannot exceed 2,000 characters.");
    expect(patched).toContain("Music brief cannot exceed 2,000 characters.");
    expect(patchH3PromptWriterBriefLimit(patched)).toBe(patched);
  });

  it("accepts the newer upstream GGMLType value fallback", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-h3-current-adapter-"));
    temporaryDirectories.push(directory);
    await fs.mkdir(path.join(directory, "backend", "models"), { recursive: true });
    const backendFilename = path.join(directory, "backend", "models", "gguf_backend.py");
    const source = [
      "        from llama_cpp import GGML_TYPE_F16, GGML_TYPE_Q8_0",
      "        from llama_cpp._ggml import GGMLType",
      "        GGML_TYPE_F16 = GGMLType.GGML_TYPE_F16.value",
      "        GGML_TYPE_Q8_0 = GGMLType.GGML_TYPE_Q8_0.value"
    ].join("\n");
    await fs.writeFile(backendFilename, source);

    await prepareH3PromptWriter(directory, vi.fn());

    expect(await fs.readFile(backendFilename, "utf8")).toBe(source);
  });

  it("backports the H3 output budget and supports the nested GGUF backend path", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-h3-output-budget-"));
    temporaryDirectories.push(directory);
    await fs.mkdir(path.join(directory, "backend", "models", "gguf"), { recursive: true });
    await fs.writeFile(
      path.join(directory, "backend", "models", "gguf", "_backend.py"),
      [
        "    def unload(self):",
        "        self.model.close()",
        "        self.chat_handler._exit_stack.close()",
        '        "n_batch": 512,',
        "        self.model = None",
        "        self.chat_handler = None"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(directory, "backend", "context.py"),
      "STANDARD_OUTPUT_TOKENS = 1_536\nMUSIC_OUTPUT_TOKENS = 1_536\n"
    );
    await fs.writeFile(
      path.join(directory, "backend", "assembly.py"),
      [
        "def _validated_generation_context(source):",
        "    brief = source.get(\"creative_brief\")",
        "    if len(brief) > 2000:",
        "        raise AssemblyError(\"BRIEF_TOO_LONG\", \"Creative brief cannot exceed 2,000 characters.\")",
        "",
        "def assemble_request(body):",
        "    brief = _required_text(body, \"creative_brief\", \"Creative brief\")",
        "    if len(brief) > 2000:",
        "        raise AssemblyError(\"BRIEF_TOO_LONG\", \"Creative brief cannot exceed 2,000 characters.\")",
        "",
        "def _validated_music_caption_context(source):",
        "    brief = source.get(\"creative_brief\")",
        "    if len(brief) > 2000:",
        "        raise AssemblyError(\"BRIEF_TOO_LONG\", \"Music brief cannot exceed 2,000 characters.\")"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(directory, "backend", "h3_pipeline.py"),
      "        max_tokens=1_536,\n"
    );
    await fs.writeFile(
      path.join(directory, "backend", "catalog.py"),
      '    "auto_context_ladder": True,\n'
    );

    await prepareH3PromptWriter(directory, vi.fn());

    const backend = await fs.readFile(
      path.join(directory, "backend", "models", "gguf", "_backend.py"),
      "utf8"
    );
    expect(backend).toContain('getattr(chat_handler, "_exit_stack", None)');
    expect(backend).not.toContain("self.chat_handler._exit_stack.close()");
    expect(await fs.readFile(path.join(directory, "backend", "context.py"), "utf8"))
      .toContain("STANDARD_OUTPUT_TOKENS = 2_048");
    expect(await fs.readFile(path.join(directory, "backend", "assembly.py"), "utf8"))
      .toContain("Creative brief cannot exceed 20,000 characters.");
    expect(await fs.readFile(path.join(directory, "backend", "assembly.py"), "utf8"))
      .not.toContain("Creative brief cannot exceed 2,000 characters.");
    expect(await fs.readFile(path.join(directory, "backend", "context.py"), "utf8"))
      .toContain("MUSIC_OUTPUT_TOKENS = 1_536");
    expect(await fs.readFile(path.join(directory, "backend", "h3_pipeline.py"), "utf8"))
      .toContain("max_tokens=2_048");
    expect(await fs.readFile(path.join(directory, "backend", "catalog.py"), "utf8"))
      .toContain('"auto_context_ladder": True');
    expect(backend).toContain('"n_batch": 256');
    expect(patchH3PromptWriterOutputBudget("STANDARD_OUTPUT_TOKENS = 4_096\n"))
      .toBe("STANDARD_OUTPUT_TOKENS = 2_048\n");
    expect(patchH3PromptWriterOutputBudget("STANDARD_OUTPUT_TOKENS = 3_584\n"))
      .toBe("STANDARD_OUTPUT_TOKENS = 2_048\n");
  });

  it("restores automatic context promotion for previously patched Gemma catalogs", () => {
    expect(patchH3PromptWriterAutomaticContextLadder([
      '    "auto_context_ladder": qwen_context,',
      '    "auto_context_ladder": False,'
    ].join("\n"))).toBe([
      '    "auto_context_ladder": True,',
      '    "auto_context_ladder": True,'
    ].join("\n"));
  });

  it("raises the MultiModal GGUF context from 4K to 8K", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-multimodal-adapter-"));
    temporaryDirectories.push(directory);
    const source = [
      "import atexit",
      "",
      "def load_model(n_ctx: int = 4096):",
      "    pass",
      "def rewrite_prompt(n_ctx: int = 4096):",
      "    pass",
      "",
      "class VisionLLMNode:",
      "    @classmethod",
      "    def INPUT_TYPES(cls):",
      "        return {",
      "            \"optional\": {",
      "                \"image\": (\"IMAGE\",),",
      "            }",
      "        }",
      "",
      "    def rewrite(self, model: str, mmproj: str, prompt: str, max_tokens: int, temperature: float, device: str, image=None) -> tuple:",
      "        try:",
      "            return (prompt,)",
      "        finally:",
      "            cleanup()",
      "",
      "# ComfyUI Node Registration"
    ].join("\n");
    await fs.writeFile(path.join(directory, "vision_llm_node.py"), source);
    await fs.writeFile(path.join(directory, "local_gguf_utils.py"), [
      "def discover_local_gguf_models(qwen_only=False):",
      "    for file_name in []:",
      "        if file_name.startswith(\"mmproj\"):",
      "            continue",
      "",
      "def discover_local_mmproj_files():",
      "    for file_name in []:",
      "        if file_name.startswith(\"mmproj\"):",
      "            pass",
      ""
    ].join("\n"));

    await prepareMultimodalPromptNodes(directory, vi.fn());
    const patched = await fs.readFile(path.join(directory, "vision_llm_node.py"), "utf8");
    const patchedDiscovery = await fs.readFile(path.join(directory, "local_gguf_utils.py"), "utf8");

    expect(patched.match(/n_ctx: int = 8192/gu)).toHaveLength(2);
    expect(patched).toContain('"keep_model_loaded": ("BOOLEAN", {"default": False})');
    expect(patched).toContain("if not keep_model_loaded:");
    expect(patched).toContain('/local-video-studio/multimodal-prompt/unload');
    expect(patchMultimodalPromptContextSize(patched)).toBe(patched);
    expect(patchMultimodalPromptResidency(patched)).toBe(patched);
    expect(patchedDiscovery).toContain("def _is_mmproj_filename");
    expect(patchedDiscovery).toContain('"-vision-" in lower');
    expect(patchMultimodalPromptProjectorDiscovery(patchedDiscovery)).toBe(patchedDiscovery);
  });

  it("teaches the MultiModal node that Qwen3.8 uses the Qwen3.5 handler family", () => {
    const source = [
      "    def _infer_is_qwen35(self, model_path: str) -> bool:",
      "        model_name_lower = os.path.basename(model_path).lower()",
      '        return ("qwen35" in model_name_lower) or ("qwen3.5" in model_name_lower) or ("qwen36" in model_name_lower) or ("qwen3.6" in model_name_lower)',
      '        families = ["qwen2", "qwen3vl", "qwen3-vl", "qwen35", "qwen3.5", "qwen36", "qwen3.6"]',
      '            if f.startswith("mmproj-") and f.endswith(".gguf")'
    ].join("\n");

    const patched = patchMultimodalPromptQwen38Recognition(source);
    expect(patched).toContain('("qwen3.8" in model_name_lower)');
    expect(patched).toContain('"qwen38", "qwen3.8"]');
    expect(patched).toContain('or "-vision-" in f.lower()');
    expect(patchMultimodalPromptQwen38Recognition(patched)).toBe(patched);
  });

  it("accepts the current upstream tuple-based Qwen3.8 recognition", () => {
    const source = [
      "    def _infer_is_qwen35(self, model_path: str) -> bool:",
      "        model_name_lower = os.path.basename(model_path).lower()",
      "        return any(",
      "            family_name in model_name_lower",
      '            for family_name in ("qwen35", "qwen3.5", "qwen36", "qwen3.6", "qwen38", "qwen3.8")',
      "        )",
      "",
      "    def _auto_detect_mmproj(self, model_path: str):",
      '        families = ["qwen2", "qwen35", "qwen3.5", "qwen36", "qwen3.6", "qwen38", "qwen3.8"]',
      '        mmproj_files = [f for f in os.listdir(model_dir) if f.startswith("mmproj-") and f.endswith(".gguf")]'
    ].join("\n");

    const patched = patchMultimodalPromptQwen38Recognition(source);
    expect(patched).toContain('or "-vision-" in f.lower()');
    expect(patched).toContain('for family_name in ("qwen35", "qwen3.5", "qwen36", "qwen3.6", "qwen38", "qwen3.8")');
    expect(patchMultimodalPromptQwen38Recognition(patched)).toBe(patched);
  });

  it("makes Qwen-VL logging tolerate ComfyUI Desktop's closed stdout", () => {
    const source = [
      "import folder_paths",
      "",
      "class QwenVLModelLoader:",
      "    def load(self):",
      "        print('[QwenVL] loading')"
    ].join("\n");
    const patched = patchQwenVlComfyDesktopLogging(source);

    expect(patched).toContain("def _qwenvl_prepare_console_streams():");
    expect(patched).toContain('for stream_name in ("stdout", "stderr")');
    expect(patched).toContain("os.fstat(stream.fileno())");
    expect(patched).toContain("stream.flush()");
    expect(patched).toContain("        _qwenvl_prepare_console_streams()\n");
    expect(patched).toContain("def _qwenvl_log(*args, **kwargs):");
    expect(patched).toContain("builtins.print(*args, **kwargs)");
    expect(patched).toContain("_qwenvl_log('[QwenVL] loading')");
    expect(patched).toContain('getattr(exc, "errno", None) != 9');
    expect(patchQwenVlComfyDesktopLogging(patched)).toBe(patched);
  });

  it("upgrades the old Qwen-VL print-only Desktop shim", () => {
    const source = [
      "import os",
      "import folder_paths",
      "",
      "def _qwenvl_log(*args, **kwargs):",
      "    try:",
      "        import builtins",
      "        builtins.print(*args, **kwargs)",
      "    except OSError as exc:",
      "        if getattr(exc, 'errno', None) != 9:",
      "            raise",
      "",
      "class QwenVLModelLoader:",
      "    def load(self):",
      "        _qwenvl_log('[QwenVL] loading')"
    ].join("\n");

    const patched = patchQwenVlComfyDesktopLogging(source);

    expect(patched).toContain("def _qwenvl_prepare_console_streams():");
    expect(patched).toContain("        _qwenvl_prepare_console_streams()\n");
    expect(patched.match(/def _qwenvl_log\(/gu)).toHaveLength(1);
    expect(patchQwenVlComfyDesktopLogging(patched)).toBe(patched);
  });

  it("upgrades the Qwen-VL Desktop stream shim to test logger flush", () => {
    const source = [
      "import folder_paths",
      "",
      "def _qwenvl_prepare_console_streams():",
      "    import os",
      "    import sys",
      "    for stream_name in (\"stdout\", \"stderr\"):",
      "        stream = getattr(sys, stream_name, None)",
      "        try:",
      "            os.fstat(stream.fileno())",
      "        except (OSError, ValueError, AttributeError):",
      "            setattr(sys, stream_name, open(os.devnull, \"w\"))",
      "",
      "class QwenVLModelLoader:",
      "    def load(self):",
      "        _qwenvl_prepare_console_streams()"
    ].join("\n");

    const patched = patchQwenVlComfyDesktopLogging(source);

    expect(patched).toContain("            os.fstat(stream.fileno())\n            stream.flush()");
    expect(patchQwenVlComfyDesktopLogging(patched)).toBe(patched);
  });

  it("does not require the 0.3.2 diagnostics module to contain a GGML shim", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-h3-adapter-"));
    temporaryDirectories.push(directory);
    await fs.mkdir(path.join(directory, "backend", "models"), { recursive: true });
    await fs.writeFile(
      path.join(directory, "backend", "models", "gguf_backend.py"),
      "            from llama_cpp import GGML_TYPE_F16, GGML_TYPE_Q8_0, Llama\n"
    );
    await fs.writeFile(
      path.join(directory, "backend", "runtime_diagnostics.py"),
      "from llama_cpp import llama_cpp\n"
    );
    const report = vi.fn();

    await prepareH3PromptWriter(directory, report);

    expect(await fs.readFile(
      path.join(directory, "backend", "models", "gguf_backend.py"),
      "utf8"
    )).toContain("from llama_cpp._ggml import GGMLType");
    expect(report).toHaveBeenCalledWith(expect.stringContaining("1 个 H3 Prompt Writer 文件"));
  });

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

    expect(result.ok, `${result.message}\n${result.log ?? ""}`).toBe(true);
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

  it("pins the H3 latent upscaler checkout to the catalog revision", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-h3-upscaler-pin-"));
    temporaryDirectories.push(comfyRoot);
    const processCalls: string[][] = [];
    const pinnedRevision = "a5ed6e9586f0b14250a0018f78568e0076e4bd9d";
    const runtime: DependencyInstallerRuntime = {
      downloadEnvironment: () => ({ ...process.env }),
      proxyLogLabel: () => "",
      findComfyRoot: async () => comfyRoot,
      findExecutable: async () => "git.exe",
      findComfyPython: async () => "python.exe",
      exists,
      retryableRenameError: () => false,
      renameWithRetry: async (source, target) => fs.rename(source, target),
      runLoggedProcess: async (_executable, args) => {
        processCalls.push(args);
        if (args[0] === "clone") await fs.mkdir(args.at(-1)!, { recursive: true });
        if (args.includes("rev-parse") && args.includes("HEAD")) return pinnedRevision;
        return "";
      }
    };

    const result = await installCustomNodePackage(
      "h3-latent-upscaler",
      createDefaultState().settings,
      runtime
    );

    expect(result.ok, `${result.message}\n${result.log ?? ""}`).toBe(true);
    expect(processCalls).toEqual(expect.arrayContaining([
      expect.arrayContaining(["clone", "--depth", "1", "--no-checkout"]),
      expect.arrayContaining(["fetch", "--depth", "1", "origin", pinnedRevision]),
      expect.arrayContaining(["checkout", "--detach", pinnedRevision]),
      expect.arrayContaining(["rev-parse", "HEAD"])
    ]));
    expect(result.log).toContain(`节点 revision 已校验：${pinnedRevision}`);
  });

  it("runs the DLSS5 runtime transaction after the shared node checkout", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-dlss5-node-install-"));
    temporaryDirectories.push(comfyRoot);
    const processCalls: string[][] = [];
    const installRuntime = vi.fn(async (
      _settings: Parameters<NonNullable<DependencyInstallerRuntime["installDlss5Runtime"]>>[0],
      root: string,
      nodeDirectory: string,
      report?: (message: string) => void
    ) => {
      expect(root).toBe(comfyRoot);
      expect(nodeDirectory).toBe(path.join(comfyRoot, "custom_nodes", "ComfyUI-DLSS5"));
      report?.("fixture DLSS5 runtime");
      return { ok: true, message: "fixture runtime ready" };
    });
    const runtime: DependencyInstallerRuntime = {
      downloadEnvironment: () => ({}),
      proxyLogLabel: () => "",
      findComfyRoot: async () => comfyRoot,
      findExecutable: async () => "git.exe",
      findComfyPython: async () => "selected-comfy-python.exe",
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
            dlss5DepthAnythingSource,
            "utf8"
          );
        }
        if (args.includes("rev-parse") && args.includes("HEAD")) return DLSS5_NODE_REVISION;
        return "";
      },
      installDlss5Runtime: installRuntime
    };

    const result = await installCustomNodePackage(
      "comfyui-dlss5",
      { ...createDefaultState().settings, comfyUrl: "http://127.0.0.1:8188" },
      runtime
    );

    expect(result.ok, `${result.message}\n${result.log ?? ""}`).toBe(true);
    expect(installRuntime).toHaveBeenCalledOnce();
    expect(processCalls).toEqual(expect.arrayContaining([
      expect.arrayContaining(["clone", "--depth", "1", "--no-checkout"]),
      expect.arrayContaining(["fetch", "--depth", "1", "origin", DLSS5_NODE_REVISION]),
      expect.arrayContaining(["checkout", "--detach", DLSS5_NODE_REVISION])
    ]));
    expect(result.log).toContain("fixture DLSS5 runtime");
  });

  it("installs the app-owned serializer from a bundled package with a recoverable backup", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-h3-serializer-install-"));
    const bundledRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-h3-serializer-source-"));
    temporaryDirectories.push(comfyRoot, bundledRoot);
    const sourceDirectory = path.join(bundledRoot, "LocalVideoStudio-H3");
    const targetDirectory = path.join(comfyRoot, "custom_nodes", "LocalVideoStudio-H3");
    await fs.mkdir(sourceDirectory, { recursive: true });
    await fs.writeFile(path.join(sourceDirectory, "__init__.py"), "NODE_CLASS_MAPPINGS = {}", "utf8");
    await fs.writeFile(path.join(sourceDirectory, "VERSION"), "0.3.0\n", "utf8");
    await fs.writeFile(path.join(sourceDirectory, "requirements.txt"), "\n", "utf8");
    await fs.mkdir(targetDirectory, { recursive: true });
    await fs.writeFile(path.join(targetDirectory, "old.txt"), "old", "utf8");
    const runtime: DependencyInstallerRuntime = {
      downloadEnvironment: () => ({ ...process.env }),
      proxyLogLabel: () => "",
      findComfyRoot: async () => comfyRoot,
      findExecutable: async () => { throw new Error("bundled nodes must not invoke Git"); },
      findComfyPython: async () => "python.exe",
      resolveBundledNodeDirectory: async () => sourceDirectory,
      exists,
      retryableRenameError: () => false,
      renameWithRetry: async (source, target) => fs.rename(source, target),
      runLoggedProcess: async (_executable, args) => {
        expect(args).toEqual(["-m", "pip", "install", "-r", path.join(targetDirectory, "requirements.txt")]);
        return "";
      }
    };

    const result = await installCustomNodePackage(
      "local-video-studio-h3-av",
      createDefaultState().settings,
      runtime
    );

    expect(result.ok, `${result.message}\n${result.log ?? ""}`).toBe(true);
    expect(await fs.readFile(path.join(targetDirectory, "__init__.py"), "utf8"))
      .toContain("NODE_CLASS_MAPPINGS");
    expect(await exists(path.join(targetDirectory, "old.txt"))).toBe(false);
    expect((await fs.readdir(path.join(comfyRoot, "node-backups"))).some((name) =>
      name.startsWith("LocalVideoStudio-H3-"
      ))).toBe(true);
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

  it("installs H3 Optimizations through the shared clone path and streams progress", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-h3-memory-install-"));
    temporaryDirectories.push(comfyRoot);
    const processCalls: string[][] = [];
    const logs: string[] = [];
    const runtime: DependencyInstallerRuntime = {
      downloadEnvironment: () => ({ ...process.env }),
      proxyLogLabel: () => "",
      findComfyRoot: async () => comfyRoot,
      findExecutable: async (command) => command === "git.exe" ? "git.exe" : "",
      findComfyPython: async () => "python.exe",
      exists,
      retryableRenameError: () => false,
      renameWithRetry: async (source, target) => fs.rename(source, target),
      runLoggedProcess: async (_executable, args, options) => {
        processCalls.push(args);
        options.onLog?.(`git ${args[0]}`);
        if (args[0] === "clone") {
          const targetDirectory = args.at(-1);
          if (!targetDirectory) throw new Error("missing clone target");
          await fs.mkdir(path.join(targetDirectory, "h3_optimizations"), { recursive: true });
          await fs.writeFile(
            path.join(targetDirectory, "h3_optimizations", "public_nodes.py"),
            "NODE_CLASS_MAPPINGS = {}",
            "utf8"
          );
        }
        return "";
      }
    };
    const settings = createDefaultState().settings;
    const result = await installCustomNodePackage(
      "h3-optimizations",
      settings,
      runtime,
      (message) => logs.push(message)
    );

    expect(result.ok, `${result.message}\n${result.log ?? ""}`).toBe(true);
    expect(processCalls).toEqual([
      expect.arrayContaining([
        "clone",
        "--depth",
        "1",
        "https://github.com/Zironic/H3-Optimizations.git"
      ])
    ]);
    expect(await exists(path.join(comfyRoot, "custom_nodes", "H3-Optimizations"))).toBe(true);
    expect(logs).toContain("git clone");
    expect(result.log).toContain("未发现 requirements.txt，无需安装额外 Python 依赖");
  });

  it("installs the optional Qwen3.6 node with the shared prebuilt backend and no CUDA Toolkit", async () => {
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
        if (args[0] === "clone") {
          const target = args.at(-1)!;
          await fs.mkdir(target, { recursive: true });
          await fs.writeFile(
            path.join(target, "vision_llm_node.py"),
            [
              "import atexit",
              "",
              "def load_model(n_ctx: int = 4096):",
              "    pass",
              "def rewrite_prompt(n_ctx: int = 4096):",
              "    pass",
              "",
              "class VisionLLMNode:",
              "    @classmethod",
              "    def INPUT_TYPES(cls):",
              "        return {",
              "            \"optional\": {",
              "                \"image\": (\"IMAGE\",),",
              "            }",
              "        }",
              "",
              "    def rewrite(self, model: str, mmproj: str, prompt: str, max_tokens: int, temperature: float, device: str, image=None) -> tuple:",
              "        try:",
              "            return (prompt,)",
              "        finally:",
              "            cleanup()",
              "",
              "# ComfyUI Node Registration"
            ].join("\n")
          );
          await fs.writeFile(path.join(target, "local_gguf_utils.py"), [
            "def discover_local_gguf_models(qwen_only=False):",
            "    for file_name in []:",
            "        if file_name.startswith(\"mmproj\"):",
            "            continue",
            "",
            "def discover_local_mmproj_files():",
            "    for file_name in []:",
            "        if file_name.startswith(\"mmproj\"):",
            "            pass",
            ""
          ].join("\n"));
          return "clone complete";
        }
        if (args[0] === "-c") {
          const probeCount = processCalls.filter((call) => call[0] === "-c").length;
          return JSON.stringify({
            pythonVersion: "3.12.11",
            packageVersion: probeCount > 1 ? "0.3.46+cu128" : "",
            importable: probeCount > 1,
            gpuOffload: probeCount > 1,
            dynamicBackend: probeCount > 1,
            torchVersion: "2.8.0+cu129",
            cudaVersion: "12.9"
          });
        }
        return "";
      }
    };

    const result = await installCustomNodePackage(
      "comfyui-multimodal-prompt-nodes",
      createDefaultState().settings,
      runtime
    );

    expect(result.ok, `${result.message}\n${result.log ?? ""}`).toBe(true);
    expect(processCalls.some((args) => args.includes("nvcc"))).toBe(false);
    expect(processCalls.some((args) => args.some((arg) => arg.includes("git+https://github.com/JamePeng"))))
      .toBe(false);
    expect(processCalls.some((args) => args.some((arg) => arg.includes("v0.3.46-cu128-win-20260808"))))
      .toBe(process.platform === "win32");
    expect(result.log).toContain("共用的 JamePeng llama-cpp-python 后端");
  });

  it("never lets H3 Prompt Writer requirements replace the shared llama backend", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-h3-shared-runtime-"));
    temporaryDirectories.push(comfyRoot);
    const processCalls: string[][] = [];
    const runtime: DependencyInstallerRuntime = {
      downloadEnvironment: () => ({ ...process.env }),
      proxyLogLabel: () => "",
      findComfyRoot: async () => comfyRoot,
      findExecutable: async () => "git.exe",
      findComfyPython: async () => "python.exe",
      exists,
      retryableRenameError: () => false,
      renameWithRetry: async (source, target) => fs.rename(source, target),
      runLoggedProcess: async (_executable, args, options) => {
        processCalls.push(args);
        if (args[0] === "clone") {
          const target = args.at(-1)!;
          await fs.mkdir(path.join(target, "backend", "models"), { recursive: true });
          await fs.writeFile(
            path.join(target, "backend", "models", "gguf_backend.py"),
            "            from llama_cpp import GGML_TYPE_F16, GGML_TYPE_Q8_0, Llama\n"
          );
          await fs.writeFile(
            path.join(target, "requirements.txt"),
            "llama-cpp-python>=0.3.34,<0.4\npillow>=10.0.0\n"
          );
          return "clone complete";
        }
        if (args[0] === "-c") {
          return JSON.stringify({
            pythonVersion: "3.12.11",
            packageVersion: "0.3.46+cu128",
            importable: true,
            gpuOffload: true,
            dynamicBackend: true,
            torchVersion: "2.8.0+cu129",
            cudaVersion: "12.9"
          });
        }
        options.onLog?.("pip complete");
        return "pip complete";
      }
    };

    const result = await installCustomNodePackage(
      "minimax-h3-prompt-writer",
      createDefaultState().settings,
      runtime
    );

    expect(result.ok).toBe(true);
    const pipCalls = processCalls.filter((args) => args.includes("pip"));
    expect(pipCalls).toHaveLength(1);
    expect(pipCalls[0]).not.toContain("-r");
    expect(pipCalls[0].some((arg) => /llama-cpp-python/iu.test(arg))).toBe(false);
    expect(result.log).toContain("跳过节点 requirements.txt 中的 1 项 llama-cpp-python 要求");
    expect(result.log).toContain("共享 llama-cpp-python 由统一运行时管理");
  });

  it("backs up a dirty H3 Prompt Writer checkout instead of pulling over compatibility patches", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-h3-dirty-update-"));
    temporaryDirectories.push(comfyRoot);
    const targetDirectory = path.join(
      comfyRoot,
      "custom_nodes",
      "ComfyUI-MiniMaxH3-Prompt-Writer"
    );
    await fs.mkdir(path.join(targetDirectory, ".git"), { recursive: true });
    await fs.writeFile(path.join(targetDirectory, "app-local-change.txt"), "keep me");
    const processCalls: string[][] = [];
    const runtime: DependencyInstallerRuntime = {
      downloadEnvironment: () => ({ ...process.env }),
      proxyLogLabel: () => "",
      findComfyRoot: async () => comfyRoot,
      findExecutable: async () => "git.exe",
      findComfyPython: async () => "python.exe",
      exists,
      retryableRenameError: () => false,
      renameWithRetry: async (source, target) => fs.rename(source, target),
      runLoggedProcess: async (_executable, args) => {
        processCalls.push(args);
        if (args.includes("remote")) {
          return "https://github.com/duckyshell/ComfyUI-MiniMaxH3-Prompt-Writer.git";
        }
        if (args.includes("status")) {
          return " M backend/models/gguf_backend.py\n";
        }
        if (args[0] === "clone") {
          const cloneDirectory = args.at(-1)!;
          await fs.mkdir(path.join(cloneDirectory, "backend", "models"), { recursive: true });
          await fs.writeFile(
            path.join(cloneDirectory, "backend", "models", "gguf_backend.py"),
            "from llama_cpp import GGML_TYPE_F16, GGML_TYPE_Q8_0, Llama\n"
          );
          return "clone complete";
        }
        if (args[0] === "-c") {
          return JSON.stringify({
            pythonVersion: "3.12.11",
            packageVersion: "0.3.46+cu128",
            importable: true,
            gpuOffload: true,
            dynamicBackend: true,
            torchVersion: "2.8.0+cu129",
            cudaVersion: "12.9"
          });
        }
        return "";
      }
    };

    const result = await installCustomNodePackage(
      "minimax-h3-prompt-writer",
      createDefaultState().settings,
      runtime
    );

    expect(result.ok).toBe(true);
    expect(processCalls.some((args) => args.includes("status"))).toBe(true);
    expect(processCalls.some((args) => args.includes("pull"))).toBe(false);
    expect(processCalls.some((args) => args[0] === "clone")).toBe(true);
    expect(result.log).toContain("检测到节点目录存在本地修改");
    expect((await fs.readdir(path.join(comfyRoot, "node-backups"))).some((name) =>
      name.startsWith("ComfyUI-MiniMaxH3-Prompt-Writer-")
    )).toBe(true);
    expect(await exists(path.join(
      targetDirectory,
      "backend",
      "models",
      "gguf_backend.py"
    ))).toBe(true);
  });

  it("reuses the app-patched H3 checkout when the upstream HEAD did not change", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-h3-patched-current-"));
    temporaryDirectories.push(comfyRoot);
    const targetDirectory = path.join(
      comfyRoot,
      "custom_nodes",
      "ComfyUI-MiniMaxH3-Prompt-Writer"
    );
    const baseline = "from llama_cpp import GGML_TYPE_F16, GGML_TYPE_Q8_0, Llama\n";
    await fs.mkdir(path.join(targetDirectory, ".git", "refs"), { recursive: true });
    await fs.mkdir(path.join(targetDirectory, "backend", "models"), { recursive: true });
    await fs.writeFile(
      path.join(targetDirectory, "backend", "models", "gguf_backend.py"),
      patchH3PromptWriterLlamaCppCompatibility(baseline)
    );
    const processCalls: string[][] = [];
    const runtime: DependencyInstallerRuntime = {
      downloadEnvironment: () => ({ ...process.env }),
      proxyLogLabel: () => "",
      findComfyRoot: async () => comfyRoot,
      findExecutable: async () => "git.exe",
      findComfyPython: async () => "python.exe",
      exists,
      retryableRenameError: () => false,
      renameWithRetry: async (source, target) => fs.rename(source, target),
      runLoggedProcess: async (_executable, args) => {
        processCalls.push(args);
        if (args.includes("remote")) {
          return "https://github.com/duckyshell/ComfyUI-MiniMaxH3-Prompt-Writer.git";
        }
        if (args.includes("status")) {
          return " M backend/models/gguf_backend.py\n";
        }
        if (args.includes("show")) return baseline;
        if (args.includes("rev-parse")) return "abc1234";
        if (args.includes("ls-remote")) return "abc1234\tHEAD\n";
        if (args[0] === "-c") {
          return JSON.stringify({
            pythonVersion: "3.12.11",
            packageVersion: "0.3.46+cu128",
            importable: true,
            gpuOffload: true,
            dynamicBackend: true,
            torchVersion: "2.8.0+cu129",
            cudaVersion: "12.9"
          });
        }
        return "";
      }
    };

    const result = await installCustomNodePackage(
      "minimax-h3-prompt-writer",
      createDefaultState().settings,
      runtime
    );

    expect(result.ok).toBe(true);
    expect(processCalls.some((args) => args[0] === "clone")).toBe(false);
    expect(processCalls.some((args) => args.includes("pull"))).toBe(false);
    expect(result.log).toContain("上游没有新提交；保留当前目录，不重复克隆");
    expect(await exists(path.join(comfyRoot, "node-backups"))).toBe(false);
  });

  it("backs up and cleanly replaces a diverged H3 Prompt Writer checkout", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-h3-diverged-update-"));
    temporaryDirectories.push(comfyRoot);
    const targetDirectory = path.join(
      comfyRoot,
      "custom_nodes",
      "ComfyUI-MiniMaxH3-Prompt-Writer"
    );
    await fs.mkdir(path.join(targetDirectory, ".git"), { recursive: true });
    await fs.writeFile(path.join(targetDirectory, "local-commit.txt"), "preserve this checkout");
    const processCalls: string[][] = [];
    const runtime: DependencyInstallerRuntime = {
      downloadEnvironment: () => ({ ...process.env }),
      proxyLogLabel: () => "",
      findComfyRoot: async () => comfyRoot,
      findExecutable: async () => "git.exe",
      findComfyPython: async () => "python.exe",
      exists,
      retryableRenameError: () => false,
      renameWithRetry: async (source, target) => fs.rename(source, target),
      runLoggedProcess: async (_executable, args) => {
        processCalls.push(args);
        if (args.includes("remote")) {
          return "https://github.com/duckyshell/ComfyUI-MiniMaxH3-Prompt-Writer.git";
        }
        if (args.includes("status")) return "";
        if (args.includes("pull")) {
          throw Object.assign(new Error("命令退出，代码 128"), {
            stdout: "fatal: Not possible to fast-forward, aborting."
          });
        }
        if (args[0] === "clone") {
          const cloneDirectory = args.at(-1)!;
          await fs.mkdir(path.join(cloneDirectory, "backend", "models"), { recursive: true });
          await fs.writeFile(
            path.join(cloneDirectory, "backend", "models", "gguf_backend.py"),
            "from llama_cpp import GGML_TYPE_F16, GGML_TYPE_Q8_0, Llama\n"
          );
          return "clone complete";
        }
        if (args[0] === "-c") {
          return JSON.stringify({
            pythonVersion: "3.12.11",
            packageVersion: "0.3.46+cu128",
            importable: true,
            gpuOffload: true,
            dynamicBackend: true,
            torchVersion: "2.8.0+cu129",
            cudaVersion: "12.9"
          });
        }
        return "";
      }
    };

    const result = await installCustomNodePackage(
      "minimax-h3-prompt-writer",
      createDefaultState().settings,
      runtime
    );

    expect(result.ok).toBe(true);
    expect(processCalls.some((args) => args.includes("pull"))).toBe(true);
    expect(processCalls.some((args) => args[0] === "clone")).toBe(true);
    expect(result.log).toContain("本地分支与上游已分叉");
    expect(result.log).toContain("正在校验 H3 Prompt Writer 的 Python 源码语法");
    const backupRoot = path.join(comfyRoot, "node-backups");
    const backupName = (await fs.readdir(backupRoot)).find((name) =>
      name.startsWith("ComfyUI-MiniMaxH3-Prompt-Writer-")
    );
    expect(backupName).toBeTruthy();
    expect(await fs.readFile(path.join(backupRoot, backupName!, "local-commit.txt"), "utf8"))
      .toBe("preserve this checkout");
    expect(await exists(path.join(targetDirectory, "local-commit.txt"))).toBe(false);
  });

  it("keeps the existing H3 checkout when the replacement fails Python syntax validation", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-h3-invalid-replacement-"));
    temporaryDirectories.push(comfyRoot);
    const targetDirectory = path.join(
      comfyRoot,
      "custom_nodes",
      "ComfyUI-MiniMaxH3-Prompt-Writer"
    );
    await fs.mkdir(path.join(targetDirectory, ".git"), { recursive: true });
    await fs.writeFile(path.join(targetDirectory, "working-copy.txt"), "keep the working node");
    const runtime: DependencyInstallerRuntime = {
      downloadEnvironment: () => ({ ...process.env }),
      proxyLogLabel: () => "",
      findComfyRoot: async () => comfyRoot,
      findExecutable: async () => "git.exe",
      findComfyPython: async () => "python.exe",
      exists,
      retryableRenameError: () => false,
      renameWithRetry: async (source, target) => fs.rename(source, target),
      runLoggedProcess: async (_executable, args) => {
        if (args.includes("remote")) {
          return "https://github.com/duckyshell/ComfyUI-MiniMaxH3-Prompt-Writer.git";
        }
        if (args.includes("status")) return "";
        if (args.includes("pull")) {
          throw Object.assign(new Error("命令退出，代码 128"), {
            stdout: "fatal: Not possible to fast-forward, aborting."
          });
        }
        if (args[0] === "clone") {
          const cloneDirectory = args.at(-1)!;
          await fs.mkdir(path.join(cloneDirectory, "backend", "models"), { recursive: true });
          await fs.writeFile(
            path.join(cloneDirectory, "backend", "models", "gguf_backend.py"),
            "from llama_cpp import GGML_TYPE_F16, GGML_TYPE_Q8_0, Llama\n"
          );
          return "clone complete";
        }
        if (args[0] === "-c" && args[1]?.includes("ast.parse")) {
          throw new Error("SyntaxError: invalid syntax");
        }
        return "";
      }
    };

    const result = await installCustomNodePackage(
      "minimax-h3-prompt-writer",
      createDefaultState().settings,
      runtime
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("SyntaxError: invalid syntax");
    expect(await fs.readFile(path.join(targetDirectory, "working-copy.txt"), "utf8"))
      .toBe("keep the working node");
    expect(await exists(path.join(comfyRoot, "node-backups"))).toBe(false);
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
