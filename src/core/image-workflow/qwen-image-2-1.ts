import { uiKeys } from "../i18n-keys.js";
import type { Translate } from "../i18n.js";
import { createTranslator } from "../i18n.js";
import type {
  ImageGenerationQueueTask,
  ImageGenerationRun,
  ImageReferenceSnapshot
} from "../../types.js";
import type { ComfyApiWorkflow, CompiledImagePrompt, ImageModelCapability } from "./contracts.js";
import {
  qwenImage21Capability,
  qwenImage21DiffusionModel,
  qwenImage21TurboCapability,
  qwenImage21TurboDiffusionModel,
  qwenImage21TextEncoder,
  qwenImage21Vae,
  qwenImage21UncensoredGgufCapability,
  qwenImage21UncensoredGgufDiffusionModel,
  qwenImage21UncensoredGgufQ6Capability,
  qwenImage21UncensoredGgufQ6DiffusionModel
} from "./capabilities.js";
import {
  qwenImage21GgufRequiredNodeTypes,
  qwenImage21GgufTextToImageRequiredNodeTypes,
  qwenImage21FixRequiredNodeTypes,
  qwenImage21RequiredNodeTypes,
  qwenImage21TextToImageRequiredNodeTypes,
  qwenImage21TurboRequiredNodeTypes,
  qwenImage21TurboTextToImageRequiredNodeTypes
} from "./node-requirements.js";
import {
  compileImagePromptWithLimit,
  exactImageDimension
} from "./shared.js";
import {
  imageLoraConfigurationError,
  imageLoraUsesQwenImage21Fix,
  imagePromptForLoras
} from "../image-loras.js";

const qwenImage21PromptReferencePattern = /\bPicture\s+([1-9]\d*)\b/gu;
const qwenImage21FixNegativePrompt =
  "artifacts, gpt-image, washed-out colors, low quality, low resolution, AI slop, deviantart, sloppy lines, rough sketch, blurry, indistinct, missing fingers, badly drawn hands, wrong number of fingers";
/** The sample_sigmas persisted in Qwen/Qwen-Image-2.1-Turbo's pipeline config, plus the terminal zero required by ComfyUI. */
export const qwenImage21TurboSigmaSchedule =
  "1.0, 0.978453, 0.95418, 0.926626, 0.89508, 0.845148, 0.704534, 0.414568, 0.0";

function officialQwenImage21Prompt(prompt: string): string {
  // The official template uses <image1> … <image10>. The shared compiler
  // keeps stable Picture numbers while it pairs annotation guides, so only
  // the final compiled prompt needs this model-specific token conversion.
  return prompt.replace(qwenImage21PromptReferencePattern, (_match, numberText: string) =>
    `<image${Number(numberText)}>`
  );
}

export function compileQwenImage21Prompt(
  prompt: string,
  pictures: ImageReferenceSnapshot[],
  t: Translate = createTranslator().t
): CompiledImagePrompt {
  const compiled = compileImagePromptWithLimit(
    prompt,
    pictures,
    qwenImage21Capability.maxPictures,
    "Qwen Image 2.1",
    true, t
  );
  return {
    ...compiled,
    prompt: officialQwenImage21Prompt(compiled.prompt)
  };
}

function qwenImage21LatentDimension(value: number, fallback: number, multiple = 8,
  t: Translate = createTranslator().t): number {
  const dimension = exactImageDimension(value, fallback, t);
  // The official ResolutionSelector emits dimensions in multiples of 8.
  // Keep the UI's selected 720p/1080p/etc. canvas intact instead of silently
  // rounding it to a different visible resolution.
  const normalizedMultiple = Number.isFinite(multiple) && multiple > 0
    ? Math.max(1, Math.trunc(multiple))
    : 8;
  return Math.max(normalizedMultiple, Math.round(dimension / normalizedMultiple) * normalizedMultiple);
}

function qwenImage21ReferenceResolution(width: number, height: number): number {
  if (!(width > 0 && height > 0)) return 0;
  // TextEncodeQwenImage21's resolution is the square-root pixel budget used
  // to resize reference images. Match the official edit template's 32 step.
  return Math.max(32, Math.round(Math.sqrt(width * height) / 32) * 32);
}

