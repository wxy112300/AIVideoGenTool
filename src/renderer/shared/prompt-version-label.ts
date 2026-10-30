import type { Translate } from "../../core/i18n";
import { uiKeys } from "../../core/i18n-keys";

// These are the shipped default labels in existing drafts. Custom labels and
// persisted versions remain untouched when the interface language changes.
export function promptVersionDisplayLabel(label: string, t: Translate): string {
  return ["原始", "Original"].includes(label) ? t(uiKeys.promptVersion.original) : label;
}
