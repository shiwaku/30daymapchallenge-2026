import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "./main.css";
import { AREAS, type Cam } from "./areas";

maplibregl.setWorkerUrl(workerUrl);
type Expr = maplibregl.ExpressionSpecification;

// 首都高ができていく（時系列アニメーション）
//   ?area=east（隅田川沿いの東側の路線）/ pilot（江戸橋JCT〜箱崎JCT）
//   ?play   1955年から今まで進める（終わると body に done を付ける）
//   ?t=秒   アニメーションのその時点の絵で止める（静止画の確認用）
const params = new URLSearchParams(location.search);
const A = AREAS[params.get("area") === "pilot" ? "pilot" : "east"];
const base = (p: string) => new URL(p, location.href).href;
const gsi = (id: string, ext: string) => [`https://cyberjapandata.gsi.go.jp/xyz/${id}/{z}/{x}/{y}.${ext}`];

// 時間 → 年
const KEYS = A.keys;
const DURATION = KEYS[KEYS.length - 1][0];
const lerpKeys = (x: number, from: 0 | 1) => {
  const to = from === 0 ? 1 : 0;
  for (let i = 1; i < KEYS.length; i++) {
    const a = KEYS[i - 1], b = KEYS[i];
    if (x <= b[from] && b[from] > a[from]) return a[to] + ((b[to] - a[to]) * (x - a[from])) / (b[from] - a[from]);
  }
  return KEYS[KEYS.length - 1][to];
};
const yearAt = (t: number) => lerpKeys(Math.max(t, 0), 0);
const timeAt = (y: number) => lerpKeys(y, 1);
const RISE = 0.8; // 開通した区間が立ち上がる時間（秒）
const FLASH = 1.6; // 開通時の光が落ち着くまで（秒）
const FADE = 0.6; // 写真の切り替え（秒）

// 背景の写真（from 年から to 年まで）。地理院タイルの年代区分は撮影期間
type Era = { id: string; from: number; to?: number; label: string; tiles?: string[]; maxzoom?: number };
const ERAS: Era[] = [
  { id: "usa", from: 0, label: "1945〜50年（米軍撮影）", tiles: gsi("ort_USA10", "png"), maxzoom: 17 },
  { id: "old", from: 1961, label: A.oldLabel, tiles: gsi("ort_old10", "png"), maxzoom: 17 },
  { id: "kt", from: 1963, to: A.ktTo, label: "1965年頃（国土地理院 過去の地形データ）" },
  { id: "gazo1", from: 1974, label: "1974〜78年", tiles: gsi("gazo1", "jpg"), maxzoom: 17 },
  { id: "gazo2", from: 1979, label: "1979〜83年", tiles: gsi("gazo2", "jpg"), maxzoom: 17 },
  { id: "gazo3", from: 1984, label: "1984〜86年", tiles: gsi("gazo3", "jpg"), maxzoom: 17 },
  { id: "gazo4", from: 1987, label: "1988〜90年", tiles: gsi("gazo4", "jpg"), maxzoom: 17 },
  { id: "now", from: 2000, label: "現在（シームレス空中写真）", tiles: gsi("seamlessphoto", "jpg"), maxzoom: 18 },
];
const corners = (await (await fetch(base("pilot/kt657y.json"))).json()).coordinates;

// 開通年代の色（凡例と同じ）
const DECADES: [number, string, string][] = [[1960, "#ffc845", "1960年代"], [1970, "#ff8a3d", "1970年代"], [1980, "#ff4f6d", "1980年代"]];
const decadeOf = (y: number) => DECADES.filter(([d]) => d <= y).pop()![1];

const ease = (x: number) => x * x * (3 - 2 * x);
const camAt = (T: number): Cam => {
  const C = A.cams;
  for (let i = 1; i < C.length; i++) {
    const [t0, a] = C[i - 1], [t1, b] = C[i];
    if (T <= t1) {
      const f = ease(Math.max(0, (T - t0) / (t1 - t0)));
      const l = (x: number, y: number) => x + (y - x) * f;
      return { center: [l(a.center[0], b.center[0]), l(a.center[1], b.center[1])], zoom: l(a.zoom, b.zoom), pitch: l(a.pitch, b.pitch), bearing: l(a.bearing, b.bearing) };
    }
  }
  return C[C.length - 1][1];
};

