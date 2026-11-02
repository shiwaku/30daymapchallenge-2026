import { defineConfig } from "vite";

// GitHub Pages では /day08-utopia/site/ に置く。データは day08-utopia/web を ../web で読む
export default defineConfig({
  base: "./",
  publicDir: false,
  build: { outDir: "site", emptyOutDir: true },
});
