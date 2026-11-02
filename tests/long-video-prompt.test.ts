import { afterEach, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { createLongVideoLayout } from "../src/core/long-video/layout";
import { createLongVideoScript } from "../src/core/long-video/script";
import { longVideoPromptRequest, parseLongVideoPromptResult } from "../src/core/long-video/enhancement";
import { enhanceLongVideoWithStrata } from "../electron/services/long-video-prompt";
import type { EnhanceRequest } from "../src/types";
vi.mock("../electron/services/strata-prompt.js", () => ({
  buildStrataPromptRequest: async () => ({ messages: [], modelId: "strata/test", maxTokens: 8192, contextSize: 32768, temperature: 0.7 }),
  StrataPromptValidationError: class extends Error {}
}));
afterEach(() => vi.restoreAllMocks());
function fixture() { let n = 0; const plan = longVideoPromptRequest(createLongVideoScript(createLongVideoLayout(120, 12), () => `page-${++n}`, "Street story"));
  return { plan, request: { prompt: "Street story", modelId: "minimax_h3_fl2va", mode: "h3-vision", longVideo: plan } as EnhanceRequest }; }
it("plans once then expands four bounded batches, all under the same owner and operation", async () => {
  const { plan, request } = fixture(); let offset = 0;
  const owner = { chat: vi.fn(async () => {
    if (!offset++) return JSON.stringify({ summary: "A grounded complete street story", segments: plan.segments.map(p => ({ pageId: p.pageId, outline: "Entering, action, leaving" })) });
    return JSON.stringify({ segments: plan.segments.slice((offset - 2) * 3, (offset - 1) * 3).map(p => ({ pageId: p.pageId, text: "Local continuous motion and sound" })) });
  }) };
  const before = vi.fn(async () => {});
  const raw = await enhanceLongVideoWithStrata(request, createDefaultState().settings, owner, new AbortController().signal, vi.fn(), before);
  expect(owner.chat).toHaveBeenCalledTimes(5); expect(before).toHaveBeenCalledTimes(5);
  expect(parseLongVideoPromptResult(raw, plan).segments).toHaveLength(12);
  expect(JSON.stringify(before.mock.calls)).toContain("LOCAL times 0–10s");
});
it("stops on malformed planning instead of producing a partial task package", async () => {
  const { request } = fixture(); const owner = { chat: vi.fn(async () => '{"summary":"incomplete","segments":[]}') };
  await expect(enhanceLongVideoWithStrata(request, createDefaultState().settings, owner, new AbortController().signal, vi.fn(), async () => {})).rejects.toThrow(/结构/);
  expect(owner.chat).toHaveBeenCalledOnce();
});

it("keeps planner/detail requests, page identities and output identical across UI languages", async () => {
  const { plan, request } = fixture(), requests: unknown[][] = [], outputs: string[] = [];
  for (const uiLocale of ["zh-CN", "en-US", "zh-TW"] as const) {
    let call = 0; const captured: unknown[] = [], progress = vi.fn();
    const owner = { chat: vi.fn(async (body) => {
      captured.push(body);
      if (!call++) return JSON.stringify({ summary: "保留用户故事", segments: plan.segments.map(p => ({ pageId: p.pageId, outline: "Grounded event order" })) });
      return JSON.stringify({ segments: plan.segments.slice((call - 2) * 3, (call - 1) * 3).map(p => ({ pageId: p.pageId, text: "用户生成内容 stays unchanged" })) });
    }) };
    outputs.push(await enhanceLongVideoWithStrata(request, { ...createDefaultState().settings, uiLocale }, owner, new AbortController().signal, progress, async () => {}));
    requests.push(captured);
    expect(owner.chat).toHaveBeenCalledTimes(5);
    expect(progress.mock.calls[0]![2]).toContain(uiLocale === "en-US" ? "Planning the complete film" : uiLocale === "zh-TW" ? "正在規劃整片故事" : "正在规划整片故事");
    expect(progress.mock.calls.at(-1)![2]).toContain(uiLocale === "en-US" ? "Checking the complete script" : uiLocale === "zh-TW" ? "正在核對整包腳本" : "正在核对整包脚本");
  }
  expect(requests[1]).toEqual(requests[0]); expect(requests[2]).toEqual(requests[0]);
  expect(outputs[1]).toBe(outputs[0]); expect(outputs[2]).toBe(outputs[0]);
  expect(JSON.stringify(requests[0])).toContain("LOCAL times 0–10s");
});
