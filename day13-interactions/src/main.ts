import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "./style.css";

// 開発時は day13-interactions/web、公開時（day13-interactions/site/）は ../web を読む
const DATA = import.meta.env.DEV ? "./web/" : "../web/";
const params = new URLSearchParams(location.search);
const SHOT = params.has("shot"); // スクリーンショット用
const REGION: [[number, number], [number, number]] = params.has("core") ? [[139.3, 35.4], [140.2, 35.95]] : [[138.95, 34.9], [140.9, 36.3]];
const BG = "#0b0d12";
const FLOW = "#ffa046"; // 流れ（選んだ市区町村が発地）
const INFLOW = "#b98cff"; // 選んだ市区町村が着地
const INTRA = "#dfe3ec"; // 内々トリップの ↔
const STATION = "#7fd4e6"; // 駅（市区町村名は白）
const MIN_DRAW = 1000; // 全体表示で描く組の下限（トリップ/日）
const BEND = 0.16; // 曲線のふくらみ（長さに対する比）。往復が左右に分かれる

type Unit = { n: string; x: number; y: number; intra: number; near: number; far: number };
type Muni = {
  units: Unit[]; o: number[]; d: number[]; v: number[]; adj: number[];
  total: { trips: number; intra: number; near: number; far: number; to_center: number };
  min_n: number;
};
type Station = { n: string; r: number; x: number; y: number };

maplibregl.setWorkerUrl(workerUrl);
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const fmt = (v: number) => Math.round(v).toLocaleString("ja-JP");
const pc = (a: number, b: number) => `${((a / b) * 100).toFixed(0)}%`;

const [mu, stations, areas, rail] = await Promise.all([
  fetch(DATA + "muni.json").then((r) => r.json() as Promise<Muni>),
  fetch(DATA + "stations.json").then((r) => r.json() as Promise<Station[]>),
  fetch(DATA + "muni_areas.geojson").then((r) => r.json()),
  fetch(DATA + "rail.geojson").then((r) => r.json()),
]);
const U = mu.units;
const T = mu.total;
const N = mu.o.length;
const pairIndex = new Map<string, number>();
for (let i = 0; i < N; i++) pairIndex.set(`${mu.o[i]}-${mu.d[i]}`, i);

let sel = -1;
{
  const n = params.get("m");
  const i = U.findIndex((u) => u.n === n);
  if (i >= 0) sel = i;
}

// 流れの曲線と矢印。進む向きの右側へふくらませるので、往復は左右に分かれる
function curves() {
  const lines: GeoJSON.Feature[] = [];
  const heads: GeoJSON.Feature[] = [];
  for (let i = 0; i < N; i++) {
    const a = U[mu.o[i]], b = U[mu.d[i]];
    const k = Math.cos((((a.y + b.y) / 2) * Math.PI) / 180);
    const ax = a.x * k, ay = a.y, bx = b.x * k, by = b.y;
    const dx = bx - ax, dy = by - ay;
    const cx = (ax + bx) / 2 + dy * BEND, cy = (ay + by) / 2 - dx * BEND; // 右へ
    const at = (t: number) => {
      const s = 1 - t;
      return [s * s * ax + 2 * s * t * cx + t * t * bx, s * s * ay + 2 * s * t * cy + t * t * by];
    };
    const coords: number[][] = [];
    const t0 = 0.05, t1 = 0.9; // 端のラベルに重ならないよう、両端を少し切る
    for (let j = 0; j <= 16; j++) {
      const [x, y] = at(t0 + ((t1 - t0) * j) / 16);
      coords.push([x / k, y]);
    }
    // 終わりの接線の向き（北から時計回り）
    const s = 1 - t1;
    const tx = 2 * s * (cx - ax) + 2 * t1 * (bx - cx), ty = 2 * s * (cy - ay) + 2 * t1 * (by - cy);
    const bearing = (Math.atan2(tx, ty) * 180) / Math.PI;
    const props = { i, o: mu.o[i], d: mu.d[i], v: mu.v[i], w: mu.v[i] / 1000 };
    lines.push({ type: "Feature", properties: props, geometry: { type: "LineString", coordinates: coords } });
    heads.push({ type: "Feature", properties: { ...props, b: bearing }, geometry: { type: "Point", coordinates: coords[coords.length - 1] } });
  }
  return {
    lines: { type: "FeatureCollection", features: lines } as GeoJSON.FeatureCollection,
    heads: { type: "FeatureCollection", features: heads } as GeoJSON.FeatureCollection,
  };
}

