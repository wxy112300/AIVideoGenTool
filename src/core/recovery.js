export function nextH3AttentionModeAfterCudaFailure(current) {
    if (!current || current === "sage")
        return "sage-triton";
    if (current === "sage-triton")
        return "pytorch";
    return null;
}
export function normalizeH3AttentionMode(value) {
    if (value === "sage-triton" || value === "pytorch")
        return value;
    return "sage";
}
const cudaContextPattern = /illegal memory access|cudaErrorIllegalAddress|device-side assertion|unspecified launch failure|misaligned address|hostbuf_file_reader_read failed|cuda context.*(?:invalid|destroyed)|cublas_status_execution_failed/i;
const gpuMemoryPattern = /out of memory|cuda.*alloc|allocation.*failed|cublas_status_alloc_failed|显存不足/i;
const transientServicePattern = /ECONNREFUSED|ECONNRESET|EPIPE|socket hang up|fetch failed|network error|无法连接\s*ComfyUI|ComfyUI.*(?:timed? out|timeout)|HTTP\s*(?:500|502|503|504)/i;
export function classifyFailureForRecovery(error, stalled = false) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (cudaContextPattern.test(message)) {
        return {
            kind: "cuda-context",
            recoverable: true,
            requiresRestart: true,
            forceStop: true
        };
    }
    if (gpuMemoryPattern.test(message) || /cuda error/i.test(message)) {
        return {
            kind: "gpu-memory",
            recoverable: true,
            requiresRestart: true,
            forceStop: false
        };
    }
    if (stalled) {
        return {
            kind: "service-stalled",
            recoverable: true,
            requiresRestart: true,
            forceStop: false
        };
    }
    if (transientServicePattern.test(message)) {
        return {
            kind: "service-transient",
            recoverable: true,
            requiresRestart: true,
            forceStop: false
        };
    }
    return {
        kind: "none",
        recoverable: false,
        requiresRestart: false,
        forceStop: false
    };
}
export function nextAutomaticRetryAttempt(options) {
    if (!options.enabled || !options.recoverable)
        return null;
    const currentAttempt = Number.isInteger(options.currentAttempt)
        ? Math.max(0, options.currentAttempt)
        : 0;
    const retryLimit = Number.isInteger(options.retryLimit)
        ? Math.max(0, options.retryLimit)
        : 0;
    return currentAttempt < retryLimit ? currentAttempt + 1 : null;
}
