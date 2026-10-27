import { isContinuumIdentity, type ContinuumGroupRequest } from "./group-checkpoint.js";
import { applyMiniMaxH3Spectrum, applyVideoLoraStack, applyMiniMaxH3PddSampling, applyMiniMaxH3Ref2vTurboSampling, validateApiWorkflow } from "../workflow.js";
import { normalizeMiniMaxH3ModelPatchChain } from "../h3-model-patch-workflow.js";
import type { H3SpectrumMode, H3AttentionMode, H3SparseAttentionMode, H3RuntimeMode, H3ComfyCompilerMode, VideoLoraSelection, H3SpectrumModelAwareMode } from "../../types.js";

/** Optional for old Runs: absent retains the original adapter graph exactly. */
export interface ContinuumH3Options {
  modelId: "minimax_h3_fl2va";
  videoLoras: VideoLoraSelection[];
  sparseAttentionMode: H3SparseAttentionMode;
  runtimeMode: H3RuntimeMode;
  comfyCompilerMode: H3ComfyCompilerMode;
  spectrumModelAwareMode: H3SpectrumModelAwareMode;
}

export interface ContinuumGroupProfile {
  diffusionModel: string;
  textEncoder: string;
  videoVae: string;
  width: number;
  height: number;
  seed: number;
  steps: number;
  sampler: string;
  scheduler: string;
  chunkSeconds: number;
  prompts: string[];
  /** Stable uploaded input retained for every group of the Run. */
  firstImage?: string;
  attention: "sage" | "sage-triton" | "comfy-kitchen" | "sdpa";
  h3?: ContinuumH3Options;
  /** Absent on older frozen runs means off; never read live settings on resume. */
  spectrumMode?: H3SpectrumMode;
  lora?: { filename: string; strength: number };
}

export type ContinuumApiGraph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

export function assertContinuumGroupProfile(profile: ContinuumGroupProfile, plannedChunks: number): void {
  if (profile.prompts.length !== plannedChunks || profile.prompts.some(p => !p.trim()) ||
      !Number.isFinite(profile.chunkSeconds) || profile.chunkSeconds < 4 || profile.chunkSeconds > 15 ||
      ![profile.width, profile.height].every(v => Number.isInteger(v) && v >= 64 && v <= 2048 && v % 16 === 0) ||
      !Number.isSafeInteger(profile.seed) || profile.seed < 0 || !Number.isInteger(profile.steps) || profile.steps < 1 || profile.steps > 100 ||
      ![profile.diffusionModel, profile.textEncoder, profile.videoVae, profile.sampler, profile.scheduler].every(v => v.trim()) ||
      !["sage", "sage-triton", "comfy-kitchen", "sdpa"].includes(profile.attention) ||
      (profile.spectrumMode !== undefined && !["off", "balanced"].includes(profile.spectrumMode)) ||
      (profile.lora && (!profile.lora.filename.trim() || !Number.isFinite(profile.lora.strength) || profile.lora.strength < 0 || profile.lora.strength > 2))) {
    throw new Error("Continuum group frozen execution profile invalid");
  }
  if (profile.h3) {
    const h = profile.h3;
    if (h.modelId !== "minimax_h3_fl2va" || !Array.isArray(h.videoLoras) ||
        h.videoLoras.some(l => !l || !l.id?.trim() || !l.filename?.trim() || !Number.isFinite(l.strength) || l.strength < 0 || l.strength > 2) ||
        !["off", "auto", "sol-attn", "native-sla", "vsa"].includes(h.sparseAttentionMode) ||
        !["compatibility", "native"].includes(h.runtimeMode) || !["auto", "disabled"].includes(h.comfyCompilerMode) ||
        !["off", "schedule", "schedule_confidence", "full"].includes(h.spectrumModelAwareMode) || profile.lora) throw new Error("Invalid frozen H3 options");
  }
}

export function continuumAttentionMode(profile: ContinuumGroupProfile): H3AttentionMode {
  return profile.attention === "sdpa" ? "pytorch" : profile.attention;
}

export function continuumProfileLoras(profile: ContinuumGroupProfile): VideoLoraSelection[] {
  return structuredClone(profile.h3?.videoLoras ?? (profile.lora ? [{ id: "continuum-legacy-lora", name: profile.lora.filename,
    ...profile.lora, modelFamily: "minimax-h3", compatibleModelIds: [], compatibleInputModes: ["image", "video"],
    purpose: "style" as const }] : []));
}

export function continuumRuntimeSettings(profile: ContinuumGroupProfile) {
  return { h3AttentionMode: continuumAttentionMode(profile), h3SparseAttentionMode: profile.h3?.sparseAttentionMode ?? "off" as const,
    h3RuntimeMode: profile.h3?.runtimeMode ?? "compatibility" as const, h3ComfyCompilerMode: profile.h3?.comfyCompilerMode ?? "disabled" as const };
}

