import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
