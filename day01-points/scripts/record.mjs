// 開発サーバー（npm run dev）のページを ?record で開き、1コマずつ撮って mp4 にする。
// 使い方: node scripts/record.mjs [URL] [週の間隔]
// Chrome はインストール済みのものを使う（playwright のブラウザはダウンロードしない）
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:5173/?record";
const step = Number(process.argv[3] ?? 2);
const frames = "output/frames";
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
await page.goto(url);
await page.waitForFunction(() => window.__weeks > 0, null, { timeout: 120000 });
const weeks = await page.evaluate(() => window.__weeks);

let i = 0;
const shot = async (w) => {
  await page.evaluate((k) => window.__render(k), w);
  await page.screenshot({ path: `${frames}/${String(i++).padStart(5, "0")}.png` });
};
for (let w = 0; w < weeks; w += step) {
  await shot(w);
  if (i % 50 === 0) console.log(`${w}/${weeks}`);
}
// 最後の週で3秒止める
for (let k = 0; k < 90; k++) await shot(weeks - 1);
await browser.close();

execFileSync("ffmpeg", ["-y", "-framerate", "30", "-i", `${frames}/%05d.png`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", "output/day01-points.mp4"], { stdio: "inherit" });
console.log("output/day01-points.mp4");
