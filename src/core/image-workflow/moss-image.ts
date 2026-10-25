import type { ImageGenerationQueueTask, ImageGenerationRun, ImageReferenceSnapshot } from "../../types.js";
import type { ComfyApiWorkflow, CompiledImagePrompt, ImageModelAdapter, ImageModelCapability } from "./contracts.js";
import { parseImageOutputs } from "./shared.js";
import {
  MOSS_IMAGE_ID, MOSS_NSFW_ID, MOSS_IMAGE_MODEL, MOSS_NSFW_MODEL,
  MOSS_TEXT_ENCODER, MOSS_VAE, MOSS_REQUIRED_NODE_TYPES
} from "../moss-image-spec.js";

export const mossImageCapability: ImageModelCapability = {
  id: MOSS_IMAGE_ID, name: "MOSS Image SFT · INT8", maxPictures: 0,
  supportedFormats: ["png"], requiresPrompt: true, supportsSeed: true,
  supportsTextOnly: true, supportsMask: false, supportsMarkup: false,
  outputMultiple: 16, textOnlyOutputWidth: 1024, textOnlyOutputHeight: 1024,
  qualityProfiles: [
    { id: "comfy-25", label: "ComfyUI", steps: 25, cfg: 2.5, lightning: false },
    { id: "quality-50", label: "Quality", steps: 50, cfg: 3, lightning: false }
  ]
};
export const mossNsfwCapability: ImageModelCapability = {
  ...mossImageCapability, id: MOSS_NSFW_ID, name: "MOSS · PornMaster V1 · INT8"
};

export function compileMossImagePrompt(prompt: string, pictures: ImageReferenceSnapshot[]): CompiledImagePrompt {
  return {
    prompt: prompt.trim(), pictures: [], referencedPictureNumbers: [],
    errors: [
      ...(!prompt.trim() ? ["MOSS 需要文生图提示词或 JSON 布局。"] : []),
      ...(pictures.some(p => p.absolutePath.trim()) ? ["MOSS 当前仅支持文生图，请移除参考图片；Paint、Mask 与参考编辑需要独立的编辑权重。"] : [])
    ]
  };
}

export function validateMossImageWorkflow(workflow: ComfyApiWorkflow): string[] {
  const nodes = Object.values(workflow);
  const types = new Set(nodes.map(n => n.class_type));
  const errors = MOSS_REQUIRED_NODE_TYPES.filter(type => !types.has(type))
    .map(type => `MOSS 工作流缺少节点 ${type}。`);
  if (types.has("LoadImage") || types.has("VAEEncodeForInpaint")) errors.push("MOSS 文生图不能接收参考图或 Mask。");
  const latent = nodes.find(n => n.class_type === "EmptyFlux2LatentImage");
  if (latent && [latent.inputs.width, latent.inputs.height].some(v =>
    typeof v !== "number" || !Number.isInteger(v) || v < 16 || v % 16 !== 0
  )) errors.push("MOSS 输出尺寸必须为 16 的正整数倍。");
  const clip = nodes.find(n => n.class_type === "CLIPLoader");
  if (clip && clip.inputs.type !== "moss_image") errors.push("MOSS 需要 CLIPLoader type=moss_image。");
  return errors;
}

/** Reject missing sockets/enums before inference; file presence remains a separate gate. */
export function validateMossImageRuntimeSchema(workflow: ComfyApiWorkflow, objectInfo: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const node of Object.values(workflow)) {
    const schema = objectInfo[node.class_type] as {
      input?: { required?: Record<string, unknown>; optional?: Record<string, unknown> }
    } | undefined;
    if (!schema?.input) {
      errors.push(`MOSS 缺少 ${node.class_type} schema，请升级并重启 ComfyUI（推荐 0.42.3+）。`);
      continue;
    }
    const required = schema.input.required ?? {};
    const sockets = { ...required, ...schema.input.optional };
    for (const name of Object.keys(required)) {
      if (!(name in node.inputs)) errors.push(`MOSS ${node.class_type} 缺少必填输入 ${name}。`);
    }
    for (const [name, value] of Object.entries(node.inputs)) {
      const definition = sockets[name];
      if (!definition) errors.push(`MOSS ${node.class_type} 不支持输入 ${name}。`);
      else if (!Array.isArray(value) && Array.isArray(definition) && Array.isArray(definition[0]) &&
        !definition[0].includes(value)) errors.push(`MOSS ${node.class_type}.${name} 不支持 ${String(value)}；请检查文件与 ComfyUI 版本。`);
    }
  }
  return [...new Set(errors)];
}

