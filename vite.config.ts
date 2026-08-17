import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
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
