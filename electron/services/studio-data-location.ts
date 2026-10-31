import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

export const studioDataDirectory = (documents: string) => path.join(documents, "Local Video Studio", "Data");
let windowsDocuments: Promise<string> | undefined;

/** Electron supplies the actual known folder, including redirected Documents. */
export function studioStorageLocation(userData: string, documents: string, isolated: boolean, migrateProfile = false) {
  const libraryDocuments = isolated ? path.join(userData, "Documents") : documents;
  return {
    documents: libraryDocuments,
    data: isolated && !migrateProfile ? userData : studioDataDirectory(libraryDocuments),
    migrate: !isolated || migrateProfile
  };
}

/** Standalone tools use the same Windows known folder; never guess OneDrive paths. */
export async function resolveStudioDataDirectory(): Promise<string> {
  if (process.env.LVS_STUDIO_DATA_DIRECTORY) return path.resolve(process.env.LVS_STUDIO_DATA_DIRECTORY);
  if (process.platform !== "win32") return studioDataDirectory(path.join(os.homedir(), "Documents"));
  windowsDocuments ??= (async () => {
    const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; [Environment]::GetFolderPath('MyDocuments')"], { windowsHide: true, timeout: 10000 });
    const documents = stdout.trim();
    if (!documents || !path.isAbsolute(documents)) throw new Error("Cannot locate the Documents folder for Studio data");
    return studioDataDirectory(documents);
  })();
  return windowsDocuments;
}
