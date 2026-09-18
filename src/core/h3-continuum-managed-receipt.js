/**
 * Parser for the app-owned receipt emitted by the public Continuum V3.8
 * Run Storage path.  This deliberately keeps the upstream absolute paths
 * intact; Electron later resolves them against the configured output root.
 */
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function isPositiveInteger(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function isNonNegativeInteger(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function isIntegerArray(value, positive) {
    return Array.isArray(value) && value.every((item) => positive ? isPositiveInteger(item) : isNonNegativeInteger(item));
}
function validateAssemblyArrays(value) {
    const totals = value.actual_assembly_total_frames;
    const trims = value.actual_assembly_trims;
    const nets = value.actual_assembly_net_frames;
    const contexts = value.actual_assembly_context_frames;
    if (!isIntegerArray(totals, true) || !isIntegerArray(trims, false) || !isIntegerArray(nets, true) || !isIntegerArray(contexts, false)) {
        return "managed receipt assembly facts 无效";
    }
    if (totals.length !== trims.length || totals.length !== nets.length || totals.length !== contexts.length) {
        return "managed receipt assembly 数组长度不一致";
    }
    for (let index = 0; index < totals.length; index += 1) {
        if (totals[index] - trims[index] !== nets[index] || trims[index] >= totals[index]) {
            return `managed receipt assembly 第 ${index + 1} 个 chunk 的 total/trim/net 不一致`;
        }
    }
    return null;
}
function jsonCandidate(value) {
    if (typeof value !== "string")
        return value;
    try {
        return JSON.parse(value);
    }
    catch {
        return undefined;
    }
}
function unwrapCandidate(value) {
    const parsed = jsonCandidate(value);
    if (!isRecord(parsed))
        return parsed;
    return isRecord(parsed.receipt) ? parsed.receipt : parsed;
}
export function validateH3ContinuumManagedReceipt(value) {
    if (!isRecord(value))
        return "managed receipt 不是对象";
    if (value.schema_version !== 1)
        return "managed receipt schema 版本不受支持";
    for (const field of ["project_id", "run_name", "run_storage_path", "revision_id", "package_version", "created_at"]) {
        if (!isString(value[field]))
            return `managed receipt.${field} 缺失`;
    }
    if (value.generation_mode !== "Review Each Chunk" || value.run_storage !== "Save + Auto Resume")
        return "managed receipt 没有证明 Review/Run Storage contract";
    if (value.selected_source !== "run_storage" || value.fresh_fallback !== false)
        return "managed receipt 不是 Run Storage source 或检测到 fresh fallback";
    if (value.review_action !== "Continue / Next" && value.review_action !== "Regenerate Current" && value.review_action !== "Finish Remaining")
        return "managed receipt.review_action 无效";
    const requestedChunks = value.requested_chunks;
    const reusedCount = value.reused_count;
    const generatedCount = value.generated_count;
    const firstGeneratedChunk = value.first_generated_chunk;
    if (!isPositiveInteger(requestedChunks) || !isNonNegativeInteger(reusedCount) || generatedCount !== 1 || !isPositiveInteger(firstGeneratedChunk))
        return "managed receipt counts 无效";
    if (reusedCount + generatedCount !== requestedChunks)
        return "managed receipt reused/generated 计数与最终 Chunk 总数不一致";
    if (!isPositiveInteger(value.run_storage_schema_version))
        return "managed receipt Run Storage schema 无效";
    if (!isIntegerArray(value.reused_chunk_indices, true) || !isIntegerArray(value.generated_chunk_indices, true))
        return "managed receipt chunk index 无效";
    if (value.generated_chunk_indices.length !== 1 || value.generated_chunk_indices[0] !== firstGeneratedChunk)
        return "managed receipt generated chunk 无效";
    if (!Array.isArray(value.chunk_records) || value.chunk_records.length !== requestedChunks)
        return "managed receipt chunk records 与 requested chunks 不一致";
    const records = value.chunk_records;
    if (firstGeneratedChunk !== reusedCount + 1 || value.reused_chunk_indices.length !== reusedCount)
        return "managed receipt reused/generated prefix facts 不一致";
    for (let index = 0; index < records.length; index += 1) {
        const record = records[index];
        if (!isRecord(record) || record.logical_chunk_index !== index + 1 || !isString(record.record_filename) || !isString(record.payload_path))
            return "managed receipt chunk record 不连续或路径无效";
        if (record.storage_revision_id !== undefined && !isString(record.storage_revision_id))
            return "managed receipt storage revision 无效";
        if (typeof record.reused !== "boolean" || typeof record.generated !== "boolean" || record.reused === record.generated)
            return "managed receipt chunk 必须恰好是 reused 或 generated";
        if (record.reused !== (index + 1 <= reusedCount) || record.generated !== (index + 1 === firstGeneratedChunk))
            return "managed receipt chunk reused/generated prefix 不一致";
    }
    const assemblyError = validateAssemblyArrays(value);
    if (assemblyError)
        return assemblyError;
    if (typeof value.spectrum_mode !== "string" || !value.spectrum_mode.trim() || typeof value.spectrum_model_aware_mode !== "string" || !value.spectrum_model_aware_mode.trim())
        return "managed receipt Spectrum facts 无效";
    if (value.continuum_interop_api !== undefined && !isPositiveInteger(value.continuum_interop_api))
        return "managed receipt interop api 无效";
    return null;
}
export function parseH3ContinuumManagedReceipt(value) {
    const candidate = unwrapCandidate(value);
    const error = validateH3ContinuumManagedReceipt(candidate);
    if (error)
        throw new Error(`H3 Continuum managed receipt 校验失败：${error}`);
    return candidate;
}
/** Extract from the flattened ComfyUI history output of an OUTPUT_NODE. */
export function extractH3ContinuumManagedReceipt(comfyOutputs, nodeId) {
    if (!isRecord(comfyOutputs) || !isRecord(comfyOutputs.outputs))
        throw new Error("H3 Continuum managed receipt 缺少 ComfyUI outputs");
    const nodeOutput = comfyOutputs.outputs[nodeId];
    if (!isRecord(nodeOutput))
        throw new Error(`H3 Continuum managed receipt 缺少节点输出：${nodeId}`);
    const candidates = [];
    for (const key of ["h3_continuum_managed_receipt", "managed_receipt"]) {
        const entries = nodeOutput[key];
        if (Array.isArray(entries))
            candidates.push(...entries);
    }
    const ui = isRecord(nodeOutput.ui) ? nodeOutput.ui : undefined;
    for (const key of ["h3_continuum_managed_receipt", "managed_receipt"]) {
        const entries = ui?.[key];
        if (Array.isArray(entries))
            candidates.push(...entries);
    }
    if (Array.isArray(nodeOutput.result))
        candidates.push(...nodeOutput.result);
    for (const candidate of candidates) {
        try {
            return parseH3ContinuumManagedReceipt(candidate);
        }
        catch {
            // Try the next ComfyUI wrapper/representation.
        }
    }
    throw new Error("H3 Continuum managed receipt 输出无效或未通过 fail-closed 校验");
}
