import { H3_AFTER_MIDNIGHT_LORA_ID, H3_TURBO_LORA_FILENAME, H3_TURBO_LORA_ID, isH3Ref2vTurboEnabled, isH3SlaTurboLoraId, isH3TurboFourStepV11LoraId, isH3TurboV4LoraId, isH3TurboLoraId, videoLoraCompatibleWithModel, videoLoraFilename, videoPromptForLoras } from "./video-loras.js";
import { modelCatalog } from "./catalog/index.js";
import { normalizeVideoSteps, resolveVideoGenerationPolicy, shouldApplySpectrum } from "./video-policy.js";
import { workflowMessage } from "./runtime/workflow-messages.js";
export function isMiniMaxH3Fl2vaModel(modelId) {
    return modelCatalog.get(modelId)?.definition.variant === "fl2va";
}
export function isMiniMaxH3BoundaryExtensionModel(modelId) {
    const variant = modelCatalog.get(modelId)?.definition.variant;
    return variant === "fl2va" || variant === "turbo";
}
export const retiredVideoModelIds = [
    "wan22_5b",
    "hunyuan15",
    "hunyuan15_sr",
    "wan22_remix",
    "wan22_smoothmix",
    "wan22_dasiwa"
];
export function isRetiredVideoModel(modelId) {
    return retiredVideoModelIds.includes(modelId);
}
export function isMiniMaxH3TurboModel(modelId) {
    return modelCatalog.get(modelId)?.definition.variant === "turbo";
}
export function isMiniMaxH3R2vModel(modelId) {
    return modelCatalog.get(modelId)?.definition.variant === "r2v" ||
        modelId === "minimax_h3_ref2va_turbo";
}
export function isMiniMaxH3Model(modelId) {
    return modelCatalog.isFamily(modelId, "minimax-h3");
}
const h3WorkflowPairs = [
    ["minimax_h3_i2v_api.json", "minimax_h3_t2va_api.json"],
    ["minimax_h3_fl2va_turbo_api.json", "minimax_h3_t2va_turbo_api.json"],
    ["minimax_h3_i2v_gguf_q3_api.json", "minimax_h3_t2va_gguf_q3_api.json"]
];
export function h3WorkflowPathForInput(workflowPath, modelId, hasReference) {
    if (!isMiniMaxH3Model(modelId) || isMiniMaxH3R2vModel(modelId))
        return workflowPath;
    const separatorIndex = Math.max(workflowPath.lastIndexOf("/"), workflowPath.lastIndexOf("\\"));
    const filename = workflowPath.slice(separatorIndex + 1);
    const pair = hasReference
        ? h3WorkflowPairs.find(([, textOnlyFilename]) => textOnlyFilename === filename)
        : h3WorkflowPairs.find(([imageFilename]) => imageFilename === filename);
    const targetFilename = hasReference ? pair?.[0] : pair?.[1];
    return targetFilename
        ? `${workflowPath.slice(0, separatorIndex + 1)}${targetFilename}`
        : workflowPath;
}
export function isMiniMaxH3Q3GgufModel(modelId) {
    return modelCatalog.get(modelId)?.definition.runtimeProfile === "h3-q3-3080";
}
export function isMiniMaxH3SpectrumEligible(modelId) {
    return modelCatalog.get(modelId)?.definition.capabilities?.supportsSpectrum === true;
}
export function isMiniMaxH3LivePreviewSupported(modelId) {
    return modelCatalog.get(modelId)?.definition.capabilities?.supportsLivePreview !== false;
}
function applyMiniMaxH3Spectrum(workflow, locale = "zh-CN", modelAwareMode = "off") {
    const consumers = Object.entries(workflow).filter(([, node]) => (node.class_type === "BasicScheduler" || node.class_type === "BasicGuider") &&
        Array.isArray(node.inputs?.model));
    if (!consumers.length) {
        throw new Error(workflowMessage("spectrumConsumersMissing", {}, locale));
    }
    const existing = Object.entries(workflow).find(([, node]) => node.class_type === "SpectrumApplyMiniMaxH3");
    const upstream = existing?.[1].inputs?.model ?? consumers[0]?.[1].inputs?.model;
    if (!Array.isArray(upstream) || typeof upstream[0] !== "string") {
        throw new Error(workflowMessage("spectrumOutputUnknown", {}, locale));
    }
    if (!existing && consumers.some(([, node]) => JSON.stringify(node.inputs?.model) !== JSON.stringify(upstream))) {
        throw new Error(workflowMessage("spectrumOutputsDiffer", {}, locale));
    }
    const numericIds = Object.keys(workflow)
        .map(Number)
        .filter(Number.isFinite);
    const nodeId = existing?.[0] ?? String((numericIds.length ? Math.max(...numericIds) : 0) + 1);
    workflow[nodeId] = {
        class_type: "SpectrumApplyMiniMaxH3",
        inputs: {
            model: upstream,
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
            ...(modelAwareMode && modelAwareMode !== "off"
                ? {
                    model_aware_mode: modelAwareMode,
                    model_aware_risk_threshold: 0.65
                }
                : {})
        }
    };
    for (const [, node] of consumers)
        node.inputs.model = [nodeId, 0];
}
function applyMiniMaxH3LivePreview(workflow, tinyVae) {
    if (!tinyVae)
        return;
    const consumers = Object.values(workflow).filter((node) => (node.class_type === "BasicScheduler" || node.class_type === "BasicGuider") &&
        Array.isArray(node.inputs?.model));
    const modelInput = consumers[0]?.inputs?.model;
    if (!Array.isArray(modelInput) || typeof modelInput[0] !== "string")
        return;
    if (consumers.some((node) => JSON.stringify(node.inputs?.model) !== JSON.stringify(modelInput)))
        return;
    const numericIds = Object.keys(workflow)
        .map(Number)
        .filter(Number.isFinite);
    const nodeId = String((numericIds.length ? Math.max(...numericIds) : 0) + 1);
    workflow[nodeId] = {
        class_type: "ModelPreviewOverrideKJ",
        inputs: {
            model: modelInput,
            max_resolution: 512,
            jpeg_quality: 72,
            suppress_default_preview: true,
            preview_frames: 1,
            preview_fps: 12,
            tiny_vae: tinyVae
        }
    };
    for (const node of consumers)
        node.inputs.model = [nodeId, 0];
}
function applyVideoLoraStack(workflow, task, locale = "zh-CN") {
    const selected = task.videoLoras ?? [];
    if (!isMiniMaxH3Model(task.modelId) || selected.length === 0)
        return;
    const attentionNodes = Object.values(workflow).filter((node) => (node.class_type === "PathchSageAttentionKJ" || node.class_type === "H3SLAAttention") &&
        Array.isArray(node.inputs?.model));
    const directConsumers = Object.values(workflow).filter((node) => (node.class_type === "BasicScheduler" || node.class_type === "BasicGuider") &&
        Array.isArray(node.inputs?.model));
    const targets = attentionNodes.length ? attentionNodes : directConsumers;
    const targetInput = targets[0]?.inputs?.model;
    if (!Array.isArray(targetInput) || typeof targetInput[0] !== "string") {
        throw new Error(workflowMessage("loraChainUnknown", {}, locale));
    }
    if (targets.some((node) => JSON.stringify(node.inputs?.model) !== JSON.stringify(targetInput))) {
        throw new Error(workflowMessage("loraChainsDiffer", {}, locale));
    }
    const existingChain = [];
    const selectedFilenames = new Set(selected.map((lora) => lora.filename.toLowerCase()));
    const visited = new Set();
    let rootInput = [...targetInput];
    while (typeof rootInput[0] === "string") {
        const nodeId = rootInput[0];
        if (visited.has(nodeId)) {
            throw new Error(workflowMessage("loraChainCycle", {}, locale));
        }
        const node = workflow[nodeId];
        const loraName = typeof node?.inputs?.lora_name === "string"
            ? node.inputs.lora_name.toLowerCase()
            : "";
        if (node?.class_type !== "LoraLoaderModelOnly" ||
            !Array.isArray(node.inputs?.model) ||
            !selectedFilenames.has(loraName))
            break;
        visited.add(nodeId);
        existingChain.unshift(nodeId);
        rootInput = [...node.inputs.model];
    }
    let nextNodeId = Math.max(0, ...Object.keys(workflow).map((id) => Number.parseInt(id, 10) || 0)) + 1;
    while (workflow[String(nextNodeId)])
        nextNodeId += 1;
    let output = rootInput;
    selected.forEach((lora, index) => {
        const nodeId = existingChain[index] ?? String(nextNodeId++);
        workflow[nodeId] = {
            class_type: "LoraLoaderModelOnly",
            inputs: {
                model: output,
                lora_name: lora.filename,
                strength_model: lora.strength
            }
        };
        output = [nodeId, 0];
    });
    for (const obsoleteNodeId of existingChain.slice(selected.length)) {
        delete workflow[obsoleteNodeId];
    }
    for (const target of targets)
        target.inputs.model = output;
}
const h3SlaAttentionInputs = (model) => ({
    model,
    sparsity_ratio: 0.85,
    block_size: "64",
    min_seq_len: 4096,
    dense_last_steps: 1,
    protect_audio: true,
    enabled: true,
    dense_steps: "0",
    dense_backend: "comfy_kitchen",
    disable_fp16_accum: true,
    stabilize_motion: true
});
function applyMiniMaxH3SlaAttention(workflow, task, locale = "zh-CN") {
    const enabled = isMiniMaxH3Model(task.modelId) &&
        !isMiniMaxH3R2vModel(task.modelId) &&
        task.videoLoras?.some((lora) => isH3SlaTurboLoraId(lora.id) && videoLoraCompatibleWithModel(lora, task.modelId)) === true;
    if (!enabled)
        return;
    const consumers = Object.entries(workflow).filter(([, node]) => (node.class_type === "BasicScheduler" || node.class_type === "BasicGuider") &&
        Array.isArray(node.inputs?.model));
    if (!consumers.length) {
        throw new Error(workflowMessage("slaConsumersMissing", {}, locale));
    }
    const existing = Object.entries(workflow).find(([, node]) => node.class_type === "H3SLAAttention" && Array.isArray(node.inputs?.model));
    if (existing) {
        const [nodeId, node] = existing;
        const upstream = node.inputs?.model;
        if (!Array.isArray(upstream) || typeof upstream[0] !== "string" || upstream[0] === nodeId) {
            throw new Error(workflowMessage("slaOutputUnknown", {}, locale));
        }
        node.inputs = h3SlaAttentionInputs(upstream);
        return;
    }
    const sageNodes = Object.entries(workflow).filter(([, node]) => node.class_type === "PathchSageAttentionKJ" && Array.isArray(node.inputs?.model));
    const sigmaNodes = Object.entries(workflow).filter(([, node]) => (node.class_type === "MiniMaxH3SigmaShift" || node.class_type === "ModelSamplingMiniMaxH3") &&
        Array.isArray(node.inputs?.model));
    const targets = sageNodes.length ? sageNodes : sigmaNodes.length ? sigmaNodes : consumers;
    const upstream = targets[0]?.[1].inputs?.model;
    if (!Array.isArray(upstream) || typeof upstream[0] !== "string") {
        throw new Error(workflowMessage("slaOutputUnknown", {}, locale));
    }
    if (targets.some(([, node]) => JSON.stringify(node.inputs?.model) !== JSON.stringify(upstream))) {
        throw new Error(workflowMessage("slaOutputsDiffer", {}, locale));
    }
    if (sageNodes.length) {
        const [nodeId, node] = sageNodes[0];
        node.class_type = "H3SLAAttention";
        node.inputs = h3SlaAttentionInputs(upstream);
        for (const [obsoleteId] of sageNodes.slice(1)) {
            for (const candidate of Object.values(workflow)) {
                if (!candidate.inputs)
                    continue;
                for (const [name, input] of Object.entries(candidate.inputs)) {
                    if (Array.isArray(input) && input[0] === obsoleteId) {
                        candidate.inputs[name] = [nodeId, 0];
                    }
                }
            }
            delete workflow[obsoleteId];
        }
        return;
    }
    if (sigmaNodes.length) {
        const numericIds = Object.keys(workflow)
            .map(Number)
            .filter(Number.isFinite);
        let nodeId = String((numericIds.length ? Math.max(...numericIds) : 0) + 1);
        while (workflow[nodeId])
            nodeId = String(Number(nodeId) + 1);
        workflow[nodeId] = {
            class_type: "H3SLAAttention",
            inputs: h3SlaAttentionInputs(upstream)
        };
        for (const [, sigma] of sigmaNodes)
            sigma.inputs.model = [nodeId, 0];
        return;
    }
    const numericIds = Object.keys(workflow)
        .map(Number)
        .filter(Number.isFinite);
    let nodeId = String((numericIds.length ? Math.max(...numericIds) : 0) + 1);
    while (workflow[nodeId])
        nodeId = String(Number(nodeId) + 1);
    workflow[nodeId] = {
        class_type: "H3SLAAttention",
        inputs: h3SlaAttentionInputs(upstream)
    };
    for (const [, consumer] of consumers)
        consumer.inputs.model = [nodeId, 0];
}
/**
 * The bundled H3 graphs are kept as conservative baselines and receive the
 * model-specific Turbo sampler patch at render time. Ref2VA Turbo uses the
 * original v0.1 shift, the current official FL2VA v1.1 768p LoRA uses the
 * updated shift, and the optional v4 step600 quality variant uses its own
 * 6–8-step shift contract. This keeps old persisted tasks renderable without
 * allowing one Turbo variant's settings to leak into another path.
 */
