import { createTranslator, type Translate } from "./i18n.js";
import { uiKeys } from "./i18n-keys.js";
import type {
  KonohamaruDlss5Mode,
  KonohamaruDlssEngine,
  KonohamaruDlssModelPreset,
  KonohamaruFrameOutputFps,
  KonohamaruNrPreset,
  KonohamaruNrStyle,
  KonohamaruDlss5Options,
  UpscaleQueueTask
} from "../types.js";
import {
  KONOHAMARU_LEGACY_RUNTIME_BUNDLE_ID,
  KONOHAMARU_NEURAL_UPSTREAM_RUNTIME_BUNDLE_ID,
  KONOHAMARU_NODE_REQUIRED_NODE_TYPES,
  KONOHAMARU_NODE_REVISION,
  KONOHAMARU_RUNTIME_BUNDLE_ID
} from "./catalog/dependencies/konohamaru.js";
import { isSafeRelativeComfyPath } from "./dlss5.js";

export {
  KONOHAMARU_LEGACY_RUNTIME_BUNDLE_ID,
  KONOHAMARU_NEURAL_UPSTREAM_RUNTIME_BUNDLE_ID,
  KONOHAMARU_NODE_REVISION,
  KONOHAMARU_RUNTIME_BUNDLE_ID
} from "./catalog/dependencies/konohamaru.js";

export const KONOHAMARU_MODEL_ID = "dlss5-konohamaru" as const;
export const KONOHAMARU_WORKFLOW_PATH = "builtin:upscale/dlss5-konohamaru" as const;

export const KONOHAMARU_MODE_SPECS = [
  { mode: "native_1x", factor: 1, label: "1× (DLAA / native)", name: "DLAA" },
  { mode: "quality_1_5x", factor: 1.5, label: "1.5× (Quality)", name: "Quality" },
  { mode: "balanced_1_724x", factor: 1.724, label: "1.724× (Balanced)", name: "Balanced" },
  { mode: "performance_2x", factor: 2, label: "2× (Performance)", name: "Performance" },
  { mode: "ultra_performance_3x", factor: 3, label: "3× (Ultra Performance)", name: "Ultra Performance" }
] as const satisfies ReadonlyArray<{
  mode: KonohamaruDlss5Mode;
  factor: number;
  label: string;
  name: string;
}>;

export const KONOHAMARU_DEFAULT_MODE: KonohamaruDlss5Mode = "quality_1_5x";
export const KONOHAMARU_DEFAULT_NR_STYLE: KonohamaruNrStyle = "Natural";
export const KONOHAMARU_FRAME_FPS_VALUES = [60, 120] as const satisfies readonly KonohamaruFrameOutputFps[];
export const KONOHAMARU_NR_PRESETS = ["Default", "Preset #1", "Preset #2", "Preset #3"] as const satisfies readonly KonohamaruNrPreset[];
export const KONOHAMARU_NR_STYLES = ["Default", "Natural", "Cinematic"] as const satisfies readonly KonohamaruNrStyle[];
export const KONOHAMARU_DLSS_MODEL_PRESETS = ["Default", "J", "K", "L", "M"] as const satisfies readonly KonohamaruDlssModelPreset[];
export const KONOHAMARU_DLSS_ENGINES = ["Auto", "Native DLSSG", "Cascade"] as const satisfies readonly KonohamaruDlssEngine[];

export interface KonohamaruOutputGeometry {
  width: number;
  height: number;
  factor: number;
  mode: KonohamaruDlss5Mode;
}

export interface KonohamaruTargetInput {
  modelId: string;
  sourceWidth: number;
  sourceHeight: number;
  targetWidth?: unknown;
  targetOutputHeight?: unknown;
  targetHeight?: unknown;
  targetScale?: unknown;
  dlss5?: unknown;
  aetherScale?: unknown;
  konohamaru?: unknown;
}

export interface NormalizedKonohamaruTarget {
  provider: "konohamaru";
  modelId: typeof KONOHAMARU_MODEL_ID;
  sourceWidth: number;
  sourceHeight: number;
  options: KonohamaruDlss5Options;
  targetWidth: number;
  targetOutputHeight: number;
  width: number;
  height: number;
}