// 矢印の形（上向きの三角形。SDF にして色を付ける）
function arrowImage() {
  const s = 32;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.beginPath();
  g.moveTo(s / 2, 2);
  g.lineTo(s - 4, s - 4);
  g.lineTo(4, s - 4);
  g.closePath();
  g.fill();
  return g.getImageData(0, 0, s, s);
}

// 線の太さ（px）: トリップ数に比例。ズームで太さを変える
const STOPS: [number, number][] = [[7, 0.45], [9, 1.1], [12, 3.2]];
const byZoom = (expr: maplibregl.ExpressionSpecification): maplibregl.ExpressionSpecification =>
  ["interpolate", ["exponential", 1.6], ["zoom"], ...STOPS.flatMap(([z, f]) => [z, ["*", expr, f]])] as maplibregl.ExpressionSpecification;
// 上と同じ補間（凡例の線の太さに使う）
function factorAt(z: number) {
  if (z <= STOPS[0][0]) return STOPS[0][1];
  for (let k = 1; k < STOPS.length; k++) {
    const [z0, f0] = STOPS[k - 1], [z1, f1] = STOPS[k];
    if (z <= z1) {
      const t = (1.6 ** (z - z0) - 1) / (1.6 ** (z1 - z0) - 1);
      return f0 + (f1 - f0) * t;
    }
  }
  return STOPS[STOPS.length - 1][1];
}
const lineWidth = byZoom(["max", 0.35, ["get", "w"]]);
const headSize = byZoom(["/", ["max", 7, ["*", 2.6, ["get", "w"]]], 32]);
const colorOf = (): maplibregl.ExpressionSpecification | string =>
  sel < 0 ? FLOW : ["case", ["==", ["get", "o"], sel], FLOW, INFLOW];

const map = new maplibregl.Map({
  container: "map",
  bounds: REGION,
  minZoom: 6,
  maxZoom: 13,
  attributionControl: false,
  canvasContextAttributes: { preserveDrawingBuffer: SHOT },
  style: {
    version: 8,
    glyphs: "https://gsi-cyberjapan.github.io/optimal_bvmap/glyphs/{fontstack}/{range}.pbf",
    sources: {},
    layers: [{ id: "background", type: "background", paint: { "background-color": BG } }],
  },
});
map.addControl(new maplibregl.AttributionControl({ compact: false }));
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

const tip = $("#tip");
function showTip(x: number, y: number, html: string) {
  tip.innerHTML = html;
  tip.style.display = "block";
  tip.style.left = `${Math.min(x + 14, window.innerWidth - tip.offsetWidth - 8)}px`;
  tip.style.top = `${Math.max(8, y - tip.offsetHeight - 10)}px`;
}
const err = (v: number) => (v < mu.min_n ? `<span class="small">（${fmt(mu.min_n)}トリップ未満は誤差が大きい）</span>` : "");

function lineFilter(): maplibregl.FilterSpecification {
  return sel < 0
    ? [">=", ["get", "v"], MIN_DRAW]
    : ["all", [">=", ["get", "v"], 100], ["any", ["==", ["get", "o"], sel], ["==", ["get", "d"], sel]]];
}

function list(ids: number[], side: "o" | "d") {
  return ids
    .sort((a, b) => mu.v[b] - mu.v[a])
    .slice(0, 5)
    .map((i) => {
      const u = mu[side][i];
      return `<li><a href="#" data-i="${u}">${U[u].n}</a><span class="v">${fmt(mu.v[i])}</span></li>`;
    })
    .join("");
}

