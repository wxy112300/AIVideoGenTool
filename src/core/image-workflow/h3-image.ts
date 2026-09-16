import type {
  H3ImageOptions,
  H3ImageRecipeSnapshot,
  ImageGenerationQueueTask,
  ImageGenerationRun,
  ImageReferenceSnapshot
} from "../../types.js";
import type {
  ComfyApiWorkflow,
  CompiledImagePrompt
} from "./contracts.js";
import {
  h3Fl2vaImageDiffusionModel,
  h3Fl2vaTurbo8Lora,
  h3ImageTextEncoder,
  h3ImageVideoVae,
  h3Ref2vaImageDiffusionModel,
  h3Ref2vaTurbo8Lora,
  minimaxH3ImageI2ICapability,
  minimaxH3ReferenceEditCapability
} from "./capabilities.js";
import {
  minimaxH3ImageFl2vaNodeTypes,
  minimaxH3ImageI2IRequiredNodeTypes,
  minimaxH3ImageRef2vaNodeTypes,
  minimaxH3ImageStudioSharedNodeTypes,
  minimaxH3ImageTurboNodeTypes,
  minimaxH3ReferenceEditRequiredNodeTypes
} from "./node-requirements.js";
import {
  imageReferenceInputPath,
  orderedPictures,
  pictureReferencePattern
} from "./shared.js";

const H3_IMAGE_QUALITY_PROFILE = "recommended | 5 frames";
export const H3_IMAGE_RESOLUTION_PROFILE = "native-detail-0.98mp" as const;
export const H3_IMAGE_RESOLUTION_PROFILE_LABEL = "native detail | 0.98 MP" as const;
const H3_IMAGE_RESOLUTION_AREA = 0.98 * 1024 * 1024;
const H3_IMAGE_DIMENSION_ALIGNMENT = 32;
const H3_IMAGE_SOURCE_FIT_VALUES = ["crop_center", "contain_pad", "stretch"] as const;
const H3_IMAGE_REFERENCE_DETAIL_VALUES = ["match_generation_area", "max_identity_2048"] as const;
const H3_IMAGE_SAMPLING_PROFILE_VALUES = [
  "base quality | RES 20 steps",
  "Turbo v1.0 | 8 steps",
  "REF2VA Turbo v1.0 768p | 8 steps"
] as const;

export const h3ImageCapabilities = {
  "minimax-h3-image-i2i": minimaxH3ImageI2ICapability,
  "minimax-h3-reference-edit": minimaxH3ReferenceEditCapability
} as const;

type H3ImageModelId = keyof typeof h3ImageCapabilities;

function isH3ImageModelId(modelId: string): modelId is H3ImageModelId {
  return modelId in h3ImageCapabilities;
}

function h3ImageOptionsFor(
  modelId: H3ImageModelId,
  options: H3ImageOptions | undefined
): H3ImageOptions {
  return {
    frameProfile: options?.frameProfile === "recommended-5" ? options.frameProfile : "recommended-5",
    frameSelection: options?.frameSelection === "decode-recommended" ? options.frameSelection : "decode-recommended",
    sourceFit: options?.sourceFit === "contain-pad" || options?.sourceFit === "stretch"
      ? options.sourceFit
      : "crop-center",
    referenceDetail: options?.referenceDetail === "max-identity-2048"
      ? options.referenceDetail
      : "match-generation-area",
    sourceFidelity: modelId === "minimax-h3-reference-edit" ?
      Math.min(1, Math.max(0, options?.sourceFidelity ?? 0.6)) :
      Math.min(1, Math.max(0, options?.sourceFidelity ?? 0.75))
  };
}

function defaultDiffusionModelFor(modelId: H3ImageModelId): string {
  return modelId === "minimax-h3-image-i2i"
    ? h3Fl2vaImageDiffusionModel
    : h3Ref2vaImageDiffusionModel;
}

function h3ImageRecipeContractFor(
  modelId: string,
  qualityProfile: string
): {
  adapter: H3ImageRecipeSnapshot["adapter"];
  samplingProfile: string;
  sampler: H3ImageRecipeSnapshot["sampler"];
  steps: number;
  loraRequired: boolean;
} | undefined {
  if (!isH3ImageModelId(modelId)) return undefined;
  if (qualityProfile === "base-quality-20") {
    return {
      adapter: "base",
      samplingProfile: "base quality | RES 20 steps",
      sampler: "res_multistep",
      steps: 20,
      loraRequired: false
    };
  }
  if (modelId === "minimax-h3-image-i2i" && qualityProfile === "fl2va-turbo-8") {
    return {
      adapter: "fl2va-turbo-8",
      samplingProfile: "Turbo v1.0 | 8 steps",
      sampler: "euler",
      steps: 8,
      loraRequired: true
    };
  }
  if (modelId === "minimax-h3-reference-edit" && qualityProfile === "ref2va-turbo-8-768p") {
    return {
      adapter: "ref2va-turbo-8-768p",
      samplingProfile: "REF2VA Turbo v1.0 768p | 8 steps",
      sampler: "euler",
      steps: 8,
      loraRequired: true
    };
  }
  return undefined;
}

