import * as maplibregl from "maplibre-gl";
import type { ExpressionSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { Protocol } from "pmtiles";
import "./style.css";

// 開発時は day03-polygons/data、公開時（day03-polygons/site/）は ../data を読む
const DATA = import.meta.env.DEV ? "./data/" : "../data/";

// 用途地域の13色。mlit-urban-planning-converter の data/styles.json と同じ
const ZONES: [number, string, string][] = [
  [1, "第一種低層住居専用", "#00ff99"],
  [2, "第二種低層住居専用", "#00552e"],
  [3, "第一種中高層住居専用", "#92d050"],
  [4, "第二種中高層住居専用", "#ccff99"],
  [5, "第一種住居", "#ffff66"],
  [6, "第二種住居", "#ffcc99"],
  [7, "準住居", "#ffcc66"],
  [8, "田園住居", "#d7eb6e"],
  [9, "近隣商業", "#ff66cc"],
  [10, "商業", "#ff0066"],
  [11, "準工業", "#9900ff"],
  [12, "工業", "#ccffff"],
  [13, "工業専用", "#33ccff"],
];
const ZONE_COLOR = ["match", ["get", "code"], ...ZONES.flatMap(([c, , col]) => [c, col]), "#888888"] as ExpressionSpecification;

// 高さ（m）＝容積率（%）× 係数。全体が見えるよう、ズームを引くほど係数を大きくして誇張する
const HEIGHT: ExpressionSpecification = [
  "interpolate", ["linear"], ["zoom"],
  8, ["*", ["get", "far"], 12],
  10, ["*", ["get", "far"], 3.5],
  12, ["*", ["get", "far"], 1],
  14, ["*", ["get", "far"], 0.3],
];

// 見て回る場所
const VIEWS: { name: string; center: [number, number]; zoom: number; bearing: number }[] = [
  { name: "東京", center: [139.745, 35.665], zoom: 11.6, bearing: -25 },
  { name: "大阪", center: [135.5, 34.685], zoom: 11.6, bearing: 20 },
  { name: "名古屋", center: [136.9, 35.165], zoom: 11.9, bearing: -15 },
  { name: "福岡", center: [130.405, 33.585], zoom: 12.0, bearing: 10 },
  { name: "札幌", center: [141.35, 43.06], zoom: 11.9, bearing: -10 },
  { name: "関東", center: [139.7, 35.75], zoom: 8.7, bearing: -15 },
];
const PITCH = 62;

type Stats = {
  features: number;
  km2: number;
  no_far: number;
  no_far_cities: number;
  cities: number;
  by_far: { far: number; km2: number }[];
  max_far: { pref: string; city: string; km2: number }[];
};

maplibregl.setWorkerUrl(workerUrl);
const protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

const RECORD = new URLSearchParams(location.search).has("record");
const first = VIEWS[0];
const map = new maplibregl.Map({
  container: "map",
  hash: !RECORD,
  center: first.center,
  zoom: first.zoom,
  bearing: first.bearing,
  pitch: PITCH,
  maxPitch: 75,
  minZoom: 4,
  maxZoom: 16,
  attributionControl: false,
  style: {
    version: 8,
    sources: {
      pale: {
        type: "raster",
        tiles: ["https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: 18,
        attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>',
      },
      youto: {
        type: "vector",
        url: `pmtiles://${new URL(DATA + "youto_far.pmtiles", location.href).href}`,
        attribution:
          '<a href="https://www.mlit.go.jp/toshi/tosiko/toshi_tosiko_tk_000087.html" target="_blank" rel="noopener">「都市計画決定GISデータ」（国土交通省）</a>を加工して作成',
      },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#0b0d12" } },
      // 背景の地図は、場所が分かる程度に暗くして色を抜く
      {
        id: "pale",
        type: "raster",
        source: "pale",
        paint: { "raster-saturation": -1, "raster-brightness-min": 0, "raster-brightness-max": 0.16, "raster-opacity": 0.9 },
      },
      // 容積率の入っていない面は平らに描く
      {
        id: "no-far",
        type: "fill",
        source: "youto",
        "source-layer": "youto",
        filter: ["!", ["has", "far"]],
        paint: { "fill-color": "#6b6f78", "fill-opacity": 0.45 },
      },
      {
        id: "far",
        type: "fill-extrusion",
        source: "youto",
        "source-layer": "youto",
        filter: ["has", "far"],
        paint: {
          "fill-extrusion-color": ZONE_COLOR,
          "fill-extrusion-height": HEIGHT,
          "fill-extrusion-opacity": 0.92,
          "fill-extrusion-vertical-gradient": true,
        },
      },
    ],
    light: { anchor: "viewport", position: [1.3, 210, 40], intensity: 0.35, color: "#ffffff" },
  },
});
map.addControl(new maplibregl.AttributionControl({ compact: false }));
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

async function main() {
  const s = (await fetch(DATA + "stats.json").then((r) => r.json())) as Stats;

  // 数字はすべてこのデータから出す
  const withFar = s.by_far.reduce((a, r) => a + r.km2, 0);
  const at = (ok: (f: number) => boolean) => s.by_far.filter((r) => ok(r.far)).reduce((a, r) => a + r.km2, 0);
  const pct = (x: number) => Math.round((100 * x) / withFar);
  const km = (x: number) => (x >= 100 ? Math.round(x).toLocaleString("ja-JP") : x.toFixed(1));
  const maxFar = Math.max(...s.by_far.map((r) => r.far));
  const maxPlaces = s.max_far.filter((r) => r.km2 >= 0.1).map((r) => r.city);

  $("#caption").innerHTML =
    `<div>容積率が分かる面の<b>${pct(at((f) => f === 200))}%</b>は200%。</div>` +
    `<div>1000%以上は合わせて約<b>${km(at((f) => f >= 1000))}km²</b>。いちばん高い${maxFar}%は、${maxPlaces.join("・")}などにしかない。</div>` +
    `<div class="small">用途地域は合わせて約${km(s.km2)}km²（国土の約${Math.round((100 * s.km2) / 377975)}%）。${s.cities.toLocaleString("ja-JP")}市区町村、${s.features.toLocaleString("ja-JP")}面。</div>`;
  $("#legend").innerHTML = ZONES.map(([, name, col]) => `<div class="item"><span class="sw" style="background:${col}"></span>${name}</div>`).join("");

  let step = -1;
  function show(i: number, instant = false) {
    step = i;
    const v = VIEWS[i];
    document.querySelectorAll<HTMLButtonElement>("#steps button").forEach((b, j) => b.classList.toggle("on", j === i));
    const camera = { center: v.center, zoom: v.zoom, bearing: v.bearing, pitch: PITCH };
    if (instant) map.jumpTo(camera);
    else map.flyTo({ ...camera, duration: 4500, essential: true });
  }
  $("#steps").innerHTML = VIEWS.map((v) => `<li><button type="button">${v.name}</button></li>`).join("");
  document.querySelectorAll<HTMLButtonElement>("#steps button").forEach((b, i) =>
    b.addEventListener("click", () => {
      stopAuto();
      show(i);
    }),
  );

  if (RECORD) {
    document.body.classList.add("record");
    (window as unknown as { __show: typeof show }).__show = show;
    return;
  }
  if (!location.hash) show(0, true);
  else document.querySelectorAll<HTMLButtonElement>("#steps button").forEach((b) => b.classList.remove("on"));

  // 最初は順に自動で回る。ボタンを押すか地図を動かしたら止める
  let timer = location.hash ? 0 : window.setInterval(() => show((step + 1) % VIEWS.length), 9000);
  function stopAuto() {
    clearInterval(timer);
    timer = 0;
  }
  map.on("dragstart", stopAuto);
  map.on("wheel", stopAuto);
}

map.on("load", main);
