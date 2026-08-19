import { promises as fs } from "node:fs";
import path from "node:path";
import {
  ltxAudioVaeCompatible,
  videoHelperBatchCompatible
} from "./dependency-compatibility.js";

export function patchVideoHelperBatchCompatibility(
  utilsSource: string,
  nodesSource: string,
  loadVideoSource: string
): { utilsSource: string; nodesSource: string; loadVideoSource: string } {
  let patchedUtils = utilsSource;
  if (!patchedUtils.includes("if len(value) == 6")) {
    patchedUtils = patchedUtils
      .replace(
        "    (_, _, prompt, extra_data, outputs_to_execute) = next(iter(currently_running.values()))",
        "    value = next(iter(currently_running.values()))\n    if len(value) == 6:\n        (_, prompt_id, prompt, extra_data, outputs_to_execute, _) = value\n    else:\n        (_, prompt_id, prompt, extra_data, outputs_to_execute) = value"
      )
      .replace(
        "    prompt_queue.put((number, prompt_id, prompt, extra_data, outputs_to_execute))",
        "    sensitive = value[5] if len(value) > 5 else {}\n    prompt_queue.put((number, prompt_id, prompt, extra_data, outputs_to_execute, sensitive))"
      )
      .replace(
        "    (run_number, _, prompt, _, _) = next(iter(prompt_queue.currently_running.values()))",
        "    value = next(iter(prompt_queue.currently_running.values()))\n    if len(value) == 6:\n        (run_number, _, prompt, extra_data, outputs_to_execute, _) = value\n    else:\n        (run_number, _, prompt, extra_data, outputs_to_execute) = value"
      );
  }
  let patchedNodes = nodesSource;
  if (!patchedNodes.includes("batch_manager_states = {}")) {
    patchedNodes = patchedNodes.replace(
      /(^|\r?\n)class BatchManager:/,
      "$1batch_manager_states = {}\n\nclass BatchManager:"
    );
  }
  if (!patchedNodes.includes("frames_per_batch = int(frames_per_batch)")) {
    patchedNodes = patchedNodes.replace(
      /(    def update_batch\(self, frames_per_batch, prompt=None, unique_id=None\):\r?\n)(        if unique_id is not None and prompt is not None:)/,
      "$1        frames_per_batch = int(frames_per_batch)\n$2"
    );
  }
  patchedNodes = patchedNodes.replace(
    /(        frames_per_batch = int\(frames_per_batch\)\r?\n)        self\.frames_per_batch = frames_per_batch\r?\n/,
    "$1"
  );
  if (!patchedNodes.includes("batch_manager_states.get(self.unique_id) is self")) {
    patchedNodes = patchedNodes.replace(
      /(    def reset\(self\):\r?\n)(        self\.close_inputs\(\))/,
      "$1        if self.unique_id is not None and batch_manager_states.get(self.unique_id) is self:\n            batch_manager_states.pop(self.unique_id, None)\n$2"
    );
  }
  if (!patchedNodes.includes("batch_manager_states[unique_id] = self")) {
    patchedNodes = patchedNodes.replace(
      /(            self\.unique_id = unique_id\r?\n)(        else:\r?\n)/,
      "$1            batch_manager_states[unique_id] = self\n$2            if unique_id not in batch_manager_states:\n                raise RuntimeError(\"Meta-Batch state was lost before the workflow completed\")\n            self = batch_manager_states[unique_id]\n            self.frames_per_batch = frames_per_batch\n"
    );
  }
  if (!patchedNodes.includes("previous = batch_manager_states.pop(unique_id, None)")) {
    patchedNodes = patchedNodes.replace(
      /(        if requeue == 0:\r?\n)(            self\.reset\(\))/,
      "$1            previous = batch_manager_states.pop(unique_id, None)\n            if previous is not None and previous is not self:\n                previous.reset()\n$2"
    );
  }
  let patchedLoadVideo = loadVideoSource;
  if (
    !patchedLoadVideo.includes(
      "meta_batch.frames_per_batch = int(meta_batch.frames_per_batch)"
    )
  ) {
    patchedLoadVideo = patchedLoadVideo.replace(
      /(    if meta_batch is not None:\r?\n)(        if 'frames' in format:)/,
      "$1        meta_batch.frames_per_batch = int(meta_batch.frames_per_batch)\n$2"
    );
  }
  patchedLoadVideo = patchedLoadVideo.replace(
    "gen = itertools.islice(gen, meta_batch.frames_per_batch)",
    "gen = itertools.islice(gen, int(meta_batch.frames_per_batch))"
  );
  if (!videoHelperBatchCompatible(patchedUtils, patchedNodes, patchedLoadVideo)) {
    throw new Error(
      "VideoHelperSuite 源码结构与兼容补丁不匹配，已停止安装以避免损坏节点。"
    );
  }
  return {
    utilsSource: patchedUtils,
    nodesSource: patchedNodes,
    loadVideoSource: patchedLoadVideo
  };
}

