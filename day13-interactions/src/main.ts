import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ArcLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import "./style.css";

// 開発時は day13-interactions/web、公開時（day13-interactions/site/）は ../web を読む
const DATA = import.meta.env.DEV ? "./web/" : "../web/";
const JAPAN: [[number, number], [number, number]] = [[128.6, 30.9], [146.0, 45.6]];
const BG = "#0b0d12";
const HOME: [number, number, number] = [86, 196, 255]; // 住んでいる所
const WORK: [number, number, number] = [255, 150, 60]; // 通う先
const OVERVIEW_N = 2500; // 全国表示で描く本数（多い順）

type Muni = {
  c: string; p: string; n: string; x: number; y: number;
  t: number; s: number; h: number; o: number; ou: number; u: number;
  oa: number; ia: number; iw: number; is: number;
};
type Flows = { o: number[]; d: number[]; w: number[]; s: number[] };
type Stats = {
  n_munis: number; n_od_pairs: number; od_total: number; n_flows_web: number; flows_web_total: number;
  min_flow: number; residents_total: number; self_total: number; other_total: number;
  other_unknown_total: number; unknown_total: number;
};
type Mode = "all" | "work" | "school";
type Dir = "both" | "out" | "in";
type Arc = { i: number; v: number };

maplibregl.setWorkerUrl(workerUrl);

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const fmt = (v: number) => Math.round(v).toLocaleString("ja-JP");
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—");
const alphaOf = (v: number) => Math.min(235, 60 + 45 * Math.log10(Math.max(1, v)));
const widthOf = (v: number) => Math.min(18, Math.max(0.6, Math.sqrt(v) / 12));

const params = new URLSearchParams(location.search);
const SHOT = params.has("shot"); // スクリーンショット用（地図の位置を URL に書かない）

const map = new maplibregl.Map({
  container: "map",
  bounds: JAPAN,
  minZoom: 3.5,
  maxZoom: 13,
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

const [munis, flows, stats] = await Promise.all([
  fetch(DATA + "munis.json").then((r) => r.json() as Promise<Muni[]>),
  fetch(DATA + "flows.json").then((r) => r.json() as Promise<Flows>),
  fetch(DATA + "stats.json").then((r) => r.json() as Promise<Stats>),
]);
const N = flows.o.length;
const byOrigin: number[][] = munis.map(() => []);
const byDest: number[][] = munis.map(() => []);
for (let i = 0; i < N; i++) {
  byOrigin[flows.o[i]].push(i);
  byDest[flows.d[i]].push(i);
}
const label = (m: Muni) => `${m.p} ${m.n}`;
const byName = new Map<string, number>();
munis.forEach((m, i) => {
  byName.set(label(m), i);
  if (!byName.has(m.n)) byName.set(m.n, i);
});

let mode: Mode = "all";
let dir: Dir = "both";
let sel = -1;
{
  const q = params.get("m");
  const i = munis.findIndex((m) => m.c === q);
  if (i >= 0) sel = i;
  const md = params.get("mode");
  if (md === "work" || md === "school") mode = md;
  const dr = params.get("dir");
  if (dr === "out" || dr === "in") dir = dr;
}

const value = (i: number) => (mode === "all" ? flows.w[i] + flows.s[i] : mode === "work" ? flows.w[i] : flows.s[i]);

function arcs(): Arc[] {
  let ids: number[];
  if (sel < 0) {
    ids = [];
    for (let i = 0; i < N; i++) ids.push(i);
  } else {
    ids = [];
    if (dir !== "in") ids.push(...byOrigin[sel]);
    if (dir !== "out") ids.push(...byDest[sel]);
  }
  let list = ids.map((i) => ({ i, v: value(i) })).filter((a) => a.v > 0);
  list.sort((a, b) => b.v - a.v);
  if (sel < 0) list = list.slice(0, OVERVIEW_N);
  // 細い線を先に、太い線を後に描く
  return list.reverse();
}

const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
map.addControl(overlay as unknown as maplibregl.IControl);

const tip = $("#tip");
function onHover(info: PickingInfo<Arc>) {
  const a = info.object;
  if (!a) {
    tip.style.display = "none";
    return;
  }
  const o = munis[flows.o[a.i]];
  const d = munis[flows.d[a.i]];
  tip.innerHTML =
    `<b>${o.n}</b><span class="small">（${o.p}）</span> → <b>${d.n}</b><span class="small">（${d.p}）</span><br>` +
    `<span class="big">${fmt(flows.w[a.i] + flows.s[a.i])}人</span>` +
    `<span class="small">　通勤 ${fmt(flows.w[a.i])} ／ 通学 ${fmt(flows.s[a.i])}</span>`;
  tip.style.display = "block";
  const x = Math.min(info.x + 14, window.innerWidth - tip.offsetWidth - 8);
  tip.style.left = `${x}px`;
  tip.style.top = `${Math.max(8, info.y - tip.offsetHeight - 10)}px`;
}

// 引いて見るときは線を細くする（ズーム9で1倍）
const widthScale = () => Math.min(1.2, Math.max(0.3, 2 ** ((map.getZoom() - 9) * 0.5)));
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
        getSourcePosition: (a) => [munis[flows.o[a.i]].x, munis[flows.o[a.i]].y],
        getTargetPosition: (a) => [munis[flows.d[a.i]].x, munis[flows.d[a.i]].y],
        // 人数の少ない細い線は薄くする
        getSourceColor: (a) => [...HOME, alphaOf(a.v)],
        getTargetColor: (a) => [...WORK, alphaOf(a.v)],
        getWidth: (a) => widthOf(a.v),
        widthUnits: "pixels",
        widthScale: k,
        widthMinPixels: 0.5,
        getHeight: 0.5,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 230],
        onHover,
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
  if (sel >= 0) u.searchParams.set("m", munis[sel].c);
  else u.searchParams.delete("m");
  if (mode !== "all") u.searchParams.set("mode", mode);
  else u.searchParams.delete("mode");
  if (dir !== "both") u.searchParams.set("dir", dir);
  else u.searchParams.delete("dir");
  if (!SHOT) history.replaceState(null, "", u);
}

