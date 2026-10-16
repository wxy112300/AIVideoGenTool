import { describe, expect, it } from "vitest";
import { strataTokenBudget } from "../src/core/strata-token-budget.js";

const policy = { inputTokens: 2000, imageCount: 1, visionTokensPerImage: 1024, contextSize: 32768, requestedMaxTokens: 8192 };
describe("Strata automatic request output allowance", () => {
  it("expands past 8192 using actual text, image and safety reserves, not total physical RAM", () => {
    expect(strataTokenBudget({ ...policy, automatic: true })).toEqual({ inputTokens: 2000, maxTokens: 29484 });
    expect(strataTokenBudget({ ...policy, inputTokens: 20000, automatic: true }).maxTokens).toBe(11484);
    expect(strataTokenBudget({ ...policy, imageCount: 3, automatic: true }).maxTokens).toBe(27428);
  });
  it("preserves explicit legacy caps and never shrinks the minimum allowance or truncates input", () => {
    expect(strataTokenBudget(policy).maxTokens).toBe(8192);
    const request = Object.freeze({ ...policy, inputTokens: 24000, automatic: true });
    expect(() => strataTokenBudget(request)).toThrow("原始指令未截断");
    expect(request.inputTokens).toBe(24000);
  });
  it.each([NaN, -1, 1.5, Infinity])("rejects invalid tokenizer counts (%s)", (inputTokens) => {
    expect(() => strataTokenBudget({ ...policy, inputTokens, automatic: true })).toThrow("策略无效");
  });
  it("does not expand the loaded context window", () => {
    expect(() => strataTokenBudget({ ...policy, contextSize: 65536, automatic: true })).toThrow("策略无效");
  });
});
