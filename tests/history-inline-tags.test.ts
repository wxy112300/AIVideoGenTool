// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { mountHistoryTagEditor } from "../src/renderer/pages/history/tags-controller";
import type { RendererContext } from "../src/renderer/contracts";
import { mountInlineTagSuggestions } from "../src/renderer/pages/history/tag-suggestions";
import { historyFrequentTagNames } from "../src/core/history-filter";
import type { HistoryAsset, ImageHistoryProject } from "../src/types";

afterEach(() => document.body.replaceChildren());

it("ranks frequent tags by works, deduplicates casing, and keeps video/image collections separate", () => {
  const videos = [{ tags: ["rare", "Common", "common"] }, { tags: ["common"] }, { tags: ["Other"] }] as HistoryAsset[];
  const images = [{ tags: ["Image"] }] as ImageHistoryProject[];
  expect(historyFrequentTagNames(videos, images, "video")[0]).toBe("Common");
  expect(historyFrequentTagNames(videos, images, "video")).not.toContain("Image");
  expect(historyFrequentTagNames(videos, images, "image")).toEqual(["Image"]);
});

it("limits the common row while searching all tags in a keyboard and pointer accessible portal", () => {
  const root = document.createElement("section");
  root.innerHTML = '<input aria-label="Add tag"><div data-history-tag-suggestions></div>';
  document.body.append(root);
  const input = root.querySelector("input")!, choose = vi.fn();
  const choices = ["Common", "Popular", "Frequent", "Often", ...Array.from({ length: 30 }, (_, i) => `Rare${i}`)];
  const controller = mountInlineTagSuggestions(root, input, { getTags: () => ["COMMON"], getChoices: () => choices, choose });
  try {
    controller.refresh();
    expect(root.querySelectorAll("[data-history-tag-suggestion]")).toHaveLength(4);
    expect(root.querySelector("[data-history-tag-suggestion]")!.textContent).toBe("Popular");
    input.focus(); input.value = "Rare27"; controller.refresh();
    expect(document.querySelector('[role="option"]')!.textContent).toBe("Rare27");
    expect(root.contains(document.querySelector('[role="listbox"]'))).toBe(false);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.querySelector('[aria-selected="true"]')!.id).toBe(input.getAttribute("aria-activedescendant"));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(choose).toHaveBeenLastCalledWith("Rare27");
    input.value = "Rare28"; controller.refresh();
    document.querySelector<HTMLButtonElement>('[role="option"]')!.click();
    expect(choose).toHaveBeenLastCalledWith("Rare28");
    input.value = "Rare29"; controller.refresh();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(input.value).toBe("Rare29");
    input.dispatchEvent(new CompositionEvent("compositionstart"));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true }));
    expect(choose).toHaveBeenCalledTimes(2);
  } finally { controller.dispose(); }
  expect(document.querySelector('[role="listbox"]')).toBeNull();
});

it("keeps the inline tag input and player connected through add, rename and Escape", async () => {
  let tags = ["scene"];
  const root = document.createElement("main");
  root.innerHTML = '<video></video><section data-history-tags-inline><button data-history-tag-add><svg><path/></svg></button><div data-history-tag-list></div><div data-history-tag-editor><input data-history-tag-input><button data-history-tag-cancel hidden>Cancel</button></div><div data-history-tag-suggestions></div></section>';
  document.body.append(root);
  const section = root.querySelector<HTMLElement>("section")!, input = root.querySelector<HTMLInputElement>("input")!, player = root.querySelector("video");
  const dispose = mountHistoryTagEditor({ root, notify: vi.fn() } as unknown as RendererContext, section, {
    getTags: () => tags, getAvailableTags: () => ["scene", "night"], escapeHtml: value => value, icon: () => "<svg></svg>", editLabel: "Edit", removeLabel: "Remove", emptyText: "Empty", duplicateText: "Duplicate", updateFailedText: "Failed",
    applyOperation: async op => { tags = op.kind === "add" ? [...tags, op.tag] : op.kind === "remove" ? tags.filter(t => t !== op.tag) : tags.map(t => t === op.from ? op.to : t); }
  });
  try {
    root.querySelector("[data-history-tag-add] path")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.activeElement).toBe(input);
    input.value = "new"; input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() => expect(tags).toEqual(["scene", "new"]));
    root.querySelector<HTMLButtonElement>('[data-history-tag-edit="new"]')!.click();
    input.value = "renamed"; input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() => expect(tags).toEqual(["scene", "renamed"]));
    expect(root.querySelector<HTMLElement>("[data-history-tag-editor]")!.hidden).toBe(false);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(root.querySelector<HTMLElement>("[data-history-tag-editor]")!.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>("[data-history-tag-cancel]")!.hidden).toBe(true);
    expect(root.querySelector("video")).toBe(player);
    expect(root.querySelector("input")).toBe(input);
  } finally { dispose(); }
});
