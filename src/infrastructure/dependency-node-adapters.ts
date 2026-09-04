import { promises as fs } from "node:fs";
import path from "node:path";
import {
  ltxAudioVaeCompatible,
  videoHelperBatchCompatible
} from "./dependency-compatibility.js";
import {
  DEPTH_ANYTHING_V2_SMALL_REPOSITORY
} from "../core/catalog/models/depth-anything.js";
import {
  DEPTH_ANYTHING_V2_SMALL_METADATA_RELATIVE_DIRECTORY,
  depthAnythingBuiltinMetadataFile
} from "./depth-anything-metadata.js";

function replaceRequired(source: string, before: string, after: string, label: string): string {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`MMH3 Ultimate Upscale 源码缺少 ${label}，已停止修改。`);
  }
  return source.replace(before, after);
}

const aetherScaleCarrierPatchMarker =
  "# Local Video Studio AetherScale carrier registry ownership guard";
const aetherScaleCarrierInterruptPatchMarker =
  "# Local Video Studio AetherScale carrier cooperative interrupt";
const aetherScaleCarrierWorkerStatePatchMarker =
  "# Local Video Studio AetherScale carrier worker ownership state";

export const aetherScaleCarrierPatchFiles = [
  "backend/carrier.py"
] as const;

function replaceAetherScaleRequired(
  source: string,
  before: string,
  after: string,
  label: string
): string {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`ComfyUI-AetherScale 源码缺少 ${label}，已停止修改。`);
  }
  return source.replace(before, after);
}

/**
 * Make the upstream carrier's per-user GPU preference transactional. The
 * worker is a closed native executable, so the guard records the previous
 * value before launch and restores it on both normal completion and failure.
 */