export interface KonohamaruSchemaValidation {
  valid: boolean;
  missingNodes: string[];
  missingInputs: string[];
  invalidInputs: string[];
  outputMismatch: string[];
  errors: string[];
}

export interface KonohamaruApiNode {
  class_type: string;
  inputs: Record<string, unknown>;
}

export type KonohamaruApiWorkflow = Record<string, KonohamaruApiNode>;

export interface KonohamaruWorkflowValidation {
  valid: boolean;
  missingNodes: string[];
  invalidEdges: string[];
  invalidInputs: string[];
  outputMismatch: string[];
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(value: unknown, label: string,
  t: Translate = createTranslator().t): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(t(uiKeys.upscaleChecks.positiveInteger, { label: label }));
  }
  return Number(value);
}

function finiteNumberInRange(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  t: Translate = createTranslator().t
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(t(uiKeys.upscaleChecks.numberRange, { label: label, minimum: minimum, maximum: maximum }));
  }
  return value;
}

function enumValue<T extends string>(
  value: unknown,
  values: readonly T[],
  label: string,
  t: Translate = createTranslator().t
): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new Error(t(uiKeys.upscaleChecks.enumInvalid, { label: label }));
  }
  return value as T;
}

export function isKonohamaruMode(value: unknown): value is KonohamaruDlss5Mode {
  return KONOHAMARU_MODE_SPECS.some((spec) => spec.mode === value);
}

export function isKonohamaruNrStyle(value: unknown): value is KonohamaruNrStyle {
  return typeof value === "string" && KONOHAMARU_NR_STYLES.includes(value as KonohamaruNrStyle);
}

export function isKonohamaruFrameOutputFps(value: unknown): value is KonohamaruFrameOutputFps {
  return KONOHAMARU_FRAME_FPS_VALUES.includes(value as KonohamaruFrameOutputFps);
}

export function konohamaruModeSpec(mode: KonohamaruDlss5Mode,
  t: Translate = createTranslator().t) {
  const spec = KONOHAMARU_MODE_SPECS.find((candidate) => candidate.mode === mode);
  if (!spec) throw new Error(t(uiKeys.upscaleChecks.konoMode));
  return spec;
}

function nearestEven(value: number): number {
  return Math.max(2, Math.floor(value / 2 + 0.5) * 2);
}

export function konohamaruOutputGeometry(
  sourceWidth: unknown,
  sourceHeight: unknown,
  mode: unknown,
  t: Translate = createTranslator().t
): KonohamaruOutputGeometry {
  const width = positiveInteger(sourceWidth, "sourceWidth", t);
  const height = positiveInteger(sourceHeight, "sourceHeight", t);
  const normalizedMode = enumValue(mode, KONOHAMARU_MODE_SPECS.map((spec) => spec.mode), "Konohamaru mode", t);
  const spec = konohamaruModeSpec(normalizedMode, t);
  const outputWidth = nearestEven(width * spec.factor);
  const outputHeight = nearestEven(height * spec.factor);
  if (Math.max(outputWidth, outputHeight) > 7680 || Math.min(outputWidth, outputHeight) > 4320) {
    throw new Error(
      t(uiKeys.upscaleChecks.konoBoundary, { width: outputWidth, height: outputHeight })
    );
  }
  return {
    width: outputWidth,
    height: outputHeight,
    factor: spec.factor,
    mode: normalizedMode
  };
}

export function konohamaruOutputDimensions(
  sourceWidth: unknown,
  sourceHeight: unknown,
  mode: unknown,
  t: Translate = createTranslator().t
): [number, number] {
  const geometry = konohamaruOutputGeometry(sourceWidth, sourceHeight, mode, t);
  return [geometry.width, geometry.height];
}

export function konohamaruFrameFpsOptions(sourceFps: number): Array<"off" | KonohamaruFrameOutputFps> {
  const safeSourceFps = Number.isFinite(sourceFps) && sourceFps > 0 ? sourceFps : 24;
  return [
    "off",
    ...KONOHAMARU_FRAME_FPS_VALUES.filter((fps) =>
      fps > safeSourceFps && fps <= safeSourceFps * 6
    )
  ];
}

