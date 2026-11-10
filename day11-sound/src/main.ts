import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ColumnLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { TripsLayer } from "@deck.gl/geo-layers";
import { Protocol } from "pmtiles";
import "./style.css";

maplibregl.setWorkerUrl(workerUrl);
maplibregl.addProtocol("pmtiles", new Protocol().tile);

// 開発時は day11-sound/web、公開時（day11-sound/site/）は ../web を読む
const DATA = import.meta.env.DEV ? "./web/" : "../web/";
const GSI_PMTILES = "https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/optimal_bvmap-v1.pmtiles";
const BG = "#070a10";
const ARR: [number, number, number] = [90, 209, 255];
const DEP: [number, number, number] = [255, 176, 58];
const JONAN_C: [number, number, number] = [255, 111, 174];

type Mode = "north" | "south" | "south-city" | null;
type Hour = { h: number; mode: Mode; wd: string | null; deg: number | null; ws: number | null };
type TrackMeta = { n: number; k: "arr" | "dep"; t: string; f: string };
type Pass = { i: number; s: number; alt: number; d: number; t: string; f: string };
type Month = { m: number; wind: number; am: number; pm: number; ops: number };
type Track = { path: [number, number, number][]; ground: [number, number, number][]; ts: number[]; k: "arr" | "dep" };

// URL のパラメータ: ?t=10:00 でその時刻、?shot で操作部品を隠す（録画用）、?play で自動再生
const params = new URLSearchParams(location.search);
const SHOT = params.has("shot");
if (SHOT) document.body.classList.add("shot");
const NARROW = innerWidth <= 600;
// 高さの誇張（見やすさのため）。?z=1 で実寸
const ZX = Math.max(0.5, Number(params.get("z") ?? 2.5));

const [buf, tmeta, day, jonan, year] = await Promise.all([
  fetch(DATA + "tracks.bin").then((r) => r.arrayBuffer()),
  fetch(DATA + "tracks.json").then((r) => r.json() as Promise<{ day: string; haneda: [number, number]; tracks: TrackMeta[] }>),
  fetch(DATA + "day.json").then((r) => r.json() as Promise<{ day: string; hours: Hour[] }>),
  fetch(DATA + "jonan.json").then((r) => r.json() as Promise<{ spot: [number, number]; r: number; ft: number; passes: Pass[] }>),
  fetch(DATA + "year.json").then((r) => r.json() as Promise<{ fy: number; months: Month[] }>),
]);

// 航跡を組み立てる（点は [経度, 緯度, 高度m, 秒]）
const F = new Float32Array(buf);
const TRACKS: Track[] = [];
{
  let o = 0;
  for (const m of tmeta.tracks) {
    const path: [number, number, number][] = [];
    const ground: [number, number, number][] = [];
    const ts: number[] = [];
    for (let j = 0; j < m.n; j++, o += 4) {
      path.push([F[o], F[o + 1], F[o + 2] * ZX]);
      ground.push([F[o], F[o + 1], 0]);
      ts.push(F[o + 3]);
    }
    TRACKS.push({ path, ground, ts, k: m.k });
  }
}
const HANEDA = tmeta.haneda;
const JONAN = jonan.spot;
const PASSES = jonan.passes;

