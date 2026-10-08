// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { journeys } from "../scripts/harness/journeys.mjs";
import { inspectAppInRenderer, loopbackWebSocket, parseAppHarnessArgs, runAppAction, taskEvidence } from "../scripts/app-harness.mjs";

afterEach(() => { document.body.innerHTML = ""; vi.unstubAllGlobals(); });

function appFixture(disabled = false) {
  const state = { queueRunning: false, queue: [], history: [], imageHistory: [] };
  document.body.innerHTML = `<button id="enqueue" ${disabled ? "disabled" : ""} data-enqueue-block-reason="请选择参考图">Queue</button>`;
  const button = document.querySelector<HTMLButtonElement>("button")!;
  vi.spyOn(button, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
  Object.defineProperty(window, "studio", { configurable: true, value: { getState: async () => structuredClone(state) } });
  const client = { evaluate: async (expression: string) => new Function("window", "document", `return (${expression})`)(window, document) };
  const options = { action: "enqueue-ui", timeout: 30 };
  return { state, button, client, options };
}

describe("app harness preserves the user-facing gate", () => {
  it("inspects the active prompt branch instead of treating old prompt versions as current input", async () => {
    const h = appFixture();
    Object.assign(h.state, { draft: {
      inputMode: "video", h3ReferenceSlots: [],
      promptVersions: [{ text: "old generation prompt" }], activePromptVersion: 0,
      extensionPromptVersions: [{ text: "old extension" }, { text: "" }], extensionActivePromptVersion: 1
    } });
    Object.assign(window.studio, { getComfyRuntimeState: async () => ({}), getPromptRuntimeState: async () => ({}) });
    expect((await inspectAppInRenderer()).draft.hasPrompt).toBe(false);
  });
  it("fails on disabled enqueue without invoking a click or bypassing the gate", async () => {
    const h = appFixture(true);
    const clicked = vi.fn(); h.button.addEventListener("click", clicked);
    await expect(runAppAction(h.client, h.options)).rejects.toThrow("请选择参考图");
    expect(clicked).not.toHaveBeenCalled();
  });
  it("reports success only after a real click creates a new task, independent of array ordering", async () => {
    const h = appFixture();
    h.state.queue.push({ id: "existing" } as never);
    h.button.addEventListener("click", () => h.state.queue.unshift({ id: "new", status: "waiting" } as never));
    expect(await runAppAction(h.client, h.options)).toMatchObject({ task: { id: "new" }, generationVerified: false });
  });
  it("fails when an enabled button's backend rejects instead of claiming enqueue success", async () => {
    const h = appFixture();
    await expect(runAppAction(h.client, h.options)).rejects.toThrow("UI enqueue");
  });
  it("does not enqueue into a running queue that could immediately consume GPU", async () => {
    const h = appFixture(); h.state.queueRunning = true;
    await expect(runAppAction(h.client, h.options)).rejects.toThrow("Pause queue");
  });
  it("correlates history by task/version identity and keeps upscale separate from the parent output", () => {
    const state = { queue: [{ id: "upscale", status: "completed" }], imageHistory: [], history: [{ id: "asset", taskId: "original", versions: [{ id: "first", kind: "original", files: [] }, { id: "derived", kind: "upscale", taskId: "upscale", files: [{ filename: "derived.mp4" }] }] }] };
    expect(taskEvidence(state, "upscale").outputs).toEqual([{ assetId: "asset", versionId: "derived", files: [{ filename: "derived.mp4" }] }]);
    state.queue = [];
    expect(taskEvidence(state, "upscale")).toMatchObject({ status: "completed", completionSource: "history" });
    expect(() => taskEvidence(state, "missing")).toThrow("Task not found");
  });
  it("fails completion if no history belongs to the task", async () => {
    const h = appFixture(); h.state.queue.push({ id: "new", status: "completed" } as never);
    await expect(runAppAction(h.client, { action: "wait-task", task: "new", timeout: 30 })).rejects.toThrow("no matching history");
  });
});

describe("agent navigation and connection boundaries", () => {
  it("keeps every suggested editing and test path executable", () => {
    for (const journey of journeys) for (const filename of [...journey.paths, ...journey.tests]) expect(existsSync(filename), `${journey.id}: ${filename}`).toBe(true);
  });
  it("rejects invalid action/port and non-loopback or mismatched CDP destinations", () => {
    expect(() => parseAppHarnessArgs(["delete-all"])).toThrow();
    expect(() => parseAppHarnessArgs(["inspect", "--port", "0"])).toThrow();
    expect(() => parseAppHarnessArgs(["wait-task"])).toThrow();
    expect(() => loopbackWebSocket("ws://example.com:9333/devtools/page/a", 9333)).toThrow();
    expect(() => loopbackWebSocket("ws://127.0.0.1:9334/devtools/page/a", 9333)).toThrow();
    expect(loopbackWebSocket("ws://127.0.0.1:9333/devtools/page/a", 9333)).toContain("127.0.0.1");
  });
});
