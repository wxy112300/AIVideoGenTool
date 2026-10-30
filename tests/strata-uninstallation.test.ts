import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultSettings } from "../src/core/defaults";
import { STRATA_ENGINE_SHA256, STRATA_REVISION } from "../src/core/catalog/dependencies/strata";
import { canUninstallStrata, installStrataRuntime, uninstallStrataRuntime } from "../electron/services/strata-installation";

const fixtures: string[] = [];
afterEach(async () => { for (const directory of fixtures.splice(0)) await fs.rm(directory, { recursive: true, force: true }); });
async function fixture(complete = true) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-strata-uninstall-")); fixtures.push(directory);
  const root = path.join(directory, "runtime with spaces"), models = path.join(directory, "shared-models");
  await fs.mkdir(root); await fs.mkdir(models);
  await fs.writeFile(path.join(root, "lvs-strata-install.json"), JSON.stringify({ owner: "local-video-studio", revision: STRATA_REVISION, engineSha256: STRATA_ENGINE_SHA256, ...(complete ? { installedAt: "fixture" } : {}) }));
  await fs.writeFile(path.join(root,"software.txt"), "software fixture");
  await fs.writeFile(path.join(models,"shared.gguf"), "keep model fixture");
  return { directory, root, models, settings: { ...createDefaultSettings(), modelDirectory: models }, options: { managedDirectory: root } };
}
describe("Strata managed software uninstallation", () => {
  it.each(["en-US", "zh-TW"] as const)("localizes overlap protection and successful removal while keeping shared models (%s)", async uiLocale => {
    const { root, models, settings, options } = await fixture();
    settings.uiLocale = uiLocale;
    const blocked = await uninstallStrataRuntime({ ...settings, modelDirectory: root }, undefined, options);
    expect(blocked).toMatchObject({ ok: false, message: expect.stringContaining(uiLocale === "en-US" ? "overlaps a model directory" : "模型目錄重疊") });
    expect(await fs.readFile(path.join(root, "software.txt"), "utf8")).toBe("software fixture");
    const result = await uninstallStrataRuntime(settings, undefined, options);
    expect(result).toMatchObject({ ok: true, message: expect.stringContaining(uiLocale === "en-US" ? "Shared model files were kept" : "共用模型檔案已保留") });
    expect(await fs.readFile(path.join(models, "shared.gguf"), "utf8")).toBe("keep model fixture");
  });
  it.each([true,false])("removes only the exact owned software directory, including interrupted installs (complete=%s)", async (complete) => {
    const { directory,root,models,settings,options } = await fixture(complete), log = vi.fn();
    const backup = `${root}.backup-fixture`, data = path.join(directory,"Strata-data");
    for(const sibling of [backup,data]) { await fs.mkdir(sibling); await fs.writeFile(path.join(sibling,"keep.txt"), "keep"); }
    await fs.symlink(models,path.join(root,"shared-model-link"),process.platform === "win32" ? "junction" : "dir");
    expect(await canUninstallStrata(settings,options)).toBe(true);
    expect(await uninstallStrataRuntime(settings,log,options)).toMatchObject({ok:true,message:expect.stringContaining("共享模型")});
    await expect(fs.stat(root)).rejects.toMatchObject({code:"ENOENT"});
    expect(await fs.readFile(path.join(models,"shared.gguf"),"utf8")).toBe("keep model fixture");
    for(const sibling of [backup,data]) expect(await fs.readFile(path.join(sibling,"keep.txt"),"utf8")).toBe("keep");
    expect(log).toHaveBeenCalledWith(expect.stringContaining(root));
    expect(await canUninstallStrata(settings,options)).toBe(false);
    expect((await uninstallStrataRuntime(settings,undefined,options)).ok).toBe(false);
  });
  it.each(["manual","unowned","wrong-revision"])("rejects %s installations without changing files", async (kind) => {
    const {root,settings,options} = await fixture();
    if(kind === "manual") settings.strataInstallDirectory = path.join(root,"other");
    else if(kind === "unowned") await fs.rm(path.join(root,"lvs-strata-install.json"));
    else await fs.writeFile(path.join(root,"lvs-strata-install.json"),JSON.stringify({owner:"local-video-studio",revision:"wrong",engineSha256:STRATA_ENGINE_SHA256}));
    expect(await canUninstallStrata(settings,options)).toBe(false);
    expect((await uninstallStrataRuntime(settings,undefined,options)).ok).toBe(false);
    expect(await fs.readFile(path.join(root,"software.txt"),"utf8")).toBe("software fixture");
  });
  it.each(["equal","inside","ancestor","legacy","discovered","alias"])("protects overlapping model locations (%s)", async (kind) => {
    const {directory,root,settings,options} = await fixture();
    if(kind === "equal") settings.modelDirectory = root;
    if(kind === "inside") settings.modelDirectory = path.join(root,"models-not-yet-created");
    if(kind === "ancestor") settings.modelDirectory = directory;
    if(kind === "legacy") settings.strataModelDirectory = path.join(root,"old-models");
    if(kind === "discovered") Object.assign(options,{protectedDirectories:[path.join(root,"discovered-models")]});
    if(kind === "alias") { settings.modelDirectory=path.join(directory,"model-alias"); await fs.symlink(root,settings.modelDirectory,process.platform === "win32"?"junction":"dir"); }
    expect(await canUninstallStrata(settings,options)).toBe(false);
    expect(await uninstallStrataRuntime(settings,undefined,options)).toMatchObject({ok:false,message:expect.stringContaining("模型目录重叠")});
    expect(await fs.readFile(path.join(root,"software.txt"),"utf8")).toBe("software fixture");
  });
  it("refuses a linked root even when its target has an ownership receipt", async () => {
    const {directory,root,settings} = await fixture(), alias=path.join(directory,"runtime-alias");
    await fs.symlink(root,alias,process.platform === "win32"?"junction":"dir");
    expect((await uninstallStrataRuntime(settings,undefined,{managedDirectory:alias})).ok).toBe(false);
    expect(await fs.readFile(path.join(root,"software.txt"),"utf8")).toBe("software fixture");
  });
  it("does not delete files during a concurrent software installation", async () => {
    const {root,settings,options} = await fixture();
    const run = vi.fn(async () => {
      expect(await uninstallStrataRuntime(settings,undefined,options)).toMatchObject({ok:false,message:expect.stringContaining("正在安装或卸载")});
      throw new Error("fixture stops before modifying installation");
    });
    await installStrataRuntime(settings,{...options,environment:()=>({}),findPython:async()=>"python.exe",download:async()=>{},run});
    expect(run).toHaveBeenCalled();
    expect(await fs.readFile(path.join(root,"software.txt"),"utf8")).toBe("software fixture");
    expect((await uninstallStrataRuntime(settings,undefined,options)).ok).toBe(true);
  });
});
