import { defineConfig } from "vite";

// GitHub Pages では /day10-prompting-only/site/ に置く。データは day10-prompting-only/web を ../web で読む
export default defineConfig({
  base: "./",
  publicDir: false,
  build: { outDir: "site", emptyOutDir: true, chunkSizeWarningLimit: 3000 },
});
