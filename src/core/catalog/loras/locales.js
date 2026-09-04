import { zhTWLoraLocales } from "./locale.zh-TW.js";
const zhCN = {
    "minimax-h3-turbo-ckpt850-ema": {
        guide: {
            summary: "MiniMax H3 Turbo ckpt850 EMA 旧 Turbo 训练线已退役，仅为旧队列与历史记录保留兼容。",
            recommendedStrength: "不再推荐新任务使用；请改用当前受支持的 Turbo LoRA。",
            effects: "旧版 4 步路径可能出现过锐、塑料感、颗粒和运动稳定性问题，因此停止作为新任务选项。",
            stacking: "仅供旧记录读取；不要重新组合或作为新的 Turbo 对照。",
            compatibility: "仅保留旧 MiniMax H3 FL2VA 图生视频记录的读取兼容，不再作为新任务路径。",
            source: "amirjan122222 / MiniMax-H3-Turbo-Lora · ckpt850 EMA"
        },
        rules: {
            incompatible: "{name} 不兼容当前基础模型或输入模式。",
            retired: "{name} 已因画面质量不稳定而停止用于新任务；请改用当前受支持的 Turbo LoRA。",
            turboVariant: "ckpt850 与其他 Turbo 变体不可同时使用；请保留单独对照。",
            turboSpectrum: "ckpt850 可与 Spectrum 共存，但请先保留关闭 Spectrum 的同 Seed 基准。",
            orderSuggestion: "建议将 {current} 放在 {previous} 前面；性能 LoRA 通常先加载。"
        }
    },
    "minimax-h3-turbo-sla-4step": {
        guide: {
            summary: "官方 MiniMax H3 Turbo-SLA 4 步 768p 稀疏注意力 LoRA；需要配合 H3 SLA Attention 节点。",
            recommendedStrength: "固定 1.0；创建页会自动切换 4 步、Euler + Beta、video shift 6 和 audio shift 3。",
            effects: "通过约 85% 块稀疏注意力减少注意力计算，目标是降低 4 步 Turbo 的采样时间；未启用 SLA 节点时不会获得稀疏加速。",
            stacking: "性能 LoRA 放在人物、质量或内容 LoRA 前面；Turbo-SLA 与其他 Turbo 变体互斥，不能单独叠加 SLA 节点或 LoRA。",
            compatibility: "仅当前已接入的 MiniMax H3 FL2VA 图生视频 768p 路径；需要设置 → 节点与工作流中的 H3 SLA Attention 节点。",
            source: "LightX2V / Minimax-h3-Turbo-SLA · ComfyUI BF16 conversion"
        },
        rules: {
            incompatible: "{name} 不兼容当前基础模型或输入模式。",
            turboVariant: "Turbo-SLA 与其他 Turbo 变体不可同时使用；请保留单独对照。",
            slaNodeMissing: "Turbo-SLA 需要 H3 SLA Attention 节点；请先在设置 → 节点与工作流中安装。",
            slaNodeRestart: "H3 SLA Attention 已安装但尚未被当前 ComfyUI 加载；请重启 ComfyUI 后重新扫描。",
            turboSpectrum: "Turbo-SLA 技术上可与 Spectrum 共存，但请先保留关闭 Spectrum 的同 Seed 基准。",
            orderSuggestion: "建议将 {current} 放在 {previous} 前面；性能 LoRA 通常先加载。"
        }
    },
    "minimax-h3-lightx2v-turbo-4step-768p-v1.1": {
        guide: {
            summary: "官方 LightX2V v1.1 FL2VA Turbo LoRA，针对 768p 四步路径更新。",
            recommendedStrength: "默认 1.0；按官方路径使用。先固定 4 步、video shift 6、audio shift 3 和 Euler 做基准。",
            effects: "在 768p 下减少采样步数；四步对 Prompt、Seed、运动连续性和音频稳定性更敏感，质量变化应与旧版本做同 Seed 对照。",
            stacking: "性能 LoRA 放在人物或内容 LoRA 前面；不要与 8-step、旧版 v1.0 768p 或其他 Turbo 同时叠加。",
            compatibility: "仅 MiniMax H3 FL2VA 图生视频的 768p 路径；不适用于 Ref2VA 或视频续写。",
            source: "LightX2V / Minimax-h3-Turbo 官方 v1.1 ComfyUI 权重"
        },
        rules: {
            incompatible: "{name} 不兼容当前基础模型或输入模式。",
            turboSpectrum: "v1.1 768p Turbo 与 Spectrum 的组合需要同 Seed 对照；出现画面退化时先关闭 Spectrum。",
            orderSuggestion: "建议将 {current} 放在 {previous} 前面；性能 LoRA 通常先加载。"
        }
    },
    "minimax-h3-camera-motion-v1": {
        guide: {
            summary: "社区 MiniMax H3 Camera Motion 运镜 LoRA，增强推近、拉远、环绕、跟拍和航拍等镜头运动。",
            recommendedStrength: "默认 0.8；作者建议 0.8–1.0，超过 1.2 可能不稳定。",
            effects: "通过 camera motion 触发词增强镜头运动控制，不改变基础模型或音频策略。",
            stacking: "建议单独作为运镜 LoRA 使用；先与无 LoRA 基准对照，再考虑与 Turbo 或人物 LoRA 组合。",
            compatibility: "仅当前已验证的 MiniMax H3 FL2VA INT8 pruned ConvRot 图生视频；暂不开放 INT4、Q3、R2V 或视频续写。",
            source: "Jojocodex / minimax-h3-Camera-Motion-lora v1 3000"
        },
        rules: {
            incompatible: "{name} 不兼容当前基础模型或输入模式。",
            orderSuggestion: "建议将 {current} 放在 {previous} 前面；运镜 LoRA 建议先单独验证，再与性能或人物 LoRA 组合。"
        }
    },
    "minimax-h3-equi360": {
        guide: {
            summary: "MiniMax H3 360° 等距柱状全景 LoRA，专门把画面组织成可封装为球面视频的全景投影。",
            recommendedStrength: "固定 1.0；先使用 H3 原生 T2VA、21:9、768p 做基准。",
            effects: "增强完整球面投影、中央水平线和环境环绕感；应用会自动把触发词 equirect360 放到执行 Prompt 开头。",
            stacking: "建议先单独使用；不要一开始与 Camera Motion、人物写实或 Turbo 叠加，先做同 Seed 对照。",
            compatibility: "当前接入为 MiniMax H3 FL2VA 非续写生成模式；模型卡只验证原生 T2VA 21:9/768p，I2V、Ref2VA、8-step Turbo 和视频续写未验证。",
            source: "shamanic / minimax-h3-equi360-lora · step2500"
        },
        rules: {
            incompatible: "{name} 不兼容当前基础模型或输入模式。",
            orderSuggestion: "建议将 {current} 放在 {previous} 前面；360° 几何 LoRA 建议先单独验证，再与运镜、人物或性能 LoRA 组合。"
        }
    },
    "minimax-h3-turbo-v4-step600-ema-pruned": {
        guide: {
            summary: "社区 MiniMax H3 Turbo v4 step600 EMA pruned 转换，面向 6–8 步质量优先路径。",
            recommendedStrength: "默认 1.0；建议 6–8 步，优先 8 步；Euler + Beta、video shift 12、audio shift 6（作者给出 4–6）。",
            effects: "相比 4-step 更重视细节、运动连续性和同步音频；仍需与官方 v1.1 做同 Seed 对照。",
            stacking: "作为独立 Turbo 变体，不要与官方 v1.1、8-step v1.0 或其他 Turbo 同时叠加；建议放在人物或内容 LoRA 前。",
            compatibility: "仅当前已验证的 MiniMax H3 FL2VA INT8 pruned ConvRot 图生视频；暂不开放 R2V、INT4、Q3 或视频续写。",
            source: "drbaph / MiniMax-H3-Turbo-Lora-ComfyUI v4 step600 EMA pruned"
        },
        rules: {
            incompatible: "{name} 不兼容当前基础模型或输入模式。",
            turboVariant: "v4 step600 与其他 Turbo 变体不可同时使用；请保留单独对照。",
            orderSuggestion: "建议将 {current} 放在 {previous} 前面；性能 LoRA 通常先加载，人物和内容 LoRA 后加载。"
        }
    },
    "minimax-h3-lightx2v-turbo-8step-v1": {
        guide: {
            summary: "官方 LightX2V v1.0 FL2VA 8 步 Turbo 路线；当前没有对应的 8-step v1.1，保留作质量与音频稳定性备选。",
            recommendedStrength: "默认 0.75；建议 8 步、0.65–0.85。综合首选优先尝试 v4。",
            effects: "相比 4 步路线更保守地保留运动、细节和音频稳定性，但版本较旧、速度较慢。",
            stacking: "性能 LoRA 放在内容或人物 LoRA 前面；不要与其他 Turbo LoRA 同时叠加。",
            compatibility: "仅 MiniMax H3 FL2VA 图生视频；需要 ER-SDE、Beta 和 Sigma Shift Turbo 工作流。",
            source: "LightX2V / Minimax-h3-Turbo 官方 ComfyUI 权重"
        },
        rules: {
            incompatible: "{name} 不兼容当前基础模型或输入模式。",
            turboSpectrum: "Turbo v1.0 可与 Spectrum v0.2.6+ 叠加；遇到质量退化时先关闭 Spectrum 对照。",
            orderSuggestion: "建议将 {current} 放在 {previous} 前面；性能 LoRA 通常先加载。"
        }
    },
    "minimax-h3-lightx2v-turbo-4step-768p-v1": {
        guide: {
            summary: "官方 LightX2V v1.0 768p FL2VA Turbo LoRA，针对 768p 四步采样优化。",
            recommendedStrength: "默认 0.75；建议 0.65–0.85。先在 768p 使用，不要与 8-step v1.0 同时叠加。",
            effects: "在 768p 下速度最快，但四步对 Prompt、Seed 和运动稳定性更敏感。",
            stacking: "性能 LoRA 放在人物、内容或风格 LoRA 前面；一次只选一个 Turbo 变体。",
            compatibility: "仅 MiniMax H3 FL2VA 图生视频的 768p 路径；不用于 R2V 或视频续写。",
            source: "LightX2V / Minimax-h3-Turbo 官方 ComfyUI 权重"
        },
        rules: {
            incompatible: "{name} 不兼容当前基础模型或输入模式。",
            turboSpectrum: "768p Turbo 可与 Spectrum v0.2.6+ 叠加；先保留关闭 Spectrum 的基准结果。",
            orderSuggestion: "建议将 {current} 放在 {previous} 前面；性能 LoRA 通常先加载。"
        }
    },
    "minimax-h3-ref2v-turbo-4step-v01": {
        guide: {
            summary: "官方 Ref2VA 多参考图 Turbo LoRA，把 H3 R2V 路径压缩到 4 步。",
            recommendedStrength: "默认 0.75；建议 0.65–0.85。首次使用应和标准 20 步 R2V 做同 Seed 对照。",
            effects: "减少 R2V 采样时间，但多参考图一致性、动作和音频对四步更敏感。",
            stacking: "放在 R2V 内容或人物 LoRA 前面；不要与 FL2VA Turbo 变体叠加。",
            compatibility: "仅 MiniMax H3 Ref2VA 多参考图图生视频；不适用于 FL2VA 首帧或视频续写。",
            source: "LightX2V / Minimax-h3-Turbo 官方 ComfyUI 权重"
        },
        rules: {
            incompatible: "{name} 不兼容当前基础模型或输入模式。",
            turboSpectrum: "Ref2V Turbo 与 Spectrum 的组合需要逐任务验证；若出现时序退化，先关闭 Spectrum。",
            orderSuggestion: "建议将 {current} 放在 {previous} 前面；性能 LoRA 通常先加载。"
        }
    },
    "minimax-h3-after-midnight-ref2va-nsfw": {
        guide: {
            summary: "当前确认的 AfterMidnight v1.2 Ref2VA NSFW 内容 LoRA，仅用于 H3 多参考图路径。",
            recommendedStrength: "默认 1.0；README 提供 sexytime 1.0 和 softer 0.8–1.0 两档，先固定 1.0 做基准。",
            effects: "改变成人内容、身体细节和姿态响应；这是内容 LoRA，不会替代 Prompt，也不应移植到 FL2VA。",
            stacking: "放在 Ref2V Turbo 后、Realism People 等人物 LoRA 后面；与 Turbo 组合时固定 Euler + Beta 并保留单 LoRA 对照。",
            compatibility: "仅 MiniMax H3 Ref2VA 多参考图图生视频；不适用于 FL2VA 首帧、视频续写或 INT4/GGUF。",
            source: "SexGod1979 / AfterMidnight-MiniMax-H3-NSFW v1.2"
        },
        rules: {
            incompatible: "{name} 不兼容当前基础模型或输入模式。",
            afterMidnightTurbo: "AfterMidnight 仅用于 Ref2VA；与 Ref2V Turbo 组合时必须使用 Euler + Beta，并检查音频与时序稳定性。",
            orderSuggestion: "建议将 {current} 放在 {previous} 前面；性能 LoRA 通常先加载。"
        }
    },
    "minimax-h3-lightx2v-turbo-4step": {
        guide: {
            summary: "把 H3 FL2VA 从标准约 20 步切换到 LightX2V Turbo 6–8 步采样，用更少步骤缩短生成时间。",
            recommendedStrength: "默认 0.75；建议 0.65–0.85。4 步仅适合实验，稳定测试优先使用 8 步。",
            effects: "速度明显提高，但过强或步数过低可能损失细节、运动稳定性和音频质量。",
            stacking: "与内容或风格 LoRA 同用时建议放在前面；若组合后质量下降，先降低其他 LoRA 强度，再回退标准 20 步。",
            compatibility: "仅 MiniMax H3 FL2VA 图生视频；会同时切换 ER-SDE、Beta 与 Turbo 步数策略。Spectrum v0.2.6+ 可与这条原生 ER-SDE 路径叠加。",
            source: "LightX2V / Kijai ComfyUI conversion"
        },
        rules: {
            incompatible: "{name} 不兼容当前基础模型或输入模式。",
            retired: "{name} 已停止用于新任务；请改用当前受支持的 LoRA。",
            turboSpectrum: "Spectrum v0.2.6+ 可与 LightX2V Turbo 的原生 ER-SDE 路径叠加；更早版本请先更新。",
            orderSuggestion: "建议将 {current} 放在 {previous} 前面；性能 LoRA 通常先加载，内容、人物和风格 LoRA 后加载。"
        }
    },
    "minimax-h3-realism-people": {
        guide: {
            summary: "人物写实质量 LoRA，增强近景面部、自然皮肤纹理、微表情、手部活动、电影灯光和轻微纪录片式镜头感。应用会自动把触发词 r34l1sm 放到执行 Prompt 开头。",
            recommendedStrength: "默认 0.8；作者 intended strength 为 1.0，0.6–0.8 更轻。多 LoRA 叠加时建议先从 0.6–0.8 测试。",
            effects: "可能改变肤色、调色、镜头运动、人物朝向和肢体物理；强度过高时可能降低纹理清晰度或放大手部瑕疵。",
            stacking: "建议放在 Turbo 之后、NSFW 内容 LoRA 之前。首次使用应保留相同 Prompt/Seed 的无 LoRA 对照；与其他人物 LoRA 叠加时分别降低强度。",
            compatibility: "作者权重支持 H3 T2V/I2V/R2V；当前应用开放给已接入的 INT8 FL2VA 图生视频与 INT8 R2V，多参考续写和 INT4/GGUF 尚未验证。",
            source: "fal / MiniMax-H3-Realism-People-LoRA"
        },
        rules: {
            incompatible: "{name} 不兼容当前基础模型或输入模式。",
            realismTurbo: "Realism People 可与 Turbo 叠加，但低步数可能削弱人物细节；建议 Turbo 在前，并与标准 20 步做同 Seed 对照。",
            realismAfterMidnight: "Realism People 与 AfterMidnight 都会改变人物和身体细节；组合属于未充分验证路径，建议分别降低强度并检查肤色、手部和动作。",
            orderSuggestion: "建议将 {current} 放在 {previous} 前面；推荐顺序为性能 LoRA、人物/质量 LoRA、内容 LoRA。"
        }
    },
    "minimax-h3-facial-realism-closeup": {
        guide: {
            summary: "实验性 H3 人脸写实特写 LoRA；触发词为 Facial Realism。",
            recommendedStrength: "作者未提供固定强度；应用默认 0.8，建议先用 0.6–0.8 做同 Seed 对照。",
            effects: "增强近景皮肤纹理、眼神、自然眨眼和微表情；不会自行加速采样。",
            stacking: "建议放在 Turbo 后；先不要与 Realism People 等人物写实 LoRA 叠加，分别做对照。",
            compatibility: "当前仅开放给已验证的 MiniMax H3 FL2VA INT8 pruned ConvRot 图生视频；Ref2VA、INT4、Q3 和视频续写暂未验证。",
            source: "prithivMLmods / MiniMax-H3-Facial-Realism-CloseUp · cp2000"
        },
        rules: {
            incompatible: "{name} 不兼容当前基础模型或输入模式。",
            facialRealismTurbo: "Facial Realism CloseUp 可与 Turbo 技术上叠加，但低步数与实验性人脸适配器需要同 Seed 对照；建议 Turbo 在前。",
            facialRealismPeople: "Facial Realism CloseUp 与 Realism People 都会改变人物写实细节；未经充分验证，请先分别使用并检查伪影、肤色和身份一致性。",
            orderSuggestion: "建议将 {current} 放在 {previous} 前面；性能 LoRA 通常先加载，人物和质量 LoRA 后加载。"
        }
    },
    "minimax-h3-pink-fluffy-bunny-nsfw": {
        guide: {
            summary: "社区 NSFW 内容 LoRA，用于增强 H3 对成人内容、身体细节和相关姿态的响应。它不会替代 Prompt。",
            recommendedStrength: "默认 0.5；建议先在 0.35–0.65 间测试。高于 0.7 更容易出现过度特征和画面瑕疵。",
            effects: "会改变内容倾向、身体结构和局部细节；作者标注为 alpha，人物一致性与音频仍需抽样验证。",
            stacking: "与 Turbo 同用时建议放在 Turbo 后面。若出现鬼影、僵硬或细节退化，先降低本项强度，再单独关闭 Turbo 对照。",
            compatibility: "当前仅用于 MiniMax H3 FL2VA pruned INT8 图生视频；不提供给 R2V 或视频续写。",
            source: "SexGod1979 / PinkFluffyBunny-MiniMax-H3"
        },
        rules: {
            incompatible: "{name} 不兼容当前基础模型或输入模式。",
            retired: "{name} 已停止用于新任务；请改用当前受支持的 Ref2VA NSFW LoRA。",
            pinkTurbo: "PinkFluffyBunny 与 Turbo 可以组合，但属于未经充分验证的 alpha 叠加；建议 Turbo 在前，并分别保留单 LoRA 对照结果。",
            orderSuggestion: "建议将 {current} 放在 {previous} 前面；性能 LoRA 通常先加载，内容、人物和风格 LoRA 后加载。"
        }
    }
};
const enUS = {
    "minimax-h3-turbo-ckpt850-ema": {
        guide: {
            summary: "The older MiniMax H3 Turbo ckpt850 EMA training line is retired and retained only for legacy queue and history compatibility.",
            recommendedStrength: "Do not use it for new tasks; choose a currently supported Turbo LoRA.",
            effects: "The old four-step path can produce oversharpening, plastic or grainy frames, and unstable motion, so it is no longer a new-task option.",
            stacking: "For legacy record reading only; do not create a new stack or Turbo comparison with it.",
            compatibility: "Retained only to read old MiniMax H3 FL2VA image-to-video records; it is no longer a new-task path.",
            source: "amirjan122222 / MiniMax-H3-Turbo-Lora · ckpt850 EMA"
        },
        rules: {
            incompatible: "{name} is incompatible with the current base model or input mode.",
            retired: "{name} is retired for new tasks because of unstable visual quality; choose a currently supported Turbo LoRA.",
            turboVariant: "ckpt850 cannot be combined with another Turbo variant; keep a separate comparison.",
            turboSpectrum: "ckpt850 can coexist with Spectrum, but keep a same-Seed Spectrum-off baseline first.",
            orderSuggestion: "Place {current} before {previous}; performance LoRAs usually load first."
        }
    },
    "minimax-h3-turbo-sla-4step": {
        guide: {
            summary: "The official MiniMax H3 Turbo-SLA four-step 768p sparse-attention LoRA; it requires the H3 SLA Attention node.",
            recommendedStrength: "Keep strength at 1.0; the Create page automatically switches to four steps, Euler + Beta, video shift 6, and audio shift 3.",
            effects: "Uses roughly 85% block-sparse attention to reduce attention compute for four-step Turbo; without the SLA node there is no sparse acceleration.",
            stacking: "Load performance LoRAs before people, quality, or content LoRAs; Turbo-SLA is exclusive with other Turbo variants, and neither the node nor LoRA is useful alone.",
            compatibility: "Only the currently integrated MiniMax H3 FL2VA 768p image-to-video path; install H3 SLA Attention in Settings → Nodes & Workflows.",
            source: "LightX2V / Minimax-h3-Turbo-SLA · ComfyUI BF16 conversion"
        },
        rules: {
            incompatible: "{name} is incompatible with the current base model or input mode.",
            turboVariant: "Turbo-SLA cannot be combined with another Turbo variant; keep a separate comparison.",
            slaNodeMissing: "Turbo-SLA requires the H3 SLA Attention node; install it in Settings → Nodes & Workflows first.",
            slaNodeRestart: "H3 SLA Attention is installed but not loaded by the current ComfyUI; restart ComfyUI and rescan.",
            turboSpectrum: "Turbo-SLA can technically coexist with Spectrum, but keep a same-Seed Spectrum-off baseline first.",
            orderSuggestion: "Place {current} before {previous}; performance LoRAs usually load first."
        }
    },
    "minimax-h3-lightx2v-turbo-4step-768p-v1.1": {
        guide: {
            summary: "The latest official LightX2V v1.1 FL2VA Turbo LoRA for the dedicated 768p four-step path.",
            recommendedStrength: "Default 1.0; start with four steps, video shift 6, audio shift 3, and Euler as the baseline.",
            effects: "Reduces the 768p sampling budget, while four steps are more sensitive to Prompt, Seed, temporal motion, and audio stability; compare with the old version using the same Seed.",
            stacking: "Load it before people or content LoRAs; do not stack it with the eight-step, retired v1.0 768p, or another Turbo variant.",
            compatibility: "MiniMax H3 FL2VA image-to-video 768p only; not for Ref2VA or video extension.",
            source: "Official LightX2V / Minimax-h3-Turbo v1.1 ComfyUI weight"
        },
        rules: {
            incompatible: "{name} is incompatible with the current base model or input mode.",
            turboSpectrum: "The v1.1 768p Turbo path needs a same-Seed comparison with Spectrum; disable Spectrum first if image quality drops.",
            orderSuggestion: "Place {current} before {previous}; performance LoRAs usually load first."
        }
    },
    "minimax-h3-camera-motion-v1": {
        guide: {
            summary: "A community MiniMax H3 Camera Motion LoRA for stronger push-ins, pull-outs, orbits, tracking shots, and aerial camera movement.",
            recommendedStrength: "Default 0.8; the author recommends 0.8–1.0, while values above 1.2 may become unstable.",
            effects: "Uses the camera motion trigger to strengthen camera-movement control without changing the base model or audio policy.",
            stacking: "Use it by itself first; compare against a no-LoRA baseline before combining it with Turbo or people LoRAs.",
            compatibility: "Currently enabled only for the validated MiniMax H3 FL2VA INT8 pruned ConvRot image-to-video path; INT4, Q3, R2V, and video extension remain disabled.",
            source: "Jojocodex / minimax-h3-Camera-Motion-lora v1 3000"
        },
        rules: {
            incompatible: "{name} is incompatible with the current base model or input mode.",
            orderSuggestion: "Place {current} before {previous}; validate the camera-motion LoRA alone before combining it with performance or people LoRAs."
        }
    },
    "minimax-h3-equi360": {
        guide: {
            summary: "A MiniMax H3 equirectangular 360° LoRA that organizes the frame as a spherical panorama ready for packaging.",
            recommendedStrength: "Keep 1.0; start with native H3 T2VA at 21:9 and 768p.",
            effects: "Strengthens full-sphere projection, the centered horizon, and wraparound environment cues. The app automatically prefixes the execution Prompt with equirect360.",
            stacking: "Use it alone first; do not initially combine it with Camera Motion, people-realism, or Turbo adapters. Keep a same-Seed comparison.",
            compatibility: "The app exposes it for the MiniMax H3 FL2VA non-extension generation path. The model card only evaluates native T2VA at 21:9/768p; I2V, Ref2VA, eight-step Turbo, and video extension remain unvalidated.",
            source: "shamanic / minimax-h3-equi360-lora · step2500"
        },
        rules: {
            incompatible: "{name} is incompatible with the current base model or input mode.",
            orderSuggestion: "Place {current} before {previous}; validate the 360° geometry adapter alone before combining it with camera-motion, people, or performance adapters."
        }
    },
    "minimax-h3-turbo-v4-step600-ema-pruned": {
        guide: {
            summary: "A community MiniMax H3 Turbo v4 step600 EMA pruned conversion for a quality-first six-to-eight-step path.",
            recommendedStrength: "Default 1.0; use six to eight steps, preferably eight, with Euler + Beta, video shift 12, and audio shift 6 (the author reports 4–6 for audio shift).",
            effects: "Prioritizes detail, temporal continuity, and synchronized audio over the four-step path; compare it with the official v1.1 using the same Seed.",
            stacking: "Treat it as a standalone Turbo variant; do not stack it with official v1.1, eight-step v1.0, or another Turbo variant. Load it before people or content LoRAs.",
            compatibility: "Currently enabled only for the validated MiniMax H3 FL2VA INT8 pruned ConvRot image-to-video path; R2V, INT4, Q3, and video extension remain disabled.",
            source: "drbaph / MiniMax-H3-Turbo-Lora-ComfyUI v4 step600 EMA pruned"
        },
        rules: {
            incompatible: "{name} is incompatible with the current base model or input mode.",
            turboVariant: "The v4 step600 variant cannot be combined with another Turbo variant; keep a separate comparison.",
            orderSuggestion: "Place {current} before {previous}; performance LoRAs usually load before people and content LoRAs."
        }
    },
    "minimax-h3-lightx2v-turbo-8step-v1": {
        guide: {
            summary: "The official LightX2V v1.0 FL2VA eight-step Turbo path; no matching eight-step v1.1 is currently published, so it remains a quality and audio-stability fallback.",
            recommendedStrength: "Default 0.75; use eight steps at 0.65–0.85. Prefer v4 as the overall starting point.",
            effects: "More conservatively preserves motion, detail, and audio stability than the four-step paths, but it is older and slower.",
            stacking: "Load performance LoRAs before content or people LoRAs; never stack multiple Turbo variants together.",
            compatibility: "MiniMax H3 FL2VA image-to-video only; requires the ER-SDE, Beta, and Sigma Shift Turbo workflow.",
            source: "Official LightX2V / Minimax-h3-Turbo ComfyUI weight"
        },
        rules: {
            incompatible: "{name} is incompatible with the current base model or input mode.",
            turboSpectrum: "Turbo v1.0 can stack with Spectrum v0.2.6+; disable Spectrum for a baseline if quality drops.",
            orderSuggestion: "Place {current} before {previous}; performance LoRAs usually load first."
        }
    },
    "minimax-h3-lightx2v-turbo-4step-768p-v1": {
        guide: {
            summary: "Official LightX2V v1.0 768p FL2VA Turbo LoRA optimized for the dedicated 768p four-step path.",
            recommendedStrength: "Default 0.75; start around 0.65–0.85. Use it at 768p and do not stack it with the eight-step v1.0 variant.",
            effects: "Fastest at 768p, but four steps are more sensitive to Prompt, Seed, and motion stability.",
            stacking: "Load it before people, content, or style LoRAs; select only one Turbo variant at a time.",
            compatibility: "MiniMax H3 FL2VA image-to-video 768p only; not for R2V or video extension.",
            source: "Official LightX2V / Minimax-h3-Turbo ComfyUI weight"
        },
        rules: {
            incompatible: "{name} is incompatible with the current base model or input mode.",
            turboSpectrum: "The 768p Turbo path can stack with Spectrum v0.2.6+; keep a Spectrum-off baseline first.",
            orderSuggestion: "Place {current} before {previous}; performance LoRAs usually load first."
        }
    },
    "minimax-h3-ref2v-turbo-4step-v01": {
        guide: {
            summary: "Official Ref2VA multi-reference Turbo LoRA that compresses the H3 R2V path to four steps.",
            recommendedStrength: "Default 0.75; start around 0.65–0.85. Compare against standard 20-step R2V with the same Seed first.",
            effects: "Reduces R2V sampling time, while multi-reference consistency, motion, and audio are more sensitive at four steps.",
            stacking: "Load it before R2V content or people LoRAs; do not combine it with FL2VA Turbo variants.",
            compatibility: "MiniMax H3 Ref2VA multi-reference image-to-video only; not for FL2VA first-frame or video extension.",
            source: "Official LightX2V / Minimax-h3-Turbo ComfyUI weight"
        },
        rules: {
            incompatible: "{name} is incompatible with the current base model or input mode.",
            turboSpectrum: "Ref2V Turbo with Spectrum needs per-task validation; disable Spectrum first if temporal quality drops.",
            orderSuggestion: "Place {current} before {previous}; performance LoRAs usually load first."
        }
    },
    "minimax-h3-after-midnight-ref2va-nsfw": {
        guide: {
            summary: "The currently confirmed AfterMidnight v1.2 Ref2VA NSFW content LoRA for the H3 multi-reference path.",
            recommendedStrength: "Default 1.0; the README describes a sexytime 1.0 flavor and a softer 0.8–1.0 range. Keep 1.0 as the baseline.",
            effects: "Changes adult-content, body-detail, and pose response; it is a content LoRA, does not replace the Prompt, and must not be moved to FL2VA.",
            stacking: "Place it after Ref2V Turbo and people LoRAs; when combined with Turbo, keep Euler + Beta and retain a single-LoRA comparison.",
            compatibility: "MiniMax H3 Ref2VA multi-reference image-to-video only; not for FL2VA first-frame, video extension, or INT4/GGUF.",
            source: "SexGod1979 / AfterMidnight-MiniMax-H3-NSFW v1.2"
        },
        rules: {
            incompatible: "{name} is incompatible with the current base model or input mode.",
            afterMidnightTurbo: "AfterMidnight is Ref2VA-only; when combined with Ref2V Turbo, use Euler + Beta and inspect audio and temporal stability.",
            orderSuggestion: "Place {current} before {previous}; performance LoRAs usually load first."
        }
    },
    "minimax-h3-lightx2v-turbo-4step": {
        guide: {
            summary: "Switches H3 FL2VA from standard roughly 20-step sampling to LightX2V Turbo 6–8-step sampling for shorter generation time.",
            recommendedStrength: "Default 0.75; start around 0.65–0.85. Four steps are experimental; use eight steps for stable tests.",
            effects: "Significantly faster, but excessive strength or too few steps can reduce detail, motion stability, and audio quality.",
            stacking: "Place it before content or style LoRAs; if quality drops, lower other LoRA strengths first, then compare against standard 20-step sampling.",
            compatibility: "MiniMax H3 FL2VA image-to-video only; also switches the ER-SDE, Beta, and Turbo step strategy. Spectrum v0.2.6+ can stack with this native ER-SDE path.",
            source: "LightX2V / Kijai ComfyUI conversion"
        },
        rules: {
            incompatible: "{name} is incompatible with the current base model or input mode.",
            retired: "{name} is retired for new tasks; choose the currently supported replacement LoRA.",
            turboSpectrum: "Spectrum v0.2.6+ can stack with LightX2V Turbo's native ER-SDE path; update older versions first.",
            orderSuggestion: "Place {current} before {previous}; performance LoRAs usually load before content, character, and style LoRAs."
        }
    },
    "minimax-h3-realism-people": {
        guide: {
            summary: "A people-realism quality LoRA for close-up faces, natural skin texture, micro-expressions, hands at work, film lighting, and subtle documentary camera motion. The app automatically prefixes the execution Prompt with r34l1sm.",
            recommendedStrength: "Default 0.8; the author's intended strength is 1.0, with 0.6–0.8 for a lighter effect. Start at 0.6–0.8 when stacking LoRAs.",
            effects: "May alter skin tone, grading, camera movement, gaze, and body physics; excessive strength can soften texture or amplify hand artifacts.",
            stacking: "Place it after Turbo and before NSFW content LoRAs. Keep a same-Prompt/same-Seed baseline without the adapter, and lower each strength when combining people-focused LoRAs.",
            compatibility: "The author supplies one H3 T2V/I2V/R2V weight. The app currently enables validated INT8 FL2VA image-to-video and INT8 R2V; multi-reference extension and INT4/GGUF remain unvalidated.",
            source: "fal / MiniMax-H3-Realism-People-LoRA"
        },
        rules: {
            incompatible: "{name} is incompatible with the current base model or input mode.",
            realismTurbo: "Realism People can stack with Turbo, but low-step sampling may reduce people detail; place Turbo first and compare against standard 20-step sampling with the same Seed.",
            realismAfterMidnight: "Realism People and AfterMidnight both alter people and body detail. This stack is not fully validated; lower both strengths and inspect skin tone, hands, and motion.",
            orderSuggestion: "Place {current} before {previous}; the recommended order is performance, people/quality, then content LoRAs."
        }
    },
    "minimax-h3-facial-realism-closeup": {
        guide: {
            summary: "An experimental H3 facial-realism close-up LoRA; its trigger is Facial Realism.",
            recommendedStrength: "The author does not publish a fixed strength; the app defaults to 0.8, so start with a same-Seed comparison around 0.6–0.8.",
            effects: "Improves close-up skin texture, eyes, natural blinks, and micro-expressions; it does not accelerate sampling by itself.",
            stacking: "Place it after Turbo; do not initially stack it with Realism People or another people-realism adapter. Compare them separately first.",
            compatibility: "Currently enabled only for the validated MiniMax H3 FL2VA INT8 pruned ConvRot image-to-video path; Ref2VA, INT4, Q3, and video extension remain unvalidated.",
            source: "prithivMLmods / MiniMax-H3-Facial-Realism-CloseUp · cp2000"
        },
        rules: {
            incompatible: "{name} is incompatible with the current base model or input mode.",
            facialRealismTurbo: "Facial Realism CloseUp can technically stack with Turbo, but low-step sampling and this experimental facial adapter need a same-Seed comparison; place Turbo first.",
            facialRealismPeople: "Facial Realism CloseUp and Realism People both alter people-realism detail. This stack is not fully validated; use them separately first and inspect artifacts, skin tone, and identity consistency.",
            orderSuggestion: "Place {current} before {previous}; performance LoRAs usually load before people and quality LoRAs."
        }
    },
    "minimax-h3-pink-fluffy-bunny-nsfw": {
        guide: {
            summary: "A community NSFW content LoRA for H3 response to adult content, body detail, and related poses. It does not replace the Prompt.",
            recommendedStrength: "Default 0.5; test between 0.35–0.65 first. Above 0.7 is more likely to create excessive traits and artifacts.",
            effects: "Changes content tendency, body structure, and local detail; the author marks it alpha, so identity consistency and audio still need sampling validation.",
            stacking: "Place it after Turbo when combined. If ghosting, stiffness, or detail degradation appears, lower this strength first and compare with Turbo disabled.",
            compatibility: "Currently for MiniMax H3 FL2VA pruned INT8 image-to-video only; not available for R2V or video extension.",
            source: "SexGod1979 / PinkFluffyBunny-MiniMax-H3"
        },
        rules: {
            incompatible: "{name} is incompatible with the current base model or input mode.",
            retired: "{name} is retired for new tasks; choose the currently supported Ref2VA NSFW LoRA.",
            pinkTurbo: "PinkFluffyBunny can be combined with Turbo, but the alpha stack is not fully validated; place Turbo first and keep single-LoRA comparison results.",
            orderSuggestion: "Place {current} before {previous}; performance LoRAs usually load before content, character, and style LoRAs."
        }
    }
};
const genericRules = {
    "zh-CN": {
        incompatible: "{name} 不兼容当前基础模型或输入模式。",
        retired: "{name} 已停止用于新任务；请改用当前受支持的替代 LoRA。",
        turboVariant: "不同 Turbo 变体不可同时使用；请只保留一个 Turbo LoRA。",
        orderSuggestion: "建议将 {current} 放在 {previous} 前面；性能 LoRA 通常先加载，内容、人物和风格 LoRA 后加载。"
    },
    "zh-TW": {
        incompatible: "{name} 不相容目前的基礎模型或輸入模式。",
        retired: "{name} 已停止用於新任務；請改用目前受支援的替代 LoRA。",
        turboVariant: "不同 Turbo 變體不可同時使用；請只保留一個 Turbo LoRA。",
        orderSuggestion: "建議將 {current} 放在 {previous} 前面；效能 LoRA 通常先載入，內容、人物和風格 LoRA 後載入。"
    },
    "en-US": {
        incompatible: "{name} is incompatible with the current base model or input mode.",
        retired: "{name} is retired for new tasks; choose a currently supported replacement LoRA.",
        turboVariant: "Different Turbo variants cannot be used together; keep only one Turbo LoRA.",
        orderSuggestion: "Place {current} before {previous}; performance LoRAs usually load before content, character, and style LoRAs."
    }
};
export function loraLocaleFor(id, locale = "zh-CN") {
    return (locale === "en-US" ? enUS[id] : locale === "zh-TW" ? zhTWLoraLocales[id] : undefined) ?? zhCN[id];
}
export function loraRuleText(id, key, locale = "zh-CN") {
    return loraLocaleFor(id, locale)?.rules[key] ??
        loraLocaleFor(id, "zh-CN")?.rules[key] ??
        genericRules[locale][key] ??
        genericRules["zh-CN"][key] ??
        key;
}
