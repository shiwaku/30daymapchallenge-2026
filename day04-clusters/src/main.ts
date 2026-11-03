import * as maplibregl from "maplibre-gl";
import type { ExpressionSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "./style.css";

// 開発時は day04-clusters/data-web、公開時（day04-clusters/site/）は ../data-web を読む
const DATA = import.meta.env.DEV ? "./data-web/" : "../data-web/";
// 沖縄の小さな地図の中心（沖縄本島）。縮尺と向きは本体の地図に合わせる
const OKINAWA: [number, number] = [127.85, 26.45];
// 最初の表示範囲（沖縄本島から北海道まで）。読み込み後に fitJapan で合わせ直す
const JAPAN: [[number, number], [number, number]] = [[127.6, 26.0], [145.9, 45.6]];
const BG = "#07080c";
const BEARING = -24;
// 同数のチェーンが並んだセル（c = -1）の色
const TIE = "#6b7080";
// A5 の解像度と、それを出すズームの範囲（scripts/prepare.py の RES と同じ）。
// full は「そのセルの店がこの数以上なら最も明るくする」数。セルの面積に合わせて変える
const LEVELS = [
  { r: 9, min: 0, max: 7, full: 30 },
  { r: 10, min: 7, max: 8.6, full: 10 },
  { r: 11, min: 8.6, max: 23, full: 4 },
];
const FADE = 0.3;

// 並びは scripts/prepare.py の CHAINS と同じ（番号で引く）
const COLORS = ["#ff4757", "#2ed47a", "#3d8bff", "#ffd23f", "#ff9f1c", "#c77dff", "#25e0e0", "#ff7ab8"];
const SHORT = ["セブン", "ファミマ", "ローソン", "ミニストップ", "セイコーマート", "デイリーヤマザキ", "NewDays", "ポプラ"];
const ALL = COLORS.map((_, i) => i);

type Chain = { id: string; name: string; count: number; sameNeighbor: number; expected: number };
type Res = { areaKm2: number; cells: number; top: number[]; ties: number; max: number };
type Stats = { run: string; total: number; unknownPref: number; chains: Chain[]; prefs: Record<string, number[]>; res: Record<string, Res> };
type Cells = GeoJSON.FeatureCollection<GeoJSON.Polygon, { k: number[]; n: number; c?: number; m?: number; s?: number }>;

maplibregl.setWorkerUrl(workerUrl);

// 読み込んだ時点で URL に位置があれば、そこを出す（地図を作ると hash が書き込まれるので、先に取っておく）
const START_HASH = location.hash.length > 1;
const RECORD = new URLSearchParams(location.search).has("record");
const map = new maplibregl.Map({
  container: "map",
  hash: true,
  bounds: JAPAN,
  minZoom: 3,
  maxZoom: 11,
  attributionControl: false,
  style: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": BG } }] },
});
map.addControl(
  new maplibregl.AttributionControl({
    compact: false,
    customAttribution:
      '店舗: <a href="https://alltheplaces.xyz/" target="_blank" rel="noopener">All the Places</a>（2026-10-24 実行分、CC0）を A5 のセルごとに集計 / 格子: <a href="https://a5geo.org/" target="_blank" rel="noopener">A5</a>',
  }),
);
// 地図を回しているので、北の向きを出す
map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "bottom-right");

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const num = (x: number) => x.toLocaleString("ja-JP");

const colorExpr: ExpressionSpecification = ["match", ["get", "c"], ...COLORS.flatMap((c, i) => [i, c]), TIE] as unknown as ExpressionSpecification;

// 選んだチェーンだけで数え直す。c = 選んだなかで店がいちばん多いチェーン（同数は -1）、m = 選んだチェーンの店の数、s = c の割合
function recount(fc: Cells, on: number[]): Cells {
  for (const f of fc.features) {
    const k = f.properties.k;
    let best = -1;
    let top = 0;
    let m = 0;
    for (const i of on) {
      m += k[i];
      if (k[i] > top) [best, top] = [i, k[i]];
      else if (k[i] === top && top > 0) best = -1;
    }
    Object.assign(f.properties, { c: best, m, s: m ? top / m : 0 });
  }
  return fc;
}

