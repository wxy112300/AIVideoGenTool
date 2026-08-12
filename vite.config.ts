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
