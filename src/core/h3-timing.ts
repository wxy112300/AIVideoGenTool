import { stripH3ContentFromSource } from "./h3-dialogue.js";
import { h3ExpansionTimeline } from "./h3-expansion-quality.js";
import type { H3PromptMode } from "../types.js";

function numericalSeconds(text: string): number[] {
  const values = new Set<number>();
  for (const match of text.matchAll(/(\d+(?:\.\d+)?)\s*(?:至|到|和|and|[-–—~])\s*(\d+(?:\.\d+)?)\s*(?:秒|s(?:ec(?:onds?)?)?\b)/giu)) {
    values.add(Number(match[1])); values.add(Number(match[2]));
  }
  for (const match of text.matchAll(/(\d+(?:\.\d+)?)\s*(?:秒|s(?:ec(?:onds?)?)?\b)/giu)) values.add(Number(match[1]));
  return [...values].filter(Number.isFinite);
}

/** Presence check only: not proof of correct event/subject/negation or ordering. */
export function missingH3SourceTimepoints(source: string, output: string, mode: H3PromptMode, duration: number): number[] {
  const required = numericalSeconds(stripH3ContentFromSource(source));
  const main = h3ExpansionTimeline(output, mode) ?? "";
  const present = numericalSeconds(stripH3ContentFromSource(main));
  return required.filter(value => !present.some(candidate => Math.abs(candidate - value) < .01
    // H3 rounds the requested end duration to its effective frame-aligned endpoint.
    || (Math.abs(value - duration) < .01 && candidate >= duration && candidate - duration < .12)));
}
