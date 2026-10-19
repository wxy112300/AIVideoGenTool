/** Explicit compatibility, never inferred from a model name or matching hidden size. */
export type StrataUncensoredMode = "off" | "builtin" | "community";
export function isStrataUncensoredMode(value: unknown): value is StrataUncensoredMode {
  return value === "off" || value === "builtin" || value === "community";
}
/** Explicit modes win; legacy true retains the original ESP, never opts into a new vector. */
export function normalizeStrataUncensoredMode(value: unknown, legacy?: unknown): StrataUncensoredMode {
  return isStrataUncensoredMode(value) ? value : legacy === true ? "builtin" : "off";
}
export function strataUncensoredMode(settings: { strataUncensoredMode?: unknown; strataUncensored?: unknown }): StrataUncensoredMode {
  return normalizeStrataUncensoredMode(settings.strataUncensoredMode, settings.strataUncensored);
}

export function supportsStrataUncensored(modelId: string): boolean {
  return modelId === "strata/qwen3.8-flash-next-iq3_xxs" || modelId === "strata/qwen3.8-flash-next-iq2_xs"
    || modelId === "strata/qwen3.8-flash-next-ud-q4_k_xl";
}

/** Shipped by our pinned Strata source archive. No separate model download or user path. */
export const STRATA_UNCENSORED_VECTOR = Object.freeze({
  id: "strata-esp-4-44-v1",
  relativePath: "data/experimental-speed-projection/Qwen3.8-Flash-Next-experimental-speed-projection.gguf",
  bytes: 483520,
  sha256: "ef0724c5b79297e481017be85769832bc26eb220c984ecba2b0e1b0c8426312b",
  firstLayer: 4, lastLayer: 44
});

/** Small software asset, downloaded only by the explicit runtime install/update transaction. */
export const STRATA_COMMUNITY_VECTOR = Object.freeze({
  id: "sergqwer-8-33-v1",
  relativePath: "data/lvs-control-vectors/sergqwer-8-33.gguf",
  revision: "257727d58ff85a9aef6f314f9a95f75e4fc330d2",
  source: "https://raw.githubusercontent.com/sergqwer/strata-nvfp4/257727d58ff85a9aef6f314f9a95f75e4fc330d2/data/uncensor/qwen-nvfp4-gptq-uncensored.gguf",
  notice: "https://github.com/sergqwer/strata-nvfp4/blob/257727d58ff85a9aef6f314f9a95f75e4fc330d2/data/uncensor/README.md",
  bytes: 267552,
  sha256: "a2ec3e999724022a55d48d30822bd10b1b25916ccc221013a119a674d06a46b5",
  firstLayer: 8, lastLayer: 33
});
export function strataVectorForMode(mode: Exclude<StrataUncensoredMode, "off">) {
  return mode === "community" ? STRATA_COMMUNITY_VECTOR : STRATA_UNCENSORED_VECTOR;
}

export interface StrataUncensoredFacts {
  mode?: StrataUncensoredMode;
  requested: boolean;
  supported: boolean;
  vectorId: string | null;
  vectorSha256: string | null;
  vectorLoaded: boolean;
  /** null = no completed request in this mode, not an engine activation claim. */
  applied: boolean | null;
}
