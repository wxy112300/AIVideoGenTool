import { afterEach, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { createLongVideoLayout, proposeLongVideoExtension } from "../src/core/long-video/layout";
import { withPromptExtensionMedia } from "../electron/services/prompt-extension-media";
import { renderRichPromptHtml } from "../src/renderer/pages/create/rich-prompt";
import { createLongVideoScript, compileLongVideoPrompts, editLongVideoScript, freezeLongVideoScript, scriptPageText } from "../src/core/long-video/script";
import { applyLongVideoPromptResult, longVideoPromptRequest, parseLongVideoPromptResult } from "../src/core/long-video/enhancement";
import { enhanceLongVideoWithStrata } from "../electron/services/long-video-prompt";
import type { EnhanceRequest } from "../src/types";
import { compileContinuumDetailText, continuumDetailFormatIssues, continuumOmitsScore, formatContinuumDetail, parseContinuumChunkBlocks } from "../src/core/prompts/h3/continuum";

vi.mock("../electron/services/strata-prompt.js", () => ({
  buildStrataPromptRequest: async () => ({ messages: [], modelId: "strata/test", maxTokens: 8192, contextSize: 32768, temperature: 0.7 }),
  StrataPromptValidationError: class extends Error {}
}));
afterEach(() => vi.restoreAllMocks());

const chunkBlock = (pageId: string, body: string, soundscape = "Street traffic.", music = "N/A") =>
  `=== CHUNK ${pageId} ===\nintegrated_multimodal_description: ${body}\noverall_soundscape: ${soundscape}\nnon_diegetic_music: ${music}`;

function fixture() {
  let n = 0;
  const plan = longVideoPromptRequest(createLongVideoScript(createLongVideoLayout(120, 12), () => `page-${++n}`, "Street story"));
  return { plan, request: { prompt: "Street story", modelId: "minimax_h3_fl2va", mode: "h3-vision", longVideo: plan } as EnhanceRequest };
}

it("recognizes music in a list of exclusions without treating a later music request as excluded", () => {
  expect(continuumOmitsScore("没有撞击、降落、对白、旁白和配乐；螺旋桨声贯穿。")).toBe(true);
  expect(continuumOmitsScore("沒有新角色、對白及配樂。")).toBe(true);
  expect(continuumOmitsScore("没有对白，配乐保持低调。")).toBe(false);
});

it("compiles authored sibling sound fields into the single sampler string without inventing or duplicating fields", () => {
  const body = "[Shot 1] The dog finds the bag.";
  const text = compileContinuumDetailText({ text: body, overall_soundscape: "Paws on pavement.", non_diegetic_music: "N/A" });
  expect(text).toBe(`integrated_multimodal_description: ${body}\n\noverall_soundscape: Paws on pavement.\n\nnon_diegetic_music: N/A`);
  expect(compileContinuumDetailText({ text, overall_soundscape: "Paws on pavement.", non_diegetic_music: "N/A" })).toBe(text);
  expect(compileContinuumDetailText({ text: body })).toBe(body);
});

it("allocates pure user-language storyboard + storyBible and expands up to 6 chunks in ONE cohesive streaming pass", async () => {
  let id = 0;
  const nextId = () => `story-${++id}`;
  const script = createLongVideoScript(createLongVideoLayout(60, 6), nextId, "骑手弄丢了黄色午饭袋，后来在排水沟旁找到并与路人分享。");
  const allocate = longVideoPromptRequest(script, undefined, "allocate");
  const settings = createDefaultState().settings;
  const allocator = {
    chat: vi.fn(async body => {
      expect(body.presencePenalty).toBe(0.2);
      return JSON.stringify({
        bible: { cast: "穿黑夹克的骑手，黄色纸袋", setting: "桥下涂鸦街区，自然阴天光", sound: "低沉车流，无配乐" },
        segments: allocate.segments.map((page, index) => ({
          pageId: page.pageId,
          transition: index === 0 ? "opening" : "continue",
          action: `第 ${index + 1} 段动作推进`,
          camera: "中景缓慢跟拍",
          audio: index === 2 ? "骑手说：找到了！" : "",
          endState: `第 ${index + 1} 段末保持向前动作`
        }))
      });
    })
  };
  const allocatedRaw = await enhanceLongVideoWithStrata(
    { prompt: allocate.brief.text, modelId: "minimax_h3_fl2va", mode: "h3-vision", h3PromptPreset: "detailed-cinematic", longVideo: allocate } as EnhanceRequest,
    settings, allocator, new AbortController().signal, vi.fn(), async () => {}
  );
  const allocated = applyLongVideoPromptResult(script, allocate, allocatedRaw, nextId);
  expect(allocator.chat).toHaveBeenCalledOnce();
  expect(allocated.storyBible).toContain("穿黑夹克的骑手");
  expect(scriptPageText(allocated.segments[0]!)).toBe("[开场] 画面：第 1 段动作推进\n镜头：中景缓慢跟拍\n段尾：第 1 段末保持向前动作");
  expect(scriptPageText(allocated.segments[2]!)).toContain("声音：骑手说：找到了！");
  expect(scriptPageText(allocated.segments[1]!)).not.toMatch(/Handoff|Outgoing/u);

  const edited = editLongVideoScript(allocated, [{ pageId: allocate.segments[0]!.pageId, text: "[开场] 画面：骑手扶稳自己的摩托车。" }], allocated.revision, "user", nextId);
  const expand = longVideoPromptRequest(edited, undefined, "expand");
  expect(expand.storyBible).toContain("穿黑夹克的骑手");
  expect(expand.segments[0]!.userEditedDirection).toBe(true);

  const streamed: string[] = [];
  const writer = {
    chat: vi.fn(async (body, _signal, onText) => {
      const payload = JSON.stringify(body.messages);
      expect(payload).toContain("STORY BIBLE:");
      expect(payload).toContain("骑手扶稳自己的摩托车");
      expect(payload).not.toContain("700 grounded words");
      expect(payload).not.toContain("minimum");
      const blocks = expand.segments.map((p, i) =>
        chunkBlock(p.pageId, `[Shot 1] ${i > 0 ? `Continuation of Chunk ${i}. ` : ""}Concise concrete action ${i + 1}.`)
      );
      const full = blocks.join("\n\n");
      for (const block of blocks) onText?.(`${block}\n\n`);
      return full;
    })
  };
  const progress = vi.fn((_stage, _pct, _msg, pageEvent) => {
    if (pageEvent?.segment) streamed.push(pageEvent.segment.pageId);
  });
  const expandedRaw = await enhanceLongVideoWithStrata(
    { prompt: expand.brief.text, modelId: "minimax_h3_fl2va", mode: "h3-vision", h3PromptPreset: "detailed-cinematic", longVideo: expand } as EnhanceRequest,
    settings, writer, new AbortController().signal, progress, async () => {}
  );
  // 6 chunks completed in ONE single cohesive Strata call, with zero word-count bloat retries!
  expect(writer.chat).toHaveBeenCalledOnce();
  expect(streamed).toEqual(expand.segments.map(p => p.pageId));
  const finished = applyLongVideoPromptResult(edited, expand, expandedRaw, nextId);
  const compiled = compileLongVideoPrompts(freezeLongVideoScript(finished));
  expect(compiled).toHaveLength(6);
  expect(compiled[0]).toContain("[Shot 1] Concise concrete action 1.");
  expect(compiled[1]).toContain("[Shot 1] Continuation of Chunk 1. Concise concrete action 2.");
});

it("gives a middle-page rewrite the exact current direction and both adjacent edits without word-count bloat", async () => {
  const { plan, request } = fixture();
  const [older, previous, target, next, unrelated] = plan.segments;
  const targeted = { ...plan, operation: "expand" as const, targetPageId: target!.pageId, storyBible: "角色：骑手与黑狗" };
  previous!.text = "integrated_multimodal_description: [Shot 1] The rider crosses the yard.\n\nShe grips the same handle with her left hand and is still pulling it right.\n\noverall_soundscape: Wind.\n\nnon_diegetic_music: N/A";
  previous!.locked = true;
  older!.text = "[开场] 画面：The rider sets out before dawn.\n段尾：The yellow bag remains beside the curb.";
  target!.text = "Hold a static low angle. The same motorcycle rolls into the road.";
  target!.outline = "A second motorcycle arrives.";
  next!.text = "The rider kneels beside the stopped motorcycle.\n\nShe retrieves a bag.";
  unrelated!.text = "Unrelated scene with lengthy and distracting stage directions.";
  const writer = {
    chat: vi.fn(async () => "integrated_multimodal_description: [Shot 1] Continuation of Chunk 2. The camera holds low as the motorcycle rolls forward.\noverall_soundscape: Wind.\nnon_diegetic_music: N/A")
  };
  await enhanceLongVideoWithStrata({ ...request, longVideo: targeted, h3PromptPreset: "detailed-cinematic" },
    createDefaultState().settings, writer, new AbortController().signal, vi.fn(), async () => {});
  // Concise valid prompt is accepted immediately without forcing a second bloat rewrite!
  expect(writer.chat).toHaveBeenCalledOnce();
  const sent = JSON.stringify(writer.chat.mock.calls);
  expect(sent).toContain("STORY BIBLE:");
  expect(sent).toContain(target!.text);
  expect(sent).toContain("She grips the same handle with her left hand and is still pulling it right.");
  expect(sent).toContain("previousAudio");
  expect(sent).toContain("Wind.");
  expect(sent).toContain("The rider kneels beside the stopped motorcycle.");
  expect(sent).not.toContain(unrelated!.text);
});

it("uses ONE continuous multi-turn conversation for 12-chunk automatic planning + expansion (1 plan + 2 cohesive turns)", async () => {
  const { plan, request } = fixture();
  const messageLengths: number[] = [];
  let call = 0;
  const owner = {
    chat: vi.fn(async (body, _signal, _delta, onBudget, onReasoning) => {
      onBudget?.(24576);
      onReasoning?.(30);
      messageLengths.push(body.messages.length);
      call++;
      if (call === 1) {
        return JSON.stringify({
          bible: { cast: "Rider", setting: "Street", sound: "Traffic" },
          segments: plan.segments.map((p, i) => ({
            pageId: p.pageId, transition: i === 0 ? "opening" : "continue",
            action: `Action ${i + 1}`, camera: "Medium track", endState: `End ${i + 1}`
          }))
        });
      }
      const start = (call - 2) * 6;
      return plan.segments.slice(start, start + 6).map((p, i) =>
        chunkBlock(p.pageId, `[Shot 1] ${start + i > 0 ? `Continuation of Chunk ${start + i}. ` : ""}Beat ${start + i + 1}.`)
      ).join("\n\n");
    })
  };
  const before = vi.fn(async () => {});
  const progress = vi.fn();
  const raw = await enhanceLongVideoWithStrata(request, createDefaultState().settings, owner, new AbortController().signal, progress, before);
  // 1 allocation + 2 cohesive multi-turn batches (6 + 6) = 3 total calls instead of 5–13!
  expect(owner.chat).toHaveBeenCalledTimes(3);
  expect(messageLengths).toEqual([2, 2, 4]); // Turn 2 preserves Turn 1 [system, user, assistant, user]!
  expect(parseLongVideoPromptResult(raw, plan).segments).toHaveLength(12);
  expect(progress.mock.calls.some(c => String(c[2]).includes("24576"))).toBe(true);
});

it("repairs ONLY a malformed chunk in a cohesive batch without discarding healthy chunks", async () => {
  let n = 0;
  const id = () => `repair-${++n}`;
  const draft = createLongVideoScript(createLongVideoLayout(10, 2), id, "Hand over the bag.");
  const script = editLongVideoScript(draft, [
    { pageId: draft.segments[0]!.id, text: "First beat", stage: "allocation" },
    { pageId: draft.segments[1]!.id, text: "Second beat", stage: "allocation" }
  ], 0, "user", id);
  const expand = longVideoPromptRequest(script, undefined, "expand");
  let call = 0;
  const owner = {
    chat: vi.fn(async () => {
      call++;
      if (call === 1) {
        return [
          chunkBlock(expand.segments[0]!.pageId, "[Shot 1] The rider steps up and holds the yellow bag."),
          `=== CHUNK ${expand.segments[1]!.pageId} ===\nintegrated_multimodal_description: [Shot 1] At 00:08.500, she hands over the bag.`
        ].join("\n\n");
      }
      return "integrated_multimodal_description: [Shot 1] Continuation of Chunk 1. At 00:02.000, she hands over the yellow bag.\noverall_soundscape: Paper rustles.\nnon_diegetic_music: N/A";
    })
  };
  const raw = await enhanceLongVideoWithStrata(
    { prompt: expand.brief.text, modelId: "minimax_h3_fl2va", mode: "h3-vision", longVideo: expand } as EnhanceRequest,
    createDefaultState().settings, owner, new AbortController().signal, vi.fn(), async () => {}
  );
  expect(owner.chat).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(owner.chat.mock.calls[1])).toContain("Use only local timecodes inside 0–5s");
  const parsed = parseLongVideoPromptResult(raw, expand);
  expect(parsed.segments[0]!.text).toContain("holds the yellow bag");
  expect(parsed.segments[1]!.text).toContain("At 00:02.000");
  expect(continuumDetailFormatIssues(parsed.segments[1]!.text, 5)).toEqual([]);
});