// セルのレイヤーを足す（本体の地図と沖縄の小さな地図で同じものを使う）
function addCells(m: maplibregl.Map, data: Cells[]) {
  LEVELS.forEach((lv, j) => {
    const src = `r${lv.r}`;
    m.addSource(src, { type: "geojson", data: data[j], tolerance: 0 });
    // ズームの境目で、粗いセルと細かいセルを重ねて入れ替える
    const fade = (v: ExpressionSpecification | number): ExpressionSpecification =>
      ["interpolate", ["linear"], ["zoom"], lv.min - FADE, lv.min ? 0 : v, lv.min + FADE, v, lv.max - FADE, v, lv.max + FADE, lv.max < 23 ? 0 : v] as ExpressionSpecification;
    // 明るさは店の数（full で頭打ち）と、いちばん多いチェーンの割合
    const light: ExpressionSpecification = ["*", ["sqrt", ["min", 1, ["/", ["get", "m"], lv.full]]], ["+", 0.35, ["*", 0.65, ["get", "s"]]]];
    const range = { minzoom: Math.max(0, lv.min - FADE), maxzoom: lv.max + FADE };
    m.addLayer({
      id: `${src}-glow`,
      type: "line",
      source: src,
      ...range,
      filter: [">", ["get", "m"], 0],
      paint: {
        "line-color": colorExpr,
        "line-width": ["interpolate", ["exponential", 2], ["zoom"], 4, 3, 10, 18],
        "line-blur": ["interpolate", ["exponential", 2], ["zoom"], 4, 3, 10, 18],
        "line-opacity": fade(["*", 0.35, light]),
      },
    });
    m.addLayer({
      id: `${src}-fill`,
      type: "fill",
      source: src,
      ...range,
      filter: [">", ["get", "m"], 0],
      paint: { "fill-color": colorExpr, "fill-opacity": fade(["+", 0.08, ["*", 0.85, light]]), "fill-antialias": false },
    });
    // 五角形の形が見えるように、セルの縁を背景の色で細く抜く
    m.addLayer({
      id: `${src}-edge`,
      type: "line",
      source: src,
      ...range,
      filter: [">", ["get", "m"], 0],
      paint: { "line-color": BG, "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.4, 10, 1.4], "line-opacity": fade(0.9) },
    });
  });
}

async function main() {
  const [stats, ...cells] = (await Promise.all(
    ["stats.json", ...LEVELS.map((lv) => `a5-r${lv.r}.geojson`)].map((f) => fetch(DATA + f).then((r) => r.json())),
  )) as [Stats, ...Cells[]];
  const chains = stats.chains;
  cells.forEach((fc) => recount(fc, ALL));
  addCells(map, cells);

  // 沖縄は本州から離れているので、全国を見るときは左下に別の小さな地図で出す
  const inset = new maplibregl.Map({
    container: "inset",
    center: OKINAWA,
    zoom: 5,
    interactive: false,
    attributionControl: false,
    style: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": BG } }] },
  });
  inset.on("load", () => addCells(inset, cells));
  // 小さな地図は、全国を見ているときだけ出す
  const updateInset = () => {
    const on = map.getZoom() < 6.5;
    $("#inset-box").classList.toggle("on", on);
    if (on) inset.jumpTo({ center: OKINAWA, zoom: map.getZoom(), bearing: map.getBearing() });
  };
  map.on("zoom", updateInset);
  updateInset();

  // 数字はすべて stats.json（scripts/prepare.py がデータから計算した値）から出す
  const top = new Map<number, string[]>();
  for (const [pref, v] of Object.entries(stats.prefs)) {
    const i = v.indexOf(Math.max(...v));
    top.set(i, [...(top.get(i) ?? []), pref]);
  }
  const topText = [...top]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([i, ps]) => `<span class="c" style="--c:${COLORS[i]}">${SHORT[i]}</span> ${ps.length === 1 ? ps[0] : `${ps.length}都道府県`}`)
    .join("、");
  const CAPTION = `8チェーン・<b>${num(stats.total)}</b>店。都道府県ごとに店がいちばん多いチェーンは、${topText}。`;

  $("#legend").innerHTML = chains
    .map((c, i) => `<li><button type="button" data-c="${i}"><span class="sw" style="--c:${COLORS[i]}"></span>${c.name}<span class="n">${num(c.count)}</span></button></li>`)
    .join("");
  const km2 = (r: number) => Math.round(stats.res[r].areaKm2);
  $("#note").innerHTML =
    `All the Places（${stats.run.slice(0, 10)} 実行分）が各社のサイトから集めた店舗。各社の公式の店舗数ではない。ローソンはローソンストア100・ナチュラルローソンを含む。` +
    `五角形は A5（地球を面積の等しい五角形に分ける格子）のセルで、全国では約${km2(9)}km²、拡大すると約${km2(10)}km²・約${km2(11)}km²。` +
    `色はセルのなかで店がいちばん多いチェーン（灰色は同数）、明るさは店の数とそのチェーンの割合。店の位置は出していない。`;

  let solo = -1;
  function paint(on: number[]) {
    cells.forEach((fc, j) => {
      recount(fc, on);
      const src = `r${LEVELS[j].r}`;
      (map.getSource(src) as maplibregl.GeoJSONSource).setData(fc);
      (inset.getSource(src) as maplibregl.GeoJSONSource | undefined)?.setData(fc);
    });
    document.querySelectorAll<HTMLButtonElement>("#legend button").forEach((b) => b.classList.toggle("off", !on.includes(Number(b.dataset.c))));
  }
  // 凡例を押すと、そのチェーンだけで数え直す。もう一度押すと戻る
  document.querySelectorAll<HTMLButtonElement>("#legend button").forEach((b) =>
    b.addEventListener("click", () => {
      const c = Number(b.dataset.c);
      solo = solo === c ? -1 : c;
      paint(solo < 0 ? ALL : [c]);
    }),
  );

  $("#caption").innerHTML = CAPTION;
  // 沖縄・奄美は離れすぎるので、画面に収める範囲からは外す（沖縄は左下の小さな地図で出す）
  if (!START_HASH) fitJapan(cells[0].features.map((f) => f.geometry.coordinates[0][0] as [number, number]).filter(([, y]) => y > 30.5));
  updateInset();
  if (RECORD) document.body.classList.add("record");
  (window as unknown as { __ready: boolean }).__ready = true;
}

