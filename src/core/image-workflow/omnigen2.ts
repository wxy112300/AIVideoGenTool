import type {
  ImageGenerationQueueTask,
  ImageGenerationRun,
  ImageReferenceSnapshot
} from "../../types.js";
import type { ComfyApiWorkflow, CompiledImagePrompt, ImageQualityProfile } from "./contracts.js";
import {
  omnigen2Capability,
  omnigen2DiffusionModel,
  omnigen2TextEncoder,
  omnigen2Vae
} from "./capabilities.js";
import {
  exactImageDimension,
  orderedPictures,
  pictureReferencePattern,
  unresolvedImagePlaceholders
} from "./shared.js";

const omnigen2DefaultNegativePrompt =
  "blurry, low quality, distorted, ugly, bad anatomy, deformed, poorly drawn";

const omnigen2MarkupContract = [
  "OmniGen2 reference and local-edit contract:",
  "With no reference Picture, generate the requested subject and scene from the text prompt. With one or two reference Pictures, follow the instruction and use each Picture only for the visual information identified in the prompt.",
  "For multiple references, explicitly distinguish Picture 1 and Picture 2 and state which subject, object, pose, material, background, or composition should be transferred or combined.",
  "A saved Mask is a location-only edit boundary for Picture 1. Change the masked region and the minimum feathered surroundings; the application will restore unmasked pixels from the source after generation.",
  "Canvas annotations are location-only guidance. Never reproduce colored marks, boxes, arrows, labels, notes, or annotation text in the output. Use the annotation notes only to identify the intended targets.",
  "For viewpoint changes, state the new camera angle, viewing direction, subject orientation, framing, and spatial relationships. For added detail, specify the affected material, texture, light, shadow, perspective, depth, and natural edge blending.",
  "Preserve subject identity, important shapes, composition, lighting, visible text, numbers, logos, and proper nouns unless the user explicitly requests a change."
].join("\n");

function omnigen2PictureWithMarkupGuide(
  picture: ImageReferenceSnapshot,
  pictureNumber: number
): ImageReferenceSnapshot {
  return {
    ...picture,
    id: `${picture.id}-omnigen2-markup-r${picture.markup?.revision ?? 0}`,
    pictureNumber,
    absolutePath: picture.markup?.renderedPath.trim() ?? picture.absolutePath,
    crop: undefined,
    markup: undefined
  };
}

/**
 * OmniGen2 accepts up to two visual inputs. A marked Picture without a binary
 * Mask is sent as the rendered guide so the native graph remains within that
 * two-input limit; the prompt makes clear that the guide is not output content.
 */