it("validates authored cuts, shot ordering, and legacy <<MARKER>> normalization cleanly", () => {
  const prompt = (action: string) => `integrated_multimodal_description: [Shot 1] The camera follows the moving hand. ${action}\n\noverall_soundscape: Wind.\n\nnon_diegetic_music: N/A`;
  expect(continuumDetailFormatIssues(prompt("At local time 02.00s, the camera cuts from the wide shot to the hand."), 6)).toHaveLength(1);
  expect(continuumDetailFormatIssues(prompt("[Shot 2] At 00:02.000, the camera cuts to the hand."), 6)).toEqual([]);
  expect(continuumDetailFormatIssues(prompt("[Shot 2] At 00:04.000, the camera cuts to the hand. [Shot 3] At 00:03.000, it cuts back."), 6)).toHaveLength(1);
  expect(continuumDetailFormatIssues(prompt("The camera pushes closer and follows the hand through the movement."), 6)).toEqual([]);
  const reversed = "Continuation of Chunk 1.\n<<OPENING>>\n[Shot 1] At 00:00.000, the camera follows the moving hand.\n<<ACTION>>\nAt 00:02.500, [Shot 2] the camera cuts to the hand.\n<<HANDOFF>>\nThe hand is still.\n<<SOUNDSCAPE>>\nWind.\n<<MUSIC>>\nN/A";
  const compiled = formatContinuumDetail(reversed);
  expect(compiled).toContain("[Shot 2] At 00:02.500, the camera cuts to the hand.");
  expect(compiled).toContain("[Shot 1] Continuation of Chunk 1. The camera follows");
  expect(continuumDetailFormatIssues(compiled!, 5)).toEqual([]);
  expect(parseContinuumChunkBlocks("=== CHUNK a1 ===\nhello\n=== CHUNK a2 ===\nworld")).toEqual([
    { pageId: "a1", rawText: "hello" },
    { pageId: "a2", rawText: "world" }
  ]);
});

