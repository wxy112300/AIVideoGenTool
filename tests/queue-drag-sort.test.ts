// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultDraft, createDefaultState } from "../src/core/defaults";
import { createTranslator } from "../src/core/i18n";
import { queueTaskFromDraft } from "../src/core/queue-task-factory";
import type { RendererContext } from "../src/renderer/contracts";
import { mountQueueDragSort } from "../src/renderer/pages/queue/drag-sort";

const translator = createTranslator("zh-CN");

function pointerEvent(
  type: string,
  options: { pointerId: number; clientX: number; clientY: number; button?: number }
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { configurable: true, value: options.pointerId },
    clientX: { configurable: true, value: options.clientX },
    clientY: { configurable: true, value: options.clientY },
    button: { configurable: true, value: options.button ?? 0 }
  });
  return event;
}

function rect(top: number, height: number, width = 500): DOMRect {
  return {
    left: 0,
    right: width,
    top,
    bottom: top + height,
    width,
    height,
    x: 0,
    y: top,
    toJSON: () => ({})
  } as DOMRect;
}

function createQueueFixture() {
  const root = document.createElement("main");
  const list = document.createElement("div");
  list.dataset.queueDropList = "waiting";
  const first = document.createElement("article");
  first.dataset.queueTaskId = "first";
  first.innerHTML = `<strong data-queue-rank-value="first">01</strong><span data-queue-rank-label="first"></span><button data-queue-drag-handle="first"></button>`;
  const second = document.createElement("article");
  second.dataset.queueTaskId = "second";
  second.innerHTML = `<strong data-queue-rank-value="second">02</strong><span data-queue-rank-label="second"></span>`;
  list.append(first, second);
  root.append(list);
  document.body.append(root);

  vi.spyOn(list, "getBoundingClientRect").mockReturnValue(rect(0, 500));
  vi.spyOn(first, "getBoundingClientRect").mockReturnValue(rect(0, 80));
  vi.spyOn(second, "getBoundingClientRect").mockReturnValue(rect(100, 80));

  const state = createDefaultState();
  const queueTask = (id: string) => queueTaskFromDraft(
    { ...createDefaultDraft(), workflowPath: "workflow.json" },
    state,
    {
      now: () => new Date("2026-08-29T12:00:00.000Z"),
      id: () => id,
      random: () => 0.5
    }
  );
  state.queue = [queueTask("first"), queueTask("second")];
  const reorderTask = vi.fn(async () => state);
  const context: RendererContext = {
    root,
    studio: { reorderTask } as unknown as RendererContext["studio"],
    enhancePrompt: async () => "",
    getState: () => state,
    getRoute: () => ({ page: "queue", creationMode: "image-to-video", historyKind: "video" }),
    getTranslator: () => translator,
    t: translator.t,
    requestRender: vi.fn(),
    navigate: vi.fn(),
    notify: vi.fn(),
    reportUserAction: vi.fn()
  };
  const cleanup = mountQueueDragSort(context, () => undefined);
  return {
    cleanup,
    handle: first.querySelector<HTMLButtonElement>("[data-queue-drag-handle]")!,
    reorderTask
  };
}

function createBoundaryFixture() {
  const root = document.createElement("main");
  const list = document.createElement("div");
  list.dataset.queueDropList = "waiting";
  const first = document.createElement("article");
  first.dataset.queueTaskId = "first";
  const marker = document.createElement("div");
  marker.dataset.queueBoundaryMarker = "true";
  marker.innerHTML = `<button data-queue-boundary-drag></button>`;
  const second = document.createElement("article");
  second.dataset.queueTaskId = "second";
  second.innerHTML = `<button data-queue-drag-handle="second"></button>`;
  list.append(first, marker, second);
  root.append(list);
  document.body.append(root);

  vi.spyOn(list, "getBoundingClientRect").mockReturnValue(rect(0, 500));
  vi.spyOn(first, "getBoundingClientRect").mockReturnValue(rect(0, 80));
  vi.spyOn(marker, "getBoundingClientRect").mockReturnValue(rect(100, 62));
  vi.spyOn(second, "getBoundingClientRect").mockReturnValue(rect(180, 80));

  const state = createDefaultState();
  const queueTask = (id: string) => queueTaskFromDraft(
    { ...createDefaultDraft(), workflowPath: "workflow.json" },
    state,
    {
      now: () => new Date("2026-08-29T12:00:00.000Z"),
      id: () => id,
      random: () => 0.5
    }
  );
  state.queue = [queueTask("first"), queueTask("second")];
  state.queuePauseBoundary = 1;
  const reorderTask = vi.fn(async () => state);
  const setQueuePauseBoundary = vi.fn(async (waitingTaskCount: number) => {
    state.queuePauseBoundary = waitingTaskCount;
    return state;
  });
  const context: RendererContext = {
    root,
    studio: { reorderTask, setQueuePauseBoundary } as unknown as RendererContext["studio"],
    enhancePrompt: async () => "",
    getState: () => state,
    getRoute: () => ({ page: "queue", creationMode: "image-to-video", historyKind: "video" }),
    getTranslator: () => translator,
    t: translator.t,
    requestRender: vi.fn(),
    navigate: vi.fn(),
    notify: vi.fn(),
    reportUserAction: vi.fn()
  };
  const cleanup = mountQueueDragSort(context, () => undefined);
  return {
    cleanup,
    handle: marker.querySelector<HTMLButtonElement>("[data-queue-boundary-drag]")!,
    taskHandle: second.querySelector<HTMLButtonElement>("[data-queue-drag-handle]")!,
    reorderTask,
    setQueuePauseBoundary,
    requestRender: context.requestRender
  };
}