function h3ImageRecipeIdentityFor(
  modelId: string,
  qualityProfile: string
): H3ImageRecipeSnapshot | undefined {
  const contract = h3ImageRecipeContractFor(modelId, qualityProfile);
  if (!contract || !isH3ImageModelId(modelId)) return undefined;
  const isReference = modelId === "minimax-h3-reference-edit";
  const loraFilename = contract.loraRequired
    ? isReference ? h3Ref2vaTurbo8Lora : h3Fl2vaTurbo8Lora
    : undefined;
  return {
    adapter: contract.adapter,
    samplingProfile: contract.samplingProfile,
    sampler: contract.sampler,
    scheduler: "simple",
    steps: contract.steps,
    shiftVideo: 12,
    shiftAudio: 3,
    frameProfile: "recommended-5",
    frameSelection: "decode-recommended",
    resolutionProfile: H3_IMAGE_RESOLUTION_PROFILE,
    diffusionModelFilename: defaultDiffusionModelFor(modelId),
    ...(loraFilename ? { loraFilename } : {})
  };
}

export function h3ImageRecipeFor(
  modelId: string,
  qualityProfile: string,
  diffusionModelFilename?: string
): H3ImageRecipeSnapshot | undefined {
  const identity = h3ImageRecipeIdentityFor(modelId, qualityProfile);
  if (!identity) return undefined;
  return {
    ...identity,
    diffusionModelFilename: diffusionModelFilename?.trim() || identity.diffusionModelFilename
  };
}

export function validateH3ImageRecipeSnapshot(
  modelId: string,
  qualityProfile: string,
  recipe: H3ImageRecipeSnapshot | undefined,
  taskDiffusionModelFilename?: string
): string[] {
  const contract = h3ImageRecipeContractFor(modelId, qualityProfile);
  if (!contract) return [`H3 图片质量档 ${qualityProfile} 与路线 ${modelId} 不匹配。`];
  if (!recipe) return ["H3 图片队列任务缺少冻结 recipe；只有旧任务才允许走 legacy fallback。"];
  const errors: string[] = [];
  if (recipe.adapter !== contract.adapter) {
    errors.push(`H3 冻结 recipe 的 adapter 与 ${modelId}/${qualityProfile} 不匹配。`);
  }
  if (recipe.samplingProfile !== contract.samplingProfile) {
    errors.push(`H3 冻结 recipe 的 samplingProfile 与 ${modelId}/${qualityProfile} 不匹配。`);
  }
  if (recipe.sampler !== contract.sampler || recipe.scheduler !== "simple") {
    errors.push(`H3 冻结 recipe 的 sampler/scheduler 与 ${modelId}/${qualityProfile} 不匹配。`);
  }
  if (recipe.steps !== contract.steps || recipe.shiftVideo !== 12 || recipe.shiftAudio !== 3) {
    errors.push(`H3 冻结 recipe 的 steps/shift 与 ${modelId}/${qualityProfile} 不匹配。`);
  }
  if (recipe.frameProfile !== "recommended-5" || recipe.frameSelection !== "decode-recommended") {
    errors.push("H3 冻结 recipe 的 frame profile/selector 不是首版固定值。 ");
  }
  if (recipe.resolutionProfile !== H3_IMAGE_RESOLUTION_PROFILE) {
    errors.push("H3 冻结 recipe 缺少 native detail | 0.98 MP resolution profile。 ");
  }
  const loraFilename = recipe.loraFilename?.trim();
  if (contract.loraRequired ? !loraFilename : recipe.loraFilename !== undefined) {
    errors.push(`H3 冻结 recipe 的 LoRA 与 ${modelId}/${qualityProfile} 不匹配。`);
  }
  const frozenDiffusion = recipe.diffusionModelFilename?.trim();
  if (!frozenDiffusion) {
    errors.push("H3 冻结 recipe 缺少 diffusion checkpoint 文件名。请重新入队。 ");
  }
  if (taskDiffusionModelFilename?.trim() && frozenDiffusion !== taskDiffusionModelFilename.trim()) {
    errors.push("H3 队列任务的 diffusion checkpoint 与冻结 recipe 不一致；任务已拒绝执行。 ");
  }
  return [...new Set(errors)];
}

