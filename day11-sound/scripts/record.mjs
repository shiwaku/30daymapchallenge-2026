// 録画用ツアー（?shot&tour）を画面そのまま録画し、再生した時刻の記録（tlog.json）も保存する（コマ撮りしない）。
// 音は scripts/sound.py が tlog.json から作り、映像に重ねる。
// 使い方: node scripts/record.mjs [URL] [--shots]   （先に npm run dev か npm run preview で開いておく）
// --shots のときは録画せず、tour-start からの決まった秒数で静止画を撮る（録る前の確認）
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const shots = process.argv.includes("--shots");
const url = (args[0] ?? "http://localhost:5173/") + "?shot&tour";
const size = { width: 1920, height: 1080 };
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
  const ts = (process.env.SHOTS ?? "3,9,14,20,26,32").split(",").map(Number);
  for (const s of ts) {
    const w = start * 1000 + s * 1000 - (Date.now() - t0);
    if (w > 0) await page.waitForTimeout(w);
    await page.screenshot({ path: `${dir}/shot_${String(s).padStart(2, "0")}.png` });
    console.log("shot", s);
  }
}
await page.waitForFunction(() => document.body.classList.contains("tour-done"), null, { timeout: 300000, polling: 20 });
const tlog = await page.evaluate(() => window.__tlog);
const end = (Date.now() - t0) / 1000;
await context.close();
await browser.close();
writeFileSync(`${dir}/tlog.json`, JSON.stringify(tlog));
console.log("tour", (end - start).toFixed(1), "s", "tlog", tlog.length);
if (!shots) {
  const webm = `${dir}/${readdirSync(dir).find((f) => f.endsWith(".webm"))}`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(start), "-to", String(end), "-i", webm, "-c:v", "libx264", "-crf", "18",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${dir}/video.mp4`], { stdio: "inherit" });
  console.log(`${dir}/video.mp4`);
}
