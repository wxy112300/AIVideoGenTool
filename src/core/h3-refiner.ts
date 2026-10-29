import type { UpscaleQueueTask } from "../types.js";
import { h3Fl2vaInt8Model, h3Nvfp4TextEncoder, h3Int8ConvRotVideoVae, h3Fl2vaAudioVae, h3LearnedLatentUpscaler } from "./catalog/models/minimax_h3_shared.js";

/** A ComfyUI adaptation, not the NV SoL engine or its complete LMS recipe. */
export const H3_REFINER_ID = "minimax_h3_kijai_refiner";
export const H3_REFINER_RECIPE = "kijai-r384-lightx2v-v12-tiled-v1";
export const H3_REFINER_FILENAME = "minimax_h3_open_regenerate_2k_refiner_rank_384_bf16.safetensors";
export const H3_REFINER_REVISION = "7afab6c";
export const H3_REFINER_TURBO_FILENAME = "minimax_h3_fl2v_turbo_4step_v1.2_768p_comfyui_bf16.safetensors";
export const H3_REFINER_TURBO_REVISION = "3ec17a324ced54151364f24f8b5fb6bf7e26414f";
export const H3_REFINER_TARGETS = [1080, 1440, 2160] as const;
export function h3RefinerSourceFilename(filename: string): string {
  return `${filename.replace(/\.(mp4|webm|mov|m4v|mkv)$/i, "")}-h3-refiner.mp4`;
}
export const H3_REFINER_NODES = [
  "VHS_LoadVideo", "UNETLoader", "CLIPLoader", "VAELoader",
  "LoraLoaderModelOnly", "MiniMaxH3SigmaShift", "ModelAttentionBackend",
  "MiniMaxH3ImageToVideo", "VAEEncodeTiled", "VAEEncodeAudio", "LTXVConcatAVLatent",
  "MMH3LatentUpscaleWithModelParams", "MMH3TemporalSplitParams", "MMH3SpatialSplitParams",
  "MMH3UltimateUpscale", "MinimaxH3LatentUpscaler3D", "RandomNoise", "KSamplerSelect", "LTXVSeparateAVLatent",
  "VAEDecodeTiled", "CreateVideo", "SaveVideo", "VRAM_Debug",
  "LocalVideoStudioH3RefinerPrepare", "LocalVideoStudioH3RefinerOutput", "LocalVideoStudioH3RequireGpuVAE", "LocalVideoStudioH3RefinerLoraGuard"
] as const;

export interface H3RefinerSnapshot {
  recipe: typeof H3_REFINER_RECIPE;
  prompt: string;
  sourceFps: number;
  model: string;
  textEncoder: string;
  videoVae: string;
  audioVae: string;
  refiner: typeof H3_REFINER_FILENAME;
  turbo: typeof H3_REFINER_TURBO_FILENAME;
  upscaler: string;
}

export function createH3RefinerSnapshot(prompt: string, sourceFps: number): H3RefinerSnapshot {
  return {
    recipe: H3_REFINER_RECIPE, prompt: prompt || "A detailed video with consistent subjects, motion and lighting.", sourceFps,
    model: h3Fl2vaInt8Model.installGuide!.recommendedFilename,
    textEncoder: h3Nvfp4TextEncoder.installGuide!.recommendedFilename,
    videoVae: h3Int8ConvRotVideoVae.installGuide!.recommendedFilename,
    audioVae: h3Fl2vaAudioVae.installGuide!.recommendedFilename,
    upscaler: h3LearnedLatentUpscaler.installGuide!.recommendedFilename,
    refiner: H3_REFINER_FILENAME, turbo: H3_REFINER_TURBO_FILENAME
  };
}

export function h3RefinerGeometry(width: number, height: number, target: number) {
  if (![width, height, target].every(v => Number.isFinite(v) && v > 0) ||
      !H3_REFINER_TARGETS.some(v => v === target)) throw new Error("H3 Refiner 目标必须为 1080p、1440p 或 4K。");
  const factor = target / Math.min(width, height);
  const outputWidth = Math.round(width * factor / 2) * 2;
  const outputHeight = Math.round(height * factor / 2) * 2;
  const canvasWidth = Math.ceil(outputWidth / 32) * 32;
  const canvasHeight = Math.ceil(outputHeight / 32) * 32;
  if (Math.max(canvasWidth, canvasHeight) > 8192 || canvasWidth * canvasHeight > 16_000_000) {
    throw new Error("H3 Refiner 目标超过 8192px 或 16MP，请选择较小档位。");
  }
  // Bound encoding work without changing the source aspect ratio by center cropping.
  const scale = Math.min(768 / Math.min(width, height), 1344 / Math.max(width, height));
  const baseWidth = Math.max(32, Math.round(width * scale / 32) * 32);
  const baseHeight = Math.max(32, Math.round(height * scale / 32) * 32);
  return { outputWidth, outputHeight, canvasWidth, canvasHeight, baseWidth, baseHeight };
}

