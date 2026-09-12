/**
 * Static and /object_info checks for the app-owned H3 clean-AV workflows.
 *
 * This module intentionally knows node class ids and input names, not display
 * names. It is a queue boundary: a graph can pass this check and still need a
 * real ComfyUI smoke run before it is considered product-ready.
 */

export type H3ComfyAvWorkflowKind = "first-pass-av" | "second-sampling-av" | "continuum-extension";

export interface H3ComfyWorkflowValidation {
  valid: boolean;
  kind: H3ComfyAvWorkflowKind | null;
  errors: string[];
}

interface ApiNode {
  class_type?: unknown;
  inputs?: unknown;
}

interface NodeRef {
  nodeId: string;
  outputIndex: number;
}

interface RuntimeInputRequirement {
  name: string;
  type: "ANY" | "IMAGE" | "AUDIO" | "LATENT" | "CONDITIONING" | "MODEL" | "VAE" | "NOISE" | "SAMPLER" | "SIGMAS" | "FLOAT" | "INT" | "STRING" | "BOOLEAN" | "COMBO" | "H3_CONTINUUM_STATE" | "H3_CONTINUUM_PLAN" | "H3_CONTINUUM_ASSEMBLY_PLAN";
}

interface RuntimeNodeRequirement {
  inputs: readonly RuntimeInputRequirement[];
  outputs?: readonly string[];
}

const FIRST_PASS_CLASSES = [
  "MiniMaxH3ImageToVideo",
  "SamplerCustomAdvanced",
  "VAEDecode",
  "VAEDecodeAudio",
  "CreateVideo",
  "SaveVideo",
  "LocalVideoStudioH3SaveJointAV"
] as const;

const SECOND_PASS_CLASSES = [
  "MiniMaxH3ImageToVideo",
  "LocalVideoStudioH3LoadJointAV",
  "LTXVSeparateAVLatent",
  "LTXVConcatAVLatent",
  "MiniMaxH3ShiftSigmas",
  "MiniMaxH3AddNoise",
  "MiniMaxH3ConditioningUpscale",
  "DisableNoise",
  "BasicGuider",
  "SamplerCustomAdvanced",
  "VAEDecode",
  "VAEDecodeAudio",
  "CreateVideo",
  "SaveVideo",
  "LocalVideoStudioH3SaveJointAV"
] as const;

const ULTIMATE_SECOND_PASS_CLASSES = [
  "MiniMaxH3ImageToVideo",
  "LocalVideoStudioH3LoadJointAV",
  "LocalVideoStudioH3RequireGpuVAE",
  "MiniMaxH3ConditioningUpscale",
  "MMH3LatentUpscaleWithModelParams",
  "MMH3TemporalSplitParams",
  "MMH3SpatialSplitParams",
  "MMH3UltimateUpscale",
  "VAEDecode",
  "VAEDecodeAudio",
  "CreateVideo",
  "SaveVideo",
  "LocalVideoStudioH3SaveJointAV"
] as const;

const SECOND_PASS_UPSCALER_CLASSES = [
  "MiniMaxH3LatentUpscale",
  "MinimaxH3LatentUpscaler3D"
] as const;

const CONTINUUM_CLASSES = [
  "UNETLoader",
  "CLIPLoader",
  "VAELoader",
  "MiniMaxH3ImageToVideo",
  "PathchSageAttentionKJ",
  "KSamplerSelect",
  "BasicScheduler",
  "RandomNoise",
  "BasicGuider",
  "SamplerCustomAdvanced",
  "VAEDecode",
  "VAEDecodeAudio",
  "CreateVideo",
  "SaveVideo",
  "LocalVideoStudioH3LoadJointAV",
  "LocalVideoStudioH3ArtifactToContinuumState",
  "H3ContinuumJoin",
  "H3ContinuumFinish",
  "LocalVideoStudioH3SaveJointAV"
] as const;

const CONTINUUM_V38_CLASSES = [
  "UNETLoader",
  "CLIPLoader",
  "VAELoader",
  "PathchSageAttentionKJ",
  "KSamplerSelect",
  "BasicScheduler",
  "ImageFromBatch",
  "H3ContinuumLoadVideo",
  "H3ContinuumSamplerV38",
  "VAEDecode",
  "VAEDecodeAudio",
  "H3ContinuumAssembleSeamV35",
  "CreateVideo",
  "SaveVideo",
  "LocalVideoStudioH3LoadJointAV",
  "LocalVideoStudioH3SaveJointAV"
] as const;

