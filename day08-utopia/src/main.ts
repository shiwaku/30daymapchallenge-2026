import * as maplibregl from "maplibre-gl";
import type { ExpressionSpecification, FilterSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "./style.css";

// 開発時は day08-utopia/web、公開時（day08-utopia/site/）は ../web を読む
const DATA = import.meta.env.DEV ? "./web/" : "../web/";
const AREA: [[number, number], [number, number]] = [[138.7, 35.5], [139.92, 36.29]];
const BG = "#0b0d12";
const GAP_COLOR = "#ff4fa3";
const TOP_COLOR = "#ffd75e";

// 段階ごとに、つながりの番号と長さ（km）の列、埋めるすき間の上限（m）
const STEPS = [
  { c: "c", km: "ckm", T: 0 },
  { c: "c300", km: "km300", T: 300 },
  { c: "c1000", km: "km1000", T: 1000 },
] as const;
// つながりの長さの段。短いものほど暗く、長いものほど明るい
const CLASSES = [
  { max: 1, label: "1km未満", color: "#2f3a4f", w: 0.9 },
  { max: 10, label: "1〜10km", color: "#3d78b8", w: 1.2 },
  { max: 50, label: "10〜50km", color: "#56c7d9", w: 1.6 },
  { max: Infinity, label: "50km以上", color: "#c9f6ff", w: 2.0 },
];

type Fill = {
  n_gaps: number; gaps_m: number; largest_km: number; largest_share: number;
  largest_n_gaps: number; largest_gaps_m: number; largest_members: number;
};
type Stats = {
  total_km: number; n_components: number; largest_km: number; largest_share: number;
  by_kind_km: Record<string, number>; fill: Record<string, Fill>; snap_m: number; gap_min_km: number;
};

maplibregl.setWorkerUrl(workerUrl);

const params = new URLSearchParams(location.search);
const POSTER = params.has("poster");
// 地図は読み込み直後に URL へ位置を書くので、開いたときに位置が付いていたかを先に覚えておく
const HAD_HASH = location.hash.length > 1;
const map = new maplibregl.Map({
  container: "map",
  hash: !POSTER,
  bounds: AREA,
  minZoom: 5,
  maxZoom: 16,
  attributionControl: false,
  localIdeographFontFamily: "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', sans-serif",
  canvasContextAttributes: { preserveDrawingBuffer: POSTER },
  style: {
    version: 8,
    sources: {},
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    layers: [{ id: "background", type: "background", paint: { "background-color": BG } }],
  },
});
map.addControl(new maplibregl.AttributionControl({ compact: false }));
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
if (POSTER) document.body.classList.add("poster");

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const fmt = (v: number, d = 1) => v.toLocaleString("ja-JP", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function byLength(prop: string, pick: (c: (typeof CLASSES)[number]) => number | string): ExpressionSpecification {
  const expr: unknown[] = ["step", ["get", prop], pick(CLASSES[0])];
  for (let i = 1; i < CLASSES.length; i++) expr.push(CLASSES[i - 1].max, pick(CLASSES[i]));
  return expr as ExpressionSpecification;
}

function fit() {
  if (HAD_HASH && !POSTER) return;
  const wide = window.innerWidth >= 900;
  const panel = $("#title").getBoundingClientRect();
  map.fitBounds(AREA, {
    padding: wide
      ? { left: panel.right + 8, right: 40, top: 24, bottom: 36 }
      : { left: 12, right: 12, top: 12, bottom: window.innerHeight - panel.top + 8 },
    animate: false,
  });
}

async function main() {
  const load = (f: string) => fetch(DATA + f).then((r) => r.json());
  const [bike, gaps, base, land, places, stats] = (await Promise.all(
    ["bike.geojson", "gaps.geojson", "base.geojson", "land.geojson", "places.geojson", "stats.json"].map(load),
  )) as [GeoJSON.FeatureCollection, GeoJSON.FeatureCollection, GeoJSON.FeatureCollection, GeoJSON.FeatureCollection, GeoJSON.FeatureCollection, Stats];

  const OSM = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>（ODbL）を加工して作成';
  map.addSource("land", { type: "geojson", data: land });
  map.addSource("base", { type: "geojson", data: base });
  map.addSource("bike", { type: "geojson", data: bike, attribution: OSM });
  map.addSource("gaps", { type: "geojson", data: gaps });
  map.addSource("places", {
    type: "geojson",
    data: { ...places, features: places.features.filter((f) => f.properties?.name !== "東京都") },
  });

  map.addLayer({ id: "land", type: "fill", source: "land", paint: { "fill-color": "#12151d" } });
  map.addLayer({
    id: "river", type: "line", source: "base", filter: ["==", ["get", "kind"], "river"],
    paint: { "line-color": "#1b3149", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.8, 14, 3] },
  });
  map.addLayer({
    id: "road", type: "line", source: "base", filter: ["in", ["get", "kind"], ["literal", ["road", "major"]]],
    paint: {
      "line-color": ["match", ["get", "kind"], "major", "#2b2f39", "#20232b"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 8, ["match", ["get", "kind"], "major", 0.9, 0.5], 14, 3],
    },
  });
  map.addLayer({
    id: "pref", type: "line", source: "base", filter: ["==", ["get", "kind"], "pref"],
    paint: { "line-color": "#4a4f5c", "line-width": 1, "line-dasharray": [3, 2] },
  });

  // 最大のつながりの発光（段階ごとに filter を変える）
  for (const g of [
    { id: "top-glow-outer", w: [7, 40], blur: [7, 40], o: 0.3 },
    { id: "top-glow-inner", w: [2.6, 12], blur: [2, 8], o: 0.75 },
  ]) {
    map.addLayer({
      id: g.id, type: "line", source: "bike",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": TOP_COLOR,
        "line-width": ["interpolate", ["exponential", 2], ["zoom"], 8, g.w[0], 14, g.w[1]],
        "line-blur": ["interpolate", ["exponential", 2], ["zoom"], 8, g.blur[0], 14, g.blur[1]],
        "line-opacity": g.o,
      },
    });
  }
  map.addLayer({
    id: "bike", type: "line", source: "bike",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {},
  });
  map.addLayer({
    id: "gap-glow", type: "line", source: "gaps",
    layout: { "line-cap": "round" },
    paint: {
      "line-color": GAP_COLOR,
      "line-width": ["interpolate", ["exponential", 2], ["zoom"], 8, 9, 14, 40],
      "line-blur": ["interpolate", ["exponential", 2], ["zoom"], 8, 7, 14, 30],
      "line-opacity": 0.55,
    },
  });
  map.addLayer({
    id: "gap", type: "line", source: "gaps",
    layout: { "line-cap": "round" },
    paint: {
      "line-color": "#ffd1ea",
      "line-width": ["interpolate", ["exponential", 2], ["zoom"], 8, 2.2, 14, 7],
    },
  });
  map.addLayer({
    id: "places", type: "symbol", source: "places", minzoom: 9.2,
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Open Sans Regular"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 9, 10, 13, 13],
      "text-padding": 6,
    },
    paint: { "text-color": "#7d818c", "text-halo-color": BG, "text-halo-width": 1.4 },
  });

  // ---- 段階 ----
  const legend = $("#legend");
  legend.innerHTML =
    `<div class="unit">つながりの長さ（つながっている自転車の道の合計）</div>` +
    CLASSES.map((c) => `<span class="item"><i class="bar" style="background:${c.color};height:${c.w * 2}px"></i>${c.label}</span>`).join("") +
    `<span class="item"><i class="bar top"></i>いちばん長いつながり</span>` +
    `<span class="item"><i class="bar gap"></i>埋めると仮定したすき間（直線）</span>`;

  $("#lead").textContent =
    `OpenStreetMap で、東京都（島しょ部を除く）と埼玉県の自転車に適した道を集めると約${fmt(stats.total_km, 0)}km。` +
    `でも、ひと続きに走れるのはいちばん長いところでも約${fmt(stats.largest_km, 0)}km。短いすき間を埋めたら、どこまでつながるかを計算した。`;

  const captions = [
    () =>
      `<b>${fmt(stats.total_km, 0)}km</b> の道が <b>${stats.n_components.toLocaleString()}</b> のかたまりに分かれている。` +
      `いちばん長いつながりは <b class="top">${fmt(stats.largest_km)}km</b>（全体の${pct(stats.largest_share)}）。` +
      `<div class="small">長いつながりの多くは、荒川・江戸川・多摩川などの川沿いの道。街の中の自転車レーンは短く途切れている。</div>`,
    () => {
      const f = stats.fill["300"];
      return `300m以下のすき間 <b class="gap">${f.n_gaps}か所</b>（合計${fmt(f.gaps_m / 1000)}km）を埋めると、` +
        `いちばん長いつながりは <b class="top">${fmt(f.largest_km)}km</b>。` +
        `<div class="small">短いすき間だけでは、大きくはつながらない。</div>`;
    },
    () => {
      const f = stats.fill["1000"];
      return `1km以下のすき間 <b class="gap">${f.n_gaps}か所</b>（合計${fmt(f.gaps_m / 1000)}km）を埋めると、` +
        `いちばん長いつながりは <b class="top">${fmt(f.largest_km)}km</b>（全体の${pct(f.largest_share)}）。` +
        `<div class="small">このつながりに入るすき間は${f.largest_n_gaps}か所・合計${fmt(f.largest_gaps_m / 1000)}km。` +
        `すき間は直線距離で、計算の結果（計画ではない）。</div>`;
    },
  ];

  let current = -1;
  function show(i: number) {
    if (i === current) return;
    current = i;
    const s = STEPS[i];
    map.setPaintProperty("bike", "line-color", ["case", ["==", ["get", s.c], 0], "#fff1c2", byLength(s.km, (c) => c.color)]);
    // いちばん長いつながりを上に描く
    map.setLayoutProperty("bike", "line-sort-key", ["case", ["==", ["get", s.c], 0], 1, 0]);
    map.setPaintProperty("bike", "line-width",
      ["interpolate", ["exponential", 2], ["zoom"], 8, byLength(s.km, (c) => c.w), 14, ["*", 3, byLength(s.km, (c) => c.w)]]);
    const top: FilterSpecification = ["==", ["get", s.c], 0];
    map.setFilter("top-glow-outer", top);
    map.setFilter("top-glow-inner", top);
    const gf: FilterSpecification = ["<=", ["get", "m"], s.T];
    map.setFilter("gap", gf);
    map.setFilter("gap-glow", gf);
    $("#caption").innerHTML = captions[i]();
    document.querySelectorAll<HTMLButtonElement>("#steps button").forEach((b) => b.classList.toggle("on", Number(b.dataset.step) === i));
  }

  const startStep = Number(params.get("step") ?? 0);
  show(startStep);
  // パネルの文が入ってから、パネルを避けて地図を合わせる
  fit();
  let auto: number | undefined;
  if (!POSTER && !params.has("step")) {
    let k = 0;
    auto = window.setInterval(() => {
      k++;
      if (k >= STEPS.length) return window.clearInterval(auto);
      show(k);
    }, 6000);
  }
  document.querySelectorAll<HTMLButtonElement>("#steps button").forEach((b) =>
    b.addEventListener("click", () => {
      window.clearInterval(auto);
      show(Number(b.dataset.step));
    }),
  );

  // ---- ポップアップ（マウスを乗せると出す） ----
  const tip = $("#tip");
  map.on("mousemove", (e) => {
    const hit = map.queryRenderedFeatures(
      [[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]], { layers: ["gap", "bike"] },
    )[0];
    if (!hit) {
      tip.style.display = "none";
      map.getCanvas().style.cursor = "";
      return;
    }
    const p = hit.properties as Record<string, number>;
    const s = STEPS[current];
    tip.innerHTML = hit.layer.id === "gap"
      ? `<b class="gap">すき間 ${p.m.toLocaleString()}m</b>（直線）<br>${fmt(p.a)}km と ${fmt(p.b)}km のつながりの間<br><span class="small">計算の結果で、計画ではない</span>`
      : `このつながり <b>${fmt(p[s.km])}km</b>${p[s.c] === 0 ? "（いちばん長い）" : ""}<br><span class="small">${["自転車道", "車道の自転車レーン・自転車道", "歩行者と共用"][p.k]}</span>`;
    tip.style.display = "block";
    tip.style.left = `${e.point.x + 14}px`;
    tip.style.top = `${e.point.y + 14}px`;
    map.getCanvas().style.cursor = "pointer";
  });

  map.once("idle", () => document.body.classList.add("ready"));
}

map.on("load", () => {
  main();
});
