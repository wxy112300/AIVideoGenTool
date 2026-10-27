// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNotification } from "../src/renderer/notifications";
import { createNotificationStack } from "../src/renderer/shared/ui/notify";
import { mountTooltip, prepareTooltipSources } from "../src/renderer/shared/ui/tooltip";

const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).forEach((cleanup) => cleanup()); document.body.replaceChildren(); vi.useRealTimers(); });

describe("notification stack", () => {
  const setup = () => {
    vi.useFakeTimers();
    const changed = vi.fn(), action = vi.fn();
    const stack = createNotificationStack({ dismissLabel: () => "Close", changed, action });
    cleanups.push(stack.dispose);
    return { stack, changed, action };
  };
  it("renders the prototype status icon before each notice message", () => {
    const { stack } = setup();
    const kinds = ["info", "warning", "error", "task-complete", "queue-complete"] as const;
    const names = ["info", "alert-triangle", "circle-alert", "circle-check", "circle-check"];
    kinds.forEach((kind, index) => {
      stack.push(createNotification(index + 1, `notice ${kind}`, kind));
      const notice = document.querySelector(`[data-notification-id="${index + 1}"]`)!;
      expect(notice.firstElementChild?.classList.contains("ui-notice-icon")).toBe(true);
      expect(notice.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
      expect(notice.querySelector(".ui-notice-icon svg")?.getAttribute("data-lucide")).toBe(names[index]);
      stack.dismiss(index + 1);
    });
  });
  it("replaces the same operation's transient status while preserving errors", () => {
    const { stack } = setup();
    stack.push({ ...createNotification(1, "Scanning", "info", 300000), sourceKey: "scan" });
    stack.push({ ...createNotification(2, "Complete", "info"), sourceKey: "scan" });
    expect(document.querySelectorAll(".ui-notice")).toHaveLength(1);
    expect(document.querySelector(".ui-notice")?.textContent).toContain("Complete");
    stack.push({ ...createNotification(3, "Failed", "error"), sourceKey: "scan" });
    stack.push({ ...createNotification(4, "Retrying", "info"), sourceKey: "scan" });
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Failed");
  });
  it("updates scan progress in place, preserves focus and stops its timer on completion", () => {
    const { stack } = setup();
    stack.push({ ...createNotification(1, "Checking files", "info", 300000), sourceKey: "scan", progress: { completed: 1, total: 4 } });
    const notice = document.querySelector<HTMLElement>(".ui-notice")!;
    const close = notice.querySelector<HTMLButtonElement>(".ui-notice-close")!;
    close.focus();
    const icon = notice.querySelector("svg");
    stack.push({ ...createNotification(2, "Checking acceleration", "info", 300000), sourceKey: "scan", progress: { completed: 2, total: 4 } });
    expect(document.querySelector(".ui-notice")).toBe(notice);
    expect(document.activeElement).toBe(close);
    expect(notice.querySelector("svg")).toBe(icon);
    expect(notice.querySelector("progress")?.value).toBe(2);
    expect(document.querySelectorAll(".ui-notice")).toHaveLength(1);
    stack.push({ ...createNotification(3, "Complete", "info"), sourceKey: "scan" });
    expect(notice.querySelector("progress")).toBeNull();
    close.blur();
    vi.advanceTimersByTime(3001);
    expect(notice.isConnected).toBe(false);
  });
  it("does not reopen a dismissed scan on the next progress event", () => {
    const { stack } = setup();
    stack.push({ ...createNotification(1, "Checking files", "info", 300000), sourceKey: "scan", progress: { completed: 1, total: 4 } });
    document.querySelector<HTMLButtonElement>(".ui-notice-close")!.click();
    stack.push({ ...createNotification(2, "Checking nodes", "info", 300000), sourceKey: "scan", progress: { completed: 2, total: 4 } });
    expect(document.querySelector(".ui-notice")).toBeNull();
  });
  it("keeps four errors visible and queues overflow until a dismissal", () => {
    const { stack, changed } = setup();
    for (let index = 1; index <= 5; index++) stack.push(createNotification(index, `error ${index}`, "error"));
    expect(document.querySelectorAll(".ui-notice")).toHaveLength(4);
    expect(changed.mock.lastCall?.[1]).toHaveLength(1);
    vi.advanceTimersByTime(20_000); expect(document.querySelectorAll(".ui-notice")).toHaveLength(4);
    stack.dismiss(1); expect(document.querySelector('[data-notification-id="5"]')).not.toBeNull();
  });
  it("pauses the remaining timeout on hover and keyboard focus", () => {
    const { stack } = setup(); stack.push(createNotification(1, "done", "info"));
    const item = document.querySelector<HTMLElement>(".ui-notice")!;
    vi.advanceTimersByTime(2000); item.dispatchEvent(new Event("pointerenter"));
    vi.advanceTimersByTime(6000); expect(item.isConnected).toBe(true);
    item.dispatchEvent(new Event("pointerleave")); vi.advanceTimersByTime(900); expect(item.isConnected).toBe(true);
    item.dispatchEvent(new FocusEvent("focusin")); vi.advanceTimersByTime(6000); expect(item.isConnected).toBe(true);
    item.dispatchEvent(new FocusEvent("focusout")); vi.advanceTimersByTime(101); expect(item.isConnected).toBe(false);
  });
  it("preserves each notice's action identity even after a newer notice arrives", () => {
    const { stack, action } = setup();
    const firstAction = { id: "retry", label: "Retry", run: vi.fn() };
    stack.push(createNotification(1, "first", "info", undefined, [firstAction]));
    stack.push(createNotification(2, "second", "info", undefined, [{ ...firstAction }]));
    document.querySelector<HTMLButtonElement>('[data-notification-id="1"] [data-notification-action]')!.click();
    expect(action.mock.calls[0]?.[0].id).toBe(1);
    expect(document.querySelector('[data-notification-id="2"]')).not.toBeNull();
  });
  it("deduplicates without dropping persistent or actionable notices, and clears timers on disposal", () => {
    const { stack } = setup();
    stack.push(createNotification(1, "failure", "error"));
    stack.push(createNotification(2, "failure", "error"));
    for (let index = 3; index < 8; index++) stack.push(createNotification(index, `done ${index}`, "info"));
    expect(document.querySelectorAll(".ui-notice")).toHaveLength(4);
    expect(document.querySelector('[data-notification-id="1"]')).not.toBeNull();
    stack.dispose(); vi.advanceTimersByTime(10000);
    expect(document.querySelector(".ui-notifications")).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  });
});

describe("single application tooltip", () => {
  it("shows a material thumbnail in the unique body portal outside clipped editors", () => {
    vi.useFakeTimers(); document.body.innerHTML = '<div style="overflow:hidden"><span data-ui-tooltip="Picture 1" data-ui-tooltip-image="data:image/png;base64,AA==">Picture 1</span></div>';
    cleanups.push(mountTooltip(document.body));
    document.querySelector("span")!.dispatchEvent(new Event("pointerover", { bubbles: true })); vi.advanceTimersByTime(451);
    const tip = document.querySelector('[role="tooltip"]')!;
    expect(tip.parentElement).toBe(document.body); expect(tip.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,AA==");
    expect(tip.textContent).toBe("Picture 1"); expect(document.querySelectorAll('[role="tooltip"]')).toHaveLength(1);
  });
  it("does not cancel a keyboard tooltip when focus scrolls its owner into view", () => {
    vi.useFakeTimers(); document.body.innerHTML = '<button title="Help">Info</button>';
    cleanups.push(mountTooltip(document.body));
    document.querySelector("button")!.focus(); window.dispatchEvent(new Event("scroll")); vi.advanceTimersByTime(451);
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe("Help");
  });
  it("uses legacy rich descriptions as hidden sources and keeps only one live overlay", () => {
    vi.useFakeTimers(); document.body.innerHTML = '<span tabindex="0"><span role="tooltip"><strong>Model</strong><span>Details</span></span></span>';
    prepareTooltipSources(document.body); cleanups.push(mountTooltip(document.body));
    const source = document.querySelector<HTMLElement>("[data-ui-tooltip-source]")!;
    source.parentElement!.dispatchEvent(new Event("pointerover", { bubbles: true })); vi.advanceTimersByTime(451);
    expect(source.hidden).toBe(true); expect(document.querySelectorAll('[role="tooltip"]')).toHaveLength(1);
    expect(document.querySelector('[role="tooltip"] strong')?.textContent).toBe("Model");
  });
  it("shows text safely in a body portal, preserves descriptions, updates and closes with Escape", async () => {
    vi.useFakeTimers(); document.body.innerHTML = '<div style="overflow:hidden"><button title="&lt;b&gt;Info&lt;/b&gt;" aria-describedby="help">A</button><span id="help">Help</span></div>';
    cleanups.push(mountTooltip(document.body));
    const button = document.querySelector("button")!;
    button.dispatchEvent(new Event("pointerover", { bubbles: true })); vi.advanceTimersByTime(451);
    const tooltip = document.querySelector('[role="tooltip"]')!;
    expect(tooltip.parentElement).toBe(document.body); expect(tooltip.innerHTML).not.toContain("<b>");
    expect(button.getAttribute("aria-describedby")).toContain("help");
    button.title = "Updated"; await Promise.resolve(); await Promise.resolve();
    expect(tooltip.textContent).toBe("Updated");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector('[role="tooltip"]')).toBeNull(); expect(button.getAttribute("aria-describedby")).toBe("help");
  });
});
