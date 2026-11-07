import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultSettings } from "../src/core/defaults.js";
import { STRATA_DEEPSEEK_ASSETS, STRATA_DEEPSEEK_MODEL_ID as modelId, STRATA_DEEPSEEK_DIRECTORY } from "../src/core/catalog/models/strata-deepseek.js";
import { strataModelEntries } from "../src/core/catalog/models/strata.js";
import { STRATA_REVISION, STRATA_ENGINE_SHA256, STRATA_SOURCE_FILES } from "../src/core/catalog/dependencies/strata.js";
import { strataModelRoot, strataProfileModelRoot, strataPreparationProfiles } from "../src/core/strata-preparation.js";
import { scanStrataPreparation } from "../electron/services/strata-preparation.js";
import { findPreparedStrataRuntime, prepareStrataModelRuntime, validatePreparedStrataRuntime } from "../electron/services/strata-model-preparation.js";
import { prepareStrataLaunch } from "../electron/services/strata-service.js";
import { planStrataResources, applyStrataResourcePlan } from "../src/core/strata-resource-policy.js";
import { supportsStrataUncensored } from "../src/core/strata-uncensored.js";
import { renderStrataPreparationPanel } from "../src/renderer/pages/settings/strata-preparation.js";
import { strataFixturePolicy as policy } from "./helpers/strata-pack-fixture.js";
import { agentDefaults } from "../electron/services/strata-agent-settings.js";
import { agentLaunchPlan } from "../electron/services/strata-agent-profile.js";
import { promptModelStatus } from "../src/renderer/shared/status.js";
import type { EnvironmentScanResult } from "../src/types.js";