export function patchAetherScaleCarrierSource(source: string): string {
  let patched = source.replace(/\r\n?/gu, "\n");
  if (
    patched.includes(aetherScaleCarrierPatchMarker) &&
    patched.includes(aetherScaleCarrierInterruptPatchMarker) &&
    patched.includes(aetherScaleCarrierWorkerStatePatchMarker) &&
    patched.includes("_lvs_check_comfy_interrupt()") &&
    patched.includes("_lvs_write_worker_state(proc)") &&
    patched.includes("_lvs_clear_worker_state(proc.pid)")
  ) return patched;

  const registryGuard = [
    aetherScaleCarrierPatchMarker,
    "",
    "def _lvs_restore_windows_gpu_preference(info: dict[str, Any]) -> None:",
    "    if not isinstance(info, dict) or not info.get(\"applied\") or info.get(\"restored\"):",
    "        return",
    "    if os.name != \"nt\" or winreg is None:",
    "        info[\"restored\"] = True",
    "        return",
    "    worker = str(info.get(\"worker\") or \"\")",
    "    previous = info.get(\"previous\")",
    "    key_path = r\"Software\\Microsoft\\DirectX\\UserGpuPreferences\"",
    "    try:",
    "        with winreg.CreateKeyEx(",
    "            winreg.HKEY_CURRENT_USER,",
    "            key_path,",
    "            0,",
    "            winreg.KEY_SET_VALUE | winreg.KEY_QUERY_VALUE,",
    "        ) as key:",
    "            if isinstance(previous, dict) and previous.get(\"exists\"):",
    "                winreg.SetValueEx(",
    "                    key,",
    "                    worker,",
    "                    0,",
    "                    int(previous.get(\"type\", winreg.REG_SZ)),",
    "                    previous.get(\"value\", \"\"),",
    "                )",
    "            else:",
    "                try:",
    "                    winreg.DeleteValue(key, worker)",
    "                except FileNotFoundError:",
    "                    pass",
    "        info[\"restored\"] = True",
    "    except Exception as exc:",
    "        info[\"restore_error\"] = f\"{type(exc).__name__}: {exc}\"",
    "",
  ].join("\n");
  patched = replaceAetherScaleRequired(
    patched,
    "def _set_windows_gpu_preference(executable: Path, preference: str) -> dict[str, Any]:",
    `${registryGuard}\ndef _set_windows_gpu_preference(executable: Path, preference: str) -> dict[str, Any]:`,
    "registry guard insertion point"
  );

  const workerStateConstant = [
    aetherScaleCarrierWorkerStatePatchMarker,
    "CARRIER_WORKER_STATE = CARRIER_ROOT / \"carrier_process.json\"",
    "",
    "def _lvs_write_worker_state(proc: Any) -> None:",
    "    pid = int(getattr(proc, \"pid\", 0) or 0)",
    "    if pid <= 0:",
    "        raise CarrierError(\"Carrier worker did not expose a process id.\")",
    "    payload = {",
    "        \"pid\": pid,",
    "        \"parent_pid\": int(os.getpid()),",
    "        \"worker\": str(WORKER.resolve()),",
    "        \"runtime\": str(CARRIER_RUNTIME.resolve()),",
    "        \"started_at\": time.time(),",
    "    }",
    "    temporary = CARRIER_WORKER_STATE.with_name(",
    "        CARRIER_WORKER_STATE.name + f\".{os.getpid()}.partial\"",
    "    )",
    "    try:",
    "        temporary.write_text(json.dumps(payload, sort_keys=True), encoding=\"utf-8\")",
    "        temporary.replace(CARRIER_WORKER_STATE)",
    "    except Exception as exc:",
    "        try:",
    "            temporary.unlink(missing_ok=True)",
    "        except Exception:",
    "            pass",
    "        raise CarrierError(\"Unable to publish the AetherScale carrier worker ownership state.\") from exc",
    "",
    "def _lvs_clear_worker_state(pid: Any) -> None:",
    "    try:",
    "        if not CARRIER_WORKER_STATE.is_file():",
    "            return",
    "        payload = json.loads(CARRIER_WORKER_STATE.read_text(encoding=\"utf-8\"))",
    "        if int(payload.get(\"pid\", 0)) != int(pid):",
    "            return",
    "        CARRIER_WORKER_STATE.unlink(missing_ok=True)",
    "    except Exception:",
    "        pass",
    ""
  ].join("\n");
  patched = replaceAetherScaleRequired(
    patched,
    'CARRIER_MANIFEST = CARRIER_ROOT / "carrier_manifest.json"',
    `CARRIER_MANIFEST = CARRIER_ROOT / "carrier_manifest.json"\n${workerStateConstant}`,
    "worker ownership state insertion point"
  );

  const interruptHelper = [
    aetherScaleCarrierInterruptPatchMarker,
    "",
    "def _lvs_check_comfy_interrupt() -> None:",
    "    try:",
    "        import comfy.model_management as _lvs_comfy_model_management",
    "    except Exception:",
    "        return",
    "    _lvs_comfy_model_management.throw_exception_if_processing_interrupted()",
    "",
  ].join("\n");
  patched = replaceAetherScaleRequired(
    patched,
    "def process_carrier(\n",
    `${interruptHelper}def process_carrier(\n`,
    "cooperative interrupt insertion point"
  );
  patched = replaceAetherScaleRequired(
    patched,
    '        "registry_value": None,\n',
    '        "registry_value": None,\n        "previous": None,\n        "restored": False,\n',
    "registry ownership record"
  );
  patched = replaceAetherScaleRequired(
    patched,
    "            winreg.SetValueEx(\n                key,\n                str(executable.resolve()),\n",
    "            worker_path = str(executable.resolve())\n            try:\n                previous_value, previous_type = winreg.QueryValueEx(key, worker_path)\n                info[\"previous\"] = {\"exists\": True, \"value\": previous_value, \"type\": previous_type}\n            except OSError:\n                info[\"previous\"] = {\"exists\": False}\n            winreg.SetValueEx(\n                key,\n                worker_path,\n",
    "previous registry value capture"
  );

  const popenBlock = [
    "    proc = subprocess.Popen(",
    "        [str(WORKER), \"--video\"],",
    "        cwd=str(CARRIER_RUNTIME),",
    "        stdin=subprocess.PIPE,",
    "        stdout=subprocess.PIPE,",
    "        stderr=subprocess.PIPE,",
    "        creationflags=creation_flags,",
    "    )"
  ].join("\n");
  const guardedPopenBlock = [
    "    try:",
    "        proc = subprocess.Popen(",
    "            [str(WORKER), \"--video\"],",
    "            cwd=str(CARRIER_RUNTIME),",
    "            stdin=subprocess.PIPE,",
    "            stdout=subprocess.PIPE,",
    "            stderr=subprocess.PIPE,",
    "            creationflags=creation_flags,",
    "        )",
    "    except Exception:",
    "        _lvs_restore_windows_gpu_preference(gpu_routing)",
    "        raise"
  ].join("\n");
  patched = replaceAetherScaleRequired(
    patched,
    popenBlock,
    guardedPopenBlock,
    "worker process launch guard"
  );
  patched = replaceAetherScaleRequired(
    patched,
    `${guardedPopenBlock}\n    assert proc.stdin and proc.stdout and proc.stderr`,
    `${guardedPopenBlock}\n    try:\n        assert proc.stdin and proc.stdout and proc.stderr\n        _lvs_write_worker_state(proc)\n    except Exception:\n        try:\n            proc.terminate()\n        except Exception:\n            pass\n        _lvs_restore_windows_gpu_preference(gpu_routing)\n        raise`,
    "worker ownership state publication"
  );
  patched = replaceAetherScaleRequired(
    patched,
    "        for i in range(batch):\n",
    "        for i in range(batch):\n            _lvs_check_comfy_interrupt()\n",
    "per-frame cooperative interrupt"
  );
  patched = replaceAetherScaleRequired(
    patched,
    "                proc.terminate()\n                raise",
    "                proc.terminate()\n                _lvs_restore_windows_gpu_preference(gpu_routing)\n                _lvs_clear_worker_state(proc.pid)\n                raise",
    "internal motion failure cleanup"
  );
  patched = replaceAetherScaleRequired(
    patched,
    "        t.join(timeout=2)\n        if code:",
    "        t.join(timeout=2)\n        _lvs_restore_windows_gpu_preference(gpu_routing)\n        if code:",
    "normal worker completion cleanup"
  );
  patched = replaceAetherScaleRequired(
    patched,
    "        t.join(timeout=2)\n        _lvs_restore_windows_gpu_preference(gpu_routing)\n        if code:",
    "        t.join(timeout=2)\n        _lvs_restore_windows_gpu_preference(gpu_routing)\n        _lvs_clear_worker_state(proc.pid)\n        if code:",
    "normal worker ownership cleanup"
  );
  patched = replaceAetherScaleRequired(
    patched,
    "    except Exception:\n        try:\n            proc.terminate()\n        except Exception:\n            pass\n        raise",
    "    except Exception:\n        try:\n            proc.terminate()\n        except Exception:\n            pass\n        _lvs_restore_windows_gpu_preference(gpu_routing)\n        _lvs_clear_worker_state(proc.pid)\n        raise",
    "worker failure cleanup"
  );
  return patched;
}

