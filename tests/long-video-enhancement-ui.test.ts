// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createJourney } from "./harness/create-journey";
import { scriptPageText } from "../src/core/long-video/script";
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
