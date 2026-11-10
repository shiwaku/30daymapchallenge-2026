import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ColumnLayer, LineLayer, PathLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { Tile3DLayer, TripsLayer } from "@deck.gl/geo-layers";
import { Tiles3DLoader } from "@loaders.gl/3d-tiles";
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
const RUNWAY: [number, number, number] = [168, 178, 196]; // 滑走路の色（航跡の水色・橙とぶつからない灰青）

type Mode = "north" | "south" | "south-city" | null;
type Hour = { h: number; mode: Mode; wd: string | null; deg: number | null; ws: number | null };
type TrackMeta = { n: number; k: "arr" | "dep"; t: string; f: string };
type Pass = { i: number; s: number; alt: number; d: number; t: string; f: string };
type Month = { m: number; wind: number; am: number; pm: number; ops: number };
type Runway = { id: string; ref: string; path: [number, number][]; c: [number, number] };
type Use = Record<string, { arr: number; dep: number }>;
type Station = { name: string; lon: number; lat: number; h: [number, number][] };
type Track = { path: [number, number, number][]; ground: [number, number, number][]; ts: number[]; k: "arr" | "dep" };

// URL のパラメータ: ?t=10:00 でその時刻、?shot で操作部品を隠す（録画用）、?play で自動再生
const params = new URLSearchParams(location.search);
const SHOT = params.has("shot");
if (SHOT) document.body.classList.add("shot");
const NARROW = innerWidth <= 600;
// 高さの誇張（見やすさのため）。?z=1 で実寸
const ZX = Math.max(0.5, Number(params.get("z") ?? 2.5));

const [buf, tmeta, day, jonan, year, rw, windData] = await Promise.all([
  fetch(DATA + "tracks.bin").then((r) => r.arrayBuffer()),
  fetch(DATA + "tracks.json").then((r) => r.json() as Promise<{ day: string; haneda: [number, number]; tracks: TrackMeta[] }>),
  fetch(DATA + "day.json").then((r) => r.json() as Promise<{ day: string; hours: Hour[] }>),
  fetch(DATA + "jonan.json").then((r) => r.json() as Promise<{ spot: [number, number]; r: number; ft: number; passes: Pass[] }>),
  fetch(DATA + "year.json").then((r) => r.json() as Promise<{ fy: number; months: Month[] }>),
  fetch(DATA + "runways.json").then((r) => r.json() as Promise<{ runways: Runway[]; use: Use[] }>),
  fetch(DATA + "wind.json").then((r) => r.json() as Promise<{ day: string; stations: Station[] }>),
]);
// PLATEAU 大田区の建物（2025年度、LOD2、テクスチャなし）。羽田空港のターミナルなどを含む
const PLATEAU_OTA =
  "https://assets.cms.plateau.reearth.io/assets/1b/e7ae85-9dbb-4b17-af10-86da7641d370/13111_ota-ku_pref_2025_citygml_1_op_bldg_3dtiles_13111_ota-ku_lod2_no_texture/tileset.json";
