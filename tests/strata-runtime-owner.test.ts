import { describe, expect, it, vi } from "vitest";
import { createDefaultSettings } from "../src/core/defaults.js";
import { StrataRuntimeOwner } from "../electron/services/strata-runtime-owner.js";
import { StrataService } from "../electron/services/strata-service.js";
import { strataFixturePolicy } from "./helpers/strata-pack-fixture.js";
import type { prepareStrataModelRuntime } from "../electron/services/strata-model-preparation.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { writeStrataPreparedFixture } from "./helpers/strata-pack-fixture.js";

const settings = createDefaultSettings();
function fixture() {
  let alive = false;
  const child = { pid: 1234, running: () => alive, stop: vi.fn(async () => { alive = false; }) };
  const service = new StrataService({
    launch: async () => { alive = true; return child; }, portInUse: async () => false,
    fetch: vi.fn(async (url) => new Response(JSON.stringify(String(url).endsWith("/health")
      ? { service: "strata", status: "ok", loaded: false, api_key: true } : { object: "list", data: [] })))
  });
  let resourcesBusy = false;
  const prepare = vi.fn<typeof prepareStrataModelRuntime>(async () => ({ configPath: "fixture.json", packDirectory: "fixture", receiptPath: "fixture/receipt", modelId: "fixture-model" }));
  const owner = new StrataRuntimeOwner({ service, run: vi.fn(), prepare, isResourcesBusy: () => resourcesBusy,
    prepareLaunch: async () => ({ executable: "fixture", args: [], cwd: "fixture", apiKey: "secret", port: 43127, modelId: "fixture-model" }) });
  return { owner, child, service, prepare, busy: () => { resourcesBusy = true; } };
}

