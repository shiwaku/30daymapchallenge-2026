// ページ（?tour）をそのまま画面録画して mp4 にする（コマ撮りしない）。
// 使い方: node scripts/underground/record-live.mjs [URL]
// 地上だけ → 地下が浮かび上がる → 回る、を tour-start から tour-done まで録る
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";

const url = process.argv[2] ?? "https://shiwaku.github.io/30daymapchallenge-2026/day05-sight/site/?tour";
const dir = "output/live";
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const size = { width: 1600, height: 900 };
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });
const context = await browser.newContext({ viewport: size, recordVideo: { dir, size } });
const page = await context.newPage();
const t0 = Date.now();
await page.goto(url);
await page.waitForFunction(() => document.body.classList.contains("tour-start"), null, { timeout: 120000, polling: 20 });
const start = (Date.now() - t0) / 1000;
await page.waitForFunction(() => document.body.classList.contains("tour-done"), null, { timeout: 60000, polling: 20 });
const end = (Date.now() - t0) / 1000;
await context.close();
await browser.close();

const webm = `${dir}/${readdirSync(dir).find((f) => f.endsWith(".webm"))}`;
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(start), "-to", String(end), "-i", webm, "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "output/day05-underground.mp4"], { stdio: "inherit" });
console.log(`output/day05-underground.mp4 (${(end - start).toFixed(1)}秒)`);
