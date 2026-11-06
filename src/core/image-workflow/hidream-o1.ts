import { uiKeys } from "../i18n-keys.js";
import type { Translate } from "../i18n.js";
import { createTranslator } from "../i18n.js";
import type {
  ImageGenerationQueueTask,
  ImageGenerationRun,
  ImageReferenceSnapshot
} from "../../types.js";
import type { ComfyApiWorkflow, CompiledImagePrompt } from "./contracts.js";
import { hidreamO1Capability, hidreamO1DiffusionModel } from "./capabilities.js";
import {
  exactImageDimension,
  orderedPictures,
  pictureReferencePattern,
  unresolvedImagePlaceholders
} from "./shared.js";

const hidreamO1MarkupContract = [
  "HiDream-O1-Image reference and local-edit contract:",
  "With one reference Picture, describe the requested instruction edit relative to Picture 1 and preserve the subject identity, composition, lighting, perspective, and visible text unless the user explicitly changes them.",
  "A saved Mask is a location-only edit boundary. Change the masked region and the minimum feathered surroundings; preserve all unmasked pixels because the final image will be composited back over the original source.",
  "Canvas annotations are location-only guidance. Never reproduce colored marks, boxes, arrows, labels, notes, or annotation text in the output. Use the annotation notes only to identify the requested targets.",
  "For viewpoint changes, state the new camera angle, viewing direction, subject orientation, framing, and spatial relationships. For added detail, specify the affected material, texture, light, shadow, perspective, depth, and natural edge blending."
].join("\n");

