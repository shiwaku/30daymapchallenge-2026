// ページ（?play）をそのまま画面録画して mp4 にする（コマ撮りしない）。
// 使い方: node scripts/record.mjs [URL] [出力] [幅x高さ]
// 写真のタイルを読み切って ready が付いてから、アニメーションが終わって done が付くまでを録る
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:4174/?area=pilot&play";
const out = process.argv[3] ?? "output/day06-shutoko.mp4";
const [w, h] = (process.argv[4] ?? "1280x720").split("x").map(Number);
const dir = "output/live";
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const size = { width: w, height: h };
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });
const context = await browser.newContext({ viewport: size, recordVideo: { dir, size } });
const page = await context.newPage();
const t0 = Date.now();
await page.goto(url);
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 120000, polling: 20 });
const start = (Date.now() - t0) / 1000;
await page.waitForFunction(() => document.body.classList.contains("done"), null, { timeout: 120000, polling: 20 });
const end = (Date.now() - t0) / 1000;
await context.close();
await browser.close();

const webm = `${dir}/${readdirSync(dir).find((f) => f.endsWith(".webm"))}`;
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(start), "-to", String(end), "-i", webm, "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: "inherit" });
console.log(`${out} (${(end - start).toFixed(1)}秒)`);
