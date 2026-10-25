// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RendererContext } from "../src/renderer/contracts";
import { mountHistoryReferencePreviews } from "../src/renderer/pages/history/reference-previews";
import { createTranslator } from "../src/core/i18n";

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });
describe("History reference previews", () => {
  it("opens the saved image, offers its unedited original, closes with focus restored, and ignores reads after navigation", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
    document.body.innerHTML = '<figure><button data-history-reference-open="cropped.png" data-history-reference-original="original.png" data-history-reference-kind="image">open</button><figcaption>First frame</figcaption></figure>';
    const readImage = vi.fn(async (path: string) => `data:image/png;base64,${path}`);
    const context = { root: document.body, assets: { readImage }, t: createTranslator("en-US").t } as unknown as RendererContext;
    const dispose = mountHistoryReferencePreviews(context);
    const trigger = document.querySelector<HTMLButtonElement>("figure button")!;
    trigger.click(); await Promise.resolve(); await Promise.resolve();
    const dialog = document.querySelector("dialog")!;
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector("img")!.src).toContain("cropped.png");
    const original = dialog.querySelector<HTMLButtonElement>("header button")!;
    original.click(); await Promise.resolve(); await Promise.resolve();
    expect(dialog.querySelector("img")!.src).toContain("original.png");
    dialog.close(); expect(document.activeElement).toBe(trigger);
    trigger.click(); dispose(); await Promise.resolve(); await Promise.resolve();
    expect(document.querySelector("dialog")).toBeNull();
  });
  it("reads visible duplicate paths once and announces their actual source", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    document.body.innerHTML = '<img data-history-reference-preview="same.png"><img data-history-reference-preview="same.png">';
    const readImage = vi.fn().mockResolvedValue("data:image/png;base64,AA==");
    const root = document.body;
    const changed = vi.fn(); root.querySelectorAll("img").forEach(image => image.addEventListener("image-media-source-change", changed));
    const dispose = mountHistoryReferencePreviews({ root, assets: { readImage } } as unknown as RendererContext);
    await Promise.resolve(); await Promise.resolve();
    expect(readImage).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledTimes(2);
    expect([...root.querySelectorAll("img")].every(image => image.src === "data:image/png;base64,AA==")).toBe(true);
    dispose();
  });
  it("keeps original recovery reachable when the processed reference was removed", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
    document.body.innerHTML = '<figure><button data-history-reference-open="missing.png" data-history-reference-original="original.png">open</button><figcaption>Picture 1</figcaption></figure>';
    const readImage = vi.fn(async (path: string) => path === "original.png" ? "data:image/png;base64,AA==" : null);
    const dispose = mountHistoryReferencePreviews({ root: document.body, assets: { readImage }, t: createTranslator("en-US").t } as unknown as RendererContext);
    document.querySelector<HTMLButtonElement>("figure button")!.click(); await Promise.resolve(); await Promise.resolve();
    const dialog = document.querySelector("dialog")!;
    expect(dialog.querySelector("[role=status]")!.textContent).toBe(createTranslator("en-US").t("history.page.currentFileUnavailable"));
    dialog.querySelector<HTMLButtonElement>("header button")!.click(); await Promise.resolve(); await Promise.resolve();
    expect(dialog.querySelector("img")!.hidden).toBe(false);
    expect(dialog.querySelector("img")!.src).toBe("data:image/png;base64,AA==");
    dispose();
  });
  it("ignores a late read after leaving detail and leaves failed media unavailable", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    document.body.innerHTML = '<img data-history-reference-preview="slow.png">';
    let resolve!: (url: string) => void;
    const readImage = vi.fn(() => new Promise<string>(done => { resolve = done; }));
    const root = document.body, image = root.querySelector("img")!;
    const dispose = mountHistoryReferencePreviews({ root, assets: { readImage } } as unknown as RendererContext);
    dispose(); resolve("data:image/png;base64,AA==");
    await Promise.resolve(); await Promise.resolve();
    expect(image.hasAttribute("src")).toBe(false);
    const failed = mountHistoryReferencePreviews({ root, assets: { readImage: vi.fn().mockRejectedValue(new Error("missing")) } } as unknown as RendererContext);
    await Promise.resolve(); await Promise.resolve();
    expect(image.dataset.imageMediaUrl).toBe("");
    expect(image.hasAttribute("src")).toBe(false); failed();
  });
});
