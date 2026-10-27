// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTranslator, loadUiLocale } from "../src/core/i18n";
import { escapeHtml } from "../src/renderer/shared/dom";
import { renderQueuePrompt, mountQueuePrompts } from "../src/renderer/pages/queue/prompt";
import type { RendererContext } from "../src/renderer/contracts";
import { completedGroupVersion } from "./harness/long-video-source";

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("queue prompt reading", () => {
  it("shows adopted LoRA sampling text while preserving the original script pages", async () => {
    await loadUiLocale("en-US");
    const plan = completedGroupVersion().longVideoExecution!.script, before = structuredClone(plan);
    document.body.innerHTML = renderQueuePrompt("raw", createTranslator("en-US").t, escapeHtml, () => "", plan, ["film look, adopted one", "film look, adopted two"]);
    expect(document.querySelector('[data-queue-prompt-text="0"]')!.textContent).toBe("film look, adopted one\n\nfilm look, adopted two");
    expect(document.querySelector('[data-queue-prompt-text="3"]')!.textContent).toBe("film look, adopted two");
    expect(plan).toEqual(before);
  });
  it("browses adopted segment prompts without changing frozen pages, and copies only the selected page", async () => {
    await loadUiLocale("en-US");
    const t = createTranslator("en-US").t;
    const plan = completedGroupVersion().longVideoExecution!.script;
    plan.layout.prefixChunks = 3;
    plan.pages[0]!.text = "Notes excluded from sampling";
    const before = structuredClone(plan);
    document.body.innerHTML = renderQueuePrompt("stale flattened text", t, escapeHtml, () => "", plan);
    const copy = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
    const cleanup = mountQueuePrompts({ root: document.body, t, notify: vi.fn() } as unknown as RendererContext);
    const selected = () => document.querySelector<HTMLElement>(".task-description:not([hidden])")!;
    expect(selected().textContent).toBe("Original action 0\n\nOriginal action 1");
    const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-queue-prompt-page]")];
    expect(buttons.slice(2).map(button => button.textContent)).toEqual(["4", "5"]);
    buttons[3]!.focus(); buttons[3]!.click();
    expect(selected().textContent).toBe("Original action 1");
    expect(document.activeElement).toBe(buttons[3]);
    const toggle = document.querySelector<HTMLButtonElement>("[data-queue-prompt-toggle]")!;
    toggle.hidden = false; toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    document.querySelector<HTMLButtonElement>("[data-queue-prompt-copy]")!.click();
    await Promise.resolve();
    expect(copy).toHaveBeenLastCalledWith("Original action 1");
    buttons[1]!.click();
    expect(selected().textContent).toBe("Notes excluded from sampling");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(buttons[1]!.getAttribute("aria-pressed")).toBe("true");
    expect(buttons[3]!.getAttribute("aria-pressed")).toBe("false");
    expect(plan).toEqual(before);
    cleanup();
  });

  it("shows shared constraints in each adopted sampling page", async () => {
    await loadUiLocale("en-US");
    const plan = completedGroupVersion().longVideoExecution!.script;
    plan.sharedPreamble = true; plan.pages[0]!.text = "Keep the same character";
    document.body.innerHTML = renderQueuePrompt("unused", createTranslator("en-US").t, escapeHtml, () => "", plan);
    expect(document.querySelector('[data-queue-prompt-text="2"]')!.textContent).toBe("Keep the same character\n\nOriginal action 0");
    expect(document.querySelector('[data-queue-prompt-text="3"]')!.textContent).toBe("Keep the same character\n\nOriginal action 1");
  });

  it("expands without changing the execution text and copies the full multiline prompt", async () => {
    await loadUiLocale("en-US");
    const text = '<Picture 1>\nCamera: slowly move forward.\nAudio: quiet rain.';
    const t = createTranslator("en-US").t;
    document.body.innerHTML = renderQueuePrompt(text, t, escapeHtml, () => "");
    const root = document.body;
    const copy = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
    const notify = vi.fn();
    const cleanup = mountQueuePrompts({ root, t, notify } as unknown as RendererContext);
    const toggle = root.querySelector<HTMLButtonElement>("[data-queue-prompt-toggle]")!;
    toggle.hidden = false; // jsdom has no layout; actual overflow/fit is checked in Electron.
    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.textContent).toContain("Collapse");
    expect(root.querySelector(".task-description")!.textContent).toBe(text);
    root.querySelector<HTMLButtonElement>("[data-queue-prompt-copy]")!.click();
    await Promise.resolve();
    expect(copy).toHaveBeenCalledWith(text);
    expect(notify).toHaveBeenCalled();
    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    cleanup();
  });
});
