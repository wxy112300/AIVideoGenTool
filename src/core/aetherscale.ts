import {
  AETHERSCALE_NODE_REVISION,
  AETHERSCALE_RUNTIME_BUNDLE_ID
} from "./catalog/dependencies/aetherscale.js";
import type {
  AetherScaleCarrierMode,
  AetherScaleDlss5Options,
  AetherScaleStyleProfile,
  UpscaleQueueTask
} from "../types.js";
import { isSafeRelativeComfyPath } from "./dlss5.js";

export { AETHERSCALE_NODE_REVISION, AETHERSCALE_RUNTIME_BUNDLE_ID } from "./catalog/dependencies/aetherscale.js";

export const AETHERSCALE_MODEL_ID = "aetherscale-dlss5" as const;
export const AETHERSCALE_WORKFLOW_PATH = "builtin:upscale/aetherscale-dlss5" as const;
export const AETHERSCALE_MOTION_PROFILE = "torch-lk-compact-v1" as const;
export const AETHERSCALE_DEFAULT_MODE: AetherScaleCarrierMode = "performance_2x";
export const AETHERSCALE_DEFAULT_STYLE_PROFILE: AetherScaleStyleProfile = "faithful";
/** Keep short clips out of the upstream 120-frame warm-up; longer-run tuning remains experimental. */
export const AETHERSCALE_DEFAULT_WARMUP_FRAMES = 8;
export const AETHERSCALE_DEFAULT_SCENE_CUT_THRESHOLD = 0.22;
export const AETHERSCALE_CARRIER_MODE_VALUES = [
  "native_1x",
  "quality_1_5x",
  "balanced_1_724x",
  "performance_2x",
  "ultra_performance_3x"
] as const satisfies readonly AetherScaleCarrierMode[];

export interface AetherScaleModeSpec {
  mode: AetherScaleCarrierMode;
  factor: number;
  perfQuality: number;
  operation: AetherScaleDlss5Options["operation"];
  advanced?: boolean;
}

export const AETHERSCALE_MODE_SPECS: readonly AetherScaleModeSpec[] = [
  { mode: "native_1x", factor: 1, perfQuality: 5, operation: "neural-enhance" },
  { mode: "quality_1_5x", factor: 1.5, perfQuality: 2, operation: "neural-upscale" },
  { mode: "balanced_1_724x", factor: 1.724, perfQuality: 1, operation: "neural-upscale", advanced: true },
  { mode: "performance_2x", factor: 2, perfQuality: 0, operation: "neural-upscale" },
  { mode: "ultra_performance_3x", factor: 3, perfQuality: 3, operation: "neural-upscale" }
];

export const AETHERSCALE_REQUIRED_WORKFLOW_NODE_TYPES = [
  "VHS_LoadVideo",
  "AetherScaleMotionAnalysis",
  "AetherScaleNeuralRendering",
  "VHS_VideoCombine"
] as const;

export const AETHERSCALE_FORBIDDEN_WORKFLOW_NODE_TYPES = [
  "AetherScaleSuperResolution",
  "AetherScaleRestoration",
  "AetherScaleHDR",
  "AetherScaleNeuralPlanner",
  "AetherScaleRuntime",
  "AetherScaleDiagnostics"
] as const;

export interface AetherScaleOutputGeometry {
  width: number;
  height: number;
  mode: AetherScaleCarrierMode;
  factor: number;
  perfQuality: number;
}

export interface AetherScaleTargetInput {
  modelId: string;
  sourceWidth: number;
  sourceHeight: number;
  targetWidth?: unknown;
  targetOutputHeight?: unknown;
  targetHeight?: unknown;
  targetScale?: unknown;
  dlss5?: unknown;
  aetherScale?: unknown;
}

export type NormalizedAetherScaleTarget = {
  provider: "aetherscale-carrier";
  modelId: typeof AETHERSCALE_MODEL_ID;
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetOutputHeight: number;
  width: number;
  height: number;
  aetherScale: AetherScaleDlss5Options;
};

export interface AetherScaleSchemaValidation {
  valid: boolean;
  missingNodes: string[];
  missingInputs: string[];
  invalidInputs: string[];
  outputMismatch: string[];
  errors: string[];
}