export function h3ImageOutputDimensions(
  sourceWidth: number,
  sourceHeight: number
): [number, number] {
  if (!(Number.isFinite(sourceWidth) && Number.isFinite(sourceHeight) && sourceWidth > 0 && sourceHeight > 0)) {
    return [0, 0];
  }
  const ratio = sourceWidth / sourceHeight;
  const align = (value: number): number =>
    Math.max(H3_IMAGE_DIMENSION_ALIGNMENT, Math.round(value / H3_IMAGE_DIMENSION_ALIGNMENT) * H3_IMAGE_DIMENSION_ALIGNMENT);
  return [
    align(Math.sqrt(H3_IMAGE_RESOLUTION_AREA * ratio)),
    align(Math.sqrt(H3_IMAGE_RESOLUTION_AREA / ratio))
  ];
}

function roleLabel(picture: ImageReferenceSnapshot): string {
  switch (picture.role) {
    case "person": return "person or identity";
    case "object": return "object or clothing";
    case "pose": return "pose or composition";
    case "style": return "style or lighting";
    case "background": return "background or environment";
    case "base": return "base image";
    default: return "assigned reference";
  }
}

function h3ReferenceMapping(
  pictures: readonly ImageReferenceSnapshot[],
  runtimePictureNumberMap: ReadonlyArray<{ visiblePictureNumber: number; runtimePictureNumber: number }>
): string {
  return pictures.map((picture, index) => {
    const note = picture.note?.trim();
    const runtimePictureNumber = runtimePictureNumberMap[index]?.runtimePictureNumber ?? index + 1;
    return `<Picture ${runtimePictureNumber}> (UI Picture ${picture.pictureNumber}) = ${roleLabel(picture)}${note ? `; responsibility: ${note}` : ""}.`;
  }).join("\n");
}

function hasImageGuidanceData(picture: ImageReferenceSnapshot): boolean {
  return Boolean(
    picture.mask?.regionCount ||
    picture.markup?.objectCount ||
    picture.mask?.maskPath.trim() ||
    picture.markup?.renderedPath.trim()
  );
}

function compileH3Prompt(
  modelId: H3ImageModelId,
  prompt: string,
  pictures: ImageReferenceSnapshot[]
): CompiledImagePrompt {
  const ordered = orderedPictures(pictures);
  const errors: string[] = [];
  const seenNumbers = new Set<number>();
  for (const picture of ordered) {
    if (!Number.isInteger(picture.pictureNumber) || picture.pictureNumber < 1 || picture.pictureNumber > 9) {
      errors.push(`Picture ${picture.pictureNumber} 的编号无效；H3 只接受 1–9。`);
    }
    if (seenNumbers.has(picture.pictureNumber)) {
      errors.push(`Picture ${picture.pictureNumber} 编号重复；请保持每张参考图编号唯一。`);
    }
    seenNumbers.add(picture.pictureNumber);
    if (!imageReferenceInputPath(picture).trim()) {
      errors.push(`Picture ${picture.pictureNumber} 尚未添加图片。`);
    }
    if (hasImageGuidanceData(picture)) {
      errors.push(`H3 图片首版不支持 Picture ${picture.pictureNumber} 的 Mask 或标注；请改用未标注的原图。`);
    }
  }

  if (modelId === "minimax-h3-image-i2i") {
    if (ordered.length !== 1) errors.push("H3 FL2VA 源图 I2I 必须恰好包含一张 Picture 1。");
    if (ordered[0]?.pictureNumber !== 1) errors.push("H3 FL2VA 源图必须是 Picture 1。");
  } else {
    if (ordered.length < 1 || ordered.length > 9) errors.push("H3 REF2VA 参考编辑支持 1–9 张 Picture。");
    if (ordered[0]?.pictureNumber !== 1) errors.push("H3 REF2VA 必须使用 Picture 1 作为基准图。");
    for (const picture of ordered.slice(1)) {
      if ((!picture.role || picture.role === "auto") && !picture.note?.trim()) {
        errors.push(`Picture ${picture.pictureNumber} 缺少参考职责；请选择角色或填写窄职责说明。`);
      }
    }
  }

  const allowedNumbers = new Set(ordered.map((picture) => picture.pictureNumber));
  const runtimePictureNumberMap = ordered.map((picture, index) => ({
    visiblePictureNumber: picture.pictureNumber,
    runtimePictureNumber: index + 1
  }));
  const runtimePictureNumberFor = new Map(
    runtimePictureNumberMap.map((mapping) => [mapping.visiblePictureNumber, mapping.runtimePictureNumber])
  );
  const referencedPictureNumbers = new Set<number>();
  const runtimeReferencedPictureNumbers = new Set<number>();
  const compiledPrompt = prompt.replace(pictureReferencePattern, (match, numberText: string) => {
    const number = Number(numberText);
    referencedPictureNumbers.add(number);
    if (!allowedNumbers.has(number)) {
      errors.push(`${match} 引用了不存在的 Picture ${number}。`);
      return match;
    }
    if (modelId === "minimax-h3-image-i2i" && number !== 1) {
      errors.push(`${match} 不属于 FL2VA 的单图输入；请只引用 Picture 1。`);
      return match;
    }
    const runtimePictureNumber = runtimePictureNumberFor.get(number);
    if (!runtimePictureNumber) return match;
    runtimeReferencedPictureNumbers.add(runtimePictureNumber);
    return `<Picture ${runtimePictureNumber}>`;
  }).trim();

  const mapping = h3ReferenceMapping(ordered, runtimePictureNumberMap);
  const contract = modelId === "minimax-h3-image-i2i"
    ? "<Picture 1> is the source image. Apply the requested still-image edit while preserving unmentioned source structure."
    : `Use the ordered reference mapping below. Explicit assignments take priority over preservation wording.\n${mapping}`;
  return {
    prompt: [contract, compiledPrompt].filter(Boolean).join("\n\n"),
    pictures: ordered,
    referencedPictureNumbers: [...referencedPictureNumbers].sort((left, right) => left - right),
    runtimePictureNumberMap,
    runtimeReferencedPictureNumbers: [...runtimeReferencedPictureNumbers].sort((left, right) => left - right),
    errors: [...new Set(errors)]
  };
}

