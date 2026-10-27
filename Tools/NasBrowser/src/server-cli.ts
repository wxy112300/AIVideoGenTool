import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer, type ServerConfig } from "./server.js";

const index = process.argv.indexOf("--config");
const filename = index >= 0 ? process.argv[index + 1] : process.env.NAS_BROWSER_CONFIG;
try {
  if (!filename) throw new Error("Usage: node server.mjs --config config.json (or NAS_BROWSER_CONFIG)");
  const config = JSON.parse(await fs.readFile(filename, "utf8")) as ServerConfig;
  const host = await startServer(config, path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web"));
  console.log(`NAS browser listening on port ${(host.server.address() as { port: number }).port}`);
  let closing = false;
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => {
    if (closing) return; closing = true;
    void host.close().catch((error) => { console.error((error as Error).message); process.exitCode = 1; });
  });
} catch (error) { console.error((error as Error).message); process.exitCode = 1; }
