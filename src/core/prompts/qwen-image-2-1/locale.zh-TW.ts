import type { ImagePromptPreset, ImageReferenceRole } from "../../../types.js";
import type { ImagePromptUiLocale, PromptPresetLocale } from "../types.js";

export const uiLocale: ImagePromptUiLocale = { originalVersion: "原始" };
export const presetLocale: Record<ImagePromptPreset, PromptPresetLocale> = {
  faithful: { label: "2.1 忠實整理", description: "依 Qwen Image 2.1 的 <imageN> 參考圖語法，只澄清明確編輯意圖。" },
  "detail-enhance": { label: "2.1 細節增強", description: "依 Qwen Image 2.1 補充區域、材質、光照和邊緣融合等執行細節。" }
};
export const referenceRoleLocale: Record<ImageReferenceRole, string> = {
  base: "基礎畫面", person: "人物", object: "物體", pose: "姿態", style: "風格", background: "背景", auto: "自動"
};
