import { defineConfig } from "vite";

// GitHub Pages では /day01-points/site/ に置く。データは day01-points/data を ../data で読む
export default defineConfig({
  base: "./",
  publicDir: false,
  build: { outDir: "site", emptyOutDir: true },
});
