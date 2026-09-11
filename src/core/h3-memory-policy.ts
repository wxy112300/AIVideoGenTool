import type { Draft, H3MemoryOptimizationMode } from "../types.js";

/**
 * Persisted H3 Memory Optimization fields are retained only so old drafts and
 * queue/history records can be read safely. The third-party path was
 * withdrawn; no new workflow may enable it.
 */
export const H3_MEMORY_DEFAULT_ENABLED = false;
export const H3_MEMORY_PRODUCT_ENABLED = false;
export const H3_MEMORY_DEFAULT_MODE: H3MemoryOptimizationMode = "off";
export const H3_MEMORY_DEFAULT_CHUNK_ROWS = 4096;
export const H3_MEMORY_MIN_CHUNK_ROWS = 256;
export const H3_MEMORY_MAX_CHUNK_ROWS = 65536;
export const H3_MEMORY_CHUNK_ROW_STEP = 256;

export interface H3MemoryOptions {
  h3MemoryOptimizationMode: H3MemoryOptimizationMode;
  h3MemoryOptimizationUserSet: boolean;
  h3MemoryChunkRows: number;
}

export function normalizeH3MemoryOptimizationMode(
  _value: unknown,
  _fallback: H3MemoryOptimizationMode = H3_MEMORY_DEFAULT_MODE
): H3MemoryOptimizationMode {
  return "off";
}

export function normalizeH3MemoryChunkRows(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return H3_MEMORY_DEFAULT_CHUNK_ROWS;
  }
  const rounded = Math.round(value / H3_MEMORY_CHUNK_ROW_STEP) * H3_MEMORY_CHUNK_ROW_STEP;
  return Math.min(
    H3_MEMORY_MAX_CHUNK_ROWS,
    Math.max(H3_MEMORY_MIN_CHUNK_ROWS, rounded)
  );
}

export function normalizeH3MemoryOptions(
  value: {
    h3MemoryOptimizationMode?: unknown;
    h3MemoryOptimizationUserSet?: unknown;
    h3MemoryChunkRows?: unknown;
  },
  fallbackMode: H3MemoryOptimizationMode = H3_MEMORY_DEFAULT_MODE
): H3MemoryOptions {
  return {
    h3MemoryOptimizationMode: normalizeH3MemoryOptimizationMode(
      value.h3MemoryOptimizationMode,
      fallbackMode
    ),
    h3MemoryOptimizationUserSet: false,
    h3MemoryChunkRows: normalizeH3MemoryChunkRows(value.h3MemoryChunkRows)
  };
}

export function normalizeDraftH3MemoryOptions(draft: Draft): Draft {
  return {
    ...draft,
    ...normalizeH3MemoryOptions(draft)
  };
}
