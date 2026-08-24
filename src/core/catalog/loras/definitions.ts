import type { VideoLoraSelection } from "../../../types.js";
import type { CatalogModelScanDefinition, CatalogModelVariant } from "../types.js";

export type VideoLoraSettingKey = "spectrumMode" | "attentionMode";

export interface VideoLoraSettingConflict {
  setting: VideoLoraSettingKey;
  values: string[];
  severity: "error" | "warning";
  localeKey?: string;
  message?: string;
}

export interface VideoLoraCombinationRule {
  loraId: string;
  severity: "error" | "warning";
  localeKey?: string;
  message?: string;
}

export interface VideoLoraRules {
  orderPriority: number;
  settingConflicts: VideoLoraSettingConflict[];
  combinations: VideoLoraCombinationRule[];
  workflowRequirement?: "h3-turbo-sampling";
}

export interface CatalogVideoLoraDefinition extends VideoLoraSelection {
  catalogOrder: number;
  retired?: boolean;
  variant?: CatalogModelVariant;
  rules: VideoLoraRules;
  scan: CatalogModelScanDefinition;
}

/** The current default FL2VA Turbo adapter. */
export const H3_TURBO_LORA_ID = "minimax-h3-lightx2v-turbo-4step-768p-v1.1";
export const LEGACY_H3_TURBO_MODEL_ID = "minimax_h3_fl2va_turbo";
export const LEGACY_H3_REF2V_TURBO_MODEL_ID = "minimax_h3_ref2va_turbo";
export const H3_FL2VA_MODEL_ID = "minimax_h3_fl2va";
export const H3_TURBO_LORA_FILENAME =
  "minimax_h3_fl2v_turbo_4step_v1.1_768p_comfyui_bf16.safetensors";
export const H3_CAMERA_MOTION_LORA_ID = "minimax-h3-camera-motion-v1";
export const H3_CAMERA_MOTION_LORA_FILENAME =
  "camera_motion_h3_lora_v1_3000_pruned.safetensors";
export const LEGACY_H3_TURBO_LORA_ID = "minimax-h3-lightx2v-turbo-4step";
export const LEGACY_H3_TURBO_LORA_FILENAME =
  "minimax_h3_fl2v_lightx2v_turbo_4step_v0.1_comfy_resized_avg_rank_21_bf16.safetensors";
export const H3_TURBO_8STEP_V1_LORA_ID = "minimax-h3-lightx2v-turbo-8step-v1";
export const H3_TURBO_8STEP_V1_LORA_FILENAME =
  "minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors";
export const H3_TURBO_768P_V1_LORA_ID = "minimax-h3-lightx2v-turbo-4step-768p-v1";
export const H3_TURBO_768P_V1_LORA_FILENAME =
  "minimax_h3_fl2v_turbo_4step_v1.0_768p_comfyui_bf16.safetensors";
export const H3_REF2V_TURBO_LORA_ID = "minimax-h3-ref2v-turbo-4step-v01";
export const H3_REF2V_TURBO_LORA_FILENAME =
  "minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors";
export const H3_AFTER_MIDNIGHT_LORA_ID = "minimax-h3-after-midnight-ref2va-nsfw";
export const H3_AFTER_MIDNIGHT_LORA_FILENAME =
  "AfterMidnight_ref2va_h3_sexytime_rank64-v1.2.safetensors";
export const H3_TURBO_LORA_IDS = [
  H3_TURBO_LORA_ID,
  H3_TURBO_8STEP_V1_LORA_ID,
  H3_REF2V_TURBO_LORA_ID
] as const;
export const H3_PINK_FLUFFY_BUNNY_LORA_ID = "minimax-h3-pink-fluffy-bunny-nsfw";
export const H3_PINK_FLUFFY_BUNNY_LORA_FILENAME =
  "PinkFluffyBunny-pruned-v1-rank128.safetensors";
export const H3_REALISM_PEOPLE_LORA_ID = "minimax-h3-realism-people";
export const H3_REALISM_PEOPLE_LORA_FILENAME =
  "h3-realism-people-t2v-i2v-r2v.safetensors";

export const VIDEO_LORA_DEFINITIONS: readonly CatalogVideoLoraDefinition[] = [{
  id: H3_TURBO_LORA_ID,
  name: "LightX2V Turbo 4-Step v1.1 · 768p",
  filename: H3_TURBO_LORA_FILENAME,
  strength: 1,
  modelFamily: "minimax-h3",
  compatibleModelIds: [H3_FL2VA_MODEL_ID],
  compatibleInputModes: ["image"],
  purpose: "performance",
  promptPrefixes: [],
  catalogOrder: 112,
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
  id: H3_CAMERA_MOTION_LORA_ID,
  name: "MiniMax H3 Camera Motion v1",
  filename: H3_CAMERA_MOTION_LORA_FILENAME,
  strength: 0.8,
  modelFamily: "minimax-h3",
  compatibleModelIds: [H3_FL2VA_MODEL_ID],
  compatibleInputModes: ["image"],
  purpose: "motion",
  promptPrefixes: ["camera motion"],
  catalogOrder: 111,
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
