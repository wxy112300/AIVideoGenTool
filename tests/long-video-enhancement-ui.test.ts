// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createJourney } from "./harness/create-journey";
import { freezeLongVideoScript, isScriptAllocation, scriptPageText } from "../src/core/long-video/script";
import { longVideoPromptTargets } from "../src/core/long-video/enhancement";
import { createNotification } from "../src/renderer/notifications";
import { createNotificationStack } from "../src/renderer/shared/ui/notify";
import type { EnhanceRequest, PromptProgress } from "../src/types";
let journey: Awaited<ReturnType<typeof createJourney>> | undefined;
afterEach(() => { journey?.dispose(); journey = undefined; });
async function fixture() {
  const h = journey = await createJourney({ modelId: "minimax_h3_fl2va", inputMode: "image", startImagePath: "C:/fixture/city.png", endImagePath: "", sourceWidth: 1280, sourceHeight: 720 });
  h.state().settings.promptModelId = "strata/qwen3.8-flash-next-iq3_xxs";
  h.input("#prompt-input", "A complex street story with a blue car, pedestrians and motorcycles.");
  h.input("#generation-mode", "preview", "change");
  h.input("[data-preview-duration-number]", "120");
  h.element("[data-confirm-layout]").click();
  return h;
}
const response = (r: EnhanceRequest) => JSON.stringify({ schemaVersion: 1, scriptId: r.longVideo!.scriptId, revision: r.longVideo!.revision,
  brief: "A complete twelve-part story", segments: r.longVideo!.segments.map((p, i) => ({ pageId: p.pageId, text: `Continuous action ${i}`, outline: `Boundary ${i}` })) });
it("routes the text-only long-video editor to T2VA enhancement", async () => {
  const h = await fixture();
  h.state().draft.startImagePath = "";
  h.enhancePrompt.mockImplementation(async request => response(request));
  h.render();
  h.element("[data-enhance-long-video]").click();
  await vi.waitFor(() => expect(h.enhancePrompt).toHaveBeenCalledWith(expect.objectContaining({
    h3PromptMode: "T2VA", imagePath: undefined, imagePaths: []
  })));
});

