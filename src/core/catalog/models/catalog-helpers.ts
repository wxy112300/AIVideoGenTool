import type { CatalogInstallGuide, CatalogModelComponent, CatalogModelEntry } from "../types.js";

export function guide(
  sourceLabel: string,
  downloadUrl: string,
  targetSubdirectory: string,
  recommendedFilename: string,
  notes?: string
): CatalogInstallGuide {
  return { sourceLabel, downloadUrl, targetSubdirectory, recommendedFilename, ...(notes ? { notes } : {}) };
}

export function component(
  label: string,
  expected: string,
  pattern: RegExp,
  installGuide?: CatalogInstallGuide,
  optional = false
): CatalogModelComponent {
  return { label, expected, patterns: [pattern], ...(installGuide ? { installGuide } : {}), ...(optional ? { optional } : {}) };
}

export function entry(
  definition: CatalogModelEntry["definition"],
  zhCN: CatalogModelEntry["locales"]["zh-CN"],
  enUS: CatalogModelEntry["locales"]["en-US"] = zhCN
): CatalogModelEntry {
  return { definition, locales: { "zh-CN": zhCN, "en-US": enUS } };
}

export const comfyWanSource = "Comfy-Org / Wan_2.2_ComfyUI_Repackaged";
export const comfyWanBase = "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main/split_files";
export const comfyHunyuanSource = "Comfy-Org / HunyuanVideo_1.5_repackaged";
export const comfyHunyuanBase = "https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/tree/main/split_files";
export const comfyWanVae = guide(comfyWanSource, `${comfyWanBase}/vae`, "vae", "wan_2.1_vae.safetensors");
export const comfyWanUmt5 = guide(comfyWanSource, `${comfyWanBase}/text_encoders`, "text_encoders", "umt5_xxl_fp8_e4m3fn_scaled.safetensors");
