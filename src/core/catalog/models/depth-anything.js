import { component, entry } from "./catalog-helpers.js";
export const DEPTH_ANYTHING_V2_SMALL_REPOSITORY = "depth-anything/Depth-Anything-V2-Small-hf";
export const DEPTH_ANYTHING_V2_SMALL_REVISION = "5426e4f0f36572d16453bbda7a8389317b1bef99";
export const DEPTH_ANYTHING_V2_SMALL_MODEL_SUBDIRECTORY = "depthanything/Depth-Anything-V2-Small-hf";
export const DEPTH_ANYTHING_V2_SMALL_MODEL_FILENAME = "model.safetensors";
function escaped(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
function depthModelPattern() {
    const separator = "[/\\\\]";
    const pathPattern = escaped(DEPTH_ANYTHING_V2_SMALL_MODEL_SUBDIRECTORY).replaceAll("/", separator);
    return new RegExp(`${pathPattern}${separator}${escaped(DEPTH_ANYTHING_V2_SMALL_MODEL_FILENAME)}$`, "i");
}
function depthInstallGuide() {
    return {
        sourceLabel: `Hugging Face · ${DEPTH_ANYTHING_V2_SMALL_REPOSITORY}`,
        downloadUrl: `https://huggingface.co/${DEPTH_ANYTHING_V2_SMALL_REPOSITORY}/resolve/${DEPTH_ANYTHING_V2_SMALL_REVISION}/${DEPTH_ANYTHING_V2_SMALL_MODEL_FILENAME}?download=true`,
        targetSubdirectory: DEPTH_ANYTHING_V2_SMALL_MODEL_SUBDIRECTORY,
        recommendedFilename: DEPTH_ANYTHING_V2_SMALL_MODEL_FILENAME,
        version: DEPTH_ANYTHING_V2_SMALL_REVISION,
        revision: DEPTH_ANYTHING_V2_SMALL_REVISION,
        license: "Apache-2.0",
        notes: "只需下载这个 safetensors 权重并放入所示 ComfyUI 模型目录；config.json 与 preprocessor_config.json 已随 Local Video Studio 内置，不需要手动下载。"
    };
}
function depthComponent() {
    return component("Depth Anything V2 Small weights", `${DEPTH_ANYTHING_V2_SMALL_MODEL_SUBDIRECTORY}/${DEPTH_ANYTHING_V2_SMALL_MODEL_FILENAME}`, depthModelPattern(), depthInstallGuide());
}
export const depthAnythingV2 = entry({
    id: "depth-anything-v2",
    family: "depth-anything-v2",
    category: "video",
    role: "guide",
    adapterId: "depth-anything-v2",
    order: 1,
    inputModes: ["video"],
    scan: {
        managedBy: "comfyui",
        vram: "Depth guide · Transformers · 24.8M params · runtime required",
        integrated: true,
        components: [depthComponent()]
    }
}, {
    name: "Depth Anything V2 Small · 深度导引",
    shortName: "Depth Anything V2 Small",
    badge: "Guide model · 深度导引",
    description: "供 DLSS5 Super Resolution 使用的独立深度导引模型；它不是视频生成模型。",
    supportSummary: "只需用户提供固定 revision 的 safetensors 权重；配置文件由应用内置。",
    limitations: ["首发固定 Small；Base、Large 和 VDA-S 留待后续阶段。", "config.json 与 preprocessor_config.json 由 DLSS5 适配层内置，不作为用户下载项。"]
}, {
    name: "Depth Anything V2 Small · depth guide",
    shortName: "Depth Anything V2 Small",
    badge: "Guide model · depth",
    description: "A standalone depth guide consumed by the DLSS5 Super Resolution workflow; it is not a video generator.",
    supportSummary: "Only the pinned safetensors weight is user-managed; configuration is bundled with the app.",
    limitations: ["Small is the only initial profile; Base, Large and VDA-S are deferred.", "The config and preprocessor metadata are bundled by the DLSS5 adapter; only model.safetensors is listed here."]
}, {
    name: "Depth Anything V2 Small · 深度導引",
    shortName: "Depth Anything V2 Small",
    badge: "Guide model · 深度導引",
    description: "供 DLSS5 Super Resolution 使用的獨立深度導引模型；它不是影片生成模型。",
    supportSummary: "只需使用者提供固定 revision 的 safetensors 權重；設定檔由應用程式內建。",
    limitations: ["首發固定 Small；Base、Large 和 VDA-S 留待後續階段。", "config.json 與 preprocessor_config.json 由 DLSS5 適配層內建，不作為使用者下載項。"]
});
export const depthAnythingModelEntries = [depthAnythingV2];
