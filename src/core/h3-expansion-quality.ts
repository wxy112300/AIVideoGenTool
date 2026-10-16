import type { H3PromptMode } from "../types.js";
import { stripH3ContentFromSource } from "./h3-dialogue.js";

/** Content only: transport syntax and timeline labels are not expansion detail. */
export function h3ExpansionContent(text: string): string {
  return text.replace(/<\/?(?:d|think|analysis)>/giu, " ")
    .replace(/\[(?:Shot\s*\d+|Chinese|English|Japanese|Korean|Spanish|French|German|Russian)\]/giu, " ")
    .replace(/<(?:Picture|Video|Subject)\s*\d+>/giu, " ")
    .replace(/\b\d{1,2}:\d{2}(?:\.\d+)?\b/gu, " ").trim();
}

/** Official timeline only; multiple shots belong inside one field, not repeated field headers. */
export function h3ExpansionTimeline(text: string, mode: H3PromptMode): string | undefined {
  const field = mode === "R2V" ? "detailed_description" : "integrated_multimodal_description";
  const fields = [...text.matchAll(/^\s*(subject_definitions|summary|retention_analysis|detailed_description|integrated_multimodal_description|overall_soundscape|non_diegetic_music)\s*:/gimu)];
  const timelines = fields.flatMap((match, index) => match[1]?.toLowerCase() === field
    ? [text.slice(match.index! + match[0].length, fields[index + 1]?.index)] : []);
  if (timelines.length > 1) throw new Error("影视细节扩写重复了主时间线字段；结果没有保存，原提示词已保持不变。");
  return timelines[0];
}

/** Repeated filler contributes once, unless the source itself requests the same sentence repeatedly. */
export function h3ExpansionUniqueContent(text: string, source: string): string {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
  const sentences = (value: string) => [...segmenter.segment(h3ExpansionContent(value))]
    .map((part) => part.segment.trim()).filter(Boolean);
  const key = (value: string) => value.normalize("NFKC").replace(/\s+/gu, " ").toLocaleLowerCase();
  const allowances = new Map<string, number>();
  for (const sentence of sentences(source)) allowances.set(key(sentence), (allowances.get(key(sentence)) ?? 0) + 1);
  const seen = new Map<string, number>();
  return sentences(text).filter((sentence) => {
    const token = key(sentence), count = (seen.get(token) ?? 0) + 1;
    seen.set(token, count);
    return count <= Math.max(1, allowances.get(token) ?? 0);
  }).join("\n");
}

export function h3ExpansionCharacterCount(text: string): number {
  return [...h3ExpansionContent(text).matchAll(/[\p{L}\p{N}]/gu)].length;
}

/** Dialogue/visible literals do not determine the prose language. Not a semantic language detector. */
export function h3ExpansionUsesHanProse(text: string): boolean {
  const prose = stripH3ContentFromSource(text).replace(/<d>[\s\S]*?<\/d>/giu, " ")
    .replace(/["“「『«][\s\S]*?["”」』»]/gu, " ");
  const letters = prose.match(/\p{L}/gu)?.length ?? 0;
  const han = prose.match(/\p{Script=Han}/gu)?.length ?? 0;
  return han > 0 && han / Math.max(1, letters) >= 0.2;
}