// 道路は開通年ごとにレイヤを分ける。毎コマ変えるのは「レイヤ1つにつき1つの値」の色・不透明度と、
// 立ち上がり中の区間の feature-state だけにする（地物ごとに変わる式を入れ直したり、visibility を切り替えたりすると、
// MapLibre がそのたびに道路を作り直し、部品が多いと追いつかないため）
const data = await (await fetch(base(`${A.dir}/roads.geojson`))).json();
const lineData = await (await fetch(base(`${A.dir}/lines.geojson`))).json();
const BINS = 8, L = 40; // 光の粒: 線に沿って 40m を 8 組に分け、組ごとに明るさを変えて流す（上り下りで逆向き）
type Props = { kind: string; year: number; lane: number; d: number; z: number; bin?: number };
const feats = data.features as { properties: Props }[];
for (const f of feats) {
  const q = f.properties;
  if (q.kind === "light") q.bin = Math.floor(((((q.lane * q.d) % L) + L) % L) / (L / BINS));
}
const YEARS = [...new Set(feats.map((f) => f.properties.year))].sort((a, b) => a - b);
// 立ち上げるのは寄る場面の範囲（z=1）の路面・橋脚だけ。ほかは開通と同時に出す（引いた画面では線で見せる）
const idsByYear = new Map<number, number[]>(YEARS.map((y) => [y, []]));
feats.forEach((f, i) => { if (f.properties.kind !== "light" && f.properties.z) idsByYear.get(f.properties.year)!.push(i); });

