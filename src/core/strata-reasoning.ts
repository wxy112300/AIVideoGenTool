/** Strata 0.1.45 maps high and xhigh to the same template level. */
export const strataReasoningEfforts = ["off", "low", "medium", "high"] as const;
export type StrataReasoningEffort = typeof strataReasoningEfforts[number];
export const STRATA_DEFAULT_REASONING_EFFORT: StrataReasoningEffort = "medium";

export function normalizeStrataReasoningEffort(value: unknown): StrataReasoningEffort {
  if (value === "xhigh") return "high";
  return strataReasoningEfforts.includes(value as StrataReasoningEffort)
    ? value as StrataReasoningEffort : STRATA_DEFAULT_REASONING_EFFORT;
}
