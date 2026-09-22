import type { ImageModelCapability } from "./contracts.js";

export const qwenImageDiffusionModel = "qwen_image_edit_2511_int8_convrot.safetensors";
export const qwenImageTextEncoder = "qwen_2.5_vl_7b_fp8_scaled.safetensors";
export const qwenImageVae = "qwen_image_vae.safetensors";
export const qwenImageLightningLora = "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors";
export const qwenImage21DiffusionModel = "qwen_image_2.1_int8_convrot.safetensors";
export const qwenImage21TextEncoder = "qwen3vl_8b_int8_convrot.safetensors";
export const qwenImage21Vae = "qwen_image_2.1_vae_bf16.safetensors";
/** The 4090-first GGUF route keeps the highest currently compatible quantization as default. */
export const qwenImage21UncensoredGgufDiffusionModel = "qwen-image-2.1-Q8_0.gguf";
export const qwenImage21UncensoredGgufQ6DiffusionModel = "qwen-image-2.1-Q6_K.gguf";
export const flux2Klein4bDiffusionModel = "flux-2-klein-base-4b-fp8.safetensors";
export const flux2Klein4bTextEncoder = "qwen_3_4b.safetensors";
export const flux2Klein4bVae = "flux2-vae.safetensors";
export const zImageDiffusionModel = "z_image_bf16.safetensors";
export const zImageTurboDiffusionModel = "z_image_turbo_bf16.safetensors";
export const zImageTextEncoder = "qwen_3_4b.safetensors";
export const zImageVae = "ae.safetensors";
export const zImageTurboFunControlnetPatch = "Z-Image-Turbo-Fun-Controlnet-Union.safetensors";
export const hidreamO1DiffusionModel = "hidream_o1_image_fp8_scaled.safetensors";
export const omnigen2DiffusionModel = "omnigen2_fp16.safetensors";
export const omnigen2TextEncoder = "qwen_2.5_vl_fp16.safetensors";
export const omnigen2Vae = "ae.safetensors";
export const h3Fl2vaImageDiffusionModel = "minimax_h3_fl2va_pruned_int8_convrot.safetensors";
export const h3Ref2vaImageDiffusionModel = "minimax_h3_ref2va_pruned_int8_convrot.safetensors";
export const h3ImageTextEncoder = "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors";
export const h3ImageVideoVae = "minimax_h3_video_vae_fp16.safetensors";
export const h3Fl2vaTurbo8Lora = "minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors";
export const h3Ref2vaTurbo8Lora = "minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors";

const h3ImageBaseQuality = {
  id: "base-quality-20",
  label: "Base 质量",
  steps: 20,
  cfg: 1,
  lightning: false
} as const;

export const minimaxH3ImageI2ICapability: ImageModelCapability = {
  id: "minimax-h3-image-i2i",
  name: "H3 · 源图 I2I（FL2VA）",
  maxPictures: 1,
  supportedFormats: ["png"],
  operation: "edit",
  requiresPrompt: true,
  supportsSeed: true,
  supportsMask: false,
  supportsMarkup: false,
  qualityProfiles: [
    h3ImageBaseQuality,
    {
      id: "fl2va-turbo-8",
      label: "FL2VA Turbo 8 步",
      steps: 8,
      cfg: 1,
      lightning: false
    }
  ],
  qualityProfileComponentLabels: {
    "fl2va-turbo-8": "FL2VA Turbo 8 步 LoRA"
  }
};

export const minimaxH3ReferenceEditCapability: ImageModelCapability = {
  id: "minimax-h3-reference-edit",
  name: "H3 · 参考编辑（REF2VA）",
  maxPictures: 9,
  supportedFormats: ["png"],
  operation: "edit",
  requiresPrompt: true,
  supportsSeed: true,
  supportsMask: false,
  supportsMarkup: false,
  qualityProfiles: [
    h3ImageBaseQuality,
    {
      id: "ref2va-turbo-8-768p",
      label: "REF2VA Turbo 768p · 8 步",
      steps: 8,
      cfg: 1,
      lightning: false
    }
  ],
  qualityProfileComponentLabels: {
    "ref2va-turbo-8-768p": "REF2VA Turbo 8 步 LoRA"
  }
};