type QwenImage21WorkflowOptions = Readonly<{
  modelLoaderClassType: "UNETLoader" | "UnetLoaderGGUF";
  diffusionModel: string;
  capability: ImageModelCapability;
  textToImageRequiredNodeTypes: readonly string[];
  editRequiredNodeTypes: readonly string[];
  samplingMode: "standard" | "turbo";
}>;

const officialQwenImage21WorkflowOptions: QwenImage21WorkflowOptions = {
  modelLoaderClassType: "UNETLoader",
  diffusionModel: qwenImage21DiffusionModel,
  capability: qwenImage21Capability,
  textToImageRequiredNodeTypes: qwenImage21TextToImageRequiredNodeTypes,
  editRequiredNodeTypes: qwenImage21RequiredNodeTypes,
  samplingMode: "standard"
};

const turboQwenImage21WorkflowOptions: QwenImage21WorkflowOptions = {
  modelLoaderClassType: "UNETLoader",
  diffusionModel: qwenImage21TurboDiffusionModel,
  capability: qwenImage21TurboCapability,
  textToImageRequiredNodeTypes: qwenImage21TurboTextToImageRequiredNodeTypes,
  editRequiredNodeTypes: qwenImage21TurboRequiredNodeTypes,
  samplingMode: "turbo"
};

const ggufQwenImage21WorkflowOptions: QwenImage21WorkflowOptions = {
  modelLoaderClassType: "UnetLoaderGGUF",
  diffusionModel: qwenImage21UncensoredGgufDiffusionModel,
  capability: qwenImage21UncensoredGgufCapability,
  textToImageRequiredNodeTypes: qwenImage21GgufTextToImageRequiredNodeTypes,
  editRequiredNodeTypes: qwenImage21GgufRequiredNodeTypes,
  samplingMode: "standard"
};

const ggufQ6QwenImage21WorkflowOptions: QwenImage21WorkflowOptions = {
  modelLoaderClassType: "UnetLoaderGGUF",
  diffusionModel: qwenImage21UncensoredGgufQ6DiffusionModel,
  capability: qwenImage21UncensoredGgufQ6Capability,
  textToImageRequiredNodeTypes: qwenImage21GgufTextToImageRequiredNodeTypes,
  editRequiredNodeTypes: qwenImage21GgufRequiredNodeTypes,
  samplingMode: "standard"
};

function validateQwenImage21WorkflowForOptions(
  workflow: ComfyApiWorkflow,
  _qualityProfile = "preview-25",
  allowImagePlaceholders = false,
  options: QwenImage21WorkflowOptions,
  additionalRequiredNodeTypes: readonly string[] = [],
  t: Translate = createTranslator().t
): string[] {
  const nodeTypes = new Set(Object.values(workflow).map((node) => node.class_type));
  const inputNodes = Object.values(workflow).filter((node) => node.class_type === "LoadImage");
  const hasPictures = inputNodes.length > 0;
  const requiredNodeTypes = [
    ...(hasPictures ? options.editRequiredNodeTypes : options.textToImageRequiredNodeTypes),
    ...additionalRequiredNodeTypes
  ];
  const errors = requiredNodeTypes
    .filter((nodeType) => !nodeTypes.has(nodeType))
    .map((nodeType) => t(uiKeys.workflowChecks.qwen21Node, { node: nodeType }));
  if (inputNodes.length > options.capability.maxPictures) {
    errors.push(t(uiKeys.workflowChecks.qwen21InputCount, { count: options.capability.maxPictures }));
  }
  if (!hasPictures && !options.capability.supportsTextOnly) {
    errors.push(t(uiKeys.workflowChecks.qwen21TextOnly));
  }
  const unresolvedPlaceholders = Object.values(workflow).flatMap((node) =>
    Object.values(node.inputs).filter(
      (value) => typeof value === "string" && /^\{\{IMAGE_\d+\}\}$/u.test(value)
    )
  );
  if (unresolvedPlaceholders.length && !allowImagePlaceholders) {
    errors.push(t(uiKeys.workflowChecks.qwen21Placeholder));
  }
  return [...new Set(errors)];
}