export interface AetherScaleApiNode {
  class_type: string;
  inputs: Record<string, unknown>;
}

export type AetherScaleApiWorkflow = Record<string, AetherScaleApiNode>;

export interface AetherScaleWorkflowValidation {
  valid: boolean;
  missingNodes: string[];
  invalidEdges: string[];
  invalidInputs: string[];
  outputMismatch: string[];
  errors: string[];
}

/** A small app-owned fixture for the exact v0.5.5 node contract we consume. */
export const AETHERSCALE_V055_OBJECT_INFO = {
  AetherScaleMotionAnalysis: {
    input: {
      required: {
        images: ["IMAGE"],
        engine: [["auto", "torch_lk", "nvidia_optical_flow"]],
        quality: [["balanced", "quality", "fast"]],
        scene_cut_threshold: ["FLOAT"],
        reset_on_scene_cut: ["BOOLEAN"],
        cuda_device: ["INT"],
        output_device: [["cpu_safe", "same_as_input"]]
      },
      optional: {
        motion_mode: [["scene_cuts_only", "compact_flow", "full_flow"]],
        analysis_long_edge: ["INT"],
        storage_precision: [["float16", "float32"]],
        preview_frames: ["INT"]
      }
    },
    output: ["AETHERSCALE_MOTION", "IMAGE", "STRING"]
  },
  AetherScaleNeuralRendering: {
    input: {
      required: {
        images: ["IMAGE"],
        motion: ["AETHERSCALE_MOTION"],
        style: [["auto", "natural", "cinematic", "material_detail", "default", "3", "4", "5", "6"]],
        strength: ["FLOAT"],
        local_tone: ["FLOAT"],
        local_structure: ["FLOAT"],
        skin_structure: ["FLOAT"],
        reset_on_scene_cut: ["BOOLEAN"],
        history_frames: ["INT"],
        safety_margin_mb: ["INT"],
        cuda_device: ["INT"],
        effect_cache: [["single", "persistent", "none"]],
        cuda_stream: [["current", "dedicated"]],
        memory_policy: [["performance", "balanced", "aggressive"]],
        vram_guard: [["auto", "release_models", "preserve_models"]],
        min_free_vram_mb: ["INT"],
        output_device: [["cpu_safe", "same_as_input"]],
        auto_bootstrap: ["BOOLEAN"]
      },
      optional: {
        preset: ["INT"],
        output_precision: [["auto", "float16", "float32"]],
        output_storage: [["auto", "mmap", "ram"]],
        clean_cache: ["BOOLEAN"],
        backend: [["carrier", "legacy_direct"]],
        upscale_mode: [[...AETHERSCALE_CARRIER_MODE_VALUES]],
        motion_source: [["auto", "connected_motion", "internal_dis", "zero_motion"]],
        carrier_warmup_frames: ["INT"],
        carrier_scene_cut_threshold: ["FLOAT"],
        carrier_gpu: ["STRING"]
      }
    },
    output: ["IMAGE", "STRING"]
  }
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return Number(value);
}

function evenDimension(value: number): number {
  return Math.max(2, Math.floor(value / 2 + 0.5) * 2);
}

function modeSpec(mode: unknown): AetherScaleModeSpec {
  const spec = AETHERSCALE_MODE_SPECS.find((candidate) => candidate.mode === mode);
  if (!spec) throw new Error("AetherScale mode is invalid");
  return spec;
}

export function isAetherScaleMode(value: unknown): value is AetherScaleCarrierMode {
  return AETHERSCALE_CARRIER_MODE_VALUES.includes(value as AetherScaleCarrierMode);
}

export function isAetherScaleStyleProfile(value: unknown): value is AetherScaleStyleProfile {
  return value === "faithful" || value === "enhanced";
}

export function aetherScaleModeSpec(mode: AetherScaleCarrierMode): AetherScaleModeSpec {
  return modeSpec(mode);
}

