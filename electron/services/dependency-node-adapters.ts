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
    );
}

export async function prepareH3PromptWriter(
  targetDirectory: string,
  report: (message: string) => void
): Promise<void> {
  const files = [
    path.join(targetDirectory, "backend", "models", "gguf_backend.py"),
    path.join(targetDirectory, "backend", "runtime_diagnostics.py")
  ];
  let changed = false;
  for (const filename of files) {
    const source = await fs.readFile(filename, "utf8");
    const patched = patchH3PromptWriterLlamaCppCompatibility(source);
    if (
      patched.includes("from llama_cpp import GGML_TYPE_F16, GGML_TYPE_Q8_0, Llama")
    ) {
      throw new Error(
        "MiniMax H3 Prompt Writer 源码结构与 llama-cpp-python 兼容适配不匹配，已停止修改。"
      );
    }
    if (!patched.includes("from llama_cpp._ggml import GGMLType")) {
      throw new Error(
        "MiniMax H3 Prompt Writer 未包含新版 llama-cpp-python KV 类型回退，已停止修改。"
      );
    }
    if (patched !== source) {
      await fs.writeFile(filename, patched, "utf8");
      changed = true;
    }
  }
  report(
    changed
      ? "已应用 llama-cpp-python 0.3.39+ KV 类型兼容层"
      : "H3 Prompt Writer 已兼容当前 llama-cpp-python API"
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
