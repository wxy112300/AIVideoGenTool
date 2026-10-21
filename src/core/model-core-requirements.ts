import type { UiLocale } from "../types.js";
import { modelCatalog } from "./catalog/index.js";
import { releaseVersionAtLeast } from "./release-version.js";

/** Node registration alone cannot prove support for a checkpoint's architecture. */
export function modelCoreVersionBlockReason(modelId: string, version: string | undefined, locale: UiLocale = "zh-CN"): string {
  const minimum = modelCatalog.get(modelId)?.definition.scan?.minimumComfyVersion;
  if (!minimum || releaseVersionAtLeast(version ?? "", minimum)) return "";
  const name = modelCatalog.localized(modelId, locale)?.shortName ?? modelId;
  if (locale === "en-US") return `${name} requires ComfyUI ${minimum}+ with full PDD checkpoint support (current: ${version || "unknown"}). Update the selected core and rescan in Settings.`;
  if (locale === "zh-TW") return `${name} 需要 ComfyUI ${minimum}+ 的完整 PDD checkpoint 支援（目前：${version || "未知"}）。請更新所選核心後在設定重新掃描。`;
  return `${name} 需要 ComfyUI ${minimum}+ 的完整 PDD checkpoint 支持（当前：${version || "未知"}）。请更新所选核心后在设置重新扫描。`;
}
