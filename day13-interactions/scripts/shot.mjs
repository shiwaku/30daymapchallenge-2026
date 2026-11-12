// ビューワのスクリーンショットを撮る（確認用と投稿用）。
// 使い方: node scripts/shot.mjs [URL]   （先に npm run dev か npm run preview で開いておく）
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:5173/";
mkdirSync("output", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });

async function shot(query, file, size, hover) {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 2 });
  page.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  await page.goto(`${url}?shot&${query}`);
  await page.waitForSelector("body.ready", { timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: file });
  await page.close();
  console.log(file);
}

const desk = { width: 1600, height: 1000 };
await shot("", "output/overview.png", desk);
await shot("z=0010&dir=in", "output/day13-interactions.png", desk);
await shot("p=私事", "output/shiji.png", desk);
await shot("m=自転車", "output/bicycle.png", desk);
await shot("z=0010&dir=in&m=鉄道", "output/tokyo-rail.png", desk);
await shot("", "output/mobile.png", { width: 390, height: 844 });
await browser.close();
