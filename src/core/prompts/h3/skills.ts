/**
 * Modular, priority-capped H3 prompting craft skills.
 * Re-exported from `./skills/index.js` so existing imports remain stable.
 */
export {
  describeH3PromptSkillsForInspection,
  formatH3PromptSkills,
  formatH3SkillCatalogForAllocation,
  formatH3SkillCatalogForLazyLoad,
  h3PromptSkills,
  MAX_H3_SKILL_EXAMPLES,
  mergeH3PromptSkills,
  parseLazySkillLoadRequest,
  resolveH3SkillsByIds,
  selectH3PromptSkills,
  unloadedH3SkillCatalog,
  type H3PromptSkill,
  type H3PromptSkillContext,
  type H3PromptSkillInspection
} from "./skills/index.js";
