import type { H3AttentionMode, VramStallWatchdogDiagnostics } from "../types.js";

export type RecoverableFailureKind =
  | "cuda-context"
  | "gpu-memory"
  | "memory-pressure-stall"
  | "service-stalled"
  | "service-transient"
  | "none";

export interface FailureRecoveryDecision {
  kind: RecoverableFailureKind;
  recoverable: boolean;
  requiresRestart: boolean;
  forceStop: boolean;
}

export function nextH3AttentionModeAfterCudaFailure(
  current: H3AttentionMode | undefined
): H3AttentionMode | null {
  if (!current || current === "sage") return "sage-triton";
  if (current === "sage-triton") return "pytorch";
  if (current === "comfy-kitchen") return "pytorch";
  return null;
}

export class VramPressureStallError extends Error {
  readonly recoveryKind = "memory-pressure-stall" as const;
  readonly diagnostics?: VramStallWatchdogDiagnostics;

  constructor(
    message = "持续显存/系统内存压力下任务长期没有生产性进展",
    diagnostics?: VramStallWatchdogDiagnostics
  ) {
    super(message);
    this.name = "VramPressureStallError";
    this.diagnostics = diagnostics;
  }
}

export function normalizeH3AttentionMode(value: unknown): H3AttentionMode {
  if (value === "sage-triton" || value === "pytorch" || value === "comfy-kitchen") return value;
  return "sage";
}

const cudaContextPattern =
  /illegal memory access|cudaErrorIllegalAddress|device-side assertion|unspecified launch failure|misaligned address|hostbuf_file_reader_read failed|cuda context.*(?:invalid|destroyed)|cublas_status_execution_failed/i;
const gpuMemoryPattern =
  /out of memory|cuda.*alloc|allocation.*failed|cublas_status_alloc_failed|显存不足/i;
const transientServicePattern =
  /ECONNREFUSED|ECONNRESET|EPIPE|socket hang up|fetch failed|network error|无法连接\s*ComfyUI|ComfyUI.*(?:timed? out|timeout)|HTTP\s*(?:500|502|503|504)/i;

export function classifyFailureForRecovery(
  error: unknown,
  stalled = false
): FailureRecoveryDecision {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (error instanceof VramPressureStallError ||
      (error && typeof error === "object" &&
        (error as { recoveryKind?: unknown }).recoveryKind === "memory-pressure-stall")) {
    return {
      kind: "memory-pressure-stall",
      recoverable: true,
      requiresRestart: true,
      forceStop: true
    };
  }
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

export function nextAutomaticRetryAttempt(options: {
  enabled: boolean;
  recoverable: boolean;
  currentAttempt: number;
  retryLimit: number;
}): number | null {
  if (!options.enabled || !options.recoverable) return null;
  const currentAttempt = Number.isInteger(options.currentAttempt)
    ? Math.max(0, options.currentAttempt)
    : 0;
  const retryLimit = Number.isInteger(options.retryLimit)
    ? Math.max(0, options.retryLimit)
    : 0;
  return currentAttempt < retryLimit ? currentAttempt + 1 : null;
}
