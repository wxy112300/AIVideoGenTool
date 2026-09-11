import type {
  Draft,
  H3AttentionMode,
  H3AttentionOwner,
  H3ComfyCompilerMode,
  H3ExecutionPolicySnapshot,
  H3GlobalSparseAttentionMode,
  H3RuntimeMode,
  H3SparseAttentionMode,
  QueueTask,
  Settings
} from "../types.js";
import { modelCatalog } from "./catalog/index.js";
import {
  isH3Ref2vTurboEnabled,
  isH3PddLoraId,
  isH3SlaTurboLoraId,
  isH3TurboFourStepLoraId,
  isH3TurboV4LoraId,
  isH3TurboEnabled,
  videoLoraCompatibleWithModel
} from "./video-loras.js";

export const H3_DEFAULT_ATTENTION_MODE: H3AttentionMode = "sage";
export const H3_DEFAULT_SPARSE_ATTENTION_MODE: H3GlobalSparseAttentionMode = "off";
export const H3_DEFAULT_RUNTIME_MODE: H3RuntimeMode = "compatibility";
export const H3_DEFAULT_COMFY_COMPILER_MODE: H3ComfyCompilerMode = "disabled";

export interface H3ExecutionPolicyInput {
  modelId: string;
  inputMode: Draft["inputMode"];
  attentionMode?: unknown;
  sparseAttentionMode?: unknown;
  runtimeMode?: unknown;
  comfyCompilerMode?: unknown;
  spectrumMode?: string;
  videoLoras?: readonly Draft["videoLoras"][number][];
  h3LivePreview?: boolean;
  /** Existing owners are only used to detect a genuinely mixed graph. */
  existingGraphAttentionOwners?: readonly H3AttentionOwner[];
}

export interface ResolvedH3ExecutionPolicy {
  attentionMode: H3AttentionMode;
  attentionOwner: H3AttentionOwner;
  sparseAttentionMode: Exclude<H3SparseAttentionMode, "auto">;
  runtimeMode: H3RuntimeMode;
  comfyCompilerMode: H3ComfyCompilerMode;
  spectrumEnabled: boolean;
  spectrumRequested: boolean;
  turboProfile?: string;
  previewEnabled: boolean;
  allowed: boolean;
  reasons: string[];
  normalizedFrom?: string[];
}

export function normalizeH3AttentionMode(
  value: unknown,
  fallback: H3AttentionMode = H3_DEFAULT_ATTENTION_MODE
): H3AttentionMode {
  return value === "sage" || value === "sage-triton" || value === "pytorch" || value === "comfy-kitchen"
    ? value
    : fallback;
}

export function normalizeH3SparseAttentionMode(
  value: unknown,
  fallback: H3SparseAttentionMode = H3_DEFAULT_SPARSE_ATTENTION_MODE
): H3SparseAttentionMode {
  return value === "auto" || value === "off" || value === "sol-attn" || value === "native-sla" || value === "vsa"
    ? value
    : fallback;
}

export function normalizeH3GlobalSparseAttentionMode(
  value: unknown,
  fallback: H3GlobalSparseAttentionMode = H3_DEFAULT_SPARSE_ATTENTION_MODE
): H3GlobalSparseAttentionMode {
  return value === "off" || value === "sol-attn" ? value : fallback;
}

export function normalizeH3RuntimeMode(
  value: unknown,
  fallback: H3RuntimeMode = H3_DEFAULT_RUNTIME_MODE
): H3RuntimeMode {
  return value === "compatibility" || value === "native" ? value : fallback;
}

export function normalizeH3ComfyCompilerMode(
  value: unknown,
  fallback: H3ComfyCompilerMode = H3_DEFAULT_COMFY_COMPILER_MODE
): H3ComfyCompilerMode {
  return value === "auto" || value === "disabled" ? value : fallback;
}

export type H3AccelerationSettings = Pick<
  Settings,
  "h3AttentionMode" | "h3SparseAttentionMode" | "h3RuntimeMode" | "h3ComfyCompilerMode"
>;

type H3VideoQueueTask = Extract<
  QueueTask,
  { taskType: "generation" | "extension" | "upscale" }
>;

export interface H3AccelerationTaskPatch {
  attentionMode: H3AttentionMode;
  h3SparseAttentionMode: H3SparseAttentionMode;
  h3RuntimeMode: H3RuntimeMode;
  h3ComfyCompilerMode: H3ComfyCompilerMode;
  h3ExecutionPolicy: H3ExecutionPolicySnapshot;
}

/**
 * Re-resolve only the acceleration policy for a waiting H3 queue task.
 * Workflow inputs, prompts, media, seeds and output settings remain task-owned;
 * the policy is allowed to follow the saved Settings until execution starts.
 */
