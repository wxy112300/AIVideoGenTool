import { cameraCraftSkills } from "./camera.js";
import { performanceCraftSkills } from "./performance.js";
import { physicsCraftSkills } from "./physics.js";
import { scaleCraftSkills } from "./scale.js";
import { styleCraftSkills } from "./style.js";
import type { H3PromptSkill, H3PromptSkillContext } from "./types.js";

export type { H3PromptSkill, H3PromptSkillContext } from "./types.js";

/** Keep examples capped so multi-skill matches never bloat context or bleed plots. */
export const MAX_H3_SKILL_EXAMPLES = 2;

export const h3PromptSkills: readonly H3PromptSkill[] = [
  ...scaleCraftSkills,
  ...cameraCraftSkills,
  ...performanceCraftSkills,
  ...physicsCraftSkills,
  ...styleCraftSkills
];

export function selectH3PromptSkills(
  context: H3PromptSkillContext,
  maxSkills?: number
): H3PromptSkill[] {
  const matched = h3PromptSkills
    .filter((skill) => {
      if (context.isLongVideo && !skill.sharedWithLongVideo) return false;
      return skill.matches(context);
    })
    .sort((a, b) => b.priority - a.priority);
  return maxSkills !== undefined ? matched.slice(0, Math.max(1, maxSkills)) : matched;
}

export function resolveH3SkillsByIds(
  ids: readonly string[],
  isLongVideo = false
): H3PromptSkill[] {
  const wanted = new Set(ids.map((id) => id.trim().toLowerCase()).filter(Boolean));
  if (!wanted.size) return [];
  return h3PromptSkills
    .filter((skill) => wanted.has(skill.id) && (!isLongVideo || Boolean(skill.sharedWithLongVideo)))
    .sort((a, b) => b.priority - a.priority);
}

export function mergeH3PromptSkills(
  primary: readonly H3PromptSkill[],
  extra: readonly H3PromptSkill[]
): H3PromptSkill[] {
  const seen = new Set<string>();
  const merged: H3PromptSkill[] = [];
  for (const skill of [...primary, ...extra]) {
    if (seen.has(skill.id)) continue;
    seen.add(skill.id);
    merged.push(skill);
  }
  return merged.sort((a, b) => b.priority - a.priority);
}

export function unloadedH3SkillCatalog(
  loadedIds: readonly string[],
  isLongVideo = false
): H3PromptSkill[] {
  const loaded = new Set(loadedIds);
  return h3PromptSkills
    .filter((skill) => Boolean(skill.catalogHint) && !loaded.has(skill.id) && (!isLongVideo || Boolean(skill.sharedWithLongVideo)))
    .sort((a, b) => b.priority - a.priority);
}

export function formatH3SkillCatalogForLazyLoad(
  loadedIds: readonly string[],
  isLongVideo = false
): string {
  const catalog = unloadedH3SkillCatalog(loadedIds, isLongVideo);
  if (!catalog.length) return "";
  return [
    "OPTIONAL CRAFT SKILLS NOT YET LOADED:",
    "Write the final H3 prompt directly if existing guidance is enough. ONLY if the image(s)/brief clearly need an unloaded skill below, reply with ONE line only: `LOAD_SKILLS: id1, id2`.",
    ...catalog.map((skill) => `- ${skill.id}: ${skill.catalogHint}`)
  ].join("\n");
}

export function formatH3SkillCatalogForAllocation(
  loadedIds: readonly string[]
): string {
  const catalog = unloadedH3SkillCatalog(loadedIds, true);
  if (!catalog.length) return "";
  return [
    "OPTIONAL CRAFT SKILLS NOT YET LOADED FOR DETAIL WRITING:",
    'If inspecting the attached image(s) or story reveals any specialized situation below that is NOT yet active, list its ID(s) in the optional JSON array `"skills": ["id1"]` (omit `"skills"` or use `[]` if none are needed):',
    ...catalog.map((skill) => `- ${skill.id}: ${skill.catalogHint}`)
  ].join("\n");
}

