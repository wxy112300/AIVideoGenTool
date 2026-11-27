import type { H3PromptMode, H3PromptPreset } from "../../../../types.js";

export interface H3PromptSkillContext {
  sourcePrompt: string;
  supplementalContext: string;
  mode: H3PromptMode;
  preset: H3PromptPreset;
  durationSeconds: number;
  hasReferenceMedia: boolean;
  isLongVideo?: boolean;
  /** When true, conditional sub-rules are all rendered so Settings can display the complete skill text. */
  inspectAll?: boolean;
}

export interface H3PromptSkill {
  readonly id: string;
  readonly title: string;
  /** Short 1-line trigger description for on-demand lazy loading (omitted for always-deterministic base skills). */
  readonly catalogHint?: string;
  /** Higher priority skills appear first so the model knows what is primary. */
  readonly priority: number;
  readonly sharedWithLongVideo?: boolean;
  matches(context: H3PromptSkillContext): boolean;
  guidance(context: H3PromptSkillContext): string;
  example?: string | ((context: H3PromptSkillContext) => string | undefined);
}
