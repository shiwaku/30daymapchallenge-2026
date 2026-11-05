// 録画前の確認用: ?tour の始め（地上だけ）と終わり（回り終えたところ）を静止画で撮る
import { chromium } from "playwright-core";
const url = process.argv[2] ?? "http://localhost:4173/?tour";
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", (e) => console.log("pageerror:", e.message));
await page.goto(url);
await page.waitForFunction(() => document.body.classList.contains("tour-start"), null, { timeout: 60000 });
await page.waitForTimeout(500);
await page.screenshot({ path: "output/tour_start.png" });
await page.waitForFunction(() => document.body.classList.contains("tour-done"), null, { timeout: 60000 });
await page.screenshot({ path: "output/tour_end.png" });
await browser.close();
