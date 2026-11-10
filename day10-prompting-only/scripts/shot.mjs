// ビューワのスクリーンショットを撮る（確認用）。
// 使い方: node scripts/shot.mjs [URL]   （先に npm run dev か npm run preview で開いておく）
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:5173/";
mkdirSync("output/web", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });

async function shot(query, file, size) {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
  page.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  await page.goto(`${url}?shot&${query}`);
  await page.waitForSelector("body.ready", { timeout: 120000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: file });
  await page.close();
  console.log(file);
}

const desk = { width: 1920, height: 1080 };
for (const d of ["10-15", "11-14", "11-20", "11-24", "11-30", "12-06", "12-15"]) {
  await shot(`date=${d}`, `output/web/${d}-v9.png`, desk);
}
await shot("date=11-24", "output/web/mobile-v9.png", { width: 390, height: 844 });
await browser.close();
