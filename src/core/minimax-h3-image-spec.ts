export const H3_IMAGE_ID = "minimax-h3-image";
export const H3_IMAGE_W4A8_ID = "minimax-h3-image-w4a8";
export const H3_IMAGE_W4A8_MODEL = "minimax_h3_image_pruned_w4a8.safetensors";
export function isH3ImageModel(modelId?: string): boolean {
  return modelId === H3_IMAGE_ID || modelId === H3_IMAGE_W4A8_ID;
}
export const H3_IMAGE_MODEL = "minimax_h3_image_pruned_int8_convrot.safetensors";
export const H3_IMAGE_VAE = "minimax_h3_image_vae_fp16.safetensors";
export const H3_IMAGE_ENCODERS = ["qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors", "qwen3vl_32b_minimax_h3_int8_convrot.safetensors"] as const;
export const H3_IMAGE_NODES = ["UNETLoader", "CLIPLoader", "VAELoader", "MiniMaxH3ImageConditioning", "ConditioningZeroOut", "KSampler", "VAEDecode", "SaveImage"] as const;
