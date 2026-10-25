// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { presentDecodedImage } from "../src/renderer/pages/history/decoded-presentation";
afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });
describe("decoded History cover replacement", () => {
  it("retains the current cover until decode completes", async () => {
    let ready!: () => void;
    vi.stubGlobal("Image", class { src = ""; naturalWidth = 100; decode = () => new Promise<void>(resolve => { ready = resolve; }); });
    const image = document.createElement("img"); image.src = "old.png"; document.body.append(image);
    const next = presentDecodedImage(image, "new.png", new AbortController().signal);
    expect(image.getAttribute("src")).toBe("old.png"); ready(); expect(await next).toBe(true);
    expect(image.getAttribute("src")).toBe("new.png");
  });
  it("does not overwrite a newer view after abort or decode failure", async () => {
    let ready!: () => void;
    vi.stubGlobal("Image", class { src = ""; naturalWidth = 100; decode = () => new Promise<void>(resolve => { ready = resolve; }); });
    const image = document.createElement("img"); image.src = "old.png"; document.body.append(image);
    const abort = new AbortController(), next = presentDecodedImage(image, "stale.png", abort.signal);
    abort.abort(); ready(); expect(await next).toBe(false); expect(image.getAttribute("src")).toBe("old.png");
  });
});
