import { VIDEO_LORA_DEFINITIONS } from "../loras/definitions.js";
const catalogLocales = {
    "minimax-h3-lightx2v-turbo-4step-768p-v1.1": {
        "zh-CN": { name: "LightX2V Turbo 4-Step v1.1 · 768p", badge: "H3 专属 · 最新 768p", description: "官方最新 v1.1 FL2VA Turbo LoRA，配套 4 步、video shift 6 和 audio shift 3。" },
        "zh-TW": { name: "LightX2V Turbo 4-Step v1.1 · 768p", badge: "H3 專屬 · 最新 768p", description: "官方最新 v1.1 FL2VA Turbo LoRA，搭配 4 步、video shift 6 與 audio shift 3。" },
        "en-US": { name: "LightX2V Turbo 4-Step v1.1 · 768p", badge: "H3 only · latest 768p", description: "The latest official v1.1 FL2VA Turbo LoRA with the four-step, video-shift 6, audio-shift 3 path." }
    },
    "minimax-h3-camera-motion-v1": {
        "zh-CN": { name: "MiniMax H3 Camera Motion v1", badge: "H3 专属 · 运镜", description: "社区运镜 LoRA，增强推近、拉远、环绕、跟拍和航拍等镜头运动。" },
        "zh-TW": { name: "MiniMax H3 Camera Motion v1", badge: "H3 專屬 · 運鏡", description: "社群運鏡 LoRA，增強推近、拉遠、環繞、跟拍與航拍等鏡頭運動。" },
        "en-US": { name: "MiniMax H3 Camera Motion v1", badge: "H3 only · camera motion", description: "A community camera-motion LoRA for stronger push-ins, pull-outs, orbits, tracking shots, and aerial movement." }
    },
    "minimax-h3-turbo-v4-step600-ema-pruned": {
        "zh-CN": { name: "MiniMax H3 Turbo v4 · step600 EMA", badge: "H3 专属 · 质量 Turbo", description: "社区 v4 step600 EMA pruned Turbo，建议 8 步，支持 6–8 步质量路径。" },
        "zh-TW": { name: "MiniMax H3 Turbo v4 · step600 EMA", badge: "H3 專屬 · 品質 Turbo", description: "社群 v4 step600 EMA pruned Turbo，建議 8 步，支援 6–8 步品質路徑。" },
        "en-US": { name: "MiniMax H3 Turbo v4 · step600 EMA", badge: "H3 only · quality Turbo", description: "A community v4 step600 EMA pruned Turbo for a quality-first six-to-eight-step path, preferably eight steps." }
    },
    "minimax-h3-lightx2v-turbo-8step-v1": {
        "zh-CN": { name: "LightX2V Turbo 8-Step v1.0", badge: "H3 专属 · 性能", description: "官方 v1.0 FL2VA Turbo LoRA，默认 8 步，优先稳定和速度平衡。" },
        "zh-TW": { name: "LightX2V Turbo 8-Step v1.0", badge: "H3 專屬 · 效能", description: "官方 v1.0 FL2VA Turbo LoRA，預設 8 步，優先穩定與速度平衡。" },
        "en-US": { name: "LightX2V Turbo 8-Step v1.0", badge: "H3 only · performance", description: "Official v1.0 FL2VA Turbo LoRA with an eight-step default for a stable speed/quality balance." }
    },
    "minimax-h3-lightx2v-turbo-4step-768p-v1": {
        "zh-CN": { name: "LightX2V Turbo 4-Step v1.0 · 768p", badge: "H3 专属 · 768p 性能", description: "官方 v1.0 768p FL2VA Turbo LoRA，专为 768p 四步路径准备。" },
        "zh-TW": { name: "LightX2V Turbo 4-Step v1.0 · 768p", badge: "H3 專屬 · 768p 效能", description: "官方 v1.0 768p FL2VA Turbo LoRA，專為 768p 四步路徑準備。" },
        "en-US": { name: "LightX2V Turbo 4-Step v1.0 · 768p", badge: "H3 only · 768p performance", description: "Official v1.0 FL2VA Turbo LoRA for the dedicated 768p four-step path." }
    },
    "minimax-h3-ref2v-turbo-4step-v01": {
        "zh-CN": { name: "LightX2V Ref2V Turbo 4-Step v0.1", badge: "H3 R2V 专属 · 性能", description: "官方 Ref2VA 多参考图 Turbo LoRA，仅用于 R2V 四步路径。" },
        "zh-TW": { name: "LightX2V Ref2V Turbo 4-Step v0.1", badge: "H3 R2V 專屬 · 效能", description: "官方 Ref2VA 多參考圖 Turbo LoRA，僅用於 R2V 四步路徑。" },
        "en-US": { name: "LightX2V Ref2V Turbo 4-Step v0.1", badge: "H3 R2V only · performance", description: "Official Ref2VA multi-reference Turbo LoRA for the dedicated four-step R2V path." }
    },
    "minimax-h3-after-midnight-ref2va-nsfw": {
        "zh-CN": { name: "AfterMidnight NSFW · Ref2VA v1.2", badge: "H3 R2V 专属 · NSFW", description: "当前确认的 AfterMidnight v1.2 内容 LoRA，仅适用于 MiniMax H3 Ref2VA。" },
        "zh-TW": { name: "AfterMidnight NSFW · Ref2VA v1.2", badge: "H3 R2V 專屬 · NSFW", description: "目前確認的 AfterMidnight v1.2 內容 LoRA，僅適用於 MiniMax H3 Ref2VA。" },
        "en-US": { name: "AfterMidnight NSFW · Ref2VA v1.2", badge: "H3 R2V only · NSFW", description: "The currently confirmed AfterMidnight v1.2 content LoRA for MiniMax H3 Ref2VA only." }
    },
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
export const loraModelEntries = VIDEO_LORA_DEFINITIONS.map((lora) => ({
    definition: {
        id: lora.id,
        family: lora.modelFamily,
        variant: lora.variant,
        category: "lora",
        adapterId: "video-lora",
        order: lora.catalogOrder,
        retired: lora.retired,
        inputModes: lora.compatibleInputModes,
        scan: lora.scan
    },
    locales: catalogLocales[lora.id] ?? {
        "zh-CN": { name: lora.name },
        "zh-TW": { name: lora.name },
        "en-US": { name: lora.name }
    }
}));
