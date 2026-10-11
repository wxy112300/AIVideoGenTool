/** Fixed preparation baseline, not an executable ComfyUI node. */
export const STRATA_VERSION = "0.1.41";
export const STRATA_REVISION = "fb58e0dbc8399662c0e47c76578c6e878b14f6cf";
export const STRATA_DEFAULT_PORT = 43127;
export const STRATA_SOURCE_URL = `https://github.com/Niko1221/Strata/archive/${STRATA_REVISION}.zip`;
export const STRATA_ENGINE_URL = `https://github.com/Niko1221/Strata/releases/download/v${STRATA_VERSION}/strata-windows-x64.zip`;
export const STRATA_ENGINE_SHA256 = "3dd7715f4844c0f9d2f28eb5067af0198f386df060c93523cd17e1d65b757f13";
export const STRATA_ENGINE_BYTES = 137164559;
export const STRATA_SOURCE_FILES = ["setup.py", "START-HERE.bat", "serve/server.py"] as const;
export const STRATA_ENGINE_FILES = ["engine/strata.exe", "engine/strata-vision.exe", "engine/BUILD.json"] as const;
export const STRATA_MODEL_REPOSITORY = "ISTA-DASLab/Qwen3.8-Flash-Next-GSQ-RCO-GGUF";
export const STRATA_MODEL_REVISION = "ed59f92082b1e93c0e96d60a8b11aab089b52f09";
