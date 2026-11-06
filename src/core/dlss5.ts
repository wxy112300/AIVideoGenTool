import { createTranslator, type Translate } from "./i18n.js";
import { uiKeys } from "./i18n-keys.js";
import {
  DLSS5_NODE_REVISION,
  DLSS5_RUNTIME_BUNDLE_ID
} from "./catalog/dependencies/dlss5.js";
import type {
  Dlss5GuideProfile,
  Dlss5Quality,
  Dlss5Scale,
  Dlss5UpscaleOptions,
  UpscaleQueueTask,
  UpscaleTargetHeight
} from "../types.js";

export const DLSS5_MODEL_ID = "dlss5-sr" as const;
export const DLSS5_SCALE_VALUES = [2, 3, 4] as const satisfies readonly Dlss5Scale[];
export const DLSS5_QUALITY_VALUES = ["quality", "balanced", "performance"] as const satisfies readonly Dlss5Quality[];
export const DLSS5_GUIDE_PROFILE: Dlss5GuideProfile = "depth-anything-v2-small-farneback";
export const DLSS5_SR_SCALE_ENUM = ["2x", "3x", "4x"] as const;
export const DLSS5_SR_QUALITY_ENUM = ["Quality", "Balanced", "Performance"] as const;
export const DLSS5_DEPTH_MODEL = "Small (recommended)" as const;
export const DLSS5_REQUIRED_WORKFLOW_NODE_TYPES = [
  "VHS_LoadVideo",
  "DLSS5DepthAnythingV2",
  "DLSS5OpticalFlow",
  "DLSSSuperResolution",
  "VHS_VideoCombine"
] as const;
export const UPSCALE_TARGET_HEIGHT_VALUES = [720, 768, 1080, 1440, 2160] as const satisfies readonly UpscaleTargetHeight[];

export const DEFAULT_DLSS5_UPSCALE_OPTIONS: Dlss5UpscaleOptions = {
  operation: "super-resolution",
  scale: 2,
  quality: "quality",
  guideProfile: DLSS5_GUIDE_PROFILE,
  nodeRevision: DLSS5_NODE_REVISION,
  runtimeBundleId: DLSS5_RUNTIME_BUNDLE_ID
};

export interface Dlss5TargetInput {
  modelId: string;
  sourceWidth: number;
  sourceHeight: number;
  targetHeight?: unknown;
  targetScale?: unknown;
  dlss5?: unknown;
}

export interface Dlss5OutputGeometry {
  width: number;
  height: number;
  scale: Dlss5Scale;
}

export type NormalizedUpscaleTarget =
  | {
      provider: "legacy";
      modelId: string;
      targetHeight: UpscaleTargetHeight;
    }
  | {
      provider: "dlss5";
      modelId: "dlss5-sr";
      sourceWidth: number;
      sourceHeight: number;
      scale: Dlss5Scale;
      targetScale: Dlss5Scale;
      dlss5: Dlss5UpscaleOptions;
      targetWidth: number;
      targetOutputHeight: number;
      width: number;
      height: number;
    };

export interface Dlss5SchemaValidation {
  valid: boolean;
  missingNodes: string[];
  missingInputs: string[];
  invalidInputs: string[];
  outputMismatch: string[];
  errors: string[];
}

export interface Dlss5ApiNode {
  class_type: string;
  inputs: Record<string, unknown>;
}

export type Dlss5ApiWorkflow = Record<string, Dlss5ApiNode>;

export interface Dlss5WorkflowValidation {
  valid: boolean;
  missingNodes: string[];
  invalidEdges: string[];
  invalidInputs: string[];
  outputMismatch: string[];
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function positiveInteger(value: unknown, label: string,
  t: Translate = createTranslator().t): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(t(uiKeys.upscaleChecks.positiveInteger, { label: label }));
  }
  return Number(value);
}

export function isDlss5Scale(value: unknown): value is Dlss5Scale {
  return DLSS5_SCALE_VALUES.includes(value as Dlss5Scale);
}

export function isDlss5Quality(value: unknown): value is Dlss5Quality {
  return DLSS5_QUALITY_VALUES.includes(value as Dlss5Quality);
}

