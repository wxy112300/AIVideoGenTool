import { afterEach, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { createLongVideoLayout } from "../src/core/long-video/layout";
import { createLongVideoScript, compileLongVideoPrompts, editLongVideoScript, freezeLongVideoScript, scriptPageText } from "../src/core/long-video/script";
import { applyLongVideoPromptResult, longVideoPromptRequest, parseLongVideoPromptResult } from "../src/core/long-video/enhancement";
import { enhanceLongVideoWithStrata } from "../electron/services/long-video-prompt";
import type { EnhanceRequest } from "../src/types";
import { compileContinuumDetailText, continuumDetailFormatIssues } from "../src/core/prompts/h3/continuum";
vi.mock("../electron/services/strata-prompt.js", () => ({
  buildStrataPromptRequest: async () => ({ messages: [], modelId: "strata/test", maxTokens: 8192, contextSize: 32768, temperature: 0.7 }),
  StrataPromptValidationError: class extends Error {}
}));
afterEach(() => vi.restoreAllMocks());
it("compiles authored sibling sound fields into the single sampler string without inventing or duplicating fields", () => {
  const body="[Shot 1] The dog finds the bag.";
  const text=compileContinuumDetailText({text:body,overall_soundscape:"Paws on pavement.",non_diegetic_music:"N/A"});
  expect(text).toBe(`integrated_multimodal_description: ${body}\n\noverall_soundscape: Paws on pavement.\n\nnon_diegetic_music: N/A`);
  expect(compileContinuumDetailText({text,overall_soundscape:"Paws on pavement.",non_diegetic_music:"N/A"})).toBe(text);
  expect(compileContinuumDetailText({text:body})).toBe(body);
});
it("carries the previous batch state and adopts six model pages into six distinct sampler prompts", async () => {
  let id = 0, call = 0;
  const script = createLongVideoScript(createLongVideoLayout(60, 6), () => `story-${++id}`, "A mistaken accusation ends in a shared meal.");
  const plan = longVideoPromptRequest(script);
  const captured: string[] = [];
  const prompts = Array.from({ length: 6 }, (_, i) => `integrated_multimodal_description: [Shot 1] Event ${i + 1}; the rider now holds prop ${i + 1}.\noverall_soundscape: Street traffic.\nnon_diegetic_music: N/A`);
  const owner = { chat: vi.fn(async body => {
    captured.push(JSON.stringify(body.messages));
    if (!call++) return JSON.stringify({ summary: "A rider discovers the accusation was wrong and shares food.", segments: plan.segments.map((p, i) => ({ pageId: p.pageId, outline: `Entering state ${i}; choice and consequence; exit state ${i + 1}` })) });
    const start = (call - 2) * 3;
    return JSON.stringify({ segments: plan.segments.slice(start, start + 3).map((p, i) => ({ pageId: p.pageId, text: prompts[start + i] })) });
  }) };
  const request = { prompt: scriptPageText(script.brief), modelId: "minimax_h3_fl2va", mode: "h3-vision", longVideo: plan } as EnhanceRequest;
  const raw = await enhanceLongVideoWithStrata(request, createDefaultState().settings, owner, new AbortController().signal, vi.fn(), async () => {});
  expect(captured[2]).toContain("prop 3"); // Page 4 must see the adopted boundary from page 3.
  const adopted = applyLongVideoPromptResult(script, plan, raw, () => `adopted-${++id}`);
  expect(compileLongVideoPrompts(freezeLongVideoScript(adopted))).toEqual(prompts);
  expect(adopted.segments.every(p => p.versions.at(-1)?.source === "model")).toBe(true);
  expect(scriptPageText(script.brief)).toBe("A mistaken accusation ends in a shared meal.");
  expect(script.segments.every(p => p.versions.length === 1)).toBe(true);
});
function fixture() { let n = 0; const plan = longVideoPromptRequest(createLongVideoScript(createLongVideoLayout(120, 12), () => `page-${++n}`, "Street story"));
  return { plan, request: { prompt: "Street story", modelId: "minimax_h3_fl2va", mode: "h3-vision", longVideo: plan } as EnhanceRequest }; }
it("uses one allocation call and then one detailed call per edited segment without replanning", async () => {
  let n = 0;
  const id = () => `two-step-${++n}`;
  const script = createLongVideoScript(createLongVideoLayout(20, 2), id, "A rider loses her lunch.");
  const allocate = longVideoPromptRequest(script, undefined, "allocate");
  const settings = createDefaultState().settings;
  const send = (longVideo: typeof allocate, owner: Parameters<typeof enhanceLongVideoWithStrata>[2]) =>
    enhanceLongVideoWithStrata({ prompt: allocate.brief.text, modelId: "minimax_h3_fl2va", mode: "h3-vision",
      h3PromptPreset: "detailed-cinematic", longVideo } as EnhanceRequest, settings, owner, new AbortController().signal, vi.fn(), async () => {});
  const allocator = { chat: vi.fn(async (_body) => JSON.stringify({ segments: allocate.segments.map((page, index) => ({ pageId: page.pageId, text: `Beat ${index}` })) })) };
  const allocated = applyLongVideoPromptResult(script, allocate, await send(allocate, allocator), id);
  expect(allocator.chat).toHaveBeenCalledOnce();
  expect(JSON.stringify(allocator.chat.mock.calls)).toContain("AI-suggestion");
  expect(JSON.stringify(allocator.chat.mock.calls)).not.toContain("Low-priority prose style");
  const edited = editLongVideoScript(allocated, [{ pageId: allocate.segments[0]!.pageId, text: "Her own motorbike rolls forward." }], allocated.revision, "user", id);
  const expand = longVideoPromptRequest(edited, undefined, "expand");
  let calls = 0;
  const writer = { chat: vi.fn(async (_body) => JSON.stringify({ segments: [{ pageId: expand.segments[calls]!.pageId,
    text: `Detailed shot ${++calls}`, overall_soundscape: "Street traffic.", non_diegetic_music: "N/A" }] })) };
  const progress = vi.fn();
  const finished = applyLongVideoPromptResult(edited, expand, await enhanceLongVideoWithStrata({
    ...fixture().request, h3PromptPreset: "detailed-cinematic", longVideo: expand
  }, settings, writer, new AbortController().signal, progress, async () => {}), id);
  expect(writer.chat).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(writer.chat.mock.calls[0])).toContain("Her own motorbike rolls forward.");
  expect(JSON.stringify(writer.chat.mock.calls[0])).toContain("approximately 700 grounded words");
  expect(JSON.stringify(writer.chat.mock.calls[1])).toContain("Detailed shot 1");
  expect(progress.mock.calls.flatMap(call => call[3] ? [call[3].segment.pageId] : [])).toEqual(expand.segments.map(page => page.pageId));
  expect(compileLongVideoPrompts(freezeLongVideoScript(finished))).toEqual([1, 2].map(i =>
    `integrated_multimodal_description: Detailed shot ${i}\n\noverall_soundscape: Street traffic.\n\nnon_diegetic_music: N/A`));
  expect(JSON.stringify(writer.chat.mock.calls)).not.toContain("startSeconds");
});
it("rewrites malformed JSON as one plain-text scene while preserving quotation marks", async () => {
  const { plan, request } = fixture();
  const pageId = plan.segments[0]!.pageId;
  const targeted = { ...plan, operation: "expand" as const, targetPageId: pageId,
    segments: plan.segments.map(page => ({ ...page, text: "The rider says to wait." })) };
  const text = 'integrated_multimodal_description: [Shot 1] The rider says "Wait."\noverall_soundscape: Wind.\nnon_diegetic_music: N/A';
  const progress = vi.fn();
  const owner = { chat: vi.fn(async (_body) => text).mockResolvedValueOnce('{"segments":[{"text":"The rider says "Wait.""') };
  const raw = await enhanceLongVideoWithStrata({ ...request, longVideo: targeted }, createDefaultState().settings, owner,
    new AbortController().signal, progress, async () => {});
  expect(owner.chat).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(owner.chat.mock.calls[0])).toContain("Return this single page as plain text");
  expect(parseLongVideoPromptResult(raw, targeted).segments[0]).toMatchObject({ pageId, text });
  expect(progress.mock.calls.filter(call => call[3])).toHaveLength(1);
});
it("corrects an absolute time cue and missing audio fields before adopting a segment", async () => {
  let n = 0;
  const id = () => `format-${++n}`;
  const draft = createLongVideoScript(createLongVideoLayout(10, 2), id);
  const script = editLongVideoScript(draft, [{ pageId: draft.segments[1]!.id, text: "The rider hands over the yellow bag.", stage: "allocation" }], 0, "user", id);
  const plan = longVideoPromptRequest(script, draft.segments[1]!.id, "expand");
  const raw = (text: string, fields = {}) => JSON.stringify({ segments: [{ pageId: plan.targetPageId, text, ...fields }] });
  const invalid = "[Shot 1] At 00:06.50, the rider holds out the yellow bag.";
  const valid = raw("[Shot 1] At 00:01.50, the rider holds out the yellow bag.", { overall_soundscape: "Paper rustles.", non_diegetic_music: "N/A" });
  const owner = { chat: vi.fn(async (_body) => raw(invalid)).mockResolvedValueOnce(raw(invalid)).mockResolvedValueOnce(valid) };
  const expand = () => enhanceLongVideoWithStrata({ prompt: "", modelId: "minimax_h3_fl2va", mode: "h3-vision", longVideo: plan } as EnhanceRequest,
    createDefaultState().settings, owner, new AbortController().signal, vi.fn(), async () => {});
  const result = parseLongVideoPromptResult(await expand(), plan);
  expect(owner.chat).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(owner.chat.mock.calls[1])).toContain("Correct the following formatting issues");
  expect(JSON.stringify(owner.chat.mock.calls[1])).toContain("Use only local timecodes in 0–5s");
  expect(result.segments[0]!.text).toContain("At 00:01.50");
  expect(continuumDetailFormatIssues(result.segments[0]!.text, 5)).toEqual([]);
  await expect(expand()).rejects.toThrow(/时间或音画字段/);
  expect(owner.chat).toHaveBeenCalledTimes(4);
});
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
it("reports the actual automatic output allowance during planner thinking", async () => {
  const {plan,request}=fixture(); let call=0;
  const progress=vi.fn();
  const owner={chat:vi.fn(async (_body,_signal,_delta,onBudget,onReasoning)=>{
    onBudget?.(24576);onReasoning?.(30);
    if(!call++)return JSON.stringify({summary:"A complete story",segments:plan.segments.map(p=>({pageId:p.pageId,outline:"State handoff"}))});
    return JSON.stringify({segments:plan.segments.slice((call-2)*3,(call-1)*3).map(p=>({pageId:p.pageId,text:"A new action and result"}))});
  })};
  await enhanceLongVideoWithStrata(request,createDefaultState().settings,owner,new AbortController().signal,progress,async()=>{});
  expect(progress.mock.calls.some(call=>String(call[2]).includes("24576"))).toBe(true);
});
it("stops on malformed planning instead of producing a partial task package", async () => {
  const { request } = fixture(); const owner = { chat: vi.fn(async () => '{"summary":"incomplete","segments":[]}') };
  await expect(enhanceLongVideoWithStrata(request, createDefaultState().settings, owner, new AbortController().signal, vi.fn(), async () => {})).rejects.toThrow(/结构/);
  expect(owner.chat).toHaveBeenCalledOnce();
});
it.each([false,true])("merges identical duplicate pages but rejects conflicting text (conflict=%s)", async conflict => {
  const {plan,request}=fixture();let call=0;
  const owner={chat:vi.fn(async()=>{
    if(!call++)return JSON.stringify({summary:"A complete story",segments:plan.segments.map(p=>({pageId:p.pageId,outline:"Entering, action, exit"}))});
    const rows=plan.segments.slice((call-2)*3,(call-1)*3).map(p=>({pageId:p.pageId,text:`Action for ${p.pageId}`}));
    return JSON.stringify({segments:[...rows.toReversed(),{...rows.at(-1)!,...(conflict?{text:"A conflicting replacement"}:{})}]});
  })};
  const result=enhanceLongVideoWithStrata(request,createDefaultState().settings,owner,new AbortController().signal,vi.fn(),async()=>{});
  if(conflict){await expect(result).rejects.toThrow(/详稿/);expect(owner.chat).toHaveBeenCalledTimes(2);}
  else expect(parseLongVideoPromptResult(await result,plan).segments.map(p=>p.pageId)).toEqual(plan.segments.map(p=>p.pageId));
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
