import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const require = createRequire(import.meta.url);
const electronExecutable = require("electron");
const children = new Set();
let shuttingDown = false;
let electronChild = null;

function start(command, args, env = process.env) {
  const child = spawn(command, args, {
    cwd: projectDirectory,
    env,
    stdio: "inherit",
    windowsHide: true
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

function terminateTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true
    });
  } else {
    child.kill("SIGTERM");
  }
}

function cleanup() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of [...children]) terminateTree(child);
}

function fail(message, code = 1) {
  console.error(`\n[dev] ${message}`);
  cleanup();
  process.exit(code);
}

function waitForPort(port, timeoutMs) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Vite did not listen on port ${port}`));
        } else {
          setTimeout(attempt, 150);
        }
      });
    };
    attempt();
  });
}

function waitForFreshFile(filename, startedAt, timeoutMs) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      try {
        if (fs.statSync(filename).mtimeMs >= startedAt - 1_000) {
          resolve();
          return;
        }
      } catch {
        // TypeScript has not emitted the Electron entry yet.
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error(`TypeScript did not emit ${filename}`));
      } else {
        setTimeout(attempt, 150);
      }
    };
    attempt();
  });
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.once(signal, () => {
    cleanup();
    process.exit(0);
  });
}
process.once("exit", cleanup);

const viteServerPort = Number(process.env.VITE_DEV_SERVER_PORT ?? "5173");
if (!Number.isInteger(viteServerPort) || viteServerPort < 1 || viteServerPort > 65_535) {
  fail("VITE_DEV_SERVER_PORT must be an integer between 1 and 65535.");
}

const startedAt = Date.now();
const vite = start(process.execPath, [
  path.join(projectDirectory, "node_modules", "vite", "bin", "vite.js"),
  "--config",
  path.join(projectDirectory, "vite.config.ts"),
  "--host",
  "127.0.0.1",
  "--port",
  String(viteServerPort),
  "--strictPort"
]);
const typescript = start(process.execPath, [
  path.join(projectDirectory, "node_modules", "typescript", "bin", "tsc"),
  "-p",
  "tsconfig.electron.json",
  "--watch",
  "--preserveWatchOutput"
]);

for (const [name, child] of [["Vite", vite], ["TypeScript", typescript]]) {
  child.once("exit", (code) => {
    if (!shuttingDown && !electronChild) {
      fail(`${name} exited before the application started (code ${code ?? "unknown"}).`);
    }
  });
}

try {
  await Promise.all([
    waitForPort(viteServerPort, 30_000),
    waitForFreshFile(
      path.join(projectDirectory, "dist", "electron", "electron", "main.js"),
      startedAt,
      30_000
    )
  ]);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const electronTestSwitches = [];
if (process.env.C04_REMOTE_DEBUGGING_PORT) {
  electronTestSwitches.push(
    "--no-sandbox",
    "--disable-gpu",
    "--disable-gpu-compositing",
    "--in-process-gpu",
    `--remote-debugging-port=${process.env.C04_REMOTE_DEBUGGING_PORT}`
  );
}
if (process.env.C04_USER_DATA_DIR) {
  electronTestSwitches.push(`--user-data-dir=${process.env.C04_USER_DATA_DIR}`);
}

electronChild = start(
  electronExecutable,
  [...electronTestSwitches, "."],
  {
    ...process.env,
    VITE_DEV_SERVER_URL: `http://127.0.0.1:${viteServerPort}`
  }
);
electronChild.once("exit", (code) => {
  const exitCode = code ?? 1;
  cleanup();
  process.exit(exitCode);
});
