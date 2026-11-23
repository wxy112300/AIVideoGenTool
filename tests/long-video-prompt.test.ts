import { afterEach, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { createLongVideoLayout } from "../src/core/long-video/layout";
import { createLongVideoScript, compileLongVideoPrompts, editLongVideoScript, freezeLongVideoScript, scriptPageText } from "../src/core/long-video/script";
import { applyLongVideoPromptResult, longVideoPromptRequest, parseLongVideoPromptResult } from "../src/core/long-video/enhancement";
import { enhanceLongVideoWithStrata } from "../electron/services/long-video-prompt";
import type { EnhanceRequest } from "../src/types";
import { compileContinuumDetailText, continuumDetailFormatIssues, continuumOmitsScore, formatContinuumDetail } from "../src/core/prompts/h3/continuum";
vi.mock("../electron/services/strata-prompt.js", () => ({
  buildStrataPromptRequest: async () => ({ messages: [], modelId: "strata/test", maxTokens: 8192, contextSize: 32768, temperature: 0.7 }),
  StrataPromptValidationError: class extends Error {}
}));
afterEach(() => vi.restoreAllMocks());
it("recognizes music in a list of exclusions without treating a later music request as excluded", () => {
  expect(continuumOmitsScore("没有撞击、降落、对白、旁白和配乐；螺旋桨声贯穿。")).toBe(true);
  expect(continuumOmitsScore("沒有新角色、對白及配樂。")).toBe(true);
  expect(continuumOmitsScore("没有对白，配乐保持低调。")).toBe(false);
});
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
  expect(captured[2]).toContain("A mistaken accusation ends in a shared meal.");
  expect(captured[2]).not.toContain("Entering state 0");
  expect(captured[2]).not.toContain("startSeconds");
  const adopted = applyLongVideoPromptResult(script, plan, raw, () => `adopted-${++id}`);
  expect(compileLongVideoPrompts(freezeLongVideoScript(adopted))).toEqual(prompts.map(prompt => prompt.replaceAll("\n", "\n\n")));
  expect(adopted.segments.every(p => p.versions.at(-1)?.source === "model")).toBe(true);
  expect(adopted.brief).toEqual(script.brief);
  expect(script.segments.every(p => p.versions.length === 1)).toBe(true);
});
function fixture() { let n = 0; const plan = longVideoPromptRequest(createLongVideoScript(createLongVideoLayout(120, 12), () => `page-${++n}`, "Street story"));
  return { plan, request: { prompt: "Street story", modelId: "minimax_h3_fl2va", mode: "h3-vision", longVideo: plan } as EnhanceRequest }; }
