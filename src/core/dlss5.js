import { DLSS5_NODE_REVISION, DLSS5_RUNTIME_BUNDLE_ID } from "./catalog/dependencies/dlss5.js";
export const DLSS5_MODEL_ID = "dlss5-sr";
export const DLSS5_SCALE_VALUES = [2, 3, 4];
export const DLSS5_QUALITY_VALUES = ["quality", "balanced", "performance"];
export const DLSS5_GUIDE_PROFILE = "depth-anything-v2-small-farneback";
export const DLSS5_SR_SCALE_ENUM = ["2x", "3x", "4x"];
export const DLSS5_SR_QUALITY_ENUM = ["Quality", "Balanced", "Performance"];
export const DLSS5_DEPTH_MODEL = "Small (recommended)";
export const DLSS5_REQUIRED_WORKFLOW_NODE_TYPES = [
    "VHS_LoadVideo",
    "DLSS5DepthAnythingV2",
    "DLSS5OpticalFlow",
    "DLSSSuperResolution",
    "VHS_VideoCombine"
];
export const UPSCALE_TARGET_HEIGHT_VALUES = [720, 768, 1080, 1440, 2160];
export const DEFAULT_DLSS5_UPSCALE_OPTIONS = {
    operation: "super-resolution",
    scale: 2,
    quality: "quality",
    guideProfile: DLSS5_GUIDE_PROFILE,
    nodeRevision: DLSS5_NODE_REVISION,
    runtimeBundleId: DLSS5_RUNTIME_BUNDLE_ID
};
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function positiveInteger(value, label) {
    if (!Number.isSafeInteger(value) || Number(value) <= 0) {
        throw new Error(`${label} must be a positive safe integer`);
    }
    return Number(value);
}
export function isDlss5Scale(value) {
    return DLSS5_SCALE_VALUES.includes(value);
}
export function isDlss5Quality(value) {
    return DLSS5_QUALITY_VALUES.includes(value);
}
export function isUpscaleTargetHeight(value) {
    return UPSCALE_TARGET_HEIGHT_VALUES.includes(value);
}
/** Transitional guard for the existing pixel/H3 execution paths. */
export function requireLegacyUpscaleTargetHeight(value) {
    if (!isUpscaleTargetHeight(value)) {
        throw new Error("Legacy upscale targetHeight is missing or invalid");
    }
    return value;
}
export function normalizeDlss5Options(value) {
    if (!isRecord(value))
        throw new Error("DLSS5 options must be an object");
    if (value.operation !== "super-resolution")
        throw new Error("DLSS5 operation must be super-resolution");
    if (!isDlss5Scale(value.scale))
        throw new Error("DLSS5 scale must be 2, 3 or 4");
    if (!isDlss5Quality(value.quality))
        throw new Error("DLSS5 quality must be quality, balanced or performance");
    if (value.guideProfile !== DLSS5_GUIDE_PROFILE)
        throw new Error(`DLSS5 guide profile must be ${DLSS5_GUIDE_PROFILE}`);
    if (value.nodeRevision !== DLSS5_NODE_REVISION)
        throw new Error(`DLSS5 nodeRevision must be the pinned commit ${DLSS5_NODE_REVISION}`);
    if (value.runtimeBundleId !== DLSS5_RUNTIME_BUNDLE_ID)
        throw new Error(`DLSS5 runtimeBundleId must be ${DLSS5_RUNTIME_BUNDLE_ID}`);
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
export function isDlss5UpscaleOptions(value) {
    try {
        normalizeDlss5Options(value);
        return true;
    }
    catch {
        return false;
    }
}
export function dlss5OutputGeometry(sourceWidth, sourceHeight, scale) {
    const width = positiveInteger(sourceWidth, "sourceWidth");
    const height = positiveInteger(sourceHeight, "sourceHeight");
    if (!isDlss5Scale(scale))
        throw new Error("DLSS5 scale must be 2, 3 or 4");
    const outputWidth = width * scale;
    const outputHeight = height * scale;
    if (!Number.isSafeInteger(outputWidth) || !Number.isSafeInteger(outputHeight))
        throw new Error("DLSS5 output dimensions exceed safe integer range");
    return { width: outputWidth, height: outputHeight, scale };
}
export function dlss5OutputDimensions(sourceWidth, sourceHeight, scale) {
    const geometry = dlss5OutputGeometry(sourceWidth, sourceHeight, scale);
    return [geometry.width, geometry.height];
}
export const dlss5Geometry = dlss5OutputGeometry;
export function normalizeUpscaleTarget(input) {
    if (!isRecord(input))
        throw new Error("Upscale target must be an object");
    const hasDlssFields = input.targetScale !== undefined || input.dlss5 !== undefined;
    if (input.modelId === "dlss5-sr" || hasDlssFields) {
        if (input.modelId !== "dlss5-sr")
            throw new Error("DLSS5 target fields are only valid for modelId dlss5-sr");
        if (input.targetHeight !== undefined)
            throw new Error("DLSS5 targets must not depend on legacy targetHeight");
        if (!isDlss5Scale(input.targetScale))
            throw new Error("DLSS5 targetScale must be 2, 3 or 4");
        const dlss5 = normalizeDlss5Options(input.dlss5);
        if (dlss5.scale !== input.targetScale)
            throw new Error("DLSS5 targetScale and dlss5.scale must match");
        const geometry = dlss5OutputGeometry(input.sourceWidth, input.sourceHeight, input.targetScale);
        return {
            provider: "dlss5",
            modelId: "dlss5-sr",
            sourceWidth: positiveInteger(input.sourceWidth, "sourceWidth"),
            sourceHeight: positiveInteger(input.sourceHeight, "sourceHeight"),
            scale: input.targetScale,
            targetScale: input.targetScale,
            dlss5,
            targetWidth: geometry.width,
            targetOutputHeight: geometry.height,
            width: geometry.width,
            height: geometry.height
        };
    }
    const targetHeight = requireLegacyUpscaleTargetHeight(input.targetHeight);
    return { provider: "legacy", modelId: input.modelId, targetHeight };
}
export const normalizeDlss5Target = normalizeUpscaleTarget;
export const normalizeUpscaleRequestTarget = normalizeUpscaleTarget;
function valuesForInput(node, name) {
    const input = isRecord(node.input) ? node.input : undefined;
    const required = input && isRecord(input.required) ? input.required : undefined;
    return required?.[name];
}
function enumValues(value) {
    if (!Array.isArray(value))
        return undefined;
    return Array.isArray(value[0]) ? value[0] : undefined;
}
function nodeInfoFor(objectInfo, nodeType) {
    return isRecord(objectInfo) && isRecord(objectInfo[nodeType]) ? objectInfo[nodeType] : undefined;
}
function addUnique(values, value) {
    if (!values.includes(value))
        values.push(value);
}
function validateGuideNodeSchema(nodeType, node, missingInputs, invalidInputs, outputMismatch) {
    if (!node)
        return;
    const requiredInputs = nodeType === "DLSS5DepthAnythingV2"
        ? ["images", "model", "temporal_normalization", "chunk_size"]
        : ["images", "pyramid_scale", "levels", "window_size"];
    for (const inputName of requiredInputs) {
        if (valuesForInput(node, inputName) === undefined)
            missingInputs.push(`${nodeType}.${inputName}`);
    }
    const images = valuesForInput(node, "images");
    if (!Array.isArray(images) || images[0] !== "IMAGE")
        invalidInputs.push(`${nodeType}.images`);
    if (nodeType === "DLSS5DepthAnythingV2") {
        const models = enumValues(valuesForInput(node, "model"));
        if (!models || !models.includes(DLSS5_DEPTH_MODEL))
            invalidInputs.push(`${nodeType}.model`);
        const temporalNormalization = valuesForInput(node, "temporal_normalization");
        if (!Array.isArray(temporalNormalization) || temporalNormalization[0] !== "BOOLEAN")
            invalidInputs.push(`${nodeType}.temporal_normalization`);
        const chunkSize = valuesForInput(node, "chunk_size");
        if (!Array.isArray(chunkSize) || chunkSize[0] !== "INT")
            invalidInputs.push(`${nodeType}.chunk_size`);
    }
    else {
        const pyramidScale = valuesForInput(node, "pyramid_scale");
        if (!Array.isArray(pyramidScale) || pyramidScale[0] !== "FLOAT")
            invalidInputs.push(`${nodeType}.pyramid_scale`);
        const levels = valuesForInput(node, "levels");
        if (!Array.isArray(levels) || levels[0] !== "INT")
            invalidInputs.push(`${nodeType}.levels`);
        const windowSize = valuesForInput(node, "window_size");
        if (!Array.isArray(windowSize) || windowSize[0] !== "INT")
            invalidInputs.push(`${nodeType}.window_size`);
    }
    const output = Array.isArray(node.output) ? node.output : undefined;
    if (!output || output[0] !== "IMAGE")
        outputMismatch.push(`${nodeType}.output`);
}
export function validateDlss5ObjectInfoSchema(objectInfo) {
    const missingNodes = [];
    const missingInputs = [];
    const invalidInputs = [];
    const outputMismatch = [];
    const errors = [];
    for (const nodeType of ["DLSSSuperResolution", "DLSS5DepthAnythingV2", "DLSS5OpticalFlow"]) {
        if (!nodeInfoFor(objectInfo, nodeType))
            missingNodes.push(nodeType);
    }
    const sr = nodeInfoFor(objectInfo, "DLSSSuperResolution");
    if (sr) {
        for (const inputName of ["image", "depth", "motion_vectors", "scale", "quality"]) {
            if (valuesForInput(sr, inputName) === undefined)
                missingInputs.push(`DLSSSuperResolution.${inputName}`);
        }
        for (const imageInput of ["image", "depth", "motion_vectors"]) {
            const value = valuesForInput(sr, imageInput);
            if (!Array.isArray(value) || value[0] !== "IMAGE")
                invalidInputs.push(`DLSSSuperResolution.${imageInput}`);
        }
        const scales = enumValues(valuesForInput(sr, "scale"));
        if (!scales || scales.length !== DLSS5_SR_SCALE_ENUM.length || DLSS5_SR_SCALE_ENUM.some((scale) => !scales.includes(scale)))
            invalidInputs.push("DLSSSuperResolution.scale");
        const qualities = enumValues(valuesForInput(sr, "quality"));
        if (!qualities || DLSS5_SR_QUALITY_ENUM.some((quality) => !qualities.includes(quality)))
            invalidInputs.push("DLSSSuperResolution.quality");
        const output = Array.isArray(sr.output) ? sr.output : undefined;
        if (!output || output[0] !== "IMAGE" || output[1] !== "STRING")
            outputMismatch.push("DLSSSuperResolution.output");
    }
    validateGuideNodeSchema("DLSS5DepthAnythingV2", nodeInfoFor(objectInfo, "DLSS5DepthAnythingV2"), missingInputs, invalidInputs, outputMismatch);
    validateGuideNodeSchema("DLSS5OpticalFlow", nodeInfoFor(objectInfo, "DLSS5OpticalFlow"), missingInputs, invalidInputs, outputMismatch);
    if (missingNodes.length)
        errors.push(`missing nodes: ${missingNodes.join(", ")}`);
    if (missingInputs.length)
        errors.push(`missing inputs: ${missingInputs.join(", ")}`);
    if (invalidInputs.length)
        errors.push(`invalid inputs: ${invalidInputs.join(", ")}`);
    if (outputMismatch.length)
        errors.push(`invalid outputs: ${outputMismatch.join(", ")}`);
    return { valid: errors.length === 0, missingNodes, missingInputs, invalidInputs, outputMismatch, errors };
}
export const validateDlss5Schema = validateDlss5ObjectInfoSchema;
export function assertDlss5ObjectInfoSchema(objectInfo) {
    const result = validateDlss5ObjectInfoSchema(objectInfo);
    if (!result.valid)
        throw new Error(`DLSS5 object_info schema mismatch: ${result.errors.join("; ")}`);
}
export const assertDlss5Schema = assertDlss5ObjectInfoSchema;
export function isSafeRelativeComfyPath(value) {
    if (typeof value !== "string" || value.length === 0 || value.includes("\0"))
        return false;
    if (value.startsWith("/") || value.startsWith("\\") || /^[a-z]:/iu.test(value))
        return false;
    if (value.includes("\\"))
        return false;
    return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}
function inputValue(node, name) {
    return node?.inputs?.[name];
}
function sameConnection(value, nodeId, outputIndex) {
    return Array.isArray(value) && value.length === 2 && value[0] === nodeId && value[1] === outputIndex;
}
function validateConnection(value, label, workflow, invalidEdges, outputArities) {
    if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== "string" ||
        !Number.isSafeInteger(value[1]) || Number(value[1]) < 0) {
        invalidEdges.push(`${label} is not a valid API connection`);
        return;
    }
    const nodeId = value[0];
    const outputIndex = Number(value[1]);
    if (!workflow[nodeId]) {
        invalidEdges.push(`${label} references missing node ${nodeId}`);
        return;
    }
    const arity = outputArities[nodeId];
    if (arity !== undefined && outputIndex >= arity) {
        invalidEdges.push(`${label} references ${nodeId}:${outputIndex}, but that output does not exist`);
    }
}
function expectedLiteral(workflow, nodeId, inputName, expected, invalidInputs) {
    if (inputValue(workflow[nodeId], inputName) !== expected) {
        invalidInputs.push(`${nodeId}.${inputName} must be ${JSON.stringify(expected)}`);
    }
}
export function validateDlss5Workflow(workflow, objectInfo) {
    const missingNodes = [];
    const invalidEdges = [];
    const invalidInputs = [];
    const outputMismatch = [];
    const errors = [];
    const graph = isRecord(workflow) ? workflow : undefined;
    if (!graph) {
        errors.push("workflow must be an API-format node graph");
    }
    else {
        const expectedNodes = {
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
            }
            else if (node.class_type !== classType) {
                invalidInputs.push(`${nodeId}.class_type must be ${classType}`);
            }
            else if (!isRecord(node.inputs)) {
                invalidInputs.push(`${nodeId}.inputs must be an object`);
            }
        }
        for (const classType of DLSS5_REQUIRED_WORKFLOW_NODE_TYPES) {
            if (!Object.values(graph).some((node) => isRecord(node) && node.class_type === classType)) {
                addUnique(missingNodes, classType);
            }
        }
        const outputArities = { "1": 4, "2": 1, "3": 1, "4": 2 };
        for (const [nodeId, node] of Object.entries(graph)) {
            if (!isRecord(node) || !isRecord(node.inputs))
                continue;
            for (const [inputName, value] of Object.entries(node.inputs)) {
                if (Array.isArray(value) && (value.length === 2 || typeof value[0] === "string")) {
                    validateConnection(value, `${nodeId}.${inputName}`, graph, invalidEdges, outputArities);
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
            if (!isSafeRelativeComfyPath(source))
                invalidInputs.push("1.video must be a safe uploaded relative path");
        }
        if (depth?.class_type === "DLSS5DepthAnythingV2" && isRecord(depth.inputs)) {
            if (!sameConnection(inputValue(depth, "images"), "1", 0))
                invalidInputs.push("2.images must use 1:0");
            expectedLiteral(graph, "2", "model", DLSS5_DEPTH_MODEL, invalidInputs);
            expectedLiteral(graph, "2", "temporal_normalization", true, invalidInputs);
            expectedLiteral(graph, "2", "chunk_size", 4, invalidInputs);
        }
        if (flow?.class_type === "DLSS5OpticalFlow" && isRecord(flow.inputs)) {
            if (!sameConnection(inputValue(flow, "images"), "1", 0))
                invalidInputs.push("3.images must use 1:0");
            expectedLiteral(graph, "3", "pyramid_scale", 0.5, invalidInputs);
            expectedLiteral(graph, "3", "levels", 5, invalidInputs);
            expectedLiteral(graph, "3", "window_size", 21, invalidInputs);
        }
        if (sr?.class_type === "DLSSSuperResolution" && isRecord(sr.inputs)) {
            if (!sameConnection(inputValue(sr, "image"), "1", 0))
                invalidInputs.push("4.image must use 1:0");
            if (!sameConnection(inputValue(sr, "depth"), "2", 0))
                invalidInputs.push("4.depth must use 2:0");
            if (!sameConnection(inputValue(sr, "motion_vectors"), "3", 0))
                invalidInputs.push("4.motion_vectors must use 3:0");
            if (!DLSS5_SR_SCALE_ENUM.includes(inputValue(sr, "scale")))
                invalidInputs.push("4.scale must be 2x, 3x or 4x");
            if (!DLSS5_SR_QUALITY_ENUM.includes(inputValue(sr, "quality")))
                invalidInputs.push("4.quality is not an allowed DLSS5 quality");
        }
        if (combine?.class_type === "VHS_VideoCombine" && isRecord(combine.inputs)) {
            if (!sameConnection(inputValue(combine, "images"), "4", 0))
                invalidInputs.push("5.images must use 4:0");
            if (!sameConnection(inputValue(combine, "audio"), "1", 2))
                invalidInputs.push("5.audio must use 1:2");
            const frameRate = inputValue(combine, "frame_rate");
            if (typeof frameRate !== "number" || !Number.isFinite(frameRate) || frameRate <= 0)
                invalidInputs.push("5.frame_rate must be positive");
            if (!isSafeRelativeComfyPath(inputValue(combine, "filename_prefix")))
                invalidInputs.push("5.filename_prefix must be a safe relative output prefix");
            expectedLiteral(graph, "5", "format", "video/h264-mp4", invalidInputs);
            expectedLiteral(graph, "5", "save_output", true, invalidInputs);
        }
        for (const [nodeId, node] of Object.entries(graph)) {
            if (isRecord(node) && (node.class_type === "ImageScale" || node.class_type === "VRAM_Debug"))
                invalidInputs.push(`${nodeId}.${node.class_type} is not allowed in the DLSS5 graph`);
        }
    }
    if (objectInfo !== undefined) {
        const schema = validateDlss5ObjectInfoSchema(objectInfo);
        for (const value of schema.missingNodes)
            addUnique(missingNodes, value);
        invalidInputs.push(...schema.missingInputs, ...schema.invalidInputs);
        outputMismatch.push(...schema.outputMismatch);
        if (!schema.valid)
            errors.push(`object_info schema: ${schema.errors.join("; ")}`);
    }
    if (missingNodes.length)
        errors.push(`missing nodes: ${missingNodes.join(", ")}`);
    if (invalidEdges.length)
        errors.push(`invalid edges: ${invalidEdges.join("; ")}`);
    if (invalidInputs.length)
        errors.push(`invalid inputs: ${invalidInputs.join("; ")}`);
    if (outputMismatch.length)
        errors.push(`invalid outputs: ${outputMismatch.join(", ")}`);
    return { valid: errors.length === 0, missingNodes, invalidEdges, invalidInputs, outputMismatch, errors };
}
function dlss5NodeQualityFor(quality) {
    return quality === "quality" ? "Quality" : quality === "balanced" ? "Balanced" : "Performance";
}
export function buildDlss5UpscaleWorkflow(task, sourceVideo, objectInfo) {
    if (task.modelId !== DLSS5_MODEL_ID)
        throw new Error("DLSS5 workflow requires modelId dlss5-sr");
    if (task.targetHeight !== undefined)
        throw new Error("DLSS5 workflow must not contain legacy targetHeight");
    if (!task.dlss5 || task.targetScale === undefined)
        throw new Error("DLSS5 workflow is missing its immutable scale/options snapshot");
    const target = normalizeUpscaleTarget({
        modelId: task.modelId,
        sourceWidth: task.sourceWidth,
        sourceHeight: task.sourceHeight,
        targetScale: task.targetScale,
        dlss5: task.dlss5
    });
    if (target.provider !== "dlss5")
        throw new Error("DLSS5 workflow target normalization failed");
    if (task.targetWidth !== target.targetWidth || task.targetOutputHeight !== target.targetOutputHeight)
        throw new Error("DLSS5 task geometry does not match its frozen source scale");
    assertDlss5ObjectInfoSchema(objectInfo);
    const filenamePrefix = typeof task.outputFilename === "string"
        ? task.outputFilename.replace(/\.mp4$/i, "")
        : "";
    const workflow = {
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
    const validation = validateDlss5Workflow(workflow, objectInfo);
    if (!validation.valid)
        throw new Error(`DLSS5 workflow validation failed: ${validation.errors.join("; ")}`);
    return workflow;
}
