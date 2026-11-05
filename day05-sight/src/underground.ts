import * as maplibregl from "maplibre-gl";
import type { ExpressionSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "./underground.css";

maplibregl.setWorkerUrl(workerUrl);

const params = new URLSearchParams(location.search);
// タイルは scripts/underground（mlt CLI 0.6.1 で GeoJSON → MLT v2 → v1。GL JS 6.16 は v2 を読めない）。1レイヤー indoor、kind で床・壁・点字ブロック・地面を分ける
// 高さは整数 cm（b = 下端、t = 上端）。地下3階の床を 0 m に置いて積んでいる
const TILES = new URL("tiles/{z}/{x}/{y}.mlt", location.href).href.replace("%7Bz%7D", "{z}").replace("%7Bx%7D", "{x}").replace("%7By%7D", "{y}");

if (params.has("bare")) document.body.classList.add("bare");
// 録画では始めに地上だけを見せるので、発光は最初から消しておく（あとで消すと、消えていく途中が映る）
if (params.has("tour")) document.body.classList.add("glow-off");

// 階の色。地下は深いほど青紫（寒色）、地上は上ほど赤みの暖色
const COLORS: Record<string, string> = {
  B1: "#33d6ff", B2: "#4f7dff", B3: "#9b5cff",
  GL: "#ffc98a", "2F": "#ffab73", "3F": "#ff8c6b", "4F": "#f2707a",
};
const FLOOR_COLOR: ExpressionSpecification = ["match", ["get", "fl"], ...Object.entries(COLORS).flat(), "#8a8f99"] as unknown as ExpressionSpecification;

const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    sources: {
      indoor: { type: "vector", tiles: [TILES], encoding: "mlt", minzoom: 14, maxzoom: 18, bounds: [139.6955, 35.6864, 139.7048, 35.6963] } as maplibregl.VectorSourceSpecification,
    },
    layers: [{ id: "bg", type: "background", paint: { "background-color": "#05070c" } }],
  },
  center: [139.7002, 35.6908],
  zoom: 16.75,
  pitch: 62,
  bearing: -24,
  maxPitch: 85,
  attributionControl: false,
  hash: params.has("hash"),
});
map.on("error", (e) => console.error("map error:", e.error?.message ?? e));
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");

// 発光: 地下の階だけを描いた2枚目の地図を同じカメラで重ね、CSS でぼかして明るさを足す合成（screen）で乗せる。
// fill-extrusion には発光の描き方がないため。地上の階・地面・道路は光らせない
const glow = new maplibregl.Map({
  container: "glow",
  style: {
    version: 8,
    sources: { indoor: map.getStyle()?.sources?.indoor ?? { type: "vector", tiles: [TILES], encoding: "mlt", minzoom: 14, maxzoom: 18 } as maplibregl.VectorSourceSpecification },
    layers: [],
  },
  center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing(), maxPitch: 85,
  interactive: false,
  attributionControl: false,
});
const sync = () => glow.jumpTo({ center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() });
map.on("move", sync);

const H = (k: "b" | "t"): ExpressionSpecification => ["/", ["get", k], 100];
const kind = (k: string): ExpressionSpecification => ["==", ["get", "kind"], k];
const ug = (v: 0 | 1): ExpressionSpecification => ["==", ["get", "ug"], v];

map.on("load", () => {
  const add = (id: string, filter: ExpressionSpecification, color: ExpressionSpecification | string, opacity: number) =>
    map.addLayer({
      id, type: "fill-extrusion", source: "indoor", "source-layer": "indoor", filter,
      paint: { "fill-extrusion-color": color, "fill-extrusion-base": H("b"), "fill-extrusion-height": H("t"), "fill-extrusion-opacity": opacity },
    });
  // 下から描く: 地下 → 地面 → 地上
  add("under-floor", ["all", kind("floor"), ug(1)], FLOOR_COLOR, 0.55);
  add("under-wall", ["all", kind("wall"), ug(1)], FLOOR_COLOR, 0.95);
  add("under-twsi", ["all", kind("twsi"), ug(1)], "#ffd400", 1);
  add("ground", kind("ground"), "#1c1f26", 0.6);
  add("road", kind("road"), "#d8d2c4", 0.16);
  add("above-floor", ["all", kind("floor"), ug(0)], FLOOR_COLOR, 0.22);
  add("above-wall", ["all", kind("wall"), ug(0)], FLOOR_COLOR, 0.42);
  add("above-twsi", ["all", kind("twsi"), ug(0)], "#ffd400", 0.5);

  for (const [id, f] of [["glow-floor", "floor"], ["glow-wall", "wall"]] as const)
    glow.addLayer({
      id, type: "fill-extrusion", source: "indoor", "source-layer": "indoor", filter: ["all", kind(f), ug(1)],
      paint: { "fill-extrusion-color": FLOOR_COLOR, "fill-extrusion-base": H("b"), "fill-extrusion-height": H("t"), "fill-extrusion-opacity": f === "floor" ? 0.8 : 1 },
    });
  sync();

  if (params.has("rotate")) {
    const spin = () => { map.rotateTo(map.getBearing() + 120, { duration: 24000, easing: (t) => t }); };
    map.on("moveend", spin);
    spin();
  }
  if (params.has("tour")) tour();
});