it("matches shuffled Picture IDs to the chronological images on the actual long-video enhance button", async () => {
  const h = await fixture();
  h.state().draft.startImagePath = "";
  h.state().draft.h3GuideEditor = { active: true, nextPicture: 10, slots: [
    { picture: 9, mediaPath: "tail.png", seconds: "end" },
    { picture: 2, mediaPath: "later.png", seconds: 10.125 },
    { picture: 7, mediaPath: "earlier.png", seconds: 1 },
    { picture: 8, mediaPath: "", seconds: null }
  ] };
  h.enhancePrompt.mockImplementation(async r => response(r));
  h.render();
  h.element("[data-enhance-long-video]").click();
  await vi.waitFor(() => expect(h.enhancePrompt).toHaveBeenCalledWith(expect.objectContaining({
    h3TimedGuideContext: true, imagePaths: ["earlier.png", "later.png", "tail.png"],
    referenceContext: expect.stringContaining("Attachment 2 = Picture 2: film 10.125s, segment 2 around 0.000s.")
  })));
});
it("queues edited and locked outlines directly and keeps optional expansion and History versions available", async () => {
  const h = await fixture();
  h.scan.customNodes.find(node => node.id === "h3-continuum")!.version = "3.10.2";
  h.scan.customNodes.find(node => node.id === "local-video-studio-h3-av")!.version = "0.4.4";
  h.render();
  expect(h.element("#enqueue").disabled).toBe(true);
  h.enhancePrompt.mockImplementation(async r => {
    const request = r.longVideo!;
    return JSON.stringify({ schemaVersion: 1, scriptId: request.scriptId, revision: request.revision,
      segments: request.segments.map((page, index) => ({
        pageId: page.pageId, outline: page.outline || `Beat ${index}`,
        text: request.operation === "allocate" ? `Beat ${index}` : `Detailed action from ${page.text}`
      })) });
  });
  const brief = scriptPageText(h.state().draft.longVideoScript!.brief);
  const allocate = h.element("[data-allocate-long-video]");
  expect(allocate.querySelector("svg.lucide-list-ordered")).not.toBeNull();
  allocate.click();
  await vi.waitFor(() => expect(h.state().draft.longVideoScript!.segments.every(isScriptAllocation)).toBe(true));
  // Completing allocation from Global automatically switches to Whole view so all beats are immediately visible,
  // while keeping every tab clickable and showing amber 'outline' dots.
  expect(h.state().draft.longVideoScript!.view).toBe("whole");
  expect(h.root.querySelectorAll('[role="tablist"] .create-page-dot[data-state="outline"]')).toHaveLength(12);
  h.element('.create-long-tabs [role="tab"]:nth-child(2)').click();
  expect(h.state().draft.longVideoScript!.view).toBe("segment");
  const edited = "The original bike rolls and the rider stops it.";
  h.input(".create-long-editor textarea", edited);
  h.element("[data-preview-lock]").click();
  expect(h.state().draft.longVideoScript!.segments[0]!.locked).toBe(true);
  await vi.waitFor(() => expect(h.element("#enqueue").disabled).toBe(false));
  h.element("#enqueue").click();
  await vi.waitFor(() => expect(h.state().queue[0]).toMatchObject({
    id: expect.any(String), status: "waiting",
    longVideoPlan: { pages: expect.arrayContaining([{ ...freezeLongVideoScript(h.state().draft.longVideoScript!).pages[1]!, text: edited }]) }
  }));
  const queued = structuredClone(h.state().queue[0]);
  expect(h.enhancePrompt.mock.calls.map(([request]) => request.longVideo?.operation)).toEqual(["allocate"]);
  h.element("[data-preview-lock]").click();
  h.element("[data-preview-whole]").click();
  expect(h.root.querySelectorAll(".create-whole-divider")).toHaveLength(11);
  h.element("[data-enhance-long-video]").click();
  await vi.waitFor(() => expect(h.state().draft.longVideoScript!.segments.every(page => !isScriptAllocation(page))).toBe(true));
  expect(h.enhancePrompt.mock.calls.map(([request]) => request.longVideo?.operation)).toEqual(["allocate", "expand"]);
  const script = h.state().draft.longVideoScript!;
  expect(scriptPageText(script.brief)).toBe(brief);
  expect(scriptPageText(script.segments[0]!)).toBe("Detailed action from The original bike rolls and the rider stops it.");
  expect(freezeLongVideoScript(script).pages[1]!.versions?.filter(v => v.stage === "allocation").map(v => v.text)).toEqual(["Beat 0", "The original bike rolls and the rider stops it."]);
  expect(h.state().queue[0]).toEqual(queued);

  h.element("[data-preview-pages]").click();
  expect(h.element("[data-preview-outline-ref]").hidden).toBe(false);
  expect(h.element("[data-preview-outline-ref]").textContent).toContain(edited);
  const firstPage = structuredClone(script.segments[0]!);
  const otherPages = structuredClone(script.segments.slice(1));
  h.element("#clear-prompt").click();
  expect(h.element<HTMLTextAreaElement>(".create-long-editor textarea").value).toBe(edited);
  expect(h.state().draft.longVideoScript!.segments[0]!.versions).toEqual(firstPage.versions.slice(0, -1));
  h.element("#prompt-prev").click();
  expect(h.element<HTMLTextAreaElement>(".create-long-editor textarea").value).toBe("Beat 0");
  h.element("#prompt-next").click();
  expect(h.element("#prompt-next").disabled).toBe(true);
  const undo = vi.mocked(h.context.notify).mock.calls.at(-1)?.[1]?.actions?.[0];
  h.render();
  await undo!.run();
  expect(h.state().draft.longVideoScript!.segments[0]).toEqual(firstPage);
  expect(h.state().draft.longVideoScript!.segments.slice(1)).toEqual(otherPages);
  expect(h.state().queue[0]).toEqual(queued);
});
it("enhances through the real button and atomically adopts twelve model-authored pages", async () => {
  const h = await fixture();
  const nativeVersions = structuredClone(h.state().draft.promptVersions);
  h.enhancePrompt.mockImplementation(async r => response(r));
  expect(h.element<HTMLButtonElement>("[data-enhance-long-video]").disabled).toBe(false);
  const ids = h.state().draft.longVideoScript!.segments.map(p => p.id);
  h.element("[data-enhance-long-video]").click();
  await vi.waitFor(() => expect(h.enhancePrompt).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(h.state().draft.longVideoScript!.segments[11]!.versions).toHaveLength(2));
  const script = h.state().draft.longVideoScript!;
  expect(script.segments.map(p => p.id)).toEqual(ids);
  expect(scriptPageText(script.segments[11]!)).toBe("Continuous action 11");
  expect(h.state().draft.promptVersions).toEqual(nativeVersions);
  expect(script.layout.requestedSeconds).toBe(120);
});
it("shows each ready expanded segment before the operation ends and keeps it after a later failure", async () => {
  const h = await fixture();
  let receive: ((event: PromptProgress) => void) | undefined;
  const unsubscribe = vi.fn();
  h.context.events.onPromptProgress = callback => { receive = callback; return unsubscribe; };
  h.enhancePrompt.mockImplementationOnce(async r => JSON.stringify({
    schemaVersion: 1, scriptId: r.longVideo!.scriptId, revision: r.longVideo!.revision,
    segments: r.longVideo!.segments.map(page => ({ pageId: page.pageId, text: "An editable beat.", outline: "An editable beat." }))
  }));
  h.element("[data-allocate-long-video]").click();
  await vi.waitFor(() => expect(h.state().draft.longVideoScript!.segments.every(isScriptAllocation)).toBe(true));
  let reject!: (error: Error) => void; let request!: EnhanceRequest;
  h.enhancePrompt.mockImplementationOnce(r => {
    request = r;
    return new Promise((_resolve, fail) => { reject = fail; });
  });
  h.element("[data-enhance-long-video]").click();
  await vi.waitFor(() => expect(request?.longVideo?.operation).toBe("expand"));
  const { scriptId, revision, segments } = request.longVideo!;
  receive!({ longVideoPage: { scriptId, revision, segment: { pageId: segments[0]!.pageId, text: "A finished first scene.", outline: "Beat one" } } } as PromptProgress);
  h.element('.create-long-tabs [role="tab"]:nth-child(2)').click();
  expect(h.element<HTMLTextAreaElement>(".create-long-editor textarea").value).toBe("A finished first scene.");
  expect(isScriptAllocation(h.state().draft.longVideoScript!.segments[1]!)).toBe(true);
  receive!({ longVideoPage: { scriptId, revision, segment: { pageId: segments[1]!.pageId, text: "A finished second scene.", outline: "Beat two" } } } as PromptProgress);
  expect(scriptPageText(h.state().draft.longVideoScript!.segments[1]!)).toBe("A finished second scene.");
  reject(new Error("Error invoking remote method 'prompt:enhance': StrataPromptValidationError: 时间格式无效。"));
  await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledOnce());
  expect(scriptPageText(h.state().draft.longVideoScript!.segments[0]!)).toBe("A finished first scene.");
  expect(scriptPageText(h.state().draft.longVideoScript!.segments[1]!)).toBe("A finished second scene.");
  expect(isScriptAllocation(h.state().draft.longVideoScript!.segments[2]!)).toBe(true);
  expect(h.context.notify).toHaveBeenCalledWith(expect.stringContaining("第 3 段"), expect.objectContaining({
    kind: "error", actions: [expect.objectContaining({ label: "继续扩写 · 第 3 段" })]
  }));
  const [message, options] = vi.mocked(h.context.notify).mock.calls.at(-1)!;
  expect(h.context.notify).not.toHaveBeenCalledWith(expect.stringContaining("StrataPromptValidationError"), expect.anything());
  const firstTwo = structuredClone(h.state().draft.longVideoScript!.segments.slice(0, 2));
  h.render();
  expect(h.element("[data-enhance-long-video]").textContent).toContain("继续扩写 · 第 3 段");
  h.enhancePrompt.mockImplementationOnce(async r => JSON.stringify({
    schemaVersion: 1, scriptId: r.longVideo!.scriptId, revision: r.longVideo!.revision,
    segments: longVideoPromptTargets(r.longVideo!).map(page => ({ pageId: page.pageId, text: "Resumed scene.", outline: page.outline }))
  }));
  const notices = createNotificationStack({ dismissLabel: () => "关闭", changed: vi.fn(), action: (_notice, action) => { void action.run(); } });
  try {
    notices.push(createNotification(1, message, "error", undefined, options?.actions));
    document.querySelector<HTMLButtonElement>('[role="alert"] [data-notification-action="retry-long-video-writing"]')!.click();
  } finally { notices.dispose(); }
  await vi.waitFor(() => expect(h.state().draft.longVideoScript?.pendingExpansion).toBeUndefined());
  expect(h.enhancePrompt.mock.calls.at(-1)![0].longVideo!.targetPageIds).toEqual(segments.slice(2).map(page => page.pageId));
  expect(h.state().draft.longVideoScript!.segments.slice(0, 2)).toEqual(firstTwo);
  expect(scriptPageText(h.state().draft.longVideoScript!.segments[2]!)).toBe("Resumed scene.");
});
it("resumes the first unfinished automatic segment from the saved plan after a model error", async () => {
  const h = await fixture();
  let receive: ((event: PromptProgress) => void) | undefined;
  h.context.events.onPromptProgress = callback => { receive = callback; return vi.fn(); };
  h.enhancePrompt.mockImplementationOnce(async r => {
    const { scriptId, revision, segments } = r.longVideo!;
    for (const page of segments) {
      receive!({ longVideoPage: { scriptId, revision, stage: "allocation",
        segment: { pageId: page.pageId, text: "Planned beat.", outline: "Planned beat." } } } as PromptProgress);
    }
    receive!({ longVideoPage: { scriptId, revision,
      segment: { pageId: segments[0]!.pageId, text: "Finished automatically.", outline: "Planned beat." } } } as PromptProgress);
    throw new Error("Connection interrupted");
  });
  h.element("[data-enhance-long-video]").click();
  await vi.waitFor(() => expect(h.element("[data-enhance-long-video]").textContent).toContain("继续扩写 · 第 2 段"));
  const script = h.state().draft.longVideoScript!;
  expect(scriptPageText(script.segments[0]!)).toBe("Finished automatically.");
  expect(isScriptAllocation(script.segments[1]!)).toBe(true);
  expect(script.pendingExpansion).toEqual(script.segments.slice(1).map(page => page.id));
});
it("keeps typing done during enhancement instead of adopting the obsolete response", async () => {
  const h = await fixture(); let resolve!: (raw: string) => void; let request!: EnhanceRequest;
  h.enhancePrompt.mockImplementation(r => { request = r; return new Promise<string>(done => { resolve = done; }); });
  h.element("[data-enhance-long-video]").click();
  await vi.waitFor(() => expect(h.enhancePrompt).toHaveBeenCalledOnce());
  h.input(".create-long-editor textarea", "A new user decision while inference runs.");
  resolve(response(request));
  await vi.waitFor(() => expect(h.element<HTMLButtonElement>("[data-enhance-long-video]").getAttribute("aria-busy")).toBe("false"));
  expect(h.element<HTMLTextAreaElement>(".create-long-editor textarea").value).toBe("A new user decision while inference runs.");
  expect(h.state().draft.longVideoScript!.segments.every(p => p.versions.length === 1)).toBe(true);
});
it("adopts the complete package after an unrelated full renderer refresh", async () => {
  const h = await fixture(); let resolve!: (raw: string) => void; let request!: EnhanceRequest;
  h.enhancePrompt.mockImplementation(r => { request = r; return new Promise(done => { resolve = done; }); });
  h.element("[data-enhance-long-video]").click();
  await vi.waitFor(() => expect(h.enhancePrompt).toHaveBeenCalledOnce());
  h.render();
  resolve(response(request));
  await vi.waitFor(() => expect(h.state().draft.longVideoScript!.segments.every(p => p.versions.some(v => v.source === "model"))).toBe(true));
  expect(h.state().draft.longVideoScript!.brief.id).toBe(request.longVideo!.scriptId);
  h.element('.create-long-tabs [role="tab"]:nth-child(2)').click();
  expect(h.element<HTMLTextAreaElement>(".create-long-editor textarea").value).toBe("Continuous action 0");
});
it("keeps the existing cancel action reachable from the multi-segment button", async () => {
  const h = await fixture(); let reject!: (error: Error) => void;
  h.enhancePrompt.mockImplementation(() => new Promise((_done, fail) => { reject = fail; }));
  const cancel = vi.fn(async () => { reject(new DOMException("cancelled", "AbortError")); return {ok:true,message:"cancelled"}; });
  h.application.cancelPrompt = cancel;
  h.element("[data-enhance-long-video]").click();
  await vi.waitFor(() => expect(h.enhancePrompt).toHaveBeenCalledOnce());
  expect(h.element<HTMLButtonElement>("[data-enhance-long-video]").disabled).toBe(false);
  h.element("[data-enhance-long-video]").click();
  await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(h.element("[data-enhance-long-video]").getAttribute("aria-busy")).toBe("false"));
  expect(h.state().draft.longVideoScript!.segments.every(p => p.versions.length === 1)).toBe(true);
});

