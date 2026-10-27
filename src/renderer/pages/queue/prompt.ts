import type { Translate } from "../../../core/i18n";
import { uiKeys } from "../../../core/i18n-keys";
import { estimatePromptTextTokens } from "../../../core/prompt-token-estimate";
import { compileLongVideoPrompts, type freezeLongVideoScript } from "../../../core/long-video/script";
import type { RendererCleanup, RendererContext } from "../../contracts";

export function renderQueuePrompt(text: string, t: Translate, escape: (value: unknown) => string, icon: (name: string) => string, plan?: ReturnType<typeof freezeLongVideoScript>, samplingPrompts?: readonly string[]): string {
  if (!text.trim()) return "";
  const prompts = plan ? samplingPrompts ?? compileLongVideoPrompts(plan) : [];
  const pages = plan ? [
    { label: t(uiKeys.create.editor.whole), text: prompts.join("\n\n") },
    { label: t(plan.sharedPreamble ? uiKeys.create.editor.globalShared : uiKeys.create.editor.globalNotes), text: plan.pages[0]?.text ?? "" },
    ...prompts.map((prompt, index) => ({ label: String(plan.layout.prefixChunks + index + 1), text: prompt }))
  ] : [{ label: "", text }];
  return `<div class="queue-prompt" data-queue-prompt>${plan ? `<div class="queue-prompt-pages" role="group" aria-label="${t(uiKeys.create.editor.segments)}">${pages.map((page, index) => `<button type="button" class="ghost" data-queue-prompt-page="${index}" aria-pressed="${index === 0}">${escape(page.label)}</button>`).join("")}</div>` : ""}${pages.map((page, index) => `<p class="task-description" data-queue-prompt-text="${index}"${index ? " hidden" : ""}>${escape(page.text)}</p>`).join("")}
    <div class="queue-prompt-tools"><button type="button" class="ghost queue-prompt-toggle" data-queue-prompt-toggle aria-expanded="false" hidden>${icon("chevrons-up-down")}<span>${t(uiKeys.queue.prompt.expand)}</span></button><span data-queue-prompt-tokens title="${t(uiKeys.queue.prompt.estimateTip)}">${t(uiKeys.queue.prompt.tokens, { count: estimatePromptTextTokens(pages[0]?.text ?? text) })}</span><button type="button" class="ghost icon-button" data-queue-prompt-copy aria-label="${t(uiKeys.queue.prompt.copy)}" title="${t(uiKeys.queue.prompt.copy)}">${icon("copy")}</button></div></div>`;
}

/** Progress polling leaves the prompt, focus and expanded scroll position intact. */
export function mountQueuePrompts(context: RendererContext): RendererCleanup {
  const events = new AbortController();
  const blocks = [...context.root.querySelectorAll<HTMLElement>("[data-queue-prompt]")];
  let frame = 0;
  const fit = (): void => {
    frame = 0;
    for (const block of blocks) {
      const text = block.querySelector<HTMLElement>(".task-description:not([hidden])")!;
      const button = block.querySelector<HTMLButtonElement>("[data-queue-prompt-toggle]")!;
      if (button.getAttribute("aria-expanded") === "true") continue;
      text.style.setProperty("--prompt-lines", "2");
      const meta = block.parentElement?.querySelector<HTMLElement>(":scope > .task-meta");
      const line = parseFloat(getComputedStyle(text).lineHeight) || 18;
      const free = meta ? meta.getBoundingClientRect().top - block.getBoundingClientRect().bottom - 10 : 0;
      text.style.setProperty("--prompt-lines", String(Math.min(12, 2 + Math.max(0, Math.floor(free / line)))));
      button.hidden = text.scrollHeight <= text.clientHeight + 1;
    }
  };
  const schedule = (): void => { if (!frame) frame = requestAnimationFrame(fit); };
  for (const block of blocks) {
    block.querySelectorAll<HTMLButtonElement>("[data-queue-prompt-page]").forEach(button => {
      button.addEventListener("click", () => {
        block.querySelectorAll<HTMLButtonElement>("[data-queue-prompt-page]").forEach(page => page.setAttribute("aria-pressed", String(page === button)));
        block.querySelectorAll<HTMLElement>("[data-queue-prompt-text]").forEach(page => { page.hidden = page.dataset.queuePromptText !== button.dataset.queuePromptPage; });
        const text = block.querySelector<HTMLElement>(".task-description:not([hidden])")!;
        block.querySelector<HTMLElement>("[data-queue-prompt-tokens]")!.textContent = context.t(uiKeys.queue.prompt.tokens, { count: estimatePromptTextTokens(text.textContent ?? "") });
        schedule();
      }, { signal: events.signal });
    });
    block.querySelector<HTMLButtonElement>("[data-queue-prompt-toggle]")!.addEventListener("click", (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      const open = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", String(open));
      button.querySelector("span")!.textContent = context.t(open ? uiKeys.queue.prompt.collapse : uiKeys.queue.prompt.expand);
      block.classList.toggle("open", open);
      schedule();
    }, { signal: events.signal });
    block.querySelector<HTMLButtonElement>("[data-queue-prompt-copy]")!.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(block.querySelector(".task-description:not([hidden])")!.textContent ?? "");
        context.notify(context.t(uiKeys.queue.prompt.copied), { kind: "info" });
      } catch (error) { context.notify(error instanceof Error ? error.message : String(error), { kind: "error" }); }
    }, { signal: events.signal });
  }
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
  observer?.observe(context.root);
  window.addEventListener("resize", schedule, { signal: events.signal });
  schedule();
  return () => { events.abort(); observer?.disconnect(); cancelAnimationFrame(frame); };
}