const kind = (k: string): Expr => ["==", ["get", "kind"], k];
const DECK: Expr = ["any", kind("deck"), kind("ground")];
const P: Expr = ["coalesce", ["feature-state", "p"], 1];
const ext = (id: string, filter: Expr, color: string, rise = true): maplibregl.LayerSpecification => ({
  id, type: "fill-extrusion", source: "roads", filter,
  paint: {
    "fill-extrusion-color": color, "fill-extrusion-opacity": 0, "fill-extrusion-opacity-transition": { duration: 0 }, "fill-extrusion-vertical-gradient": true,
    "fill-extrusion-base": rise ? ["*", P, ["get", "b"]] : ["get", "b"], "fill-extrusion-height": rise ? ["*", P, ["get", "t"]] : ["get", "t"],
  },
});
const lineLayer = (id: string, y: number, glow: boolean): maplibregl.LayerSpecification => ({
  id, type: "line", source: "lines", filter: ["==", ["get", "year"], y], layout: { "line-cap": "round", "line-join": "round" },
  paint: { "line-color": "#000000", "line-opacity": 0, "line-opacity-transition": { duration: 0 }, "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 11, glow ? 3 : 1.4, 14, glow ? 9 : 4.5] },
});
const roadLayers = (glow: boolean) => YEARS.flatMap((y) => {
  const yr: Expr = ["==", ["get", "year"], y];
  const g = glow ? "g-" : "";
  return [
    lineLayer(`${g}line-${y}`, y, glow),
    ...(glow ? [] : [ext(`pier-${y}`, ["all", yr, kind("pier")], "#454b58")]),
    ext(`${g}deck-${y}`, ["all", yr, DECK], glow ? "#000000" : decadeOf(y)),
    ...Array.from({ length: BINS }, (_, k) => ext(`${g}light-${y}-${k}`, ["all", yr, kind("light"), ["==", ["get", "bin"], k]], "#000000", false)),
  ];
});
const roads = { type: "geojson", data, generateId: true } as maplibregl.GeoJSONSourceSpecification;
const lines = { type: "geojson", data: lineData } as maplibregl.GeoJSONSourceSpecification;
const sources: Record<string, maplibregl.SourceSpecification> = { roads, lines };
const layers: maplibregl.LayerSpecification[] = [{ id: "bg", type: "background", paint: { "background-color": "#0b0f1a" } }];
for (const e of ERAS) {
  sources[e.id] = e.tiles ? { type: "raster", tiles: e.tiles, tileSize: 256, maxzoom: e.maxzoom } : { type: "image", url: base("pilot/kt657y.png"), coordinates: corners };
  layers.push({ id: e.id, type: "raster", source: e.id, paint: { "raster-opacity": 0, "raster-opacity-transition": { duration: 0 }, "raster-saturation": -1, "raster-contrast": 0.15, "raster-brightness-max": 0.62 } });
}
// 写真を夜のように沈める（青みの幕）
layers.push({ id: "tint", type: "background", paint: { "background-color": "#0a1a3a", "background-opacity": 0.38 } });
layers.push(...roadLayers(false));

const cam0 = camAt(0);
const opts = { ...cam0, maxPitch: 80, attributionControl: false as const, fadeDuration: 0, interactive: false };
const map = new maplibregl.Map({ container: "map", style: { version: 8, sources, layers, light: { anchor: "map", position: [1.4, 210, 40], intensity: 0.45 } }, ...opts });
map.on("error", (e) => console.error("map error:", e.error?.message ?? e));
// 発光: 道路だけを描いた2枚目の地図を同じカメラで重ね、CSS でぼかして明るさを足す合成で乗せる（Day 5 と同じ方法）
const glow = new maplibregl.Map({ container: "glow", style: { version: 8, sources: { roads, lines }, layers: roadLayers(true) }, ...opts });

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const $ = (id: string) => document.getElementById(id)!;
$("legend").innerHTML = "<b>開通した年代</b>" + DECADES.map(([, c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join("");

// 色を混ぜる（a → b を f で）
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a: string, b: string, f: number) => {
  const x = rgb(a), y = rgb(b), k = clamp(f);
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, "0")).join("");
};

// 路線名・JCT名・川の名前（開通した年から出す）。Marker は自分で opacity を触るので、中の span で出し入れする
type Label = { kind: "route" | "jct" | "place"; text: string; year: number; lnglat: [number, number]; minzoom?: number; maxzoom?: number };
const labels = (await (await fetch(base(`${A.dir}/labels.json`))).json()).labels as Label[];
const labelEls = labels.map((l) => {
  const el = document.createElement("div");
  const span = document.createElement("span");
  span.className = `lbl ${l.kind}`;
  span.textContent = l.text;
  span.style.setProperty("--c", l.year ? decadeOf(l.year) : "#fff");
  span.style.opacity = "0";
  el.appendChild(span);
  new maplibregl.Marker({ element: el, anchor: l.kind === "route" ? "bottom" : "center", offset: l.kind === "route" ? [0, -10] : [0, 0] }).setLngLat(l.lnglat).addTo(map);
  return { l, span };
});

// 同じ値は入れ直さない
const last = new Map<string, string>();
const paint = (m: maplibregl.Map, id: string, prop: string, v: unknown) => {
  const key = (m === map ? "m:" : "g:") + id + prop;
  const s = JSON.stringify(v);
  if (last.get(key) === s) return;
  last.set(key, s);
  m.setPaintProperty(id, prop as keyof maplibregl.AllPaintProperties, v as never);
};
// 寄った画面では路面（3D）、引いた画面では線
const deckOn: Expr = ["interpolate", ["linear"], ["zoom"], A.z3d[0], 0, A.z3d[1], 1];
// 寄った画面でも線を半分の濃さで残す（掘割は地面すれすれで見えにくいので、線でつながって見えるように）
const lineOn: Expr = ["interpolate", ["linear"], ["zoom"], A.z3d[0], 1, A.z3d[1], 0.5];
const lastP = new Map<number, number>();

function render(T: number) {
  const year = Math.floor(yearAt(T));
  const cam = camAt(T);
  $("y").textContent = String(year);
  let cur = ERAS[0];
  for (const e of ERAS) {
    let o = e.from === 0 ? 1 : clamp((T - timeAt(e.from)) / FADE);
    if (e.to) o *= 1 - clamp((T - timeAt(e.to)) / FADE);
    paint(map, e.id, "raster-opacity", Math.round(o * 100) / 100);
    // 1965年頃の写真は江戸橋JCT 付近だけなので、寄っているときだけ写真の年代として出す
    if (o > 0.5 && (e.id !== "kt" || cam.zoom > 15)) cur = e;
  }
  $("era").textContent = `写真: ${cur.label}`;
  const cap = A.captions.find(([a, b]) => T >= a && T < b)?.[2] ?? "";
  const capEl = $("caption");
  if (cap !== capEl.dataset.text) {
    capEl.dataset.text = cap;
    if (cap) capEl.textContent = cap;
    capEl.classList.toggle("on", !!cap);
  }
  for (const { l, span } of labelEls) {
    const on = (l.year === 0 || T >= timeAt(l.year) + RISE * 0.7) && cam.zoom >= (l.minzoom ?? 0) && cam.zoom <= (l.maxzoom ?? 99);
    span.style.opacity = on ? "1" : "0";
  }

  const q = (v: number) => Math.round(clamp(v) * 40) / 40; // 色の変化を細かくしすぎない（同じ値なら入れ直さない）
  for (const y of YEARS) {
    const age = T - timeAt(y);
    const c = decadeOf(y);
    if (age < 0) {
      paint(map, `line-${y}`, "line-opacity", 0);
      paint(glow, `g-line-${y}`, "line-opacity", 0);
      paint(map, `pier-${y}`, "fill-extrusion-opacity", 0);
      paint(map, `deck-${y}`, "fill-extrusion-opacity", 0);
      paint(glow, `g-deck-${y}`, "fill-extrusion-opacity", 0);
      for (let k = 0; k < BINS; k++) { paint(map, `light-${y}-${k}`, "fill-extrusion-opacity", 0); paint(glow, `g-light-${y}-${k}`, "fill-extrusion-opacity", 0); }
      continue;
    }
    // 立ち上がり: 開通した時刻から RISE 秒で地面から（feature-state p を 0 → 1、20段）
    const p = Math.round(clamp(age / RISE) * 20) / 20;
    if (lastP.get(y) !== p) {
      lastP.set(y, p);
      for (const id of idsByYear.get(y)!) {
        map.setFeatureState({ source: "roads", id }, { p });
        glow.setFeatureState({ source: "roads", id }, { p });
      }
    }
    const white = mix("#fffaf0", c, q(age / (RISE + 0.6)));
    const flash = age < RISE ? mix("#ffffff", "#fff1cc", q(age / RISE)) : mix("#fff1cc", mix("#000000", c, 0.55), q((age - RISE) / FLASH));
    // 引いた画面の線と、寄った画面の路面: 開通の瞬間に白く光り、年代の色に落ち着く
    paint(map, `line-${y}`, "line-color", white);
    paint(map, `line-${y}`, "line-opacity", lineOn);
    paint(glow, `g-line-${y}`, "line-color", flash);
    paint(glow, `g-line-${y}`, "line-opacity", lineOn);
    paint(map, `pier-${y}`, "fill-extrusion-opacity", deckOn);
    paint(map, `deck-${y}`, "fill-extrusion-opacity", deckOn);
    paint(glow, `g-deck-${y}`, "fill-extrusion-opacity", deckOn);
    paint(map, `deck-${y}`, "fill-extrusion-color", white);
    paint(glow, `g-deck-${y}`, "fill-extrusion-color", flash);
    // 光の粒: 組 k の位置を時刻でずらし、明るい頭が流れる。立ち上がり終わってから点ける
    const on = clamp((age - RISE) / 0.8);
    for (let k = 0; k < BINS; k++) {
      const ph = (((((k + 0.5) * (L / BINS) - T * 28) % L) + L) % L) / L;
      const b = q((ph > 0.75 ? (ph - 0.75) / 0.25 : 0) * on);
      paint(map, `light-${y}-${k}`, "fill-extrusion-opacity", b > 0.02 ? deckOn : 0);
      paint(glow, `g-light-${y}-${k}`, "fill-extrusion-opacity", b > 0.02 ? deckOn : 0);
      if (b > 0.02) {
        paint(map, `light-${y}-${k}`, "fill-extrusion-color", mix(c, "#ffffff", b));
        paint(glow, `g-light-${y}-${k}`, "fill-extrusion-color", mix("#000000", "#ffe9b0", b));
      }
    }
  }

  map.jumpTo(cam);
  glow.jumpTo(cam);
}

const loaded = (m: maplibregl.Map) => new Promise<void>((r) => (m.loaded() ? r() : m.once("load", () => r())));
const idle = (m: maplibregl.Map) => new Promise<void>((r) => m.once("idle", () => r()));
await Promise.all([loaded(map), loaded(glow)]);
if (params.has("play")) {
  // 録画の前に、カメラの各場面を一度回って写真のタイルを読み込ませる（録画中に読み込むと写真が抜ける）
  for (const [t] of A.cams) {
    for (const tt of [t, t + 0.5]) {
      render(Math.min(tt, DURATION));
      await Promise.all([idle(map), idle(glow)]);
    }
  }
  render(0);
  await Promise.all([idle(map), idle(glow)]);
  document.body.classList.add("ready");
  const t0 = performance.now();
  const step = () => {
    const T = (performance.now() - t0) / 1000;
    render(Math.min(T, DURATION));
    if (T < DURATION) requestAnimationFrame(step);
    else {
      // 最後のコマで変化がないと idle が来ないことがあるので、1.5秒で打ち切る
      const done = () => document.body.classList.add("done");
      map.once("idle", done);
      setTimeout(done, 1500);
    }
  };
  requestAnimationFrame(step);
} else {
  render(params.has("t") ? Number(params.get("t")) : DURATION);
  await Promise.all([idle(map), idle(glow)]);
  document.body.classList.add("ready");
}
