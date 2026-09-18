export const H3_AV_LATENT_ASSET_SCHEMA_VERSION = 1;
export const H3_CONTINUUM_SEQUENCE_SCHEMA_VERSION = 1;
export const H3_CONTINUUM_RECEIPT_SCHEMA_VERSION = 1;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const assetIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/u;
const storageKinds = new Set([
    "app-canonical",
    "continuum-run-chunk",
    "legacy-joint-av",
    "legacy-motion-context"
]);
const capabilities = new Set([
    "native-av",
    "motion-context",
    "continuum-bootstrap",
    "continuum-managed-chunk"
]);
const sampleScopes = new Set([
    "generated-clip",
    "extension-segment",
    "continuum-chunk"
]);
const artifactRoles = new Set([
    "first-pass-clean-av",
    "final-clean-av",
    "extend-segment-clean-av"
]);
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isSafeString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function isPositiveInteger(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function isPositiveNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function isNonNegativeInteger(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function isShape(value) {
    return Array.isArray(value) && value.length > 0 && value.every(isPositiveInteger);
}
function isHistoryFile(value) {
    return isRecord(value) &&
        isSafeString(value.filename) &&
        isSafeString(value.subfolder) &&
        value.type === "output" &&
        (value.absolutePath === undefined || isSafeString(value.absolutePath));
}
/** Return a root-relative output path, or null for an unsafe persisted path. */
export function safeH3OutputRelativePath(value) {
    if (!isHistoryFile(value))
        return null;
    const subfolder = value.subfolder.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "");
    const filename = value.filename.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "");
    const combined = `${subfolder}/${filename}`;
    const parts = combined.split("/");
    if (!subfolder || !filename || parts.some((part) => !part || part === "." || part === ".." || part.includes(":"))) {
        return null;
    }
    if (combined.startsWith("/") || /^[A-Za-z]:/u.test(combined))
        return null;
    return combined;
}
function validateProducer(value) {
    if (!isRecord(value))
        return "producer 不是对象";
    for (const field of [
        "workflowId",
        "workflowRevision",
        "producerNodeId",
        "producerNodeVersion",
        "executionModelId",
        "diffusionModelFilename",
        "textEncoderFilename",
        "videoVaeFilename",
        "audioVaeFilename"
    ]) {
        if (!isSafeString(value[field]))
            return `producer.${field} 缺失`;
    }
    if (!Array.isArray(value.loraFilenames) || !value.loraFilenames.every(isSafeString)) {
        return "producer.loraFilenames 无效";
    }
    if (!isPositiveInteger(value.width) || !isPositiveInteger(value.height))
        return "producer 几何无效";
    if (value.width % 32 !== 0 || value.height % 32 !== 0)
        return "producer 几何必须 32 对齐";
    if (value.fps !== 24 || !isPositiveInteger(value.frameCount))
        return "producer fps/frameCount 无效";
    if (value.sourceTaskId !== undefined && !isSafeString(value.sourceTaskId))
        return "producer.sourceTaskId 无效";
    if (value.sourceVersionId !== undefined && !isSafeString(value.sourceVersionId))
        return "producer.sourceVersionId 无效";
    if (value.legacyUnverified !== undefined && typeof value.legacyUnverified !== "boolean") {
        return "producer.legacyUnverified 无效";
    }
    return null;
}
function validateChunkPointer(value) {
    if (!isRecord(value))
        return "continuumChunk 不是对象";
    for (const field of ["projectId", "runName", "revisionId", "recordFilename"]) {
        if (!isSafeString(value[field]))
            return `continuumChunk.${field} 缺失`;
    }
    if (!isHistoryFile(value.runStorageRoot) || !safeH3OutputRelativePath(value.runStorageRoot)) {
        return "continuumChunk.runStorageRoot 无效";
    }
    if (!isHistoryFile(value.manifest) || !safeH3OutputRelativePath(value.manifest)) {
        return "continuumChunk.manifest 无效";
    }
    for (const field of ["logicalChunkIndex", "physicalGroupStart", "physicalGroupEnd"]) {
        if (!isPositiveInteger(value[field]))
            return `continuumChunk.${field} 无效`;
    }
    const physicalGroupStart = value.physicalGroupStart;
    const physicalGroupEnd = value.physicalGroupEnd;
    if (!isPositiveInteger(physicalGroupStart) || !isPositiveInteger(physicalGroupEnd))
        return "continuumChunk physical group 无效";
    if (physicalGroupEnd < physicalGroupStart)
        return "continuumChunk physical group 逆序";
    if (value.takeId !== undefined && !isSafeString(value.takeId))
        return "continuumChunk.takeId 无效";
    if (value.branchId !== undefined && !isSafeString(value.branchId))
        return "continuumChunk.branchId 无效";
    if (typeof value.accepted !== "boolean" || typeof value.reused !== "boolean") {
        return "continuumChunk accepted/reused 无效";
    }
    return null;
}
function validateCapabilities(value, storageKind, producer) {
    if (!Array.isArray(value) || value.length === 0 || !value.every((item) => capabilities.has(item))) {
        return "capabilities 无效";
    }
    const entries = value;
    if (storageKind === "continuum-run-chunk" && !entries.includes("continuum-managed-chunk")) {
        return "Continuum Run Storage asset 缺少 continuum-managed-chunk capability";
    }
    if (storageKind === "legacy-joint-av" && !entries.includes("continuum-bootstrap") && !entries.includes("native-av")) {
        return "legacy-joint-av asset 缺少 legacy consumer capability";
    }
    if (storageKind === "legacy-motion-context" && !entries.includes("motion-context")) {
        return "legacy-motion-context asset 缺少 motion-context capability";
    }
    if ((storageKind === "legacy-joint-av" || storageKind === "legacy-motion-context") && producer.legacyUnverified !== true) {
        return "旧资产缺少显式 legacyUnverified 标记";
    }
    return null;
}
export function validateH3AvLatentAsset(value) {
    if (!isRecord(value))
        return "H3 AV asset 不是对象";
    if (value.schemaVersion !== H3_AV_LATENT_ASSET_SCHEMA_VERSION)
        return "H3 AV asset schema 版本不受支持";
    if (!isSafeString(value.assetId) || !assetIdPattern.test(value.assetId))
        return "assetId 无效";
    if (!storageKinds.has(value.storageKind))
        return "storageKind 无效";
    if (!isHistoryFile(value.ownerPath) || !safeH3OutputRelativePath(value.ownerPath))
        return "ownerPath 无效或不安全";
    if (value.aliasPaths !== undefined && (!Array.isArray(value.aliasPaths) || !value.aliasPaths.every((item) => isHistoryFile(item) && safeH3OutputRelativePath(item)))) {
        return "aliasPaths 无效";
    }
    if (value.aliasMode !== undefined && value.aliasMode !== "hardlink" && value.aliasMode !== "copy-fallback") {
        return "aliasMode 无效";
    }
    if (value.aliasMode !== undefined && (!Array.isArray(value.aliasPaths) || value.aliasPaths.length === 0)) {
        return "aliasMode 存在时必须有 aliasPaths";
    }
    if (!isPositiveInteger(value.payloadBytes))
        return "payloadBytes 无效";
    for (const field of ["payloadSha256", "videoTensorSha256", "audioTensorSha256"]) {
        if (!sha256Pattern.test(String(value[field] ?? "")))
            return `${field} 无效`;
    }
    if (!isShape(value.videoShape) || !isSafeString(value.videoDtype))
        return "video shape/dtype 无效";
    if (!isShape(value.audioShape) || !isSafeString(value.audioDtype))
        return "audio shape/dtype 无效";
    if (!isPositiveInteger(value.width) || !isPositiveInteger(value.height) || value.width % 32 !== 0 || value.height % 32 !== 0) {
        return "asset 几何必须为正数且 32 对齐";
    }
    if (value.fps !== 24 || !isPositiveInteger(value.frameCount))
        return "asset fps/frameCount 无效";
    if (value.sampleScope !== undefined && !sampleScopes.has(value.sampleScope)) {
        return "sampleScope 无效";
    }
    if (value.artifactRole !== undefined && !artifactRoles.has(value.artifactRole)) {
        return "artifactRole 无效";
    }
    if (value.contextFrames !== undefined && !isNonNegativeInteger(value.contextFrames)) {
        return "contextFrames 无效";
    }
    const producerError = validateProducer(value.producer);
    if (producerError)
        return producerError;
    const capabilityError = validateCapabilities(value.capabilities, value.storageKind, value.producer);
    if (capabilityError)
        return capabilityError;
    if (value.storageKind === "continuum-run-chunk") {
        const pointerError = validateChunkPointer(value.continuumChunk);
        if (pointerError)
            return pointerError;
    }
    else if (value.continuumChunk !== undefined) {
        return "非 Continuum asset 不得携带 continuumChunk pointer";
    }
    if (!isSafeString(value.createdAt))
        return "createdAt 缺失";
    return null;
}
export function isH3AvLatentAsset(value) {
    return validateH3AvLatentAsset(value) === null;
}
function validateReceiptChunk(value) {
    if (!isRecord(value))
        return "receipt chunk 不是对象";
    if (!isPositiveInteger(value.logicalChunkIndex) || !isSafeString(value.recordFilename))
        return "receipt chunk index/record 无效";
    if (!isHistoryFile(value.payloadPath) || !safeH3OutputRelativePath(value.payloadPath))
        return "receipt chunk payloadPath 无效";
    if (value.payloadSha256 !== undefined && !sha256Pattern.test(String(value.payloadSha256)))
        return "receipt chunk payloadSha256 无效";
    if (typeof value.reused !== "boolean" || typeof value.generated !== "boolean")
        return "receipt chunk reused/generated 无效";
    if (value.reused === value.generated)
        return "receipt chunk 必须恰好是 reused 或 generated";
    return null;
}
export function validateH3ContinuumReceipt(value) {
    if (!isRecord(value))
        return "Continuum receipt 不是对象";
    if (value.schemaVersion !== H3_CONTINUUM_RECEIPT_SCHEMA_VERSION)
        return "Continuum receipt schema 版本不受支持";
    for (const field of ["projectId", "runName", "revisionId", "packageVersion"]) {
        if (!isSafeString(value[field]))
            return `receipt.${field} 缺失`;
    }
    if (!isHistoryFile(value.runStorageRoot) || !safeH3OutputRelativePath(value.runStorageRoot))
        return "receipt.runStorageRoot 无效";
    if (value.generationMode !== "Review Each Chunk" || value.runStorage !== "Save + Auto Resume")
        return "receipt 没有证明 managed Review/Run Storage";
    if (value.reviewAction !== undefined && value.reviewAction !== "Continue / Next" && value.reviewAction !== "Regenerate Current" && value.reviewAction !== "Finish Remaining")
        return "receipt.reviewAction 无效";
    if (value.selectedSource !== "run_storage" || value.freshFallback !== false)
        return "receipt 不是 Run Storage source 或检测到 fresh fallback";
    for (const field of ["runStorageSchemaVersion", "requestedChunks", "reusedCount", "generatedCount", "firstGeneratedChunk"]) {
        if (!isNonNegativeInteger(value[field]))
            return `receipt.${field} 无效`;
    }
    const requestedChunks = value.requestedChunks;
    const reusedCount = value.reusedCount;
    const generatedCount = value.generatedCount;
    if (!isNonNegativeInteger(requestedChunks) || !isNonNegativeInteger(reusedCount) || !isNonNegativeInteger(generatedCount))
        return "managed receipt counts 无效";
    if (requestedChunks <= 0 || generatedCount !== 1 || reusedCount + generatedCount !== requestedChunks) {
        return "managed receipt 必须证明一次只生成一个新 physical group";
    }
    for (const field of ["reusedChunkIndices", "generatedChunkIndices"]) {
        if (!Array.isArray(value[field]) || !value[field].every(isPositiveInteger))
            return `receipt.${field} 无效`;
    }
    const generatedChunkIndices = value.generatedChunkIndices;
    const firstGeneratedChunk = value.firstGeneratedChunk;
    if (!Array.isArray(generatedChunkIndices) || !isNonNegativeInteger(firstGeneratedChunk))
        return "receipt generated chunk facts 无效";
    if (generatedChunkIndices.length !== 1 || generatedChunkIndices[0] !== firstGeneratedChunk)
        return "receipt generated chunk 与 firstGeneratedChunk 不一致";
    if (firstGeneratedChunk !== reusedCount + 1 || value.reusedChunkIndices.length !== reusedCount)
        return "receipt reused/generated prefix facts 不一致";
    if (!Array.isArray(value.chunkRecords) || value.chunkRecords.length !== requestedChunks)
        return "receipt chunkRecords 与 requestedChunks 不一致";
    for (let index = 0; index < value.chunkRecords.length; index += 1) {
        const record = value.chunkRecords[index];
        const error = validateReceiptChunk(record);
        if (error)
            return error;
        if (record.logicalChunkIndex !== index + 1 ||
            record.reused !== (index + 1 <= reusedCount) ||
            record.generated !== (index + 1 === firstGeneratedChunk)) {
            return "receipt chunkRecords 的 reused/generated prefix 不一致";
        }
    }
    for (const field of ["actualAssemblyTotalFrames", "actualAssemblyTrims", "actualAssemblyNetFrames", "actualAssemblyContextFrames"]) {
        if (!Array.isArray(value[field]) || value[field].length === 0 || !value[field].every(isNonNegativeInteger))
            return `receipt.${field} 无效`;
    }
    if (typeof value.spectrumMode !== "string" || !value.spectrumMode.trim() || typeof value.spectrumModelAwareMode !== "string" || !value.spectrumModelAwareMode.trim())
        return "receipt Spectrum facts 无效";
    if (value.continuumInteropApi !== undefined && !isPositiveInteger(value.continuumInteropApi))
        return "receipt continuumInteropApi 无效";
    if (!isSafeString(value.createdAt))
        return "receipt.createdAt 缺失";
    return null;
}
export function isH3ContinuumReceipt(value) {
    return validateH3ContinuumReceipt(value) === null;
}
/** Validate a managed sequence without changing or importing old history. */
export function validateContinuumSequence(value) {
    if (!isRecord(value))
        return "Continuum sequence 不是对象";
    if (value.schemaVersion !== H3_CONTINUUM_SEQUENCE_SCHEMA_VERSION)
        return "Continuum sequence schema 版本不受支持";
    for (const field of ["sequenceId", "projectId", "runName", "packageVersion", "workflowRevision"]) {
        if (!isSafeString(value[field]))
            return `sequence.${field} 缺失`;
    }
    if (!isSafeString(value.promptFormat) || value.promptFormat !== "Timeline")
        return "sequence.promptFormat 必须为 Timeline";
    for (const field of ["runStorageSchemaVersion", "targetChunks", "acceptedChunks"]) {
        if (!isNonNegativeInteger(value[field]))
            return `sequence.${field} 无效`;
    }
    if (!isPositiveNumber(value.chunkSeconds) || value.fps !== 24 || !isPositiveInteger(value.width) || !isPositiveInteger(value.height) || !isNonNegativeInteger(value.baseSeed))
        return "sequence 固定采样契约无效";
    const targetChunks = value.targetChunks;
    const acceptedChunks = value.acceptedChunks;
    if (!isNonNegativeInteger(targetChunks) || !isNonNegativeInteger(acceptedChunks))
        return "sequence target/accepted 无效";
    if (value.width % 32 !== 0 || value.height % 32 !== 0 || targetChunks < 1 || acceptedChunks > targetChunks)
        return "sequence target/geometry 无效";
    if (!isRecord(value.canonicalHead) || !isSafeString(value.canonicalHead.revisionId))
        return "sequence canonicalHead 无效";
    if (!Array.isArray(value.chunks))
        return "sequence chunks 无效";
    let previousIndex = 0;
    for (const chunk of value.chunks) {
        if (!isRecord(chunk) || !isPositiveInteger(chunk.logicalChunkIndex) || chunk.logicalChunkIndex !== previousIndex + 1)
            return "sequence chunks 必须从 1 连续编号";
        previousIndex = chunk.logicalChunkIndex;
        if (!isRecord(chunk.prompt) || !isSafeString(chunk.prompt.userPrompt) || !isSafeString(chunk.prompt.finalPrompt) || !isSafeString(chunk.prompt.promptHash))
            return "sequence chunk prompt 无效";
    }
    if (!isSafeString(value.updatedAt))
        return "sequence.updatedAt 缺失";
    return null;
}
export function isManagedContinuumSequence(value) {
    return validateContinuumSequence(value) === null;
}
/** A managed extend may only append one final Chunk to an accepted prefix. */
export function validateContinuumAppend(previous, next) {
    const previousError = validateContinuumSequence(previous);
    if (previousError)
        return `previous sequence 无效：${previousError}`;
    const nextError = validateContinuumSequence(next);
    if (nextError)
        return `next sequence 无效：${nextError}`;
    if (previous.sequenceId !== next.sequenceId || previous.projectId !== next.projectId || previous.runName !== next.runName)
        return "append 不得改变 sequence/project/run identity";
    if (next.targetChunks !== previous.targetChunks + 1)
        return "managed append 必须只增加一个 Chunk";
    if (next.chunks.length !== previous.chunks.length + 1)
        return "managed append 必须只追加一个 chunk record";
    for (let index = 0; index < previous.chunks.length; index += 1) {
        const before = previous.chunks[index];
        const after = next.chunks[index];
        if (before.prompt.promptHash !== after.prompt.promptHash || before.assetId !== after.assetId || before.status !== after.status) {
            return `append 修改了已接受 chunk ${index + 1}`;
        }
    }
    return null;
}
/** Apply one verified managed receipt to the immutable History sequence head. */
export function sequenceAfterManagedReceipt(previous, receipt, prompt, assetId, outputVersionId, updatedAt, identity = {}) {
    const previousError = validateContinuumSequence(previous);
    if (previousError)
        throw new Error(`previous Continuum sequence 无效：${previousError}`);
    const receiptError = validateH3ContinuumReceipt(receipt);
    if (receiptError)
        throw new Error(`Continuum receipt 无效：${receiptError}`);
    const action = receipt.reviewAction ?? "Continue / Next";
    const generatedRecord = receipt.chunkRecords.find((record) => record.logicalChunkIndex === receipt.firstGeneratedChunk);
    if (!generatedRecord)
        throw new Error("Continuum receipt 缺少 generated chunk record");
    const takeId = `take-${receipt.revisionId}`;
    const branchId = identity.parentBranchId ??
        (identity.parentTakeId ? `branch-${identity.parentTakeId}` : undefined) ??
        previous.canonicalHead.branchId ?? `branch-${previous.sequenceId}`;
    const nextChunks = previous.chunks.map((chunk) => ({ ...chunk, prompt: { ...chunk.prompt } }));
    const nextChunk = {
        logicalChunkIndex: receipt.firstGeneratedChunk,
        physicalGroupStart: receipt.firstGeneratedChunk,
        physicalGroupEnd: receipt.firstGeneratedChunk,
        parentVersionId: previous.canonicalHead.historyVersionId,
        prompt: { chunkIndex: receipt.firstGeneratedChunk, ...prompt },
        ...(assetId ? { assetId } : {}),
        runRevisionId: receipt.revisionId,
        takeId,
        branchId,
        status: "accepted",
        reused: false,
        generated: true,
        outputVersionId,
        receipt
    };
    if (action === "Regenerate Current") {
        if (receipt.firstGeneratedChunk < 1 || receipt.firstGeneratedChunk > nextChunks.length) {
            throw new Error("Regenerate Current 没有可替换的当前 Chunk");
        }
        nextChunks[receipt.firstGeneratedChunk - 1] = nextChunk;
    }
    else {
        if (receipt.firstGeneratedChunk !== previous.acceptedChunks + 1) {
            throw new Error("managed append 的 generated chunk 没有紧接 canonical head");
        }
        nextChunks.push(nextChunk);
    }
    const targetChunks = action === "Regenerate Current"
        ? previous.targetChunks
        : Math.max(previous.targetChunks + (previous.chunks.length === 0 ? 0 : 1), receipt.requestedChunks);
    const next = {
        ...previous,
        status: "review-ready",
        targetChunks,
        acceptedChunks: nextChunks.length,
        canonicalHead: {
            revisionId: receipt.revisionId,
            takeId,
            branchId,
            historyVersionId: outputVersionId
        },
        chunks: nextChunks,
        updatedAt
    };
    const error = validateContinuumSequence(next);
    if (error)
        throw new Error(`managed Continuum sequence 更新后无效：${error}`);
    return next;
}
export function continuumChunkCapabilityForStorage(storageKind) {
    switch (storageKind) {
        // The Run Storage file remains the official owner. Native/Motion loader
        // contracts are not implied by a managed chunk's raw video/audio keys.
        case "continuum-run-chunk": return ["continuum-managed-chunk"];
        case "legacy-joint-av": return ["native-av", "continuum-bootstrap"];
        case "legacy-motion-context": return ["motion-context"];
        default: return ["native-av"];
    }
}
