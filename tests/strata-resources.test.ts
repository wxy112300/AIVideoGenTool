import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readReliableStrataResources, readStrataResources, watchStrataResources } from "../electron/services/strata-resources.js";
import { FileReadResourcePressure } from "../src/core/strata-residency-pressure.js";

const mocks = vi.hoisted(() => ({ exec: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("node:child_process", () => ({ execFile: Object.assign(() => {}, { [Symbol.for("nodejs.util.promisify.custom")]: mocks.exec }) }));
vi.mock("../src/infrastructure/app-logger.js", () => ({ getApplicationLogger: () => mocks }));
const GiB = 1024 ** 3;
const safe = { memoryAvailableBytes: 50 * GiB, commitAvailableBytes: 50 * GiB, vramAvailableBytes: 6 * GiB, vramTotalBytes: 24 * GiB };
const missing = { ...safe, commitAvailableBytes: null };
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Strata fresh telemetry retries", () => {
  it("recovers from the reported 5.3s probe failure after the old Agent 6s cutoff, using H3's shared budget", async () => {
    const events = vi.fn();
    const read = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(missing), 5300)))
      .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(safe), 1100)));
    let settled = false;
    const fresh = readReliableStrataResources(read, { onDiagnostic: events });
    fresh.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(6000); expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(900); await expect(fresh).resolves.toEqual(safe);
    expect(events.mock.calls.map(([e]) => e.event)).toEqual(["retry", "recovered"]);
  });
  it("retries a missing sensor during confirmed file-cache RAM pressure instead of misreporting a hard stop", async () => {
    const policy=new FileReadResourcePressure();policy.setFileRead(true);
    const cache={...safe,memoryAvailableBytes:2.5*GiB,commitAvailableBytes:8*GiB};
    const read=vi.fn().mockResolvedValueOnce({...cache,commitAvailableBytes:null}).mockResolvedValue(cache),events=vi.fn();
    const result=readReliableStrataResources(read,{knownPressure:r=>policy.knownPressure(r),onDiagnostic:events});
    await vi.advanceTimersByTimeAsync(500);await expect(result).resolves.toEqual(cache);
    expect(events.mock.calls.map(([e])=>e.event)).toEqual(['retry','recovered']);expect(policy.check(cache)).toBeNull();
    expect(policy.knownPressure({...cache,commitAvailableBytes:null,vramAvailableBytes:1.9*GiB})).toContain('2GiB');
  });
  it("does not turn a transient unknown into zero memory or fail a healthy inference", async () => {
    const read = vi.fn().mockResolvedValueOnce(missing).mockResolvedValueOnce(safe), events = vi.fn();
    const result = readReliableStrataResources(read, { onDiagnostic: events });
    await vi.advanceTimersByTimeAsync(500);
    await expect(result).resolves.toEqual(safe);
    expect(read).toHaveBeenCalledTimes(2);
    expect(events.mock.calls.map(([event]) => event.event)).toEqual(["retry", "recovered"]);
    expect(events.mock.calls[0][0].commitAvailableBytes).toBeNull();
  });
  it("bounds persistent telemetry loss to three fresh probes, with an actionable failure", async () => {
    const read = vi.fn().mockResolvedValue(missing), events = vi.fn();
    const failure = expect(readReliableStrataResources(read, { onDiagnostic: events })).rejects.toThrow("3 次采样");
    await vi.advanceTimersByTimeAsync(1500); await failure;
    expect(read).toHaveBeenCalledTimes(3);
    expect(events.mock.calls.at(-1)![0]).toMatchObject({ event: "unavailable", missingMetrics: ["commitAvailableBytes"] });
  });
  it("recovers from an exception without exposing helper output or credentials", async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error("private-token raw helper output")).mockResolvedValueOnce(safe);
    const result = readReliableStrataResources(read);
    await vi.advanceTimersByTimeAsync(500); await expect(result).resolves.toEqual(safe);
    expect(mocks.warn).toHaveBeenCalledOnce(); expect(mocks.info).toHaveBeenCalledOnce();
    expect(JSON.stringify([mocks.warn.mock.calls, mocks.info.mock.calls])).not.toContain("private-token");
  });
  it("keeps the original hard pressure limits even while a different sensor is missing", async () => {
    const read = vi.fn().mockResolvedValue({ ...missing, vramAvailableBytes: 1.9 * GiB });
    await expect(readReliableStrataResources(read, { onDiagnostic: vi.fn() })).resolves.toMatchObject({ vramAvailableBytes: 1.9 * GiB });
    expect(read).toHaveBeenCalledOnce();
  });
  it("cannot run unmonitored forever when a probe never resolves", async () => {
    const read = vi.fn(() => new Promise<never>(() => {})), events = vi.fn();
    const failure = expect(readReliableStrataResources(read, { onDiagnostic: events })).rejects.toThrow("持续不可用");
    await vi.advanceTimersByTimeAsync(12_000); await failure;
    expect(read).toHaveBeenCalledOnce(); expect(events.mock.calls.at(-1)![0].event).toBe("unavailable");
  });
  it("cancels during retry delay without another probe or unavailable warning", async () => {
    const controller = new AbortController(), events = vi.fn(), read = vi.fn().mockResolvedValue(missing);
    const failure = expect(readReliableStrataResources(read, { signal: controller.signal, onDiagnostic: events })).rejects.toThrow("user cancelled");
    await vi.advanceTimersByTimeAsync(1); controller.abort(new Error("user cancelled")); await failure;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(read).toHaveBeenCalledOnce(); expect(events.mock.calls.map(([event]) => event.event)).toEqual(["retry"]);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("Strata operation-local resource watcher", () => {
  it("does not overlap slow probes and ignores a late dangerous sample after disposal", async () => {
    let resolve!: (value: typeof safe) => void;
    const read = vi.fn(() => new Promise<typeof safe>(done => { resolve = done; })), abort = vi.fn();
    const dispose = watchStrataResources(abort, read, 10, { onDiagnostic: vi.fn() });
    await vi.advanceTimersByTimeAsync(50); expect(read).toHaveBeenCalledOnce();
    await dispose(); resolve({ ...safe, memoryAvailableBytes: 0 });
    await vi.advanceTimersByTimeAsync(50); expect(abort).not.toHaveBeenCalled(); expect(read).toHaveBeenCalledOnce();
  });
  it("continues after a lost sample and still monitors later hard pressure", async () => {
    const abort = vi.fn(), events = vi.fn();
    const read = vi.fn().mockResolvedValueOnce(missing).mockResolvedValueOnce(safe).mockResolvedValue({ ...safe, vramAvailableBytes: 1.9 * GiB });
    const dispose = watchStrataResources(abort, read, 10, { onDiagnostic: events });
    await vi.advanceTimersByTimeAsync(510); expect(abort).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10); expect(abort).toHaveBeenCalledOnce();
    expect(abort.mock.calls[0][0].message).toContain("2GiB");
    await vi.advanceTimersByTimeAsync(1000); expect(read).toHaveBeenCalledTimes(3); await dispose();
  });
  it("aborts persistent loss once, instead of spamming failure or creating more probes", async () => {
    const read = vi.fn().mockResolvedValue(missing), abort = vi.fn();
    const dispose = watchStrataResources(abort, read, 10, { onDiagnostic: vi.fn() });
    await vi.advanceTimersByTimeAsync(1510); expect(abort).toHaveBeenCalledOnce();
    expect(abort.mock.calls[0][0].message).toContain("持续不可用");
    await vi.advanceTimersByTimeAsync(1000); expect(read).toHaveBeenCalledTimes(3); await dispose();
  });
  it("does not carry a preceding operation's retry into a later enhancement", async () => {
    const previousAbort = vi.fn(), nextAbort = vi.fn(), oldEvents = vi.fn();
    const oldRead = vi.fn().mockResolvedValue(missing);
    const oldDispose = watchStrataResources(previousAbort, oldRead, 10, { onDiagnostic: oldEvents });
    await vi.advanceTimersByTimeAsync(10); await oldDispose();
    const newRead = vi.fn().mockResolvedValue(safe);
    const newDispose = watchStrataResources(nextAbort, newRead, 10, { onDiagnostic: vi.fn() });
    await vi.advanceTimersByTimeAsync(2000); await newDispose();
    expect(previousAbort).not.toHaveBeenCalled(); expect(nextAbort).not.toHaveBeenCalled();
    expect(oldRead).toHaveBeenCalledOnce(); expect(oldEvents).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
});

describe("Strata narrow native telemetry", () => {
  beforeEach(() => vi.stubGlobal("process", { ...process, platform: "win32" }));
  it("queries only GPU memory and preserves the Windows commit unit", async () => {
    mocks.exec.mockImplementation(async (exe: string) => ({ stdout: exe === "nvidia-smi" ? "6144, 24564\n" : "52428800\n" }));
    const sample = await readStrataResources();
    expect(mocks.exec.mock.calls[0][1]).toEqual(["--query-gpu=memory.free,memory.total", "--format=csv,noheader,nounits"]);
    expect(sample).toMatchObject({ vramAvailableBytes: 6 * GiB, commitAvailableBytes: 50 * GiB, probeIssues: [] });
  });
  it("retains failure source/kind without turning invalid sensor values into zero", async () => {
    mocks.exec.mockImplementation(async (exe: string) => { if (exe === "nvidia-smi") return { stdout: "N/A, 24564" }; throw Object.assign(new Error("private stderr"), { killed: true }); });
    const sample = await readStrataResources();
    expect(sample).toMatchObject({ vramAvailableBytes: null, commitAvailableBytes: null,
      probeIssues: [{ source: "windows-commit", kind: "timeout" }, { source: "gpu-memory", kind: "invalid" }] });
    expect(JSON.stringify(sample)).not.toContain("private stderr");
  });
  it("waits for both cancelled native helpers before the next operation can begin", async () => {
    let acknowledged = 0, settled = false;
    mocks.exec.mockImplementation(async (_exe: string, _args: string[], options: { signal: AbortSignal }) => new Promise((_, reject) => {
      options.signal.addEventListener("abort", () => setTimeout(() => {
        acknowledged++; reject(Object.assign(new Error("cancelled native helper"), { name: "AbortError" }));
      }, 40), { once: true });
    }));
    const controller = new AbortController();
    const probe = readReliableStrataResources(readStrataResources, { signal: controller.signal, onDiagnostic: vi.fn() });
    probe.then(() => { settled = true; }, () => { settled = true; });
    const failure = expect(probe).rejects.toThrow("user cancel");
    await vi.advanceTimersByTimeAsync(1); controller.abort(new Error("user cancel"));
    await vi.advanceTimersByTimeAsync(1); expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(40); await failure;
    expect(acknowledged).toBe(2); expect(settled).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
});
