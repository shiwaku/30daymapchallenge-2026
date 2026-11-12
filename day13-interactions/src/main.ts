import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ArcLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import "./style.css";

// 開発時は day13-interactions/web、公開時（day13-interactions/site/）は ../web を読む
const DATA = import.meta.env.DEV ? "./web/" : "../web/";
const REGION: [[number, number], [number, number]] = [[138.95, 34.9], [140.9, 36.25]];
const BG = "#0b0d12";
const FROM: [number, number, number] = [86, 196, 255]; // 出発地
const TO: [number, number, number] = [255, 150, 60]; // 到着地
const OVERVIEW_N = 2500; // 全体表示で描く本数（多い順）

type Zone = { c: string; n: string; x: number; y: number; g: number[]; a: number[]; s: number[] };
type Flows = { o: number[]; d: number[]; v: number[] };
type Stats = {
  n_zones: number; min_flow: number; purposes: string[]; modes: string[];
  trips_total: number; trips_intra: number; trips_inter: number; n_flows_web: number; flows_web_total: number;
};
type Dir = "both" | "out" | "in";
type Arc = { i: number; v: number };

maplibregl.setWorkerUrl(workerUrl);

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const fmt = (v: number) => Math.round(v).toLocaleString("ja-JP");
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—");
const alphaOf = (v: number) => Math.min(235, 40 + 50 * Math.log10(Math.max(1, v / 100)));
const widthOf = (v: number) => Math.min(18, Math.max(0.6, Math.sqrt(v) / 14));

const params = new URLSearchParams(location.search);
const SHOT = params.has("shot"); // スクリーンショット用（地図の位置を URL に書かない）

const map = new maplibregl.Map({
  container: "map",
  bounds: REGION,
  minZoom: 6,
  maxZoom: 14,
  attributionControl: false,
  canvasContextAttributes: { preserveDrawingBuffer: SHOT },
  style: {
    version: 8,
    sources: {},
    layers: [{ id: "background", type: "background", paint: { "background-color": BG } }],
  },
});
map.addControl(new maplibregl.AttributionControl({ compact: false }));
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

const [zones, flows, stats] = await Promise.all([
  fetch(DATA + "zones.json").then((r) => r.json() as Promise<Zone[]>),
  fetch(DATA + "flows.json").then((r) => r.json() as Promise<Flows>),
  fetch(DATA + "stats.json").then((r) => r.json() as Promise<Stats>),
]);
const P = stats.purposes; // 通勤 通学 私事 業務 帰宅 不明
const M = stats.modes; // 鉄道 バス 自動車 自転車 徒歩 その他
const K = P.length * M.length;
const N = flows.o.length;
const byOrigin: number[][] = zones.map(() => []);
const byDest: number[][] = zones.map(() => []);
for (let i = 0; i < N; i++) {
  byOrigin[flows.o[i]].push(i);
  byDest[flows.d[i]].push(i);
}
const byName = new Map<string, number>();
zones.forEach((z, i) => byName.set(z.n, i));

// 選んでいる目的・手段（"all" はすべて）
let purpose = "all";
let mode = "all";
let dir: Dir = "both";
let sel = -1;
{
  const i = zones.findIndex((z) => z.c === params.get("z"));
  if (i >= 0) sel = i;
  const p = params.get("p");
  if (p && P.includes(p)) purpose = p;
  const m = params.get("m");
  if (m && M.includes(m)) mode = m;
  const dr = params.get("dir");
  if (dr === "out" || dr === "in") dir = dr;
}

// 目的×手段の並び（長さ K）から、いま選んでいる分を足す
function pick(arr: ArrayLike<number>, off = 0) {
  let s = 0;
  for (let p = 0; p < P.length; p++) {
    if (purpose !== "all" && P[p] !== purpose) continue;
    for (let m = 0; m < M.length; m++) {
      if (mode !== "all" && M[m] !== mode) continue;
      s += arr[off + p * M.length + m];
    }
  }
  return s;
}
const value = (i: number) => pick(flows.v, i * K);

function arcs(): Arc[] {
  let ids: number[];
  if (sel < 0) {
    ids = Array.from({ length: N }, (_, i) => i);
  } else {
    ids = [];
    if (dir !== "in") ids.push(...byOrigin[sel]);
    if (dir !== "out") ids.push(...byDest[sel]);
  }
  let list = ids.map((i) => ({ i, v: value(i) })).filter((a) => a.v > 0);
  list.sort((a, b) => b.v - a.v);
  if (sel < 0) list = list.slice(0, OVERVIEW_N);
  return list.reverse(); // 細い線を先に、太い線を後に描く
}

const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
map.addControl(overlay as unknown as maplibregl.IControl);

const label = () => (purpose === "all" ? "全目的" : purpose) + "・" + (mode === "all" ? "全手段" : mode);