export function buildMossImageWorkflow(task: ImageGenerationQueueTask, run: ImageGenerationRun): ComfyApiWorkflow {
  const compiled = compileMossImagePrompt(task.prompt, task.pictures);
  if (compiled.errors.length) throw new Error(compiled.errors.join(" "));
  if (task.imageLoras?.length) throw new Error("当前 MOSS 工作流不支持附加图片 LoRA。");
  const quality = mossImageCapability.qualityProfiles.find(p => p.id === task.qualityProfile);
  if (!quality) throw new Error(`MOSS 不支持质量档位 ${task.qualityProfile}，请重新选择。`);
  const quality50 = quality.id === "quality-50";
  const prefix = [task.imageOutputSubfolder?.replace(/[\\/]+/gu, "/").replace(/^\/+|\/+$/gu, ""),
    `MOSS_${task.outputFilename}_${run.index + 1}`].filter(Boolean).join("/");
  const workflow: ComfyApiWorkflow = {
    model: { class_type: "UNETLoader", inputs: {
      unet_name: task.diffusionModelFilename || (task.modelId === MOSS_NSFW_ID ? MOSS_NSFW_MODEL : MOSS_IMAGE_MODEL), weight_dtype: "default"
    } },
    clip: { class_type: "CLIPLoader", inputs: { clip_name: MOSS_TEXT_ENCODER, type: "moss_image", device: "default" } },
    vae: { class_type: "VAELoader", inputs: { vae_name: MOSS_VAE } },
    positive: { class_type: "CLIPTextEncode", inputs: { clip: ["clip", 0], text: compiled.prompt } },
    negative: { class_type: "CLIPTextEncode", inputs: { clip: ["clip", 0], text: "" } },
    latent: { class_type: "EmptyFlux2LatentImage", inputs: { width: task.outputWidth || 1024, height: task.outputHeight || 1024, batch_size: 1 } },
    // Native MOSS already uses shift 5. ModelSamplingSD3 has a different scale.
    slg: { class_type: "SkipLayerGuidanceDiTSimple", inputs: {
      model: ["model", 0], double_layers: "", single_layers: "22", start_percent: 0, end_percent: quality50 ? 1 : 0.5
    } },
    sampler: { class_type: "KSampler", inputs: {
      model: ["slg", 0], positive: ["positive", 0], negative: ["negative", 0], latent_image: ["latent", 0],
      seed: run.seed, steps: quality.steps, cfg: quality.cfg, sampler_name: quality50 ? "euler" : "er_sde", scheduler: "simple", denoise: 1
    } },
    decoded: { class_type: "VAEDecode", inputs: { samples: ["sampler", 0], vae: ["vae", 0] } },
    save: { class_type: "SaveImage", inputs: { images: ["decoded", 0], filename_prefix: prefix } }
  };
  const errors = validateMossImageWorkflow(workflow);
  if (errors.length) throw new Error(errors.join(" "));
  return workflow;
}

function adapter(capability: ImageModelCapability): ImageModelAdapter {
  return { ...capability, compilePrompt: compileMossImagePrompt, buildWorkflow: buildMossImageWorkflow,
    validateWorkflow: validateMossImageWorkflow, validateRuntimeSchema: validateMossImageRuntimeSchema, parseOutputs: parseImageOutputs };
}
export const mossImageAdapter = adapter(mossImageCapability);
export const mossNsfwAdapter = adapter(mossNsfwCapability);
