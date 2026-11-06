/** Fixed preparation baseline, not an executable ComfyUI node. */
export const STRATA_REPOSITORY = "Niko1221/Strata";
export const STRATA_VERSION = "0.2.11";
export const STRATA_REVISION = "c3b3f5035506f3e966f1b4b7b188aeaabae92f1d";
export const STRATA_DEFAULT_PORT = 43127;
export const STRATA_SOURCE_URL = `https://github.com/Niko1221/Strata/archive/${STRATA_REVISION}.zip`;
/** App/source and native engine are independently versioned upstream. */
export const STRATA_ENGINE_VERSION = "0.1.57";
export const STRATA_ENGINE_URL = `https://github.com/Niko1221/Strata/releases/download/v${STRATA_VERSION}/strata-engine-${STRATA_ENGINE_VERSION}-windows-x86_64-cuda-cuda13.tar.gz`;
export const STRATA_ENGINE_SHA256 = "0cdf191f0fb39b90edbb902f4d096b90f2ee90a4542deb8aef24985b22407c0f";
export const STRATA_ENGINE_BYTES = 627812560;
export const STRATA_ENGINE_MANIFEST_SHA256 = "7964873aac7331dd0309c17c49bf3a886616043741558677ec8158c9ba92da7e";
/** Recognize older receipts until a verified update replaces and cleans their software. */
export const STRATA_RELEASES = [
  { version: STRATA_VERSION, revision: STRATA_REVISION, engineSha256: STRATA_ENGINE_SHA256, bundledLibraries: true },
  { version: "0.2.7.1", revision: "46c152a1310f77cd2f0ce2c7cd213962df14fe83", engineSha256: "bfa68c6b2e92f9c273caaf937d9ae164918e6de4cca2dc1f1d79d32470f0915a", bundledLibraries: true },
  { version: "0.1.45", revision: "477ac13cbe8e582c20484871ce459d20d82df09d", engineSha256: "a1d4cafb8319c253f3010ff118dbd5ed07c232056b939ac7735819559f3b859e", bundledLibraries: false },
  { version: "0.1.44.1", revision: "296b59d2f73c8f04a805df29c2fa97655adace78", engineSha256: "a29bda047f440e6d2ce1649306c3a7047ba35df5a032097c7509d4494fa2b448", bundledLibraries: false },
  { version: "0.1.41", revision: "fb58e0dbc8399662c0e47c76578c6e878b14f6cf", engineSha256: "3dd7715f4844c0f9d2f28eb5067af0198f386df060c93523cd17e1d65b757f13", bundledLibraries: false },
  { version: "0.2.9", revision: "c62d5e3a15b40ea51c96aae9e8d36928965f53ab", engineSha256: "34f399a0a22e4af8b434439de04dcce3734ccba7e884ef6003439ba148d667df", bundledLibraries: true },
  { version: "0.2.10", revision: "ffa80d73133ea5c548aefe57889a16e8085a938f", engineSha256: "5336671c55bc1b819d076104608522147227001d1711378f35ea5d524bc866ec", bundledLibraries: true }
] as const;
/** Audited native v3/v4 pack layout; not a blanket acceptance of arbitrary source revisions. */
export const STRATA_COMPATIBLE_PACK_REVISIONS = [STRATA_REVISION, "ffa80d73133ea5c548aefe57889a16e8085a938f", "c62d5e3a15b40ea51c96aae9e8d36928965f53ab", STRATA_RELEASES[1].revision, "477ac13cbe8e582c20484871ce459d20d82df09d"] as const;
export const STRATA_EXPERT_PROFILE = "data/expert-profile.bin";
/** setup.py's exact parser source; MTP tools require this checkout, not a random pip gguf. */
export const STRATA_LLAMA_REVISION = "3cf03257f219afbe7334045ff7c6a06ac68c627d";
export const STRATA_SOURCE_FILES = ["setup.py", "START-HERE.bat", "serve/server.py", STRATA_EXPERT_PROFILE] as const;
export const STRATA_LEGACY_ENGINE_FILES = ["engine/strata.exe", "engine/strata-vision.exe", "engine/BUILD.json"] as const;
export const STRATA_BUNDLED_LIBRARIES = ["cublas64_13.dll", "cublasLt64_13.dll", "strata_kq.dll"] as const;
export const STRATA_ENGINE_FILES = [...STRATA_LEGACY_ENGINE_FILES, "engine/engine-component.json",
  ...STRATA_BUNDLED_LIBRARIES.map(name => `engine/${name}`)] as const;
export const STRATA_MODEL_REPOSITORY = "ISTA-DASLab/Qwen3.8-Flash-Next-GSQ-RCO-GGUF";
export const STRATA_MODEL_REVISION = "ed59f92082b1e93c0e96d60a8b11aab089b52f09";