export function compileMinimaxH3ImageI2IPrompt(
  prompt: string,
  pictures: ImageReferenceSnapshot[]
): CompiledImagePrompt {
  return compileH3Prompt("minimax-h3-image-i2i", prompt, pictures);
}

export function compileMinimaxH3ReferenceEditPrompt(
  prompt: string,
  pictures: ImageReferenceSnapshot[]
): CompiledImagePrompt {
  return compileH3Prompt("minimax-h3-reference-edit", prompt, pictures);
}

function sourceFitValue(value: H3ImageOptions["sourceFit"]): typeof H3_IMAGE_SOURCE_FIT_VALUES[number] {
  return value === "contain-pad" ? "contain_pad" : value === "crop-center" ? "crop_center" : "stretch";
}

function referenceDetailValue(value: H3ImageOptions["referenceDetail"]): typeof H3_IMAGE_REFERENCE_DETAIL_VALUES[number] {
  return value === "max-identity-2048" ? "max_identity_2048" : "match_generation_area";
}

function outputPrefix(task: ImageGenerationQueueTask, run: ImageGenerationRun): string {
  return [
    task.imageOutputSubfolder?.replace(/[\\/]+/gu, "/").replace(/^\/+|\/+$/gu, ""),
    `H3Image_${task.outputFilename}_${run.index + 1}`
  ].filter(Boolean).join("/");
}

/**
 * Release the diffusion stack before the H3 video VAE starts decoding the
 * five-frame still packet. KJNodes is optional for the upstream image graph,
 * so only add this pass when the selected ComfyUI actually exposes it.
 */
export function applyH3ImageVramCleanup(
  workflow: ComfyApiWorkflow,
  objectInfo: Record<string, unknown>
): boolean {
  if (!Object.prototype.hasOwnProperty.call(objectInfo, "VRAM_Debug")) return false;
  const decodeEntry = Object.entries(workflow).find(([, node]) => node.class_type === "H3ImageDecode");
  if (!decodeEntry) return false;
  const decode = decodeEntry[1];
  const samples = decode.inputs.samples;
  if (!Array.isArray(samples) || typeof samples[0] !== "string") return false;
  const upstream = workflow[samples[0]];
  if (upstream?.class_type === "VRAM_Debug" && upstream.inputs.unload_all_models === true) return false;

  const baseId = "vram_cleanup";
  let cleanupId = baseId;
  let suffix = 2;
  while (workflow[cleanupId]) cleanupId = `${baseId}_${suffix++}`;
  workflow[cleanupId] = {
    class_type: "VRAM_Debug",
    inputs: {
      empty_cache: true,
      gc_collect: true,
      unload_all_models: true,
      any_input: samples
    }
  };
  decode.inputs.samples = [cleanupId, 0];
  return true;
}

