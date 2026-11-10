import { defineConfig } from "vite";

// GitHub Pages では /day11-sound/site/ に置く。データは day11-sound/web を ../web で読む
export default defineConfig({
  base: "./",
  publicDir: false,
  build: { outDir: "site", emptyOutDir: true, chunkSizeWarningLimit: 3000 },
});
