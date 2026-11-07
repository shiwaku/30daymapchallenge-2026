import { defineConfig } from "vite";

// GitHub Pages では /day12-power/site/ に置く。データは day12-power/web を ../web で読む
export default defineConfig({
  base: "./",
  publicDir: false,
  build: { outDir: "site", emptyOutDir: true },
});
