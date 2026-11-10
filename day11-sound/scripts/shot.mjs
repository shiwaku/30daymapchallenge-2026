// ビューワのスクリーンショットを撮る（確認用）。
// 使い方: node scripts/shot.mjs [URL] [接尾辞]   （先に npm run dev か npm run preview で開いておく）
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:5173/";
const tag = process.argv[3] ?? "";
mkdirSync("output/web", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });
async function shot(query, name, size, wait = 1500) {
  const page = await browser.newPage({ viewport: size });
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  await page.goto(`${url}?${query}`);
  await page.waitForSelector("body.ready", { timeout: 120000 });
  await page.waitForTimeout(wait);
  const file = `output/web/${name}${tag}.png`;
  await page.screenshot({ path: file });
  await page.close();
  console.log(file);
}
const desk = { width: 1920, height: 1080 };
for (const t of ["08:30", "12:00", "16:30"]) await shot(`shot&t=${t}`, `t${t.replace(":", "")}`, desk, 4000);
await shot("shot&t=12:00&cam=139.786,35.556,13.2,62,-30", "airport-1200", desk, 6000);
await shot("shot&t=16:30&cam=139.786,35.556,13.2,62,-30", "airport-1630", desk, 6000);
await shot("t=12:00", "ui-1200", desk);
await shot("t=12:00", "mobile", { width: 390, height: 844 });
await browser.close();
