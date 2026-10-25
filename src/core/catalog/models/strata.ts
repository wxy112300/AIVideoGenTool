import type { CatalogModelComponent, CatalogModelEntry } from "../types.js";
import { entry } from "./catalog-helpers.js";
import { STRATA_MODEL_REPOSITORY, STRATA_MODEL_REVISION } from "../dependencies/strata.js";

export const QWEN_FLASH_NEXT_MODEL_DIRECTORY = "Qwen3.8-Flash-Next-GSQ-RCO-GGUF";
export const QWEN_FLASH_NEXT_UNSLOTH_DIRECTORY = "Qwen3.8-Flash-Next-GGUF";
export const STRATA_Q4_MODEL_ID = "strata/qwen3.8-flash-next-ud-q4_k_xl";
/** Identity and launch geometry come from pinned upstream docs/UNSLOTH_Q4.md. */
export const STRATA_Q4_MODEL = {
  id: STRATA_Q4_MODEL_ID, repository: "unsloth/Qwen3.8-Flash-Next-GGUF",
  revision: "38bb39ee97821de2c9009abb7e93950eec396e66", shardCount: 4,
  expertBytes: 71.7 * 1024 ** 3,
  shards: [
    [10946624, "4448186216b3af4cc558bbce2c3213f01608f8f8b2e5267a9767971dd3ec8082"],
    [49859583136, "3f342f1c1580473f1ee94ddd5b28206e8c07a70fa1a366f59d1d6c922919a6c9"],
    [49376141504, "56758f40269cad5cd9b0d3d6fbae0f40f6d5be6de49e4ab392dbe83157d9cbd3"],
    [12087983520, "753bda48b98ba4f1636134a90a967de1b2d3908a236c026e464777342e53510a"]
  ] as const
};
export function strataModelGeometry(modelId: string) {
  return modelId === STRATA_Q4_MODEL_ID
    ? { shardCount: 4, revision: STRATA_Q4_MODEL.revision, compatBf16: true }
    : { shardCount: 2, revision: STRATA_MODEL_REVISION, compatBf16: false };
}

/** Stock Qwen MTP, community-packed with Strata's tools; publisher metadata checked 2026-10-15. */
export const STRATA_MTP_ASSET = {
  repository: "SC117/Qwen3.8-Flash-Next-GSQ-RCO-abliterated-GGUF",
  revision: "eec4e10a2c29b440a2ae85591fa11569ce752963",
  expected: "mtp/mtp-q2_0.gguf",
  bytes: 889017216,
  sha256: "a22206a4d74eafbf31063a84610292535fb3b49af9a339963817fd04aed81e4d"
};

function mtpAsset(): CatalogModelComponent {
  return {
    label: "MTP · Q2_0", expected: STRATA_MTP_ASSET.expected, optional: true,
    patterns: [/^mtp\/mtp-q2_0\.gguf$/i],
    installGuide: {
      sourceLabel: "SC117 · Stock Qwen MTP · Strata Q2_0",
      downloadUrl: `https://huggingface.co/${STRATA_MTP_ASSET.repository}/resolve/${STRATA_MTP_ASSET.revision}/mtp-q2_0.gguf`,
      targetSubdirectory: "mtp", recommendedFilename: "mtp-q2_0.gguf",
      revision: STRATA_MTP_ASSET.revision, bytes: STRATA_MTP_ASSET.bytes,
      sha256: STRATA_MTP_ASSET.sha256, license: "Apache-2.0"
    }
  };
}

function asset(filename: string, directory: string, bytes: number, sha256: string,
  repository = STRATA_MODEL_REPOSITORY, revision = STRATA_MODEL_REVISION): CatalogModelComponent {
  const expected = directory ? `${directory}/${filename}` : filename;
  return {
    label: filename, expected,
    patterns: [new RegExp(`^${expected.replaceAll(".", "\\.")}$`, "i")],
    installGuide: {
      sourceLabel: repository,
      downloadUrl: `https://huggingface.co/${repository}/resolve/${revision}/${expected}`,
      targetSubdirectory: directory, recommendedFilename: filename,
      revision, bytes, sha256, license: repository === STRATA_Q4_MODEL.repository ? "Qwen Community License 1.0" : "Apache-2.0"
    }
  };
}

