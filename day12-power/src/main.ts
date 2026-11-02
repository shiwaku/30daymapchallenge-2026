import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { Protocol } from "pmtiles";
import type { FeatureCollection } from "geojson";
import "./style.css";

// 開発時は day12-power/web、公開時（day12-power/site/）は ../web を読む
const DATA = import.meta.env.DEV ? "./web/" : "../web/";
// 背景（海岸線・水部・都府県界）は国土地理院最適化ベクトルタイルの PMTiles を配信元から直接読む
const GSI_PMTILES = "https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/optimal_bvmap-v1.pmtiles";
const GSI_REPO = "https://github.com/gsi-cyberjapan/optimal_bvmap";
const GSI_TERMS = "https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html";

const JAPAN: [[number, number], [number, number]] = [[122.9, 24.0], [146.0, 45.6]]; // 先島諸島から北海道まで
const BG = "#05060a";
const LINE = "#ffb54a";
const CORE = "#fff4d6";
const PLANT = "#ffffff";
const SUB = "#5fd4ff";

type Stats = {
  total_km: number;
  z14_tiles_read: number;
  z14_tiles_with_lines: number;
  merged_lines: number;
  labels: Record<string, number>;
};

maplibregl.setWorkerUrl(workerUrl);
const protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

const params = new URLSearchParams(location.search);
const POSTER = params.has("poster");
const HAD_HASH = location.hash.length > 1;

