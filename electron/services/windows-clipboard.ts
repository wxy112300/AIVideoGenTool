import { execFile } from "node:child_process";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
  const stagingDirectory = path.join(stagingRoot, crypto.randomUUID());
  const stagedFilename = path.join(stagingDirectory, path.basename(filename));
  await fs.mkdir(stagingDirectory, { recursive: true });
  try {
    // A hard link is instant and protects the original even if Explorer
    // mistakenly consumes the clipboard entry as a same-volume move.
    await fs.link(filename, stagedFilename).catch(async () => {
      await fs.copyFile(filename, stagedFilename);
    });
  } catch (error) {
    await fs.rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
  return { stagedFilename, stagingDirectory };
}

export async function copyFileToWindowsClipboard(
  filename: string,
  stagingRoot: string
): Promise<void> {
  const { stagedFilename, stagingDirectory } =
    await stageFileForWindowsClipboard(filename, stagingRoot);
  const script = [
    "$ErrorActionPreference = 'Stop'",
    // Let the Windows-owned cmdlet create CF_HDROP and Preferred DropEffect.
    // Hand-building a DataObject can make same-volume Explorer paste behave
    // like a move, removing the source video from ComfyUI's output directory.
    "for ($attempt = 1; $attempt -le 5; $attempt++) { try { Set-Clipboard -LiteralPath $env:AIVIDEO_CLIPBOARD_FILE; break } catch { if ($attempt -eq 5) { throw }; Start-Sleep -Milliseconds 120 } }"
  ].join("; ");

  try {
    await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-STA", "-Command", script],
      {
        encoding: "utf8",
        timeout: 10_000,
        windowsHide: true,
        env: { ...process.env, AIVIDEO_CLIPBOARD_FILE: stagedFilename }
      }
    );
  } catch (error) {
    await fs.rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }

  const entries = await fs.readdir(stagingRoot, { withFileTypes: true }).catch(() => []);
  await Promise.all(entries
    .filter((entry) => entry.isDirectory() && entry.name !== path.basename(stagingDirectory))
    .map((entry) => fs.rm(path.join(stagingRoot, entry.name), {
      recursive: true,
      force: true
    }).catch(() => undefined)));
}
