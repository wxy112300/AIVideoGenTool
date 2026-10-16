/** Request-only output expansion; never change the loaded context or truncate inputs. */
export function strataTokenBudget(input: {
  inputTokens: number; imageCount: number; visionTokensPerImage: number;
  contextSize: number; requestedMaxTokens: number; automatic?: boolean;
}): { inputTokens: number; maxTokens: number } {
  const counts = [input.inputTokens, input.imageCount, input.visionTokensPerImage, input.contextSize, input.requestedMaxTokens];
  if (!counts.every((value) => Number.isSafeInteger(value) && value >= 0)
    || input.contextSize < 1024 || input.contextSize > 32768 || input.visionTokensPerImage < 1
    || input.requestedMaxTokens < 1 || input.requestedMaxTokens > 32768) throw new Error("Strata 上下文策略无效。");
  const room = input.contextSize - input.inputTokens - input.imageCount * (input.visionTokensPerImage + 4) - 256;
  if (room < input.requestedMaxTokens) throw new Error(`Strata 输入约 ${input.inputTokens} 文本 tokens，加上视觉与输出预算超过 ${input.contextSize} 上下文；请缩短输入或减少参考图。原始指令未截断。`);
  return { inputTokens: input.inputTokens, maxTokens: input.automatic ? room : input.requestedMaxTokens };
}
