// 動画用のページ（promo.html）をそのまま画面録画して mp4 にする（コマ撮りしない）。
// 使い方: node scripts/planets/record.mjs [URL] [出力] [幅x高さ] [--shots]
// --shots のときは録画せず、tour-start からの決まった秒数で静止画を撮る（録る前の確認）
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";

const pw = await import(pathToFileURL("../day06-vintage/node_modules/playwright-core/index.mjs").href);
const { chromium } = pw.default ?? pw;
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const shots = process.argv.includes("--shots");
const url = args[0] ?? "http://localhost:8809/promo.html";
const out = args[1] ?? "output/planets/day08-planets.mp4";
const [w, h] = (args[2] ?? "1600x900").split("x").map(Number);
const dir = "output/planets/live";
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const size = { width: w, height: h };
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });
const context = await browser.newContext(shots ? { viewport: size } : { viewport: size, recordVideo: { dir, size } });
const page = await context.newPage();
const t0 = Date.now();
await page.goto(url);
await page.waitForFunction(() => document.body.classList.contains("tour-start"), null, { timeout: 180000, polling: 20 });
const start = (Date.now() - t0) / 1000;
if (shots) {
  const ts = [3, 8, 13, 17, 22, 27, 31, 37, 43, 48];
  for (const t of ts) {
    const wait = start * 1000 + t * 1000 - (Date.now() - t0);
    if (wait > 0) await page.waitForTimeout(wait);
    await page.screenshot({ path: `${dir}/shot_${String(t).padStart(2, "0")}.png` });
    console.log("shot", t);
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