export function compileOmniGen2Prompt(
  prompt: string,
  pictures: ImageReferenceSnapshot[]
): CompiledImagePrompt {
  const ordered = orderedPictures(pictures);
  const errors: string[] = [];
  ordered
    .filter((picture) => !picture.absolutePath.trim())
    .forEach((picture) => errors.push(`Picture ${picture.pictureNumber} 尚未添加图片。`));
  if (ordered.length > omnigen2Capability.maxPictures) {
    errors.push("OmniGen2 工作流最多支持两张 Picture。请先合成为一张底图。");
  }

  const originalToCompiled = new Map<number, number>();
  const compiledPictures: ImageReferenceSnapshot[] = [];
  let hasMarkup = false;
  let hasMask = false;
  for (const picture of ordered) {
    if (!picture.absolutePath.trim()) continue;
    if (originalToCompiled.has(picture.pictureNumber)) {
      errors.push(`Picture ${picture.pictureNumber} 重复，无法确定引用对象。`);
      continue;
    }
    const compiledNumber = compiledPictures.length + 1;
    originalToCompiled.set(picture.pictureNumber, compiledNumber);
    const pictureHasMask = Boolean(picture.mask?.regionCount && picture.mask.maskPath.trim());
    const pictureHasMarkup = Boolean(
      picture.markup?.objectCount && picture.markup.renderedPath.trim()
    );
    if (pictureHasMask) {
      hasMask = true;
      if (compiledNumber !== 1) {
        errors.push("OmniGen2 的 Mask 只支持绑定 Picture 1，请将需要编辑的底图放在第一张。");
      }
    }
    if (pictureHasMarkup) hasMarkup = true;
    compiledPictures.push(
      pictureHasMarkup && !pictureHasMask
        ? omnigen2PictureWithMarkupGuide(picture, compiledNumber)
        : { ...picture, pictureNumber: compiledNumber }
    );
  }

  const referencedPictureNumbers = new Set<number>();
  const compiledPrompt = prompt.replace(
    pictureReferencePattern,
    (match, numberText: string) => {
      const originalNumber = Number(numberText);
      referencedPictureNumbers.add(originalNumber);
      const compiledNumber = originalToCompiled.get(originalNumber);
      if (!compiledNumber) {
        errors.push(`${match} 引用了不存在的 Picture ${originalNumber}。`);
        return match;
      }
      return `Picture ${compiledNumber}`;
    }
  ).trim();
  const promptParts = [compiledPrompt];
  if (hasMarkup || hasMask) promptParts.push(omnigen2MarkupContract);
  const marked = ordered.filter((picture) => picture.markup?.objectCount);
  if (marked.length) {
    promptParts.push(
      marked
        .map((picture) => `Annotation notes for Picture ${originalToCompiled.get(picture.pictureNumber) ?? picture.pictureNumber}: ${picture.markup?.summary.trim() || `${picture.markup?.objectCount ?? 0} marked target(s)`}.`)
        .join("\n")
    );
  }
  return {
    prompt: promptParts.filter(Boolean).join("\n\n"),
    pictures: compiledPictures.slice(0, omnigen2Capability.maxPictures),
    referencedPictureNumbers: [...referencedPictureNumbers].sort((left, right) => left - right),
    errors: [...new Set(errors)]
  };
}

const omnigen2CoreNodeTypes = [
  "UNETLoader",
  "CLIPLoader",
  "VAELoader",
  "CLIPTextEncode",
  "EmptySD3LatentImage",
  "BasicScheduler",
  "KSamplerSelect",
  "RandomNoise",
  "DualCFGGuider",
  "SamplerCustomAdvanced",
  "VAEDecode",
  "ImageScale",
  "SaveImage"
] as const;

export function validateOmniGen2Workflow(
  workflow: ComfyApiWorkflow,
  _qualityProfile = "native",
  allowImagePlaceholders = false
): string[] {
  const nodeTypes = new Set(Object.values(workflow).map((node) => node.class_type));
  const errors = omnigen2CoreNodeTypes
    .filter((nodeType) => !nodeTypes.has(nodeType))
    .map((nodeType) => `OmniGen2 工作流缺少节点 ${nodeType}。`);
  const inputNodes = Object.values(workflow).filter((node) => node.class_type === "LoadImage");
  const scaledInputNodes = Object.values(workflow).filter(
    (node) => node.class_type === "ImageScaleToTotalPixels"
  );
  const encodedReferenceNodes = Object.values(workflow).filter(
    (node) => node.class_type === "VAEEncode"
  );
  const referenceLatentNodes = Object.values(workflow).filter(
    (node) => node.class_type === "ReferenceLatent"
  );
  const imageSizeNodes = Object.values(workflow).filter((node) => node.class_type === "GetImageSize");
  const maskNodes = Object.values(workflow).filter((node) => node.class_type === "LoadImageMask");
  const compositeNodes = Object.values(workflow).filter(
    (node) => node.class_type === "ImageCompositeMasked"
  );
  if (inputNodes.length > omnigen2Capability.maxPictures) {
    errors.push("OmniGen2 工作流最多包含 2 个 LoadImage 节点。");
  }
  if (inputNodes.length === 0) {
    if (scaledInputNodes.length || encodedReferenceNodes.length || referenceLatentNodes.length || imageSizeNodes.length) {
      errors.push("OmniGen2 文生图工作流不应包含参考图编码节点。");
    }
  } else {
    if (scaledInputNodes.length !== inputNodes.length) {
      errors.push("OmniGen2 每张参考图都必须经过 ImageScaleToTotalPixels 节点。");
    }
    if (encodedReferenceNodes.length !== inputNodes.length) {
      errors.push("OmniGen2 每张参考图都必须经过 VAEEncode 节点。");
    }
    if (referenceLatentNodes.length !== inputNodes.length * 2) {
      errors.push("OmniGen2 每张参考图都必须分别绑定正向和负向 ReferenceLatent 节点。");
    }
    if (imageSizeNodes.length !== 1) {
      errors.push("OmniGen2 参考图工作流必须包含 1 个 GetImageSize 节点。");
    }
  }
  if (maskNodes.length > 1) errors.push("OmniGen2 工作流最多包含 1 个 LoadImageMask 节点。");
  if (compositeNodes.length > 1) errors.push("OmniGen2 工作流最多包含 1 个 ImageCompositeMasked 节点。");
  if (maskNodes.length > 0 && inputNodes.length !== 1 && inputNodes.length !== 2) {
    errors.push("OmniGen2 的 Mask 必须绑定至少一张参考 Picture。");
  }
  if (maskNodes.length > 0 && inputNodes.length > 0 && compositeNodes.length !== 1) {
    errors.push("OmniGen2 的 Mask 工作流缺少 ImageCompositeMasked 节点。");
  }
  if (maskNodes.length === 0 && compositeNodes.length > 0) {
    errors.push("OmniGen2 的 ImageCompositeMasked 节点必须绑定一个 Mask。");
  }
  if (!allowImagePlaceholders && unresolvedImagePlaceholders(workflow).length) {
    errors.push("OmniGen2 工作流仍包含未上传的图片或 Mask 占位符。");
  }
  return [...new Set(errors)];
}

