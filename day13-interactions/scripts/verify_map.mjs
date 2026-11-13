// 地図が web/muni.json のとおりに描かれているかを確かめる（線の本数・向き・太さ）。
// 使い方: node scripts/verify_map.mjs [URL]   （先に npm run dev で開いておく）
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:5173/";
const mu = JSON.parse(readFileSync("web/muni.json", "utf-8"));
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto(`${url}?shot`);
await page.waitForSelector("body.ready", { timeout: 120000 });
const r = await page.evaluate(() => {
  const { lines, heads, map } = window.__od;
  const drawn = new Set(map.queryRenderedFeatures({ layers: ["flows"] }).map((f) => f.properties.i));
  const arrows = new Set(map.queryRenderedFeatures({ layers: ["heads"] }).map((f) => f.properties.i));
  return {
    lines: lines.features.map((f) => ({ ...f.properties, c: f.geometry.coordinates })),
    heads: heads.features.map((f) => ({ i: f.properties.i, b: f.properties.b, c: f.geometry.coordinates })),
    drawn: [...drawn], arrows: [...arrows],
  };
});
await browser.close();

let ok = true;
const say = (good, msg) => { ok &&= good; console.log(`  ${good ? "OK " : "NG "} ${msg}`); };
const U = mu.units;
const dist = (p, u) => Math.hypot((p[0] - u.x) * Math.cos((u.y * Math.PI) / 180), p[1] - u.y);
const want = mu.v.map((v, i) => [v, i]).filter(([v]) => v >= 1000).map(([, i]) => i);

say(r.lines.length === mu.v.length, `線のデータ ${r.lines.length} 本 = muni.json の組 ${mu.v.length}`);
say(r.lines.every((l) => l.o === mu.o[l.i] && l.d === mu.d[l.i] && l.v === mu.v[l.i]), "各線の発地・着地・トリップ数が muni.json と同じ");
const drawn = new Set(r.drawn);
say(want.every((i) => drawn.has(i)) && r.drawn.every((i) => mu.v[i] >= 1000),
  `全体表示で描かれた線 ${drawn.size} 本 = 1,000トリップ以上の組 ${want.length}`);
say(new Set(r.arrows).size === drawn.size, `矢印 ${new Set(r.arrows).size} 個（線と同じ数）`);
// 向き: 線の終わり（矢印の位置）が発地より着地に近く、矢印の向きが線の最後の区間の向きと合う
let wrongEnd = 0, wrongDir = 0;
for (const l of r.lines) {
  const end = l.c[l.c.length - 1], start = l.c[0];
  if (!(dist(end, U[l.d]) < dist(end, U[l.o]) && dist(start, U[l.o]) < dist(start, U[l.d]))) wrongEnd++;
  const p = l.c[l.c.length - 2], k = Math.cos((end[1] * Math.PI) / 180);
  const seg = (Math.atan2((end[0] - p[0]) * k, end[1] - p[1]) * 180) / Math.PI;
  const h = r.heads[l.i];
  if (Math.abs(((h.b - seg + 540) % 360) - 180) > 5) wrongDir++;
}
say(wrongEnd === 0, `線の始まりは発地の近く、終わり（矢印）は着地の近く（違う線 ${wrongEnd}）`);
say(wrongDir === 0, `矢印の向きが線の進む向きと5°以内（違う矢印 ${wrongDir}）`);
// 往復が重ならない: A→B と B→A の真ん中の点が、両端を結ぶ直線の反対側にある
let same = 0, both = 0;
const idx = new Map(r.lines.map((l) => [`${l.o}-${l.d}`, l]));
for (const l of r.lines) {
  const b = idx.get(`${l.d}-${l.o}`);
  if (!b || l.o > l.d) continue;
  both++;
  const A = U[l.o], B = U[l.d];
  const side = (q) => Math.sign((B.x - A.x) * (q[1] - A.y) - (B.y - A.y) * (q[0] - A.x));
  if (side(l.c[8]) === side(b.c[8])) same++;
}
say(same === 0, `往復のある ${both} 組で、行きと帰りの線が左右に分かれる（同じ側 ${same}）`);
say(r.lines.every((l) => Math.abs(l.w - l.v / 1000) < 1e-9), "線の太さの元（w）= トリップ数 / 1000（太さはトリップ数に比例）");
console.log("\n結果:", ok ? "すべて OK" : "NG あり");
process.exit(ok ? 0 : 1);
