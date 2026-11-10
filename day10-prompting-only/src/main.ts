import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ScatterplotLayer } from "@deck.gl/layers";
import "./style.css";

maplibregl.setWorkerUrl(workerUrl);

// 開発時は day10-prompting-only/web、公開時（day10-prompting-only/site/）は ../web を読む
const DATA = import.meta.env.DEV ? "./web/" : "../web/";
const BG = "#0b0f14";
const GREEN: RGB = [76, 196, 106];
const YELLOW: RGB = [255, 210, 63];
const FALLEN: RGB = [150, 104, 52]; // 散ったあとの色（落ち葉）
const OTHER: [number, number, number, number] = [110, 118, 128, 150];
const YEAR = 2026; // 曜日の表示に使う年
const WEEK = "日月火水木金土";

type RGB = [number, number, number];
type Day = { md: string; y: number; f: number };
type Pheno = { station: string; years: [number, number]; n: number; days: Day[] };
type Meta = { ginkgo: number; total: number; bounds: [[number, number], [number, number]] };

// URL のパラメータ: ?date=11-20 でその日を表示、?shot で操作部品を隠す（録画用）、?play で自動再生
const params = new URLSearchParams(location.search);
const SHOT = params.has("shot");
const NARROW = innerWidth <= 600;
const R = NARROW ? 0.55 : 1; // 狭い画面では点を小さくする
if (SHOT) document.body.classList.add("shot");

const [meta, pheno, buf] = await Promise.all([
  fetch(DATA + "meta.json").then((r) => r.json() as Promise<Meta>),
  fetch(DATA + "phenology.json").then((r) => r.json() as Promise<Pheno>),
  fetch(DATA + "trees.bin").then((r) => r.arrayBuffer()),
]);
const pos = new Float32Array(buf);
const ginkgoPos = pos.subarray(0, meta.ginkgo * 2);
const otherPos = pos.subarray(meta.ginkgo * 2);
const days = pheno.days;
const N = pheno.n;