it("renders shared rich syntax highlighting inside Whole View editable blocks", async () => {
  const h = await fixture();
  h.enhancePrompt.mockImplementationOnce(async r => JSON.stringify({
    schemaVersion: 1, scriptId: r.longVideo!.scriptId, revision: r.longVideo!.revision,
    segments: longVideoPromptTargets(r.longVideo!).map((page, index) => ({
      pageId: page.pageId,
      text: `integrated_multimodal_description: [Shot 1] ${index === 0 ? "At 0.00s" : `Continuation of Chunk ${index}.`} <Subject 1> says (S1) <d>[Chinese] 你好</d>.\noverall_soundscape: Wind.\nnon_diegetic_music: N/A`,
      outline: "[连续]\n画面：继续前进。"
    }))
  }));
  h.element("[data-enhance-long-video]").click();
  await vi.waitFor(() => expect(h.state().draft.longVideoScript!.segments[0]!.versions.length).toBe(2));
  h.element("[data-preview-whole]").click();
  const whole = h.element(".create-long-whole");
  expect(whole.hidden).toBe(false);
  expect(whole.querySelectorAll(".create-rich-section").length).toBeGreaterThanOrEqual(6);
  expect(whole.querySelectorAll(".create-rich-continuity").length).toBeGreaterThanOrEqual(1);
  expect(whole.querySelectorAll(".create-rich-ref").length).toBeGreaterThanOrEqual(2);
  expect(whole.querySelectorAll(".create-rich-time").length).toBeGreaterThanOrEqual(2);
  expect(whole.querySelectorAll(".create-rich-say").length).toBeGreaterThanOrEqual(4);
});