function buildH3ImageWorkflow(
  modelId: H3ImageModelId,
  task: ImageGenerationQueueTask,
  run: ImageGenerationRun
): ComfyApiWorkflow {
  const compiled = compileH3Prompt(modelId, task.prompt, task.pictures);
  if (compiled.errors.length) throw new Error(compiled.errors.join(" "));
  const options = h3ImageOptionsFor(modelId, task.h3ImageOptions);
  const hasFrozenRecipe = Object.prototype.hasOwnProperty.call(task, "h3ImageRecipe");
  const recipe = hasFrozenRecipe
    ? task.h3ImageRecipe
    : h3ImageRecipeFor(modelId, task.qualityProfile, task.diffusionModelFilename);
  const recipeErrors = validateH3ImageRecipeSnapshot(
    modelId,
    task.qualityProfile,
    hasFrozenRecipe ? task.h3ImageRecipe : undefined,
    task.diffusionModelFilename
  );
  if (hasFrozenRecipe && recipeErrors.length) {
    throw new Error(`H3 图片冻结 recipe 校验失败：${recipeErrors.join(" ")}`);
  }
  if (!recipe) {
    throw new Error(
      `H3 图片质量档 ${task.qualityProfile} 未登记，请重新选择 Base 或该路线的 Turbo 质量档。`
    );
  }
  const modelFilename = recipe.diffusionModelFilename?.trim();
  if (!modelFilename) throw new Error("H3 图片 recipe 缺少冻结 diffusion checkpoint 文件名。 ");
  const workflow: ComfyApiWorkflow = {
    model: {
      class_type: "UNETLoader",
      inputs: { unet_name: modelFilename, weight_dtype: "default" }
    },
    clip: {
      class_type: "CLIPLoader",
      inputs: { clip_name: h3ImageTextEncoder, type: "minimax", device: "default" }
    },
    vae: {
      class_type: "VAELoader",
      inputs: { vae_name: h3ImageVideoVae }
    },
    input: {
      class_type: "LoadImage",
      inputs: { image: "{{IMAGE_0}}" }
    },
    resolution: {
      class_type: "H3ImageResolutionPreset",
      inputs: {
        aspect_ratio: "source image",
        resolution_profile: H3_IMAGE_RESOLUTION_PROFILE_LABEL,
        source_image: ["input", 0]
      }
    }
  };
  const prepareInputs: Record<string, unknown> = {
    clip: ["clip", 0],
    vae: ["vae", 0],
    source_image: ["input", 0],
    edit_instruction: compiled.prompt,
    width: ["resolution", 0],
    height: ["resolution", 1],
    quality_profile: H3_IMAGE_QUALITY_PROFILE,
    source_fidelity: options.sourceFidelity,
    source_fit: sourceFitValue(options.sourceFit),
    optimize_for_still: true
  };
  if (modelId === "minimax-h3-reference-edit") {
    prepareInputs.reference_transport = "native";
    prepareInputs.reference_detail = referenceDetailValue(options.referenceDetail);
    for (let index = 1; index < compiled.pictures.length; index += 1) {
      const picture = compiled.pictures[index]!;
      const runtimePictureNumber = index + 1;
      const nodeId = `reference_${runtimePictureNumber}`;
      workflow[nodeId] = {
        class_type: "LoadImage",
        inputs: { image: `{{IMAGE_${index}}}` }
      };
      prepareInputs[`reference_image_${runtimePictureNumber}`] = [nodeId, 0];
    }
  }
  workflow.prepare = {
    class_type: modelId === "minimax-h3-image-i2i" ? "H3ImageToImagePrepare" : "H3ReferenceEditPrepare",
    inputs: prepareInputs
  };
  const modelForSampling: [string, number] = recipe.adapter === "base"
    ? ["model", 0]
    : ["turbo", 0];
  if (recipe.adapter !== "base") {
    workflow.turbo = {
      class_type: "LoraLoaderModelOnly",
      inputs: {
        model: ["model", 0],
        lora_name: recipe.loraFilename,
        strength_model: 1.0
      }
    };
  }
  workflow.sampling = {
    class_type: "H3ImageSamplingPreset",
    inputs: { model: modelForSampling, sampling_profile: recipe.samplingProfile }
  };
  workflow.noise = {
    class_type: "RandomNoise",
    inputs: { noise_seed: run.seed }
  };
  workflow.guider = {
    class_type: "BasicGuider",
    inputs: { model: ["sampling", 0], conditioning: ["prepare", 0] }
  };
  workflow.sampler = {
    class_type: "SamplerCustomAdvanced",
    inputs: {
      noise: ["noise", 0],
      guider: ["guider", 0],
      sampler: ["sampling", 1],
      sigmas: ["sampling", 2],
      latent_image: ["prepare", 1]
    }
  };
  workflow.decode = {
    class_type: "H3ImageDecode",
    inputs: { samples: ["sampler", 0], vae: ["vae", 0] }
  };
  workflow.selector = {
    class_type: "H3ImageFrameSelector",
    inputs: {
      frames: ["decode", 0],
      strategy: "decode_recommended",
      manual_index: 0,
      skip_first_frames: 0,
      candidate_start: 0.0,
      candidate_end: 1.0,
      similarity_weight: 0.35,
      top_k: 4,
      source_image: ["prepare", 2],
      recommended_index: ["decode", 3]
    }
  };
  workflow.save = {
    class_type: "SaveImage",
    inputs: { images: ["selector", 0], filename_prefix: outputPrefix(task, run) }
  };
  return workflow;
}