it("compiles an explicitly score-free segment with an empty music field without a second model request", async () => {
  const { plan, request } = fixture();
  const target = {
    ...plan, operation: "expand" as const, targetPageId: plan.segments[0]!.pageId,
    brief: { ...plan.brief, text: "全片不加旁白、配乐或突然换光。" },
    segments: plan.segments.map(page => ({ ...page, text: "The mechanic reaches for the hood." }))
  };
  const raw = "integrated_multimodal_description: [Shot 1] The hood is open and he reaches for the edge.\noverall_soundscape: The fan keeps humming.\nnon_diegetic_music:";
  const owner = { chat: vi.fn(async () => raw) };
  const encoded = await enhanceLongVideoWithStrata({ ...request, longVideo: target, h3PromptPreset: "official-storyboard" },
    createDefaultState().settings, owner, new AbortController().signal, vi.fn(), async () => {});
  expect(owner.chat).toHaveBeenCalledOnce();
  expect(parseLongVideoPromptResult(encoded, target).segments[0]?.text).toContain("non_diegetic_music: N/A");
});

it("stops on malformed planning instead of producing a partial task package", async () => {
  const { request } = fixture();
  const owner = { chat: vi.fn(async () => '{"summary":"incomplete","segments":[]}') };
  await expect(enhanceLongVideoWithStrata(request, createDefaultState().settings, owner, new AbortController().signal, vi.fn(), async () => {})).rejects.toThrow(/结构/);
  expect(owner.chat).toHaveBeenCalledOnce();
});

