import { normalizeMiniMaxH3ModelPatchChain as normalizeNativeMiniMaxH3ModelPatchChain } from "./h3-model-patch-workflow.js";
import { workflowMessage } from "./runtime/workflow-messages.js";

/**
 * Compatibility entry point for old callers and persisted task snapshots.
 * H3 Memory Optimization and its residency limiter are withdrawn. The legacy
 * memory fields are ignored and can never add a node back into a graph.
 */
const consumerClasses = new Set(["BasicScheduler", "BasicGuider", "H3ContinuumSamplerV38"]);
const withdrawnMemoryClasses = new Set(["H3MemoryOptimization", "H3AIMDOResidencyLimiter"]);
const postSamplingClasses = new Set(["SpectrumApplyMiniMaxH3", "ModelPreviewOverrideKJ"]);
const legacyChainClasses = new Set([
  "PathchSageAttentionKJ",
  "H3SLAAttention",
  "H3SparseAttention",
  "H3SparseAttentionAdvanced",
  "ModelAttentionBackend",
  "BlockSparseAttention",
  "SpectrumApplyMiniMaxH3",
  "ModelPreviewOverrideKJ",
  "H3MemoryOptimization",
  "H3AIMDOResidencyLimiter",
  "LoraLoaderModelOnly",
  "MiniMaxH3SigmaShift",
  "ModelSamplingMiniMaxH3",
  "H3ContinuumJoin"
]);

const message = (key, params = {}, locale = "zh-CN") => workflowMessage(key, params, locale);

function modelLink(value) {
  if (!Array.isArray(value) || typeof value[0] !== "string") return null;
  const output = value[1] === undefined ? 0 : value[1];
  return typeof output === "number" && Number.isInteger(output)
    ? [value[0], output]
    : null;
}

function requiredModelLink(value, locale) {
  const result = modelLink(value);
  if (result) return result;
  throw new Error(message("h3PatchChainUnknown", {}, locale));
}

function bypassClasses(workflow, input, ids, locale, visited = new Set()) {
  const link = requiredModelLink(input, locale);
  if (!ids.has(link[0])) return link;
  if (visited.has(link[0])) throw new Error(message("h3PatchChainCycle", {}, locale));
  const nextVisited = new Set(visited);
  nextVisited.add(link[0]);
  const node = workflow[link[0]];
  if (!node) throw new Error(message("h3PatchChainUnknown", {}, locale));
  return bypassClasses(workflow, node.inputs?.model, ids, locale, nextVisited);
}

function removeClasses(workflow, classes, locale) {
  const ids = new Set(
    Object.entries(workflow)
      .filter(([, node]) => classes.has(node.class_type ?? ""))
      .map(([id]) => id)
  );
  for (const classType of classes) {
    const matches = Object.values(workflow).filter((node) => node.class_type === classType);
    if (matches.length > 1) {
      throw new Error(message("h3PatchDuplicate", { nodeType: classType }, locale));
    }
  }
  if (!ids.size) return ids;
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (ids.has(nodeId) || !node.inputs) continue;
    for (const [name, value] of Object.entries(node.inputs)) {
      const link = modelLink(value);
      if (link && ids.has(link[0])) {
        node.inputs[name] = bypassClasses(workflow, link, ids, locale);
      }
    }
  }
  for (const id of ids) delete workflow[id];
  return ids;
}

function assertNoMixedAttentionOwners(workflow, locale) {
  const owners = new Set();
  for (const node of Object.values(workflow)) {
    if (!consumerClasses.has(node.class_type ?? "")) continue;
    let current = modelLink(node.inputs?.model);
    const visited = new Set();
    while (current) {
      if (visited.has(current[0])) throw new Error(message("h3PatchChainCycle", {}, locale));
      visited.add(current[0]);
      const patch = workflow[current[0]];
      if (!patch || !legacyChainClasses.has(patch.class_type ?? "")) break;
      if (patch.class_type === "PathchSageAttentionKJ") owners.add("sage");
      if (patch.class_type === "H3SLAAttention") owners.add("sla");
      if (patch.class_type === "H3SparseAttention" ||
          patch.class_type === "H3SparseAttentionAdvanced" ||
          patch.class_type === "BlockSparseAttention") owners.add("h3-sparse");
      if (patch.class_type === "ModelAttentionBackend") {
        owners.add(patch.inputs?.attention === "comfy kitchen attention" ? "comfy-kitchen" : "pytorch");
      }
      current = modelLink(patch.inputs?.model);
    }
  }
  if (owners.size > 1) throw new Error(message("h3AttentionConflict", {}, locale));
}

function nextNumericNodeId(workflow) {
  let next = Math.max(
    0,
    ...Object.keys(workflow).map((id) => Number.parseInt(id, 10) || 0)
  ) + 1;
  return () => {
    while (workflow[String(next)]) next += 1;
    return String(next++);
  };
}

