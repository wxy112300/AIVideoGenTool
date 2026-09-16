export const qwenImageEdit2511RequiredNodeTypes = [
  "CLIPLoader",
  "UNETLoader",
  "VAELoader",
  "LocalVideoStudioRequireGpuVAE",
  "LoadImage",
  "TextEncodeQwenImageEditPlus",
  "FluxKontextImageScale",
  "FluxKontextMultiReferenceLatentMethod",
  "VAEEncode",
  "ImageScale",
  "ModelSamplingAuraFlow",
  "CFGNorm",
  "KSampler",
  "VAEDecode",
  "SaveImage"
] as const;
export const qwenImageEdit2511LightningNodeTypes = [
  "LoraLoaderModelOnly"
] as const;

/** Qwen 2511 graph with local Crop/Stitch fusion repair. */
export const qwenImageEdit2511CropStitchRequiredNodeTypes = [
  ...qwenImageEdit2511RequiredNodeTypes,
  "LoadImageMask",
  "InpaintCropImproved",
  "InpaintStitchImproved"
] as const;

export const flux2Klein4bRequiredNodeTypes = [
  "UNETLoader",
  "CLIPLoader",
  "VAELoader",
  "LoadImage",
  "ImageScaleToTotalPixels",
  "GetImageSize",
  "ReferenceLatent",
  "VAEEncode",
  "CLIPTextEncode",
  "EmptyFlux2LatentImage",
  "Flux2Scheduler",
  "CFGGuider",
  "KSamplerSelect",
  "RandomNoise",
  "SamplerCustomAdvanced",
  "VAEDecode",
  "ImageScale",
  "SaveImage"
] as const;

export const lamaInpaintRequiredNodeTypes = [
  "LoadImage",
  "LoadImageMask",
  "INPAINT_LoadInpaintModel",
  "INPAINT_ExpandMask",
  "INPAINT_InpaintWithModel",
  "SaveImage"
] as const;

/** Native ComfyUI nodes used by Z-Image Base for T2I and optional img2img/inpaint. */
export const zImageRequiredNodeTypes = [
  "CLIPLoader",
  "UNETLoader",
  "VAELoader",
  "CLIPTextEncode",
  "EmptySD3LatentImage",
  "ModelSamplingAuraFlow",
  "KSampler",
  "VAEDecode",
  "ImageScale",
  "SaveImage",
  "LoadImage",
  "VAEEncode",
  "LoadImageMask",
  "VAEEncodeForInpaint"
] as const;

/** Native ComfyUI nodes used by Z-Image Turbo, including Fun ControlNet inputs. */
export const zImageTurboRequiredNodeTypes = [
  "CLIPLoader",
  "UNETLoader",
  "VAELoader",
  "CLIPTextEncode",
  "ConditioningZeroOut",
  "EmptySD3LatentImage",
  "ModelSamplingAuraFlow",
  "KSampler",
  "VAEDecode",
  "ImageScale",
  "SaveImage",
  "LoadImage",
  "Canny",
  "ModelPatchLoader",
  "ZImageFunControlnet",
  "LoadImageMask"
] as const;

/** Native ComfyUI nodes used by HiDream-O1-Image for T2I and reference editing. */
export const hidreamO1RequiredNodeTypes = [
  "CheckpointLoaderSimple",
  "LoadImage",
  "HiDreamO1ReferenceImages",
  "ModelNoiseScale",
  "HiDreamO1PatchSeamSmoothing",
  "CLIPTextEncode",
  "EmptyHiDreamO1LatentImage",
  "BasicScheduler",
  "KSamplerSelect",
  "SamplerCustom",
  "VAEDecode",
  "ImageScale",
  "LoadImageMask",
  "ImageCompositeMasked",
  "SaveImage"
] as const;

/** Native ComfyUI nodes used by the official OmniGen2 T2I/edit templates. */
export const omnigen2RequiredNodeTypes = [
  "UNETLoader",
  "CLIPLoader",
  "VAELoader",
  "LoadImage",
  "ImageScaleToTotalPixels",
  "GetImageSize",
  "VAEEncode",
  "ReferenceLatent",
  "CLIPTextEncode",
  "EmptySD3LatentImage",
  "BasicScheduler",
  "KSamplerSelect",
  "RandomNoise",
  "DualCFGGuider",
  "SamplerCustomAdvanced",
  "VAEDecode",
  "ImageScale",
  "LoadImageMask",
  "ImageCompositeMasked",
  "SaveImage"
] as const;

/** Native ComfyUI nodes used by the official BiRefNet background-removal template. */
export const birefnetRequiredNodeTypes = [
  "LoadImage",
  "LoadBackgroundRemovalModel",
  "RemoveBackground",
  "InvertMask",
  "JoinImageWithAlpha",
  "SaveImage"
] as const;

/** Core ComfyUI nodes shared by the H3 Image Studio API graphs. */
export const minimaxH3ImageCoreNodeTypes = [
  "UNETLoader",
  "CLIPLoader",
  "VAELoader",
  "LoadImage",
  "H3ImageResolutionPreset",
  "RandomNoise",
  "BasicGuider",
  "H3ImageSamplingPreset",
  "SamplerCustomAdvanced",
  "H3ImageDecode",
  "H3ImageFrameSelector",
  "SaveImage"
] as const;

/** Image Studio node types used by both FL2VA and REF2VA prepare paths. */
export const minimaxH3ImageStudioSharedNodeTypes = [
  "H3ImageResolutionPreset",
  "H3ImageSamplingPreset",
  "H3ImageDecode",
  "H3ImageFrameSelector"
] as const;

export const minimaxH3ImageFl2vaNodeTypes = [
  "H3ImageToImagePrepare"
] as const;

export const minimaxH3ImageRef2vaNodeTypes = [
  "H3ReferenceEditPrepare"
] as const;

export const minimaxH3ImageTurboNodeTypes = [
  "LoraLoaderModelOnly"
] as const;

export const minimaxH3ImageI2IRequiredNodeTypes = [
  ...minimaxH3ImageCoreNodeTypes,
  ...minimaxH3ImageFl2vaNodeTypes
] as const;

export const minimaxH3ReferenceEditRequiredNodeTypes = [
  ...minimaxH3ImageCoreNodeTypes,
  ...minimaxH3ImageRef2vaNodeTypes
] as const;
