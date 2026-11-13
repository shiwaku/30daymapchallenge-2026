// 4都市（東京23区・横浜市・さいたま市・千葉市）の区どうしの流れを並べた画像を撮る。
// 使い方: node scripts/poster.mjs [poster.html|poster-wards.html] [出力]   （先に npm run dev で開いておく）
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("pageerror:", e.message));
const src = process.argv[2] ?? "poster.html";
const out = process.argv[3] ?? "output/day13-4cities.png";
await page.goto(`http://localhost:5173/${src}`);
await page.waitForSelector("body.ready", { timeout: 180000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(out);