export function validateQwenImage21Workflow(
  workflow: ComfyApiWorkflow,
  qualityProfile = "preview-25",
  allowImagePlaceholders = false,
  t: Translate = createTranslator().t
): string[] {
  return validateQwenImage21WorkflowForOptions(
    workflow,
    qualityProfile,
    allowImagePlaceholders,
    officialQwenImage21WorkflowOptions, undefined, t
  );
}

export function validateQwenImage21TurboWorkflow(
  workflow: ComfyApiWorkflow,
  qualityProfile = "turbo-8",
  allowImagePlaceholders = false,
  t: Translate = createTranslator().t
): string[] {
  return validateQwenImage21WorkflowForOptions(
    workflow,
    qualityProfile,
    allowImagePlaceholders,
    turboQwenImage21WorkflowOptions, undefined, t
  );
}

export function validateQwenImage21GgufWorkflow(
  workflow: ComfyApiWorkflow,
  qualityProfile = "preview-25",
  allowImagePlaceholders = false,
  t: Translate = createTranslator().t
): string[] {
  return validateQwenImage21WorkflowForOptions(
    workflow,
    qualityProfile,
    allowImagePlaceholders,
    ggufQwenImage21WorkflowOptions, undefined, t
  );
}

export function validateQwenImage21GgufQ6Workflow(
  workflow: ComfyApiWorkflow,
  qualityProfile = "preview-25",
  allowImagePlaceholders = false,
  t: Translate = createTranslator().t
): string[] {
  return validateQwenImage21WorkflowForOptions(
    workflow,
    qualityProfile,
    allowImagePlaceholders,
    ggufQ6QwenImage21WorkflowOptions, undefined, t
  );
}

type RuntimeInputGroups = {
  required: Record<string, unknown>;
  optional: Record<string, unknown>;
};

function runtimeInputGroups(value: unknown): RuntimeInputGroups | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = (value as { input?: unknown }).input;
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const groups = input as Record<string, unknown>;
  const record = (candidate: unknown): Record<string, unknown> =>
    candidate && typeof candidate === "object" && !Array.isArray(candidate)
      ? candidate as Record<string, unknown>
      : {};
  return {
    required: record(groups.required),
    optional: record(groups.optional)
  };
}

function dynamicComboNestedInputSpec(
  value: unknown,
  selectedOption: unknown,
  inputName: string
): unknown {
  if (!Array.isArray(value) || typeof value[1] !== "object" || value[1] === null || Array.isArray(value[1])) {
    return undefined;
  }
  const options = (value[1] as { options?: unknown }).options;
  if (!Array.isArray(options)) return undefined;
  const option = options.find((candidate) =>
    candidate && typeof candidate === "object" && !Array.isArray(candidate) &&
    String((candidate as { key?: unknown }).key) === String(selectedOption)
  );
  if (!option || typeof option !== "object" || Array.isArray(option)) return undefined;
  const inputs = (option as { inputs?: unknown }).inputs;
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) return undefined;
  for (const groupName of ["required", "optional"] as const) {
    const group = (inputs as Record<string, unknown>)[groupName];
    if (group && typeof group === "object" && !Array.isArray(group) && inputName in group) {
      return (group as Record<string, unknown>)[inputName];
    }
  }
  return undefined;
}

function runtimeInputSpec(
  groups: RuntimeInputGroups,
  inputName: string,
  selectedParentValue?: unknown
): unknown {
  const direct = groups.required[inputName] ?? groups.optional[inputName];
  if (direct !== undefined) return direct;
  const separator = inputName.indexOf(".");
  if (separator < 0) return undefined;
  const baseName = inputName.slice(0, separator);
  const baseSpec = groups.required[baseName] ?? groups.optional[baseName];
  return dynamicComboNestedInputSpec(baseSpec, selectedParentValue, inputName.slice(separator + 1));
}

