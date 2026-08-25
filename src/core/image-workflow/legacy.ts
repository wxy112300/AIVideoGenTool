import type {
  ImageGenerationQueueTask,
  ImageGenerationRun,
  ImageReferenceSnapshot
} from "../../types.js";
import type { ComfyApiWorkflow, CompiledImagePrompt } from "./contracts.js";
import {
  birefnetBackgroundRemovalCapability,
  lamaInpaintCapability
} from "./capabilities.js";
import {
  birefnetRequiredNodeTypes,
  lamaInpaintRequiredNodeTypes
} from "./node-requirements.js";
import { orderedPictures } from "./shared.js";

export function compileBirefnetInput(
  _prompt: string,
  pictures: ImageReferenceSnapshot[]
): CompiledImagePrompt {
  const picture = orderedPictures(pictures)[0];
  const errors: string[] = [];
  if (!picture?.absolutePath.trim()) errors.push("BiRefNet 自动抠图需要一张原始图片。");
  if (pictures.length > 1) errors.push("BiRefNet 自动抠图只支持一张原始图片。");
  return {
    prompt: "",
    pictures: picture?.absolutePath.trim() ? [picture] : [],
    referencedPictureNumbers: [],
    errors
  };
}
export function validateBirefnetWorkflow(
  workflow: ComfyApiWorkflow,
  _qualityProfile = "native",
  allowImagePlaceholders = false
): string[] {
  const nodeTypes = new Set(Object.values(workflow).map((node) => node.class_type));
  const errors = birefnetRequiredNodeTypes
    .filter((nodeType) => !nodeTypes.has(nodeType))
    .map((nodeType) => `BiRefNet 工作流缺少节点 ${nodeType}。`);
  const inputNodes = Object.values(workflow).filter((node) => node.class_type === "LoadImage");
  if (inputNodes.length !== 1) errors.push("BiRefNet 自动抠图工作流必须包含 1 个 LoadImage 节点。");
  if (!allowImagePlaceholders) {
    const unresolved = Object.values(workflow).flatMap((node) =>
      Object.values(node.inputs).filter((value) =>
        typeof value === "string" && /^\{\{IMAGE_\d+\}\}$/u.test(value)
      )
    );
    if (unresolved.length) errors.push("BiRefNet 工作流仍包含未上传的图片占位符。");
  }
  return [...new Set(errors)];
}

export function buildBirefnetBackgroundRemovalWorkflow(
  task: ImageGenerationQueueTask,
  run: ImageGenerationRun
): ComfyApiWorkflow {
  const compiled = compileBirefnetInput(task.prompt, task.pictures);
  if (compiled.errors.length) throw new Error(compiled.errors.join(" "));
  const picture = compiled.pictures[0];
  if (!picture) throw new Error("BiRefNet 自动抠图至少需要一张基础 Picture。");
  const outputPrefix = [
    task.imageOutputSubfolder?.replace(/[\\/]+/gu, "/").replace(/^\/+|\/+$/gu, ""),
    `BiRefNet_${task.outputFilename}_${run.index + 1}`
  ].filter(Boolean).join("/");
  const workflow: ComfyApiWorkflow = {
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
  if (errors.length) throw new Error(errors.join(" "));
  return workflow;
}

export function compileLamaInpaintInput(
  _prompt: string,
  pictures: ImageReferenceSnapshot[]
): CompiledImagePrompt {
  const picture = orderedPictures(pictures)[0];
  const errors: string[] = [];
  if (!picture?.absolutePath.trim()) errors.push("LaMa 局部移除需要一张原始图片。");
  if (pictures.length > 1) errors.push("LaMa 局部移除只支持一张原始图片。");
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

export function validateLamaInpaintWorkflow(
  workflow: ComfyApiWorkflow,
  _qualityProfile = "natural",
  allowImagePlaceholders = false
): string[] {
  const nodeTypes = new Set(Object.values(workflow).map((node) => node.class_type));
  const errors = lamaInpaintRequiredNodeTypes
    .filter((nodeType) => !nodeTypes.has(nodeType))
    .map((nodeType) => `LaMa 工作流缺少节点 ${nodeType}。`);
  if (!allowImagePlaceholders) {
    const unresolved = Object.values(workflow).flatMap((node) =>
      Object.values(node.inputs).filter((value) =>
        typeof value === "string" && /^\{\{(?:IMAGE|MASK)_\d+\}\}$/u.test(value)
      )
    );
    if (unresolved.length) errors.push("LaMa 工作流仍包含未上传的图片或 Mask 占位符。");
  }
  return [...new Set(errors)];
}

export function buildLamaInpaintWorkflow(
  task: ImageGenerationQueueTask,
  run: ImageGenerationRun
): ComfyApiWorkflow {
  const compiled = compileLamaInpaintInput(task.prompt, task.pictures);
  if (compiled.errors.length) throw new Error(compiled.errors.join(" "));
  const edge = task.qualityProfile === "tight"
    ? { grow: 3, blur: 3 }
    : task.qualityProfile === "wide"
      ? { grow: 16, blur: 7 }
      : { grow: 8, blur: 5 };
  const outputPrefix = [
    task.imageOutputSubfolder?.replace(/[\\/]+/gu, "/").replace(/^\/+|\/+$/gu, ""),
    `LaMa_${task.outputFilename}_${run.index + 1}`
  ].filter(Boolean).join("/");
  const workflow: ComfyApiWorkflow = {
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
  if (errors.length) throw new Error(errors.join(" "));
  return workflow;
}
