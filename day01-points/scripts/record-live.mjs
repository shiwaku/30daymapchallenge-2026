// 開発サーバー（npm run dev）のページを、ふだんの再生のまま画面録画して mp4 にする（コマ撮りしない）。
// 使い方: node scripts/record-live.mjs [URL]
// 最初の週から最後の週で止まるまでを録り、読み込み中と、最初に戻ったあとは切り落とす
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:5173/";
const dir = "output/live";
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const size = { width: 1822, height: 936 };
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });
const context = await browser.newContext({ viewport: size, recordVideo: { dir, size } });
const page = await context.newPage();
// 動画はページを作った時から始まるので、時刻もここから測る
const t0 = Date.now();
await page.goto(url);
// 速度は 1年/秒。ボタンはデータを読み込んでから動くので、日付が出てから押す
await page.waitForFunction(() => /^\d{4}年/.test(document.querySelector("#date")?.textContent ?? ""), null, { timeout: 180000 });
await page.click('#speed button[data-weeks="52"]');
await page.waitForFunction(() => document.querySelector('#speed button[data-weeks="52"]')?.classList.contains("on"));
// 1周目は読み込み中に進むので捨て、最初に戻った2周目の頭から、最後の週で止まり終えるまでを録る
const at = (y, timeout = 180000) =>
  page.waitForFunction((v) => document.querySelector("#date")?.textContent?.startsWith(v), y, { timeout, polling: 20 });
await at("2026");
await at("1996");
const start = (Date.now() - t0) / 1000;
await at("2026");
await at("1996", 30000);
const end = (Date.now() - t0) / 1000 - 0.15;
await context.close();
await browser.close();

const webm = `${dir}/${readdirSync(dir).find((f) => f.endsWith(".webm"))}`;
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(start), "-to", String(end), "-i", webm, "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "output/day01-points.mp4"], { stdio: "inherit" });
console.log(`output/day01-points.mp4 (${(end - start).toFixed(1)}秒)`);