function createRunningBoundaryFixture() {
  const root = document.createElement("main");
  const active = document.createElement("article");
  active.dataset.queueTaskId = "running";
  const list = document.createElement("div");
  list.dataset.queueDropList = "pending";
  const second = document.createElement("article");
  second.dataset.queueTaskId = "second";
  const marker = document.createElement("div");
  marker.dataset.queueBoundaryMarker = "true";
  marker.innerHTML = `<button data-queue-boundary-drag></button>`;
  list.append(second, marker);
  root.append(active, list);
  document.body.append(root);

  vi.spyOn(list, "getBoundingClientRect").mockReturnValue(rect(80, 500));
  vi.spyOn(active, "getBoundingClientRect").mockReturnValue(rect(0, 80));
  vi.spyOn(second, "getBoundingClientRect").mockReturnValue(rect(100, 80));
  vi.spyOn(marker, "getBoundingClientRect").mockReturnValue(rect(190, 62));

  const state = createDefaultState();
  const queueTask = (id: string) => queueTaskFromDraft(
    { ...createDefaultDraft(), workflowPath: "workflow.json" },
    state,
    {
      now: () => new Date("2026-08-29T12:00:00.000Z"),
      id: () => id,
      random: () => 0.5
    }
  );
  const running = queueTask("running");
  running.status = "running";
  state.queue = [running, queueTask("second")];
  state.queueRunning = true;
  state.queueLifecycle = "running";
  state.queuePauseBoundary = 2;
  const setQueuePauseBoundary = vi.fn(async (waitingTaskCount: number) => {
    state.queuePauseBoundary = waitingTaskCount + 1;
    if (waitingTaskCount === 0) state.queueRunning = false;
    return state;
  });
  const context: RendererContext = {
    root,
    studio: { setQueuePauseBoundary } as unknown as RendererContext["studio"],
    enhancePrompt: async () => "",
    getState: () => state,
    getRoute: () => ({ page: "queue", creationMode: "image-to-video", historyKind: "video" }),
    getTranslator: () => translator,
    t: translator.t,
    requestRender: vi.fn(),
    navigate: vi.fn(),
    notify: vi.fn(),
    reportUserAction: vi.fn()
  };
  const cleanup = mountQueueDragSort(context, () => undefined);
  return {
    cleanup,
    handle: marker.querySelector<HTMLButtonElement>("[data-queue-boundary-drag]")!,
    setQueuePauseBoundary,
    requestRender: context.requestRender
  };
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});

