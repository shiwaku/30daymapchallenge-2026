import { defineConfig } from "vite";

// GitHub Pages では /day03-polygons/site/ に置く。データは day03-polygons/data を ../data で読む
export default defineConfig({
  base: "./",
  publicDir: false,
  build: { outDir: "site", emptyOutDir: true },
});