const tip = $("#tip");
function onHover(info: PickingInfo<Arc>) {
  const a = info.object;
  if (!a) {
    tip.style.display = "none";
    return;
  }
  const o = zones[flows.o[a.i]];
  const d = zones[flows.d[a.i]];
  // 内訳: 目的を選んでいなければ目的別、選んでいれば手段別
  const parts: string[] = [];
  const save = [purpose, mode];
  if (purpose === "all") {
    for (const p of P.slice(0, 5)) {
      purpose = p;
      parts.push(`${p} ${fmt(value(a.i))}`);
    }
  } else {
    for (const m of M.slice(0, 5)) {
      mode = m;
      parts.push(`${m} ${fmt(value(a.i))}`);
    }
  }
  [purpose, mode] = save;
  tip.innerHTML =
    `<b>${o.n}</b> → <b>${d.n}</b><br>` +
    `<span class="big">${fmt(a.v)}</span><span class="small"> トリップ/日（${label()}）</span><br>` +
    `<span class="small">${parts.join(" ／ ")}</span>`;
  tip.style.display = "block";
  const x = Math.min(info.x + 14, window.innerWidth - tip.offsetWidth - 8);
  tip.style.left = `${x}px`;
  tip.style.top = `${Math.max(8, info.y - tip.offsetHeight - 10)}px`;
}

// 引いて見るときは線を細くする（ズーム10で1倍）
const widthScale = () => Math.min(1.2, Math.max(0.3, 2 ** ((map.getZoom() - 10) * 0.5)));
let current: Arc[] = [];

function draw() {
  const k = widthScale();
  document.querySelectorAll<HTMLElement>(".legend i[data-v]").forEach((el) => {
    el.style.height = `${Math.max(0.5, widthOf(Number(el.dataset.v)) * k)}px`;
  });
  overlay.setProps({
    layers: [
      new ArcLayer<Arc>({
        id: "arcs",
        data: current,
        getSourcePosition: (a) => [zones[flows.o[a.i]].x, zones[flows.o[a.i]].y],
        getTargetPosition: (a) => [zones[flows.d[a.i]].x, zones[flows.d[a.i]].y],
        getSourceColor: (a) => [...FROM, alphaOf(a.v)],
        getTargetColor: (a) => [...TO, alphaOf(a.v)],
        getWidth: (a) => widthOf(a.v),
        widthUnits: "pixels",
        widthScale: k,
        widthMinPixels: 0.5,
        getHeight: 0.5,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 230],
        onHover,
        updateTriggers: { getSourceColor: [purpose, mode], getTargetColor: [purpose, mode], getWidth: [purpose, mode] },
      }),
    ],
  });
}
map.on("zoom", draw);

function render() {
  const data = arcs();
  current = data;
  draw();
  if (map.getLayer("sel")) map.setFilter("sel", ["==", ["get", "i"], sel]);
  card(data);
  const u = new URL(location.href);
  const setp = (k: string, v: string | null) => (v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
  setp("z", sel >= 0 ? zones[sel].c : null);
  setp("p", purpose !== "all" ? purpose : null);
  setp("m", mode !== "all" ? mode : null);
  setp("dir", dir !== "both" ? dir : null);
  if (!SHOT) history.replaceState(null, "", u);
}

function topList(ids: number[], side: "o" | "d", n: number) {
  return ids
    .map((i) => ({ i, v: value(i) }))
    .filter((a) => a.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, n)
    .map((a) => {
      const z = flows[side][a.i];
      return `<li><a href="#" data-i="${z}">${zones[z].n}</a><span class="v">${fmt(a.v)}</span></li>`;
    })
    .join("");
}

function card(data: Arc[]) {
  const el = $("#card");
  if (sel < 0) {
    const shown = data.reduce((s, a) => s + a.v, 0);
    el.innerHTML =
      `<div class="head">多い流れ ${fmt(data.length)}本（${label()}）</div>` +
      `<div class="small">平日1日のトリップ ${fmt(stats.trips_total)} のうち、ゾーンをまたぐものは ${fmt(stats.trips_inter)}（${pct(stats.trips_inter, stats.trips_total)}）。` +
      `いまの条件で多い順に ${fmt(data.length)}本（${fmt(shown)}トリップ）を描いている。</div>`;
    return;
  }
  const z = zones[sel];
  const gen = pick(z.g);
  const self = pick(z.s);
  const att = pick(z.a);
  el.innerHTML =
    `<div class="head"><b>${z.n}</b><span class="pref">ゾーン ${z.c}</span><button type="button" id="reset">全体に戻る</button></div>` +
    `<div class="nums">` +
    `<div><span class="k">ここを出発するトリップ（${label()}）</span><span class="v">${fmt(gen + self)}</span></div>` +
    `<div><span class="k">　うち同じゾーンの中</span><span class="v">${fmt(self)}（${pct(self, gen + self)}）</span></div>` +
    `<div><span class="k home">　うちほかのゾーンへ</span><span class="v">${fmt(gen)}（${pct(gen, gen + self)}）</span></div>` +
    `<div><span class="k work">ほかのゾーンから来るトリップ</span><span class="v">${fmt(att)}</span></div>` +
    `</div>` +
    (dir !== "in" ? `<div class="lists"><div class="lt home">行き先</div><ol>${topList(byOrigin[sel], "d", 5)}</ol></div>` : "") +
    (dir !== "out" ? `<div class="lists"><div class="lt work">来る元</div><ol>${topList(byDest[sel], "o", 5)}</ol></div>` : "") +
    `<div class="small">単位はトリップ/日。線は全目的・全手段で${fmt(stats.min_flow)}トリップ以上の組だけ（いま${fmt(data.length)}本）。上の数は全件から数えた。</div>`;
  $("#reset").addEventListener("click", () => select(-1));
  el.querySelectorAll<HTMLAnchorElement>("a[data-i]").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      select(Number(a.dataset.i));
    }),
  );
}