const qwenImage21RequiredSockets: Readonly<Record<string, readonly string[]>> = {
  UNETLoader: ["unet_name", "weight_dtype"],
  CLIPLoader: ["clip_name", "type", "device"],
  VAELoader: ["vae_name"],
  LoadImage: ["image"],
  TextEncodeQwenImage21: ["clip", "prompt", "negative_prompt", "vae", "resolution", "images"],
  EmptyLatentImage: ["width", "height", "batch_size"],
  ComfySwitchNode: ["on_false", "on_true", "switch"],
  QwenImage21Cache: ["model", "device", "dtype"],
  LoraLoaderModelOnly: ["model", "lora_name", "strength_model"],
  APG: ["model", "eta", "norm_threshold", "momentum"],
  FreSca: ["model", "scale_low", "scale_high", "freq_cutoff"],
  KSampler: ["model", "positive", "negative", "latent_image", "seed", "steps", "cfg", "sampler_name", "scheduler", "denoise"],
  VAEDecode: ["samples", "vae"],
  SaveImageAdvanced: ["images", "filename_prefix", "format", "format.bit_depth", "format.input_color_space"]
};

const qwenImage21GgufRequiredSockets: Readonly<Record<string, readonly string[]>> = {
  ...qwenImage21RequiredSockets,
  UnetLoaderGGUF: ["unet_name"]
};

const qwenImage21TurboRequiredSockets: Readonly<Record<string, readonly string[]>> = {
  ...Object.fromEntries(
    Object.entries(qwenImage21RequiredSockets).filter(([nodeType]) => nodeType !== "KSampler")
  ),
  RandomNoise: ["noise_seed"],
  CFGGuider: ["model", "positive", "negative", "cfg"],
  KSamplerSelect: ["sampler_name"],
  ManualSigmas: ["sigmas"],
  SamplerCustomAdvanced: ["noise", "guider", "sampler", "sigmas", "latent_image"]
};

const qwenImage21EnumInputs = new Set([
  "UNETLoader.unet_name",
  "UNETLoader.weight_dtype",
  "CLIPLoader.clip_name",
  "CLIPLoader.type",
  "CLIPLoader.device",
  "VAELoader.vae_name",
  "LoraLoaderModelOnly.lora_name",
  "QwenImage21Cache.device",
  "QwenImage21Cache.dtype",
  "KSampler.sampler_name",
  "KSampler.scheduler",
  "SaveImageAdvanced.format",
  "SaveImageAdvanced.format.bit_depth",
  "SaveImageAdvanced.format.input_color_space"
]);

const qwenImage21GgufEnumInputs = new Set([
  ...qwenImage21EnumInputs,
  "UnetLoaderGGUF.unet_name"
]);

const qwenImage21TurboEnumInputs = new Set([
  ...[...qwenImage21EnumInputs].filter((inputName) => !inputName.startsWith("KSampler.")),
  "KSamplerSelect.sampler_name"
]);

function runtimeEnumValues(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (Array.isArray(value[0])) {
    const values = value[0].filter((item): item is string => typeof item === "string");
    return values.length ? values : undefined;
  }
  const directValues = value.filter((item): item is string => typeof item === "string");
  if (directValues.length === value.length) return directValues.length ? directValues : undefined;
  if (!value[1] || typeof value[1] !== "object" || Array.isArray(value[1])) return undefined;
  const options = (value[1] as { options?: unknown }).options;
  if (!Array.isArray(options)) return undefined;
  const directOptions = options.filter((option): option is string => typeof option === "string");
  if (directOptions.length === options.length && directOptions.length > 0) return directOptions;
  const keys = options
    .filter((option): option is { key: string } =>
      option !== null && typeof option === "object" && !Array.isArray(option) &&
      typeof (option as { key?: unknown }).key === "string"
    )
    .map((option) => option.key);
  return keys.length === options.length && keys.length ? keys : undefined;
}

function isDynamicComboSpec(value: unknown): boolean {
  return Array.isArray(value) && value[0] === "COMFY_DYNAMICCOMBO_V3";
}