export const qwenImageEdit2511Capability: ImageModelCapability = {
  id: "qwen-image-edit-2511",
  name: "Qwen-Image-Edit-2511",
  maxPictures: 3,
  supportedFormats: ["png"],
  operation: "edit",
  requiresPrompt: true,
  supportsSeed: true,
  supportsMask: false,
  supportsMarkup: true,
  supportsMarkupReferenceGuide: true,
  qualityProfiles: [
    {
      id: "balanced-20",
      label: "平衡质量",
      steps: 20,
      cfg: 4,
      lightning: false
    },
    {
      id: "native",
      label: "原生质量",
      steps: 40,
      cfg: 4,
      lightning: false
    },
    {
      id: "lightning-4step",
      label: "Lightning 4 步",
      steps: 4,
      cfg: 1,
      lightning: true
    }
  ]
};

/** Official ComfyUI Qwen Image 2.1 T2I/edit path. */
export const qwenImage21Capability: ImageModelCapability = {
  id: "qwen-image-2-1",
  name: "Qwen Image 2.1",
  maxPictures: 10,
  supportedFormats: ["png"],
  operation: "edit",
  requiresPrompt: true,
  supportsSeed: true,
  supportsTextOnly: true,
  supportsMask: false,
  supportsMarkup: true,
  supportsMarkupReferenceGuide: true,
  textOnlyOutputWidth: 1024,
  textOnlyOutputHeight: 1024,
  sourceResolutionOnly: true,
  supportsCustomOutputSize: true,
  customOutputMultiple: 32,
  qualityProfiles: [
    {
      id: "preview-25",
      label: "官方预览质量",
      steps: 25,
      cfg: 1,
      lightning: false
    },
    {
      id: "native",
      label: "官方原生质量",
      steps: 40,
      cfg: 1,
      lightning: false
    }
  ]
};

/** Community GGUF quantization of the same Qwen Image 2.1 model family. */
export const qwenImage21UncensoredGgufCapability: ImageModelCapability = {
  ...qwenImage21Capability,
  id: "qwen-image-2-1-uncensored-gguf",
  name: "Qwen Image 2.1 · Uncensored GGUF Q8_0"
};

export const qwenImage21UncensoredGgufQ6Capability: ImageModelCapability = {
  ...qwenImage21Capability,
  id: "qwen-image-2-1-uncensored-gguf-q6",
  name: "Qwen Image 2.1 · Uncensored GGUF Q6_K"
};
export const qwenImageEdit2511CropStitchCapability: ImageModelCapability = {
  id: "qwen-image-edit-2511-crop-stitch",
  name: "Qwen-Image-Edit-2511 局部融合修复",
  maxPictures: 1,
  supportedFormats: ["png"],
  operation: "harmonize",
  requiresPrompt: true,
  requiresMask: true,
  supportsSeed: true,
  sourceResolutionOnly: true,
  qualityProfiles: [
    {
      id: "balanced-20",
      label: "平衡质量",
      steps: 20,
      cfg: 4,
      lightning: false
    },
    {
      id: "native",
      label: "原生质量",
      steps: 40,
      cfg: 4,
      lightning: false
    }
  ]
};

export const flux2Klein4bCapability: ImageModelCapability = {
  id: "flux2-klein-4b",
  name: "FLUX.2 Klein 4B",
  maxPictures: 1,
  supportedFormats: ["png"],
  qualityProfiles: [
    {
      id: "native",
      label: "快速质量",
      steps: 20,
      cfg: 5,
      lightning: false
    },
    {
      id: "high-quality",
      label: "高质量",
      steps: 50,
      cfg: 4,
      lightning: false
    }
  ]
};

