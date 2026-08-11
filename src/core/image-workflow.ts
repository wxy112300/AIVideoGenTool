import type {
  ImageGenerationQueueTask,
  ImageGenerationRun,
  ImageOutputFormat,
  ImageReference,
  ImageReferenceSnapshot,
  ImageTargetResolution,
  ModelScanProfile
} from "../types.js";
import { extractComfyOutputFiles } from "./comfy-output.js";

export interface ImageQualityProfile {
  id: string;
  label: string;
  steps: number;
  cfg: number;
  lightning: boolean;
}

export interface ImageModelCapability {
  id: string;
  name: string;
  maxPictures: number;
  supportedFormats: ImageOutputFormat[];
  qualityProfiles: ImageQualityProfile[];
}

export function cachedImageProfileAllowsEnqueue(
  profile: Pick<ModelScanProfile, "category" | "integrated"> | undefined
): boolean {
  return profile === undefined || (profile.category === "image" && profile.integrated);
}

export interface CompiledImagePrompt {
  prompt: string;
  pictures: ImageReferenceSnapshot[];
  referencedPictureNumbers: number[];
  errors: string[];
}

export type ComfyApiWorkflow = Record<string, {
  class_type: string;
  inputs: Record<string, unknown>;
}>;

export interface ImageOutputCandidate {
  filename: string;
  subfolder: string;
  type: string;
  format?: ImageOutputFormat;
}

export interface ImageModelAdapter extends ImageModelCapability {
  compilePrompt(prompt: string, pictures: ImageReferenceSnapshot[]): CompiledImagePrompt;
  buildWorkflow(task: ImageGenerationQueueTask, run: ImageGenerationRun): ComfyApiWorkflow;
  validateWorkflow(
    workflow: ComfyApiWorkflow,
    qualityProfile?: string,
    allowImagePlaceholders?: boolean
  ): string[];
  parseOutputs(history: unknown): ImageOutputCandidate[];
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
] as const;

export const qwenImageEdit2511LightningNodeTypes = [
  "LoraLoaderModelOnly"
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

const qwenImageDiffusionModel = "qwen_image_edit_2511_int8_convrot.safetensors";
const qwenImageTextEncoder = "qwen_2.5_vl_7b_fp8_scaled.safetensors";
const qwenImageVae = "qwen_image_vae.safetensors";
const qwenImageLightningLora = "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors";
const flux2Klein4bDiffusionModel = "flux-2-klein-base-4b-fp8.safetensors";
const flux2Klein4bTextEncoder = "qwen_3_4b.safetensors";
const flux2Klein4bVae = "flux2-vae.safetensors";

const pictureReferencePattern = /(?:<\s*)?(?:picture|image|图片)\s*([1-9]\d*)(?:\s*>)?/giu;

export const imageTargetResolutionValues = [2160, 1152, 1080, 720, 640, 480] as const;

export interface ImageResolutionOption {
  value: ImageTargetResolution;
  label: string;
  width: number;
  height: number;
}

function alignedImageDimension(value: number): number {
  return Math.max(8, Math.round(value / 8) * 8);
}

export function normalizeImageTargetResolution(
  value: unknown,
  sourceWidth = 0,
  sourceHeight = 0
): ImageTargetResolution {
  if (value === "source") return "source";
  const numeric = typeof value === "number" ? value : Number(value);
  const isSupported = imageTargetResolutionValues.some((candidate) => candidate === numeric);
  if (!isSupported) return "source";
  const shortEdge = Math.min(sourceWidth, sourceHeight);
  return sourceWidth > 0 && sourceHeight > 0 && numeric > shortEdge
    ? "source"
    : numeric as ImageTargetResolution;
}

export function imageOutputDimensions(
  sourceWidth: number,
  sourceHeight: number,
  targetResolution: ImageTargetResolution
): [number, number] {
  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    targetResolution === "source"
  ) {
    return [Math.max(0, Math.trunc(sourceWidth)), Math.max(0, Math.trunc(sourceHeight))];
  }
  const shortEdge = Math.min(sourceWidth, sourceHeight);
  const normalizedTarget = normalizeImageTargetResolution(
    targetResolution,
    sourceWidth,
    sourceHeight
  );
  if (normalizedTarget === "source") return [sourceWidth, sourceHeight];
  const scale = normalizedTarget / shortEdge;
  return [
    alignedImageDimension(sourceWidth * scale),
    alignedImageDimension(sourceHeight * scale)
  ];
}

