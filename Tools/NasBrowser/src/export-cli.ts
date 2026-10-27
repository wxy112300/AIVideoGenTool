import { promises as fs } from "node:fs";
import { setTimeout } from "node:timers/promises";
import { exportLibrary, type ExportConfig } from "./exporter.js";

const args = process.argv.slice(2);
const configIndex = args.indexOf("--config");
if (configIndex < 0 || !args[configIndex + 1] || args.some((arg, i) => arg !== "--config" && arg !== "--watch" && i !== configIndex + 1)) {
  console.error("Usage: node export.mjs --config export.config.json [--watch]"); process.exitCode = 1;
} else {
  try {
    const config = JSON.parse(await fs.readFile(args[configIndex + 1]!, "utf8")) as ExportConfig;
    const seconds = config.intervalSeconds ?? 30;
    if (!Number.isFinite(seconds) || seconds < 2 || seconds > 86400) throw new Error("intervalSeconds must be between 2 and 86400");
    const controller = new AbortController();
    for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => controller.abort());
    do {
      try { console.log(JSON.stringify(await exportLibrary(config))); }
      catch (error) { if (!args.includes("--watch")) throw error; console.error((error as Error).message); }
      if (!args.includes("--watch") || controller.signal.aborted) break;
      await setTimeout(seconds * 1000, undefined, { signal: controller.signal }).catch(() => {});
    } while (!controller.signal.aborted);
  } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}
