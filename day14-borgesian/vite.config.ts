import { defineConfig } from "vite";

// GitHub Pages では /day14-borgesian/site/ に置く。小さいデータは day14-borgesian/data-web を ../data-web で読む
export default defineConfig({
  base: "./",
  publicDir: false,
  build: { outDir: "site", emptyOutDir: true },
});
