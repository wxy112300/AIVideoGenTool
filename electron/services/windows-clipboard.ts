import { execFile } from "node:child_process";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
let clipboardWrite: Promise<void> = Promise.resolve();
const clipboardStagingRetentionMs = 24 * 60 * 60 * 1000;

export async function resolveExistingHistoryFile(
  filename: string,
  fallbackFilenames: string[] = []
): Promise<string | null> {
  const requested = [filename, ...fallbackFilenames]
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .map((candidate) => path.resolve(candidate));
  if (!requested.length) return null;
  const candidates = requested.flatMap((resolved) => [
    resolved,
    // VideoHelperSuite can report an `-audio.mp4` output while its finalized
    // file on disk is the otherwise identical `.mp4` path.
    resolved.replace(/-audio(?=\.[^.]+$)/i, "")
  ]);
  for (const candidate of new Set(candidates)) {
    const stat = await fs.stat(candidate).catch(() => null);
    if (stat?.isFile()) return candidate;
  }
  return null;
}

/**
 * Put a real file-drop list on the Windows clipboard so Explorer can paste it.
 * Electron's FileNameW custom buffer is not equivalent to the native CF_HDROP
 * format and can report success even though Explorer has nothing to paste.
 */
export async function stageFileForWindowsClipboard(
  filename: string,
  stagingRoot: string
): Promise<{ stagedFilename: string; stagingDirectory: string }> {
  const staged = await stageFilesForWindowsClipboard([filename], stagingRoot);
  return {
    stagedFilename: staged.stagedFilenames[0]!,
    stagingDirectory: staged.stagingDirectory
  };
}

export async function stageFilesForWindowsClipboard(
  filenames: string[],
  stagingRoot: string
): Promise<{ stagedFilenames: string[]; stagingDirectory: string }> {
  const stagingDirectory = path.join(stagingRoot, crypto.randomUUID());
  const stagedFilenames: string[] = [];
  await fs.mkdir(stagingDirectory, { recursive: true });
  try {
    const usedNames = new Set<string>();
    for (const [index, filename] of filenames.entries()) {
      const originalName = path.basename(filename) || `history-${index + 1}`;
      const extension = path.extname(originalName);
      const stem = extension ? originalName.slice(0, -extension.length) : originalName;
      let stagedName = originalName;
      let suffix = 2;
      while (usedNames.has(stagedName.toLowerCase())) {
        stagedName = `${stem}-${suffix++}${extension}`;
      }
      usedNames.add(stagedName.toLowerCase());
      const stagedFilename = path.join(stagingDirectory, stagedName);
      // A hard link is instant and protects the original even if Explorer
      // mistakenly consumes the clipboard entry as a same-volume move.
      await fs.link(filename, stagedFilename).catch(async () => {
        await fs.copyFile(filename, stagedFilename);
      });
      stagedFilenames.push(stagedFilename);
    }
  } catch (error) {
    await fs.rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
  return { stagedFilenames, stagingDirectory };
}

export async function copyFileToWindowsClipboard(
  filename: string,
  stagingRoot: string
): Promise<void> {
  await copyFilesToWindowsClipboard([filename], stagingRoot);
}

export function copyFilesToWindowsClipboard(
  filenames: string[],
  stagingRoot: string
): Promise<void> {
  // Staging, the native write and pruning form one transaction. Otherwise two
  // overlapping requests can delete the files currently in the clipboard.
  const requested = [...filenames];
  const operation = clipboardWrite.then(() => writeFilesToWindowsClipboard(requested, stagingRoot));
  clipboardWrite = operation.catch(() => undefined);
  return operation;
}

async function writeFilesToWindowsClipboard(
  filenames: string[],
  stagingRoot: string
): Promise<void> {
  if (!filenames.length) throw new Error("No files to copy.");
  const { stagedFilenames, stagingDirectory } =
    await stageFilesForWindowsClipboard(filenames, stagingRoot);
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.Windows.Forms",
    "$files = [string[]]@($env:AIVIDEO_CLIPBOARD_FILES_JSON | ConvertFrom-Json)",
    "$list = New-Object System.Collections.Specialized.StringCollection",
    "$list.AddRange($files)",
    "$data = New-Object System.Windows.Forms.DataObject",
    "$data.SetFileDropList($list)",
    // Set-Clipboard -LiteralPath does not set Preferred DropEffect on Windows
    // PowerShell 5.1. Without COPY (DWORD 1), the Shell chooses the operation.
    "$effect = New-Object System.IO.MemoryStream",
    "$effect.Write([BitConverter]::GetBytes([uint32]1), 0, 4)",
    "$effect.Position = 0",
    "$data.SetData('Preferred DropEffect', $effect)",
    // copy=true flushes OLE data so the file list survives this helper's exit.
    "for ($attempt = 1; $attempt -le 8; $attempt++) { try { [System.Windows.Forms.Clipboard]::SetDataObject($data, $true); $read = [System.Windows.Forms.Clipboard]::GetDataObject(); $copied = [string[]]@($read.GetData('FileDrop', $false)); $copyEffect = $read.GetData('Preferred DropEffect', $false); if ($copied.Count -ne $files.Count -or @(Compare-Object $files $copied).Count -ne 0 -or $copyEffect -isnot [System.IO.MemoryStream] -or $copyEffect.Length -ne 4 -or [BitConverter]::ToUInt32($copyEffect.ToArray(), 0) -ne 1) { throw 'Clipboard copy data did not persist' }; break } catch { if ($attempt -eq 8) { throw }; Start-Sleep -Milliseconds 120 } }"
  ].join("; ");

  try {
    await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-STA", "-Command", script],
      {
        encoding: "utf8",
        timeout: 10_000,
        windowsHide: true,
        env: { ...process.env, AIVIDEO_CLIPBOARD_FILES_JSON: JSON.stringify(stagedFilenames) }
      }
    );
  } catch (error) {
    await fs.rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }

  const entries = await fs.readdir(stagingRoot, { withFileTypes: true }).catch(() => []);
  // Explorer may already be using the previous data object when another copy
  // arrives. Keep recent staging files alive instead of invalidating that paste.
  const expiresBefore = Date.now() - clipboardStagingRetentionMs;
  await Promise.all(entries
    .filter((entry) => entry.isDirectory() && entry.name !== path.basename(stagingDirectory))
    .map(async (entry) => {
      const directory = path.join(stagingRoot, entry.name);
      const stat = await fs.stat(directory).catch(() => null);
      if (!stat || stat.mtimeMs >= expiresBefore) return;
      await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }));
}