export function isUpscaleTargetHeight(value: unknown): value is UpscaleTargetHeight {
  return UPSCALE_TARGET_HEIGHT_VALUES.includes(value as UpscaleTargetHeight);
}

/**
 * Transitional guard for the existing pixel/H3 execution paths. Phase A
 * makes the legacy field optional so a DLSS snapshot cannot use it by type
 * accident; old paths still receive the same required short-edge value.
 */
export function requireLegacyUpscaleTargetHeight(value: unknown,
  t: Translate = createTranslator().t): UpscaleTargetHeight {
  if (!isUpscaleTargetHeight(value)) {
    throw new Error(t(uiKeys.upscaleChecks.legacyHeight));
  }
  return value;
}

export function normalizeDlss5Options(value: unknown,
  t: Translate = createTranslator().t): Dlss5UpscaleOptions {
  if (!isRecord(value)) throw new Error(t(uiKeys.upscaleChecks.dlssOptions));
  if (value.operation !== "super-resolution") {
    throw new Error(t(uiKeys.upscaleChecks.dlssOperation));
  }
  if (!isDlss5Scale(value.scale)) {
    throw new Error(t(uiKeys.upscaleChecks.dlssScale));
  }
  if (!isDlss5Quality(value.quality)) {
    throw new Error(t(uiKeys.upscaleChecks.dlssQuality));
  }
  if (value.guideProfile !== DLSS5_GUIDE_PROFILE) {
    throw new Error(t(uiKeys.upscaleChecks.dlssGuide, { profile: DLSS5_GUIDE_PROFILE }));
  }
  if (value.nodeRevision !== DLSS5_NODE_REVISION) {
    throw new Error(t(uiKeys.upscaleChecks.dlssRevision, { revision: DLSS5_NODE_REVISION }));
  }
  if (value.runtimeBundleId !== DLSS5_RUNTIME_BUNDLE_ID) {
    throw new Error(t(uiKeys.upscaleChecks.dlssBundle, { bundle: DLSS5_RUNTIME_BUNDLE_ID }));
  }
  return {
    operation: "super-resolution",
    scale: value.scale,
    quality: value.quality,
    guideProfile: DLSS5_GUIDE_PROFILE,
    nodeRevision: value.nodeRevision,
    runtimeBundleId: DLSS5_RUNTIME_BUNDLE_ID
  };
}

export const normalizeDlss5UpscaleOptions = normalizeDlss5Options;

export function isDlss5UpscaleOptions(value: unknown,
  t: Translate = createTranslator().t): value is Dlss5UpscaleOptions {
  try {
    normalizeDlss5Options(value, t);
    return true;
  } catch {
    return false;
  }
}

export function dlss5OutputGeometry(
  sourceWidth: unknown,
  sourceHeight: unknown,
  scale: unknown,
  t: Translate = createTranslator().t
): Dlss5OutputGeometry {
  const width = positiveInteger(sourceWidth, "sourceWidth", t);
  const height = positiveInteger(sourceHeight, "sourceHeight", t);
  if (!isDlss5Scale(scale)) throw new Error(t(uiKeys.upscaleChecks.dlssScale));
  const outputWidth = width * scale;
  const outputHeight = height * scale;
  if (!Number.isSafeInteger(outputWidth) || !Number.isSafeInteger(outputHeight)) {
    throw new Error(t(uiKeys.upscaleChecks.dlssGeometry));
  }
  return { width: outputWidth, height: outputHeight, scale };
}

export function dlss5OutputDimensions(
  sourceWidth: unknown,
  sourceHeight: unknown,
  scale: unknown,
  t: Translate = createTranslator().t
): [number, number] {
  const geometry = dlss5OutputGeometry(sourceWidth, sourceHeight, scale, t);
  return [geometry.width, geometry.height];
}

export const dlss5Geometry = dlss5OutputGeometry;

