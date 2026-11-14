// 指定した位置の画面を撮る。使い方: node scripts/shot.mjs "<zoom>/<lat>/<lon>" 出力.png [bare]   （先に npx vite --port 5190）
import { chromium } from "playwright-core";
const [hash = "4.3/37.5/137.5", out = "output/shot.png", bare] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: Number(process.env.DPR ?? 1) });
page.on("pageerror", (e) => console.log("pageerror:", e.message));
page.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
await page.goto(`http://localhost:5190/${bare ? "?bare" : ""}#${hash}`);
await page.waitForSelector("body.ready", { timeout: 90000 }).catch(() => console.log("not ready (timeout)"));
await Promise.race([page.evaluate(() => new Promise((ok) => window.map.once("idle", ok) && window.map.triggerRepaint())), page.waitForTimeout(30000)]);
await page.waitForTimeout(1500);
await page.screenshot({ path: out });
await browser.close();
console.log(out);