export function patchLtxAudioVaeCompatibility(source: string): string {
  if (!source.includes("audio_vae = AudioVAE(sd, metadata)")) return source;
  const patched = source
    .replace(
      "from comfy.ldm.lightricks.vae.audio_vae import AudioVAE",
      "from comfy.sd import VAE"
    )
    .replace(
      "        audio_vae = AudioVAE(sd, metadata)",
      [
        "        sd_audio = comfy.utils.state_dict_prefix_replace(",
        '            dict(sd), {"audio_vae.": "autoencoder.", "vocoder.": "vocoder."}, filter_keys=True',
        "        )",
        "        audio_vae = VAE(sd=sd_audio, metadata=metadata)",
        "        audio_vae.throw_exception_if_invalid()"
      ].join("\n")
    );
  if (!ltxAudioVaeCompatible(patched)) {
    throw new Error(
      "ComfyUI-LTXVideo 源码结构与 AudioVAE 兼容补丁不匹配，已停止修改以避免损坏节点。"
    );
  }
  return patched;
}

const llamaCppKvTypeFallback = (indent: string) => [
  `${indent}try:`,
  `${indent}    from llama_cpp import GGML_TYPE_F16, GGML_TYPE_Q8_0`,
  `${indent}except ImportError:`,
  `${indent}    from llama_cpp._ggml import GGMLType`,
  `${indent}    GGML_TYPE_F16 = GGMLType.GGML_TYPE_F16`,
  `${indent}    GGML_TYPE_Q8_0 = GGMLType.GGML_TYPE_Q8_0`
].join("\n");

export function patchH3PromptWriterLlamaCppCompatibility(source: string): string {
  return source
    .replace(
      /^(\s*)from llama_cpp\._ggml import GGML_TYPE_F16, GGML_TYPE_Q8_0$/gmu,
      (_match, indent: string) => [
        `${indent}from llama_cpp._ggml import GGMLType`,
        `${indent}GGML_TYPE_F16 = GGMLType.GGML_TYPE_F16`,
        `${indent}GGML_TYPE_Q8_0 = GGMLType.GGML_TYPE_Q8_0`
      ].join("\n")
    )
    .replace(
      /^(\s*)from llama_cpp import GGML_TYPE_F16, GGML_TYPE_Q8_0, Llama, LogitsProcessorList$/mu,
      (_match, indent: string) => [
        `${indent}from llama_cpp import Llama, LogitsProcessorList`,
        llamaCppKvTypeFallback(indent)
      ].join("\n")
    )
    .replace(
      /^(\s*)from llama_cpp import GGML_TYPE_F16, GGML_TYPE_Q8_0, Llama$/mu,
      (_match, indent: string) => [
        `${indent}from llama_cpp import Llama`,
        llamaCppKvTypeFallback(indent)
      ].join("\n")
    )
    .replace(
      /    def unload\(self\) -> None:\r?\n        if self\.model is not None:\r?\n            self\.model\.close\(\)\r?\n        if self\.chat_handler is not None:\r?\n            self\.chat_handler\._exit_stack\.close\(\)\r?\n        self\.model = None\r?\n        self\.chat_handler = None\r?\n        self\.model_id = None\r?\n        self\.runtime_signature = None\r?\n        gc\.collect\(\)/u,
      [
        "    def unload(self) -> None:",
        "        # Llama.close() in llama-cpp-python 0.3.46+ also closes its",
        "        # chat handler. Clear ownership first and make the secondary",
        "        # handler close idempotent so cleanup cannot mask the real error.",
        "        model = self.model",
        "        chat_handler = self.chat_handler",
        "        self.model = None",
        "        self.chat_handler = None",
        "        self.model_id = None",
        "        self.runtime_signature = None",
        "        try:",
        "            if model is not None:",
        "                model.close()",
        "        finally:",
        "            if chat_handler is not None and getattr(chat_handler, \"_exit_stack\", None) is not None:",
        "                chat_handler.close()",
        "            gc.collect()"
      ].join("\n")
    );
}

