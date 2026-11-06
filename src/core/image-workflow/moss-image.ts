import { uiKeys } from "../i18n-keys.js";
import type { Translate } from "../i18n.js";
import { createTranslator } from "../i18n.js";
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

export function compileMossImagePrompt(prompt: string, pictures: ImageReferenceSnapshot[],
  t: Translate = createTranslator().t): CompiledImagePrompt {
  return {
    prompt: prompt.trim(), pictures: [], referencedPictureNumbers: [],
    errors: [
      ...(!prompt.trim() ? [t(uiKeys.workflowChecks.mossPrompt)] : []),
      ...(pictures.some(p => p.absolutePath.trim()) ? [t(uiKeys.workflowChecks.mossTextOnly)] : [])
    ]
  };
}

export function validateMossImageWorkflow(workflow: ComfyApiWorkflow,
  t: Translate = createTranslator().t): string[] {
  const nodes = Object.values(workflow);
  const types = new Set(nodes.map(n => n.class_type));
  const errors = MOSS_REQUIRED_NODE_TYPES.filter(type => !types.has(type))
    .map(type => t(uiKeys.workflowChecks.mossNode, { node: type }));
  if (types.has("LoadImage") || types.has("VAEEncodeForInpaint")) errors.push(t(uiKeys.workflowChecks.mossReferences));
  const latent = nodes.find(n => n.class_type === "EmptyFlux2LatentImage");
  if (latent && [latent.inputs.width, latent.inputs.height].some(v =>
    typeof v !== "number" || !Number.isInteger(v) || v < 16 || v % 16 !== 0
  )) errors.push(t(uiKeys.workflowChecks.mossDimensions));
  const clip = nodes.find(n => n.class_type === "CLIPLoader");
  if (clip && clip.inputs.type !== "moss_image") errors.push(t(uiKeys.workflowChecks.mossClip));
  return errors;
}

/** Reject missing sockets/enums before inference; file presence remains a separate gate. */
export function validateMossImageRuntimeSchema(workflow: ComfyApiWorkflow, objectInfo: Record<string, unknown>,
  t: Translate = createTranslator().t): string[] {
  const errors: string[] = [];
  for (const node of Object.values(workflow)) {
    const schema = objectInfo[node.class_type] as {
      input?: { required?: Record<string, unknown>; optional?: Record<string, unknown> }
    } | undefined;
    if (!schema?.input) {
      errors.push(t(uiKeys.workflowChecks.mossSchema, { node: node.class_type }));
      continue;
    }
    const required = schema.input.required ?? {};
    const sockets = { ...required, ...schema.input.optional };
    for (const name of Object.keys(required)) {
      if (!(name in node.inputs)) errors.push(t(uiKeys.workflowChecks.mossRequiredInput, { node: node.class_type, input: name }));
    }
    for (const [name, value] of Object.entries(node.inputs)) {
      const definition = sockets[name];
      if (!definition) errors.push(t(uiKeys.workflowChecks.mossUnsupportedInput, { node: node.class_type, input: name }));
      else if (!Array.isArray(value) && Array.isArray(definition) && Array.isArray(definition[0]) &&
        !definition[0].includes(value)) errors.push(t(uiKeys.workflowChecks.mossEnum, { node: node.class_type, input: name, value: String(value) }));
    }
  }
  return [...new Set(errors)];
}

export function buildMossImageWorkflow(task: ImageGenerationQueueTask, run: ImageGenerationRun,
  t: Translate = createTranslator().t): ComfyApiWorkflow {
  const compiled = compileMossImagePrompt(task.prompt, task.pictures, t);
  if (compiled.errors.length) throw new Error(compiled.errors.join(" "));
  if (task.imageLoras?.length) throw new Error(t(uiKeys.workflowChecks.mossLoras));
  const quality = mossImageCapability.qualityProfiles.find(p => p.id === task.qualityProfile);
  if (!quality) throw new Error(t(uiKeys.workflowChecks.mossQuality, { quality: task.qualityProfile }));
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
  const errors = validateMossImageWorkflow(workflow, t);
  if (errors.length) throw new Error(errors.join(" "));
  return workflow;
}

function adapter(capability: ImageModelCapability): ImageModelAdapter {
  return { ...capability, compilePrompt: compileMossImagePrompt, buildWorkflow: buildMossImageWorkflow,
    validateWorkflow: (workflow, _quality, _allow, _recipe, t) => validateMossImageWorkflow(workflow, t),
    validateRuntimeSchema: validateMossImageRuntimeSchema, parseOutputs: parseImageOutputs };
}
export const mossImageAdapter = adapter(mossImageCapability);
export const mossNsfwAdapter = adapter(mossNsfwCapability);