const MODE_LABEL: Record<Mode, string> = { all: "通勤・通学", work: "通勤", school: "通学" };

function topList(ids: number[], side: "o" | "d", n: number) {
  return ids
    .map((i) => ({ i, v: value(i) }))
    .filter((a) => a.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, n)
    .map((a) => {
      const m = flows[side][a.i];
      return `<li><a href="#" data-i="${m}">${munis[m].n}</a><span class="pref">${munis[m].p}</span><span class="v">${fmt(a.v)}人</span></li>`;
    })
    .join("");
}

function card(data: Arc[]) {
  const el = $("#card");
  if (sel < 0) {
    const shown = data.reduce((s, a) => s + a.v, 0);
    el.innerHTML =
      `<div class="head">全国で多い流れ ${fmt(data.length)}本（${MODE_LABEL[mode]}）</div>` +
      `<div class="small">市区町村をまたいで通う15歳以上の人は、全国で ${fmt(stats.od_total)}人（通う先が分かる人）。` +
      `そのうち多い順に ${fmt(data.length)}本の流れ（${fmt(shown)}人）を描いている。</div>`;
    return;
  }
  const m = munis[sel];
  const outIds = byOrigin[sel];
  const inIds = byDest[sel];
  const inn = mode === "all" ? m.ia : mode === "work" ? m.iw : m.is;
  el.innerHTML =
    `<div class="head"><b>${m.n}</b><span class="pref">${m.p}</span><button type="button" id="reset">全国に戻る</button></div>` +
    `<div class="nums">` +
    `<div><span class="k">ここに住んで通勤・通学する人</span><span class="v">${fmt(m.t)}人</span></div>` +
    `<div><span class="k">　うち同じ市区町村の中</span><span class="v">${fmt(m.s)}人（${pct(m.s, m.t)}）</span></div>` +
    `<div><span class="k home">　うちほかの市区町村へ</span><span class="v">${fmt(m.o - m.ou)}人（${pct(m.o - m.ou, m.t)}）</span></div>` +
    `<div><span class="k work">ほかの市区町村から${MODE_LABEL[mode]}で来る人</span><span class="v">${fmt(inn)}人</span></div>` +
    `</div>` +
    (dir !== "in" ? `<div class="lists"><div class="lt home">出て行く先（${MODE_LABEL[mode]}）</div><ol>${topList(outIds, "d", 5)}</ol></div>` : "") +
    (dir !== "out" ? `<div class="lists"><div class="lt work">来る元（${MODE_LABEL[mode]}）</div><ol>${topList(inIds, "o", 5)}</ol></div>` : "") +
    `<div class="small">線は${fmt(stats.min_flow)}人以上の流れだけ（${fmt(data.length)}本）。上の人数は全件から数えた。</div>`;
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
    fitJapan();
    return;
  }
  const ids = [...byOrigin[i], ...byDest[i]].filter((f) => value(f) >= 50);
  const b = new maplibregl.LngLatBounds([munis[i].x, munis[i].y], [munis[i].x, munis[i].y]);
  // 多い順に、流れの97%が入る範囲まで広げる
  const sorted = ids.map((f) => ({ f, v: value(f) })).sort((a, z) => z.v - a.v);
  const total = sorted.reduce((s, a) => s + a.v, 0);
  let acc = 0;
  for (const a of sorted) {
    const o = munis[flows.o[a.f]];
    const d = munis[flows.d[a.f]];
    b.extend([o.x, o.y]);
    b.extend([d.x, d.y]);
    acc += a.v;
    if (acc >= total * 0.97) break;
  }
  map.fitBounds(b, { padding: pad(), maxZoom: 10, duration: SHOT ? 0 : 900 });
}

