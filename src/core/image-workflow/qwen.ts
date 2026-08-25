import type {
  ImageGenerationQueueTask,
  ImageGenerationRun,
  ImageReferenceSnapshot
} from "../../types.js";
import type { ComfyApiWorkflow, CompiledImagePrompt } from "./contracts.js";
import {
  qwenImageEdit2511Capability,
  qwenImageEdit2511CropStitchCapability,
  qwenImageDiffusionModel,
  qwenImageTextEncoder,
  qwenImageVae,
  qwenImageLightningLora
} from "./capabilities.js";
import {
  qwenImageEdit2511RequiredNodeTypes,
  qwenImageEdit2511LightningNodeTypes,
  qwenImageEdit2511CropStitchRequiredNodeTypes
} from "./node-requirements.js";
import {
  compileImagePromptWithLimit,
  exactImageDimension,
  imageReferenceInputs,
  orderedPictures,
  pictureReferencePattern
} from "./shared.js";

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
const qwenCropStitchPreservationContract = [
  "Fusion repair contract: the Mask is a location-only edit boundary, not visible content.",
  "Modify only the masked region and the smallest feathered edge needed to make the composite natural.",
  "Correct local lighting direction, color temperature, contact shadows, perspective, depth of field, grain, and cutout edges only where needed for the requested blend.",
  "Preserve every unmasked pixel, object, identity, texture, composition, and background detail exactly; do not add unrelated objects, text, logos, watermarks, borders, arrows, labels, or mask graphics."
].join(" ");

export function compileQwenImageEditCropStitchPrompt(
  prompt: string,
  pictures: ImageReferenceSnapshot[]
): CompiledImagePrompt {
  const ordered = orderedPictures(pictures);
  const usable = ordered.filter((picture) => picture.absolutePath.trim());
  const errors: string[] = [];
  ordered
    .filter((picture) => !picture.absolutePath.trim())
    .forEach((picture) => errors.push(`Picture ${picture.pictureNumber} 尚未添加图片。`));
  if (ordered.length > 1) {
    errors.push("Qwen 局部融合修复只支持一张基础 Picture。其他参考图请先合成到同一张底图中。");
  }
  const picture = usable[0];
  const originalPictureNumber = picture?.pictureNumber;
  const compiledPrompt = prompt.replace(pictureReferencePattern, (match, numberText: string) => {
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

export function validateQwenImageEdit2511CropStitchWorkflow(
  workflow: ComfyApiWorkflow,
  _qualityProfile = "native",
  allowImagePlaceholders = false
): string[] {
  const nodeTypes = new Set(Object.values(workflow).map((node) => node.class_type));
  const errors = qwenImageEdit2511CropStitchRequiredNodeTypes
    .filter((nodeType) => !nodeTypes.has(nodeType))
    .map((nodeType) => `Qwen Crop/Stitch 工作流缺少节点 ${nodeType}。`);
  const inputNodes = Object.values(workflow).filter((node) => node.class_type === "LoadImage");
  if (inputNodes.length !== 1) errors.push("Qwen Crop/Stitch 工作流必须包含 1 个 LoadImage 节点。");
  const maskNodes = Object.values(workflow).filter((node) => node.class_type === "LoadImageMask");
  if (maskNodes.length !== 1) errors.push("Qwen Crop/Stitch 工作流必须包含 1 个 LoadImageMask 节点。");
  const unresolved = Object.values(workflow).flatMap((node) =>
    Object.values(node.inputs).filter((value) =>
      typeof value === "string" && /^\{\{(?:IMAGE|MASK)_\d+\}\}$/u.test(value)
    )
  );
  if (unresolved.length && !allowImagePlaceholders) {
    errors.push("Qwen Crop/Stitch 工作流仍包含未上传的图片或 Mask 占位符。");
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

export function buildQwenImageEdit2511CropStitchWorkflow(
  task: ImageGenerationQueueTask,
  run: ImageGenerationRun
): ComfyApiWorkflow {
  const compiled = compileQwenImageEditCropStitchPrompt(task.prompt, task.pictures);
  if (compiled.errors.length) throw new Error(compiled.errors.join(" "));
  const picture = compiled.pictures[0];
  if (!picture) throw new Error("Qwen 局部融合修复至少需要一张基础 Picture。");
  if (!picture.mask?.maskPath.trim()) throw new Error("Qwen 局部融合修复需要先保存 Mask。");
  const quality = qwenImageEdit2511CropStitchCapability.qualityProfiles.find(
    (profile) => profile.id === task.qualityProfile
  ) ?? qwenImageEdit2511CropStitchCapability.qualityProfiles[0]!;
  const outputWidth = exactImageDimension(task.outputWidth, picture.width);
  const outputHeight = exactImageDimension(task.outputHeight, picture.height);
  const outputPrefix = [
    task.imageOutputSubfolder?.replace(/[\\/]+/gu, "/").replace(/^\/+|\/+$/gu, ""),
    `QwenFusion_${task.outputFilename}_${run.index + 1}`
  ].filter(Boolean).join("/");
  const cropTarget = 1024;
  const workflow: ComfyApiWorkflow = {
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
  if (validationErrors.length) throw new Error(validationErrors.join(" "));
  return workflow;
}