function fitTo(i: number) {
  if (i < 0) {
    map.fitBounds(REGION, { padding: pad(), duration: SHOT ? 0 : 900 });
    return;
  }
  const ids = [...byOrigin[i], ...byDest[i]];
  const b = new maplibregl.LngLatBounds([zones[i].x, zones[i].y], [zones[i].x, zones[i].y]);
  // 多い順に、流れの95%が入る範囲まで広げる
  const sorted = ids.map((f) => ({ f, v: value(f) })).sort((a, z) => z.v - a.v);
  const total = sorted.reduce((s, a) => s + a.v, 0);
  let acc = 0;
  for (const a of sorted) {
    const o = zones[flows.o[a.f]];
    const d = zones[flows.d[a.f]];
    b.extend([o.x, o.y]);
    b.extend([d.x, d.y]);
    acc += a.v;
    if (acc >= total * 0.95) break;
  }
  map.fitBounds(b, { padding: pad(), maxZoom: 11, duration: SHOT ? 0 : 900 });
}

function pad() {
  const wide = window.innerWidth >= 700;
  const p = $("#title").getBoundingClientRect();
  return wide
    ? { left: p.right + 30, right: 50, top: 50, bottom: 50 }
    : { left: 20, right: 20, top: 30, bottom: window.innerHeight - p.top + 20 };
}

function select(i: number) {
  sel = i;
  render();
  fitTo(i);
  ($("#search") as HTMLInputElement).value = i >= 0 ? zones[i].n : "";
}

function bindSeg(id: string, cur: string, set: (v: string) => void) {
  const root = $(id);
  root.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
    b.classList.toggle("on", b.dataset.v === cur);
    b.addEventListener("click", () => {
      root.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
      set(b.dataset.v!);
      render();
    });
  });
}
bindSeg("#purpose", purpose, (v) => (purpose = v));
bindSeg("#mode", mode, (v) => (mode = v));
bindSeg("#dir", dir, (v) => (dir = v as Dir));

$("#names").innerHTML = zones.map((z) => `<option value="${z.n}"></option>`).join("");
const search = $("#search") as HTMLInputElement;
search.addEventListener("change", () => {
  const i = byName.get(search.value.trim());
  if (i !== undefined) select(i);
});

$("#note").innerHTML =
  `トリップ = ある目的で、ある地点から別の地点へ移動する1回の動き（平日1日、拡大後の値）。代表交通手段は、1つのトリップで使った手段のうち主なもの（鉄道＞バス＞自動車＞二輪車＞自転車＞徒歩の順）。` +
  `私事は買い物・食事・通院・娯楽など、業務は仕事での移動。二輪車・その他・不明は「全手段」にだけ入る。` +
  `ゾーンは計画基本ゾーン（${fmt(stats.n_zones)}）。名前は市区町村と、ゾーン内で乗降客数が最も多い駅（目安）。線の端はゾーンのおおよその中心。` +
  `抽出調査なので、小さい組ほど誤差が大きい。`;

// データを待つあいだに地図の読み込みが終わっていることがあるので、終わっていればすぐ始める
if (map.loaded()) void setup();
else map.once("load", () => void setup());

async function setup() {
  const areas = await fetch(DATA + "areas.geojson").then((r) => r.json());
  map.addSource("areas", {
    type: "geojson",
    data: areas,
    attribution:
      '出典：<a href="https://www.tokyo-pt.jp/data/01_02" target="_blank" rel="noopener">東京都市圏交通計画協議会ホームページ</a>' +
      "（第6回東京都市圏パーソントリップ調査 基礎集計 表d-1、計画基本ゾーン）を加工して作成／" +
      "国土数値情報（駅別乗降客数）（国土交通省）を加工して作成",
  });
  map.addLayer({ id: "fill", type: "fill", source: "areas", paint: { "fill-color": "#151a24" } });
  map.addLayer({
    id: "sel", type: "fill", source: "areas", filter: ["==", ["get", "i"], sel],
    paint: { "fill-color": "#3a4458" },
  });
  map.addLayer({
    id: "line", type: "line", source: "areas",
    paint: { "line-color": "#2c3444", "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.2, 11, 0.8] },
  });
  map.on("click", "fill", (e) => {
    const f = e.features?.[0];
    if (!f) return;
    const i = Number(f.properties.i);
    select(i === sel ? -1 : i);
  });
  map.on("mouseenter", "fill", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "fill", () => (map.getCanvas().style.cursor = ""));
  render();
  if (sel >= 0) {
    search.value = zones[sel].n;
    fitTo(sel);
  } else fitTo(-1);
  map.once("idle", () => setTimeout(() => document.body.classList.add("ready"), 600));
}
