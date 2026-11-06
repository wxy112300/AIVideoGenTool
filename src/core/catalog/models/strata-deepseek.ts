import type { CatalogModelEntry } from "../types.js";
import { entry } from "./catalog-helpers.js";

export const STRATA_DEEPSEEK_MODEL_ID = "strata/deepseek-v4.1-flash-1017-uncensored-iq2_xxs";
export const STRATA_DEEPSEEK_DIRECTORY = "DeepSeek-V4.1-Flash-1017-Uncensored-GSQ-RCO-GGUF";
export const STRATA_DEEPSEEK_REVISION = "4f1d2f730cff977961db81789e81bfc0d3e6dd2e";
export const isStrataDeepSeek = (modelId: string) => modelId === STRATA_DEEPSEEK_MODEL_ID;
const atomic = "AtomicChat/DeepSeek-V4.1-Flash-1017-Uncensored-GSQ-RCO-GGUF";
const ista = "ISTA-DASLab/DeepSeek-V4.1-Flash-1017-GSQ-RCO-GGUF";
const unsloth = "unsloth/DeepSeek-V4.1-Flash-1017-GGUF";
export const STRATA_DEEPSEEK_ASSETS = [
  ...([
    [39075714624, "d46efb67ccffd8fb5d7f18b423896381b9e06d8491e161c370ddf3b05b07e050"],
    [39388449504, "cec1b2c3da429dc768b8bb9bc4dc4403d81f74d34db660a6a34ee3e555bf2c70"],
    [39246891616, "9d9c2140fcb134a0b9a74dedd0e5167e68077af6d08ce7f856bce112f0a35dd3"],
    [20527837312, "92e1b7aac2c27451977f093b89207a877221bba909424309450420f66fa42bf9"]
  ] as const).map(([bytes, sha256], index) => ({ filename: `DeepSeek-V4.1-Flash-1017-GSQ-RCO-IQ2_XXS-${String(index + 1).padStart(5, "0")}-of-00004.gguf`, bytes, sha256, repository: atomic, revision: STRATA_DEEPSEEK_REVISION, remote: "" })),
  { filename: "DeepSeek-V4.1-Flash-Engram-IQ4_NL.gguf", bytes: 110595290816, sha256: "eb19f30d368d393784e1fc54fdfaffc427ebb2110bf3762fdf5a8fbb9a2d740a", repository: ista, revision: "cb02422c900df489cea5833e8a92171224059b3c", remote: "" },
  { filename: "DeepSeek-V4.1-Flash-1017-UD-Q8_K_XL-00001-of-00009.gguf", bytes: 5780589, sha256: "cc15d470afcb030558bbc4d8e2ccd840182e2e95de1a95198138efe63a5fd99f", repository: unsloth, revision: "8a6ec9cf118e785a362ea94ee123c61c70553be6", remote: "UD-Q8_K_XL/" },
  { filename: "mmproj-BF16.gguf", bytes: 972208288, sha256: "9a1ef7c40d0d702c7ed8c5f863f60abae64091387ba3fce0ad19ce9beeda3bf9", repository: unsloth, revision: "8a6ec9cf118e785a362ea94ee123c61c70553be6", remote: "" },
  { filename: "dspark-DeepSeek-V4.1-Flash-1017-Q8_0.gguf", bytes: 7976914240, sha256: "6ba6ac1b331c540691a209e7fc97dec2a24e295acb1e755c84c7d24a4373927a", repository: unsloth, revision: "8a6ec9cf118e785a362ea94ee123c61c70553be6", remote: "" }
];

const name = "DeepSeek V4.1 Flash · Strata · IQ2_XXS · Uncensored";
export const strataDeepSeekEntries: CatalogModelEntry[] = [entry({
  id: STRATA_DEEPSEEK_MODEL_ID, family: "strata-deepseek-v4.1-flash", category: "prompt", adapterId: "strata", order: 7, inputModes: ["image"],
  scan: { managedBy: "strata", integrated: true, productGate: "open", vram: "RTX 4090 24GB · RAM 64GB · NVMe 260GB+ · CUDA 13 / driver 580+",
    components: STRATA_DEEPSEEK_ASSETS.map(asset => ({ label: asset.filename, expected: asset.filename,
      patterns: [new RegExp(`^${asset.filename.replaceAll(".", "\\.")}$`, "i")],
      installGuide: { sourceLabel: asset.repository, downloadUrl: `https://huggingface.co/${asset.repository}/resolve/${asset.revision}/${asset.remote}${asset.filename}`,
        targetSubdirectory: "", recommendedFilename: asset.filename, revision: asset.revision, bytes: asset.bytes, sha256: asset.sha256, license: "MIT" } })) }
}, { name, badge: "Strata · GSQ-RCO", description: "支持图片理解的 DeepSeek 社区 Uncensored 模型。" },
{ name, badge: "Strata · GSQ-RCO", description: "Community Uncensored DeepSeek model with image understanding." },
{ name, badge: "Strata · GSQ-RCO", description: "支援圖片理解的 DeepSeek 社群 Uncensored 模型。" })];
