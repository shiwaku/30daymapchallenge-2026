// ?tour（全国 → 関東 → 多摩 → 全国）を画面そのまま録画して mp4 にする（コマ撮りしない）。
// 使い方: npm run dev を開いておき、node scripts/record.mjs [URL] [--shots]
// --shots のときは録画せず、決まった秒数で静止画を撮る（録る前の確認）
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { chromium } from "playwright-core";

const shots = process.argv.includes("--shots");
const base = process.argv.slice(2).find((a) => a.startsWith("http")) ?? "http://localhost:5173/";
const out = "output/day17-light-dark.mp4";
const size = { width: 1920, height: 1080 };
const dir = `output/live/${shots ? "shots" : "rec"}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });
const context = await browser.newContext(shots ? { viewport: size } : { viewport: size, recordVideo: { dir, size } });
const page = await context.newPage();
page.on("pageerror", (e) => console.log("pageerror:", e.message));
const t0 = Date.now();
await page.goto(`${base}?tour`);
await page.waitForFunction(() => document.body.classList.contains("tour-start"), null, { timeout: 120000, polling: 20 });
const start = (Date.now() - t0) / 1000;
if (shots) {
  for (const s of (process.env.SHOTS ?? "1,7,10,16,19,30").split(",").map(Number)) {
    const w = start * 1000 + s * 1000 - (Date.now() - t0);
    if (w > 0) await page.waitForTimeout(w);
    await page.screenshot({ path: `${dir}/shot_${String(s).padStart(2, "0")}.png` });
  }
}
await page.waitForFunction(() => document.body.classList.contains("tour-done"), null, { timeout: 300000, polling: 20 });
const end = (Date.now() - t0) / 1000;
console.log("tour", (end - start).toFixed(1), "s");
await context.close();
await browser.close();
console.log(dir);
if (!shots) {
  const webm = `${dir}/${readdirSync(dir).find((f) => f.endsWith(".webm"))}`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(start), "-to", String(end), "-i", webm, "-c:v", "libx264", "-crf", "18",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: "inherit" });
  console.log(out);
}