function runtimeSupportsInput(
  groups: RuntimeInputGroups,
  inputName: string,
  nodeInputs: Record<string, unknown>
): boolean {
  if (groups.required[inputName] !== undefined || groups.optional[inputName] !== undefined) {
    return true;
  }
  const separator = inputName.indexOf(".");
  if (separator < 0) return false;
  const baseName = inputName.slice(0, separator);
  const baseSpec = groups.required[baseName] ?? groups.optional[baseName];
  if (baseSpec === undefined) return false;
  if (runtimeInputSpec(groups, inputName, nodeInputs[baseName]) !== undefined) return true;
  return !isDynamicComboSpec(baseSpec);
}

function validateQwenImage21RuntimeSchemaForOptions(
  workflow: ComfyApiWorkflow,
  objectInfo: Record<string, unknown>,
  options: QwenImage21WorkflowOptions,
  t: Translate = createTranslator().t
): string[] {
  const errors: string[] = [];
  const requiredSockets = options.samplingMode === "turbo"
    ? qwenImage21TurboRequiredSockets
    : options.modelLoaderClassType === "UnetLoaderGGUF"
      ? qwenImage21GgufRequiredSockets
      : qwenImage21RequiredSockets;
  const enumInputs = options.samplingMode === "turbo"
    ? qwenImage21TurboEnumInputs
    : options.modelLoaderClassType === "UnetLoaderGGUF"
      ? qwenImage21GgufEnumInputs
      : qwenImage21EnumInputs;
  for (const node of Object.values(workflow)) {
    const groups = runtimeInputGroups(objectInfo[node.class_type]);
    if (!groups) {
      errors.push(t(uiKeys.workflowChecks.runtimeSchema, { node: node.class_type }));
      continue;
    }
    const expectedRequired = requiredSockets[node.class_type] ?? [];
    for (const inputName of expectedRequired) {
      if (!runtimeSupportsInput(groups, inputName, node.inputs)) {
        errors.push(t(uiKeys.workflowChecks.runtimeSocket, { node: node.class_type, input: inputName }));
      }
    }
    for (const [inputName, inputValue] of Object.entries(node.inputs)) {
      const supported = runtimeSupportsInput(groups, inputName, node.inputs);
      if (!supported) {
        errors.push(t(uiKeys.workflowChecks.runtimeInput, { node: node.class_type, input: inputName }));
        continue;
      }
      if (Array.isArray(inputValue)) continue;
      const key = `${node.class_type}.${inputName}`;
      if (!enumInputs.has(key)) continue;
      const parentName = inputName.includes(".") ? inputName.slice(0, inputName.indexOf(".")) : undefined;
      const values = runtimeEnumValues(runtimeInputSpec(groups, inputName, parentName ? node.inputs[parentName] : undefined));
      if (!values) {
        errors.push(t(uiKeys.workflowChecks.runtimeEnumMissing, { input: key }));
      } else if (!values.includes(String(inputValue))) {
        errors.push(t(uiKeys.workflowChecks.runtimeEnumValue, { input: key, value: String(inputValue) }));
      }
    }
  }
  return [...new Set(errors)];
}

export function validateQwenImage21RuntimeSchema(
  workflow: ComfyApiWorkflow,
  objectInfo: Record<string, unknown>,
  t: Translate = createTranslator().t
): string[] {
  return validateQwenImage21RuntimeSchemaForOptions(
    workflow,
    objectInfo,
    officialQwenImage21WorkflowOptions, t
  );
}

export function validateQwenImage21TurboRuntimeSchema(
  workflow: ComfyApiWorkflow,
  objectInfo: Record<string, unknown>,
  t: Translate = createTranslator().t
): string[] {
  return validateQwenImage21RuntimeSchemaForOptions(
    workflow,
    objectInfo,
    turboQwenImage21WorkflowOptions, t
  );
}