export function validateH3RefinerSource(duration: number, fps: number): void {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 15 || !Number.isFinite(fps) || fps <= 0) {
    throw new Error("H3 Refiner 当前支持不超过 15 秒的视频；不会截短长视频。");
  }
}

export function buildH3RefinerWorkflow(task: UpscaleQueueTask, source: string, objectInfo: unknown) {
  const snapshot = task.h3Refiner;
  if (!snapshot || snapshot.recipe !== H3_REFINER_RECIPE ||
      snapshot.refiner !== H3_REFINER_FILENAME || snapshot.turbo !== H3_REFINER_TURBO_FILENAME) {
    throw new Error("H3 Refiner 配方快照缺失或不兼容，请重新入队。");
  }
  validateH3RefinerSource(task.duration, snapshot.sourceFps);
  const info = objectInfo as Record<string, { input?: { required?: Record<string, unknown>; optional?: Record<string, unknown> } }> | undefined;
  const missing = H3_REFINER_NODES.filter(id => !info?.[id]);
  if (missing.length) throw new Error(`H3 Refiner 缺少节点：${missing.join("、")}。请在设置中更新节点并重启 ComfyUI。`);
  for (const [id, names] of [
    ["LocalVideoStudioH3RefinerPrepare", ["images", "fps", "width", "height"]],
    ["LocalVideoStudioH3RefinerOutput", ["images", "frame_count", "width", "height"]],
    ["LocalVideoStudioH3RefinerLoraGuard", ["model", "base", "adapter"]]
  ] as const) {
    for (const name of names) {
      const inputs = info![id]!.input;
      if (!(name in (inputs?.required ?? {})) && !(name in (inputs?.optional ?? {}))) {
        throw new Error(`H3 Refiner schema 不兼容：${id}.${name}。请更新应用 H3 节点并重启。`);
      }
    }
  }
  const geometry = h3RefinerGeometry(task.sourceWidth, task.sourceHeight, task.targetHeight!);
  const { canvasWidth: w, canvasHeight: h, baseWidth, baseHeight } = geometry;
  if (task.targetWidth !== geometry.outputWidth || task.targetOutputHeight !== geometry.outputHeight) {
    throw new Error("H3 Refiner 输出尺寸与冻结快照不一致。");
  }
  const attentionSpec = info?.ModelAttentionBackend?.input?.required?.attention;
  const choices = Array.isArray(attentionSpec) && Array.isArray(attentionSpec[0]) ? attentionSpec[0] : [];
  const attention = choices.includes("comfy kitchen attention") ? "comfy kitchen attention" : "pytorch attention";
  if (!choices.includes(attention)) throw new Error("H3 Refiner attention schema 不兼容，请更新 ComfyUI。");
  type Node = { class_type: string; inputs: Record<string, unknown> };
  const graph: Record<string, Node> = {};
  const add = (id: string, class_type: string, inputs: Node["inputs"]) => { graph[id] = { class_type, inputs }; };
  // Resize while decoding, before an entire 4K source becomes a float IMAGE batch.
  add("source", "VHS_LoadVideo", {
    video: source, force_rate: 24, custom_width: baseWidth, custom_height: baseHeight,
    frame_load_cap: 0, skip_first_frames: 0, select_every_nth: 1, format: "AnimateDiff"
  });
  add("prepare", "LocalVideoStudioH3RefinerPrepare", {
    images: ["source", 0], fps: 24, width: baseWidth, height: baseHeight
  });
  add("unet", "UNETLoader", { unet_name: snapshot.model, weight_dtype: "default" });
  add("turbo", "LoraLoaderModelOnly", { model: ["unet", 0], lora_name: snapshot.turbo, strength_model: 1 });
  add("turbo-check", "LocalVideoStudioH3RefinerLoraGuard", { base: ["unet", 0], model: ["turbo", 0], adapter: "LightX2V v1.2" });
  add("refiner", "LoraLoaderModelOnly", { model: ["turbo-check", 0], lora_name: snapshot.refiner, strength_model: 1 });
  add("refiner-check", "LocalVideoStudioH3RefinerLoraGuard", { base: ["turbo-check", 0], model: ["refiner", 0], adapter: "Kijai rank384" });
  add("shift", "MiniMaxH3SigmaShift", { model: ["refiner-check", 0], shift_video: 6, shift_audio: 3 });
  add("attention", "ModelAttentionBackend", { model: ["shift", 0], attention });
  add("clip", "CLIPLoader", { clip_name: snapshot.textEncoder, type: "minimax", device: "default" });
  add("vae-loader", "VAELoader", { vae_name: snapshot.videoVae });
  add("audio-vae-loader", "VAELoader", { vae_name: snapshot.audioVae });
  add("vae", "LocalVideoStudioH3RequireGpuVAE", { vae: ["vae-loader", 0] });
  add("audio-vae", "LocalVideoStudioH3RequireGpuVAE", { vae: ["audio-vae-loader", 0] });
  add("conditioning", "MiniMaxH3ImageToVideo", {
    clip: ["clip", 0], vae: ["vae", 0], prompt: snapshot.prompt,
    width: baseWidth, height: baseHeight, length: ["prepare", 3]
  });
  add("encode", "VAEEncodeTiled", { pixels: ["prepare", 0], vae: ["vae", 0], tile_size: 512, overlap: 64, temporal_size: 64, temporal_overlap: 8 });
  add("silence", "VAEEncodeAudio", { audio: ["prepare", 2], vae: ["audio-vae", 0] });
  add("av", "LTXVConcatAVLatent", { video_latent: ["encode", 0], audio_latent: ["silence", 0] });
  // Keep each learned upscale within its trained 1–4x range for wide 4K inputs.
  if (Math.max(w / baseWidth, h / baseHeight) > 4) {
    add("intermediate-upscale", "MinimaxH3LatentUpscaler3D", {
      latent: ["encode", 0], model_name: snapshot.upscaler, mode: "target dimensions",
      "mode.width": Math.ceil(w / 2 / 32) * 32, "mode.height": Math.ceil(h / 2 / 32) * 32,
      align: 32, enable_temporal_chunking: true, force_unload: true, device: "cuda", precision: "bf16"
    });
    graph.av!.inputs.video_latent = ["intermediate-upscale", 0];
  }
  add("noise", "RandomNoise", { noise_seed: task.seed });
  add("sampler", "KSamplerSelect", { sampler_name: "euler" });
  add("upscale", "MMH3LatentUpscaleWithModelParams", { model_name: snapshot.upscaler, width: w, height: h, device: "cuda", precision: "bf16" });
  add("temporal", "MMH3TemporalSplitParams", { chunk_length: 136, temporal_overlap: 17, anchor_strength: 0.999 });
  add("spatial", "MMH3SpatialSplitParams", {
    upscale_width: w, upscale_height: h, tile_size_mode: "specific_size", tile_width: 768, tile_height: 576,
    grid_rows: 2, grid_cols: 3, spatial_w_overlap: 128, spatial_h_overlap: 128,
    fade_width: 32, fade_height: 32, min_tile_size: 256, overlap_mode: "earlier",
    overlap_blend: "smoothstep", masked_area_noise: 0, brightness_match: false,
    dynamic_fade: "off", dynamic_fade_min: 32
  });
  add("sample", "MMH3UltimateUpscale", {
    model: ["attention", 0], conditioning: ["conditioning", 0], latent: ["av", 0],
    noise: ["noise", 0], sampler: ["sampler", 0], sigmas: ["prepare", 4], cfg: 1,
    latent_upscale_param: ["upscale", 0], temporal_split_param: ["temporal", 0], spatial_split_param: ["spatial", 0]
  });
  add("unload", "VRAM_Debug", { any_input: ["sample", 0], empty_cache: true, gc_collect: true, unload_all_models: true });
  add("video-latent", "LTXVSeparateAVLatent", { av_latent: ["unload", 0] });
  add("decode", "VAEDecodeTiled", { samples: ["video-latent", 0], vae: ["vae", 0], tile_size: 512, overlap: 64, temporal_size: 64, temporal_overlap: 8 });
  add("restore", "LocalVideoStudioH3RefinerOutput", {
    images: ["decode", 0], frame_count: ["prepare", 1], width: geometry.outputWidth, height: geometry.outputHeight
  });
  add("video", "CreateVideo", { images: ["restore", 0], audio: ["source", 2], fps: 24 });
  add("save", "SaveVideo", { video: ["video", 0], filename_prefix: task.outputFilename.replace(/\.mp4$/i, ""), format: "mp4", codec: "h264" });
  return graph;
}
