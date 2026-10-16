import type { CatalogModelComponent, CatalogModelEntry } from "../types.js";
import { entry } from "./catalog-helpers.js";
import { STRATA_MODEL_REPOSITORY, STRATA_MODEL_REVISION } from "../dependencies/strata.js";

export const QWEN_FLASH_NEXT_MODEL_DIRECTORY = "Qwen3.8-Flash-Next-GSQ-RCO-GGUF";

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

function asset(filename: string, directory: string, bytes: number, sha256: string): CatalogModelComponent {
  const expected = directory ? `${directory}/${filename}` : filename;
  return {
    label: filename, expected,
    patterns: [new RegExp(`^${expected.replaceAll(".", "\\.")}$`, "i")],
    installGuide: {
      sourceLabel: STRATA_MODEL_REPOSITORY,
      downloadUrl: `https://huggingface.co/${STRATA_MODEL_REPOSITORY}/resolve/${STRATA_MODEL_REVISION}/${expected}`,
      targetSubdirectory: directory, recommendedFilename: filename,
      revision: STRATA_MODEL_REVISION, bytes, sha256, license: "Apache-2.0"
    }
  };
}

export const strataModelEntries: CatalogModelEntry[] = ([
  ["IQ3_XXS", 47039860096, "219ea929900dfa9ef091f3aa473fdba6874b65fcb36526d7d851ac9e95856d15"],
  ["IQ2_XS", 39225954592, "92cee27ae5bbadcd732416a0f7a7f0acc092399dbbe8f5a5efa707c2ec0a49d7"]
] as const).map(([quant, bytes, sha256], index) => {
  const name = `Qwen3.8-Flash-Next · Strata · ${quant}`;
  const downloadGb = quant === "IQ3_XXS" ? "75.84" : "68.03";
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
    description: `多模态 MoE 模型，512 个专家、约 6B 激活参数，支持文本与图像输入。采用 Gated DeltaNet 与 QSA 混合注意力；GSQ-RCO ${quant} 分片共 ${downloadGb} GB，视觉投影约 0.91 GB。配套 MTP Q2_0 权重约 0.89 GB，用于多 Token 预测加速。`
  }, {
    name, badge: "Strata · GSQ-RCO",
    description: `Multimodal MoE with 512 experts and about 6B active parameters, supporting text and image inputs. Uses hybrid Gated DeltaNet and QSA attention. GSQ-RCO ${quant} shards total ${downloadGb} GB, with a 0.91 GB vision projector. The companion MTP Q2_0 weights (0.89 GB) accelerate multi-token prediction.`
  }, {
    name, badge: "Strata · GSQ-RCO",
    description: `多模態 MoE 模型，512 個專家、約 6B 啟用參數，支援文字與圖像輸入。採用 Gated DeltaNet 與 QSA 混合注意力；GSQ-RCO ${quant} 分片共 ${downloadGb} GB，視覺投影約 0.91 GB。配套 MTP Q2_0 權重約 0.89 GB，用於多 Token 預測加速。`
  });
});
