/**
 * Persisted H3 Memory Optimization fields are retained only so old drafts and
 * queue/history records can be read safely. The third-party path was
 * withdrawn; no new workflow may enable it.
 */
export const H3_MEMORY_DEFAULT_ENABLED = false;
export const H3_MEMORY_PRODUCT_ENABLED = false;
export const H3_MEMORY_DEFAULT_MODE = "off";
export const H3_MEMORY_DEFAULT_CHUNK_ROWS = 4096;
export const H3_MEMORY_MIN_CHUNK_ROWS = 256;
export const H3_MEMORY_MAX_CHUNK_ROWS = 65536;
export const H3_MEMORY_CHUNK_ROW_STEP = 256;

export function normalizeH3MemoryOptimizationMode(_value, _fallback = H3_MEMORY_DEFAULT_MODE) {
  return "off";
}

export function normalizeH3MemoryChunkRows(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return H3_MEMORY_DEFAULT_CHUNK_ROWS;
  }
  const rounded = Math.round(value / H3_MEMORY_CHUNK_ROW_STEP) * H3_MEMORY_CHUNK_ROW_STEP;
  return Math.min(
    H3_MEMORY_MAX_CHUNK_ROWS,
    Math.max(H3_MEMORY_MIN_CHUNK_ROWS, rounded)
  );
}

export function normalizeH3MemoryOptions(value, fallbackMode = H3_MEMORY_DEFAULT_MODE) {
  return {
    h3MemoryOptimizationMode: normalizeH3MemoryOptimizationMode(
      value.h3MemoryOptimizationMode,
      fallbackMode
    ),
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