const BLDG = params.get("bldg") !== "0"; // ?bldg=0 で建物を消す

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
// ?cam=経度,緯度,ズーム,傾き,向き でカメラを決める（確認・録画用）
const CAM = (params.get("cam") ?? "").split(",").map(Number);
const cam = CAM.length === 5 && CAM.every(Number.isFinite) ? CAM : [139.792, 35.556, NARROW ? 10.4 : 11.6, 58, -28];
const map = new maplibregl.Map({
  container: "map",
  center: [cam[0], cam[1]],
  zoom: cam[2],
  pitch: cam[3],
  bearing: cam[4],
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
// 風の粒子: アメダス・気象台14地点の1時間ごとの風を、距離の2乗の逆数で重み付けして補間する。
// 時間の方向も、となりの時間の値と滑らかにつなぐ。粒子の速さは見やすさのため誇張している
const WIND = params.get("wind") !== "0"; // ?wind=0 で風を消す
const ST = windData.stations.map((s) => ({
  lon: s.lon,
  lat: s.lat,
  // 風向は「吹いてくる方角」。流れる向き（東向き u、北向き v）に直す
  uv: s.h.map(([deg, ws]) => [-ws * Math.sin((deg * Math.PI) / 180), -ws * Math.cos((deg * Math.PI) / 180)] as [number, number]),
}));
function windAt(lon: number, lat: number, t: number): [number, number] {
  const hf = Math.min(23, Math.max(0, t / 3600 - 0.5));
  const h0 = Math.floor(hf), h1 = Math.min(23, h0 + 1), k = hf - h0;
  let su = 0, sv = 0, sw = 0;
  for (const s of ST) {
    const dx = (lon - s.lon) * Math.cos((lat * Math.PI) / 180), dy = lat - s.lat;
    const w = 1 / (dx * dx + dy * dy + 1e-5);
    su += w * (s.uv[h0][0] * (1 - k) + s.uv[h1][0] * k);
    sv += w * (s.uv[h0][1] * (1 - k) + s.uv[h1][1] * k);
    sw += w;
  }
  return [su / sw, sv / sw];
}
const BOX = { w: 139.3, e: 140.3, s: 35.15, n: 35.92 };
const NP = NARROW ? 900 : 2600;
const K = 0.0022; // 1 m/s の風で 1秒に動く度数（誇張）
type Particle = { x: number; y: number; age: number; life: number };
const rnd = () => ({ x: BOX.w + Math.random() * (BOX.e - BOX.w), y: BOX.s + Math.random() * (BOX.n - BOX.s), age: 0, life: 2 + Math.random() * 3 });
const parts: Particle[] = Array.from({ length: NP }, () => ({ ...rnd(), age: Math.random() * 3 }));
const streaks = new Float32Array(NP * 4);
const colors = new Uint8ClampedArray(NP * 4); // 粒子ごとの RGBA
let lastWind = 0;
function stepWind(t: number, now: number) {
  const dt = lastWind ? Math.min(0.1, (now - lastWind) / 1000) : 0;
  lastWind = now;
  for (let i = 0; i < NP; i++) {
    let p = parts[i];
    p.age += dt;
    if (p.age > p.life || p.x < BOX.w || p.x > BOX.e || p.y < BOX.s || p.y > BOX.n) p = parts[i] = rnd();
    const [u, v] = windAt(p.x, p.y, t);
    const c = Math.cos((p.y * Math.PI) / 180);
    p.x += (u * K * dt) / c;
    p.y += v * K * dt;
    // 風の向きに伸びる短い線（長さは風速に比例）
    const L = 0.35;
    streaks[i * 4] = p.x - ((u * K * L) / c);
    streaks[i * 4 + 1] = p.y - v * K * L;
    streaks[i * 4 + 2] = p.x;
    streaks[i * 4 + 3] = p.y;
    const fade = Math.min(1, p.age / 0.6, (p.life - p.age) / 0.6);
    colors[i * 4] = 210;
    colors[i * 4 + 1] = 222;
    colors[i * 4 + 2] = 240;
    colors[i * 4 + 3] = Math.max(0, fade) * 120;
  }
}

const FONT = '"BIZ UDPGothic", "Yu Gothic UI", "Hiragino Sans", "Noto Sans JP", sans-serif';
const TRAIL = 1500; // 光の尾の長さ（秒）。長めにして、同じ所を通る「空の道」が見えるように

function layers(t: number) {
  // 城南島の上を通った直後は、輪を広げて「音」を見せる
  const recent = PASSES.filter((p) => p.s <= t && t - p.s < 10);
  return [
    // 風（地面の高さに、航跡より下に流す）
    new LineLayer({
      id: "wind",
      visible: WIND,
      data: {
        length: NP,
        attributes: {
          getSourcePosition: { value: streaks, size: 2, stride: 16, offset: 0 },
          getTargetPosition: { value: streaks, size: 2, stride: 16, offset: 8 },
          getColor: { value: colors, size: 4, normalized: true },
        },
      },
      widthMinPixels: 1.2,
      opacity: 1,
    }),
    new ScatterplotLayer<Station>({
      id: "stations",
      visible: WIND,
      data: windData.stations,
      getPosition: (s) => [s.lon, s.lat],
      getFillColor: [230, 236, 245, 170],
      radiusUnits: "pixels",
      getRadius: 2.5,
    }),
    // 羽田空港の建物（PLATEAU）
    new Tile3DLayer({
      id: "plateau",
      data: PLATEAU_OTA,
      loader: Tiles3DLoader,
      visible: BLDG,
      opacity: 0.9,
      _getMeshColor: () => [74, 86, 108],
      loadOptions: { tileset: { maximumScreenSpaceError: 12 } },
    }),
    // 滑走路（1色、光らせない。航跡より下に描く）
    new PathLayer<Runway>({
      id: "runway",
      data: rw.runways,
      getPath: (r) => r.path,
      getColor: [...RUNWAY, 210],
      widthUnits: "meters",
      getWidth: 60,
      widthMinPixels: 3.5,
    }),
    // 滑走路の名前（「C滑走路」と番号）
    new TextLayer<Runway>({
      id: "runway-label",
      data: rw.runways,
      getPosition: (r) => r.c,
      getText: (r) => `${r.id}滑走路
${r.ref}`,
      getColor: [236, 240, 246, 245],
      getSize: 14,
      lineHeight: 1.1,
      getTextAnchor: "start",
      getAlignmentBaseline: "center",
      getPixelOffset: [12, 0],
      fontFamily: FONT,
      fontWeight: 700,
      characterSet: "ABCD滑走路0123456789LR/ ",
      fontSettings: { sdf: true, buffer: 6 },
      outlineWidth: 5,
      outlineColor: [5, 7, 10, 240],
    }),
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
        { p: [HANEDA[0] + 0.006, HANEDA[1] - 0.026], s: "羽田空港", c: [255, 255, 255] },
      ],
      getPosition: (d) => d.p,
      getText: (d) => d.s,
      getColor: (d) => [...d.c, 240],
      getSize: (d) => (d.s === "羽田空港" ? 20 : 15),
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
// 運用の色は、航跡（着陸 水色・離陸 橙）と城南島（ピンク）に重ならない色にする
const COLOR: Record<string, string> = { north: "#a99bff", south: "#5fd38a", "south-city": "#c6e86a" };

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
        `<rect x="${x + W / 2}" y="${H - ho}" width="${W / 2 - 3}" height="${ho}" fill="#5fd38a"/>` +
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

// 止めているあいだも風を流す
function windLoop(now: number) {
  if (WIND) stepWind(t, now);
  if (!playing) render();
  requestAnimationFrame(windLoop);
}

map.on("load", () => {
  requestAnimationFrame(windLoop);
  render();
  map.once("idle", () => document.body.classList.add("ready"));
  if (params.has("play")) setPlaying(true);
});
