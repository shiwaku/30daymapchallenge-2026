// 録画用の自動ツアー（?tour）を、画面そのまま録画して mp4 にする（コマ撮りしない）。
// 使い方: node scripts/record.mjs [URL] [--shots]   （先に npx vite --port 5190 で開いておく）
// --shots のときは録画せず、tour-start からの決まった秒数で静止画を撮る（録る前の確認）
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { chromium } from "playwright-core";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const shots = process.argv.includes("--shots");
const url = (args[0] ?? "http://localhost:5190/") + "?tour";
const out = "output/day14-borgesian.mp4";
const size = { width: 1920, height: 1080 };
// 録画ごとに新しいフォルダを使う（前のフォルダが開かれていても止まらないように）
const dir = `output/live/${shots ? "shots" : "rec"}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
mkdirSync(dir, { recursive: true });
console.log("dir", dir);

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });
const context = await browser.newContext(shots ? { viewport: size } : { viewport: size, recordVideo: { dir, size } });
const page = await context.newPage();
page.on("pageerror", (e) => console.log("pageerror:", e.message));
const t0 = Date.now();
await page.goto(url);
await page.waitForFunction(() => document.body.classList.contains("tour-start"), null, { timeout: 180000, polling: 20 });
const start = (Date.now() - t0) / 1000;
if (shots) {
  const ts = (process.env.SHOTS ?? "1,6,12,20,30,37").split(",").map(Number);
  for (const s of ts) {
    const w = start * 1000 + s * 1000 - (Date.now() - t0);
    if (w > 0) await page.waitForTimeout(w);
    await page.screenshot({ path: `${dir}/shot_${String(s).padStart(2, "0")}.png` });
    console.log("shot", s);
  }
}
await page.waitForFunction(() => document.body.classList.contains("tour-done"), null, { timeout: 180000, polling: 20 });
const end = (Date.now() - t0) / 1000;
await context.close();
await browser.close();
console.log("tour", (end - start).toFixed(1), "s");
if (!shots) {
  const webm = `${dir}/${readdirSync(dir).find((f) => f.endsWith(".webm"))}`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(start), "-to", String(end), "-i", webm, "-c:v", "libx264", "-crf", "18",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: "inherit" });
  console.log(out);
}