export const dlss5DepthAnythingPatchFiles = [
  "nodes.py",
  `${DEPTH_ANYTHING_V2_SMALL_METADATA_RELATIVE_DIRECTORY}/config.json`,
  `${DEPTH_ANYTHING_V2_SMALL_METADATA_RELATIVE_DIRECTORY}/preprocessor_config.json`
] as const;

const dlss5DepthAnythingPatchMarker =
  "# Local Video Studio Depth Anything local-weight compatibility layer";

function replaceDlss5Required(
  source: string,
  before: string,
  after: string,
  label: string
): string {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`ComfyUI-DLSS5 源码缺少 ${label}，已停止修改。`);
  }
  return source.replace(before, after);
}

/**
 * Make the app-managed Small profile use one ordinary ComfyUI model weight.
 * The upstream node accepts a Hugging Face repo id and would otherwise
 * download metadata and weights lazily during queue execution. The adapter
 * keeps Base/Large behavior intact while making the catalogued Small profile
 * deterministic and offline-safe.
 */
export function patchDlss5DepthAnythingSource(source: string): string {
  let patched = source.replace(/\r\n?/gu, "\n");
  if (patched.includes(dlss5DepthAnythingPatchMarker)) return patched;

  const metadataPathExpression = DEPTH_ANYTHING_V2_SMALL_METADATA_RELATIVE_DIRECTORY
    .split("/")
    .map((part) => JSON.stringify(part))
    .join(" / ");
  const helper = [
    dlss5DepthAnythingPatchMarker,
    `_LVS_DEPTH_ANYTHING_SMALL_MODEL_ID = ${JSON.stringify(DEPTH_ANYTHING_V2_SMALL_REPOSITORY)}`,
    `_LVS_DEPTH_ANYTHING_SMALL_METADATA_DIR = PACKAGE / ${metadataPathExpression}`,
    "",
    "def _lvs_depth_anything_small_model_directory():",
    "    roots = []",
    "    try:",
    "        import folder_paths",
    "    except Exception:",
    "        folder_paths = None",
    "    if folder_paths is not None:",
    "        try:",
    "            roots.extend(Path(value) for value in folder_paths.get_folder_paths(\"depthanything\"))",
    "        except (AttributeError, KeyError, TypeError):",
    "            pass",
    "        models_dir = getattr(folder_paths, \"models_dir\", None)",
    "        if models_dir:",
    "            roots.append(Path(models_dir) / \"depthanything\")",
    "    roots.append(PROJECT.parent / \"models\" / \"depthanything\")",
    "    seen = set()",
    "    for root in roots:",
    "        candidate = root / \"Depth-Anything-V2-Small-hf\"",
    "        key = str(candidate).lower()",
    "        if key in seen:",
    "            continue",
    "        seen.add(key)",
    "        if (candidate / \"model.safetensors\").is_file():",
    "            return candidate",
    "    raise FileNotFoundError(\"Depth Anything V2 Small 权重未找到。请将 model.safetensors 放入 ComfyUI/models/depthanything/Depth-Anything-V2-Small-hf。\")",
    ""
  ].join("\n");
  patched = replaceDlss5Required(
    patched,
    "_DEPTH_CACHE = {}",
    `_DEPTH_CACHE = {}\n\n${helper}`,
    "Depth Anything 本地模型发现 helper"
  );
  patched = replaceDlss5Required(
    patched,
    "from transformers import AutoImageProcessor, AutoModelForDepthEstimation",
    "from transformers import AutoConfig, AutoImageProcessor, AutoModelForDepthEstimation",
    "Depth Anything Transformers 导入"
  );
  const before = [
    "        key = (model_id, str(device))",
    "        if key not in _DEPTH_CACHE:",
    "            processor = AutoImageProcessor.from_pretrained(model_id)",
    "            network = (",
    "                AutoModelForDepthEstimation.from_pretrained(model_id).eval().to(device)",
    "            )"
  ].join("\n");
  const after = [
    "        model_source = (",
    "            _lvs_depth_anything_small_model_directory()",
    "            if model_id == _LVS_DEPTH_ANYTHING_SMALL_MODEL_ID",
    "            else model_id",
    "        )",
    "        key = (model_id, str(model_source), str(device))",
    "        if key not in _DEPTH_CACHE:",
    "            if model_id == _LVS_DEPTH_ANYTHING_SMALL_MODEL_ID:",
    "                metadata_directory = str(_LVS_DEPTH_ANYTHING_SMALL_METADATA_DIR)",
    "                processor = AutoImageProcessor.from_pretrained(",
    "                    metadata_directory, local_files_only=True",
    "                )",
    "                config = AutoConfig.from_pretrained(",
    "                    metadata_directory, local_files_only=True",
    "                )",
    "                network = (",
    "                    AutoModelForDepthEstimation.from_pretrained(",
    "                        str(model_source),",
    "                        config=config,",
    "                        local_files_only=True,",
    "                        use_safetensors=True,",
    "                    ).eval().to(device)",
    "                )",
    "            else:",
    "                processor = AutoImageProcessor.from_pretrained(model_id)",
    "                network = (",
    "                    AutoModelForDepthEstimation.from_pretrained(model_id).eval().to(device)",
    "                )"
  ].join("\n");
  return replaceDlss5Required(
    patched,
    before,
    after,
    "Depth Anything Small 模型加载块"
  );
}

