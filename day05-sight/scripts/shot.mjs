// ページを開き、仕切りの動きが終わってからスクリーンショットを撮る（確認用・投稿画像用）。
// 使い方: node scripts/shot.mjs [URL] [出力先ディレクトリ] [幅x高さ]
// 4つの城をそれぞれ撮り、output/ に保存する
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:5173/";
const dir = process.argv[3] ?? "output";
const [w, h] = (process.argv[4] ?? "1600x900").split("x").map(Number);
const castles = (process.env.CASTLES ?? "karasawayama,konosumiyama,arikoyama,kagomori").split(",");
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
page.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
for (const id of castles) {
  const sep = url.includes("?") ? "&" : "?";
  await page.goto(`${url}${sep}castle=${id}`);
  await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 120000 });
  // タイルを読み切るまで待つ
  await page.waitForFunction(() => window.__day05.cs.areTilesLoaded() && window.__day05.photo.areTilesLoaded(), null, { timeout: 60000 });
  await page.waitForTimeout(800);
  const out = `${dir}/day05-${id}-${w}x${h}.png`;
  await page.screenshot({ path: out });
  console.log(out);
}
await browser.close();
