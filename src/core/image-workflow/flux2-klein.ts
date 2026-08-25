import type {
  ImageGenerationQueueTask,
  ImageGenerationRun,
  ImageReferenceSnapshot
} from "../../types.js";
import type { ComfyApiWorkflow, CompiledImagePrompt } from "./contracts.js";
import {
  flux2Klein4bCapability,
  flux2Klein4bDiffusionModel,
  flux2Klein4bTextEncoder,
  flux2Klein4bVae
} from "./capabilities.js";
import { flux2Klein4bRequiredNodeTypes } from "./node-requirements.js";
import {
  compileImagePromptWithLimit,
  exactImageDimension,
  pictureReferencePattern
} from "./shared.js";

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
