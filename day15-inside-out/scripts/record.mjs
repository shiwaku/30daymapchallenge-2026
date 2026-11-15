// 回る地球（site/index.html?spin=）を画面そのまま録画して mp4 にする（コマ撮りしない）。
// 使い方: python -m http.server 8715 --bind 127.0.0.1 を開いておき、node scripts/record.mjs [--shots]
// --shots のときは録画せず、回り始めてから決まった秒数で静止画を撮る（録る前の確認）
// --tour のときは ?tour（海溝と山を順に回る）を録り、output/day15-inside-out-tour.mp4 にする
// playwright-core は Day 14 の node_modules のものを使う
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { chromium } from "../../day14-borgesian/node_modules/playwright-core/index.mjs";

const shots = process.argv.includes("--shots");
const tour = process.argv.includes("--tour");
const SPIN = 12; // 度/秒。30秒で1周
const SECONDS = 360 / SPIN;
const url = tour
  ? "http://127.0.0.1:8715/site/index.html?maxzoom=7&tour&lon=160&lat=15&zoom=2.6&rec"
  : `http://127.0.0.1:8715/site/index.html?maxzoom=7&spin=${SPIN}&lon=140&lat=20&zoom=${process.env.ZOOM ?? 2.6}&rec`;
const out = tour ? "output/day15-inside-out-tour.mp4" : "output/day15-inside-out.mp4";
const size = { width: 1080, height: 1080 };
const dir = `output/live/${shots ? "shots" : "rec"}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });
const context = await browser.newContext(shots ? { viewport: size } : { viewport: size, recordVideo: { dir, size } });
const page = await context.newPage();
page.on("pageerror", (e) => console.log("pageerror:", e.message));
const t0 = Date.now();
await page.goto(url);
let start, end;
if (tour) {
  await page.waitForFunction(() => document.body.classList.contains("tour-start"), null, { timeout: 120000, polling: 20 });
  start = (Date.now() - t0) / 1000;
  const SH = (process.env.SHOTS ?? "1,9,18,28,38").split(",").map(Number);
  if (shots) {
    for (const s of SH) {
      const w = start * 1000 + s * 1000 - (Date.now() - t0);
      if (w > 0) await page.waitForTimeout(w);
      await page.screenshot({ path: `${dir}/shot_${String(s).padStart(2, "0")}.png` });
    }
  }
  await page.waitForFunction(() => document.body.classList.contains("tour-done"), null, { timeout: 300000, polling: 20 });
  end = (Date.now() - t0) / 1000;
  console.log("tour", (end - start).toFixed(1), "s");
} else {
  // 最初の idle で回り始める
  await page.waitForFunction(() => window.map && window.map.loaded() && window.map.areTilesLoaded(), null, { timeout: 120000, polling: 50 });
  start = (Date.now() - t0) / 1000 + 0.3;
  if (shots) {
    for (const s of [1, 15]) {
      const w = start * 1000 + s * 1000 - (Date.now() - t0);
      if (w > 0) await page.waitForTimeout(w);
      await page.screenshot({ path: `${dir}/shot_${String(s).padStart(2, "0")}.png` });
    }
  } else {
    await page.waitForTimeout(start * 1000 + SECONDS * 1000 - (Date.now() - t0) + 200);
  }
  end = start + SECONDS;
}
await context.close();
await browser.close();
console.log(dir);
if (!shots) {
  const webm = `${dir}/${readdirSync(dir).find((f) => f.endsWith(".webm"))}`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(start), "-to", String(end), "-i", webm, "-c:v", "libx264", "-crf", "18",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: "inherit" });
  console.log(out);
}