export function aetherScaleOutputGeometry(
  sourceWidth: unknown,
  sourceHeight: unknown,
  mode: unknown
): AetherScaleOutputGeometry {
  const width = positiveInteger(sourceWidth, "sourceWidth");
  const height = positiveInteger(sourceHeight, "sourceHeight");
  const spec = modeSpec(mode);
  const outputWidth = evenDimension(width * spec.factor);
  const outputHeight = evenDimension(height * spec.factor);
  if (!Number.isSafeInteger(outputWidth) || !Number.isSafeInteger(outputHeight)) {
    throw new Error("AetherScale output dimensions exceed safe integer range");
  }
  if (Math.max(outputWidth, outputHeight) > 7680 || Math.min(outputWidth, outputHeight) > 4320) {
    throw new Error(`AetherScale carrier output ${outputWidth}x${outputHeight} exceeds the 8K boundary`);
  }
  return {
    width: outputWidth,
    height: outputHeight,
    mode: spec.mode,
    factor: spec.factor,
    perfQuality: spec.perfQuality
  };
}

export function defaultAetherScaleOptions(
  targetWidth: number,
  targetHeight: number,
  mode: AetherScaleCarrierMode = AETHERSCALE_DEFAULT_MODE,
  styleProfile: AetherScaleStyleProfile = AETHERSCALE_DEFAULT_STYLE_PROFILE
): AetherScaleDlss5Options {
  const spec = modeSpec(mode);
  return {
    provider: "aetherscale-carrier",
    operation: spec.operation,
    mode: spec.mode,
    styleProfile,
    motionProfile: AETHERSCALE_MOTION_PROFILE,
    nodeRevision: AETHERSCALE_NODE_REVISION,
    runtimeBundleId: AETHERSCALE_RUNTIME_BUNDLE_ID,
    targetWidth,
    targetHeight,
    warmupFrames: AETHERSCALE_DEFAULT_WARMUP_FRAMES,
    sceneCutThreshold: AETHERSCALE_DEFAULT_SCENE_CUT_THRESHOLD
  };
}

export function normalizeAetherScaleOptions(value: unknown): AetherScaleDlss5Options {
  if (!isRecord(value)) throw new Error("AetherScale options must be an object");
  if (value.provider !== "aetherscale-carrier") {
    throw new Error("AetherScale provider must be aetherscale-carrier");
  }
  const spec = modeSpec(value.mode);
  if (value.operation !== spec.operation) {
    throw new Error(`AetherScale operation must be ${spec.operation} for ${spec.mode}`);
  }
  if (!isAetherScaleStyleProfile(value.styleProfile)) {
    throw new Error("AetherScale styleProfile must be faithful or enhanced");
  }
  if (value.motionProfile !== AETHERSCALE_MOTION_PROFILE) {
    throw new Error(`AetherScale motionProfile must be ${AETHERSCALE_MOTION_PROFILE}`);
  }
  if (value.nodeRevision !== AETHERSCALE_NODE_REVISION) {
    throw new Error(`AetherScale nodeRevision must be the pinned commit ${AETHERSCALE_NODE_REVISION}`);
  }
  if (value.runtimeBundleId !== AETHERSCALE_RUNTIME_BUNDLE_ID) {
    throw new Error(`AetherScale runtimeBundleId must be ${AETHERSCALE_RUNTIME_BUNDLE_ID}`);
  }
  const targetWidth = positiveInteger(value.targetWidth, "AetherScale targetWidth");
  const targetHeight = positiveInteger(value.targetHeight, "AetherScale targetHeight");
  if (targetWidth % 2 !== 0 || targetHeight % 2 !== 0) {
    throw new Error("AetherScale target dimensions must be even");
  }
  if (!Number.isSafeInteger(value.warmupFrames) || Number(value.warmupFrames) < 0 || Number(value.warmupFrames) > 240) {
    throw new Error("AetherScale warmupFrames must be an integer from 0 to 240");
  }
  if (typeof value.sceneCutThreshold !== "number" || !Number.isFinite(value.sceneCutThreshold) ||
      value.sceneCutThreshold < 0.01 || value.sceneCutThreshold > 1) {
    throw new Error("AetherScale sceneCutThreshold must be between 0.01 and 1");
  }
  return {
    provider: "aetherscale-carrier",
    operation: spec.operation,
    mode: spec.mode,
    styleProfile: value.styleProfile,
    motionProfile: AETHERSCALE_MOTION_PROFILE,
    nodeRevision: AETHERSCALE_NODE_REVISION,
    runtimeBundleId: AETHERSCALE_RUNTIME_BUNDLE_ID,
    targetWidth,
    targetHeight,
    warmupFrames: Number(value.warmupFrames),
    sceneCutThreshold: value.sceneCutThreshold
  };
}

