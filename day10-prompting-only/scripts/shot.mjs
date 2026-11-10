// ビューワのスクリーンショットを撮る（確認用）。
// 使い方: node scripts/shot.mjs [URL] [接尾辞]   （先に npm run dev か npm run preview で開いておく）
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:5173/";
const tag = process.argv[3] ?? "";
mkdirSync("output/web", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });

async function shot(query, name, size, wait = 800) {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
  page.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
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
const mobile = { width: 390, height: 844 };
for (const d of ["10-15", "11-20", "11-24", "11-30", "12-06", "12-15"]) {
  await shot(`shot&date=${d}`, `shot-${d}`, desk);
}
await shot("date=11-28", "ui-11-28", desk);
await shot(`date=11-28&road=${encodeURIComponent("青梅街道")}`, "ui-ome", desk, 3500);
await shot(`date=11-24&road=${encodeURIComponent("青梅街道")}`, "3d-ome-1124", desk, 4500);
await shot(`date=11-30&road=${encodeURIComponent("目黒通り")}`, "3d-meguro-1130", desk, 4500);
await shot(`date=12-06&road=${encodeURIComponent("目黒通り")}`, "3d-meguro-1206", desk, 4500);
await shot("date=11-24", "mobile", mobile);
await browser.close();
