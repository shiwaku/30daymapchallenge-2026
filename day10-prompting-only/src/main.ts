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

function layers(t: number) {
  const { y, f } = at(t);
  // 黄葉した年の割合で緑→黄、落葉した年の割合で黄→落ち葉色。点は散るほど小さく薄くする
  // （道路沿いに点が重なるので、透明度だけでは薄く見えない）
  const c = mix(mix(GREEN, YELLOW, y), FALLEN, f);
  const alive = 1 - f;
  const bin = (p: Float32Array) => ({ length: p.length / 2, attributes: { getPosition: { value: p, size: 2 } } });
  return [
    new ScatterplotLayer({
      id: "other",
      data: bin(otherPos),
      getFillColor: OTHER,
      radiusUnits: "pixels",
      getRadius: 0.9,
      radiusMinPixels: 0.6,
    }),
    // 黄葉が進むほど光をにじませる
    new ScatterplotLayer({
      id: "ginkgo-glow",
      data: bin(ginkgoPos),
      getFillColor: [...c, Math.round(40 * alive * (0.4 + 0.6 * y))],
      radiusUnits: "pixels",
      getRadius: R * 4.5 * (0.3 + 0.7 * alive),
      updateTriggers: { getFillColor: [t], getRadius: [t] },
    }),
    new ScatterplotLayer({
      id: "ginkgo",
      data: bin(ginkgoPos),
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
chart.innerHTML = `
  <path d="${path("y")}" fill="none" stroke="#ffd23f" stroke-width="2" vector-effect="non-scaling-stroke"/>
  <path d="${path("f")}" fill="none" stroke="#c98a3b" stroke-width="2" vector-effect="non-scaling-stroke"/>
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