function applyMiniMaxH3Ref2vTurboSampling(workflow, task) {
    const ref2vTurbo = isH3Ref2vTurboEnabled(task);
    const fl2vaV11Turbo = isMiniMaxH3Fl2vaModel(task.modelId) &&
        Boolean(task.videoLoras?.some((lora) => isH3TurboFourStepV11LoraId(lora.id) && videoLoraCompatibleWithModel(lora, task.modelId)));
    const fl2vaV4Turbo = isMiniMaxH3Fl2vaModel(task.modelId) &&
        Boolean(task.videoLoras?.some((lora) => isH3TurboV4LoraId(lora.id) && videoLoraCompatibleWithModel(lora, task.modelId)));
    const fl2vaSlaTurbo = isMiniMaxH3Model(task.modelId) &&
        !isMiniMaxH3R2vModel(task.modelId) &&
        Boolean(task.videoLoras?.some((lora) => isH3SlaTurboLoraId(lora.id) && videoLoraCompatibleWithModel(lora, task.modelId)));
    const afterMidnight = Boolean(task.videoLoras?.some((lora) => lora.id === H3_AFTER_MIDNIGHT_LORA_ID && videoLoraCompatibleWithModel(lora, task.modelId)));
    if (!ref2vTurbo && !fl2vaV11Turbo && !fl2vaV4Turbo && !fl2vaSlaTurbo && !afterMidnight)
        return;
    const sampler = Object.values(workflow).find((node) => node.class_type === "KSamplerSelect");
    const schedulers = Object.values(workflow).filter((node) => node.class_type === "BasicScheduler");
    const consumers = Object.values(workflow).filter((node) => (node.class_type === "BasicScheduler" || node.class_type === "BasicGuider") &&
        Array.isArray(node.inputs?.model));
    if (!sampler?.inputs || !schedulers.length || !consumers.length)
        return;
    sampler.inputs.sampler_name = "euler";
    for (const scheduler of schedulers)
        scheduler.inputs.scheduler = "beta";
    if (!ref2vTurbo && !fl2vaV11Turbo && !fl2vaV4Turbo && !fl2vaSlaTurbo)
        return;
    const existing = Object.entries(workflow).find(([, node]) => node.class_type === "MiniMaxH3SigmaShift" || node.class_type === "ModelSamplingMiniMaxH3");
    const currentModel = existing?.[1].inputs?.model ?? consumers[0]?.inputs?.model;
    if (!Array.isArray(currentModel) || typeof currentModel[0] !== "string")
        return;
    if (existing && Object.values(workflow).some((node) => (node.class_type === "MiniMaxH3SigmaShift" || node.class_type === "ModelSamplingMiniMaxH3") &&
        JSON.stringify(node.inputs?.model) !== JSON.stringify(currentModel)))
        return;
    if (!existing && consumers.some((node) => JSON.stringify(node.inputs?.model) !== JSON.stringify(currentModel)))
        return;
    const nodeId = existing?.[0] ?? String(Math.max(0, ...Object.keys(workflow).map((id) => Number.parseInt(id, 10) || 0)) + 1);
    workflow[nodeId] = {
        class_type: existing?.[1].class_type ?? "MiniMaxH3SigmaShift",
        inputs: {
            model: currentModel,
            shift_video: fl2vaV11Turbo || fl2vaSlaTurbo ? 6 : 12,
            shift_audio: fl2vaV11Turbo || fl2vaSlaTurbo ? 3 : fl2vaV4Turbo ? 6 : 3
        }
    };
    for (const node of consumers)
        node.inputs.model = [nodeId, 0];
}
export function normalizeH3Steps(value, modelId = "", videoLoras) {
    return normalizeVideoSteps(value, resolveVideoGenerationPolicy({
        modelId,
        inputMode: "image",
        videoLoras
    }));
}
function generationSafetyProfileForModel(modelId) {
    if (isMiniMaxH3Model(modelId)) {
        const capabilities = modelCatalog.get(modelId)?.definition.capabilities;
        return {
            label: isMiniMaxH3R2vModel(modelId)
                ? "MiniMax H3 R2V"
                : isMiniMaxH3TurboModel(modelId)
                    ? "MiniMax H3 Turbo FL2VA"
                    : "MiniMax H3 FL2VA",
            maxGeneratedFrames: capabilities?.maxGeneratedFrames ?? 362,
            maxDurationSeconds: capabilities?.maxDurationSeconds ?? 15,
            resolutions: capabilities?.resolutions
        };
    }
    if (modelId === "wan22_5b") {
        return {
            label: "Wan 2.2 TI2V-5B",
            maxGeneratedFrames: 121,
            maxDurationSeconds: 10
        };
    }
    if (modelId.startsWith("wan22_")) {
        return {
            label: "Wan 2.2 14B",
            maxGeneratedFrames: 81,
            maxDurationSeconds: 10
        };
    }
    if (modelId.startsWith("hunyuan15")) {
        return {
            label: "HunyuanVideo 1.5",
            maxGeneratedFrames: 121,
            maxDurationSeconds: 10
        };
    }
    if (modelId === "sulphur2") {
        return {
            label: "Sulphur 2 / LTX 2.3",
            maxGeneratedFrames: 121,
            maxDurationSeconds: 10
        };
    }
    return {
        label: workflowMessage("currentModel"),
        maxGeneratedFrames: 81,
        maxDurationSeconds: 10
    };
}
export function workflowSupportsEndImage(source) {
    return JSON.stringify(source).includes("{{END_IMAGE}}");
}
export function workflowSupportsH3TurboSampling(source, options = {}) {
    if (!source || typeof source !== "object" || Array.isArray(source))
        return false;
    const nodes = Object.values(source).filter((node) => Boolean(node) && typeof node === "object" && !Array.isArray(node));
    const hasNode = (classType, predicate) => nodes.some((node) => {
        if (node.class_type !== classType)
            return false;
        const inputs = node.inputs;
        return Boolean(inputs) && typeof inputs === "object" && !Array.isArray(inputs) &&
            predicate(inputs);
    });
    const nativeTurbo = hasNode("KSamplerSelect", (inputs) => inputs.sampler_name === "er_sde") &&
        hasNode("BasicScheduler", (inputs) => inputs.scheduler === "beta") &&
        nodes.some((node) => (node.class_type === "MiniMaxH3SigmaShift" || node.class_type === "ModelSamplingMiniMaxH3") &&
            Boolean(node.inputs) && typeof node.inputs === "object" && !Array.isArray(node.inputs) &&
            typeof node.inputs.shift_video === "number" &&
            typeof node.inputs.shift_audio === "number");
    if (nativeTurbo)
        return true;
    const fl2vaV11Turbo = options.videoLoras?.some((lora) => isH3TurboFourStepV11LoraId(lora.id) && videoLoraCompatibleWithModel(lora, options.modelId ?? "")) === true;
    if (fl2vaV11Turbo &&
        hasNode("KSamplerSelect", (inputs) => inputs.sampler_name === "euler") &&
        hasNode("BasicScheduler", (inputs) => inputs.scheduler === "beta") &&
        nodes.some((node) => (node.class_type === "MiniMaxH3SigmaShift" || node.class_type === "ModelSamplingMiniMaxH3") &&
            Boolean(node.inputs) && typeof node.inputs === "object" && !Array.isArray(node.inputs) &&
            node.inputs.shift_video === 6 &&
            node.inputs.shift_audio === 3))
        return true;
    const fl2vaSlaTurbo = options.videoLoras?.some((lora) => isH3SlaTurboLoraId(lora.id) && videoLoraCompatibleWithModel(lora, options.modelId ?? "")) === true;
    if (fl2vaSlaTurbo &&
        hasNode("KSamplerSelect", (inputs) => inputs.sampler_name === "euler") &&
        hasNode("BasicScheduler", (inputs) => inputs.scheduler === "beta") &&
        nodes.some((node) => (node.class_type === "MiniMaxH3SigmaShift" || node.class_type === "ModelSamplingMiniMaxH3") &&
            Boolean(node.inputs) && typeof node.inputs === "object" && !Array.isArray(node.inputs) &&
            node.inputs.shift_video === 6 &&
            node.inputs.shift_audio === 3))
        return true;
    const fl2vaV4Turbo = options.videoLoras?.some((lora) => isH3TurboV4LoraId(lora.id) && videoLoraCompatibleWithModel(lora, options.modelId ?? "")) === true;
    if (fl2vaV4Turbo &&
        hasNode("KSamplerSelect", (inputs) => inputs.sampler_name === "euler") &&
        hasNode("BasicScheduler", (inputs) => inputs.scheduler === "beta") &&
        nodes.some((node) => (node.class_type === "MiniMaxH3SigmaShift" || node.class_type === "ModelSamplingMiniMaxH3") &&
            Boolean(node.inputs) && typeof node.inputs === "object" && !Array.isArray(node.inputs) &&
            node.inputs.shift_video === 12 &&
            node.inputs.shift_audio === 6))
        return true;
    if (!isH3Ref2vTurboEnabled({
        modelId: options.modelId ?? "",
        videoLoras: options.videoLoras
    }))
        return false;
    return hasNode("MiniMaxH3ReferenceToVideo", () => true) &&
        hasNode("KSamplerSelect", () => true) &&
        hasNode("BasicScheduler", () => true) &&
        hasNode("BasicGuider", (inputs) => Array.isArray(inputs.model));
}
export function workflowSupportsVideoExtension(source) {
    if (!source || typeof source !== "object" || Array.isArray(source))
        return false;
    const inputValues = Object.values(source).flatMap((node) => {
        if (!node || typeof node !== "object" || Array.isArray(node))
            return [];
        const inputs = node.inputs;
        return inputs && typeof inputs === "object" && !Array.isArray(inputs)
            ? Object.values(inputs)
            : [];
    });
    const serializedInputs = JSON.stringify(inputValues);
    return ["{{SOURCE_VIDEO}}", "{{EXTENSION_FRAMES}}", "{{OVERLAP_FRAMES}}"].every((placeholder) => serializedInputs.includes(placeholder));
}
export function extensionWorkflowSafetyErrors(source, locale = "zh-CN") {
    const message = (key) => workflowMessage(key, {}, locale);
    const errors = [];
    if (!workflowSupportsVideoExtension(source)) {
        errors.push(message("missingExtensionPlaceholders"));
    }
    if (!source || typeof source !== "object" || Array.isArray(source)) {
        return errors.length ? errors : [message("workflowRootInvalid")];
    }
    const nodes = Object.values(source).filter((node) => Boolean(node) && typeof node === "object" && !Array.isArray(node));
    const classTypes = nodes.flatMap((node) => {
        const classType = node.class_type;
        return typeof classType === "string" ? [classType] : [];
    });
    if (!classTypes.some((value) => value === "LTXVExtendSampler" || value === "LTXVLoopingSampler")) {
        errors.push(message("missingExtensionSampler"));
    }
    const usesCheckpointLoader = classTypes.includes("LowVRAMCheckpointLoader");
    const ggufLoader = nodes.find((node) => node.class_type === "UnetLoaderGGUFAdvanced" ||
        node.class_type === "H3UnetLoaderGGUFAdvanced");
    if (!usesCheckpointLoader && !ggufLoader) {
        errors.push(message("missingWorkflowLoader"));
    }
    if (ggufLoader) {
        const inputs = ggufLoader.inputs;
        const patchOnDevice = inputs && typeof inputs === "object" && !Array.isArray(inputs)
            ? inputs.patch_on_device
            : undefined;
        if (patchOnDevice !== false) {
            errors.push(message("ggufPatchOnDevice"));
        }
        if (!classTypes.includes("DualCLIPLoader")) {
            errors.push(message("missingDualClipLoader"));
        }
        if (!classTypes.includes("VAELoader")) {
            errors.push(message("missingVaeLoader"));
        }
    }
    if (!classTypes.includes("VRAM_Debug")) {
        errors.push(message("missingVramDebug"));
    }
    if (!classTypes.some((value) => value === "VAEDecodeTiled" || value.includes("TiledVAEDecode"))) {
        errors.push(message("missingTiledVae"));
    }
    return errors;
}
function frameIntervalForModel(modelId) {
    if (isMiniMaxH3Model(modelId))
        return 17;
    if (modelId === "sulphur2")
        return 8;
    if (modelId.startsWith("wan22_") || modelId.startsWith("hunyuan15"))
        return 4;
    return 1;
}
export function frameCountForTask(task, fps) {
    if (task.modelId && isMiniMaxH3Model(task.modelId)) {
        const requested = Math.max(5, Math.round(task.duration * 24));
        return requested + ((5 - (requested % 17) + 17) % 17);
    }
    const requested = Math.max(1, Math.round(task.duration * fps));
    const interval = frameIntervalForModel(task.modelId);
    return Math.max(1, Math.round((requested - 1) / interval) * interval + 1);
}
export function frameInterpolationMultiplier(task) {
    if (task.frameInterpolation === "rife2x")
        return 2;
    if (task.frameInterpolation === "rife4x")
        return 4;
    return 1;
}
export function outputFrameCountForTask(task) {
    if (task.modelId && isMiniMaxH3Model(task.modelId)) {
        return frameCountForTask({ modelId: task.modelId, duration: task.duration }, 24);
    }
    return Math.max(1, Math.round(task.duration * task.fps));
}
export function workflowSupportsH3BoundaryExtension(source) {
    if (!source || typeof source !== "object" || Array.isArray(source))
        return false;
    const nodes = Object.values(source).filter((node) => Boolean(node) && typeof node === "object" && !Array.isArray(node));
    const classTypes = new Set(nodes.flatMap((node) => typeof node.class_type === "string" ? [node.class_type] : []));
    return JSON.stringify(source).includes("{{INPUT_IMAGE}}") &&
        classTypes.has("MiniMaxH3ImageToVideo") &&
        classTypes.has("CreateVideo") &&
        classTypes.has("SaveVideo");
}
export function workflowSupportsH3MotionContextExtension(source) {
    if (!source || typeof source !== "object" || Array.isArray(source))
        return false;
    const serialized = JSON.stringify(source);
    const classTypes = new Set(Object.values(source).flatMap((node) => {
        if (!node || typeof node !== "object" || Array.isArray(node))
            return [];
        const classType = node.class_type;
        return typeof classType === "string" ? [classType] : [];
    }));
    return serialized.includes("{{SOURCE_VIDEO}}") &&
        classTypes.has("MiniMaxH3ReferenceToVideo") &&
        classTypes.has("MiniMaxH3MotionContext") &&
        classTypes.has("MiniMaxH3MotionContextTrim") &&
        classTypes.has("MiniMaxH3MotionContextSaveLatent") &&
        classTypes.has("CreateVideo") &&
        classTypes.has("SaveVideo");
}
export function workflowSupportsExtensionForModel(source, modelId) {
    if (isMiniMaxH3Fl2vaModel(modelId)) {
        return workflowSupportsH3BoundaryExtension(source);
    }
    if (isMiniMaxH3R2vModel(modelId)) {
        return workflowSupportsH3MotionContextExtension(source);
    }
    return extensionWorkflowSafetyErrors(source).length === 0;
}
export function workflowSupportsH3MotionContextReferences(source, imageCount, extraVideoCount) {
    if (!workflowSupportsH3MotionContextExtension(source))
        return false;
    const serialized = JSON.stringify(source);
    for (let index = 0; index < Math.max(0, imageCount); index += 1) {
        if (!serialized.includes(`{{H3_REF_IMAGE_${index}}}`))
            return false;
    }
    for (let index = 1; index <= Math.max(0, extraVideoCount); index += 1) {
        if (!serialized.includes(`{{H3_REF_VIDEO_${index}}}`))
            return false;
    }
    return true;
}
export function generationFrameCountForTask(task) {
    if (isMiniMaxH3Model(task.modelId)) {
        return frameCountForTask(task, 24);
    }
    const multiplier = frameInterpolationMultiplier(task);
    if (multiplier === 1)
        return frameCountForTask(task, task.fps);
    const requiredSourceFrames = Math.ceil((outputFrameCountForTask(task) - 1) / multiplier) + 1;
    const interval = frameIntervalForModel(task.modelId);
    return Math.max(1, Math.ceil((requiredSourceFrames - 1) / interval) * interval + 1);
}
export function generationSafetyForTask(task, locale = "zh-CN") {
    const message = (key, params = {}) => workflowMessage(key, params, locale);
    const profile = generationSafetyProfileForModel(task.modelId);
    const { maxDurationSeconds, maxGeneratedFrames } = profile;
    if (!Number.isFinite(task.duration) ||
        !Number.isFinite(task.fps) ||
        task.duration <= 0 ||
        task.fps <= 0) {
        return {
            safe: false,
            generatedFrames: 0,
            maxGeneratedFrames,
            maxDurationSeconds,
            message: message("durationFpsInvalid")
        };
    }
    const generatedFrames = generationFrameCountForTask(task);
    if (task.duration > maxDurationSeconds) {
        return {
            safe: false,
            generatedFrames,
            maxGeneratedFrames,
            maxDurationSeconds,
            message: message("durationLimit", { maxDurationSeconds })
        };
    }
    if (task.resolution !== undefined &&
        profile.resolutions?.length &&
        !profile.resolutions.includes(task.resolution)) {
        return {
            safe: false,
            generatedFrames,
            maxGeneratedFrames,
            maxDurationSeconds,
            message: message("resolutionLimit", {
                label: profile.label,
                resolutions: profile.resolutions.join("/")
            })
        };
    }
    if (generatedFrames > maxGeneratedFrames) {
        return {
            safe: false,
            generatedFrames,
            maxGeneratedFrames,
            maxDurationSeconds,
            message: message("frameBudget", { generatedFrames, label: profile.label, maxGeneratedFrames })
        };
    }
    if (isMiniMaxH3Model(task.modelId)) {
        const resolution = task.resolution ?? 480;
        const guidance = task.duration <= 5 && resolution <= 540
            ? message("h3SafeGuidance")
            : task.duration <= 10 && resolution <= 720
                ? message("h3BalancedGuidance")
                : message("h3HeavyGuidance");
        return {
            safe: true,
            generatedFrames,
            maxGeneratedFrames,
            maxDurationSeconds,
            message: message("h3FrameRange", {
                label: profile.label,
                generatedFrames,
                maxGeneratedFrames,
                guidance
            })
        };
    }
    return {
        safe: true,
        generatedFrames,
        maxGeneratedFrames,
        maxDurationSeconds,
        message: message("modelFrameBudget", { label: profile.label, generatedFrames, maxGeneratedFrames })
    };
}
export function activityTimeoutMinutesForTask(task, ltxExtensionTimeoutMinutes) {
    if (isMiniMaxH3Model(task.modelId))
        return 90;
    if (task.modelId === "seedvr2-native-int8")
        return 90;
    if (task.taskType === "extension")
        return ltxExtensionTimeoutMinutes;
    return 10;
}
/**
 * Motion Context reserves a fixed prefix of the sampled sequence for the
 * previous segment. Convert that frame budget into the largest whole-second
 * duration the creation UI can safely offer.
 */
