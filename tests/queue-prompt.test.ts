// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTranslator, loadUiLocale } from "../src/core/i18n";
import { escapeHtml } from "../src/renderer/shared/dom";
import { renderQueuePrompt, mountQueuePrompts } from "../src/renderer/pages/queue/prompt";
import type { RendererContext } from "../src/renderer/contracts";

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("queue prompt reading", () => {
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
