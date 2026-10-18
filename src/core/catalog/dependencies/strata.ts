/** Fixed preparation baseline, not an executable ComfyUI node. */
export const STRATA_REPOSITORY = "Niko1221/Strata";
export const STRATA_VERSION = "0.1.45";
export const STRATA_REVISION = "477ac13cbe8e582c20484871ce459d20d82df09d";
export const STRATA_DEFAULT_PORT = 43127;
export const STRATA_SOURCE_URL = `https://github.com/Niko1221/Strata/archive/${STRATA_REVISION}.zip`;
export const STRATA_ENGINE_URL = `https://github.com/Niko1221/Strata/releases/download/v${STRATA_VERSION}/strata-windows-x64.zip`;
export const STRATA_ENGINE_SHA256 = "a1d4cafb8319c253f3010ff118dbd5ed07c232056b939ac7735819559f3b859e";
export const STRATA_ENGINE_BYTES = 165243142;
/** Recognized app-owned baselines, newest first; retained installs are not silently removed. */
export const STRATA_RELEASES = [
  { version: STRATA_VERSION, revision: STRATA_REVISION, engineSha256: STRATA_ENGINE_SHA256 },
  { version: "0.1.44.1", revision: "296b59d2f73c8f04a805df29c2fa97655adace78", engineSha256: "a29bda047f440e6d2ce1649306c3a7047ba35df5a032097c7509d4494fa2b448" },
  { version: "0.1.41", revision: "fb58e0dbc8399662c0e47c76578c6e878b14f6cf", engineSha256: "3dd7715f4844c0f9d2f28eb5067af0198f386df060c93523cd17e1d65b757f13" }
] as const;
export const STRATA_EXPERT_PROFILE = "data/expert-profile.bin";
/** setup.py's exact parser source; MTP tools require this checkout, not a random pip gguf. */
export const STRATA_LLAMA_REVISION = "3cf03257f219afbe7334045ff7c6a06ac68c627d";
export const STRATA_SOURCE_FILES = ["setup.py", "START-HERE.bat", "serve/server.py", STRATA_EXPERT_PROFILE] as const;
export const STRATA_ENGINE_FILES = ["engine/strata.exe", "engine/strata-vision.exe", "engine/BUILD.json"] as const;
export const STRATA_MODEL_REPOSITORY = "ISTA-DASLab/Qwen3.8-Flash-Next-GSQ-RCO-GGUF";
export const STRATA_MODEL_REVISION = "ed59f92082b1e93c0e96d60a8b11aab089b52f09";