function unresolvedImagePlaceholders(workflow: ComfyApiWorkflow): string[] {
  return Object.values(workflow).flatMap((node) =>
    Object.values(node.inputs).filter((value) =>
      typeof value === "string" && /^\{\{IMAGE_\d+\}\}$/u.test(value)
    )
  ).map(String);
}

function validateH3ImageWorkflow(
  modelId: H3ImageModelId,
  workflow: ComfyApiWorkflow,
  qualityProfile = "base-quality-20",
  allowImagePlaceholders = false,
  frozenRecipe?: H3ImageRecipeSnapshot
): string[] {
  const capability = h3ImageCapabilities[modelId];
  const nodeTypes = new Set(Object.values(workflow).map((node) => node.class_type));
  const required = modelId === "minimax-h3-image-i2i"
    ? minimaxH3ImageI2IRequiredNodeTypes
    : minimaxH3ReferenceEditRequiredNodeTypes;
  const errors = required
    .filter((nodeType) => !nodeTypes.has(nodeType))
    .map((nodeType) => `H3 图片工作流缺少节点 ${nodeType}。`);
  const loadImages = Object.values(workflow).filter((node) => node.class_type === "LoadImage");
  if (loadImages.length < 1 || loadImages.length > capability.maxPictures) {
    errors.push(`H3 图片工作流必须包含 1–${capability.maxPictures} 个 LoadImage 节点。`);
  }
  if (modelId === "minimax-h3-image-i2i" && loadImages.length !== 1) {
    errors.push("H3 FL2VA 工作流必须恰好包含一个 LoadImage 节点。");
  }
  const prepare = Object.values(workflow).find((node) =>
    node.class_type === (modelId === "minimax-h3-image-i2i" ? "H3ImageToImagePrepare" : "H3ReferenceEditPrepare")
  );
  if (!prepare) errors.push("H3 图片工作流缺少路线专属 Prepare 节点。");
  if (prepare?.inputs.quality_profile !== H3_IMAGE_QUALITY_PROFILE) {
    errors.push("H3 图片首版必须固定为 recommended | 5 frames。 ");
  }
  if (prepare && !H3_IMAGE_SOURCE_FIT_VALUES.includes(String(prepare.inputs.source_fit) as typeof H3_IMAGE_SOURCE_FIT_VALUES[number])) {
    errors.push("H3 图片 source_fit 不在 v23 支持枚举内。");
  }
  if (prepare && (typeof prepare.inputs.source_fidelity !== "number" ||
      prepare.inputs.source_fidelity < 0 || prepare.inputs.source_fidelity > 1)) {
    errors.push("H3 图片 source_fidelity 必须在 0–1 内；它不是 denoise。");
  }
  if (modelId === "minimax-h3-reference-edit" && prepare &&
      !H3_IMAGE_REFERENCE_DETAIL_VALUES.includes(String(prepare.inputs.reference_detail) as typeof H3_IMAGE_REFERENCE_DETAIL_VALUES[number])) {
    errors.push("H3 REF2VA reference_detail 不在 v23 支持枚举内。");
  }
  if (modelId === "minimax-h3-reference-edit" && prepare && prepare.inputs.reference_transport !== "native") {
    errors.push("H3 REF2VA 首版必须使用 native reference transport。");
  }
  const workflowDiffusionModelFilename = typeof workflow.model?.inputs.unet_name === "string"
    ? workflow.model.inputs.unet_name
    : undefined;
  const recipe = frozenRecipe ?? h3ImageRecipeFor(modelId, qualityProfile, workflowDiffusionModelFilename);
  if (frozenRecipe) {
    errors.push(...validateH3ImageRecipeSnapshot(modelId, qualityProfile, frozenRecipe));
  }
  const sampling = Object.values(workflow).find((node) => node.class_type === "H3ImageSamplingPreset");
  if (!recipe) {
    errors.push(`H3 图片质量档 ${qualityProfile} 未登记。`);
  } else if (sampling?.inputs.sampling_profile !== recipe.samplingProfile) {
    errors.push(`H3 图片质量档 ${qualityProfile} 与 sampling profile 不匹配。`);
  }
  if (recipe?.diffusionModelFilename && workflow.model?.inputs.unet_name !== recipe.diffusionModelFilename) {
    errors.push("H3 图片 workflow 使用的 diffusion checkpoint 与冻结 recipe 不一致。");
  }
  if (workflow.resolution?.inputs.resolution_profile !== H3_IMAGE_RESOLUTION_PROFILE_LABEL) {
    errors.push("H3 图片必须使用冻结的 native detail | 0.98 MP resolution profile。");
  }
  const turbo = recipe?.adapter !== "base";
  const loraNodes = Object.values(workflow).filter((node) => node.class_type === "LoraLoaderModelOnly");
  if (turbo !== (loraNodes.length === 1)) {
    errors.push("H3 图片 Turbo 质量档必须且只能包含一个 LoRA adapter 节点。");
  }
  if (turbo && recipe && loraNodes[0]?.inputs.lora_name !== recipe.loraFilename) {
    errors.push("H3 图片 Turbo LoRA 与路线/质量档不匹配。");
  }
  const selector = Object.values(workflow).filter((node) => node.class_type === "H3ImageFrameSelector");
  const saves = Object.values(workflow).filter((node) => node.class_type === "SaveImage");
  if (selector.length !== 1) errors.push("H3 图片工作流必须包含一个 H3ImageFrameSelector。");
  if (saves.length !== 1) errors.push("H3 图片工作流必须包含一个 SaveImage 输出。");
  if (selector[0]?.inputs.strategy !== "decode_recommended") {
    errors.push("H3 图片首版必须使用 decode_recommended 选择策略。");
  }
  if (saves[0]?.inputs.images?.toString() !== ["selector", 0].toString()) {
    errors.push("H3 图片 SaveImage 必须只接收 selector 的单张输出。");
  }
  if (!allowImagePlaceholders && unresolvedImagePlaceholders(workflow).length) {
    errors.push("H3 图片工作流仍包含未上传的 IMAGE 占位符。");
  }
  if (Object.values(workflow).some((node) => /audio|video/i.test(node.class_type))) {
    errors.push("H3 图片工作流不能混入音频或视频输出节点。");
  }
  const editInstruction = typeof prepare?.inputs.edit_instruction === "string"
    ? prepare.inputs.edit_instruction
    : "";
  const runtimePictureNumbers = [...editInstruction.matchAll(/<Picture\s+([1-9]\d*)\s*>/gu)]
    .map((match) => Number(match[1]));
  const expectedRuntimePictureNumbers = Array.from(
    { length: loadImages.length },
    (_, index) => index + 1
  );
  for (const runtimePictureNumber of expectedRuntimePictureNumbers) {
    if (!runtimePictureNumbers.includes(runtimePictureNumber)) {
      errors.push(`H3 图片 prompt 缺少 runtime Picture ${runtimePictureNumber} 的映射说明。`);
    }
  }
  for (const runtimePictureNumber of runtimePictureNumbers) {
    if (!expectedRuntimePictureNumbers.includes(runtimePictureNumber)) {
      errors.push(`H3 图片 prompt 引用了未连接的 runtime Picture ${runtimePictureNumber}。`);
    }
  }
  if (modelId === "minimax-h3-reference-edit" && prepare) {
    const referenceSockets = Object.entries(prepare.inputs)
      .map(([name, value]) => {
        const match = name.match(/^reference_image_(\d+)$/u);
        return match ? { number: Number(match[1]), value } : undefined;
      })
      .filter((item): item is { number: number; value: unknown } => Boolean(item))
      .sort((left, right) => left.number - right.number);
    const expectedReferenceSockets = expectedRuntimePictureNumbers.slice(1).map(
      (runtimePictureNumber) => `reference_image_${runtimePictureNumber}`
    );
    const actualReferenceSockets = referenceSockets.map((socket) => `reference_image_${socket.number}`);
    if (actualReferenceSockets.join("\0") !== expectedReferenceSockets.join("\0")) {
      errors.push("H3 REF2VA runtime reference sockets 必须从 reference_image_2 起连续，不能有空洞。");
    }
    for (const socket of referenceSockets) {
      const connection = socket.value;
      const nodeId = Array.isArray(connection) && typeof connection[0] === "string"
        ? connection[0]
        : "";
      const node = nodeId ? workflow[nodeId] : undefined;
      if (!node || node.class_type !== "LoadImage") {
        errors.push(`H3 REF2VA reference_image_${socket.number} 没有连接到对应的 LoadImage。`);
      }
    }
  }
  return [...new Set(errors)];
}

