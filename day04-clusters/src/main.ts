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
const DIM = "#1c1f27";
// 格子で同数のチェーンが並んだところ（c = -1）の色
const TIE = "#6b7080";
// このズームの間で、格子の点から縄張りの面に切り替える
const FADE = [6.9, 7.3];
// 店の点を出すズーム
const STORE_ZOOM = 10.5;

// 並びは scripts/prepare.py の CHAINS と同じ（番号 c で引く）
const COLORS = ["#ff4757", "#2ed47a", "#3d8bff", "#ffd23f", "#ff9f1c", "#c77dff", "#25e0e0", "#ff7ab8"];
const SHORT = ["セブン", "ファミマ", "ローソン", "ミニストップ", "セイコーマート", "デイリーヤマザキ", "NewDays", "ポプラ"];
const ALL = COLORS.map((_, i) => i);
const BIG3 = [0, 1, 2];
// 段階2で出す、固まって店を出しているチェーン（隣の店も同じチェーンである割合が、店の割合よりずっと高い）
const CLUSTERED = [4, 5, 6, 7];

type Chain = { id: string; name: string; count: number; sameNeighbor: number; expected: number; areaKm2: number };
type Stats = { run: string; radiusM: number; gridM: number; gridCells: number; gridTop: number[]; total: number; unknownPref: number; chains: Chain[]; prefs: Record<string, number[]> };

maplibregl.setWorkerUrl(workerUrl);

// 読み込んだ時点で URL に位置があれば、そこを出す（地図を作ると hash が書き込まれるので、先に取っておく）
const START_HASH = location.hash.length > 1;
const RECORD = new URLSearchParams(location.search).has("record");
const map = new maplibregl.Map({
  container: "map",
  hash: true,
  bounds: JAPAN,
  minZoom: 3,
  maxZoom: 15,
  attributionControl: false,
  style: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": BG } }] },
});
map.addControl(
  new maplibregl.AttributionControl({
    compact: false,
    customAttribution:
      '店舗: <a href="https://alltheplaces.xyz/" target="_blank" rel="noopener">All the Places</a>（2026-10-24 実行分、CC0）を加工して作成',
  }),
);
// 地図を回しているので、北の向きを出す
map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "bottom-right");

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const pct = (x: number) => `${Math.round(100 * x)}%`;
const num = (x: number) => x.toLocaleString("ja-JP");

// 指定したチェーンだけ色を付け、ほかは暗くする式
function colorFor(on: number[]): ExpressionSpecification {
  const m: unknown[] = ["match", ["get", "c"]];
  COLORS.forEach((c, i) => m.push(i, on.includes(i) ? c : DIM));
  m.push(on.length === ALL.length ? TIE : DIM);
  return m as ExpressionSpecification;
}

// 全国を見るときのレイヤーを足す（本体の地図と沖縄の小さな地図で同じものを使う）。
// 格子の点（段階1）と、選んだチェーンの店の点（段階2・3と、凡例で選んだとき）
function addOverview(m: maplibregl.Map, data: GeoJSON.FeatureCollection, stores: GeoJSON.FeatureCollection) {
  m.addSource("grid", { type: "geojson", data });
  m.addSource("spots", { type: "geojson", data: stores });
  // 全国を見るときは格子の点、拡大したら縄張りの面に切り替える（FADE[0]〜FADE[1] で入れ替える）
  const fadeOut = (v: unknown): ExpressionSpecification => ["interpolate", ["linear"], ["zoom"], FADE[0], v, FADE[1], 0] as ExpressionSpecification;
  // 格子の点。大きさは店の数（40店で頭打ち）、明るさはいちばん多いチェーンの割合
  const size: ExpressionSpecification = ["max", 0.3, ["sqrt", ["/", ["min", ["get", "n"], 40], 40]]];
  const gridRadius = (k: number): ExpressionSpecification => ["interpolate", ["exponential", 2], ["zoom"], 4, ["*", 1.6 * k, size], 8, ["*", 25.6 * k, size]];
  m.addLayer({
    id: "grid-glow",
    type: "circle",
    source: "grid",
    maxzoom: FADE[1],
    paint: {
      "circle-color": colorFor(ALL),
      "circle-radius": gridRadius(3),
      "circle-blur": 1,
      "circle-opacity": fadeOut(["*", 0.55, ["get", "s"]]),
      "circle-color-transition": { duration: 900 },
    },
  });
  m.addLayer({
    id: "grid",
    type: "circle",
    source: "grid",
    maxzoom: FADE[1],
    paint: {
      "circle-color": colorFor(ALL),
      "circle-radius": gridRadius(1),
      "circle-opacity": fadeOut(["+", 0.25, ["*", 0.75, ["get", "s"]]]),
      "circle-color-transition": { duration: 900 },
    },
  });

  m.addLayer({
    id: "spots",
    type: "circle",
    source: "spots",
    maxzoom: FADE[1],
    filter: ["in", ["get", "c"], ["literal", []]],
    layout: { "circle-sort-key": ["get", "r"] },
    paint: {
      "circle-color": colorFor(ALL),
      "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 4, 0.8, 8, 4],
      "circle-blur": 0.4,
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], FADE[0], 0.9, FADE[1], 0],
    },
  });

}

