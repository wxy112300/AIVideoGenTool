import { afterEach, describe, expect, it, vi } from "vitest";
import {
  comfyServiceStartupGraceTimeoutMs,
  localEndpoint,
  serviceStartupTimeoutMs,
  waitForComfyServiceStartup,
  waitForService
} from "../electron/services/local-service-process";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("local service endpoint policy", () => {
  it("extends a slow ComfyUI cold start only while its process remains alive", async () => {
    const wait = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expect(waitForComfyServiceStartup(
      "http://127.0.0.1:8188/system_stats",
      () => true,
      undefined,
      wait
    )).resolves.toEqual({ ready: true, graceUsed: true });
    expect(wait).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:8188/system_stats",
      serviceStartupTimeoutMs,
      undefined
    );
    expect(wait).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:8188/system_stats",
      comfyServiceStartupGraceTimeoutMs,
      undefined
    );
  });

  it("does not extend startup after the ComfyUI process exits", async () => {
    const wait = vi.fn().mockResolvedValue(false);

    await expect(waitForComfyServiceStartup(
      "http://127.0.0.1:8188/system_stats",
      () => false,
      undefined,
      wait
    )).resolves.toEqual({ ready: false, graceUsed: false });
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it("accepts loopback HTTP endpoints and applies the service default port", () => {
    expect(localEndpoint("http://localhost", 8188)).toEqual({
      host: "127.0.0.1",
      port: 8188
    });
    expect(localEndpoint("http://127.0.0.1:8288", 8188)).toEqual({
      host: "127.0.0.1",
      port: 8288
    });
  });

  it("rejects remote, HTTPS and invalid port endpoints for local process control", () => {
    expect(localEndpoint("https://localhost:8188", 8188)).toBeNull();
    expect(localEndpoint("http://192.168.1.10:8188", 8188)).toBeNull();
    expect(localEndpoint("http://localhost:99999", 8188)).toBeNull();
  });

  it("stops readiness polling immediately when startup is cancelled", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    const controller = new AbortController();
    const cancellation = new Error("用户取消任务");
    const waiting = waitForService("http://127.0.0.1:8188/system_stats", 120_000, controller.signal);

    controller.abort(cancellation);

    await expect(waiting).rejects.toBe(cancellation);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
