// X に投稿する静止画（16:9）を撮る: 日本全体と地方ブロック。
// 地方ブロックは背景の地図がないので、県庁所在地などの都市名を重ねる。
// 右上の割合は、data-web/stats.json の都道府県ごとの店舗数を地方ブロックで足して計算する（住所の都道府県で集計）。
// 使い方: リポジトリの直下で python -m http.server 4174 を動かしてから node scripts/capture-x.mjs [URL]
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:4174/day04-clusters/site/";
const stats = JSON.parse(readFileSync("data-web/stats.json", "utf-8"));
const SHORT = ["セブン", "ファミマ", "ローソン", "ミニストップ", "セイコーマート", "デイリーヤマザキ", "NewDays", "ポプラ"];
mkdirSync("output", { recursive: true });

// 店舗数の上位3チェーンの割合（小数1桁。中部・近畿はファミマとセブンが0.1ポイント差）
function shares(prefs) {
  const v = SHORT.map((_, i) => prefs.reduce((a, p) => a + stats.prefs[p][i], 0));
  const t = v.reduce((a, b) => a + b, 0);
  return [...v.keys()].sort((a, b) => v[b] - v[a]).slice(0, 3).map((i) => `${SHORT[i]} ${((100 * v[i]) / t).toFixed(1)}%`).join("・");
}

// view は [ズーム, 緯度, 経度]。ズーム 6.7〜7.3・8.3〜8.9 はセルの解像度の入れ替わりで2つが重なるので避ける。
// 説明の枠が左側を覆うので、中心を西にずらして、ブロックを枠の右側に収める。inset は沖縄の小さな地図を出すか
const SHOTS = [
  { name: "1-japan", title: "全国", prefs: Object.keys(stats.prefs), inset: true, cities: [] },
  {
    name: "2-kanto", title: "関東", view: [8, 36.0, 139.1],
    prefs: ["茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県"],
    cities: [["東京", 139.767, 35.681], ["横浜", 139.622, 35.466], ["さいたま", 139.623, 35.861], ["千葉", 140.123, 35.613], ["水戸", 140.447, 36.371], ["宇都宮", 139.884, 36.559], ["前橋", 139.061, 36.391]],
  },
  {
    name: "3-chubu", title: "中部", view: [6.6, 36.5, 136.4],
    prefs: ["新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県"],
    cities: [["名古屋", 136.881, 35.171], ["静岡", 138.389, 34.972], ["長野", 138.181, 36.651], ["新潟", 139.036, 37.902], ["金沢", 136.648, 36.578], ["甲府", 138.568, 35.664]],
  },
  {
    name: "4-kinki", title: "近畿", view: [7.6, 34.6, 134.9],
    prefs: ["三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"],
    cities: [["大阪", 135.496, 34.702], ["京都", 135.758, 34.985], ["神戸", 135.195, 34.69], ["奈良", 135.82, 34.68], ["和歌山", 135.167, 34.23], ["津", 136.508, 34.719]],
  },
  {
    name: "5-hokkaido", title: "北海道", view: [6.4, 43.4, 141.4],
    prefs: ["北海道"],
    cities: [["札幌", 141.35, 43.06], ["旭川", 142.36, 43.77], ["函館", 140.73, 41.77], ["釧路", 144.38, 42.98], ["帯広", 143.2, 42.92]],
  },
  {
    name: "6-tohoku", title: "東北", view: [6.6, 39.2, 139.5],
    prefs: ["青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"],
    cities: [["仙台", 140.87, 38.27], ["青森", 140.74, 40.82], ["盛岡", 141.15, 39.7], ["秋田", 140.1, 39.72], ["山形", 140.36, 38.24], ["福島", 140.47, 37.75]],
  },
  {
    name: "7-chugoku-shikoku", title: "中国・四国", view: [7.4, 34.2, 132.3],
    sub: () =>
      `中国　${shares(["鳥取県", "島根県", "岡山県", "広島県", "山口県"])}<br>四国　${shares(["徳島県", "香川県", "愛媛県", "高知県"])}`,
    cities: [["広島", 132.46, 34.39], ["岡山", 133.92, 34.66], ["松江", 133.05, 35.47], ["山口", 131.47, 34.18], ["高松", 134.05, 34.34], ["松山", 132.77, 33.84], ["高知", 133.53, 33.56], ["徳島", 134.55, 34.07]],
  },
  {
    name: "8-kyushu-okinawa", title: "九州・沖縄", view: [6.4, 32.6, 129.0], inset: true,
    sub: () =>
      `九州　${shares(["福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県"])}<br>沖縄（左下）　${shares(["沖縄県"])}`,
    cities: [["福岡", 130.42, 33.59], ["北九州", 130.88, 33.88], ["熊本", 130.71, 32.8], ["鹿児島", 130.56, 31.6], ["長崎", 129.87, 32.75], ["大分", 131.61, 33.24], ["宮崎", 131.42, 31.91]],
  },
];

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });
for (const s of SHOTS) {
  // URL の # だけ変えるとページが読み直されず、前の都市名が残るので、1枚ごとに新しいページで開く
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.5 });
  page.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
  await page.goto(`${url}?record${s.view ? `#${s.view.join("/")}` : ""}`);
  await page.waitForFunction(() => "__ready" in window, null, { timeout: 120000 });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 2500)));
  const sub = s.sub ? s.sub() : shares(s.prefs);
  await page.evaluate(({ title, sub, cities, inset }) => {
    const map = window.__map;
    if (!inset) document.querySelector("#inset-box").style.display = "none";
    const add = (html, css) => {
      const d = document.createElement("div");
      d.innerHTML = html;
      Object.assign(d.style, { position: "absolute", zIndex: 5, color: "#fff", fontWeight: 700, textShadow: "0 0 4px #000, 0 0 8px #000, 0 0 12px #000", pointerEvents: "none" }, css);
      document.body.append(d);
    };
    add(`<div style="font-size:30px;font-weight:900;letter-spacing:0.08em">${title}</div><div style="font-size:15px;margin-top:2px">${sub}</div>`, { right: "28px", top: "20px", textAlign: "right" });
    for (const [n, lon, lat] of cities) {
      const p = map.project([lon, lat]);
      add(
        `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#fff;box-shadow:0 0 0 2px #000;margin-right:6px;vertical-align:middle"></span>${n}`,
        { left: `${p.x - 5}px`, top: `${p.y - 11}px`, fontSize: "16px" },
      );
    }
  }, { title: s.title, sub, cities: s.cities, inset: !!s.inset });
  const path = `output/day04-x-${s.name}.png`;
  await page.screenshot({ path });
  console.log(path, "|", sub.replace("<br>", " / "));
  await page.close();
}
await browser.close();
