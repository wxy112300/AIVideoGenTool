import type { UiLocale } from "../../types.js";
import type { ImagePromptPack } from "./types.js";
import { qwenImage21PromptPackFor } from "./qwen-image-2-1/index.js";
import { mossImagePromptContract } from "../moss-image-prompt.js";

export function mossImagePromptPackFor(locale: UiLocale = "zh-CN"): ImagePromptPack {
  const common = qwenImage21PromptPackFor(locale);
  const descriptions = locale === "en-US"
    ? { faithful: "Clarify a MOSS text-to-image prompt; preserve exact text and JSON layout constraints.", "detail-enhance": "Add useful scene detail for MOSS while retaining text, composition and JSON layouts." }
    : locale === "zh-TW"
      ? { faithful: "釐清 MOSS 文生圖提示詞，保留文字原文與 JSON 佈局約束。", "detail-enhance": "補充 MOSS 場景細節，保留文字、構圖與 JSON 佈局。" }
      : { faithful: "理清 MOSS 文生图提示词，保留文字原文与 JSON 布局约束。", "detail-enhance": "补充 MOSS 场景细节，保留文字、构图与 JSON 布局。" };
  return { ...common, presetDescriptions: descriptions, defaultPresets: {
    faithful: mossImagePromptContract("faithful"), "detail-enhance": mossImagePromptContract("detail-enhance")
  } };
}
