// 開発サーバー（npm run dev）のページを ?record で開き、1コマずつ撮って mp4 にする。
// 使い方: node scripts/record.mjs [URL] [ふだんの週の間隔]
// ふだんは早送りし、地震・測地系の切り替え・元期では1週ずつに落として少し止める
// Chrome はインストール済みのものを使う（playwright のブラウザはダウンロードしない）
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:5173/?record";
const step = Number(process.argv[3] ?? 8);
const START = Date.parse("1996-03-21");
const toWeek = (iso) => Math.round((Date.parse(iso) - START) / 86400000 / 7);
// src/main.ts の QUAKES・DATUMS・NOTES と同じ日付
const EVENTS = [
  "1997-01-01", "2002-04-01", "2003-09-26", "2004-10-23", "2008-06-14", "2011-03-11",
  "2011-05-24", "2011-10-31", "2016-04-14", "2018-09-06", "2024-01-01", "2025-04-01",
].map(toWeek);
const SLOW_WEEKS = 12; // 節目から何週ゆっくり進めるか
const HOLD_FRAMES = 18; // 節目で止めるコマ数（0.6秒）
const frames = "output/frames";
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
await page.goto(url);
await page.waitForFunction(() => window.__weeks > 0, null, { timeout: 120000 });
const weeks = await page.evaluate(() => window.__weeks);

let i = 0;
const shot = async (w) => {
  await page.evaluate((k) => window.__render(k), w);
  await page.screenshot({ path: `${frames}/${String(i++).padStart(5, "0")}.png` });
};
for (let w = 0; w < weeks; ) {
  await shot(w);
  if (EVENTS.includes(w)) for (let k = 0; k < HOLD_FRAMES; k++) await shot(w);
  const slow = EVENTS.some((e) => w >= e && w < e + SLOW_WEEKS);
  const next = w + (slow ? 1 : step);
  // 早送り中に節目を飛び越さない
  const hit = EVENTS.find((e) => e > w && e < next);
  w = hit ?? next;
  if (i % 100 === 0) console.log(`${w}/${weeks}`);
}
// 最後の週で2秒止める
for (let k = 0; k < 60; k++) await shot(weeks - 1);
await browser.close();

execFileSync("ffmpeg", ["-y", "-framerate", "30", "-i", `${frames}/%05d.png`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", "output/day01-points.mp4"], { stdio: "inherit" });
console.log("output/day01-points.mp4");