function schemaInputGroups(value: unknown): { required: Record<string, unknown>; optional: Record<string, unknown> } | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = (value as { input?: unknown }).input;
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const groups = input as Record<string, unknown>;
  const record = (candidate: unknown): Record<string, unknown> =>
    candidate && typeof candidate === "object" && !Array.isArray(candidate)
      ? candidate as Record<string, unknown>
      : {};
  return { required: record(groups.required), optional: record(groups.optional) };
}

function enumValues(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (Array.isArray(value[0])) {
    const values = value[0].filter((item): item is string => typeof item === "string");
    return values.length ? values : undefined;
  }
  const values = value.filter((item): item is string => typeof item === "string");
  return values.length === value.length ? values : undefined;
}

const h3RequiredSockets: Readonly<Record<string, readonly string[]>> = {
  H3ImageResolutionPreset: ["aspect_ratio", "resolution_profile", "source_image"],
  H3ImageToImagePrepare: ["clip", "vae", "source_image", "edit_instruction", "width", "height", "quality_profile", "source_fidelity", "source_fit", "optimize_for_still"],
  H3ReferenceEditPrepare: ["clip", "vae", "source_image", "edit_instruction", "width", "height", "quality_profile", "source_fidelity", "source_fit", "reference_detail", "optimize_for_still"],
  H3ImageSamplingPreset: ["model", "sampling_profile"],
  H3ImageDecode: ["samples", "vae"],
  H3ImageFrameSelector: ["frames", "strategy", "manual_index", "skip_first_frames", "candidate_start", "candidate_end", "similarity_weight", "top_k", "source_image", "recommended_index"]
};

