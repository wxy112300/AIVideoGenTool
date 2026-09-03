function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
const FIRST_PASS_CLASSES = [
    "MiniMaxH3ImageToVideo",
    "SamplerCustomAdvanced",
    "VAEDecode",
    "VAEDecodeAudio",
    "CreateVideo",
    "SaveVideo",
    "LocalVideoStudioH3SaveJointAV"
];
const SECOND_PASS_CLASSES = [
    "MiniMaxH3ImageToVideo",
    "LocalVideoStudioH3LoadJointAV",
    "LTXVSeparateAVLatent",
    "LTXVConcatAVLatent",
    "MiniMaxH3ShiftSigmas",
    "MiniMaxH3AddNoise",
    "MiniMaxH3ConditioningUpscale",
    "DisableNoise",
    "BasicGuider",
    "SamplerCustomAdvanced",
    "VAEDecode",
    "VAEDecodeAudio",
    "CreateVideo",
    "SaveVideo",
    "LocalVideoStudioH3SaveJointAV"
];
const ULTIMATE_SECOND_PASS_CLASSES = [
    "MiniMaxH3ImageToVideo",
    "LocalVideoStudioH3LoadJointAV",
    "LocalVideoStudioH3RequireGpuVAE",
    "MiniMaxH3ConditioningUpscale",
    "MMH3LatentUpscaleWithModelParams",
    "MMH3TemporalSplitParams",
    "MMH3SpatialSplitParams",
    "MMH3UltimateUpscale",
    "VAEDecode",
    "VAEDecodeAudio",
    "CreateVideo",
    "SaveVideo",
    "LocalVideoStudioH3SaveJointAV"
];
const SECOND_PASS_UPSCALER_CLASSES = [
    "MiniMaxH3LatentUpscale",
    "MinimaxH3LatentUpscaler3D"
];
const RUNTIME_NODE_REQUIREMENTS = {
    MiniMaxH3LatentUpscale: { inputs: [{ name: "samples", type: "LATENT" }, { name: "scale_by", type: "FLOAT" }, { name: "upscale_method", type: "COMBO" }], outputs: ["LATENT"] },
    MinimaxH3LatentUpscaler3D: { inputs: [{ name: "latent", type: "ANY" }, { name: "model_name", type: "COMBO" }, { name: "mode", type: "ANY" }, { name: "align", type: "INT" }, { name: "enable_temporal_chunking", type: "ANY" }, { name: "force_unload", type: "ANY" }, { name: "device", type: "COMBO" }, { name: "precision", type: "COMBO" }] },
    MiniMaxH3ConditioningUpscale: { inputs: [{ name: "conditioning", type: "CONDITIONING" }, { name: "scale_by", type: "FLOAT" }, { name: "upscale_method", type: "COMBO" }], outputs: ["CONDITIONING"] },
    MiniMaxH3AddNoise: { inputs: [{ name: "model", type: "MODEL" }, { name: "noise", type: "NOISE" }, { name: "sigmas", type: "SIGMAS" }, { name: "latent_image", type: "LATENT" }], outputs: ["LATENT"] },
    MiniMaxH3ShiftSigmas: { inputs: [{ name: "sigmas", type: "SIGMAS" }, { name: "shift_video", type: "FLOAT" }, { name: "shift_audio", type: "FLOAT" }], outputs: ["SIGMAS"] },
    LTXVSeparateAVLatent: { inputs: [{ name: "av_latent", type: "LATENT" }], outputs: ["LATENT", "LATENT"] },
    LTXVConcatAVLatent: { inputs: [{ name: "video_latent", type: "LATENT" }, { name: "audio_latent", type: "LATENT" }], outputs: ["LATENT"] },
    LocalVideoStudioH3SaveJointAV: { inputs: [{ name: "joint_av", type: "LATENT" }, { name: "filename", type: "STRING" }], outputs: ["STRING"] },
    LocalVideoStudioH3LoadJointAV: { inputs: [{ name: "artifact", type: "STRING" }], outputs: ["LATENT"] },
    LocalVideoStudioH3RequireGpuVAE: { inputs: [{ name: "vae", type: "VAE" }], outputs: ["VAE"] },
    LocalVideoStudioH3AnchorConditioning: { inputs: [{ name: "conditioning", type: "CONDITIONING" }, { name: "video_latent", type: "LATENT" }, { name: "strength", type: "FLOAT" }], outputs: ["CONDITIONING"] },
    MMH3LatentUpscaleWithModelParams: {
        inputs: [{ name: "model_name", type: "COMBO" }, { name: "width", type: "INT" }, { name: "height", type: "INT" }, { name: "device", type: "COMBO" }, { name: "precision", type: "COMBO" }],
        outputs: ["H3_UPSCALE_PARAM"]
    },
    MMH3TemporalSplitParams: {
        inputs: [{ name: "chunk_length", type: "INT" }, { name: "temporal_overlap", type: "INT" }, { name: "anchor_strength", type: "FLOAT" }],
        outputs: ["H3_TEMPORAL_PARAM"]
    },
    MMH3SpatialSplitParams: {
        inputs: [{ name: "upscale_width", type: "INT" }, { name: "upscale_height", type: "INT" }, { name: "tile_size_mode", type: "COMBO" }, { name: "tile_width", type: "INT" }, { name: "tile_height", type: "INT" }, { name: "spatial_w_overlap", type: "INT" }, { name: "spatial_h_overlap", type: "INT" }, { name: "fade_width", type: "INT" }, { name: "fade_height", type: "INT" }],
        outputs: ["H3_SPATIAL_PARAM"]
    },
    MMH3UltimateUpscale: {
        inputs: [{ name: "model", type: "MODEL" }, { name: "conditioning", type: "CONDITIONING" }, { name: "latent", type: "LATENT" }, { name: "noise", type: "NOISE" }, { name: "sampler", type: "SAMPLER" }, { name: "sigmas", type: "SIGMAS" }, { name: "cfg", type: "FLOAT" }, { name: "latent_upscale_param", type: "ANY" }, { name: "temporal_split_param", type: "ANY" }, { name: "spatial_split_param", type: "ANY" }],
        outputs: ["LATENT", "DICT"]
    }
};
function graphNodes(source) {
    if (!isRecord(source)) return new Map();
    return new Map(Object.entries(source).flatMap(([nodeId, value]) => isRecord(value) ? [[nodeId, value]] : []));
}
function classTypes(nodes) {
    return new Set([...nodes.values()].map((node) => node.class_type).filter((value) => typeof value === "string"));
}
function nodeIdsForClass(nodes, classType) {
    return [...nodes.entries()].filter(([, node]) => node.class_type === classType).map(([nodeId]) => nodeId);
}
function inputsFor(node) {
    return isRecord(node?.inputs) ? node.inputs : {};
}
function nodeRef(value) {
    if (!Array.isArray(value) || value.length < 2 || typeof value[0] !== "string") return null;
    const outputIndex = value[1];
    return typeof outputIndex === "number" && Number.isSafeInteger(outputIndex) && outputIndex >= 0 ? { nodeId: value[0], outputIndex } : null;
}
function refExists(value, nodes) {
    const reference = nodeRef(value);
    return Boolean(reference && nodes.has(reference.nodeId));
}
function refToClass(value, expectedClass, nodes) {
    const reference = nodeRef(value);
    return Boolean(reference && nodes.get(reference.nodeId)?.class_type === expectedClass);
}
function addMissingClasses(errors, classes, available) {
    for (const classType of classes) if (!available.has(classType)) errors.push(`缺少节点 class_type=${classType}`);
}
function requireInputReference(errors, nodes, classType, inputName, expectedClass) {
    const nodeId = nodeIdsForClass(nodes, classType)[0];
    const value = inputsFor(nodes.get(nodeId))[inputName];
    if (!refExists(value, nodes)) {
        errors.push(`${classType}.${inputName} 必须引用已存在的 workflow 节点`);
        return;
    }
    if (expectedClass && !refToClass(value, expectedClass, nodes)) errors.push(`${classType}.${inputName} 必须引用 ${expectedClass}`);
}
function validateFirstPass(nodes, errors) {
    const available = classTypes(nodes);
    addMissingClasses(errors, FIRST_PASS_CLASSES, available);
    if (!available.has("LocalVideoStudioH3SaveJointAV")) return;
    requireInputReference(errors, nodes, "LocalVideoStudioH3SaveJointAV", "joint_av");
    const filename = inputsFor(nodes.get(nodeIdsForClass(nodes, "LocalVideoStudioH3SaveJointAV")[0])).filename;
    if (typeof filename !== "string" || !filename.includes("H3_AV_ARTIFACT_FILENAME")) errors.push("LocalVideoStudioH3SaveJointAV.filename 必须保留 H3_AV_ARTIFACT_FILENAME 占位符");
}
function validateSecondPass(nodes, errors) {
    const available = classTypes(nodes);
    if (available.has("MMH3UltimateUpscale")) {
        addMissingClasses(errors, ULTIMATE_SECOND_PASS_CLASSES, available);
        const loadId = nodeIdsForClass(nodes, "LocalVideoStudioH3LoadJointAV")[0];
        if (loadId && inputsFor(nodes.get(loadId)).artifact !== "{{H3_AV_INPUT_ARTIFACT}}") errors.push("LocalVideoStudioH3LoadJointAV.artifact 必须保留 H3_AV_INPUT_ARTIFACT 占位符");
        requireInputReference(errors, nodes, "MMH3UltimateUpscale", "latent", "LocalVideoStudioH3LoadJointAV");
        requireInputReference(errors, nodes, "MMH3UltimateUpscale", "conditioning", "MiniMaxH3ConditioningUpscale");
        requireInputReference(errors, nodes, "MMH3UltimateUpscale", "latent_upscale_param", "MMH3LatentUpscaleWithModelParams");
        requireInputReference(errors, nodes, "MMH3UltimateUpscale", "temporal_split_param", "MMH3TemporalSplitParams");
        requireInputReference(errors, nodes, "MMH3UltimateUpscale", "spatial_split_param", "MMH3SpatialSplitParams");
        requireInputReference(errors, nodes, "MiniMaxH3ImageToVideo", "vae", "LocalVideoStudioH3RequireGpuVAE");
        requireInputReference(errors, nodes, "VAEDecode", "vae", "LocalVideoStudioH3RequireGpuVAE");
        requireInputReference(errors, nodes, "VAEDecodeAudio", "vae", "LocalVideoStudioH3RequireGpuVAE");
        requireInputReference(errors, nodes, "LocalVideoStudioH3SaveJointAV", "joint_av");
        const filename = inputsFor(nodes.get(nodeIdsForClass(nodes, "LocalVideoStudioH3SaveJointAV")[0])).filename;
        if (typeof filename !== "string" || !filename.includes("H3_AV_ARTIFACT_FILENAME")) errors.push("LocalVideoStudioH3SaveJointAV.filename 必须保留 H3_AV_ARTIFACT_FILENAME 占位符");
        return;
    }
    addMissingClasses(errors, SECOND_PASS_CLASSES, available);
    const upscalerClasses = SECOND_PASS_UPSCALER_CLASSES.filter((classType) => available.has(classType));
    if (upscalerClasses.length !== 1) errors.push("二采 workflow 必须恰好包含一个 bilinear 或 learned 3D video latent upscaler");
    const upscalerClass = upscalerClasses[0];
    const loadId = nodeIdsForClass(nodes, "LocalVideoStudioH3LoadJointAV")[0];
    if (loadId) {
        const artifact = inputsFor(nodes.get(loadId)).artifact;
        if (artifact !== "{{H3_AV_INPUT_ARTIFACT}}") errors.push("LocalVideoStudioH3LoadJointAV.artifact 必须保留 H3_AV_INPUT_ARTIFACT 占位符");
    }
    if (available.has("LTXVSeparateAVLatent") && available.has("LocalVideoStudioH3LoadJointAV")) requireInputReference(errors, nodes, "LTXVSeparateAVLatent", "av_latent", "LocalVideoStudioH3LoadJointAV");
    if (upscalerClass && available.has("LTXVSeparateAVLatent")) requireInputReference(errors, nodes, upscalerClass, upscalerClass === "MinimaxH3LatentUpscaler3D" ? "latent" : "samples", "LTXVSeparateAVLatent");
    if (available.has("LTXVConcatAVLatent") && upscalerClass && available.has("LTXVSeparateAVLatent")) {
        requireInputReference(errors, nodes, "LTXVConcatAVLatent", "video_latent", upscalerClass);
        const concatId = nodeIdsForClass(nodes, "LTXVConcatAVLatent")[0];
        const audio = nodeRef(inputsFor(nodes.get(concatId)).audio_latent);
        const separateId = nodeIdsForClass(nodes, "LTXVSeparateAVLatent")[0];
        if (!audio || audio.nodeId !== separateId || audio.outputIndex !== 1) errors.push("LTXVConcatAVLatent.audio_latent 必须引用 LTXVSeparateAVLatent 的 audio 输出");
    }
    const addNoiseIds = nodeIdsForClass(nodes, "MiniMaxH3AddNoise");
    if (addNoiseIds.length !== 2) errors.push("二采 workflow 必须恰好包含两个 MiniMaxH3AddNoise（video/audio 各一个）");
    for (const nodeId of addNoiseIds) {
        const inputs = inputsFor(nodes.get(nodeId));
        for (const name of ["model", "noise", "sigmas", "latent_image"]) if (!refExists(inputs[name], nodes)) errors.push(`MiniMaxH3AddNoise.${name} 必须引用已存在的 workflow 节点`);
    }
    if (available.has("MiniMaxH3ShiftSigmas")) requireInputReference(errors, nodes, "MiniMaxH3ShiftSigmas", "sigmas", "BasicScheduler");
    if (available.has("MiniMaxH3ConditioningUpscale") && available.has("MiniMaxH3ImageToVideo")) requireInputReference(errors, nodes, "MiniMaxH3ConditioningUpscale", "conditioning", "MiniMaxH3ImageToVideo");
    if (upscalerClass === "MinimaxH3LatentUpscaler3D") {
        if (!available.has("LocalVideoStudioH3AnchorConditioning")) errors.push("learned 3D 二采 workflow 缺少 LocalVideoStudioH3AnchorConditioning");
        else {
            requireInputReference(errors, nodes, "LocalVideoStudioH3AnchorConditioning", "conditioning", "MiniMaxH3ConditioningUpscale");
            requireInputReference(errors, nodes, "LocalVideoStudioH3AnchorConditioning", "video_latent", "MinimaxH3LatentUpscaler3D");
            requireInputReference(errors, nodes, "BasicGuider", "conditioning", "LocalVideoStudioH3AnchorConditioning");
        }
    }
    if (available.has("SamplerCustomAdvanced") && available.has("DisableNoise") && available.has("LTXVConcatAVLatent")) {
        requireInputReference(errors, nodes, "SamplerCustomAdvanced", "noise", "DisableNoise");
        requireInputReference(errors, nodes, "SamplerCustomAdvanced", "latent_image", "LTXVConcatAVLatent");
    }
    if (available.has("LocalVideoStudioH3SaveJointAV") && available.has("SamplerCustomAdvanced")) {
        requireInputReference(errors, nodes, "LocalVideoStudioH3SaveJointAV", "joint_av");
        const filename = inputsFor(nodes.get(nodeIdsForClass(nodes, "LocalVideoStudioH3SaveJointAV")[0])).filename;
        if (typeof filename !== "string" || !filename.includes("H3_AV_ARTIFACT_FILENAME")) errors.push("LocalVideoStudioH3SaveJointAV.filename 必须保留 H3_AV_ARTIFACT_FILENAME 占位符");
    }
}
export function h3ComfyAvWorkflowKind(source) {
    const nodes = graphNodes(source);
    const classes = classTypes(nodes);
    if (classes.has("LocalVideoStudioH3LoadJointAV") || SECOND_PASS_UPSCALER_CLASSES.some((classType) => classes.has(classType))) return "second-sampling-av";
    return classes.has("LocalVideoStudioH3SaveJointAV") ? "first-pass-av" : null;
}
export function validateH3ComfyWorkflow(source) {
    const nodes = graphNodes(source);
    const kind = h3ComfyAvWorkflowKind(source);
    if (!kind) return { valid: true, kind: null, errors: [] };
    const errors = [];
    if (kind === "first-pass-av") validateFirstPass(nodes, errors);
    else validateSecondPass(nodes, errors);
    return { valid: errors.length === 0, kind, errors: [...new Set(errors)] };
}
function inputSpecFor(node, inputName) {
    if (!isRecord(node)) return undefined;
    const input = node.input;
    if (!isRecord(input)) return undefined;
    for (const groupName of ["required", "optional", "hidden"]) {
        const group = input[groupName];
        if (!isRecord(group)) continue;
        if (inputName in group) return group[inputName];
    }
    return undefined;
}
function specType(spec) {
    if (typeof spec === "string") return spec.toUpperCase();
    if (Array.isArray(spec)) return typeof spec[0] === "string" ? spec[0].toUpperCase() : undefined;
    if (isRecord(spec) && typeof spec.type === "string") return spec.type.toUpperCase();
    return undefined;
}
function comboOptions(spec) {
    if (Array.isArray(spec)) {
        if (Array.isArray(spec[0])) return spec[0].filter((value) => typeof value === "string");
        if (isRecord(spec[1])) for (const key of ["options", "choices", "values"]) {
            const values = spec[1][key];
            if (Array.isArray(values)) return values.filter((value) => typeof value === "string");
        }
    }
    if (isRecord(spec)) for (const key of ["options", "choices", "values"]) {
        const values = spec[key];
        if (Array.isArray(values)) return values.filter((value) => typeof value === "string");
    }
    return [];
}
function runtimeTypeMatches(spec, expected) {
    if (expected === "ANY") return spec !== undefined;
    const actual = specType(spec);
    if (expected === "COMBO") return comboOptions(spec).length > 0 || actual === "COMBO" || actual === "STRING";
    return actual === expected;
}
function outputTypesFor(node) {
    if (!isRecord(node) || !Array.isArray(node.output)) return [];
    return node.output.filter((value) => typeof value === "string").map((value) => value.toUpperCase());
}
export function h3ComfyWorkflowRuntimeIssues(workflow, objectInfo) {
    const kind = h3ComfyAvWorkflowKind(workflow);
    if (!kind) return [];
    if (!isRecord(objectInfo)) return ["/object_info 响应无效，无法验证 H3 AV 节点 schema"];
    const workflowClassTypes = classTypes(graphNodes(workflow));
    const ultimate = kind === "second-sampling-av" && workflowClassTypes.has("MMH3UltimateUpscale");
    const workflowClasses = kind === "first-pass-av" ? FIRST_PASS_CLASSES : ultimate ? ULTIMATE_SECOND_PASS_CLASSES : SECOND_PASS_CLASSES;
    const workflowUpscalerClasses = SECOND_PASS_UPSCALER_CLASSES.filter((classType) => workflowClassTypes.has(classType));
    const runtimeClasses = new Set(kind === "second-sampling-av"
        ? ultimate
            ? ["MMH3UltimateUpscale", "MMH3LatentUpscaleWithModelParams", "MMH3TemporalSplitParams", "MMH3SpatialSplitParams", "MiniMaxH3ConditioningUpscale", "LocalVideoStudioH3LoadJointAV", "LocalVideoStudioH3RequireGpuVAE"]
            : [...workflowUpscalerClasses, "MiniMaxH3ConditioningUpscale", ...(workflowUpscalerClasses.includes("MinimaxH3LatentUpscaler3D") ? ["LocalVideoStudioH3AnchorConditioning"] : []), "MiniMaxH3AddNoise", "MiniMaxH3ShiftSigmas", "LTXVSeparateAVLatent", "LTXVConcatAVLatent", "LocalVideoStudioH3LoadJointAV"]
        : []);
    runtimeClasses.add("LocalVideoStudioH3SaveJointAV");
    const issues = [];
    for (const classType of workflowClasses) {
        if (["MiniMaxH3ImageToVideo", "SamplerCustomAdvanced", "VAEDecode", "VAEDecodeAudio", "CreateVideo", "SaveVideo", "DisableNoise", "BasicGuider"].includes(classType)) continue;
        runtimeClasses.add(classType);
    }
    for (const classType of runtimeClasses) {
        const node = objectInfo[classType];
        if (!node) {
            issues.push(`/object_info 缺少精确 class_type=${classType}`);
            continue;
        }
        const requirements = RUNTIME_NODE_REQUIREMENTS[classType];
        if (!requirements) continue;
        for (const requirement of requirements.inputs) {
            const spec = inputSpecFor(node, requirement.name);
            if (spec === undefined) issues.push(`${classType}.${requirement.name} 不在 /object_info schema 中`);
            else if (!runtimeTypeMatches(spec, requirement.type)) issues.push(`${classType}.${requirement.name} schema 类型不兼容：要求 ${requirement.type}`);
            if (requirement.name === "upscale_method" && spec !== undefined) {
                const options = comboOptions(spec);
                if (options.length > 0 && !options.includes("bilinear")) issues.push(`${classType}.upscale_method 缺少 workflow 使用的 bilinear 选项`);
            }
        }
        if (requirements.outputs) {
            const actualOutputs = outputTypesFor(node);
            if (actualOutputs.length > 0 && requirements.outputs.some((expected) => !actualOutputs.includes(expected))) issues.push(`${classType} /object_info 输出 schema 不包含 ${requirements.outputs.join("/")}`);
        }
    }
    return [...new Set(issues)];
}
