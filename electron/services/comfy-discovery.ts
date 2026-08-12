import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { ComfyUiInstallationSummary, Settings } from "../../src/types.js";

const execFileAsync = promisify(execFile);

async function exists(filename: string): Promise<boolean> {
  return Boolean(await fs.stat(filename).catch(() => null));
}

export interface CandidateContext {
  homeDirectory: string;
  localAppData: string;
  modelDirectory?: string;
  outputDirectory?: string;
  installDirectory?: string;
  driveRoots?: string[];
}

export interface DesktopCandidateContext {
  homeDirectory: string;
  localAppData: string;
  programFiles?: string;
  driveRoots?: string[];
}

export function uniqueWindowsPaths(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (!value) return false;
    const key = path.resolve(value).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rootFromConfiguredDirectory(directory: string | undefined): string {
  if (!directory) return "";
  const resolved = path.resolve(directory);
  return ["models", "output", "input"].includes(path.basename(resolved).toLowerCase())
    ? path.dirname(resolved)
    : resolved;
}

export function buildComfyCandidates(context: CandidateContext): string[] {
  const { homeDirectory, localAppData } = context;
  const driveRoots = context.driveRoots ?? ["C:\\", "D:\\", "E:\\", "F:\\"];
  return uniqueWindowsPaths([
    rootFromConfiguredDirectory(context.installDirectory),
    rootFromConfiguredDirectory(context.modelDirectory),
    rootFromConfiguredDirectory(context.outputDirectory),
    path.join(homeDirectory, "Documents", "ComfyUI"),
    path.join(homeDirectory, "ComfyUI"),
    path.join(homeDirectory, "Desktop", "ComfyUI"),
    path.join(homeDirectory, "Downloads", "ComfyUI"),
    path.join(homeDirectory, "Downloads", "ComfyUI_windows_portable", "ComfyUI"),
    path.join(localAppData, "ComfyUI"),
    path.join(localAppData, "Programs", "ComfyUI"),
    path.join(localAppData, "Programs", "ComfyUI Desktop", "resources", "ComfyUI"),
    ...driveRoots.map((root) => path.join(root, "ComfyUI")),
    ...driveRoots.map((root) =>
      path.join(root, "ComfyUI_windows_portable", "ComfyUI")
    )
  ]);
}

export function buildComfyDesktopCandidates(
  context: DesktopCandidateContext
): string[] {
  const programFiles = context.programFiles ?? "C:\\Program Files";
  const driveRoots = context.driveRoots ?? ["C:\\", "D:\\"];
  return uniqueWindowsPaths([
    path.join(context.localAppData, "Programs", "ComfyUI", "Comfy Desktop", "Comfy Desktop.exe"),
    path.join(context.localAppData, "ComfyUI", "Comfy Desktop", "Comfy Desktop.exe"),
    path.join(programFiles, "ComfyUI", "Comfy Desktop", "Comfy Desktop.exe"),
    ...driveRoots.map((root) =>
      path.join(root, "Program Files", "ComfyUI", "Comfy Desktop", "Comfy Desktop.exe")
    ),
    path.join(context.localAppData, "Programs", "ComfyUI", "ComfyUI.exe"),
    path.join(context.localAppData, "ComfyUI", "ComfyUI.exe"),
    path.join(programFiles, "ComfyUI", "ComfyUI.exe"),
    ...driveRoots.map((root) =>
      path.join(root, "Program Files", "ComfyUI", "ComfyUI.exe")
    ),
    path.join(context.homeDirectory, "AppData", "Local", "Programs", "ComfyUI", "ComfyUI.exe")
  ]);
}

export async function readComfySourceVersion(sourceDirectory: string): Promise<string> {
  if (!sourceDirectory) return "";
  const source = await fs.readFile(
    path.join(sourceDirectory, "comfyui_version.py"),
    "utf8"
  ).catch(() => "");
  return source.match(/__version__\s*=\s*["']([^"']+)["']/)?.[1] ?? "";
}

async function findExecutable(command: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("where.exe", [command], {
      encoding: "utf8",
      timeout: 4000,
      windowsHide: true
    });
    return stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
  } catch {
    return "";
  }
}

export async function readComfyGitRevision(sourceDirectory: string): Promise<string> {
  if (!sourceDirectory || !(await exists(path.join(sourceDirectory, ".git")))) {
    return "";
  }
  try {
    const git = await findExecutable("git.exe");
    if (!git) return "";
    const { stdout } = await execFileAsync(
      git,
      ["-C", sourceDirectory, "rev-parse", "--short=8", "HEAD"],
      { encoding: "utf8", timeout: 5000, windowsHide: true }
    );
    return stdout.trim();
  } catch {
    return "";
  }
}

