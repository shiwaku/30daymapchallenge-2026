// 公開ページ（ふだんの表示）をそのまま画面録画して mp4 にする（コマ撮りしない）。
// 使い方: node scripts/record-live.mjs [URL]
// ページは読み込み後に6秒ごとに段階1→2→3と自動で進むので、段階1が出てから段階3を見せ終えるまでを録る
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";

const url = process.argv[2] ?? "https://shiwaku.github.io/30daymapchallenge-2026/day02-lines/site/";
const dir = "output/live";
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

// 段階3を見せる秒数（段階1・2はページの自動送りの6秒ずつ）
const LAST_HOLD = 8;

const size = { width: 1822, height: 936 };
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });
const context = await browser.newContext({ viewport: size, recordVideo: { dir, size } });
const page = await context.newPage();
// 動画はページを作った時から始まるので、時刻もここから測る
const t0 = Date.now();
await page.goto(url);
const onStep = (s, timeout = 180000) =>
  page.waitForFunction((v) => document.querySelector("#steps button.on")?.dataset.step === v, String(s), { timeout, polling: 20 });
await onStep(1);
const start = (Date.now() - t0) / 1000;
await onStep(3, 30000);
await page.waitForTimeout(LAST_HOLD * 1000);
const end = (Date.now() - t0) / 1000;
await context.close();
await browser.close();

const webm = `${dir}/${readdirSync(dir).find((f) => f.endsWith(".webm"))}`;
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(start), "-to", String(end), "-i", webm, "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "output/day02-lines.mp4"], { stdio: "inherit" });
console.log(`output/day02-lines.mp4 (${(end - start).toFixed(1)}秒)`);
