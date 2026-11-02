import { defineConfig } from "vite";

// GitHub Pages では /day05-sight/site/ に置く。タイルはすべて配信元から直接読むので、データのコピーは置かない
export default defineConfig({
  base: "./",
  publicDir: false,
  build: { outDir: "site", emptyOutDir: true },
});
