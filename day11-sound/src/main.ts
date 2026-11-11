import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { LineLayer, PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
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

const [buf, tmeta, day, jonan, year, rw, windData, loud, gnd] = await Promise.all([
  fetch(DATA + "tracks.bin").then((r) => r.arrayBuffer()),
  fetch(DATA + "tracks.json").then((r) => r.json() as Promise<{ day: string; haneda: [number, number]; tracks: TrackMeta[] }>),
  fetch(DATA + "day.json").then((r) => r.json() as Promise<{ day: string; hours: Hour[] }>),
  fetch(DATA + "jonan.json").then((r) => r.json() as Promise<{ spot: [number, number]; r: number; ft: number; passes: Pass[] }>),
  fetch(DATA + "year.json").then((r) => r.json() as Promise<{ fy: number; months: Month[] }>),
  fetch(DATA + "runways.json").then((r) => r.json() as Promise<{ runways: Runway[]; use: Use[] }>),
  fetch(DATA + "wind.json").then((r) => r.json() as Promise<{ day: string; stations: Station[] }>),
  fetch(DATA + "loud.json").then((r) => r.json() as Promise<{ step: number; lv: number[] }>),
  fetch(DATA + "ground.json").then((r) => r.json() as Promise<{ taxiways: [number, number][][]; aprons: [number, number][][]; park: [number, number][][] }>),
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
      { id: "background", type: "background", paint: { "background-color": "#111824" } },
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
      // 海岸線（水域の縁）は白で、はっきり出す
      { id: "coast", type: "line", source: "gsi", "source-layer": "Cstline", paint: { "line-color": "#e8eef6", "line-opacity": 0.6, "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.8, 13, 1.6] } },
      { id: "water-edge", type: "line", source: "gsi", "source-layer": "WA", paint: { "line-color": "#e8eef6", "line-opacity": 0.35, "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.5, 13, 1.2] } },
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
    // 空港の地面（エプロン・誘導路）。D滑走路は誘導路の橋で空港とつながっている
    new PolygonLayer<[number, number][]>({
      id: "apron",
      data: gnd.aprons,
      getPolygon: (d) => d,
      getFillColor: [38, 46, 60, 255],
      stroked: false,
    }),
    new PathLayer<[number, number][]>({
      id: "taxiway",
      data: gnd.taxiways,
      getPath: (d) => d,
      getColor: [92, 104, 124, 255],
      widthUnits: "meters",
      getWidth: 23,
      widthMinPixels: 0.8,
    }),
    // 城南島海浜公園
    new PolygonLayer<[number, number][]>({
      id: "park",
      data: gnd.park,
      getPolygon: (d) => d,
      getFillColor: [...JONAN_C, 150],
      getLineColor: [255, 210, 230, 255],
      stroked: true,
      lineWidthUnits: "pixels",
      getLineWidth: 2.5,
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
      getText: (r) => `${r.id}滑走路`,
      getColor: [236, 240, 246, 245],
      getSize: 11,
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
    // 羽田の風の矢印。滑走路と重ならないよう、空港の南東の海の上に置く（長さは風速に比例）
    new PathLayer<{ p: [number, number][] }>({
      id: "wind-arrow-edge",
      data: windArrow(t),
      parameters: { depthCompare: "always" }, // 地面と同じ高さなので、重なり順のとおりに描く
      getPath: (d) => d.p,
      getColor: [5, 7, 10, 230],
      widthUnits: "meters",
      getWidth: 240,
      widthMinPixels: 6,
      capRounded: true,
      jointRounded: true,
      updateTriggers: { getPath: [Math.round(t / 60)] },
    }),
    new PathLayer<{ p: [number, number][] }>({
      id: "wind-arrow",
      data: windArrow(t),
      parameters: { depthCompare: "always" }, // 地面と同じ高さなので、重なり順のとおりに描く
      getPath: (d) => d.p,
      getColor: [255, 255, 255, 245],
      widthUnits: "meters",
      getWidth: 130,
      widthMinPixels: 3,
      capRounded: true,
      jointRounded: true,
      updateTriggers: { getPath: [Math.round(t / 60)] },
    }),
    new TextLayer<{ p: [number, number]; s: string }>({
      id: "wind-arrow-label",
      data: [{ p: [ARROW_AT[0], ARROW_AT[1] - 0.018], s: windLabel(t) }],
      getPosition: (d) => d.p,
      getText: (d) => d.s,
      getColor: [255, 255, 255, 245],
      getSize: 13,
      fontFamily: FONT,
      fontWeight: 700,
      characterSet: "羽田の風静穏北東南西 0123456789.m/s",
      fontSettings: { sdf: true, buffer: 6 },
      outlineWidth: 5,
      outlineColor: [5, 7, 10, 240],
      updateTriggers: { getText: [Math.round(t / 60)] },
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
        { p: [139.7838, 35.5852], s: "城南島海浜公園", c: JONAN_C },
        { p: [HANEDA[0] + 0.006, HANEDA[1] - 0.026], s: "羽田空港", c: [255, 255, 255] },
      ],
      getPosition: (d) => d.p,
      getText: (d) => d.s,
      getColor: (d) => [...d.c, 240],
      getSize: (d) => (d.s === "羽田空港" ? 20 : 15),
      getPixelOffset: [0, -22],
      fontFamily: FONT,
      fontWeight: 700,
      characterSet: "城南島海浜公園羽田空港",
      fontSettings: { sdf: true, buffer: 6 },
      outlineWidth: 4,
      outlineColor: [5, 7, 10, 230],
      billboard: true,
    }),
  ];
}

// 羽田の風（1時間ごと）を時間で滑らかにつなぐ。返すのは [流れる向き（度、北から時計回り）, 風速]
function hanedaWind(t: number): [number, number] {
  const hf = Math.min(23, Math.max(0, t / 3600 - 0.5));
  const h0 = Math.floor(hf), h1 = Math.min(23, h0 + 1), k = hf - h0;
  const uv = (h: number) => {
    const x = day.hours[h];
    if (x.deg === null || x.ws === null) return [0, 0];
    const r = ((x.deg + 180) * Math.PI) / 180;
    return [x.ws * Math.sin(r), x.ws * Math.cos(r)];
  };
  const a = uv(h0), b = uv(h1);
  const u = a[0] * (1 - k) + b[0] * k, v = a[1] * (1 - k) + b[1] * k;
  return [((Math.atan2(u, v) * 180) / Math.PI + 360) % 360, Math.hypot(u, v)];
}
// 矢印を置く所（羽田空港の南東、東京湾の上）
const ARROW_AT: [number, number] = [139.86, 35.505];
// 文字はパネルと同じ、その時間の観測値（矢印の向きと長さは時間で滑らかにつないだもの）
function windLabel(t: number) {
  const hr = day.hours[Math.min(23, Math.floor(t / 3600))];
  return hr.ws === null ? "" : hr.ws < 0.3 ? "羽田の風 静穏" : `羽田の風 ${hr.wd} ${hr.ws.toFixed(1)} m/s`;
}
function windArrow(t: number) {
  const [dir, ws] = hanedaWind(t);
  if (ws < 0.3) return [];
  const L = 1100 + ws * 450; // m
  const r = (dir * Math.PI) / 180;
  const cx = 111320 * Math.cos((HANEDA[1] * Math.PI) / 180), cy = 110540;
  const pt = (along: number, side: number): [number, number] => [
    ARROW_AT[0] + (Math.sin(r) * along + Math.cos(r) * side) / cx,
    ARROW_AT[1] + (Math.cos(r) * along - Math.sin(r) * side) / cy,
  ];
  const head = Math.min(1000, L * 0.32);
  return [{ p: [pt(-L / 2, 0), pt(L / 2, 0)] }, { p: [pt(L / 2 - head, -head * 0.6), pt(L / 2, 0), pt(L / 2 - head, head * 0.6)] }];
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
  const mini = $("mini-mode");
  mini.className = hr.mode ?? "";
  mini.textContent = hr.mode ? MODE_NAME[hr.mode] : "便が少ない時間";
  $("mini-wind").textContent = hr.deg !== null ? `${hr.wd}の風 ${hr.ws?.toFixed(1)} m/s` : "";
  const mode = $("mode");
  mode.className = hr.mode ?? "";
  mode.textContent = hr.mode ? MODE_NAME[hr.mode] : "便が少ない時間";
  $("mode-note").textContent = hr.mode ? MODE_NOTE[hr.mode] : "深夜・早朝は着陸・離陸ともに少ない";
  $("jonan-count").textContent = String(PASSES.filter((p) => p.s <= t).length);
  cursor.setAttribute("x", String((t / 86400) * 300 - 1));
}

// パネルの開け閉め。状態はこの端末に覚えておく（使えないときは覚えない）。スマホでは最初は閉じる
{
  const panelEl = $("panel");
  const btn = $("toggle");
  const KEY = "day11-panel";
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    saved = null;
  }
  const set = (collapsed: boolean) => {
    panelEl.classList.toggle("collapsed", collapsed);
    btn.textContent = collapsed ? "+" : "−";
    btn.setAttribute("aria-expanded", String(!collapsed));
    btn.setAttribute("aria-label", collapsed ? "パネルを開く" : "パネルを閉じる");
  };
  set(SHOT ? false : saved ? saved === "1" : NARROW);
  btn.addEventListener("click", () => {
    const c = !panelEl.classList.contains("collapsed");
    set(c);
    try {
      localStorage.setItem(KEY, c ? "1" : "0");
    } catch {
      /* 覚えられなくても動く */
    }
  });
}

// PWA: 公開版だけ Service Worker を登録する（開発中は登録しない）
if (import.meta.env.PROD && "serviceWorker" in navigator && !SHOT) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
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

// 音（ブラウザで聞くとき）
// 風の音: 羽田の風速で大きさと高さを変えた雑音（データを音に置き換えたもの）
// 飛行機の音: 入間航空祭で録ったブルーインパルスの通過音のループ（roar.wav、scripts/roar.py）を、
// 城南島で聞こえる強さ（loud.json）で鳴らす。強いほど大きく、弱いほど高い音を削って遠くの音にする。旅客機の音ではない
let audio: AudioContext | null = null;
let windGain: GainNode, windFilter: BiquadFilterNode, planeGain: GainNode, planeFilter: BiquadFilterNode;
function startAudio() {
  const ctx = new AudioContext();
  const noise = (seconds: number) => {
    const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      // 少し低めの雑音（ブラウンノイズ寄り）
      last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04;
      d[i] = last * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.loop = true;
    return src;
  };
  const w = noise(4);
  windFilter = ctx.createBiquadFilter();
  windFilter.type = "bandpass";
  windFilter.Q.value = 0.7;
  windGain = ctx.createGain();
  windGain.gain.value = 0;
  w.connect(windFilter).connect(windGain).connect(ctx.destination);
  w.start();
  planeFilter = ctx.createBiquadFilter();
  planeFilter.type = "lowpass";
  planeGain = ctx.createGain();
  planeGain.gain.value = 0;
  planeFilter.connect(planeGain).connect(ctx.destination);
  audio = ctx;
  // 録った音は読み込めてから鳴らす（読めなければ風の音だけ）
  fetch(DATA + "roar.wav")
    .then((r) => r.arrayBuffer())
    .then((b) => ctx.decodeAudioData(b))
    .then((buf) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(planeFilter);
      src.start();
    })
    .catch(() => {});
}
function loudAt(t: number) {
  const i = t / loud.step;
  const a = Math.floor(i), k = i - a;
  return (loud.lv[a] ?? 0) * (1 - k) + (loud.lv[a + 1] ?? 0) * k;
}
// 早送りでは1機の通過が一瞬になるので、前のコマから今までの最大値を取り、通ったら一気に上げてゆっくり（約1秒）下げる
let audioT = -1;
let planeEnv = 0;
let audioWall = 0;
function updateAudio(t: number) {
  if (!audio) return;
  const now = audio.currentTime;
  const ws = hanedaWind(t)[1];
  windGain.gain.setTargetAtTime(Math.min(0.5, 0.025 * ws ** 1.4), now, 0.3);
  windFilter.frequency.setTargetAtTime(300 + ws * 90, now, 0.3);
  let lv = loudAt(t);
  if (audioT >= 0 && Math.abs(t - audioT) < 3600) {
    const [a, b] = t > audioT ? [audioT, t] : [t, audioT];
    for (let x = a; x <= b; x += loud.step) lv = Math.max(lv, loudAt(x));
  }
  audioT = t;
  const dt = audioWall ? Math.min(0.5, now - audioWall) : 0;
  audioWall = now;
  planeEnv = lv > planeEnv ? lv : planeEnv * Math.exp(-dt / 1.0);
  planeGain.gain.setTargetAtTime(planeEnv, now, 0.03);
  planeFilter.frequency.setTargetAtTime(1500 + planeEnv * 10500, now, 0.03);
}

// 運用が切り替わる時刻（1時間ごとの推定で、前の時間と運用が変わった時間の始まり）
const SWITCHES: { s: number; from: string; to: string }[] = [];
{
  let prev: Mode = null;
  for (const hr of day.hours) {
    if (hr.mode && prev && hr.mode !== prev) SWITCHES.push({ s: hr.h * 3600, from: prev, to: hr.mode });
    if (hr.mode) prev = hr.mode;
  }
}
const SWITCH_TEXT: Record<string, string> = {
  "north>south": "風が南に変わり、南風運用へ",
  "south>south-city": "15時台、都心側からの着陸に切り替え",
  "south-city>south": "18時台、いつもの南風運用に戻る",
  "south>north": "風が北に変わり、北風運用へ",
};
// 再生の速さ: 切り替わりの前後 SLOW_W 秒はゆっくり、それ以外は速く
const SLOW_W = 1800;
function rate(t: number) {
  return SWITCHES.some((x) => Math.abs(t - x.s) < SLOW_W) ? 0.28 : 1.6;
}
const banner = $("banner");
let bannerUntil = 0;
function showSwitch(x: { from: string; to: string }) {
  banner.innerHTML = `<span class="${x.from}">${MODE_NAME[x.from]}</span> → <span class="${x.to}">${MODE_NAME[x.to]}</span><div>${SWITCH_TEXT[`${x.from}>${x.to}`] ?? ""}</div>`;
  banner.classList.add("on");
  bannerUntil = performance.now() + 4500;
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
  updateAudio(t);
  if (bannerUntil && performance.now() > bannerUntil) {
    banner.classList.remove("on");
    bannerUntil = 0;
  }
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
  t = Math.min(86400, t + dt * Number(speed.value) * rate(t));
  for (const x of SWITCHES) if (x.s > prev && x.s <= t) showSwitch(x);
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
        startAudio();
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

// 録画用ツアー（?shot&tour）: 7:00 から 19:30 まで、切り替わりの前後をゆっくり再生する。
// 音を後から作るため、再生した時刻の記録（ページの時刻 ms, 地図の時刻 s）を window.__tlog に残す
async function tour() {
  t = 7 * 3600;
  render();
  await new Promise((r) => setTimeout(r, 1500));
  const w = window as unknown as { __tlog: [number, number][]; __t0: number };
  w.__tlog = [];
  w.__t0 = performance.now();
  document.body.classList.add("tour-start");
  const END = 19.5 * 3600;
  map.easeTo({ bearing: cam[4] + 25, duration: 60000, easing: (x) => x, essential: true });
  await new Promise<void>((resolve) => {
    let lastT = 0;
    const step = (now: number) => {
      const dt = lastT ? (now - lastT) / 1000 : 0;
      lastT = now;
      const prev = t;
      t = Math.min(END, t + dt * 1200 * rate(t));
      for (const x of SWITCHES) if (x.s > prev && x.s <= t) showSwitch(x);
      w.__tlog.push([now - w.__t0, t]);
      render();
      if (t < END) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
  await new Promise((r) => setTimeout(r, 1500));
  w.__tlog.push([performance.now() - w.__t0, t]);
  document.body.classList.add("tour-done");
}

map.on("load", () => {
  requestAnimationFrame(windLoop);
  render();
  map.once("idle", () => {
    document.body.classList.add("ready");
    if (params.has("tour")) tour();
  });
  if (params.has("play")) setPlaying(true);
});