// 録画用（?tour、約15秒）: 地面を不透明にして地上だけを見せる → 地下が浮かび上がる → 回りながら地面を消す。
// 終わると body に tour-done を付ける
function tour() {
  const under = { "under-floor": 0.55, "under-wall": 0.95, "under-twsi": 1 } as const;
  for (const id of Object.keys(under)) map.setPaintProperty(id, "fill-extrusion-opacity", 0);
  map.setPaintProperty("ground", "fill-extrusion-opacity", 0.97);
  document.body.classList.add("glow-off");
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const fadeTo = (id: string, o: number, ms: number) => {
    map.setPaintProperty(id, "fill-extrusion-opacity-transition", { duration: ms, delay: 0 });
    map.setPaintProperty(id, "fill-extrusion-opacity", o);
  };
  map.once("idle", async () => {
    document.body.classList.add("tour-start");
    await wait(2000);
    for (const [id, o] of Object.entries(under)) fadeTo(id, o, 2000);
    fadeTo("ground", 0.6, 2000);
    document.body.classList.remove("glow-off");
    await wait(2200);
    map.easeTo({ bearing: map.getBearing() + 90, pitch: 70, zoom: 16.6, duration: 10000, easing: (t) => t * (2 - t) });
    await wait(4500);
    // 地面と道路を消す（パネルの「地面」ボタンもオフの見た目にする）
    document.getElementById("t-ground")!.classList.remove("on");
    fadeTo("ground", 0, 1500);
    fadeTo("road", 0, 1500);
    await new Promise((r) => map.once("moveend", r));
    await wait(800);
    document.body.classList.add("tour-done");
  });
}

const toggle = (btn: string, layers: string[]) => {
  const el = document.getElementById(btn)!;
  el.addEventListener("click", () => {
    const on = el.classList.toggle("on");
    for (const l of layers) map.setLayoutProperty(l, "visibility", on ? "visible" : "none");
  });
};
toggle("t-above", ["above-floor", "above-wall", "above-twsi"]);
toggle("t-ground", ["ground", "road"]);
toggle("t-twsi", ["under-twsi", "above-twsi"]);

// 数字は prepare.py の stats.json から
type Stats = { floor_m2: Record<string, number>; underground_m2: number; above_m2: number; underground_share: number; twsi_line_m: number };
fetch(new URL("stats.json", location.href)).then((r) => r.json()).then((s: Stats) => {
  const man = (m2: number) => `${(m2 / 10000).toFixed(1)}万m²`;
  document.getElementById("lead")!.innerHTML =
    `この屋内地図にある床のうち <b>${Math.round(s.underground_share * 100)}%</b> は地下にある（地下 ${man(s.underground_m2)}、地上 ${man(s.above_m2)}）。地上を歩いていても、足の下に駅の大部分が広がっている。黄色は点字ブロック（線状 約${(s.twsi_line_m / 1000).toFixed(1)}km）。`;
  const order = ["4F", "3F", "2F", "GL", "B1", "B2", "B3"];
  const max = Math.max(...Object.values(s.floor_m2));
  document.getElementById("floors")!.innerHTML = order.map((k) => {
    const v = s.floor_m2[k] ?? 0;
    const c = COLORS[k] ?? "#8a8f99";
    return `<li><span class="k">${k === "GL" ? "地上1階" : k}</span><span class="bar"><i style="width:${(v / max) * 100}%;background:${c}"></i></span><span class="v">${v.toLocaleString()} m²</span></li>`;
  }).join("");
});