function card() {
  const el = $("#card");
  if (sel < 0) {
    el.innerHTML = `<div class="small">市区町村をクリックすると、そこを発地または着地とする流れだけになる。</div>`;
    return;
  }
  const u = U[sel];
  const outs: number[] = [], ins: number[] = [];
  for (let i = 0; i < N; i++) {
    if (mu.o[i] === sel) outs.push(i);
    if (mu.d[i] === sel) ins.push(i);
  }
  const outSum = outs.reduce((s, i) => s + mu.v[i], 0);
  const inSum = ins.reduce((s, i) => s + mu.v[i], 0);
  el.innerHTML =
    `<div class="head"><b>${u.n}</b><button type="button" id="reset">全体に戻る</button></div>` +
    `<div class="lt" style="color:${INTRA}">内々（発地も着地もここ） ${fmt(u.intra)}</div>` +
    `<div class="cols"><div><div class="lt" style="color:${FLOW}">内外（ここが発地） ${fmt(outSum)}</div><ol>${list(outs, "d")}</ol></div>` +
    `<div><div class="lt" style="color:${INFLOW}">外内（ここが着地） ${fmt(inSum)}</div><ol>${list(ins, "o")}</ol></div></div>` +
    `<div class="small">単位はトリップ/日。リストは相手の市区町村の多い順。</div>`;
  $("#reset").addEventListener("click", () => select(-1));
  el.querySelectorAll<HTMLAnchorElement>("a[data-i]").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      select(Number(a.dataset.i));
    }),
  );
}

// 選んだ市区町村の内々トリップを示す ↔（市区町村の中心を通る横向きの両矢印。長さは市区町村の幅の4割）
// 市区町村の外接矩形 [西, 南, 東, 北]
function bboxOf(i: number) {
  const f = (areas as GeoJSON.FeatureCollection).features.find((x) => x.properties?.i === i)!;
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (c: unknown): void => {
    if (typeof (c as number[])[0] === "number") {
      const [x, y] = c as number[];
      b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
    } else (c as unknown[]).forEach(walk);
  };
  walk((f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon).coordinates);
  return b;
}

function intraArrow(): GeoJSON.FeatureCollection {
  if (sel < 0) return { type: "FeatureCollection", features: [] };
  const [x0, y0, x1, y1] = bboxOf(sel);
  const u = U[sel];
  const h = Math.min(u.x - x0, x1 - u.x, (x1 - x0) * 0.2) * 0.95;
  const y = u.y - (y1 - y0) * 0.12; // 市区町村名の少し下
  const a = [u.x - h, y], b = [u.x + h, y];
  // 矢じりの分だけ線を短くする
  const s = h * 0.12;
  return {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[a[0] + s, a[1]], [b[0] - s, b[1]]] } },
      { type: "Feature", properties: { b: 270 }, geometry: { type: "Point", coordinates: [a[0] + s, a[1]] } },
      { type: "Feature", properties: { b: 90 }, geometry: { type: "Point", coordinates: [b[0] - s, b[1]] } },
      { type: "Feature", properties: { label: 1, text: `内々 ${fmt(u.intra)}` }, geometry: { type: "Point", coordinates: [u.x, y] } },
    ],
  };
}

// 凡例の線の太さを、いまのズームの太さに合わせる
function legendWidths() {
  const f = factorAt(map.getZoom());
  document.querySelectorAll<HTMLElement>(".legend i[data-v]").forEach((el) => {
    el.style.height = `${Math.max(0.35, Number(el.dataset.v) / 1000) * f}px`;
  });
}

function pad() {
  return window.innerWidth > 700 ? { left: 30, right: 40, top: 40, bottom: 40 } : 12;
}
function fitTo(i: number) {
  if (i < 0) return void map.fitBounds(REGION, { padding: pad(), duration: SHOT ? 0 : 800 });
  // 選んだ市区町村が画面の3分の1くらいになるよう寄る（流れの先も見えるように）
  const [x0, y0, x1, y1] = bboxOf(i);
  const c = map.getContainer();
  const m = { x: c.clientWidth / 3, y: c.clientHeight / 3 };
  map.fitBounds([[x0, y0], [x1, y1]], { padding: { left: m.x, right: m.x, top: m.y, bottom: m.y }, maxZoom: 12, duration: SHOT ? 0 : 800 });
}

