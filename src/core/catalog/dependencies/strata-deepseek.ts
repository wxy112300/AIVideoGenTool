import { STRATA_VERSION } from "./strata.js";
/** Independent DeepSeek engine in the same fixed Strata release feed. */
export const STRATA_DSV41_VERSION = "0.1.57";
export const STRATA_DSV41_URL = `https://github.com/Niko1221/Strata/releases/download/v${STRATA_VERSION}/strata-dsv41-${STRATA_DSV41_VERSION}-windows-x86_64-cuda-cuda13.tar.gz`;
export const STRATA_DSV41_BYTES = 422613464;
export const STRATA_DSV41_SHA256 = "bc1cbecc7553c3022e369bc1e0ed4f360ea26daf5dfc386dd0dde75be417941e";
export const STRATA_DSV41_MANIFEST_SHA256 = "d0ebc5660e8fbaea64e0949400b36d7b410f087d7112a350214531f7fab15272";
/** Discover prior verified components for software updates, never current readiness. */
export const STRATA_DSV41_PREVIOUS_MANIFEST_SHA256 = [
  "8bed4cdf44613d94db2cafeafc0c4bd1c5d2fae8259921deb3b368406e6c8641"
] as const;
export const STRATA_DSV41_FILES = ["strata-dsv41.exe", "engine-component.json", "BUILD.json", "cublas64_13.dll", "cublasLt64_13.dll"] as const;