const RUNTIME_NODE_REQUIREMENTS: Readonly<Record<string, RuntimeNodeRequirement>> = {
  MiniMaxH3LatentUpscale: {
    inputs: [
      { name: "samples", type: "LATENT" },
      { name: "scale_by", type: "FLOAT" },
      { name: "upscale_method", type: "COMBO" }
    ],
    outputs: ["LATENT"]
  },
  MinimaxH3LatentUpscaler3D: {
    inputs: [
      { name: "latent", type: "ANY" },
      { name: "model_name", type: "COMBO" },
      { name: "mode", type: "ANY" },
      { name: "align", type: "INT" },
      { name: "enable_temporal_chunking", type: "ANY" },
      { name: "force_unload", type: "ANY" },
      { name: "device", type: "COMBO" },
      { name: "precision", type: "COMBO" }
    ]
  },
  MiniMaxH3ConditioningUpscale: {
    inputs: [
      { name: "conditioning", type: "CONDITIONING" },
      { name: "scale_by", type: "FLOAT" },
      { name: "upscale_method", type: "COMBO" }
    ],
    outputs: ["CONDITIONING"]
  },
  MiniMaxH3AddNoise: {
    inputs: [
      { name: "model", type: "MODEL" },
      { name: "noise", type: "NOISE" },
      { name: "sigmas", type: "SIGMAS" },
      { name: "latent_image", type: "LATENT" }
    ],
    outputs: ["LATENT"]
  },
  MiniMaxH3ShiftSigmas: {
    inputs: [
      { name: "sigmas", type: "SIGMAS" },
      { name: "shift_video", type: "FLOAT" },
      { name: "shift_audio", type: "FLOAT" }
    ],
    outputs: ["SIGMAS"]
  },
  LTXVSeparateAVLatent: {
    inputs: [{ name: "av_latent", type: "LATENT" }],
    outputs: ["LATENT", "LATENT"]
  },
  LTXVConcatAVLatent: {
    inputs: [
      { name: "video_latent", type: "LATENT" },
      { name: "audio_latent", type: "LATENT" }
    ],
    outputs: ["LATENT"]
  },
  LocalVideoStudioH3SaveJointAV: {
    inputs: [
      { name: "joint_av", type: "LATENT" },
      { name: "filename", type: "STRING" }
    ],
    outputs: ["STRING"]
  },
  LocalVideoStudioH3LoadJointAV: {
    inputs: [{ name: "artifact", type: "STRING" }],
    outputs: ["LATENT"]
  },
  LocalVideoStudioH3ArtifactToContinuumState: {
    inputs: [
      { name: "joint_av", type: "LATENT" },
      { name: "source_frame_count", type: "INT" },
      { name: "clip_index", type: "INT" },
      { name: "capacity_frames", type: "COMBO" }
    ],
    outputs: ["H3_CONTINUUM_STATE", "STRING"]
  },
  H3ContinuumJoin: {
    inputs: [
      { name: "model", type: "MODEL" },
      { name: "conditioning", type: "CONDITIONING" },
      { name: "latent", type: "LATENT" },
      { name: "continuity", type: "COMBO" },
      { name: "extend_seconds", type: "FLOAT" },
      { name: "audio_continuity", type: "BOOLEAN" },
      { name: "first_frame_policy", type: "COMBO" },
      { name: "preserve_last_frame", type: "BOOLEAN" },
      { name: "strict_compatibility", type: "BOOLEAN" },
      { name: "debug", type: "BOOLEAN" },
      { name: "previous_state", type: "H3_CONTINUUM_STATE" }
    ],
    outputs: ["MODEL", "CONDITIONING", "LATENT", "H3_CONTINUUM_PLAN", "STRING"]
  },
  H3ContinuumFinish: {
    inputs: [
      { name: "samples", type: "LATENT" },
      { name: "images", type: "ANY" },
      { name: "audio", type: "ANY" },
      { name: "plan", type: "H3_CONTINUUM_PLAN" }
    ],
    outputs: ["IMAGE", "AUDIO", "H3_CONTINUUM_STATE", "STRING"]
  },
  H3ContinuumSamplerV38: {
    inputs: [
      { name: "model", type: "MODEL" },
      { name: "clip", type: "ANY" },
      { name: "video_vae", type: "VAE" },
      { name: "sampler", type: "SAMPLER" },
      { name: "sigmas", type: "SIGMAS" },
      { name: "sequence_prompt", type: "STRING" },
      { name: "chunks", type: "ANY" },
      { name: "chunk_seconds", type: "ANY" }
    ]
  },
  H3ContinuumLoadVideo: {
    inputs: [
      { name: "enable_video", type: "ANY" },
      // The V3 node declares this as io.Combo.Input(upload=video). The API
      // workflow value is a filename string, but ComfyUI 0.35 correctly
      // advertises the input socket itself as COMBO in /object_info.
      { name: "file", type: "COMBO" },
      { name: "force_rate", type: "ANY" }
    ]
  },
  H3ContinuumAssembleSeamV35: {
    inputs: [
      { name: "images", type: "IMAGE" },
      { name: "audio", type: "AUDIO" },
      { name: "assembly_plan", type: "ANY" }
    ]
  },
  LocalVideoStudioH3RequireGpuVAE: {
    inputs: [{ name: "vae", type: "VAE" }],
    outputs: ["VAE"]
  },
  LocalVideoStudioH3AnchorConditioning: {
    inputs: [
      { name: "conditioning", type: "CONDITIONING" },
      { name: "video_latent", type: "LATENT" },
      { name: "strength", type: "FLOAT" }
    ],
    outputs: ["CONDITIONING"]
  },
  MMH3LatentUpscaleWithModelParams: {
    inputs: [
      { name: "model_name", type: "COMBO" },
      { name: "width", type: "INT" },
      { name: "height", type: "INT" },
      { name: "device", type: "COMBO" },
      { name: "precision", type: "COMBO" }
    ],
    outputs: ["H3_UPSCALE_PARAM"]
  },
  MMH3TemporalSplitParams: {
    inputs: [
      { name: "chunk_length", type: "INT" },
      { name: "temporal_overlap", type: "INT" },
      { name: "anchor_strength", type: "FLOAT" }
    ],
    outputs: ["H3_TEMPORAL_PARAM"]
  },
  MMH3SpatialSplitParams: {
    inputs: [
      { name: "upscale_width", type: "INT" },
      { name: "upscale_height", type: "INT" },
      { name: "tile_size_mode", type: "COMBO" },
      { name: "tile_width", type: "INT" },
      { name: "tile_height", type: "INT" },
      { name: "spatial_w_overlap", type: "INT" },
      { name: "spatial_h_overlap", type: "INT" },
      { name: "fade_width", type: "INT" },
      { name: "fade_height", type: "INT" }
    ],
    outputs: ["H3_SPATIAL_PARAM"]
  },
  MMH3UltimateUpscale: {
    inputs: [
      { name: "model", type: "MODEL" },
      { name: "conditioning", type: "CONDITIONING" },
      { name: "latent", type: "LATENT" },
      { name: "noise", type: "NOISE" },
      { name: "sampler", type: "SAMPLER" },
      { name: "sigmas", type: "SIGMAS" },
      { name: "cfg", type: "FLOAT" },
      { name: "latent_upscale_param", type: "ANY" },
      { name: "temporal_split_param", type: "ANY" },
      { name: "spatial_split_param", type: "ANY" }
    ],
    outputs: ["LATENT", "DICT"]
  }
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function graphNodes(source: unknown): Map<string, ApiNode> {
  if (!isRecord(source)) return new Map();
  return new Map(
    Object.entries(source).flatMap(([nodeId, value]) =>
      isRecord(value) ? [[nodeId, value as ApiNode]] : []
    )
  );
}

function classTypes(nodes: Map<string, ApiNode>): Set<string> {
  return new Set(
    [...nodes.values()]
      .map((node) => node.class_type)
      .filter((value): value is string => typeof value === "string")
  );
}

function nodeIdsForClass(nodes: Map<string, ApiNode>, classType: string): string[] {
  return [...nodes.entries()]
    .filter(([, node]) => node.class_type === classType)
    .map(([nodeId]) => nodeId);
}

function inputsFor(node: ApiNode | undefined): Record<string, unknown> {
  return isRecord(node?.inputs) ? node.inputs : {};
}

function nodeRef(value: unknown): NodeRef | null {
  if (!Array.isArray(value) || value.length < 2 || typeof value[0] !== "string") return null;
  const outputIndex = value[1];
  return typeof outputIndex === "number" && Number.isSafeInteger(outputIndex) && outputIndex >= 0
    ? { nodeId: value[0], outputIndex }
    : null;
}

function refExists(value: unknown, nodes: Map<string, ApiNode>): boolean {
  const reference = nodeRef(value);
  return Boolean(reference && nodes.has(reference.nodeId));
}

function refToClass(
  value: unknown,
  expectedClass: string,
  nodes: Map<string, ApiNode>
): boolean {
  const reference = nodeRef(value);
  return Boolean(reference && nodes.get(reference.nodeId)?.class_type === expectedClass);
}

function addMissingClasses(
  errors: string[],
  classes: readonly string[],
  available: Set<string>
): void {
  for (const classType of classes) {
    if (!available.has(classType)) errors.push(`缺少节点 class_type=${classType}`);
  }
}

function requireInputReference(
  errors: string[],
  nodes: Map<string, ApiNode>,
  classType: string,
  inputName: string,
  expectedClass?: string
): void {
  const nodeId = nodeIdsForClass(nodes, classType)[0];
  const value = nodeId ? inputsFor(nodes.get(nodeId))[inputName] : undefined;
  if (!refExists(value, nodes)) {
    errors.push(`${classType}.${inputName} 必须引用已存在的 workflow 节点`);
    return;
  }
  if (expectedClass && !refToClass(value, expectedClass, nodes)) {
    errors.push(`${classType}.${inputName} 必须引用 ${expectedClass}`);
  }
}

function validateFirstPass(nodes: Map<string, ApiNode>, errors: string[]): void {
  const available = classTypes(nodes);
  addMissingClasses(errors, FIRST_PASS_CLASSES, available);
  if (!available.has("LocalVideoStudioH3SaveJointAV")) return;
  requireInputReference(errors, nodes, "LocalVideoStudioH3SaveJointAV", "joint_av");
  const serializerId = nodeIdsForClass(nodes, "LocalVideoStudioH3SaveJointAV")[0];
  const filename = serializerId
    ? inputsFor(nodes.get(serializerId)).filename
    : undefined;
  if (typeof filename !== "string" || !filename.includes("H3_AV_ARTIFACT_FILENAME")) {
    errors.push("LocalVideoStudioH3SaveJointAV.filename 必须保留 H3_AV_ARTIFACT_FILENAME 占位符");
  }
}

function requireOutputReference(
  errors: string[],
  nodes: Map<string, ApiNode>,
  classType: string,
  inputName: string,
  expectedClass: string,
  outputIndex: number
): void {
  const nodeId = nodeIdsForClass(nodes, classType)[0];
  const value = nodeId ? inputsFor(nodes.get(nodeId))[inputName] : undefined;
  const reference = nodeRef(value);
  if (!reference || !nodes.has(reference.nodeId)) {
    errors.push(`${classType}.${inputName} 必须引用已存在的 workflow 节点`);
    return;
  }
  if (nodes.get(reference.nodeId)?.class_type !== expectedClass) {
    errors.push(`${classType}.${inputName} 必须引用 ${expectedClass}`);
  } else if (reference.outputIndex !== outputIndex) {
    errors.push(`${classType}.${inputName} 必须引用 ${expectedClass} 的 output ${outputIndex}`);
  }
}

function requireOutputReferenceAtNodeId(
  errors: string[],
  nodes: Map<string, ApiNode>,
  nodeId: string | undefined,
  classType: string,
  inputName: string,
  expectedClass: string,
  outputIndex: number
): void {
  const value = nodeId ? inputsFor(nodes.get(nodeId))[inputName] : undefined;
  const reference = nodeRef(value);
  if (!reference || !nodes.has(reference.nodeId)) {
    errors.push(`${classType}.${inputName} 必须引用已存在的 workflow 节点`);
    return;
  }
  if (nodes.get(reference.nodeId)?.class_type !== expectedClass) {
    errors.push(`${classType}.${inputName} 必须引用 ${expectedClass}`);
  } else if (reference.outputIndex !== outputIndex) {
    errors.push(`${classType}.${inputName} 必须引用 ${expectedClass} 的 output ${outputIndex}`);
  }
}

function nodeIdReferencing(
  nodes: Map<string, ApiNode>,
  classType: string,
  inputName: string,
  sourceNodeId: string | undefined,
  outputIndex?: number
): string | undefined {
  if (!sourceNodeId) return undefined;
  return nodeIdsForClass(nodes, classType).find((nodeId) => {
    const reference = nodeRef(inputsFor(nodes.get(nodeId))[inputName]);
    return reference?.nodeId === sourceNodeId &&
      (outputIndex === undefined || reference.outputIndex === outputIndex);
  });
}

function validateContinuum(nodes: Map<string, ApiNode>, errors: string[]): void {
  const available = classTypes(nodes);
  addMissingClasses(errors, CONTINUUM_CLASSES, available);
  const loadId = nodeIdsForClass(nodes, "LocalVideoStudioH3LoadJointAV")[0];
  if (loadId && inputsFor(nodes.get(loadId)).artifact !== "{{H3_AV_INPUT_ARTIFACT}}") {
    errors.push("LocalVideoStudioH3LoadJointAV.artifact 必须保留 H3_AV_INPUT_ARTIFACT 占位符");
  }
  requireOutputReference(
    errors,
    nodes,
    "LocalVideoStudioH3ArtifactToContinuumState",
    "joint_av",
    "LocalVideoStudioH3LoadJointAV",
    0
  );
  requireOutputReference(errors, nodes, "H3ContinuumJoin", "latent", "LocalVideoStudioH3LoadJointAV", 0);
  requireOutputReference(errors, nodes, "H3ContinuumJoin", "conditioning", "MiniMaxH3ImageToVideo", 0);
  requireOutputReference(errors, nodes, "H3ContinuumJoin", "previous_state", "LocalVideoStudioH3ArtifactToContinuumState", 0);
  requireOutputReference(errors, nodes, "H3ContinuumFinish", "samples", "SamplerCustomAdvanced", 0);
  requireOutputReference(errors, nodes, "H3ContinuumFinish", "images", "VAEDecode", 0);
  requireOutputReference(errors, nodes, "H3ContinuumFinish", "audio", "VAEDecodeAudio", 0);
  requireOutputReference(errors, nodes, "H3ContinuumFinish", "plan", "H3ContinuumJoin", 3);
  requireOutputReference(errors, nodes, "CreateVideo", "images", "H3ContinuumFinish", 0);
  requireOutputReference(errors, nodes, "CreateVideo", "audio", "H3ContinuumFinish", 1);
  requireOutputReference(errors, nodes, "LocalVideoStudioH3SaveJointAV", "joint_av", "SamplerCustomAdvanced", 0);
  const serializerId = nodeIdsForClass(nodes, "LocalVideoStudioH3SaveJointAV")[0];
  const filename = serializerId ? inputsFor(nodes.get(serializerId)).filename : undefined;
  if (typeof filename !== "string" || !filename.includes("H3_AV_ARTIFACT_FILENAME")) {
    errors.push("LocalVideoStudioH3SaveJointAV.filename 必须保留 H3_AV_ARTIFACT_FILENAME 占位符");
  }
  const conditioningId = nodeIdsForClass(nodes, "MiniMaxH3ImageToVideo")[0];
  if (conditioningId) {
    const inputs = inputsFor(nodes.get(conditioningId));
    if ("first_frame" in inputs || "last_frame" in inputs) {
      errors.push("Continuum 的 MiniMaxH3ImageToVideo 必须只提供文本 conditioning，不能携带首尾帧 keyframe");
    }
  }
}

function validateContinuumV38(nodes: Map<string, ApiNode>, errors: string[]): void {
  const available = classTypes(nodes);
  addMissingClasses(errors, CONTINUUM_V38_CLASSES, available);
  const serialized = JSON.stringify(Object.fromEntries(nodes));
  for (const placeholder of [
    "H3_AV_INPUT_ARTIFACT",
    "H3_AV_ARTIFACT_FILENAME",
    "H3_AV_SOURCE_FRAME_INDEX",
    "SOURCE_VIDEO",
    "PROMPT",
    "WIDTH",
    "HEIGHT",
    "H3_CONTINUUM_CHUNKS",
    "H3_CONTINUUM_CHUNK_SECONDS",
    "SEED",
    "OUTPUT_FILENAME"
  ]) {
    if (!serialized.includes(`{{${placeholder}}}`)) {
      errors.push(`Continuum V3.8 workflow 缺少 {{${placeholder}}} 占位符`);
    }
  }

  const loadId = nodeIdsForClass(nodes, "LocalVideoStudioH3LoadJointAV")[0];
  if (loadId && inputsFor(nodes.get(loadId)).artifact !== "{{H3_AV_INPUT_ARTIFACT}}") {
    errors.push("LocalVideoStudioH3LoadJointAV.artifact 必须保留 H3_AV_INPUT_ARTIFACT 占位符");
  }
  const sourceLoadId = nodeIdsForClass(nodes, "H3ContinuumLoadVideo")[0];
  if (sourceLoadId) {
    const inputs = inputsFor(nodes.get(sourceLoadId));
    if (inputs.file !== "{{SOURCE_VIDEO}}") {
      errors.push("H3ContinuumLoadVideo.file 必须保留 SOURCE_VIDEO 占位符");
    }
    if (inputs.enable_video !== true) {
      errors.push("H3ContinuumLoadVideo.enable_video 必须启用");
    }
  }

  const samplerId = nodeIdsForClass(nodes, "H3ContinuumSamplerV38")[0];
  if (samplerId) {
    const inputs = inputsFor(nodes.get(samplerId));
    if (inputs.sequence_prompt !== "{{PROMPT}}") {
      errors.push("H3ContinuumSamplerV38.sequence_prompt 必须保留 PROMPT 占位符");
    }
    if (inputs.chunks !== "{{H3_CONTINUUM_CHUNKS}}") {
      errors.push("H3ContinuumSamplerV38.chunks 必须保留 H3_CONTINUUM_CHUNKS 占位符");
    }
    if (inputs.chunk_seconds !== "{{H3_CONTINUUM_CHUNK_SECONDS}}") {
      errors.push("H3ContinuumSamplerV38.chunk_seconds 必须保留 H3_CONTINUUM_CHUNK_SECONDS 占位符");
    }
    if (inputs.width !== "{{WIDTH}}" || inputs.height !== "{{HEIGHT}}") {
      errors.push("H3ContinuumSamplerV38.width/height 必须保留 WIDTH/HEIGHT 占位符");
    }
    requireOutputReferenceAtNodeId(errors, nodes, samplerId, "H3ContinuumSamplerV38", "model", "PathchSageAttentionKJ", 0);
    requireOutputReferenceAtNodeId(errors, nodes, samplerId, "H3ContinuumSamplerV38", "clip", "CLIPLoader", 0);
    requireOutputReferenceAtNodeId(errors, nodes, samplerId, "H3ContinuumSamplerV38", "video_vae", "VAELoader", 0);
    requireOutputReferenceAtNodeId(errors, nodes, samplerId, "H3ContinuumSamplerV38", "sampler", "KSamplerSelect", 0);
    requireOutputReferenceAtNodeId(errors, nodes, samplerId, "H3ContinuumSamplerV38", "sigmas", "BasicScheduler", 0);
    requireOutputReferenceAtNodeId(errors, nodes, samplerId, "H3ContinuumSamplerV38", "reference_video_1", "H3ContinuumLoadVideo", 0);
  }

  const artifactDecodeId = nodeIdReferencing(nodes, "VAEDecode", "samples", loadId, 0);
  const frameId = nodeIdReferencing(nodes, "ImageFromBatch", "image", artifactDecodeId, 0);
  if (frameId) {
    const frameInputs = inputsFor(nodes.get(frameId));
    if (frameInputs.batch_index !== "{{H3_AV_SOURCE_FRAME_INDEX}}") {
      errors.push("ImageFromBatch.batch_index 必须保留 H3_AV_SOURCE_FRAME_INDEX 占位符");
    }
    if (frameInputs.length !== 1) {
      errors.push("ImageFromBatch.length 必须固定为 1，以便只传递 JointAV 边界帧");
    }
  } else {
    errors.push("ImageFromBatch.image 必须引用 JointAV loader 解码出的边界帧序列");
  }

  const generatedDecodeId = nodeIdReferencing(nodes, "VAEDecode", "samples", samplerId, 0);
  const audioDecodeId = nodeIdReferencing(nodes, "VAEDecodeAudio", "samples", samplerId, 1);
  const finalizeId = nodeIdsForClass(nodes, "H3ContinuumAssembleSeamV35")[0];
  requireOutputReferenceAtNodeId(errors, nodes, finalizeId, "H3ContinuumAssembleSeamV35", "images", "VAEDecode", 0);
  requireOutputReferenceAtNodeId(errors, nodes, finalizeId, "H3ContinuumAssembleSeamV35", "audio", "VAEDecodeAudio", 0);
  requireOutputReferenceAtNodeId(errors, nodes, finalizeId, "H3ContinuumAssembleSeamV35", "assembly_plan", "H3ContinuumSamplerV38", 2);
  if (generatedDecodeId === undefined) {
    errors.push("VAEDecode.samples 必须有一个节点引用 H3ContinuumSamplerV38 的 video latent output 0");
  }
  if (audioDecodeId === undefined) {
    errors.push("VAEDecodeAudio.samples 必须引用 H3ContinuumSamplerV38 的 audio latent output 1");
  }
  if (finalizeId) {
    const finalizeInputs = inputsFor(nodes.get(finalizeId));
    const imageReference = nodeRef(finalizeInputs.images);
    if (generatedDecodeId && imageReference?.nodeId !== generatedDecodeId) {
      errors.push("H3ContinuumAssembleSeamV35.images 必须引用 sampler video latent 解码出的图像");
    }
    const audioReference = nodeRef(finalizeInputs.audio);
    if (audioDecodeId && audioReference?.nodeId !== audioDecodeId) {
      errors.push("H3ContinuumAssembleSeamV35.audio 必须引用 sampler audio latent 解码出的音频");
    }
  }
  const createVideoId = nodeIdsForClass(nodes, "CreateVideo")[0];
  requireOutputReferenceAtNodeId(errors, nodes, createVideoId, "CreateVideo", "images", "H3ContinuumAssembleSeamV35", 0);
  requireOutputReferenceAtNodeId(errors, nodes, createVideoId, "CreateVideo", "audio", "H3ContinuumAssembleSeamV35", 1);
  const saveVideoId = nodeIdsForClass(nodes, "SaveVideo")[0];
  requireOutputReferenceAtNodeId(errors, nodes, saveVideoId, "SaveVideo", "video", "CreateVideo", 0);
  const serializerId = nodeIdsForClass(nodes, "LocalVideoStudioH3SaveJointAV")[0];
  requireOutputReferenceAtNodeId(errors, nodes, serializerId, "LocalVideoStudioH3SaveJointAV", "joint_av", "H3ContinuumSamplerV38", 0);
  const filename = serializerId ? inputsFor(nodes.get(serializerId)).filename : undefined;
  if (typeof filename !== "string" || !filename.includes("H3_AV_ARTIFACT_FILENAME")) {
    errors.push("LocalVideoStudioH3SaveJointAV.filename 必须保留 H3_AV_ARTIFACT_FILENAME 占位符");
  }
}

function validateSecondPass(nodes: Map<string, ApiNode>, errors: string[]): void {
  const available = classTypes(nodes);
  if (available.has("MMH3UltimateUpscale")) {
    addMissingClasses(errors, ULTIMATE_SECOND_PASS_CLASSES, available);
    const loadId = nodeIdsForClass(nodes, "LocalVideoStudioH3LoadJointAV")[0];
    if (loadId && inputsFor(nodes.get(loadId)).artifact !== "{{H3_AV_INPUT_ARTIFACT}}") {
      errors.push("LocalVideoStudioH3LoadJointAV.artifact 必须保留 H3_AV_INPUT_ARTIFACT 占位符");
    }
    requireInputReference(errors, nodes, "MMH3UltimateUpscale", "latent", "LocalVideoStudioH3LoadJointAV");
    requireInputReference(errors, nodes, "MMH3UltimateUpscale", "conditioning", "MiniMaxH3ConditioningUpscale");
    requireInputReference(errors, nodes, "MMH3UltimateUpscale", "latent_upscale_param", "MMH3LatentUpscaleWithModelParams");
    requireInputReference(errors, nodes, "MMH3UltimateUpscale", "temporal_split_param", "MMH3TemporalSplitParams");
    requireInputReference(errors, nodes, "MMH3UltimateUpscale", "spatial_split_param", "MMH3SpatialSplitParams");
    requireInputReference(errors, nodes, "MiniMaxH3ImageToVideo", "vae", "LocalVideoStudioH3RequireGpuVAE");
    requireInputReference(errors, nodes, "VAEDecode", "vae", "LocalVideoStudioH3RequireGpuVAE");
    requireInputReference(errors, nodes, "VAEDecodeAudio", "vae", "LocalVideoStudioH3RequireGpuVAE");
    requireInputReference(errors, nodes, "LocalVideoStudioH3SaveJointAV", "joint_av");
    const serializerId = nodeIdsForClass(nodes, "LocalVideoStudioH3SaveJointAV")[0];
    const filename = serializerId ? inputsFor(nodes.get(serializerId)).filename : undefined;
    if (typeof filename !== "string" || !filename.includes("H3_AV_ARTIFACT_FILENAME")) {
      errors.push("LocalVideoStudioH3SaveJointAV.filename 必须保留 H3_AV_ARTIFACT_FILENAME 占位符");
    }
    return;
  }
  addMissingClasses(errors, SECOND_PASS_CLASSES, available);
  const upscalerClasses = SECOND_PASS_UPSCALER_CLASSES.filter((classType) => available.has(classType));
  if (upscalerClasses.length !== 1) {
    errors.push("二采 workflow 必须恰好包含一个 bilinear 或 learned 3D video latent upscaler");
  }
  const upscalerClass = upscalerClasses[0];

  const loadId = nodeIdsForClass(nodes, "LocalVideoStudioH3LoadJointAV")[0];
  if (loadId) {
    const artifact = inputsFor(nodes.get(loadId)).artifact;
    if (artifact !== "{{H3_AV_INPUT_ARTIFACT}}") {
      errors.push("LocalVideoStudioH3LoadJointAV.artifact 必须保留 H3_AV_INPUT_ARTIFACT 占位符");
    }
  }

  if (available.has("LTXVSeparateAVLatent") && available.has("LocalVideoStudioH3LoadJointAV")) {
    requireInputReference(errors, nodes, "LTXVSeparateAVLatent", "av_latent", "LocalVideoStudioH3LoadJointAV");
  }
  if (upscalerClass && available.has("LTXVSeparateAVLatent")) {
    requireInputReference(
      errors,
      nodes,
      upscalerClass,
      upscalerClass === "MinimaxH3LatentUpscaler3D" ? "latent" : "samples",
      "LTXVSeparateAVLatent"
    );
  }
  if (available.has("LTXVConcatAVLatent") && upscalerClass && available.has("LTXVSeparateAVLatent")) {
    requireInputReference(errors, nodes, "LTXVConcatAVLatent", "video_latent", upscalerClass);
    const concatId = nodeIdsForClass(nodes, "LTXVConcatAVLatent")[0];
    const audio = concatId ? inputsFor(nodes.get(concatId)).audio_latent : undefined;
    const separateId = nodeIdsForClass(nodes, "LTXVSeparateAVLatent")[0];
    const separateRef = nodeRef(audio);
    if (!separateRef || separateRef.nodeId !== separateId || separateRef.outputIndex !== 1) {
      errors.push("LTXVConcatAVLatent.audio_latent 必须引用 LTXVSeparateAVLatent 的 audio 输出");
    }
  }

  const addNoiseIds = nodeIdsForClass(nodes, "MiniMaxH3AddNoise");
  if (addNoiseIds.length !== 2) {
    errors.push("二采 workflow 必须恰好包含两个 MiniMaxH3AddNoise（video/audio 各一个）");
  }
  for (const nodeId of addNoiseIds) {
    const inputs = inputsFor(nodes.get(nodeId));
    for (const name of ["model", "noise", "sigmas", "latent_image"]) {
      if (!refExists(inputs[name], nodes)) {
        errors.push(`MiniMaxH3AddNoise.${name} 必须引用已存在的 workflow 节点`);
      }
    }
  }
  if (available.has("MiniMaxH3ShiftSigmas")) {
    requireInputReference(errors, nodes, "MiniMaxH3ShiftSigmas", "sigmas", "BasicScheduler");
  }
  if (available.has("MiniMaxH3ConditioningUpscale") && available.has("MiniMaxH3ImageToVideo")) {
    requireInputReference(errors, nodes, "MiniMaxH3ConditioningUpscale", "conditioning", "MiniMaxH3ImageToVideo");
  }
  if (upscalerClass === "MinimaxH3LatentUpscaler3D") {
    if (!available.has("LocalVideoStudioH3AnchorConditioning")) {
      errors.push("learned 3D 二采 workflow 缺少 LocalVideoStudioH3AnchorConditioning");
    } else {
      requireInputReference(errors, nodes, "LocalVideoStudioH3AnchorConditioning", "conditioning", "MiniMaxH3ConditioningUpscale");
      requireInputReference(errors, nodes, "LocalVideoStudioH3AnchorConditioning", "video_latent", "MinimaxH3LatentUpscaler3D");
      requireInputReference(errors, nodes, "BasicGuider", "conditioning", "LocalVideoStudioH3AnchorConditioning");
    }
  }
  if (available.has("SamplerCustomAdvanced") && available.has("DisableNoise") && available.has("LTXVConcatAVLatent")) {
    requireInputReference(errors, nodes, "SamplerCustomAdvanced", "noise", "DisableNoise");
    requireInputReference(errors, nodes, "SamplerCustomAdvanced", "latent_image", "LTXVConcatAVLatent");
  }
  if (available.has("LocalVideoStudioH3SaveJointAV") && available.has("SamplerCustomAdvanced")) {
    requireInputReference(errors, nodes, "LocalVideoStudioH3SaveJointAV", "joint_av");
    const serializerId = nodeIdsForClass(nodes, "LocalVideoStudioH3SaveJointAV")[0];
    const filename = serializerId
      ? inputsFor(nodes.get(serializerId)).filename
      : undefined;
    if (typeof filename !== "string" || !filename.includes("H3_AV_ARTIFACT_FILENAME")) {
      errors.push("LocalVideoStudioH3SaveJointAV.filename 必须保留 H3_AV_ARTIFACT_FILENAME 占位符");
    }
  }
}

export function h3ComfyAvWorkflowKind(source: unknown): H3ComfyAvWorkflowKind | null {
  const nodes = graphNodes(source);
  const classes = classTypes(nodes);
  if (
    classes.has("H3ContinuumSamplerV38") ||
    classes.has("H3ContinuumJoin") ||
    classes.has("H3ContinuumFinish")
  ) {
    return "continuum-extension";
  }
  if (
    classes.has("LocalVideoStudioH3LoadJointAV") ||
    SECOND_PASS_UPSCALER_CLASSES.some((classType) => classes.has(classType))
  ) {
    return "second-sampling-av";
  }
  return classes.has("LocalVideoStudioH3SaveJointAV") ? "first-pass-av" : null;
}

export function validateH3ComfyWorkflow(source: unknown): H3ComfyWorkflowValidation {
  const nodes = graphNodes(source);
  const kind = h3ComfyAvWorkflowKind(source);
  if (!kind) return { valid: true, kind: null, errors: [] };
  const errors: string[] = [];
  if (kind === "first-pass-av") validateFirstPass(nodes, errors);
  else if (kind === "continuum-extension") {
    if (classTypes(nodes).has("H3ContinuumSamplerV38")) validateContinuumV38(nodes, errors);
    else validateContinuum(nodes, errors);
  }
  else validateSecondPass(nodes, errors);
  return { valid: errors.length === 0, kind, errors: [...new Set(errors)] };
}

function inputSpecFor(node: unknown, inputName: string): unknown {
  if (!isRecord(node)) return undefined;
  const input = node.input;
  if (!isRecord(input)) return undefined;
  for (const groupName of ["required", "optional", "hidden"] as const) {
    const group = input[groupName];
    if (!isRecord(group)) continue;
    if (inputName in group) return group[inputName];
  }
  return undefined;
}

function specType(spec: unknown): string | undefined {
  if (typeof spec === "string") return spec.toUpperCase();
  if (Array.isArray(spec)) {
    return typeof spec[0] === "string" ? spec[0].toUpperCase() : undefined;
  }
  if (isRecord(spec) && typeof spec.type === "string") return spec.type.toUpperCase();
  return undefined;
}

function comboOptions(spec: unknown): string[] {
  if (Array.isArray(spec)) {
    if (Array.isArray(spec[0])) {
      return spec[0].filter((value): value is string => typeof value === "string");
    }
    if (isRecord(spec[1])) {
      for (const key of ["options", "choices", "values"] as const) {
        const values = spec[1][key];
        if (Array.isArray(values)) return values.filter((value): value is string => typeof value === "string");
      }
    }
  }
  if (isRecord(spec)) {
    for (const key of ["options", "choices", "values"] as const) {
      const values = spec[key];
      if (Array.isArray(values)) return values.filter((value): value is string => typeof value === "string");
    }
  }
  return [];
}

function isStringComboSpec(spec: unknown): boolean {
  return Array.isArray(spec) &&
    Array.isArray(spec[0]) &&
    spec[0].every((value) => typeof value === "string");
}

function runtimeTypeMatches(spec: unknown, expected: RuntimeInputRequirement["type"]): boolean {
  if (expected === "ANY") return spec !== undefined;
  const actual = specType(spec);
  if (expected === "COMBO") {
    return isStringComboSpec(spec) || actual === "COMBO" || actual === "STRING";
  }
  // ComfyUI file pickers are serialized as strings in API workflows, while
  // /object_info exposes them as a string-valued combo (the current files plus
  // upload metadata). Treat that wire shape as STRING without weakening the
  // checks for numeric, boolean, or model/socket inputs.
  if (expected === "STRING" && isStringComboSpec(spec)) return true;
  return actual === expected;
}

function outputTypesFor(node: unknown): string[] {
  if (!isRecord(node) || !Array.isArray(node.output)) return [];
  return node.output.filter((value): value is string => typeof value === "string")
    .map((value) => value.toUpperCase());
}

function runtimeNode(source: unknown, classType: string): unknown {
  if (!isRecord(source)) return undefined;
  const node = source[classType];
  return node;
}

/**
 * Validate only the special nodes used by an AV workflow. An ordinary H3
 * workflow returns no issues and remains on the existing missing-node path.
 */
export function h3ComfyWorkflowRuntimeIssues(
  workflow: unknown,
  objectInfo: unknown
): string[] {
  const kind = h3ComfyAvWorkflowKind(workflow);
  if (!kind) return [];
  if (!isRecord(objectInfo)) return ["/object_info 响应无效，无法验证 H3 AV 节点 schema"];
  const workflowClassTypes = classTypes(graphNodes(workflow));
  const continuum = kind === "continuum-extension";
  const continuumV38 = continuum && workflowClassTypes.has("H3ContinuumSamplerV38");
  const ultimate = kind === "second-sampling-av" && workflowClassTypes.has("MMH3UltimateUpscale");
  const workflowClasses = kind === "continuum-extension"
    ? continuumV38
      ? CONTINUUM_V38_CLASSES
      : CONTINUUM_CLASSES
    : kind === "first-pass-av"
    ? FIRST_PASS_CLASSES
    : ultimate
      ? ULTIMATE_SECOND_PASS_CLASSES
      : SECOND_PASS_CLASSES;
  const workflowUpscalerClasses = SECOND_PASS_UPSCALER_CLASSES.filter((classType) =>
    workflowClassTypes.has(classType)
  );
  const runtimeClasses = new Set<string>([
    ...(continuum
      ? continuumV38
        ? [
            "H3ContinuumLoadVideo",
            "H3ContinuumSamplerV38",
            "H3ContinuumAssembleSeamV35"
          ]
        : [
            "LocalVideoStudioH3LoadJointAV",
            "LocalVideoStudioH3ArtifactToContinuumState",
            "H3ContinuumJoin",
            "H3ContinuumFinish"
          ]
      : []),
    ...(kind === "second-sampling-av"
      ? ultimate
        ? [
            "MMH3UltimateUpscale",
            "MMH3LatentUpscaleWithModelParams",
            "MMH3TemporalSplitParams",
            "MMH3SpatialSplitParams",
            "MiniMaxH3ConditioningUpscale",
            "LocalVideoStudioH3LoadJointAV",
            "LocalVideoStudioH3RequireGpuVAE"
          ]
        : [
          ...workflowUpscalerClasses,
          "MiniMaxH3ConditioningUpscale",
          ...(workflowUpscalerClasses.includes("MinimaxH3LatentUpscaler3D")
            ? ["LocalVideoStudioH3AnchorConditioning"]
            : []),
          "MiniMaxH3AddNoise",
          "MiniMaxH3ShiftSigmas",
          "LTXVSeparateAVLatent",
          "LTXVConcatAVLatent",
          "LocalVideoStudioH3LoadJointAV"
        ]
      : []),
    "LocalVideoStudioH3SaveJointAV"
  ]);
  const issues: string[] = [];
  for (const classType of workflowClasses) {
    if (classType === "MiniMaxH3ImageToVideo" || classType === "SamplerCustomAdvanced" || classType === "VAEDecode" || classType === "VAEDecodeAudio" || classType === "CreateVideo" || classType === "SaveVideo" || classType === "DisableNoise" || classType === "BasicGuider") {
      // These core nodes remain covered by missingWorkflowNodeTypes; only the
      // app-owned/upscaler schema is strict here.
      continue;
    }
    runtimeClasses.add(classType);
  }
  for (const classType of runtimeClasses) {
    const node = objectInfo[classType];
    if (!node) {
      issues.push(`/object_info 缺少精确 class_type=${classType}`);
      continue;
    }
    const requirements = RUNTIME_NODE_REQUIREMENTS[classType];
    if (!requirements) continue;
    for (const requirement of requirements.inputs) {
      const spec = inputSpecFor(node, requirement.name);
      if (spec === undefined) {
        issues.push(`${classType}.${requirement.name} 不在 /object_info schema 中`);
      } else if (!runtimeTypeMatches(spec, requirement.type)) {
        issues.push(`${classType}.${requirement.name} schema 类型不兼容：要求 ${requirement.type}`);
      }
      if (requirement.name === "upscale_method" && spec !== undefined) {
        const options = comboOptions(spec);
        if (options.length > 0 && !options.includes("bilinear")) {
          issues.push(`${classType}.upscale_method 缺少 workflow 使用的 bilinear 选项`);
        }
      }
    }
    if (requirements.outputs) {
      const actualOutputs = outputTypesFor(node);
      if (actualOutputs.length > 0 && requirements.outputs.some((expected) => !actualOutputs.includes(expected))) {
        issues.push(`${classType} /object_info 输出 schema 不包含 ${requirements.outputs.join("/")}`);
      }
    }
  }
  return [...new Set(issues)];
}

function dynamicOptionKeys(spec: unknown): string[] {
  const config = Array.isArray(spec) && isRecord(spec[1])
    ? spec[1]
    : isRecord(spec)
      ? spec
      : undefined;
  const options = config?.options;
  if (!Array.isArray(options)) return [];
  return options.flatMap((option) =>
    isRecord(option) && typeof option.key === "string" ? [option.key] : []
  );
}

function runtimeInputIssue(
  issues: string[],
  objectInfo: Record<string, unknown>,
  classType: string,
  inputName: string,
  expected: RuntimeInputRequirement["type"]
): unknown {
  const spec = inputSpecFor(objectInfo[classType], inputName);
  if (spec === undefined) {
    issues.push(`${classType}.${inputName} 不在 /object_info schema 中`);
  } else if (!runtimeTypeMatches(spec, expected)) {
    issues.push(`${classType}.${inputName} schema 类型不兼容：要求 ${expected}`);
  }
  return spec;
}

/**
 * Validate the ComfyUI 0.35 native H3 patch nodes inserted by the renderer.
 * These checks deliberately accept no H3-Optimizations inputs: the native
 * nodes are the only active performance path after the upgrade.
 */
export function h3ExecutionNodeRuntimeIssues(
  workflow: unknown,
  objectInfo: unknown
): string[] {
  const nodes = graphNodes(workflow);
  if (!isRecord(objectInfo)) return ["/object_info 响应无效，无法验证 H3 执行节点 schema"];
  const issues: string[] = [];
  const objectInfoRecord = objectInfo as Record<string, unknown>;
  for (const [nodeId, node] of nodes) {
    const classType = node.class_type;
    if (classType !== "ModelAttentionBackend" && classType !== "BlockSparseAttention") continue;
    if (!objectInfoRecord[classType]) {
      issues.push(`/object_info 缺少精确 class_type=${classType}`);
      continue;
    }
    runtimeInputIssue(issues, objectInfoRecord, classType, "model", "MODEL");
    const outputs = outputTypesFor(objectInfoRecord[classType]);
    if (outputs.length > 0 && !outputs.includes("MODEL")) {
      issues.push(`${classType} /object_info 输出 schema 不包含 MODEL`);
    }
    if (classType === "ModelAttentionBackend") {
      const attentionSpec = runtimeInputIssue(
        issues,
        objectInfoRecord,
        classType,
        "attention",
        "COMBO"
      );
      const options = comboOptions(attentionSpec);
      const actual = inputsFor(node).attention;
      if (actual !== "pytorch attention" && actual !== "comfy kitchen attention") {
        issues.push(`ModelAttentionBackend.attention 使用了未知值：${String(actual)}`);
      } else if (options.length > 0 && !options.includes(actual)) {
        issues.push(`ModelAttentionBackend.attention 不接受工作流值：${actual}`);
      }
      continue;
    }

    const selectionSpec = runtimeInputIssue(
      issues,
      objectInfoRecord,
      classType,
      "selection",
      "ANY"
    );
    const selectionType = specType(selectionSpec);
    if (selectionType !== "COMFY_DYNAMICCOMBO_V3" && selectionType !== "DYNAMIC_COMBO") {
      issues.push("BlockSparseAttention.selection 必须是 ComfyUI 0.35 DynamicCombo schema");
    }
    for (const required of ["sol-attn", "sla", "vsa"]) {
      if (!dynamicOptionKeys(selectionSpec).includes(required)) {
        issues.push(`BlockSparseAttention.selection 缺少 ${required} 选项`);
      }
    }
    for (const [inputName, expected] of [
      ["start_percent", "FLOAT"],
      ["end_percent", "FLOAT"],
      ["dense_blocks", "STRING"],
      ["min_tokens", "INT"],
      ["extra_tokens", "INT"],
      ["sink_conditioning", "COMBO"],
      ["verbose", "BOOLEAN"]
    ] as const) {
      runtimeInputIssue(issues, objectInfoRecord, classType, inputName, expected);
    }
    const sinkSpec = inputSpecFor(objectInfoRecord[classType], "sink_conditioning");
    const sinkOptions = comboOptions(sinkSpec);
    if (sinkOptions.length > 0 && !sinkOptions.includes("exact_kv_and_rows")) {
      issues.push("BlockSparseAttention.sink_conditioning 缺少 exact_kv_and_rows 选项");
    }
    const nodeInputs = inputsFor(node);
    const selection = nodeInputs.selection;
    if (typeof selection !== "string" || !["sol-attn", "sla", "vsa"].includes(selection)) {
      issues.push(`BlockSparseAttention.selection 使用了未知值：${String(selection)}`);
    } else {
      const parameterName = selection === "sol-attn"
        ? "selection.tau"
        : "selection.keep_percent";
      const parameterValue = nodeInputs[parameterName];
      if (typeof parameterValue !== "number" || !Number.isFinite(parameterValue)) {
        issues.push(`BlockSparseAttention.${parameterName} 必须通过 DynamicCombo 扁平输入提供数值`);
      }
    }
    // Keep nodeId in the loop's diagnostics context without exposing it in
    // the public contract; duplicate native nodes are caught by the patcher.
    void nodeId;
  }
  return [...new Set(issues)];
}
