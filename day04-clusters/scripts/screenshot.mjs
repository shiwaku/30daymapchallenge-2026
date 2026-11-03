// ページを開いて、全国と拡大した場所の静止画を output/ に保存する。
// 使い方: リポジトリの直下で python -m http.server 4174 を動かしてから node scripts/screenshot.mjs [URL]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:4174/day04-clusters/site/";
mkdirSync("output", { recursive: true });
const size = { width: 1600, height: 1000 };
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });
const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1.5 });
page.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
await page.goto(`${url}?record`);
await page.waitForFunction(() => "__ready" in window, null, { timeout: 120000 });
const idle = () => page.evaluate(() => new Promise((r) => setTimeout(r, 2500)));
await idle();
await page.screenshot({ path: "output/day04-clusters.png" });
console.log("output/day04-clusters.png");
// 拡大した場所（関東、北海道、中国地方）
for (const [name, hash] of [["kanto", "9/35.75/139.7"], ["hokkaido", "6.6/43.4/142.6"], ["kansai", "8/34.75/135.4"]]) {
  await page.goto(`${url}?record#${hash}`);
  await page.waitForFunction(() => "__ready" in window, null, { timeout: 120000 });
  await idle();
  await page.screenshot({ path: `output/day04-clusters-${name}.png` });
  console.log(`output/day04-clusters-${name}.png`);
}
await browser.close();