// 全国を見るときの色。すべてのチェーンなら格子の点、一部のチェーンならその店の点を出す（格子は暗くする）
function paintOverview(m: maplibregl.Map, on: number[]) {
  const whole = on.length === ALL.length;
  for (const id of ["grid", "grid-glow"]) m.setPaintProperty(id, "circle-color", whole ? colorFor(ALL) : DIM);
  m.setFilter("spots", ["in", ["get", "c"], ["literal", whole ? [] : on]]);
}

async function main() {
  const [territory, stores, grid, stats] = (await Promise.all(
    ["territory.geojson", "stores.json", "grid.json", "stats.json"].map((f) => fetch(DATA + f).then((r) => r.json())),
  )) as [GeoJSON.FeatureCollection, [number, number, number][], [number, number, number, number, number][], Stats];
  const chains = stats.chains;
  const all = chains.map((_, i) => i);

  map.addSource("territory", { type: "geojson", data: territory, tolerance: 0.3 });
  let current = ALL;
  const gridFC: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: grid.map(([x, y, c, n, s]) => ({ type: "Feature", properties: { c, n, s }, geometry: { type: "Point", coordinates: [x, y] } })),
  };
  const storesFC: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    // r は描く順。チェーンごとにまとめて描くと後のチェーンが上に重なって多く見えるので、順番を混ぜる
    features: stores.map(([x, y, c], i) => ({ type: "Feature", properties: { c, r: (i * 0.6180339887) % 1 }, geometry: { type: "Point", coordinates: [x, y] } })),
  };
  addOverview(map, gridFC, storesFC);
  // 沖縄は本州から離れているので、全国を見るときは左下に別の小さな地図で出す
  const inset = new maplibregl.Map({
    container: "inset",
    center: OKINAWA,
    zoom: 5,
    interactive: false,
    attributionControl: false,
    style: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": BG } }] },
  });
  inset.on("load", () => {
    addOverview(inset, gridFC, storesFC);
    paintOverview(inset, current);
  });
  // 小さな地図は、全国を見ているときだけ出す
  const updateInset = () => {
    const on = map.getZoom() < FADE[0] - 0.4;
    $("#inset-box").classList.toggle("on", on);
    if (on) inset.jumpTo({ center: OKINAWA, zoom: map.getZoom(), bearing: map.getBearing() });
  };
  map.on("zoom", updateInset);
  updateInset();
  const fadeIn = (to: number): ExpressionSpecification => ["interpolate", ["linear"], ["zoom"], FADE[0], 0, FADE[1], to];

  // 縄張りの面。縁をぼかした線で光らせる
  map.addLayer({
    id: "glow",
    type: "line",
    source: "territory",
    minzoom: FADE[0],
    paint: {
      "line-color": colorFor(all),
      "line-width": ["interpolate", ["exponential", 2], ["zoom"], 6, 2, 10, 14],
      "line-blur": ["interpolate", ["exponential", 2], ["zoom"], 6, 2, 10, 14],
      "line-opacity": fadeIn(0.4),
      "line-color-transition": { duration: 900 },
    },
  });
  map.addLayer({
    id: "fill",
    type: "fill",
    source: "territory",
    minzoom: FADE[0],
    paint: {
      "fill-color": colorFor(all),
      "fill-opacity": ["interpolate", ["linear"], ["zoom"], FADE[0], 0, FADE[1], 0.85, 12, 0.6],
      "fill-color-transition": { duration: 900 },
      "fill-antialias": false,
    },
  });
  map.addLayer({
    id: "edge",
    type: "line",
    source: "territory",
    minzoom: FADE[1],
    paint: { "line-color": BG, "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.3, 12, 1.2], "line-opacity": 0.8 },
  });
  map.addLayer({
    id: "stores",
    type: "circle",
    source: "spots",
    minzoom: STORE_ZOOM,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], STORE_ZOOM, 1.5, 13, 3.5, 15, 6],
      "circle-color": "#ffffff",
      "circle-stroke-color": colorFor(all),
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], STORE_ZOOM, 0.8, 13, 2],
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], STORE_ZOOM, 0, STORE_ZOOM + 0.5, 0.9],
      "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], STORE_ZOOM, 0, STORE_ZOOM + 0.5, 1],
    },
  });

  // 数字はすべて stats.json（scripts/prepare.py がデータから計算した値）から出す
  const names = chains.map((c) => c.name);
  const top = new Map<number, string[]>();
  for (const [pref, v] of Object.entries(stats.prefs)) {
    const i = v.indexOf(Math.max(...v));
    top.set(i, [...(top.get(i) ?? []), pref]);
  }
  const topText = [...top]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([i, ps]) => `<span class="c" style="--c:${COLORS[i]}">${SHORT[i]}</span> ${ps.length === 1 ? ps[0] : `${ps.length}都道府県`}`)
    .join("、");
  const nb = (i: number) =>
    `<div class="row"><span class="c" style="--c:${COLORS[i]}">${names[i]}</span><span class="v">${pct(chains[i].sameNeighbor)}</span><span class="e">店の割合 ${pct(chains[i].expected)}</span></div>`;

  const CAPTIONS = [
    "",
    `8チェーン・<b>${num(stats.total)}</b>店。都道府県ごとに店がいちばん多いチェーンは、${topText}。`,
    `店の「いちばん近いコンビニ」も同じチェーンである割合。この4チェーンは、全店に占める割合よりずっと高く、固まって店を出している。` +
      `<div class="rows">${[4, 5, 6, 7].map(nb).join("")}</div>`,
    `大手3社は、いちばん近いコンビニが同じチェーンである割合が、全店に占める割合より低い。隣は他社の店のことが多い。` +
      `<div class="rows">${BIG3.map(nb).join("")}</div>`,
  ];
  const ON = [all, all, CLUSTERED, BIG3];

  $("#legend").innerHTML = chains
    .map((c, i) => `<li><button type="button" data-c="${i}"><span class="sw" style="--c:${COLORS[i]}"></span>${c.name}<span class="n">${num(c.count)}</span></button></li>`)
    .join("");
  $("#note").innerHTML =
    `All the Places（${stats.run.slice(0, 10)} 実行分）が各社のサイトから集めた店舗。各社の公式の店舗数ではない。` +
    `ローソンはローソンストア100・ナチュラルローソンを含む。` +
    `全国の図の点は${stats.gridM / 1000}km四方の格子で、色は店がいちばん多いチェーン（灰色は同数）、大きさは店の数、明るさはそのチェーンの割合。拡大したときの縄張りは、店から${stats.radiusM / 1000}km以内で、いちばん近い店がそのチェーンになる範囲（ボロノイ図）。`;

  let step = 0;
  let solo = -1;
  function paint(on: number[]) {
    current = on;
    for (const [layer, prop] of [["fill", "fill-color"], ["glow", "line-color"], ["stores", "circle-stroke-color"]] as const)
      map.setPaintProperty(layer, prop, colorFor(on));
    paintOverview(map, on);
    if (inset.getLayer("grid")) paintOverview(inset, on);
    document.querySelectorAll<HTMLButtonElement>("#legend button").forEach((b) => b.classList.toggle("off", !on.includes(Number(b.dataset.c))));
  }
  function show(s: number) {
    step = s;
    solo = -1;
    document.querySelectorAll<HTMLButtonElement>("#steps button").forEach((b) => b.classList.toggle("on", Number(b.dataset.step) === s));
    $("#caption").innerHTML = CAPTIONS[s];
    paint(ON[s]);
  }
  document.querySelectorAll<HTMLButtonElement>("#steps button").forEach((b) =>
    b.addEventListener("click", () => {
      stopAuto();
      show(Number(b.dataset.step));
    }),
  );
  // 凡例を押すと、そのチェーンだけを出す。もう一度押すと戻る
  document.querySelectorAll<HTMLButtonElement>("#legend button").forEach((b) =>
    b.addEventListener("click", () => {
      stopAuto();
      const c = Number(b.dataset.c);
      if (solo === c) return show(step);
      solo = c;
      paint([c]);
    }),
  );

  show(1);
  // 沖縄・奄美は離れすぎるので、画面に収める範囲からは外す（沖縄は左下の小さな地図で出す）
  if (!START_HASH) fitJapan(grid.filter(([, y]) => y > 30.5).map(([x, y]) => [x, y]));
  updateInset();
  if (RECORD) {
    document.body.classList.add("record");
    (window as unknown as { __show: (s: number) => void }).__show = show;
    return;
  }
  // 最初は順に自動で進める。ボタンを押したら止める
  let timer = window.setInterval(() => (step >= 3 ? stopAuto() : show(step + 1)), 7000);
  function stopAuto() {
    clearInterval(timer);
    timer = 0;
  }
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
