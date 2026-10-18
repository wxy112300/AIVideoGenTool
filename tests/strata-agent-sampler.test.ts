import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readReliableStrataResources } from "../electron/services/strata-resources.js";
const mock = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", async original => ({ ...await original<typeof import("node:child_process")>(), spawn: mock.spawn }));
import { AGENT_RESOURCE_RETRY, AgentResourceSampler } from "../electron/services/strata-agent-sampler.js";
const GiB = 1024 ** 3;
const safe = { memoryAvailableBytes: 66 * GiB, commitAvailableBytes: 64 * GiB, vramAvailableBytes: 4.7 * GiB, vramTotalBytes: 24 * GiB };
const active: AgentResourceSampler[] = [];
afterEach(async () => { for (const sampler of active.splice(0)) await sampler.stop(); vi.useRealTimers(); vi.clearAllMocks(); });
async function fixture(existing?: AgentResourceSampler) {
  const child = Object.assign(new EventEmitter(), { pid: 321, exitCode: null as number | null, signalCode: null, stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
  const requests: number[] = [];
  child.stdin.on("data", chunk => { requests.push(JSON.parse(String(chunk)).id); });
  vi.spyOn(child.stdin, "end").mockImplementation(() => { child.exitCode = 0; child.emit("close"); return child.stdin; });
  mock.spawn.mockImplementation(() => { queueMicrotask(() => child.emit("spawn")); return child; });
  const sampler = existing ?? new AgentResourceSampler(); active.push(sampler);
  const track = vi.fn(async () => {});
  await sampler.start("selected-python", "resources.py", track);
  const respond = (id: number, resources: unknown) => child.stdout.write(JSON.stringify({ id, resources }) + "\n");
  return { sampler, child, requests, respond, track };
}
describe("Agent persistent resource sampler protocol (no GPU)", () => {
  it("does not let an old helper's delayed close cancel a later run", async () => {
    const old = await fixture(); await old.sampler.stop();
    const next = await fixture(old.sampler);
    const fresh = next.sampler.read(); old.child.emit("close");
    next.respond(next.requests[0]!, safe);
    await expect(fresh).resolves.toMatchObject(safe);
  });
  it("uses a single owned child for concurrent fresh samples and ignores cancelled replies", async () => {
    const f = await fixture(), abort = new AbortController();
    const first = expect(f.sampler.read(abort.signal)).rejects.toThrow("cancelled");
    const second = f.sampler.read(); abort.abort(new Error("cancelled"));
    f.respond(f.requests[0]!, { ...safe, vramAvailableBytes: 0 });
    f.respond(f.requests[1]!, safe);
    await first; await expect(second).resolves.toMatchObject(safe);
    expect(mock.spawn).toHaveBeenCalledOnce(); expect(f.track).toHaveBeenCalledWith(321);
    await f.sampler.stop(); await expect(f.sampler.read()).rejects.toThrow("未运行");
  });
  it("retries transient missing telemetry, then still returns known hard pressure immediately", async () => {
    vi.useFakeTimers(); const f = await fixture();
    const fresh = readReliableStrataResources(f.sampler.read, { ...AGENT_RESOURCE_RETRY, onDiagnostic: () => {} });
    await vi.advanceTimersByTimeAsync(1); f.respond(f.requests[0]!, { ...safe, commitAvailableBytes: null });
    await vi.advanceTimersByTimeAsync(500); f.respond(f.requests[1]!, safe);
    await expect(fresh).resolves.toMatchObject(safe);
    const danger = readReliableStrataResources(f.sampler.read, { ...AGENT_RESOURCE_RETRY, onDiagnostic: () => {} });
    await vi.advanceTimersByTimeAsync(1); f.respond(f.requests[2]!, { ...safe, vramAvailableBytes: 1 * GiB });
    await expect(danger).resolves.toMatchObject({ vramAvailableBytes: GiB });
  });
  it("allows recovery after twelve seconds and more than three failed samples", async () => {
    vi.useFakeTimers(); const f = await fixture();
    let settled = false;
    const fresh = readReliableStrataResources(f.sampler.read, { ...AGENT_RESOURCE_RETRY, onDiagnostic: () => {} });
    fresh.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(14_000);
    expect(settled).toBe(false); expect(f.requests.length).toBeGreaterThan(3);
    f.respond(f.requests.at(-1)!, safe);
    await expect(fresh).resolves.toMatchObject(safe);
  });
  it.each(["hung", "missing"])("gives %s telemetry the full thirty seconds, then fails without accepting late replies", async mode => {
    vi.useFakeTimers(); const f = await fixture();
    if (mode === "missing") f.child.stdin.on("data", chunk => f.respond(JSON.parse(String(chunk)).id, { ...safe, commitAvailableBytes: null }));
    let settled = false;
    const reading = readReliableStrataResources(f.sampler.read, { ...AGENT_RESOURCE_RETRY, onDiagnostic: () => {} });
    reading.catch(() => { settled = true; });
    const failure = expect(reading).rejects.toThrow("持续不可用");
    await vi.advanceTimersByTimeAsync(29_999);
    expect(settled).toBe(false); expect(f.requests.length).toBeGreaterThan(3);
    await vi.advanceTimersByTimeAsync(1); await failure;
    f.respond(f.requests.at(-1)!, safe);
    expect(settled).toBe(true);
  });
  it("cancels immediately during the Agent thirty-second grace period", async () => {
    vi.useFakeTimers(); const f = await fixture(), abort = new AbortController();
    const failure = expect(readReliableStrataResources(f.sampler.read, { ...AGENT_RESOURCE_RETRY, signal: abort.signal, onDiagnostic: () => {} })).rejects.toThrow("user cancelled");
    await vi.advanceTimersByTimeAsync(15_000); abort.abort(new Error("user cancelled")); await failure;
    const count = f.requests.length; await vi.advanceTimersByTimeAsync(30_000);
    expect(f.requests).toHaveLength(count);
  });
  it("rejects invalid readings and actual helper exit instead of admitting stale or invented free memory", async () => {
    const f = await fixture();
    const invalid = expect(f.sampler.read()).rejects.toThrow("采样响应无效");
    f.respond(f.requests[0]!, { ...safe, vramAvailableBytes: 30 * GiB }); await invalid;
    const exited = expect(f.sampler.read()).rejects.toThrow("采样进程已退出");
    f.child.exitCode = 17; f.child.emit("close"); await exited;
    await expect(f.sampler.read()).rejects.toThrow("未运行");
  });
});
