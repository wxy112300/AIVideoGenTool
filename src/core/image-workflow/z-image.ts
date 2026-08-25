import type {
  ImageGenerationQueueTask,
  ImageGenerationRun,
  ImageReferenceSnapshot
} from "../../types.js";
import type {
  ComfyApiWorkflow,
  CompiledImagePrompt,
  ImageModelCapability,
  ImageQualityProfile
} from "./contracts.js";
import {
  zImageCapability,
  zImageTurboCapability,
  zImageDiffusionModel,
  zImageTurboDiffusionModel,
  zImageTextEncoder,
  zImageVae,
  zImageTurboFunControlnetPatch
} from "./capabilities.js";
import {
  exactImageDimension,
  orderedPictures,
  pictureReferencePattern
} from "./shared.js";

const zImageMarkupContract = [
  "Annotation and Mask contract:",
  "A saved Mask is a location-only edit boundary. Change the masked region and the minimum surrounding pixels needed for a natural result; preserve unmasked content.",
  "Canvas annotations are also location-only guidance. Never reproduce colored marks, boxes, arrows, labels, notes, or annotation text in the output.",
  "Keep the source subject identity, composition, lighting, and visible text unless the user's request explicitly changes them."
].join("\n");

function zImagePictureWithMarkupGuide(
  picture: ImageReferenceSnapshot
): ImageReferenceSnapshot {
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
export function compileZImagePrompt(
  prompt: string,
  pictures: ImageReferenceSnapshot[]
): CompiledImagePrompt {
  const ordered = orderedPictures(pictures);
  const errors: string[] = [];
  ordered
    .filter((picture) => !picture.absolutePath.trim())
    .forEach((picture) => errors.push(`Picture ${picture.pictureNumber} 尚未添加图片。`));
  if (ordered.length > zImageCapability.maxPictures) {
    errors.push("Z-Image 工作流最多支持一张 Picture。请先合成为一张底图。");
  }
  const picture = ordered.find((candidate) => candidate.absolutePath.trim());
  const originalPictureNumber = picture?.pictureNumber;
  const referencedPictureNumbers = new Set<number>();
  const compiledPrompt = prompt.replace(pictureReferencePattern, (match, numberText: string) => {
    const originalNumber = Number(numberText);
    referencedPictureNumbers.add(originalNumber);
    if (originalNumber !== originalPictureNumber) {
      errors.push(`${match} 引用了不存在的 Picture ${originalNumber}。Z-Image 只接收 Picture 1。`);
      return match;
    }
    return "Picture 1";
  }).trim();
  const hasMask = Boolean(picture?.mask?.regionCount && picture.mask.maskPath.trim());
  const hasMarkupGuide = Boolean(
    picture?.markup?.objectCount && picture.markup.renderedPath.trim()
  );
  const compiledPicture = picture
    ? hasMarkupGuide && !hasMask
      ? zImagePictureWithMarkupGuide(picture)
      : { ...picture, pictureNumber: 1 }
    : undefined;
  const promptParts = [compiledPrompt];
  if (hasMarkupGuide || hasMask) promptParts.push(zImageMarkupContract);
  if (hasMarkupGuide) {
    promptParts.push(
      `Annotation notes for Picture 1: ${picture?.markup?.summary.trim() || `${picture?.markup?.objectCount ?? 0} marked target(s)`}.`
    );
  }
  return {
    prompt: promptParts.filter(Boolean).join("\n\n"),
    pictures: compiledPicture ? [compiledPicture] : [],
    referencedPictureNumbers: [...referencedPictureNumbers].sort((left, right) => left - right),
    errors: [...new Set(errors)]
  };
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
] as const;

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
] as const;

function unresolvedImagePlaceholders(workflow: ComfyApiWorkflow): string[] {
  return Object.values(workflow).flatMap((node) =>
    Object.values(node.inputs).filter((value) =>
      typeof value === "string" && /^\{\{(?:IMAGE|MASK)_\d+\}\}$/u.test(value)
    )
  ).map(String);
}

export function validateZImageWorkflow(
  workflow: ComfyApiWorkflow,
  _qualityProfile = "native",
  allowImagePlaceholders = false
): string[] {
  const nodeTypes = new Set(Object.values(workflow).map((node) => node.class_type));
  const errors = zImageBaseCoreNodeTypes
    .filter((nodeType) => !nodeTypes.has(nodeType))
    .map((nodeType) => `Z-Image 工作流缺少节点 ${nodeType}。`);
  const inputNodes = Object.values(workflow).filter((node) => node.class_type === "LoadImage");
  const maskNodes = Object.values(workflow).filter((node) => node.class_type === "LoadImageMask");
  if (inputNodes.length > 1) errors.push("Z-Image 工作流最多包含 1 个 LoadImage 节点。");
  if (maskNodes.length > 1) errors.push("Z-Image 工作流最多包含 1 个 LoadImageMask 节点。");
  if (inputNodes.length === 0 && maskNodes.length > 0) {
    errors.push("Z-Image 的 Mask 必须绑定一张参考 Picture。");
  }
  if (inputNodes.length === 0 && !nodeTypes.has("EmptySD3LatentImage")) {
    errors.push("Z-Image 文生图工作流缺少节点 EmptySD3LatentImage。");
  }
  if (inputNodes.length === 1) {
    if (maskNodes.length === 1 && !nodeTypes.has("VAEEncodeForInpaint")) {
      errors.push("Z-Image Mask 工作流缺少节点 VAEEncodeForInpaint。");
    } else if (maskNodes.length === 0 && !nodeTypes.has("VAEEncode")) {
      errors.push("Z-Image 图生图工作流缺少节点 VAEEncode。");
    }
  }
  if (!allowImagePlaceholders && unresolvedImagePlaceholders(workflow).length) {
    errors.push("Z-Image 工作流仍包含未上传的图片或 Mask 占位符。");
  }
  return [...new Set(errors)];
}

