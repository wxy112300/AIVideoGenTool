import type { Translate } from "../../core/i18n";
import { uiKeys } from "../../core/i18n-keys";

// These are the shipped default labels in existing drafts. Custom labels and
// persisted versions remain untouched when the interface language changes.
export function promptVersionDisplayLabel(label: string, t: Translate): string {
  if (["新建", "New prompt"].includes(label)) return t(uiKeys.promptVersion.newPrompt);
  if (["手动编辑", "手動編輯", "Manual edit"].includes(label)) return t(uiKeys.promptVersion.manualEdit);
  const expanded = /^(?:扩写|擴寫|Expanded) ([1-9]\d*)$/.exec(label);
  if (expanded) return t(uiKeys.promptVersion.expanded, { count: expanded[1]! });
  const image = /^(?:图片优化|圖片最佳化|Image optimization) ([1-9]\d*)$/.exec(label);
  if (image) return t(uiKeys.create.interaction.imageOptimizedVersion, { count: image[1]! });
  if (label === "无需 Prompt") return t(uiKeys.promptVersion.noPrompt);
  return ["原始", "Original"].includes(label) ? t(uiKeys.promptVersion.original) : label;
}
