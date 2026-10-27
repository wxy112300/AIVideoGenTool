// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createJourney } from "./harness/create-journey";
import { scriptPageText } from "../src/core/long-video/script";
import { scriptEditingText } from "../src/core/long-video/script-buffers";
import { activateCreationDraft, creationDraftForMode } from "../src/core/creation-drafts";
import { createDefaultDraft } from "../src/core/defaults";
import { mountSharedUi } from "../src/renderer/shared/ui/runtime";

let journey: Awaited<ReturnType<typeof createJourney>> | undefined;
afterEach(() => { journey?.dispose(); journey = undefined; });

describe("persistent long video editor", () => {
  it("defaults to automatic, removes the extra role control and restores an explicit assisted choice", async () => {
    const h = journey = await createJourney();
    h.input("#generation-mode", "preview", "change");
    h.element("[data-confirm-layout]").click();
    const disposeUi = mountSharedUi(h.root);
    try {
      expect(h.element<HTMLSelectElement>("[data-preview-writing]").value).toBe("automatic");
      expect(h.state().draft.longVideoScript!.workingMode).toBe("automatic");
      expect(h.root.querySelector("[data-global-role]")).toBeNull();
      h.input(".create-long-editor textarea", "同一主角与城市街道");
      h.input("[data-preview-writing]", "guided", "change");
      h.element('.create-long-tabs [role="tab"]:nth-child(2)').click();
      h.element("[data-preview-whole]").click();
      h.element("[data-preview-pages]").click();
      h.element('.create-long-tabs [role="tab"]:first-child').click();
      expect(scriptPageText(h.state().draft.longVideoScript!.brief)).toBe("同一主角与城市街道");
      expect(h.state().queue).toHaveLength(0);
      const saved = structuredClone(h.state().draft);
      disposeUi(); h.dispose();
      journey = await createJourney(saved);
      expect(journey.element<HTMLSelectElement>("[data-preview-writing]").value).toBe("guided");
      expect(journey.state().draft.longVideoScript!.workingMode).toBe("assisted");
    } finally { disposeUi(); }
  });

  it("steps through sixteen segments with narrow arrows and preserves text and keyboard navigation", async () => {
    const h = journey = await createJourney();
    h.input("#generation-mode", "preview", "change");
    h.input("[data-preview-duration-number]", "120");
    h.input("[data-preview-count-number]", "16");
    h.element("[data-confirm-layout]").click();
    h.input(".create-long-editor textarea", "完整故事意图");
    const tabs = () => h.root.querySelectorAll<HTMLButtonElement>('.create-long-tabs [role="tab"]');
    expect(tabs()).toHaveLength(17);
    const previous = h.element<HTMLButtonElement>("[data-preview-previous]");
    const next = h.element<HTMLButtonElement>("[data-preview-next]");
    expect(previous.disabled).toBe(true);
    for (let index = 1; index <= 16; index++) {
      expect(next.disabled).toBe(false); next.click();
      expect(tabs()[index]!.getAttribute("aria-selected")).toBe("true");
    }
    expect(next.disabled).toBe(true);
    next.click(); expect(tabs()[16]!.getAttribute("aria-selected")).toBe("true");
    h.input(".create-long-editor textarea", "第十六段收尾");
    for (let index = 0; index < 16; index++) previous.click();
    expect(previous.disabled).toBe(true);
    expect(h.element<HTMLTextAreaElement>(".create-long-editor textarea").value).toBe("完整故事意图");
    h.element("[data-preview-whole]").click();
    expect(previous.disabled).toBe(true); expect(next.disabled).toBe(true);
    h.element("[data-preview-pages]").click();
    tabs()[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(h.element<HTMLTextAreaElement>(".create-long-editor textarea").value).toBe("第十六段收尾");
    expect(document.activeElement).toBe(tabs()[16]);
    expect(h.state().draft.longVideoScript!.activePageId).toBe(h.state().draft.longVideoScript!.segments[15]!.id);
  });

  it("saves in-progress typing without per-character versions and restores it in a new page root", async () => {
    let h = journey = await createJourney();
    h.input("#prompt-input", "原生提示词");
    const original = structuredClone(h.state().draft.promptVersions);
    h.input("#generation-mode", "preview", "change");
    h.element("[data-confirm-layout]").click();
    h.element('.create-long-tabs [role="tab"]:nth-child(2)').click();
    const field = h.element<HTMLTextAreaElement>(".create-long-editor textarea");
    field.focus();
    const focused = document.activeElement;
    h.input(".create-long-editor textarea", "第一");
    h.input(".create-long-editor textarea", "第一段动作\n对白");
    expect(document.activeElement).toBe(focused);
    expect(field.isConnected).toBe(true);
    const script = h.state().draft.longVideoScript!;
    expect(scriptPageText(script.brief)).toBe("原生提示词");
    expect(script.segments[0]!.versions).toHaveLength(1);
    expect(scriptEditingText(script, script.segments[0]!)).toBe("第一段动作\n对白");
    const saved = structuredClone(h.state().draft);
    h.dispose();
    h = journey = await createJourney(saved);
    expect(h.element<HTMLSelectElement>("#generation-mode").value).toBe("preview");
    expect(h.element<HTMLTextAreaElement>(".create-long-editor textarea").value).toBe("第一段动作\n对白");
    h.element('.create-long-tabs [role="tab"]:nth-child(3)').click();
    expect(h.state().draft.longVideoScript!.segments[0]!.versions).toHaveLength(2);
    expect(h.state().draft.longVideoScript!.segments[0]!.id).toBe(script.segments[0]!.id);
    expect(h.state().draft.promptVersions).toEqual(original);
    expect(h.element<HTMLButtonElement>("#enqueue").disabled).toBe(true);
    h.element("#enqueue").click();
    expect(h.application.enqueue).not.toHaveBeenCalled();
  });

  it("uses per-page versions and durable locks across whole/segment views and redraw", async () => {
    const h = journey = await createJourney();
    h.input("#generation-mode", "preview", "change"); h.element("[data-confirm-layout]").click();
    h.element('.create-long-tabs [role="tab"]:nth-child(2)').click();
    h.input(".create-long-editor textarea", "初稿");
    h.element("[data-preview-whole]").click();
    const whole = h.element<HTMLElement>('[data-preview-whole-page="1"]');
    whole.textContent = "整片视图修改";
    whole.dispatchEvent(new InputEvent("input", { bubbles: true }));
    h.element("[data-preview-pages]").click();
    expect(h.element<HTMLButtonElement>("#prompt-prev").disabled).toBe(false);
    h.element("#prompt-prev").click();
    expect(h.element<HTMLTextAreaElement>(".create-long-editor textarea").value).toBe("初稿");
    h.element("#prompt-next").click();
    expect(h.element<HTMLTextAreaElement>(".create-long-editor textarea").value).toBe("整片视图修改");
    h.element("[data-preview-lock]").click(); h.render();
    expect(h.element<HTMLTextAreaElement>(".create-long-editor textarea").readOnly).toBe(true);
    expect(h.state().draft.longVideoScript!.segments[0]!.locked).toBe(true);
    h.element("[data-preview-whole]").click();
    expect(h.element<HTMLElement>('[data-preview-whole-page="1"]').contentEditable).toBe("false");
  });

  it("keeps the confirmed layout until explicit adoption and archives removed page identities", async () => {
    const h = journey = await createJourney();
    h.input("#generation-mode", "preview", "change"); h.element("[data-confirm-layout]").click();
    const original = structuredClone(h.state().draft.longVideoScript!);
    h.input("[data-preview-duration-number]", "30");
    h.input("[data-preview-count-number]", "2");
    expect(h.state().draft.longVideoScript!.layout).toEqual(original.layout);
    expect(h.state().draft.longVideoEditor!.confirmed).toBe(false);
    h.element("[data-confirm-layout]").click();
    const script = h.state().draft.longVideoScript!;
    expect(script.segments.map(p => p.id)).toEqual(original.segments.slice(0, 2).map(p => p.id));
    expect(script.archived.map(p => p.id)).toEqual(original.segments.slice(2).map(p => p.id));
    h.input("[data-preview-duration-number]", "60"); h.element("[data-confirm-layout]").click();
    expect(h.state().draft.longVideoScript!.segments.map(p => p.id)).toEqual(original.segments.map(p => p.id));
    const restored = structuredClone(h.state().draft.longVideoScript!.layout);
    h.input("[data-preview-duration-number]", "120");
    h.input("[data-preview-count-number]", "1"); h.element("[data-confirm-layout]").click();
    expect(h.state().draft.longVideoScript!.layout).toEqual(restored);
    expect(h.state().draft.longVideoEditor!.confirmed).toBe(false);
    expect(h.context.notify).toHaveBeenCalledWith(expect.stringContaining("4–15"), expect.anything());
  });

  it("flushes on blur without removing the clicked tab and persists the chosen page by ID", async () => {
    const h = journey = await createJourney();
    h.input("#generation-mode", "preview", "change"); h.element("[data-confirm-layout]").click();
    const text = h.element<HTMLTextAreaElement>(".create-long-editor textarea");
    text.focus(); h.input(".create-long-editor textarea", "全局调整");
    const tab = h.element<HTMLButtonElement>('.create-long-tabs [role="tab"]:nth-child(2)');
    h.element<HTMLElement>(".create-long-editor .create-rich-prompt").blur(); expect(tab.isConnected).toBe(true); tab.click();
    expect(h.state().draft.longVideoScript!.activePageId).toBe(h.state().draft.longVideoScript!.segments[0]!.id);
    expect(scriptPageText(h.state().draft.longVideoScript!.brief)).toBe("全局调整");
    await vi.waitFor(() => expect(h.application.saveDraft).toHaveBeenCalled());
  });
  it("does not resurrect a cleared script or share the local editor with another creation mode", async () => {
    const h = journey = await createJourney();
    h.input("#generation-mode", "preview", "change"); h.element("[data-confirm-layout]").click();
    h.element('.create-long-tabs [role="tab"]:nth-child(2)').click(); h.input(".create-long-editor textarea", "仅图生视频");
    activateCreationDraft(h.state(), { ...createDefaultDraft(), inputMode: "video", modelId: "minimax_h3_fl2va" });
    h.setMode("video-extension");
    expect(h.state().draft.inputMode).toBe("video");
    expect(h.element<HTMLSelectElement>("#generation-mode").value).not.toBe("preview");
    expect(h.state().draft.longVideoScript).toBeUndefined();
    activateCreationDraft(h.state(), creationDraftForMode(h.state(), "image")!);
    h.setMode("image-to-video");
    expect(h.element<HTMLTextAreaElement>(".create-long-editor textarea").value).toBe("仅图生视频");
    h.input("#generation-mode", "native", "change");
    h.coordinator.clearDraft("image-to-video"); h.render();
    expect(h.element<HTMLSelectElement>("#generation-mode").value).not.toBe("preview");
    expect(h.state().draft.longVideoScript).toBeUndefined();
  });
});
