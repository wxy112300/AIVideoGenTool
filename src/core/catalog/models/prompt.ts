import { managedPromptModelDefinitions } from "../../prompt-models.js";
import { entry, component, guide } from "./catalog-helpers.js";
import type { CatalogModelEntry } from "../types.js";

const managedPromptEnglish: Record<string, { name: string; badge: string; description: string; licenseNote: string }> = {
  "qwen/qwen3.6-27b-uncensored-q4": {
    name: "Qwen3.6 27B Q4 · Uncensored · ComfyUI",
    badge: "Uncensored · Q4 · 4090",
    description: "A community Q4 GGUF profile for ComfyUI MultiModal Prompt Nodes. It can read reference images and should run alone on a 24 GB RTX 4090.",
    licenseNote: "Community derivative; read the upstream model card. Use the regular Q4 quant, not an MTP variant, and release the prompt model before H3 generation."
  },
  "qwen/qwen3.8-27b-uncensored-q4": {
    name: "Qwen3.8 27B Q4 · Uncensored · JonathanColetti",
    badge: "Uncensored · Q4 · 4090",
    description: "A community Q4 GGUF profile with a matching vision projector for ComfyUI MultiModal Prompt Nodes. This app uses the non-MTP variant as the conservative 24 GB RTX 4090 path.",
    licenseNote: "Community derivative; read JonathanColetti's model card. Use the non-MTP Q4 file and its matching vision projector; release the prompt model before H3 generation."
  },
  "community/gemma-4-e4b-unconcerned-q5": {
    name: "Gemma 4 E4B Q5 · Uncensored",
    badge: "Uncensored · Q5",
    description: "A community low-refusal multimodal derivative that retains image and video-frame understanding for cases where ordinary models refuse expansion.",
    licenseNote: "Community derivative. Read the model card and Gemma terms before use; users remain responsible for reviewing outputs."
  },
  "community/gemma-4-12b-uncensored-q4": {
    name: "Gemma 4 12B Q4 · Uncensored",
    badge: "Uncensored · Q4",
    description: "A stronger uncensored multimodal profile for complex reference relationships, long instructions, and H3 prompts that need more visual detail.",
    licenseNote: "Community derivative subject to the Gemma terms. The model card reports that abliteration changes language weights only and retains the original multimodal projection."
  },
  "community/gemma-4-26b-a4b-uncensored-q4": {
    name: "Gemma 4 26B-A4B Q4 · Uncensored",
    badge: "Uncensored · MoE Q4",
    description: "The high-quality uncensored profile; only about 4B MoE parameters activate per step, but other models should still be released before loading.",
    licenseNote: "Community derivative. Read the model card and Gemma terms before use; use standard context on 24 GB GPUs."
  },
  "google/gemma-4-e4b-q3": {
    name: "Gemma 4 E4B Q3 · Community compatible",
    badge: "Community compatible · Q3",
    description: "A lightweight community-validated profile that understands images and video frames but may omit visual details.",
    licenseNote: "Gemma models are subject to the Google Gemma terms; the GGUF conversion is provided by Unsloth."
  },
  "google/gemma-4-12b-q4": {
    name: "Gemma 4 12B Q4 · Community compact",
    badge: "Community compact · Q4",
    description: "A compact community-validated multimodal profile for fast H3 prompt generation.",
    licenseNote: "Gemma models are subject to the Google Gemma terms; the GGUF conversion is provided by Unsloth."
  },
  "google/gemma-4-12b-q5": {
    name: "Gemma 4 12B Q5 · Community standard",
    badge: "Community standard · Q5",
    description: "A general-purpose community-validated multimodal profile balancing visual detail and context length.",
    licenseNote: "Gemma models are subject to the Google Gemma terms; the GGUF conversion is provided by Unsloth."
  },
  "google/gemma-4-26b-a4b-q4": {
    name: "Gemma 4 26B-A4B Q4 · Community pick for 4090",
    badge: "Community pick · MoE Q4",
    description: "The H3 Prompt Writer author's quality/speed balance; release other models before running it.",
    licenseNote: "Gemma models are subject to the Google Gemma terms; the GGUF conversion is provided by Unsloth."
  },
};