it("uses one allocation call and then one detailed call per edited segment without replanning", async () => {
  let n = 0;
  const id = () => `two-step-${++n}`;
  const script = createLongVideoScript(createLongVideoLayout(20, 2), id, "A rider loses her lunch. She finds the lunchbox at the curb.");
  const allocate = longVideoPromptRequest(script, undefined, "allocate");
  const settings = createDefaultState().settings;
  const send = (longVideo: typeof allocate, owner: Parameters<typeof enhanceLongVideoWithStrata>[2]) =>
    enhanceLongVideoWithStrata({ prompt: allocate.brief.text, modelId: "minimax_h3_fl2va", mode: "h3-vision",
      h3PromptPreset: "detailed-cinematic", longVideo } as EnhanceRequest, settings, owner, new AbortController().signal, vi.fn(), async () => {});
  const allocator = { chat: vi.fn(async (_body) => JSON.stringify({ segments: allocate.segments.map((page, index) => ({
    pageId: page.pageId, opening: `Starting state ${index}`, development: `Beat ${index}`, handoff: `Outgoing state ${index}`,
    suggestion: index === 1 ? "Street light turns on" : undefined,
    sourceRequirements: index === 0 ? ["A rider loses her lunch."] : [
      "She finds the lunchbox at the curb.", "The lunchbox is red.", "She finds the lunchbox at the curb."
    ]
  })) })) };
  const allocated = applyLongVideoPromptResult(script, allocate, await send(allocate, allocator), id);
  expect(allocator.chat).toHaveBeenCalledOnce();
  expect(JSON.stringify(allocator.chat.mock.calls)).toContain("the next opening inherits the preceding handoff");
  expect(scriptPageText(allocated.segments[1]!)).toBe("开场: Starting state 1\n\n推进: Beat 1\n\n原文要求:\n- She finds the lunchbox at the curb.\n\nAI 建议: Street light turns on\n\n交接: Outgoing state 1");
  expect(JSON.stringify(allocator.chat.mock.calls)).not.toContain("Prose style");
  const edited = editLongVideoScript(allocated, [{ pageId: allocate.segments[0]!.pageId, text: "Her own motorbike rolls forward." }], allocated.revision, "user", id);
  const expand = longVideoPromptRequest(edited, undefined, "expand");
  expect(expand.segments.map(p => p.userEditedDirection)).toEqual([true, undefined]);
  const detail = (index: number) => `Opening of shot ${index}. ${"The rider steadies the motorbike as its wheels settle against the curb. ".repeat(32).trim()}\n\nHer left hand is still on the original motorbike's handlebar.`;
  let calls = 0;
  const writer = { chat: vi.fn(async (_body) => JSON.stringify({ segments: [{ pageId: expand.segments[calls]!.pageId,
    text: detail(++calls), overall_soundscape: "Street traffic.", non_diegetic_music: "N/A" }] })) };
  const progress = vi.fn();
  const finished = applyLongVideoPromptResult(edited, expand, await enhanceLongVideoWithStrata({
    ...fixture().request, h3PromptPreset: "detailed-cinematic", longVideo: expand
  }, settings, writer, new AbortController().signal, progress, async () => {}), id);
  expect(writer.chat).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(writer.chat.mock.calls[0])).toContain("Her own motorbike rolls forward.");
  expect(JSON.stringify(writer.chat.mock.calls[0])).toContain("approximately 700 grounded words");
  expect(JSON.stringify(writer.chat.mock.calls[1])).toContain("Her left hand is still on the original motorbike's handlebar.");
  expect(JSON.stringify(writer.chat.mock.calls[1])).toContain("原文要求");
  expect(JSON.stringify(writer.chat.mock.calls[1])).toContain(allocate.brief.text);
  expect(JSON.stringify(writer.chat.mock.calls[1])).not.toContain("Opening of shot 1");
  expect(progress.mock.calls.flatMap(call => call[3] ? [call[3].segment.pageId] : [])).toEqual(expand.segments.map(page => page.pageId));
  expect(compileLongVideoPrompts(freezeLongVideoScript(finished))).toEqual([1, 2].map(i =>
    `integrated_multimodal_description: ${detail(i)}\n\noverall_soundscape: Street traffic.\n\nnon_diegetic_music: N/A`));
  expect(JSON.stringify(writer.chat.mock.calls)).not.toContain("startSeconds");
});
it("gives a middle-page rewrite the exact current direction and both adjacent edits", async () => {
  const { plan, request } = fixture();
  const [older, previous, target, next, unrelated] = plan.segments;
  const targeted = { ...plan, operation: "expand" as const, targetPageId: target!.pageId };
  previous!.text = "integrated_multimodal_description: [Shot 1] The rider crosses the yard.\n\nShe grips the same handle with her left hand and is still pulling it right.\n\noverall_soundscape: Wind.\n\nnon_diegetic_music: N/A";
  previous!.locked = true;
  older!.text = "开场: The rider sets out before dawn.\n\n推进: The bag slips from her sleeve.\n\n交接: The yellow bag remains beside the curb.";
  target!.text = "Hold a static low angle. The same motorcycle rolls into the road. Do not add another rider.";
  target!.outline = "A second motorcycle arrives.";
  next!.text = "The rider kneels beside the stopped motorcycle.\n\nShe retrieves a bag.";
  unrelated!.text = "Unrelated scene with lengthy and distracting stage directions.";
  const writer = { chat: vi.fn(async (_body) => "integrated_multimodal_description: [Shot 1] The camera holds.\noverall_soundscape: Wind.\nnon_diegetic_music: N/A") };
  await enhanceLongVideoWithStrata({ ...request, longVideo: targeted, h3PromptPreset: "official-storyboard" },
    createDefaultState().settings, writer, new AbortController().signal, vi.fn(), async () => {});
  expect(writer.chat).toHaveBeenCalledOnce();
  const sent = JSON.stringify(writer.chat.mock.calls);
  expect(sent).toContain(plan.brief.text);
  expect(sent).toContain(target!.text);
  expect(sent).toContain("She grips the same handle with her left hand and is still pulling it right.");
  expect(sent).toContain("previousAudio");
  expect(sent).toContain("Wind.");
  expect(sent).toContain("The yellow bag remains beside the curb.");
  expect(sent).toContain("The bag slips from her sleeve.");
  expect(sent).toContain("The rider kneels beside the stopped motorcycle.");
  for (const text of [target!.outline, unrelated!.text, "sets out before dawn", "crosses the yard", "retrieves a bag"]) expect(sent).not.toContain(text);
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
  expect(parseLongVideoPromptResult(raw, targeted).segments[0]).toMatchObject({ pageId, text: text.replaceAll("\n", "\n\n") });
  expect(progress.mock.calls.filter(call => call[3])).toHaveLength(1);
});
it("compiles marked detail into the same layout for a plain rewrite and automatic planning", async () => {
  const { plan, request } = fixture();
  const pageId = plan.segments[0]!.pageId;
  const opening = "[Shot 1] The rider braces the bike.";
  const action = 'She says (S1) <d>English: "Wait."</d> and reaches for the bag.';
  const handoff = "The bag hangs from her left hand.";
  const marked = ["**<<opening>>**", opening.replace("[Shot 1] ", ""), "", "## <<ACTION>>", action, "", "", "<<HANDOFF>>:", handoff,
    "<<SOUNDSCAPE>>", "Paper rustles.", "<<MUSIC>>", "N/A"].join("\r\n");
  const expected = [`integrated_multimodal_description: ${opening}`, action, handoff,
    "overall_soundscape: Paper rustles.", "non_diegetic_music: N/A"].join("\n\n");
  const send = (longVideo: typeof plan, owner: Parameters<typeof enhanceLongVideoWithStrata>[2], progress = vi.fn()) =>
    enhanceLongVideoWithStrata({ ...request, longVideo, h3PromptPreset: "official-storyboard" }, createDefaultState().settings,
      owner, new AbortController().signal, progress, async () => {});
  const rewrite = { ...plan, operation: "expand" as const, targetPageId: pageId,
    segments: plan.segments.map(page => ({ ...page, text: "The rider picks up the bag." })) };
  const progress = vi.fn();
  const writer = { chat: vi.fn(async () => marked).mockResolvedValueOnce(marked.replace("<<HANDOFF>>:", "")) };
  const rewritten = parseLongVideoPromptResult(await send(rewrite, writer, progress), rewrite);
  expect(writer.chat).toHaveBeenCalledTimes(2);
  expect(rewritten.segments[0]?.text).toBe(expected);
  expect(progress.mock.calls.flatMap(call => call[3] ? [call[3].segment.text] : [])).toEqual([expected]);

  let next = 0;
  const planner = { chat: vi.fn(async () => {
    const batch = plan.segments.slice(next, next + 3);
    next += batch.length;
    return JSON.stringify({ segments: batch.map(page => ({ pageId: page.pageId, text: marked })) });
  }).mockResolvedValueOnce(JSON.stringify({ summary: "A rider picks up her bag.",
    segments: plan.segments.map(page => ({ pageId: page.pageId, outline: "Pick up the bag." })) })) };
  const planned = parseLongVideoPromptResult(await send(plan, planner), plan);
  expect(planned.segments.map(segment => segment.text)).toEqual(plan.segments.map(() => expected));
});
it.each([true, false])("asks once for more timeline detail and only adopts a usable longer revision (%s)", async improve => {
  const { plan, request } = fixture();
  const pageId = plan.segments[0]!.pageId;
  const targeted = { ...plan, operation: "expand" as const, targetPageId: pageId,
    segments: plan.segments.map(page => ({ ...page, text: "The rider steadies her bicycle." })) };
  const opening = "integrated_multimodal_description: [Shot 1] The rider grips the handlebars.";
  const development = "\n\nThe front wheel settles as she eases her weight onto her left foot.";
  const audio = "\noverall_soundscape: The tyre brushes the curb.\nnon_diegetic_music: N/A";
  const original = opening + development + audio;
  const revised = improve ? opening + development + "\n\nShe looks up and holds the bicycle motionless." + audio : opening + audio;
  const owner = { chat: vi.fn(async (_body) => revised).mockResolvedValueOnce(original) };
  const progress = vi.fn();
  const raw = await enhanceLongVideoWithStrata({ ...request, h3PromptMode: "R2V", longVideo: targeted }, createDefaultState().settings, owner,
    new AbortController().signal, progress, async () => {});
  expect(owner.chat).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(owner.chat.mock.calls[0])).toContain("Develop the integrated_multimodal_description timeline toward approximately 940 grounded words");
  expect(JSON.stringify(owner.chat.mock.calls[1])).toContain("The action timeline has only");
  const accepted = parseLongVideoPromptResult(raw, targeted).segments[0]!.text;
  expect(accepted).toBe((improve ? revised : original).replace(audio, audio.replaceAll("\n", "\n\n")));
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
it("requires an H3 shot header for a described local cut while preserving a moving continuous shot", () => {
  const prompt = (action: string) => `integrated_multimodal_description: [Shot 1] The camera follows the moving hand. ${action}\n\noverall_soundscape: Wind.\n\nnon_diegetic_music: N/A`;
  expect(continuumDetailFormatIssues(prompt("At local time 02.00s, the camera cuts from the wide shot to the hand."), 6)).toHaveLength(1);
  expect(continuumDetailFormatIssues(prompt("[Shot 2] At 00:02.000, the camera cuts to the hand."), 6)).toEqual([]);
  expect(continuumDetailFormatIssues(prompt("[Shot 2] At 00:04.000, the camera cuts to the hand. [Shot 3] At 00:03.000, it cuts back."), 6)).toHaveLength(1);
  expect(continuumDetailFormatIssues(prompt("The camera pushes closer and follows the hand through the movement."), 6)).toEqual([]);
  const reversed = "Continuation of Chunk 1.\n<<OPENING>>\n[Shot 1] At 00:00.000, the camera follows the moving hand.\n<<ACTION>>\nAt 00:02.500, [Shot 2] the camera cuts to the hand.\n<<HANDOFF>>\nThe hand is still.\n<<SOUNDSCAPE>>\nWind.\n<<MUSIC>>\nN/A";
  const compiled = formatContinuumDetail(reversed);
  expect(compiled).toContain("[Shot 2] At 00:02.500, the camera cuts to the hand.");
  const prefacedCut = reversed.replace("At 00:02.500, [Shot 2]", "The hand stops. At 00:02.500, [Shot 2]");
  const missingShotLabel = prefacedCut.replace("[Shot 2] ", "");
  expect(formatContinuumDetail(prefacedCut)).toContain("[Shot 2] At 00:02.500, the camera cuts to the hand.");
  expect(formatContinuumDetail(missingShotLabel)).toContain("The hand stops.\n\n[Shot 2] At 00:02.500, the camera cuts to the hand.");
  expect(compiled).toContain("[Shot 1] Continuation of Chunk 1. The camera follows");
  expect(continuumDetailFormatIssues(compiled!, 5)).toEqual([]);
  const missingOpening = reversed.replace("Continuation of Chunk 1.\n<<OPENING>>\n[Shot 1] At 00:00.000, the", "Continuation of Chunk 1. The");
  expect(formatContinuumDetail(missingOpening)).toEqual(compiled);
});
it("compiles an explicitly score-free segment with an empty music field without a second model request", async () => {
  const { plan, request } = fixture();
  const target = { ...plan, operation: "expand" as const, targetPageId: plan.segments[0]!.pageId,
    brief: { ...plan.brief, text: "全片不加旁白、配乐或突然换光。" },
    segments: plan.segments.map(page => ({ ...page, text: "The mechanic reaches for the hood." })) };
  const raw = "<<OPENING>>\nThe hood is open.\n<<ACTION>>\nHe reaches.\n<<HANDOFF>>\nHe holds the edge.\n<<SOUNDSCAPE>>\nThe fan keeps humming.\n<<MUSIC>>";
  const owner = { chat: vi.fn(async () => raw) };
  const encoded = await enhanceLongVideoWithStrata({ ...request, longVideo: target, h3PromptPreset: "official-storyboard" },
    createDefaultState().settings, owner, new AbortController().signal, vi.fn(), async () => {});
  expect(owner.chat).toHaveBeenCalledOnce();
  expect(parseLongVideoPromptResult(encoded, target).segments[0]?.text).toContain("non_diegetic_music: N/A");
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