export function normalizeUpscaleTarget(input: Dlss5TargetInput,
  t: Translate = createTranslator().t): NormalizedUpscaleTarget {
  if (!isRecord(input)) throw new Error(t(uiKeys.upscaleChecks.targetObject));
  const hasDlssFields = input.targetScale !== undefined || input.dlss5 !== undefined;
  if (input.modelId === "dlss5-sr" || hasDlssFields) {
    if (input.modelId !== "dlss5-sr") {
      throw new Error(t(uiKeys.upscaleChecks.dlssTargetModel));
    }
    if (input.targetHeight !== undefined) {
      throw new Error(t(uiKeys.upscaleChecks.dlssLegacyTarget));
    }
    if (!isDlss5Scale(input.targetScale)) {
      throw new Error(t(uiKeys.upscaleChecks.dlssTargetScale));
    }
    const dlss5 = normalizeDlss5Options(input.dlss5, t);
    if (dlss5.scale !== input.targetScale) {
      throw new Error(t(uiKeys.upscaleChecks.dlssScaleMatch));
    }
    const geometry = dlss5OutputGeometry(input.sourceWidth, input.sourceHeight, input.targetScale, t);
    return {
      provider: "dlss5",
      modelId: "dlss5-sr",
      sourceWidth: positiveInteger(input.sourceWidth, "sourceWidth", t),
      sourceHeight: positiveInteger(input.sourceHeight, "sourceHeight", t),
      scale: input.targetScale,
      targetScale: input.targetScale,
      dlss5,
      targetWidth: geometry.width,
      targetOutputHeight: geometry.height,
      width: geometry.width,
      height: geometry.height
    };
  }
  const targetHeight = requireLegacyUpscaleTargetHeight(input.targetHeight, t);
  return {
    provider: "legacy",
    modelId: input.modelId,
    targetHeight
  };
}

export const normalizeDlss5Target = normalizeUpscaleTarget;
export const normalizeUpscaleRequestTarget = normalizeUpscaleTarget;

function valuesForInput(node: Record<string, unknown>, name: string): unknown {
  const input = isRecord(node.input) ? node.input : undefined;
  const required = input && isRecord(input.required) ? input.required : undefined;
  return required?.[name];
}

function enumValues(value: unknown): unknown[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return Array.isArray(value[0]) ? value[0] : undefined;
}

function nodeInfoFor(objectInfo: unknown, nodeType: string): Record<string, unknown> | undefined {
  return isRecord(objectInfo) && isRecord(objectInfo[nodeType]) ? objectInfo[nodeType] : undefined;
}

function addUnique(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
}

function validateGuideNodeSchema(
  nodeType: "DLSS5DepthAnythingV2" | "DLSS5OpticalFlow",
  node: Record<string, unknown> | undefined,
  missingInputs: string[],
  invalidInputs: string[],
  outputMismatch: string[]
): void {
  if (!node) return;
  const requiredInputs = nodeType === "DLSS5DepthAnythingV2"
    ? ["images", "model", "temporal_normalization", "chunk_size"]
    : ["images", "pyramid_scale", "levels", "window_size"];
  for (const inputName of requiredInputs) {
    if (valuesForInput(node, inputName) === undefined) {
      missingInputs.push(`${nodeType}.${inputName}`);
    }
  }
  const images = valuesForInput(node, "images");
  if (!Array.isArray(images) || images[0] !== "IMAGE") {
    invalidInputs.push(`${nodeType}.images`);
  }
  if (nodeType === "DLSS5DepthAnythingV2") {
    const models = enumValues(valuesForInput(node, "model"));
    if (!models || !models.includes(DLSS5_DEPTH_MODEL)) {
      invalidInputs.push(`${nodeType}.model`);
    }
    const temporalNormalization = valuesForInput(node, "temporal_normalization");
    if (!Array.isArray(temporalNormalization) || temporalNormalization[0] !== "BOOLEAN") {
      invalidInputs.push(`${nodeType}.temporal_normalization`);
    }
    const chunkSize = valuesForInput(node, "chunk_size");
    if (!Array.isArray(chunkSize) || chunkSize[0] !== "INT") {
      invalidInputs.push(`${nodeType}.chunk_size`);
    }
  } else {
    const pyramidScale = valuesForInput(node, "pyramid_scale");
    if (!Array.isArray(pyramidScale) || pyramidScale[0] !== "FLOAT") {
      invalidInputs.push(`${nodeType}.pyramid_scale`);
    }
    const levels = valuesForInput(node, "levels");
    if (!Array.isArray(levels) || levels[0] !== "INT") {
      invalidInputs.push(`${nodeType}.levels`);
    }
    const windowSize = valuesForInput(node, "window_size");
    if (!Array.isArray(windowSize) || windowSize[0] !== "INT") {
      invalidInputs.push(`${nodeType}.window_size`);
    }
  }
  const output = Array.isArray(node.output) ? node.output : undefined;
  if (!output || output[0] !== "IMAGE") {
    outputMismatch.push(`${nodeType}.output`);
  }
}

