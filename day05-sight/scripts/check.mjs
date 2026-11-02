// 「写真に重ねる（乗算）」とスマートフォン幅の表示を撮って確かめる。
// 使い方: node scripts/check.mjs [URL]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:5173/";
mkdirSync("output/check", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });
const wait = async (page) => {
  await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 120000 });
  await page.waitForFunction(() => window.__day05.cs.areTilesLoaded() && window.__day05.photo.areTilesLoaded(), null, { timeout: 60000 });
  await page.waitForTimeout(800);
};

const desk = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await desk.goto(`${url}?castle=karasawayama`);
await wait(desk);
await desk.click('.mode button[data-mode="blend"]');
await desk.waitForTimeout(800);
await desk.screenshot({ path: "output/check/blend.png" });

const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await phone.goto(`${url}?castle=kagomori`);
await wait(phone);
await phone.screenshot({ path: "output/check/phone.png" });
await browser.close();
console.log("output/check/blend.png output/check/phone.png");
