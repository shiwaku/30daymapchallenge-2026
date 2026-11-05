// 地上から見えない新宿駅のページを開き、タイルを読み切ってからスクリーンショットを撮る（確認用・投稿画像用）。
// 使い方: node scripts/underground/shot.mjs [URL] [出力ファイル] [幅x高さ]
import { chromium } from "playwright-core";
const url = process.argv[2] ?? "http://localhost:4173/";
const out = process.argv[3] ?? "output/underground.png";
const [w, h] = (process.argv[4] ?? "1600x900").split("x").map(Number);
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
page.on("console", (m) => ["error", "warning"].includes(m.type()) && console.log("console:", m.text(), JSON.stringify(m.location())));
page.on("requestfailed", (r) => console.log("failed:", r.url()));
page.on("response", (r) => r.status() >= 400 && console.log("http", r.status(), r.url()));
page.on("pageerror", (e) => console.log("pageerror:", e.message));
await page.goto(url);
await page.waitForTimeout(6000);
await page.screenshot({ path: out });
console.log(out);
await browser.close();
