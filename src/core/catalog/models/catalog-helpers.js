export function guide(sourceLabel, downloadUrl, targetSubdirectory, recommendedFilename, notes) {
    return { sourceLabel, downloadUrl, targetSubdirectory, recommendedFilename, ...(notes ? { notes } : {}) };
}
export function component(label, expected, pattern, installGuide, optional = false) {
    return { label, expected, patterns: [pattern], ...(installGuide ? { installGuide } : {}), ...(optional ? { optional } : {}) };
}
export function entry(definition, zhCN, enUS = zhCN, zhTW) {
    return { definition, locales: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS } };
}
export const comfyWanSource = "Comfy-Org / Wan_2.2_ComfyUI_Repackaged";
export const comfyWanBase = "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files";
export const comfyHunyuanSource = "Comfy-Org / HunyuanVideo_1.5_repackaged";
export const comfyHunyuanBase = "https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/resolve/main/split_files";
export const comfyWanVae = guide(comfyWanSource, `${comfyWanBase}/vae/wan_2.1_vae.safetensors`, "vae", "wan_2.1_vae.safetensors");
export const comfyWanUmt5 = guide(comfyWanSource, `${comfyWanBase}/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors`, "text_encoders", "umt5_xxl_fp8_e4m3fn_scaled.safetensors");
