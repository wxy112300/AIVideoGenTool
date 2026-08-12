import type { UiLocale } from "../../../types.js";

export interface CatalogLoraGuideLocale {
  summary: string;
  recommendedStrength: string;
  effects: string;
  stacking: string;
  compatibility: string;
  source: string;
}

export interface CatalogLoraLocale {
  guide: CatalogLoraGuideLocale;
  rules: Record<string, string>;
}

const zhCN: Record<string, CatalogLoraLocale> = {
  "minimax-h3-lightx2v-turbo-4step": {
    guide: {
      summary: "把 H3 FL2VA 从标准约 20 步切换到 LightX2V Turbo 6–8 步采样，用更少步骤缩短生成时间。",
      recommendedStrength: "默认 0.75；建议 0.65–0.85。4 步仅适合实验，稳定测试优先使用 8 步。",
      effects: "速度明显提高，但过强或步数过低可能损失细节、运动稳定性和音频质量。",
      stacking: "与内容或风格 LoRA 同用时建议放在前面；若组合后质量下降，先降低其他 LoRA 强度，再回退标准 20 步。",
      compatibility: "仅 MiniMax H3 FL2VA 图生视频；会同时切换 ER-SDE、Beta 与 Turbo 步数策略。",
      source: "LightX2V / Kijai ComfyUI conversion"
    },
    rules: {
      incompatible: "{name} 不兼容当前基础模型或输入模式。",
      turboSpectrum: "LightX2V Turbo 使用专用低步数采样策略，不能同时启用 Spectrum。",
      orderSuggestion: "建议将 {current} 放在 {previous} 前面；性能 LoRA 通常先加载，内容、人物和风格 LoRA 后加载。"
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
      pinkTurbo: "PinkFluffyBunny 与 Turbo 可以组合，但属于未经充分验证的 alpha 叠加；建议 Turbo 在前，并分别保留单 LoRA 对照结果。",
      orderSuggestion: "建议将 {current} 放在 {previous} 前面；性能 LoRA 通常先加载，内容、人物和风格 LoRA 后加载。"
    }
  }
};

const enUS: Record<string, CatalogLoraLocale> = {
  "minimax-h3-lightx2v-turbo-4step": {
    guide: {
      summary: "Switches H3 FL2VA from standard roughly 20-step sampling to LightX2V Turbo 6–8-step sampling for shorter generation time.",
      recommendedStrength: "Default 0.75; start around 0.65–0.85. Four steps are experimental; use eight steps for stable tests.",
      effects: "Significantly faster, but excessive strength or too few steps can reduce detail, motion stability, and audio quality.",
      stacking: "Place it before content or style LoRAs; if quality drops, lower other LoRA strengths first, then compare against standard 20-step sampling.",
      compatibility: "MiniMax H3 FL2VA image-to-video only; also switches the ER-SDE, Beta, and Turbo step strategy.",
      source: "LightX2V / Kijai ComfyUI conversion"
    },
    rules: {
      incompatible: "{name} is incompatible with the current base model or input mode.",
      turboSpectrum: "LightX2V Turbo uses a dedicated low-step sampling strategy and cannot be combined with Spectrum.",
      orderSuggestion: "Place {current} before {previous}; performance LoRAs usually load before content, character, and style LoRAs."
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
      pinkTurbo: "PinkFluffyBunny can be combined with Turbo, but the alpha stack is not fully validated; place Turbo first and keep single-LoRA comparison results.",
      orderSuggestion: "Place {current} before {previous}; performance LoRAs usually load before content, character, and style LoRAs."
    }
  }
};

const genericRules: Record<UiLocale, Record<string, string>> = {
  "zh-CN": {
    incompatible: "{name} 不兼容当前基础模型或输入模式。",
    orderSuggestion: "建议将 {current} 放在 {previous} 前面；性能 LoRA 通常先加载，内容、人物和风格 LoRA 后加载。"
  },
  "en-US": {
    incompatible: "{name} is incompatible with the current base model or input mode.",
    orderSuggestion: "Place {current} before {previous}; performance LoRAs usually load before content, character, and style LoRAs."
  }
};

export function loraLocaleFor(id: string, locale: UiLocale = "zh-CN"): CatalogLoraLocale | undefined {
  return (locale === "en-US" ? enUS[id] : undefined) ?? zhCN[id];
}

export function loraRuleText(
  id: string,
  key: string,
  locale: UiLocale = "zh-CN"
): string {
  return loraLocaleFor(id, locale)?.rules[key] ??
    loraLocaleFor(id, "zh-CN")?.rules[key] ??
    genericRules[locale][key] ??
    genericRules["zh-CN"][key] ??
    key;
}
