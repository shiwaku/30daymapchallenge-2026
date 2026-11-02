import { defineConfig } from "vite";

// GitHub Pages では /day04-clusters/site/ に置く。データは day04-clusters/data-web を ../data-web で読む
export default defineConfig({
  base: "./",
  publicDir: false,
  build: { outDir: "site", emptyOutDir: true },
});
