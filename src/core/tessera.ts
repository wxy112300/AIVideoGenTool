import { uiKeys } from "./i18n-keys.js";
import type { EnvironmentScanResult, UpscaleQueueTask, ModelScanProfile } from "../types.js";
import { createTranslator, type Translate } from "./i18n.js";
import { h3RefinerGeometry, h3RefinerSourceFilename, validateH3RefinerSource } from "./h3-refiner.js";
import { h3Ref2vaInt8Model, h3Nvfp4TextEncoder, h3Int8ConvRotVideoVae, h3Fl2vaAudioVae } from "./catalog/models/minimax_h3_shared.js";
import { buildQwenImage21AnchorWorkflow } from "./image-workflow/qwen-image-2-1.js";

export const TESSERA_ID = "minimax_h3_tessera";
export const TESSERA_REVISION = "930c882a17fb9a494308ac0f19ed3a73fa9a4ce0";
export const TESSERA_RECIPE = "tessera-ref2va-taomate-lms-v1";
export const TESSERA_TAO = "minimax_h3_taomate_fl2va_3step_avg_rank_19_bf16.safetensors";
export const TESSERA_LMS = "minimax_h3_lms_v1.0_r64.safetensors";
export function tesseraSourceFilename(filename: string) { return h3RefinerSourceFilename(filename).replace(/-h3-refiner\.mp4$/, "-tessera.mp4"); }
export const TESSERA_NODE_TYPES = ["TesseraEncode", "TesseraRefine", "TesseraArgs"] as const;
export const TESSERA_NODES = [...TESSERA_NODE_TYPES, "VHS_LoadVideo", "UNETLoader", "CLIPLoader", "VAELoader", "LoraLoaderModelOnly",
  "MiniMaxH3ReferenceToVideo", "MiniMaxH3SigmaShift", "ModelAttentionBackend", "VAEEncodeAudio", "LTXVConcatAVLatent",
  "KSamplerSelect", "ConditioningZeroOut", "VRAM_Debug", "CreateVideo", "SaveVideo", "LocalVideoStudioH3TesseraSigmas", "LocalVideoStudioH3RefinerPrepare", "LocalVideoStudioH3RefinerOutput",
  "LocalVideoStudioH3RefinerLoraGuard", "LocalVideoStudioH3RequireGpuVAE"] as const;
export const TESSERA_QWEN_MODELS = ["qwen-image-2-1-turbo", "qwen-image-2-1", "qwen-image-2-1-uncensored-gguf", "qwen-image-2-1-uncensored-gguf-q6"] as const;
export interface TesseraAnchorSnapshot {
  modelId: typeof TESSERA_QWEN_MODELS[number]; model: string; textEncoder: string; vae: string;
}
export interface TesseraSnapshot {
  recipe: typeof TESSERA_RECIPE; sourceFps: number; prompt: string;
  model: string; textEncoder: string; videoVae: string; audioVae: string;
  tao: typeof TESSERA_TAO; lms: typeof TESSERA_LMS; anchor?: TesseraAnchorSnapshot;
}
function usable(profile: ModelScanProfile | undefined): profile is ModelScanProfile {
  return !!profile?.available && !profile.missingCustomNodeNames?.length && profile.customNodeCompatibility !== "error" && !(profile.runtimeVerified && profile.runtimeReady === false);
}
function modelFile(profile: ModelScanProfile, category: string): string | undefined {
  for (const component of profile.components ?? []) {
    if (!component.found) continue;
    for (const match of component.matches) {
      const normalized = match.replaceAll("\\", "/");
      const marker = `${category}/`;
      const start = normalized.toLowerCase().lastIndexOf(marker);
      if (start >= 0) return normalized.slice(start + marker.length);
    }
  }
  return undefined;
}
export function tesseraAnchorModels(environment: EnvironmentScanResult | null | undefined): TesseraAnchorSnapshot[] {
  return TESSERA_QWEN_MODELS.flatMap(modelId => {
    const profile = environment?.modelProfiles.find(p => p.id === modelId);
    if (!usable(profile)) return [];
    const model = modelFile(profile, modelId.includes("gguf") ? "unet" : "diffusion_models");
    const textEncoder = modelFile(profile, "text_encoders"), vae = modelFile(profile, "vae");
    return model && textEncoder && vae ? [{ modelId, model, textEncoder, vae }] : [];
  });
}
export function tesseraAnchorRecommended(width: number, height: number, target: number): boolean {
  return target / Math.min(width, height) <= 2.02;
}
export function tesseraGeometry(width: number, height: number, target: number, t: Translate = createTranslator().t) {
  const g = h3RefinerGeometry(width, height, target, t);
  const scale = target / Math.min(width, height) <= 2.02 ? 2 : 4;
  // Encode an exact integer-scale plate on the 32px source grid; crop only final canvas padding.
  const baseWidth = Math.ceil(g.canvasWidth / scale / 32) * 32;
  const baseHeight = Math.ceil(g.canvasHeight / scale / 32) * 32;
  return { ...g, scale, baseWidth, baseHeight, canvasWidth: baseWidth * scale, canvasHeight: baseHeight * scale };
}
export function createTesseraSnapshot(prompt: string, fps: number, anchor?: TesseraAnchorSnapshot): TesseraSnapshot {
  return { recipe: TESSERA_RECIPE, sourceFps: fps, prompt: prompt || "Preserve the source video's subjects, framing, motion and timing. Enhance natural fine detail.",
    model: h3Ref2vaInt8Model.installGuide!.recommendedFilename, textEncoder: h3Nvfp4TextEncoder.installGuide!.recommendedFilename,
    videoVae: h3Int8ConvRotVideoVae.installGuide!.recommendedFilename, audioVae: h3Fl2vaAudioVae.installGuide!.recommendedFilename,
    tao: TESSERA_TAO, lms: TESSERA_LMS, ...(anchor ? { anchor: structuredClone(anchor) } : {}) };
}

