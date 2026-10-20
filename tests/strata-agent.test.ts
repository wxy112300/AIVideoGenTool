import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, it, expect, vi, afterEach } from "vitest";
import { agentDefaults, agentDirectory, agentSettings, agentStrataInstallationSettings, applyAgentDiscovery, normalizeAgentPreferences, readAgentPreferences, saveAgentPreferences } from "../electron/services/strata-agent-settings.js";
import { managedStrataDirectory } from "../electron/services/strata-installation.js";
import { STRATA_RELEASES } from "../src/core/catalog/dependencies/strata.js";
import { agentLaunchPlan } from "../electron/services/strata-agent-profile.js";
import { agentToken } from "../electron/services/strata-agent-token.js";
import { discoverAgentPack, locateClaude } from "../electron/services/strata-agent-doctor.js";
import { GpuResourceLease } from "../electron/services/gpu-resource-lease.js";
import { writeStrataPreparedFixture } from "./helpers/strata-pack-fixture.js";
import { StrataRuntimeOwner } from "../electron/services/strata-runtime-owner.js";
import { StrataService } from "../electron/services/strata-service.js";
import { STRATA_Q4_MODEL_ID } from "../src/core/catalog/models/strata.js";
import * as vectorTools from "../electron/services/strata-uncensored.js";
import { strataVectorForMode } from "../src/core/strata-uncensored.js";
import { strataDerivedDataDirectory } from "../electron/services/strata-model-preparation.js";

const roots: string[] = [];
const leases: GpuResourceLease[] = [];
const GiB = 1024 ** 3;
const resources = { memoryAvailableBytes: 100 * GiB, commitAvailableBytes: 130 * GiB, vramAvailableBytes: 22 * GiB, vramTotalBytes: 24 * GiB };
async function root() { const directory = await fs.mkdtemp(path.join(os.tmpdir(), "strata-agent-test-")); roots.push(directory); return directory; }
afterEach(async () => {
  vi.restoreAllMocks();
  for (const lease of leases.splice(0)) await lease.release();
  for (const directory of roots.splice(0)) await fs.rm(directory, { recursive: true, force: true });
});
async function leaseFixture(onHandoff = async () => false) {
  const directory = await root();
  const identity = vi.fn(async (pid: number) => pid === process.pid ? "controller-start" : null);
  const protect = async (value: string) => { await fs.mkdir(value, { recursive: true }); return value; };
  const first = new GpuResourceLease("studio", onHandoff, { directory, identity, protect });
  const second = new GpuResourceLease("agent", async () => false, { directory, identity, protect });
  leases.push(first, second); return { first, second, directory, identity };
}