const managedPromptTraditional: Record<string, { name: string; badge: string; description: string; licenseNote: string }> = {
  "qwen/qwen3.6-27b-uncensored-q4": {
    name: "Qwen3.6 27B Q4 · Uncensored · ComfyUI",
    badge: "Uncensored · Q4 · 4090",
    description: "供 ComfyUI MultiModal Prompt Nodes 使用的社群 Q4 GGUF；可理解參考圖片，建議在 24GB RTX 4090 上單獨運行。",
    licenseNote: "社群衍生模型；請閱讀上游模型卡。使用普通 Q4，不使用 MTP 變體，H3 生成前應先釋放提示詞模型。"
  },
  "qwen/qwen3.8-27b-uncensored-q4": {
    name: "Qwen3.8 27B Q4 · Uncensored · JonathanColetti",
    badge: "Uncensored · Q4 · 4090",
    description: "搭配視覺投影檔、供 ComfyUI MultiModal Prompt Nodes 使用的社群 Q4 GGUF；本應用採用不含 MTP 的保守 24GB RTX 4090 路徑。",
    licenseNote: "社群衍生模型；請閱讀 JonathanColetti 模型卡。使用不含 MTP 的 Q4 與配套 vision 投影檔，H3 生成前應先釋放提示詞模型。"
  },
  "community/gemma-4-e4b-unconcerned-q5": {
    name: "Gemma 4 E4B Q5 · Uncensored",
    badge: "Uncensored · Q5",
    description: "Gemma 4 E4B 的社群低拒答多模態衍生版；保留圖片與影片抽幀理解，適合一般模型拒絕擴寫時手動選用。",
    licenseNote: "社群衍生模型；使用前請閱讀模型卡與 Gemma 使用條款，輸出仍需由使用者自行審核。"
  },
  "community/gemma-4-12b-uncensored-q4": {
    name: "Gemma 4 12B Q4 · Uncensored",
    badge: "Uncensored · Q4",
    description: "更強的社群 Uncensored 多模態設定；適合複雜參考關係、長指令和需要更多畫面細節的 H3 Prompt。",
    licenseNote: "社群衍生模型；須遵守 Gemma 使用條款。模型卡說明 Abliteration 僅修改語言權重，多模態投影維持原版。"
  },
  "community/gemma-4-26b-a4b-uncensored-q4": {
    name: "Gemma 4 26B-A4B Q4 · Uncensored",
    badge: "Uncensored · MoE Q4",
    description: "Uncensored 品質上限設定；MoE 每次只啟用約 4B 參數，載入前仍需釋放其他模型。",
    licenseNote: "社群衍生模型；使用前請閱讀模型卡與 Gemma 使用條款。建議僅在 24GB 顯示卡上使用標準上下文。"
  },
  "google/gemma-4-e4b-q3": {
    name: "Gemma 4 E4B Q3 · 社群相容設定",
    badge: "社群相容 · Q3",
    description: "H3 Prompt Writer 社群驗證的輕量設定；能理解圖片和影片抽幀，但可能遺漏視覺細節。",
    licenseNote: "Gemma 模型須遵守 Google Gemma 使用條款；GGUF 轉換由 Unsloth 提供。"
  },
  "google/gemma-4-12b-q4": {
    name: "Gemma 4 12B Q4 · 社群精簡設定",
    badge: "社群精簡 · Q4",
    description: "社群驗證的精簡多模態設定，適合快速生成 H3 Prompt。",
    licenseNote: "Gemma 模型須遵守 Google Gemma 使用條款；GGUF 轉換由 Unsloth 提供。"
  },
  "google/gemma-4-12b-q5": {
    name: "Gemma 4 12B Q5 · 社群標準設定",
    badge: "社群標準 · Q5",
    description: "社群驗證的通用多模態設定；在視覺細節和上下文長度之間保持平衡。",
    licenseNote: "Gemma 模型須遵守 Google Gemma 使用條款；GGUF 轉換由 Unsloth 提供。"
  },
  "google/gemma-4-26b-a4b-q4": {
    name: "Gemma 4 26B-A4B Q4 · 4090 社群推薦",
    badge: "社群推薦 · MoE Q4",
    description: "H3 Prompt Writer 作者建議的品質／速度平衡設定；執行前需要釋放其他模型。",
    licenseNote: "Gemma 模型須遵守 Google Gemma 使用條款；GGUF 轉換由 Unsloth 提供。"
  },
};

