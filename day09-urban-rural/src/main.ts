import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "./style.css";

// 開発時は day09-urban-rural/data/web、公開時（day09-urban-rural/site/）は ../data/web を読む
const DATA = import.meta.env.DEV ? "./data/web/" : "../data/web/";

maplibregl.setWorkerUrl(workerUrl);

type Ring = { r: string; p00: number; p20: number };
type Props = {
  rank: number; name: string; name_en: string; country: string; type: "sprawl" | "dense" | "shrink"; donut: boolean;
  pop00: number; pop20: number; built00: number; built20: number; lcr: number | null; m2pp00: number; m2pp20: number; rings: string;
};

const COLORS = { sprawl: "#ff8c26", dense: "#4fc3f7", shrink: "#b39ddb" };
const LABELS = { sprawl: "広がった", dense: "詰まった", shrink: "減っても広がった" };
const TYPE_COLOR: maplibregl.ExpressionSpecification = ["match", ["get", "type"], "sprawl", COLORS.sprawl, "dense", COLORS.dense, COLORS.shrink];
const RADIUS: maplibregl.ExpressionSpecification = ["interpolate", ["linear"], ["sqrt", ["get", "pop20"]], 1500, 4, 5500, 15];

const map = new maplibregl.Map({
  container: "map",
  hash: true,
  center: [75, 22],
  zoom: 2.2,
  attributionControl: false,
  style: {
    version: 8,
    projection: { type: "globe" },
    sources: {
      ocean: { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]] } } },
      countries: { type: "geojson", data: DATA + "countries.geojson", attribution: '<a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a>' },
      cities: {
        type: "geojson", data: DATA + "cities.geojson", promoteId: "rank",
        attribution: '<a href="https://human-settlement.emergency.copernicus.eu/" target="_blank" rel="noopener">GHSL（European Commission, JRC）GHS-POP・GHS-BUILT-S R2023A</a>（CC BY 4.0）を加工して作成',
      },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#0b0d12" } },
      { id: "ocean", type: "fill", source: "ocean", paint: { "fill-color": "#121722" } },
      { id: "land", type: "fill", source: "countries", paint: { "fill-color": "#2b313d" } },
      { id: "border", type: "line", source: "countries", paint: { "line-color": "#3a414e", "line-width": 0.6 } },
      // ドーナツの都市は輪だけで描く
      {
        id: "city", type: "circle", source: "cities",
        paint: {
          "circle-radius": RADIUS,
          "circle-color": TYPE_COLOR,
          "circle-opacity": ["case", ["get", "donut"], 0, 0.88],
          "circle-stroke-color": ["case", ["get", "donut"], TYPE_COLOR, "#0b0d12"],
          "circle-stroke-width": ["case", ["get", "donut"], 3.5, 0.8],
          "circle-pitch-alignment": "map",
        },
      },
      {
        id: "city-sel", type: "circle", source: "cities",
        paint: {
          "circle-radius": ["+", RADIUS, 5],
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": ["case", ["boolean", ["feature-state", "sel"], false], 1.5, 0],
          "circle-pitch-alignment": "map",
        },
      },
    ],
  },
});
map.addControl(new maplibregl.AttributionControl({ compact: false, customAttribution: "コードの作成に生成AI（Claude Code）を使用" }));
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}百万人` : `${Math.round(n / 1e4)}万人`);
const pct = (a: number, b: number) => {
  const v = (b / a - 1) * 100;
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(0)}%`;
};

