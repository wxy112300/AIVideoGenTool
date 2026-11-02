import { afterEach, expect, it, vi } from "vitest";
import { installDepthAnything } from "../electron/services/environment.js";
import { createDefaultSettings } from "../src/core/defaults.js";

afterEach(() => vi.unstubAllGlobals());
it.each([
  ["en-US", "Remote ComfyUI supports connections only"],
  ["zh-TW", "遠端 ComfyUI 僅支援連線"]
] as const)("localizes %s asset maintenance guards before network or local launch", async (uiLocale, depth) => {
  const settings = { ...createDefaultSettings(), uiLocale,
    comfyUrl: "https://remote.example.test", lmStudioUrl: "https://remote.example.test" };
  const before = structuredClone(settings);
  const request = vi.fn(); vi.stubGlobal("fetch", request);
  const log = vi.fn();
  await expect(installDepthAnything(settings, log)).resolves.toMatchObject({ ok: false, message: expect.stringContaining(depth) });
  expect(request).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
  expect(settings).toEqual(before);
});
