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
  variant?: CatalogModelVariant;
  rules: VideoLoraRules;
  scan: CatalogModelScanDefinition;
}

export const H3_TURBO_LORA_ID = "minimax-h3-lightx2v-turbo-4step";
export const LEGACY_H3_TURBO_MODEL_ID = "minimax_h3_fl2va_turbo";
export const H3_FL2VA_MODEL_ID = "minimax_h3_fl2va";
export const H3_TURBO_LORA_FILENAME =
  "minimax_h3_fl2v_lightx2v_turbo_4step_v0.1_comfy_resized_avg_rank_21_bf16.safetensors";
export const H3_PINK_FLUFFY_BUNNY_LORA_ID = "minimax-h3-pink-fluffy-bunny-nsfw";
export const H3_PINK_FLUFFY_BUNNY_LORA_FILENAME =
  "PinkFluffyBunny-pruned-v1-rank128.safetensors";
export const H3_REALISM_PEOPLE_LORA_ID = "minimax-h3-realism-people";
export const H3_REALISM_PEOPLE_LORA_FILENAME =
  "h3-realism-people-t2v-i2v-r2v.safetensors";

export const VIDEO_LORA_DEFINITIONS: readonly CatalogVideoLoraDefinition[] = [{
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
    settingConflicts: [{
      setting: "spectrumMode",
      values: ["balanced"],
      severity: "error",
      localeKey: "turboSpectrum"
    }],
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
