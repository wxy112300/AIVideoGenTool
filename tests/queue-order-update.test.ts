// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultDraft, createDefaultState } from "../src/core/defaults";
import { queueTaskFromDraft } from "../src/core/queue-task-factory";
import { createTranslator } from "../src/core/i18n";
import { createQueueAssembly } from "../src/renderer/pages/queue/assembly";
import { applyQueueOrderState, patchQueueOrderDom } from "../src/renderer/pages/queue/order-update";
import { mountQueueDragSort } from "../src/renderer/pages/queue/drag-sort";
import { loadQueueInputPreviews } from "../src/renderer/pages/queue/input-previews";
import type { RendererContext } from "../src/renderer/contracts";

afterEach(() => { document.body.innerHTML = ""; });

async function fixture(running = false, boundary?: number) {
  let state = createDefaultState();
  state.queue = ["first", "second", "third"].map(id => queueTaskFromDraft({ ...createDefaultDraft(), startImagePath: `${id}.png`, workflowPath: "workflow.json" }, state,
    { id: () => id, now: () => new Date("2026-10-30T00:00:00Z"), random: () => .5 }));
  if (running) state.queue[0]!.status = "running";
  state.queuePauseBoundary = boundary;
  const root = document.createElement("main"); document.body.append(root);
  const t = createTranslator("zh-CN").t;
  const readImage = vi.fn(async () => "data:image/png;base64,fixture");
  const context = { root, t, assets: { readImage }, getState: () => state, getRoute: () => ({ page: "queue" }), requestRender: vi.fn(), notify: vi.fn(), reportUserAction: vi.fn() } as unknown as RendererContext;
  const setState = (next: typeof state) => { state = next; };
  const assembly = createQueueAssembly({ getState: () => state, getPerformanceMetrics: () => null,
    getComfyRuntime: () => ({ phase: "stopped", ownership: "unknown", message: "", endpoint: "", updatedAt: "", operationId: 0 }),
    isEnvironmentScanning: () => false, getTaskPreviews: () => ({}), getQueueActionBusy: () => null,
    setState, setPromptRuntimeLoaded: vi.fn(), requestConfirmation: vi.fn(), editTask: vi.fn(), editUpscaleTask: vi.fn(), rememberModalFocus: vi.fn() });
  root.innerHTML = assembly.render(context);
  await loadQueueInputPreviews(context);
  return { root, context, t, readImage, setState, state: () => state };
}

describe("queue order patches", () => {
  it("keeps every decoded thumbnail, prompt and listener on keyboard reorder and repeated acknowledgements", async () => {
    const f = await fixture();
    const cards = [...f.root.querySelectorAll("[data-queue-task-id]")];
    const images = [...f.root.querySelectorAll("[data-queue-input-image]")];
    f.context.application = { reorderTask: vi.fn(async () => ({ ...f.state(), queue: [f.state().queue[1]!, f.state().queue[0]!, f.state().queue[2]!] })) } as unknown as RendererContext["application"];
    const cleanup = mountQueueDragSort(f.context, f.setState);
    try {
      f.root.querySelector<HTMLElement>('[data-queue-drag-handle="first"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      await vi.waitFor(() => expect(f.state().queue[0]!.id).toBe("second"));
      expect(f.context.requestRender).not.toHaveBeenCalled();
      expect([...f.root.querySelectorAll("[data-queue-task-id]")].map(e => (e as HTMLElement).dataset.queueTaskId)).toEqual(["second", "first", "third"]);
      for (const card of cards) expect(card.isConnected).toBe(true);
      for (const image of images) expect(f.root.querySelector(`[data-queue-input-image="${image.getAttribute("data-queue-input-image")}"]`)).toBe(image);
      expect(f.readImage).toHaveBeenCalledTimes(3);
      expect(patchQueueOrderDom(f.root, f.state(), structuredClone(f.state()), f.t)).toBe(true);
      expect(f.root.querySelector('[data-queue-rank-value="first"]')?.textContent).toBe("02");
    } finally { cleanup(); }
  });

  it("updates the divider and deferred badges while preserving the running card and video", async () => {
    const f = await fixture(true, 2), previous = f.state();
    const running = f.root.querySelector('[data-queue-task-id="first"]')!;
    const video = document.createElement("video"); running.append(video);
    const next = { ...previous, queue: [previous.queue[0]!, previous.queue[2]!, previous.queue[1]!], queuePauseBoundary: 2 };
    expect(patchQueueOrderDom(f.root, previous, next, f.t)).toBe(true);
    expect(f.root.querySelector('[data-queue-task-id="first"]')).toBe(running);
    expect(running.querySelector("video")).toBe(video);
    const list = f.root.querySelector("[data-queue-drop-list]")!;
    expect([...list.children].map(e => (e as HTMLElement).dataset.queueTaskId ?? "divider")).toEqual(["third", "divider", "second"]);
    expect(list.querySelector('[data-queue-task-id="second"] .status.deferred')).not.toBeNull();
    expect(list.querySelector('[data-queue-task-id="third"] .status.deferred')).toBeNull();
    expect(patchQueueOrderDom(f.root, next, { ...next, queuePauseBoundary: 1 }, f.t)).toBe(true);
    expect(list.firstElementChild?.hasAttribute("data-queue-boundary-marker")).toBe(true);
  });

  it("falls back for real content/status changes or incomplete DOM instead of leaving stale controls", async () => {
    const f = await fixture(), previous = f.state();
    const changed = structuredClone(previous); changed.queue[0]!.prompt += "changed";
    expect(patchQueueOrderDom(f.root, previous, changed, f.t)).toBe(false);
    const started = structuredClone(previous); started.queue[0]!.status = "running";
    expect(patchQueueOrderDom(f.root, previous, started, f.t)).toBe(false);
    f.root.querySelector('[data-queue-task-id="second"]')!.remove();
    applyQueueOrderState(f.context, f.setState, { ...previous, queue: [...previous.queue].reverse() });
    expect(f.context.requestRender).toHaveBeenCalledOnce();
  });
});