export function patchMultimodalPromptContextSize(source: string): string {
  return source.replace(/n_ctx: int = 4096/gu, "n_ctx: int = 8192");
}

export function patchMultimodalPromptResidency(source: string): string {
  let patched = source;
  if (!patched.includes('"keep_model_loaded": ("BOOLEAN"')) {
    const classStart = patched.indexOf("class VisionLLMNode:");
    const classEnd = patched.indexOf("# ComfyUI Node Registration", classStart);
    if (classStart < 0 || classEnd < 0) {
      throw new Error("MultiModal Prompt Nodes 缺少 VisionLLMNode 定义，无法应用模型驻留适配。");
    }
    let nodeSource = patched.slice(classStart, classEnd);
    nodeSource = nodeSource.replace(
      /(            "optional": \{\r?\n)(                "image":)/u,
      '$1                "keep_model_loaded": ("BOOLEAN", {"default": False}),\n$2'
    );
    nodeSource = nodeSource.replace(
      "temperature: float, device: str, image=None) -> tuple:",
      "temperature: float, device: str, image=None, keep_model_loaded: bool = False) -> tuple:"
    );
    nodeSource = nodeSource.replace(
      /(        finally:\r?\n)            cleanup\(\)/u,
      "$1            if not keep_model_loaded:\n                cleanup()"
    );
    patched = `${patched.slice(0, classStart)}${nodeSource}${patched.slice(classEnd)}`;
  }
  if (!patched.includes('/local-video-studio/multimodal-prompt/unload')) {
    const marker = "import atexit";
    const markerIndex = patched.indexOf(marker);
    if (markerIndex < 0) {
      throw new Error("MultiModal Prompt Nodes 缺少退出清理注册点，无法添加显式卸载接口。");
    }
    const route = [
      "try:",
      "    from aiohttp import web as _lvs_web",
      "    from server import PromptServer as _LvsPromptServer",
      "",
      "    @_LvsPromptServer.instance.routes.post(\"/local-video-studio/multimodal-prompt/unload\")",
      "    async def _lvs_unload_multimodal_prompt(_request):",
      "        cleanup()",
      "        return _lvs_web.json_response({\"unload_requested\": True})",
      "except ImportError:",
      "    pass",
      "",
      ""
    ].join("\n");
    patched = `${patched.slice(0, markerIndex)}${route}${patched.slice(markerIndex)}`;
  }
  if (
    !patched.includes('"keep_model_loaded": ("BOOLEAN"') ||
    !patched.includes("if not keep_model_loaded:") ||
    !patched.includes('/local-video-studio/multimodal-prompt/unload')
  ) {
    throw new Error("MultiModal Prompt Nodes 源码结构与模型驻留适配不匹配，已停止修改。");
  }
  return patched;
}

/**
 * ComfyUI Desktop can close stdout/stderr file descriptors after its embedded
 * console is detached. Protect both the node's bare ``print`` calls and
 * third-party model-loading progress writers while preserving healthy streams.
 */
export function qwenVlNeedsComfyDesktopLoggingShim(source: string): boolean {
  if (!source.includes("class QwenVLModelLoader")) return false;
  return /^[\t ]*print[\t ]*\(/mu.test(source) ||
    !source.includes("def _qwenvl_prepare_console_streams(") ||
    !source.includes("            stream.flush()") ||
    !/^[\t ]{8}_qwenvl_prepare_console_streams\(\)\r?$/mu.test(source);
}

export function patchQwenVlComfyDesktopLogging(source: string): string {
  if (!qwenVlNeedsComfyDesktopLoggingShim(source)) {
    return source;
  }
  // Rewrite only calls that start a Python statement. This avoids touching
  // strings/comments and keeps the helper's builtins.print implementation
  // untouched when the patch is checked or applied more than once.
  let replaced = source.replace(/(^|\r?\n)([\t ]*)print[\t ]*\(/gmu, "$1$2_qwenvl_log(");
  const marker = "import folder_paths";
  const markerIndex = replaced.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error(
      "ComfyUI Qwen-VL LoRA 源码缺少 folder_paths 导入，已停止应用 Desktop 日志兼容层。"
    );
  }
  const lineEnd = replaced.indexOf("\n", markerIndex);
  const insertAt = lineEnd >= 0 ? lineEnd + 1 : replaced.length;
  const helpers: string[] = [];
  if (!replaced.includes("def _qwenvl_prepare_console_streams(")) {
    helpers.push(
      "",
      "def _qwenvl_prepare_console_streams():",
      "    import os",
      "    import sys",
      "    for stream_name in (\"stdout\", \"stderr\"):",
      "        stream = getattr(sys, stream_name, None)",
      "        try:",
      "            if stream is None:",
      "                raise OSError(9, \"Bad file descriptor\")",
      "            os.fstat(stream.fileno())",
      "            stream.flush()",
      "        except (OSError, ValueError, AttributeError):",
      "            setattr(sys, stream_name, open(os.devnull, \"w\", encoding=\"utf-8\"))",
      ""
    );
  }
  if (!replaced.includes("def _qwenvl_log(")) {
    helpers.push(
      "def _qwenvl_log(*args, **kwargs):",
      "    try:",
      "        import builtins",
      "        builtins.print(*args, **kwargs)",
      "    except OSError as exc:",
      "        if getattr(exc, \"errno\", None) != 9:",
      "            raise",
      ""
    );
  }
  if (helpers.length > 0) {
    replaced = `${replaced.slice(0, insertAt)}${helpers.join("\n")}${replaced.slice(insertAt)}`;
  }
  if (!replaced.includes("            stream.flush()")) {
    replaced = replaced.replace(
      /(def _qwenvl_prepare_console_streams\(\):[\s\S]*?^[\t ]{12}os\.fstat\(stream\.fileno\(\)\)\r?\n)/mu,
      "$1            stream.flush()\n"
    );
  }
  if (!/^[\t ]{8}_qwenvl_prepare_console_streams\(\)\r?$/mu.test(replaced)) {
    replaced = replaced.replace(
      /(class QwenVLModelLoader:[\s\S]*?\n    def load\([^\n]*\):\r?\n)/u,
      "$1        _qwenvl_prepare_console_streams()\n"
    );
  }
  if (!/^[\t ]{8}_qwenvl_prepare_console_streams\(\)\r?$/mu.test(replaced)) {
    throw new Error(
      "ComfyUI Qwen-VL LoRA 源码结构与 Desktop 日志兼容层不匹配，已停止修改。"
    );
  }
  if (!replaced.includes("            stream.flush()")) {
    throw new Error(
      "ComfyUI Qwen-VL LoRA 的 Desktop 日志兼容层无法升级 flush 检查，已停止修改。"
    );
  }
  return replaced;
}

export async function prepareQwenVlComfyDesktopLogging(
  targetDirectory: string,
  report: (message: string) => void
): Promise<void> {
  const filename = path.join(targetDirectory, "nodes.py");
  const source = await fs.readFile(filename, "utf8");
  const patched = patchQwenVlComfyDesktopLogging(source);
  if (patched !== source) {
    await fs.writeFile(filename, patched, "utf8");
    report("已为 Qwen-VL LoRA 节点应用 ComfyUI Desktop Bad file descriptor 兼容层");
  } else {
    report("Qwen-VL LoRA 节点已包含 ComfyUI Desktop 日志兼容层");
  }
}

export async function prepareMultimodalPromptNodes(
  targetDirectory: string,
  report: (message: string) => void
): Promise<void> {
  const filename = path.join(targetDirectory, "vision_llm_node.py");
  const source = await fs.readFile(filename, "utf8");
  const patched = patchMultimodalPromptResidency(
    patchMultimodalPromptContextSize(source)
  );
  const occurrences = patched.match(/n_ctx: int = 8192/gu)?.length ?? 0;
  if (occurrences < 2 || patched.includes("n_ctx: int = 4096")) {
    throw new Error(
      "MultiModal Prompt Nodes 源码结构与 8K 上下文适配不匹配，已停止修改。"
    );
  }
  if (patched !== source) {
    await fs.writeFile(filename, patched, "utf8");
    report("已为 MultiModal Prompt Nodes 应用 8K 上下文与提示词模型驻留适配");
  } else {
    report("MultiModal Prompt Nodes 已使用 8K 上下文并支持显式驻留/卸载");
  }
}

function hasLegacyLlamaKvImport(source: string): boolean {
  return /from\s+llama_cpp(?:\._ggml)?\s+import[^\r\n]*\bGGML_TYPE_(?:F16|Q8_0)\b/u.test(source);
}

function hasLlamaKvCompatibilityShim(source: string): boolean {
  return source.includes("from llama_cpp._ggml import GGMLType") &&
    source.includes("GGML_TYPE_F16 = GGMLType.GGML_TYPE_F16") &&
    source.includes("GGML_TYPE_Q8_0 = GGMLType.GGML_TYPE_Q8_0");
}

export async function prepareH3PromptWriter(
  targetDirectory: string,
  report: (message: string) => void
): Promise<void> {
  // The 0.3.x extension keeps the GGUF adapter in this location, while the
  // diagnostics module no longer imports GGML KV constants at all.  Treat the
  // latter as optional and only patch files that actually contain the legacy
  // import; requiring the shim in every file made a 0.3.2 update fail before
  // Python dependencies were even checked.
  const files = [
    { filename: path.join(targetDirectory, "backend", "models", "gguf_backend.py"), required: true },
    { filename: path.join(targetDirectory, "backend", "runtime_diagnostics.py"), required: false }
  ];
  let changed = false;
  let patchedFiles = 0;
  for (const { filename, required } of files) {
    const source = await fs.readFile(filename, "utf8").catch((error) => {
      if (required) throw error;
      report("H3 Prompt Writer 未提供独立运行时诊断文件，跳过兼容补丁（不影响生成接口）");
      return null;
    });
    if (source === null) continue;
    const patched = patchH3PromptWriterLlamaCppCompatibility(source);
    if (hasLegacyLlamaKvImport(patched) && !hasLlamaKvCompatibilityShim(patched)) {
      throw new Error(
        "MiniMax H3 Prompt Writer 源码结构与 llama-cpp-python 兼容适配不匹配，已停止修改。"
      );
    }
    if (hasLegacyLlamaKvImport(source) && !hasLlamaKvCompatibilityShim(patched)) {
      throw new Error(
        "MiniMax H3 Prompt Writer 未包含新版 llama-cpp-python KV 类型回退，已停止修改。"
      );
    }
    if (patched.includes("self.chat_handler._exit_stack.close()")) {
      throw new Error(
        "MiniMax H3 Prompt Writer 未能应用 llama-cpp-python 0.3.46 资源清理适配，已停止修改。"
      );
    }
    if (patched !== source) {
      await fs.writeFile(filename, patched, "utf8");
      changed = true;
      patchedFiles += 1;
    }
  }
  report(
    changed
      ? `已为 ${patchedFiles} 个 H3 Prompt Writer 文件应用 llama-cpp-python 0.3.39+ KV 类型兼容层`
      : "H3 Prompt Writer 已兼容当前 llama-cpp-python API（无需修改上游源码）"
  );
}

const h3GgufInitSource = `WEB_DIRECTORY = "./web"

try:
    import comfy.utils
except ImportError:
    pass
else:
    from .nodes import NODE_CLASS_MAPPINGS as _NODE_CLASS_MAPPINGS
    NODE_CLASS_MAPPINGS = {
        "H3UnetLoaderGGUFAdvanced": _NODE_CLASS_MAPPINGS["UnetLoaderGGUFAdvanced"],
        "H3CLIPLoaderGGUF": _NODE_CLASS_MAPPINGS["CLIPLoaderGGUF"],
    }
    NODE_DISPLAY_NAME_MAPPINGS = {
        key: value.TITLE for key, value in NODE_CLASS_MAPPINGS.items()
    }
    __all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
`;

export async function prepareH3Gguf(
  targetDirectory: string,
  report: (message: string) => void
): Promise<void> {
  const nodesPath = path.join(targetDirectory, "nodes.py");
  const nodesSource = await fs.readFile(nodesPath, "utf8");
  if (!/["']UnetLoaderGGUFAdvanced["']/.test(nodesSource) ||
      !/["']CLIPLoaderGGUF["']/.test(nodesSource)) {
    throw new Error(
      "ComfyUI-GGUF H3 源码缺少预期 loader，已停止安装以避免覆盖通用 GGUF 节点。"
    );
  }
  await fs.writeFile(path.join(targetDirectory, "__init__.py"), h3GgufInitSource, "utf8");
  await fs.rm(path.join(targetDirectory, ".git"), {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200
  });
  report("已将 H3 GGUF loader 重命名为独立节点，保留通用 GGUF 包不变");
}

export async function prepareLtxVideo(
  targetDirectory: string,
  report: (message: string) => void
): Promise<void> {
  const loaderPath = path.join(targetDirectory, "low_vram_loaders.py");
  const source = await fs.readFile(loaderPath, "utf8");
  const patched = patchLtxAudioVaeCompatibility(source);
  if (patched !== source) {
    await fs.writeFile(loaderPath, patched, "utf8");
    report(
      "已应用 ComfyUI 0.22+ AudioVAE 加载兼容层（comfy.sd.VAE wrapper）"
    );
  } else {
    report("AudioVAE 加载接口已兼容当前 ComfyUI");
  }
}

export async function prepareVideoHelperSuite(
  targetDirectory: string,
  report: (message: string) => void
): Promise<void> {
  const utilsPath = path.join(targetDirectory, "videohelpersuite", "utils.py");
  const nodesPath = path.join(targetDirectory, "videohelpersuite", "nodes.py");
  const loadVideoPath = path.join(
    targetDirectory,
    "videohelpersuite",
    "load_video_nodes.py"
  );
  const [utilsSource, nodesSource, loadVideoSource] = await Promise.all([
    fs.readFile(utilsPath, "utf8"),
    fs.readFile(nodesPath, "utf8"),
    fs.readFile(loadVideoPath, "utf8")
  ]);
  const patched = patchVideoHelperBatchCompatibility(
    utilsSource,
    nodesSource,
    loadVideoSource
  );
  await Promise.all([
    fs.writeFile(utilsPath, patched.utilsSource, "utf8"),
    fs.writeFile(nodesPath, patched.nodesSource, "utf8"),
    fs.writeFile(loadVideoPath, patched.loadVideoSource, "utf8")
  ]);
  await fs.rm(path.join(targetDirectory, ".git"), {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200
  });
  report(
    "已应用并锁定当前 ComfyUI 分批队列兼容层；后续更新由本应用备份替换"
  );
}
