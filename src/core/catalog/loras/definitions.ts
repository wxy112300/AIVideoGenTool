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
  workflowRequirement?: "h3-turbo-sampling" | "h3-pdd-sampling";
}

export interface CatalogVideoLoraDefinition extends VideoLoraSelection {
  catalogOrder: number;
  retired?: boolean;
  variant?: CatalogModelVariant;
  rules: VideoLoraRules;
  scan: CatalogModelScanDefinition;
}

/** The current default FL2VA Turbo adapter. */
export const H3_TURBO_LORA_ID = "minimax-h3-lightx2v-turbo-4step-768p-v1.2";
export const LEGACY_H3_TURBO_MODEL_ID = "minimax_h3_fl2va_turbo";
export const LEGACY_H3_REF2V_TURBO_MODEL_ID = "minimax_h3_ref2va_turbo";
export const H3_FL2VA_MODEL_ID = "minimax_h3_fl2va";
export const H3_TURBO_LORA_FILENAME =
  "minimax_h3_fl2v_turbo_4step_v1.2_768p_comfyui_bf16.safetensors";
export const H3_SLA_TURBO_LORA_ID = "minimax-h3-turbo-sla-4step";
export const H3_SLA_TURBO_LORA_FILENAME =
  "minimax_h3_fl2v_turbo_4step_v0.1_768p_sla_comfyui_bf16.safetensors";
export const H3_CAMERA_MOTION_LORA_ID = "minimax-h3-camera-motion-v1";
export const H3_CAMERA_MOTION_LORA_FILENAME =
  "camera_motion_h3_lora_v1_3000_pruned.safetensors";
export const H3_CINEMATIC_REALISM_LORA_ID = "minimax-h3-cinematic-realism";
export const H3_CINEMATIC_REALISM_LORA_FILENAME =
  "Minimax H3真实电影质感V0.1.safetensors";
export const H3_CINEMATIC_REALISM_LORA_REVISION = "05c48f1";
export const H3_BETTER_HUMAN_MOTION_LORA_ID = "minimax-h3-better-human-motion";
export const H3_BETTER_HUMAN_MOTION_LORA_FILENAME =
  "better_motion_h3_lora_v1_500.safetensors";
export const H3_BETTER_HUMAN_MOTION_LORA_REVISION = "11229b6";
export const H3_EQUI360_LORA_ID = "minimax-h3-equi360";
export const H3_EQUI360_LORA_FILENAME = "h3-equi360-reviewed-v2-step2500.safetensors";
export const H3_EQUI360_LORA_REVISION = "main";
export const H3_VR180_SBS_LORA_ID = "minimax-h3-vr180-sbs";
export const H3_VR180_SBS_LORA_FILENAME = "h3-vr180-sbs-lora-v2.safetensors";
export const H3_VR180_SBS_LORA_REVISION = "b2c4323";
export const H3_TURBO_V4_LORA_ID = "minimax-h3-turbo-v4-step600-ema-pruned";
export const H3_TURBO_V4_LORA_FILENAME =
  "minimax_h3_turbo_v4_step600_ema_pruned_comfyui.safetensors";
export const H3_TURBO_8STEP_V1_LORA_ID = "minimax-h3-lightx2v-turbo-8step-v1";
export const H3_TURBO_8STEP_V1_LORA_FILENAME =
  "minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors";
export const H3_REF2V_TURBO_LORA_ID = "minimax-h3-ref2v-turbo-4step-v01";
export const H3_REF2V_TURBO_LORA_FILENAME =
  "minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors";
export const H3_PDD_COMFY_REVISION = "f94b1bcc9442e531b73e0ee819ddfc3656072648";
export const H3_PDD_FL2VA_LORA_ID = "h3-pdd-fl2va-8step";
export const H3_PDD_FL2VA_LORA_FILENAME =
  "MiniMax-H3-FL2VA-Acc-8Step_pruned_comfy.safetensors";
export const H3_PDD_REF2VA_LORA_ID = "h3-pdd-ref2va-8step";
export const H3_PDD_REF2VA_LORA_FILENAME =
  "MiniMax-H3-Ref2VA-Acc-8Step_pruned_comfy.safetensors";
export const H3_PDD_LORA_IDS = [
  H3_PDD_FL2VA_LORA_ID,
  H3_PDD_REF2VA_LORA_ID
] as const;
export const H3_AFTER_MIDNIGHT_LORA_ID = "minimax-h3-after-midnight-ref2va-nsfw";
export const H3_AFTER_MIDNIGHT_LORA_FILENAME =
  "AfterMidnight_ref2va_h3_sexytime_rank64-v1.2.safetensors";
