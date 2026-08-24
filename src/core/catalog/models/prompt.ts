import { managedPromptModelDefinitions } from "../../prompt-models.js";
import { entry, component, guide } from "./catalog-helpers.js";
import type { CatalogModelEntry } from "../types.js";

const managedPromptEnglish: Record<string, { name: string; badge: string; description: string; licenseNote: string }> = {
  "lightx2v/minimax-h3-prompt-rewriter-8b": {
    name: "MiniMax H3 Prompt Rewriter LoRA · Qwen3-VL 8B",
    badge: "Qwen3-VL 8B · PEFT LoRA · ComfyUI",
    description: "The official LightX2V adapter targets Qwen3-VL-8B-Instruct and can consume image/video references for H3 prompt rewriting through the ComfyUI Qwen-VL LoRA nodes.",
    licenseNote: "The base model and adapter have separate licenses. Keep this adapter bound to Qwen3-VL-8B-Instruct; do not apply it to Qwen3.6/Qwen3.8 GGUF models."
  },
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
  "google/gemma-4-12b-q5": {
    name: "Gemma 4 12B Q5 · Community standard",
    badge: "Community standard · Q5",
    description: "A general-purpose community-validated multimodal profile balancing visual detail and context length.",
    licenseNote: "Gemma models are subject to the Google Gemma terms; the GGUF conversion is provided by Unsloth."
  },
};

const managedPromptTraditional: Record<string, { name: string; badge: string; description: string; licenseNote: string }> = {
  "lightx2v/minimax-h3-prompt-rewriter-8b": {
    name: "MiniMax H3 Prompt Rewriter LoRA · Qwen3-VL 8B",
    badge: "Qwen3-VL 8B · PEFT LoRA · ComfyUI",
    description: "官方 LightX2V 适配器绑定 Qwen3-VL-8B-Instruct，可读取图片／视频参考并通过 ComfyUI Qwen-VL LoRA 节点重写 H3 提示词。",
    licenseNote: "基座与适配器分别受各自许可约束；请保持它们绑定到 Qwen3-VL-8B-Instruct，不要套用到 Qwen3.6／Qwen3.8 GGUF。"
  },
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
  "google/gemma-4-12b-q5": {
    name: "Gemma 4 12B Q5 · 社群標準設定",
    badge: "社群標準 · Q5",
    description: "社群驗證的通用多模態設定；在視覺細節和上下文長度之間保持平衡。",
    licenseNote: "Gemma 模型須遵守 Google Gemma 使用條款；GGUF 轉換由 Unsloth 提供。"
  },
};

const nativePromptEntries: CatalogModelEntry[] = [
  entry({
    id: "qwen/qwen3.5-4b", family: "qwen-prompt", category: "prompt", adapterId: "native-text-generate", order: 200, inputModes: ["image", "video"],
    scan: { managedBy: "comfyui", vram: "BF16 · 文件约 9.3 GB", integrated: true, runtimeNodeTypes: ["CLIPLoader", "TextGenerate"], components: [component("Qwen3.5 4B ComfyUI 文本编码器", "text_encoders/qwen3.5_4b_bf16.safetensors", /text_encoders\/qwen3\.5_4b_bf16\.safetensors$/i, guide("Hugging Face · Comfy-Org/Qwen3.5", "https://huggingface.co/Comfy-Org/Qwen3.5/resolve/main/text_encoders/qwen3.5_4b_bf16.safetensors?download=true", "text_encoders", "qwen3.5_4b_bf16.safetensors", "4090 推荐的原生提示词助手模型，同时支持文字生成和图片/视频理解。"))] }
  }, { name: "Qwen3.5 4B · H3 提示词助手", badge: "BF16 · 多模态", description: "同时处理文字和参考图/视频，并按 H3 提示词规则生成更适合视频生成的描述。" }, { name: "Qwen3.5 4B · H3 prompt assistant", badge: "BF16 · multimodal", description: "Processes text and reference images/video for H3-oriented prompt writing." }, { name: "Qwen3.5 4B · H3 提示詞助手", badge: "BF16 · 多模態", description: "同時處理文字和參考圖／影片，並依 H3 提示詞規則生成更適合影片生成的描述。" }),
  entry({
    id: "qwen/qwen3.5-2b", family: "qwen-prompt", category: "prompt", adapterId: "native-text-generate", order: 190, inputModes: ["image", "video"],
    scan: { managedBy: "comfyui", vram: "BF16 · 文件约 4.55 GB", integrated: true, runtimeNodeTypes: ["CLIPLoader", "TextGenerate"], components: [component("Qwen3.5 2B ComfyUI 文本编码器", "text_encoders/qwen3.5_2b_bf16.safetensors", /text_encoders\/qwen3\.5_2b_bf16\.safetensors$/i, guide("Hugging Face · Comfy-Org/Qwen3.5", "https://huggingface.co/Comfy-Org/Qwen3.5/resolve/main/text_encoders/qwen3.5_2b_bf16.safetensors?download=true", "text_encoders", "qwen3.5_2b_bf16.safetensors", "更快、更省显存的提示词助手备选。"))] }
  }, { name: "Qwen3.5 2B · 快速提示词助手", badge: "BF16 · 快速", description: "更快的文字和参考图理解备选，适合快速迭代。" }, { name: "Qwen3.5 2B · fast prompt assistant", badge: "BF16 · fast", description: "A faster text and reference-understanding option for quick iteration." }, { name: "Qwen3.5 2B · 快速提示詞助手", badge: "BF16 · 快速", description: "更快的文字和參考圖理解選項，適合快速迭代。" })
];

