// ビューワのスクリーンショットを撮る（確認用と投稿用）。
// 使い方: node scripts/shot.mjs [URL]   （先に npm run dev か npm run preview で開いておく）
// output/day17-light-dark.png（全国、1600x1000）、output/day17-zoom-*.png（拡大）、output/mobile.png（スマートフォン幅）
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:5173/";
mkdirSync("output", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });

async function shot(query, hash, file, size, scale = 2) {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: scale });
  page.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
  await page.goto(`${url}?${query}${hash}`);
  await page.waitForSelector("body.ready", { timeout: 120000 });
  await page.waitForFunction(() => window.__day17.areTilesLoaded(), null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: file });
  await page.close();
  console.log(file);
}

await shot("poster", "", "output/day17-light-dark.png", { width: 1600, height: 1000 });
await shot("", "#8.2/35.62/139.6", "output/day17-zoom-kanto.png", { width: 1600, height: 1000 });
await shot("", "#12.5/35.795/139.33", "output/day17-zoom-tama.png", { width: 1600, height: 1000 });
await shot("", "", "output/mobile.png", { width: 390, height: 844 });
await browser.close();