export const H3_TURBO_LORA_IDS = [
  H3_TURBO_V4_LORA_ID,
  H3_SLA_TURBO_LORA_ID,
  H3_TURBO_LORA_ID,
  H3_TURBO_8STEP_V1_LORA_ID,
  H3_REF2V_TURBO_LORA_ID
] as const;
export const H3_REALISM_PEOPLE_LORA_ID = "minimax-h3-realism-people";
export const H3_REALISM_PEOPLE_LORA_FILENAME =
  "h3-realism-people-t2v-i2v-r2v.safetensors";
export const H3_FACIAL_REALISM_CLOSEUP_LORA_ID = "minimax-h3-facial-realism-closeup";
export const H3_FACIAL_REALISM_CLOSEUP_LORA_FILENAME =
  "minimax-h3-facial-realism-closeup-cp2000.safetensors";

const h3PddTurboCombinationRules = (): VideoLoraCombinationRule[] =>
  H3_TURBO_LORA_IDS.map((loraId) => ({
    loraId,
    severity: "error",
    localeKey: "pddTurbo"
  }));

export const VIDEO_LORA_DEFINITIONS: readonly CatalogVideoLoraDefinition[] = [{
  id: H3_PDD_FL2VA_LORA_ID,
  name: "MiniMax H3 PDD FL2VA · 8-step",
  filename: H3_PDD_FL2VA_LORA_FILENAME,
  strength: 1,
  modelFamily: "minimax-h3",
  compatibleModelIds: [H3_FL2VA_MODEL_ID],
  compatibleInputModes: ["image"],
  purpose: "performance",
  promptPrefixes: [],
  catalogOrder: 122,
  variant: "turbo",
  rules: {
    orderPriority: 5,
    settingConflicts: [],
    combinations: h3PddTurboCombinationRules(),
    workflowRequirement: "h3-pdd-sampling"
  },
  scan: {
    vram: "LoRA · PDD output head bank · 8 steps · pruned INT8 ConvRot only · strength 1.0",
    integrated: true,
    runtimeNodeTypes: ["LoraLoaderModelOnly", "MiniMaxH3SigmaShift", "ModelAttentionBackend"],
    components: [{
      label: "MiniMax H3 FL2VA PDD Acc 8-Step · pruned ComfyUI LoRA",
      expected: `loras/${H3_PDD_FL2VA_LORA_FILENAME}`,
      patterns: [/loras\/MiniMax-H3-FL2VA-Acc-8Step_pruned_comfy\.safetensors$/i],
      installGuide: {
        sourceLabel: "Kijai / MiniMax-H3-experimental",
        downloadUrl: `https://huggingface.co/Kijai/MiniMax-H3-experimental/resolve/${H3_PDD_COMFY_REVISION}/loras/${H3_PDD_FL2VA_LORA_FILENAME}?download=true`,
        targetSubdirectory: "loras",
        recommendedFilename: H3_PDD_FL2VA_LORA_FILENAME,
        revision: H3_PDD_COMFY_REVISION,
        bytes: 1725921392,
        sha256: "e97b813a6f857b9dab310f31ec30a8334f63a3e7dcb5d07c0c91933d3447a897",
        license: "Apache-2.0",
        notes: "ComfyUI 0.35 原生 PDD head-bank LoRA；使用普通 LoraLoaderModelOnly，不需要 H3-Optimizations 或其他自定义 PDD 节点。应用会固定 8 步、Euler、Simple、video shift 12、audio shift 3 和 CFG 1.0。当前只接受与 pruned INT8 ConvRot FL2VA 基座配套的 pruned 文件；同目录的非 pruned 文件不作为本条目的可用替代，避免基座错配。不要与任何 Turbo LoRA 叠加。"
      }
    }]
  }
}, {
  id: H3_PDD_REF2VA_LORA_ID,
  name: "MiniMax H3 PDD Ref2VA · 8-step",
  filename: H3_PDD_REF2VA_LORA_FILENAME,
  strength: 1,
  modelFamily: "minimax-h3",
  compatibleModelIds: ["minimax_h3_ref2va"],
  compatibleInputModes: ["image"],
  purpose: "performance",
  promptPrefixes: [],
  catalogOrder: 121,
  variant: "turbo",
  rules: {
    orderPriority: 5,
    settingConflicts: [],
    combinations: h3PddTurboCombinationRules(),
    workflowRequirement: "h3-pdd-sampling"
  },
  scan: {
    vram: "LoRA · PDD output head bank · 8 steps · pruned INT8 ConvRot only · strength 1.0",
    integrated: true,
    runtimeNodeTypes: ["LoraLoaderModelOnly", "MiniMaxH3SigmaShift", "ModelAttentionBackend"],
    components: [{
      label: "MiniMax H3 Ref2VA PDD Acc 8-Step · pruned ComfyUI LoRA",
      expected: `loras/${H3_PDD_REF2VA_LORA_FILENAME}`,
      patterns: [/loras\/MiniMax-H3-Ref2VA-Acc-8Step_pruned_comfy\.safetensors$/i],
      installGuide: {
        sourceLabel: "Kijai / MiniMax-H3-experimental",
        downloadUrl: `https://huggingface.co/Kijai/MiniMax-H3-experimental/resolve/${H3_PDD_COMFY_REVISION}/loras/${H3_PDD_REF2VA_LORA_FILENAME}?download=true`,
        targetSubdirectory: "loras",
        recommendedFilename: H3_PDD_REF2VA_LORA_FILENAME,
        revision: H3_PDD_COMFY_REVISION,
        bytes: 1725921392,
        sha256: "6f18e1c2eccb14b37322607730f26b16bf1169b56cd098ea006cffaec43d1e39",
        license: "Apache-2.0",
        notes: "ComfyUI 0.35 原生 PDD head-bank LoRA；使用普通 LoraLoaderModelOnly，不需要 H3-Optimizations 或其他自定义 PDD 节点。应用会固定 8 步、Euler、Simple、video shift 12、audio shift 3 和 CFG 1.0。当前只接受与 pruned INT8 ConvRot Ref2VA 基座配套的 pruned 文件；同目录的非 pruned 文件不作为本条目的可用替代，避免基座错配。不要与任何 Turbo LoRA 叠加。"
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
  name: "LightX2V Turbo 4-Step v1.2 · 768p",
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
    vram: "LoRA · v1.2 · 4 steps · 768p · strength 1.0",
    integrated: true,
    components: [{
      label: "MiniMax H3 LightX2V Turbo 4-Step v1.2 768p LoRA",
      expected: `loras/${H3_TURBO_LORA_FILENAME}`,
      patterns: [/loras\/minimax_h3_fl2v_turbo_4step_v1\.2_768p_comfyui_bf16\.safetensors$/i],
      installGuide: {
        sourceLabel: "LightX2V / Minimax-h3-Turbo",
        downloadUrl: `https://huggingface.co/lightx2v/Minimax-h3-Turbo/resolve/main/${H3_TURBO_LORA_FILENAME}`,
        targetSubdirectory: "loras",
        recommendedFilename: H3_TURBO_LORA_FILENAME,
        notes: "官方当前 FL2VA v1.2 4 步 768p 权重。使用 video shift 6、audio shift 3、Euler；不要与其他 Turbo LoRA 同时叠加。"
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
  id: H3_CINEMATIC_REALISM_LORA_ID,
  name: "MiniMax H3 Cinematic Realism",
  filename: H3_CINEMATIC_REALISM_LORA_FILENAME,
  strength: 0.5,
  modelFamily: "minimax-h3",
  compatibleModelIds: [H3_FL2VA_MODEL_ID],
  compatibleInputModes: ["image"],
  purpose: "style",
  promptPrefixes: ["DY"],
  catalogOrder: 101,
  variant: "fl2va",
  rules: {
    orderPriority: 30,
    settingConflicts: [],
    combinations: [{
      loraId: H3_TURBO_LORA_ID,
      severity: "warning",
      localeKey: "cinematicRealismTurbo"
    }, {
      loraId: H3_CAMERA_MOTION_LORA_ID,
      severity: "warning",
      localeKey: "cinematicRealismCameraMotion"
    }, {
      loraId: H3_BETTER_HUMAN_MOTION_LORA_ID,
      severity: "warning",
      localeKey: "cinematicRealismBetterMotion"
    }, {
      loraId: H3_REALISM_PEOPLE_LORA_ID,
      severity: "warning",
      localeKey: "cinematicRealismPeople"
    }]
  },
  scan: {
    vram: "LoRA · cinematic realism · v0.1 · strength 0.5 · trigger DY",
    integrated: true,
    components: [{
      label: "MiniMax H3 Cinematic Realism LoRA v0.1",
      expected: `loras/${H3_CINEMATIC_REALISM_LORA_FILENAME}`,
      patterns: [/loras\/Minimax H3真实电影质感V0\.1\.safetensors$/i],
      installGuide: {
        sourceLabel: "orangesouth / MinimaxH3CinematicRealism",
        downloadUrl: `https://huggingface.co/orangesouth/MinimaxH3CinematicRealism/resolve/${H3_CINEMATIC_REALISM_LORA_REVISION}/Minimax%20H3%E7%9C%9F%E5%AE%9E%E7%94%B5%E5%BD%B1%E8%B4%A8%E6%84%9FV0.1.safetensors?download=true`,
        targetSubdirectory: "loras",
        recommendedFilename: H3_CINEMATIC_REALISM_LORA_FILENAME,
        revision: H3_CINEMATIC_REALISM_LORA_REVISION,
        notes: "社区电影质感 LoRA；触发词 DY。源仓库建议强度 0.7，高动态片段建议降到 0.5；应用默认 0.5 以减少风格过重和 warping。当前仅开放 H3 FL2VA pruned INT8 ConvRot 图生视频；源仓库附带的第三方节点画布不纳入应用工作流。"
      }
    }]
  }
}, {
  id: H3_BETTER_HUMAN_MOTION_LORA_ID,
  name: "MiniMax H3 Better Human Motion",
  filename: H3_BETTER_HUMAN_MOTION_LORA_FILENAME,
  strength: 0.4,
  modelFamily: "minimax-h3",
  compatibleModelIds: [H3_FL2VA_MODEL_ID],
  compatibleInputModes: ["image"],
  purpose: "motion",
  promptPrefixes: [],
  catalogOrder: 100,
  variant: "fl2va",
  rules: {
    orderPriority: 20,
    settingConflicts: [],
    combinations: [{
      loraId: H3_TURBO_LORA_ID,
      severity: "warning",
      localeKey: "betterHumanMotionTurbo"
    }, {
      loraId: H3_CAMERA_MOTION_LORA_ID,
      severity: "warning",
      localeKey: "betterHumanMotionCameraMotion"
    }, {
      loraId: H3_CINEMATIC_REALISM_LORA_ID,
      severity: "warning",
      localeKey: "betterHumanMotionCinematicRealism"
    }, {
      loraId: H3_REALISM_PEOPLE_LORA_ID,
      severity: "warning",
      localeKey: "betterHumanMotionPeople"
    }]
  },
  scan: {
    vram: "LoRA · better human motion · v1 step500 · strength 0.4",
    integrated: true,
    components: [{
      label: "MiniMax H3 Better Human Motion LoRA v1 step500",
      expected: `loras/${H3_BETTER_HUMAN_MOTION_LORA_FILENAME}`,
      patterns: [/loras\/better_motion_h3_lora_v1_500\.safetensors$/i],
      installGuide: {
        sourceLabel: "vpakarinen / better-human-motion-h3-lora",
        downloadUrl: `https://huggingface.co/vpakarinen/better-human-motion-h3-lora/resolve/${H3_BETTER_HUMAN_MOTION_LORA_REVISION}/${H3_BETTER_HUMAN_MOTION_LORA_FILENAME}?download=true`,
        targetSubdirectory: "loras",
        recommendedFilename: H3_BETTER_HUMAN_MOTION_LORA_FILENAME,
        revision: H3_BETTER_HUMAN_MOTION_LORA_REVISION,
        license: "Apache-2.0",
        notes: "Better Human Motion H3 LoRA；模型卡建议强度 0.4–0.8、15–30 步；应用默认 0.4，先用同 Seed 对照。当前仅开放 H3 FL2VA pruned INT8 ConvRot 图生视频。"
      }
    }]
  }
}, {
  id: H3_EQUI360_LORA_ID,
  name: "MiniMax H3 Equirectangular 360°",
  filename: H3_EQUI360_LORA_FILENAME,
  strength: 1,
  modelFamily: "minimax-h3",
  compatibleModelIds: [H3_FL2VA_MODEL_ID],
  compatibleInputModes: ["image"],
  purpose: "style",
  promptPrefixes: ["equirect360"],
  catalogOrder: 98,
  variant: "fl2va",
  rules: {
    orderPriority: 30,
    settingConflicts: [],
    combinations: []
  },
  scan: {
    vram: "LoRA · 360° 等距柱状 · reviewed v2 · step2500 · strength 1.0 · 131 MB",
    integrated: true,
    components: [{
      label: "MiniMax H3 Equirectangular 360° LoRA · reviewed v2 · step2500",
      expected: `loras/${H3_EQUI360_LORA_FILENAME}`,
      patterns: [/loras\/h3-equi360-reviewed-v2-step2500\.safetensors$/i],
      installGuide: {
        sourceLabel: "shamanic / minimax-h3-equi360-lora · reviewed v2",
        downloadUrl: `https://huggingface.co/shamanic/minimax-h3-equi360-lora/resolve/main/${H3_EQUI360_LORA_FILENAME}?download=true`,
        targetSubdirectory: "loras",
        recommendedFilename: H3_EQUI360_LORA_FILENAME,
        revision: H3_EQUI360_LORA_REVISION,
        license: "MiniMax Community License",
        notes: "Reviewed v2 · September 2026。该版本替代上游此前发布的 v1；执行 Prompt 会自动加入触发词 equirect360。推荐 H3 原生 T2VA、21:9、768p、强度 1.0；生成后需要把 21:9 输出拉伸为 2:1 并写入 equirectangular 球面元数据。8-step Turbo、I2V/Ref2VA 和视频续写未验证；模型卡提示接缝与镜头运动先验可能带来失真。"
      }
    }]
  }
}, {
  id: H3_VR180_SBS_LORA_ID,
  name: "MiniMax H3 VR180 SBS",
  filename: H3_VR180_SBS_LORA_FILENAME,
  strength: 1,
  modelFamily: "minimax-h3",
  compatibleModelIds: [H3_FL2VA_MODEL_ID],
  compatibleInputModes: ["image"],
  purpose: "style",
  promptPrefixes: ["vr180sbs"],
  catalogOrder: 97,
  variant: "fl2va",
  rules: {
    orderPriority: 30,
    settingConflicts: [],
    combinations: []
  },
  scan: {
    vram: "LoRA · VR180 SBS 立体 · v2 · strength 1.0 · 131 MB",
    integrated: true,
    components: [{
      label: "MiniMax H3 VR180 SBS LoRA · v2",
      expected: `loras/${H3_VR180_SBS_LORA_FILENAME}`,
      patterns: [/loras\/h3-vr180-sbs-lora-v2\.safetensors$/i],
      installGuide: {
        sourceLabel: "rehan-fal / minimax-h3-vr180-sbs-lora",
        downloadUrl: `https://huggingface.co/rehan-fal/minimax-h3-vr180-sbs-lora/resolve/${H3_VR180_SBS_LORA_REVISION}/${H3_VR180_SBS_LORA_FILENAME}?download=true`,
        targetSubdirectory: "loras",
        recommendedFilename: H3_VR180_SBS_LORA_FILENAME,
        revision: H3_VR180_SBS_LORA_REVISION,
        sha256: "c7f0b3bfa361cf54aabae1cc8d567b126145101f185934684ee2171bd2550969",
        license: "MiniMax Community License",
        notes: "VR180 立体 SBS LoRA；执行 Prompt 会自动加入触发词 vr180sbs，并要求固定的左右眼并排布局说明。推荐 H3 原生 T2VA、21:9、768p、强度 1.0；生成后需要把输出拉伸为 2:1 并写入立体球面元数据。不要改用 H3 8-step Turbo；I2V、快速横摇和左右眼一致性尚未在本应用中验证。"
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
        notes: "官方 v1.0 FL2VA 8 步权重。目前没有对应的 8-step v1.1；保留作为 8 步质量与音频稳定性备选。综合首选使用 v4，极速 4 步使用当前 v1.2 或 Turbo-SLA。不要与其他 Turbo 变体叠加。"
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
  strength: 0.85,
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
    }, {
      loraId: H3_CAMERA_MOTION_LORA_ID,
      severity: "warning",
      localeKey: "realismCameraMotion"
    }]
  },
  scan: {
    vram: "rank 32 · strength 0.85 · trigger r34l1sm",
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
        notes: "MiniMax H3 人物写实 LoRA。执行 Prompt 会自动加入触发词 r34l1sm；应用默认强度 0.85，作者 intended strength 为 1.0。"
      }
    }]
  }
}];
