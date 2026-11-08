import { defineConfig } from "vite";

// GitHub Pages では /day09-urban-rural/site/ に置く。データは day09-urban-rural/data を ../data で読む
export default defineConfig({
  base: "./",
  publicDir: false,
  build: { outDir: "site", emptyOutDir: true },
});
