import type { CatalogModelEntry } from "../types.js";
import { VIDEO_LORA_DEFINITIONS } from "../loras/definitions.js";

const catalogLocales: Record<string, CatalogModelEntry["locales"]> = {
  "minimax-h3-lightx2v-turbo-4step": {
    "zh-CN": { name: "LightX2V Turbo 4-Step", badge: "H3 专属 · 性能", description: "MiniMax H3 FL2VA 的蒸馏 LoRA，把约 20 步采样压缩到 6–8 步。" },
    "zh-TW": { name: "LightX2V Turbo 4-Step", badge: "H3 專屬 · 效能", description: "MiniMax H3 FL2VA 的蒸餾 LoRA，把約 20 步取樣壓縮到 6–8 步。" },
    "en-US": { name: "LightX2V Turbo 4-Step", badge: "H3 only · performance", description: "A distilled LoRA that compresses MiniMax H3 FL2VA sampling from about 20 steps to 6–8 steps." }
  },
  "minimax-h3-realism-people": {
    "zh-CN": { name: "MiniMax H3 Realism People", badge: "H3 专属 · 人物写实", description: "增强人物皮肤、表情、手部活动、电影灯光和轻微纪录片式镜头感。" },
    "zh-TW": { name: "MiniMax H3 Realism People", badge: "H3 專屬 · 人物寫實", description: "增強人物皮膚、表情、手部活動、電影燈光和輕微紀錄片式鏡頭感。" },
    "en-US": { name: "MiniMax H3 Realism People", badge: "H3 only · people realism", description: "Improves skin texture, expressions, hands at work, film lighting, and subtle documentary camera motion." }
  },
  "minimax-h3-pink-fluffy-bunny-nsfw": {
    "zh-CN": { name: "PinkFluffyBunny NSFW", badge: "H3 专属 · NSFW", description: "MiniMax H3 FL2VA pruned 底模的社区 NSFW 内容 LoRA。" },
    "zh-TW": { name: "PinkFluffyBunny NSFW", badge: "H3 專屬 · NSFW", description: "MiniMax H3 FL2VA pruned 底模的社群 NSFW 內容 LoRA。" },
    "en-US": { name: "PinkFluffyBunny NSFW", badge: "H3 only · NSFW", description: "A community NSFW content LoRA for the MiniMax H3 FL2VA pruned base model." }
  }
};

export const loraModelEntries: CatalogModelEntry[] = VIDEO_LORA_DEFINITIONS.map((lora) => ({
  definition: {
    id: lora.id,
    family: lora.modelFamily,
    variant: lora.variant,
    category: "lora",
    adapterId: "video-lora",
    order: lora.catalogOrder,
    inputModes: lora.compatibleInputModes,
    scan: lora.scan
  },
  locales: catalogLocales[lora.id] ?? {
    "zh-CN": { name: lora.name },
    "zh-TW": { name: lora.name },
    "en-US": { name: lora.name }
  }
}));