export function normalizeAetherScaleTarget(
  input: AetherScaleTargetInput
): NormalizedAetherScaleTarget {
  if (!isRecord(input)) throw new Error("AetherScale target must be an object");
  const hasAetherFields = input.aetherScale !== undefined;
  if (input.modelId !== AETHERSCALE_MODEL_ID && hasAetherFields) {
    throw new Error("AetherScale target fields are only valid for modelId aetherscale-dlss5");
  }
  if (input.modelId !== AETHERSCALE_MODEL_ID) {
    throw new Error("AetherScale target requires modelId aetherscale-dlss5");
  }
  if (input.targetHeight !== undefined || input.targetScale !== undefined || input.dlss5 !== undefined) {
    throw new Error("AetherScale targets must not depend on legacy targetHeight/targetScale/dlss5");
  }
  const sourceWidth = positiveInteger(input.sourceWidth, "sourceWidth");
  const sourceHeight = positiveInteger(input.sourceHeight, "sourceHeight");
  const aetherScale = normalizeAetherScaleOptions(input.aetherScale);
  const geometry = aetherScaleOutputGeometry(sourceWidth, sourceHeight, aetherScale.mode);
  if (aetherScale.targetWidth !== geometry.width || aetherScale.targetHeight !== geometry.height) {
    throw new Error("AetherScale target dimensions do not match the frozen source mode");
  }
  if (input.targetWidth !== undefined && input.targetWidth !== geometry.width) {
    throw new Error("AetherScale task targetWidth does not match its frozen source mode");
  }
  if (input.targetOutputHeight !== undefined && input.targetOutputHeight !== geometry.height) {
    throw new Error("AetherScale task targetOutputHeight does not match its frozen source mode");
  }
  return {
    provider: "aetherscale-carrier",
    modelId: AETHERSCALE_MODEL_ID,
    sourceWidth,
    sourceHeight,
    targetWidth: geometry.width,
    targetOutputHeight: geometry.height,
    width: geometry.width,
    height: geometry.height,
    aetherScale
  };
}

export const normalizeAetherScaleUpscaleOptions = normalizeAetherScaleOptions;
export const normalizeAetherScaleUpscaleTarget = normalizeAetherScaleTarget;

export function isAetherScaleUpscaleOptions(value: unknown): value is AetherScaleDlss5Options {
  try {
    normalizeAetherScaleOptions(value);
    return true;
  } catch {
    return false;
  }
}

function nodeInfoFor(objectInfo: unknown, nodeType: string): Record<string, unknown> | undefined {
  return isRecord(objectInfo) && isRecord(objectInfo[nodeType])
    ? objectInfo[nodeType]
    : undefined;
}

function schemaInput(node: Record<string, unknown>, name: string): unknown {
  const input = isRecord(node.input) ? node.input : undefined;
  const required = input && isRecord(input.required) ? input.required : undefined;
  const optional = input && isRecord(input.optional) ? input.optional : undefined;
  return required?.[name] ?? optional?.[name];
}

function enumValues(value: unknown): unknown[] | undefined {
  return Array.isArray(value) && Array.isArray(value[0]) ? value[0] : undefined;
}

function checkSchemaInput(
  nodeType: string,
  node: Record<string, unknown> | undefined,
  names: readonly string[],
  missingInputs: string[]
): void {
  if (!node) return;
  for (const name of names) {
    if (schemaInput(node, name) === undefined) missingInputs.push(`${nodeType}.${name}`);
  }
}

