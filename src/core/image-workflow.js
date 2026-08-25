import { extractComfyOutputFiles } from "./comfy-output.js";
export function cachedImageProfileAllowsEnqueue(profile) {
    return Boolean(profile?.category === "image" &&
        profile.integrated &&
        profile.available &&
        !(profile.missingCustomNodeIds?.length));
}
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
const qwenImageDiffusionModel = "qwen_image_edit_2511_int8_convrot.safetensors";
const qwenImageTextEncoder = "qwen_2.5_vl_7b_fp8_scaled.safetensors";
const qwenImageVae = "qwen_image_vae.safetensors";
const qwenImageLightningLora = "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors";
const flux2Klein4bDiffusionModel = "flux-2-klein-base-4b-fp8.safetensors";
const flux2Klein4bTextEncoder = "qwen_3_4b.safetensors";
const flux2Klein4bVae = "flux2-vae.safetensors";
const zImageDiffusionModel = "z_image_bf16.safetensors";
const zImageTurboDiffusionModel = "z_image_turbo_bf16.safetensors";
const zImageTextEncoder = "qwen_3_4b.safetensors";
const zImageVae = "ae.safetensors";
const zImageTurboFunControlnetPatch = "Z-Image-Turbo-Fun-Controlnet-Union.safetensors";
const hidreamO1DiffusionModel = "hidream_o1_image_fp8_scaled.safetensors";
const pictureReferencePattern = /(?:<\s*)?(?:picture|image|图片)\s*([1-9]\d*)(?:\s*>)?/giu;
export const imageTargetResolutionValues = [2160, 1152, 1080, 720, 640, 480];
function alignedImageDimension(value) {
    return Math.max(8, Math.round(value / 8) * 8);
}
export function normalizeImageTargetResolution(value, sourceWidth = 0, sourceHeight = 0) {
    if (value === "source")
        return "source";
    const numeric = typeof value === "number" ? value : Number(value);
    const isSupported = imageTargetResolutionValues.some((candidate) => candidate === numeric);
    if (!isSupported)
        return "source";
    const shortEdge = Math.min(sourceWidth, sourceHeight);
    return sourceWidth > 0 && sourceHeight > 0 && numeric > shortEdge
        ? "source"
        : numeric;
}
export function imageOutputDimensions(sourceWidth, sourceHeight, targetResolution, fallbackWidth = 0, fallbackHeight = 0) {
    const hasSource = Number.isFinite(sourceWidth) && Number.isFinite(sourceHeight) &&
        sourceWidth > 0 && sourceHeight > 0;
    const hasFallback = Number.isFinite(fallbackWidth) && Number.isFinite(fallbackHeight) &&
        fallbackWidth > 0 && fallbackHeight > 0;
    const width = hasSource ? sourceWidth : hasFallback ? fallbackWidth : 0;
    const height = hasSource ? sourceHeight : hasFallback ? fallbackHeight : 0;
    if (!width || !height || targetResolution === "source") {
        return [Math.max(0, Math.trunc(width)), Math.max(0, Math.trunc(height))];
    }
    const shortEdge = Math.min(width, height);
    const normalizedTarget = normalizeImageTargetResolution(targetResolution, width, height);
    if (normalizedTarget === "source")
        return [width, height];
    const scale = normalizedTarget / shortEdge;
    return [
        alignedImageDimension(width * scale),
        alignedImageDimension(height * scale)
    ];
}
export function imageResolutionOptionsFor(sourceWidth = 0, sourceHeight = 0, fallbackWidth = 0, fallbackHeight = 0) {
    const hasSource = sourceWidth > 0 && sourceHeight > 0;
    const hasFallback = fallbackWidth > 0 && fallbackHeight > 0;
    const sourceLabel = hasSource
        ? `原图 · ${sourceWidth}×${sourceHeight}`
        : hasFallback
            ? `默认 · ${fallbackWidth}×${fallbackHeight}`
            : "原图 · 上传后读取";
    const options = [{
            value: "source",
            label: sourceLabel,
            width: hasSource ? sourceWidth : fallbackWidth,
            height: hasSource ? sourceHeight : fallbackHeight
        }];
    const shortEdge = Math.min(hasSource ? sourceWidth : fallbackWidth, hasSource ? sourceHeight : fallbackHeight);
    for (const target of imageTargetResolutionValues) {
        if ((hasSource || hasFallback) && target > shortEdge)
            continue;
        const [width, height] = hasSource || hasFallback
            ? imageOutputDimensions(sourceWidth, sourceHeight, target, fallbackWidth, fallbackHeight)
            : [0, 0];
        options.push({
            value: target,
            label: hasSource || hasFallback ? `${target}p · ${width}×${height}` : `${target}p`,
            width,
            height
        });
    }
    return options;
}
export const qwenImageEdit2511Capability = {
    id: "qwen-image-edit-2511",
    name: "Qwen-Image-Edit-2511",
    maxPictures: 3,
    supportedFormats: ["png"],
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
export const qwenImageEdit2511CropStitchCapability = {
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
export const flux2Klein4bCapability = {
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
export const lamaInpaintCapability = {
    id: "lama-inpaint",
    name: "LaMa 局部移除",
    maxPictures: 1,
    supportedFormats: ["png"],
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
export const zImageCapability = {
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
export const zImageTurboCapability = {
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
export const hidreamO1Capability = {
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
export const birefnetBackgroundRemovalCapability = {
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
function orderedPictures(pictures) {
    return [...pictures].sort((left, right) => left.pictureNumber - right.pictureNumber);
}
export function imageReferenceInputPath(picture) {
    return picture.crop?.croppedPath.trim() || picture.absolutePath.trim();
}
export function imageMarkupPromptContext(pictures) {
    const marked = pictures.filter((picture) => picture.markup?.objectCount);
    if (!marked.length)
        return "";
    return [
        "Visual annotation instructions:",
        "Canvas annotations are location-only editing instructions stored alongside the clean source Pictures. Use their notes to identify the intended target, but never add annotation graphics, labels, arrows, boxes, or note text to the output.",
        "The per-annotation notes below are the authoritative edit list. A general preservation instruction may protect unrelated content, but must never override, broaden, or replace a specific annotation note.",
        ...marked.map((picture) => `Picture ${picture.pictureNumber}: ${picture.markup?.summary || `${picture.markup?.objectCount ?? 0} marked target(s)`}`)
    ].join("\n");
}
function markupGuidePicture(picture, compiledPictureNumber) {
    return {
        ...picture,
        id: `${picture.id}-markup-guide-r${picture.markup?.revision ?? 0}`,
        pictureNumber: compiledPictureNumber,
        absolutePath: picture.markup?.renderedPath.trim() ?? "",
        role: "auto",
        crop: undefined,
        markup: undefined
    };
}
function compiledMarkupPromptContext(guides) {
    if (!guides.length)
        return "";
    return [
        "Visual annotation reference contract:",
        "The clean source Picture is the image to edit. Its paired annotation-guide Picture is location-only reference material, not output content.",
        "Never reproduce any colored mark, border, box, arrow, label, letter, number, note, or annotation-guide text. Reconstruct clean natural pixels where the requested edit is made, and preserve unmarked content.",
        ...guides.map((guide) => [
            `Picture ${guide.sourceInputNumber} is the clean source for original Picture ${guide.sourcePictureNumber}; Picture ${guide.guideInputNumber} is only its temporary annotation guide.`,
            `Requested edits for Picture ${guide.sourceInputNumber}: ${guide.summary}`
        ].join(" "))
    ].join("\n");
}
function compileImagePromptWithLimit(prompt, pictures, maxPictures, modelLabel, includeMarkupGuides = false) {
    const ordered = orderedPictures(pictures);
    const usable = ordered.filter((picture) => picture.absolutePath.trim());
    const errors = [];
    ordered
        .filter((picture) => !picture.absolutePath.trim())
        .forEach((picture) => {
        errors.push(`Picture ${picture.pictureNumber} 尚未添加图片。`);
    });
    const originalToCompiled = new Map();
    const compiledPictures = [];
    const markupGuides = [];
    usable.forEach((picture) => {
        if (originalToCompiled.has(picture.pictureNumber)) {
            errors.push(`Picture ${picture.pictureNumber} 重复，无法确定引用对象。`);
            return;
        }
        const sourceInputNumber = compiledPictures.length + 1;
        originalToCompiled.set(picture.pictureNumber, sourceInputNumber);
        compiledPictures.push(picture);
        if (includeMarkupGuides && picture.markup?.objectCount && picture.markup.renderedPath.trim()) {
            const guideInputNumber = compiledPictures.length + 1;
            compiledPictures.push(markupGuidePicture(picture, guideInputNumber));
            markupGuides.push({
                sourcePictureNumber: picture.pictureNumber,
                sourceInputNumber,
                guideInputNumber,
                summary: picture.markup.summary.trim() || `${picture.markup.objectCount} marked target(s)`
            });
        }
    });
    if (ordered.length > maxPictures) {
        errors.push(`当前 ${modelLabel} 工作流最多支持 ${maxPictures} 张 Picture。`);
    }
    if (compiledPictures.length > maxPictures) {
        const guideCount = markupGuides.length;
        errors.push(`Canvas 标记会额外占用 ${guideCount} 个标注参考输入；当前 ${modelLabel} 最多接收 ${maxPictures} 张模型输入，请减少普通参考图或清除部分标记。`);
    }
    const referencedPictureNumbers = new Set();
    const compiledPrompt = prompt.replace(pictureReferencePattern, (match, numberText) => {
        const originalNumber = Number(numberText);
        referencedPictureNumbers.add(originalNumber);
        const compiledNumber = originalToCompiled.get(originalNumber);
        if (!compiledNumber) {
            errors.push(`${match} 引用了不存在的 Picture ${originalNumber}。`);
            return match;
        }
        return `Picture ${compiledNumber}`;
    });
    const limitedPictures = compiledPictures.slice(0, maxPictures);
    const markupContext = includeMarkupGuides
        ? compiledMarkupPromptContext(markupGuides)
        : imageMarkupPromptContext(usable);
    return {
        prompt: markupContext ? `${compiledPrompt.trim()}\n\n${markupContext}` : compiledPrompt,
        pictures: limitedPictures,
        referencedPictureNumbers: [...referencedPictureNumbers].sort((left, right) => left - right),
        errors: [...new Set(errors)]
    };
}
export function compileQwenImageEditPrompt(prompt, pictures) {
    return compileImagePromptWithLimit(prompt, pictures, qwenImageEdit2511Capability.maxPictures, "Qwen 2511", true);
}
const qwenCropStitchPreservationContract = [
    "Fusion repair contract: the Mask is a location-only edit boundary, not visible content.",
    "Modify only the masked region and the smallest feathered edge needed to make the composite natural.",
    "Correct local lighting direction, color temperature, contact shadows, perspective, depth of field, grain, and cutout edges only where needed for the requested blend.",
    "Preserve every unmasked pixel, object, identity, texture, composition, and background detail exactly; do not add unrelated objects, text, logos, watermarks, borders, arrows, labels, or mask graphics."
].join(" ");
export function compileQwenImageEditCropStitchPrompt(prompt, pictures) {
    const ordered = orderedPictures(pictures);
    const usable = ordered.filter((picture) => picture.absolutePath.trim());
    const errors = [];
    ordered
        .filter((picture) => !picture.absolutePath.trim())
        .forEach((picture) => errors.push(`Picture ${picture.pictureNumber} 尚未添加图片。`));
    if (ordered.length > 1) {
        errors.push("Qwen 局部融合修复只支持一张基础 Picture。其他参考图请先合成到同一张底图中。");
    }
    const picture = usable[0];
    const originalPictureNumber = picture?.pictureNumber;
    const compiledPrompt = prompt.replace(pictureReferencePattern, (match, numberText) => {
        const originalNumber = Number(numberText);
        if (originalNumber !== originalPictureNumber) {
            errors.push(`${match} 引用了不存在的 Picture ${originalNumber}。局部融合修复只能引用 Picture 1。`);
            return match;
        }
        return "Picture 1";
    }).trim();
    return {
        prompt: [compiledPrompt, qwenCropStitchPreservationContract].filter(Boolean).join("\n\n"),
        pictures: picture ? [{ ...picture, pictureNumber: 1 }] : [],
        referencedPictureNumbers: originalPictureNumber ? [originalPictureNumber] : [],
        errors: [...new Set(errors)]
    };
}
export function compileFlux2Klein4bPrompt(prompt, pictures) {
    return compileImagePromptWithLimit(prompt, pictures, flux2Klein4bCapability.maxPictures, "FLUX.2 Klein 4B");
}
const zImageMarkupContract = [
    "Annotation and Mask contract:",
    "A saved Mask is a location-only edit boundary. Change the masked region and the minimum surrounding pixels needed for a natural result; preserve unmasked content.",
    "Canvas annotations are also location-only guidance. Never reproduce colored marks, boxes, arrows, labels, notes, or annotation text in the output.",
    "Keep the source subject identity, composition, lighting, and visible text unless the user's request explicitly changes them."
].join("\n");
function zImagePictureWithMarkupGuide(picture) {
    return {
        ...picture,
        id: `${picture.id}-z-image-markup-r${picture.markup?.revision ?? 0}`,
        pictureNumber: 1,
        absolutePath: picture.markup?.renderedPath.trim() ?? picture.absolutePath,
        crop: undefined,
        markup: undefined
    };
}
/**
 * Z-Image has one visual input rather than Qwen's multi-picture contract. When
 * a user marks a picture without a binary mask, upload the rendered annotation
 * as that single visual guide and make the cleanup rule explicit in the text.
 */
export function compileZImagePrompt(prompt, pictures) {
    const ordered = orderedPictures(pictures);
    const errors = [];
    ordered
        .filter((picture) => !picture.absolutePath.trim())
        .forEach((picture) => errors.push(`Picture ${picture.pictureNumber} 尚未添加图片。`));
    if (ordered.length > zImageCapability.maxPictures) {
        errors.push("Z-Image 工作流最多支持一张 Picture。请先合成为一张底图。");
    }
    const picture = ordered.find((candidate) => candidate.absolutePath.trim());
    const originalPictureNumber = picture?.pictureNumber;
    const referencedPictureNumbers = new Set();
    const compiledPrompt = prompt.replace(pictureReferencePattern, (match, numberText) => {
        const originalNumber = Number(numberText);
        referencedPictureNumbers.add(originalNumber);
        if (originalNumber !== originalPictureNumber) {
            errors.push(`${match} 引用了不存在的 Picture ${originalNumber}。Z-Image 只接收 Picture 1。`);
            return match;
        }
        return "Picture 1";
    }).trim();
    const hasMask = Boolean(picture?.mask?.regionCount && picture.mask.maskPath.trim());
    const hasMarkupGuide = Boolean(picture?.markup?.objectCount && picture.markup.renderedPath.trim());
    const compiledPicture = picture
        ? hasMarkupGuide && !hasMask
            ? zImagePictureWithMarkupGuide(picture)
            : { ...picture, pictureNumber: 1 }
        : undefined;
    const promptParts = [compiledPrompt];
    if (hasMarkupGuide || hasMask)
        promptParts.push(zImageMarkupContract);
    if (hasMarkupGuide) {
        promptParts.push(`Annotation notes for Picture 1: ${picture?.markup?.summary.trim() || `${picture?.markup?.objectCount ?? 0} marked target(s)`}.`);
    }
    return {
        prompt: promptParts.filter(Boolean).join("\n\n"),
        pictures: compiledPicture ? [compiledPicture] : [],
        referencedPictureNumbers: [...referencedPictureNumbers].sort((left, right) => left - right),
        errors: [...new Set(errors)]
    };
}
const hidreamO1MarkupContract = [
    "HiDream-O1-Image reference and local-edit contract:",
    "With one reference Picture, describe the requested instruction edit relative to Picture 1 and preserve the subject identity, composition, lighting, perspective, and visible text unless the user explicitly changes them.",
    "A saved Mask is a location-only edit boundary. Change the masked region and the minimum feathered surroundings; preserve all unmasked pixels because the final image will be composited back over the original source.",
    "Canvas annotations are location-only guidance. Never reproduce colored marks, boxes, arrows, labels, notes, or annotation text in the output. Use the annotation notes only to identify the requested targets.",
    "For viewpoint changes, state the new camera angle, viewing direction, subject orientation, framing, and spatial relationships. For added detail, specify the affected material, texture, light, shadow, perspective, depth, and natural edge blending."
].join("\n");
function hidreamO1PictureWithMarkupGuide(picture) {
    return {
        ...picture,
        id: `${picture.id}-hidream-o1-markup-r${picture.markup?.revision ?? 0}`,
        pictureNumber: 1,
        absolutePath: picture.markup?.renderedPath.trim() ?? picture.absolutePath,
        crop: undefined,
        markup: undefined
    };
}
/** HiDream-O1 uses one reference image; annotations without a binary mask use the rendered guide. */
export function compileHiDreamO1Prompt(prompt, pictures) {
    const ordered = orderedPictures(pictures);
    const errors = [];
    ordered
        .filter((picture) => !picture.absolutePath.trim())
        .forEach((picture) => errors.push(`Picture ${picture.pictureNumber} 尚未添加图片。`));
    if (ordered.length > hidreamO1Capability.maxPictures) {
        errors.push("HiDream-O1-Image 工作流最多支持一张 Picture。请先合成为一张底图。");
    }
    const picture = ordered.find((candidate) => candidate.absolutePath.trim());
    const originalPictureNumber = picture?.pictureNumber;
    const referencedPictureNumbers = new Set();
    const compiledPrompt = prompt.replace(pictureReferencePattern, (match, numberText) => {
        const originalNumber = Number(numberText);
        referencedPictureNumbers.add(originalNumber);
        if (originalNumber !== originalPictureNumber) {
            errors.push(`${match} 引用了不存在的 Picture ${originalNumber}。HiDream-O1-Image 只接收 Picture 1。`);
            return match;
        }
        return "Picture 1";
    }).trim();
    const hasMask = Boolean(picture?.mask?.regionCount && picture.mask.maskPath.trim());
    const hasMarkupGuide = Boolean(picture?.markup?.objectCount && picture.markup.renderedPath.trim());
    const compiledPicture = picture
        ? hasMarkupGuide && !hasMask
            ? hidreamO1PictureWithMarkupGuide(picture)
            : { ...picture, pictureNumber: 1 }
        : undefined;
    const promptParts = [compiledPrompt];
    if (hasMarkupGuide || hasMask)
        promptParts.push(hidreamO1MarkupContract);
    if (hasMarkupGuide) {
        promptParts.push(`Annotation notes for Picture 1: ${picture?.markup?.summary.trim() || `${picture?.markup?.objectCount ?? 0} marked target(s)`}.`);
    }
    return {
        prompt: promptParts.filter(Boolean).join("\n\n"),
        pictures: compiledPicture ? [compiledPicture] : [],
        referencedPictureNumbers: [...referencedPictureNumbers].sort((left, right) => left - right),
        errors: [...new Set(errors)]
    };
}
export function imageOutputFormatFromFilename(filename) {
    const extension = filename.toLowerCase().split(".").pop();
    if (extension === "png")
        return "png";
    if (extension === "jpg" || extension === "jpeg")
        return "jpeg";
    if (extension === "webp")
        return "webp";
    return undefined;
}
export function imageOutputCandidateFromValue(value) {
    if (!value || typeof value !== "object")
        return null;
    const source = value;
    if (typeof source.filename !== "string" || !source.filename.trim())
        return null;
    return {
        filename: source.filename,
        subfolder: typeof source.subfolder === "string" ? source.subfolder : "",
        type: typeof source.type === "string" ? source.type : "output",
        format: imageOutputFormatFromFilename(source.filename)
    };
}
export function imageQualityProfileRequiresLightning(qualityProfile) {
    return qualityProfile === "lightning-4step";
}
export function imageLightningComponentFound(components) {
    return components.some((component) => component.label.includes("Lightning LoRA") && component.found);
}
function imageReferenceInputs(pictures, nodePrefix) {
    return Object.fromEntries(pictures.slice(0, qwenImageEdit2511Capability.maxPictures).map((picture, index) => [
        `image${index + 1}`,
        [`${nodePrefix}-${picture.id}`, 0]
    ]));
}
function exactImageDimension(value, fallback) {
    const dimension = value ?? fallback;
    if (!Number.isInteger(dimension) || dimension <= 0) {
        throw new Error("图片输出尺寸无效，无法保持 Picture 1 的原始尺寸。");
    }
    return dimension;
}
export function validateQwenImageEdit2511Workflow(workflow, qualityProfile = "native", allowImagePlaceholders = false) {
    const nodeTypes = new Set(Object.values(workflow).map((node) => node.class_type));
    const required = [
        ...qwenImageEdit2511RequiredNodeTypes,
        ...(qualityProfile === "lightning-4step" ? qwenImageEdit2511LightningNodeTypes : [])
    ];
    const errors = required
        .filter((nodeType) => !nodeTypes.has(nodeType))
        .map((nodeType) => `图片工作流缺少节点 ${nodeType}。`);
    const inputNodes = Object.values(workflow).filter((node) => node.class_type === "LoadImage");
    if (inputNodes.length < 1 || inputNodes.length > qwenImageEdit2511Capability.maxPictures) {
        errors.push(`图片工作流必须包含 1–${qwenImageEdit2511Capability.maxPictures} 个 LoadImage 节点。`);
    }
    const unresolvedPlaceholders = Object.values(workflow).flatMap((node) => Object.values(node.inputs).filter((value) => typeof value === "string" && /^\{\{IMAGE_\d+\}\}$/u.test(value)));
    if (unresolvedPlaceholders.length && !allowImagePlaceholders) {
        errors.push("图片工作流仍包含未上传的 IMAGE 占位符。");
    }
    return [...new Set(errors)];
}
export function validateQwenImageEdit2511CropStitchWorkflow(workflow, _qualityProfile = "native", allowImagePlaceholders = false) {
    const nodeTypes = new Set(Object.values(workflow).map((node) => node.class_type));
    const errors = qwenImageEdit2511CropStitchRequiredNodeTypes
        .filter((nodeType) => !nodeTypes.has(nodeType))
        .map((nodeType) => `Qwen Crop/Stitch 工作流缺少节点 ${nodeType}。`);
    const inputNodes = Object.values(workflow).filter((node) => node.class_type === "LoadImage");
    if (inputNodes.length !== 1)
        errors.push("Qwen Crop/Stitch 工作流必须包含 1 个 LoadImage 节点。");
    const maskNodes = Object.values(workflow).filter((node) => node.class_type === "LoadImageMask");
    if (maskNodes.length !== 1)
        errors.push("Qwen Crop/Stitch 工作流必须包含 1 个 LoadImageMask 节点。");
    const unresolved = Object.values(workflow).flatMap((node) => Object.values(node.inputs).filter((value) => typeof value === "string" && /^\{\{(?:IMAGE|MASK)_\d+\}\}$/u.test(value)));
    if (unresolved.length && !allowImagePlaceholders) {
        errors.push("Qwen Crop/Stitch 工作流仍包含未上传的图片或 Mask 占位符。");
    }
    return [...new Set(errors)];
}
export function validateFlux2Klein4bWorkflow(workflow, _qualityProfile = "native", allowImagePlaceholders = false) {
    const nodeTypes = new Set(Object.values(workflow).map((node) => node.class_type));
    const errors = flux2Klein4bRequiredNodeTypes
        .filter((nodeType) => !nodeTypes.has(nodeType))
        .map((nodeType) => `FLUX.2 Klein workflow 缺少节点 ${nodeType}。`);
    const inputNodes = Object.values(workflow).filter((node) => node.class_type === "LoadImage");
    if (inputNodes.length !== 1) {
        errors.push("FLUX.2 Klein 4B 工作流必须包含 1 个 LoadImage 节点。");
    }
    const unresolvedPlaceholders = Object.values(workflow).flatMap((node) => Object.values(node.inputs).filter((value) => typeof value === "string" && /^\{\{IMAGE_\d+\}\}$/u.test(value)));
    if (unresolvedPlaceholders.length && !allowImagePlaceholders) {
        errors.push("FLUX.2 Klein 工作流仍包含未上传的 IMAGE 占位符。");
    }
    return [...new Set(errors)];
}
const zImageBaseCoreNodeTypes = [
    "CLIPLoader",
    "UNETLoader",
    "VAELoader",
    "CLIPTextEncode",
    "ModelSamplingAuraFlow",
    "KSampler",
    "VAEDecode",
    "ImageScale",
    "SaveImage"
];
const zImageTurboCoreNodeTypes = [
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
    "SaveImage"
];
function unresolvedImagePlaceholders(workflow) {
    return Object.values(workflow).flatMap((node) => Object.values(node.inputs).filter((value) => typeof value === "string" && /^\{\{(?:IMAGE|MASK)_\d+\}\}$/u.test(value))).map(String);
}
export function validateZImageWorkflow(workflow, _qualityProfile = "native", allowImagePlaceholders = false) {
    const nodeTypes = new Set(Object.values(workflow).map((node) => node.class_type));
    const errors = zImageBaseCoreNodeTypes
        .filter((nodeType) => !nodeTypes.has(nodeType))
        .map((nodeType) => `Z-Image 工作流缺少节点 ${nodeType}。`);
    const inputNodes = Object.values(workflow).filter((node) => node.class_type === "LoadImage");
    const maskNodes = Object.values(workflow).filter((node) => node.class_type === "LoadImageMask");
    if (inputNodes.length > 1)
        errors.push("Z-Image 工作流最多包含 1 个 LoadImage 节点。");
    if (maskNodes.length > 1)
        errors.push("Z-Image 工作流最多包含 1 个 LoadImageMask 节点。");
    if (inputNodes.length === 0 && maskNodes.length > 0) {
        errors.push("Z-Image 的 Mask 必须绑定一张参考 Picture。");
    }
    if (inputNodes.length === 0 && !nodeTypes.has("EmptySD3LatentImage")) {
        errors.push("Z-Image 文生图工作流缺少节点 EmptySD3LatentImage。");
    }
    if (inputNodes.length === 1) {
        if (maskNodes.length === 1 && !nodeTypes.has("VAEEncodeForInpaint")) {
            errors.push("Z-Image Mask 工作流缺少节点 VAEEncodeForInpaint。");
        }
        else if (maskNodes.length === 0 && !nodeTypes.has("VAEEncode")) {
            errors.push("Z-Image 图生图工作流缺少节点 VAEEncode。");
        }
    }
    if (!allowImagePlaceholders && unresolvedImagePlaceholders(workflow).length) {
        errors.push("Z-Image 工作流仍包含未上传的图片或 Mask 占位符。");
    }
    return [...new Set(errors)];
}
export function validateZImageTurboWorkflow(workflow, _qualityProfile = "turbo-8", allowImagePlaceholders = false) {
    const nodeTypes = new Set(Object.values(workflow).map((node) => node.class_type));
    const errors = zImageTurboCoreNodeTypes
        .filter((nodeType) => !nodeTypes.has(nodeType))
        .map((nodeType) => `Z-Image-Turbo 工作流缺少节点 ${nodeType}。`);
    const inputNodes = Object.values(workflow).filter((node) => node.class_type === "LoadImage");
    const maskNodes = Object.values(workflow).filter((node) => node.class_type === "LoadImageMask");
    if (inputNodes.length > 1)
        errors.push("Z-Image-Turbo 工作流最多包含 1 个 LoadImage 节点。");
    if (maskNodes.length > 1)
        errors.push("Z-Image-Turbo 工作流最多包含 1 个 LoadImageMask 节点。");
    if (inputNodes.length === 1) {
        for (const nodeType of ["Canny", "ModelPatchLoader", "ZImageFunControlnet"]) {
            if (!nodeTypes.has(nodeType))
                errors.push(`Z-Image-Turbo 参考图工作流缺少节点 ${nodeType}。`);
        }
    }
    else if (maskNodes.length) {
        errors.push("Z-Image-Turbo 的 Mask 必须绑定一张参考 Picture。");
    }
    if (!allowImagePlaceholders && unresolvedImagePlaceholders(workflow).length) {
        errors.push("Z-Image-Turbo 工作流仍包含未上传的图片或 Mask 占位符。");
    }
    return [...new Set(errors)];
}
const hidreamO1CoreNodeTypes = [
    "CheckpointLoaderSimple",
    "ModelNoiseScale",
    "HiDreamO1PatchSeamSmoothing",
    "CLIPTextEncode",
    "EmptyHiDreamO1LatentImage",
    "BasicScheduler",
    "KSamplerSelect",
    "SamplerCustom",
    "VAEDecode",
    "ImageScale",
    "SaveImage"
];
export function validateHiDreamO1Workflow(workflow, _qualityProfile = "native", allowImagePlaceholders = false) {
    const nodeTypes = new Set(Object.values(workflow).map((node) => node.class_type));
    const errors = hidreamO1CoreNodeTypes
        .filter((nodeType) => !nodeTypes.has(nodeType))
        .map((nodeType) => `HiDream-O1-Image 工作流缺少节点 ${nodeType}。`);
    const inputNodes = Object.values(workflow).filter((node) => node.class_type === "LoadImage");
    const referenceNodes = Object.values(workflow).filter((node) => node.class_type === "HiDreamO1ReferenceImages");
    const maskNodes = Object.values(workflow).filter((node) => node.class_type === "LoadImageMask");
    const compositeNodes = Object.values(workflow).filter((node) => node.class_type === "ImageCompositeMasked");
    if (inputNodes.length > 1)
        errors.push("HiDream-O1-Image 工作流最多包含 1 个 LoadImage 节点。");
    if (referenceNodes.length > 1)
        errors.push("HiDream-O1-Image 工作流最多包含 1 个 HiDreamO1ReferenceImages 节点。");
    if (maskNodes.length > 1)
        errors.push("HiDream-O1-Image 工作流最多包含 1 个 LoadImageMask 节点。");
    if (compositeNodes.length > 1)
        errors.push("HiDream-O1-Image 工作流最多包含 1 个 ImageCompositeMasked 节点。");
    if (inputNodes.length === 1 && referenceNodes.length !== 1) {
        errors.push("HiDream-O1-Image 参考图工作流缺少 HiDreamO1ReferenceImages 节点。");
    }
    if (inputNodes.length === 0 && referenceNodes.length > 0) {
        errors.push("HiDream-O1-Image 的 HiDreamO1ReferenceImages 节点必须绑定一张参考图。");
    }
    if (maskNodes.length > 0 && inputNodes.length !== 1) {
        errors.push("HiDream-O1-Image 的 Mask 必须绑定一张参考 Picture。");
    }
    if (maskNodes.length > 0 && compositeNodes.length !== 1) {
        errors.push("HiDream-O1-Image 的 Mask 工作流缺少 ImageCompositeMasked 节点。");
    }
    if (maskNodes.length === 0 && compositeNodes.length > 0) {
        errors.push("HiDream-O1-Image 的 ImageCompositeMasked 节点必须绑定一个 Mask。");
    }
    if (!allowImagePlaceholders && unresolvedImagePlaceholders(workflow).length) {
        errors.push("HiDream-O1-Image 工作流仍包含未上传的图片或 Mask 占位符。");
    }
    return [...new Set(errors)];
}
export function buildQwenImageEdit2511Workflow(task, run) {
    const compiled = compileQwenImageEditPrompt(task.prompt, task.pictures);
    if (compiled.errors.length) {
        throw new Error(compiled.errors.join(" "));
    }
    if (!compiled.pictures.length) {
        throw new Error("Qwen Image Edit 至少需要一张基础 Picture。");
    }
    const quality = qwenImageEdit2511Capability.qualityProfiles.find((profile) => profile.id === task.qualityProfile) ?? qwenImageEdit2511Capability.qualityProfiles[0];
    const pictureNodes = Object.fromEntries(compiled.pictures.map((picture, index) => [
        `image-${picture.id}`,
        {
            class_type: "LoadImage",
            inputs: { image: `{{IMAGE_${index}}}` }
        }
    ]));
    const positiveInputs = {
        clip: ["clip", 0],
        prompt: compiled.prompt,
        vae: ["vae", 0],
        ...imageReferenceInputs(compiled.pictures, "image")
    };
    const negativeInputs = {
        clip: ["clip", 0],
        prompt: "",
        vae: ["vae", 0],
        ...imageReferenceInputs(compiled.pictures, "image")
    };
    const outputWidth = exactImageDimension(task.outputWidth, compiled.pictures[0]?.width ?? 0);
    const outputHeight = exactImageDimension(task.outputHeight, compiled.pictures[0]?.height ?? 0);
    const outputPrefix = [
        task.imageOutputSubfolder?.replace(/[\\/]+/gu, "/").replace(/^\/+|\/+$/gu, ""),
        `QwenEdit_${task.outputFilename}_${run.index + 1}`
    ].filter(Boolean).join("/");
    const modelNode = {
        ...pictureNodes,
        clip: {
            class_type: "CLIPLoader",
            inputs: {
                clip_name: qwenImageTextEncoder,
                type: "qwen_image",
                device: "cpu"
            }
        },
        vae: {
            class_type: "VAELoader",
            inputs: { vae_name: qwenImageVae }
        },
        model: {
            class_type: "UNETLoader",
            inputs: {
                unet_name: task.diffusionModelFilename || qwenImageDiffusionModel,
                weight_dtype: "default"
            }
        },
        positive: {
            class_type: "TextEncodeQwenImageEditPlus",
            inputs: positiveInputs
        },
        negative: {
            class_type: "TextEncodeQwenImageEditPlus",
            inputs: negativeInputs
        },
        positiveReference: {
            class_type: "FluxKontextMultiReferenceLatentMethod",
            inputs: {
                conditioning: ["positive", 0],
                reference_latents_method: "index_timestep_zero"
            }
        },
        negativeReference: {
            class_type: "FluxKontextMultiReferenceLatentMethod",
            inputs: {
                conditioning: ["negative", 0],
                reference_latents_method: "index_timestep_zero"
            }
        },
        sampling: {
            class_type: "ModelSamplingAuraFlow",
            inputs: {
                model: ["model", 0],
                shift: 3.1
            }
        },
        cfgNorm: {
            class_type: "CFGNorm",
            inputs: {
                model: quality.lightning ? ["lightningModel", 0] : ["sampling", 0],
                strength: 1
            }
        },
        sourceImage: {
            class_type: "FluxKontextImageScale",
            inputs: {
                image: [`image-${compiled.pictures[0]?.id ?? "missing"}`, 0]
            }
        },
        source: {
            class_type: "VAEEncode",
            inputs: {
                pixels: ["sourceImage", 0],
                vae: ["vae", 0]
            }
        },
        sampler: {
            class_type: "KSampler",
            inputs: {
                model: quality.lightning
                    ? ["lightningModel", 0]
                    : ["cfgNorm", 0],
                positive: ["positiveReference", 0],
                negative: ["negativeReference", 0],
                latent_image: ["source", 0],
                seed: run.seed,
                steps: quality.steps,
                cfg: quality.cfg,
                sampler_name: "euler",
                scheduler: "simple",
                denoise: 1
            }
        },
        decoded: {
            class_type: "VAEDecode",
            inputs: {
                samples: ["sampler", 0],
                vae: ["vae", 0]
            }
        },
        exactSize: {
            class_type: "ImageScale",
            inputs: {
                image: ["decoded", 0],
                upscale_method: "lanczos",
                width: outputWidth,
                height: outputHeight,
                crop: "disabled"
            }
        },
        save: {
            class_type: "SaveImage",
            inputs: {
                images: ["exactSize", 0],
                filename_prefix: outputPrefix
            }
        }
    };
    if (quality.lightning) {
        modelNode.lightningModel = {
            class_type: "LoraLoaderModelOnly",
            inputs: {
                model: ["sampling", 0],
                lora_name: qwenImageLightningLora,
                strength_model: 1
            }
        };
    }
    const validationErrors = validateQwenImageEdit2511Workflow(modelNode, quality.id, true);
    if (validationErrors.length)
        throw new Error(validationErrors.join(" "));
    return modelNode;
}
export function buildQwenImageEdit2511CropStitchWorkflow(task, run) {
    const compiled = compileQwenImageEditCropStitchPrompt(task.prompt, task.pictures);
    if (compiled.errors.length)
        throw new Error(compiled.errors.join(" "));
    const picture = compiled.pictures[0];
    if (!picture)
        throw new Error("Qwen 局部融合修复至少需要一张基础 Picture。");
    if (!picture.mask?.maskPath.trim())
        throw new Error("Qwen 局部融合修复需要先保存 Mask。");
    const quality = qwenImageEdit2511CropStitchCapability.qualityProfiles.find((profile) => profile.id === task.qualityProfile) ?? qwenImageEdit2511CropStitchCapability.qualityProfiles[0];
    const outputWidth = exactImageDimension(task.outputWidth, picture.width);
    const outputHeight = exactImageDimension(task.outputHeight, picture.height);
    const outputPrefix = [
        task.imageOutputSubfolder?.replace(/[\\/]+/gu, "/").replace(/^\/+|\/+$/gu, ""),
        `QwenFusion_${task.outputFilename}_${run.index + 1}`
    ].filter(Boolean).join("/");
    const cropTarget = 1024;
    const workflow = {
        source: {
            class_type: "LoadImage",
            inputs: { image: "{{IMAGE_0}}" }
        },
        mask: {
            class_type: "LoadImageMask",
            inputs: { image: "{{MASK_0}}", channel: "red" }
        },
        crop: {
            class_type: "InpaintCropImproved",
            inputs: {
                image: ["source", 0],
                downscale_algorithm: "bilinear",
                upscale_algorithm: "bicubic",
                preresize: false,
                preresize_mode: "ensure minimum resolution",
                preresize_min_width: 1024,
                preresize_min_height: 1024,
                preresize_max_width: 16384,
                preresize_max_height: 16384,
                mask_fill_holes: true,
                mask_expand_pixels: 0,
                mask_invert: false,
                mask_blend_pixels: 16,
                mask_hipass_filter: 0.1,
                extend_for_outpainting: false,
                extend_up_factor: 1,
                extend_down_factor: 1,
                extend_left_factor: 1,
                extend_right_factor: 1,
                context_from_mask_extend_factor: 1.2,
                output_resize_to_target_size: true,
                output_target_width: cropTarget,
                output_target_height: cropTarget,
                output_padding: "32",
                device_mode: "gpu (much faster)",
                mask: ["mask", 0]
            }
        },
        clip: {
            class_type: "CLIPLoader",
            inputs: {
                clip_name: qwenImageTextEncoder,
                type: "qwen_image",
                device: "cpu"
            }
        },
        vae: {
            class_type: "VAELoader",
            inputs: { vae_name: qwenImageVae }
        },
        model: {
            class_type: "UNETLoader",
            inputs: {
                unet_name: task.diffusionModelFilename || qwenImageDiffusionModel,
                weight_dtype: "default"
            }
        },
        positive: {
            class_type: "TextEncodeQwenImageEditPlus",
            inputs: {
                clip: ["clip", 0],
                prompt: compiled.prompt,
                vae: ["vae", 0],
                image1: ["crop", 1]
            }
        },
        negative: {
            class_type: "TextEncodeQwenImageEditPlus",
            inputs: {
                clip: ["clip", 0],
                prompt: "",
                vae: ["vae", 0],
                image1: ["crop", 1]
            }
        },
        positiveReference: {
            class_type: "FluxKontextMultiReferenceLatentMethod",
            inputs: {
                conditioning: ["positive", 0],
                reference_latents_method: "index_timestep_zero"
            }
        },
        negativeReference: {
            class_type: "FluxKontextMultiReferenceLatentMethod",
            inputs: {
                conditioning: ["negative", 0],
                reference_latents_method: "index_timestep_zero"
            }
        },
        sampling: {
            class_type: "ModelSamplingAuraFlow",
            inputs: { model: ["model", 0], shift: 3.1 }
        },
        cfgNorm: {
            class_type: "CFGNorm",
            inputs: { model: ["sampling", 0], strength: 1 }
        },
        sourceImage: {
            class_type: "FluxKontextImageScale",
            inputs: { image: ["crop", 1] }
        },
        sourceLatent: {
            class_type: "VAEEncode",
            inputs: { pixels: ["sourceImage", 0], vae: ["vae", 0] }
        },
        sampler: {
            class_type: "KSampler",
            inputs: {
                model: ["cfgNorm", 0],
                positive: ["positiveReference", 0],
                negative: ["negativeReference", 0],
                latent_image: ["sourceLatent", 0],
                seed: run.seed,
                steps: quality.steps,
                cfg: quality.cfg,
                sampler_name: "euler",
                scheduler: "simple",
                denoise: 1
            }
        },
        decoded: {
            class_type: "VAEDecode",
            inputs: { samples: ["sampler", 0], vae: ["vae", 0] }
        },
        cropOutput: {
            class_type: "ImageScale",
            inputs: {
                image: ["decoded", 0],
                upscale_method: "lanczos",
                width: cropTarget,
                height: cropTarget,
                crop: "disabled"
            }
        },
        stitched: {
            class_type: "InpaintStitchImproved",
            inputs: {
                stitcher: ["crop", 0],
                inpainted_image: ["cropOutput", 0]
            }
        },
        exactSize: {
            class_type: "ImageScale",
            inputs: {
                image: ["stitched", 0],
                upscale_method: "lanczos",
                width: outputWidth,
                height: outputHeight,
                crop: "disabled"
            }
        },
        save: {
            class_type: "SaveImage",
            inputs: { images: ["exactSize", 0], filename_prefix: outputPrefix }
        }
    };
    const validationErrors = validateQwenImageEdit2511CropStitchWorkflow(workflow, quality.id, true);
    if (validationErrors.length)
        throw new Error(validationErrors.join(" "));
    return workflow;
}
export function buildFlux2Klein4bWorkflow(task, run) {
    const compiled = compileFlux2Klein4bPrompt(task.prompt, task.pictures);
    if (compiled.errors.length)
        throw new Error(compiled.errors.join(" "));
    const picture = compiled.pictures[0];
    if (!picture)
        throw new Error("FLUX.2 Klein 4B 至少需要一张基础 Picture。");
    const quality = flux2Klein4bCapability.qualityProfiles.find((profile) => profile.id === task.qualityProfile) ?? flux2Klein4bCapability.qualityProfiles[0];
    const outputWidth = exactImageDimension(task.outputWidth, picture.width);
    const outputHeight = exactImageDimension(task.outputHeight, picture.height);
    const outputPrefix = [
        task.imageOutputSubfolder?.replace(/[\\/]+/gu, "/").replace(/^\/+|\/+$/gu, ""),
        `Flux2Klein_${task.outputFilename}_${run.index + 1}`
    ].filter(Boolean).join("/");
    return {
        input: {
            class_type: "LoadImage",
            inputs: { image: "{{IMAGE_0}}" }
        },
        scaledImage: {
            class_type: "ImageScaleToTotalPixels",
            inputs: {
                image: ["input", 0],
                upscale_method: "nearest-exact",
                megapixels: 1,
                resolution_steps: 1
            }
        },
        imageSize: {
            class_type: "GetImageSize",
            inputs: { image: ["scaledImage", 0] }
        },
        clip: {
            class_type: "CLIPLoader",
            inputs: {
                clip_name: flux2Klein4bTextEncoder,
                type: "flux2",
                device: "cpu"
            }
        },
        vae: {
            class_type: "VAELoader",
            inputs: { vae_name: flux2Klein4bVae }
        },
        model: {
            class_type: "UNETLoader",
            inputs: {
                unet_name: task.diffusionModelFilename || flux2Klein4bDiffusionModel,
                weight_dtype: "default"
            }
        },
        positive: {
            class_type: "CLIPTextEncode",
            inputs: { clip: ["clip", 0], text: compiled.prompt }
        },
        negative: {
            class_type: "CLIPTextEncode",
            inputs: { clip: ["clip", 0], text: "" }
        },
        referenceImage: {
            class_type: "VAEEncode",
            inputs: { pixels: ["scaledImage", 0], vae: ["vae", 0] }
        },
        positiveReference: {
            class_type: "ReferenceLatent",
            inputs: { conditioning: ["positive", 0], latent: ["referenceImage", 0] }
        },
        negativeReference: {
            class_type: "ReferenceLatent",
            inputs: { conditioning: ["negative", 0], latent: ["referenceImage", 0] }
        },
        latent: {
            class_type: "EmptyFlux2LatentImage",
            inputs: {
                width: ["imageSize", 0],
                height: ["imageSize", 1],
                batch_size: 1
            }
        },
        noise: {
            class_type: "RandomNoise",
            inputs: { noise_seed: run.seed }
        },
        sampler: {
            class_type: "KSamplerSelect",
            inputs: { sampler_name: "euler" }
        },
        scheduler: {
            class_type: "Flux2Scheduler",
            inputs: {
                steps: quality.steps,
                width: ["imageSize", 0],
                height: ["imageSize", 1]
            }
        },
        guider: {
            class_type: "CFGGuider",
            inputs: {
                model: ["model", 0],
                positive: ["positiveReference", 0],
                negative: ["negativeReference", 0],
                cfg: quality.cfg
            }
        },
        sampled: {
            class_type: "SamplerCustomAdvanced",
            inputs: {
                noise: ["noise", 0],
                guider: ["guider", 0],
                sampler: ["sampler", 0],
                sigmas: ["scheduler", 0],
                latent_image: ["latent", 0]
            }
        },
        decoded: {
            class_type: "VAEDecode",
            inputs: { samples: ["sampled", 0], vae: ["vae", 0] }
        },
        exactSize: {
            class_type: "ImageScale",
            inputs: {
                image: ["decoded", 0],
                upscale_method: "lanczos",
                width: outputWidth,
                height: outputHeight,
                crop: "disabled"
            }
        },
        save: {
            class_type: "SaveImage",
            inputs: { images: ["exactSize", 0], filename_prefix: outputPrefix }
        }
    };
}
function zImageQualityProfile(capability, requestedId) {
    return capability.qualityProfiles.find((profile) => profile.id === requestedId) ??
        capability.qualityProfiles[0];
}
function zImageOutputDimensions(task, picture, capability) {
    return [
        exactImageDimension(task.outputWidth, picture?.width || capability.textOnlyOutputWidth || 1024),
        exactImageDimension(task.outputHeight, picture?.height || capability.textOnlyOutputHeight || 1024)
    ];
}
function zImageOutputPrefix(task, run, label) {
    return [
        task.imageOutputSubfolder?.replace(/[\\/]+/gu, "/").replace(/^\/+|\/+$/gu, ""),
        `${label}_${task.outputFilename}_${run.index + 1}`
    ].filter(Boolean).join("/");
}
function zImageLoaderNodes(task, modelFilename) {
    return {
        clip: {
            class_type: "CLIPLoader",
            inputs: {
                clip_name: zImageTextEncoder,
                type: "lumina2",
                device: "default"
            }
        },
        vae: {
            class_type: "VAELoader",
            inputs: { vae_name: zImageVae }
        },
        model: {
            class_type: "UNETLoader",
            inputs: {
                unet_name: task.diffusionModelFilename || modelFilename,
                weight_dtype: "default"
            }
        }
    };
}
export function buildZImageWorkflow(task, run) {
    const compiled = compileZImagePrompt(task.prompt, task.pictures);
    if (compiled.errors.length)
        throw new Error(compiled.errors.join(" "));
    const picture = compiled.pictures[0];
    const hasMask = Boolean(picture?.mask?.regionCount && picture.mask.maskPath.trim());
    const quality = zImageQualityProfile(zImageCapability, task.qualityProfile);
    const [outputWidth, outputHeight] = zImageOutputDimensions(task, picture, zImageCapability);
    const latentNodes = picture
        ? {
            input: {
                class_type: "LoadImage",
                inputs: { image: "{{IMAGE_0}}" }
            },
            sourceImage: {
                class_type: "ImageScale",
                inputs: {
                    image: ["input", 0],
                    upscale_method: "lanczos",
                    width: outputWidth,
                    height: outputHeight,
                    crop: "disabled"
                }
            },
            ...(hasMask
                ? {
                    mask: {
                        class_type: "LoadImageMask",
                        inputs: { image: "{{MASK_0}}", channel: "red" }
                    },
                    source: {
                        class_type: "VAEEncodeForInpaint",
                        inputs: {
                            pixels: ["sourceImage", 0],
                            vae: ["vae", 0],
                            mask: ["mask", 0],
                            grow_mask_by: 6
                        }
                    }
                }
                : {
                    source: {
                        class_type: "VAEEncode",
                        inputs: { pixels: ["sourceImage", 0], vae: ["vae", 0] }
                    }
                })
        }
        : {
            latent: {
                class_type: "EmptySD3LatentImage",
                inputs: { width: outputWidth, height: outputHeight, batch_size: 1 }
            }
        };
    const workflow = {
        ...zImageLoaderNodes(task, zImageDiffusionModel),
        ...latentNodes,
        positive: {
            class_type: "CLIPTextEncode",
            inputs: { clip: ["clip", 0], text: compiled.prompt }
        },
        negative: {
            class_type: "CLIPTextEncode",
            inputs: { clip: ["clip", 0], text: "" }
        },
        sampling: {
            class_type: "ModelSamplingAuraFlow",
            inputs: { model: ["model", 0], shift: 3 }
        },
        sampler: {
            class_type: "KSampler",
            inputs: {
                model: ["sampling", 0],
                positive: ["positive", 0],
                negative: ["negative", 0],
                latent_image: [picture ? "source" : "latent", 0],
                seed: run.seed,
                steps: quality.steps,
                cfg: quality.cfg,
                sampler_name: "res_multistep",
                scheduler: "simple",
                denoise: picture ? (hasMask ? 1 : 0.65) : 1
            }
        },
        decoded: {
            class_type: "VAEDecode",
            inputs: { samples: ["sampler", 0], vae: ["vae", 0] }
        },
        exactSize: {
            class_type: "ImageScale",
            inputs: {
                image: ["decoded", 0],
                upscale_method: "lanczos",
                width: outputWidth,
                height: outputHeight,
                crop: "disabled"
            }
        },
        save: {
            class_type: "SaveImage",
            inputs: {
                images: ["exactSize", 0],
                filename_prefix: zImageOutputPrefix(task, run, "ZImage")
            }
        }
    };
    const errors = validateZImageWorkflow(workflow, quality.id, true);
    if (errors.length)
        throw new Error(errors.join(" "));
    return workflow;
}
export function buildZImageTurboWorkflow(task, run) {
    const compiled = compileZImagePrompt(task.prompt, task.pictures);
    if (compiled.errors.length)
        throw new Error(compiled.errors.join(" "));
    const picture = compiled.pictures[0];
    const hasMask = Boolean(picture?.mask?.regionCount && picture.mask.maskPath.trim());
    const quality = zImageQualityProfile(zImageTurboCapability, task.qualityProfile);
    const [outputWidth, outputHeight] = zImageOutputDimensions(task, picture, zImageTurboCapability);
    const workflow = {
        ...zImageLoaderNodes(task, zImageTurboDiffusionModel),
        positive: {
            class_type: "CLIPTextEncode",
            inputs: { clip: ["clip", 0], text: compiled.prompt }
        },
        negativeSource: {
            class_type: "ConditioningZeroOut",
            inputs: { conditioning: ["positive", 0] }
        },
        latent: {
            class_type: "EmptySD3LatentImage",
            inputs: { width: outputWidth, height: outputHeight, batch_size: 1 }
        },
        sampling: {
            class_type: "ModelSamplingAuraFlow",
            inputs: { model: ["model", 0], shift: 3 }
        },
        sampler: {
            class_type: "KSampler",
            inputs: {
                model: ["sampling", 0],
                positive: ["positive", 0],
                negative: ["negativeSource", 0],
                latent_image: ["latent", 0],
                seed: run.seed,
                steps: quality.steps,
                cfg: quality.cfg,
                sampler_name: "res_multistep",
                scheduler: "simple",
                denoise: 1
            }
        },
        decoded: {
            class_type: "VAEDecode",
            inputs: { samples: ["sampler", 0], vae: ["vae", 0] }
        },
        exactSize: {
            class_type: "ImageScale",
            inputs: {
                image: ["decoded", 0],
                upscale_method: "lanczos",
                width: outputWidth,
                height: outputHeight,
                crop: "disabled"
            }
        },
        save: {
            class_type: "SaveImage",
            inputs: {
                images: ["exactSize", 0],
                filename_prefix: zImageOutputPrefix(task, run, "ZImageTurbo")
            }
        }
    };
    if (picture) {
        workflow.input = {
            class_type: "LoadImage",
            inputs: { image: "{{IMAGE_0}}" }
        };
        workflow.patch = {
            class_type: "ModelPatchLoader",
            inputs: { name: zImageTurboFunControlnetPatch }
        };
        workflow.control = {
            class_type: "ZImageFunControlnet",
            inputs: {
                model: ["sampling", 0],
                model_patch: ["patch", 0],
                vae: ["vae", 0],
                strength: 1,
                image: ["controlGuide", 0],
                ...(hasMask
                    ? {
                        inpaint_image: ["input", 0],
                        mask: ["mask", 0]
                    }
                    : {})
            }
        };
        const sampler = workflow.sampler;
        if (!sampler)
            throw new Error("Z-Image-Turbo 工作流缺少采样节点。");
        sampler.inputs.model = ["control", 0];
        workflow.controlGuide = {
            class_type: "Canny",
            inputs: {
                image: ["input", 0],
                low_threshold: 0.1,
                high_threshold: 0.32
            }
        };
        if (hasMask) {
            workflow.mask = {
                class_type: "LoadImageMask",
                inputs: { image: "{{MASK_0}}", channel: "red" }
            };
        }
    }
    const errors = validateZImageTurboWorkflow(workflow, quality.id, true);
    if (errors.length)
        throw new Error(errors.join(" "));
    return workflow;
}
function hidreamO1OutputDimensions(task, picture) {
    return [
        exactImageDimension(task.outputWidth, picture?.width || hidreamO1Capability.textOnlyOutputWidth || 2048),
        exactImageDimension(task.outputHeight, picture?.height || hidreamO1Capability.textOnlyOutputHeight || 2048)
    ];
}
function hidreamO1LatentDimension(value) {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error("HiDream-O1-Image latent 尺寸无效。");
    }
    return Math.max(64, Math.floor(value / 32) * 32);
}
function hidreamO1OutputPrefix(task, run) {
    return [
        task.imageOutputSubfolder?.replace(/[\\/]+/gu, "/").replace(/^\/+|\/+$/gu, ""),
        `HiDreamO1_${task.outputFilename}_${run.index + 1}`
    ].filter(Boolean).join("/");
}
export function buildHiDreamO1Workflow(task, run) {
    const compiled = compileHiDreamO1Prompt(task.prompt, task.pictures);
    if (compiled.errors.length)
        throw new Error(compiled.errors.join(" "));
    const picture = compiled.pictures[0];
    const hasMask = Boolean(picture?.mask?.regionCount && picture.mask.maskPath.trim());
    const quality = zImageQualityProfile(hidreamO1Capability, task.qualityProfile);
    const [outputWidth, outputHeight] = hidreamO1OutputDimensions(task, picture);
    const latentWidth = hidreamO1LatentDimension(outputWidth);
    const latentHeight = hidreamO1LatentDimension(outputHeight);
    const workflow = {
        checkpoint: {
            class_type: "CheckpointLoaderSimple",
            inputs: {
                ckpt_name: task.diffusionModelFilename || hidreamO1DiffusionModel
            }
        },
        scaledModel: {
            class_type: "ModelNoiseScale",
            inputs: { model: ["checkpoint", 0], noise_scale: 8 }
        },
        seamSmoothing: {
            class_type: "HiDreamO1PatchSeamSmoothing",
            inputs: {
                model: ["scaledModel", 0],
                start_percent: 0.8,
                end_percent: 1,
                pattern: "single_shift",
                passes: "ramp_2_4",
                blend: "median",
                strength: 1
            }
        },
        positive: {
            class_type: "CLIPTextEncode",
            inputs: { clip: ["checkpoint", 1], text: compiled.prompt }
        },
        negative: {
            class_type: "CLIPTextEncode",
            inputs: { clip: ["checkpoint", 1], text: "" }
        },
        latent: {
            class_type: "EmptyHiDreamO1LatentImage",
            inputs: { width: latentWidth, height: latentHeight, batch_size: 1 }
        },
        scheduler: {
            class_type: "BasicScheduler",
            inputs: {
                model: ["scaledModel", 0],
                scheduler: "normal",
                steps: quality.steps,
                denoise: 1
            }
        },
        samplerSelect: {
            class_type: "KSamplerSelect",
            inputs: { sampler_name: "dpmpp_2m_sde_gpu" }
        },
        sampler: {
            class_type: "SamplerCustom",
            inputs: {
                model: ["seamSmoothing", 0],
                add_noise: true,
                noise_seed: run.seed,
                cfg: quality.cfg,
                positive: ["positive", 0],
                negative: ["negative", 0],
                sampler: ["samplerSelect", 0],
                sigmas: ["scheduler", 0],
                latent_image: ["latent", 0]
            }
        },
        decoded: {
            class_type: "VAEDecode",
            inputs: { samples: ["sampler", 0], vae: ["checkpoint", 2] }
        },
        exactSize: {
            class_type: "ImageScale",
            inputs: {
                image: ["decoded", 0],
                upscale_method: "lanczos",
                width: outputWidth,
                height: outputHeight,
                crop: "disabled"
            }
        },
        save: {
            class_type: "SaveImage",
            inputs: {
                images: ["exactSize", 0],
                filename_prefix: hidreamO1OutputPrefix(task, run)
            }
        }
    };
    if (picture) {
        workflow.input = {
            class_type: "LoadImage",
            inputs: { image: "{{IMAGE_0}}" }
        };
        workflow.reference = {
            class_type: "HiDreamO1ReferenceImages",
            inputs: {
                positive: ["positive", 0],
                negative: ["negative", 0],
                "images.image_1": ["input", 0]
            }
        };
        const sampler = workflow.sampler;
        if (!sampler)
            throw new Error("HiDream-O1-Image 工作流缺少采样节点。");
        sampler.inputs.positive = ["reference", 0];
        sampler.inputs.negative = ["reference", 1];
    }
    if (hasMask) {
        workflow.mask = {
            class_type: "LoadImageMask",
            inputs: { image: "{{MASK_0}}", channel: "red" }
        };
        workflow.sourceImage = {
            class_type: "ImageScale",
            inputs: {
                image: ["input", 0],
                upscale_method: "lanczos",
                width: outputWidth,
                height: outputHeight,
                crop: "disabled"
            }
        };
        workflow.composite = {
            class_type: "ImageCompositeMasked",
            inputs: {
                destination: ["sourceImage", 0],
                source: ["exactSize", 0],
                x: 0,
                y: 0,
                resize_source: true,
                mask: ["mask", 0]
            }
        };
        const save = workflow.save;
        if (!save)
            throw new Error("HiDream-O1-Image 工作流缺少保存节点。");
        save.inputs.images = ["composite", 0];
    }
    const errors = validateHiDreamO1Workflow(workflow, quality.id, true);
    if (errors.length)
        throw new Error(errors.join(" "));
    return workflow;
}
export function renderImageWorkflow(workflow, uploadedPictures, uploadedMasks = []) {
    const visit = (value) => {
        if (Array.isArray(value))
            return value.map(visit);
        if (value && typeof value === "object") {
            return Object.fromEntries(Object.entries(value).map(([key, child]) => [
                key,
                visit(child)
            ]));
        }
        if (typeof value !== "string")
            return value;
        const exact = value.match(/^\{\{IMAGE_(\d+)\}\}$/u);
        if (exact?.[1])
            return uploadedPictures[Number(exact[1])] ?? value;
        const exactMask = value.match(/^\{\{MASK_(\d+)\}\}$/u);
        if (exactMask?.[1])
            return uploadedMasks[Number(exactMask[1])] ?? value;
        return value
            .replace(/\{\{IMAGE_(\d+)\}\}/gu, (match, indexText) => uploadedPictures[Number(indexText)] ?? match)
            .replace(/\{\{MASK_(\d+)\}\}/gu, (match, indexText) => uploadedMasks[Number(indexText)] ?? match);
    };
    return visit(workflow);
}
export const qwenImageEdit2511Adapter = {
    ...qwenImageEdit2511Capability,
    compilePrompt: compileQwenImageEditPrompt,
    buildWorkflow: buildQwenImageEdit2511Workflow,
    validateWorkflow: validateQwenImageEdit2511Workflow,
    parseOutputs(history) {
        return extractComfyOutputFiles(history)
            .map((file) => imageOutputCandidateFromValue(file))
            .filter((file) => file !== null);
    }
};
export const flux2Klein4bAdapter = {
    ...flux2Klein4bCapability,
    compilePrompt: compileFlux2Klein4bPrompt,
    buildWorkflow: buildFlux2Klein4bWorkflow,
    validateWorkflow: validateFlux2Klein4bWorkflow,
    parseOutputs(history) {
        return extractComfyOutputFiles(history)
            .map((file) => imageOutputCandidateFromValue(file))
            .filter((file) => file !== null);
    }
};
export const zImageAdapter = {
    ...zImageCapability,
    compilePrompt: compileZImagePrompt,
    buildWorkflow: buildZImageWorkflow,
    validateWorkflow: validateZImageWorkflow,
    parseOutputs(history) {
        return extractComfyOutputFiles(history)
            .map((file) => imageOutputCandidateFromValue(file))
            .filter((file) => file !== null);
    }
};
export const zImageTurboAdapter = {
    ...zImageTurboCapability,
    compilePrompt: compileZImagePrompt,
    buildWorkflow: buildZImageTurboWorkflow,
    validateWorkflow: validateZImageTurboWorkflow,
    parseOutputs(history) {
        return extractComfyOutputFiles(history)
            .map((file) => imageOutputCandidateFromValue(file))
            .filter((file) => file !== null);
    }
};
export const hidreamO1Adapter = {
    ...hidreamO1Capability,
    compilePrompt: compileHiDreamO1Prompt,
    buildWorkflow: buildHiDreamO1Workflow,
    validateWorkflow: validateHiDreamO1Workflow,
    parseOutputs(history) {
        return extractComfyOutputFiles(history)
            .map((file) => imageOutputCandidateFromValue(file))
            .filter((file) => file !== null);
    }
};
export const lamaInpaintAdapter = {
    ...lamaInpaintCapability,
    compilePrompt: compileLamaInpaintInput,
    buildWorkflow: buildLamaInpaintWorkflow,
    validateWorkflow: validateLamaInpaintWorkflow,
    parseOutputs(history) {
        return extractComfyOutputFiles(history)
            .map((file) => imageOutputCandidateFromValue(file))
            .filter((file) => file !== null);
    }
};
export const qwenImageEdit2511CropStitchAdapter = {
    ...qwenImageEdit2511CropStitchCapability,
    compilePrompt: compileQwenImageEditCropStitchPrompt,
    buildWorkflow: buildQwenImageEdit2511CropStitchWorkflow,
    validateWorkflow: validateQwenImageEdit2511CropStitchWorkflow,
    parseOutputs(history) {
        return extractComfyOutputFiles(history)
            .map((file) => imageOutputCandidateFromValue(file))
            .filter((file) => file !== null);
    }
};
export function compileBirefnetInput(_prompt, pictures) {
    const picture = orderedPictures(pictures)[0];
    const errors = [];
    if (!picture?.absolutePath.trim())
        errors.push("BiRefNet 自动抠图需要一张原始图片。");
    if (pictures.length > 1)
        errors.push("BiRefNet 自动抠图只支持一张原始图片。");
    return {
        prompt: "",
        pictures: picture?.absolutePath.trim() ? [picture] : [],
        referencedPictureNumbers: [],
        errors
    };
}
export function validateBirefnetWorkflow(workflow, _qualityProfile = "native", allowImagePlaceholders = false) {
    const nodeTypes = new Set(Object.values(workflow).map((node) => node.class_type));
    const errors = birefnetRequiredNodeTypes
        .filter((nodeType) => !nodeTypes.has(nodeType))
        .map((nodeType) => `BiRefNet 工作流缺少节点 ${nodeType}。`);
    const inputNodes = Object.values(workflow).filter((node) => node.class_type === "LoadImage");
    if (inputNodes.length !== 1)
        errors.push("BiRefNet 自动抠图工作流必须包含 1 个 LoadImage 节点。");
    if (!allowImagePlaceholders) {
        const unresolved = Object.values(workflow).flatMap((node) => Object.values(node.inputs).filter((value) => typeof value === "string" && /^\{\{IMAGE_\d+\}\}$/u.test(value)));
        if (unresolved.length)
            errors.push("BiRefNet 工作流仍包含未上传的图片占位符。");
    }
    return [...new Set(errors)];
}
export function buildBirefnetBackgroundRemovalWorkflow(task, run) {
    const compiled = compileBirefnetInput(task.prompt, task.pictures);
    if (compiled.errors.length)
        throw new Error(compiled.errors.join(" "));
    const picture = compiled.pictures[0];
    if (!picture)
        throw new Error("BiRefNet 自动抠图至少需要一张基础 Picture。");
    const outputPrefix = [
        task.imageOutputSubfolder?.replace(/[\\/]+/gu, "/").replace(/^\/+|\/+$/gu, ""),
        `BiRefNet_${task.outputFilename}_${run.index + 1}`
    ].filter(Boolean).join("/");
    const workflow = {
        input: {
            class_type: "LoadImage",
            inputs: { image: "{{IMAGE_0}}" }
        },
        backgroundModel: {
            class_type: "LoadBackgroundRemovalModel",
            inputs: { bg_removal_name: "birefnet.safetensors" }
        },
        foregroundMask: {
            class_type: "RemoveBackground",
            inputs: {
                image: ["input", 0],
                bg_removal_model: ["backgroundModel", 0]
            }
        },
        alphaMask: {
            class_type: "InvertMask",
            inputs: { mask: ["foregroundMask", 0] }
        },
        transparentImage: {
            class_type: "JoinImageWithAlpha",
            inputs: {
                image: ["input", 0],
                alpha: ["alphaMask", 0]
            }
        },
        save: {
            class_type: "SaveImage",
            inputs: {
                images: ["transparentImage", 0],
                filename_prefix: outputPrefix
            }
        }
    };
    const errors = validateBirefnetWorkflow(workflow, task.qualityProfile, true);
    if (errors.length)
        throw new Error(errors.join(" "));
    return workflow;
}
export const imageModelAdapters = {
    [qwenImageEdit2511Adapter.id]: qwenImageEdit2511Adapter,
    [qwenImageEdit2511CropStitchAdapter.id]: qwenImageEdit2511CropStitchAdapter,
    [flux2Klein4bAdapter.id]: flux2Klein4bAdapter,
    [zImageAdapter.id]: zImageAdapter,
    [zImageTurboAdapter.id]: zImageTurboAdapter,
    [hidreamO1Adapter.id]: hidreamO1Adapter,
    [lamaInpaintAdapter.id]: lamaInpaintAdapter,
    [birefnetBackgroundRemovalCapability.id]: {
        ...birefnetBackgroundRemovalCapability,
        compilePrompt: compileBirefnetInput,
        buildWorkflow: buildBirefnetBackgroundRemovalWorkflow,
        validateWorkflow: validateBirefnetWorkflow,
        parseOutputs(history) {
            return extractComfyOutputFiles(history)
                .map((file) => imageOutputCandidateFromValue(file))
                .filter((file) => file !== null);
        }
    }
};
export function imageModelAdapterFor(modelId) {
    return imageModelAdapters[modelId];
}
export function compileLamaInpaintInput(_prompt, pictures) {
    const picture = orderedPictures(pictures)[0];
    const errors = [];
    if (!picture?.absolutePath.trim())
        errors.push("LaMa 局部移除需要一张原始图片。");
    if (pictures.length > 1)
        errors.push("LaMa 局部移除只支持一张原始图片。");
    if (!picture?.mask?.regionCount || !picture.mask.maskPath.trim()) {
        errors.push("请先在原图上绘制并保存 Mask。");
    }
    return {
        prompt: "",
        pictures: picture?.absolutePath.trim() ? [picture] : [],
        referencedPictureNumbers: [],
        errors
    };
}
export function validateLamaInpaintWorkflow(workflow, _qualityProfile = "natural", allowImagePlaceholders = false) {
    const nodeTypes = new Set(Object.values(workflow).map((node) => node.class_type));
    const errors = lamaInpaintRequiredNodeTypes
        .filter((nodeType) => !nodeTypes.has(nodeType))
        .map((nodeType) => `LaMa 工作流缺少节点 ${nodeType}。`);
    if (!allowImagePlaceholders) {
        const unresolved = Object.values(workflow).flatMap((node) => Object.values(node.inputs).filter((value) => typeof value === "string" && /^\{\{(?:IMAGE|MASK)_\d+\}\}$/u.test(value)));
        if (unresolved.length)
            errors.push("LaMa 工作流仍包含未上传的图片或 Mask 占位符。");
    }
    return [...new Set(errors)];
}
export function buildLamaInpaintWorkflow(task, run) {
    const compiled = compileLamaInpaintInput(task.prompt, task.pictures);
    if (compiled.errors.length)
        throw new Error(compiled.errors.join(" "));
    const edge = task.qualityProfile === "tight"
        ? { grow: 3, blur: 3 }
        : task.qualityProfile === "wide"
            ? { grow: 16, blur: 7 }
            : { grow: 8, blur: 5 };
    const outputPrefix = [
        task.imageOutputSubfolder?.replace(/[\\/]+/gu, "/").replace(/^\/+|\/+$/gu, ""),
        `LaMa_${task.outputFilename}_${run.index + 1}`
    ].filter(Boolean).join("/");
    const workflow = {
        source: {
            class_type: "LoadImage",
            inputs: { image: "{{IMAGE_0}}" }
        },
        mask: {
            class_type: "LoadImageMask",
            inputs: { image: "{{MASK_0}}", channel: "red" }
        },
        expandedMask: {
            class_type: "INPAINT_ExpandMask",
            inputs: { mask: ["mask", 0], grow: edge.grow, blur: edge.blur, blur_type: "gaussian" }
        },
        inpaintModel: {
            class_type: "INPAINT_LoadInpaintModel",
            inputs: { model_name: "big-lama.pt" }
        },
        inpainted: {
            class_type: "INPAINT_InpaintWithModel",
            inputs: {
                inpaint_model: ["inpaintModel", 0],
                image: ["source", 0],
                mask: ["expandedMask", 0],
                seed: run.seed
            }
        },
        save: {
            class_type: "SaveImage",
            inputs: { images: ["inpainted", 0], filename_prefix: outputPrefix }
        }
    };
    const errors = validateLamaInpaintWorkflow(workflow, task.qualityProfile, true);
    if (errors.length)
        throw new Error(errors.join(" "));
    return workflow;
}
export function firstSupportedImageModelId(...candidates) {
    return candidates.find((candidate) => candidate && imageModelAdapterFor(candidate)) ??
        qwenImageEdit2511Adapter.id;
}
export function imageModelCapabilityFor(modelId) {
    return imageModelAdapters[modelId] ?? qwenImageEdit2511Capability;
}