function select(i: number) {
  sel = i;
  if (map.getLayer("flows")) {
    map.setFilter("flows", lineFilter());
    map.setFilter("heads", lineFilter());
    map.setFilter("flows-case", lineFilter());
    map.setFilter("sel", ["==", ["get", "i"], sel]);
    map.setFilter("sel-line", ["==", ["get", "i"], sel]);
    map.setPaintProperty("flows", "line-color", colorOf());
    map.setPaintProperty("heads", "icon-color", colorOf());
    (map.getSource("intra-arrow") as maplibregl.GeoJSONSource).setData(intraArrow());
  }
  card();
  fitTo(i);
  if (!SHOT) {
    const u = new URL(location.href);
    if (sel >= 0) u.searchParams.set("m", U[sel].n);
    else u.searchParams.delete("m");
    history.replaceState(null, "", u);
  }
}

$("#lead").innerHTML =
  `<div class="stat"><b>${fmt((T.near + T.far) / 1e4)}</b><span>万トリップ/日</span></div>` +
  `東京都市圏で、自宅から私事（買い物・食事・通院など）へ向かうトリップのうち、発地と着地の市区町村が異なるもの（平日）。`;
$("#legend").innerHTML =
  `<div class="unit"><i class="ar" style="color:${FLOW}">➤</i>発地（自宅）→ 着地（私事の目的地）</div>` +
  `<div class="unit">${[1000, 5000, 10000].map((v) => `<span class="w"><i data-v="${v}" style="background:${FLOW}"></i>${fmt(v)}</span>`).join("")}<span>トリップ/日</span></div>` +
  `<div class="unit nw"><i class="ar2" style="color:${INTRA}">↔</i><span>内々トリップ（発地と着地が同じ市区町村）。市区町村を選んだときに数を示す</span></div>` +
  `<div class="unit"><span class="lb">市区町村名</span><span class="lb st"><i></i>駅名</span></div>`;
$("#note").innerHTML =
  `第6回東京都市圏パーソントリップ調査（2018年、平日）の拡大値。表d-1 の目的種類「自宅－私事」（自宅を発地とし、買い物・食事・通院・娯楽などの私事の目的地を着地とするトリップ）のうち、代表交通手段が鉄道・バス・自動車・自転車・徒歩のもの（二輪車・その他・不明は除く）で、発地と着地の市区町村が異なるもの。発地か着地が「○○（その他）」「以下不明」のトリップ（圏域内の自宅－私事の2%）は、場所が分からないので入れていない。` +
  `内々トリップ（発地と着地が同じ市区町村、${fmt(T.intra / 1e4)}万、全体の${pc(T.intra, T.trips)}）は、市区町村を選んだときに ↔ と数で示す（全体表示では描かない）。都市圏の外が発地・着地のトリップは入れていない。` +
  `表d-1 の計画基本ゾーンを市区町村（政令指定都市は区）にまとめた（${U.length}）。ゾーンが複数の町村にまたがるところは町村をつないで1つにした（例: 東松山市・吉見町）。` +
  `線は両端の市区町村のおおよその中心を結ぶ。全体表示では${fmt(MIN_DRAW)}トリップ以上の発地・着地の組だけを描く。` +
  `抽出調査なので小さい組ほど誤差が大きく、${fmt(mu.min_n)}トリップ以上（相対誤差30%以内の目安）の組は${mu.v.filter((v) => v >= mu.min_n).length}。` +
  `駅は国土数値情報の乗降客数（2018年）の多い${stations.length}駅（同じ駅名で1.5km以内の駅は合算）。灰色の細い線は鉄道路線（国土数値情報 鉄道、2024年）。`;

if (map.loaded()) setup();
else map.once("load", setup);

