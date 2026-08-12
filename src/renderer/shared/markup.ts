import { videoLoraDefinition } from "../../core/video-loras";
import type { Draft } from "../../types";
import { escapeHtml } from "./dom";
import { icon } from "./icons";

export function fieldLabelWithTip(label: string, tip: string): string {
  return `<span class="field-label-row"><span>${escapeHtml(label)}</span><span class="field-info" tabindex="0" aria-label="${escapeHtml(tip)}">${icon("info")}<span class="field-info-tip" role="tooltip">${escapeHtml(tip)}</span></span></span>`;
}

export function videoLoraInfoButton(lora: Draft["videoLoras"][number]): string {
  const definition = videoLoraDefinition(lora.id);
  const guide = definition?.guide;
  if (!guide) {
    const fallback = "此 LoRA 暂无内置教程。建议从 0.6–1.0 小幅调整，并与不使用 LoRA 的结果对照。";
    return `<span class="field-info video-lora-info" tabindex="0" aria-label="${escapeHtml(fallback)}">${icon("info")}<span class="field-info-tip video-lora-info-tip" role="tooltip">${escapeHtml(fallback)}</span></span>`;
  }
  const constraintNotes = [
    ...definition.rules.settingConflicts.map((conflict) => conflict.message),
    ...definition.rules.combinations.map((combination) => combination.message)
  ];
  const ariaLabel = [guide.summary, guide.recommendedStrength, guide.effects, guide.stacking, guide.compatibility, ...constraintNotes].join(" ");
  return `<span class="field-info video-lora-info" tabindex="0" aria-label="${escapeHtml(ariaLabel)}">
    ${icon("info")}
    <span class="field-info-tip video-lora-info-tip" role="tooltip">
      <strong>${escapeHtml(lora.name)}</strong>
      <span><b>作用</b>${escapeHtml(guide.summary)}</span>
      <span><b>推荐强度</b>${escapeHtml(guide.recommendedStrength)}</span>
      <span><b>可能影响</b>${escapeHtml(guide.effects)}</span>
      <span><b>叠加建议</b>${escapeHtml(guide.stacking)}</span>
      <span><b>兼容范围</b>${escapeHtml(guide.compatibility)}</span>
      ${constraintNotes.length ? `<span><b>冲突限制</b>${escapeHtml(constraintNotes.join(" "))}</span>` : ""}
      <small>来源：${escapeHtml(guide.source)}</small>
    </span>
  </span>`;
}
