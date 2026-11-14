import * as maplibregl from "maplibre-gl";
import type { ExpressionSpecification, LayerSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { Protocol } from "pmtiles";
import { cellArea } from "a5-js";
import { gridTile } from "./grid";
import "./style.css";

// 開発時は day14-borgesian/data-web、公開時（day14-borgesian/site/）は ../data-web を読む
const DATA = import.meta.env.DEV ? "./data-web/" : "../data-web/";
// 人口のタイル（scripts/tiles.sh）。開発時は手元の data/cells.pmtiles、公開時は R2
const CELLS = import.meta.env.DEV
  ? `pmtiles://${new URL("./data/cells.pmtiles", location.href).href}`
  : "pmtiles://https://shi-works.com/pmtiles/30daymapchallenge-2026/day14/cells.pmtiles";
const PHOTO = "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg";
const BG = "#06070b";
// A5 の解像度 r は、ズーム r-3 〜 r-2 で出す（五角形のさしわたしが画面で約10〜20px）
const R0 = 3;
const RPOP = 14; // 人口を出すのはここまで
const RMAX = 30; // 格子はここまで
const resAt = (z: number) => Math.max(R0, Math.min(RMAX, Math.floor(z) + 3));
// 空中写真を乗算で重ねはじめるズーム（背景も暗い色から白に変える。白×写真＝写真）と、人口の色が抜けて格子に入れ替わるズーム
const PHOTO_IN: [number, number] = [11, 11.8];
const POP_OUT: [number, number] = [12.2, 12.9];
const zfade = (z: [number, number], a: unknown, b: unknown) => ["interpolate", ["linear"], ["zoom"], z[0], a, z[1], b] as unknown as ExpressionSpecification;

// 1km²あたりの人口 → 色（対数で補間）
const RAMP: [number, string][] = [
  [1, "#1d1238"],
  [30, "#3b1d6b"],
  [200, "#6e2a8a"],
  [800, "#a83a86"],
  [2500, "#de5170"],
  [6000, "#f7804b"],
  [12000, "#ffb347"],
  [25000, "#ffe08a"],
  [50000, "#fffbe8"],
];
const color: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["ln", ["max", ["get", "d"], 1]],
  ...RAMP.flatMap(([v, c]) => [Math.log(v), c]),
] as unknown as ExpressionSpecification;

type Level = { area_km2: number; cells: number; max_pop: number; max_density: number };
type Stats = { total: number; meshes: number; levels: Record<string, Level> };

const params = new URLSearchParams(location.search);
if (params.has("bare")) document.body.classList.add("bare");

maplibregl.setWorkerUrl(workerUrl);
const protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);
// 格子のタイル（a5grid://z/x/y）はブラウザで作る
maplibregl.addProtocol("a5grid", async (req) => {
  const [z, x, y, r] = req.url.replace("a5grid://", "").split("/").map(Number);
  return { data: gridTile(z, x, y, r || undefined).buffer as ArrayBuffer };
});

const fills: LayerSpecification[] = [];
const lines: LayerSpecification[] = [];
for (let r = R0; r <= RPOP; r++) {
  const minzoom = r - 3;
  const last = r === RPOP;
  const maxzoom = last ? POP_OUT[1] : r - 2;
  const fade = (a: number): ExpressionSpecification | number => (last ? zfade(POP_OUT, a, 0) : a);
  fills.push({ id: `f${r}`, type: "fill", source: "cells", "source-layer": `r${r}`, minzoom, maxzoom, paint: { "fill-color": color, "fill-opacity": fade(0.95), "fill-antialias": false } });
  // 五角形の形が見えるよう、背景の色で細く縁取る
  lines.push({
    id: `l${r}`,
    type: "line",
    source: "cells",
    "source-layer": `r${r}`,
    minzoom,
    maxzoom,
    paint: {
      "line-color": BG,
      "line-opacity": fade(0.7),
      "line-width": ["interpolate", ["exponential", 2], ["zoom"], r - 3, 0.4, r - 2, 0.7, r + 1, 2],
    },
  });
}

const ZT = 25; // MapLibre のタイルのズームの上限
// レイヤーの minzoom/maxzoom はスタイルの決まりで24までしか書けないので、ズーム25より先の出し分けは不透明度で行う
const GA = 0.5;
function gridLayer(source: string, minzoom: number, opacity: unknown[]): LayerSpecification {
  return {
    id: source,
    type: "line",
    source,
    "source-layer": "grid",
    minzoom,
    paint: { "line-color": "#ffffff", "line-opacity": ["interpolate", ["linear"], ["zoom"], ...opacity] as unknown as ExpressionSpecification, "line-width": 0.8 },
  };
}

