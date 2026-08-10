import type {
  ImageGenerationQueueTask,
  ImageGenerationRun,
  ImageOutputFormat,
  ImageReference,
  ImageReferenceSnapshot
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
  "KSampler",
  "VAEDecode",
  "SaveImage"
] as const;

export const qwenImageEdit2511LightningNodeTypes = [
  "LoraLoaderModelOnly"
] as const;

const qwenImageDiffusionModel = "qwen_image_edit_2511_int8_convrot.safetensors";
const qwenImageTextEncoder = "qwen_2.5_vl_7b_fp8_scaled.safetensors";
const qwenImageVae = "qwen_image_vae.safetensors";
const qwenImageLightningLora = "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors";

const pictureReferencePattern = /(?:<\s*)?(?:picture|image|图片)\s*([1-9]\d*)(?:\s*>)?/giu;

export const qwenImageEdit2511Capability: ImageModelCapability = {
  id: "qwen-image-edit-2511",
  name: "Qwen-Image-Edit-2511",
  maxPictures: 3,
  supportedFormats: ["png"],
  qualityProfiles: [
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

function orderedPictures(pictures: ImageReferenceSnapshot[]): ImageReferenceSnapshot[] {
  return [...pictures].sort((left, right) => left.pictureNumber - right.pictureNumber);
}

export function compileQwenImageEditPrompt(
  prompt: string,
  pictures: ImageReferenceSnapshot[]
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
  usable.forEach((picture, index) => {
    if (originalToCompiled.has(picture.pictureNumber)) {
      errors.push(`Picture ${picture.pictureNumber} 重复，无法确定引用对象。`);
      return;
    }
    originalToCompiled.set(picture.pictureNumber, index + 1);
  });
  if (ordered.length > qwenImageEdit2511Capability.maxPictures) {
    errors.push(`当前 Qwen 2511 工作流最多支持 ${qwenImageEdit2511Capability.maxPictures} 张 Picture。`);
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

  return {
    prompt: compiledPrompt,
    pictures: usable.slice(0, qwenImageEdit2511Capability.maxPictures),
    referencedPictureNumbers: [...referencedPictureNumbers].sort((left, right) => left - right),
    errors: [...new Set(errors)]
  };
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
        device: "default"
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
        method: "index_timestep_zero"
      }
    },
    negativeReference: {
      class_type: "FluxKontextMultiReferenceLatentMethod",
      inputs: {
        conditioning: ["negative", 0],
        method: "index_timestep_zero"
      }
    },
    sampling: {
      class_type: "ModelSamplingAuraFlow",
      inputs: {
        model: ["model", 0],
        shift: 3.1
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
          : ["sampling", 0],
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
  parseOutputs(history: unknown): ImageOutputCandidate[] {
    return extractComfyOutputFiles(history)
      .map((file) => imageOutputCandidateFromValue(file))
      .filter((file): file is ImageOutputCandidate => file !== null);
  }
};