export const strataModelEntries: CatalogModelEntry[] = ([
  ["IQ3_XXS", 47039860096, "219ea929900dfa9ef091f3aa473fdba6874b65fcb36526d7d851ac9e95856d15"],
  ["IQ2_XS", 39225954592, "92cee27ae5bbadcd732416a0f7a7f0acc092399dbbe8f5a5efa707c2ec0a49d7"]
] as const).map(([quant, bytes, sha256], index) => {
  const name = `Qwen3.8-Flash-Next · Strata · ${quant}`;
  return entry({
    id: `strata/qwen3.8-flash-next-${quant.toLowerCase()}`,
    family: "strata-qwen3.8-flash-next", category: "prompt",
    adapterId: "strata", order: 10 - index, inputModes: ["image"],
    scan: {
      managedBy: "strata", integrated: true, productGate: "open",
      vram: quant === "IQ3_XXS" ? "RTX 4090 24GB · RAM 64GB · CUDA 13 / driver 580+" : "RTX 4090 24GB · RAM 48GB · CUDA 13 / driver 580+",
      components: [
        asset(`Qwen3.8-Flash-Next-GSQ-RCO-${quant}-00001-of-00002.gguf`, quant, bytes, sha256),
        asset(`Qwen3.8-Flash-Next-GSQ-RCO-${quant}-00002-of-00002.gguf`, quant, 28800138432, "316b46f3a2dbd68c900f43136ab9449f9dcc3725dfd8c794847c204bc161e113"),
        asset("mmproj-Qwen3.8-Flash-Next-BF16.gguf", "", 907543008, "b1a82259702816a5330d7bd7607cd9676b11780e79ff7348c21103ff3ce49bd0"),
        mtpAsset()
      ]
    }
  }, {
    name, badge: "Strata · GSQ-RCO",
    description: "多模态提示词模型，支持图片理解与 MTP 加速。"
  }, {
    name, badge: "Strata · GSQ-RCO",
    description: "Multimodal prompt model with image understanding and MTP acceleration."
  }, {
    name, badge: "Strata · GSQ-RCO",
    description: "多模態提示詞模型，支援圖片理解與 MTP 加速。"
  });
});

const q4Name = "Qwen3.8-Flash-Next · Strata · UD-Q4_K_XL";
strataModelEntries.push(entry({
  id: STRATA_Q4_MODEL_ID, family: "strata-qwen3.8-flash-next", category: "prompt",
  adapterId: "strata", order: 8, inputModes: ["image"],
  scan: {
    managedBy: "strata", integrated: true, productGate: "open",
    vram: "RTX 4090 24GB · RAM 128GB · CUDA 13 / driver 580+",
    components: [
      ...STRATA_Q4_MODEL.shards.map(([bytes, sha256], index) => asset(
        `Qwen3.8-Flash-Next-UD-Q4_K_XL-${String(index + 1).padStart(5, "0")}-of-00004.gguf`,
        "UD-Q4_K_XL", bytes, sha256, STRATA_Q4_MODEL.repository, STRATA_Q4_MODEL.revision)),
      asset("mmproj-Qwen3.8-Flash-Next-BF16.gguf", "", 907543008, "b1a82259702816a5330d7bd7607cd9676b11780e79ff7348c21103ff3ce49bd0"),
      mtpAsset()
    ]
  }
}, {
  name: q4Name, badge: "Strata · Unsloth Q4",
  description: "多模态提示词模型，支持图片理解与 MTP 加速。"
}, {
  name: q4Name, badge: "Strata · Unsloth Q4",
  description: "Multimodal prompt model with image understanding and MTP acceleration."
}, {
  name: q4Name, badge: "Strata · Unsloth Q4",
  description: "多模態提示詞模型，支援圖片理解與 MTP 加速。"
}));
