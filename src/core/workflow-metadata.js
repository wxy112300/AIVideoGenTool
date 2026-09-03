/**
 * Provenance for the API-format workflows bundled with Local Video Studio.
 *
 * The JSON files intentionally remain pure ComfyUI `/prompt` payloads.  A
 * top-level metadata object would be interpreted as a node by ComfyUI, so the
 * source/schema record lives here and is attached to BundledWorkflow at the
 * Electron boundary instead.  `nodePackages` contains ids from the custom
 * node catalog; the catalog remains the single source of repository URLs.
 */
const apiSchema = {
    id: "comfyui-api",
    version: 1,
    endpoint: "/prompt",
    sourceUrl: "https://docs.comfy.org/development/core-concepts/workflow"
};
const recommendedCore = "0.33.1";
const h3Core = {
    recommendedVersion: recommendedCore,
    minimumVersion: "0.31.0"
};
function metadata(filename, nodePackages, options = {}) {
    return {
        schema: apiSchema,
        comfyUi: options.comfyUi ?? { recommendedVersion: recommendedCore },
        nodePackages,
        source: {
            kind: "bundled",
            relativePath: `workflows/${filename}`,
            ...(options.upstreamUrl ? { upstreamUrl: options.upstreamUrl } : {})
        },
        verifiedAt: "2026-08-18"
    };
}
export const bundledWorkflowMetadata = {
    hunyuan15_i2v_api: metadata("hunyuan15_i2v_api.json", []),
    hunyuan15_sr_i2v_api: metadata("hunyuan15_sr_i2v_api.json", []),
    minimax_h3_fl2va_turbo_api: metadata("minimax_h3_fl2va_turbo_api.json", ["kjnodes"], {
        comfyUi: h3Core
    }),
    minimax_h3_fl2va_ultimate_tiled_second_sample_av_api: metadata("minimax_h3_fl2va_ultimate_tiled_second_sample_av_api.json", ["mmh3-ultimate-upscale", "h3-latent-upscaler", "kjnodes", "local-video-studio-h3-av"], {
        comfyUi: h3Core,
        upstreamUrl: "https://github.com/bbaudio-2025/Comfyui-MMH3-UltimateUpscale/tree/d91be5ac41797a3789b4765cdb6eb6d9129a4a4d"
    }),
    minimax_h3_i2v_api: metadata("minimax_h3_i2v_api.json", ["kjnodes", "h3-optimizations"], {
        comfyUi: h3Core,
        upstreamUrl: "https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/templates/video_minimax_h3_i2v.json"
    }),
    minimax_h3_i2v_gguf_q3_api: metadata("minimax_h3_i2v_gguf_q3_api.json", ["comfyui-gguf-h3", "kjnodes"], {
        comfyUi: h3Core
    }),
    minimax_h3_r2v_api: metadata("minimax_h3_r2v_api.json", ["video-helper-suite", "kjnodes"], {
        comfyUi: h3Core
    }),
    minimax_h3_r2v_extend_api: metadata("minimax_h3_r2v_extend_api.json", ["video-helper-suite", "h3-motion-context", "kjnodes"], {
        comfyUi: h3Core
    }),
    minimax_h3_t2va_api: metadata("minimax_h3_t2va_api.json", ["kjnodes", "h3-optimizations"], {
        comfyUi: h3Core
    }),
    minimax_h3_t2va_gguf_q3_api: metadata("minimax_h3_t2va_gguf_q3_api.json", ["comfyui-gguf-h3", "kjnodes"], {
        comfyUi: h3Core
    }),
    minimax_h3_t2va_turbo_api: metadata("minimax_h3_t2va_turbo_api.json", ["kjnodes"], {
        comfyUi: h3Core
    }),
    qwen36_h3_prompt_enhancer_api: metadata("qwen36_h3_prompt_enhancer_api.json", ["comfyui-multimodal-prompt-nodes"], {
        upstreamUrl: "https://raw.githubusercontent.com/wxy112300/AIVideoGenTool/main/workflows/qwen36_h3_prompt_enhancer_api.json"
    }),
    sulphur2_ltx23_extend_gguf_dev_api: metadata("sulphur2_ltx23_extend_gguf_dev_api.json", ["ltx-video", "comfyui-gguf", "video-helper-suite"]),
    sulphur2_ltx23_extend_gguf_q2_api: metadata("sulphur2_ltx23_extend_gguf_q2_api.json", ["ltx-video", "comfyui-gguf", "video-helper-suite"]),
    sulphur2_ltx23_i2v_api: metadata("sulphur2_ltx23_i2v_api.json", ["ltx-video"]),
    sulphur2_ltx23_i2v_gguf_dev_api: metadata("sulphur2_ltx23_i2v_gguf_dev_api.json", ["ltx-video", "comfyui-gguf"]),
    sulphur2_ltx23_i2v_gguf_q2_api: metadata("sulphur2_ltx23_i2v_gguf_q2_api.json", ["ltx-video", "comfyui-gguf"]),
    wan22_14b_gguf_i2v_api: metadata("wan22_14b_gguf_i2v_api.json", ["comfyui-gguf"]),
    wan22_14b_i2v_api: metadata("wan22_14b_i2v_api.json", []),
    wan22_5b_i2v_api: metadata("wan22_5b_i2v_api.json", [])
};
export function workflowMetadataForFilename(filename) {
    const basename = filename.replaceAll("\\", "/").split("/").pop() ?? filename;
    const key = basename.replace(/\.json$/i, "");
    return bundledWorkflowMetadata[key];
}
