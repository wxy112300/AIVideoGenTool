// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { CoverLoader } from "../src/web/covers";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function fixture() {
  vi.useFakeTimers();
  const created = vi.fn(() => `blob:cover-${Math.random()}`), revoked = vi.fn();
  vi.stubGlobal("URL", { createObjectURL: created, revokeObjectURL: revoked });
  const loader = new CoverLoader();
  return { loader, created, revoked };
}
describe("LAN thumbnail requests", () => {
  it("reuses a loaded cover after a virtual tile remount and releases each tile's object URL", async () => {
    const f = fixture(); const fetch = vi.fn(async () => new Response(new Blob(["jpeg"]))); vi.stubGlobal("fetch", fetch);
    const first = document.createElement("img"), second = document.createElement("img");
    const release = f.loader.load(first, "/cover", vi.fn()); await flush();
    expect(first.getAttribute("src")).toMatch(/^blob:/); release();
    const releaseAgain = f.loader.load(second, "/cover", vi.fn()); await flush();
    expect(fetch).toHaveBeenCalledOnce(); expect(second.getAttribute("src")).toMatch(/^blob:/);
    releaseAgain(); expect(f.revoked).toHaveBeenCalledTimes(2);
  });
  it("releases a pending cold-cover slot before polling, so cached covers behind it can load immediately", async () => {
    const f = fixture(); const pending: Array<(response: Response) => void> = [];
    const fetch = vi.fn(() => new Promise<Response>(resolve => pending.push(resolve))); vi.stubGlobal("fetch", fetch);
    const releases = Array.from({ length: 5 }, (_, i) => f.loader.load(document.createElement("img"), `/cover-${i}`, vi.fn()));
    expect(fetch).toHaveBeenCalledTimes(4);
    pending[0]!(new Response(null, { status: 503 })); await flush();
    expect(fetch).toHaveBeenCalledTimes(5); // No 3s backoff blocks the fifth cached image.
    for (const resolve of pending.slice(1)) resolve(new Response(new Blob(["cached"])));
    await flush(); for (const release of releases) release();
    await vi.advanceTimersByTimeAsync(2000); expect(fetch).toHaveBeenCalledTimes(5);
  });
  it("does not treat pending generation as a broken cover or cache the miss", async () => {
    const f = fixture(); const failed = vi.fn();
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(new Response(new Blob(["ready"]))); vi.stubGlobal("fetch", fetch);
    const image = document.createElement("img"); const release = f.loader.load(image, "/cover", failed); await flush();
    expect(failed).not.toHaveBeenCalled(); expect(image.getAttribute("src")).toBeNull();
    await vi.advanceTimersByTimeAsync(400); await flush();
    expect(fetch).toHaveBeenCalledTimes(2); expect(image.getAttribute("src")).toMatch(/^blob:/); release();
  });
});