const map = new maplibregl.Map({
  container: "map",
  hash: !POSTER,
  bounds: JAPAN,
  minZoom: 3.5,
  maxZoom: 17,
  attributionControl: false,
  localIdeographFontFamily: "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', sans-serif",
  canvasContextAttributes: { preserveDrawingBuffer: POSTER },
  style: {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      gsi: { type: "vector", url: `pmtiles://${GSI_PMTILES}` },
    },
    layers: [{ id: "background", type: "background", paint: { "background-color": BG } }],
  },
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
if (POSTER) document.body.classList.add("poster");

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const n0 = (v: number) => v.toLocaleString("ja-JP");

function fit() {
  if (HAD_HASH && !POSTER) return;
  const wide = window.innerWidth >= 900;
  const panel = $("#title").getBoundingClientRect();
  map.fitBounds(JAPAN, {
    padding: wide
      ? { left: panel.right + 8, right: 24, top: 16, bottom: 40 }
      : { left: 8, right: 8, top: 8, bottom: window.innerHeight - panel.top + 4 },
    animate: false,
  });
}

async function main() {
  const load = (f: string) => fetch(DATA + f).then((r) => r.json());
  const [power, plants, stats] = (await Promise.all(["power.geojson", "plants.geojson", "stats.json"].map(load))) as [
    FeatureCollection,
    FeatureCollection,
    Stats,
  ];

  // ---- 背景（暗く、控えめに） ----
  map.addLayer({
    id: "water", type: "fill", source: "gsi", "source-layer": "WA",
    paint: { "fill-color": "#070a12" },
  });
  map.addLayer({
    id: "coast", type: "line", source: "gsi", "source-layer": "Cstline",
    paint: { "line-color": "#24324a", "line-width": 0.8 },
  });
  map.addLayer({
    id: "pref", type: "line", source: "gsi", "source-layer": "AdmBdry",
    filter: ["in", ["get", "vt_code"], ["literal", [1211, 51211]]],
    paint: { "line-color": "#262a35", "line-width": 0.7, "line-dasharray": [3, 2] },
  });
  map.addLayer({
    id: "road", type: "line", source: "gsi", "source-layer": "RdCL", minzoom: 10,
    paint: { "line-color": "#14171f", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.4, 16, 2] },
  });

  // ---- 送電線（発光） ----
  map.addSource("power", { type: "geojson", data: power, tolerance: 0.25, buffer: 64 });
  for (const g of [
    { id: "glow-outer", w: [5, 14, 36], blur: [5, 12, 30], o: [0.16, 0.22, 0.25] },
    { id: "glow-inner", w: [1.8, 4.5, 10], blur: [1.2, 3, 6], o: [0.45, 0.6, 0.65] },
  ]) {
    map.addLayer({
      id: g.id, type: "line", source: "power",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": LINE,
        "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 4, g.w[0], 9, g.w[1], 15, g.w[2]],
        "line-blur": ["interpolate", ["exponential", 1.6], ["zoom"], 4, g.blur[0], 9, g.blur[1], 15, g.blur[2]],
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 4, g.o[0], 9, g.o[1], 15, g.o[2]],
      },
    });
  }
  map.addLayer({
    id: "power", type: "line", source: "power",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": CORE,
      "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 4, 0.35, 9, 0.9, 15, 2.2],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.7, 8, 0.9],
    },
  });

  // ---- 発電所・変電所（地図の名前の注記の位置） ----
  map.addSource("plants", { type: "geojson", data: plants });
  map.addLayer({
    id: "plant-glow", type: "circle", source: "plants",
    paint: {
      "circle-color": ["match", ["get", "kind"], "発電所", PLANT, SUB],
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, ["match", ["get", "kind"], "発電所", 2.2, 1.6], 10, ["match", ["get", "kind"], "発電所", 9, 6], 15, 16],
      "circle-blur": 1,
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.25, 9, 0.45],
    },
  });
  map.addLayer({
    id: "plant", type: "circle", source: "plants",
    paint: {
      "circle-color": ["match", ["get", "kind"], "発電所", PLANT, SUB],
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, ["match", ["get", "kind"], "発電所", 0.8, 0.7], 10, ["match", ["get", "kind"], "発電所", 2.8, 2.2], 15, 5],
    },
  });
  map.addLayer({
    id: "plant-label", type: "symbol", source: "plants", minzoom: 10,
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Open Sans Regular"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 10, 11, 15, 14],
      "text-offset": [0, 1.0],
      "text-anchor": "top",
      "text-padding": 4,
    },
    paint: {
      "text-color": ["match", ["get", "kind"], "発電所", "#f4f4f6", "#a9e6ff"],
      "text-halo-color": BG,
      "text-halo-width": 1.6,
    },
  });

  // ---- 文 ----
  const nPlant = stats.labels["発電所"] ?? 0;
  const nSub = (stats.labels["変電所"] ?? 0) + (stats.labels["開閉所"] ?? 0) + (stats.labels["変換所"] ?? 0);
  $("#lead").textContent =
    "国土地理院の地図にある送電線を、全国分つないで光らせた。地理院のベクトルタイルでは、送電線は拡大した地図（ズーム14〜16）にしか入っていないので、ズーム14のタイルを全部読んで集めた。";
  $("#stats").innerHTML =
    `<div><b>${n0(stats.total_km)}</b> km<span>送電線の長さ（地図上の線の合計）</span></div>` +
    `<div><b>${n0(nPlant)}</b><span>「〜発電所」の名前の注記</span></div>` +
    `<div><b>${n0(nSub)}</b><span>「〜変電所」などの名前の注記</span></div>`;
  $("#note").textContent =
    "線は地図の表現で、電圧・事業者・周波数の情報はない。地図に描かれていない送電線（地中の線など）は入らない。点は地図に書かれた名前の位置で、施設の全数ではない。";

  const tiles = `<a href="${GSI_REPO}" target="_blank" rel="noopener">国土地理院最適化ベクトルタイル</a>`;
  $("#credit").innerHTML =
    `出典: ${tiles}（2026年7月1日時点のデータ）を加工して作成（<a href="${GSI_TERMS}" target="_blank" rel="noopener">国土地理院コンテンツ利用規約</a>）`;

  fit();

  // ---- ポップアップ ----
  const tip = $("#tip");
  map.on("mousemove", (e) => {
    const hit = map.queryRenderedFeatures(
      [[e.point.x - 5, e.point.y - 5], [e.point.x + 5, e.point.y + 5]], { layers: ["plant", "power"] },
    )[0];
    if (!hit) {
      tip.style.display = "none";
      map.getCanvas().style.cursor = "";
      return;
    }
    tip.innerHTML = hit.layer.id === "plant"
      ? `<b>${hit.properties?.name}</b><br><span class="small">地図の名前の注記の位置</span>`
      : `送電線<br><span class="small">国土地理院の地図の線（電圧などの情報はない）</span>`;
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

declare global {
  interface Window { __day12: maplibregl.Map }
}
window.__day12 = map;
