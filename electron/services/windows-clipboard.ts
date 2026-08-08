import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Put a real file-drop list on the Windows clipboard so Explorer can paste it.
 * Electron's FileNameW custom buffer is not equivalent to the native CF_HDROP
 * format and can report success even though Explorer has nothing to paste.
 */
export async function copyFileToWindowsClipboard(filename: string): Promise<void> {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.Windows.Forms",
    "$files = New-Object System.Collections.Specialized.StringCollection",
    "[void]$files.Add($env:AIVIDEO_CLIPBOARD_FILE)",
    "$data = New-Object System.Windows.Forms.DataObject",
    "$data.SetFileDropList($files)",
    // DROPEFFECT_COPY tells Explorer this is a copy operation, not a cut/move.
    "$data.SetData('Preferred DropEffect', [byte[]](1, 0, 0, 0))",
    "[System.Windows.Forms.Clipboard]::SetDataObject($data, $true)"
  ].join("; ");

  await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-STA", "-Command", script],
    {
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true,
      env: { ...process.env, AIVIDEO_CLIPBOARD_FILE: filename }
    }
  );
}
