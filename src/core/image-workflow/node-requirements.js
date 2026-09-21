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
];
export const qwenImageEdit2511LightningNodeTypes = [
    "LoraLoaderModelOnly"
];
/** Native ComfyUI nodes used by the official Qwen Image 2.1 text-to-image template. */
export const qwenImage21TextToImageRequiredNodeTypes = [
    "UNETLoader",
    "CLIPLoader",
    "VAELoader",
    "TextEncodeQwenImage21",
    "EmptyLatentImage",
    "KSampler",
    "VAEDecode",
    "SaveImageAdvanced"
];
/** Native ComfyUI nodes used by the official Qwen Image 2.1 edit template. */
export const qwenImage21RequiredNodeTypes = [
    "UNETLoader",
    "CLIPLoader",
    "VAELoader",
    "LoadImage",
    "TextEncodeQwenImage21",
    "EmptyLatentImage",
    "ComfySwitchNode",
    "QwenImage21Cache",
    "KSampler",
    "VAEDecode",
    "SaveImageAdvanced"
];
/** Qwen Image 2.1 GGUF path: only the diffusion loader comes from ComfyUI-GGUF. */
export const qwenImage21GgufTextToImageRequiredNodeTypes = [
    "UnetLoaderGGUF",
    "CLIPLoader",
    "VAELoader",
    "TextEncodeQwenImage21",
    "EmptyLatentImage",
    "KSampler",
    "VAEDecode",
    "SaveImageAdvanced"
];
/** Qwen Image 2.1 GGUF edit path with the native multi-image encoder/cache. */
export const qwenImage21GgufRequiredNodeTypes = [
    "UnetLoaderGGUF",
    "CLIPLoader",
    "VAELoader",
    "LoadImage",
    "TextEncodeQwenImage21",
    "EmptyLatentImage",
    "ComfySwitchNode",
    "QwenImage21Cache",
    "KSampler",
    "VAEDecode",
    "SaveImageAdvanced"
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
];
/** Image Studio node types used by both FL2VA and REF2VA prepare paths. */
export const minimaxH3ImageStudioSharedNodeTypes = [
    "H3ImageResolutionPreset",
    "H3ImageSamplingPreset",
    "H3ImageDecode",
    "H3ImageFrameSelector"
];
export const minimaxH3ImageFl2vaNodeTypes = [
    "H3ImageToImagePrepare"
];
export const minimaxH3ImageRef2vaNodeTypes = [
    "H3ReferenceEditPrepare"
];
export const minimaxH3ImageTurboNodeTypes = [
    "LoraLoaderModelOnly"
];
export const minimaxH3ImageI2IRequiredNodeTypes = [
    ...minimaxH3ImageCoreNodeTypes,
    ...minimaxH3ImageFl2vaNodeTypes
];
export const minimaxH3ReferenceEditRequiredNodeTypes = [
    ...minimaxH3ImageCoreNodeTypes,
    ...minimaxH3ImageRef2vaNodeTypes
];
