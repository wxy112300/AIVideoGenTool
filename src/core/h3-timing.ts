import { stripH3ContentFromSource } from "./h3-dialogue.js";
import { h3ExpansionTimeline } from "./h3-expansion-quality.js";
import type { H3PromptMode } from "../types.js";
import { h3FrameCountForSeconds, parseH3Timecode } from "./h3-temporal.js";

function timepoints(text: string) {
  const points = new Map<number, { seconds: number; index: number; end: number }>();
  for (const match of text.matchAll(/(?<![\d:.])(\d+(?:\.\d+)?)\s*(?:至|到|和|and|[-–—~])\s*(\d+(?:\.\d+)?)\s*(?:秒|s(?:ec(?:onds?)?)?\b)/giu)) {
    points.set(match.index, { seconds: Number(match[1]), index: match.index, end: match.index + match[1]!.length });
    const index = match.index + match[0].lastIndexOf(match[2]!);
    points.set(index, { seconds: Number(match[2]), index, end: match.index + match[0].length });
  }
  for (const match of text.matchAll(/(?<![\d:.])(\d{1,2}:[0-5]\d(?:\.\d{1,3})?)(?![\d:.])|(?<![\d:.])(\d+(?:\.\d+)?)\s*(?:秒|s(?:ec(?:onds?)?)?\b)/giu)) {
    const seconds = match[1] ? parseH3Timecode(match[1]) : Number(match[2]);
    if (seconds !== undefined && Number.isFinite(seconds)) {
      points.set(match.index, { seconds, index: match.index, end: match.index + match[0].length });
    }
  }
  return [...points.values()];
}

function isFinalEndpoint(text: string, point: ReturnType<typeof timepoints>[number], duration: number): boolean {
  if (Math.abs(point.seconds - duration) >= .01) return false;
  const before = text.slice(0, point.index).split(/[，,;；。!?\n]|\.(?=\s|$)/u).at(-1) ?? "";
  const after = text.slice(point.end).split(/[，,;；。!?\n]|\.(?=\s|$)/u)[0] ?? "";
  return /\b(?:end|ending|final|finish|settle|settles|settled)\b|结束|结尾|末尾|最后|最终|收尾|稳定|停稳|定格/iu.test(`${before} ${after}`);
}

export function missingH3SourceTimepoints(
  source: string,
  output: string,
  mode: H3PromptMode,
  duration: number,
  endpointSeconds = h3FrameCountForSeconds(duration) / 24
): number[] {
  const sourceText = stripH3ContentFromSource(source);
  const required = timepoints(sourceText);
  const main = h3ExpansionTimeline(output, mode) ?? "";
  const present = timepoints(stripH3ContentFromSource(main));
  return [...new Set(required.filter(point => !present.some(candidate =>
    Math.abs(candidate.seconds - point.seconds) < .01 ||
    (isFinalEndpoint(sourceText, point, duration) && Math.abs(candidate.seconds - endpointSeconds) < .011)
  )).map(point => point.seconds))];
}
