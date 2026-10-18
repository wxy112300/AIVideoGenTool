import { defineConfig } from "vite";
import path from "node:path";
import { existsSync } from "node:fs";

// The browser entry has no preload dependency and is independently runnable/buildable.
export default defineConfig({
  root: path.resolve("src/web"), base: "./",
  plugins: [{ name: "typescript-source-imports", enforce: "pre", resolveId(source, importer) {
    if (!importer || !source.startsWith(".") || !source.endsWith(".js")) return;
    const candidate = path.resolve(path.dirname(importer), `${source.slice(0,-3)}.ts`);
    if (existsSync(candidate)) return candidate;
  } }],
  resolve: { extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts", ".json"] },
  build: { outDir: path.resolve("dist/web"), emptyOutDir: true },
  server: { host: "127.0.0.1", port: 5174, strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:8790", changeOrigin: true,
      configure(proxy) { proxy.on("proxyReq", (request) => {
        // Dev-only same-origin facade; production serves UI and API on the same listener.
        request.setHeader("origin", "http://127.0.0.1:8790");
        request.setHeader("sec-fetch-site", "same-origin");
      }); }
    } }
  }
});