// 中心からの距離帯ごとの増減を横棒で描く
function ringsSvg(rings: Ring[]) {
  const W = 300, rowH = 26, left = 70, mid = left + (W - left) / 2, half = (W - left) / 2 - 36;
  const vals = rings.map((r) => r.p20 / r.p00 - 1);
  const max = Math.max(0.5, ...vals.map(Math.abs));
  const rows = rings.map((r, i) => {
    const v = vals[i], w = (Math.abs(v) / max) * half, y = i * rowH;
    const x = v >= 0 ? mid : mid - w;
    const color = v >= 0 ? "#e8e8ea" : "#ff5a5f";
    const tx = v >= 0 ? mid + w + 4 : mid - w - 4;
    return `<text x="0" y="${y + 17}" class="lab">${r.r.replace("-", "〜")} km</text>
      <rect x="${x}" y="${y + 6}" width="${Math.max(w, 1)}" height="14" fill="${color}" rx="2"/>
      <text x="${tx}" y="${y + 17}" class="val" text-anchor="${v >= 0 ? "start" : "end"}">${pct(r.p00, r.p20)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${rings.length * rowH + 4}" width="100%"><line x1="${mid}" x2="${mid}" y1="2" y2="${rings.length * rowH + 2}" stroke="#555"/>${rows.join("")}</svg>`;
}

let selected: number | null = null;
function select(p: Props | null) {
  if (selected !== null) map.setFeatureState({ source: "cities", id: selected }, { sel: false });
  const panel = document.querySelector<HTMLElement>("#city")!;
  if (!p) { selected = null; panel.hidden = true; return; }
  selected = p.rank;
  map.setFeatureState({ source: "cities", id: p.rank }, { sel: true });
  panel.hidden = false;
  document.querySelector("#c-name")!.textContent = `${p.rank}. ${p.name}`;
  document.querySelector("#c-type")!.innerHTML =
    `<span class="tag" style="background:${COLORS[p.type]}">${LABELS[p.type]}</span>` + (p.donut ? `<span class="tag ring">ドーナツ</span>` : "");
  // 人口がほぼ横ばい（±5% 未満）だと比が大きく振れるので数字を出さない
  const flat = Math.abs(p.pop20 / p.pop00 - 1) < 0.05;
  const lcr = p.lcr === null || p.type === "shrink" ? "—" : flat ? "人口ほぼ横ばい" : p.lcr.toFixed(2);
  document.querySelector("#c-table")!.innerHTML = `
    <tr><th></th><th>2000</th><th>2020</th><th></th></tr>
    <tr><td>人口</td><td>${fmt(p.pop00)}</td><td>${fmt(p.pop20)}</td><td>${pct(p.pop00, p.pop20)}</td></tr>
    <tr><td>建物の面積</td><td>${Math.round(p.built00)} km²</td><td>${Math.round(p.built20)} km²</td><td>${pct(p.built00, p.built20)}</td></tr>
    <tr><td>1人あたり</td><td>${p.m2pp00.toFixed(0)} m²</td><td>${p.m2pp20.toFixed(0)} m²</td><td>${pct(p.m2pp00, p.m2pp20)}</td></tr>
    <tr><td colspan="3">建物の伸び ÷ 人口の伸び（SDG 11.3.1）</td><td>${lcr}</td></tr>`;
  document.querySelector("#c-rings")!.innerHTML = ringsSvg(JSON.parse(p.rings));
  const img = document.querySelector<HTMLImageElement>("#c-img")!;
  img.src = `${DATA}built/${p.rank}.png`;
  img.alt = `${p.name} の建物の広がり`;
}

const tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10, className: "tip" });
map.on("mousemove", "city", (e) => {
  const p = e.features![0].properties as Props;
  map.getCanvas().style.cursor = "pointer";
  tip.setLngLat(e.lngLat).setHTML(`<b>${p.name}</b> ${LABELS[p.type]}${p.donut ? "・ドーナツ" : ""}`).addTo(map);
});
map.on("mouseleave", "city", () => { map.getCanvas().style.cursor = ""; tip.remove(); });
map.on("click", "city", (e) => select(e.features![0].properties as Props));
document.querySelector("#close")!.addEventListener("click", () => select(null));

// 開発時の確認用
if (import.meta.env.DEV) (window as unknown as { map: maplibregl.Map }).map = map;
