import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { SimpleMeshLayer } from "@deck.gl/mesh-layers";
import { CROWN_BASE, CROWN_MESH, TRUNK_MESH, hash } from "./tree3d";
import { Protocol } from "pmtiles";
import "./style.css";

maplibregl.setWorkerUrl(workerUrl);
maplibregl.addProtocol("pmtiles", new Protocol().tile);

// 背景地図: 国土地理院の最適化ベクトルタイル。水域・道路・区界だけを、点より目立たない暗い色で薄く出す
const GSI_PMTILES = "https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/optimal_bvmap-v1.pmtiles";

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
type Road = { name: string; n: number; share: number; wards: string[]; spot: [number, number]; spotWard: string; near: number };
type Meta = { ginkgo: number; total: number; bounds: [[number, number], [number, number]] };

// URL のパラメータ: ?date=11-20 でその日を表示、?shot で操作部品を隠す（録画用）、?play で自動再生
const params = new URLSearchParams(location.search);
const SHOT = params.has("shot");
const NARROW = innerWidth <= 600;
const R = NARROW ? 0.55 : 1; // 狭い画面では点を小さくする
const BASE = params.get("base") !== "0"; // ?base=0 で背景地図を消す
const LABELS = params.get("labels") !== "0"; // ?labels=0 で通りの名前を消す
const LEAF_FX = params.get("leaves") !== "0"; // ?leaves=0 で舞い落ちる粒を消す
// 3D の木の大きさの倍率（見やすさのための誇張）。?scale=1 で実寸（樹高・枝張のデータそのまま）
const TREE_SCALE = Math.max(0.5, Number(params.get("scale") ?? 2.5));
// 道路は灰色の「ほかの街路樹」の点と見分けられるよう、青みの暗い色にする
const ROAD = "#1c2633";
const BASE_LAYERS: maplibregl.LayerSpecification[] = [
  { id: "water", type: "fill", source: "gsi", "source-layer": "WA", paint: { "fill-color": "#0f1824" } },
  {
    id: "road-minor",
    type: "line",
    source: "gsi",
    "source-layer": "RdCL",
    minzoom: 12,
    filter: ["!", ["in", ["get", "vt_rdctg"], ["literal", ["国道", "都道府県道", "高速自動車国道等"]]]],
    paint: { "line-color": ROAD, "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.4, 16, 1.5] },
  },
  {
    id: "road-major",
    type: "line",
    source: "gsi",
    "source-layer": "RdCL",
    filter: ["in", ["get", "vt_rdctg"], ["literal", ["国道", "都道府県道", "高速自動車国道等"]]],
    paint: { "line-color": ROAD, "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.5, 12, 1.2, 16, 4] },
  },
  {
    id: "rail",
    type: "line",
    source: "gsi",
    "source-layer": "RailCL",
    paint: { "line-color": "#18202a", "line-width": 0.8, "line-dasharray": [3, 2] },
  },
  {
    id: "ward",
    type: "line",
    source: "gsi",
    "source-layer": "AdmBdry",
    paint: { "line-color": "#2a3442", "line-width": 0.6, "line-dasharray": [4, 3] },
  },
];
if (SHOT) document.body.classList.add("shot");

const [meta, pheno, buf, roadData, sizeBuf] = await Promise.all([
  fetch(DATA + "meta.json").then((r) => r.json() as Promise<Meta>),
  fetch(DATA + "phenology.json").then((r) => r.json() as Promise<Pheno>),
  fetch(DATA + "trees.bin").then((r) => r.arrayBuffer()),
  fetch(DATA + "roads.json").then((r) => r.json() as Promise<{ radius: number; roads: Road[] }>),
  fetch(DATA + "ginkgo_size.bin").then((r) => r.arrayBuffer()),
]);
// イチョウ1本ずつの [樹高, 枝張]（m）
const SIZE = new Float32Array(sizeBuf);
const ROADS = roadData.roads;
const pos = new Float32Array(buf);
const ginkgoPos = pos.subarray(0, meta.ginkgo * 2);
const otherPos = pos.subarray(meta.ginkgo * 2);
const days = pheno.days;
const N = pheno.n;

const PAD = NARROW ? { top: 360, bottom: Math.round(innerHeight * 0.26) + 8, left: 16, right: 16 } : { top: 40, bottom: 40, left: 520, right: SHOT ? 40 : 330 };
const map = new maplibregl.Map({
  container: "map",
  bounds: meta.bounds,
  fitBoundsOptions: { padding: PAD },
  maxZoom: 18,
  maxPitch: 72,
  attributionControl: false,
  canvasContextAttributes: { preserveDrawingBuffer: SHOT },
  style: {
    version: 8,
    sources: BASE ? { gsi: { type: "vector", url: `pmtiles://${GSI_PMTILES}` } } : {},
    layers: [
      { id: "background", type: "background", paint: { "background-color": BG } },
      ...(BASE ? BASE_LAYERS : []),
    ],
  },
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");

// deck.gl 9.4 の interleaved は MapLibre 6 と合わないので、地図の上に重ねる。
// 通りの名前も deck.gl の TextLayer で、光る点の上に描く
const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
const TOP = 10; // 一覧と、引いた表示で名前を出す通りの数
const FONT = '"BIZ UDPGothic", "Yu Gothic UI", "Hiragino Sans", "Noto Sans JP", sans-serif';
const CHARS = Array.from(new Set(ROADS.map((r) => r.name).join("") + "イチョウ本0123456789, "));
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

type Label = { road: Road; rank: number; text: string; size: number; side: 1 | -1 };
// 名前を置く場所を画面上で決める（ほかの名前やパネルと重ならないように）
function placeLabels(): Label[] {
  const W = map.getContainer().clientWidth;
  const H = map.getContainer().clientHeight;
  const boxes: [number, number, number, number][] = [];
  for (const id of ["panel", "road-panel"]) {
    const r = document.getElementById(id)?.getBoundingClientRect();
    if (r && r.width > 0) boxes.push([r.left, r.top, r.right, r.bottom]);
  }
  const out: Label[] = [];
  const hit = (b: [number, number, number, number]) =>
    b[0] < 0 || b[2] > W || b[1] < 0 || b[3] > H || boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
  ROADS.forEach((road, rank) => {
    // スマホの引いた表示では、名前は上位だけにする
    if (NARROW && map.getZoom() < 12 && rank >= 6 && rank !== sel) return;
    const size = (rank < 5 ? 15 : 12.5) * (NARROW ? 0.85 : 1);
    const text = `${road.name}
イチョウ ${road.n.toLocaleString("ja-JP")}本`;
    const w = Math.max(road.name.length, 9) * size * 1.0 + 6;
    const h = size * 2.4;
    const p = map.project(road.spot);
    for (const side of [1, -1] as const) {
      const x0 = side > 0 ? p.x + 8 : p.x - 8 - w;
      const b: [number, number, number, number] = [x0, p.y - h / 2, x0 + w, p.y + h / 2];
      if (!hit(b) || rank === sel) {
        boxes.push(b);
        out.push({ road, rank, text, size, side });
        return;
      }
    }
  });
  return out;
}

// 3D の木: ズーム 13.5〜14.5 で点から木へ切り替える。木は画面に入っているものだけ描く
const Z3 = 13.5;
const k3d = () => Math.min(1, Math.max(0, map.getZoom() - Z3));
let visibleTrees: number[] = [];
let visibleKey = "";
function updateVisible() {
  const b = map.getBounds();
  const key = `${b.toArray().flat().map((v) => v.toFixed(4)).join(",")}`;
  if (key === visibleKey) return;
  visibleKey = key;
  // 斜めに見ると奥まで入るので、少し広めに取る
  const w = b.getWest(), e = b.getEast(), s = b.getSouth(), n = b.getNorth();
  const mx = (e - w) * 0.15, my = (n - s) * 0.15;
  const out: number[] = [];
  for (let i = 0; i < meta.ginkgo; i++) {
    const x = ginkgoPos[i * 2], y = ginkgoPos[i * 2 + 1];
    if (x > w - mx && x < e + mx && y > s - my && y < n + my) out.push(i);
  }
  visibleTrees = out.slice(0, 6000);
}
// その日の落葉の進み方（落葉した年の割合の、1日あたりの増え方。最大を 1 にそろえる）
const fallRate = days.map((_, i) => {
  const a = days[Math.max(0, i - 1)].f, b = days[Math.min(days.length - 1, i + 1)].f;
  return (b - a) / 2;
});
const FALL_MAX = Math.max(...fallRate);
const rateAt = (t: number) => {
  const i = Math.floor(t), j = Math.min(days.length - 1, i + 1), k = t - i;
  return (fallRate[i] * (1 - k) + fallRate[j] * k) / FALL_MAX;
};
// 舞い落ちる光の粒（演出）。1本あたり最大 LEAVES 粒、落葉の進み方に合わせて数を増やす
const LEAVES = 5;
let leafPos = new Float32Array(0);
let leafCount = 0;
function updateLeaves(rate: number, now: number) {
  const need = visibleTrees.length * LEAVES * 3;
  if (leafPos.length < need) leafPos = new Float32Array(need);
  let n = 0;
  for (const i of visibleTrees) {
    const h = SIZE[i * 2] * TREE_SCALE, wd = SIZE[i * 2 + 1] * TREE_SCALE;
    const lon = ginkgoPos[i * 2], lat = ginkgoPos[i * 2 + 1];
    for (let k = 0; k < LEAVES; k++) {
      if (hash(i, k) > rate) continue;
      const speed = 0.12 + 0.1 * hash(i, k + 7); // 1秒に落ちる割合
      const p = (now * speed + hash(i, k + 13)) % 1;
      const ang = hash(i, k + 21) * Math.PI * 2;
      const rr = wd * 0.5 * (0.3 + 0.9 * p) * hash(i, k + 31);
      const sway = Math.sin(now * 1.7 + k * 2.1 + i) * 0.6 * p;
      const dx = (Math.cos(ang) * rr + sway) / (111320 * Math.cos((lat * Math.PI) / 180));
      const dy = (Math.sin(ang) * rr) / 110540;
      leafPos[n * 3] = lon + dx;
      leafPos[n * 3 + 1] = lat + dy;
      leafPos[n * 3 + 2] = h * (CROWN_BASE + 0.6 * (1 - CROWN_BASE)) * (1 - p);
      n++;
    }
  }
  leafCount = n;
}

// ズームすると点を大きくする（近づいて通りを見るとき、木が1本ずつ見えるように）
const zoomK = () => Math.min(3.5, Math.max(1, 2 ** ((map.getZoom() - 11) * 0.55)));

function layers(t: number) {
  const { y, f } = at(t);
  const zk = zoomK();
  // 黄葉した年の割合で緑→黄、落葉した年の割合で黄→落ち葉色。点は散るほど小さく薄くする
  // （道路沿いに点が重なるので、透明度だけでは薄く見えない）
  const c = mix(mix(GREEN, YELLOW, y), FALLEN, f);
  const alive = 1 - f;
  // 光は黄葉が進むほど強く、散るほど弱く小さくする
  const glow = GLOW * alive * (0.08 + 0.92 * y * y);
  const size = 0.3 + 0.7 * alive;
  const k3 = k3d();
  if (k3 > 0) updateVisible();
  const rate = k3 > 0 && t < days.length - 1 ? rateAt(t) : 0;
  if (rate > 0) updateLeaves(rate, performance.now() / 1000);
  // 樹冠は黄葉が進むほど明るく（自分で光るように）、散るほど小さくして、最後は幹だけ残す
  const lit = 1 + 0.12 * y * alive;
  const crownColor = c.map((v) => Math.min(255, Math.round(v * lit))) as RGB;
  const crownK = 0.12 + 0.88 * alive;
  return [
    new ScatterplotLayer({
      id: "other",
      data: OTHER_DATA,
      getFillColor: OTHER,
      radiusUnits: "pixels",
      getRadius: 0.9 * zk,
      radiusMinPixels: 0.6,
      updateTriggers: { getRadius: [zk] },
    }),
    ...HALO.map(
      (h, i) =>
        new ScatterplotLayer({
          id: `ginkgo-glow-${i}`,
          data: GINKGO_DATA,
          visible: glow > 0,
          getFillColor: [...c, Math.min(255, Math.round(h.a * glow * (1 - 0.35 * k3)))],
          radiusUnits: "pixels",
          getRadius: R * h.r * size * zk,
          parameters: ADDITIVE,
          updateTriggers: { getFillColor: [t, GLOW], getRadius: [t, zk] },
        }),
    ),
    new ScatterplotLayer({
      id: "ginkgo",
      data: GINKGO_DATA,
      getFillColor: [...c, Math.round((60 + 175 * alive) * (1 - k3))],
      visible: k3 < 1,
      radiusUnits: "pixels",
      getRadius: R * 1.7 * (0.35 + 0.65 * alive) * zk,
      updateTriggers: { getFillColor: [t, k3], getRadius: [t, zk] },
    }),
    // 3D の幹（高さは樹冠の始まるところまで）
    new SimpleMeshLayer<number>({
      id: "trunk",
      data: visibleTrees,
      visible: k3 > 0,
      opacity: k3,
      mesh: TRUNK_MESH,
      getPosition: (i) => [ginkgoPos[i * 2], ginkgoPos[i * 2 + 1], 0],
      getScale: (i) => [0.22 * TREE_SCALE, 0.22 * TREE_SCALE, SIZE[i * 2] * TREE_SCALE * CROWN_BASE + 0.4],
      getColor: [92, 78, 62],
      material: { ambient: 0.6, diffuse: 0.5, shininess: 0, specularColor: [0, 0, 0] },
    }),
    // 3D の樹冠（大きさは樹高・枝張のデータ、色は過去30年の割合）
    new SimpleMeshLayer<number>({
      id: "crown",
      data: visibleTrees,
      visible: k3 > 0,
      opacity: k3,
      mesh: CROWN_MESH,
      getPosition: (i) => [ginkgoPos[i * 2], ginkgoPos[i * 2 + 1], SIZE[i * 2] * TREE_SCALE * CROWN_BASE],
      getScale: (i) => {
        const w = SIZE[i * 2 + 1] * TREE_SCALE * crownK, hh = SIZE[i * 2] * TREE_SCALE * (1 - CROWN_BASE) * crownK;
        return [w, w, hh];
      },
      getColor: crownColor,
      material: { ambient: 0.5, diffuse: 0.55, shininess: 0, specularColor: [0, 0, 0] },
      updateTriggers: { getScale: [crownK] },
    }),
    // 舞い落ちる光の粒（演出。粒の数だけが「落葉の進み方」に合わせて変わる）
    new ScatterplotLayer({
      id: "leaves",
      data: { length: leafCount, attributes: { getPosition: { value: leafPos.subarray(0, leafCount * 3), size: 3 } } },
      visible: rate > 0 && LEAF_FX,
      getFillColor: [...mix(YELLOW, FALLEN, 0.25 + 0.5 * f), 210],
      radiusUnits: "pixels",
      getRadius: 0.9 + zk * 0.3, // 葉は木より小さく見えるように
      billboard: true,
      parameters: ADDITIVE,
      updateTriggers: { getFillColor: [t] },
    }),
    // 選んだ通りの、イチョウがいちばん密に並ぶ地点（半径 roadData.radius m の輪）
    new ScatterplotLayer<Road>({
      id: "road-spot",
      data: sel >= 0 ? [ROADS[sel]] : [],
      getPosition: (r) => r.spot,
      radiusUnits: "meters",
      getRadius: roadData.radius,
      stroked: true,
      filled: false,
      // 斜めから見ると輪が画面いっぱいに広がるので、薄くする
      getLineColor: [244, 241, 232, map.getPitch() > 20 ? 70 : 210],
      lineWidthUnits: "pixels",
      getLineWidth: 1.3,
      updateTriggers: { getLineColor: [map.getPitch() > 20] },
    }),
    // 通りの名前。本数の多い通りから順に置き、ほかの名前と重なるときは反対側へ、それでも重なれば出さない
    new TextLayer<Label>({
      id: "road-label",
      data: placeLabels(),
      visible: LABELS,
      pickable: !SHOT,
      getPosition: (l) => l.road.spot,
      getText: (l) => l.text,
      getSize: (l) => l.size,
      getColor: (l) => (l.rank === sel ? [255, 255, 255, 255] : [239, 230, 207, 235]),
      getTextAnchor: (l) => (l.side > 0 ? "start" : "end"),
      getPixelOffset: (l) => [l.side * 10, 0],
      getAlignmentBaseline: "center",
      fontFamily: FONT,
      fontWeight: 700,
      characterSet: CHARS,
      lineHeight: 1.15,
      fontSettings: { sdf: true, buffer: 6 },
      outlineWidth: 4,
      outlineColor: [6, 9, 13, 235],
      updateTriggers: { getColor: [sel] },
      onClick: (info) => {
        if (info.object) select(info.object.rank === sel ? -1 : info.object.rank);
      },
    }),
  ];
}

// 表示
const $ = (id: string) => document.getElementById(id)!;
$("count").textContent = meta.ginkgo.toLocaleString("ja-JP");
$("scale-note").textContent = String(TREE_SCALE);
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

// イチョウの多い通りの一覧。押すと、その通りでイチョウがいちばん密に並ぶ地点へ寄る
const list = $("roads");
let sel = -1;
list.innerHTML = ROADS.slice(0, TOP)
  .map(
    (r, i) => `<li><button type="button" data-i="${i}">
      <span class="rk">${i + 1}</span>
      <span class="nm">${r.name}<small>${r.wards.slice(0, 3).join("・")}</small></span>
      <span class="ct">${r.n.toLocaleString("ja-JP")}<small>本</small></span>
    </button></li>`,
  )
  .join("");
function select(i: number) {
  sel = i;
  list.querySelectorAll("button").forEach((b) => b.classList.toggle("on", Number(b.dataset.i) === i));
  render();
  const info = $("road-info");
  if (i < 0) {
    info.innerHTML = "";
    map.fitBounds(meta.bounds, { padding: PAD, duration: 1400, pitch: 0, bearing: 0 });
    return;
  }
  const r = ROADS[i];
  info.innerHTML =
    `<b>${r.name}</b>: 都道の街路樹 ${Math.round(r.n / r.share).toLocaleString("ja-JP")}本のうち <b>${Math.round(r.share * 100)}%</b> がイチョウ。` +
    `輪の中（${r.spotWard}、半径${roadData.radius}m）に ${r.near}本が並ぶ`;
  // 斜めから見下ろして、3D の並木を見せる
  map.flyTo({ center: r.spot, zoom: 17.3, pitch: 64, bearing: -25, padding: PAD, duration: 2600 });
}
list.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b) return;
  const i = Number(b.dataset.i);
  select(sel === i ? -1 : i);
});
$("reset").addEventListener("click", () => select(-1));

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

// 再生していないときは、ズームに合わせて点の大きさを描き直す
// 3D の木を見ているあいだは、止めていても粒が舞い続けるように描き直す
function idleLoop() {
  if (!playing && LEAF_FX && k3d() > 0 && rateAt(t) > 0) render();
  requestAnimationFrame(idleLoop);
}
requestAnimationFrame(idleLoop);

// 斜めから見る／真上から見る
$("tilt").addEventListener("click", () => {
  const flat = map.getPitch() < 5;
  map.easeTo({ pitch: flat ? 60 : 0, bearing: flat ? -20 : 0, zoom: flat ? Math.max(map.getZoom(), 15.5) : map.getZoom(), duration: 1200 });
});

map.on("move", () => {
  if (!playing) render();
});

map.on("load", () => {
  render();
  const r0 = params.get("road");
  if (r0) {
    const i = ROADS.findIndex((r) => r.name === r0);
    if (i >= 0) select(i);
  }
  map.once("idle", () => {
    document.body.classList.add("ready");
    if (params.has("tour")) tour();
  });
  if (params.has("play")) setPlaying(true);
});

// 録画用の自動ツアー（?shot&tour）。23区全体で色づき始めるまでを見せ、青梅街道へ斜めに寄って
// 黄葉して散るまでをゆっくり見せ、最後に全体へ戻る。始まりと終わりを body の class で知らせる
const dayIndex = (md: string) => days.findIndex((d) => d.md === md);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
function playRange(from: string, to: string, seconds: number) {
  const a = dayIndex(from), b = dayIndex(to);
  return new Promise<void>((resolve) => {
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / (seconds * 1000));
      t = a + (b - a) * k;
      render();
      if (k < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}
const moved = () => new Promise<void>((r) => map.once("moveend", () => r()));
async function tour() {
  const road = ROADS[0]; // 青梅街道
  t = dayIndex("11-01");
  render();
  await wait(1500);
  document.body.classList.add("tour-start");
  await wait(1500);
  // 23区全体で、緑から黄色へ光が広がって、いちばん光るところまで
  await playRange("11-01", "11-28", 9);
  await wait(800);
  map.flyTo({ center: road.spot, zoom: 17.9, pitch: 66, bearing: -40, padding: PAD, duration: 3500, essential: true });
  await moved();
  // 回り込みながら、黄色い並木が縮んで散るまでをゆっくり
  map.easeTo({ bearing: 5, duration: 15000, easing: (x) => x, essential: true });
  await playRange("11-28", "12-14", 15);
  await wait(500);
  map.fitBounds(meta.bounds, { padding: PAD, pitch: 0, bearing: 0, duration: 3500, essential: true });
  await moved();
  await playRange("12-14", "12-15", 1);
  await wait(2000);
  document.body.classList.add("tour-done");
}
