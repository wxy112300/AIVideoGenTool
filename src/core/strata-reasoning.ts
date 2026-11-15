import { isStrataDeepSeek } from "./catalog/models/strata-deepseek.js";

/** UI levels remain stable; each model receives its own native template levels. */
export const strataReasoningEfforts = ["off", "low", "medium", "high"] as const;
export type StrataReasoningEffort = typeof strataReasoningEfforts[number];
export const STRATA_DEFAULT_REASONING_EFFORT: StrataReasoningEffort = "medium";

export function strataReasoningEffortForModel(modelId: string, effort: Exclude<StrataReasoningEffort, "off">) {
  return isStrataDeepSeek(modelId) ? ({ low: "low", medium: "high", high: "max" } as const)[effort] : effort;
}

export function normalizeStrataReasoningEffort(value: unknown): StrataReasoningEffort {
  if (value === "xhigh") return "high";
  return strataReasoningEfforts.includes(value as StrataReasoningEffort)
    ? value as StrataReasoningEffort : STRATA_DEFAULT_REASONING_EFFORT;
}