export function imageResolutionOptionsFor(
  sourceWidth = 0,
  sourceHeight = 0
): ImageResolutionOption[] {
  const hasSource = sourceWidth > 0 && sourceHeight > 0;
  const sourceLabel = hasSource
    ? `原图 · ${sourceWidth}×${sourceHeight}`
    : "原图 · 上传后读取";
  const options: ImageResolutionOption[] = [{
    value: "source",
    label: sourceLabel,
    width: sourceWidth,
    height: sourceHeight
  }];
  const shortEdge = Math.min(sourceWidth, sourceHeight);
  for (const target of imageTargetResolutionValues) {
    if (hasSource && target > shortEdge) continue;
    const [width, height] = hasSource
      ? imageOutputDimensions(sourceWidth, sourceHeight, target)
      : [0, 0];
    options.push({
      value: target,
      label: hasSource ? `${target}p · ${width}×${height}` : `${target}p`,
      width,
      height
    });
  }
  return options;
}

export const qwenImageEdit2511Capability: ImageModelCapability = {
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

function orderedPictures(pictures: ImageReferenceSnapshot[]): ImageReferenceSnapshot[] {
  return [...pictures].sort((left, right) => left.pictureNumber - right.pictureNumber);
}

export function imageReferenceInputPath(
  picture: Pick<ImageReference, "absolutePath">
): string {
  return picture.absolutePath.trim();
}

export function imageMarkupPromptContext(
  pictures: ReadonlyArray<Pick<ImageReference, "pictureNumber" | "markup">>
): string {
  const marked = pictures.filter((picture) => picture.markup?.objectCount);
  if (!marked.length) return "";
  return [
    "Visual annotation instructions:",
    "Canvas annotations are location-only editing instructions stored alongside the clean source Pictures. Use their notes to identify the intended target, but never add annotation graphics, labels, arrows, boxes, or note text to the output.",
    "The per-annotation notes below are the authoritative edit list. A general preservation instruction may protect unrelated content, but must never override, broaden, or replace a specific annotation note.",
    ...marked.map((picture) => `Picture ${picture.pictureNumber}: ${picture.markup?.summary || `${picture.markup?.objectCount ?? 0} marked target(s)`}`)
  ].join("\n");
}

interface CompiledMarkupGuide {
  sourcePictureNumber: number;
  sourceInputNumber: number;
  guideInputNumber: number;
  summary: string;
}

function markupGuidePicture(
  picture: ImageReferenceSnapshot,
  compiledPictureNumber: number
): ImageReferenceSnapshot {
  return {
    ...picture,
    id: `${picture.id}-markup-guide-r${picture.markup?.revision ?? 0}`,
    pictureNumber: compiledPictureNumber,
    absolutePath: picture.markup?.renderedPath.trim() ?? "",
    role: "auto",
    markup: undefined
  };
}

function compiledMarkupPromptContext(guides: CompiledMarkupGuide[]): string {
  if (!guides.length) return "";
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

function compileImagePromptWithLimit(
  prompt: string,
  pictures: ImageReferenceSnapshot[],
  maxPictures: number,
  modelLabel: string,
  includeMarkupGuides = false
): CompiledImagePrompt {
  const ordered = orderedPictures(pictures);
  const usable = ordered.filter((picture) => picture.absolutePath.trim());
  const errors: string[] = [];
  ordered
    .filter((picture) => !picture.absolutePath.trim())
    .forEach((picture) => {
      errors.push(`Picture ${picture.pictureNumber} 尚未添加图片。`);
    });
  const originalToCompiled = new Map<number, number>();
  const compiledPictures: ImageReferenceSnapshot[] = [];
  const markupGuides: CompiledMarkupGuide[] = [];
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
    errors.push(
      `Canvas 标记会额外占用 ${guideCount} 个标注参考输入；当前 ${modelLabel} 最多接收 ${maxPictures} 张模型输入，请减少普通参考图或清除部分标记。`
    );
  }

  const referencedPictureNumbers = new Set<number>();
  const compiledPrompt = prompt.replace(pictureReferencePattern, (match, numberText: string) => {
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

export function compileQwenImageEditPrompt(
  prompt: string,
  pictures: ImageReferenceSnapshot[]
): CompiledImagePrompt {
  return compileImagePromptWithLimit(
    prompt,
    pictures,
    qwenImageEdit2511Capability.maxPictures,
    "Qwen 2511",
    true
  );
}

export function compileFlux2Klein4bPrompt(
  prompt: string,
  pictures: ImageReferenceSnapshot[]
): CompiledImagePrompt {
  return compileImagePromptWithLimit(
    prompt,
    pictures,
    flux2Klein4bCapability.maxPictures,
    "FLUX.2 Klein 4B"
  );
}

export function imageOutputFormatFromFilename(filename: string): ImageOutputFormat | undefined {
  const extension = filename.toLowerCase().split(".").pop();
  if (extension === "png") return "png";
  if (extension === "jpg" || extension === "jpeg") return "jpeg";
  if (extension === "webp") return "webp";
  return undefined;
}

export function imageOutputCandidateFromValue(value: unknown): ImageOutputCandidate | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<ImageOutputCandidate>;
  if (typeof source.filename !== "string" || !source.filename.trim()) return null;
  return {
    filename: source.filename,
    subfolder: typeof source.subfolder === "string" ? source.subfolder : "",
    type: typeof source.type === "string" ? source.type : "output",
    format: imageOutputFormatFromFilename(source.filename)
  };
}

export function imageQualityProfileRequiresLightning(qualityProfile: string): boolean {
  return qualityProfile === "lightning-4step";
}

export function imageLightningComponentFound(
  components: ReadonlyArray<{ label: string; found: boolean }>
): boolean {
  return components.some((component) =>
    component.label.includes("Lightning LoRA") && component.found
  );
}

function imageReferenceInputs(
  pictures: ImageReferenceSnapshot[],
  nodePrefix: string
): Record<string, unknown> {
  return Object.fromEntries(
    pictures.slice(0, qwenImageEdit2511Capability.maxPictures).map((picture, index) => [
      `image${index + 1}`,
      [`${nodePrefix}-${picture.id}`, 0]
    ])
  );
}

function exactImageDimension(value: number | undefined, fallback: number): number {
  const dimension = value ?? fallback;
  if (!Number.isInteger(dimension) || dimension <= 0) {
    throw new Error("图片输出尺寸无效，无法保持 Picture 1 的原始尺寸。");
  }
  return dimension;
}

export function validateQwenImageEdit2511Workflow(
  workflow: ComfyApiWorkflow,
  qualityProfile = "native",
  allowImagePlaceholders = false
): string[] {
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
  const unresolvedPlaceholders = Object.values(workflow).flatMap((node) =>
    Object.values(node.inputs).filter(
      (value) => typeof value === "string" && /^\{\{IMAGE_\d+\}\}$/u.test(value)
    )
  );
  if (unresolvedPlaceholders.length && !allowImagePlaceholders) {
    errors.push("图片工作流仍包含未上传的 IMAGE 占位符。");
  }
  return [...new Set(errors)];
}

export function validateFlux2Klein4bWorkflow(
  workflow: ComfyApiWorkflow,
  _qualityProfile = "native",
  allowImagePlaceholders = false
): string[] {
  const nodeTypes = new Set(Object.values(workflow).map((node) => node.class_type));
  const errors = flux2Klein4bRequiredNodeTypes
    .filter((nodeType) => !nodeTypes.has(nodeType))
    .map((nodeType) => `FLUX.2 Klein workflow 缺少节点 ${nodeType}。`);
  const inputNodes = Object.values(workflow).filter((node) => node.class_type === "LoadImage");
  if (inputNodes.length !== 1) {
    errors.push("FLUX.2 Klein 4B 工作流必须包含 1 个 LoadImage 节点。");
  }
  const unresolvedPlaceholders = Object.values(workflow).flatMap((node) =>
    Object.values(node.inputs).filter(
      (value) => typeof value === "string" && /^\{\{IMAGE_\d+\}\}$/u.test(value)
    )
  );
  if (unresolvedPlaceholders.length && !allowImagePlaceholders) {
    errors.push("FLUX.2 Klein 工作流仍包含未上传的 IMAGE 占位符。");
  }
  return [...new Set(errors)];
}

export function buildQwenImageEdit2511Workflow(
  task: ImageGenerationQueueTask,
  run: ImageGenerationRun
): ComfyApiWorkflow {
  const compiled = compileQwenImageEditPrompt(task.prompt, task.pictures);
  if (compiled.errors.length) {
    throw new Error(compiled.errors.join(" "));
  }
  if (!compiled.pictures.length) {
    throw new Error("Qwen Image Edit 至少需要一张基础 Picture。");
  }
  const quality = qwenImageEdit2511Capability.qualityProfiles.find(
    (profile) => profile.id === task.qualityProfile
  ) ?? qwenImageEdit2511Capability.qualityProfiles[0]!;
  const pictureNodes = Object.fromEntries(
    compiled.pictures.map((picture, index) => [
      `image-${picture.id}`,
      {
        class_type: "LoadImage",
        inputs: { image: `{{IMAGE_${index}}}` }
      }
    ])
  );
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
  const modelNode: ComfyApiWorkflow = {
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
  if (validationErrors.length) throw new Error(validationErrors.join(" "));
  return modelNode;
}

export function buildFlux2Klein4bWorkflow(
  task: ImageGenerationQueueTask,
  run: ImageGenerationRun
): ComfyApiWorkflow {
  const compiled = compileFlux2Klein4bPrompt(task.prompt, task.pictures);
  if (compiled.errors.length) throw new Error(compiled.errors.join(" "));
  const picture = compiled.pictures[0];
  if (!picture) throw new Error("FLUX.2 Klein 4B 至少需要一张基础 Picture。");
  const quality = flux2Klein4bCapability.qualityProfiles.find(
    (profile) => profile.id === task.qualityProfile
  ) ?? flux2Klein4bCapability.qualityProfiles[0]!;
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

export function renderImageWorkflow(
  workflow: ComfyApiWorkflow,
  uploadedPictures: string[]
): ComfyApiWorkflow {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, child]) => [
          key,
          visit(child)
        ])
      );
    }
    if (typeof value !== "string") return value;
    const exact = value.match(/^\{\{IMAGE_(\d+)\}\}$/u);
    if (exact?.[1]) return uploadedPictures[Number(exact[1])] ?? value;
    return value.replace(/\{\{IMAGE_(\d+)\}\}/gu, (match, indexText: string) =>
      uploadedPictures[Number(indexText)] ?? match
    );
  };
  return visit(workflow) as ComfyApiWorkflow;
}

