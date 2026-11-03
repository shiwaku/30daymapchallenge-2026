// X に投稿する静止画（16:9）を撮る。
//   blocks: 全国と地方ブロック7つ → output/day04-x-*.png
//   prefs:  47都道府県 → output/day04-pref-01.png 〜 47（番号は都道府県コード）
//   cities: data-web/cities.geojson の市 → output/day04-city-*.png
// 範囲・外側の暗がり・右上の割合は、ページの地方ボタン・都道府県の選択と同じもの（data-web/blocks.geojson・prefs.geojson と stats.json から）。
// 使い方: リポジトリの直下で python -m http.server 4174 を動かしてから node scripts/capture-x.mjs [blocks|prefs|cities] [URL]
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync } from "node:fs";

const mode = process.argv[2] ?? "blocks";
const url = process.argv[3] ?? "http://localhost:4174/day04-clusters/site/";
mkdirSync("output", { recursive: true });
// 市のファイル名（ローマ字）。ないときは番号
const CITY_FILE = { 川越市: "kawagoe", 札幌市: "sapporo" };
const SHOTS =
  mode === "cities"
    ? JSON.parse(readFileSync("data-web/cities.geojson", "utf-8")).features.map((f, i) => [`output/day04-city-${CITY_FILE[f.properties.name] ?? i + 1}.png`, f.properties.name])
    : mode === "prefs"
    ? JSON.parse(readFileSync("data-web/prefs.geojson", "utf-8")).features.map((f, i) => [`output/day04-pref-${String(i + 1).padStart(2, "0")}.png`, f.properties.name])
    : [
        ["1-japan", "全国"],
        ["2-kanto", "関東"],
        ["3-chubu", "中部"],
        ["4-kinki", "近畿"],
        ["5-hokkaido", "北海道"],
        ["6-tohoku", "東北"],
        ["7-chugoku-shikoku", "中国・四国"],
        ["8-kyushu-okinawa", "九州・沖縄"],
      ].map(([n, b]) => [`output/day04-x-${n}.png`, b]);

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.5 });
page.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
await page.goto(`${url}?record`);
await page.waitForFunction(() => "__ready" in window, null, { timeout: 120000 });
for (const [path, area] of SHOTS) {
  await page.evaluate((a) => window.__block(a), area);
  // 地名のタイルを読み終えるまで待つ
  await page.waitForFunction(() => window.__map.areTilesLoaded(), null, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => new Promise((r) => setTimeout(r, 1500)));
  await page.screenshot({ path });
  console.log(path, area);
}
await browser.close();
