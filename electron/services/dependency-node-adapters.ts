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

const llamaCppLogCallbackFallback = (indent: string) => [
  `${indent}try:`,
  `${indent}    from llama_cpp import llama_log_callback`,
  `${indent}except ImportError:`,
  `${indent}    from llama_cpp import ggml_log_callback as llama_log_callback`
].join("\n");

export function patchH3PromptWriterLlamaCppCompatibility(source: string): string {
  let patched = source;
  if (!source.includes("from llama_cpp import ggml_log_callback as llama_log_callback")) {
    patched = patched.replace(
      /^(\s*)from llama_cpp import llama_log_callback\r?$/gmu,
      (_match, indent: string) => llamaCppLogCallbackFallback(indent)
    );
  }
  return patched
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
    )
    .replace(
      /^(\s*)self\.chat_handler\._exit_stack\.close\(\)$/gmu,
      (_match, indent: string) => [
        `${indent}chat_handler = self.chat_handler`,
        `${indent}if chat_handler is not None:`,
        `${indent}    exit_stack = getattr(chat_handler, "_exit_stack", None)`,
        `${indent}    if exit_stack is not None:`,
        `${indent}        exit_stack.close()`
      ].join("\n")
    );
}

export function patchH3PromptWriterGemmaChatHandler(source: string): string {
  let patched = source;
  if (!patched.includes("Gemma4ChatHandler")) {
    patched = patched.replace(
      /(^[ \t]*)from llama_cpp\.llama_chat_format import MTMDChatHandler\r?\n\r?\n\1self\.chat_handler = MTMDChatHandler\(\r?\n\1    clip_model_path=model_info\["projector"\],\r?\n\1    verbose=False,\r?\n\1    use_gpu=True,\r?\n\1\)/mu,
      (_match, indent: string) => [
        `${indent}from llama_cpp.llama_chat_format import Gemma4ChatHandler, MTMDChatHandler`,
        "",
        `${indent}if model_info.get("architecture_adapter") == "gemma":`,
        `${indent}    self.chat_handler = Gemma4ChatHandler(`,
        `${indent}        clip_model_path=model_info["projector"],`,
        `${indent}        verbose=False,`,
        `${indent}        use_gpu=True,`,
        `${indent}        enable_thinking=False,`,
        `${indent}    )`,
        `${indent}else:`,
        `${indent}    self.chat_handler = MTMDChatHandler(`,
        `${indent}        clip_model_path=model_info["projector"],`,
        `${indent}        verbose=False,`,
        `${indent}        use_gpu=True,`,
        `${indent}    )`
      ].join("\n")
    );
  }
  if (!patched.includes("self.chat_handler.enable_thinking =")) {
    patched = patched.replace(
      /^(\s*)self\.chat_handler\.verbose = False\r?\n/mu,
      (_match, indent: string) => [
        `${indent}self.chat_handler.verbose = False`,
        `${indent}if model_info.get("architecture_adapter") == "gemma":`,
        `${indent}    self.chat_handler.enable_thinking = (`,
        `${indent}        thinking and model_info.get("template_controls", {}).get("enable_thinking") is True`,
        `${indent}    )`
      ].join("\n")
    );
  }
  return patched;
}

