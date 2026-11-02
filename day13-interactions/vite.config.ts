import { defineConfig } from "vite";

// GitHub Pages では /day13-interactions/site/ に置く。データは day13-interactions/web を ../web で読む
export default defineConfig({
  base: "./",
  publicDir: false,
  build: { outDir: "site", emptyOutDir: true, chunkSizeWarningLimit: 3000 },
});
