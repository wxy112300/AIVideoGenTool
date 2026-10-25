import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const directory = mkdtempSync(join(tmpdir(), "lvs-theme-contrast-"));
try {
  // Use the installed Chromium engine: regex cannot model cascade layers,
  // color-mix, selector variants, or the standalone browser's palette.
  const result = spawnSync(require("electron"), [
    fileURLToPath(new URL("./check-ux-ui-theme-contrast.cjs", import.meta.url)),
    directory
  ], { stdio: "inherit", timeout: 120000, windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Theme contrast check exited with ${result.status}`);
} finally {
  // Only remove this invocation's exact, freshly created temporary directory.
  if (resolve(directory).startsWith(resolve(tmpdir()) + (process.platform === "win32" ? "\\" : "/"))) {
    rmSync(directory, { recursive: true, force: true });
  }
}
