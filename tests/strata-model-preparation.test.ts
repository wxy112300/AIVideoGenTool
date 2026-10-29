import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultSettings } from "../src/core/defaults.js";
import { STRATA_ENGINE_FILES, STRATA_ENGINE_SHA256, STRATA_REVISION, STRATA_SOURCE_FILES, STRATA_RELEASES } from "../src/core/catalog/dependencies/strata.js";
import { strataModelEntries, STRATA_Q4_MODEL, STRATA_Q4_MODEL_ID } from "../src/core/catalog/models/strata.js";
import { STRATA_MTP_ASSET } from "../src/core/catalog/models/strata.js";
import { STRATA_MTP_CJK_VOCAB } from "../electron/services/strata-mtp.js";
import { strataModelRoot } from "../src/core/strata-preparation.js";
import { buildStrataRuntimeConfig, findPreparedStrataRuntime, prepareStrataModelRuntime, validatePreparedStrataRuntime, verifyStrataAsset, type StrataModelPreparationRuntime } from "../electron/services/strata-model-preparation.js";
import { prepareStrataLaunch } from "../electron/services/strata-service.js";
import { strataFixturePolicy as policy, writeStrataPackFixture, writeStrataPreparedFixture } from "./helpers/strata-pack-fixture.js";
import { managedStrataDirectory } from "../electron/services/strata-installation.js";

