import { createTranslator } from "./i18n.js";
import type { Translate } from "./i18n.js";
import { uiKeys } from "./i18n-keys.js";
/** Request-only output expansion; never change the loaded context or truncate inputs. */
export function strataTokenBudget(input: {
  inputTokens: number; imageCount: number; visionTokensPerImage: number;
  contextSize: number; requestedMaxTokens: number; automatic?: boolean;
}, t: Translate = createTranslator().t): { inputTokens: number; maxTokens: number } {
  const counts = [input.inputTokens, input.imageCount, input.visionTokensPerImage, input.contextSize, input.requestedMaxTokens];
  if (!counts.every((value) => Number.isSafeInteger(value) && value >= 0)
    || input.contextSize < 1024 || input.contextSize > 32768 || input.visionTokensPerImage < 1
    || input.requestedMaxTokens < 1 || input.requestedMaxTokens > 32768) throw new Error(t(uiKeys.strataCore.context));
  const room = input.contextSize - input.inputTokens - input.imageCount * (input.visionTokensPerImage + 4) - 256;
  if (room < input.requestedMaxTokens) throw new Error(t(uiKeys.strataCore.budget, { tokens: input.inputTokens, context: input.contextSize }));
  return { inputTokens: input.inputTokens, maxTokens: input.automatic ? room : input.requestedMaxTokens };
}