async function isComfyRoot(directory: string): Promise<boolean> {
  if (!(await exists(directory))) return false;
  return (
    (await exists(path.join(directory, "main.py"))) ||
    (await exists(path.join(directory, "models")))
  );
}

async function discoverNamedComfyDirectories(homeDirectory: string): Promise<string[]> {
  const bases = ["Documents", "Desktop", "Downloads"].map((folder) =>
    path.join(homeDirectory, folder)
  );
  const discovered: string[] = [];
  for (const base of bases) {
    const entries = await fs.readdir(base, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory() || !/comfyui/i.test(entry.name)) continue;
      const candidate = path.join(base, entry.name);
      discovered.push(candidate, path.join(candidate, "ComfyUI"));
    }
  }
  return discovered;
}

export async function findComfyRoot(settings: Settings): Promise<string> {
  const homeDirectory = os.homedir();
  const localAppData =
    process.env.LOCALAPPDATA ?? path.join(homeDirectory, "AppData", "Local");
  const candidates = uniqueWindowsPaths([
    ...buildComfyCandidates({
      homeDirectory,
      localAppData,
      installDirectory: settings.comfyInstallDirectory,
      modelDirectory: settings.modelDirectory,
      outputDirectory: settings.outputDirectory
    }),
    ...(await discoverNamedComfyDirectories(homeDirectory))
  ]);
  for (const candidate of candidates) {
    if (await isComfyRoot(candidate)) return candidate;
  }
  return "";
}

export type ComfyInstallation = Omit<
  ComfyUiInstallationSummary,
  "desktopVersion" | "version" | "revision" | "selected"
>;

export function buildComfyDesktopSourceCandidates(executable: string): string[] {
  const directory = path.dirname(executable);
  return uniqueWindowsPaths([
    path.join(directory, "resources", "ComfyUI"),
    path.join(path.dirname(directory), "resources", "ComfyUI")
  ]);
}

async function readWindowsProductVersion(executable: string): Promise<string> {
  if (!executable || !(await exists(executable))) return "";
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "(Get-Item -LiteralPath ([Environment]::GetEnvironmentVariable('AIVIDEO_COMFY_EXE'))).VersionInfo.ProductVersion"
      ],
      {
        encoding: "utf8",
        timeout: 5000,
        windowsHide: true,
        env: { ...process.env, AIVIDEO_COMFY_EXE: executable }
      }
    );
    return stdout.trim();
  } catch {
    return "";
  }
}

async function desktopInstallation(executable: string): Promise<ComfyInstallation> {
  const directory = path.dirname(executable);
  const sourceCandidates = buildComfyDesktopSourceCandidates(executable);
  const sourceDirectory = (await Promise.all(
    sourceCandidates.map(async (candidate) =>
      (await exists(path.join(candidate, "main.py"))) ? candidate : ""
    )
  )).find(Boolean) ?? "";
  return { type: "desktop", directory, sourceDirectory, executable };
}

export interface ComfyDesktop2RegistryEntry {
  id: string;
  name: string;
  installPath: string;
  status: string;
  sourceId: string;
  comfyVersion?: { commit?: string; baseTag?: string; commitsAhead?: number };
}

export function parseComfyDesktop2Registry(source: string): ComfyDesktop2RegistryEntry[] {
  try {
    const parsed = JSON.parse(source) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is ComfyDesktop2RegistryEntry => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
      const record = entry as Record<string, unknown>;
      return typeof record.id === "string" &&
        typeof record.name === "string" &&
        typeof record.installPath === "string" &&
        typeof record.status === "string" &&
        typeof record.sourceId === "string";
    });
  } catch {
    return [];
  }
}

async function desktop2ManagedInstallations(
  executable: string
): Promise<Array<{ installation: ComfyInstallation; revision: string }>> {
  const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  const registryPath = path.join(appData, "Comfy Desktop", "installations.json");
  const entries = parseComfyDesktop2Registry(
    await fs.readFile(registryPath, "utf8").catch(() => "")
  );
  const results: Array<{ installation: ComfyInstallation; revision: string }> = [];
  for (const entry of entries) {
    if (entry.sourceId === "cloud" || entry.status !== "installed") continue;
    const directory = path.resolve(entry.installPath);
    const sourceCandidates = [path.join(directory, "ComfyUI"), directory];
    const sourceDirectory = (await Promise.all(sourceCandidates.map(async (candidate) =>
      (await exists(path.join(candidate, "main.py"))) ? candidate : ""
    ))).find(Boolean) ?? "";
    if (!sourceDirectory) continue;
    results.push({
      installation: {
        type: "desktop",
        directory,
        sourceDirectory,
        executable
      },
      revision: entry.comfyVersion?.commit?.slice(0, 8) ?? ""
    });
  }
  return results;
}

