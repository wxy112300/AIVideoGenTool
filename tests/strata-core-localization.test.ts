import { afterEach, expect, it, vi } from "vitest";
import { createNativeTranslator } from "../electron/ui-translator.js";
import { readReliableStrataResources } from "../electron/services/strata-resources.js";
import { strataTokenBudget } from "../src/core/strata-token-budget.js";
import { StrataChatStream } from "../src/core/strata-chat-stream.js";
import { FileReadResourcePressure } from "../src/core/strata-residency-pressure.js";
import { planStrataResources } from "../src/core/strata-resource-policy.js";

afterEach(() => vi.useRealTimers());
const GiB = 1024 ** 3;
const resources = { memoryAvailableBytes: 33.7 * GiB, commitAvailableBytes: 60 * GiB,
  vramAvailableBytes: 21.7 * GiB, vramTotalBytes: 24 * GiB };
const policy = { inputTokens: 2000, imageCount: 1, visionTokensPerImage: 1024,
  contextSize: 32768, requestedMaxTokens: 8192, automatic: true };
const event = (delta: unknown, finish_reason: string | null = null) =>
  "data: " + JSON.stringify({ choices: [{ index: 0, delta, finish_reason }] }) + "\r\n\r\n";

it.each([
  ["en-US", "not truncated", "10s", "3 samples"],
  ["zh-TW", "未截斷", "10 秒", "3 次取樣"]
] as const)("keeps %s token limits, stream output and sustained pressure protection", async (locale, untouched, sustained, retries) => {
  const t = createNativeTranslator(locale).t;
  expect(strataTokenBudget(policy, t)).toEqual({ inputTokens: 2000, maxTokens: 29484 });
  const oversized = Object.freeze({ ...policy, inputTokens: 24000 });
  expect(() => strataTokenBudget(oversized, t)).toThrow(untouched);
  expect(oversized.inputTokens).toBe(24000);
  expect(planStrataResources(resources, 5120, { allowFileReadFallback: true }, t))
    .toEqual(planStrataResources(resources, 5120, { allowFileReadFallback: true }));

  const parser = new StrataChatStream(t);
  const source = event({ reasoning_content: "private" }) + event({ content: "保留故乡招牌" }) +
    event({}, "stop") + "data: [DONE]\r\n\r\n";
  expect([...source].flatMap(letter => parser.push(letter)).join("")).toBe("保留故乡招牌");
  expect(parser.result()).toBe("保留故乡招牌");
  expect(parser.diagnostics()).toEqual({ finishReason: "stop", completionTokens: null,
    contentCharacters: 6, reasoningCharacters: 7 });
  expect(JSON.stringify(parser.diagnostics())).not.toMatch(/private|故乡/);
  expect(() => parser.push(event({ content: "extra" }))).toThrow(locale === "en-US" ? "after" : "結束");
  const truncated = new StrataChatStream(t);
  expect(() => truncated.push(event({ content: "partial" }, "length"))).toThrow("token");
  expect(() => truncated.result()).toThrow();

  let now = 0;
  const diagnostics: { event: string }[] = [];
  const pressure = new FileReadResourcePressure(() => now, e => diagnostics.push(e), t);
  const critical = { ...resources, memoryAvailableBytes: .1 * GiB, commitAvailableBytes: .4 * GiB };
  for (; now < 10000; now += 1000) expect(pressure.check(critical)).toBeNull();
  expect(pressure.check(critical)).toContain(sustained);
  expect(diagnostics.at(-1)?.event).toBe("critical");
  expect(pressure.check({ ...critical, commitAvailableBytes: 2 * GiB })).toBeNull();
  expect(pressure.check(critical)).toBeNull();
  now += 6000; expect(pressure.check(critical)).toBeNull();
  expect(pressure.knownPressure({ ...critical, vramAvailableBytes: 1.9 * GiB })).toContain("2GiB");

  vi.useFakeTimers();
  const read = vi.fn().mockResolvedValue({ ...resources, commitAvailableBytes: null });
  const events: { event: string }[] = [];
  const failure = expect(readReliableStrataResources(read, { onDiagnostic: e => events.push(e) }, t)).rejects.toThrow(retries);
  await vi.advanceTimersByTimeAsync(1500); await failure;
  expect(read).toHaveBeenCalledTimes(3);
  expect(events.map(e => e.event)).toEqual(["retry", "retry", "unavailable"]);
  expect(vi.getTimerCount()).toBe(0);
});