export function defaultKonohamaruOptions(
  mode: KonohamaruDlss5Mode = KONOHAMARU_DEFAULT_MODE,
  frameInterpolation: boolean = false,
  outputFps: KonohamaruFrameOutputFps = 60,
  nrStyle: KonohamaruNrStyle = KONOHAMARU_DEFAULT_NR_STYLE,
  nrIntensity = 1
): KonohamaruDlss5Options {
  return {
    provider: "konohamaru",
    operation: "video-upscale",
    mode,
    requireNeuralUpscaling: true,
    nrPreset: "Default",
    nrStyle,
    nrIntensity,
    localToneStrength: 1,
    localStructureStrength: 1,
    skinStructureStrength: -1,
    automaticMask: false,
    dlssModelPreset: "Default",
    outputDetailStrength: 1,
    frameInterpolation: {
      enabled: frameInterpolation,
      outputFps,
      dlssEngine: "Auto"
    },
    nodeRevision: KONOHAMARU_NODE_REVISION,
    runtimeBundleId: KONOHAMARU_RUNTIME_BUNDLE_ID
  };
}

export function normalizeKonohamaruOptions(value: unknown,
  t: Translate = createTranslator().t): KonohamaruDlss5Options {
  if (!isRecord(value)) throw new Error(t(uiKeys.upscaleChecks.konoOptions));
  if (value.provider !== "konohamaru") throw new Error(t(uiKeys.upscaleChecks.konoProvider));
  if (value.operation !== "video-upscale") throw new Error(t(uiKeys.upscaleChecks.konoOperation));
  const mode = enumValue(value.mode, KONOHAMARU_MODE_SPECS.map((spec) => spec.mode), "Konohamaru mode", t);
  if (value.requireNeuralUpscaling !== true) {
    throw new Error(t(uiKeys.upscaleChecks.konoNeural));
  }
  const nrPreset = enumValue(value.nrPreset, KONOHAMARU_NR_PRESETS, "Konohamaru NR preset", t);
  const nrStyle = enumValue(value.nrStyle, KONOHAMARU_NR_STYLES, "Konohamaru NR style", t);
  const dlssModelPreset = enumValue(value.dlssModelPreset, KONOHAMARU_DLSS_MODEL_PRESETS, "Konohamaru DLSS model preset", t);
  const nrIntensity = finiteNumberInRange(value.nrIntensity, "Konohamaru NR intensity", 0, 2, t);
  const localToneStrength = finiteNumberInRange(value.localToneStrength, "Konohamaru local tone strength", 0, 2, t);
  const localStructureStrength = finiteNumberInRange(value.localStructureStrength, "Konohamaru local structure strength", 0, 2, t);
  const skinStructureStrength = finiteNumberInRange(value.skinStructureStrength, "Konohamaru skin structure strength", -1, 2, t);
  const outputDetailStrength = finiteNumberInRange(value.outputDetailStrength, "Konohamaru output detail strength", 1, 2, t);
  if (typeof value.automaticMask !== "boolean") throw new Error(t(uiKeys.upscaleChecks.konoMask));
  if (!isRecord(value.frameInterpolation)) throw new Error(t(uiKeys.upscaleChecks.konoInterpolation));
  if (typeof value.frameInterpolation.enabled !== "boolean") {
    throw new Error(t(uiKeys.upscaleChecks.konoInterpolationEnabled));
  }
  const outputFps = value.frameInterpolation.outputFps;
  if (!isKonohamaruFrameOutputFps(outputFps)) throw new Error(t(uiKeys.upscaleChecks.konoFps));
  const dlssEngine = enumValue(value.frameInterpolation.dlssEngine, KONOHAMARU_DLSS_ENGINES, "Konohamaru DLSS engine", t);
  if (value.nodeRevision !== KONOHAMARU_NODE_REVISION) {
    throw new Error(t(uiKeys.upscaleChecks.konoRevision, { revision: KONOHAMARU_NODE_REVISION }));
  }
  const runtimeBundleId = value.runtimeBundleId === KONOHAMARU_RUNTIME_BUNDLE_ID
    ? KONOHAMARU_RUNTIME_BUNDLE_ID
    : value.runtimeBundleId === KONOHAMARU_NEURAL_UPSTREAM_RUNTIME_BUNDLE_ID
      ? KONOHAMARU_NEURAL_UPSTREAM_RUNTIME_BUNDLE_ID
    : value.runtimeBundleId === KONOHAMARU_LEGACY_RUNTIME_BUNDLE_ID
      ? KONOHAMARU_LEGACY_RUNTIME_BUNDLE_ID
      : null;
  if (!runtimeBundleId) {
    throw new Error(
      t(uiKeys.upscaleChecks.konoBundle, { current: KONOHAMARU_RUNTIME_BUNDLE_ID, previous: KONOHAMARU_NEURAL_UPSTREAM_RUNTIME_BUNDLE_ID, legacy: KONOHAMARU_LEGACY_RUNTIME_BUNDLE_ID })
    );
  }
  return {
    provider: "konohamaru",
    operation: "video-upscale",
    mode,
    requireNeuralUpscaling: true,
    nrPreset,
    nrStyle,
    nrIntensity,
    localToneStrength,
    localStructureStrength,
    skinStructureStrength,
    automaticMask: value.automaticMask,
    dlssModelPreset,
    outputDetailStrength,
    frameInterpolation: {
      enabled: value.frameInterpolation.enabled,
      outputFps,
      dlssEngine
    },
    nodeRevision: KONOHAMARU_NODE_REVISION,
    runtimeBundleId
  };
}

