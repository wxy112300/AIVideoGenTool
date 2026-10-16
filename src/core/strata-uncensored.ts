/** Explicit compatibility, never inferred from a model name or matching hidden size. */
export function supportsStrataUncensored(modelId: string): boolean {
  return modelId === "strata/qwen3.8-flash-next-iq3_xxs" || modelId === "strata/qwen3.8-flash-next-iq2_xs";
}

/** Shipped by our pinned Strata source archive. No separate model download or user path. */
export const STRATA_UNCENSORED_VECTOR = Object.freeze({
  id: "strata-esp-4-44-v1",
  relativePath: "data/experimental-speed-projection/Qwen3.8-Flash-Next-experimental-speed-projection.gguf",
  bytes: 483520,
  sha256: "ef0724c5b79297e481017be85769832bc26eb220c984ecba2b0e1b0c8426312b",
  firstLayer: 4, lastLayer: 44
});

export interface StrataUncensoredFacts {
  requested: boolean;
  supported: boolean;
  vectorId: string | null;
  vectorSha256: string | null;
  vectorLoaded: boolean;
  /** null = no completed request in this mode, not an engine activation claim. */
  applied: boolean | null;
}