const map = new maplibregl.Map({
  container: "map",
  hash: true,
  center: [137.5, 37.5],
  zoom: 4.3,
  minZoom: 0,
  maxZoom: RMAX - 2,
  attributionControl: false,
  canvasContextAttributes: { preserveDrawingBuffer: true },
  style: {
    version: 8,
    projection: { type: "globe" },
    sources: {
      cells: { type: "vector", url: CELLS },
      // 解像度15〜28（タイルのズーム12〜25）。解像度29・30はズーム25のタイルに細かい五角形を入れる
      grid: { type: "vector", tiles: ["a5grid://{z}/{x}/{y}"], minzoom: RPOP - 3, maxzoom: ZT },
      grid29: { type: "vector", tiles: ["a5grid://{z}/{x}/{y}/29"], minzoom: ZT, maxzoom: ZT },
      grid30: { type: "vector", tiles: ["a5grid://{z}/{x}/{y}/30"], minzoom: ZT, maxzoom: ZT },
      world: { type: "geojson", data: `${DATA}world.geojson` },
      earth: { type: "geojson", maxzoom: 14, data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]] } } },
      photo: { type: "raster", tiles: [PHOTO], tileSize: 256, minzoom: 2, maxzoom: 18 },
    },
    layers: [
      // background レイヤーはズーム25より先でタイル番号の上限を超えて落ちるので、そこから先は世界を覆う白い面で塗る
      { id: "bg", type: "background", maxzoom: 24, paint: { "background-color": zfade(PHOTO_IN, BG, "#ffffff") } },
      { id: "bg-deep", type: "fill", source: "earth", minzoom: 23.5, paint: { "fill-color": "#ffffff", "fill-antialias": false } },
      // 全球の格子（解像度0〜2）。引いて見たときだけ
      {
        id: "world",
        type: "line",
        source: "world",
        maxzoom: 4.5,
        paint: {
          "line-color": "#8fa3c8",
          "line-width": ["match", ["get", "r"], 0, 1.4, 1, 0.8, 0.5],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 2.5, ["match", ["get", "r"], 0, 0.7, 1, 0.4, 0.22], 4.5, 0],
        },
      },
      ...fills,
      ...lines,
      // 空中写真を人口の上に乗算で重ねる（人口の色に写真の模様が乗る）
      { id: "photo", type: "raster", source: "photo", minzoom: PHOTO_IN[0], paint: { "raster-opacity": zfade(PHOTO_IN, 0, 1), "raster-saturation": -0.25, "raster-layer-blend": "multiply" } },
      // 解像度15〜30: 人口なしの格子だけ
      gridLayer("grid", POP_OUT[0], [POP_OUT[0], 0, POP_OUT[1], GA, ZT + 0.999, GA, ZT + 1, 0]),
      gridLayer("grid29", 24, [ZT + 0.999, 0, ZT + 1, GA, ZT + 1.999, GA, ZT + 2, 0]),
      gridLayer("grid30", 24, [ZT + 1.999, 0, ZT + 2, GA]),
    ],
    sky: { "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.6, 5, 0] },
  },
});
map.addControl(
  new maplibregl.AttributionControl({
    compact: false,
    customAttribution:
      '人口: <a href="https://www.e-stat.go.jp/gis" target="_blank" rel="noopener">政府統計の総合窓口（e-Stat）</a> 令和2年国勢調査 地域メッシュ統計（125mメッシュ）を加工 / 格子: <a href="https://a5geo.org/" target="_blank" rel="noopener">A5</a> / 写真: <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>（全国最新写真（シームレス））',
  }),
);
map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "bottom-right");

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const num = (x: number) => Math.round(x).toLocaleString("ja-JP");

// 凡例
$("#ramp").style.background = `linear-gradient(90deg, ${RAMP.map(([, c], i) => `${c} ${(i / (RAMP.length - 1)) * 100}%`).join(", ")})`;
$("#ticks").innerHTML = [1, 200, 2500, 12000, 50000].map((v) => `<span style="left:${(RAMP.findIndex(([x]) => x === v) / (RAMP.length - 1)) * 100}%">${num(v)}</span>`).join("");

const stats: Stats = await fetch(`${DATA}stats.json`).then((r) => r.json());
const MESH_M2 = 16400; // 125mメッシュ（緯度3.75″×経度5.625″、約116m×142m）の面積。北緯35度のあたり

// 面積（m²）と、同じ広さの正方形の1辺
function areaText(m2: number) {
  const sig = (v: number) => (v >= 100 ? num(v) : v >= 10 ? v.toFixed(0) : v.toPrecision(2));
  if (m2 >= 1e8) return `${num(m2 / 1e6)} km²`;
  if (m2 >= 1e5) return `${sig(m2 / 1e6)} km²`;
  if (m2 >= 1) return `${sig(m2)} m²`;
  if (m2 >= 1e-4) return `${sig(m2 * 1e4)} cm²`;
  return `${sig(m2 * 1e6)} mm²`;
}
function side(m2: number) {
  const m = Math.sqrt(m2);
  if (m >= 1000) return `${num(m / 1000)}km`;
  if (m >= 1) return `${num(m)}m`;
  if (m >= 0.01) return `${num(m * 100)}cm`;
  return `${(m * 1000).toFixed(1)}mm`;
}
function hud() {
  const r = resAt(map.getZoom());
  const m2 = cellArea(r);
  const ratio = m2 / MESH_M2;
  const rel = ratio >= 1.5 ? `、125mメッシュ ${num(ratio)}個分` : "";
  let html = `<div class="r">A5 解像度 <b>${r}</b></div><div>1つの五角形 約${areaText(m2)}（${side(m2)}四方と同じ広さ${rel}）</div>`;
  if (r <= RPOP) html += `<div>人のいる五角形 <b>${num(stats.levels[String(r)].cells)}</b></div>`;
  else html += `<div class="dim">ここから先は格子だけ（人口は125mメッシュより細かく数えられない）</div>`;
  $("#hud").innerHTML = html;
  $("#legend").style.opacity = r <= RPOP ? "1" : "0.35";
}
map.on("zoom", hud);
hud();

