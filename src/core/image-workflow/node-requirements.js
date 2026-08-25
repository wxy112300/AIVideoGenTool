export const qwenImageEdit2511RequiredNodeTypes = [
    "CLIPLoader",
    "UNETLoader",
    "VAELoader",
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
];
export const qwenImageEdit2511LightningNodeTypes = [
    "LoraLoaderModelOnly"
];
/** Qwen 2511 graph with local Crop/Stitch fusion repair. */
export const qwenImageEdit2511CropStitchRequiredNodeTypes = [
    ...qwenImageEdit2511RequiredNodeTypes,
    "LoadImageMask",
    "InpaintCropImproved",
    "InpaintStitchImproved"
];
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
];
export const lamaInpaintRequiredNodeTypes = [
    "LoadImage",
    "LoadImageMask",
    "INPAINT_LoadInpaintModel",
    "INPAINT_ExpandMask",
    "INPAINT_InpaintWithModel",
    "SaveImage"
];
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
];
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
];
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
];
/** Native ComfyUI nodes used by the official BiRefNet background-removal template. */
export const birefnetRequiredNodeTypes = [
    "LoadImage",
    "LoadBackgroundRemovalModel",
    "RemoveBackground",
    "InvertMask",
    "JoinImageWithAlpha",
    "SaveImage"
];
