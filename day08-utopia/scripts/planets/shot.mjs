// ビューワ（index.html）の静止画を撮る。使い方: node scripts/planets/shot.mjs [URL] [出力png] [幅x高さ]
import { pathToFileURL } from "node:url";
const pw = await import(pathToFileURL("../day06-vintage/node_modules/playwright-core/index.mjs").href);
const { chromium } = pw.default ?? pw;
const url = process.argv[2] ?? "http://localhost:8809/";
const out = process.argv[3] ?? "output/planets/viewer.png";
const [w, h] = (process.argv[4] ?? "1600x900").split("x").map(Number);
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
await page.goto(url);
await page.waitForFunction(() => window.maps && Object.values(window.maps).every((m) => m.loaded() && m.areTilesLoaded()), null, { timeout: 120000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: out });
await browser.close();
console.log(out);