async function writeIfChanged(filename: string, contents: string): Promise<boolean> {
  const current = await fs.readFile(filename, "utf8").catch(() => null);
  if (current === contents) return false;
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, contents, "utf8");
  return true;
}

export async function prepareAetherScaleCarrier(
  targetDirectory: string,
  report: (message: string) => void
): Promise<void> {
  const carrierPath = path.join(targetDirectory, "backend", "carrier.py");
  const source = await fs.readFile(carrierPath, "utf8");
  const patched = patchAetherScaleCarrierSource(source);
  if (patched !== source) {
    await fs.writeFile(carrierPath, patched, "utf8");
    report("已为 AetherScale carrier 应用 GPU 注册表所有权回收适配");
  } else {
    report("AetherScale carrier GPU 注册表所有权回收适配已就绪");
  }
}

export async function prepareDlss5DepthAnything(
  targetDirectory: string,
  report: (message: string) => void
): Promise<void> {
  const nodesPath = path.join(targetDirectory, "nodes.py");
  const source = await fs.readFile(nodesPath, "utf8");
  const patched = patchDlss5DepthAnythingSource(source);
  const metadataDirectory = path.join(
    targetDirectory,
    ...DEPTH_ANYTHING_V2_SMALL_METADATA_RELATIVE_DIRECTORY.split("/")
  );
  const [nodesChanged, configChanged, preprocessorChanged] = await Promise.all([
    patched !== source
      ? fs.writeFile(nodesPath, patched, "utf8").then(() => true)
      : Promise.resolve(false),
    writeIfChanged(
      path.join(metadataDirectory, "config.json"),
      depthAnythingBuiltinMetadataFile("config.json")
    ),
    writeIfChanged(
      path.join(metadataDirectory, "preprocessor_config.json"),
      depthAnythingBuiltinMetadataFile("preprocessor_config.json")
    )
  ]);
  report(
    nodesChanged || configChanged || preprocessorChanged
      ? "已为 DLSS5 Depth Anything Small 应用本地 safetensors 加载适配，并写入内置 JSON 元数据"
      : "DLSS5 Depth Anything Small 本地 safetensors 适配与内置 JSON 元数据已就绪"
  );
}