export const normalizeKonohamaruDlss5Options = normalizeKonohamaruOptions;

export function normalizeKonohamaruTarget(input: KonohamaruTargetInput,
  t: Translate = createTranslator().t): NormalizedKonohamaruTarget {
  if (!isRecord(input)) throw new Error(t(uiKeys.upscaleChecks.konoTarget));
  if (input.modelId !== KONOHAMARU_MODEL_ID) throw new Error(t(uiKeys.upscaleChecks.konoTargetModel));
  if (input.targetHeight !== undefined || input.targetScale !== undefined || input.dlss5 !== undefined || input.aetherScale !== undefined) {
    throw new Error(t(uiKeys.upscaleChecks.konoTargetLegacy));
  }
  const sourceWidth = positiveInteger(input.sourceWidth, "sourceWidth", t);
  const sourceHeight = positiveInteger(input.sourceHeight, "sourceHeight", t);
  const options = normalizeKonohamaruOptions(input.konohamaru, t);
  const geometry = konohamaruOutputGeometry(sourceWidth, sourceHeight, options.mode, t);
  const targetWidth = input.targetWidth === undefined
    ? geometry.width
    : positiveInteger(input.targetWidth, "targetWidth", t);
  const targetOutputHeight = input.targetOutputHeight === undefined
    ? geometry.height
    : positiveInteger(input.targetOutputHeight, "targetOutputHeight", t);
  if (targetWidth !== geometry.width || targetOutputHeight !== geometry.height) {
    throw new Error(t(uiKeys.upscaleChecks.konoTargetSize));
  }
  return {
    provider: "konohamaru",
    modelId: KONOHAMARU_MODEL_ID,
    sourceWidth,
    sourceHeight,
    options,
    targetWidth,
    targetOutputHeight,
    width: targetWidth,
    height: targetOutputHeight
  };
}

function nodeInfoFor(objectInfo: unknown, nodeType: string): Record<string, unknown> | undefined {
  return isRecord(objectInfo) && isRecord(objectInfo[nodeType])
    ? objectInfo[nodeType]
    : undefined;
}

function inputValue(node: Record<string, unknown>, name: string): unknown {
  const input = isRecord(node.input) ? node.input : undefined;
  const required = input && isRecord(input.required) ? input.required : undefined;
  const optional = input && isRecord(input.optional) ? input.optional : undefined;
  return required?.[name] ?? optional?.[name];
}

function enumValues(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) {
    if (Array.isArray(value[0])) return value[0];
    if (isRecord(value[1])) {
      for (const key of ["options", "choices", "values"]) {
        const values = value[1][key];
        if (Array.isArray(values)) return values;
      }
    }
  }
  if (isRecord(value)) {
    for (const key of ["options", "choices", "values"]) {
      const values = value[key];
      if (Array.isArray(values)) return values;
    }
  }
  return undefined;
}

