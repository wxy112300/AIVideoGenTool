// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { updateHistoryMetadata, HistoryMetadataSaveError } from "../src/renderer/pages/history/metadata-update";
import { mountHistoryTagEditor } from "../src/renderer/pages/history/tags-controller";
import { createDefaultState } from "../src/core/defaults";
import { createTranslator } from "../src/core/i18n";
import { createHistoryPerformanceFixture } from "./fixtures/history-performance";
import type { RendererContext, RendererNotifyOptions } from "../src/renderer/contracts";
import type { HistoryMetadataPatch } from "../src/types";
import type { AppApi } from "../src/types";
import { createElectronRendererClient } from "../src/renderer/studio-client";

afterEach(() => document.body.replaceChildren());

describe("curation acknowledgement after navigation", () => {
  it("keeps an older preload usable during renderer hot reload until the full app restarts", async () => {
    const state = createDefaultState();
    const updateHistoryMetadata = vi.fn().mockResolvedValue(state);
    const client = createElectronRendererClient({ updateHistoryMetadata } as unknown as AppApi);
    expect(client.patchHistoryMetadata).toBeUndefined();
    expect(client.onHistoryMetadataChanged).toBeUndefined();
    await client.updateHistoryMetadata("asset", { favorite: true });
    expect(updateHistoryMetadata).toHaveBeenCalledWith("asset", { favorite: true });
  });
  it("keeps the tag input available for retry when persistence fails", async () => {
    const root = document.createElement("div"); root.innerHTML = '<div data-history-tags-inline><div data-history-tag-list></div><input data-history-tag-input><div data-history-tag-suggestions></div></div>';
    document.body.append(root);
    const notify = vi.fn();
    const cleanup = mountHistoryTagEditor({ notify, t: (key: string) => key } as unknown as RendererContext,
      root.firstElementChild as HTMLElement, { getTags: () => [], getAvailableTags: () => [], escapeHtml: value => value, icon: () => "", editLabel: "edit", removeLabel: "remove", emptyText: "empty", duplicateText: "duplicate", updateFailedText: "failed", applyOperation: async () => { throw new Error("save failed"); } });
    const input = root.querySelector("input")!; input.value = "retry-tag";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() => expect(notify).toHaveBeenCalledOnce());
    expect(input.value).toBe("retry-tag");
    cleanup();
  });
  it("merges success into current state without replacing a newer draft or navigating", async () => {
    const initial = createDefaultState(); initial.history = createHistoryPerformanceFixture(2).videos;
    let current = initial;
    let finish!: (value: unknown) => void;
    const navigate = vi.fn(), requestRender = vi.fn();
    const context = { getState: () => current, navigate, requestRender, application: { patchHistoryMetadata: () => new Promise(resolve => { finish = resolve; }) } } as unknown as RendererContext;
    const item = initial.history[1]!;
    const pending = updateHistoryMetadata(context, [{ assetId: item.id, patch: { favorite: true } }]);
    current = { ...initial, draft: { ...initial.draft, seed: 999 } };
    finish([{ id: item.id, favorite: true, rating: item.rating, tags: item.tags, previous: item }]);
    const result = await pending;
    expect(result.draft).toBe(current.draft);
    expect(result.history[1]!.favorite).toBe(true);
    expect(navigate).not.toHaveBeenCalled(); expect(requestRender).not.toHaveBeenCalled();
  });

  it("also preserves new drafts when falling back to an older full-state metadata reply", async () => {
    const before = createDefaultState(); before.history = createHistoryPerformanceFixture(2).videos;
    let current = before;
    const target = before.history[1]!;
    const reply = { ...before, history: before.history.map(item => item.id === target.id ? { ...item, favorite: true } : item) };
    const context = { getState: () => current, application: { updateHistoryMetadata: async () => reply } } as unknown as RendererContext;
    const pending = updateHistoryMetadata(context, [{ assetId: target.id, patch: { favorite: true } }]);
    current = { ...before, draft: { ...before.draft, seed: 999 } };
    const next = await pending;
    expect(next.draft).toBe(current.draft);
    expect(next.history[1]!.favorite).toBe(true);
  });

  it.each([{ favorite: true }, { rating: 4 }, { tags: ["test"] }] as HistoryMetadataPatch[])("keeps a target-specific failure action after leaving the detail: %j", async patch => {
    const state = createDefaultState(); state.history = createHistoryPerformanceFixture(2).videos;
    const target = state.history[1]!;
    let fail!: (error: Error) => void;
    const notify = vi.fn(), open = vi.fn(), navigate = vi.fn();
    const context = { getState: () => state, navigate, notify, t: createTranslator("zh-CN").t,
      application: { patchHistoryMetadata: () => new Promise((_resolve, reject) => { fail = reject; }) } } as unknown as RendererContext;
    const pending = updateHistoryMetadata(context, [{ assetId: target.id, patch }], open);
    const assertion = expect(pending).rejects.toBeInstanceOf(HistoryMetadataSaveError);
    fail(new Error("Error invoking remote method 'history:patch-metadata': StateRecoveryError: disk unavailable")); await assertion;
    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0]![0]).toContain(target.title);
    expect(notify.mock.calls[0]![0]).not.toContain("invoking remote");
    const options = notify.mock.calls[0]![1] as RendererNotifyOptions;
    expect(options.actions![0]!.label).toBe("前往历史");
    expect(options).toMatchObject({ kind: "error", renderPage: false });
    expect(open).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
    await options.actions![0]!.run(); expect(open).toHaveBeenCalledWith(target.id, "video");
  });

  it("finishes accepted tag saves after cleanup without refocusing or rebuilding the departed editor", async () => {
    const root = document.createElement("div"); root.innerHTML = '<div data-history-tags-inline><div data-history-tag-list></div><input data-history-tag-input><div data-history-tag-suggestions></div></div>';
    document.body.append(root);
    let finish!: () => void;
    const saved = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const committed = vi.fn();
    const context = { notify: vi.fn(), t: (key: string) => key } as unknown as RendererContext;
    const cleanup = mountHistoryTagEditor(context, root.firstElementChild as HTMLElement, { getTags: () => [], getAvailableTags: () => [],
      escapeHtml: value => value, icon: () => "", editLabel: "edit", removeLabel: "remove", emptyText: "empty", duplicateText: "duplicate", updateFailedText: "failed", applyOperation: saved, onCommitted: committed });
    const input = root.querySelector("input")!; input.value = "tag"; input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() => expect(saved).toHaveBeenCalledOnce());
    cleanup(); root.replaceChildren(); const next = document.createElement("input"); document.body.append(next); next.focus();
    finish(); await new Promise(resolve => setTimeout(resolve, 0));
    expect(committed).not.toHaveBeenCalled(); expect(document.activeElement).toBe(next);
  });
});
