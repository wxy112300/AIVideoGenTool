export const nativePromptModelFiles = {
    "qwen/qwen3.5-4b": "qwen3.5_4b_bf16.safetensors",
    "qwen/qwen3.5-2b": "qwen3.5_2b_bf16.safetensors"
};
export const unconcernedPromptModelId = "qwen/qwen3.5-4b-unconcerned";
export const unconcernedPromptModelName = "Qwen3.5 4B Unconcerned · 应用自管理";
export const unconcernedPromptModelSource = "HauhauCS/Qwen3.5-4B-Uncensored-HauhauCS-Aggressive";
export const unconcernedPromptModelFilename = "Qwen3.5-4B-Uncensored-HauhauCS-Aggressive-Q6_K.gguf";
export const unconcernedPromptMmprojFilename = "mmproj-Qwen3.5-4B-Uncensored-HauhauCS-Aggressive-BF16.gguf";
export const managedPromptModelDefinitions = [
    {
        id: "lightx2v/minimax-h3-prompt-rewriter-8b",
        name: "MiniMax H3 Prompt Rewriter LoRA · Qwen3-VL 8B",
        source: "Qwen/Qwen3-VL-8B-Instruct",
        revision: "main",
        modelFilename: "model-00001-of-00004.safetensors",
        mmprojFilename: "adapter_model.safetensors",
        targetDirectory: "LLM/Qwen-VL/qwen3-vl-8b-instruct",
        contextSize: 8192,
        badge: "Qwen3-VL 8B · PEFT LoRA · ComfyUI",
        description: "官方 H3 Prompt Rewriter LoRA 绑定 Qwen3-VL-8B-Instruct，可读取参考图片/视频并输出适合 H3 的提示词。基座与适配器由 ComfyUI Qwen-VL 节点加载。",
        vram: "Qwen3-VL 8B BF16 约 17.5 GB；4090 建议 4-bit / CPU offload",
        licenseNote: "基座与 LoRA 分属各自许可；adapter 只能用于匹配的 Qwen3-VL-8B-Instruct 基座，不要套到 Qwen3.6/Qwen3.8 GGUF 或 H3 视频模型。",
        backend: "comfyui-qwenvl-lora",
        format: "peft",
        baseModelSource: "Qwen/Qwen3-VL-8B-Instruct",
        baseModelDirectory: "LLM/Qwen-VL/qwen3-vl-8b-instruct",
        baseModelName: "qwen3-vl-8b-instruct",
        adapterSource: "lightx2v/MiniMax-H3-Prompt-Rewriter-LoRA-8B",
        adapterDirectory: "LLM/Qwen-VL-LoRA/minimax-h3-prompt-rewriter-8b",
        adapterName: "minimax-h3-prompt-rewriter-8b"
    },
    {
        id: "qwen/qwen3.6-27b-uncensored-q4",
        name: "Qwen3.6 27B Q4 · Uncensored · ComfyUI",
        source: "DavidAU/Qwen3.6-27B-Fable-Fusion-711-Uncensored-Heretic-NM-DAU-NEO-MAX-MTP-GGUF",
        revision: "main",
        modelFilename: "Qwen3.6-27B-Fable-Fus-711-UnHeretic-NM-DAU-NEO-MAX-NEO-Q4_K_M.gguf",
        mmprojFilename: "mmproj-BF16.gguf",
        targetDirectory: "LLM/qwen3.6-27b-uncensored-q4",
        contextSize: 8192,
        badge: "Uncensored · Q4 · 4090",
        description: "Qwen3.6 27B 的社区 Uncensored Q4 GGUF；通过 ComfyUI MultiModal Prompt Nodes 运行，支持参考图片理解。使用普通 Q4，不使用 MTP 变体。",
        vram: "Q4_K_M 约 18.5 GB + mmproj 约 0.93 GB；4090 单独运行",
        licenseNote: "社区衍生模型，采用 Apache-2.0 模型卡声明；请阅读上游模型卡。4090 运行前应释放 H3/图像模型，提示词完成后自动卸载。",
        backend: "comfyui-multimodal"
    },
    {
        id: "qwen/qwen3.8-27b-uncensored-q4",
        name: "Qwen3.8 27B Q4 · Uncensored · JonathanColetti",
        source: "JonathanColetti/Qwen3.8-27B-Uncensored-GGUF",
        revision: "dee0a3164d9e11bbbebf5b63f52ba99443d14fc3",
        modelFilename: "Qwen3.8-27B-Uncensored-noMTP-Q4_K_M.gguf",
        mmprojFilename: "Qwen3.8-27B-Uncensored-vision-f16.gguf",
        targetDirectory: "LLM/qwen3.8-27b-uncensored-q4",
        contextSize: 8192,
        badge: "Uncensored · Q4 · 4090",
        description: "JonathanColetti 的 Qwen3.8 27B Uncensored Q4 GGUF；使用不带 MTP 的标准路径和配套视觉投影文件，通过 ComfyUI MultiModal Prompt Nodes 运行。",
        vram: "Q4_K_M 约 15.4 GB + vision 约 0.93 GB；4090 单独运行",
        licenseNote: "社区衍生模型，模型卡声明 Apache-2.0；请阅读模型卡。当前不启用 MTP，提示词完成后应释放模型显存。",
        backend: "comfyui-multimodal"
    },
    {
        id: "community/gemma-4-e4b-unconcerned-q5",
        name: "Gemma 4 E4B Q5 · Uncensored",
        source: "llmfan46/gemma-4-E4B-it-ultra-uncensored-heretic-GGUF",
        revision: "1465f37b7dbd15e91241ae78ffebecb9f25e15de",
        modelFilename: "gemma-4-E4B-it-ultra-uncensored-heretic-Q5_K_M.gguf",
        mmprojFilename: "gemma-4-E4B-it-mmproj-BF16.gguf",
        targetDirectory: "LLM/gemma-4-e4b-unconcerned-q5",
        contextSize: 8192,
        badge: "Uncensored · Q5",
        description: "Gemma 4 E4B 的社区低拒答多模态衍生版；保留图片与视频抽帧理解，适合普通模型拒绝扩写时手动选用。",
        vram: "Q5_K_M 5.76 GB + mmproj 0.99 GB",
        licenseNote: "社区衍生模型；使用前请阅读模型卡与 Gemma 使用条款，输出仍需由用户自行审核。"
    },
    {
        id: "community/gemma-4-12b-uncensored-q4",
        name: "Gemma 4 12B Q4 · Uncensored",
        source: "zaakirio/gemma-4-12b-it-uncensored-GGUF",
        revision: "32880562ac43cb589a85afb864309fdcaf486fae",
        modelFilename: "gemma-4-12b-it-uncensored-Q4_K_M.gguf",
        mmprojFilename: "mmproj-gemma-4-12B-it-bf16.gguf",
        targetDirectory: "LLM/gemma-4-12b-uncensored-q4",
        contextSize: 16384,
        badge: "Uncensored · Q4",
        description: "更强的社区 Uncensored 多模态档；适合复杂参考关系、长指令和需要更多画面细节的 H3 Prompt。",
        vram: "Q4_K_M 6.87 GB + mmproj 0.16 GB",
        licenseNote: "社区衍生模型；遵守 Gemma 使用条款。模型卡报告 Abliteration 只修改语言权重，多模态投影保持原版。"
    },
    {
        id: "community/gemma-4-26b-a4b-uncensored-q4",
        name: "Gemma 4 26B-A4B Q4 · Uncensored",
        source: "llmfan46/gemma-4-26B-A4B-it-ultra-uncensored-heretic-GGUF",
        revision: "aa470d4de039982e1924be4541bc4b45a3e8486d",
        modelFilename: "gemma-4-26B-A4B-it-ultra-uncensored-heretic-Q4_K_M.gguf",
        mmprojFilename: "gemma-4-26B-A4B-it-mmproj-BF16.gguf",
        targetDirectory: "LLM/gemma-4-26b-a4b-uncensored-q4",
        contextSize: 16384,
        badge: "Uncensored · MoE Q4",
        description: "Uncensored 质量上限档；MoE 每次只激活约 4B 参数，加载前仍需释放其它模型。",
        vram: "Q4_K_M · MoE",
        licenseNote: "社区衍生模型；使用前请阅读模型卡与 Gemma 使用条款。建议仅在 24GB 显卡上使用标准上下文。"
    },
    {
        id: "google/gemma-4-12b-q5",
        name: "Gemma 4 12B Q5 · 社区标准档",
        source: "unsloth/gemma-4-12b-it-GGUF",
        revision: "fc034cfff751157913579611efad8462ac1be606",
        modelFilename: "gemma-4-12b-it-Q5_K_M.gguf",
        mmprojFilename: "mmproj-BF16.gguf",
        targetDirectory: "LLM/gemma-4-12b-q5",
        contextSize: 16384,
        badge: "社区标准 · Q5",
        description: "社区验证的通用多模态档；在视觉细节和上下文长度之间保持平衡。",
        vram: "Q5_K_M · 标准多模态档",
        licenseNote: "Gemma 模型须遵守 Google Gemma 使用条款；GGUF 转换由 Unsloth 提供。"
    },
];
export function managedPromptModel(modelId) {
    return managedPromptModelDefinitions.find((model) => model.id === modelId);
}
export function isManagedPromptModel(modelId) {
    return Boolean(managedPromptModel(modelId));
}
export function isGemmaPromptModel(modelId) {
    const model = managedPromptModel(modelId);
    return Boolean(model && (!model.backend || model.backend === "h3-prompt-writer"));
}
export function isComfyMultimodalPromptModel(modelId) {
    return managedPromptModel(modelId)?.backend === "comfyui-multimodal";
}
export function isQwenVlPeftPromptModel(modelId) {
    return managedPromptModel(modelId)?.backend === "comfyui-qwenvl-lora";
}
export function comfyMultimodalPromptModel(modelId) {
    const model = managedPromptModel(modelId);
    return model?.backend === "comfyui-multimodal" ? model : undefined;
}
export function qwenVlPeftPromptModel(modelId) {
    const model = managedPromptModel(modelId);
    return model?.backend === "comfyui-qwenvl-lora" ? model : undefined;
}
export function promptModelBackend(modelId) {
    if (modelId in nativePromptModelFiles)
        return "native-text-generate";
    const managed = managedPromptModel(modelId);
    if (managed)
        return managed.backend ?? "h3-prompt-writer";
    return null;
}
export function promptModelSupportsImageEdit(modelId) {
    return promptModelBackend(modelId) !== null;
}
export function isUnconcernedPromptModel(modelId) {
    return modelId === unconcernedPromptModelId;
}
export function promptRuntimeForSettings(settings) {
    // Legacy settings are intentionally ignored. Every supported prompt backend now
    // runs inside the selected ComfyUI instance.
    return "comfyui";
}