it("uses global chunk numbering, previousChunkNumber, and real tail-frame calibration on Run extension", async () => {
  let n = 0;
  const id = () => `ext-p-${++n}`;
  const layout = proposeLongVideoExtension(10, 2, 5).layout;
  const base = createLongVideoScript(layout, id, "Continue walking out to the rainy street.");
  const script = editLongVideoScript(base, [
    { pageId: base.segments[0]!.id, text: "Step through the doorway.", stage: "allocation" },
    { pageId: base.segments[1]!.id, text: "Pause on the wet steps.", stage: "allocation" }
  ], 0, "user", id);
  const expand = longVideoPromptRequest(script, undefined, "expand");
  const owner = {
    chat: vi.fn(async () => [
      chunkBlock(expand.segments[0]!.pageId, "[Shot 1] Continuation of Chunk 2. The man steps through the doorway."),
      chunkBlock(expand.segments[1]!.pageId, "[Shot 1] Continuation of Chunk 3. He pauses on the wet concrete steps.")
    ].join("\n\n"))
  };
  let seenContext = "";
  const cleanup = vi.fn(async () => {});
  const encoded = await withPromptExtensionMedia(
    {
      prompt: expand.brief.text,
      modelId: "minimax_h3_continuum",
      mode: "h3-vision",
      origin: "video-extension",
      h3PromptMode: "T2VA",
      longVideo: expand,
      extensionSource: { filePath: "C:/fixture/accepted-run.mp4", trimStartSeconds: 0, trimEndSeconds: 10 },
      referenceContext: "[Accepted Chunk 2] He reaches for the brass knob."
    } as EnhanceRequest,
    "op-ext",
    new AbortController().signal,
    async prepared => {
      seenContext = prepared.referenceContext ?? "";
      return enhanceLongVideoWithStrata(
        { ...prepared, imagePath: undefined, imagePaths: [] },
        createDefaultState().settings, owner, new AbortController().signal, vi.fn(), async () => {}
      );
    },
    { prepareFrame: async () => ({ filePath: "C:/tmp/tail-frame.png", cleanup }) }
  );
  expect(cleanup).toHaveBeenCalledOnce();
  expect(seenContext).toContain("real tail-frame visual calibration");
  expect(seenContext).toContain("accepted Chunk 2");
  expect(seenContext).toContain("Continuation of Chunk 2.");
  const userMsg = String(owner.chat.mock.calls[0]?.[0]?.messages?.[1]?.content ?? "");
  expect(userMsg).toContain('"chunkNumber":3');
  expect(userMsg).toContain('"previousChunkNumber":2');
  expect(userMsg).toContain('"chunkNumber":4');
  const parsed = parseLongVideoPromptResult(encoded, expand);
  expect(parsed.segments[0]!.text).toContain("Continuation of Chunk 2.");
  expect(parsed.segments[1]!.text).toContain("Continuation of Chunk 3.");
});