export function validateDlss5ObjectInfoSchema(objectInfo: unknown,
  t: Translate = createTranslator().t): Dlss5SchemaValidation {
  const missingNodes: string[] = [];
  const missingInputs: string[] = [];
  const invalidInputs: string[] = [];
  const outputMismatch: string[] = [];
  const errors: string[] = [];
  for (const nodeType of ["DLSSSuperResolution", "DLSS5DepthAnythingV2", "DLSS5OpticalFlow"]) {
    if (!nodeInfoFor(objectInfo, nodeType)) missingNodes.push(nodeType);
  }
  const sr = nodeInfoFor(objectInfo, "DLSSSuperResolution");
  if (sr) {
    for (const inputName of ["image", "depth", "motion_vectors", "scale", "quality"]) {
      if (valuesForInput(sr, inputName) === undefined) missingInputs.push(`DLSSSuperResolution.${inputName}`);
    }
    for (const imageInput of ["image", "depth", "motion_vectors"]) {
      const value = valuesForInput(sr, imageInput);
      if (!Array.isArray(value) || value[0] !== "IMAGE") {
        invalidInputs.push(`DLSSSuperResolution.${imageInput}`);
      }
    }
    const scales = enumValues(valuesForInput(sr, "scale"));
    if (!scales || scales.length !== DLSS5_SR_SCALE_ENUM.length ||
      DLSS5_SR_SCALE_ENUM.some((scale) => !scales.includes(scale))) {
      invalidInputs.push("DLSSSuperResolution.scale");
    }
    const qualities = enumValues(valuesForInput(sr, "quality"));
    if (!qualities || DLSS5_SR_QUALITY_ENUM.some((quality) => !qualities.includes(quality))) {
      invalidInputs.push("DLSSSuperResolution.quality");
    }
    const output = Array.isArray(sr.output) ? sr.output : undefined;
    if (!output || output[0] !== "IMAGE" || output[1] !== "STRING") {
      outputMismatch.push("DLSSSuperResolution.output");
    }
  }
  validateGuideNodeSchema(
    "DLSS5DepthAnythingV2",
    nodeInfoFor(objectInfo, "DLSS5DepthAnythingV2"),
    missingInputs,
    invalidInputs,
    outputMismatch
  );
  validateGuideNodeSchema(
    "DLSS5OpticalFlow",
    nodeInfoFor(objectInfo, "DLSS5OpticalFlow"),
    missingInputs,
    invalidInputs,
    outputMismatch
  );
  if (missingNodes.length) errors.push(t(uiKeys.upscaleChecks.missingNodes, { nodes: missingNodes.join(", ") }));
  if (missingInputs.length) errors.push(t(uiKeys.upscaleChecks.missingInputs, { inputs: missingInputs.join(", ") }));
  if (invalidInputs.length) errors.push(t(uiKeys.upscaleChecks.invalidInputs, { inputs: invalidInputs.join(", ") }));
  if (outputMismatch.length) errors.push(t(uiKeys.upscaleChecks.invalidOutputs, { outputs: outputMismatch.join(", ") }));
  return {
    valid: errors.length === 0,
    missingNodes,
    missingInputs,
    invalidInputs,
    outputMismatch,
    errors
  };
}

export const validateDlss5Schema = validateDlss5ObjectInfoSchema;

export function assertDlss5ObjectInfoSchema(objectInfo: unknown,
  t: Translate = createTranslator().t): void {
  const result = validateDlss5ObjectInfoSchema(objectInfo, t);
  if (!result.valid) throw new Error(t(uiKeys.upscaleChecks.dlssSchema, { errors: result.errors.join("; ") }));
}