function spectrumInputs(model, modelAwareMode) {
  return {
    model,
    enabled: true,
    blend_weight: 0.5,
    degree: 1,
    ridge_lambda: 0.1,
    window_size: 2,
    flex_window: 0.75,
    warmup_steps: 1,
    tail_actual_steps: 1,
    max_history: 8,
    debug: true,
    history_storage: "system_ram",
    offline_archive_storage: "system_ram",
    bootstrap_first_forecast: true,
    anchor_residual_feedback: false,
    selective_rollback_correction: false,
    // Keep legacy task rendering on the same safe single-pass Spectrum path
    // as new tasks; ComfyUI 0.35 dynamic-VRAM replay can stall while staging
    // the second H3 model pass after retaining the feature archive.
    offline_smoothing_replay: false,
    audio_blend_weight: 0,
    ...(modelAwareMode !== "off"
      ? { model_aware_mode: modelAwareMode, model_aware_risk_threshold: 0.65 }
      : {})
  };
}

function previewInputs(model, tinyVae) {
  return {
    model,
    max_resolution: 512,
    jpeg_quality: 72,
    suppress_default_preview: true,
    preview_frames: 1,
    preview_fps: 12,
    tiny_vae: tinyVae
  };
}

function consumersFor(workflow) {
  return Object.entries(workflow).filter(([, node]) =>
    consumerClasses.has(node.class_type ?? "") && Array.isArray(node.inputs?.model)
  );
}

function appendPostSamplingWrappers(workflow, options) {
  const locale = options.locale ?? "zh-CN";
  const consumers = consumersFor(workflow);
  if (!consumers.length) throw new Error(message("h3PatchConsumersMissing", {}, locale));
  if (
    !consumers.some(([, node]) => node.class_type === "BasicScheduler") ||
    !consumers.some(([, node]) => node.class_type === "BasicGuider" || node.class_type === "H3ContinuumSamplerV38")
  ) {
    throw new Error(message("h3PatchConsumersMissing", {}, locale));
  }
  const modelInputs = consumers.map(([, node]) => JSON.stringify(node.inputs?.model));
  if (modelInputs.some((input) => input !== modelInputs[0])) {
    throw new Error(message("h3PatchOutputsDiffer", {}, locale));
  }

  removeClasses(workflow, postSamplingClasses, locale);
  const refreshedConsumers = consumersFor(workflow);
  const allocate = nextNumericNodeId(workflow);
  let output = requiredModelLink(refreshedConsumers[0]?.[1].inputs?.model, locale);
  if (options.spectrumEnabled) {
    const id = allocate();
    workflow[id] = {
      class_type: "SpectrumApplyMiniMaxH3",
      inputs: spectrumInputs(output, options.spectrumModelAwareMode ?? "off")
    };
    output = [id, 0];
  }
  if (options.previewEnabled && options.tinyVae?.trim()) {
    const id = allocate();
    workflow[id] = {
      class_type: "ModelPreviewOverrideKJ",
      inputs: previewInputs(output, options.tinyVae.trim())
    };
    output = [id, 0];
  }
  for (const [, consumer] of refreshedConsumers) consumer.inputs.model = output;
}

export function normalizeMiniMaxH3ModelPatchChain(workflow, options) {
  const locale = options.locale ?? "zh-CN";
  const removedMemory = removeClasses(workflow, withdrawnMemoryClasses, locale);
  assertNoMixedAttentionOwners(workflow, locale);

  const wantsPostSampling = options.spectrumEnabled === true ||
    (options.previewEnabled === true && Boolean(options.tinyVae?.trim()));
  const hasPostSampling = Object.values(workflow).some((node) =>
    postSamplingClasses.has(node.class_type ?? "")
  );
  const hasSigmaPostSampling = Object.values(workflow).some((node) =>
    node.class_type === "MiniMaxH3SigmaShift" || node.class_type === "ModelSamplingMiniMaxH3"
  );
  const consumers = consumersFor(workflow);
  const modelInputs = consumers.map(([, node]) => JSON.stringify(node.inputs?.model));
  if (modelInputs.some((input) => input !== modelInputs[0])) {
    throw new Error(message("h3PatchOutputsDiffer", {}, locale));
  }

  if (!wantsPostSampling && !hasPostSampling) return;
  if (hasSigmaPostSampling) {
    appendPostSamplingWrappers(workflow, options);
    return;
  }
  if (!wantsPostSampling && !removedMemory.size) return;

  normalizeNativeMiniMaxH3ModelPatchChain(workflow, {
    modelId: options.modelId,
    inputMode: options.inputMode,
    attentionMode: options.attentionMode,
    videoLoras: options.videoLoras,
    spectrumEnabled: options.spectrumEnabled,
    spectrumModelAwareMode: options.spectrumModelAwareMode,
    previewEnabled: options.previewEnabled,
    tinyVae: options.tinyVae,
    locale: options.locale
  });
}