function addUnique(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
}

function validateVideoUpscaleSchema(
  node: Record<string, unknown> | undefined,
  missingInputs: string[],
  invalidInputs: string[],
  outputMismatch: string[]
): void {
  if (!node) return;
  const requiredInputs = [
    "video",
    "upscale_mode",
    "require_neural_upscaling",
    "nr_preset",
    "nr_style",
    "nr_intensity",
    "local_tone_strength",
    "local_structure_strength",
    "skin_structure_strength",
    "automatic_mask",
    "dlss_model_preset",
    "encoding_quality",
    "video_codec",
    "container",
    "rename",
    "custom_suffix",
    "hdr_mode",
    "output_detail_strength"
  ];
  for (const inputName of requiredInputs) {
    if (inputValue(node, inputName) === undefined) missingInputs.push(`NvidiaDLSSVideoUpscale.${inputName}`);
  }
  const video = inputValue(node, "video");
  if (!Array.isArray(video) || video[0] !== "VIDEO") invalidInputs.push("NvidiaDLSSVideoUpscale.video");
  const modes = enumValues(inputValue(node, "upscale_mode"));
  if (!modes || KONOHAMARU_MODE_SPECS.some((spec) => !modes.includes(spec.label))) {
    invalidInputs.push("NvidiaDLSSVideoUpscale.upscale_mode");
  }
  for (const [name, values] of [
    ["nr_preset", KONOHAMARU_NR_PRESETS],
    ["nr_style", KONOHAMARU_NR_STYLES],
    ["dlss_model_preset", KONOHAMARU_DLSS_MODEL_PRESETS]
  ] as const) {
    const choices = enumValues(inputValue(node, name));
    if (!choices || values.some((value) => !choices.includes(value))) invalidInputs.push(`NvidiaDLSSVideoUpscale.${name}`);
  }
  const output = Array.isArray(node.output) ? node.output : undefined;
  if (!output || output[0] !== "VIDEO" || output[1] !== "STRING") {
    outputMismatch.push("NvidiaDLSSVideoUpscale.output");
  }
}

function validateFrameInterpolationSchema(
  node: Record<string, unknown> | undefined,
  missingInputs: string[],
  invalidInputs: string[],
  outputMismatch: string[]
): void {
  if (!node) return;
  const requiredInputs = [
    "video",
    "output_fps",
    "dlss_engine",
    "encoding_quality",
    "video_codec",
    "container",
    "rename",
    "custom_suffix",
    "hdr_mode"
  ];
  for (const inputName of requiredInputs) {
    if (inputValue(node, inputName) === undefined) missingInputs.push(`NvidiaDLSSFrameInterpolation.${inputName}`);
  }
  const video = inputValue(node, "video");
  if (!Array.isArray(video) || video[0] !== "VIDEO") invalidInputs.push("NvidiaDLSSFrameInterpolation.video");
  const fps = enumValues(inputValue(node, "output_fps"));
  if (!fps || KONOHAMARU_FRAME_FPS_VALUES.some((value) => !fps.includes(String(value)) && !fps.includes(value))) {
    invalidInputs.push("NvidiaDLSSFrameInterpolation.output_fps");
  }
  const engines = enumValues(inputValue(node, "dlss_engine"));
  if (!engines || KONOHAMARU_DLSS_ENGINES.some((value) => !engines.includes(value))) {
    invalidInputs.push("NvidiaDLSSFrameInterpolation.dlss_engine");
  }
  const output = Array.isArray(node.output) ? node.output : undefined;
  if (!output || output[0] !== "VIDEO" || output[1] !== "STRING") {
    outputMismatch.push("NvidiaDLSSFrameInterpolation.output");
  }
}

