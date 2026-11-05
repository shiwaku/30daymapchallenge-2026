import { defineConfig } from "vite";

// GitHub Pages では /day05-sight/site/ に置く。
// index.html = 地上から見えない新宿駅（タイルは web/tiles の MLT をそのまま配信）
// castle.html = 森の下の山城（CS立体図は配信元から直接読む）
export default defineConfig({
  base: "./",
  publicDir: "web",
  build: {
    outDir: "site",
    emptyOutDir: true,
    rollupOptions: { input: { index: "index.html", castle: "castle.html" } },
  },
});