export const assertDlss5Schema = assertDlss5ObjectInfoSchema;

export function isSafeRelativeComfyPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) return false;
  if (value.startsWith("/") || value.startsWith("\\") || /^[a-z]:/iu.test(value)) return false;
  if (value.includes("\\")) return false;
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function inputValue(node: Dlss5ApiNode | undefined, name: string): unknown {
  return node?.inputs?.[name];
}

function sameConnection(value: unknown, nodeId: string, outputIndex: number): boolean {
  return Array.isArray(value) && value.length === 2 && value[0] === nodeId && value[1] === outputIndex;
}

function validateConnection(
  value: unknown,
  label: string,
  workflow: Dlss5ApiWorkflow,
  invalidEdges: string[],
  outputArities: Record<string, number>,
  t: Translate = createTranslator().t
): void {
  if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== "string" ||
      !Number.isSafeInteger(value[1]) || Number(value[1]) < 0) {
    invalidEdges.push(t(uiKeys.upscaleChecks.connectionInvalid, { label: label }));
    return;
  }
  const nodeId = value[0];
  const outputIndex = Number(value[1]);
  if (!workflow[nodeId]) {
    invalidEdges.push(t(uiKeys.upscaleChecks.connectionMissing, { label: label, node: nodeId }));
    return;
  }
  const arity = outputArities[nodeId];
  if (arity !== undefined && outputIndex >= arity) {
    invalidEdges.push(t(uiKeys.upscaleChecks.connectionOutput, { label: label, node: nodeId, index: outputIndex }));
  }
}

function expectedLiteral(
  workflow: Dlss5ApiWorkflow,
  nodeId: string,
  inputName: string,
  expected: unknown,
  invalidInputs: string[],
  t: Translate = createTranslator().t
): void {
  if (inputValue(workflow[nodeId], inputName) !== expected) {
    invalidInputs.push(t(uiKeys.upscaleChecks.literalRequired, { node: nodeId, input: inputName, value: JSON.stringify(expected) }));
  }
}

