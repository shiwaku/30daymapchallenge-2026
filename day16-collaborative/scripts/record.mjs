// 導入から雲海までを、ブラウザの画面のまま録画する（コマ撮りではない）。
// 使い方: python -m http.server 8016 を起動してから node scripts/record.mjs → output/day16-collaborative.webm
import { mkdirSync, renameSync } from "node:fs";
const { chromium } = await import("../../day17-light-dark/node_modules/playwright-core/index.mjs");
mkdirSync("output", { recursive: true });
const size = { width: 1280, height: 800 };
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });
const ctx = await browser.newContext({ viewport: size, recordVideo: { dir: "output/rec", size } });
const page = await ctx.newPage();
await page.goto("http://localhost:8016/");
await page.waitForTimeout(34000);   // 導入（約21秒）＋雲が上下するところ
const video = page.video();
await ctx.close();
renameSync(await video.path(), "output/day16-collaborative.webm");
await browser.close();
console.log("output/day16-collaborative.webm");
