import { describe, expect, it, vi } from "vitest";
import { insertPromptSnippet } from "../src/renderer/pages/create/helpers.js";

function promptInput(value = "") {
  const input = {
    value,
    selectionStart: value.length,
    selectionEnd: value.length,
    focus: vi.fn(),
    dispatchEvent: vi.fn(),
    setRangeText(replacement: string, start: number, end: number) {
      this.value = `${this.value.slice(0, start)}${replacement}${this.value.slice(end)}`;
      this.selectionStart = start + replacement.length;
      this.selectionEnd = this.selectionStart;
    },
    setSelectionRange(start: number, end: number) {
      this.selectionStart = start;
      this.selectionEnd = end;
    }
  };
  return input as unknown as HTMLTextAreaElement;
}

describe("prompt snippet insertion", () => {
  it("selects exact-dialogue placeholder text for immediate replacement", () => {
    const input = promptInput("Opening action.");
    const placeholder = "Write the exact original dialogue here.";
    const snippet = `The speaker says: <d>[Chinese] ${placeholder}</d>`;

    insertPromptSnippet(input, snippet);

    expect(input.value).toBe(`Opening action.\n${snippet}`);
    expect(input.value.slice(input.selectionStart, input.selectionEnd)).toBe(placeholder);
  });

  it("leaves the caret after an ordinary snippet", () => {
    const input = promptInput();

    insertPromptSnippet(input, "The camera tracks the subject.");

    expect(input.selectionStart).toBe(input.value.length);
    expect(input.selectionEnd).toBe(input.value.length);
  });
});
