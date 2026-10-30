import { describe, expect, it, vi } from "vitest";
import {
  inspectLlamaCppPythonProbe,
  llamaCppStatusFromInspection,
  type LlamaCppPythonProbeResult
} from "../electron/services/llama-cpp-python";
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
  it("reuses raw llama facts across locale changes and formats projections without a native probe", async () => {
    let now = 1000;
    const cache = new PythonProbeCache<{ attention: string; llama: LlamaCppPythonProbeResult }>({
      now: () => now, wallNow: () => now, ttlMs: 1000, fingerprintReader: fingerprintReader().reader
    });
    const runner = vi.fn(async () => JSON.stringify({
      packageVersion: "0.4.5", pythonVersion: "3.12.11", packageDirectory: "使用者/llama_cpp",
      importable: true, gpuOffload: true, dynamicBackend: false, backendError: "DLL missing: 原文"
    }));
    const run = async () => ({ value: await inspectLlamaCppPythonProbe("python.exe", runner), cacheable: true });
    const first = await cache.readOrRun(identity(), "llama", "auto", run);
    const previous = { ...llamaCppStatusFromInspection("python.exe", first.value!),
      probeEvidence: first.evidence };
    expect(previous.ready).toBe(false);
    for (const [locale, detail] of [
      ["en-US", "An outdated or unusable Windows native backend is installed. Run a repair installation: DLL missing: 原文"],
      ["zh-TW", "已安裝舊版或無法使用的 Windows 原生後端；請執行修復安裝：DLL missing: 原文"],
      ["zh-CN", "已安装旧版或不可用的 Windows 原生后端；请执行修复安装：DLL missing: 原文"]
    ] as const) {
      const hit = await cache.readOrRun(identity(), "llama", "auto", run);
      expect(hit.metrics.nativeStarted).toBe(false);
      const format = (raw: LlamaCppPythonProbeResult, snapshot: typeof previous) =>
        ({ ...snapshot, detail: llamaCppStatusFromInspection(snapshot.pythonPath, raw, locale).detail });
      const projected = await cache.projectPrevious(identity(), "llama", previous, format);
      expect(projected.value).toEqual({ ...previous, detail });
      expect(projected.evidence.state).toBe("valid");
      expect(projected.metrics.nativeStarted).toBe(false);
      const sync = cache.projectPreviousSync(identity(), "llama", previous, format);
      expect(sync).toEqual(projected);
    }
    expect(runner).toHaveBeenCalledTimes(1);
    const stable = await cache.readOrRun(identity(), "llama", "auto", run);
    expect(stable.value).toEqual(first.value);
    expect(stable.value?.probe).not.toHaveProperty("detail");
    now = 2001;
    const expired = cache.projectPreviousSync(identity(), "llama", previous,
      (raw, snapshot) => ({ ...snapshot, detail: llamaCppStatusFromInspection("python.exe", raw, "en-US").detail }));
    expect(expired.evidence.state).toBe("expired");
    expect(expired.metrics.nativeStarted).toBe(false);
    expect(runner).toHaveBeenCalledTimes(1);
  });

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