function omnigen2QualityProfile(requestedId: string): ImageQualityProfile {
  return omnigen2Capability.qualityProfiles.find((profile) => profile.id === requestedId) ??
    omnigen2Capability.qualityProfiles[0]!;
}

function omnigen2OutputDimensions(
  task: ImageGenerationQueueTask,
  picture: ImageReferenceSnapshot | undefined
): [number, number] {
  return [
    exactImageDimension(task.outputWidth, picture?.width || omnigen2Capability.textOnlyOutputWidth || 1024),
    exactImageDimension(task.outputHeight, picture?.height || omnigen2Capability.textOnlyOutputHeight || 1024)
  ];
}

function omnigen2OutputPrefix(task: ImageGenerationQueueTask, run: ImageGenerationRun): string {
  return [
    task.imageOutputSubfolder?.replace(/[\\/]+/gu, "/").replace(/^\/+|\/+$/gu, ""),
    `OmniGen2_${task.outputFilename}_${run.index + 1}`
  ].filter(Boolean).join("/");
}

export function buildOmniGen2Workflow(
  task: ImageGenerationQueueTask,
  run: ImageGenerationRun
): ComfyApiWorkflow {
  const compiled = compileOmniGen2Prompt(task.prompt, task.pictures);
  if (compiled.errors.length) throw new Error(compiled.errors.join(" "));
  const picture = compiled.pictures[0];
  const hasMask = Boolean(picture?.mask?.regionCount && picture.mask.maskPath.trim());
  const quality = omnigen2QualityProfile(task.qualityProfile);
  const [outputWidth, outputHeight] = omnigen2OutputDimensions(task, picture);
  const workflow: ComfyApiWorkflow = {
    model: {
      class_type: "UNETLoader",
      inputs: {
        unet_name: task.diffusionModelFilename || omnigen2DiffusionModel,
        weight_dtype: "default"
      }
    },
    clip: {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: omnigen2TextEncoder,
        type: "omnigen2",
        device: "default"
      }
    },
    vae: {
      class_type: "VAELoader",
      inputs: { vae_name: omnigen2Vae }
    },
    positive: {
      class_type: "CLIPTextEncode",
      inputs: { clip: ["clip", 0], text: compiled.prompt }
    },
    negative: {
      class_type: "CLIPTextEncode",
      inputs: { clip: ["clip", 0], text: omnigen2DefaultNegativePrompt }
    },
    latent: {
      class_type: "EmptySD3LatentImage",
      inputs: { width: outputWidth, height: outputHeight, batch_size: 1 }
    },
    noise: {
      class_type: "RandomNoise",
      inputs: { noise_seed: run.seed }
    },
    samplerSelect: {
      class_type: "KSamplerSelect",
      inputs: { sampler_name: "euler" }
    },
    scheduler: {
      class_type: "BasicScheduler",
      inputs: {
        model: ["model", 0],
        scheduler: "simple",
        steps: quality.steps,
        denoise: 1
      }
    },
    guider: {
      class_type: "DualCFGGuider",
      inputs: {
        model: ["model", 0],
        cond1: ["positive", 0],
        cond2: ["negative", 0],
        negative: ["negative", 0],
        cfg_conds: quality.cfg,
        cfg_cond2_negative: quality.imageGuidance ?? 2,
        style: "regular"
      }
    },
    sampled: {
      class_type: "SamplerCustomAdvanced",
      inputs: {
        noise: ["noise", 0],
        guider: ["guider", 0],
        sampler: ["samplerSelect", 0],
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
      inputs: {
        images: ["exactSize", 0],
        filename_prefix: omnigen2OutputPrefix(task, run)
      }
    }
  };

  if (compiled.pictures.length) {
    let positiveKey = "positive";
    let negativeKey = "negative";
    compiled.pictures.forEach((_reference, index) => {
      const inputKey = `input${index + 1}`;
      const scaledKey = `scaledImage${index + 1}`;
      const encodedKey = `referenceImage${index + 1}`;
      workflow[inputKey] = {
        class_type: "LoadImage",
        inputs: { image: `{{IMAGE_${index}}}` }
      };
      workflow[scaledKey] = {
        class_type: "ImageScaleToTotalPixels",
        inputs: {
          image: [inputKey, 0],
          upscale_method: "area",
          megapixels: 1,
          resolution_steps: 1
        }
      };
      workflow[encodedKey] = {
        class_type: "VAEEncode",
        inputs: { pixels: [scaledKey, 0], vae: ["vae", 0] }
      };
      const positiveReferenceKey = `positiveReference${index + 1}`;
      const negativeReferenceKey = `negativeReference${index + 1}`;
      workflow[positiveReferenceKey] = {
        class_type: "ReferenceLatent",
        inputs: { conditioning: [positiveKey, 0], latent: [encodedKey, 0] }
      };
      workflow[negativeReferenceKey] = {
        class_type: "ReferenceLatent",
        inputs: { conditioning: [negativeKey, 0], latent: [encodedKey, 0] }
      };
      positiveKey = positiveReferenceKey;
      negativeKey = negativeReferenceKey;
    });
    const firstScaledKey = "scaledImage1";
    workflow.imageSize = {
      class_type: "GetImageSize",
      inputs: { image: [firstScaledKey, 0] }
    };
    const latent = workflow.latent;
    if (!latent) throw new Error("OmniGen2 工作流缺少 latent 节点。");
    latent.inputs.width = ["imageSize", 0];
    latent.inputs.height = ["imageSize", 1];
    const guider = workflow.guider;
    if (!guider) throw new Error("OmniGen2 工作流缺少 DualCFGGuider 节点。");
    guider.inputs.cond1 = [positiveKey, 0];
    guider.inputs.cond2 = [negativeKey, 0];
  }

  if (hasMask) {
    workflow.mask = {
      class_type: "LoadImageMask",
      inputs: { image: "{{MASK_0}}", channel: "red" }
    };
    workflow.sourceImage = {
      class_type: "ImageScale",
      inputs: {
        image: ["input1", 0],
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
    if (!save) throw new Error("OmniGen2 工作流缺少保存节点。");
    save.inputs.images = ["composite", 0];
  }

  const errors = validateOmniGen2Workflow(workflow, quality.id, true);
  if (errors.length) throw new Error(errors.join(" "));
  return workflow;
}
