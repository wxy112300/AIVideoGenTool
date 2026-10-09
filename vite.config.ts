import { defineConfig } from "vite";
import { existsSync } from "node:fs";
import path from "node:path";

export default defineConfig({
  base: "./",
  plugins: [{
    name: "typescript-source-imports",
    enforce: "pre",
    resolveId(source, importer) {
      // NodeNext source imports use .js; prefer the maintained TS sibling over
      // old checked-in generated JS in both the renderer and Vitest.
      if (!importer || !source.startsWith(".") || !source.endsWith(".js")) return;
      const candidate = path.resolve(path.dirname(importer), `${source.slice(0, -3)}.ts`);
      if (existsSync(candidate)) return candidate;
    }
  }],
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts", ".json"]
  },
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
    chunkSizeWarningLimit: 500,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: (moduleId) => {
                const match = moduleId.match(/[\\/]src[\\/]core[\\/]locales[\\/]([^\\/]+)\.ts$/);
                return match ? `locale-${match[1]}` : null;
              },
              test: /[\\/]src[\\/]core[\\/]locales[\\/]/,
              priority: 2
            },
            {
              name: "i18n-runtime",
              test: /[\\/]src[\\/]core[\\/]i18n(?:-keys)?\.ts$/
            },
            {
              // Keep the history surface out of the renderer entry. It is a
              // substantial, low-frequency surface and is only needed after
              // the user opens History.
              name: "history",
              test: /[\\/]src[\\/]renderer[\\/]pages[\\/]history[\\/]/,
              priority: 2,
              entriesAware: true,
              includeDependenciesRecursively: false
            },
            {
              // Create is the main workspace, but its model-specific controls
              // should not enlarge the shell and queue entry point.
              name: "create",
              test: /[\\/]src[\\/]renderer[\\/]pages[\\/]create[\\/]/,
              priority: 2,
              entriesAware: true,
              includeDependenciesRecursively: false
            },
            {
              name: "queue",
              test: /[\\/]src[\\/]renderer[\\/]pages[\\/]queue[\\/]/,
              priority: 2,
              entriesAware: true,
              includeDependenciesRecursively: false
            },
            {
              // Settings is a large, low-frequency surface (environment scans,
              // dependency cards and install controllers). Keep it out of the
              // renderer entry chunk so a small settings change does not push
              // the main bundle over the 500 kB warning threshold.
              name: "settings",
              test: /[\\/]src[\\/]renderer[\\/]pages[\\/]settings[\\/]/,
              priority: 2,
              entriesAware: true,
              // Keep shared catalogs/runtime helpers in their existing groups;
              // only the settings surface belongs in this boundary.
              includeDependenciesRecursively: false
            },
            {
              name: "model-catalog",
              test: /[\\/]src[\\/]core[\\/]catalog[\\/]/,
              priority: 1
            },
            {
              // Keep the shared image layer, registry and each model adapter
              // in their own cache boundary. Adding a model should not grow
              // the renderer entry or invalidate unrelated image adapters.
              name: (moduleId) => {
                const match = moduleId.match(/[\\/]src[\\/]core[\\/]image-workflow[\\/]([^\\/]+)\.(?:ts|js)$/);
                return match ? `image-workflow-${match[1]}` : null;
              },
              test: /[\\/]src[\\/]core[\\/]image-workflow[\\/]/,
              priority: 3,
              entriesAware: true,
              includeDependenciesRecursively: false
            },
            {
              // The video workflow is another large, infrequently changed
              // boundary. It is kept separate from the image workflow so
              // model-specific growth remains isolated.
              name: "video-workflow",
              test: /[\\/]src[\\/]core[\\/]workflow\.ts$/,
              priority: 2,
              entriesAware: true,
              includeDependenciesRecursively: false
            }
          ]
        }
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