function hidreamO1PictureWithMarkupGuide(
  picture: ImageReferenceSnapshot
): ImageReferenceSnapshot {
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
export function compileHiDreamO1Prompt(
  prompt: string,
  pictures: ImageReferenceSnapshot[],
  t: Translate = createTranslator().t
): CompiledImagePrompt {
  const ordered = orderedPictures(pictures);
  const errors: string[] = [];
  ordered
    .filter((picture) => !picture.absolutePath.trim())
    .forEach((picture) => errors.push(t(uiKeys.workflowChecks.pictureEmpty, { number: picture.pictureNumber })));
  if (ordered.length > hidreamO1Capability.maxPictures) {
    errors.push(t(uiKeys.workflowChecks.hidreamLimit));
  }
  const picture = ordered.find((candidate) => candidate.absolutePath.trim());
  const originalPictureNumber = picture?.pictureNumber;
  const referencedPictureNumbers = new Set<number>();
  const compiledPrompt = prompt.replace(pictureReferencePattern, (match, numberText: string) => {
    const originalNumber = Number(numberText);
    referencedPictureNumbers.add(originalNumber);
    if (originalNumber !== originalPictureNumber) {
      errors.push(t(uiKeys.workflowChecks.hidreamReference, { reference: match, number: originalNumber }));
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
      ? hidreamO1PictureWithMarkupGuide(picture)
      : { ...picture, pictureNumber: 1 }
    : undefined;
  const promptParts = [compiledPrompt];
  if (hasMarkupGuide || hasMask) promptParts.push(hidreamO1MarkupContract);
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
] as const;

export function validateHiDreamO1Workflow(
  workflow: ComfyApiWorkflow,
  _qualityProfile = "native",
  allowImagePlaceholders = false,
  t: Translate = createTranslator().t
): string[] {
  const nodeTypes = new Set(Object.values(workflow).map((node) => node.class_type));
  const errors = hidreamO1CoreNodeTypes
    .filter((nodeType) => !nodeTypes.has(nodeType))
    .map((nodeType) => t(uiKeys.workflowChecks.hidreamNode, { node: nodeType }));
  const inputNodes = Object.values(workflow).filter((node) => node.class_type === "LoadImage");
  const referenceNodes = Object.values(workflow).filter((node) => node.class_type === "HiDreamO1ReferenceImages");
  const maskNodes = Object.values(workflow).filter((node) => node.class_type === "LoadImageMask");
  const compositeNodes = Object.values(workflow).filter((node) => node.class_type === "ImageCompositeMasked");
  if (inputNodes.length > 1) errors.push(t(uiKeys.workflowChecks.hidreamInputCount));
  if (referenceNodes.length > 1) errors.push(t(uiKeys.workflowChecks.hidreamReferenceCount));
  if (maskNodes.length > 1) errors.push(t(uiKeys.workflowChecks.hidreamMaskCount));
  if (compositeNodes.length > 1) errors.push(t(uiKeys.workflowChecks.hidreamCompositeCount));
  if (inputNodes.length === 1 && referenceNodes.length !== 1) {
    errors.push(t(uiKeys.workflowChecks.hidreamReferenceNode));
  }
  if (inputNodes.length === 0 && referenceNodes.length > 0) {
    errors.push(t(uiKeys.workflowChecks.hidreamReferenceBinding));
  }
  if (maskNodes.length > 0 && inputNodes.length !== 1) {
    errors.push(t(uiKeys.workflowChecks.hidreamMaskBinding));
  }
  if (maskNodes.length > 0 && compositeNodes.length !== 1) {
    errors.push(t(uiKeys.workflowChecks.hidreamMaskComposite));
  }
  if (maskNodes.length === 0 && compositeNodes.length > 0) {
    errors.push(t(uiKeys.workflowChecks.hidreamCompositeMask));
  }
  if (!allowImagePlaceholders && unresolvedImagePlaceholders(workflow).length) {
    errors.push(t(uiKeys.workflowChecks.hidreamPlaceholders));
  }
  return [...new Set(errors)];
}

function hidreamO1OutputDimensions(
  task: ImageGenerationQueueTask,
  picture: ImageReferenceSnapshot | undefined,
  t: Translate = createTranslator().t
): [number, number] {
  return [
    exactImageDimension(task.outputWidth, picture?.width || hidreamO1Capability.textOnlyOutputWidth || 2048, t),
    exactImageDimension(task.outputHeight, picture?.height || hidreamO1Capability.textOnlyOutputHeight || 2048, t)
  ];
}

function hidreamO1LatentDimension(value: number,
  t: Translate = createTranslator().t): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(t(uiKeys.workflowChecks.hidreamDimensions));
  }
  return Math.max(64, Math.floor(value / 32) * 32);
}

function hidreamO1OutputPrefix(
  task: ImageGenerationQueueTask,
  run: ImageGenerationRun
): string {
  return [
    task.imageOutputSubfolder?.replace(/[\\/]+/gu, "/").replace(/^\/+|\/+$/gu, ""),
    `HiDreamO1_${task.outputFilename}_${run.index + 1}`
  ].filter(Boolean).join("/");
}

export function buildHiDreamO1Workflow(
  task: ImageGenerationQueueTask,
  run: ImageGenerationRun,
  t: Translate = createTranslator().t
): ComfyApiWorkflow {
  const compiled = compileHiDreamO1Prompt(task.prompt, task.pictures, t);
  if (compiled.errors.length) throw new Error(compiled.errors.join(" "));
  const picture = compiled.pictures[0];
  const hasMask = Boolean(picture?.mask?.regionCount && picture.mask.maskPath.trim());
  const quality = hidreamO1Capability.qualityProfiles.find((profile) => profile.id === task.qualityProfile) ?? hidreamO1Capability.qualityProfiles[0]!;
  const [outputWidth, outputHeight] = hidreamO1OutputDimensions(task, picture, t);
  const latentWidth = hidreamO1LatentDimension(outputWidth, t);
  const latentHeight = hidreamO1LatentDimension(outputHeight, t);
  const workflow: ComfyApiWorkflow = {
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
    if (!sampler) throw new Error(t(uiKeys.workflowChecks.hidreamSampler));
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
    if (!save) throw new Error(t(uiKeys.workflowChecks.hidreamSave));
    save.inputs.images = ["composite", 0];
  }
  const errors = validateHiDreamO1Workflow(workflow, quality.id, true, t);
  if (errors.length) throw new Error(errors.join(" "));
  return workflow;
}
