import { videoLoraDefinition } from "../../core/video-loras";
import { loraLocaleFor } from "../../core/catalog/loras/locales";
import type { Draft, UiLocale } from "../../types";
import { escapeHtml } from "./dom";
import { icon } from "./icons";
import { createTranslator, type Translate } from "../../core/i18n";
import { uiKeys } from "../../core/i18n-keys";

export function fieldLabelWithTip(label: string, tip: string): string {
  return `<span class="field-label-row"><span>${escapeHtml(label)}</span><span class="field-info" tabindex="0" aria-label="${escapeHtml(tip)}">${icon("info")}<span class="field-info-tip" role="tooltip">${escapeHtml(tip)}</span></span></span>`;
}

export function videoLoraInfoButton(
  lora: Draft["videoLoras"][number],
  t: Translate = createTranslator("zh-CN").t,
  locale: UiLocale = "zh-CN"
): string {
  const definition = videoLoraDefinition(lora.id);
  const guide = loraLocaleFor(lora.id, locale)?.guide ?? definition?.guide;
  if (!guide) {
    const fallback = t(uiKeys.shared.loraFallback);
    return `<span class="field-info video-lora-info" tabindex="0" aria-label="${escapeHtml(fallback)}">${icon("info")}<span class="field-info-tip video-lora-info-tip" role="tooltip">${escapeHtml(fallback)}</span></span>`;
  }
  const constraintNotes = [
    ...(definition?.rules.settingConflicts.map((conflict) => conflict.message) ?? []),
    ...(definition?.rules.combinations.map((combination) => combination.message) ?? [])
  ];
  const ariaLabel = [guide.summary, guide.recommendedStrength, guide.effects, guide.stacking, guide.compatibility, ...constraintNotes].join(" ");
  return `<span class="field-info video-lora-info" tabindex="0" aria-label="${escapeHtml(ariaLabel)}">
    ${icon("info")}
    <span class="field-info-tip video-lora-info-tip" role="tooltip">
      <strong>${escapeHtml(lora.name)}</strong>
      <span><b>${t(uiKeys.shared.loraRole)}</b>${escapeHtml(guide.summary)}</span>
      <span><b>${t(uiKeys.shared.loraStrength)}</b>${escapeHtml(guide.recommendedStrength)}</span>
      <span><b>${t(uiKeys.shared.loraEffects)}</b>${escapeHtml(guide.effects)}</span>
      <span><b>${t(uiKeys.shared.loraStacking)}</b>${escapeHtml(guide.stacking)}</span>
      <span><b>${t(uiKeys.shared.loraCompatibility)}</b>${escapeHtml(guide.compatibility)}</span>
      ${constraintNotes.length ? `<span><b>${t(uiKeys.shared.loraConflicts)}</b>${escapeHtml(constraintNotes.join(" "))}</span>` : ""}
      <small>${escapeHtml(t(uiKeys.shared.loraSource, { source: guide.source }))}</small>
    </span>
  </span>`;
}
