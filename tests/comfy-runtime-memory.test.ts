import { afterEach, expect, it, vi } from "vitest";
import { parseComfyRuntimeMemory, readComfyRuntimeMemory } from "../electron/services/comfy-runtime-memory";
import { createDefaultSettings } from "../src/core/defaults";
afterEach(() => vi.unstubAllGlobals());
it("uses process-local active Torch bytes, including valid zero, across GPU devices", () => {
  expect(parseComfyRuntimeMemory({ devices: [
    { type: "cuda", vram_total: 24, torch_vram_total: 10, torch_vram_free: 8 },
    { type: "cuda", vram_total: 16, torch_vram_total: 0, torch_vram_free: 0 }, { type: "cpu" }
  ] })).toEqual({ devices: [{ allocatedBytes: 2, totalBytes: 24 }, { allocatedBytes: 0, totalBytes: 16 }] });
  for (const value of [null, {}, { devices: [] }, { devices: [{ type: "cuda", vram_total: 24 }] }, { devices: [{ vram_total: 24, torch_vram_total: 3, torch_vram_free: 4 }] }]) expect(parseComfyRuntimeMemory(value)).toBeNull();
});
it("reads the configured endpoint and reports failed telemetry rather than inventing zero", async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ devices: [] }))); vi.stubGlobal("fetch", fetcher);
  const settings = { ...createDefaultSettings(), comfyUrl: "http://127.0.0.1:18188/" };
  expect(await readComfyRuntimeMemory(settings)).toBeNull();
  expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:18188/system_stats", expect.any(Object));
  fetcher.mockResolvedValueOnce(new Response("failed", { status: 503 }));
  await expect(readComfyRuntimeMemory(settings)).rejects.toThrow("503");
});