export function validateDlss5Workflow(
  workflow: unknown,
  objectInfo?: unknown,
  t: Translate = createTranslator().t
): Dlss5WorkflowValidation {
  const missingNodes: string[] = [];
  const invalidEdges: string[] = [];
  const invalidInputs: string[] = [];
  const outputMismatch: string[] = [];
  const errors: string[] = [];
  const graph = isRecord(workflow) ? workflow as Dlss5ApiWorkflow : undefined;

  if (!graph) {
    errors.push(t(uiKeys.upscaleChecks.apiGraph));
  } else {
    const expectedNodes: Record<string, string> = {
      "1": "VHS_LoadVideo",
      "2": "DLSS5DepthAnythingV2",
      "3": "DLSS5OpticalFlow",
      "4": "DLSSSuperResolution",
      "5": "VHS_VideoCombine"
    };
    for (const [nodeId, classType] of Object.entries(expectedNodes)) {
      const node = graph[nodeId];
      if (!node || !isRecord(node)) {
        addUnique(missingNodes, classType);
      } else if (node.class_type !== classType) {
        invalidInputs.push(t(uiKeys.upscaleChecks.classRequired, { node: nodeId, type: classType }));
      } else if (!isRecord(node.inputs)) {
        invalidInputs.push(t(uiKeys.upscaleChecks.inputsObject, { node: nodeId }));
      }
    }
    for (const classType of DLSS5_REQUIRED_WORKFLOW_NODE_TYPES) {
      if (!Object.values(graph).some((node) => isRecord(node) && node.class_type === classType)) {
        addUnique(missingNodes, classType);
      }
    }

    const outputArities = { "1": 4, "2": 1, "3": 1, "4": 2 };
    for (const [nodeId, node] of Object.entries(graph)) {
      if (!isRecord(node) || !isRecord(node.inputs)) continue;
      for (const [inputName, value] of Object.entries(node.inputs)) {
        if (Array.isArray(value) && (value.length === 2 || typeof value[0] === "string")) {
          validateConnection(value, `${nodeId}.${inputName}`, graph, invalidEdges, outputArities, t);
        }
      }
    }

    const load = graph["1"];
    const depth = graph["2"];
    const flow = graph["3"];
    const sr = graph["4"];
    const combine = graph["5"];
    if (load?.class_type === "VHS_LoadVideo" && isRecord(load.inputs)) {
      const source = inputValue(load, "video");
      if (!isSafeRelativeComfyPath(source)) invalidInputs.push(t(uiKeys.upscaleChecks.dlssVideoPath));
    }
    if (depth?.class_type === "DLSS5DepthAnythingV2" && isRecord(depth.inputs)) {
      if (!sameConnection(inputValue(depth, "images"), "1", 0)) invalidInputs.push(t(uiKeys.upscaleChecks.dlssDepthImages));
      expectedLiteral(graph, "2", "model", DLSS5_DEPTH_MODEL, invalidInputs, t);
      expectedLiteral(graph, "2", "temporal_normalization", true, invalidInputs, t);
      expectedLiteral(graph, "2", "chunk_size", 4, invalidInputs, t);
    }
    if (flow?.class_type === "DLSS5OpticalFlow" && isRecord(flow.inputs)) {
      if (!sameConnection(inputValue(flow, "images"), "1", 0)) invalidInputs.push(t(uiKeys.upscaleChecks.dlssFlowImages));
      expectedLiteral(graph, "3", "pyramid_scale", 0.5, invalidInputs, t);
      expectedLiteral(graph, "3", "levels", 5, invalidInputs, t);
      expectedLiteral(graph, "3", "window_size", 21, invalidInputs, t);
    }
    if (sr?.class_type === "DLSSSuperResolution" && isRecord(sr.inputs)) {
      if (!sameConnection(inputValue(sr, "image"), "1", 0)) invalidInputs.push(t(uiKeys.upscaleChecks.dlssImage));
      if (!sameConnection(inputValue(sr, "depth"), "2", 0)) invalidInputs.push(t(uiKeys.upscaleChecks.dlssDepth));
      if (!sameConnection(inputValue(sr, "motion_vectors"), "3", 0)) invalidInputs.push(t(uiKeys.upscaleChecks.dlssMotion));
      if (!DLSS5_SR_SCALE_ENUM.includes(inputValue(sr, "scale") as typeof DLSS5_SR_SCALE_ENUM[number])) {
        invalidInputs.push(t(uiKeys.upscaleChecks.dlssNodeScale));
      }
      if (!DLSS5_SR_QUALITY_ENUM.includes(inputValue(sr, "quality") as typeof DLSS5_SR_QUALITY_ENUM[number])) {
        invalidInputs.push(t(uiKeys.upscaleChecks.dlssNodeQuality));
      }
    }
    if (combine?.class_type === "VHS_VideoCombine" && isRecord(combine.inputs)) {
      if (!sameConnection(inputValue(combine, "images"), "4", 0)) invalidInputs.push(t(uiKeys.upscaleChecks.dlssOutputImages));
      if (!sameConnection(inputValue(combine, "audio"), "1", 2)) invalidInputs.push(t(uiKeys.upscaleChecks.dlssOutputAudio));
      const frameRate = inputValue(combine, "frame_rate");
      if (typeof frameRate !== "number" || !Number.isFinite(frameRate) || frameRate <= 0) {
        invalidInputs.push(t(uiKeys.upscaleChecks.dlssOutputFps));
      }
      if (!isSafeRelativeComfyPath(inputValue(combine, "filename_prefix"))) {
        invalidInputs.push(t(uiKeys.upscaleChecks.dlssOutputPrefix));
      }
      expectedLiteral(graph, "5", "format", "video/h264-mp4", invalidInputs, t);
      expectedLiteral(graph, "5", "save_output", true, invalidInputs, t);
    }
    for (const [nodeId, node] of Object.entries(graph)) {
      if (isRecord(node) && (node.class_type === "ImageScale" || node.class_type === "VRAM_Debug")) {
        invalidInputs.push(t(uiKeys.upscaleChecks.dlssForbidden, { node: nodeId, type: node.class_type }));
      }
    }
  }

  if (objectInfo !== undefined) {
    const schema = validateDlss5ObjectInfoSchema(objectInfo, t);
    for (const value of schema.missingNodes) addUnique(missingNodes, value);
    invalidInputs.push(...schema.missingInputs, ...schema.invalidInputs);
    outputMismatch.push(...schema.outputMismatch);
    if (!schema.valid) errors.push(t(uiKeys.upscaleChecks.schemaErrors, { errors: schema.errors.join("; ") }));
  }
  if (missingNodes.length) errors.push(t(uiKeys.upscaleChecks.missingNodes, { nodes: missingNodes.join(", ") }));
  if (invalidEdges.length) errors.push(t(uiKeys.upscaleChecks.invalidEdges, { edges: invalidEdges.join("; ") }));
  if (invalidInputs.length) errors.push(t(uiKeys.upscaleChecks.invalidInputs, { inputs: invalidInputs.join("; ") }));
  if (outputMismatch.length) errors.push(t(uiKeys.upscaleChecks.invalidOutputs, { outputs: outputMismatch.join(", ") }));
  return {
    valid: errors.length === 0,
    missingNodes,
    invalidEdges,
    invalidInputs,
    outputMismatch,
    errors
  };
}