// 日本は南西から北東へのびているので、横長の画面では地図を回して北東を右に向け、説明の右側に収める。
// 回したあとの点の広がりで拡大率を決める（狭い画面では回さず、説明の下に収める）
function fitJapan(points: [number, number][]) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const wide = W >= 900;
  const title = $("#title").getBoundingClientRect();
  const bearing = wide ? BEARING : 0;
  const box = wide
    ? { left: title.right + 16, right: W - 24, top: 24, bottom: H - 40 }
    : { left: 12, right: W - 12, top: title.bottom + 12, bottom: H - 40 };
  const r = (-bearing * Math.PI) / 180;
  const [c, s] = [Math.cos(r), Math.sin(r)];
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of points) {
    const m = maplibregl.MercatorCoordinate.fromLngLat(p);
    const x = m.x * c - m.y * s;
    const y = m.x * s + m.y * c;
    [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  }
  // 1 = 世界全体の幅。ズーム z では 512 * 2^z px になる
  const zoom = Math.log2(Math.min((box.right - box.left) / (x1 - x0), (box.bottom - box.top) / (y1 - y0)) / 512);
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
  const center = new maplibregl.MercatorCoordinate(cx * c + cy * s, -cx * s + cy * c).toLngLat();
  map.jumpTo({ center, zoom, bearing, padding: { left: box.left, right: W - box.right, top: box.top, bottom: H - box.bottom } });
}

map.on("load", main);