const h3OutputHeadingPattern = /(?:^|\n)\s*(?:integrated_multimodal_description|subject_definitions|summary|detailed_description|overall_soundscape)\s*:/iu;

export function parseLazySkillLoadRequest(
  raw: string,
  allowedIds: readonly string[]
): string[] | null {
  if (!allowedIds.length) return null;
  const cleaned = raw
    .replace(/<(?:think|analysis)>[\s\S]*?<\/(?:think|analysis)>/giu, "")
    .trim()
    .replace(/^```(?:text|markdown|md)?\s*\n([\s\S]*?)\n```$/u, "$1")
    .trim();
  if (!cleaned || h3OutputHeadingPattern.test(cleaned)) return null;
  const match = /^LOAD_SKILLS\s*:\s*([^\n\r]+)/iu.exec(cleaned);
  if (!match) return null;
  const allowed = new Set(allowedIds);
  const requested = match[1]!
    .split(/[,\s;]+/u)
    .map((token) => token.replace(/^[`'"[\]()]+|[`'"[\]().,;]+$/gu, "").trim().toLowerCase())
    .filter((id) => Boolean(id) && allowed.has(id));
  const unique = [...new Set(requested)];
  return unique.length ? unique : null;
}

export interface H3PromptSkillInspection {
  id: string;
  title: string;
  priority: number;
  sharedWithLongVideo: boolean;
  triggerSummary: string;
  rulesText: string;
}

const deterministicSkillTriggerSummary: Record<string, string> = {
  "dialogue-audio": "dialogue, quotes, visible on-screen text, or explicit audio/sound cues in the brief",
  "physical-action-continuity": "always active on single-clip H3 enhancements",
  "visual-realism": "live-action / natural-skin realism cue, or detailed-cinematic with reference image (skipped for stylized art)"
};

/** Inspectable read-only snapshot of every built-in H3 Craft Skill for Settings transparency. */
export function describeH3PromptSkillsForInspection(): H3PromptSkillInspection[] {
  const inspectCtx: H3PromptSkillContext = {
    sourcePrompt: "",
    supplementalContext: "",
    mode: "I2VA",
    preset: "detailed-cinematic",
    durationSeconds: 10,
    hasReferenceMedia: true,
    inspectAll: true
  };
  return [...h3PromptSkills]
    .sort((a, b) => b.priority - a.priority)
    .map((skill) => ({
      id: skill.id,
      title: skill.title,
      priority: skill.priority,
      sharedWithLongVideo: Boolean(skill.sharedWithLongVideo),
      triggerSummary: skill.catalogHint ?? deterministicSkillTriggerSummary[skill.id] ?? "matched automatically by brief context",
      rulesText: skill.guidance(inspectCtx)
    }));
}

export function formatH3PromptSkills(
  skills: readonly H3PromptSkill[],
  context: H3PromptSkillContext,
  options: { includeExamples?: boolean; maxExamples?: number } = {}
): string {
  if (!skills.length) return "";
  const includeExamples = options.includeExamples !== false;
  const maxExamples = options.maxExamples ?? MAX_H3_SKILL_EXAMPLES;
  let emittedExamples = 0;

  return [
    "ACTIVE H3 CRAFT SKILLS (ordered by priority; apply silently to the visual prose—never echo skill titles or meta-rules into the output):",
    ...skills.map((skill) => {
      const resolvedExample = includeExamples && emittedExamples < maxExamples
        ? (typeof skill.example === "function" ? skill.example(context) : skill.example)
        : undefined;
      if (resolvedExample) emittedExamples += 1;
      return [
        `### Skill: ${skill.title}`,
        skill.guidance(context),
        ...(resolvedExample ? [resolvedExample] : [])
      ].join("\n");
    })
  ].join("\n\n");
}