export function patchMmh3UltimateUpscaleSource(source: string): string {
  let patched = source.replace(/\r\n?/gu, "\n");
  patched = replaceRequired(
    patched,
    "def sample_piece(piece, cond, model, noise, sampler, sigmas, negative, cfg):",
    "def sample_piece(piece, cond, model, noise, sampler, sigmas, negative, cfg, progress_state=None):",
    "sample_piece 函数"
  );
  patched = replaceRequired(
    patched,
    "    callback = latent_preview.prepare_callback(guider.model_patcher, sigmas.shape[-1] - 1, x0_output)",
    `    if progress_state is None:
        callback = latent_preview.prepare_callback(guider.model_patcher, sigmas.shape[-1] - 1, x0_output)
    else:
        previewer = latent_preview.get_previewer(
            guider.model_patcher.load_device,
            guider.model_patcher.model.latent_format,
        )

        def callback(step, x0, _sample, total_steps):
            x0_output["x0"] = x0
            preview_bytes = None
            if previewer:
                preview_latent = x0.tensors[0] if x0.is_nested else x0
                preview_bytes = previewer.decode_latent_to_preview_image("JPEG", preview_latent)
            piece_progress = (step + 1) / max(1, total_steps)
            progress_state["bar"].update_absolute(
                progress_state["piece"] + piece_progress,
                progress_state["total_pieces"],
                preview_bytes,
            )`,
    "sampler progress callback"
  );
  patched = replaceRequired(
    patched,
    "    samples = samples.to(comfy.model_management.intermediate_device())",
    `    if progress_state is not None:
        progress_state["piece"] += 1
    samples = samples.to(comfy.model_management.intermediate_device())`,
    "sample_piece 完成点"
  );
  patched = replaceRequired(
    patched,
    `def spatial_process(chunk_v, chunk_a, cond, sp, model, noise, sampler, sigmas, negative, cfg,
                    fun_control=None, inpaint=None):`,
    `def spatial_process(chunk_v, chunk_a, cond, sp, model, noise, sampler, sigmas, negative, cfg,
                    fun_control=None, inpaint=None, progress_state=None):`,
    "spatial_process 函数"
  );
  patched = replaceRequired(
    patched,
    "                out = sample_piece(piece, cond_tile, model, noise, sampler, sigmas, negative, cfg)",
    `                out = sample_piece(
                    piece, cond_tile, model, noise, sampler, sigmas, negative, cfg,
                    progress_state=progress_state,
                )`,
    "tile sampler 调用"
  );
  patched = replaceRequired(
    patched,
    `        segments_debug = []
        tiles_debug = []`,
    `        segments_debug = []
        tiles_debug = []

        target_h, target_w = video.shape[3], video.shape[4]
        if latent_upscale_param is not None:
            target_h, target_w, _ = _compute_upscale_target(
                latent_upscale_param["width"], latent_upscale_param["height"],
                target_h, target_w,
            )
        pieces_per_chunk = 1
        if spatial_split_param is not None:
            sp = spatial_split_param
            rows, cols, _, _, _, _ = compute_spatial_grid(
                target_h, target_w,
                int(sp["tile_height"]) // 16, int(sp["tile_width"]) // 16,
                int(sp["spatial_h_overlap"]) // 16, int(sp["spatial_w_overlap"]) // 16,
                int(sp["min_tile_size"]) // 16, int(sp["min_tile_size"]) // 16,
            )
            pieces_per_chunk = len(rows) * len(cols)
        progress_state = {
            "bar": comfy.utils.ProgressBar(len(bounds) * pieces_per_chunk),
            "piece": 0,
            "total_pieces": len(bounds) * pieces_per_chunk,
        }`,
    "aggregate progress 初始化点"
  );
  patched = replaceRequired(
    patched,
    `                    fun_control=fun_control, inpaint=inpaint_param,
                )`,
    `                    fun_control=fun_control, inpaint=inpaint_param,
                    progress_state=progress_state,
                )`,
    "spatial progress 传递点"
  );
  patched = replaceRequired(
    patched,
    "                out = sample_piece(piece, cond_i, model, noise, sampler, sigmas, negative, cfg)",
    `                out = sample_piece(
                    piece, cond_i, model, noise, sampler, sigmas, negative, cfg,
                    progress_state=progress_state,
                )`,
    "whole-chunk sampler 调用"
  );
  patched = replaceRequired(
    patched,
    `            # 3. pin frame-0 keyframe to the previous chunk's re-sampled frame
            if i > 0 and acc_v is not None:
                cond_i = anchor_conditioning(cond_i, acc_v, f0, anchor_strength)`,
    `            # 3. pin frame-0 keyframe to the latent that owns this boundary.
            # The first chunk uses its learned-upscaled source token; later chunks
            # use the previous chunk's re-sampled boundary token.
            anchor_video = acc_v if i > 0 and acc_v is not None else chunk_v
            cond_i = anchor_conditioning(cond_i, anchor_video, f0, anchor_strength)`,
    "首块 frame-0 anchor"
  );
  return patched;
}

export async function prepareMmh3UltimateUpscale(
  targetDirectory: string,
  report: (message: string) => void
): Promise<void> {
  const filename = path.join(targetDirectory, "nodes", "nodes.py");
  const source = await fs.readFile(filename, "utf8");
  const patched = patchMmh3UltimateUpscaleSource(source);
  if (patched !== source) {
    await fs.writeFile(filename, patched, "utf8");
    report("已应用 MMH3 首块 source anchor 与分块聚合进度补丁");
  } else {
    report("MMH3 首块 source anchor 与分块聚合进度补丁已就绪");
  }
}

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
      ].join("\n") + "\n"
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
