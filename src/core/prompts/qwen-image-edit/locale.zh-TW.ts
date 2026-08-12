import type { ImagePromptPreset, ImageReferenceRole } from "../../../types.js";
import type { ImagePromptUiLocale, PromptPresetLocale } from "../types.js";

export const uiLocale: ImagePromptUiLocale = {
  originalVersion: "原始"
};

export const presetLocale: Record<ImagePromptPreset, PromptPresetLocale> = {
  faithful: { label: "忠實整理", description: "只澄清使用者明確的編輯意圖，不新增未要求的主體、材質、光照、構圖或故事。" },
  "detail-enhance": { label: "細節增強", description: "在不改變編輯範圍的前提下，補充區域、材質、光照、透視和邊緣融合等執行細節。" }
};

export const referenceRoleLocale: Record<ImageReferenceRole, string> = {
  base: "基礎畫面",
  person: "人物",
  object: "物體",
  pose: "姿態",
  style: "風格",
  background: "背景",
  auto: "自動"
};