export function validateAetherScaleObjectInfoSchema(objectInfo: unknown): AetherScaleSchemaValidation {
  const missingNodes: string[] = [];
  const missingInputs: string[] = [];
  const invalidInputs: string[] = [];
  const outputMismatch: string[] = [];
  const errors: string[] = [];
  const motion = nodeInfoFor(objectInfo, "AetherScaleMotionAnalysis");
  const neural = nodeInfoFor(objectInfo, "AetherScaleNeuralRendering");
  if (!motion) missingNodes.push("AetherScaleMotionAnalysis");
  if (!neural) missingNodes.push("AetherScaleNeuralRendering");
  checkSchemaInput("AetherScaleMotionAnalysis", motion, [
    "images", "engine", "quality", "scene_cut_threshold", "reset_on_scene_cut", "cuda_device", "output_device"
  ], missingInputs);
  checkSchemaInput("AetherScaleNeuralRendering", neural, [
    "images", "motion", "style", "strength", "local_tone", "local_structure", "skin_structure",
    "reset_on_scene_cut", "history_frames", "safety_margin_mb", "cuda_device", "effect_cache", "cuda_stream",
    "memory_policy", "vram_guard", "min_free_vram_mb", "output_device", "auto_bootstrap"
  ], missingInputs);
  if (motion) {
    const images = schemaInput(motion, "images");
    if (!Array.isArray(images) || images[0] !== "IMAGE") {
      invalidInputs.push("AetherScaleMotionAnalysis.images");
    }
    if (!enumValues(schemaInput(motion, "engine"))?.includes("torch_lk")) invalidInputs.push("AetherScaleMotionAnalysis.engine");
    if (!enumValues(schemaInput(motion, "quality"))?.includes("balanced")) invalidInputs.push("AetherScaleMotionAnalysis.quality");
    if (!Array.isArray(motion.output) || motion.output[0] !== "AETHERSCALE_MOTION") outputMismatch.push("AetherScaleMotionAnalysis.output");
  }
  if (neural) {
    const images = schemaInput(neural, "images");
    const motionInput = schemaInput(neural, "motion");
    if (!Array.isArray(images) || images[0] !== "IMAGE") invalidInputs.push("AetherScaleNeuralRendering.images");
    if (!Array.isArray(motionInput) || motionInput[0] !== "AETHERSCALE_MOTION") invalidInputs.push("AetherScaleNeuralRendering.motion");
    if (!enumValues(schemaInput(neural, "backend"))?.includes("carrier")) invalidInputs.push("AetherScaleNeuralRendering.backend");
    if (!enumValues(schemaInput(neural, "upscale_mode"))?.includes("performance_2x")) invalidInputs.push("AetherScaleNeuralRendering.upscale_mode");
    if (!Array.isArray(neural.output) || neural.output[0] !== "IMAGE" || neural.output[1] !== "STRING") outputMismatch.push("AetherScaleNeuralRendering.output");
  }
  if (missingNodes.length) errors.push(`missing nodes: ${missingNodes.join(", ")}`);
  if (missingInputs.length) errors.push(`missing inputs: ${missingInputs.join(", ")}`);
  if (invalidInputs.length) errors.push(`invalid inputs: ${invalidInputs.join(", ")}`);
  if (outputMismatch.length) errors.push(`invalid outputs: ${outputMismatch.join(", ")}`);
  return { valid: errors.length === 0, missingNodes, missingInputs, invalidInputs, outputMismatch, errors };
}

export function assertAetherScaleObjectInfoSchema(objectInfo: unknown): void {
  const result = validateAetherScaleObjectInfoSchema(objectInfo);
  if (!result.valid) throw new Error(`AetherScale object_info schema mismatch: ${result.errors.join("; ")}`);
}

function inputValue(node: AetherScaleApiNode | undefined, name: string): unknown {
  return node?.inputs?.[name];
}

function sameConnection(value: unknown, nodeId: string, outputIndex: number): boolean {
  return Array.isArray(value) && value.length === 2 && value[0] === nodeId && value[1] === outputIndex;
}