const roots: string[] = [];
const originalMtp = { ...STRATA_MTP_ASSET };
const originalVocab = { ...STRATA_MTP_CJK_VOCAB };
afterEach(async () => {
  vi.unstubAllEnvs();
  Object.assign(STRATA_MTP_ASSET, originalMtp); Object.assign(STRATA_MTP_CJK_VOCAB, originalVocab);
  for (const entry of strataModelEntries) Object.assign(entry.definition.scan!.components.find(component => component.optional)!.installGuide!, { bytes: originalMtp.bytes, sha256: originalMtp.sha256 });
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});
async function rootFixture() { const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-strata-pack-")); roots.push(root); return root; }
async function fixture(index = 0) {
  const root = await rootFixture();
  const install = path.join(root, "software with spaces");
  const models = path.join(root, "shared models");
  const data = path.join(root, "independent data");
  const settings = { ...createDefaultSettings(), strataInstallDirectory: install, modelDirectory: models };
  const entry = strataModelEntries[index].definition;
  const assets = [];
  for (const component of entry.scan!.components.filter((item) => !item.optional)) {
    const filename = path.join(strataModelRoot(settings), component.expected);
    await fs.mkdir(path.dirname(filename), { recursive: true }); await fs.writeFile(filename, "GGUF synthetic source");
    assets.push(filename);
  }
  for (const relative of [...STRATA_SOURCE_FILES, ...STRATA_ENGINE_FILES, ".venv/Scripts/python.exe", "tools/iq_pack.py", "tools/strata_tokenizer.py", "tools/gguf_reader.py",
    ".venv/Lib/site-packages/nvidia/cu13/bin/x86_64/cublas64_13.dll", ".venv/Lib/site-packages/nvidia/cu13/bin/x86_64/cudart64_13.dll"]) {
    const filename = path.join(install, relative); await fs.mkdir(path.dirname(filename), { recursive: true }); await fs.writeFile(filename, "software fixture");
  }
  await fs.writeFile(path.join(install, "lvs-strata-install.json"), JSON.stringify({ owner: "local-video-studio", revision: STRATA_REVISION, engineSha256: STRATA_ENGINE_SHA256, installedAt: "fixture" }));
  const inspect: StrataModelPreparationRuntime["inspect"] = async (filename) => {
    const stat = await fs.stat(filename).catch(() => null); if (!stat?.isFile()) return null;
    const component = entry.scan!.components.find((candidate) => filename === path.join(strataModelRoot(settings), candidate.expected));
    return { size: component?.installGuide?.bytes ?? stat.size, header: "GGUF" };
  };
  const verifyAsset = vi.fn(async (filename: string, expected: { bytes: number; sha256: string }) => {
    const stat = await fs.stat(filename);
    return { filename, bytes: stat.size, sha256: expected.sha256, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs };
  });
  const run = vi.fn(async (_exe: string, args: string[]) => {
    if (args.includes("-c")) return '{"pleShard":1}';
    if (args.some((arg) => arg.endsWith("mtp_rt.py"))) {
      const out = args[args.indexOf("--out") + 1]; await fs.mkdir(out, { recursive: true });
      await fs.writeFile(path.join(out, "experts.bin"), "synthetic experts");
      await fs.writeFile(path.join(out, "dense.bin"), Buffer.alloc(29));
      await fs.writeFile(path.join(out, "dense.txt"), Array.from({ length: 29 }, (_, i) => `tensor${i} f32 1 1 ${i} 1`).join("\n"));
      return "CPU MTP complete";
    }
    const output = args[args.indexOf("--out") + 1]; await writeStrataPackFixture(output, entry.id); return "fixture pack complete";
  });
  const runtime = { run, inspect, verifyAsset, dataDirectory: data };
  const prepare = (signal?: AbortSignal) => prepareStrataModelRuntime(settings, entry.id, policy, runtime, { signal });
  return { root, install, models, data, settings, entry, assets, runtime, run, verifyAsset, prepare };
}

describe("Strata CPU preparation and config", () => {
  it.each([0, 1, 2])("migrates the audited 0.1.45 pack and CUDA layout for Qwen profile %i without hashing or packing again", async index => {
    const f = await fixture(index), old = STRATA_RELEASES[1];
    const installationReceipt = path.join(f.install, "lvs-strata-install.json");
    await fs.writeFile(installationReceipt, JSON.stringify({ owner: "local-video-studio", ...old, installedAt: "fixture" }));
    const prepared = await f.prepare();
    expect(JSON.parse(await fs.readFile(prepared.configPath, "utf8")).lib_dirs[0]).toContain("site-packages");
    const artifacts = JSON.parse(await fs.readFile(prepared.receiptPath, "utf8")).artifacts;
    const calls = [f.verifyAsset.mock.calls.length, f.run.mock.calls.length];
    await fs.writeFile(installationReceipt, JSON.stringify({ owner: "local-video-studio", ...STRATA_RELEASES[0], installedAt: "fixture" }));
    await expect(validatePreparedStrataRuntime(prepared.configPath, f.install)).rejects.toThrow("准备记录无效");
    const onLog = vi.fn();
    expect(await validatePreparedStrataRuntime(prepared.configPath, f.install, { upgradeLegacyConfig: true, onLog })).toBe(f.entry.id);
    expect(JSON.parse(await fs.readFile(prepared.configPath, "utf8")).lib_dirs).toEqual([path.join(f.install, "engine")]);
    const receipt = JSON.parse(await fs.readFile(prepared.receiptPath, "utf8"));
    expect(receipt).toMatchObject({ sourceRevision: STRATA_REVISION, packSourceRevision: old.revision, artifacts });
    expect([f.verifyAsset.mock.calls.length, f.run.mock.calls.length]).toEqual(calls);
    expect(onLog).toHaveBeenCalledWith(expect.stringContaining("未重新哈希"));
    expect(await validatePreparedStrataRuntime(prepared.configPath, f.install)).toBe(f.entry.id);
    await fs.appendFile(path.join(prepared.packDirectory, "dense.bin"), "changed");
    await expect(validatePreparedStrataRuntime(prepared.configPath, f.install, { upgradeLegacyConfig: true })).rejects.toThrow("pack/tokenizer 在准备后改变");
  });
  it("reuses a verified same-revision pack when its versioned managed software path becomes the shared runtime", async () => {
    const root = await rootFixture(); vi.stubEnv("LOCALAPPDATA", root);
    const former = managedStrataDirectory(STRATA_RELEASES[0]), current = managedStrataDirectory(), config = path.join(root, "pack", "runtime.json");
    await writeStrataPreparedFixture(former, config);
    const receipt = await fs.readFile(path.join(root, "pack", "lvs-strata-model.json"), "utf8");
    await expect(validatePreparedStrataRuntime(config, current)).rejects.toThrow("不一致");
    expect(await validatePreparedStrataRuntime(config, current, { upgradeLegacyConfig: true })).toBe("strata/qwen3.8-flash-next-iq3_xxs");
    expect(JSON.parse(await fs.readFile(config, "utf8")).cwd).toBe(current);
    expect(await fs.readFile(path.join(root, "pack", "lvs-strata-model.json"), "utf8")).toBe(receipt);
    const tampered = JSON.parse(await fs.readFile(config, "utf8")); tampered.args.push("--unverified");
    await fs.writeFile(config, JSON.stringify(tampered));
    await expect(validatePreparedStrataRuntime(config, current, { upgradeLegacyConfig: true })).rejects.toThrow("不一致");
  });
  it("prepares all Q4 shards with compatibility conversion, distinct revision and the actual projector", async () => {
    const f = await fixture(2), before = await Promise.all(f.assets.map(filename => fs.readFile(filename)));
    const result = await f.prepare();
    expect(f.entry.id).toBe(STRATA_Q4_MODEL_ID);
    expect(f.verifyAsset).toHaveBeenCalledTimes(5);
    const call = f.run.mock.calls.find(([, args]) => args.some(arg => arg.endsWith("iq_pack.py")))!;
    expect(call[1]).toContain("--compat-bf16");
    expect(call[1]).not.toContain("--experts-bin");
    const receipt = JSON.parse(await fs.readFile(result.receiptPath, "utf8"));
    expect(receipt.modelRevision).toBe(STRATA_Q4_MODEL.revision);
    expect(receipt.assets).toHaveLength(5);
    const config = JSON.parse(await fs.readFile(result.configPath, "utf8"));
    expect(config.vision.mmproj).toBe(f.assets[4]);
    expect(config.args).toContain("--mmap-experts");
    expect(config.args).not.toContain("--resident-experts");
    await expect(validatePreparedStrataRuntime(result.configPath, f.install)).resolves.toBe(f.entry.id);
    const plan = await prepareStrataLaunch(f.settings, result.configPath, { adaptive: true,
      readResources: async () => ({ memoryAvailableBytes: 100 * 1024 ** 3, commitAvailableBytes: 130 * 1024 ** 3,
        vramAvailableBytes: 22 * 1024 ** 3, vramTotalBytes: 24 * 1024 ** 3 }) });
    expect(plan.resourcePlan?.hostMode).toBe("arena");
    const session = JSON.parse(await fs.readFile(plan.temporaryConfig!, "utf8"));
    expect(session.args).not.toContain("--mmap-experts");
    expect(session.args).not.toContain("--resident-budget-gib");
    expect(await Promise.all(f.assets.map(filename => fs.readFile(filename)))).toEqual(before);
    await fs.appendFile(path.join(result.packDirectory, "compat-bf16.json"), "changed");
    await expect(validatePreparedStrataRuntime(result.configPath, f.install)).rejects.toThrow("pack/tokenizer 在准备后改变");
  });
  it("rejects a missing Q4 shard or compatibility report before publishing a runtime", async () => {
    const f = await fixture(2);
    await fs.rm(f.assets[3]);
    await expect(f.prepare()).rejects.toThrow("尚未完整下载");
    expect(f.run).not.toHaveBeenCalled();
    await fs.writeFile(f.assets[3], "GGUF synthetic source");
    f.run.mockImplementation(async (_exe, args) => {
      if (args.includes("-c")) return '{"pleShard":1}';
      await writeStrataPackFixture(args[args.indexOf("--out") + 1]);
      return "missing compatibility reports";
    });
    await expect(f.prepare()).rejects.toThrow("conversions.json");
    const output = path.join(f.data, (await fs.readdir(f.data))[0]);
    expect(await fs.stat(path.join(output, "lvs-strata-model.json")).catch(() => null)).toBeNull();
  });
  it("binds prepared cache to the actual installed release, not the newly recommended version", async () => {
    const f = await fixture(), old = STRATA_RELEASES[1];
    const installationReceipt = path.join(f.install, "lvs-strata-install.json");
    await fs.writeFile(installationReceipt, JSON.stringify({ owner: "local-video-studio", ...old, installedAt: "fixture" }));
    for (const name of ["engine-component.json", "strata_kq.dll", "cublas64_13.dll", "cublasLt64_13.dll"])
      await fs.unlink(path.join(f.install, "engine", name));
    const prepared = await f.prepare();
    expect(JSON.parse(await fs.readFile(prepared.receiptPath, "utf8")).sourceRevision).toBe(old.revision);
    expect(await validatePreparedStrataRuntime(prepared.configPath, f.install)).toBe(f.entry.id);
    await fs.writeFile(installationReceipt, JSON.stringify({ owner: "local-video-studio", ...STRATA_RELEASES[0], installedAt: "fixture" }));
    await expect(validatePreparedStrataRuntime(prepared.configPath, f.install)).rejects.toThrow("准备记录无效");
    expect(await fs.stat(prepared.packDirectory)).toBeTruthy();
  });
  it("does not migrate a modified old config, unrecognized source or unsupported pack format", async () => {
    const f = await fixture(), old = STRATA_RELEASES[1];
    const installationReceipt = path.join(f.install, "lvs-strata-install.json");
    await fs.writeFile(installationReceipt, JSON.stringify({ owner: "local-video-studio", ...old, installedAt: "fixture" }));
    const prepared = await f.prepare(), originalReceipt = await fs.readFile(prepared.receiptPath, "utf8"), originalConfig = await fs.readFile(prepared.configPath, "utf8");
    await fs.writeFile(installationReceipt, JSON.stringify({ owner: "local-video-studio", ...STRATA_RELEASES[0], installedAt: "fixture" }));
    await fs.writeFile(prepared.configPath, JSON.stringify({ ...JSON.parse(originalConfig), lib_dirs: ["unverified"] }));
    await expect(validatePreparedStrataRuntime(prepared.configPath, f.install, { upgradeLegacyConfig: true })).rejects.toThrow("不一致");
    expect(await fs.readFile(prepared.receiptPath, "utf8")).toBe(originalReceipt);
    await fs.writeFile(prepared.configPath, originalConfig);
    await fs.writeFile(prepared.receiptPath, JSON.stringify({ ...JSON.parse(originalReceipt), sourceRevision: "f".repeat(40) }));
    await expect(validatePreparedStrataRuntime(prepared.configPath, f.install, { upgradeLegacyConfig: true })).rejects.toThrow("准备记录无效");
    await fs.writeFile(prepared.receiptPath, originalReceipt);
    const { strataPackArtifactFacts } = await import("../electron/services/strata-model-preparation.js");
    await fs.writeFile(path.join(prepared.packDirectory, "native_experts.txt"), "# strata native experts v5: unsupported old pack");
    const unsupported = JSON.stringify({ ...JSON.parse(originalReceipt), artifacts: await strataPackArtifactFacts(prepared.packDirectory, f.entry.id) });
    await fs.writeFile(prepared.receiptPath, unsupported);
    await expect(validatePreparedStrataRuntime(prepared.configPath, f.install, { upgradeLegacyConfig: true })).rejects.toThrow("格式不在本次升级兼容范围");
    expect(await fs.readFile(prepared.receiptPath, "utf8")).toBe(unsupported);
    expect(await fs.readFile(prepared.configPath, "utf8")).toBe(originalConfig);
  });
  it("uses official complement residency without a fixed RAM cap, retaining a no-MTP base path", async () => {
    const f = await fixture();
    const prepared = await f.prepare();
    const config = JSON.parse(await fs.readFile(prepared.configPath, "utf8"));
    expect(config.args[config.args.indexOf("--spec") + 1]).toBe("2");
    expect(config.args).toContain("--resident-experts");
    expect(config.args[config.args.indexOf("--expert-profile") + 1]).toBe(path.join(f.install,"data/expert-profile.bin"));
    expect(config.args).not.toContain("--resident-budget-gib");
    expect(config.args).not.toContain("--mtp");
    expect(config.log).toBe(path.join(prepared.packDirectory, "engine.log"));
  });
  it("upgrades only an intact exact legacy launch config without rehashing/repacking, never a modified pack", async () => {
    const f = await fixture();
    const guides = f.entry.scan!.components.filter(component => !component.optional).map(component => component.installGuide!);
    const bytes = guides.map(guide => guide.bytes);
    try {
      for (const [index, guide] of guides.entries()) guide.bytes = (await fs.stat(f.assets[index])).size;
      const prepared = await f.prepare();
      const safe = JSON.parse(await fs.readFile(prepared.configPath, "utf8"));
      const previous = { ...safe, args: safe.args.map((arg: string) => arg === "--resident-experts" ? "--mmap-experts" : arg).concat("--resident-budget-gib", "16") };
      const legacy = { ...previous, args: previous.args.slice(0, -5).map((arg: string, index: number, args: string[]) => args[index-1] === "--spec" ? "0" : arg) };
      delete legacy.log;
      await fs.writeFile(prepared.configPath, JSON.stringify(legacy));
      await expect(validatePreparedStrataRuntime(prepared.configPath, f.install)).rejects.toThrow("配置");
      expect(await findPreparedStrataRuntime(f.settings, f.entry.id, policy, { dataDirectory:f.data })).toBe(prepared.configPath);
      expect(JSON.parse(await fs.readFile(prepared.configPath,"utf8"))).toEqual(safe);
      expect(f.verifyAsset).toHaveBeenCalledTimes(3);
      expect(f.run).toHaveBeenCalledTimes(2);
      await fs.writeFile(prepared.configPath, JSON.stringify(legacy));
      await fs.appendFile(path.join(prepared.packDirectory,"dense.bin"),"changed");
      expect(await findPreparedStrataRuntime(f.settings, f.entry.id, policy, { dataDirectory:f.data })).toBeNull();
      expect(JSON.parse(await fs.readFile(prepared.configPath,"utf8"))).toEqual(legacy);
    } finally { guides.forEach((guide,index) => { guide.bytes=bytes[index]; }); }
  });
  it("reuses completed cache only for unchanged sources/root/policy and permits an independent port change", async () => {
    const f = await fixture();
    const guides = f.entry.scan!.components.filter(component => !component.optional).map((component) => component.installGuide!);
    const bytes = guides.map((guide) => guide.bytes);
    try {
      for (const [index, guide] of guides.entries()) guide.bytes = (await fs.stat(f.assets[index])).size;
      const prepared = await f.prepare();
      const options = { dataDirectory: f.data };
      expect(await findPreparedStrataRuntime(f.settings, f.entry.id, policy, options)).toBe(prepared.configPath);
      expect(await findPreparedStrataRuntime({ ...f.settings, strataPort: 43131 }, f.entry.id, policy, options)).toBe(prepared.configPath);
      expect(await findPreparedStrataRuntime(f.settings, f.entry.id, { ...policy, visionTokens: 512 }, options)).toBeNull();
      expect(await findPreparedStrataRuntime({ ...f.settings, modelDirectory: path.join(f.root, "different models") }, f.entry.id, policy, options)).toBeNull();
      await fs.appendFile(f.assets[0], "changed");
      expect(await findPreparedStrataRuntime(f.settings, f.entry.id, policy, options)).toBeNull();
      expect(f.verifyAsset).toHaveBeenCalledTimes(3); expect(f.run).toHaveBeenCalledTimes(2);
      expect(await fs.stat(prepared.configPath)).toBeTruthy();
    } finally { guides.forEach((guide, index) => { guide.bytes = bytes[index]; }); }
  });
  it("fully hashes a real small file, validates header/size and reports actual bytes", async () => {
    const root = await rootFixture(); const filename = path.join(root, "tiny.gguf"); const bytes = Buffer.from("GGUF tiny fixture"); await fs.writeFile(filename, bytes);
    const expected = { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
    const progress = vi.fn();
    expect(await verifyStrataAsset(filename, expected, undefined, progress)).toMatchObject({ filename, bytes: bytes.length, sha256: expected.sha256 });
    expect(progress).toHaveBeenLastCalledWith(bytes.length);
    await expect(verifyStrataAsset(filename, { ...expected, bytes: bytes.length + 1 })).rejects.toThrow("仍在下载");
    await expect(verifyStrataAsset(filename, { ...expected, sha256: "0".repeat(64) })).rejects.toThrow("校验失败");
    const controller = new AbortController(); controller.abort(new Error("fixture cancelled"));
    await expect(verifyStrataAsset(filename, expected, controller.signal)).rejects.toThrow("fixture cancelled");
    const bad = Buffer.from("XXXX tiny fixture"); await fs.writeFile(filename, bad);
    await expect(verifyStrataAsset(filename, { bytes: bad.length, sha256: createHash("sha256").update(bad).digest("hex") })).rejects.toThrow("校验失败");
  });

  it.each([0, 1])("verifies all sources before CPU pack and connects quant %s's completed result to launch planning", async (index) => {
    const f = await fixture(index); const original = await Promise.all(f.assets.map((filename) => fs.readFile(filename, "utf8")));
    const result = await f.prepare();
    expect(f.verifyAsset).toHaveBeenCalledTimes(3);
    expect(f.run.mock.calls).toHaveLength(2);
    expect(f.run.mock.calls[0][1]).toContain("-c");
    expect(f.run.mock.calls[1][1]).toEqual(["-B", path.join(f.install, "tools/iq_pack.py"), "--gguf", f.assets[0], "--out", result.packDirectory]);
    expect(result.packDirectory.startsWith(`${f.data}${path.sep}`)).toBe(true);
    expect(await Promise.all(f.assets.map((filename) => fs.readFile(filename, "utf8")))).toEqual(original);
    const config = JSON.parse(await fs.readFile(result.configPath, "utf8"));
    expect(config).toMatchObject({ cwd: f.install, model_name: f.entry.id, port: 43127, host: "127.0.0.1", lazy_load: true,
      vision: { mmproj: f.assets[2], model: f.assets[0], gpu: true, max_tokens: 1024 } });
    expect(config.args).toContain("--spec"); expect(config.args[config.args.indexOf("--spec") + 1]).toBe("2");
    expect(config.args).not.toContain("--mtp"); expect(config.args).not.toContain("--experts-bin");
    expect(config.args[config.args.indexOf("--ple-gguf") + 1]).toBe(f.assets[1]);
    await expect(validatePreparedStrataRuntime(result.configPath, f.install)).resolves.toBe(f.entry.id);
    const launch = await prepareStrataLaunch(f.settings, result.configPath);
    expect(launch.args).toContain("--lazy"); expect(launch.executable).toBe(path.join(f.install, ".venv/Scripts/python.exe"));
  });

  it("refuses incomplete downloads without hashing, tools, cache creation or changing sources", async () => {
    const f = await fixture(); await fs.rm(f.assets[1]);
    await expect(f.prepare()).rejects.toThrow("尚未完整下载");
    expect(f.verifyAsset).not.toHaveBeenCalled(); expect(f.run).not.toHaveBeenCalled();
    await expect(fs.stat(f.data)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.readFile(f.assets[0], "utf8")).toBe("GGUF synthetic source");
  });

  it("refuses hash mismatch before writing any derived files", async () => {
    const f = await fixture(); f.verifyAsset.mockRejectedValueOnce(new Error("SHA mismatch"));
    await expect(f.prepare()).rejects.toThrow("SHA mismatch"); expect(f.run).not.toHaveBeenCalled();
    await expect(fs.stat(f.data)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["missing", "inconsistent", "empty-merges", "failed", "changed-source", "cancelled"])("does not publish a completed runtime after %s pack preparation", async (failure) => {
    const f = await fixture(); const controller = new AbortController();
    f.run.mockImplementation(async (_exe, args) => {
      if (args.includes("-c")) return '{"pleShard":1}';
      const out = args[args.indexOf("--out") + 1]; await writeStrataPackFixture(out);
      if (failure === "missing") await fs.rm(path.join(out, "native_experts.txt"));
      if (failure === "inconsistent") await fs.writeFile(path.join(out, "tokenizer/token_type.json"), "[1]");
      if (failure === "empty-merges") await fs.writeFile(path.join(out, "tokenizer/merges.txt"), "");
      if (failure === "failed") throw new Error("CPU tool failed");
      if (failure === "changed-source") await fs.appendFile(f.assets[0], "changed");
      if (failure === "cancelled") controller.abort(new Error("CPU preparation cancelled"));
      return "fixture";
    });
    await expect(f.prepare(controller.signal)).rejects.toThrow();
    const output = path.join(f.data, (await fs.readdir(f.data))[0]);
    await expect(fs.stat(path.join(output, "lvs-strata-model.json"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.readFile(path.join(output, "dense.bin"), "utf8")).toBe("synthetic dense");
    // Failure releases the preparation lock, so a retry gets a new isolated output.
    f.run.mockImplementation(async (_exe, args) => { if (args.includes("-c")) return '{"pleShard":1}'; await writeStrataPackFixture(args[args.indexOf("--out") + 1]); return "fixture"; });
    const retry = await f.prepare(); expect(retry.packDirectory).not.toBe(output);
  });

  it("checks completed records, config and source facts again before launch", async () => {
    const f = await fixture(); const result = await f.prepare();
    const config = JSON.parse(await fs.readFile(result.configPath, "utf8"));
    await fs.writeFile(result.configPath, JSON.stringify({ ...config, before_load: "unapproved command" }));
    await expect(prepareStrataLaunch(f.settings, result.configPath)).rejects.toThrow("不一致");
    await fs.writeFile(result.configPath, JSON.stringify(config)); await fs.appendFile(f.assets[2], "modified");
    await expect(prepareStrataLaunch(f.settings, result.configPath)).rejects.toThrow("准备后改变");
  });

  it("rejects pack modifications after preparation even when every file still exists", async () => {
    const f = await fixture(); const result = await f.prepare(); await fs.appendFile(path.join(result.packDirectory, "dense.bin"), "modified");
    await expect(prepareStrataLaunch(f.settings, result.configPath)).rejects.toThrow("pack/tokenizer 在准备后改变");
  });

  it.each(["direct", "alias"])("protects shared model directories from %s derived-output overlap", async (mode) => {
    const f = await fixture();
    if (mode === "direct") f.runtime.dataDirectory = path.join(f.models, "derived");
    else { const alias = path.join(f.root, "model alias"); await fs.symlink(f.models, alias, process.platform === "win32" ? "junction" : "dir"); f.runtime.dataDirectory = path.join(alias, "derived"); }
    await expect(f.prepare()).rejects.toThrow("重叠"); expect(f.run).not.toHaveBeenCalled(); expect(f.verifyAsset).not.toHaveBeenCalled();
    await expect(fs.stat(path.join(f.models, "derived"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("requires a supported model, valid policy and completed independent runtime", async () => {
    const f = await fixture();
    await expect(prepareStrataModelRuntime(f.settings, "other", policy, f.runtime)).rejects.toThrow("不支持");
    await expect(prepareStrataModelRuntime(f.settings, f.entry.id, { ...policy, maxContext: 0 }, f.runtime)).rejects.toThrow("策略无效");
    await fs.rm(path.join(f.install, "lvs-strata-install.json")); await expect(f.prepare()).rejects.toThrow("安装未完成");
    expect(f.run).not.toHaveBeenCalled();
  });

  it("requires one real PLE table before creating the pack directory", async () => {
    const f = await fixture(); f.run.mockResolvedValueOnce('{"pleShard":2}');
    await expect(f.prepare()).rejects.toThrow("PLE"); await expect(fs.stat(f.data)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects split files spread across canonical and legacy roots instead of copying or joining weights", async () => {
    const f = await fixture();
    const second = path.join(f.models, "LLM", "strata", f.entry.scan!.components[1].expected);
    await fs.mkdir(path.dirname(second), { recursive: true }); await fs.rename(f.assets[1], second);
    f.runtime.inspect = async (filename) => {
      const stat = await fs.stat(filename).catch(() => null); if (!stat?.isFile()) return null;
      const component = f.entry.scan!.components.find((candidate) => path.basename(filename) === path.basename(candidate.expected));
      return { size: component?.installGuide?.bytes ?? stat.size, header: "GGUF" };
    };
    await expect(f.prepare()).rejects.toThrow("同一目录"); expect(f.run).not.toHaveBeenCalled();
    expect(await fs.readFile(second, "utf8")).toBe("GGUF synthetic source");
  });

  it("holds one preparation lease per runtime and releases it after the first operation", async () => {
    const f = await fixture(); const original = f.verifyAsset.getMockImplementation()!;
    let entered!: () => void; let release!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    f.verifyAsset.mockImplementationOnce(async (filename, expected) => { entered(); await held; return original(filename, expected); });
    const active = f.prepare(); await started;
    await expect(f.prepare()).rejects.toThrow("正在执行"); release(); await active;
    await expect(f.prepare()).resolves.toHaveProperty("configPath");
  });

  it("does not silently invent runtime/GPU policy or force long-context KV at short context", () => {
    const input = { installDirectory: "software", packDirectory: "pack", shards: ["first", "second"], pleShard: "second", projector: "projector", modelId: "model", port: 43127, policy };
    expect(buildStrataRuntimeConfig({ ...input, policy: { ...policy, maxContext: 8192 } }).args).not.toContain("--kv");
    expect(buildStrataRuntimeConfig({ ...input, port: 8080 }).port).toBe(8080);
    expect(() => buildStrataRuntimeConfig({ ...input, port: 80 })).toThrow("端口");
    expect(() => buildStrataRuntimeConfig({ ...input, pleShard: "foreign" })).toThrow("分片");
  });
});

async function addMtp(f: Awaited<ReturnType<typeof fixture>>) {
  const filename = path.join(strataModelRoot(f.settings), STRATA_MTP_ASSET.expected);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const body = Buffer.from("GGUF synthetic MTP");
  await fs.writeFile(filename, body);
  STRATA_MTP_ASSET.bytes = body.length;
  STRATA_MTP_ASSET.sha256 = createHash("sha256").update(body).digest("hex");
  for (const entry of strataModelEntries) Object.assign(entry.definition.scan!.components.find(component => component.optional)!.installGuide!,
    { bytes: STRATA_MTP_ASSET.bytes, sha256: STRATA_MTP_ASSET.sha256 });
  const vocab = Buffer.alloc(STRATA_MTP_CJK_VOCAB.tokens * 4);
  STRATA_MTP_CJK_VOCAB.sha256 = createHash("sha256").update(vocab).digest("hex");
  await fs.mkdir(path.join(f.install, "tools"), { recursive: true });
  await fs.writeFile(path.join(f.install, "tools/mtp_rt.py"), "official tool fixture");
  await fs.writeFile(path.join(f.install, "data/draft_vocab.bin"), vocab);
  return filename;
}

describe("manually downloaded Strata MTP", () => {
  it("reports a missing official parser before hashing the large main model", async () => {
    const f=await fixture();await addMtp(f);
    f.run.mockRejectedValueOnce(new Error("llama.cpp's gguf-py was not found"));
    await expect(f.prepare()).rejects.toThrow("离线 MTP 解析器");
    expect(f.verifyAsset).not.toHaveBeenCalled();
    await expect(fs.stat(f.data)).rejects.toMatchObject({code:"ENOENT"});
  });
  it("verifies a local source, runs only offline conversion, uses CJK vocab and official speculation defaults", async () => {
    const f = await fixture(); const filename = await addMtp(f);
    const before = await fs.readFile(filename);
    const prepared = await f.prepare();
    const config = JSON.parse(await fs.readFile(prepared.configPath, "utf8"));
    expect(config.args[config.args.indexOf("--spec") + 1]).toBe("4");
    expect(config.args[config.args.indexOf("--spec-min-p") + 1]).toBe("0.5");
    expect(config.args).toContain("--resident-experts");
    expect(config.args).not.toContain("--resident-budget-gib");
    expect(f.run.mock.calls).toHaveLength(4);
    expect(f.run.mock.calls[0][1].join(" ")).toContain("add_gguf_py");
    expect(f.run.mock.calls.flatMap(([, args]) => args).some((arg) => /mtp_fetch|setup\.py|serve\.server/u.test(arg))).toBe(false);
    await expect(validatePreparedStrataRuntime(prepared.configPath, f.install)).resolves.toBe(f.entry.id);
    expect(await fs.readFile(filename)).toEqual(before);
    const mtpDir = config.args[config.args.indexOf("--mtp") + 1];
    expect((await fs.stat(path.join(mtpDir, "draft_vocab.bin"))).size).toBe(106299 * 4);
    await fs.appendFile(path.join(mtpDir, "dense.bin"), "changed");
    await expect(validatePreparedStrataRuntime(prepared.configPath, f.install)).rejects.toThrow("MTP 运行文件");
  });
  it.each([0,2])("adds MTP to intact quant %s without rehashing/repacking the main model", async index => {
    const f = await fixture(index);
    const guides = f.entry.scan!.components.filter((component) => !component.optional).map((component) => component.installGuide!);
    const bytes = guides.map((guide) => guide.bytes);
    try {
      for (const [i, guide] of guides.entries()) guide.bytes = (await fs.stat(f.assets[i])).size;
      const prepared = await f.prepare(); const baseCalls = f.run.mock.calls.length; await addMtp(f);
      const options = { dataDirectory: f.data, run: f.run };
      expect(await findPreparedStrataRuntime(f.settings, f.entry.id, policy, options)).toBe(prepared.configPath);
      expect(f.verifyAsset).toHaveBeenCalledTimes(f.assets.length); // Only the original base preparation.
      expect(f.run).toHaveBeenCalledTimes(baseCalls + 1); // Add only one MTP conversion.
      expect(await findPreparedStrataRuntime(f.settings, f.entry.id, policy, options)).toBe(prepared.configPath);
      expect(f.run).toHaveBeenCalledTimes(baseCalls + 1);
      await expect(validatePreparedStrataRuntime(prepared.configPath, f.install)).resolves.toBe(f.entry.id);
    } finally { guides.forEach((guide, i) => { guide.bytes = bytes[i]; }); }
  });
  it("does not publish MTP on bad CJK vocab, and never silently downloads a replacement", async () => {
    const f = await fixture(); await addMtp(f);
    await fs.writeFile(path.join(f.install, "data/draft_vocab.bin"), "wrong vocab");
    await expect(f.prepare()).rejects.toThrow("词表");
    expect(f.run.mock.calls.some(([, args]) => args.some((arg) => arg.endsWith("mtp_rt.py")))).toBe(false);
    const output = path.join(f.data, (await fs.readdir(f.data))[0]);
    await expect(fs.stat(path.join(output, "lvs-strata-model.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
