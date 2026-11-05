import { defineConfig } from "vite";

// GitHub Pages では /day06-vintage/site/ に置く。web/ の中身（データ・画像）はそのまま配信する
export default defineConfig({
  base: "./",
  publicDir: "web",
  build: {
    outDir: "site",
    emptyOutDir: true,
  },
});