export async function installationFromDirectory(directory: string | undefined): Promise<ComfyInstallation | null> {
  if (!directory?.trim()) return null;
  const selected = path.resolve(directory.trim());
  const desktopExecutables = [
    path.join(selected, "Comfy Desktop", "Comfy Desktop.exe"),
    path.join(selected, "Comfy Desktop.exe"),
    path.join(selected, "ComfyUI.exe")
  ];
  for (const executable of desktopExecutables) {
    if (await exists(executable)) return desktopInstallation(executable);
  }
  const sourceCandidates = [
    selected,
    path.join(selected, "ComfyUI"),
    path.join(selected, "resources", "ComfyUI")
  ];
  for (const sourceDirectory of sourceCandidates) {
    if (!(await exists(path.join(sourceDirectory, "main.py")))) continue;
    const portablePython = path.join(
      path.dirname(sourceDirectory),
      "python_embeded",
      "python.exe"
    );
    const portable = await exists(portablePython);
    return {
      type: portable ? "portable" : "manual",
      directory: sourceDirectory,
      sourceDirectory,
      executable: portable ? portablePython : ""
    };
  }
  return null;
}

export async function discoverComfyInstallations(
  settings: Settings
): Promise<ComfyUiInstallationSummary[]> {
  const homeDirectory = os.homedir();
  const localAppData =
    process.env.LOCALAPPDATA ?? path.join(homeDirectory, "AppData", "Local");
  const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
  const desktopExecutables = buildComfyDesktopCandidates({
    homeDirectory,
    localAppData,
    programFiles,
    driveRoots: ["C:\\", "D:\\"]
  });
  const existingDesktopExecutables = (
    await Promise.all(desktopExecutables.map(async (executable) => ({
      executable,
      exists: await exists(executable)
    })))
  ).filter((candidate) => candidate.exists).map((candidate) => candidate.executable);
  const modernDesktopExecutable = existingDesktopExecutables.find(
    (executable) => path.basename(executable).toLowerCase() === "comfy desktop.exe"
  ) ?? "";
  const managed = modernDesktopExecutable
    ? await desktop2ManagedInstallations(modernDesktopExecutable)
    : [];
  const configuredPath = settings.comfyInstallDirectory?.trim()
    ? path.resolve(settings.comfyInstallDirectory.trim()).toLowerCase()
    : "";
  const managedMatch = managed.find(({ installation }) =>
    installation.directory.toLowerCase() === configuredPath ||
    installation.sourceDirectory.toLowerCase() === configuredPath
  ) ?? (
    configuredPath && modernDesktopExecutable &&
    path.dirname(modernDesktopExecutable).toLowerCase() === configuredPath
      ? managed[0]
      : undefined
  );
  const configured = managedMatch?.installation ??
    await installationFromDirectory(settings.comfyInstallDirectory);
  const installations: ComfyInstallation[] = configured ? [configured] : [];
  installations.push(...managed.map((item) => item.installation));

  for (const executable of existingDesktopExecutables) {
    if (managed.length && executable.toLowerCase() === modernDesktopExecutable.toLowerCase()) {
      continue;
    }
    installations.push(await desktopInstallation(executable));
  }
  const sourceCandidates = uniqueWindowsPaths([
    ...buildComfyCandidates({
      homeDirectory,
      localAppData,
      installDirectory: settings.comfyInstallDirectory,
      modelDirectory: settings.modelDirectory,
      outputDirectory: settings.outputDirectory,
      driveRoots: ["C:\\", "D:\\"]
    }),
    ...(await discoverNamedComfyDirectories(homeDirectory))
  ]);
  for (const candidate of sourceCandidates) {
    const installation = await installationFromDirectory(candidate);
    if (installation) installations.push(installation);
  }

  const selectedKey = configured?.directory.toLowerCase() ?? "";
  const seen = new Set<string>();
  const unique = installations.filter((installation) => {
    const key = `${installation.type}:${installation.directory.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return Promise.all(unique.map(async (installation) => ({
    ...installation,
    desktopVersion: installation.type === "desktop"
      ? await readWindowsProductVersion(installation.executable)
      : "",
    version: await readComfySourceVersion(installation.sourceDirectory),
    revision: managed.find(({ installation: candidate }) =>
      candidate.directory.toLowerCase() === installation.directory.toLowerCase()
    )?.revision || await readComfyGitRevision(installation.sourceDirectory),
    selected: Boolean(selectedKey) && installation.directory.toLowerCase() === selectedKey
  })));
}

export async function findComfyInstallation(settings: Settings): Promise<ComfyInstallation | null> {
  const installations = await discoverComfyInstallations(settings);
  const selected = installations.find((installation) => installation.selected);
  const installation = selected ?? installations[0];
  if (!installation) return null;
  const {
    desktopVersion: _desktopVersion,
    version: _version,
    revision: _revision,
    selected: _selected,
    ...result
  } = installation;
  return result;
}