$("#note").innerHTML =
  `令和2年国勢調査の125mメッシュ（6次メッシュ）の人口（総数）を使った。人のいるメッシュ ${num(stats.meshes)}、人口の合計 ${num(stats.total)}人（国勢調査の公表値と同じ）。` +
  `メッシュは正方形、A5 は五角形で、境界が合わない。そこで解像度ごとに、メッシュと五角形の重なりの面積の割合で人口を配った（メッシュの中では人が均一にいるとみなす）。どの解像度でも、合計は ${num(stats.total)}人になる。` +
  `五角形に触れると出る「◯〜◯人」は、五角形に丸ごと入るメッシュの合計から、少しでもかかるメッシュの合計まで。メッシュの中の人の偏りによらず、五角形の人口は必ずこの幅に入る。<br>` +
  `解像度15から先は、五角形が125mメッシュの2倍より小さくなり、人口の細かさが足りないので、格子だけを出している。<br>` +
  `秘匿処理: 125mメッシュは人口の少ないメッシュの内訳（年齢別など）が隣のメッシュに合算されているが、人口（総数）はすべてのメッシュに出ている。`;

// 五角形に触れると、その五角形の人口
const tip = $("#tip");
const ids = fills.map((l) => l.id);
map.on("mousemove", (e) => {
  const f = map.getZoom() < POP_OUT[1] ? map.queryRenderedFeatures(e.point, { layers: ids })[0] : undefined;
  if (!f) {
    tip.style.display = "none";
    return;
  }
  const p = f.properties as { p: number; d: number; lo: number; hi: number };
  const r = Number(f.layer.id.slice(1));
  const range = p.lo === p.hi ? "" : `<div class="small">${num(p.lo)}〜${num(p.hi)}人の間</div>`;
  tip.innerHTML = `<div class="big">約${num(p.p)}人</div>${range}<div class="small">1km²あたり ${num(p.d)}人・A5 解像度 ${r}</div>`;
  tip.style.display = "block";
  tip.style.left = `${e.point.x + 14}px`;
  tip.style.top = `${e.point.y + 14}px`;
});
map.getCanvas().addEventListener("mouseleave", () => (tip.style.display = "none"));

map.once("idle", () => document.body.classList.add("ready"));

// ?tour: 地球儀から寄っていき、人口が消えて格子だけになり、解像度30まで寄る（動画用）。
// 終点は日本経緯度原点（東京都港区麻布台。日本の測量の基準になる点）。始まりと終わりに body へ tour-start / tour-done を付ける
const ORIGIN: [number, number] = [139.741357, 35.658099];
if (params.has("tour")) {
  const wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
  const fly = (o: maplibregl.FlyToOptions) => new Promise<void>((ok) => { map.once("moveend", () => ok()); map.flyTo({ essential: true, ...o }); });
  map.jumpTo({ center: [150, 20], zoom: 1.3 });
  map.once("idle", async () => {
    document.body.classList.add("tour-start");
    await wait(1500);
    await fly({ center: [137.6, 36.6], zoom: 2.6, duration: 5000, curve: 1 });
    await wait(600);
    // 寄るときは一定の速さでズームが上がるよう easeTo を線形で使う
    const ease = (o: maplibregl.EaseToOptions) => new Promise<void>((ok) => { map.once("moveend", () => ok()); map.easeTo({ easing: (t) => t, essential: true, ...o }); });
    await ease({ center: [138.3, 36.9], zoom: 4.8, duration: 3500 });
    await wait(800);
    await ease({ center: [139.62, 35.70], zoom: 8.6, duration: 6000 });
    await wait(800);
    await ease({ center: ORIGIN, zoom: 11.3, duration: 4500 });
    await wait(1200);
    await ease({ center: ORIGIN, zoom: RMAX - 2.2, duration: 16000 });
    // 解像度30の格子を描き終えてから止める
    await Promise.race([new Promise((ok) => map.once("idle", ok)), wait(8000)]);
    await wait(3000);
    document.body.classList.add("tour-done");
  });
}
(window as unknown as { map: maplibregl.Map }).map = map;
