// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createJourney } from "./harness/create-journey";
import { richPromptText, setRichPromptSelection } from "../src/renderer/pages/create/rich-prompt";
import { generationSafetyForTask, outputDimensions, renderWorkflow } from "../src/core/workflow";
import { readFileSync } from "node:fs";

let journey: Awaited<ReturnType<typeof createJourney>> | undefined;
afterEach(async () => { journey?.dispose(); journey = undefined; await new Promise(resolve => setTimeout(resolve, 370)); });
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
function edit(editor: HTMLElement, text: string) {
  editor.focus(); editor.textContent = text; setRichPromptSelection(editor, text.length, text.length);
  editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
}
describe("Create rich prompt and revised controls", () => {
  it("renders atomic references and marks while enqueueing only the exact plain text, including newlines", async () => {
    const h = journey = await createJourney({ startImagePath: "fixture.png" });
    const editor = h.element<HTMLElement>("#prompt-input-rich");
    const text = 'Camera: [0–3s] Use <Picture 1>. She says “Hello.”\nSound: Wind.\n';
    edit(editor, text);
    expect(editor.querySelector('.create-ref-chip')?.getAttribute('contenteditable')).toBe("false");
    expect(editor.querySelector('.create-ref-chip.missing')).toBeNull();
    expect(editor.querySelector('.create-rich-time')?.textContent).toBe("[0–3s]");
    expect(editor.querySelector('.create-rich-say')?.textContent).toBe("“Hello.”");
    expect(richPromptText(editor)).toBe(text);
    expect(h.element<HTMLTextAreaElement>("#prompt-input").value).toBe(text);
    h.element("#enqueue").click(); await vi.waitFor(() => expect(h.state().queue).toHaveLength(1));
    expect(h.state().queue[0]?.prompt).toBe(text.trim());
  });
  it("keeps undo/redo through redraw and escapes pasted HTML without storing rich markup", async () => {
    const h = journey = await createJourney();
    edit(h.element("#prompt-input-rich"), "First line.");
    edit(h.element("#prompt-input-rich"), "Second line.");
    h.render(); h.element("#prompt-input-rich").focus();
    h.element("#prompt-input-rich").dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }));
    expect(h.element<HTMLTextAreaElement>("#prompt-input").value).toBe("First line.");
    h.element("#prompt-input-rich").dispatchEvent(new KeyboardEvent("keydown", { key: "y", ctrlKey: true, bubbles: true, cancelable: true }));
    expect(h.element<HTMLTextAreaElement>("#prompt-input").value).toBe("Second line.");
    const editor = h.element("#prompt-input-rich");
    setRichPromptSelection(editor, 0, "Second line.".length);
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", { value: { getData: () => '<img src=x onerror=alert(1)> <Picture 9>' } });
    editor.dispatchEvent(paste);
    expect(editor.querySelector("img[onerror]")).toBeNull();
    expect(editor.querySelector('.create-ref-chip.missing')).not.toBeNull();
    expect(h.element<HTMLTextAreaElement>("#prompt-input").value).toBe('<img src=x onerror=alert(1)> <Picture 9>');
  });
  it("does not decorate or interrupt IME composition and commits the complete result", async () => {
    const h = journey = await createJourney();
    const editor = h.element("#prompt-input-rich"); editor.focus();
    editor.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    edit(editor, '镜头：[0–3s] 女孩说“你好”。');
    expect(editor.hasAttribute("data-rich-composing")).toBe(true);
    expect(editor.querySelector(".create-rich-time")).toBeNull();
    editor.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    expect(editor.hasAttribute("data-rich-composing")).toBe(false);
    expect(editor.querySelector(".create-rich-time")).not.toBeNull();
    expect(h.element<HTMLTextAreaElement>("#prompt-input").value).toBe('镜头：[0–3s] 女孩说“你好”。');
  });
  it("keeps consecutive blank lines and Shift+Enter line breaks as plain text with undo", async () => {
    const h = journey = await createJourney();
    const editor = h.element("#prompt-input-rich");
    edit(editor, "First");
    for (const inputType of ["insertParagraph", "insertParagraph", "insertLineBreak"]) {
      editor.dispatchEvent(new InputEvent("beforeinput", { inputType, bubbles: true, cancelable: true }));
    }
    expect(h.element<HTMLTextAreaElement>("#prompt-input").value).toBe("First\n\n\n");
    expect(richPromptText(editor)).toBe("First\n\n\n");
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }));
    expect(h.element<HTMLTextAreaElement>("#prompt-input").value).toBe("First\n\n");
  });
  it("updates duration ticks and retains unlocked mode after a short-duration redraw", async () => {
    const h = journey = await createJourney({ duration: 8 });
    h.input("#generation-mode", "unlocked", "change");
    expect(h.element(".composer-motion-group .create-duration-ticks").textContent).toBe("1102030");
    h.render();
    expect(h.element<HTMLSelectElement>("#generation-mode").value).toBe("unlocked");
    expect(h.element<HTMLInputElement>("#duration").max).toBe("30");
    h.input("#generation-mode", "native", "change");
    expect(h.element(".composer-motion-group .create-duration-ticks").textContent).toBe("151015.1");
  });
  it("accepts bounded custom H3 dimensions through actual controls, frozen task and rendered graph", async () => {
    const h = journey = await createJourney({ duration: 2 });
    h.element("#video-resolution-custom").click(); await settle();
    h.input('[data-custom-resolution-panel] input[type="number"]', "608", "change"); await settle();
    expect(h.state().draft.resolution).toBe(608);
    expect(h.element("#video-resolution-custom").getAttribute("aria-pressed")).toBe("true");
    edit(h.element("#prompt-input-rich"), "A balloon rises. Fixed camera, daylight.");
    h.element("#enqueue").click(); await vi.waitFor(() => expect(h.state().queue).toHaveLength(1));
    const task = h.state().queue[0]!;
    expect(task.resolution).toBe(608);
    expect(generationSafetyForTask(task).safe).toBe(true);
    expect(generationSafetyForTask({ ...task, resolution: 1104 }).safe).toBe(false);
    expect(generationSafetyForTask({ ...task, resolution: 610 }).safe).toBe(false);
    expect(outputDimensions(task)[1]).toBe(608);
    const graph = renderWorkflow(JSON.parse(readFileSync("workflows/minimax_h3_i2v_api.json", "utf8")), task);
    expect(JSON.stringify(graph)).not.toContain("{{");
    h.input('[data-custom-resolution-panel] input[type="number"]', "832", "change");
    expect(h.state().draft.resolution).toBe(832);
    h.element("#enqueue").click(); await vi.waitFor(() => expect(h.state().queue).toHaveLength(2));
    expect(h.state().queue[1]?.resolution).toBe(832);
    expect(h.state().queue[1]?.h3DeliveryResolution).toBeUndefined();
    expect(generationSafetyForTask(h.state().queue[1]!).safe).toBe(true);
    h.input('[data-custom-resolution-panel] input[type="number"]', "9999", "change"); await settle();
    expect(h.state().draft.resolution).toBe(1080); expect(task.resolution).toBe(608);
  });
  it("clears without confirmation and restores media, prompt versions and seed via the notification action", async () => {
    const h = journey = await createJourney({ startImagePath: "fixture.png", seed: 123 });
    edit(h.element("#prompt-input-rich"), "Keep this complete draft.");
    const before = structuredClone(h.state().draft);
    h.element("#clear-draft").click(); await settle();
    expect(h.dependencies.requestClearDraftConfirmation).not.toHaveBeenCalled();
    expect(h.state().draft.startImagePath).toBe("");
    expect(h.state().draft.seed).toBeNull();
    const notify = vi.mocked(h.context.notify).mock.calls.at(-1)!;
    expect(notify[1]?.durationMs).toBe(6000);
    await notify[1]!.actions![0]!.run(); await settle();
    expect(h.state().draft).toEqual(before);
  });
});
