// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createJourney } from "./harness/create-journey";
import { freezeLongVideoScript, isScriptAllocation, scriptPageText } from "../src/core/long-video/script";
import type { EnhanceRequest } from "../src/types";
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
it("allocates editable beats, expands the edited story, and freezes its versions for History", async () => {
  const h = await fixture();
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
  expect(() => freezeLongVideoScript(h.state().draft.longVideoScript!)).toThrow(/Incomplete/);
  expect(h.application.enqueue).not.toHaveBeenCalled();
  h.element('.create-long-tabs [role="tab"]:nth-child(2)').click();
  h.input(".create-long-editor textarea", "The original bike rolls and the rider stops it.");
  h.element("[data-preview-whole]").click();
  expect(h.root.querySelectorAll(".create-whole-divider")).toHaveLength(11);
  h.element("[data-enhance-long-video]").click();
  await vi.waitFor(() => expect(h.state().draft.longVideoScript!.segments.every(page => !isScriptAllocation(page))).toBe(true));
  expect(h.enhancePrompt.mock.calls.map(([request]) => request.longVideo?.operation)).toEqual(["allocate", "expand"]);
  const script = h.state().draft.longVideoScript!;
  expect(scriptPageText(script.brief)).toBe(brief);
  expect(scriptPageText(script.segments[0]!)).toBe("Detailed action from The original bike rolls and the rider stops it.");
  expect(freezeLongVideoScript(script).pages[1]!.versions?.filter(v => v.stage === "allocation").map(v => v.text)).toEqual(["Beat 0", "The original bike rolls and the rider stops it."]);
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
