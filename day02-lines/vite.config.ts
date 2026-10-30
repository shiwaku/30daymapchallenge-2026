import { defineConfig } from "vite";

// GitHub Pages では /day02-lines/site/ に置く。データは day02-lines/data を ../data で読む
export default defineConfig({
  base: "./",
  publicDir: false,
  build: { outDir: "site", emptyOutDir: true },
});