const map = new maplibregl.Map({
  container: "map",
  bounds: meta.bounds,
  fitBoundsOptions: { padding: NARROW ? { top: 360, bottom: 16, left: 16, right: 16 } : { top: 40, bottom: 40, left: 520, right: 40 } },
  maxZoom: 18,
  attributionControl: false,
  canvasContextAttributes: { preserveDrawingBuffer: SHOT },
  style: {
    version: 8,
    sources: {},
    layers: [{ id: "background", type: "background", paint: { "background-color": BG } }],
  },
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
map.addControl(overlay);

// t は days の添字（小数で日と日のあいだを補間する）
function at(t: number): { y: number; f: number } {
  const i = Math.max(0, Math.min(days.length - 1, Math.floor(t)));
  const j = Math.min(days.length - 1, i + 1);
  const k = t - i;
  return {
    y: (days[i].y * (1 - k) + days[j].y * k) / N,
    f: (days[i].f * (1 - k) + days[j].f * k) / N,
  };
}
const mix = (a: RGB, b: RGB, k: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k)) as RGB;

// 点のデータは一度だけ作る（毎コマ作り直すと 14 万点を GPU に送り直してしまう）
const bin = (p: Float32Array) => ({ length: p.length / 2, attributes: { getPosition: { value: p, size: 2 } } });
const OTHER_DATA = bin(otherPos);
const GINKGO_DATA = bin(ginkgoPos);

// グロー（発光）: 大きさの違う薄い円を加算合成で重ね、外へ向かってなだらかに減る光にする。
// 道路沿いに木が並ぶ所ほど光が重なって明るくなる。?glow=0 で消す、?glow=1.5 で強める
// 狭い画面では点が詰まって光が重なりすぎるので弱める
const GLOW = Math.max(0, Number(params.get("glow") ?? 1)) * (NARROW ? 0.3 : 1);
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
// 木が密に並ぶので、1本あたりの光はごく弱くする（強いと重なって白く飛ぶ）
const HALO = [
  { r: 16, a: 1.6 },
  { r: 8, a: 3.5 },
  { r: 4, a: 8 },
];

function layers(t: number) {
  const { y, f } = at(t);
  // 黄葉した年の割合で緑→黄、落葉した年の割合で黄→落ち葉色。点は散るほど小さく薄くする
  // （道路沿いに点が重なるので、透明度だけでは薄く見えない）
  const c = mix(mix(GREEN, YELLOW, y), FALLEN, f);
  const alive = 1 - f;
  // 光は黄葉が進むほど強く、散るほど弱く小さくする
  const glow = GLOW * alive * (0.08 + 0.92 * y * y);
  const size = 0.3 + 0.7 * alive;
  return [
    new ScatterplotLayer({
      id: "other",
      data: OTHER_DATA,
      getFillColor: OTHER,
      radiusUnits: "pixels",
      getRadius: 0.9,
      radiusMinPixels: 0.6,
    }),
    ...HALO.map(
      (h, i) =>
        new ScatterplotLayer({
          id: `ginkgo-glow-${i}`,
          data: GINKGO_DATA,
          visible: glow > 0,
          getFillColor: [...c, Math.min(255, Math.round(h.a * glow))],
          radiusUnits: "pixels",
          getRadius: R * h.r * size,
          parameters: ADDITIVE,
          updateTriggers: { getFillColor: [t, GLOW], getRadius: [t] },
        }),
    ),
    new ScatterplotLayer({
      id: "ginkgo",
      data: GINKGO_DATA,
      getFillColor: [...c, Math.round(60 + 175 * alive)],
      radiusUnits: "pixels",
      getRadius: R * 1.7 * (0.35 + 0.65 * alive),
      updateTriggers: { getFillColor: [t], getRadius: [t] },
    }),
  ];
}

// 表示
const $ = (id: string) => document.getElementById(id)!;
$("count").textContent = meta.ginkgo.toLocaleString("ja-JP");
const slider = $("slider") as HTMLInputElement;
slider.max = String(days.length - 1);

function label(t: number) {
  const d = days[Math.round(Math.max(0, Math.min(days.length - 1, t)))];
  const [m, dd] = d.md.split("-").map(Number);
  const w = WEEK[new Date(YEAR, m - 1, dd).getDay()];
  $("date").textContent = `${m}月${dd}日（${w}）`;
  $("ny").textContent = `${d.y}/${N}`;
  $("nf").textContent = `${d.f}/${N}`;
}

// 季節の推移（黄葉・落葉した年の数）を小さなグラフにする
const chart = $("chart") as unknown as SVGSVGElement;
const W = 300, H = 70;
const px = (i: number) => (i / (days.length - 1)) * W;
const py = (v: number) => H - 4 - (v / N) * (H - 8);
const path = (key: "y" | "f") => days.map((d, i) => `${i ? "L" : "M"}${px(i).toFixed(1)},${py(d[key]).toFixed(1)}`).join("");
// 線の色は、その日の地図のイチョウの色に合わせる（黄葉: 緑→黄、落葉: 黄→落ち葉色）
const hex = (c: RGB) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
const stops = (color: (d: Day) => RGB) =>
  days.map((d, i) => `<stop offset="${(i / (days.length - 1)).toFixed(4)}" stop-color="${hex(color(d))}"/>`).join("");
chart.innerHTML = `
  <defs>
    <linearGradient id="gy" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W}" y2="0">${stops((d) => mix(GREEN, YELLOW, d.y / N))}</linearGradient>
    <linearGradient id="gf" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W}" y2="0">${stops((d) => mix(YELLOW, FALLEN, d.f / N))}</linearGradient>
  </defs>
  <path d="${path("f")}" fill="none" stroke="url(#gf)" stroke-width="2" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>
  <path d="${path("y")}" fill="none" stroke="url(#gy)" stroke-width="2.5" vector-effect="non-scaling-stroke"/>
  <line id="cursor" y1="0" y2="${H}" stroke="#e8ecf1" stroke-opacity="0.6" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
const cursor = chart.querySelector("#cursor")!;

let t = 0;
function render() {
  overlay.setProps({ layers: layers(t) });
  label(t);
  slider.value = String(t);
  cursor.setAttribute("x1", String(px(t)));
  cursor.setAttribute("x2", String(px(t)));
}

const start = params.get("date");
if (start) {
  const i = days.findIndex((d) => d.md === start);
  if (i >= 0) t = i;
}

// 再生: ふつうで1日 0.25 秒
let playing = false;
let last = 0;
const playBtn = $("play");
const speed = $("speed") as HTMLSelectElement;
function tick(now: number) {
  if (!playing) return;
  const dtSec = last ? (now - last) / 1000 : 0;
  last = now;
  t += dtSec * 4 * Number(speed.value);
  if (t >= days.length - 1) {
    t = days.length - 1;
    setPlaying(false);
  }
  render();
  requestAnimationFrame(tick);
}
function setPlaying(on: boolean) {
  playing = on;
  playBtn.textContent = on ? "停止" : "再生";
  if (on) {
    if (t >= days.length - 1) t = 0;
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
