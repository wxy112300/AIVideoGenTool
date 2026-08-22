export const workflowDependencyCatalog = [{
        id: "minimax_h3_i2v",
        name: "MiniMax H3 Image-to-Video 官方工作流",
        purpose: "安装到 ComfyUI 用户工作流目录，可在 ComfyUI 中打开并导出 API 格式。",
        sourceUrl: "https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/templates/video_minimax_h3_i2v.json",
        targetSegments: ["user", "default", "workflows", "video_minimax_h3_i2v.json"]
    }, {
        id: "qwen36_h3_prompt_enhancer",
        name: "Qwen3.6 H3 提示词扩写工作流",
        purpose: "使用 ComfyUI MultiModal Prompt Nodes 加载本地 Qwen3.6 Q4 GGUF，读取参考图并输出 H3 提示词。",
        sourceUrl: "https://raw.githubusercontent.com/wxy112300/AIVideoGenTool/main/workflows/qwen36_h3_prompt_enhancer_api.json",
        targetSegments: ["user", "default", "workflows", "qwen36_h3_prompt_enhancer_api.json"]
    }];
export function workflowDependencyDefinition(id) {
    return workflowDependencyCatalog.find((definition) => definition.id === id);
}
