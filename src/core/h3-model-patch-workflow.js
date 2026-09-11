import { resolveH3ExecutionPolicy } from "./h3-execution-policy.js";
import { workflowMessage } from "./runtime/workflow-messages.js";
const consumerClasses = new Set(["BasicScheduler", "BasicGuider", "H3ContinuumSamplerV38"]);
const legacyAttentionClasses = new Set([
    "PathchSageAttentionKJ",
    "H3SLAAttention",
    "H3SparseAttention",
    "H3SparseAttentionAdvanced"
]);
const withdrawnMemoryClasses = new Set([
    "H3MemoryOptimization",
    "H3AIMDOResidencyLimiter"
]);
const managedClasses = new Set([
    ...legacyAttentionClasses,
    ...withdrawnMemoryClasses,
    "SpectrumApplyMiniMaxH3",
    "ModelPreviewOverrideKJ",
    "ModelAttentionBackend",
    "BlockSparseAttention"
]);
const knownModelPatchClasses = new Set([
    ...managedClasses,
    "LoraLoaderModelOnly",
    "MiniMaxH3SigmaShift",
    "ModelSamplingMiniMaxH3",
    "H3ContinuumJoin"
]);
const message = (key, params = {}, locale = "zh-CN") => workflowMessage(key, params, locale);
function modelLink(value) {
    if (!Array.isArray(value) || typeof value[0] !== "string")
        return null;
    const output = value[1] === undefined ? 0 : value[1];
    return typeof output === "number" && Number.isInteger(output)
        ? [value[0], output]
        : null;
}
function requiredModelLink(value, locale) {
    const result = modelLink(value);
    if (result)
        return result;
    throw new Error(message("h3PatchChainUnknown", {}, locale));
}
function attentionOwnerForNode(node) {
    if (node.class_type === "PathchSageAttentionKJ")
        return "sage";
    if (node.class_type === "H3SLAAttention")
        return "sla";
    if (node.class_type === "H3SparseAttention" || node.class_type === "H3SparseAttentionAdvanced" || node.class_type === "BlockSparseAttention")
        return "h3-sparse";
    if (node.class_type === "ModelAttentionBackend") {
        return node.inputs?.attention === "comfy kitchen attention" ? "comfy-kitchen" : "pytorch";
    }
    return null;
}
function inspectModelChain(workflow, finalInput, locale) {
    let current = requiredModelLink(finalInput, locale);
    const visited = new Set();
    const attentionOwners = [];
    while (true) {
        const [nodeId] = current;
        if (visited.has(nodeId))
            throw new Error(message("h3PatchChainCycle", {}, locale));
        visited.add(nodeId);
        const node = workflow[nodeId];
        if (!node?.class_type)
            throw new Error(message("h3PatchChainUnknown", {}, locale));
        const owner = attentionOwnerForNode(node);
        if (owner)
            attentionOwners.push({ nodeId, owner });
        if (!knownModelPatchClasses.has(node.class_type))
            return { attentionOwners };
        current = requiredModelLink(node.inputs?.model, locale);
    }
}
function existingNodeIds(workflow, classType, locale) {
    const ids = Object.entries(workflow)
        .filter(([, node]) => node.class_type === classType)
        .map(([id]) => id);
    if (ids.length > 1)
        throw new Error(message("h3PatchDuplicate", { nodeType: classType }, locale));
    return ids;
}
function nextNumericNodeId(workflow) {
    let next = Math.max(0, ...Object.keys(workflow).map((id) => Number.parseInt(id, 10) || 0)) + 1;
    return () => {
        while (workflow[String(next)])
            next += 1;
        return String(next++);
    };
}
function bypassManagedLink(workflow, input, managedIds, locale, visited = new Set()) {
    const link = requiredModelLink(input, locale);
    if (!managedIds.has(link[0]))
        return link;
    if (visited.has(link[0]))
        throw new Error(message("h3PatchChainCycle", {}, locale));
    const next = new Set(visited);
    next.add(link[0]);
    const node = workflow[link[0]];
    if (!node)
        throw new Error(message("h3PatchChainUnknown", {}, locale));
    return bypassManagedLink(workflow, node.inputs?.model, managedIds, locale, next);
}
function replaceManagedReferences(workflow, managedIds, locale) {
    for (const [nodeId, node] of Object.entries(workflow)) {
        if (managedIds.has(nodeId) || !node.inputs)
            continue;
        for (const [name, value] of Object.entries(node.inputs)) {
            if (!Array.isArray(value) || typeof value[0] !== "string" || !managedIds.has(value[0]))
                continue;
            node.inputs[name] = bypassManagedLink(workflow, value, managedIds, locale);
        }
    }
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
        // Keep the application graph single-pass on the 4090/native VRAM path.
        // Spectrum's offline replay retains a multi-GB feature archive and then
        // reloads the H3 model for a second pass; on ComfyUI 0.35 this can stall
        // during dynamic-VRAM model staging. Spectrum's adaptive forecast remains
        // enabled; replay is still available to manually authored graphs.
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
function sageInputs(model, attentionMode) {
    return {
        model,
        sage_attention: attentionMode === "sage-triton"
            ? "sageattn_qk_int8_pv_fp16_triton"
            : "sageattn_qk_int8_pv_fp16_cuda",
        allow_compile: false
    };
}
function sparseInputs(model, mode) {
    const selection = mode === "native-sla" ? "sla" : mode;
    return {
        model,
        // ComfyUI 0.35 DynamicCombo inputs use a flat API payload. ComfyUI
        // rebuilds these keys into { selection, tau/keep_percent } immediately
        // before calling BlockSparseAttention.execute().
        selection,
        ...(mode === "sol-attn"
            ? { "selection.tau": 1.3 }
            : { "selection.keep_percent": 10 }),
        start_percent: 0.2,
        end_percent: 1.0,
        dense_blocks: "",
        min_tokens: 12288,
        extra_tokens: 256,
        sink_conditioning: "exact_kv_and_rows",
        verbose: false
    };
}
function assertConsumers(workflow, locale, needsModelChain) {
    const consumers = Object.entries(workflow).filter(([, node]) => consumerClasses.has(node.class_type ?? "") && Array.isArray(node.inputs?.model));
    if (!consumers.length && needsModelChain)
        throw new Error(message("h3PatchConsumersMissing", {}, locale));
    if (needsModelChain && (!consumers.some(([, node]) => node.class_type === "BasicScheduler") ||
        !consumers.some(([, node]) => node.class_type === "BasicGuider" || node.class_type === "H3ContinuumSamplerV38")))
        throw new Error(message("h3PatchConsumersMissing", {}, locale));
    return consumers;
}
export function normalizeMiniMaxH3ModelPatchChain(workflow, options) {
    const locale = options.locale ?? "zh-CN";
    const spectrumEnabled = options.spectrumEnabled === true;
    const previewEnabled = options.previewEnabled === true && Boolean(options.tinyVae?.trim());
    const policy = resolveH3ExecutionPolicy({
        modelId: options.modelId,
        inputMode: options.inputMode,
        attentionMode: options.attentionMode,
        sparseAttentionMode: options.sparseAttentionMode,
        runtimeMode: options.runtimeMode,
        comfyCompilerMode: options.comfyCompilerMode,
        spectrumMode: spectrumEnabled ? "balanced" : "off",
        videoLoras: options.videoLoras,
        h3LivePreview: previewEnabled
    });
    if (!policy.allowed && (spectrumEnabled || policy.sparseAttentionMode !== "off")) {
        throw new Error(`H3 执行策略不可用：${policy.reasons.join("、")}`);
    }
    const attentionIds = [
        ...[...legacyAttentionClasses].flatMap((classType) => existingNodeIds(workflow, classType, locale)),
        ...[...withdrawnMemoryClasses].flatMap((classType) => existingNodeIds(workflow, classType, locale))
    ];
    const spectrumIds = existingNodeIds(workflow, "SpectrumApplyMiniMaxH3", locale);
    const previewIds = existingNodeIds(workflow, "ModelPreviewOverrideKJ", locale);
    const backendIds = existingNodeIds(workflow, "ModelAttentionBackend", locale);
    const sparseIds = existingNodeIds(workflow, "BlockSparseAttention", locale);
    const existingSageNodeId = attentionIds.find((id) => workflow[id]?.class_type === "PathchSageAttentionKJ");
    const existingBackendNodeId = backendIds[0];
    const managedIds = new Set([...attentionIds, ...spectrumIds, ...previewIds, ...backendIds, ...sparseIds]);
    const consumers = assertConsumers(workflow, locale, managedIds.size > 0 || isH3ChainPolicyActive(policy));
    if (!consumers.length)
        return h3ExecutionPolicySnapshotForPolicy(policy, spectrumEnabled, previewEnabled);
    const finalInputs = consumers.map(([, node]) => JSON.stringify(node.inputs?.model));
    if (finalInputs.some((input) => input !== finalInputs[0])) {
        throw new Error(message("h3PatchOutputsDiffer", {}, locale));
    }
    const owners = [...new Set(consumers.flatMap(([, node]) => inspectModelChain(workflow, node.inputs?.model, locale).attentionOwners.map((item) => item.owner)))];
    if (owners.length > 1)
        throw new Error(message("h3AttentionConflict", {}, locale));
    const finalModelInput = requiredModelLink(consumers[0][1].inputs?.model, locale);
    const baseModelOutput = bypassManagedLink(workflow, finalModelInput, managedIds, locale);
    replaceManagedReferences(workflow, managedIds, locale);
    for (const id of managedIds)
        delete workflow[id];
    for (const [, consumer] of consumers)
        consumer.inputs.model = baseModelOutput;
    const allocate = nextNumericNodeId(workflow);
    let output = baseModelOutput;
    const needsDensePatch = policy.attentionMode === "sage" || policy.attentionMode === "sage-triton" || policy.attentionMode === "comfy-kitchen";
    if (needsDensePatch) {
        const nodeId = policy.attentionMode === "comfy-kitchen"
            ? existingBackendNodeId ?? allocate()
            : existingSageNodeId ?? allocate();
        workflow[nodeId] = policy.attentionMode === "comfy-kitchen"
            ? { class_type: "ModelAttentionBackend", inputs: { model: output, attention: "comfy kitchen attention" } }
            : { class_type: "PathchSageAttentionKJ", inputs: sageInputs(output, policy.attentionMode) };
        output = [nodeId, 0];
    }
    if (policy.sparseAttentionMode !== "off") {
        const nodeId = sparseIds[0] ?? allocate();
        workflow[nodeId] = { class_type: "BlockSparseAttention", inputs: sparseInputs(output, policy.sparseAttentionMode) };
        output = [nodeId, 0];
    }
    if (spectrumEnabled) {
        const nodeId = spectrumIds[0] ?? allocate();
        workflow[nodeId] = {
            class_type: "SpectrumApplyMiniMaxH3",
            inputs: spectrumInputs(output, options.spectrumModelAwareMode ?? "off")
        };
        output = [nodeId, 0];
    }
    if (previewEnabled) {
        const nodeId = previewIds[0] ?? allocate();
        workflow[nodeId] = {
            class_type: "ModelPreviewOverrideKJ",
            inputs: previewInputs(output, options.tinyVae.trim())
        };
        output = [nodeId, 0];
    }
    for (const [, consumer] of consumers)
        consumer.inputs.model = output;
    return h3ExecutionPolicySnapshotForPolicy(policy, spectrumEnabled, previewEnabled);
}
function isH3ChainPolicyActive(policy) {
    return policy.attentionMode !== "pytorch" || policy.sparseAttentionMode !== "off" || policy.spectrumEnabled || policy.previewEnabled;
}
function h3ExecutionPolicySnapshotForPolicy(policy, spectrumEnabled, previewEnabled) {
    return {
        attentionMode: policy.attentionMode,
        attentionOwner: policy.attentionOwner,
        sparseAttentionMode: policy.sparseAttentionMode,
        runtimeMode: policy.runtimeMode,
        comfyCompilerMode: policy.comfyCompilerMode,
        spectrumEnabled: spectrumEnabled && policy.spectrumEnabled,
        ...(policy.turboProfile ? { turboProfile: policy.turboProfile } : {}),
        previewEnabled,
        allowed: policy.allowed,
        reasons: [...policy.reasons]
    };
}
