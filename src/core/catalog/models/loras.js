import { VIDEO_LORA_DEFINITIONS } from "../loras/definitions.js";
const catalogLocales = {
    "h3-pdd-fl2va-8step": {
        "zh-CN": { name: "MiniMax H3 PDD FL2VA · 8 步", badge: "H3 专属 · PDD 加速", description: "ComfyUI 0.35 原生 PDD output head bank 路线；普通 LoRA loader、8 步 Euler + Simple，配套 pruned INT8 FL2VA 基座。" },
        "zh-TW": { name: "MiniMax H3 PDD FL2VA · 8 步", badge: "H3 專屬 · PDD 加速", description: "ComfyUI 0.35 原生 PDD output head bank 路線；普通 LoRA loader、8 步 Euler + Simple，搭配 pruned INT8 FL2VA 基座。" },
        "en-US": { name: "MiniMax H3 PDD FL2VA · eight-step", badge: "H3 only · PDD acceleration", description: "Native ComfyUI 0.35 PDD output-head-bank path using the stock LoRA loader, eight-step Euler + Simple, and the pruned INT8 FL2VA base." }
    },
    "h3-pdd-ref2va-8step": {
        "zh-CN": { name: "MiniMax H3 PDD Ref2VA · 8 步", badge: "H3 R2V 专属 · PDD 加速", description: "ComfyUI 0.35 原生 PDD output head bank R2V 路线；普通 LoRA loader、8 步 Euler + Simple，配套 pruned INT8 Ref2VA 基座。" },
        "zh-TW": { name: "MiniMax H3 PDD Ref2VA · 8 步", badge: "H3 R2V 專屬 · PDD 加速", description: "ComfyUI 0.35 原生 PDD output head bank R2V 路線；普通 LoRA loader、8 步 Euler + Simple，搭配 pruned INT8 Ref2VA 基座。" },
        "en-US": { name: "MiniMax H3 PDD Ref2VA · eight-step", badge: "H3 R2V only · PDD acceleration", description: "Native ComfyUI 0.35 PDD output-head-bank R2V path using the stock LoRA loader, eight-step Euler + Simple, and the pruned INT8 Ref2VA base." }
    },
    "minimax-h3-turbo-sla-4step": {
        "zh-CN": { name: "MiniMax H3 Turbo-SLA · 4 步", badge: "H3 专属 · 极速", description: "官方 768p 四步稀疏注意力 Turbo LoRA，需要 H3 SLA Attention 节点；追求最快速度时优先考虑。" },
        "zh-TW": { name: "MiniMax H3 Turbo-SLA · 4 步", badge: "H3 專屬 · 極速", description: "官方 768p 四步稀疏注意力 Turbo LoRA，需要 H3 SLA Attention 節點；追求最快速度時優先考慮。" },
        "en-US": { name: "MiniMax H3 Turbo-SLA · four-step", badge: "H3 only · fastest", description: "Official 768p four-step sparse-attention Turbo LoRA requiring the H3 SLA Attention node; prioritize it for the fastest path." }
    },
    "minimax-h3-lightx2v-turbo-4step-768p-v1.2": {
        "zh-CN": { name: "LightX2V Turbo 4-Step v1.2 · 768p", badge: "H3 专属 · 4 步快速", description: "官方当前 v1.2 FL2VA Turbo LoRA，配套 4 步、video shift 6 和 audio shift 3；无需 SLA 节点。" },
        "zh-TW": { name: "LightX2V Turbo 4-Step v1.2 · 768p", badge: "H3 專屬 · 4 步快速", description: "官方目前 v1.2 FL2VA Turbo LoRA，搭配 4 步、video shift 6 與 audio shift 3；不需要 SLA 節點。" },
        "en-US": { name: "LightX2V Turbo 4-Step v1.2 · 768p", badge: "H3 only · fast four-step", description: "The current official v1.2 FL2VA Turbo LoRA with the four-step, video-shift 6, audio-shift 3 path; no SLA node required." }
    },
    "minimax-h3-camera-motion-v1": {
        "zh-CN": { name: "MiniMax H3 Camera Motion v1", badge: "H3 专属 · 运镜", description: "社区运镜 LoRA，增强推近、拉远、环绕、跟拍和航拍等镜头运动；可配合提示词表达光学景深、镜头衰减和克制的手持微抖。" },
        "zh-TW": { name: "MiniMax H3 Camera Motion v1", badge: "H3 專屬 · 運鏡", description: "社群運鏡 LoRA，增強推近、拉遠、環繞、跟拍與航拍等鏡頭運動；可配合提示詞表達光學景深、鏡頭衰減與克制的手持微抖。" },
        "en-US": { name: "MiniMax H3 Camera Motion v1", badge: "H3 only · camera motion", description: "A community camera-motion LoRA for stronger push-ins, pull-outs, orbits, tracking shots, and aerial movement, with prompt guidance for optical depth of field, lens falloff, and restrained handheld micro-shake." }
    },
    "minimax-h3-cinematic-realism": {
        "zh-CN": { name: "MiniMax H3 Cinematic Realism", badge: "H3 专属 · 电影质感", description: "降低 H3 默认对比度，提供更柔和、便于调色的电影基调；触发词：DY。" },
        "zh-TW": { name: "MiniMax H3 Cinematic Realism", badge: "H3 專屬 · 電影質感", description: "降低 H3 預設對比度，提供更柔和、便於調色的電影基調；觸發詞：DY。" },
        "en-US": { name: "MiniMax H3 Cinematic Realism", badge: "H3 only · cinematic grade", description: "Softens H3's default contrast for a gentler, easier-to-grade cinematic look; trigger: DY." }
    },
    "minimax-h3-better-human-motion": {
        "zh-CN": { name: "MiniMax H3 Better Human Motion", badge: "H3 专属 · 人体动作", description: "增强更自然、更连贯的人体动作和身体运动；不需要额外触发词。" },
        "zh-TW": { name: "MiniMax H3 Better Human Motion", badge: "H3 專屬 · 人體動作", description: "增強更自然、更連貫的人體動作和身體運動；不需要額外觸發詞。" },
        "en-US": { name: "MiniMax H3 Better Human Motion", badge: "H3 only · human motion", description: "Improves natural, consistent body movement and action timing without an additional trigger word." }
    },
    "minimax-h3-equi360": {
        "zh-CN": { name: "MiniMax H3 Equirectangular 360°", badge: "H3 专属 · 360° 全景", description: "生成 360° 等距柱状全景视频；触发词：equirect360。推荐 21:9、768p T2VA，输出需再封装为 2:1 球面视频。" },
        "zh-TW": { name: "MiniMax H3 Equirectangular 360°", badge: "H3 專屬 · 360° 全景", description: "生成 360° 等距柱狀全景影片；觸發詞：equirect360。建議 21:9、768p T2VA，輸出需再封裝為 2:1 球面影片。" },
        "en-US": { name: "MiniMax H3 Equirectangular 360°", badge: "H3 only · 360° panorama", description: "Generates 360° equirectangular video; trigger: equirect360. Use the 21:9 768p T2VA path, then package the output as 2:1 spherical video." }
    },
    "minimax-h3-vr180-sbs": {
        "zh-CN": { name: "MiniMax H3 VR180 SBS 立体", badge: "H3 专属 · VR180 立体", description: "生成左右眼并排的 VR180 立体视频；触发词：vr180sbs。推荐 21:9、768p、强度 1.0，输出需拉伸为 2:1 并写入立体球面元数据。" },
        "zh-TW": { name: "MiniMax H3 VR180 SBS 立體", badge: "H3 專屬 · VR180 立體", description: "生成左右眼並排的 VR180 立體影片；觸發詞：vr180sbs。建議 21:9、768p、強度 1.0，輸出需拉伸為 2:1 並寫入立體球面中繼資料。" },
        "en-US": { name: "MiniMax H3 VR180 SBS stereo", badge: "H3 only · VR180 stereo", description: "Generates side-by-side left/right-eye VR180 stereo video; trigger: vr180sbs. Use 21:9, 768p, and strength 1.0, then stretch to 2:1 and add spherical stereo metadata." }
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
    "minimax-h3-realism-people": {
        "zh-CN": { name: "MiniMax H3 Realism People", badge: "H3 专属 · 皮肤/人物写实", description: "增强自然皮肤纹理、毛孔、透光感和人物表演，缓解油光与塑料感；同时改善手部活动、电影灯光和轻微纪录片式镜头感。" },
        "zh-TW": { name: "MiniMax H3 Realism People", badge: "H3 專屬 · 皮膚/人物寫實", description: "增強自然皮膚紋理、毛孔、透光感與人物表演，減少油光與塑料感；同時改善手部活動、電影燈光和輕微紀錄片式鏡頭感。" },
        "en-US": { name: "MiniMax H3 Realism People", badge: "H3 only · skin/people realism", description: "Improves natural skin texture, pores, translucency, and human performance while reducing oily or plastic-looking skin; it also helps hands, film lighting, and subtle documentary camera motion." }
    },
    "minimax-h3-facial-realism-closeup": {
        "zh-CN": { name: "MiniMax H3 Facial Realism CloseUp", badge: "H3 专属 · 人脸特写", description: "增强人脸特写的皮肤纹理、眼神与微表情；触发词：Facial Realism。" },
        "zh-TW": { name: "MiniMax H3 Facial Realism CloseUp", badge: "H3 專屬 · 人臉特寫", description: "增強人臉特寫的皮膚紋理、眼神與微表情；觸發詞：Facial Realism。" },
        "en-US": { name: "MiniMax H3 Facial Realism CloseUp", badge: "H3 only · facial close-up", description: "Enhances close-up facial realism, skin texture, eyes, and micro-expressions; trigger: Facial Realism." }
    },
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
