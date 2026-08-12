import { managedPromptModelDefinitions } from "../../prompt-models.js";
import { entry, component, guide } from "./catalog-helpers.js";
import type { CatalogModelEntry } from "../types.js";

const managedPromptEnglish: Record<string, { name: string; badge: string; description: string }> = {
  "community/gemma-4-e4b-unconcerned-q5": {
    name: "Gemma 4 E4B Q5 · Uncensored",
    badge: "Uncensored · Q5",
    description: "A community low-refusal multimodal derivative that retains image and video-frame understanding for cases where ordinary models refuse expansion."
  },
  "community/gemma-4-12b-uncensored-q4": {
    name: "Gemma 4 12B Q4 · Uncensored",
    badge: "Uncensored · Q4",
    description: "A stronger uncensored multimodal profile for complex reference relationships, long instructions, and H3 prompts that need more visual detail."
  },
  "community/gemma-4-26b-a4b-uncensored-q4": {
    name: "Gemma 4 26B-A4B Q4 · Uncensored",
    badge: "Uncensored · MoE Q4",
    description: "The high-quality uncensored profile; only about 4B MoE parameters activate per step, but other models should still be released before loading."
  },
  "google/gemma-4-e4b-q3": {
    name: "Gemma 4 E4B Q3 · Community compatible",
    badge: "Community compatible · Q3",
    description: "A lightweight community-validated profile that understands images and video frames but may omit visual details."
  },
  "google/gemma-4-12b-q4": {
    name: "Gemma 4 12B Q4 · Community compact",
    badge: "Community compact · Q4",
    description: "A compact community-validated multimodal profile for fast H3 prompt generation."
  },
  "google/gemma-4-12b-q5": {
    name: "Gemma 4 12B Q5 · Community standard",
    badge: "Community standard · Q5",
    description: "A general-purpose community-validated multimodal profile balancing visual detail and context length."
  },
  "google/gemma-4-26b-a4b-q4": {
    name: "Gemma 4 26B-A4B Q4 · Community pick for 4090",
    badge: "Community pick · MoE Q4",
    description: "The H3 Prompt Writer author's quality/speed balance; release other models before running it."
  },
  "google/gemma-4-31b-q4": {
    name: "Gemma 4 31B Q4 · High-VRAM experimental",
    badge: "Experimental · Q4",
    description: "A stronger visual-detail profile that is slower and not guaranteed to produce better H3 prompts than 26B-A4B."
  }
};

const nativePromptEntries: CatalogModelEntry[] = [
  entry({
    id: "qwen/qwen3.5-4b", family: "qwen-prompt", category: "prompt", adapterId: "native-text-generate", order: 200, inputModes: ["image", "video"],
    scan: { managedBy: "comfyui", vram: "BF16 · 文件约 9.3 GB", integrated: false, components: [component("Qwen3.5 4B ComfyUI 文本编码器", "text_encoders/qwen3.5_4b_bf16.safetensors", /text_encoders\/qwen3\.5_4b_bf16\.safetensors$/i, guide("Hugging Face · Comfy-Org/Qwen3.5", "https://huggingface.co/Comfy-Org/Qwen3.5/resolve/main/text_encoders/qwen3.5_4b_bf16.safetensors?download=true", "text_encoders", "qwen3.5_4b_bf16.safetensors", "4090 推荐的原生提示词助手模型，同时支持文字生成和图片/视频理解。"))] }
  }, { name: "Qwen3.5 4B · H3 提示词助手", badge: "BF16 · 多模态", description: "同时处理文字和参考图/视频，并按 H3 提示词规则生成更适合视频生成的描述。" }, { name: "Qwen3.5 4B · H3 prompt assistant", badge: "BF16 · multimodal", description: "Processes text and reference images/video for H3-oriented prompt writing." }),
  entry({
    id: "qwen/qwen3.5-2b", family: "qwen-prompt", category: "prompt", adapterId: "native-text-generate", order: 190, inputModes: ["image", "video"],
    scan: { managedBy: "comfyui", vram: "BF16 · 文件约 4.55 GB", integrated: false, components: [component("Qwen3.5 2B ComfyUI 文本编码器", "text_encoders/qwen3.5_2b_bf16.safetensors", /text_encoders\/qwen3\.5_2b_bf16\.safetensors$/i, guide("Hugging Face · Comfy-Org/Qwen3.5", "https://huggingface.co/Comfy-Org/Qwen3.5/resolve/main/text_encoders/qwen3.5_2b_bf16.safetensors?download=true", "text_encoders", "qwen3.5_2b_bf16.safetensors", "更快、更省显存的提示词助手备选。"))] }
  }, { name: "Qwen3.5 2B · 快速提示词助手", badge: "BF16 · 快速", description: "更快的文字和参考图理解备选，适合快速迭代。" }, { name: "Qwen3.5 2B · fast prompt assistant", badge: "BF16 · fast", description: "A faster text and reference-understanding option for quick iteration." })
];

const managedPromptEntries: CatalogModelEntry[] = managedPromptModelDefinitions.map((model, index) => {
  const english = managedPromptEnglish[model.id]!;
  const baseUrl = `https://huggingface.co/${model.source}${model.revision ? `/resolve/${model.revision}` : "/resolve/main"}`;
  const directoryPattern = model.targetDirectory.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const sourceLabel = `${model.source} · ${model.badge}`;
  const notes = `${model.description} 使用大写 models/LLM，并让每个主 GGUF 与其匹配的 mmproj 独占一个子目录。${model.licenseNote}`;
  const makeGuide = (filename: string) => guide(sourceLabel, `${baseUrl}/${filename}?download=true`, model.targetDirectory, filename, notes);
  return entry({
    id: model.id, family: "gemma-prompt-writer", category: "prompt", adapterId: "h3-prompt-writer", order: 250 - index, inputModes: ["image", "video"],
    scan: { managedBy: "comfyui", vram: model.vram, integrated: true, components: [
      component(`${model.name} GGUF`, `${model.targetDirectory}/${model.modelFilename}`, new RegExp(`${directoryPattern}/${model.modelFilename.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, "i"), makeGuide(model.modelFilename)),
      component(`${model.name} mmproj`, `${model.targetDirectory}/${model.mmprojFilename}`, new RegExp(`${directoryPattern}/${model.mmprojFilename.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, "i"), makeGuide(model.mmprojFilename))
    ] }
  }, { name: model.name, badge: model.badge, description: model.description, limitations: [model.licenseNote] }, {
    name: english.name,
    badge: english.badge,
    description: english.description,
    limitations: [model.licenseNote]
  });
});

export const promptModelEntries: CatalogModelEntry[] = [...nativePromptEntries, ...managedPromptEntries];
