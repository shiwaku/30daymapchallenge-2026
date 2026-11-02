// ポスター用に、4つの城それぞれで「航空写真だけ」「CS立体図だけ」の画面を撮る。
// 使い方: node scripts/poster-capture.mjs [URL]  → output/poster/<城>-photo.png / <城>-cs.png
// 組み立ては python -I -X utf8 scripts/poster.py
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:5173/";
const castles = ["karasawayama", "konosumiyama", "arikoyama", "kagomori"];
mkdirSync("output/poster", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
for (const id of castles) {
  // split=1 は仕切りが右端（すべて航空写真）、split=0 は左端（すべて CS立体図）
  for (const [name, split] of [["photo", 1], ["cs", 0]]) {
    await page.goto(`${url}?castle=${id}&bare&split=${split}`);
    await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 120000 });
    await page.waitForFunction(() => window.__day05.cs.areTilesLoaded() && window.__day05.photo.areTilesLoaded(), null, { timeout: 60000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `output/poster/${id}-${name}.png` });
  }
  console.log(id);
}
await browser.close();
