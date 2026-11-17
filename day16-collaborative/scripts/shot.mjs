// 確認・投稿用のスクリーンショット。使い方: node scripts/shot.mjs [URL]
// 先に day16-collaborative で `python -m http.server 8016` を起動しておく。playwright-core は day17 のものを使う
import { mkdirSync } from "node:fs";
const { chromium } = await import("../../day17-light-dark/node_modules/playwright-core/index.mjs");
const url = process.argv[2] ?? "http://localhost:8016/";
mkdirSync("output", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });
async function shot(level, file, size = { width: 1600, height: 1000 }, query = "poster") {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 2 });
  page.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  await page.goto(`${url}?${query}&cloud=${level}`);
  await page.waitForSelector("body.ready", { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: file });
  await page.close();
  console.log(file);
}
await shot(0, "output/overview.png", undefined, "scene=overview");
for (const lv of (process.argv[3] ?? "345,300,250").split(",")) await shot(lv, `output/cloud-${lv}.png`);
await browser.close();
