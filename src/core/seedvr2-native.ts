/**
 * Shared contract for the native ComfyUI SeedVR2 3B INT8 ConvRot path.
 *
 * Keep filenames and runtime node classes here so catalog scanning and the
 * execution adapter cannot silently drift apart.
 */
export const seedVr2NativeModelFilename = "seedvr2_3b_int8_convrot.safetensors";
export const seedVr2NativeVaeFilename = "seedvr2_ema_vae_fp16.safetensors";

export const seedVr2NativeRequiredNodes = [
  "LoadVideo",
  "GetVideoComponents",
  "ImageScale",
  "SeedVR2Preprocess",
  "VAELoader",
  "VAEEncodeTiled",
  "UNETLoader",
  "SeedVR2TemporalChunk",
  "SeedVR2Conditioning",
  "KSampler",
  "SeedVR2TemporalMerge",
  "VAEDecodeTiled",
  "SeedVR2PostProcessing",
  "CreateVideo",
  "SaveVideo"
] as const;