function pad() {
  const wide = window.innerWidth >= 700;
  const p = $("#title").getBoundingClientRect();
  return wide
    ? { left: p.right + 30, right: 50, top: 50, bottom: 50 }
    : { left: 20, right: 20, top: 30, bottom: window.innerHeight - p.top + 20 };
}

function fitJapan() {
  map.fitBounds(JAPAN, { padding: pad(), duration: SHOT ? 0 : 900 });
}

function select(i: number) {
  sel = i;
  render();
  fitTo(i);
  ($("#search") as HTMLInputElement).value = i >= 0 ? label(munis[i]) : "";
}

function bindSeg(id: string, key: "mode" | "dir", cur: string, set: (v: string) => void) {
  const root = $(id);
  root.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
    b.classList.toggle("on", b.dataset[key] === cur);
    b.addEventListener("click", () => {
      root.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
      set(b.dataset[key]!);
      render();
    });
  });
}
bindSeg("#mode", "mode", mode, (v) => (mode = v as Mode));
bindSeg("#dir", "dir", dir, (v) => (dir = v as Dir));

const dl = $("#names");
dl.innerHTML = munis.map((m) => `<option value="${label(m)}"></option>`).join("");
const search = $("#search") as HTMLInputElement;
search.addEventListener("change", () => {
  const i = byName.get(search.value.trim());
  if (i !== undefined) select(i);
});

$("#note").innerHTML =
  `通勤・通学 = 15歳以上の就業者と通学者。住んでいる市区町村と、仕事・学校のある市区町村（政令指定都市は区、東京都は特別区ごと）の組で数えた2020年10月1日時点の人数。` +
  `線の端は市区町村のおおよその中心で、実際の家や職場の位置ではない。通う先が「不詳」「外国」の人は含めない。` +
  `全国表示は多い順に${fmt(OVERVIEW_N)}本、市区町村を選んだときは${fmt(stats.min_flow)}人以上の流れを描く。`;

// データを待つあいだに地図の読み込みが終わっていることがあるので、終わっていればすぐ始める
if (map.loaded()) void setup();
else map.once("load", () => void setup());

async function setup() {
  const areas = await fetch(DATA + "areas.geojson").then((r) => r.json());
  map.addSource("areas", {
    type: "geojson",
    data: areas,
    attribution:
      "出典：「令和2年国勢調査 従業地・通学地による人口・就業状態等集計」（総務省統計局）、" +
      "「国土数値情報（行政区域データ）」（国土交通省）を加工して作成",
  });
  map.addLayer({ id: "fill", type: "fill", source: "areas", paint: { "fill-color": "#151a24" } });
  map.addLayer({
    id: "sel", type: "fill", source: "areas", filter: ["==", ["get", "i"], sel],
    paint: { "fill-color": "#3a4458" },
  });
  map.addLayer({
    id: "line", type: "line", source: "areas",
    paint: { "line-color": "#2c3444", "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.2, 9, 0.8] },
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
    search.value = label(munis[sel]);
    fitTo(sel);
  } else fitJapan();
  map.once("idle", () => setTimeout(() => document.body.classList.add("ready"), 600));
}