/** Derive an internal new-Run/next-group graph from the existing V38 template. */
export function compileContinuumGroupWorkflow(template: unknown, request: ContinuumGroupRequest, profile: ContinuumGroupProfile): ContinuumApiGraph {
  const validation = validateApiWorkflow(template);
  if (!validation.valid) throw new Error(`Continuum group template invalid: ${validation.errors.join("; ")}`);
  const identifier = isContinuumIdentity;
  if (![request.execution_id, request.step_id, request.attempt_id, request.project_id, request.run_name].every(identifier) ||
      !Number.isInteger(request.planned_chunks) || request.planned_chunks < 1 || request.planned_chunks > 16 ||
      !Number.isInteger(request.expected_prefix_chunks) || request.expected_prefix_chunks < 0 || request.expected_prefix_chunks >= request.planned_chunks ||
      (request.expected_prefix_chunks ? !identifier(request.expected_parent_revision_id) : request.expected_parent_revision_id !== "")) {
    throw new Error("Continuum group request has invalid Run/prefix identity");
  }
  assertContinuumGroupProfile(profile, request.planned_chunks);
  const tokens: Record<string, unknown> = {
    H3_DIFFUSION_MODEL: profile.diffusionModel, H3_TEXT_ENCODER: profile.textEncoder, H3_VIDEO_VAE: profile.videoVae,
    H3_BOUNDARY_FRAME: profile.firstImage || "", WIDTH: profile.width, HEIGHT: profile.height, SEED: profile.seed,
    PROMPT: JSON.stringify(profile.prompts), H3_CONTINUUM_CHUNKS: request.planned_chunks,
    H3_CONTINUUM_CHUNK_SECONDS: profile.chunkSeconds, H3_CONTINUUM_RUN_NAME: request.run_name,
    H3_CONTINUUM_PROJECT_ID: request.project_id, H3_CONTINUUM_REVIEW_ACTION: "Continue / Next",
    H3_CONTINUUM_REROLL_FROM: 0, H3_CONTINUUM_TAKE_ACTION: "Automatic", H3_CONTINUUM_TAKE_GROUP: 0,
    H3_CONTINUUM_TAKE_REVISION_ID: "", H3_SPECTRUM_MODE: profile.spectrumMode ?? "off", H3_SPECTRUM_MODEL_AWARE_MODE: "off",
    OUTPUT_FILENAME: `long-video/${request.execution_id}/${request.step_id}-${request.attempt_id}`
  };
  const replace = (value: unknown): unknown => {
    if (typeof value === "string") {
      const token = /^\{\{([A-Z0-9_]+)\}\}$/u.exec(value)?.[1];
      if (!token) return value;
      if (!(token in tokens)) throw new Error(`Unknown Continuum template token ${token}`);
      return tokens[token];
    }
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)]));
    return value;
  };
  const graph = replace(template) as ContinuumApiGraph;
  if (graph?.["12"]?.class_type !== "H3ContinuumSamplerV38" || graph?.["24"]?.class_type !== "LocalVideoStudioH3ContinuumManagedReceipt") {
    throw new Error("Continuum group compiler requires the bundled managed V38 template");
  }
  const sampler = graph["6"], scheduler = graph["7"], attention = graph["5"];
  if (!sampler || !scheduler || !attention) throw new Error("Continuum group template lacks its sampling profile nodes");
  graph["12"].inputs.prompt_mode = "List";
  // Frontend seed widget metadata is not a Python/API input in current V38.
  delete graph["12"].inputs.control_after_generate;
  graph["12"].inputs.show_preview = false;
  sampler.inputs.sampler_name = profile.sampler;
  scheduler.inputs.scheduler = profile.scheduler;
  scheduler.inputs.steps = profile.steps;
  if (!profile.firstImage) {
    delete graph["8"];
    delete graph["12"].inputs.first_frame;
    graph["12"].inputs.aspect = "16:9";
  }
  graph["24"] = { class_type: "LocalVideoStudioH3ContinuumGroupReceipt", inputs: {
    status: ["12", 3], assembly_plan: ["12", 2], ...structuredClone(request), sampling_evidence_version: 2
  } };
  if (profile.h3) {
    const task = { taskType: "generation" as const, modelId: profile.h3.modelId, videoLoras: profile.h3.videoLoras,
      attentionMode: continuumAttentionMode(profile), spectrumMode: profile.spectrumMode ?? "off", h3ReferenceSlots: [] };
    applyVideoLoraStack(graph, task);
    normalizeMiniMaxH3ModelPatchChain(graph, { modelId: task.modelId, inputMode: "image", attentionMode: task.attentionMode,
      sparseAttentionMode: profile.h3.sparseAttentionMode, runtimeMode: profile.h3.runtimeMode, comfyCompilerMode: profile.h3.comfyCompilerMode,
      videoLoras: task.videoLoras, spectrumEnabled: task.spectrumMode === "balanced", spectrumModelAwareMode: profile.h3.spectrumModelAwareMode });
    applyMiniMaxH3PddSampling(graph, task);
    applyMiniMaxH3Ref2vTurboSampling(graph, task);
    return graph;
  }
  if (profile.lora) graph["30"] = { class_type: "LoraLoaderModelOnly", inputs: {
    model: ["1", 0], lora_name: profile.lora.filename, strength_model: profile.lora.strength
  } };
  const model = [profile.lora ? "30" : "1", 0];
  if (profile.attention === "comfy-kitchen") {
    attention.class_type = "ModelAttentionBackend";
    attention.inputs = { model, attention: "comfy kitchen attention" };
  } else if (profile.attention !== "sdpa") {
    attention.class_type = "LocalVideoStudioH3ManagedSageAttention";
    attention.inputs.model = model;
    attention.inputs.sage_attention = profile.attention === "sage-triton" ? "sageattn_qk_int8_pv_fp16_triton" : "sageattn_qk_int8_pv_fp16_cuda";
    attention.inputs.allow_compile = true;
  } else {
    delete graph["5"];
    scheduler.inputs.model = model;
    graph["12"].inputs.model = model;
  }
  if (profile.spectrumMode === "balanced") applyMiniMaxH3Spectrum(graph);
  return graph;
}