const nativePromptEntries: CatalogModelEntry[] = [
  entry({
    id: "qwen/qwen3.5-4b", family: "qwen-prompt", category: "prompt", adapterId: "native-text-generate", order: 200, inputModes: ["image", "video"],
    scan: { managedBy: "comfyui", vram: "BF16 · 文件约 9.3 GB", integrated: false, components: [component("Qwen3.5 4B ComfyUI 文本编码器", "text_encoders/qwen3.5_4b_bf16.safetensors", /text_encoders\/qwen3\.5_4b_bf16\.safetensors$/i, guide("Hugging Face · Comfy-Org/Qwen3.5", "https://huggingface.co/Comfy-Org/Qwen3.5/resolve/main/text_encoders/qwen3.5_4b_bf16.safetensors?download=true", "text_encoders", "qwen3.5_4b_bf16.safetensors", "4090 推荐的原生提示词助手模型，同时支持文字生成和图片/视频理解。"))] }
  }, { name: "Qwen3.5 4B · H3 提示词助手", badge: "BF16 · 多模态", description: "同时处理文字和参考图/视频，并按 H3 提示词规则生成更适合视频生成的描述。" }, { name: "Qwen3.5 4B · H3 prompt assistant", badge: "BF16 · multimodal", description: "Processes text and reference images/video for H3-oriented prompt writing." }, { name: "Qwen3.5 4B · H3 提示詞助手", badge: "BF16 · 多模態", description: "同時處理文字和參考圖／影片，並依 H3 提示詞規則生成更適合影片生成的描述。" }),
  entry({
    id: "qwen/qwen3.5-2b", family: "qwen-prompt", category: "prompt", adapterId: "native-text-generate", order: 190, inputModes: ["image", "video"],
    scan: { managedBy: "comfyui", vram: "BF16 · 文件约 4.55 GB", integrated: false, components: [component("Qwen3.5 2B ComfyUI 文本编码器", "text_encoders/qwen3.5_2b_bf16.safetensors", /text_encoders\/qwen3\.5_2b_bf16\.safetensors$/i, guide("Hugging Face · Comfy-Org/Qwen3.5", "https://huggingface.co/Comfy-Org/Qwen3.5/resolve/main/text_encoders/qwen3.5_2b_bf16.safetensors?download=true", "text_encoders", "qwen3.5_2b_bf16.safetensors", "更快、更省显存的提示词助手备选。"))] }
  }, { name: "Qwen3.5 2B · 快速提示词助手", badge: "BF16 · 快速", description: "更快的文字和参考图理解备选，适合快速迭代。" }, { name: "Qwen3.5 2B · fast prompt assistant", badge: "BF16 · fast", description: "A faster text and reference-understanding option for quick iteration." }, { name: "Qwen3.5 2B · 快速提示詞助手", badge: "BF16 · 快速", description: "更快的文字和參考圖理解選項，適合快速迭代。" })
];

const managedPromptEntries: CatalogModelEntry[] = managedPromptModelDefinitions.map((model, index) => {
  const english = managedPromptEnglish[model.id]!;
  const traditional = managedPromptTraditional[model.id]!;
  const baseUrl = `https://huggingface.co/${model.source}${model.revision ? `/resolve/${model.revision}` : "/resolve/main"}`;
  const directoryPattern = model.targetDirectory.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const sourceLabel = `${model.source} · ${model.badge}`;
  const notes = `${model.description} 使用大写 models/LLM，并让每个主 GGUF 与其匹配的 mmproj 独占一个子目录。${model.licenseNote}`;
  const makeGuide = (filename: string) => guide(sourceLabel, `${baseUrl}/${filename}?download=true`, model.targetDirectory, filename, notes);
  return entry({
    id: model.id,
    family: model.backend === "comfyui-multimodal" ? "comfyui-multimodal-prompt-writer" : "gemma-prompt-writer",
    category: "prompt",
    adapterId: model.backend ?? "h3-prompt-writer",
    order: 260 - index,
    inputModes: ["image", "video"],
    scan: {
      managedBy: "comfyui",
      vram: model.vram,
      integrated: true,
      ...(model.backend === "comfyui-multimodal"
        ? { requiredCustomNodeIds: ["comfyui-multimodal-prompt-nodes"], runtimeNodeTypes: ["VisionLLMNode"] }
        : {}),
      components: [
      component(`${model.name} GGUF`, `${model.targetDirectory}/${model.modelFilename}`, new RegExp(`${directoryPattern}/${model.modelFilename.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, "i"), makeGuide(model.modelFilename)),
      component(`${model.name} mmproj`, `${model.targetDirectory}/${model.mmprojFilename}`, new RegExp(`${directoryPattern}/${model.mmprojFilename.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, "i"), makeGuide(model.mmprojFilename))
      ]
    }
  }, { name: model.name, badge: model.badge, description: model.description, limitations: [model.licenseNote] }, {
    name: english.name,
    badge: english.badge,
    description: english.description,
    limitations: [english.licenseNote]
  }, {
    name: traditional.name,
    badge: traditional.badge,
    description: traditional.description,
    limitations: [traditional.licenseNote]
  });
});

export const promptModelEntries: CatalogModelEntry[] = [...nativePromptEntries, ...managedPromptEntries];
