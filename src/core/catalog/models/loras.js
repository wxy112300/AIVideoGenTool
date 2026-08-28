import { VIDEO_LORA_DEFINITIONS } from "../loras/definitions.js";
const catalogLocales = {
    "minimax-h3-turbo-ckpt850-ema": {
        "zh-CN": { name: "MiniMax H3 Turbo ckpt850 EMA · 已退役", badge: "H3 · 已退役", description: "旧 Turbo 训练线画面质量不稳定；仅保留旧记录兼容，不再用于新任务。" },
        "zh-TW": { name: "MiniMax H3 Turbo ckpt850 EMA · 已退役", badge: "H3 · 已退役", description: "舊 Turbo 訓練線畫面品質不穩定；僅保留舊記錄相容，不再用於新任務。" },
        "en-US": { name: "MiniMax H3 Turbo ckpt850 EMA · retired", badge: "H3 · retired", description: "This older Turbo training line is visually unstable; it remains only for legacy record compatibility and is no longer available for new tasks." }
    },
    "minimax-h3-turbo-sla-4step": {
        "zh-CN": { name: "MiniMax H3 Turbo-SLA · 4 步", badge: "H3 专属 · 极速", description: "官方 768p 四步稀疏注意力 Turbo LoRA，需要 H3 SLA Attention 节点；追求最快速度时优先考虑。" },
        "zh-TW": { name: "MiniMax H3 Turbo-SLA · 4 步", badge: "H3 專屬 · 極速", description: "官方 768p 四步稀疏注意力 Turbo LoRA，需要 H3 SLA Attention 節點；追求最快速度時優先考慮。" },
        "en-US": { name: "MiniMax H3 Turbo-SLA · four-step", badge: "H3 only · fastest", description: "Official 768p four-step sparse-attention Turbo LoRA requiring the H3 SLA Attention node; prioritize it for the fastest path." }
    },
    "minimax-h3-lightx2v-turbo-4step-768p-v1.1": {
        "zh-CN": { name: "LightX2V Turbo 4-Step v1.1 · 768p", badge: "H3 专属 · 4 步快速", description: "官方最新 v1.1 FL2VA Turbo LoRA，配套 4 步、video shift 6 和 audio shift 3；无需 SLA 节点。" },
        "zh-TW": { name: "LightX2V Turbo 4-Step v1.1 · 768p", badge: "H3 專屬 · 4 步快速", description: "官方最新 v1.1 FL2VA Turbo LoRA，搭配 4 步、video shift 6 與 audio shift 3；不需要 SLA 節點。" },
        "en-US": { name: "LightX2V Turbo 4-Step v1.1 · 768p", badge: "H3 only · fast four-step", description: "The latest official v1.1 FL2VA Turbo LoRA with the four-step, video-shift 6, audio-shift 3 path; no SLA node required." }
    },
    "minimax-h3-camera-motion-v1": {
        "zh-CN": { name: "MiniMax H3 Camera Motion v1", badge: "H3 专属 · 运镜", description: "社区运镜 LoRA，增强推近、拉远、环绕、跟拍和航拍等镜头运动。" },
        "zh-TW": { name: "MiniMax H3 Camera Motion v1", badge: "H3 專屬 · 運鏡", description: "社群運鏡 LoRA，增強推近、拉遠、環繞、跟拍與航拍等鏡頭運動。" },
        "en-US": { name: "MiniMax H3 Camera Motion v1", badge: "H3 only · camera motion", description: "A community camera-motion LoRA for stronger push-ins, pull-outs, orbits, tracking shots, and aerial movement." }
    },
    "minimax-h3-turbo-v4-step600-ema-pruned": {
        "zh-CN": { name: "MiniMax H3 Turbo v4 · step600 EMA", badge: "H3 专属 · 综合首选", description: "社区 v4 step600 EMA pruned Turbo，建议 8 步，当前作为综合质量、稳定性和速度的首选。" },
        "zh-TW": { name: "MiniMax H3 Turbo v4 · step600 EMA", badge: "H3 專屬 · 綜合首選", description: "社群 v4 step600 EMA pruned Turbo，建議 8 步，目前作為綜合品質、穩定性與速度的首選。" },
        "en-US": { name: "MiniMax H3 Turbo v4 · step600 EMA", badge: "H3 only · overall pick", description: "A community v4 step600 EMA pruned Turbo and the current overall pick for quality, stability, and speed." }
    },
    "minimax-h3-lightx2v-turbo-8step-v1": {
        "zh-CN": { name: "LightX2V Turbo 8-Step v1.0", badge: "H3 专属 · 8 步质量备选", description: "官方 v1.0 FL2VA 8 步路线；目前没有对应的 8-step v1.1，保留作质量与音频稳定性备选，综合首选请用 v4。" },
        "zh-TW": { name: "LightX2V Turbo 8-Step v1.0", badge: "H3 專屬 · 8 步品質備選", description: "官方 v1.0 FL2VA 8 步路線；目前沒有對應的 8-step v1.1，保留作品質與音訊穩定性備選，綜合首選請用 v4。" },
        "en-US": { name: "LightX2V Turbo 8-Step v1.0", badge: "H3 only · eight-step fallback", description: "The official v1.0 FL2VA eight-step path; no matching eight-step v1.1 is currently published, so it remains a quality and audio-stability fallback." }
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