afterEach(() => {
  document.body.classList.remove("queue-drag-active");
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("queue drag selection cleanup", () => {
  it("clears the global selection lock after a successful reorder", async () => {
    vi.useFakeTimers();
    const { cleanup, handle, reorderTask } = createQueueFixture();

    handle.dispatchEvent(pointerEvent("pointerdown", { pointerId: 1, clientX: 20, clientY: 20 }));
    window.dispatchEvent(pointerEvent("pointermove", { pointerId: 1, clientX: 20, clientY: 140 }));
    expect(document.body.classList.contains("queue-drag-active")).toBe(true);

    window.dispatchEvent(pointerEvent("pointerup", { pointerId: 1, clientX: 20, clientY: 140 }));
    await vi.advanceTimersByTimeAsync(220);

    expect(reorderTask).toHaveBeenCalledWith("first", 1);
    expect(document.body.classList.contains("queue-drag-active")).toBe(false);
    cleanup();
  });

  it("cancels and clears the lock when the window loses focus", () => {
    const { cleanup, handle } = createQueueFixture();

    handle.dispatchEvent(pointerEvent("pointerdown", { pointerId: 2, clientX: 20, clientY: 20 }));
    window.dispatchEvent(pointerEvent("pointermove", { pointerId: 2, clientX: 20, clientY: 140 }));
    expect(document.body.classList.contains("queue-drag-active")).toBe(true);

    window.dispatchEvent(new Event("blur"));

    expect(document.body.classList.contains("queue-drag-active")).toBe(false);
    cleanup();
  });

  it("moves the horizontal divider vertically with the same drag lifecycle", async () => {
    vi.useFakeTimers();
    const { cleanup, handle, setQueuePauseBoundary, requestRender } = createBoundaryFixture();

    handle.dispatchEvent(pointerEvent("pointerdown", { pointerId: 3, clientX: 20, clientY: 120 }));
    window.dispatchEvent(pointerEvent("pointermove", { pointerId: 3, clientX: 20, clientY: 280 }));
    expect(document.body.classList.contains("queue-drag-active")).toBe(true);

    window.dispatchEvent(pointerEvent("pointerup", { pointerId: 3, clientX: 20, clientY: 280 }));
    await vi.advanceTimersByTimeAsync(220);

    expect(setQueuePauseBoundary).toHaveBeenCalledWith(2);
    expect(requestRender).toHaveBeenCalled();
    expect(document.body.classList.contains("queue-drag-active")).toBe(false);
    cleanup();
  });

  it("lets a deferred task cross upward through the divider", async () => {
    vi.useFakeTimers();
    const { cleanup, taskHandle, reorderTask } = createBoundaryFixture();

    taskHandle.dispatchEvent(pointerEvent("pointerdown", { pointerId: 6, clientX: 20, clientY: 220 }));
    window.dispatchEvent(pointerEvent("pointermove", { pointerId: 6, clientX: 20, clientY: 120 }));
    window.dispatchEvent(pointerEvent("pointerup", { pointerId: 6, clientX: 20, clientY: 120 }));
    await vi.advanceTimersByTimeAsync(220);

    expect(reorderTask).toHaveBeenCalledWith("second", 1, 2);
    expect(document.body.classList.contains("queue-drag-active")).toBe(false);
    cleanup();
  });

  it("moves the divider down with keyboard controls", async () => {
    const { cleanup, handle, setQueuePauseBoundary, requestRender } = createBoundaryFixture();

    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await Promise.resolve();

    expect(setQueuePauseBoundary).toHaveBeenCalledWith(2);
    expect(requestRender).toHaveBeenCalled();
    cleanup();
  });

  it("never drops the divider before the first task", async () => {
    vi.useFakeTimers();
    const { cleanup, handle, setQueuePauseBoundary, requestRender } = createBoundaryFixture();

    handle.dispatchEvent(pointerEvent("pointerdown", { pointerId: 4, clientX: 20, clientY: 120 }));
    window.dispatchEvent(pointerEvent("pointermove", { pointerId: 4, clientX: 20, clientY: -20 }));
    window.dispatchEvent(pointerEvent("pointerup", { pointerId: 4, clientX: 20, clientY: -20 }));
    await vi.advanceTimersByTimeAsync(220);

    expect(setQueuePauseBoundary).toHaveBeenCalledWith(1);
    expect(requestRender).toHaveBeenCalled();
    cleanup();
  });

  it("allows the running divider to sit between the active task and task 2", async () => {
    vi.useFakeTimers();
    const { cleanup, handle, setQueuePauseBoundary, requestRender } = createRunningBoundaryFixture();

    handle.dispatchEvent(pointerEvent("pointerdown", { pointerId: 5, clientX: 20, clientY: 220 }));
    window.dispatchEvent(pointerEvent("pointermove", { pointerId: 5, clientX: 20, clientY: 105 }));
    window.dispatchEvent(pointerEvent("pointerup", { pointerId: 5, clientX: 20, clientY: 105 }));
    await vi.advanceTimersByTimeAsync(220);

    expect(setQueuePauseBoundary).toHaveBeenCalledWith(0);
    expect(requestRender).toHaveBeenCalled();
    cleanup();
  });

  it("allows keyboard movement of a running divider to position 0", async () => {
    const { cleanup, handle, setQueuePauseBoundary, requestRender } = createRunningBoundaryFixture();

    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    await Promise.resolve();

    expect(setQueuePauseBoundary).toHaveBeenCalledWith(0);
    expect(requestRender).toHaveBeenCalled();
    cleanup();
  });
});
