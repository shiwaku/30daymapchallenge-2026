// ビューワのスクリーンショットを撮る（確認用と、投稿用のポスター画像）。
// 使い方: node scripts/shot.mjs [URL]   （先に npm run dev か npm run preview で開いておく）
// output/step0.png・step1.png（段階ごと）と output/day12-power.png（ポスター、段階2）を書き出す
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:5173/";
mkdirSync("output", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });

async function shot(query, file, size) {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 2 });
  page.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
  await page.goto(`${url}?${query}`);
  await page.waitForSelector("body.ready", { timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: file });
  await page.close();
  console.log(file);
}

for (const s of [0, 1, 2]) await shot(`step=${s}`, `output/step${s}.png`, { width: 1600, height: 1000 });
await shot("poster&step=1", "output/day12-power.png", { width: 1600, height: 1000 });
// GIF 用（投稿表示で3段階）。scripts/gif.sh で output/day12-power.gif にする
for (const s of [0, 1, 2]) await shot(`poster&step=${s}`, `output/story${s}.png`, { width: 1600, height: 1000 });
await shot("step=1", "output/mobile.png", { width: 390, height: 844 });
await browser.close();
