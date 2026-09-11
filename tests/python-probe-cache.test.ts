import { describe, expect, it, vi } from "vitest";
import {
  PythonProbeCache,
  type PythonProbeRunOutput
} from "../electron/services/python-probe-cache";
import type {
  ProbeIdentity,
  PythonFingerprintSnapshot,
  PythonLayoutManifest,
  PythonProbeFingerprintReader
} from "../electron/services/python-probe-fingerprint";

const identity = (name = "python.exe"): ProbeIdentity => ({
  pythonPath: `C:/comfy/${name}`,
  coreDirectory: "C:/comfy",
  dataDirectory: "C:/comfy"
});

function fingerprintReader(
  signature = "stable"
): { reader: PythonProbeFingerprintReader; reads: () => number } {
  let readCount = 0;
  const manifest: PythonLayoutManifest = {
    pythonPath: "C:/comfy/python.exe",
    prefix: "C:/comfy",
    basePrefix: "C:/comfy",
    searchPaths: ["C:/comfy/Lib/site-packages"],
    pthFiles: [],
    distributions: [],
    environmentDigest: "env"
  };
  const reader: PythonProbeFingerprintReader = {
    async read(_identity, previousManifest): Promise<PythonFingerprintSnapshot> {
      readCount += 1;
      return {
        signature,
        manifest: previousManifest ?? manifest,
        entries: [],
        cacheable: true,
        durationMs: 1
      };
    }
  };
  return { reader, reads: () => readCount };
}

function cacheForTests(
  now: () => number,
  fingerprint = fingerprintReader()
): PythonProbeCache<{ attention: string; llama: string }> {
  return new PythonProbeCache<{ attention: string; llama: string }>({
    now,
    wallNow: now,
    fingerprintReader: fingerprint.reader
  });
}

function rawValue(
  value: string,
  raw: ReturnType<typeof vi.fn>
): () => Promise<PythonProbeRunOutput<string>> {
  return async () => {
    raw(value);
    return { value, cacheable: true, state: "valid" };
  };
}

describe("PythonProbeCache", () => {
  it("reuses a successful native result while keeping the probe value out of disk", async () => {
    let now = 1_000;
    const fingerprint = fingerprintReader();
    const cache = cacheForTests(() => now, fingerprint);
    const raw = vi.fn();

    const first = await cache.readOrRun(
      identity(),
      "attention",
      "auto",
      rawValue("first", raw)
    );
    const second = await cache.readOrRun(
      identity(),
      "attention",
      "auto",
      rawValue("second", raw)
    );

    expect(first.evidence).toMatchObject({ source: "live", state: "valid" });
    expect(second).toMatchObject({ value: "first", evidence: { source: "cache", state: "valid" } });
    expect(raw).toHaveBeenCalledOnce();
    expect(cache.size()).toBe(1);
    expect(fingerprint.reads()).toBeGreaterThanOrEqual(3);

    now += 5 * 60 * 1_000;
    const expired = await cache.readOrRun(
      identity(),
      "attention",
      "auto",
      rawValue("after-expiry", raw)
    );
    expect(expired.evidence.source).toBe("live");
    expect(raw).toHaveBeenCalledTimes(2);
  });

  it("waits for an automatic probe before a forced live recheck", async () => {
    let now = 1_000;
    const cache = cacheForTests(() => now);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const raw = vi.fn(async (value: string) => {
      if (value === "auto") await gate;
    });
    const auto = cache.readOrRun(identity(), "attention", "auto", async () => {
      await raw("auto");
      return { value: "auto", cacheable: true, state: "valid" };
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const forced = cache.readOrRun(identity(), "attention", "live", async () => {
      await raw("live");
      return { value: "live", cacheable: true, state: "valid" };
    });

    expect(raw).toHaveBeenCalledWith("auto");
    expect(raw).not.toHaveBeenCalledWith("live");
    release();
    await expect(auto).resolves.toMatchObject({ value: "auto" });
    await expect(forced).resolves.toMatchObject({ value: "live", evidence: { source: "live" } });
    expect(raw).toHaveBeenCalledWith("live");
    expect(raw).toHaveBeenCalledTimes(2);
  });

  it("marks an in-flight result invalid when a mutation changes the epoch", async () => {
    let now = 1_000;
    const cache = cacheForTests(() => now);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const running = cache.readOrRun(identity(), "llama", "live", async () => {
      await gate;
      return { value: "stale", cacheable: true, state: "valid" };
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const finishMutation = cache.beginMutation();
    finishMutation();
    release();

    await expect(running).resolves.toMatchObject({
      value: "stale",
      evidence: { source: "live", state: "invalidated", reason: "inflight-invalidated" }
    });
    const next = await cache.readOrRun(identity(), "llama", "auto", async () => ({
      value: "fresh",
      cacheable: true,
      state: "valid" as const
    }));
    expect(next).toMatchObject({ value: "fresh", evidence: { source: "live", state: "valid" } });
  });

  it("evicts the least recently used identity after four identities", async () => {
    const cache = new PythonProbeCache<{ attention: string; llama: string }>({
      maxIdentities: 4,
      fingerprintReader: fingerprintReader().reader
    });
    for (let index = 0; index < 5; index += 1) {
      await cache.readOrRun(identity(`python-${index}.exe`), "attention", "auto", async () => ({
        value: String(index),
        cacheable: true,
        state: "valid" as const
      }));
    }
    expect(cache.size()).toBe(4);
  });
});
