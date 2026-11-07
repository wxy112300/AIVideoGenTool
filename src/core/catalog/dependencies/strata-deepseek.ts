import { STRATA_VERSION } from "./strata.js";
/** Independent DeepSeek engine in the same fixed Strata release feed. */
export const STRATA_DSV41_VERSION = "0.1.58";
export const STRATA_DSV41_URL = `https://github.com/Niko1221/Strata/releases/download/v${STRATA_VERSION}/strata-dsv41-${STRATA_DSV41_VERSION}-windows-x86_64-cuda-cuda13.tar.gz`;
export const STRATA_DSV41_BYTES = 422615818;
export const STRATA_DSV41_SHA256 = "7cb13673a6fe809fff327e29f26ef06cb8e9c069ff0330d1d6a67fdc97ced368";
export const STRATA_DSV41_MANIFEST_SHA256 = "a8a6787c1f9b8c10f3fc62c82484fb62c7f1f35f37e2f6bc4cbdb27d2ed510fd";
/** Discover prior verified components for software updates, never current readiness. */
export const STRATA_DSV41_PREVIOUS_MANIFEST_SHA256 = [
  "d0ebc5660e8fbaea64e0949400b36d7b410f087d7112a350214531f7fab15272",
  "8bed4cdf44613d94db2cafeafc0c4bd1c5d2fae8259921deb3b368406e6c8641"
] as const;
export const STRATA_DSV41_FILES = ["strata-dsv41.exe", "engine-component.json", "BUILD.json", "cublas64_13.dll", "cublasLt64_13.dll"] as const;