describe("application Strata ownership", () => {
  it("reloads only on first activation, reuses the base pack and retains later on/off mode switches", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "strata-owner-modes-"));
    const configPath = path.join(root, "pack", "runtime.json"), modelId = "strata/qwen3.8-flash-next-iq3_xxs";
    await writeStrataPreparedFixture(root, configPath);
    const f = fixture(), selected = { ...settings, promptModelId: modelId };
    let vector = "off";
    vi.spyOn(f.service, "hasVerifiedControlVector").mockImplementation(async mode => vector === mode);
    vi.spyOn(f.service, "load").mockImplementation(async () => ({ ...f.service.snapshot(), modelLoaded: true }));
    const originalSnapshot = f.service.snapshot.bind(f.service);
    const snapshot = vi.spyOn(f.service, "snapshot");
    snapshot.mockImplementation(() => ({ ...originalSnapshot(), modelLoaded: f.service.monitorConnection() !== null }));
    const launch = vi.fn(async (s) => { vector = s.strataUncensoredMode; return { executable: "fixture", args: ["--api-monitor"], cwd: root, apiKey: "secret", port: 43127, modelId }; });
    const prepare = vi.fn(), cache = vi.fn(async () => configPath);
    const owner = new StrataRuntimeOwner({ run: vi.fn(), service: f.service, prepare, findPrepared: cache,
      isResourcesBusy: () => false, prepareLaunch: launch });
    try {
      await owner.ensurePromptReady(selected, strataFixturePolicy);
      // Each cold start builds a lazy plan and an adaptive plan; switching mode off does neither.
      const initial = launch.mock.calls.length;
      for (const strataReasoningEffort of ["off", "low", "high", "medium"] as const) {
        await owner.ensurePromptReady({ ...selected, strataReasoningEffort }, strataFixturePolicy);
        expect(launch.mock.calls.length).toBe(initial);
      }
      await owner.ensurePromptReady({ ...selected, strataUncensored: true, strataUncensoredMode: "builtin" }, strataFixturePolicy);
      expect(launch.mock.calls.length).toBe(initial * 2);
      const enabled = launch.mock.calls.length;
      await owner.ensurePromptReady({ ...selected, strataUncensored: false, strataUncensoredMode: "off" }, strataFixturePolicy);
      await owner.ensurePromptReady({ ...selected, strataUncensored: true, strataUncensoredMode: "builtin" }, strataFixturePolicy);
      expect(launch.mock.calls).toHaveLength(enabled);
      await owner.ensurePromptReady({ ...selected, strataUncensored: true, strataUncensoredMode: "community" }, strataFixturePolicy);
      expect(launch.mock.calls).toHaveLength(enabled + initial);
      await owner.ensurePromptReady({ ...selected, strataUncensoredMode: "off" }, strataFixturePolicy);
      await owner.ensurePromptReady({ ...selected, strataUncensoredMode: "community" }, strataFixturePolicy);
      expect(launch.mock.calls).toHaveLength(enabled + initial);
      expect(prepare).not.toHaveBeenCalled(); expect(cache).toHaveBeenCalledTimes(3);
    } finally { await owner.stop(); vi.restoreAllMocks(); await fs.rm(root, { recursive: true, force: true }); }
  });
  it("reports CPU-only first-use preparation before any server or GPU launch", async () => {
    const f = fixture(), stages: string[] = [], log = vi.fn(), launch = vi.fn();
    const prepare = vi.fn(async () => { throw new Error("CPU preparation fixture stopped"); });
    const owner = new StrataRuntimeOwner({ service: f.service, run: vi.fn(), prepare,
      findPrepared: async () => null, prepareLaunch: launch, isResourcesBusy: () => false });
    await expect(owner.ensurePromptReady(settings, strataFixturePolicy, { onStage: (stage) => stages.push(stage), onLog: log })).rejects.toThrow("CPU preparation fixture");
    expect(stages).toEqual(["checking", "preparing"]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("此阶段尚未启动 Strata 服务"));
    expect(launch).not.toHaveBeenCalled(); expect(owner.snapshot().pid).toBeNull();
  });
  it("rejects an over-budget request before GPU handoff/load, cleaning the lazy service", async () => {
    const f = fixture(), handoff = vi.fn(async () => undefined);
    const preflight = vi.spyOn(f.service, "preflight").mockRejectedValue(new Error("上下文超限"));
    const load = vi.spyOn(f.service, "load");
    const owner = new StrataRuntimeOwner({ service: f.service, run: vi.fn(), prepare: f.prepare,
      findPrepared: async () => null, isResourcesBusy: () => false, beforeInference: handoff,
      prepareLaunch: async () => ({ executable: "fixture", args: [], cwd: "fixture", apiKey: "secret", port: 43127, modelId: "fixture-model" }) });
    const request = { modelId: "fixture-model", messages: [{ role: "user" as const, content: "完整长资料" }],
      maxTokens: 8192, temperature: .7, contextSize: 32768, visionTokensPerImage: 1024 };
    await expect(owner.ensurePromptReady({ ...settings, promptModelId: "fixture-model" }, strataFixturePolicy, { request })).rejects.toThrow("上下文");
    expect(preflight).toHaveBeenCalledWith(request, expect.any(AbortSignal));
    expect(load).not.toHaveBeenCalled(); expect(handoff).not.toHaveBeenCalled();
    expect(f.child.stop).toHaveBeenCalledOnce(); expect(owner.snapshot().pid).toBeNull();
  });
  it("owns prepare -> authenticated load -> retained reuse, with a caller-bound signal instead of blocking its own Prompt lease", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "strata-owner-prompt-"));
    const configPath = path.join(root, "pack", "runtime.json");
    const modelId = "strata/qwen3.8-flash-next-iq3_xxs";
    await writeStrataPreparedFixture(root, configPath);
    const signal = new AbortController().signal;
    let alive = false, loaded = false;
    const service = new StrataService({
      launch: async () => { alive = true; return { pid: 123, running: () => alive, stop: async () => { alive = false; } }; },
      portInUse: async () => false,
      fetch: async (url) => {
        if (String(url).endsWith("/v1/load")) { loaded = true; return new Response('{"status":"loaded"}'); }
        return new Response(JSON.stringify(String(url).endsWith("/health")
          ? { service: "strata", status: "ok", loaded, api_key: true } : { object: "list", data: [] }));
      }
    });
    const prepare = vi.fn(async () => ({ configPath, modelId, packDirectory: path.dirname(configPath), receiptPath: "" }));
    const cache = vi.fn(async () => null), handoff = vi.fn(async () => undefined);
    const owner = new StrataRuntimeOwner({ run: vi.fn(), service, prepare, findPrepared: cache,
      isResourcesBusy: (caller) => caller !== signal, beforeInference: handoff,
      prepareLaunch: async () => ({ executable: "fixture", args: [], cwd: root, apiKey: "secret", port: 43127, modelId }) });
    const selected = { ...settings, promptModelId: modelId };
    try {
      expect(await owner.ensurePromptReady(selected, strataFixturePolicy, { signal })).toMatchObject({ modelLoaded: true, pid: 123 });
      expect(handoff).toHaveBeenCalledOnce();
      await owner.ensurePromptReady(selected, strataFixturePolicy, { signal });
      expect(prepare).toHaveBeenCalledOnce(); expect(cache).toHaveBeenCalledOnce();
      await expect(owner.withSoftwareChange(async () => undefined)).rejects.toThrow();
    } finally { await owner.stop(); await fs.rm(root, { recursive: true, force: true }); }
  });
  it("requires the ComfyUI GPU handoff to succeed before sending a Strata request", async () => {
    const f = fixture(), handoff = vi.fn(async () => { throw new Error("ComfyUI release unconfirmed"); });
    const owner = new StrataRuntimeOwner({ service: f.service, run: vi.fn(), isResourcesBusy: () => false, beforeInference: handoff,
      prepareLaunch: async () => ({ executable: "fixture", args: [], cwd: "fixture", apiKey: "secret", port: 43127, modelId: "fixture-model" }) });
    await owner.startPrepared(settings, "fixture.json");
    const chat = vi.spyOn(f.service, "chat");
    await expect(owner.chat({ modelId: "fixture-model", messages: [{ role: "user", content: "enhance" }], maxTokens: 8192, temperature: 0.7 })).rejects.toThrow("release unconfirmed");
    expect(handoff).toHaveBeenCalledOnce(); expect(chat).not.toHaveBeenCalled();
    await owner.stop();
  });
  it("reuses a verified prepared runtime without rehashing or repacking", async () => {
    const f = fixture();
    await f.owner.startPrepared(settings, "fixture.json");
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.owner.snapshot().phase).toBe("ready");
    await f.owner.stop();
  });
  it("atomically excludes preparation, software changes and requests, not just GPU work", async () => {
    const f = fixture();
    let finish!: () => void;
    const gate = new Promise<void>((done) => { finish = done; });
    const change = f.owner.withSoftwareChange(async () => { await gate; return "installed"; });
    expect(f.owner.isBusy()).toBe(true);
    await expect(f.owner.prepareAndStart(settings, "fixture-model", strataFixturePolicy)).rejects.toThrow("当前有");
    await expect(f.owner.withSoftwareChange(async () => undefined)).rejects.toThrow("当前有");
    finish(); expect(await change).toBe("installed");
    expect(f.owner.isBusy()).toBe(false);
    await f.owner.prepareAndStart(settings, "fixture-model", strataFixturePolicy);
    expect(f.owner.snapshot()).toMatchObject({ phase: "ready", modelLoaded: false, pid: 1234 });
    await expect(f.owner.withSoftwareChange(async () => undefined)).rejects.toThrow("软件目录");
    await expect(f.owner.chat({ modelId: "different", messages: [], maxTokens: 1, temperature: 0 })).rejects.toThrow("模型不一致");
    await f.owner.stop();
    await expect(f.owner.withSoftwareChange(async () => "removed")).resolves.toBe("removed");
  });

  it("blocks queue/native Prompt collisions before preparation begins", async () => {
    const f = fixture(); f.busy();
    await expect(f.owner.prepareAndStart(settings, "fixture-model", strataFixturePolicy)).rejects.toThrow("当前有");
    expect(f.prepare).not.toHaveBeenCalled();
  });

  it("shutdown aborts a CPU preparation and waits for recovery, then rejects new work", async () => {
    const f = fixture();
    let started!: () => void, recover!: () => void;
    const ready = new Promise<void>((done) => { started = done; });
    const recovery = new Promise<void>((done) => { recover = done; });
    f.prepare.mockImplementationOnce(async (_settings, _model, _policy, _runtime, options) => {
      started();
      await new Promise<void>((done) => options!.signal!.addEventListener("abort", () => done(), { once: true }));
      await recovery; options!.signal!.throwIfAborted();
      throw new Error("unreachable");
    });
    const operation = f.owner.prepareAndStart(settings, "fixture-model", strataFixturePolicy);
    const rejected = expect(operation).rejects.toThrow("取消");
    await ready;
    const stop = f.owner.shutdown();
    let ended = false; void stop.then(() => { ended = true; });
    await Promise.resolve(); expect(ended).toBe(false); expect(f.owner.isBusy()).toBe(true);
    recover(); await rejected; await stop;
    expect(f.owner.snapshot().pid).toBeNull();
    await expect(f.owner.withSoftwareChange(async () => undefined)).rejects.toThrow("退出");
  });

  it("retains failed process cleanup ownership and blocks mutation until a successful retry", async () => {
    const f = fixture(); await f.owner.prepareAndStart(settings, "fixture-model", strataFixturePolicy);
    f.child.stop.mockRejectedValueOnce(new Error("cannot stop"));
    await expect(f.owner.stop()).rejects.toThrow("cannot stop");
    expect(f.owner.snapshot().pid).toBe(1234);
    await expect(f.owner.withSoftwareChange(async () => undefined)).rejects.toThrow("软件目录");
    await f.owner.stop(); expect(f.owner.snapshot().pid).toBeNull();
  });
});