it("highlights Continuum V3.9 @R1..@R9 tokens in rich prompt rendering", () => {
  const html = renderRichPromptHtml("integrated_multimodal_description: [Shot 1] @R1 hands the key to @R3.");
  expect(html).toContain('<span class="create-rich-ref">@R1</span>');
  expect(html).toContain('<span class="create-rich-ref">@R3</span>');
});

it("injects skills selected during Long-Video Allocation into Detail Writing with zero extra turns", async () => {
  let id = 0;
  const script = createLongVideoScript(createLongVideoLayout(10, 2), () => `sk-page-${++id}`, "She walks steadily across the surface.");
  const plan = longVideoPromptRequest(script);
  let call = 0;
  let detailSystemPrompt = "";
  const owner = {
    chat: vi.fn(async (body) => {
      call += 1;
      if (call === 1) {
        expect(String(body.messages[0]?.content ?? "")).toContain("OPTIONAL CRAFT SKILLS NOT YET LOADED");
        return JSON.stringify({
          bible: { cast: "Scaled-down adult woman", setting: "Anime tabletop", sound: "Soft taps" },
          skills: ["scale-world-craft", "stylized-animation-craft", "unknown-skill-id"],
          segments: plan.segments.map((p, i) => ({
            pageId: p.pageId,
            transition: i === 0 ? "opening" : "continue",
            action: `Beat ${i + 1}`,
            camera: "Low macro follow",
            endState: `End ${i + 1}`
          }))
        });
      }
      detailSystemPrompt = String(body.messages[0]?.content ?? "");
      return plan.segments.map((p, i) =>
        chunkBlock(p.pageId, `[Shot 1] ${i > 0 ? `Continuation of Chunk ${i}. ` : ""}She steps across the tabletop.`)
      ).join("\n\n");
    })
  };
  await enhanceLongVideoWithStrata(
    { prompt: plan.brief.text, modelId: "minimax_h3_continuum", mode: "h3-vision", longVideo: plan } as EnhanceRequest,
    createDefaultState().settings, owner, new AbortController().signal, vi.fn(), async () => {}
  );
  // Allocation + Detail = 2 calls total (zero extra turn for skill loading)
  expect(owner.chat).toHaveBeenCalledTimes(2);
  expect(detailSystemPrompt).toContain("Scale Difference, World Physics & Giant Interaction");
  expect(detailSystemPrompt).toContain("Stylized Medium & Animation Consistency Lock");
});
