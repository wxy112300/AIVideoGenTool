import type { UiLocale } from "../../types.js";
import { qwenImage21PromptPackFor } from "./qwen-image-2-1/index.js";
import { h3ImagePromptContract } from "../minimax-h3-image-prompt.js";
export function h3ImagePromptPackFor(locale: UiLocale = "zh-CN") {
  return { ...qwenImage21PromptPackFor(locale), defaultPresets: {
    faithful: h3ImagePromptContract("faithful"), "detail-enhance": h3ImagePromptContract("detail-enhance")
  } };
}
