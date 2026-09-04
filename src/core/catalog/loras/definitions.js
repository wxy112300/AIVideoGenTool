/** The current default FL2VA Turbo adapter. */
export const H3_TURBO_LORA_ID = "minimax-h3-lightx2v-turbo-4step-768p-v1.1";
export const LEGACY_H3_TURBO_MODEL_ID = "minimax_h3_fl2va_turbo";
export const LEGACY_H3_REF2V_TURBO_MODEL_ID = "minimax_h3_ref2va_turbo";
export const H3_FL2VA_MODEL_ID = "minimax_h3_fl2va";
export const H3_TURBO_LORA_FILENAME = "minimax_h3_fl2v_turbo_4step_v1.1_768p_comfyui_bf16.safetensors";
export const H3_CKPT850_LORA_ID = "minimax-h3-turbo-ckpt850-ema";
export const H3_CKPT850_LORA_FILENAME = "minimax_h3_turbo_4step_ema_ckpt850.safetensors";
export const H3_SLA_TURBO_LORA_ID = "minimax-h3-turbo-sla-4step";
export const H3_SLA_TURBO_LORA_FILENAME = "minimax_h3_fl2v_turbo_4step_v0.1_768p_sla_comfyui_bf16.safetensors";
export const H3_CAMERA_MOTION_LORA_ID = "minimax-h3-camera-motion-v1";
export const H3_CAMERA_MOTION_LORA_FILENAME = "camera_motion_h3_lora_v1_3000_pruned.safetensors";
export const H3_TURBO_V4_LORA_ID = "minimax-h3-turbo-v4-step600-ema-pruned";
export const H3_TURBO_V4_LORA_FILENAME = "minimax_h3_turbo_v4_step600_ema_pruned_comfyui.safetensors";
export const LEGACY_H3_TURBO_LORA_ID = "minimax-h3-lightx2v-turbo-4step";
export const LEGACY_H3_TURBO_LORA_FILENAME = "minimax_h3_fl2v_lightx2v_turbo_4step_v0.1_comfy_resized_avg_rank_21_bf16.safetensors";
export const H3_TURBO_8STEP_V1_LORA_ID = "minimax-h3-lightx2v-turbo-8step-v1";
export const H3_TURBO_8STEP_V1_LORA_FILENAME = "minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors";
export const H3_TURBO_768P_V1_LORA_ID = "minimax-h3-lightx2v-turbo-4step-768p-v1";
export const H3_TURBO_768P_V1_LORA_FILENAME = "minimax_h3_fl2v_turbo_4step_v1.0_768p_comfyui_bf16.safetensors";
export const H3_REF2V_TURBO_LORA_ID = "minimax-h3-ref2v-turbo-4step-v01";
export const H3_REF2V_TURBO_LORA_FILENAME = "minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors";
export const H3_AFTER_MIDNIGHT_LORA_ID = "minimax-h3-after-midnight-ref2va-nsfw";
export const H3_AFTER_MIDNIGHT_LORA_FILENAME = "AfterMidnight_ref2va_h3_sexytime_rank64-v1.2.safetensors";
export const H3_TURBO_LORA_IDS = [
    H3_TURBO_V4_LORA_ID,
    H3_SLA_TURBO_LORA_ID,
    H3_TURBO_LORA_ID,
    H3_TURBO_8STEP_V1_LORA_ID,
    H3_CKPT850_LORA_ID,
    H3_REF2V_TURBO_LORA_ID
];
export const H3_PINK_FLUFFY_BUNNY_LORA_ID = "minimax-h3-pink-fluffy-bunny-nsfw";
export const H3_PINK_FLUFFY_BUNNY_LORA_FILENAME = "PinkFluffyBunny-pruned-v1-rank128.safetensors";
export const H3_REALISM_PEOPLE_LORA_ID = "minimax-h3-realism-people";
export const H3_REALISM_PEOPLE_LORA_FILENAME = "h3-realism-people-t2v-i2v-r2v.safetensors";
export const H3_FACIAL_REALISM_CLOSEUP_LORA_ID = "minimax-h3-facial-realism-closeup";
export const H3_FACIAL_REALISM_CLOSEUP_LORA_FILENAME = "minimax-h3-facial-realism-closeup-cp2000.safetensors";
export const VIDEO_LORA_DEFINITIONS = [{
        id: H3_CKPT850_LORA_ID,
        name: "MiniMax H3 Turbo ckpt850 EMA · 4-step motion fallback",
        retired: true,
        filename: H3_CKPT850_LORA_FILENAME,
        strength: 1,
        modelFamily: "minimax-h3",
        compatibleModelIds: [H3_FL2VA_MODEL_ID],
        compatibleInputModes: ["image"],
        purpose: "performance",
        promptPrefixes: [],
        catalogOrder: 116,
        variant: "turbo",
        rules: {
            orderPriority: 10,
            settingConflicts: [],
            combinations: [],
            workflowRequirement: "h3-turbo-sampling"
        },
        scan: {
            vram: "LoRA · ckpt850 EMA · 4+ steps · strength 1.0",
            integrated: true,
            components: [{
                    label: "MiniMax H3 Turbo ckpt850 EMA LoRA",
                    expected: `loras/${H3_CKPT850_LORA_FILENAME}`,
                    patterns: [/loras\/minimax_h3_turbo_4step_ema_ckpt850\.safetensors$/i],
                    installGuide: {
                        sourceLabel: "amirjan122222 / MiniMax-H3-Turbo-Lora",
                        downloadUrl: `https://huggingface.co/amirjan122222/MiniMax-H3-Turbo-Lora/resolve/main/${H3_CKPT850_LORA_FILENAME}?download=true`,
                        targetSubdirectory: "loras",
                        recommendedFilename: H3_CKPT850_LORA_FILENAME,
                        notes: "ckpt850 EMA 旧 Turbo 训练线已因画面质量不稳定而退役；仅保留旧队列与历史记录兼容，新任务请使用当前受支持的 Turbo LoRA。"
                    }
                }]
        }
    }, {
        id: H3_SLA_TURBO_LORA_ID,
        name: "MiniMax H3 Turbo-SLA · 4-step",
        filename: H3_SLA_TURBO_LORA_FILENAME,
        strength: 1,
        modelFamily: "minimax-h3",
        compatibleModelIds: [H3_FL2VA_MODEL_ID],
        compatibleInputModes: ["image"],
        purpose: "performance",
        promptPrefixes: [],
        catalogOrder: 119,
        variant: "turbo",
        rules: {
            orderPriority: 10,
            settingConflicts: [],
            combinations: [],
            workflowRequirement: "h3-turbo-sampling"
        },
        scan: {
            vram: "LoRA · Turbo-SLA · 4 steps · 768p · 85% sparse attention · strength 1.0",
            integrated: true,
            requiredCustomNodeIds: ["plaguekind-h3-sla"],
            components: [{
                    label: "MiniMax H3 Turbo-SLA 4-step 768p LoRA",
                    expected: `loras/${H3_SLA_TURBO_LORA_FILENAME}`,
                    patterns: [/loras\/minimax_h3_fl2v_turbo_4step_v0\.1_768p_sla_comfyui_bf16\.safetensors$/i],
                    installGuide: {
                        sourceLabel: "LightX2V / Minimax-h3-Turbo-SLA",
                        downloadUrl: `https://huggingface.co/lightx2v/Minimax-h3-Turbo-SLA/resolve/main/${H3_SLA_TURBO_LORA_FILENAME}?download=true`,
                        targetSubdirectory: "loras",
                        recommendedFilename: H3_SLA_TURBO_LORA_FILENAME,
                        notes: "官方 ComfyUI BF16 Turbo-SLA LoRA；必须配合 H3 SLA Attention 节点。应用会自动插入节点并固定 4 步、Euler + Beta、video shift 6、audio shift 3 和 85% sparsity，不需要单独打开 SLA 开关。不要与其他 Turbo LoRA 同时叠加。"
                    }
                }]
        }
    }, {
        id: H3_TURBO_LORA_ID,
        name: "LightX2V Turbo 4-Step v1.1 · 768p",
        filename: H3_TURBO_LORA_FILENAME,
        strength: 1,
        modelFamily: "minimax-h3",
        compatibleModelIds: [H3_FL2VA_MODEL_ID],
        compatibleInputModes: ["image"],
        purpose: "performance",
        promptPrefixes: [],
        catalogOrder: 118,
        variant: "turbo",
        rules: {
            orderPriority: 10,
            settingConflicts: [],
            combinations: [],
            workflowRequirement: "h3-turbo-sampling"
        },
        scan: {
            vram: "LoRA · v1.1 · 4 steps · 768p · strength 1.0",
            integrated: true,
            components: [{
                    label: "MiniMax H3 LightX2V Turbo 4-Step v1.1 768p LoRA",
                    expected: `loras/${H3_TURBO_LORA_FILENAME}`,
                    patterns: [/loras\/minimax_h3_fl2v_turbo_4step_v1\.1_768p_comfyui_bf16\.safetensors$/i],
                    installGuide: {
                        sourceLabel: "LightX2V / Minimax-h3-Turbo",
                        downloadUrl: `https://huggingface.co/lightx2v/Minimax-h3-Turbo/resolve/main/${H3_TURBO_LORA_FILENAME}`,
                        targetSubdirectory: "loras",
                        recommendedFilename: H3_TURBO_LORA_FILENAME,
                        notes: "官方最新 FL2VA 4 步 768p 权重。使用 video shift 6、audio shift 3、Euler；不要与其他 Turbo LoRA 同时叠加。"
                    }
                }]
        }
    }, {
        id: H3_TURBO_V4_LORA_ID,
        name: "MiniMax H3 Turbo v4 · step600 EMA",
        filename: H3_TURBO_V4_LORA_FILENAME,
        strength: 1,
        modelFamily: "minimax-h3",
        compatibleModelIds: [H3_FL2VA_MODEL_ID],
        compatibleInputModes: ["image"],
        purpose: "performance",
        promptPrefixes: [],
        catalogOrder: 120,
        variant: "turbo",
        rules: {
            orderPriority: 10,
            settingConflicts: [],
            combinations: [{
                    loraId: H3_TURBO_LORA_ID,
                    severity: "error",
                    localeKey: "turboVariant"
                }, {
                    loraId: H3_TURBO_8STEP_V1_LORA_ID,
                    severity: "error",
                    localeKey: "turboVariant"
                }, {
                    loraId: H3_REF2V_TURBO_LORA_ID,
                    severity: "error",
                    localeKey: "turboVariant"
                }],
            workflowRequirement: "h3-turbo-sampling"
        },
        scan: {
            vram: "LoRA · v4 step600 EMA pruned · 6–8 steps · strength 1.0",
            integrated: true,
            components: [{
                    label: "MiniMax H3 Turbo v4 step600 EMA pruned LoRA",
                    expected: `loras/${H3_TURBO_V4_LORA_FILENAME}`,
                    patterns: [/loras\/minimax_h3_turbo_v4_step600_ema_pruned_comfyui\.safetensors$/i],
                    installGuide: {
                        sourceLabel: "drbaph / MiniMax-H3-Turbo-Lora-ComfyUI",
                        downloadUrl: `https://huggingface.co/drbaph/MiniMax-H3-Turbo-Lora-ComfyUI/resolve/main/${H3_TURBO_V4_LORA_FILENAME}?download=true`,
                        targetSubdirectory: "loras",
                        recommendedFilename: H3_TURBO_V4_LORA_FILENAME,
                        notes: "社区 v4 step600 EMA pruned 转换。建议 8 步（可选 6–8 步），固定 Euler + Beta、video shift 12、audio shift 6；作者给出 audio shift 4–6。当前仅开放 H3 FL2VA pruned INT8 ConvRot 图生视频，不与其他 Turbo 变体叠加。"
                    }
                }]
        }
    }, {
        id: H3_CAMERA_MOTION_LORA_ID,
        name: "MiniMax H3 Camera Motion v1",
        filename: H3_CAMERA_MOTION_LORA_FILENAME,
        strength: 0.8,
        modelFamily: "minimax-h3",
        compatibleModelIds: [H3_FL2VA_MODEL_ID],
        compatibleInputModes: ["image"],
        purpose: "motion",
        promptPrefixes: ["camera motion"],
        catalogOrder: 99,
        variant: "fl2va",
        rules: {
            orderPriority: 20,
            settingConflicts: [],
            combinations: []
        },
        scan: {
            vram: "LoRA · camera motion · v1 · strength 0.8",
            integrated: true,
            components: [{
                    label: "MiniMax H3 Camera Motion LoRA v1 3000",
                    expected: `loras/${H3_CAMERA_MOTION_LORA_FILENAME}`,
                    patterns: [/loras\/camera_motion_h3_lora_v1_3000_pruned\.safetensors$/i],
                    installGuide: {
                        sourceLabel: "Jojocodex / minimax-h3-Camera-Motion-lora",
                        downloadUrl: `https://huggingface.co/Jojocodex/minimax-h3-Camera-Motion-lora/resolve/main/${H3_CAMERA_MOTION_LORA_FILENAME}?download=true`,
                        targetSubdirectory: "loras",
                        recommendedFilename: H3_CAMERA_MOTION_LORA_FILENAME,
                        notes: "社区 Camera Motion v1 3000 权重。执行 Prompt 会自动加入触发词 camera motion；建议强度 0.8–1.0。当前仅开放 H3 FL2VA pruned INT8 ConvRot 图生视频。"
                    }
                }]
        }
    }, {
        id: LEGACY_H3_TURBO_LORA_ID,
        name: "LightX2V Turbo 4-Step · legacy v0.1",
        retired: true,
        filename: LEGACY_H3_TURBO_LORA_FILENAME,
        strength: 0.75,
        modelFamily: "minimax-h3",
        compatibleModelIds: [H3_FL2VA_MODEL_ID],
        compatibleInputModes: ["image"],
        purpose: "performance",
        promptPrefixes: [],
        catalogOrder: 1,
        variant: "turbo",
        rules: {
            orderPriority: 10,
            settingConflicts: [],
            combinations: [],
            workflowRequirement: "h3-turbo-sampling"
        },
        scan: {
            vram: "LoRA · legacy v0.1 · 4–8 steps · strength 0.75",
            integrated: true,
            components: [{
                    label: "MiniMax H3 LightX2V Turbo legacy v0.1 LoRA",
                    expected: `loras/${LEGACY_H3_TURBO_LORA_FILENAME}`,
                    patterns: [/loras\/minimax_h3_fl2v_lightx2v_turbo_4step_v0\.1_comfy_resized_avg_rank_21_bf16\.safetensors$/i],
                    installGuide: {
                        sourceLabel: "LightX2V / Kijai ComfyUI conversion",
                        downloadUrl: `https://huggingface.co/Kijai/MiniMax-H3_comfy/resolve/main/loras/${LEGACY_H3_TURBO_LORA_FILENAME}`,
                        targetSubdirectory: "loras",
                        recommendedFilename: LEGACY_H3_TURBO_LORA_FILENAME,
                        notes: "旧版 v0.1，仅保留用于读取旧队列/历史记录；新任务请使用官方 v1.1 768p 4 步版本。"
                    }
                }]
        }
    }, {
        id: H3_TURBO_8STEP_V1_LORA_ID,
        name: "LightX2V Turbo 8-Step v1.0",
        filename: H3_TURBO_8STEP_V1_LORA_FILENAME,
        strength: 0.75,
        modelFamily: "minimax-h3",
        compatibleModelIds: [H3_FL2VA_MODEL_ID],
        compatibleInputModes: ["image"],
        purpose: "performance",
        promptPrefixes: [],
        catalogOrder: 117,
        variant: "turbo",
        rules: {
            orderPriority: 10,
            settingConflicts: [],
            combinations: [],
            workflowRequirement: "h3-turbo-sampling"
        },
        scan: {
            vram: "LoRA · v1.0 · 8 steps · strength 0.75",
            integrated: true,
            components: [{
                    label: "MiniMax H3 LightX2V Turbo 8-Step v1.0 LoRA",
                    expected: `loras/${H3_TURBO_8STEP_V1_LORA_FILENAME}`,
                    patterns: [/loras\/minimax_h3_fl2v_turbo_8step_v1\.0_comfyui_bf16\.safetensors$/i],
                    installGuide: {
                        sourceLabel: "LightX2V / Minimax-h3-Turbo",
                        downloadUrl: `https://huggingface.co/lightx2v/Minimax-h3-Turbo/resolve/main/${H3_TURBO_8STEP_V1_LORA_FILENAME}`,
                        targetSubdirectory: "loras",
                        recommendedFilename: H3_TURBO_8STEP_V1_LORA_FILENAME,
                        notes: "官方 v1.0 FL2VA 8 步权重。目前没有对应的 8-step v1.1；保留作为 8 步质量与音频稳定性备选。综合首选使用 v4，极速 4 步使用 v1.1 或 Turbo-SLA。不要与其他 Turbo 变体叠加。"
                    }
                }]
        }
    }, {
        id: H3_TURBO_768P_V1_LORA_ID,
        name: "LightX2V Turbo 4-Step v1.0 · 768p",
        retired: true,
        filename: H3_TURBO_768P_V1_LORA_FILENAME,
        strength: 0.75,
        modelFamily: "minimax-h3",
        compatibleModelIds: [H3_FL2VA_MODEL_ID],
        compatibleInputModes: ["image"],
        purpose: "performance",
        promptPrefixes: [],
        catalogOrder: 109,
        variant: "turbo",
        rules: {
            orderPriority: 10,
            settingConflicts: [],
            combinations: [],
            workflowRequirement: "h3-turbo-sampling"
        },
        scan: {
            vram: "LoRA · v1.0 · 4 steps · 768p · strength 0.75",
            integrated: true,
            components: [{
                    label: "MiniMax H3 LightX2V Turbo 4-Step v1.0 768p LoRA",
                    expected: `loras/${H3_TURBO_768P_V1_LORA_FILENAME}`,
                    patterns: [/loras\/minimax_h3_fl2v_turbo_4step_v1\.0_768p_comfyui_bf16\.safetensors$/i],
                    installGuide: {
                        sourceLabel: "LightX2V / Minimax-h3-Turbo",
                        downloadUrl: `https://huggingface.co/lightx2v/Minimax-h3-Turbo/resolve/main/${H3_TURBO_768P_V1_LORA_FILENAME}`,
                        targetSubdirectory: "loras",
                        recommendedFilename: H3_TURBO_768P_V1_LORA_FILENAME,
                        notes: "已由官方 v1.1 768p 4 步版本替代；仅保留用于读取旧队列/历史记录。新任务请改用 v1.1。"
                    }
                }]
        }
    }, {
        id: H3_REF2V_TURBO_LORA_ID,
        name: "LightX2V Ref2V Turbo 4-Step v0.1",
        filename: H3_REF2V_TURBO_LORA_FILENAME,
        strength: 0.75,
        modelFamily: "minimax-h3",
        compatibleModelIds: ["minimax_h3_ref2va", "minimax_h3_ref2va_int4"],
        compatibleInputModes: ["image"],
        purpose: "performance",
        promptPrefixes: [],
        catalogOrder: 115,
        variant: "turbo",
        rules: {
            orderPriority: 10,
            settingConflicts: [],
            combinations: [],
            workflowRequirement: "h3-turbo-sampling"
        },
        scan: {
            vram: "LoRA · Ref2VA · v0.1 · 4 steps · strength 0.75",
            integrated: true,
            components: [{
                    label: "MiniMax H3 Ref2V Turbo 4-Step v0.1 LoRA",
                    expected: `loras/${H3_REF2V_TURBO_LORA_FILENAME}`,
                    patterns: [/loras\/minimax_h3_ref2v_turbo_4step_v0\.1_comfyui_bf16\.safetensors$/i],
                    installGuide: {
                        sourceLabel: "LightX2V / Minimax-h3-Turbo",
                        downloadUrl: `https://huggingface.co/lightx2v/Minimax-h3-Turbo/resolve/main/${H3_REF2V_TURBO_LORA_FILENAME}`,
                        targetSubdirectory: "loras",
                        recommendedFilename: H3_REF2V_TURBO_LORA_FILENAME,
                        notes: "官方 Ref2VA Turbo 4 步版本，仅用于 R2V 多参考图路径，不适用于 FL2VA 首帧流程。"
                    }
                }]
        }
    }, {
        id: H3_AFTER_MIDNIGHT_LORA_ID,
        name: "AfterMidnight NSFW · Ref2VA v1.2",
        filename: H3_AFTER_MIDNIGHT_LORA_FILENAME,
        strength: 1,
        modelFamily: "minimax-h3",
        compatibleModelIds: ["minimax_h3_ref2va"],
        compatibleInputModes: ["image"],
        purpose: "content",
        promptPrefixes: [],
        catalogOrder: 97,
        rules: {
            orderPriority: 50,
            settingConflicts: [],
            combinations: [{
                    loraId: H3_REF2V_TURBO_LORA_ID,
                    severity: "warning",
                    localeKey: "afterMidnightTurbo"
                }]
        },
        scan: {
            vram: "Ref2VA NSFW · rank 64 · v1.2 · strength 1.0",
            integrated: true,
            components: [{
                    label: "AfterMidnight MiniMax H3 Ref2VA NSFW LoRA v1.2",
                    expected: `loras/${H3_AFTER_MIDNIGHT_LORA_FILENAME}`,
                    patterns: [/loras\/AfterMidnight_ref2va_h3_sexytime_rank64-v1\.2\.safetensors$/i],
                    installGuide: {
                        sourceLabel: "SexGod1979 / AfterMidnight-MiniMax-H3-NSFW",
                        downloadUrl: `https://huggingface.co/SexGod1979/AfterMidnight-MiniMax-H3-NSFW/resolve/main/${H3_AFTER_MIDNIGHT_LORA_FILENAME}?download=true`,
                        targetSubdirectory: "loras",
                        recommendedFilename: H3_AFTER_MIDNIGHT_LORA_FILENAME,
                        notes: "当前确认的 Ref2VA NSFW v1.2 权重；建议强度 1.0，并使用 Euler + Beta。仅适用于 R2V，多参考图工作流不能直接移植到 FL2VA。"
                    }
                }]
        }
    }, {
        id: H3_FACIAL_REALISM_CLOSEUP_LORA_ID,
        name: "MiniMax H3 Facial Realism CloseUp",
        filename: H3_FACIAL_REALISM_CLOSEUP_LORA_FILENAME,
        strength: 0.8,
        modelFamily: "minimax-h3",
        compatibleModelIds: [H3_FL2VA_MODEL_ID],
        compatibleInputModes: ["image"],
        purpose: "quality",
        promptPrefixes: ["Facial Realism"],
        catalogOrder: 96,
        variant: "fl2va",
        rules: {
            orderPriority: 40,
            settingConflicts: [],
            combinations: [{
                    loraId: H3_TURBO_LORA_ID,
                    severity: "warning",
                    localeKey: "facialRealismTurbo"
                }, {
                    loraId: H3_REALISM_PEOPLE_LORA_ID,
                    severity: "warning",
                    localeKey: "facialRealismPeople"
                }]
        },
        scan: {
            vram: "LoRA · rank 16 · 2000 steps · strength 0.8 · trigger Facial Realism",
            integrated: true,
            components: [{
                    label: "MiniMax H3 Facial Realism CloseUp LoRA",
                    expected: `loras/${H3_FACIAL_REALISM_CLOSEUP_LORA_FILENAME}`,
                    patterns: [/loras\/minimax-h3-facial-realism-closeup-cp2000\.safetensors$/i],
                    installGuide: {
                        sourceLabel: "prithivMLmods / MiniMax-H3-Facial-Realism-CloseUp",
                        downloadUrl: `https://huggingface.co/prithivMLmods/MiniMax-H3-Facial-Realism-CloseUp/resolve/main/${H3_FACIAL_REALISM_CLOSEUP_LORA_FILENAME}?download=true`,
                        targetSubdirectory: "loras",
                        recommendedFilename: H3_FACIAL_REALISM_CLOSEUP_LORA_FILENAME,
                        notes: "实验性人脸写实特写 LoRA；触发词 Facial Realism。作者推荐 checkpoint 1800/2000，当前仓库提供 cp2000；未提供固定强度，应用默认 0.8，建议先做同 Seed 对照。"
                    }
                }]
        }
    }, {
        id: H3_REALISM_PEOPLE_LORA_ID,
        name: "MiniMax H3 Realism People",
        filename: H3_REALISM_PEOPLE_LORA_FILENAME,
        strength: 0.8,
        modelFamily: "minimax-h3",
        compatibleModelIds: [H3_FL2VA_MODEL_ID, "minimax_h3_ref2va"],
        compatibleInputModes: ["image"],
        purpose: "quality",
        promptPrefixes: ["r34l1sm"],
        catalogOrder: 95,
        rules: {
            orderPriority: 40,
            settingConflicts: [],
            combinations: [{
                    loraId: H3_TURBO_LORA_ID,
                    severity: "warning",
                    localeKey: "realismTurbo"
                }, {
                    loraId: H3_AFTER_MIDNIGHT_LORA_ID,
                    severity: "warning",
                    localeKey: "realismAfterMidnight"
                }]
        },
        scan: {
            vram: "rank 32 · strength 0.8 · trigger r34l1sm",
            integrated: true,
            components: [{
                    label: "MiniMax H3 Realism People LoRA",
                    expected: `loras/${H3_REALISM_PEOPLE_LORA_FILENAME}`,
                    patterns: [/loras\/h3-realism-people-t2v-i2v-r2v\.safetensors$/i],
                    installGuide: {
                        sourceLabel: "fal / MiniMax-H3-Realism-People-LoRA",
                        downloadUrl: `https://huggingface.co/fal/MiniMax-H3-Realism-People-LoRA/resolve/main/${H3_REALISM_PEOPLE_LORA_FILENAME}?download=true`,
                        targetSubdirectory: "loras",
                        recommendedFilename: H3_REALISM_PEOPLE_LORA_FILENAME,
                        notes: "MiniMax H3 人物写实 LoRA。执行 Prompt 会自动加入触发词 r34l1sm；默认强度 0.8，作者 intended strength 为 1.0。"
                    }
                }]
        }
    }, {
        id: H3_PINK_FLUFFY_BUNNY_LORA_ID,
        name: "PinkFluffyBunny NSFW",
        retired: true,
        filename: H3_PINK_FLUFFY_BUNNY_LORA_FILENAME,
        strength: 0.5,
        modelFamily: "minimax-h3",
        compatibleModelIds: [H3_FL2VA_MODEL_ID],
        compatibleInputModes: ["image"],
        purpose: "content",
        promptPrefixes: [],
        catalogOrder: 90,
        rules: {
            orderPriority: 50,
            settingConflicts: [],
            combinations: [{
                    loraId: H3_TURBO_LORA_ID,
                    severity: "warning",
                    localeKey: "pinkTurbo"
                }]
        },
        scan: {
            vram: "pruned v1 · rank 128 · strength 0.5",
            integrated: true,
            components: [{
                    label: "PinkFluffyBunny NSFW LoRA",
                    expected: `loras/${H3_PINK_FLUFFY_BUNNY_LORA_FILENAME}`,
                    patterns: [/loras\/PinkFluffyBunny-pruned-v1-rank128\.safetensors$/i],
                    installGuide: {
                        sourceLabel: "SexGod1979 / PinkFluffyBunny-MiniMax-H3",
                        downloadUrl: `https://huggingface.co/SexGod1979/PinkFluffyBunny-MiniMax-H3/resolve/main/${H3_PINK_FLUFFY_BUNNY_LORA_FILENAME}?download=true`,
                        targetSubdirectory: "loras",
                        recommendedFilename: H3_PINK_FLUFFY_BUNNY_LORA_FILENAME
                    }
                }]
        }
    }];
