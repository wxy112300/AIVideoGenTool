import { build } from "vite";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../..");
await build({ configFile: path.join(root, "vite.web.config.ts"), root: path.join(root, "src/web"),
  build: { outDir: path.join(directory, "dist/web"), emptyOutDir: true } });
await build({ configFile: false, root, publicDir: false,
  plugins: [{ name: "maintained-typescript-sources", enforce: "pre", resolveId(source, importer) {
    if (!importer || !source.startsWith(".") || !source.endsWith(".js")) return;
    const candidate = path.resolve(path.dirname(importer), `${source.slice(0, -3)}.ts`);
    if (existsSync(candidate)) return candidate;
  } }],
  resolve: { extensions: [".ts", ".js", ".mjs", ".json"] },
  build: { ssr: true, target: "node22", outDir: path.join(directory, "dist/runtime"), emptyOutDir: true,
    rolldownOptions: { input: { server: path.join(directory, "src/server-cli.ts"), export: path.join(directory, "src/export-cli.ts") },
      output: { entryFileNames: "[name].mjs", chunkFileNames: "chunks/[name]-[hash].mjs" } } } });

const html = readFileSync(path.join(directory, "dist/web/index.html"), "utf8");
const webEntry = /src="\.\/(assets\/[^"\s]+\.js)"/.exec(html)?.[1];
if (!webEntry) throw new Error("Built web entry is missing");
writeFileSync(path.join(directory, "dist/deployment.json"), JSON.stringify({
  version: JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version,
  builtAt: new Date().toISOString(), webEntry
}, null, 2) + "\n");