function setup() {
  const { lines, heads } = curves();
  // 確かめ用（scripts/verify_map.mjs が読む）
  if (SHOT) Object.assign(window, { __od: { lines, heads, map } });
  map.addImage("arrow", arrowImage(), { sdf: true });
  map.addSource("areas", {
    type: "geojson",
    data: areas,
    attribution:
      '出典：<a href="https://www.tokyo-pt.jp/data/01_02" target="_blank" rel="noopener">東京都市圏交通計画協議会ホームページ</a>' +
      "（第6回東京都市圏パーソントリップ調査 基礎集計 表d-1、計画基本ゾーン・小ゾーン）を加工して作成／" +
      "国土数値情報（駅別乗降客数・鉄道）（国土交通省）を加工して作成",
  });
  map.addSource("rail", { type: "geojson", data: rail });
  map.addSource("lines", { type: "geojson", data: lines });
  map.addSource("heads", { type: "geojson", data: heads });
  map.addSource("units", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: U.map((u, i) => ({
        type: "Feature",
        properties: { i, n: u.n, s: u.intra, t: u.intra + u.near + u.far },
        geometry: { type: "Point", coordinates: [u.x, u.y] },
      })),
    },
  });
  map.addSource("stations", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: stations.map((s) => ({ type: "Feature", properties: { n: s.n, r: s.r }, geometry: { type: "Point", coordinates: [s.x, s.y] } })),
    },
  });

  map.addLayer({ id: "fill", type: "fill", source: "areas", paint: { "fill-color": "#151a24" } });
  map.addLayer({ id: "sel", type: "fill", source: "areas", filter: ["==", ["get", "i"], sel], paint: { "fill-color": "#232b3b" } });
  map.addLayer({
    id: "border", type: "line", source: "areas",
    paint: { "line-color": "#2e3748", "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.4, 11, 1.2] },
  });
  // 鉄道路線（うっすら）
  map.addLayer({
    id: "rail", type: "line", source: "rail",
    paint: { "line-color": "#8a93a8", "line-opacity": 0.35, "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.5, 11, 1.2] },
  });
  // 線のふち（重なった線を見分けやすくする）
  map.addLayer({
    id: "flows-case", type: "line", source: "lines", filter: lineFilter(),
    layout: { "line-cap": "butt", "line-sort-key": ["get", "v"] },
    paint: { "line-color": BG, "line-opacity": 0.75, "line-width": byZoom(["+", 1.6, ["max", 0.35, ["get", "w"]]]) },
  });
  map.addLayer({
    id: "flows", type: "line", source: "lines", filter: lineFilter(),
    layout: { "line-cap": "butt", "line-sort-key": ["get", "v"] },
    paint: {
      "line-color": colorOf(),
      "line-width": lineWidth,
      "line-opacity": ["interpolate", ["linear"], ["get", "v"], 100, 0.35, 3000, 0.75, 10000, 0.95],
    },
  });
  map.addLayer({
    id: "heads", type: "symbol", source: "heads", filter: lineFilter(),
    layout: {
      "icon-image": "arrow",
      "icon-size": headSize,
      "icon-rotate": ["get", "b"],
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "symbol-sort-key": ["get", "v"],
    },
    paint: { "icon-color": colorOf(), "icon-opacity": ["interpolate", ["linear"], ["get", "v"], 100, 0.45, 3000, 0.85, 10000, 1] },
  });
  map.addLayer({
    id: "station-dot", type: "circle", source: "stations", minzoom: 8,
    paint: { "circle-radius": 2.4, "circle-color": STATION, "circle-stroke-color": BG, "circle-stroke-width": 1 },
  });
  map.addLayer({
    id: "station-label", type: "symbol", source: "stations", minzoom: 8,
    layout: {
      "text-field": ["get", "n"],
      "text-font": ["NotoSansJP-Regular"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 8, 10, 12, 13],
      "text-anchor": "left",
      "text-offset": [0.5, 0],
      "symbol-sort-key": ["-", 0, ["get", "r"]],
    },
    paint: { "text-color": STATION, "text-halo-color": BG, "text-halo-width": 1.4 },
  });
  map.addLayer({
    id: "unit-label", type: "symbol", source: "units",
    layout: {
      // 引いた状態ではトリップの多い市区町村だけ名前を出す
      "text-field": ["step", ["zoom"], ["case", [">=", ["get", "t"], 35000], ["get", "n"], ""],
        8.8, ["case", [">=", ["get", "t"], 15000], ["get", "n"], ""], 9.8, ["get", "n"]],
      "text-font": ["NotoSansJP-Regular"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 7, 10.5, 12, 15],
      "text-max-width": 6,
      "symbol-sort-key": ["-", 0, ["get", "t"]],
    },
    paint: { "text-color": "#e8e8ea", "text-halo-color": BG, "text-halo-width": 1.6 },
  });

  map.addLayer({
    id: "sel-line", type: "line", source: "areas", filter: ["==", ["get", "i"], sel],
    paint: { "line-color": "#e8e8ea", "line-width": 1.6 },
  });
  // 選んだ市区町村の内々トリップ（↔）
  map.addSource("intra-arrow", { type: "geojson", data: intraArrow() });
  map.addLayer({
    id: "intra-arrow-case", type: "line", source: "intra-arrow", filter: ["==", ["geometry-type"], "LineString"],
    paint: { "line-color": BG, "line-width": 7, "line-opacity": 0.8 },
  });
  map.addLayer({
    id: "intra-arrow", type: "line", source: "intra-arrow", filter: ["==", ["geometry-type"], "LineString"],
    paint: { "line-color": INTRA, "line-width": 3.5 },
  });
  map.addLayer({
    id: "intra-arrow-head", type: "symbol", source: "intra-arrow", filter: ["==", ["geometry-type"], "Point"],
    layout: {
      "icon-image": "arrow", "icon-size": 0.5, "icon-rotate": ["get", "b"], "icon-rotation-alignment": "map",
      "icon-allow-overlap": true, "icon-ignore-placement": true,
    },
    paint: { "icon-color": INTRA },
  });
  map.addLayer({
    id: "intra-arrow-label", type: "symbol", source: "intra-arrow", filter: ["==", ["get", "label"], 1],
    layout: {
      "text-field": ["get", "text"], "text-font": ["NotoSansJP-Regular"], "text-size": 13,
      "text-anchor": "top", "text-offset": [0, 0.9], "text-allow-overlap": true, "text-ignore-placement": true,
    },
    paint: { "text-color": INTRA, "text-halo-color": BG, "text-halo-width": 2 },
  });
  map.on("zoom", legendWidths);
  legendWidths();
  map.on("mousemove", "flows", (e) => {
    const f = e.features?.[0];
    if (!f) return;
    const { o, d, v } = f.properties as { o: number; d: number; v: number };
    const back = pairIndex.get(`${d}-${o}`);
    showTip(e.originalEvent.clientX, e.originalEvent.clientY,
      `<b>${U[o].n}</b> → <b>${U[d].n}</b><br>` +
      `<span class="big">${fmt(v)}</span><span class="small"> トリップ/日</span>${err(v)}<br>` +
      `<span class="small">逆向き（発地 ${U[d].n} → 着地 ${U[o].n}）${back !== undefined ? fmt(mu.v[back]) + " トリップ/日" : "表に値なし"}</span>`);
  });
  map.on("mouseleave", "flows", () => (tip.style.display = "none"));
  map.on("click", (e) => {
    const f = map.queryRenderedFeatures(e.point, { layers: ["fill"] })[0];
    if (!f) return;
    const i = Number(f.properties.i);
    select(i === sel ? -1 : i);
  });
  map.on("mouseenter", "fill", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "fill", () => (map.getCanvas().style.cursor = ""));
  window.addEventListener("resize", () => {
    map.resize();
    fitTo(sel);
  });
  map.resize();
  select(sel);
  map.once("idle", () => setTimeout(() => document.body.classList.add("ready"), 800));
}
