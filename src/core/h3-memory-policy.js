import { modelCatalog } from "./catalog/index.js";
import { isH3Ref2vTurboEnabled, isH3SlaTurboLoraId, isH3TurboFourStepV11LoraId, isH3TurboV4LoraId, isH3TurboEnabled, videoLoraCompatibleWithModel } from "./video-loras.js";

/**
 * Gate A: keep the optimization opt-in until a real ComfyUI smoke run has
 * established the supported model/node/runtime combinations.
 */
export const H3_MEMORY_DEFAULT_ENABLED = false;
export const H3_MEMORY_PRODUCT_ENABLED = false;
export const H3_MEMORY_DEFAULT_MODE = H3_MEMORY_DEFAULT_ENABLED ? "auto" : "off";
export const H3_MEMORY_DEFAULT_CHUNK_ROWS = 4096;
export const H3_MEMORY_MIN_CHUNK_ROWS = 256;
export const H3_MEMORY_MAX_CHUNK_ROWS = 65536;
export const H3_MEMORY_CHUNK_ROW_STEP = 256;
export function h3MemoryPrecisionModeFor(memoryMode) {
    if (memoryMode === "preserve-native")
        return "Preserve native";
    if (memoryMode === "force-quant")
        return "Force quant";
    return "Auto";
}
export function normalizeH3MemoryOptimizationMode(_value, _fallback = H3_MEMORY_DEFAULT_MODE) {
    return "off";
}
export function normalizeH3MemoryChunkRows(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return H3_MEMORY_DEFAULT_CHUNK_ROWS;
    }
    const rounded = Math.round(value / H3_MEMORY_CHUNK_ROW_STEP) * H3_MEMORY_CHUNK_ROW_STEP;
    return Math.min(H3_MEMORY_MAX_CHUNK_ROWS, Math.max(H3_MEMORY_MIN_CHUNK_ROWS, rounded));
}
export function normalizeH3MemoryOptions(value, fallbackMode = H3_MEMORY_DEFAULT_MODE) {
    return {
        h3MemoryOptimizationMode: normalizeH3MemoryOptimizationMode(value.h3MemoryOptimizationMode, fallbackMode),
        h3MemoryOptimizationUserSet: false,
        h3MemoryChunkRows: normalizeH3MemoryChunkRows(value.h3MemoryChunkRows)
    };
}
export function normalizeDraftH3MemoryOptions(draft) {
    return {
        ...draft,
        ...normalizeH3MemoryOptions(draft)
    };
}
function attentionOwnerFor(value, normalizedFrom) {
    if (value === "pytorch")
        return "pytorch";
    if (value === "h3-sparse")
        return "h3-sparse";
    if (value === "sla")
        return "sla";
    if (value === "sage" || value === "sage-triton" || value === undefined) {
        return "sage";
    }
    normalizedFrom.push(`attention:${String(value)}->sage`);
    return "sage";
}
function turboProfileFor(input) {
    const model = input.modelId;
    const loras = input.videoLoras ?? [];
    if (loras.some((lora) => isH3SlaTurboLoraId(lora.id) && videoLoraCompatibleWithModel(lora, model))) {
        return "h3-turbo-sla";
    }
    if (loras.some((lora) => isH3TurboV4LoraId(lora.id) && videoLoraCompatibleWithModel(lora, model))) {
        return "h3-turbo-v4";
    }
    if (loras.some((lora) => isH3TurboFourStepV11LoraId(lora.id) && videoLoraCompatibleWithModel(lora, model))) {
        return "h3-turbo-v11";
    }
    if (isH3Ref2vTurboEnabled({ modelId: model, videoLoras: loras }))
        return "h3-ref2v-turbo";
    if (isH3TurboEnabled({ modelId: model, videoLoras: loras }))
        return "h3-turbo";
    return undefined;
}
export function resolveMiniMaxH3ExecutionPlan(input) {
    const definition = modelCatalog.get(input.modelId)?.definition;
    const isH3 = definition?.family === "minimax-h3";
    const isQ3 = definition?.runtimeProfile === "h3-q3-3080";
    const motionContext = input.inputMode === "video" && definition?.variant === "r2v";
    const memory = normalizeH3MemoryOptimizationMode(input.h3MemoryOptimizationMode);
    const chunkRows = normalizeH3MemoryChunkRows(input.h3MemoryChunkRows);
    const normalizedFrom = [];
    if (input.h3MemoryOptimizationMode !== undefined &&
        input.h3MemoryOptimizationMode !== memory) {
        normalizedFrom.push(`memory:${String(input.h3MemoryOptimizationMode)}->${memory}`);
    }
    const turboProfile = turboProfileFor(input);
    const configuredAttention = attentionOwnerFor(input.attentionMode, normalizedFrom);
    const attention = turboProfile === "h3-turbo-sla"
        ? "sla"
        : memory !== "off" && configuredAttention === "sage"
            ? "pytorch"
            : configuredAttention;
    if (turboProfile === "h3-turbo-sla" && configuredAttention !== "sla") {
        normalizedFrom.push(`attention:${configuredAttention}->sla`);
    }
    else if (memory !== "off" && configuredAttention === "sage") {
        normalizedFrom.push(`attention:${input.attentionMode ?? "sage"}->pytorch`);
    }
    const spectrumRequested = input.spectrumMode === "balanced";
    const spectrumSupported = definition?.capabilities?.supportsSpectrum === true && !motionContext;
    const reasons = [];
    if (spectrumRequested && !spectrumSupported) {
        reasons.push(motionContext ? "motion-context-spectrum-conflict" : "spectrum-unsupported");
    }
    if (memory !== "off") {
        if (!isH3)
            reasons.push("not-minimax-h3");
        if (isQ3)
            reasons.push("q3-gguf-not-supported");
        if (motionContext)
            reasons.push("motion-context-not-supported");
        if (turboProfile)
            reasons.push("turbo-memory-not-validated");
        if (input.memoryNode !== undefined) {
            if (!input.memoryNode) {
                reasons.push("memory-node-missing");
            }
            else {
                if (!input.memoryNode.installed)
                    reasons.push("memory-node-missing");
                if (input.memoryNode.loaded === false)
                    reasons.push("memory-node-not-loaded");
                if (input.memoryNode.compatibilityState === "error")
                    reasons.push("memory-node-incompatible");
                if (input.memoryNode.runtimeMissingNodeTypes?.includes("H3MemoryOptimization")) {
                    reasons.push("memory-node-runtime-missing");
                }
            }
        }
    }
    const graphOwners = input.existingGraphAttentionOwners ?? [];
    if (graphOwners.length > 1 || (graphOwners[0] && graphOwners[0] !== attention)) {
        reasons.push("attention-conflict");
    }
    const previewEnabled = isH3 &&
        input.h3LivePreview === true &&
        definition?.capabilities?.supportsLivePreview !== false;
    return {
        attention,
        memory,
        spectrumEnabled: spectrumRequested && spectrumSupported,
        spectrumRequested,
        turboProfile,
        previewEnabled,
        allowed: reasons.length === 0,
        reasons,
        ...(normalizedFrom.length ? { normalizedFrom } : {}),
        chunkRows
    };
}