export const qwenImageEdit2511Adapter: ImageModelAdapter = {
  ...qwenImageEdit2511Capability,
  compilePrompt: compileQwenImageEditPrompt,
  buildWorkflow: buildQwenImageEdit2511Workflow,
  validateWorkflow: validateQwenImageEdit2511Workflow,
  parseOutputs(history: unknown): ImageOutputCandidate[] {
    return extractComfyOutputFiles(history)
      .map((file) => imageOutputCandidateFromValue(file))
      .filter((file): file is ImageOutputCandidate => file !== null);
  }
};

export const flux2Klein4bAdapter: ImageModelAdapter = {
  ...flux2Klein4bCapability,
  compilePrompt: compileFlux2Klein4bPrompt,
  buildWorkflow: buildFlux2Klein4bWorkflow,
  validateWorkflow: validateFlux2Klein4bWorkflow,
  parseOutputs(history: unknown): ImageOutputCandidate[] {
    return extractComfyOutputFiles(history)
      .map((file) => imageOutputCandidateFromValue(file))
      .filter((file): file is ImageOutputCandidate => file !== null);
  }
};

export const imageModelAdapters: Record<string, ImageModelAdapter> = {
  [qwenImageEdit2511Adapter.id]: qwenImageEdit2511Adapter,
  [flux2Klein4bAdapter.id]: flux2Klein4bAdapter
};

export function imageModelAdapterFor(modelId: string): ImageModelAdapter | undefined {
  return imageModelAdapters[modelId];
}

export function firstSupportedImageModelId(
  ...candidates: Array<string | undefined>
): string {
  return candidates.find((candidate) => candidate && imageModelAdapterFor(candidate)) ??
    qwenImageEdit2511Adapter.id;
}

export function imageModelCapabilityFor(modelId: string): ImageModelCapability {
  return imageModelAdapters[modelId] ?? qwenImageEdit2511Capability;
}