function validateConnection(
  value: unknown,
  label: string,
  workflow: AetherScaleApiWorkflow,
  invalidEdges: string[],
  outputArities: Record<string, number>
): void {
  if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== "string" ||
      !Number.isSafeInteger(value[1]) || Number(value[1]) < 0) {
    invalidEdges.push(`${label} is not a valid API connection`);
    return;
  }
  const nodeId = value[0];
  const outputIndex = Number(value[1]);
  if (!workflow[nodeId]) invalidEdges.push(`${label} references missing node ${nodeId}`);
  else if (outputArities[nodeId] !== undefined && outputIndex >= outputArities[nodeId]!) {
    invalidEdges.push(`${label} references ${nodeId}:${outputIndex}, but that output does not exist`);
  }
}

function expectedLiteral(
  workflow: AetherScaleApiWorkflow,
  nodeId: string,
  inputName: string,
  expected: unknown,
  invalidInputs: string[]
): void {
  if (inputValue(workflow[nodeId], inputName) !== expected) {
    invalidInputs.push(`${nodeId}.${inputName} must be ${JSON.stringify(expected)}`);
  }
}

export function validateAetherScaleWorkflow(
  workflow: unknown,
  objectInfo?: unknown
): AetherScaleWorkflowValidation {
  const missingNodes: string[] = [];
  const invalidEdges: string[] = [];
  const invalidInputs: string[] = [];
  const outputMismatch: string[] = [];
  const errors: string[] = [];
  const graph = isRecord(workflow) ? workflow as AetherScaleApiWorkflow : undefined;
  if (!graph) errors.push("workflow must be an API-format node graph");
  else {
    const expectedNodes: Record<string, string> = {
      "1": "VHS_LoadVideo",
      "2": "AetherScaleMotionAnalysis",
      "3": "AetherScaleNeuralRendering",
      "4": "VHS_VideoCombine"
    };
    for (const [nodeId, classType] of Object.entries(expectedNodes)) {
      const node = graph[nodeId];
      if (!node || !isRecord(node)) missingNodes.push(classType);
      else if (node.class_type !== classType) invalidInputs.push(`${nodeId}.class_type must be ${classType}`);
      else if (!isRecord(node.inputs)) invalidInputs.push(`${nodeId}.inputs must be an object`);
    }
    for (const nodeType of AETHERSCALE_REQUIRED_WORKFLOW_NODE_TYPES) {
      if (!Object.values(graph).some((node) => isRecord(node) && node.class_type === nodeType)) {
        if (!missingNodes.includes(nodeType)) missingNodes.push(nodeType);
      }
    }
    for (const [nodeId, node] of Object.entries(graph)) {
      if (!isRecord(node) || !isRecord(node.inputs)) continue;
      for (const [inputName, value] of Object.entries(node.inputs)) {
        if (Array.isArray(value) && (value.length === 2 || typeof value[0] === "string")) {
          validateConnection(value, `${nodeId}.${inputName}`, graph, invalidEdges, { "1": 4, "2": 3, "3": 2 });
        }
      }
      if (typeof node.class_type === "string" && AETHERSCALE_FORBIDDEN_WORKFLOW_NODE_TYPES.includes(node.class_type as typeof AETHERSCALE_FORBIDDEN_WORKFLOW_NODE_TYPES[number])) {
        invalidInputs.push(`${nodeId}.${node.class_type} is not allowed in the production carrier graph`);
      }
      if (typeof node.class_type === "string" && node.class_type.startsWith("AetherScale") &&
          !["AetherScaleMotionAnalysis", "AetherScaleNeuralRendering"].includes(node.class_type)) {
        invalidInputs.push(`${nodeId}.${node.class_type} is not allowed in the production carrier graph`);
      }
    }
    const load = graph["1"];
    const motion = graph["2"];
    const neural = graph["3"];
    const combine = graph["4"];
    if (load?.class_type === "VHS_LoadVideo" && isRecord(load.inputs) && !isSafeRelativeComfyPath(inputValue(load, "video"))) {
      invalidInputs.push("1.video must be a safe uploaded relative path");
    }
    if (motion?.class_type === "AetherScaleMotionAnalysis" && isRecord(motion.inputs)) {
      if (!sameConnection(inputValue(motion, "images"), "1", 0)) invalidInputs.push("2.images must use 1:0");
      expectedLiteral(graph, "2", "engine", "torch_lk", invalidInputs);
      expectedLiteral(graph, "2", "quality", "balanced", invalidInputs);
      expectedLiteral(graph, "2", "scene_cut_threshold", AETHERSCALE_DEFAULT_SCENE_CUT_THRESHOLD, invalidInputs);
      expectedLiteral(graph, "2", "reset_on_scene_cut", true, invalidInputs);
      expectedLiteral(graph, "2", "output_device", "cpu_safe", invalidInputs);
      expectedLiteral(graph, "2", "motion_mode", "compact_flow", invalidInputs);
      expectedLiteral(graph, "2", "analysis_long_edge", 512, invalidInputs);
      expectedLiteral(graph, "2", "storage_precision", "float16", invalidInputs);
      expectedLiteral(graph, "2", "preview_frames", 1, invalidInputs);
    }
    if (neural?.class_type === "AetherScaleNeuralRendering" && isRecord(neural.inputs)) {
      if (!sameConnection(inputValue(neural, "images"), "1", 0)) invalidInputs.push("3.images must use 1:0");
      if (!sameConnection(inputValue(neural, "motion"), "2", 0)) invalidInputs.push("3.motion must use 2:0");
      expectedLiteral(graph, "3", "backend", "carrier", invalidInputs);
      expectedLiteral(graph, "3", "motion_source", "connected_motion", invalidInputs);
      expectedLiteral(graph, "3", "auto_bootstrap", false, invalidInputs);
      expectedLiteral(graph, "3", "output_device", "cpu_safe", invalidInputs);
      expectedLiteral(graph, "3", "output_precision", "float16", invalidInputs);
      expectedLiteral(graph, "3", "output_storage", "auto", invalidInputs);
      expectedLiteral(graph, "3", "clean_cache", true, invalidInputs);
      if (!isAetherScaleMode(inputValue(neural, "upscale_mode"))) invalidInputs.push("3.upscale_mode is invalid");
      if (!isSafeRelativeComfyPath(inputValue(neural, "carrier_gpu")) && inputValue(neural, "carrier_gpu") !== "windows_high_performance") {
        invalidInputs.push("3.carrier_gpu must use the Windows high-performance selector");
      }
    }
    if (combine?.class_type === "VHS_VideoCombine" && isRecord(combine.inputs)) {
      if (!sameConnection(inputValue(combine, "images"), "3", 0)) invalidInputs.push("4.images must use 3:0");
      if (!sameConnection(inputValue(combine, "audio"), "1", 2)) invalidInputs.push("4.audio must use 1:2");
      const frameRate = inputValue(combine, "frame_rate");
      if (typeof frameRate !== "number" || !Number.isFinite(frameRate) || frameRate <= 0) invalidInputs.push("4.frame_rate must be positive");
      if (!isSafeRelativeComfyPath(inputValue(combine, "filename_prefix"))) invalidInputs.push("4.filename_prefix must be a safe relative output prefix");
      expectedLiteral(graph, "4", "format", "video/h264-mp4", invalidInputs);
      expectedLiteral(graph, "4", "save_output", true, invalidInputs);
    }
  }
  if (objectInfo !== undefined) {
    const schema = validateAetherScaleObjectInfoSchema(objectInfo);
    for (const value of schema.missingNodes) if (!missingNodes.includes(value)) missingNodes.push(value);
    invalidInputs.push(...schema.missingInputs, ...schema.invalidInputs);
    outputMismatch.push(...schema.outputMismatch);
    if (!schema.valid) errors.push(`object_info schema: ${schema.errors.join("; ")}`);
  }
  if (missingNodes.length) errors.push(`missing nodes: ${missingNodes.join(", ")}`);
  if (invalidEdges.length) errors.push(`invalid edges: ${invalidEdges.join("; ")}`);
  if (invalidInputs.length) errors.push(`invalid inputs: ${invalidInputs.join("; ")}`);
  if (outputMismatch.length) errors.push(`invalid outputs: ${outputMismatch.join(", ")}`);
  return { valid: errors.length === 0, missingNodes, invalidEdges, invalidInputs, outputMismatch, errors };
}