const h3EnumInputs = new Set([
  "UNETLoader.unet_name",
  "UNETLoader.weight_dtype",
  "CLIPLoader.clip_name",
  "CLIPLoader.type",
  "CLIPLoader.device",
  "VAELoader.vae_name",
  "H3ImageResolutionPreset.aspect_ratio",
  "H3ImageResolutionPreset.resolution_profile",
  "H3ImageToImagePrepare.quality_profile",
  "H3ImageToImagePrepare.source_fit",
  "H3ReferenceEditPrepare.quality_profile",
  "H3ReferenceEditPrepare.source_fit",
  "H3ReferenceEditPrepare.reference_detail",
  "H3ReferenceEditPrepare.reference_transport",
  "H3ImageSamplingPreset.sampling_profile",
  "H3ImageFrameSelector.strategy",
  "LoraLoaderModelOnly.lora_name"
]);

function validateH3RuntimeSchema(
  workflow: ComfyApiWorkflow,
  objectInfo: Record<string, unknown>
): string[] {
  const errors: string[] = [];
  for (const node of Object.values(workflow)) {
    const groups = schemaInputGroups(objectInfo[node.class_type]);
    if (!groups) {
      errors.push(`运行时 /object_info 缺少 ${node.class_type} 的 input schema。`);
      continue;
    }
    const names = new Set([...Object.keys(groups.required), ...Object.keys(groups.optional)]);
    const expectedRequired = h3RequiredSockets[node.class_type] ?? [];
    for (const inputName of expectedRequired) {
      if (!names.has(inputName)) errors.push(`${node.class_type} 缺少 socket ${inputName}。`);
    }
    for (const [inputName, inputValue] of Object.entries(node.inputs)) {
      if (!names.has(inputName)) {
        errors.push(`${node.class_type} 不接受 input ${inputName}。`);
        continue;
      }
      if (Array.isArray(inputValue)) continue;
      const key = `${node.class_type}.${inputName}`;
      if (!h3EnumInputs.has(key)) continue;
      const values = enumValues(groups.required[inputName] ?? groups.optional[inputName]);
      if (!values) {
        errors.push(`${key} 未暴露可验证的运行时 enum。`);
      } else if (!values.includes(String(inputValue))) {
        errors.push(`${key} 不接受 ${String(inputValue)}。`);
      }
    }
  }
  return [...new Set(errors)];
}

export function buildMinimaxH3ImageI2IWorkflow(
  task: ImageGenerationQueueTask,
  run: ImageGenerationRun
): ComfyApiWorkflow {
  return buildH3ImageWorkflow("minimax-h3-image-i2i", task, run);
}

export function buildMinimaxH3ReferenceEditWorkflow(
  task: ImageGenerationQueueTask,
  run: ImageGenerationRun
): ComfyApiWorkflow {
  return buildH3ImageWorkflow("minimax-h3-reference-edit", task, run);
}

export function validateMinimaxH3ImageI2IWorkflow(
  workflow: ComfyApiWorkflow,
  qualityProfile = "base-quality-20",
  allowImagePlaceholders = false,
  frozenRecipe?: H3ImageRecipeSnapshot
): string[] {
  return validateH3ImageWorkflow("minimax-h3-image-i2i", workflow, qualityProfile, allowImagePlaceholders, frozenRecipe);
}

export function validateMinimaxH3ReferenceEditWorkflow(
  workflow: ComfyApiWorkflow,
  qualityProfile = "base-quality-20",
  allowImagePlaceholders = false,
  frozenRecipe?: H3ImageRecipeSnapshot
): string[] {
  return validateH3ImageWorkflow("minimax-h3-reference-edit", workflow, qualityProfile, allowImagePlaceholders, frozenRecipe);
}

export function validateMinimaxH3ImageRuntimeSchema(
  workflow: ComfyApiWorkflow,
  objectInfo: Record<string, unknown>
): string[] {
  return validateH3RuntimeSchema(workflow, objectInfo);
}

export { minimaxH3ImageStudioSharedNodeTypes, minimaxH3ImageFl2vaNodeTypes, minimaxH3ImageRef2vaNodeTypes, minimaxH3ImageTurboNodeTypes };