export function validateQwenImage21GgufRuntimeSchema(
  workflow: ComfyApiWorkflow,
  objectInfo: Record<string, unknown>,
  t: Translate = createTranslator().t
): string[] {
  return validateQwenImage21RuntimeSchemaForOptions(
    workflow,
    objectInfo,
    ggufQwenImage21WorkflowOptions, t
  );
}

function buildQwenImage21WorkflowForOptions(
  task: Pick<ImageGenerationQueueTask, "prompt" | "pictures" | "imageLoras" | "modelId" | "qualityProfile" | "outputWidth" | "outputHeight" | "aspectRatio" | "targetResolution" | "imageOutputSubfolder" | "outputFilename" | "diffusionModelFilename">,
  run: Pick<ImageGenerationRun, "index" | "seed">,
  options: QwenImage21WorkflowOptions,
  t: Translate = createTranslator().t
): ComfyApiWorkflow {
  const compiled = compileQwenImage21Prompt(
    imagePromptForLoras(task.prompt, task.imageLoras),
    task.pictures, t
  );
  if (compiled.errors.length) throw new Error(compiled.errors.join(" "));
  const hasPictures = compiled.pictures.length > 0;
  if (!hasPictures && !options.capability.supportsTextOnly) {
    throw new Error(t(uiKeys.workflowChecks.qwen21TextOnly));
  }
  const imageLoraError = imageLoraConfigurationError(
    task.imageLoras,
    task.modelId,
    compiled.pictures.length,
    t
  );
  if (imageLoraError) throw new Error(imageLoraError);
  const selectedImageLora = task.imageLoras?.[0];
  const usesFix = imageLoraUsesQwenImage21Fix(selectedImageLora);
  const baseModelOutput: [string, number] = selectedImageLora ? ["imageLora", 0] : ["model", 0];
  const modelOutput: [string, number] = usesFix ? ["fresca", 0] : baseModelOutput;

  const quality = options.capability.qualityProfiles.find(
    (profile) => profile.id === task.qualityProfile
  ) ?? options.capability.qualityProfiles[0]!;
  const sampling = usesFix
    ? { steps: 20, cfg: 3, sampler_name: "seeds_2", scheduler: "sgm_uniform" }
    : { steps: quality.steps, cfg: quality.cfg, sampler_name: "euler", scheduler: "simple" };
  const pictureNodes = Object.fromEntries(
    compiled.pictures.map((picture, index) => [
      `image-${picture.id}`,
      {
        class_type: "LoadImage",
        inputs: { image: `{{IMAGE_${index}}}` }
      }
    ])
  );
  const referenceInputs = Object.fromEntries(
    compiled.pictures.map((picture, index) => [
      `images.image_${index + 1}`,
      [`image-${picture.id}`, 0]
    ])
  );
  const sourceWidth = compiled.pictures[0]?.width ?? 0;
  const sourceHeight = compiled.pictures[0]?.height ?? 0;
  const textOnlyWidth = options.capability.textOnlyOutputWidth ?? 1024;
  const textOnlyHeight = options.capability.textOnlyOutputHeight ?? 1024;
  const outputWidth = exactImageDimension(task.outputWidth, hasPictures ? sourceWidth : textOnlyWidth, t);
  const outputHeight = exactImageDimension(task.outputHeight, hasPictures ? sourceHeight : textOnlyHeight, t);
  const customSize = hasPictures && (
    (task.aspectRatio ?? "source") !== "source" ||
    (task.targetResolution ?? "source") !== "source"
  );
  const outputPrefix = [
    task.imageOutputSubfolder?.replace(/[\\/]+/gu, "/").replace(/^\/+|\/+$/gu, ""),
    `QwenImage21_${task.outputFilename}_${run.index + 1}`
  ].filter(Boolean).join("/");

  const positiveInputs: Record<string, unknown> = {
    clip: ["clip", 0],
    prompt: compiled.prompt,
    negative_prompt: usesFix ? qwenImage21FixNegativePrompt : "",
    // The official T2I template uses the fixed 1024 conditioning canvas. The
    // default edit path uses 0 so TextEncodeQwenImage21 follows image_1;
    // selecting a custom canvas resizes the reference grid to a close budget.
    resolution: hasPictures
      ? customSize ? qwenImage21ReferenceResolution(outputWidth, outputHeight) : 0
      : textOnlyWidth
  };
  if (hasPictures) {
    Object.assign(positiveInputs, {
      vae: ["vae", 0],
      ...referenceInputs
    });
  }

  const samplerModel: [string, number] = hasPictures ? ["cache", 0] : modelOutput;
  const samplerNode = options.samplingMode === "turbo"
    ? {
        class_type: "SamplerCustomAdvanced",
        inputs: {
          noise: ["noise", 0],
          guider: ["guider", 0],
          sampler: ["samplerSelect", 0],
          sigmas: ["sigmas", 0],
          latent_image: hasPictures ? ["sizeSwitch", 0] : ["empty", 0]
        }
      }
    : {
        class_type: "KSampler",
        inputs: {
          model: samplerModel,
          positive: ["positive", 0],
          negative: ["positive", 1],
          latent_image: hasPictures ? ["sizeSwitch", 0] : ["empty", 0],
          seed: run.seed,
          steps: sampling.steps,
          cfg: sampling.cfg,
          sampler_name: sampling.sampler_name,
          scheduler: sampling.scheduler,
          denoise: 1
        }
      };

  const workflow: ComfyApiWorkflow = {
    ...pictureNodes,
    model: {
      class_type: options.modelLoaderClassType,
      inputs: options.modelLoaderClassType === "UnetLoaderGGUF"
        ? { unet_name: task.diffusionModelFilename || options.diffusionModel }
        : {
            unet_name: task.diffusionModelFilename || options.diffusionModel,
            weight_dtype: "default"
        }
    },
    ...(selectedImageLora ? {
      imageLora: {
        class_type: "LoraLoaderModelOnly",
        inputs: {
          model: ["model", 0],
          lora_name: selectedImageLora.filename,
          strength_model: selectedImageLora.strength
        }
      }
    } : {}),
    ...(usesFix ? {
      apg: {
        class_type: "APG",
        inputs: {
          model: ["imageLora", 0],
          eta: 1,
          norm_threshold: 10,
          momentum: 0.3
        }
      },
      fresca: {
        class_type: "FreSca",
        inputs: {
          model: ["apg", 0],
          scale_low: 1,
          scale_high: 2,
          freq_cutoff: 8
        }
      }
    } : {}),
    clip: {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: qwenImage21TextEncoder,
        type: "qwen_image",
        device: "default"
      }
    },
    vae: {
      class_type: "VAELoader",
      inputs: { vae_name: qwenImage21Vae }
    },
    positive: {
      class_type: "TextEncodeQwenImage21",
      inputs: positiveInputs
    },
    empty: {
      class_type: "EmptyLatentImage",
      inputs: {
        width: qwenImage21LatentDimension(outputWidth, hasPictures ? sourceWidth : textOnlyWidth, hasPictures ? 32 : 8, t),
        height: qwenImage21LatentDimension(outputHeight, hasPictures ? sourceHeight : textOnlyHeight, hasPictures ? 32 : 8, t),
        batch_size: 1
      }
    },
    ...(hasPictures ? {
      sizeSwitch: {
        class_type: "ComfySwitchNode",
        inputs: {
          on_false: ["positive", 2],
          on_true: ["empty", 0],
          switch: customSize
        }
      },
      cache: {
        class_type: "QwenImage21Cache",
        inputs: {
          model: modelOutput,
          device: "auto",
          dtype: "default"
        }
      }
    } : {}),
    ...(options.samplingMode === "turbo" ? {
      noise: {
        class_type: "RandomNoise",
        inputs: { noise_seed: run.seed }
      },
      guider: {
        class_type: "CFGGuider",
        inputs: {
          model: samplerModel,
          positive: ["positive", 0],
          negative: ["positive", 1],
          cfg: sampling.cfg
        }
      },
      samplerSelect: {
        class_type: "KSamplerSelect",
        inputs: { sampler_name: sampling.sampler_name }
      },
      sigmas: {
        class_type: "ManualSigmas",
        inputs: { sigmas: qwenImage21TurboSigmaSchedule }
      }
    } : {}),
    sampler: samplerNode,
    decoded: {
      class_type: "VAEDecode",
      inputs: {
        samples: ["sampler", 0],
        vae: ["vae", 0]
      }
    },
    save: {
      class_type: "SaveImageAdvanced",
      inputs: {
        images: ["decoded", 0],
        filename_prefix: outputPrefix,
        format: "png",
        "format.bit_depth": "8-bit",
        "format.input_color_space": "sRGB"
      }
    }
  };

  const validationErrors = validateQwenImage21WorkflowForOptions(
    workflow,
    quality.id,
    true,
    options,
    usesFix ? qwenImage21FixRequiredNodeTypes : [], t
  );
  if (validationErrors.length) throw new Error(validationErrors.join(" "));
  return workflow;
}