function dlss5NodeQualityFor(quality: Dlss5Quality): typeof DLSS5_SR_QUALITY_ENUM[number] {
  return quality === "quality" ? "Quality" : quality === "balanced" ? "Balanced" : "Performance";
}

export function buildDlss5UpscaleWorkflow(
  task: UpscaleQueueTask,
  sourceVideo: string,
  objectInfo: unknown,
  t: Translate = createTranslator().t
): Dlss5ApiWorkflow {
  if (task.modelId !== DLSS5_MODEL_ID) throw new Error(t(uiKeys.upscaleChecks.dlssWorkflowModel));
  if (task.targetHeight !== undefined) throw new Error(t(uiKeys.upscaleChecks.dlssWorkflowLegacy));
  if (!task.dlss5 || task.targetScale === undefined) {
    throw new Error(t(uiKeys.upscaleChecks.dlssSnapshot));
  }
  const target = normalizeUpscaleTarget({
    modelId: task.modelId,
    sourceWidth: task.sourceWidth,
    sourceHeight: task.sourceHeight,
    targetScale: task.targetScale,
    dlss5: task.dlss5
  }, t);
  if (target.provider !== "dlss5") throw new Error(t(uiKeys.upscaleChecks.dlssNormalize));
  if (task.targetWidth !== target.targetWidth || task.targetOutputHeight !== target.targetOutputHeight) {
    throw new Error(t(uiKeys.upscaleChecks.dlssFrozenSize));
  }
  assertDlss5ObjectInfoSchema(objectInfo, t);
  const filenamePrefix = typeof task.outputFilename === "string"
    ? task.outputFilename.replace(/\.mp4$/i, "")
    : "";
  const workflow: Dlss5ApiWorkflow = {
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
      class_type: "DLSS5DepthAnythingV2",
      inputs: {
        images: ["1", 0],
        model: DLSS5_DEPTH_MODEL,
        temporal_normalization: true,
        chunk_size: 4
      }
    },
    "3": {
      class_type: "DLSS5OpticalFlow",
      inputs: {
        images: ["1", 0],
        pyramid_scale: 0.5,
        levels: 5,
        window_size: 21
      }
    },
    "4": {
      class_type: "DLSSSuperResolution",
      inputs: {
        image: ["1", 0],
        depth: ["2", 0],
        motion_vectors: ["3", 0],
        scale: `${target.scale}x`,
        quality: dlss5NodeQualityFor(target.dlss5.quality)
      }
    },
    "5": {
      class_type: "VHS_VideoCombine",
      inputs: {
        images: ["4", 0],
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
  const validation = validateDlss5Workflow(workflow, objectInfo, t);
  if (!validation.valid) throw new Error(t(uiKeys.upscaleChecks.dlssWorkflowInvalid, { errors: validation.errors.join("; ") }));
  return workflow;
}