const managedPromptEntries: CatalogModelEntry[] = managedPromptModelDefinitions.map((model, index) => {
  const english = managedPromptEnglish[model.id]!;
  const traditional = managedPromptTraditional[model.id]!;
  if (model.backend === "comfyui-qwenvl-lora") {
    const baseSource = model.baseModelSource ?? model.source;
    const baseDirectory = model.baseModelDirectory ?? model.targetDirectory;
    const adapterSource = model.adapterSource ?? "lightx2v/MiniMax-H3-Prompt-Rewriter-LoRA-8B";
    const adapterDirectory = model.adapterDirectory ?? "LLM/Qwen-VL-LoRA/minimax-h3-prompt-rewriter-8b";
    const baseUrl = `https://huggingface.co/${baseSource}/resolve/${model.revision ?? "main"}`;
    const adapterUrl = `https://huggingface.co/${adapterSource}/resolve/main`;
    const basePattern = baseDirectory.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const adapterPattern = adapterDirectory.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const baseNotes = "这是 Qwen3-VL-8B-Instruct 基座权重；请把 4 个 safetensors 分片放在所选 ComfyUI 的 models/LLM/Qwen-VL/qwen3-vl-8b-instruct。JSON 配置、权重索引、tokenizer 与图像/视频预处理文件由 Local Video Studio 在首次运行前自动准备，不需要手动下载。";
    const adapterNotes = "这是绑定 Qwen3-VL-8B-Instruct 的 MiniMax H3 Prompt Rewriter PEFT LoRA 权重；请放在 models/LLM/Qwen-VL-LoRA/minimax-h3-prompt-rewriter-8b。LoRA 配置由 Local Video Studio 自动准备。";
    // JSON metadata is managed by electron/services/qwenvl-model-assets.ts;
    // keep the catalog surface limited to the large weight files.
    const baseFiles: readonly (readonly [string, string])[] = [];
    return entry({
      id: model.id,
      family: "qwen-vl-peft-prompt-rewriter",
      category: "prompt",
      adapterId: "comfyui-qwenvl-lora",
      order: 310 - index,
      inputModes: ["image", "video"],
      scan: {
        managedBy: "comfyui",
        vram: model.vram,
        integrated: true,
        requiredCustomNodeIds: ["comfyui-qwenvl-lora"],
        runtimeNodeTypes: ["QwenVLModelLoader", "QwenVLLoRALoader", "QwenVLCaption"],
        components: [
          ...baseFiles.map(([filename, label]) => component(
            label,
            `${baseDirectory}/${filename}`,
            new RegExp(`${basePattern}/${filename.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, "i"),
            guide("Qwen · Qwen3-VL-8B-Instruct", `${baseUrl}/${filename}?download=true`, baseDirectory, filename, baseNotes)
          )),
          ...[1, 2, 3, 4].map((shard) => {
            const filename = `model-${String(shard).padStart(5, "0")}-of-00004.safetensors`;
            return component(`Qwen3-VL 8B 权重分片 ${shard}/4`, `${baseDirectory}/${filename}`, new RegExp(`${basePattern}/${filename.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, "i"), guide("Qwen · Qwen3-VL-8B-Instruct", `${baseUrl}/${filename}?download=true`, baseDirectory, filename, baseNotes));
          }),
          component("H3 Prompt Rewriter LoRA 配置", `${adapterDirectory}/adapter_config.json`, new RegExp(`${adapterPattern}/adapter_config\\.json$`, "i"), guide("LightX2V · MiniMax-H3-Prompt-Rewriter-LoRA-8B", `${adapterUrl}/adapter_config.json?download=true`, adapterDirectory, "adapter_config.json", adapterNotes)),
          component("H3 Prompt Rewriter LoRA 权重", `${adapterDirectory}/adapter_model.safetensors`, new RegExp(`${adapterPattern}/adapter_model\\.safetensors$`, "i"), guide("LightX2V · MiniMax-H3-Prompt-Rewriter-LoRA-8B", `${adapterUrl}/adapter_model.safetensors?download=true`, adapterDirectory, "adapter_model.safetensors", adapterNotes))
        ].filter((item) => item.expected.toLowerCase().endsWith(".safetensors"))
      }
    }, {
      name: model.name,
      badge: model.badge,
      description: model.description,
      limitations: [model.licenseNote]
    }, {
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
  }
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
        : { requiredCustomNodeIds: ["minimax-h3-prompt-writer"] }),
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