const engine = vi.hoisted(() => ({ present: true }));
vi.mock("../electron/services/strata-deepseek-engine.js", async importOriginal => ({
  ...await importOriginal<typeof import("../electron/services/strata-deepseek-engine.js")>(), hasDeepSeekEngine: async () => engine.present
}));
const roots: string[] = [];
const entry = strataModelEntries.find(entry => entry.definition.id === modelId)!;
const originals = STRATA_DEEPSEEK_ASSETS.map(asset => ({ ...asset }));
const guides = entry.definition.scan!.components.map(component => ({ ...component.installGuide! }));
afterEach(async () => {
  engine.present = true;
  STRATA_DEEPSEEK_ASSETS.forEach((asset, index) => Object.assign(asset, originals[index]));
  entry.definition.scan!.components.forEach((component, index) => Object.assign(component.installGuide!, guides[index]));
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-deepseek-")); roots.push(root);
  const install = path.join(root, "runtime"), models = path.join(root, "models"), data = path.join(root, "data");
  const settings = { ...createDefaultSettings(), promptModelId: modelId, strataInstallDirectory: install, modelDirectory: models };
  const modelRoot = strataProfileModelRoot(strataModelRoot(settings), modelId);
  await fs.mkdir(modelRoot, { recursive: true });
  for (const [index, asset] of STRATA_DEEPSEEK_ASSETS.entries()) {
    const body = Buffer.from(`GGUF synthetic DeepSeek ${index}`);
    asset.bytes = body.length; asset.sha256 = createHash("sha256").update(body).digest("hex");
    Object.assign(entry.definition.scan!.components[index].installGuide!, { bytes: asset.bytes, sha256: asset.sha256 });
    await fs.writeFile(path.join(modelRoot, asset.filename), body);
  }
  for (const relative of [...STRATA_SOURCE_FILES, ".venv/Scripts/python.exe", "engine-dsv41/strata-dsv41.exe", "serve/server.py", "data/dsv41/profile-2.00.bin"]) {
    const filename = path.join(install, relative); await fs.mkdir(path.dirname(filename), { recursive: true }); await fs.writeFile(filename, "fixture");
  }
  await fs.writeFile(path.join(install, "lvs-strata-install.json"), JSON.stringify({ owner: "local-video-studio", revision: STRATA_REVISION, engineSha256: STRATA_ENGINE_SHA256, installedAt: "fixture" }));
  const run = vi.fn(async (_exe: string, args: string[]) => {
    if (args.some(arg => arg.endsWith("pack_gguf.py"))) {
      const pack = args[args.indexOf("--out") + 1];
      for (const name of ["ds4.txt", "tensors.txt", "engram.bin", "tokenizer/vocab.json", "tokenizer/merges.txt", "tokenizer/token_type.json", "tokenizer/tokenizer.json", "tokenizer/chat_template.jinja"]) {
        const filename = path.join(pack, name); await fs.mkdir(path.dirname(filename), { recursive: true }); await fs.writeFile(filename, "synthetic pack");
      }
    }
    return "pack-info: complete";
  });
  return { settings, install, modelRoot, data, run, runtime: { run, dataDirectory: data } };
}
const GiB = 1024 ** 3;
const resources = { memoryAvailableBytes: 40 * GiB, commitAvailableBytes: 90 * GiB, vramAvailableBytes: 22 * GiB, vramTotalBytes: 24 * GiB };

describe("DeepSeek via the managed Strata path", () => {
  it("pins all assets and keeps the Qwen default and control-vector compatibility", () => {
    expect(strataPreparationProfiles()[0].id).toBe("strata/qwen3.8-flash-next-iq3_xxs");
    expect(STRATA_DEEPSEEK_ASSETS).toHaveLength(8);
    expect(STRATA_DEEPSEEK_ASSETS.every(asset => /^[a-f0-9]{64}$/.test(asset.sha256) && /^[a-f0-9]{40}$/.test(asset.revision))).toBe(true);
    expect(supportsStrataUncensored(modelId)).toBe(false);
    expect(strataProfileModelRoot("D:/models/LLM/Qwen3.8-Flash-Next-GSQ-RCO-GGUF", modelId)).toBe(`D:/models/LLM/${STRATA_DEEPSEEK_DIRECTORY}`);
  });
  it("recovers from missing Engram independently of software readiness, without touching weights", async () => {
    const f = await fixture(), missing = path.join(f.modelRoot, STRATA_DEEPSEEK_ASSETS[4].filename);
    const body = await fs.readFile(missing); await fs.unlink(missing);
    const scan = () => scanStrataPreparation(f.settings);
    expect((await scan()).profiles.find(profile => profile.id === modelId)?.available).toBe(false);
    const missingScan = await scan();
    const missingStatus = promptModelStatus(f.settings, { modelProfiles: missingScan.profiles, strataPreparation: missingScan.status } as EnvironmentScanResult);
    expect(missingStatus.recoveryHint).toBeTruthy();
    expect(missingStatus.recoveryHint).not.toContain(".gguf");
    await expect(prepareStrataModelRuntime(f.settings, modelId, policy, f.runtime)).rejects.toThrow(/未完整下载|model/i);
    expect(f.run).not.toHaveBeenCalled();
    await fs.writeFile(missing, body);
    expect((await scan()).profiles.find(profile => profile.id === modelId)).toMatchObject({ available: true, runtimeVerified: false });
    engine.present = false;
    await expect(prepareStrataModelRuntime(f.settings, modelId, policy, f.runtime)).rejects.toThrow(/engine-dsv41/);
    const scanned = await scan();
    const environment = { modelProfiles: scanned.profiles, strataPreparation: scanned.status } as EnvironmentScanResult;
    expect(promptModelStatus(f.settings, environment)).toMatchObject({ ready: false, detail: expect.stringContaining("Strata") });
    environment.strataPreparation!.deepSeekEnginePresent = true;
    expect(promptModelStatus(f.settings, environment).ready).toBe(true);
    const markup = renderStrataPreparationPanel(f.settings, { ...(await scan()).status, enginePresent: true }, value => value);
    expect(markup).toContain('data-node-operation="update"');
    expect(f.run).not.toHaveBeenCalled();
  });
  it("prepares the DeepSeek recipe, reuses intact cache, rejects modified assets/config and routes authenticated launch", async () => {
    const f = await fixture();
    const result = await prepareStrataModelRuntime(f.settings, modelId, policy, f.runtime);
    expect(f.run.mock.calls[0][1]).toEqual(expect.arrayContaining(["--engram", "--engram-meta", "--mmproj", "--dspark-gguf", "--shards"]));
    expect(f.run.mock.calls.flat(2).join(" ")).not.toMatch(/iq_pack|--compat-bf16|--skip-tensors|--dense-override/);
    expect(await validatePreparedStrataRuntime(result.configPath, f.install)).toBe(modelId);
    expect(await findPreparedStrataRuntime(f.settings, modelId, policy, { dataDirectory: f.data })).toBe(result.configPath);
    const launch = await prepareStrataLaunch(f.settings, result.configPath, { adaptive: true, readResources: async () => resources });
    const config = JSON.parse(await fs.readFile(launch.temporaryConfig!, "utf8"));
    expect(config).toMatchObject({ arch: "deepseek41", model_name: modelId });
    expect(config.exe).toContain("strata-dsv41.exe");
    expect(config.args).toEqual(expect.arrayContaining(["--reserve-mib", "--ssd-cache", "--profile-readonly"]));
    expect(config.args).not.toEqual(expect.arrayContaining(["--resident-experts", "--mtp"]));
    expect(launch.controlVector).toBeUndefined();
    expect(launch.args).toContain("--api-key");
    const agent = await agentLaunchPlan({ preferences: { ...agentDefaults(), modelId, contextTokens: 32768 }, install: f.install, packConfig: result.configPath,
      token: "fixture-token", directory: path.join(f.data, "agent"), guardScript: "guard.py", resources });
    expect(agent.residentEngineLog).toBeUndefined();
    expect(JSON.parse(await fs.readFile(agent.args[agent.args.indexOf("--config") + 1], "utf8")).sampling).toEqual({ temperature: 1, top_p: 1 });
    const saved = JSON.parse(await fs.readFile(result.configPath, "utf8")); saved.args.push("--native");
    await fs.writeFile(result.configPath, JSON.stringify(saved));
    await expect(validatePreparedStrataRuntime(result.configPath, f.install)).rejects.toThrow(/配置|config/i);
    await fs.appendFile(path.join(f.modelRoot, STRATA_DEEPSEEK_ASSETS[0].filename), "changed");
    expect(await findPreparedStrataRuntime(f.settings, modelId, policy, { dataDirectory: f.data })).toBeNull();
  });
  it("bounds DeepSeek host cache by fresh commit as well as RAM and never applies Qwen flags", () => {
    const plan = planStrataResources(resources, 5120, { modelId, contextTokens: 32768 });
    expect(plan.residentBudgetGiB).toBe(32);
    const lessCommit = planStrataResources({ ...resources, commitAvailableBytes: 44 * GiB }, 5120, { modelId });
    expect(lessCommit.residentBudgetGiB).toBe(12);
    expect(applyStrataResourcePlan(["--pack", "fixture"], lessCommit, modelId)).toEqual(["--pack", "fixture", "--ssd-cache", "12"]);
    expect(() => planStrataResources({ ...resources, commitAvailableBytes: 30 * GiB }, 5120, { modelId })).toThrow();
    expect(() => planStrataResources(resources, 5120, { modelId, contextTokens: 262144 })).toThrow();
  });
});
