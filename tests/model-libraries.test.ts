import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultSettings } from "../src/core/defaults";
import { comfyModelLibrariesConfig, modelLibraryRoots, modelDownloadRoot } from "../src/core/model-libraries";
import { scanModelLibraries } from "../electron/services/model-library-scan";
import { evaluateModelProfiles } from "../electron/services/environment";
import { comfyModelLibrariesLaunchMatches } from "../electron/services/comfy-runtime-service";
import { comfyUiSettingsForQueueTask } from "../src/infrastructure/comfy-runtime-policy";
import { createHash } from "node:crypto";
import { strataModelRoot, strataPreparationProfiles, strataProfileModelRoot } from "../src/core/strata-preparation";
import { scanStrataPreparation } from "../electron/services/strata-preparation";
import { STRATA_Q4_MODEL_ID } from "../src/core/catalog/models/strata";

const temporary: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(temporary.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-model-libraries-")); temporary.push(root);
  const roots = [path.join(root, "first/models"), path.join(root, "second/models")];
  const write = async (index: number, relative: string) => {
    const filename = path.join(roots[index]!, relative); await fs.mkdir(path.dirname(filename), { recursive: true }); await fs.writeFile(filename, "fixture"); return filename;
  };
  return { roots, write };
}

describe("ordered model libraries", () => {
  it("retains automatic/legacy roots, ignores blank rows and uses the first row as default", () => {
    expect(modelLibraryRoots({ modelDirectory: "" }, "D:/Comfy/models")).toEqual(["D:/Comfy/models"]);
    const settings = { modelDirectory: "legacy", modelDirectories: ["D:\\Models\\", "d:/models", "E:/models"], modelDownloadDirectory: "E:/models" };
    expect(modelLibraryRoots(settings)).toEqual(["D:\\Models\\", "E:/models"]);
    expect(modelDownloadRoot(settings)).toBe("D:\\Models\\");
    expect(modelDownloadRoot({ ...settings, modelDownloadDirectory: "removed" })).toBe("D:\\Models\\");
    expect(modelLibraryRoots({ modelDirectory: "legacy", modelDirectories: ["", "E:/models", ""] })).toEqual(["E:/models"]);
    expect(modelLibraryRoots({ modelDirectory: "legacy", modelDirectories: [""] })).toEqual([]);
    expect(modelDownloadRoot({ modelDirectory: "legacy", modelDirectories: ["", "E:/models"] })).toBe("");
  });
  it("merges relative files in priority order, reveals actual files and combines distinct components across libraries", async () => {
    const { roots, write } = await fixture();
    const relative = "diffusion_models/seedvr2_3b_int8_convrot.safetensors";
    const first = await write(0, relative), second = await write(1, relative);
    await write(1, "vae/seedvr2_ema_vae_fp16.safetensors");
    await write(0, "wrong-layout/not-a-model.txt");
    await write(0, "archive/vae/seedvr2_ema_vae_fp16.safetensors");
    const scanned = await scanModelLibraries([...roots, path.join(roots[0]!, "missing")]);
    expect(scanned.files.filter(file => file === relative)).toHaveLength(1);
    expect(scanned.files.some(file => file.startsWith("archive/"))).toBe(false);
    expect(scanned.locations.get(relative)).toEqual([first, second]);
    expect(scanned.libraries.at(-1)?.available).toBe(false);
    const profile = evaluateModelProfiles(scanned.files, "q3_k_m", undefined, scanned.locations).find(profile => profile.id === "seedvr2-native-int8")!;
    expect(profile.available).toBe(true);
    expect(profile.components[0]?.matches).toContain(relative);
    expect(profile.components[0]?.locations?.[0]).toBe(first);
    const reordered = await scanModelLibraries([...roots].reverse());
    expect(reordered.locations.get(relative)?.[0]).toBe(second);
    expect(await fs.readFile(first, "utf8")).toBe("fixture");
  });
  it("binds launch configuration to lookup order and retains a queued task's original roots", () => {
    const settings = { ...createDefaultSettings(), modelDirectories: ["D:/models", "E:/models"] };
    const config = comfyModelLibrariesConfig(settings.modelDirectories);
    expect(Object.values(JSON.parse(config)).map((item: any) => item.base_path)).toEqual(["E:/models", "D:/models"]);
    const token = createHash("sha256").update(config).digest("hex");
    const command = `python --extra-model-paths-config C:/comfy-model-libraries/${token}.json`;
    expect(comfyModelLibrariesLaunchMatches(settings, command)).toBe(true);
    expect(comfyModelLibrariesLaunchMatches({ ...settings, modelDirectories: [...settings.modelDirectories].reverse() }, command)).toBe(false);
    expect(comfyModelLibrariesLaunchMatches(createDefaultSettings(), command)).toBe(false);
    const task = { taskType: "image-generation" as const, modelId: "z-image", modelDirectories: [...settings.modelDirectories] };
    settings.modelDirectories.reverse();
    expect(comfyUiSettingsForQueueTask(task, settings).modelDirectories).toEqual(["D:/models", "E:/models"]);
  });
  it("selects a complete Strata shard set from one library and rejects split-only sets", async () => {
    const { roots } = await fixture();
    const settings = { ...createDefaultSettings(), modelDirectory: roots[0]!, modelDirectories: roots };
    const profile = strataPreparationProfiles().find(item => item.id === STRATA_Q4_MODEL_ID)!;
    const rootFor = (root: string) => strataProfileModelRoot(strataModelRoot({ ...settings, modelDirectories: [root] }), STRATA_Q4_MODEL_ID);
    const shards = profile.components.filter(component => /-\d+-of-\d+\.gguf$/u.test(component.expected));
    const files = new Map<string, { size: number; header: string }>();
    for (const component of profile.components) files.set(path.join(rootFor(roots[1]!), component.expected), { size: component.installGuide!.bytes!, header: "GGUF" });
    files.set(path.join(rootFor(roots[0]!), shards[0]!.expected), { size: shards[0]!.installGuide!.bytes!, header: "GGUF" });
    const inspect = async (file: string) => files.get(file) ?? null;
    const scan = await scanStrataPreparation(settings, inspect);
    const found = scan.profiles.find(item => item.id === profile.id)!;
    expect(found.available).toBe(true);
    expect(found.components.filter(component => shards.some(shard => shard.expected === component.expected)).every(component => component.matches[0]?.startsWith(rootFor(roots[1]!)))).toBe(true);
    files.delete(path.join(rootFor(roots[1]!), shards[0]!.expected));
    expect((await scanStrataPreparation(settings, inspect)).profiles.find(item => item.id === profile.id)?.available).toBe(false);
  });
});