// 背景地図: 国土地理院の最適化ベクトルタイル。水域・道路・鉄道を暗く薄く出す
const ROAD = "#1a2230";
const map = new maplibregl.Map({
  container: "map",
  center: [139.80, 35.565],
  zoom: NARROW ? 9.6 : 10.7,
  pitch: 58,
  bearing: -28,
  maxPitch: 75,
  attributionControl: false,
  canvasContextAttributes: { preserveDrawingBuffer: SHOT },
  style: {
    version: 8,
    sources: { gsi: { type: "vector", url: `pmtiles://${GSI_PMTILES}` } },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#0d121a" } },
      { id: "water", type: "fill", source: "gsi", "source-layer": "WA", paint: { "fill-color": BG } },
      {
        id: "road",
        type: "line",
        source: "gsi",
        "source-layer": "RdCL",
        filter: ["in", ["get", "vt_rdctg"], ["literal", ["国道", "都道府県道", "高速自動車国道等"]]],
        paint: { "line-color": ROAD, "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.4, 14, 2] },
      },
      { id: "rail", type: "line", source: "gsi", "source-layer": "RailCL", paint: { "line-color": "#161d28", "line-width": 0.7 } },
      { id: "coast", type: "line", source: "gsi", "source-layer": "Cstline", paint: { "line-color": "#2a3546", "line-width": 0.8 } },
    ],
  },
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
// スマホではパネルが上にかぶるので、地図の中心を下にずらす
if (NARROW) map.setPadding({ top: 360, bottom: 0, left: 0, right: 0 });
const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
map.addControl(overlay);

// 加算合成（光が重なるほど明るく）
const ADDITIVE = {
  depthCompare: "always",
  blend: true,
  blendColorOperation: "add",
  blendColorSrcFactor: "src-alpha",
  blendColorDstFactor: "one",
  blendAlphaOperation: "add",
  blendAlphaSrcFactor: "one",
  blendAlphaDstFactor: "one",
} as const;
const FONT = '"BIZ UDPGothic", "Yu Gothic UI", "Hiragino Sans", "Noto Sans JP", sans-serif';
const TRAIL = 1500; // 光の尾の長さ（秒）。長めにして、同じ所を通る「空の道」が見えるように

function layers(t: number) {
  // 城南島の上を通った直後は、輪を広げて「音」を見せる
  const recent = PASSES.filter((p) => p.s <= t && t - p.s < 10);
  return [
    // 地面に落ちる影（どこの上を飛んでいるかがわかるように）
    new TripsLayer<Track>({
      id: "ground",
      data: TRACKS,
      getPath: (d) => d.ground,
      getTimestamps: (d) => d.ts,
      getColor: (d) => [...(d.k === "arr" ? ARR : DEP), 45],
      widthMinPixels: 1,
      trailLength: TRAIL,
      currentTime: t,
      fadeTrail: true,
      parameters: ADDITIVE,
    }),
    new TripsLayer<Track>({
      id: "trips-glow",
      data: TRACKS,
      getPath: (d) => d.path,
      getTimestamps: (d) => d.ts,
      getColor: (d) => [...(d.k === "arr" ? ARR : DEP), 40],
      widthMinPixels: 6,
      trailLength: TRAIL,
      currentTime: t,
      fadeTrail: true,
      capRounded: true,
      jointRounded: true,
      parameters: ADDITIVE,
    }),
    new TripsLayer<Track>({
      id: "trips",
      data: TRACKS,
      getPath: (d) => d.path,
      getTimestamps: (d) => d.ts,
      getColor: (d) => [...(d.k === "arr" ? ARR : DEP), 255],
      widthMinPixels: 1.8,
      trailLength: TRAIL,
      currentTime: t,
      fadeTrail: true,
      capRounded: true,
      jointRounded: true,
      parameters: ADDITIVE,
    }),
    // 城南島の上の「音が鳴る範囲」（半径500m、高度1,500ft）
    new ColumnLayer<{ p: [number, number] }>({
      id: "jonan-zone",
      data: [{ p: JONAN }],
      getPosition: (d) => d.p,
      radius: jonan.r,
      diskResolution: 48,
      extruded: true,
      getElevation: jonan.ft * 0.3048 * ZX,
      getFillColor: [...JONAN_C, recent.length ? 120 : 55],
      updateTriggers: { getFillColor: [recent.length > 0] },
      parameters: ADDITIVE,
    }),
    new ScatterplotLayer<Pass>({
      id: "jonan-pulse",
      data: recent,
      getPosition: () => JONAN,
      radiusUnits: "meters",
      getRadius: (p) => jonan.r + (t - p.s) * 160,
      stroked: true,
      filled: false,
      getLineColor: (p) => [...JONAN_C, Math.max(0, 230 - (t - p.s) * 23)],
      lineWidthUnits: "pixels",
      getLineWidth: 2,
      updateTriggers: { getRadius: [t], getLineColor: [t] },
    }),
    new TextLayer<{ p: [number, number]; s: string; c: [number, number, number] }>({
      id: "labels",
      data: [
        { p: JONAN, s: "城南島", c: JONAN_C },
        { p: HANEDA, s: "羽田空港", c: [232, 236, 241] },
      ],
      getPosition: (d) => d.p,
      getText: (d) => d.s,
      getColor: (d) => [...d.c, 240],
      getSize: 15,
      getPixelOffset: [0, -22],
      fontFamily: FONT,
      fontWeight: 700,
      characterSet: "城南島羽田空港",
      fontSettings: { sdf: true, buffer: 6 },
      outlineWidth: 4,
      outlineColor: [5, 7, 10, 230],
      billboard: true,
    }),
  ];
}

// パネル
const $ = (id: string) => document.getElementById(id)!;
const [y, mo, dd] = day.day.split("-").map(Number);
$("date").textContent = `${y}年${mo}月${dd}日（${"日月火水木金土"[new Date(y, mo - 1, dd).getDay()]}）`;
const MODE_NAME: Record<string, string> = { north: "北風運用", south: "南風運用", "south-city": "南風運用（都心側から着陸）" };
const MODE_NOTE: Record<string, string> = {
  north: "南の東京湾（木更津沖）から北向きに着陸し、北と北東へ離陸する",
  south: "北東の浦安沖から回り込み、南西向きに着陸する。城南島の真上を低く降りてくる",
  "south-city": "南風の15〜19時のうち3時間ほど。北の都心側から南向きに着陸する",
};
const COLOR: Record<string, string> = { north: "#6fa8ff", south: "#ff9f43", "south-city": "#ff6a3d" };

function panel(t: number) {
  const h = Math.min(23, Math.floor(t / 3600));
  const m = Math.floor((t % 3600) / 60);
  $("clock").textContent = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const hr = day.hours[h];
  if (hr.deg !== null) {
    // 気象庁の風向は「吹いてくる方角」。矢印は風が吹いていく向きに描く
    $("arrow").setAttribute("transform", `rotate(${hr.deg + 180})`);
    $("wind-text").textContent = `${hr.wd}の風 ${hr.ws?.toFixed(1)} m/s`;
  }
  const mode = $("mode");
  mode.className = hr.mode ?? "";
  mode.textContent = hr.mode ? MODE_NAME[hr.mode] : "便が少ない時間";
  $("mode-note").textContent = hr.mode ? MODE_NOTE[hr.mode] : "深夜・早朝は着陸・離陸ともに少ない";
  $("jonan-count").textContent = String(PASSES.filter((p) => p.s <= t).length);
  cursor.setAttribute("x", String((t / 86400) * 300 - 1));
}

// 24時間の運用の帯
const tl = $("timeline") as unknown as SVGSVGElement;
tl.innerHTML =
  day.hours
    .map((hr) => `<rect x="${(hr.h / 24) * 300}" y="6" width="${300 / 24 - 0.6}" height="22" fill="${hr.mode ? COLOR[hr.mode] : "#1b222c"}" opacity="0.85"/>`)
    .join("") + `<rect id="tl-cursor" x="0" y="0" width="2" height="34" fill="#fff"/>`;
const cursor = tl.querySelector("#tl-cursor")!;

// 1年の中での位置（2024年度の月ごと）
{
  const ch = $("year-chart") as unknown as SVGSVGElement;
  const W = 300 / 12;
  const H = 70;
  ch.innerHTML = year.months
    .map((m, i) => {
      const x = i * W;
      const hw = H * (m.wind / 100);
      const ho = H * (m.ops / 100);
      const hl = m.m === mo ? `<rect x="${x + 0.5}" y="0" width="${W - 1}" height="${H}" fill="#ffffff" opacity="0.06"/>` : "";
      return `${hl}<rect x="${x + 3}" y="${H - hw}" width="${W / 2 - 3}" height="${hw}" fill="#3b4656"/>` +
        `<rect x="${x + W / 2}" y="${H - ho}" width="${W / 2 - 3}" height="${ho}" fill="#ff9f43"/>` +
        `<text x="${x + W / 2}" y="${H + 14}" fill="${m.m === mo ? "#e8ecf1" : "#8a94a3"}" font-size="10" text-anchor="middle">${m.m}月</text>`;
    })
    .join("");
}

// 音（ブラウザで聞くとき）: 城南島の上を機体が通るたびに鳴らす。低く飛ぶほど低い音
let audio: AudioContext | null = null;
function ping(alt: number) {
  if (!audio) return;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = "sine";
  o.frequency.value = 180 + (alt / 457) * 520;
  const now = audio.currentTime;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(0.18, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
  o.connect(g).connect(audio.destination);
  o.start(now);
  o.stop(now + 1.3);
}

let t = 6 * 3600;
const q = params.get("t");
if (q) {
  const [hh, mm] = q.split(":").map(Number);
  t = hh * 3600 + (mm || 0) * 60;
}
const slider = $("slider") as HTMLInputElement;
function render() {
  overlay.setProps({ layers: layers(t) });
  panel(t);
  slider.value = String(t);
}

let playing = false;
let last = 0;
const speed = $("speed") as HTMLSelectElement;
const playBtn = $("play");
function tick(now: number) {
  if (!playing) return;
  const dt = last ? (now - last) / 1000 : 0;
  last = now;
  const prev = t;
  t = Math.min(86400, t + dt * Number(speed.value));
  for (const p of PASSES) if (p.s > prev && p.s <= t) ping(p.alt);
  if (t >= 86400) setPlaying(false);
  render();
  requestAnimationFrame(tick);
}
function setPlaying(on: boolean) {
  playing = on;
  playBtn.textContent = on ? "停止" : "再生";
  if (on) {
    if (!audio && !SHOT) {
      try {
        audio = new AudioContext();
      } catch {
        audio = null;
      }
    }
    if (t >= 86400) t = 0;
    last = 0;
    requestAnimationFrame(tick);
  }
}
playBtn.addEventListener("click", () => setPlaying(!playing));
slider.addEventListener("input", () => {
  setPlaying(false);
  t = Number(slider.value);
  render();
});

map.on("load", () => {
  render();
  map.once("idle", () => document.body.classList.add("ready"));
  if (params.has("play")) setPlaying(true);
});
