import { afterEach, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { agentDefaults, agentDirectory, agentSettings, readAgentPreferences, saveAgentPreferences } from "../electron/services/strata-agent-settings.js";

const roots: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-user-data-")); roots.push(root);
  const data = path.join(root, "Documents", "Local Video Studio", "Data");
  vi.stubEnv("LOCALAPPDATA", path.join(root, "LocalAppData")); vi.stubEnv("APPDATA", path.join(root, "RoamingAppData")); vi.stubEnv("LVS_STUDIO_DATA_DIRECTORY", data);
  const old = path.join(agentDirectory(), "preferences.json"), target = path.join(path.dirname(data), "AgentPreferences", "preferences.json");
  await fs.mkdir(path.dirname(old), { recursive: true });
  return { old, target, data };
}
it("moves standalone user preferences and a verified original into Documents while retaining runtime files", async () => {
  const f = await fixture(), value = { ...agentDefaults(), strataPort: 45127 }, raw = JSON.stringify(value);
  await fs.writeFile(f.old, raw); await fs.writeFile(path.join(agentDirectory(), "latest-run.json"), "runtime-only");
  expect(await readAgentPreferences()).toEqual(value);
  expect(await fs.readFile(f.target, "utf8")).toBe(raw);
  await expect(fs.stat(f.old)).rejects.toMatchObject({ code: "ENOENT" });
  const backup = (await fs.readdir(path.dirname(f.target))).find(name => name.startsWith("preferences.pre-migration-"))!;
  expect(await fs.readFile(path.join(path.dirname(f.target), backup), "utf8")).toBe(raw);
  expect(await fs.readFile(path.join(agentDirectory(), "latest-run.json"), "utf8")).toBe("runtime-only");
  await saveAgentPreferences({ ...value, contextTokens: 32768 });
  expect((await readAgentPreferences()).contextTokens).toBe(32768);
  await expect(fs.stat(f.old)).rejects.toMatchObject({ code: "ENOENT" });
});
it("preserves both different preference files on conflict", async () => {
  const f = await fixture(); await fs.writeFile(f.old, JSON.stringify(agentDefaults()));
  await fs.mkdir(path.dirname(f.target), { recursive: true }); await fs.writeFile(f.target, "conflicting-data");
  await expect(readAgentPreferences()).rejects.toThrow("Documents");
  expect(await fs.readFile(f.target, "utf8")).toBe("conflicting-data");
  expect(await fs.readFile(f.old, "utf8")).toBe(JSON.stringify(agentDefaults()));
});
it("discovers Studio settings from the new business data directory", async () => {
  const f = await fixture(); await fs.mkdir(f.data, { recursive: true });
  await fs.writeFile(path.join(f.data, "studio-state.json"), JSON.stringify({ settings: { strataPort: 45227, modelDirectory: "selected-models", comfyUrl: "http://192.0.2.1:9" } }));
  const preferences = await readAgentPreferences(); expect(preferences.strataPort).toBe(45227);
  const discovered = await agentSettings(preferences);
  expect(discovered.modelDirectory).toBe("selected-models"); expect(discovered.discoveredComfyUrl).toBe("http://192.0.2.1:9");
});
