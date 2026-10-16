import { promises as fs } from "node:fs";
import path from "node:path";
import { canUninstallStrata, resolvedStrataDirectory, strataManagedReceipt, strataInstalledRelease } from "./strata-installation.js";
import type { Settings, StrataPreparationStatus } from "../../src/types.js";
import { strataModelRoot, strataModelScanRoots, strataPreparationProfiles } from "../../src/core/strata-preparation.js";
import { STRATA_ENGINE_FILES, STRATA_SOURCE_FILES } from "../../src/core/catalog/dependencies/strata.js";

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
  settings: Pick<Settings, "strataInstallDirectory" | "strataModelDirectory" | "modelDirectory" | "comfyInstallDirectory" | "uiLocale">,
  inspect: StrataFileInspector = inspectFile,
  resolvedModelDirectory = settings.modelDirectory
) {
  const installDirectory = resolvedStrataDirectory(settings);
  const modelDirectory = strataModelRoot(settings, resolvedModelDirectory);
  const modelScanRoots = strataModelScanRoots(settings, resolvedModelDirectory);
  const files = await Promise.all([...STRATA_SOURCE_FILES, ...STRATA_ENGINE_FILES].map(async (relativePath) => ({
    relativePath,
    present: Boolean(installDirectory && (await inspect(path.join(installDirectory, relativePath)))?.size)
  })));
  const profiles = strataPreparationProfiles(settings.uiLocale);
  // Shared projector is inspected once, not once per quant.
  const evidence = new Map<string, Promise<StrataFileEvidence | null>>();
  await Promise.all(profiles.flatMap((profile) => profile.components.map(async (component) => {
    for (const root of modelScanRoots) {
      const filename = path.join(root, component.expected);
      if (!evidence.has(filename)) evidence.set(filename, inspect(filename));
      const file = await evidence.get(filename);
      if (file?.size !== component.installGuide.bytes || file?.header !== "GGUF") continue;
      component.found = true;
      component.matches = [filename];
      break;
    }
  })));
  for (const profile of profiles) profile.available = profile.components.every((component) => component.optional || component.found);
  const status: StrataPreparationStatus = {
    installedVersion: strataInstalledRelease(installDirectory)?.version,
    installedRevision: strataInstalledRelease(installDirectory)?.revision,
    installDirectory, modelDirectory, configuredInstallDirectory: settings.strataInstallDirectory.trim(), files,
    configuredModelDirectory: settings.modelDirectory.trim(), configuredComfyInstallDirectory: settings.comfyInstallDirectory.trim(),
    managedUninstallable: await canUninstallStrata(settings, { protectedDirectories: [resolvedModelDirectory] }),
    managedInstalled: await strataManagedReceipt(installDirectory) && Boolean((await inspect(path.join(installDirectory, ".venv/Scripts/python.exe")))?.size),
    sourcePresent: files.slice(0, STRATA_SOURCE_FILES.length).every((file) => file.present),
    enginePresent: files.slice(STRATA_SOURCE_FILES.length).every((file) => file.present),
    scannedAt: new Date().toISOString()
  };
  return { status, profiles };
}