export function patchH3PromptWriterBriefLimit(source: string): string {
  let patched = source.replace(
    /(^def _validated_generation_context\([\s\S]*?^\s*)if len\(brief\) > 2000:\r?\n(\s*)raise AssemblyError\("BRIEF_TOO_LONG", "Creative brief cannot exceed 2,000 characters\."\)/mu,
    (_match, prefix: string, indent: string) =>
      `${prefix}if len(brief) > 20_000:\n${indent}raise AssemblyError("BRIEF_TOO_LONG", "Creative brief cannot exceed 20,000 characters.")`
  );
  patched = patched.replace(
    /(^[ \t]*brief = _required_text\(body, "creative_brief", "Creative brief"\)\r?\n)([ \t]*)if len\(brief\) > 2000:\r?\n([ \t]*)raise AssemblyError\("BRIEF_TOO_LONG", "Creative brief cannot exceed 2,000 characters\."\)/mu,
    (_match, briefLine: string, checkIndent: string, raiseIndent: string) =>
      `${briefLine}${checkIndent}if len(brief) > 20_000:\n${raiseIndent}raise AssemblyError("BRIEF_TOO_LONG", "Creative brief cannot exceed 20,000 characters.")`
  );
  if (
    source.includes("def _validated_generation_context") &&
    /(^def _validated_generation_context[\s\S]*?^\s*)if len\(brief\) > 2000:\r?\n\s*raise AssemblyError\("BRIEF_TOO_LONG", "Creative brief cannot exceed 2,000 characters\."\)/mu.test(patched)
  ) {
    throw new Error(
      "MiniMax H3 Prompt Writer 的 creative brief 校验结构不兼容，已停止修改以避免绕过错误的长度限制。"
    );
  }
  if (
    source.includes('brief = _required_text(body, "creative_brief", "Creative brief")') &&
    /brief = _required_text\(body, "creative_brief", "Creative brief"\)[\s\S]*?if len\(brief\) > 2000:\r?\n\s*raise AssemblyError\("BRIEF_TOO_LONG", "Creative brief cannot exceed 2,000 characters\."\)/u.test(patched)
  ) {
    throw new Error(
      "MiniMax H3 Prompt Writer 的 assemble_request creative brief 校验结构不兼容，已停止修改以避免绕过错误的长度限制。"
    );
  }
  return patched;
}

/** Normalize older Writer releases and earlier app patches to the upstream
 * 0.4.1 non-Thinking budget. Gemma completion is owned by its native chat
 * handler; increasing this limit only consumes context when stop tokens fail.
 */
export function patchH3PromptWriterOutputBudget(source: string): string {
  return source
    .replace(
      /^(\s*STANDARD_OUTPUT_TOKENS\s*=\s*)(?:1_?536|2_?048|3_?584|4_?096)\b/gmu,
      (_match, prefix: string) => `${prefix}2_048`
    )
    .replace(
      /^(\s*(?:MAX_OUTPUT_TOKENS|max_output_tokens)\s*[:=]\s*)(?:1_?536|2_?048|3_?584|4_?096)\b/gmu,
      (_match, prefix: string) => `${prefix}2_048`
    )
    .replace(
      /(\bmax_tokens\s*=\s*)(?:1_?536|2_?048|3_?584|4_?096)\b/gu,
      (_match, prefix: string) => `${prefix}2_048`
    );
}

/** Let the writer promote Auto from Standard to Extended when the complete
 * input/output budget does not fit 16K. Its runtime memory preflight still
 * rejects profiles that do not fit the currently available VRAM.
 */
export function patchH3PromptWriterAutomaticContextLadder(source: string): string {
  return source.replace(
    /^(\s*"auto_context_ladder"\s*:\s*)(?:True|False|qwen_context)\s*,/gmu,
    (_match, prefix: string) => `${prefix}True,`
  );
}

export function patchH3PromptWriterBatchSize(source: string): string {
  return source.replace(
    /^(\s*"n_batch"\s*:\s*)512\b/gmu,
    (_match, prefix: string) => `${prefix}256`
  );
}

export function patchH3PromptWriterSource(source: string): string {
  return patchH3PromptWriterAutomaticContextLadder(
    patchH3PromptWriterOutputBudget(
      patchH3PromptWriterBatchSize(
        patchH3PromptWriterBriefLimit(
          patchH3PromptWriterGemmaChatHandler(
            patchH3PromptWriterLlamaCppCompatibility(source)
          )
        )
      )
    )
  );
}

export function patchMultimodalPromptContextSize(source: string): string {
  return source.replace(/n_ctx: int = 4096/gu, "n_ctx: int = 8192");
}

function multimodalQwen35Method(source: string): string {
  const methodMatch = /^([\t ]+)def _infer_is_qwen35\([^\r\n]*\)[^\r\n:]*:/mu.exec(source);
  if (!methodMatch || methodMatch.index === undefined) return "";
  const start = methodMatch.index;
  const indent = methodMatch[1];
  const remainder = source.slice(start + methodMatch[0].length);
  const nextMethod = new RegExp(`^${indent}def `, "mu").exec(remainder);
  const end = nextMethod?.index === undefined
    ? source.length
    : start + methodMatch[0].length + nextMethod.index;
  return source.slice(start, end);
}

export function multimodalPromptRecognizesQwen38(source: string): boolean {
  const method = multimodalQwen35Method(source);
  return /["']qwen38["']/u.test(method) && /["']qwen3\.8["']/u.test(method);
}

export function patchMultimodalPromptQwen38Recognition(source: string): string {
  let patched = source;
  if (
    patched.includes("def _infer_is_qwen35") &&
    !multimodalPromptRecognizesQwen38(patched)
  ) {
    patched = patched.replace(
      '("qwen35" in model_name_lower) or ("qwen3.5" in model_name_lower) or ("qwen36" in model_name_lower) or ("qwen3.6" in model_name_lower)',
      '("qwen35" in model_name_lower) or ("qwen3.5" in model_name_lower) or ("qwen36" in model_name_lower) or ("qwen3.6" in model_name_lower) or ("qwen38" in model_name_lower) or ("qwen3.8" in model_name_lower)'
    );
    if (!multimodalPromptRecognizesQwen38(patched)) {
      throw new Error("MultiModal Prompt Nodes 无法添加 Qwen3.8 架构识别，已停止修改。");
    }
  }
  if (patched.includes('families = ["qwen2"')) {
    patched = patched.replace(
      '"qwen36", "qwen3.6"]',
      '"qwen36", "qwen3.6", "qwen38", "qwen3.8"]'
    );
    if (!patched.includes('"qwen38", "qwen3.8"]')) {
      throw new Error("MultiModal Prompt Nodes 无法添加 Qwen3.8 mmproj 自动识别，已停止修改。");
    }
  }
  if (patched.includes('if f.startswith("mmproj-") and f.endswith(".gguf")')) {
    patched = patched.replace(
      'if f.startswith("mmproj-") and f.endswith(".gguf")',
      'if (f.startswith("mmproj-") or "-vision-" in f.lower()) and f.endswith(".gguf")'
    );
  }
  return patched;
}

export function patchMultimodalPromptProjectorDiscovery(source: string): string {
  if (source.includes("def _is_mmproj_filename(")) return source;
  const marker = "def discover_local_gguf_models(";
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error("MultiModal Prompt Nodes 缺少本地 GGUF 扫描器，无法添加 vision 投影文件兼容。");
  }
  const helper = [
    "def _is_mmproj_filename(file_name: str) -> bool:",
    "    lower = file_name.lower()",
    "    return lower.startswith(\"mmproj\") or (\"-vision-\" in lower and lower.endswith(\".gguf\"))",
    "",
    ""
  ].join("\n");
  const withHelper = `${source.slice(0, markerIndex)}${helper}${source.slice(markerIndex)}`;
  const patched = withHelper.replace(
    /file_name\.startswith\("mmproj"\)/gu,
    "_is_mmproj_filename(file_name)"
  );
  const occurrences = patched.match(/_is_mmproj_filename\(file_name\)/gu)?.length ?? 0;
  if (occurrences < 2) {
    throw new Error("MultiModal Prompt Nodes 的模型/mmproj 扫描结构不兼容，已停止修改。");
  }
  return patched;
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

export function qwenVlNeedsCooperativeInterrupt(source: string): boolean {
  return source.includes("class QwenVLCaption") &&
    (!source.includes("class _LvsComfyInterruptStoppingCriteria(StoppingCriteria):") ||
      !source.includes("stopping_criteria=_lvs_stopping_criteria"));
}

export function patchQwenVlCooperativeInterrupt(source: string): string {
  const marker = "class _LvsComfyInterruptStoppingCriteria(StoppingCriteria):";
  if (source.includes(marker) && source.includes("stopping_criteria=_lvs_stopping_criteria")) {
    return source;
  }
  if (!source.includes("class QwenVLCaption") || !source.includes("generated_ids = m.generate(**inputs, max_new_tokens=max_new_tokens)")) {
    throw new Error("ComfyUI Qwen-VL LoRA 源码结构与协作式中断适配不匹配，已停止修改。");
  }
  const importMarker = "import folder_paths";
  const importIndex = source.indexOf(importMarker);
  if (importIndex < 0) {
    throw new Error("ComfyUI Qwen-VL LoRA 源码缺少 folder_paths 导入，无法添加协作式中断。");
  }
  const importEnd = source.indexOf("\n", importIndex);
  const insertAt = importEnd >= 0 ? importEnd + 1 : source.length;
  const helper = [
    "from transformers import StoppingCriteria, StoppingCriteriaList",
    "import comfy.model_management as comfy_model_management",
    "",
    marker,
    "    def __call__(self, input_ids, scores, **kwargs):",
    "        comfy_model_management.throw_exception_if_processing_interrupted()",
    "        return False",
    "",
    "_lvs_stopping_criteria = StoppingCriteriaList([_LvsComfyInterruptStoppingCriteria()])",
    "",
    ""
  ].join("\n");
  let patched = `${source.slice(0, insertAt)}${helper}${source.slice(insertAt)}`;
  patched = patched.replace(
    "generated_ids = m.generate(**inputs, max_new_tokens=max_new_tokens)",
    "generated_ids = m.generate(**inputs, max_new_tokens=max_new_tokens, stopping_criteria=_lvs_stopping_criteria)"
  );
  if (!patched.includes(marker) || !patched.includes("stopping_criteria=_lvs_stopping_criteria")) {
    throw new Error("ComfyUI Qwen-VL LoRA 协作式中断适配未能完整应用。");
  }
  return patched;
}

export async function prepareQwenVlComfyDesktopLogging(
  targetDirectory: string,
  report: (message: string) => void
): Promise<void> {
  const filename = path.join(targetDirectory, "nodes.py");
  const source = await fs.readFile(filename, "utf8");
  const patched = patchQwenVlCooperativeInterrupt(
    patchQwenVlComfyDesktopLogging(source)
  );
  if (patched !== source) {
    await fs.writeFile(filename, patched, "utf8");
    report("已为 Qwen-VL LoRA 节点应用 Desktop 日志兼容层与协作式任务中断");
  } else {
    report("Qwen-VL LoRA 节点已包含 Desktop 日志兼容层与协作式任务中断");
  }
}

export async function prepareMultimodalPromptNodes(
  targetDirectory: string,
  report: (message: string) => void
): Promise<void> {
  const filename = path.join(targetDirectory, "vision_llm_node.py");
  const discoveryFilename = path.join(targetDirectory, "local_gguf_utils.py");
  const [source, discoverySource] = await Promise.all([
    fs.readFile(filename, "utf8"),
    fs.readFile(discoveryFilename, "utf8")
  ]);
  const patched = patchMultimodalPromptResidency(
    patchMultimodalPromptQwen38Recognition(
      patchMultimodalPromptContextSize(source)
    )
  );
  const patchedDiscovery = patchMultimodalPromptProjectorDiscovery(discoverySource);
  const occurrences = patched.match(/n_ctx: int = 8192/gu)?.length ?? 0;
  if (occurrences < 2 || patched.includes("n_ctx: int = 4096")) {
    throw new Error(
      "MultiModal Prompt Nodes 源码结构与 8K 上下文适配不匹配，已停止修改。"
    );
  }
  if (patched !== source || patchedDiscovery !== discoverySource) {
    await Promise.all([
      patched !== source ? fs.writeFile(filename, patched, "utf8") : Promise.resolve(),
      patchedDiscovery !== discoverySource
        ? fs.writeFile(discoveryFilename, patchedDiscovery, "utf8")
        : Promise.resolve()
    ]);
    report("已为 MultiModal Prompt Nodes 应用 8K 上下文、模型驻留及 Qwen3.8 vision 投影兼容");
  } else {
    report("MultiModal Prompt Nodes 已使用 8K 上下文并支持显式驻留/卸载与 Qwen3.8 vision 投影");
  }
}

function hasLegacyLlamaKvImport(source: string): boolean {
  return /from\s+llama_cpp(?:\._ggml)?\s+import[^\r\n]*\bGGML_TYPE_(?:F16|Q8_0)\b/u.test(source);
}

function hasLlamaKvCompatibilityShim(source: string): boolean {
  return source.includes("from llama_cpp._ggml import GGMLType") &&
    /GGML_TYPE_F16\s*=\s*GGMLType\.GGML_TYPE_F16(?:\.value)?/u.test(source) &&
    /GGML_TYPE_Q8_0\s*=\s*GGMLType\.GGML_TYPE_Q8_0(?:\.value)?/u.test(source);
}

export async function prepareH3PromptWriter(
  targetDirectory: string,
  report: (message: string) => void
): Promise<void> {
  // 0.3.x releases have used both the flat GGUF adapter path and the older
  // nested path shown by ComfyUI-MiniMaxH3-Prompt-Writer logs.  The context
  // and pipeline files are optional because their names changed between
  // releases; patch them when present and keep the backend itself required.
  const backendCandidates = [
    path.join(targetDirectory, "backend", "models", "gguf_backend.py"),
    path.join(targetDirectory, "backend", "models", "gguf", "_backend.py")
  ];
  let backendFilename: string | null = null;
  for (const candidate of backendCandidates) {
    if (await fs.access(candidate).then(() => true).catch(() => false)) {
      backendFilename = candidate;
      break;
    }
  }
  if (!backendFilename) {
    throw new Error(
      "MiniMax H3 Prompt Writer 缺少可识别的 GGUF 后端（支持 backend/models/gguf_backend.py 或 backend/models/gguf/_backend.py）。"
    );
  }
  const files: Array<{ filename: string; required: boolean; reportMissing?: boolean }> = [
    { filename: backendFilename, required: true },
    { filename: path.join(targetDirectory, "backend", "assembly.py"), required: false },
    { filename: path.join(targetDirectory, "backend", "catalog.py"), required: false },
    { filename: path.join(targetDirectory, "backend", "context.py"), required: false },
    { filename: path.join(targetDirectory, "backend", "h3_pipeline.py"), required: false },
    {
      filename: path.join(targetDirectory, "backend", "runtime_diagnostics.py"),
      required: false,
      reportMissing: true
    }
  ];
  let changed = false;
  let patchedFiles = 0;
  for (const { filename, required, reportMissing } of files) {
    const source = await fs.readFile(filename, "utf8").catch((error) => {
      if (required) throw error;
      if (reportMissing) {
        report("H3 Prompt Writer 未提供独立运行时诊断文件，跳过兼容补丁（不影响生成接口）");
      }
      return null;
    });
    if (source === null) continue;
    const patched = patchH3PromptWriterSource(source);
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
      ? `已为 ${patchedFiles} 个 H3 Prompt Writer 文件应用 llama-cpp-python、Gemma 模板、上下文与批处理兼容层`
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