export function buildQwenImage21Workflow(
  task: ImageGenerationQueueTask,
  run: ImageGenerationRun,
  t: Translate = createTranslator().t
): ComfyApiWorkflow {
  return buildQwenImage21WorkflowForOptions(task, run, officialQwenImage21WorkflowOptions, t);
}

/** Reuse the edit recipe for one source frame; caller wires IMAGE and owns its output. */
export function buildQwenImage21AnchorWorkflow(
  snapshot: { modelId: string; model: string; textEncoder: string; vae: string },
  width: number, height: number, seed: number,
  t: Translate = createTranslator().t
): ComfyApiWorkflow {
  const options = snapshot.modelId === "qwen-image-2-1-turbo" ? turboQwenImage21WorkflowOptions
    : snapshot.modelId === "qwen-image-2-1" ? officialQwenImage21WorkflowOptions
    : snapshot.modelId === "qwen-image-2-1-uncensored-gguf" ? ggufQwenImage21WorkflowOptions
    : snapshot.modelId === "qwen-image-2-1-uncensored-gguf-q6" ? ggufQ6QwenImage21WorkflowOptions : undefined;
  if (!options) throw new Error(t(uiKeys.workflowChecks.anchorModel));
  const graph = buildQwenImage21WorkflowForOptions({
    prompt: "Enhance the fine natural detail of <image1>. Preserve the exact face, identity, pose, composition, colors, lighting and all existing objects and text. Do not add or remove anything.",
    pictures: [{ id: "first", pictureNumber: 1, absolutePath: "{{TESSERA_FIRST_FRAME}}", width, height }], imageLoras: [],
    modelId: snapshot.modelId, diffusionModelFilename: snapshot.model,
    qualityProfile: options.samplingMode === "turbo" ? "turbo-8" : "preview-25",
    outputWidth: width, outputHeight: height, aspectRatio: "source", targetResolution: Math.min(width, height), outputFilename: "tessera-anchor"
  }, { index: 0, seed }, options, t);
  graph.clip!.inputs.clip_name = snapshot.textEncoder;
  graph.vae!.inputs.vae_name = snapshot.vae;
  delete graph.save;
  return graph;
}

export function buildQwenImage21TurboWorkflow(
  task: ImageGenerationQueueTask,
  run: ImageGenerationRun,
  t: Translate = createTranslator().t
): ComfyApiWorkflow {
  return buildQwenImage21WorkflowForOptions(task, run, turboQwenImage21WorkflowOptions, t);
}

export function buildQwenImage21GgufWorkflow(
  task: ImageGenerationQueueTask,
  run: ImageGenerationRun,
  t: Translate = createTranslator().t
): ComfyApiWorkflow {
  return buildQwenImage21WorkflowForOptions(task, run, ggufQwenImage21WorkflowOptions, t);
}

export function buildQwenImage21GgufQ6Workflow(
  task: ImageGenerationQueueTask,
  run: ImageGenerationRun,
  t: Translate = createTranslator().t
): ComfyApiWorkflow {
  return buildQwenImage21WorkflowForOptions(task, run, ggufQ6QwenImage21WorkflowOptions, t);
}