export const lamaInpaintCapability: ImageModelCapability = {
  id: "lama-inpaint",
  name: "LaMa 局部移除",
  maxPictures: 1,
  supportedFormats: ["png"],
  deterministic: true,
  operation: "inpaint",
  requiresPrompt: false,
  requiresMask: true,
  supportsSeed: false,
  sourceResolutionOnly: true,
  qualityProfiles: [
    { id: "natural", label: "自然边缘", steps: 0, cfg: 0, lightning: false },
    { id: "tight", label: "紧贴 Mask", steps: 0, cfg: 0, lightning: false },
    { id: "wide", label: "扩大修补", steps: 0, cfg: 0, lightning: false }
  ]
};

export const zImageCapability: ImageModelCapability = {
  id: "z-image",
  name: "Z-Image",
  maxPictures: 1,
  supportedFormats: ["png"],
  supportsTextOnly: true,
  supportsMask: true,
  supportsMarkup: true,
  supportsSeed: true,
  textOnlyOutputWidth: 1024,
  textOnlyOutputHeight: 1024,
  qualityProfiles: [
    {
      id: "native",
      label: "原生质量",
      steps: 30,
      cfg: 4,
      lightning: false
    },
    {
      id: "high-quality",
      label: "高质量",
      steps: 40,
      cfg: 4,
      lightning: false
    }
  ]
};

export const zImageTurboCapability: ImageModelCapability = {
  id: "z-image-turbo",
  name: "Z-Image-Turbo",
  maxPictures: 1,
  supportedFormats: ["png"],
  supportsTextOnly: true,
  supportsMask: true,
  supportsMarkup: true,
  supportsSeed: true,
  textOnlyOutputWidth: 1024,
  textOnlyOutputHeight: 1024,
  referenceModelComponentLabel: "Z-Image-Turbo Fun ControlNet Union",
  qualityProfiles: [
    {
      id: "turbo-8",
      label: "Turbo 快速",
      steps: 8,
      cfg: 1,
      lightning: false
    }
  ]
};

export const hidreamO1Capability: ImageModelCapability = {
  id: "hidream-o1-image",
  name: "HiDream-O1-Image",
  maxPictures: 1,
  supportedFormats: ["png"],
  supportsTextOnly: true,
  supportsMask: true,
  supportsMarkup: true,
  supportsSeed: true,
  textOnlyOutputWidth: 2048,
  textOnlyOutputHeight: 2048,
  qualityProfiles: [
    {
      id: "native",
      label: "Full 原生质量",
      steps: 50,
      cfg: 5,
      lightning: false
    }
  ]
};

export const omnigen2Capability: ImageModelCapability = {
  id: "omnigen2",
  name: "OmniGen2",
  maxPictures: 2,
  supportedFormats: ["png"],
  supportsTextOnly: true,
  supportsMask: true,
  supportsMarkup: true,
  supportsSeed: true,
  textOnlyOutputWidth: 1024,
  textOnlyOutputHeight: 1024,
  qualityProfiles: [
    {
      id: "native",
      label: "原生质量",
      steps: 20,
      cfg: 5,
      imageGuidance: 2,
      lightning: false
    },
    {
      id: "high-quality",
      label: "高质量",
      steps: 50,
      cfg: 5,
      imageGuidance: 2,
      lightning: false
    }
  ]
};

export const birefnetBackgroundRemovalCapability: ImageModelCapability = {
  id: "birefnet-background-removal",
  name: "BiRefNet 自动抠图",
  maxPictures: 1,
  supportedFormats: ["png"],
  deterministic: true,
  operation: "background-removal",
  requiresPrompt: false,
  supportsSeed: false,
  sourceResolutionOnly: true,
  qualityProfiles: [
    { id: "native", label: "自动抠图", steps: 0, cfg: 0, lightning: false }
  ]
};
