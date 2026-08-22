export const H3_TURBO_LORA_ID = "minimax-h3-lightx2v-turbo-4step";
export const LEGACY_H3_TURBO_MODEL_ID = "minimax_h3_fl2va_turbo";
export const LEGACY_H3_REF2V_TURBO_MODEL_ID = "minimax_h3_ref2va_turbo";
export const H3_FL2VA_MODEL_ID = "minimax_h3_fl2va";
export const H3_TURBO_LORA_FILENAME = "minimax_h3_fl2v_lightx2v_turbo_4step_v0.1_comfy_resized_avg_rank_21_bf16.safetensors";
export const H3_TURBO_8STEP_V1_LORA_ID = "minimax-h3-lightx2v-turbo-8step-v1";
export const H3_TURBO_8STEP_V1_LORA_FILENAME = "minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors";
export const H3_TURBO_768P_V1_LORA_ID = "minimax-h3-lightx2v-turbo-4step-768p-v1";
export const H3_TURBO_768P_V1_LORA_FILENAME = "minimax_h3_fl2v_turbo_4step_v1.0_768p_comfyui_bf16.safetensors";
export const H3_REF2V_TURBO_LORA_ID = "minimax-h3-ref2v-turbo-4step-v01";
export const H3_REF2V_TURBO_LORA_FILENAME = "minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors";
export const H3_TURBO_LORA_IDS = [
    H3_TURBO_LORA_ID,
    H3_TURBO_8STEP_V1_LORA_ID,
    H3_TURBO_768P_V1_LORA_ID,
    H3_REF2V_TURBO_LORA_ID
];
export const H3_PINK_FLUFFY_BUNNY_LORA_ID = "minimax-h3-pink-fluffy-bunny-nsfw";
export const H3_PINK_FLUFFY_BUNNY_LORA_FILENAME = "PinkFluffyBunny-pruned-v1-rank128.safetensors";
export const H3_REALISM_PEOPLE_LORA_ID = "minimax-h3-realism-people";
export const H3_REALISM_PEOPLE_LORA_FILENAME = "h3-realism-people-t2v-i2v-r2v.safetensors";
export const VIDEO_LORA_DEFINITIONS = [{
        id: H3_TURBO_LORA_ID,
        name: "LightX2V Turbo 4-Step",
        filename: H3_TURBO_LORA_FILENAME,
        strength: 0.75,
        modelFamily: "minimax-h3",
        compatibleModelIds: [H3_FL2VA_MODEL_ID],
        compatibleInputModes: ["image"],
        purpose: "performance",
        promptPrefixes: [],
        catalogOrder: 100,
        variant: "turbo",
        rules: {
            orderPriority: 10,
            settingConflicts: [],
            combinations: [],
            workflowRequirement: "h3-turbo-sampling"
        },
        scan: {
            vram: "LoRA · strength 0.75 · 4–8 steps",
            integrated: true,
            components: [{
                    label: "MiniMax H3 LightX2V Turbo LoRA",
                    expected: `loras/${H3_TURBO_LORA_FILENAME}`,
                    patterns: [/loras\/minimax_h3_fl2v_lightx2v_turbo_4step_v0\.1_comfy_resized_avg_rank_21_bf16\.safetensors$/i],
                    installGuide: {
                        sourceLabel: "LightX2V / Kijai ComfyUI conversion",
                        downloadUrl: `https://huggingface.co/Kijai/MiniMax-H3_comfy/resolve/main/loras/${H3_TURBO_LORA_FILENAME}`,
                        targetSubdirectory: "loras",
                        recommendedFilename: H3_TURBO_LORA_FILENAME
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
        catalogOrder: 110,
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
                        notes: "官方 v1.0 FL2VA Turbo。默认 8 步；与 4-step 768p 版本分别测试，不要同时叠加。"
                    }
                }]
        }
    }, {
        id: H3_TURBO_768P_V1_LORA_ID,
        name: "LightX2V Turbo 4-Step v1.0 · 768p",
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
                        notes: "官方 v1.0 768p 4 步版本。优先用于 768p；低于 768p 仍建议与 8-step v1.0 做对照。"
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
        catalogOrder: 108,
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
                    loraId: H3_PINK_FLUFFY_BUNNY_LORA_ID,
                    severity: "warning",
                    localeKey: "realismPink"
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
