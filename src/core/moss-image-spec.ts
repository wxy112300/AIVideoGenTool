/** Shared identities for catalog, prompt routing and native ComfyUI workflows. */
export const MOSS_IMAGE_ID = "moss-image-sft";
export const MOSS_NSFW_ID = "moss-image-pornmaster";
export const MOSS_IMAGE_MODEL = "moss_image_sft_int8_convrot.safetensors";
export const MOSS_NSFW_MODEL = "pornmasterMoss_v1.safetensors";
export const MOSS_TEXT_ENCODER = "qwen3.5_9b_w4a8_gptq.safetensors";
export const MOSS_VAE = "flux2-vae_small.safetensors";
export const MOSS_MINIMUM_COMFY_VERSION = "0.42.0";
export const MOSS_REQUIRED_NODE_TYPES = [
  "UNETLoader", "CLIPLoader", "VAELoader", "CLIPTextEncode",
  "EmptyFlux2LatentImage", "SkipLayerGuidanceDiTSimple", "KSampler", "VAEDecode", "SaveImage"
] as const;
export function isMossImageModel(modelId: string | undefined): boolean {
  return modelId === MOSS_IMAGE_ID || modelId === MOSS_NSFW_ID;
}
