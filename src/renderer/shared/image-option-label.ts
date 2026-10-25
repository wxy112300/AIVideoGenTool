import type { Translate } from "../../core/i18n";
import { uiKeys } from "../../core/i18n-keys";
import { imageModelCapabilityFor } from "../../core/image-workflow";

/** A picker needs only the model's input distinction, not its implementation guide. */
export function imageModelOptionNote(modelId: string, t: Translate): string {
  const capability = imageModelCapabilityFor(modelId);
  if (capability.operation === "background-removal") return t(uiKeys.create.imageEdit.modelCutout);
  if (capability.operation === "inpaint") return t(uiKeys.create.imageEdit.modelInpaint);
  if (capability.operation === "harmonize") return t(uiKeys.create.imageEdit.modelHarmonize);
  if (!capability.maxPictures) return t(uiKeys.create.imageEdit.modelTextOnly);
  return t(capability.supportsTextOnly ? uiKeys.create.imageEdit.modelTextAndReference : uiKeys.create.imageEdit.modelReference, { count: capability.maxPictures });
}

// Core option labels remain backwards compatible; only their UI text is localized.
const labels: ReadonlyArray<readonly [string, string]> = [
  ["平衡质量", uiKeys.create.finish.balanced],
  ["原生质量", uiKeys.create.finish.nativeQuality],
  ["Lightning 4 步", uiKeys.create.finish.lightning4],
  ["官方预览质量", uiKeys.create.finish.preview],
  ["官方原生质量", uiKeys.create.finish.officialNative],
  ["官方 Turbo 质量", uiKeys.create.finish.officialTurbo],
  ["快速质量", uiKeys.create.finish.fast],
  ["高质量", uiKeys.create.finish.high],
  ["自然边缘", uiKeys.create.finish.natural],
  ["紧贴 Mask", uiKeys.create.finish.tight],
  ["扩大修补", uiKeys.create.finish.wide],
  ["Turbo 快速", uiKeys.create.finish.turbo],
  ["Full 原生质量", uiKeys.create.finish.full],
  ["自动抠图", uiKeys.create.finish.cutout],
  ["原图比例", uiKeys.create.finish.originalRatio],
  ["默认比例", uiKeys.create.finish.defaultRatio],
  ["方形", uiKeys.create.finish.square],
  ["横向", uiKeys.create.finish.landscape],
  ["竖向", uiKeys.create.finish.portrait],
  ["原图", uiKeys.create.finish.original],
  ["默认", uiKeys.create.finish.default],
  ["上传后读取", uiKeys.create.finish.afterUpload],
];
export function localizeImageOptionLabel(label: string, t: Translate): string {
  const exact = labels.find(([source]) => source === label);
  if (exact) return t(exact[1]);
  return labels.filter(([source]) => ["原图比例", "默认比例", "原图", "默认", "上传后读取", "方形", "横向", "竖向"].includes(source))
    .reduce((text, [source, key]) => text.replaceAll(source, t(key)), label);
}
