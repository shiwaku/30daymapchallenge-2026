import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { Protocol } from "pmtiles";
import "./style.css";

// 開発時は day01-points/data、公開時（day01-points/site/）は ../data を読む
const DATA = import.meta.env.DEV ? "./data/" : "../data/";

const BG_SCALE = 25000; // geonet_bg.pmtiles の拡大率。これと同じときだけ背景の軌跡を出す
const R = 6378137;
const MISSING = -32768;
const TAIL_STEP = 4;
// 平方根で圧縮するときの係数。変位 d(m) を SQRT_K * √d (m) に描く（6m → 約300km、3cm → 約21km）
const SQRT_K = 120000;

// その時点で使われていた測地系（切り替わった日）
const DATUMS = [
  { from: "1900-01-01", name: "日本測地系", desc: "明治以来の測地系（2002年3月まで）" },
  { from: "2002-04-01", name: "JGD2000", desc: "測地成果2000　元期 1997年1月1日" },
  { from: "2011-10-31", name: "JGD2011", desc: "測地成果2011　元期 2011年5月24日（東日本を決め直す）" },
  { from: "2025-04-01", name: "測地成果2024", desc: "標高を GNSS 基盤に改定（緯度・経度は JGD2011）" },
];
// 元期: 公式の座標を止めた日。その日の位置を白い点で残す
const EPOCHS = [
  { date: "1997-01-01", label: "元期 1997年1月1日（測地成果2000）" },
  { date: "2011-05-24", label: "元期 2011年5月24日（測地成果2011）" },
];
const QUAKES: [string, string][] = [
  ["2003-09-26", "十勝沖地震"],
  ["2004-10-23", "新潟県中越地震"],
  ["2008-06-14", "岩手・宮城内陸地震"],
  ["2011-03-11", "東北地方太平洋沖地震"],
  ["2016-04-14", "熊本地震"],
  ["2018-09-06", "北海道胆振東部地震"],
  ["2024-01-01", "能登半島地震"],
];

type Meta = { start: string; weeks: number; stations: { id: string; name: string; lat: number; lon: number }[] };
type FC = GeoJSON.FeatureCollection;

// Vite がまとめ直すと既定の位置（モジュールの隣）に Worker がなくなるので、場所を明示する
maplibregl.setWorkerUrl(workerUrl);

const protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

const DU_COLOR: maplibregl.ExpressionSpecification = [
  "interpolate", ["linear"], ["get", "du"], -500, "#2166ac", -150, "#67a9cf", 0, "#e8eef5", 150, "#ef8a62", 500, "#b2182b",
];
const empty: FC = { type: "FeatureCollection", features: [] };

const map = new maplibregl.Map({
  container: "map",
  hash: true,
  bounds: [[128, 30.5], [146.5, 45.8]],
  fitBoundsOptions: { padding: { top: 20, bottom: 160, left: 20, right: 20 } },
  minZoom: 3,
  maxZoom: 11,
  attributionControl: false,
  style: {
    version: 8,
    sources: {
      trails: {
        type: "vector",
        url: `pmtiles://${new URL(DATA + "geonet_bg.pmtiles", location.href).href}`,
        attribution:
          '<a href="https://terras.gsi.go.jp/" target="_blank" rel="noopener">国土地理院 電子基準点日々の座標値（F5.1解）</a>を加工して作成',
      },
      tails: { type: "geojson", data: empty },
      now: { type: "geojson", data: empty },
      epochs: { type: "geojson", data: empty },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#0b0d12" } },
      {
        id: "trails",
        type: "circle",
        source: "trails",
        "source-layer": "trails",
        layout: { visibility: "none" },
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 7, 1, 10, 1.8],
          "circle-color": ["interpolate", ["linear"], ["get", "du_mm"], -500, "#2166ac", -150, "#67a9cf", 0, "#e8eef5", 150, "#ef8a62", 500, "#b2182b"],
          "circle-opacity": 0.25,
        },
      },
      {
        id: "epochs",
        type: "circle",
        source: "epochs",
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 1.2, 8, 2.4], "circle-color": "#ffffff", "circle-opacity": 0.55 },
      },
      {
        id: "tails",
        type: "line",
        source: "tails",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": DU_COLOR, "line-width": 1.2, "line-opacity": 0.75 },
      },
      {
        id: "now",
        type: "circle",
        source: "now",
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 2, 8, 3.6], "circle-color": DU_COLOR },
      },
    ],
  },
});
map.addControl(new maplibregl.AttributionControl({ compact: false }));

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const DAY_MS = 86400000;

