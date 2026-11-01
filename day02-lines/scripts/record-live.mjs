// 開発サーバー（npm run dev）のページを ?record で開き、3つの段階を順に出して画面録画し、mp4 にする（コマ撮りしない）。
// 使い方: node scripts/record-live.mjs [URL]
// 読み込み中は切り落とし、段階1から段階3を見せ終えるまでを録る
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:5173/?record";
const dir = "output/live";
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

// 段階ごとに見せる秒数。段階2は線の太さが2.5秒かけて変わるので長めにする
const HOLD = { 1: 6, 2: 8, 3: 8 };

const size = { width: 1822, height: 936 };
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });
const context = await browser.newContext({ viewport: size, recordVideo: { dir, size } });
const page = await context.newPage();
// 動画はページを作った時から始まるので、時刻もここから測る
const t0 = Date.now();
await page.goto(url);
await page.waitForFunction(() => typeof window.__show === "function", null, { timeout: 180000 });
// 線と駅名が描き終わるのを待つ
await page.waitForTimeout(3000);
const start = (Date.now() - t0) / 1000;
for (const s of [1, 2, 3]) {
  await page.evaluate((v) => window.__show(v), s);
  await page.waitForTimeout(HOLD[s] * 1000);
}
const end = (Date.now() - t0) / 1000;
await context.close();
await browser.close();

mkdirSync("output", { recursive: true });
const webm = `${dir}/${readdirSync(dir).find((f) => f.endsWith(".webm"))}`;
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(start), "-to", String(end), "-i", webm, "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "output/day02-lines.mp4"], { stdio: "inherit" });
console.log(`output/day02-lines.mp4 (${(end - start).toFixed(1)}秒)`);