export function validateZImageTurboWorkflow(
  workflow: ComfyApiWorkflow,
  _qualityProfile = "turbo-8",
  allowImagePlaceholders = false
): string[] {
  const nodeTypes = new Set(Object.values(workflow).map((node) => node.class_type));
  const errors = zImageTurboCoreNodeTypes
    .filter((nodeType) => !nodeTypes.has(nodeType))
    .map((nodeType) => `Z-Image-Turbo 工作流缺少节点 ${nodeType}。`);
  const inputNodes = Object.values(workflow).filter((node) => node.class_type === "LoadImage");
  const maskNodes = Object.values(workflow).filter((node) => node.class_type === "LoadImageMask");
  if (inputNodes.length > 1) errors.push("Z-Image-Turbo 工作流最多包含 1 个 LoadImage 节点。");
  if (maskNodes.length > 1) errors.push("Z-Image-Turbo 工作流最多包含 1 个 LoadImageMask 节点。");
  if (inputNodes.length === 1) {
    for (const nodeType of ["Canny", "ModelPatchLoader", "ZImageFunControlnet"]) {
      if (!nodeTypes.has(nodeType)) errors.push(`Z-Image-Turbo 参考图工作流缺少节点 ${nodeType}。`);
    }
  } else if (maskNodes.length) {
    errors.push("Z-Image-Turbo 的 Mask 必须绑定一张参考 Picture。");
  }
  if (!allowImagePlaceholders && unresolvedImagePlaceholders(workflow).length) {
    errors.push("Z-Image-Turbo 工作流仍包含未上传的图片或 Mask 占位符。");
  }
  return [...new Set(errors)];
}

function zImageQualityProfile(
  capability: ImageModelCapability,
  requestedId: string
): ImageQualityProfile {
  return capability.qualityProfiles.find((profile) => profile.id === requestedId) ??
    capability.qualityProfiles[0]!;
}

function zImageOutputDimensions(
  task: ImageGenerationQueueTask,
  picture: ImageReferenceSnapshot | undefined,
  capability: ImageModelCapability
): [number, number] {
  return [
    exactImageDimension(task.outputWidth, picture?.width || capability.textOnlyOutputWidth || 1024),
    exactImageDimension(task.outputHeight, picture?.height || capability.textOnlyOutputHeight || 1024)
  ];
}

function zImageOutputPrefix(
  task: ImageGenerationQueueTask,
  run: ImageGenerationRun,
  label: string
): string {
  return [
    task.imageOutputSubfolder?.replace(/[\\/]+/gu, "/").replace(/^\/+|\/+$/gu, ""),
    `${label}_${task.outputFilename}_${run.index + 1}`
  ].filter(Boolean).join("/");
}

function zImageLoaderNodes(
  task: ImageGenerationQueueTask,
  modelFilename: string
): ComfyApiWorkflow {
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

export function buildZImageWorkflow(
  task: ImageGenerationQueueTask,
  run: ImageGenerationRun
): ComfyApiWorkflow {
  const compiled = compileZImagePrompt(task.prompt, task.pictures);
  if (compiled.errors.length) throw new Error(compiled.errors.join(" "));
  const picture = compiled.pictures[0];
  const hasMask = Boolean(picture?.mask?.regionCount && picture.mask.maskPath.trim());
  const quality = zImageQualityProfile(zImageCapability, task.qualityProfile);
  const [outputWidth, outputHeight] = zImageOutputDimensions(task, picture, zImageCapability);
  const latentNodes: ComfyApiWorkflow = picture
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
  const workflow: ComfyApiWorkflow = {
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
  if (errors.length) throw new Error(errors.join(" "));
  return workflow;
}

export function buildZImageTurboWorkflow(
  task: ImageGenerationQueueTask,
  run: ImageGenerationRun
): ComfyApiWorkflow {
  const compiled = compileZImagePrompt(task.prompt, task.pictures);
  if (compiled.errors.length) throw new Error(compiled.errors.join(" "));
  const picture = compiled.pictures[0];
  const hasMask = Boolean(picture?.mask?.regionCount && picture.mask.maskPath.trim());
  const quality = zImageQualityProfile(zImageTurboCapability, task.qualityProfile);
  const [outputWidth, outputHeight] = zImageOutputDimensions(task, picture, zImageTurboCapability);
  const workflow: ComfyApiWorkflow = {
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
    if (!sampler) throw new Error("Z-Image-Turbo 工作流缺少采样节点。");
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
  if (errors.length) throw new Error(errors.join(" "));
  return workflow;
}