async function main() {
  const [meta, buf] = await Promise.all([
    fetch(DATA + "anim/stations.json").then((r) => r.json() as Promise<Meta>),
    fetch(DATA + "anim/anim.bin").then((r) => r.arrayBuffer()),
  ]);
  const n = meta.stations.length;
  const W = meta.weeks;
  const t0 = Date.parse(meta.start);
  const toWeek = (iso: string) => Math.round((Date.parse(iso) - t0) / DAY_MS / 7);
  const datums = DATUMS.map((d) => ({ ...d, week: toWeek(d.from) }));
  const epochs = EPOCHS.map((e) => ({ ...e, week: toWeek(e.date) }));
  const quakes = QUAKES.map(([d, name]) => ({ week: toWeek(d), date: d.replace(/-/g, "/"), name }));

  // 欠測の週は、直前に観測があった週の値で埋める
  const raw = new Int16Array(buf);
  const filled = new Int16Array(raw.length);
  const last = new Int16Array(n * 3).fill(MISSING);
  for (let w = 0; w < W; w++) {
    for (let i = 0; i < n; i++) {
      const o = (w * n + i) * 3;
      if (raw[o] !== MISSING) last.set(raw.subarray(o, o + 3), i * 3);
      filled.set(last.subarray(i * 3, i * 3 + 3), o);
    }
  }

  // 1m あたりの度
  const kx = meta.stations.map((s) => (180 / Math.PI) / (R * Math.cos((s.lat * Math.PI) / 180)));
  const ky = (180 / Math.PI) / R;
  // scale が 0 のときは平方根で圧縮する（向きはそのまま、大きさだけ圧縮）
  let scale = 0;
  const pos = (w: number, i: number): [number, number] | null => {
    const o = (w * n + i) * 3;
    if (filled[o] === MISSING) return null;
    const e = filled[o] / 1000;
    const nn = filled[o + 1] / 1000;
    let f = scale;
    if (scale === 0) {
      const d = Math.hypot(e, nn);
      f = d > 0 ? (SQRT_K * Math.sqrt(d)) / d : 0;
    }
    const s = meta.stations[i];
    return [s.lon + e * f * kx[i], s.lat + nn * f * ky];
  };

  function points(w: number): FC {
    const features: GeoJSON.Feature[] = [];
    for (let i = 0; i < n; i++) {
      const p = pos(w, i);
      if (p) features.push({ type: "Feature", geometry: { type: "Point", coordinates: p }, properties: { du: filled[(w * n + i) * 3 + 2] } });
    }
    return { type: "FeatureCollection", features };
  }
  // 尾は直前の元期から今までの動き（公式の座標からどれだけ離れたか）
  function tails(w: number): FC {
    const features: GeoJSON.Feature[] = [];
    const from = epochs.filter((e) => e.week <= w).pop()?.week ?? 0;
    for (let i = 0; i < n; i++) {
      const coords: [number, number][] = [];
      for (let k = from; k < w; k += TAIL_STEP) {
        const p = pos(k, i);
        if (p) coords.push(p);
      }
      const p = pos(w, i);
      if (p) coords.push(p);
      if (coords.length > 1) {
        features.push({ type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: { du: filled[(w * n + i) * 3 + 2] } });
      }
    }
    return { type: "FeatureCollection", features };
  }

  // 元期の点は拡大率が変わったときだけ作り直す
  let epochCache = new Map<number, GeoJSON.Feature[]>();
  const epochPoints = (w: number): FC => ({
    type: "FeatureCollection",
    features: epochs.filter((e) => e.week <= w).flatMap((e) => {
      if (!epochCache.has(e.week)) epochCache.set(e.week, points(e.week).features);
      return epochCache.get(e.week)!;
    }),
  });

  const slider = $<HTMLInputElement>("#slider");
  const datumEl = $("#datum");
  const quakeEl = $("#quake");
  const playBtn = $<HTMLButtonElement>("#play");
  slider.max = String(W - 1);
  const src = (id: string) => map.getSource(id) as GeoJSONSource;

  let week = 0;
  let datumName = "";
  let shownEpochs = -1;
  function render(w: number) {
    week = w;
    src("now").setData(points(w));
    src("tails").setData(tails(w));
    const nEpochs = epochs.filter((e) => e.week <= w).length;
    if (nEpochs !== shownEpochs) {
      shownEpochs = nEpochs;
      src("epochs").setData(epochPoints(w));
    }

    const d = new Date(t0 + w * 7 * DAY_MS);
    $("#date").textContent = `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
    const ep = epochs.find((e) => w >= e.week && w < e.week + 26);
    $("#epoch").textContent = ep ? `${ep.label}：この日の位置で公式の座標を止める` : "";

    const datum = datums.filter((x) => x.week <= w).pop()!;
    if (datum.name !== datumName) {
      datumName = datum.name;
      datumEl.querySelector(".name")!.textContent = datum.name;
      datumEl.querySelector(".desc")!.textContent = datum.desc;
      datumEl.classList.remove("flash");
      void datumEl.offsetWidth;
      datumEl.classList.add("flash");
    }

    const q = quakes.filter((x) => w >= x.week && w < x.week + 26).pop();
    if (q) {
      quakeEl.querySelector(".date")!.textContent = q.date;
      quakeEl.querySelector(".name")!.textContent = q.name;
      quakeEl.style.opacity = String(1 - (w - q.week) / 26);
    } else {
      quakeEl.style.opacity = "0";
    }
    slider.value = String(w);
  }
  render(0);

  let playing = true;
  let weeksPerSec = 26;
  let acc = 0;
  let prev = performance.now();
  function tick(now: number) {
    const dt = Math.min((now - prev) / 1000, 0.1);
    prev = now;
    if (playing) {
      acc += dt * weeksPerSec;
      if (acc >= 1) {
        const step = Math.floor(acc);
        acc -= step;
        render(week + step >= W ? 0 : week + step);
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  playBtn.addEventListener("click", () => {
    playing = !playing;
    playBtn.textContent = playing ? "❚❚" : "▶";
  });
  slider.addEventListener("input", () => render(Number(slider.value)));

  const chips = (sel: string, onPick: (b: HTMLButtonElement) => void) => {
    const buttons = document.querySelectorAll<HTMLButtonElement>(`${sel} button`);
    buttons.forEach((b) =>
      b.addEventListener("click", () => {
        buttons.forEach((x) => x.classList.toggle("on", x === b));
        onPick(b);
      }),
    );
  };
  chips("#scale", (b) => {
    scale = Number(b.dataset.scale);
    epochCache = new Map();
    shownEpochs = -1;
    map.setLayoutProperty("trails", "visibility", scale === BG_SCALE ? "visible" : "none");
    render(week);
  });
  chips("#speed", (b) => {
    weeksPerSec = Number(b.dataset.weeks);
  });
}

map.on("load", main);
