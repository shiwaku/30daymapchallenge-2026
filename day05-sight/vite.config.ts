import { defineConfig } from "vite";

// GitHub Pages では /day05-sight/site/ に置く。
// タイルは web/tiles の MLT をそのまま配信する
export default defineConfig({
  base: "./",
  publicDir: "web",
  build: {
    outDir: "site",
    emptyOutDir: true,
  },
});