describe("standalone Agent safety boundaries (no GPU inference)", () => {
  it("cache maintenance never requests a handoff from a loaded Agent/model", async () => {
    const handoff = vi.fn(async () => true), fixture = await leaseFixture(handoff);
    await fixture.first.acquire();
    const cleaner = new GpuResourceLease("studio", async () => false, { directory: fixture.directory, identity: fixture.identity,
      allowHandoff: false, protect: async directory => { await fs.mkdir(directory, { recursive: true }); return directory; } });
    leases.push(cleaner);
    await expect(cleaner.acquire()).rejects.toThrow("未请求卸载或交接");
    expect(handoff).not.toHaveBeenCalled(); expect(fixture.first.held).toBe(true); expect(cleaner.held).toBe(false);
  });
  it("rediscovers an expired generated pack after update but keeps invalid manual packs explicit", async () => {
    const directory = await root(); vi.stubEnv("LOCALAPPDATA", directory);
    try {
      const generated = path.join(strataDerivedDataDirectory(), "old-install", "runtime.json");
      await fs.mkdir(path.dirname(generated), { recursive: true }); await fs.writeFile(generated, "{}");
      expect(await discoverAgentPack(directory, agentDefaults().modelId, generated)).toBe("");
      const manual = path.join(directory, "manual-pack.json"); await fs.writeFile(manual, "{}");
      await expect(discoverAgentPack(directory, agentDefaults().modelId, manual)).rejects.toThrow("所选 pack");
    } finally { vi.unstubAllEnvs(); }
  });
  it("uses the shared runtime after an app update even when legacy preferences remember a deleted version", async () => {
    const directory = await root(); vi.stubEnv("LOCALAPPDATA", directory);
    try {
      const old = managedStrataDirectory(STRATA_RELEASES[1]);
      const p = normalizeAgentPreferences({ ...agentDefaults(), strataDirectory: old, packConfig: path.join(directory, "old-pack", "runtime.json") });
      expect(p.strataDirectory).toBe(""); expect(p.packConfig).toBe("");
      const found = { strata: { managedInstalled: true, installDirectory: managedStrataDirectory(), modelDirectory: "weights" }, claude: { available: false, path: "" }, ccSwitch: { path: "" }, cloud: { path: "" }, pack: "" };
      expect(applyAgentDiscovery(p, found).strataDirectory).toBe("");
      const custom = path.join(directory, "custom-strata");
      expect(normalizeAgentPreferences({ ...agentDefaults(), strataDirectory: custom, packConfig: path.join(directory, "manual.json") })).toMatchObject({ strataDirectory: custom, packConfig: path.join(directory, "manual.json") });
    } finally { vi.unstubAllEnvs(); }
  });
  it.each(["off","builtin","community"] as const)("creates Q4's isolated long-context plan with %s uncensored mode", async mode => {
    const directory = await root(), pack = path.join(directory,"q4-pack","runtime.json");
    await writeStrataPreparedFixture(directory,pack,STRATA_Q4_MODEL_ID);
    const baseline = await fs.readFile(pack,"utf8");
    const verify = vi.spyOn(vectorTools,"verifyStrataControlVector").mockImplementation(async (_install, selected) =>
      ({...strataVectorForMode(selected),filename:path.join(directory,`${selected}.gguf`)}));
    const preferences = normalizeAgentPreferences({...agentDefaults(),modelId:STRATA_Q4_MODEL_ID,uncensoredMode:mode,uncensored:mode !== "off"});
    const plan = await agentLaunchPlan({ preferences,install:directory,packConfig:pack,token:"local-test",directory:path.join(directory,"agent"),
      guardScript:"guard.py",resources:{...resources,memoryAvailableBytes:48*GiB,commitAvailableBytes:80*GiB} });
    expect(plan.modelId).toBe(STRATA_Q4_MODEL_ID);
    expect(plan.resourcePlan?.residentBudgetGiB).toBeLessThan(32);
    expect(Boolean(plan.controlVector)).toBe(mode !== "off");
    expect(verify).toHaveBeenCalledTimes(mode === "off" ? 0 : 1);
    const config = JSON.parse(await fs.readFile(plan.args[plan.args.indexOf("--config")+1],"utf8"));
    expect(config.args).toContain("--resident-budget-gib");
    expect(config.args).not.toContain("--resident-experts");
    expect(config.args).not.toContain("--mmap-experts");
    expect(config.args).toContain("--kv-resident");
    expect(config.sampling.experimental_speed_projection).toBe(mode !== "off");
    expect(config.fit_max_tokens).toBe(true);
    expect(config.host).toBe("127.0.0.1");
    expect(await fs.readFile(pack,"utf8")).toBe(baseline);
  });
  it("targets the new managed version beside a retained old install, not the old selected directory", async () => {
    const directory = await root(); vi.stubEnv("LOCALAPPDATA", directory);
    try {
      const release = STRATA_RELEASES[1], old = managedStrataDirectory(release);
      await fs.mkdir(old, { recursive: true });
      await fs.writeFile(path.join(old, "lvs-strata-install.json"), JSON.stringify({ owner: "local-video-studio", ...release, installedAt: "fixture" }));
      const p = { ...agentDefaults(), strataDirectory: old };
      expect((await agentStrataInstallationSettings(p)).strataInstallDirectory).toBe("");
      expect(p.strataDirectory).toBe(old);
      await expect(agentStrataInstallationSettings({ ...p, strataDirectory: path.join(directory, "manual") })).rejects.toThrow("手动");
      expect(await fs.stat(old)).toBeTruthy();
    } finally { vi.unstubAllEnvs(); }
  });
  it("migrates legacy uncensored to bundled only and preserves all three explicit modes", async () => {
    const { uncensoredMode: _mode, ...legacy } = agentDefaults();
    expect(normalizeAgentPreferences({ ...legacy, uncensored: true }).uncensoredMode).toBe("builtin");
    expect(normalizeAgentPreferences({ ...legacy, uncensored: false }).uncensoredMode).toBe("off");
    for (const mode of ["off", "builtin", "community"] as const) {
      const p = normalizeAgentPreferences({ ...agentDefaults(), uncensored: true, uncensoredMode: mode });
      expect(p.uncensoredMode).toBe(mode); expect(p.uncensored).toBe(mode !== "off");
      expect((await agentSettings(p, path.join(os.tmpdir(), "absent-mode-state.json"))).strataUncensoredMode).toBe(mode);
    }
    expect(() => normalizeAgentPreferences({ ...agentDefaults(), uncensoredMode: "anything" })).toThrow("模式无效");
  });
  it("retires the rejected generated software default without rewriting a chosen shared prefix", () => {
    expect(normalizeAgentPreferences({ ...agentDefaults(), cloudDirectory: path.join(agentDirectory(), "software") }).cloudDirectory).toBe("");
    const shared = path.join(os.tmpdir(), "shared-npm");
    expect(normalizeAgentPreferences({ ...agentDefaults(), cloudDirectory: shared }).cloudDirectory).toBe(shared);
  });
  it("fills detected selectors but preserves manual choices and a selected model root", () => {
    const found = { strata: { managedInstalled: true, installDirectory: "engine", modelDirectory: "weights" }, claude: { available: true, path: "cli" }, ccSwitch: { path: "switch" }, cloud: { path: "private-software" }, pack: "runtime" };
    expect(applyAgentDiscovery(agentDefaults(), found)).toMatchObject({ strataDirectory: "engine", modelDirectory: "weights", claudeEntry: "cli", ccSwitchPath: "switch", cloudDirectory: "private-software", packConfig: "runtime" });
    const manual = { ...agentDefaults(), strataDirectory: "manual-engine", modelRoot: "manual-root", claudeEntry: "manual-cli", packConfig: "manual-pack" };
    expect(applyAgentDiscovery(manual, found)).toMatchObject({ strataDirectory: "manual-engine", modelRoot: "manual-root", modelDirectory: "", claudeEntry: "manual-cli", packConfig: "manual-pack" });
    expect(manual.cloudDirectory).toBe("");
  });
  it("works without Studio/Comfy state and keeps unrelated provider/config data out of preferences", async () => {
    const directory = await root();
    const defaults = await readAgentPreferences(directory);
    expect(defaults.lan).toBe(false);
    expect(defaults.contextTokens).toBe(262144);
    const legacy = { ...defaults }; delete (legacy as Partial<typeof legacy>).contextTokens;
    expect(normalizeAgentPreferences(legacy).contextTokens).toBe(262144);
    expect(() => normalizeAgentPreferences({ ...defaults, contextTokens: 100000 })).toThrow('逐档');
    const missing = await agentSettings(defaults, path.join(directory, "absent-state.json"));
    expect(missing.comfyInstallDirectory).toBe(""); expect(missing.modelDirectory).toBe("");
    const state = path.join(directory, "state.json");
    await fs.writeFile(state, JSON.stringify({ settings: { modelDirectory: directory, strataPort: 43129, apiKey: "private-value", promptModelId: "other-model" } }));
    const settings = await agentSettings({ ...defaults, modelDirectory: directory }, state);
    expect(settings.modelDirectory).toBe(""); expect(settings.strataModelDirectory).toBe(directory);
    expect(settings.promptModelId).toBe(defaults.modelId);
    expect(JSON.stringify(settings)).not.toContain("private-value");
    const saved = await saveAgentPreferences({ ...defaults, authToken: "must-not-persist" }, directory);
    expect(await readAgentPreferences(directory)).toEqual(saved);
    expect(await fs.readFile(path.join(directory, "preferences.json"), "utf8")).not.toContain("must-not-persist");
  });
  it("rejects catalog bypass, LAN before first-use validation, duplicate/8080 ports and relative paths", () => {
    expect(() => normalizeAgentPreferences({ ...agentDefaults(), modelId: "random.gguf" })).toThrow("catalog");
    expect(() => normalizeAgentPreferences({ ...agentDefaults(), lan: true })).toThrow("首次安全验收");
    expect(() => normalizeAgentPreferences({ ...agentDefaults(), strataPort: 8080 })).toThrow("8080");
    expect(() => normalizeAgentPreferences({ ...agentDefaults(), guiPort: 43127 })).toThrow("同一端口");
    expect(() => normalizeAgentPreferences({ ...agentDefaults(), modelDirectory: "../models" })).toThrow("完整路径");
  });
  it("refuses an occupied GPU owner without terminating it; explicit release permits retry", async () => {
    const { first, second } = await leaseFixture();
    await first.acquire();
    await expect(second.acquire()).rejects.toThrow("未中止活跃 Agent");
    expect(first.held).toBe(true); expect(second.held).toBe(false);
    await first.release(); await second.acquire(); expect(second.held).toBe(true);
  });
  it("hands over only after the owner agrees and refuses new work while handing over", async () => {
    let first: GpuResourceLease;
    const fixture = await leaseFixture(async () => {
      await expect(first.acquire()).rejects.toThrow("正在交接"); return true;
    }); first = fixture.first;
    await first.acquire(); await fixture.second.acquire();
    expect(first.held).toBe(false); expect(fixture.second.held).toBe(true);
  });
  it("retains the lease on surviving child identity; PID reuse never authorizes terminating a new process", async () => {
    const fixture = await leaseFixture();
    let childAlive = true;
    fixture.identity.mockImplementation(async (pid) => pid === process.pid ? "controller-start" : pid === 12345 ? childAlive ? "child-start" : "reused-start" : null);
    await fixture.first.acquire(); await fixture.first.track(12345);
    await expect(fixture.first.release()).rejects.toThrow("子进程仍存活");
    expect(fixture.first.held).toBe(true);
    childAlive = false; await fixture.first.release(); expect(fixture.first.held).toBe(false);
  });
  it("does not reclaim a stale channel if a recorded model child still survives", async () => {
    const fixture = await leaseFixture();
    fixture.identity.mockImplementation(async (pid) => pid === 12345 ? "child-start" : pid === process.pid ? "controller-start" : null);
    await fs.writeFile(path.join(fixture.directory, "gpu-owner.json"), JSON.stringify({ schema: 1, epoch: "old", owner: "agent",
      process: { pid: 99887, started: "gone" }, children: [{ pid: 12345, started: "child-start" }], secret: "a".repeat(64) }));
    await expect(fixture.first.acquire()).rejects.toThrow("仍存活");
    expect(fixture.first.held).toBe(false);
    fixture.identity.mockImplementation(async (pid) => pid === process.pid ? "controller-start" : null);
    await fixture.first.acquire(); expect(fixture.first.held).toBe(true);
  });
  it("isolates Agent writable configuration/logs/cache without changing any shared pack bytes", async () => {
    const directory = await root(), pack = path.join(directory, "pack", "runtime.json");
    await writeStrataPreparedFixture(directory, pack);
    const baseline = await fs.readFile(pack, "utf8");
    const plan = await agentLaunchPlan({ preferences: agentDefaults(), install: directory, packConfig: pack,
      token: "fixture-token", directory: path.join(directory, "agent"), guardScript: path.join(directory, "guard.py"), resources });
    expect(plan.args.join(" ")).not.toContain("fixture-token");
    expect(plan.env?.STRATA_API_KEY).toBe("fixture-token");
    expect(plan.env?.STRATA_FILE_RELEASE).toBe("0");
    const config = JSON.parse(await fs.readFile(plan.args[plan.args.indexOf("--config") + 1]!, "utf8"));
    expect(config.cwd).toContain(path.join("agent", "runs")); expect(config.log).toContain(path.join("agent", "runs"));
    expect(config.slot_save_path).toContain(path.join("agent", "runs")); expect(config.tokenizer).toBe(path.join(directory, "pack", "tokenizer"));
    expect(config.fit_max_tokens).toBe(true); expect(config.anthropic_thinking).toBe("on_request"); expect(config.before_load_strict).toBe(true);
    expect(config.mcp_servers).toEqual({});
    expect(config.sampling.experimental_speed_projection).toBe(false);
    const extended = await agentLaunchPlan({ preferences: agentDefaults(), install: directory, packConfig: pack,
      token: "fixture-token", directory: path.join(directory, "agent"), guardScript: path.join(directory, "guard.py"), resources, contextTokens: 65536 });
    const extendedConfig = JSON.parse(await fs.readFile(extended.args[extended.args.indexOf("--config") + 1]!, "utf8"));
    expect(extendedConfig.args[extendedConfig.args.indexOf('--max-context') + 1]).toBe('65536');
    expect(await fs.readFile(pack, "utf8")).toBe(baseline); expect(JSON.stringify(config)).not.toContain("fixture-token");
  });
  it("refuses real-time commit/RAM shortage and tampered shared context before writing an Agent run", async () => {
    const directory = await root(), pack = path.join(directory, "pack", "runtime.json");
    await writeStrataPreparedFixture(directory, pack);
    const input = { preferences: agentDefaults(), install: directory, packConfig: pack, token: "secret", directory: path.join(directory, "agent"), guardScript: "guard.py", resources };
    await expect(agentLaunchPlan({ ...input, resources: { ...resources, commitAvailableBytes: 5 * GiB } })).rejects.toThrow("提交余量");
    expect(await fs.stat(input.directory).catch(() => null)).toBeNull();
    const config = JSON.parse(await fs.readFile(pack, "utf8")); config.args[config.args.indexOf("--max-context") + 1] = "262144";
    await fs.writeFile(pack, JSON.stringify(config));
    await expect(agentLaunchPlan(input)).rejects.toThrow("运行配置与准备记录不一致");
  });
  it.runIf(process.platform === "win32")("keeps one stable token protected by CurrentUser DPAPI; no plaintext token file", async () => {
    const directory = await root();
    const first = await agentToken(directory), second = await agentToken(directory);
    expect(first).toBe(second); expect(first).toMatch(/^[a-f0-9]{64}$/u);
    expect((await fs.readFile(path.join(directory, "token.dpapi"))).includes(Buffer.from(first))).toBe(false);
    expect(await fs.readdir(directory)).toEqual(["token.dpapi"]);
  });
  it("does not accept another package as the chosen Claude CLI", async () => {
    const directory = await root(), entry = path.join(directory, "cli.js");
    await fs.writeFile(entry, "throw Error('doctor must not execute this')");
    await fs.writeFile(path.join(directory, "package.json"), '{"name":"other-harness","version":"99.0.0"}');
    expect((await locateClaude(entry)).available).toBe(false);
  });
  it("blocks H3 preparation when the external resource gate refuses", async () => {
    const prepare = vi.fn(), service = new StrataService();
    const owner = new StrataRuntimeOwner({ run: vi.fn(), isResourcesBusy: () => false, prepare, service,
      resourceGate: { acquire: async () => { throw new Error("active external Agent"); }, track: vi.fn() } });
    const settings = await agentSettings(agentDefaults(), path.join(await root(), "absent"));
    await expect(owner.prepareAndStart(settings, settings.promptModelId,
      { maxContext: 32768, kv: "k8v4", visionTokens: 1024, visionGpu: true, vramReserveMiB: 2048 })).rejects.toThrow("active external Agent");
    expect(prepare).not.toHaveBeenCalled(); expect(service.snapshot().pid).toBeNull();
  });
});