export function buildTesseraWorkflow(task: UpscaleQueueTask, source: string, objectInfo: unknown, t: Translate = createTranslator().t) {
  const s = task.tessera;
  if (!s || s.recipe !== TESSERA_RECIPE || s.tao !== TESSERA_TAO || s.lms !== TESSERA_LMS) throw new Error(t(uiKeys.serviceChecks.tesseraRecipe));
  validateH3RefinerSource(task.duration, s.sourceFps, t);
  const g = tesseraGeometry(task.sourceWidth, task.sourceHeight, task.targetHeight!, t);
  if (g.outputWidth !== task.targetWidth || g.outputHeight !== task.targetOutputHeight) throw new Error(t(uiKeys.serviceChecks.tesseraSnapshot));
  const info = objectInfo as Record<string, { input?: { required?: Record<string, unknown>; optional?: Record<string, unknown> } }>;
  const missing = TESSERA_NODES.filter(id => !info?.[id]);
  if (missing.length) throw new Error(t(uiKeys.serviceChecks.tesseraNodes, { nodes: missing.join("、") }));
  const spec = info.ModelAttentionBackend?.input?.required?.attention;
  const choices = Array.isArray(spec) && Array.isArray(spec[0]) ? spec[0] : [];
  const attention = choices.includes("comfy kitchen attention") ? "comfy kitchen attention" : "pytorch attention";
  if (!choices.includes(attention)) throw new Error(t(uiKeys.serviceChecks.tesseraAttention));
  const graph: Record<string, { class_type: string; inputs: Record<string, unknown> }> = {};
  const add = (id: string, class_type: string, inputs: Record<string, unknown>) => { graph[id] = { class_type, inputs }; };
  add("source", "VHS_LoadVideo", { video: source, force_rate: 24, custom_width: g.baseWidth, custom_height: g.baseHeight, frame_load_cap: 0, skip_first_frames: 0, select_every_nth: 1, format: "AnimateDiff" });
  add("prepare", "LocalVideoStudioH3RefinerPrepare", { images: ["source", 0], fps: 24, width: g.baseWidth, height: g.baseHeight });
  add("clip", "CLIPLoader", { clip_name: s.textEncoder, type: "minimax", device: "default" });
  add("video-vae", "VAELoader", { vae_name: s.videoVae });
  add("audio-vae", "VAELoader", { vae_name: s.audioVae });
  add("vae", "LocalVideoStudioH3RequireGpuVAE", { vae: ["video-vae", 0] });
  add("avae", "LocalVideoStudioH3RequireGpuVAE", { vae: ["audio-vae", 0] });
  add("conditioning", "MiniMaxH3ReferenceToVideo", { clip: ["clip", 0], vae: ["vae", 0], audio_vae: ["avae", 0], prompt: s.prompt,
    width: g.baseWidth, height: g.baseHeight, length: ["prepare", 3], ref_image_size: "max", "ref_videos.ref_video_0": ["prepare", 0] });
  add("encode", "TesseraEncode", { images: ["prepare", 0], vae: ["vae", 0], positive: ["conditioning", 0], upscale_by: g.scale,
    upscale_method: "lanczos", segment_frames: 39, anchor_strength: 1, anchor_spread: 4 });
  if (s.anchor) {
    const qwen = buildQwenImage21AnchorWorkflow(s.anchor, g.canvasWidth, g.canvasHeight, task.seed, t);
    for (const [id, node] of Object.entries(qwen)) {
      graph[`anchor-${id}`] = { class_type: node.class_type, inputs: Object.fromEntries(Object.entries(node.inputs).map(([key, value]) =>
        [key, Array.isArray(value) && typeof value[0] === "string" && value.length === 2 && typeof value[1] === "number" ? [`anchor-${value[0]}`, value[1]] : value])) };
    }
    add("anchor-input", "ImageFromBatch", { image: ["prepare", 0], batch_index: 0, length: 1 });
    // Replace the builder's LoadImage rather than uploading/extracting any other frame.
    graph["anchor-image-first"] = graph["anchor-input"]!;
    delete graph["anchor-input"];
    graph["anchor-vae-loader"] = graph["anchor-vae"]!;
    add("anchor-vae", "LocalVideoStudioH3RequireGpuVAE", { vae: ["anchor-vae-loader", 0] });
    add("anchor-unload", "VRAM_Debug", { any_input: ["anchor-decoded", 0], empty_cache: true, gc_collect: true, unload_all_models: true });
    graph.encode!.inputs.anchor = ["anchor-unload", 0];
    for (const node of Object.values(qwen)) if (!info[node.class_type] && node.class_type !== "LoadImage") throw new Error(t(uiKeys.serviceChecks.anchorNode, { node: node.class_type }));
    if (!info.ImageFromBatch) throw new Error(t(uiKeys.serviceChecks.anchorBatch));
  }
  add("unet", "UNETLoader", { unet_name: s.model, weight_dtype: "default" });
  add("tao", "LoraLoaderModelOnly", { model: ["unet", 0], lora_name: s.tao, strength_model: 1 });
  add("tao-guard", "LocalVideoStudioH3RefinerLoraGuard", { base: ["unet", 0], model: ["tao", 0], adapter: "Tessera Taomate" });
  add("lms", "LoraLoaderModelOnly", { model: ["tao-guard", 0], lora_name: s.lms, strength_model: 0.75 });
  add("lms-guard", "LocalVideoStudioH3RefinerLoraGuard", { base: ["tao-guard", 0], model: ["lms", 0], adapter: "Tessera LMS" });
  add("fine-lms", "LoraLoaderModelOnly", { model: ["tao-guard", 0], lora_name: s.lms, strength_model: 1 });
  add("shift", "MiniMaxH3SigmaShift", { model: ["lms-guard", 0], shift_video: 6, shift_audio: 3 });
  add("fine-shift", "MiniMaxH3SigmaShift", { model: ["fine-lms", 0], shift_video: 6, shift_audio: 3 });
  add("attention", "ModelAttentionBackend", { model: ["shift", 0], attention });
  add("fine-attention", "ModelAttentionBackend", { model: ["fine-shift", 0], attention });
  add("silence", "VAEEncodeAudio", { audio: ["prepare", 2], vae: ["avae", 0] });
  add("av", "LTXVConcatAVLatent", { video_latent: ["encode", 1], audio_latent: ["silence", 0] });
  add("sampler", "KSamplerSelect", { sampler_name: "euler" });
  add("negative", "ConditioningZeroOut", { conditioning: ["conditioning", 0] });
  // Tessera's phase-split head/tail recipe, independent from Create/Kijai settings.
  add("sigmas", "LocalVideoStudioH3TesseraSigmas", {});
  add("args", "TesseraArgs", { video_ref_crop: "per_tile", image_ref_crop: "per_tile", guide_noise: 0, guide_noise_band: "full", guide_noise_t: "per_frame",
    guide_release: 0.8, guide_inherit: true, hero_guide_noise: -1, motion_adapt: true, motion_release_floor: s.anchor ? 0.3 : 0,
    fine_below_sigma: 0.75, tile_select: "", tile_limit: 0, flat_skip: 4 });
  add("refine", "TesseraRefine", { model: ["attention", 0], model_fine: ["fine-attention", 0], clip: ["clip", 0],
    positive: ["encode", 0], negative: ["negative", 0], latent: ["av", 0], vae: ["vae", 0], sampler: ["sampler", 0], sampler_fine: ["sampler", 0], sigmas: ["sigmas", 0],
    args: ["args", 0], spatial_tile: "low_vram", tile_width: 768, tile_height: 768, temporal_tile: "high_vram", temporal_size: 124, temporal_overlap: 4,
    context_border: 64, seam_overlap: 32, hero_min: 896, hero_fit: "median", cfg: 1, seed: task.seed, seed_mode: "global", pixel_out: true, console_progress: "overall", prompt: s.prompt });
  add("restore", "LocalVideoStudioH3RefinerOutput", { images: ["refine", 2], frame_count: ["prepare", 1], width: g.outputWidth, height: g.outputHeight });
  add("video", "CreateVideo", { images: ["restore", 0], audio: ["source", 2], fps: 24 });
  add("save", "SaveVideo", { video: ["video", 0], filename_prefix: task.outputFilename.replace(/\.mp4$/i, ""), format: "mp4", codec: "h264" });
  if (s.anchor) {
    if (!info.LocalVideoStudioH3TesseraLoad) throw new Error(t(uiKeys.serviceChecks.tesseraLoad));
    add("h3-load", "LocalVideoStudioH3TesseraLoad", { anchor: ["anchor-unload", 0], unet_name: s.model, clip_name: s.textEncoder, vae_name: s.videoVae, audio_vae_name: s.audioVae });
    const outputs: Record<string, number> = { unet: 0, clip: 1, "video-vae": 2, "audio-vae": 3 };
    for (const node of Object.values(graph)) {
      for (const [key, value] of Object.entries(node.inputs)) {
        if (Array.isArray(value) && typeof value[0] === "string" && value[0] in outputs) node.inputs[key] = ["h3-load", outputs[value[0]]];
      }
    }
    for (const id of Object.keys(outputs)) delete graph[id];
  }
  if (!info.LocalVideoStudioH3TesseraSigmas) throw new Error(t(uiKeys.serviceChecks.tesseraBridge));
  return graph;
}