export function h3AccelerationTaskPatchForSettings(
  task: H3VideoQueueTask,
  settings: H3AccelerationSettings
): H3AccelerationTaskPatch | null {
  const definition = modelCatalog.get(task.modelId)?.definition;
  if (definition?.family !== "minimax-h3") return null;

  const previousPolicy = task.h3ExecutionPolicy;
  const policy = h3ExecutionPolicySnapshotFor({
    modelId: task.modelId,
    inputMode: task.taskType === "extension" ? "video" : "image",
    attentionMode: settings.h3AttentionMode,
    sparseAttentionMode: settings.h3SparseAttentionMode,
    runtimeMode: settings.h3RuntimeMode,
    comfyCompilerMode: settings.h3ComfyCompilerMode,
    spectrumMode: task.spectrumMode ?? (previousPolicy?.spectrumEnabled ? "balanced" : "off"),
    videoLoras: task.videoLoras,
    h3LivePreview: task.h3LivePreview
  });

  return {
    attentionMode: policy.attentionMode,
    h3SparseAttentionMode: normalizeH3SparseAttentionMode(settings.h3SparseAttentionMode),
    h3RuntimeMode: normalizeH3RuntimeMode(settings.h3RuntimeMode),
    h3ComfyCompilerMode: normalizeH3ComfyCompilerMode(settings.h3ComfyCompilerMode),
    h3ExecutionPolicy: {
      ...policy,
      // These controls are intentionally outside this update path. Preserve
      // their existing task snapshot even when older tasks lack the source
      // field used to derive them.
      ...(previousPolicy?.spectrumEnabled !== undefined
        ? { spectrumEnabled: previousPolicy.spectrumEnabled }
        : {}),
      ...(previousPolicy?.previewEnabled !== undefined
        ? { previewEnabled: previousPolicy.previewEnabled }
        : {})
    }
  };
}

/**
 * Apply the saved H3 acceleration policy to a waiting task. The caller owns
 * updatedAt so this helper can also be used when a failed/cancelled task is
 * reset for another attempt.
 */
export function applyH3AccelerationSettingsToWaitingTask(
  task: QueueTask,
  settings: H3AccelerationSettings
): boolean {
  if (task.status !== "waiting" || task.taskType === "image-generation") return false;
  const patch = h3AccelerationTaskPatchForSettings(task, settings);
  if (!patch) return false;

  const nested = task.taskType === "upscale" ? task.h3NativeInput : undefined;
  const changed = task.attentionMode !== patch.attentionMode ||
    task.h3SparseAttentionMode !== patch.h3SparseAttentionMode ||
    task.h3RuntimeMode !== patch.h3RuntimeMode ||
    task.h3ComfyCompilerMode !== patch.h3ComfyCompilerMode ||
    JSON.stringify(task.h3ExecutionPolicy) !== JSON.stringify(patch.h3ExecutionPolicy) ||
    (nested !== undefined && (
      nested.attentionMode !== patch.attentionMode ||
      nested.h3SparseAttentionMode !== patch.h3SparseAttentionMode ||
      nested.h3RuntimeMode !== patch.h3RuntimeMode ||
      nested.h3ComfyCompilerMode !== patch.h3ComfyCompilerMode
    ));

  task.attentionMode = patch.attentionMode;
  task.h3SparseAttentionMode = patch.h3SparseAttentionMode;
  task.h3RuntimeMode = patch.h3RuntimeMode;
  task.h3ComfyCompilerMode = patch.h3ComfyCompilerMode;
  task.h3ExecutionPolicy = patch.h3ExecutionPolicy;
  if (nested) {
    nested.attentionMode = patch.attentionMode;
    nested.h3SparseAttentionMode = patch.h3SparseAttentionMode;
    nested.h3RuntimeMode = patch.h3RuntimeMode;
    nested.h3ComfyCompilerMode = patch.h3ComfyCompilerMode;
  }
  return changed;
}

export function h3AttentionOwnerFor(
  value: unknown,
  normalizedFrom: string[] = []
): H3AttentionOwner {
  const mode = normalizeH3AttentionMode(value);
  if (value !== undefined && mode !== value) {
    normalizedFrom.push(`attention:${String(value)}->${mode}`);
  }
  if (mode === "pytorch") return "pytorch";
  if (mode === "comfy-kitchen") return "comfy-kitchen";
  return "sage";
}

export function h3TurboProfileFor(input: Pick<H3ExecutionPolicyInput, "modelId" | "videoLoras">): string | undefined {
  const model = input.modelId;
  const loras = input.videoLoras ?? [];
  if (loras.some((lora) => isH3PddLoraId(lora.id) && videoLoraCompatibleWithModel(lora, model))) {
    return "h3-pdd";
  }
  if (loras.some((lora) => isH3SlaTurboLoraId(lora.id) && videoLoraCompatibleWithModel(lora, model))) {
    return "h3-turbo-sla";
  }
  if (loras.some((lora) => isH3TurboV4LoraId(lora.id) && videoLoraCompatibleWithModel(lora, model))) {
    return "h3-turbo-v4";
  }
  if (loras.some((lora) => isH3TurboFourStepLoraId(lora.id) && videoLoraCompatibleWithModel(lora, model))) {
    return "h3-turbo-v12";
  }
  if (isH3Ref2vTurboEnabled({ modelId: model, videoLoras: loras })) return "h3-ref2v-turbo";
  if (isH3TurboEnabled({ modelId: model, videoLoras: loras })) return "h3-turbo";
  return undefined;
}