export function validateKonohamaruObjectInfoSchema(
  objectInfo: unknown,
  options: { frameInterpolation?: boolean } = {},
  t: Translate = createTranslator().t
): KonohamaruSchemaValidation {
  const missingNodes: string[] = [];
  const missingInputs: string[] = [];
  const invalidInputs: string[] = [];
  const outputMismatch: string[] = [];
  const errors: string[] = [];
  const requiredNodes = ["LoadVideo", "SaveVideo", "NvidiaDLSSVideoUpscale"];
  if (options.frameInterpolation) requiredNodes.push("NvidiaDLSSFrameInterpolation");
  for (const nodeType of requiredNodes) {
    if (!nodeInfoFor(objectInfo, nodeType)) missingNodes.push(nodeType);
  }
  validateVideoUpscaleSchema(
    nodeInfoFor(objectInfo, "NvidiaDLSSVideoUpscale"),
    missingInputs,
    invalidInputs,
    outputMismatch
  );
  if (options.frameInterpolation) {
    validateFrameInterpolationSchema(
      nodeInfoFor(objectInfo, "NvidiaDLSSFrameInterpolation"),
      missingInputs,
      invalidInputs,
      outputMismatch
    );
  }
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

export function assertKonohamaruObjectInfoSchema(
  objectInfo: unknown,
  options: { frameInterpolation?: boolean } = {},
  t: Translate = createTranslator().t
): void {
  const result = validateKonohamaruObjectInfoSchema(objectInfo, options, t);
  if (!result.valid) {
    throw new Error(t(uiKeys.upscaleChecks.konoSchema, { errors: result.errors.join("; ") }));
  }
}

function sameConnection(value: unknown, nodeId: string, outputIndex: number): boolean {
  return Array.isArray(value) && value.length === 2 && value[0] === nodeId && value[1] === outputIndex;
}

function validateConnection(
  value: unknown,
  label: string,
  workflow: KonohamaruApiWorkflow,
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
  if (!workflow[nodeId]) invalidEdges.push(t(uiKeys.upscaleChecks.connectionMissing, { label: label, node: nodeId }));
  else if (outputArities[nodeId] !== undefined && outputIndex >= outputArities[nodeId]!) {
    invalidEdges.push(t(uiKeys.upscaleChecks.outputUnavailable, { label: label }));
  }
}

function inputValueForNode(node: KonohamaruApiNode | undefined, name: string): unknown {
  return node?.inputs?.[name];
}

function expectedLiteral(
  workflow: KonohamaruApiWorkflow,
  nodeId: string,
  inputName: string,
  expected: unknown,
  invalidInputs: string[],
  t: Translate = createTranslator().t
): void {
  if (inputValueForNode(workflow[nodeId], inputName) !== expected) {
    invalidInputs.push(t(uiKeys.upscaleChecks.literalRequired, { node: nodeId, input: inputName, value: JSON.stringify(expected) }));
  }
}

export function validateKonohamaruWorkflow(
  workflow: unknown,
  objectInfo?: unknown,
  t: Translate = createTranslator().t
): KonohamaruWorkflowValidation {
  const missingNodes: string[] = [];
  const invalidEdges: string[] = [];
  const invalidInputs: string[] = [];
  const outputMismatch: string[] = [];
  const errors: string[] = [];
  const graph = isRecord(workflow) ? workflow as KonohamaruApiWorkflow : undefined;
  if (!graph) {
    errors.push(t(uiKeys.upscaleChecks.apiGraph));
  } else {
    const frameNode = Object.values(graph).find((node) => node?.class_type === "NvidiaDLSSFrameInterpolation");
    const expectedNodes: Record<string, string> = frameNode
      ? { "1": "LoadVideo", "2": "NvidiaDLSSVideoUpscale", "3": "NvidiaDLSSFrameInterpolation", "4": "SaveVideo" }
      : { "1": "LoadVideo", "2": "NvidiaDLSSVideoUpscale", "3": "SaveVideo" };
    for (const [nodeId, classType] of Object.entries(expectedNodes)) {
      const node = graph[nodeId];
      if (!node) addUnique(missingNodes, classType);
      else if (node.class_type !== classType) invalidInputs.push(t(uiKeys.upscaleChecks.classRequired, { node: nodeId, type: classType }));
      else if (!isRecord(node.inputs)) invalidInputs.push(t(uiKeys.upscaleChecks.inputsObject, { node: nodeId }));
    }
    const allowedClasses = new Set(Object.values(expectedNodes));
    for (const [nodeId, node] of Object.entries(graph)) {
      if (!allowedClasses.has(node?.class_type)) invalidInputs.push(t(uiKeys.upscaleChecks.konoForbidden, { node: nodeId, type: node?.class_type ?? "unknown" }));
    }
    const outputArities: Record<string, number> = frameNode
      ? { "1": 4, "2": 2, "3": 2 }
      : { "1": 4, "2": 2 };
    for (const [nodeId, node] of Object.entries(graph)) {
      if (!isRecord(node) || !isRecord(node.inputs)) continue;
      for (const [inputName, value] of Object.entries(node.inputs)) {
        if (Array.isArray(value) && value.length === 2) {
          validateConnection(value, `${nodeId}.${inputName}`, graph, invalidEdges, outputArities, t);
        }
      }
    }
    const load = graph["1"];
    const upscale = graph["2"];
    const frame = frameNode ? graph["3"] : undefined;
    const save = frameNode ? graph["4"] : graph["3"];
    if (load?.class_type === "LoadVideo" && isRecord(load.inputs) && !isSafeRelativeComfyPath(inputValueForNode(load, "file"))) {
      invalidInputs.push(t(uiKeys.upscaleChecks.konoVideoPath));
    }
    if (upscale?.class_type === "NvidiaDLSSVideoUpscale" && isRecord(upscale.inputs)) {
      if (!sameConnection(inputValueForNode(upscale, "video"), "1", 0)) invalidInputs.push(t(uiKeys.upscaleChecks.konoInputVideo));
      expectedLiteral(graph, "2", "require_neural_upscaling", true, invalidInputs, t);
      const mode = inputValueForNode(upscale, "upscale_mode");
      if (!KONOHAMARU_MODE_SPECS.some((spec) => spec.label === mode)) invalidInputs.push(t(uiKeys.upscaleChecks.konoNodeMode));
      if (!KONOHAMARU_NR_STYLES.includes(inputValueForNode(upscale, "nr_style") as KonohamaruNrStyle)) invalidInputs.push(t(uiKeys.upscaleChecks.konoNodeStyle));
    }
    if (frameNode && frame?.class_type === "NvidiaDLSSFrameInterpolation" && isRecord(frame.inputs)) {
      if (!sameConnection(inputValueForNode(frame, "video"), "2", 0)) invalidInputs.push(t(uiKeys.upscaleChecks.konoInterpolatedVideo));
      if (!KONOHAMARU_FRAME_FPS_VALUES.some((fps) => String(fps) === String(inputValueForNode(frame, "output_fps")))) invalidInputs.push(t(uiKeys.upscaleChecks.konoNodeFps));
      if (!KONOHAMARU_DLSS_ENGINES.includes(inputValueForNode(frame, "dlss_engine") as KonohamaruDlssEngine)) invalidInputs.push(t(uiKeys.upscaleChecks.konoEngine));
    }
    if (save?.class_type === "SaveVideo" && isRecord(save.inputs)) {
      if (!sameConnection(inputValueForNode(save, "video"), frameNode ? "3" : "2", 0)) invalidInputs.push(t(uiKeys.upscaleChecks.konoOutputVideo, { node: frameNode ? "4" : "3", source: frameNode ? "3" : "2" }));
      if (!isSafeRelativeComfyPath(inputValueForNode(save, "filename_prefix"))) invalidInputs.push(t(uiKeys.upscaleChecks.konoOutputPrefix, { node: frameNode ? "4" : "3" }));
      if (inputValueForNode(save, "format") !== "mp4") invalidInputs.push(t(uiKeys.upscaleChecks.konoOutputFormat, { node: frameNode ? "4" : "3" }));
    }
    if (objectInfo !== undefined) {
      const schema = validateKonohamaruObjectInfoSchema(objectInfo, { frameInterpolation: Boolean(frameNode) }, t);
      for (const value of schema.missingNodes) addUnique(missingNodes, value);
      invalidInputs.push(...schema.missingInputs, ...schema.invalidInputs);
      outputMismatch.push(...schema.outputMismatch);
      if (!schema.valid) errors.push(t(uiKeys.upscaleChecks.schemaErrors, { errors: schema.errors.join("; ") }));
    }
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

export function buildKonohamaruUpscaleWorkflow(
  task: UpscaleQueueTask,
  sourceVideo: string,
  objectInfo: unknown,
  t: Translate = createTranslator().t
): KonohamaruApiWorkflow {
  if (task.modelId !== KONOHAMARU_MODEL_ID) throw new Error(t(uiKeys.upscaleChecks.konoWorkflowModel));
  if (task.targetHeight !== undefined || task.targetScale !== undefined || task.dlss5 !== undefined || task.aetherScale !== undefined) {
    throw new Error(t(uiKeys.upscaleChecks.konoWorkflowLegacy));
  }
  if (!task.konohamaru) throw new Error(t(uiKeys.upscaleChecks.konoSnapshot));
  const target = normalizeKonohamaruTarget({
    modelId: task.modelId,
    sourceWidth: task.sourceWidth,
    sourceHeight: task.sourceHeight,
    targetWidth: task.targetWidth,
    targetOutputHeight: task.targetOutputHeight,
    konohamaru: task.konohamaru
  }, t);
  if (task.targetWidth !== target.targetWidth || task.targetOutputHeight !== target.targetOutputHeight) {
    throw new Error(t(uiKeys.upscaleChecks.konoFrozenSize));
  }
  if (!isSafeRelativeComfyPath(sourceVideo)) throw new Error(t(uiKeys.upscaleChecks.konoSourcePath));
  assertKonohamaruObjectInfoSchema(objectInfo, {
    frameInterpolation: target.options.frameInterpolation.enabled
  }, t);
  const spec = konohamaruModeSpec(target.options.mode, t);
  const filenamePrefix = typeof task.outputFilename === "string"
    ? task.outputFilename.replace(/\.mp4$/iu, "")
    : "";
  if (!isSafeRelativeComfyPath(filenamePrefix)) throw new Error(t(uiKeys.upscaleChecks.konoOutputPath));
  const workflow: KonohamaruApiWorkflow = {
    "1": {
      class_type: "LoadVideo",
      inputs: { file: sourceVideo }
    },
    "2": {
      class_type: "NvidiaDLSSVideoUpscale",
      inputs: {
        video: ["1", 0],
        upscale_mode: spec.label,
        require_neural_upscaling: true,
        nr_preset: target.options.nrPreset,
        nr_style: target.options.nrStyle,
        nr_intensity: target.options.nrIntensity,
        local_tone_strength: target.options.localToneStrength,
        local_structure_strength: target.options.localStructureStrength,
        skin_structure_strength: target.options.skinStructureStrength,
        automatic_mask: target.options.automaticMask,
        dlss_model_preset: target.options.dlssModelPreset,
        encoding_quality: "Auto (Default)",
        video_codec: "H.264",
        container: "MP4",
        rename: "Auto",
        custom_suffix: "_DLSS5",
        hdr_mode: false,
        output_detail_strength: target.options.outputDetailStrength
      }
    }
  };
  const finalVideoNode = target.options.frameInterpolation.enabled ? "3" : "2";
  if (target.options.frameInterpolation.enabled) {
    workflow["3"] = {
      class_type: "NvidiaDLSSFrameInterpolation",
      inputs: {
        video: ["2", 0],
        output_fps: String(target.options.frameInterpolation.outputFps),
        dlss_engine: target.options.frameInterpolation.dlssEngine,
        encoding_quality: "Auto (Default)",
        video_codec: "H.264",
        container: "MP4",
        rename: "Auto",
        custom_suffix: "_DLSSFG",
        hdr_mode: false
      }
    };
  }
  workflow[target.options.frameInterpolation.enabled ? "4" : "3"] = {
    class_type: "SaveVideo",
    inputs: {
      video: [finalVideoNode, 0],
      filename_prefix: filenamePrefix,
      format: "mp4",
      codec: "auto"
    }
  };
  const validation = validateKonohamaruWorkflow(workflow, undefined, t);
  if (!validation.valid) throw new Error(t(uiKeys.upscaleChecks.konoWorkflowInvalid, { errors: validation.errors.join("; ") }));
  return workflow;
}
