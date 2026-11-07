import { promises as fs } from "node:fs";
import path from "node:path";
import { modelLibraryRoots } from "../../src/core/model-libraries.js";
import { hasDeepSeekEngine } from "./strata-deepseek-engine.js";
import { canUninstallStrata, resolvedStrataDirectory, strataManagedReceipt, strataInstalledRelease } from "./strata-installation.js";
import type { Settings, StrataPreparationStatus } from "../../src/types.js";
import { strataModelRoot, strataModelScanRoots, strataPreparationProfiles } from "../../src/core/strata-preparation.js";
import { STRATA_ENGINE_FILES, STRATA_LEGACY_ENGINE_FILES, STRATA_SOURCE_FILES } from "../../src/core/catalog/dependencies/strata.js";

export interface StrataFileEvidence { size: number; header: string }
export type StrataFileInspector = (filename: string) => Promise<StrataFileEvidence | null>;

async function inspectFile(filename: string): Promise<StrataFileEvidence | null> {
  let file: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    file = await fs.open(filename, "r");
    const stat = await file.stat();
    if (!stat.isFile()) return null;
    const header = Buffer.alloc(4);
    const read = await file.read(header, 0, 4, 0);
    return { size: stat.size, header: header.subarray(0, read.bytesRead).toString("ascii") };
  } catch { return null; }
  finally { await file?.close().catch(() => undefined); }
}

/** Bounded, read-only scan: no recursion, downloads, hashing, subprocess or GPU. */
export async function scanStrataPreparation(
  settings: Pick<Settings, "strataInstallDirectory" | "strataModelDirectory" | "modelDirectory" | "comfyInstallDirectory" | "uiLocale"> & Partial<Pick<Settings, "modelDirectories">>,
  inspect: StrataFileInspector = inspectFile,
  resolvedModelDirectory = settings.modelDirectory
) {
  const installDirectory = resolvedStrataDirectory(settings);
  const modelDirectory = strataModelRoot(settings, resolvedModelDirectory);
  const release = strataInstalledRelease(installDirectory);
  const engineFiles = release?.bundledLibraries === false ? STRATA_LEGACY_ENGINE_FILES : STRATA_ENGINE_FILES;
  const files = await Promise.all([...STRATA_SOURCE_FILES, ...engineFiles].map(async (relativePath) => ({
    relativePath,
    present: Boolean(installDirectory && (await inspect(path.join(installDirectory, relativePath)))?.size)
  })));
  const profiles = strataPreparationProfiles(settings.uiLocale);
  // Shared projector is inspected once, not once per quant.
  const evidence = new Map<string, Promise<StrataFileEvidence | null>>();
  const valid = async (root: string, component: typeof profiles[number]["components"][number]) => {
      const filename = path.join(root, component.expected);
      if (!evidence.has(filename)) evidence.set(filename, inspect(filename));
      const file = await evidence.get(filename);
      return file?.size === component.installGuide.bytes && file?.header === "GGUF";
  };
  await Promise.all(profiles.map(async profile => {
    const roots = strataModelScanRoots(settings, resolvedModelDirectory, profile.id);
    // Native packers require every shard of one tensor set to live together.
    const shardGroups = new Map<string, typeof profile.components>();
    for (const component of profile.components) {
      const prefix = component.expected.match(/^(.*)-\d+-of-\d+\.gguf$/iu)?.[1];
      if (prefix) shardGroups.set(prefix, [...(shardGroups.get(prefix) ?? []), component]);
    }
    const chosen = new Map<string, string[]>();
    for (const group of shardGroups.values()) {
      if (!settings.modelDirectories?.length || group.length < 2) continue;
      let complete: string | undefined;
      for (const root of roots) {
        if ((await Promise.all(group.map(component => valid(root, component)))).every(Boolean)) { complete = root; break; }
      }
      for (const component of group) chosen.set(component.expected, complete ? [complete] : []);
    }
    await Promise.all(profile.components.map(async component => {
    for (const root of chosen.get(component.expected) ?? roots) {
      if (!await valid(root, component)) continue;
      component.found = true;
      component.matches = [path.join(root, component.expected)];
      break;
    }
    }));
  }));
  for (const profile of profiles) profile.available = profile.components.every((component) => component.optional || component.found);
  const status: StrataPreparationStatus = {
    installedVersion: strataInstalledRelease(installDirectory)?.version,
    installedRevision: strataInstalledRelease(installDirectory)?.revision,
    installDirectory, modelDirectory, configuredInstallDirectory: settings.strataInstallDirectory.trim(), files,
    configuredModelDirectories: settings.modelDirectories ? [...settings.modelDirectories] : modelLibraryRoots(settings),
    configuredModelDirectory: settings.modelDirectory.trim(), configuredComfyInstallDirectory: settings.comfyInstallDirectory.trim(),
    managedUninstallable: await canUninstallStrata(settings, { protectedDirectories: [resolvedModelDirectory] }),
    managedInstalled: await strataManagedReceipt(installDirectory) && Boolean((await inspect(path.join(installDirectory, ".venv/Scripts/python.exe")))?.size),
    sourcePresent: files.slice(0, STRATA_SOURCE_FILES.length).every((file) => file.present),
    enginePresent: files.slice(STRATA_SOURCE_FILES.length).every((file) => file.present),
    deepSeekEnginePresent: await hasDeepSeekEngine(installDirectory),
    scannedAt: new Date().toISOString()
  };
  return { status, profiles };
}
