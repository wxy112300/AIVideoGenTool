// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultDraft, createDefaultState } from "../src/core/defaults";
import { createTranslator } from "../src/core/i18n";
import { queueTaskFromDraft } from "../src/core/queue-task-factory";
import type { RendererContext } from "../src/renderer/contracts";
import { mountQueueActionMenu } from "../src/renderer/pages/queue/action-menu";

const translator = createTranslator("zh-CN");

function createFixture() {
  const root = document.createElement("main");
  const trigger = document.createElement("button");
  trigger.dataset.queueMenuTrigger = "queue-task";
  root.append(trigger);
  document.body.append(root);

  const state = createDefaultState();
  const task = queueTaskFromDraft(
    { ...createDefaultDraft(), workflowPath: "workflow.json" },
    state,
    {
      now: () => new Date("2026-08-29T12:00:00.000Z"),
      id: () => "queue-task",
      random: () => 0.5
    }
  );
  state.queue = [task];
  const onAction = vi.fn(async () => undefined);
  const context: RendererContext = {
    root,
    application: {} as RendererContext["application"],
    events: {} as RendererContext["events"],
    assets: {} as RendererContext["assets"],
    hostCapabilities: {} as RendererContext["hostCapabilities"],
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
  const cleanup = mountQueueActionMenu(context, {
    icon: () => "",
    getTask: (taskId) => state.queue.find((candidate) => candidate.id === taskId),
    canPromote: () => true,
    onAction
  });
  return { cleanup, onAction, trigger };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("queue action menu", () => {
  it("puts duplicate first and exposes promote and random seed for waiting video tasks", async () => {
    const { cleanup, onAction, trigger } = createFixture();

    trigger.click();

    const menu = document.querySelector<HTMLElement>(".queue-action-menu");
    expect(menu).not.toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect([...menu!.querySelectorAll<HTMLButtonElement>("[role=menuitem]")].map((item) =>
      item.dataset.queueMenuAction
    )).toEqual(["duplicate", "promote", "render-through-here", "randomize-seed"]);

    menu!.querySelector<HTMLButtonElement>("[data-queue-menu-action=randomize-seed]")!.click();
    await Promise.resolve();

    expect(onAction).toHaveBeenCalledWith("randomize-seed", "queue-task");
    expect(document.querySelector(".queue-action-menu")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    cleanup();
  });

  it("closes on an outside pointer and on cleanup", () => {
    const { cleanup, trigger } = createFixture();

    trigger.click();
    expect(document.querySelector(".queue-action-menu")).not.toBeNull();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(document.querySelector(".queue-action-menu")).toBeNull();

    trigger.click();
    expect(document.querySelector(".queue-action-menu")).not.toBeNull();
    cleanup();
    expect(document.querySelector(".queue-action-menu")).toBeNull();
  });
});
