import { h3MemoryPrecisionModeFor, normalizeH3MemoryChunkRows, normalizeH3MemoryOptimizationMode, resolveMiniMaxH3ExecutionPlan } from "./h3-memory-policy.js";
import { workflowMessage } from "./runtime/workflow-messages.js";
const consumerClasses = new Set(["BasicScheduler", "BasicGuider"]);
const managedClasses = new Set([
    "H3MemoryOptimization",
    "SpectrumApplyMiniMaxH3",
    "H3AIMDOResidencyLimiter",
    "ModelPreviewOverrideKJ"
]);
const attentionClasses = new Set([
    "PathchSageAttentionKJ",
    "H3SLAAttention",
    "H3SparseAttention",
    "H3SparseAttentionAdvanced"
]);
const knownModelPatchClasses = new Set([
    ...managedClasses,
    ...attentionClasses,
    "LoraLoaderModelOnly",
    "MiniMaxH3SigmaShift",
    "ModelSamplingMiniMaxH3"
]);
const message = (key, params = {}, locale = "zh-CN") => workflowMessage(key, params, locale);
function modelLink(value) {
    if (!Array.isArray(value) || typeof value[0] !== "string")
        return null;
    const output = value[1] === undefined ? 0 : value[1];
    if (typeof output !== "number" || !Number.isInteger(output))
        return null;
    return [value[0], output];
}
function requiredModelLink(value, locale, cycle = false) {
    const result = modelLink(value);
    if (result)
        return result;
    throw new Error(message(cycle ? "h3PatchChainCycle" : "h3PatchChainUnknown", {}, locale));
}
function attentionOwnerForClass(classType) {
    if (classType === "PathchSageAttentionKJ")
        return "sage";
    if (classType === "H3SLAAttention")
        return "sla";
    if (classType === "H3SparseAttention" || classType === "H3SparseAttentionAdvanced")
        return "h3-sparse";
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
        const classType = node?.class_type;
        if (!node || !classType)
            throw new Error(message("h3PatchChainUnknown", {}, locale));
        const attentionOwner = attentionOwnerForClass(classType);
        if (attentionOwner)
            attentionOwners.push({ nodeId, owner: attentionOwner });
        if (!knownModelPatchClasses.has(classType)) {
            if (node.inputs && Object.prototype.hasOwnProperty.call(node.inputs, "model"))
                throw new Error(message("h3PatchChainUnknown", {}, locale));
            return { baseInput: current, attentionOwners };
        }
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
function validChunkRows(value) {
    return typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 256 &&
        value <= 65536 &&
        value % 256 === 0;
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
        offline_smoothing_replay: true,
        audio_blend_weight: 0,
        ...(modelAwareMode !== "off"
            ? {
                model_aware_mode: modelAwareMode,
                model_aware_risk_threshold: 0.65
            }
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
function nextNumericNodeId(workflow) {
    let next = Math.max(0, ...Object.keys(workflow).map((id) => Number.parseInt(id, 10) || 0)) + 1;
    return () => {
        while (workflow[String(next)])
            next += 1;
        const id = String(next);
        next += 1;
        return id;
    };
}
function bypassManagedLink(workflow, input, managedIds, locale, visited = new Set()) {
    const link = requiredModelLink(input, locale);
    const [nodeId] = link;
    if (!managedIds.has(nodeId))
        return link;
    if (visited.has(nodeId))
        throw new Error(message("h3PatchChainCycle", {}, locale));
    const nextVisited = new Set(visited);
    nextVisited.add(nodeId);
    const node = workflow[nodeId];
    if (!node)
        throw new Error(message("h3PatchChainUnknown", {}, locale));
    return bypassManagedLink(workflow, node.inputs?.model, managedIds, locale, nextVisited);
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
function assertManagedNodesReachable(workflow, consumers, requiredIds, locale) {
    if (!requiredIds.length)
        return;
    const reachable = new Set();
    for (const [, consumer] of consumers) {
        let current = modelLink(consumer.inputs?.model);
        const visited = new Set();
        while (current) {
            const [nodeId] = current;
            if (visited.has(nodeId))
                break;
            visited.add(nodeId);
            const node = workflow[nodeId];
            if (!node || !managedClasses.has(node.class_type ?? ""))
                break;
            reachable.add(nodeId);
            current = modelLink(node.inputs?.model);
        }
    }
    if (requiredIds.some((id) => !reachable.has(id)))
        throw new Error(message("h3PatchUnreachable", {}, locale));
}
export function normalizeMiniMaxH3ModelPatchChain(workflow, options) {
    const locale = options.locale ?? "zh-CN";
    const memoryMode = normalizeH3MemoryOptimizationMode(options.memoryMode, "off");
    const spectrumEnabled = options.spectrumEnabled === true;
    const previewEnabled = options.previewEnabled === true && Boolean(options.tinyVae?.trim());
    if (memoryMode !== "off" && options.chunkRows !== undefined && !validChunkRows(options.chunkRows)) {
        throw new Error(message("h3MemoryChunkRowsInvalid", {}, locale));
    }
    const chunkRows = normalizeH3MemoryChunkRows(options.chunkRows);
    if (memoryMode !== "off" && !validChunkRows(chunkRows)) {
        throw new Error(message("h3MemoryChunkRowsInvalid", {}, locale));
    }
    if (memoryMode !== "off" &&
        (options.attentionMode === undefined ||
            options.attentionMode === "sage" ||
            options.attentionMode === "sage-triton")) {
        const originalConsumerInputs = Object.values(workflow)
            .filter((node) => consumerClasses.has(node.class_type ?? "") && Array.isArray(node.inputs?.model))
            .map((node) => node.inputs?.model);
        if (originalConsumerInputs.some((input) => JSON.stringify(input) !== JSON.stringify(originalConsumerInputs[0]))) {
            throw new Error(message("h3PatchOutputsDiffer", {}, locale));
        }
        const sageNodeIds = new Set(Object.entries(workflow)
            .filter(([, node]) => node.class_type === "PathchSageAttentionKJ")
            .map(([id]) => id));
        for (const sageNodeId of sageNodeIds) {
            const upstreamModel = requiredModelLink(workflow[sageNodeId]?.inputs?.model, locale);
            for (const node of Object.values(workflow)) {
                if (!node.inputs)
                    continue;
                for (const [name, input] of Object.entries(node.inputs)) {
                    if (Array.isArray(input) && input[0] === sageNodeId) {
                        node.inputs[name] = upstreamModel;
                    }
                }
            }
            delete workflow[sageNodeId];
        }
    }
    const memoryIds = existingNodeIds(workflow, "H3MemoryOptimization", locale);
    const spectrumIds = existingNodeIds(workflow, "SpectrumApplyMiniMaxH3", locale);
    const residencyLimiterIds = existingNodeIds(workflow, "H3AIMDOResidencyLimiter", locale);
    const previewIds = existingNodeIds(workflow, "ModelPreviewOverrideKJ", locale);
    const managedIds = new Set([
        ...memoryIds,
        ...spectrumIds,
        ...residencyLimiterIds,
        ...previewIds
    ]);
    const consumers = Object.entries(workflow).filter(([, node]) => consumerClasses.has(node.class_type ?? "") && Array.isArray(node.inputs?.model));
    const needsModelChain = memoryMode !== "off" || spectrumEnabled || previewEnabled || managedIds.size > 0;
    if (!consumers.length) {
        if (needsModelChain)
            throw new Error(message("h3PatchConsumersMissing", {}, locale));
        return;
    }
    if (needsModelChain && (!consumers.some(([, node]) => node.class_type === "BasicScheduler") ||
        !consumers.some(([, node]) => node.class_type === "BasicGuider"))) {
        throw new Error(message("h3PatchConsumersMissing", {}, locale));
    }
    const finalModelInput = requiredModelLink(consumers[0]?.[1].inputs?.model, locale);
    if (consumers.some(([, node]) => JSON.stringify(node.inputs?.model) !== JSON.stringify(finalModelInput)))
        throw new Error(message("h3PatchOutputsDiffer", {}, locale));
    const inspections = consumers.map(([, node]) => inspectModelChain(workflow, node.inputs?.model, locale));
    const attentionOwners = [...new Map(inspections
        .flatMap((inspection) => inspection.attentionOwners)
        .map((item) => [item.nodeId, item.owner])).values()];
    const executionPlan = resolveMiniMaxH3ExecutionPlan({
        modelId: options.modelId,
        inputMode: options.inputMode,
        attentionMode: options.attentionMode,
        h3MemoryOptimizationMode: memoryMode,
        h3MemoryChunkRows: chunkRows,
        spectrumMode: spectrumEnabled ? "balanced" : "off",
        videoLoras: options.videoLoras,
        h3LivePreview: previewEnabled,
        existingGraphAttentionOwners: attentionOwners
    });
    if (executionPlan.reasons.includes("attention-conflict"))
        throw new Error(message("h3AttentionConflict", {}, locale));
    if (!executionPlan.allowed && (memoryMode !== "off" || spectrumEnabled)) {
        throw new Error(message("h3MemoryPlanRejected", {
            reasons: executionPlan.reasons.join(", ")
        }, locale));
    }
    const baseModelOutput = bypassManagedLink(workflow, finalModelInput, managedIds, locale);
    for (const id of managedIds)
        bypassManagedLink(workflow, [id, 0], managedIds, locale);
    replaceManagedReferences(workflow, managedIds, locale);
    for (const id of managedIds)
        delete workflow[id];
    for (const [, consumer] of consumers)
        consumer.inputs.model = baseModelOutput;
    const allocateNodeId = nextNumericNodeId(workflow);
    const memoryId = memoryMode !== "off" ? memoryIds[0] ?? allocateNodeId() : undefined;
    const spectrumId = spectrumEnabled ? spectrumIds[0] ?? allocateNodeId() : undefined;
    const residencyLimiterId = memoryMode !== "off"
        ? residencyLimiterIds[0] ?? allocateNodeId()
        : undefined;
    const previewId = previewEnabled ? previewIds[0] ?? allocateNodeId() : undefined;
    let output = baseModelOutput;
    if (memoryId) {
        const memoryInputs = {
            model: output,
            mlp_memory: "auto",
            chunk_rows: chunkRows,
            precision_mode: h3MemoryPrecisionModeFor(memoryMode),
            qkv_streaming_mode: "Auto"
        };
        if (!options.memoryInputNames || options.memoryInputNames.has("fused_qkv")) {
            memoryInputs.fused_qkv = "auto";
        }
        if (!options.memoryInputNames || options.memoryInputNames.has("preserve_precision")) {
            memoryInputs.preserve_precision = true;
        }
        workflow[memoryId] = {
            class_type: "H3MemoryOptimization",
            inputs: memoryInputs
        };
        output = [memoryId, 0];
    }
    if (spectrumId) {
        workflow[spectrumId] = {
            class_type: "SpectrumApplyMiniMaxH3",
            inputs: spectrumInputs(output, options.spectrumModelAwareMode ?? "off")
        };
        output = [spectrumId, 0];
    }
    if (residencyLimiterId) {
        workflow[residencyLimiterId] = {
            class_type: "H3AIMDOResidencyLimiter",
            inputs: {
                model: output,
                residency: "2 blocks"
            }
        };
        output = [residencyLimiterId, 0];
    }
    if (previewId) {
        workflow[previewId] = {
            class_type: "ModelPreviewOverrideKJ",
            inputs: previewInputs(output, options.tinyVae.trim())
        };
        output = [previewId, 0];
    }
    for (const [, consumer] of consumers)
        consumer.inputs.model = output;
    assertManagedNodesReachable(workflow, consumers, [memoryId, spectrumId, residencyLimiterId, previewId]
        .filter((id) => Boolean(id)), locale);
}