function styleForProfile(profile: AetherScaleStyleProfile): "natural" | "material_detail" {
  return profile === "enhanced" ? "material_detail" : "natural";
}

export function buildAetherScaleUpscaleWorkflow(
  task: UpscaleQueueTask,
  sourceVideo: string,
  objectInfo: unknown
): AetherScaleApiWorkflow {
  if (task.modelId !== AETHERSCALE_MODEL_ID) throw new Error("AetherScale workflow requires modelId aetherscale-dlss5");
  if (task.targetHeight !== undefined || task.targetScale !== undefined || task.dlss5 !== undefined) {
    throw new Error("AetherScale workflow must not contain HECer or legacy target fields");
  }
  if (!task.aetherScale) throw new Error("AetherScale workflow is missing its immutable options snapshot");
  const target = normalizeAetherScaleTarget({
    modelId: task.modelId,
    sourceWidth: task.sourceWidth,
    sourceHeight: task.sourceHeight,
    targetWidth: task.targetWidth,
    targetOutputHeight: task.targetOutputHeight,
    aetherScale: task.aetherScale
  });
  if (task.targetWidth !== target.targetWidth || task.targetOutputHeight !== target.targetOutputHeight) {
    throw new Error("AetherScale task geometry does not match its frozen source mode");
  }
  assertAetherScaleObjectInfoSchema(objectInfo);
  const filenamePrefix = typeof task.outputFilename === "string"
    ? task.outputFilename.replace(/\.mp4$/iu, "")
    : "";
  const graph: AetherScaleApiWorkflow = {
    "1": {
      class_type: "VHS_LoadVideo",
      inputs: {
        video: sourceVideo,
        force_rate: 0,
        custom_width: 0,
        custom_height: 0,
        frame_load_cap: 0,
        skip_first_frames: 0,
        select_every_nth: 1,
        format: "AnimateDiff"
      }
    },
    "2": {
      class_type: "AetherScaleMotionAnalysis",
      inputs: {
        images: ["1", 0],
        engine: "torch_lk",
        quality: "balanced",
        scene_cut_threshold: target.aetherScale.sceneCutThreshold,
        reset_on_scene_cut: true,
        cuda_device: 0,
        output_device: "cpu_safe",
        motion_mode: "compact_flow",
        analysis_long_edge: 512,
        storage_precision: "float16",
        preview_frames: 1
      }
    },
    "3": {
      class_type: "AetherScaleNeuralRendering",
      inputs: {
        images: ["1", 0],
        motion: ["2", 0],
        style: styleForProfile(target.aetherScale.styleProfile),
        strength: 0.75,
        local_tone: 1,
        local_structure: 1,
        skin_structure: 1,
        reset_on_scene_cut: true,
        history_frames: 2,
        safety_margin_mb: 2048,
        cuda_device: 0,
        effect_cache: "single",
        cuda_stream: "current",
        memory_policy: "performance",
        vram_guard: "auto",
        min_free_vram_mb: 2048,
        output_device: "cpu_safe",
        auto_bootstrap: false,
        preset: 3,
        output_precision: "float16",
        output_storage: "auto",
        clean_cache: true,
        backend: "carrier",
        upscale_mode: target.aetherScale.mode,
        motion_source: "connected_motion",
        carrier_warmup_frames: target.aetherScale.warmupFrames,
        carrier_scene_cut_threshold: target.aetherScale.sceneCutThreshold,
        carrier_gpu: "windows_high_performance"
      }
    },
    "4": {
      class_type: "VHS_VideoCombine",
      inputs: {
        images: ["3", 0],
        frame_rate: task.fps,
        loop_count: 0,
        filename_prefix: filenamePrefix,
        format: "video/h264-mp4",
        pingpong: false,
        save_output: true,
        audio: ["1", 2]
      }
    }
  };
  const validation = validateAetherScaleWorkflow(graph, objectInfo);
  if (!validation.valid) throw new Error(`AetherScale workflow validation failed: ${validation.errors.join("; ")}`);
  return graph;
}