function effectiveSparseMode(
  requested: H3SparseAttentionMode,
  turboProfile: string | undefined,
  isR2v: boolean
): Exclude<H3SparseAttentionMode, "auto"> {
  if (turboProfile === "h3-turbo-sla" && !isR2v && (requested === "auto" || requested === "off" || requested === "sol-attn")) {
    return "native-sla";
  }
  if (requested !== "auto") return requested;
  // Turbo-SLA's old external injection is deliberately replaced by ComfyUI
  // 0.35's native BlockSparseAttention path. Other H3 models stay dense.
  return "off";
}

export function resolveH3ExecutionPolicy(
  input: H3ExecutionPolicyInput
): ResolvedH3ExecutionPolicy {
  const definition = modelCatalog.get(input.modelId)?.definition;
  const isH3 = definition?.family === "minimax-h3";
  const isR2v = definition?.variant === "r2v";
  const motionContext = input.inputMode === "video" && isR2v;
  const normalizedFrom: string[] = [];
  const attentionMode = normalizeH3AttentionMode(input.attentionMode);
  const attentionOwner = h3AttentionOwnerFor(attentionMode, normalizedFrom);
  const sparseRequested = normalizeH3SparseAttentionMode(input.sparseAttentionMode);
  const turboProfile = h3TurboProfileFor(input);
  const sparseAttentionMode = effectiveSparseMode(sparseRequested, turboProfile, isR2v);
  const runtimeMode = normalizeH3RuntimeMode(input.runtimeMode);
  const comfyCompilerMode = normalizeH3ComfyCompilerMode(input.comfyCompilerMode);
  const spectrumRequested = input.spectrumMode === "balanced";
  const spectrumSupported = definition?.capabilities?.supportsSpectrum === true && !motionContext;
  const reasons: string[] = [];

  if (!isH3 && (
    input.attentionMode !== undefined ||
    input.sparseAttentionMode !== undefined ||
    input.runtimeMode !== undefined ||
    input.comfyCompilerMode !== undefined
  )) {
    reasons.push("not-minimax-h3");
  }
  if (spectrumRequested && !spectrumSupported) {
    reasons.push(motionContext ? "motion-context-spectrum-conflict" : "spectrum-unsupported");
  }
  if (sparseAttentionMode !== "off") {
    if (!isH3) reasons.push("not-minimax-h3");
    if (motionContext) reasons.push("motion-context-sparse-not-supported");
    if (sparseAttentionMode === "native-sla" && turboProfile !== "h3-turbo-sla") {
      reasons.push("native-sla-requires-turbo-sla");
    }
    if (sparseAttentionMode === "vsa") {
      // The 0.35 schema gates VSA to MiniMaxH3, but this app has no confirmed
      // FastH3 weight/kernel pairing yet. Do not present a false-ready route.
      reasons.push("vsa-requires-validated-fast-h3");
    }
  }
  const owners = (input.existingGraphAttentionOwners ?? []).filter((owner) => owner !== "sla" && owner !== "h3-sparse");
  if (owners.length > 1 || (owners[0] && owners[0] !== attentionOwner)) {
    reasons.push("attention-conflict");
  }
  const previewEnabled = isH3 && input.h3LivePreview === true && definition?.capabilities?.supportsLivePreview !== false;
  return {
    attentionMode,
    attentionOwner,
    sparseAttentionMode,
    runtimeMode,
    comfyCompilerMode,
    spectrumEnabled: spectrumRequested && spectrumSupported,
    spectrumRequested,
    turboProfile,
    previewEnabled,
    allowed: reasons.length === 0,
    reasons,
    ...(normalizedFrom.length ? { normalizedFrom } : {})
  };
}

export function h3ExecutionPolicySnapshotFor(
  input: H3ExecutionPolicyInput
): H3ExecutionPolicySnapshot {
  const policy = resolveH3ExecutionPolicy(input);
  return {
    attentionMode: policy.attentionMode,
    attentionOwner: policy.attentionOwner,
    sparseAttentionMode: policy.sparseAttentionMode,
    runtimeMode: policy.runtimeMode,
    comfyCompilerMode: policy.comfyCompilerMode,
    spectrumEnabled: policy.spectrumEnabled,
    ...(policy.turboProfile ? { turboProfile: policy.turboProfile } : {}),
    previewEnabled: policy.previewEnabled,
    allowed: policy.allowed,
    reasons: [...policy.reasons]
  };
}