export function motionContextMaxDurationSeconds(maxGeneratedFrames = 362, contextFrames = 22, maxDurationSeconds = 15) {
    const frameBudget = Number.isFinite(maxGeneratedFrames)
        ? Math.max(1, Math.floor(maxGeneratedFrames))
        : 362;
    const reservedFrames = Number.isFinite(contextFrames)
        ? Math.max(0, Math.floor(contextFrames))
        : 22;
    const upperBound = Number.isFinite(maxDurationSeconds)
        ? Math.max(1, Math.floor(maxDurationSeconds))
        : 15;
    for (let duration = upperBound; duration >= 1; duration -= 1) {
        const generatedFrames = generationFrameCountForTask({
            modelId: "minimax_h3_ref2va",
            duration,
            fps: 24,
            frameInterpolation: "off"
        });
        if (generatedFrames + reservedFrames <= frameBudget)
            return duration;
    }
    return 1;
}
export function extensionSafetyForTask(task, locale = "zh-CN") {
    const message = (key, params = {}) => workflowMessage(key, params, locale);
    if (isMiniMaxH3Fl2vaModel(task.modelId)) {
        const generationSafety = generationSafetyForTask(task, locale);
        const minimumContextSeconds = 1 / 24;
        const result = (safe, message) => ({
            ...generationSafety,
            safe,
            minimumContextSeconds,
            message
        });
        if (task.modelId === "minimax_h3_fl2va_q3_gguf") {
            return result(false, message("q3NoExtension"));
        }
        if (!task.sourceVideoPath || task.sourceVideoDuration <= 0) {
            return result(false, message("sourceVideoMissing"));
        }
        if (!Number.isFinite(task.trimStartSeconds) ||
            !Number.isFinite(task.trimEndSeconds) ||
            task.trimStartSeconds < 0 ||
            task.trimEndSeconds > task.sourceVideoDuration ||
            task.trimEndSeconds <= task.trimStartSeconds) {
            return result(false, message("trimInvalid"));
        }
        if (!generationSafety.safe)
            return result(false, generationSafety.message);
        return result(true, message("h3BoundarySummary", {
            generatedFrames: generationSafety.generatedFrames,
            maxGeneratedFrames: generationSafety.maxGeneratedFrames,
            message: generationSafety.message
        }));
    }
    if (isMiniMaxH3R2vModel(task.modelId)) {
        const contextFrames = 22;
        const generationSafety = generationSafetyForTask(task, locale);
        const maxDurationSeconds = motionContextMaxDurationSeconds(generationSafety.maxGeneratedFrames, contextFrames, generationSafety.maxDurationSeconds);
        const sampledFrames = generationSafety.generatedFrames + contextFrames;
        const result = (safe, message) => ({
            ...generationSafety,
            maxDurationSeconds,
            safe,
            generatedFrames: sampledFrames,
            minimumContextSeconds: contextFrames / 24,
            message
        });
        if (!task.sourceVideoPath || task.sourceVideoDuration <= 0) {
            return result(false, message("sourceVideoMissing"));
        }
        if (!Number.isFinite(task.trimStartSeconds) ||
            !Number.isFinite(task.trimEndSeconds) ||
            task.trimStartSeconds < 0 ||
            task.trimEndSeconds > task.sourceVideoDuration ||
            task.trimEndSeconds <= task.trimStartSeconds) {
            return result(false, message("trimInvalid"));
        }
        if (task.trimEndSeconds - task.trimStartSeconds < contextFrames / 24) {
            return result(false, message("motionContextMinimum"));
        }
        if (task.spectrumMode !== "off") {
            return result(false, message("motionContextSpectrum"));
        }
        if (!generationSafety.safe || sampledFrames > generationSafety.maxGeneratedFrames) {
            return result(false, message("motionContextBudget", {
                sampledFrames,
                maxGeneratedFrames: generationSafety.maxGeneratedFrames
            }));
        }
        return result(true, message("motionContextSummary", {
            sampledFrames,
            maxGeneratedFrames: generationSafety.maxGeneratedFrames
        }));
    }
    const multiplier = frameInterpolationMultiplier(task);
    const sourceFps = task.fps / multiplier;
    const maxDurationSeconds = Math.max(1, Math.floor(((task.maxGeneratedFrames - 1) * multiplier + 1) / task.fps));
    const minimumContextSeconds = task.overlapFrames / sourceFps;
    const generatedFrames = generationFrameCountForTask(task);
    const result = (safe, message) => ({
        safe,
        generatedFrames,
        maxGeneratedFrames: task.maxGeneratedFrames,
        maxDurationSeconds,
        minimumContextSeconds,
        message
    });
    if (task.modelId !== "sulphur2") {
        return result(false, message("sulphurOnly"));
    }
    if (!task.sourceVideoPath || task.sourceVideoDuration <= 0) {
        return result(false, message("sourceVideoMissing"));
    }
    if (!Number.isFinite(task.trimStartSeconds) ||
        !Number.isFinite(task.trimEndSeconds) ||
        task.trimStartSeconds < 0 ||
        task.trimEndSeconds > task.sourceVideoDuration ||
        task.trimEndSeconds <= task.trimStartSeconds) {
        return result(false, message("trimInvalid"));
    }
    if (task.trimEndSeconds - task.trimStartSeconds < minimumContextSeconds) {
        return result(false, message("contextMinimum", {
            seconds: minimumContextSeconds.toFixed(1),
            frames: task.overlapFrames
        }));
    }
    if (![360, 480].includes(task.resolution)) {
        return result(false, message("sulphurResolution"));
    }
    if (!task.unloadBetweenStages) {
        return result(false, message("sulphurUnload"));
    }
    if (generatedFrames > task.maxGeneratedFrames) {
        return result(false, message("sulphurBudget", {
            generatedFrames,
            maxGeneratedFrames: task.maxGeneratedFrames
        }));
    }
    return result(true, message("sulphurSummary", {
        generatedFrames,
        maxGeneratedFrames: task.maxGeneratedFrames,
        frames: task.overlapFrames
    }));
}
export function extensionContextDuration(task) {
    return task.overlapFrames /
        (task.fps / frameInterpolationMultiplier(task));
}
const wan14ModelAssets = {
    wan22_14b_nsfw: {
        high: "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors",
        low: "wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors",
        textEncoder: "nsfw_wan_umt5-xxl_fp8_scaled.safetensors",
        vae: "wan_2.1_vae.safetensors"
    },
    wan22_remix: {
        high: "wan22RemixT2VI2V_i2vHighV30-Q5_K_M.gguf",
        low: "wan22RemixT2VI2V_i2vLowV30-Q5_K_M.gguf",
        textEncoder: "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
        vae: "wan_2.1_vae.safetensors"
    },
    wan22_smoothmix: {
        high: "smoothMixWan22I2VT2V_i2vHigh-Q5_K_M.gguf",
        low: "smoothMixWan22I2VT2V_i2vLow-Q5_K_M.gguf",
        textEncoder: "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
        vae: "wan_2.1_vae.safetensors"
    },
    wan22_dasiwa: {
        high: "DasiwaWAN22I2V14BSynthseduction_q4High.gguf",
        low: "DasiwaWAN22I2V14BSynthseduction_q4Low.gguf",
        textEncoder: "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
        vae: "wan_2.1_vae.safetensors"
    }
};
const miniMaxH3ModelAssets = {
    minimax_h3_fl2va: {
        diffusionModel: "minimax_h3_fl2va_pruned_int8_convrot.safetensors",
        textEncoder: "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors"
    },
    minimax_h3_fl2va_int4: {
        diffusionModel: "minimax_h3_fl2va_pruned_int4_convrot.safetensors",
        textEncoder: "qwen3vl_32b_minimax_h3_int4_convrot.safetensors"
    },
    minimax_h3_fl2va_q3_gguf: {
        diffusionModel: "minimax_h3_fl2va_pruned-Q3_K.gguf",
        textEncoder: "qwen3vl_32b_minimax_h3-Q2_K_M.gguf"
    },
    minimax_h3_fl2va_turbo: {
        diffusionModel: "minimax_h3_fl2va_pruned_int8_convrot.safetensors",
        textEncoder: "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors"
    },
    minimax_h3_ref2va: {
        diffusionModel: "minimax_h3_ref2va_pruned_int8_convrot.safetensors",
        textEncoder: "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors"
    },
    minimax_h3_ref2va_int4: {
        diffusionModel: "minimax_h3_ref2va_pruned_int4_convrot.safetensors",
        textEncoder: "qwen3vl_32b_minimax_h3_int4_convrot.safetensors"
    }
};
const sulphurModelAssets = {
    q2_distilled: {
        transformer: "sulphur-2-distilled-Q2_K.gguf",
        distilled: true
    },
    q3_k_m: {
        transformer: "sulphur_dev-Q3_K_M.gguf",
        distilled: false
    },
    q4_k_m: {
        transformer: "sulphur_dev-Q4_K_M.gguf",
        distilled: false
    }
};
export function missingWorkflowNodeTypes(source, objectInfo) {
    if (!source || typeof source !== "object" || Array.isArray(source))
        return [];
    if (!objectInfo || typeof objectInfo !== "object" || Array.isArray(objectInfo)) {
        return [];
    }
    const available = new Set(Object.keys(objectInfo));
    return [
        ...new Set(Object.values(source)
            .map((node) => node && typeof node === "object" && !Array.isArray(node)
            ? node.class_type
            : undefined)
            .filter((value) => typeof value === "string")
            .filter((value) => !available.has(value)))
    ].sort();
}
const ratios = {
    "16:9": [16, 9],
    "9:16": [9, 16],
    "1:1": [1, 1],
    "4:3": [4, 3],
    "3:4": [3, 4],
    source: [16, 9]
};
function baseGenerationDimensions(task) {
    const [rw, rh] = task.ratio === "source" && task.sourceWidth > 0 && task.sourceHeight > 0
        ? [task.sourceWidth, task.sourceHeight]
        : ratios[task.ratio] ?? ratios.source;
    const shortEdge = Math.max(64, Math.floor(task.resolution / 16) * 16);
    const maxLongEdge = Math.max(64, Math.floor((task.resolution * 16) / 9 / 16) * 16);
    if (rw >= rh) {
        const width = Math.max(64, Math.round((shortEdge * rw) / rh / 16) * 16);
        if (width <= maxLongEdge)
            return [width, shortEdge];
        return [
            maxLongEdge,
            Math.max(64, Math.round((maxLongEdge * rh) / rw / 16) * 16)
        ];
    }
    const height = Math.max(64, Math.round((shortEdge * rh) / rw / 16) * 16);
    if (height <= maxLongEdge)
        return [shortEdge, height];
    return [
        Math.max(64, Math.round((maxLongEdge * rw) / rh / 16) * 16),
        maxLongEdge
    ];
}
function legacyVideoDimensions(task) {
    const [rw, rh] = task.ratio === "source" && task.sourceWidth > 0 && task.sourceHeight > 0
        ? [task.sourceWidth, task.sourceHeight]
        : ratios[task.ratio] ?? ratios.source;
    const height = Math.max(64, Math.round(task.resolution / 16) * 16);
    const width = Math.max(64, Math.round((height * rw) / rh / 16) * 16);
    const maxWidth = Math.max(64, Math.round((task.resolution * 16) / 9 / 16) * 16);
    if (width <= maxWidth)
        return [width, height];
    return [
        maxWidth,
        Math.max(64, Math.round((height * maxWidth) / width / 16) * 16)
    ];
}
function miniMaxH3Dimensions(task) {
    const [rw, rh] = task.ratio === "source" && task.sourceWidth > 0 && task.sourceHeight > 0
        ? [task.sourceWidth, task.sourceHeight]
        : ratios[task.ratio] ?? ratios.source;
    const ratio = rw / rh;
    const width = ratio >= 1 ? task.resolution * ratio : task.resolution;
    const height = ratio >= 1 ? task.resolution : task.resolution / ratio;
    return [
        Math.max(32, Math.round(width / 32) * 32),
        Math.max(32, Math.round(height / 32) * 32)
    ];
}
export function outputDimensions(task) {
    if (isMiniMaxH3Model(task.modelId)) {
        return miniMaxH3Dimensions(task);
    }
    const [width, height] = baseGenerationDimensions(task);
    if (task.modelId !== "hunyuan15_sr")
        return [width, height];
    return [
        Math.max(64, Math.round((width * 1.5) / 8) * 8),
        Math.max(64, Math.round((height * 1.5) / 8) * 8)
    ];
}
export function extensionOutputDimensions(task) {
    // Motion Context (Ref2VA) uses the same H3 VAE spatial grid as native
    // I2V/T2V.  Routing it through the legacy video cap can turn a 480p 16:9
    // task into 848×464, which encodes to odd 53×29 spatial latents.  ComfyUI
    // pads the target latent but not reference latents, so that shape is not
    // patchifiable and fails inside SamplerCustomAdvanced. Keep every H3
    // extension variant on the native 32px canvas policy instead.
    if (isMiniMaxH3Fl2vaModel(task.modelId) || isMiniMaxH3R2vModel(task.modelId)) {
        return miniMaxH3Dimensions(task);
    }
    return legacyVideoDimensions(task);
}
export function renderWorkflow(source, task, context = {}) {
    const [width, height] = task.taskType === "extension"
        ? extensionOutputDimensions(task)
        : outputDimensions(task);
    const [baseWidth, baseHeight] = task.taskType === "extension"
        ? extensionOutputDimensions(task)
        : baseGenerationDimensions(task);
    const outputWidth = context.width ?? width;
    const outputHeight = context.height ?? height;
    const fps = context.fps ?? task.fps ?? 8;
    const modelAssets = wan14ModelAssets[task.modelId];
    const h3Assets = miniMaxH3ModelAssets[task.modelId];
    const sulphurAssets = sulphurModelAssets[task.modelProfile ?? "q3_k_m"];
    const interpolationMultiplier = frameInterpolationMultiplier(task);
    const tokens = {
        PROMPT: videoPromptForLoras(task.prompt, task.videoLoras),
        NEGATIVE_PROMPT: "",
        SEED: task.seed,
        INPUT_IMAGE: context.inputImage ?? "",
        END_IMAGE: context.endImage ?? "",
        SOURCE_VIDEO: context.sourceVideo ?? "",
        H3_CONTEXT_LATENT_PATH: context.h3ContextLatentPath ?? "",
        H3_CONTEXT_SAVE_PREFIX: context.h3ContextSavePrefix ?? `h3_context/${task.id}/clip`,
        H3_REF_IMAGE_0: context.h3ReferenceImages?.[0] ?? "",
        H3_REF_IMAGE_1: context.h3ReferenceImages?.[1] ?? "",
        H3_REF_IMAGE_2: context.h3ReferenceImages?.[2] ?? "",
        H3_REF_IMAGE_3: context.h3ReferenceImages?.[3] ?? "",
        H3_REF_IMAGE_4: context.h3ReferenceImages?.[4] ?? "",
        H3_REF_IMAGE_5: context.h3ReferenceImages?.[5] ?? "",
        H3_REF_IMAGE_6: context.h3ReferenceImages?.[6] ?? "",
        H3_REF_IMAGE_7: context.h3ReferenceImages?.[7] ?? "",
        H3_REF_IMAGE_8: context.h3ReferenceImages?.[8] ?? "",
        H3_REF_VIDEO_0: context.h3ReferenceVideos?.[0] ?? "",
        H3_REF_VIDEO_1: context.h3ReferenceVideos?.[1] ?? "",
        H3_REF_VIDEO_2: context.h3ReferenceVideos?.[2] ?? "",
        TRIM_START: task.taskType === "extension" ? task.trimStartSeconds : 0,
        TRIM_END: task.taskType === "extension" ? task.trimEndSeconds : 0,
        EXTENSION_FRAMES: task.taskType === "extension"
            ? generationFrameCountForTask(task)
            : 0,
        OVERLAP_FRAMES: task.taskType === "extension" ? task.overlapFrames : 0,
        UNLOAD_BETWEEN_STAGES: task.taskType === "extension"
            ? task.unloadBetweenStages
            : true,
        WIDTH: outputWidth,
        HEIGHT: outputHeight,
        BASE_WIDTH: baseWidth,
        BASE_HEIGHT: baseHeight,
        DURATION: task.duration,
        FPS: fps,
        SOURCE_FPS: fps / interpolationMultiplier,
        FRAMES: context.frames ?? (task.taskType === "extension" && isMiniMaxH3R2vModel(task.modelId)
            ? generationFrameCountForTask(task) + 22
            : generationFrameCountForTask(task)),
        OUTPUT_FRAMES: outputFrameCountForTask(task),
        OUTPUT_FILENAME: task.outputFilename.replace(/\.mp4$/i, ""),
        H3_DIFFUSION_MODEL: h3Assets?.diffusionModel ?? "",
        H3_TEXT_ENCODER: h3Assets?.textEncoder ?? "",
        H3_TURBO_LORA: task.videoLoras?.find((lora) => isH3TurboLoraId(lora.id) && videoLoraCompatibleWithModel(lora, task.modelId))?.filename || videoLoraFilename(task.videoLoras, H3_TURBO_LORA_ID) ||
            (isMiniMaxH3TurboModel(task.modelId) ? H3_TURBO_LORA_FILENAME : ""),
        HIGH_MODEL: modelAssets?.high ?? "",
        LOW_MODEL: modelAssets?.low ?? "",
        TEXT_ENCODER: modelAssets?.textEncoder ?? "",
        VAE_MODEL: modelAssets?.vae ?? "",
        HALF_WIDTH: Math.max(16, Math.round(outputWidth / 2 / 16) * 16),
        HALF_HEIGHT: Math.max(16, Math.round(outputHeight / 2 / 16) * 16),
        SULPHUR_GGUF: sulphurAssets.transformer,
        LTX_TEXT_ENCODER: "gemma_3_12B_it_fp4_mixed.safetensors",
        LTX_TEXT_CONNECTOR: "ltx-2-3-22b-text_encoder.safetensors",
        LTX_VIDEO_VAE: "ltx-2-3-22b-VAE.safetensors",
        LTX_AUDIO_VAE: "ltx-2-3-22b-audio_vae.safetensors",
        LTX_DISTILL_LORA: "ltx-2.3-22b-distilled-lora-1.1_fro90_ceil72_condsafe.safetensors",
        LTX_UPSCALER: "ltx-2-spatial-upscaler-x2-1.0.safetensors"
    };
    const visit = (value) => {
        if (Array.isArray(value))
            return value.map(visit);
        if (value && typeof value === "object") {
            return Object.fromEntries(Object.entries(value).map(([key, child]) => [
                key,
                visit(child)
            ]));
        }
        if (typeof value !== "string")
            return value;
        const exact = value.match(/^\{\{([A-Z0-9_]+)\}\}$/);
        if (exact?.[1] && exact[1] in tokens)
            return tokens[exact[1]];
        return value.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => key in tokens ? String(tokens[key]) : match);
    };
    const rendered = visit(source);
    if (!rendered ||
        typeof rendered !== "object" ||
        Array.isArray(rendered)) {
        return rendered;
    }
    const workflow = rendered;
    applyVideoLoraStack(workflow, task, context.locale);
    if (isMiniMaxH3Model(task.modelId)) {
        const steps = normalizeH3Steps(task.steps, task.modelId, task.videoLoras);
        for (const node of Object.values(workflow)) {
            if (node.class_type !== "BasicScheduler" || !node.inputs)
                continue;
            node.inputs.steps = steps;
        }
    }
    if (isMiniMaxH3Model(task.modelId) &&
        task.attentionMode === "sage-triton") {
        for (const node of Object.values(workflow)) {
            if (node.class_type !== "PathchSageAttentionKJ" || !node.inputs)
                continue;
            node.inputs.sage_attention = "sageattn_qk_int8_pv_fp16_triton";
            node.inputs.allow_compile = false;
        }
    }
    if (isMiniMaxH3Model(task.modelId) &&
        task.attentionMode === "pytorch") {
        const sageNodeIds = new Set(Object.entries(workflow)
            .filter(([, node]) => node.class_type === "PathchSageAttentionKJ")
            .map(([id]) => id));
        for (const sageNodeId of sageNodeIds) {
            const upstreamModel = workflow[sageNodeId]?.inputs?.model;
            if (!Array.isArray(upstreamModel))
                continue;
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
    applyMiniMaxH3SlaAttention(workflow, task, context.locale);
    applyMiniMaxH3Ref2vTurboSampling(workflow, task);
    if (shouldApplySpectrum({
        modelId: task.modelId,
        inputMode: task.taskType === "extension" ? "video" : "image",
        spectrumMode: task.spectrumMode,
        videoLoras: task.videoLoras
    })) {
        applyMiniMaxH3Spectrum(workflow, context.locale, task.spectrumModelAwareMode ?? "off");
    }
    if (isMiniMaxH3Model(task.modelId)) {
        applyMiniMaxH3LivePreview(workflow, context.h3PreviewTinyVae ?? "");
    }
    const emptyReferenceNodeIds = new Set(Object.entries(workflow)
        .filter(([, node]) => (node.class_type === "LoadImage" && node.inputs?.image === "") ||
        (node.class_type === "VHS_LoadVideoFFmpeg" && node.inputs?.video === "") ||
        (node.class_type === "MiniMaxH3MotionContextLoadLatent" &&
            node.inputs?.latent_path === ""))
        .map(([id]) => id));
    for (const nodeId of emptyReferenceNodeIds)
        delete workflow[nodeId];
    if (emptyReferenceNodeIds.size) {
        for (const node of Object.values(workflow)) {
            if (!node.inputs)
                continue;
            for (const [inputName, input] of Object.entries(node.inputs)) {
                if (Array.isArray(input) &&
                    typeof input[0] === "string" &&
                    emptyReferenceNodeIds.has(input[0])) {
                    delete node.inputs[inputName];
                }
            }
        }
    }
    const h3HeavyDecode = isMiniMaxH3Model(task.modelId) &&
        (generationFrameCountForTask(task) > 124 ||
            outputWidth * outputHeight > 960 * 544);
    const availableVramBytes = context.vramAvailableBytes ?? context.vramTotalBytes ?? 0;
    const highVramDecode = availableVramBytes >= 20 * 1024 ** 3 && !h3HeavyDecode;
    const tiledDecodeInputs = highVramDecode
        ? {
            // Keep spatial tiling, but make the temporal tile larger than every
            // supported clip so the VAE sees the whole sequence at once.
            tile_size: 512,
            overlap: 64,
            temporal_size: 4096,
            temporal_overlap: 16
        }
        : {
            tile_size: 256,
            overlap: 64,
            temporal_size: 64,
            temporal_overlap: 16
        };
    let nextNodeId = Math.max(0, ...Object.keys(workflow).map((id) => Number.parseInt(id, 10) || 0)) + 1;
    const isUnloadConnection = (value) => {
        if (!Array.isArray(value) || typeof value[0] !== "string")
            return false;
        const upstream = workflow[value[0]];
        return (upstream?.class_type === "VRAM_Debug" &&
            upstream.inputs?.unload_all_models === true);
    };
    for (const node of Object.values(workflow)) {
        if (!node.inputs || !node.class_type?.includes("VAEDecode"))
            continue;
        let latentInputKey;
        if (node.class_type === "LTXVSpatioTemporalTiledVAEDecode") {
            Object.assign(node.inputs, {
                // This node counts latent frames. 1000 therefore disables temporal
                // splitting for our bounded generation/extension clips.
                temporal_tile_length: highVramDecode ? 1000 : 32,
                temporal_overlap: 4
            });
            latentInputKey = "latents";
        }
        else if (node.class_type === "VAEDecode" ||
            node.class_type === "VAEDecodeTiled") {
            if (!isMiniMaxH3Model(task.modelId)) {
                if (node.class_type === "VAEDecode") {
                    node.class_type = "VAEDecodeTiled";
                }
                Object.assign(node.inputs, tiledDecodeInputs);
            }
            latentInputKey = "samples";
        }
        else {
            continue;
        }
        const samples = node.inputs[latentInputKey];
        if (!Array.isArray(samples) || isUnloadConnection(samples))
            continue;
        const unloadId = String(nextNodeId++);
        workflow[unloadId] = {
            class_type: "VRAM_Debug",
            inputs: {
                empty_cache: true,
                gc_collect: true,
                unload_all_models: true,
                any_input: samples
            }
        };
        node.inputs[latentInputKey] = [unloadId, 0];
    }
    for (const node of Object.values(workflow)) {
        if (node.class_type !== "CreateVideo" || !node.inputs)
            continue;
        let decodedImages = node.inputs.images;
        if (!Array.isArray(decodedImages))
            continue;
        if (!isUnloadConnection(decodedImages)) {
            const unloadId = String(nextNodeId++);
            workflow[unloadId] = {
                class_type: "VRAM_Debug",
                inputs: {
                    empty_cache: true,
                    gc_collect: true,
                    unload_all_models: true,
                    image_pass: decodedImages
                }
            };
            decodedImages = [unloadId, 1];
            node.inputs.images = decodedImages;
        }
        if (interpolationMultiplier === 1)
            continue;
        const interpolateId = String(nextNodeId++);
        const trimId = String(nextNodeId++);
        workflow[interpolateId] = {
            class_type: "RIFE VFI",
            inputs: {
                ckpt_name: "rife47.pth",
                frames: decodedImages,
                clear_cache_after_n_frames: 1,
                multiplier: interpolationMultiplier,
                fast_mode: true,
                ensemble: false,
                scale_factor: 1,
                dtype: "bfloat16",
                torch_compile: false,
                batch_size: 1
            }
        };
        workflow[trimId] = {
            class_type: "ImageFromBatch",
            inputs: {
                image: [interpolateId, 0],
                batch_index: 0,
                length: task.taskType === "extension"
                    ? task.overlapFrames * interpolationMultiplier +
                        outputFrameCountForTask(task)
                    : outputFrameCountForTask(task)
            }
        };
        node.inputs.images = [trimId, 0];
    }
    return workflow;
}
export function validateApiWorkflow(source, locale = "zh-CN") {
    const message = (key, params = {}) => workflowMessage(key, params, locale);
    const errors = [];
    const warnings = [];
    const placeholders = new Set();
    if (!source || typeof source !== "object" || Array.isArray(source)) {
        return {
            valid: false,
            errors: [message("apiRootInvalid")],
            warnings,
            placeholders: [],
            nodeCount: 0
        };
    }
    const entries = Object.entries(source);
    if (Array.isArray(source.nodes)) {
        errors.push(message("uiWorkflowDetected"));
    }
    if (entries.length === 0)
        errors.push(message("workflowEmpty"));
    for (const [nodeId, value] of entries) {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            errors.push(message("nodeNotObject", { nodeId }));
            continue;
        }
        const node = value;
        if (typeof node.class_type !== "string" || !node.class_type) {
            errors.push(message("nodeClassMissing", { nodeId }));
        }
        if (!node.inputs || typeof node.inputs !== "object" || Array.isArray(node.inputs)) {
            errors.push(message("nodeInputsMissing", { nodeId }));
        }
    }
    const serialized = JSON.stringify(source);
    for (const match of serialized.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)) {
        if (match[1])
            placeholders.add(match[1]);
    }
    if (!placeholders.has("PROMPT")) {
        errors.push(message("promptPlaceholderMissing"));
    }
    const hasH3ReferenceImage = [...placeholders].some((token) => /^H3_REF_IMAGE_\d+$/u.test(token));
    const hasH3ReferenceVideo = [...placeholders].some((token) => /^H3_REF_VIDEO_\d+$/u.test(token));
    const hasTextOnlyH3Conditioning = entries.some(([, value]) => {
        if (!value || typeof value !== "object" || Array.isArray(value))
            return false;
        const node = value;
        if (node.class_type !== "MiniMaxH3ImageToVideo")
            return false;
        const inputs = node.inputs;
        return inputs !== null && typeof inputs === "object" && !Array.isArray(inputs) &&
            !("first_frame" in inputs) && !("last_frame" in inputs);
    });
    if (!placeholders.has("INPUT_IMAGE") && !placeholders.has("SOURCE_VIDEO") && !hasH3ReferenceImage && !hasH3ReferenceVideo && !hasTextOnlyH3Conditioning) {
        errors.push(message("mediaPlaceholderMissing"));
    }
    if (!placeholders.has("SEED"))
        warnings.push(message("seedPlaceholderMissing"));
    if (!placeholders.has("OUTPUT_FILENAME")) {
        warnings.push(message("filenamePlaceholderMissing"));
    }
    return {
        valid: errors.length === 0,
        errors,
        warnings,
        placeholders: [...placeholders].sort(),
        nodeCount: entries.length
    };
}
