import { defineConfig } from "vite";

// GitHub Pages では /day17-light-dark/site/ に置く。送電線のデータは day17-light-dark/web を ../web で読む。
// 背景の地図（国土地理院最適化ベクトルタイル）は配信元の PMTiles を直接読む
export default defineConfig({
  base: "./",
  publicDir: false,
  build: { outDir: "site", emptyOutDir: true },
});
