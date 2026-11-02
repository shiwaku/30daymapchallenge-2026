import * as maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "./style.css";

maplibregl.setWorkerUrl(workerUrl);

// CS立体図の XYZ タイル（G空間情報センターで県が公開。どれも配信元から直接読む）。出典は README
type CsSource = { tiles: string; scheme: "xyz" | "tms"; credit: string; link: string; bounds: [number, number, number, number] };
const CS: Record<string, CsSource> = {
  tochigi: {
    tiles: "https://rinya-tochigi.geospatial.jp/2023/rinya/tile/csmap/{z}/{x}/{y}.png",
    scheme: "xyz",
    credit: "栃木県森林資源データ（2021〜2022年度計測）微地形図（CS立体図）",
    bounds: [139.3, 36.18, 140.3, 37.16], // 県の範囲（おおよそ）。範囲外のタイルを取りに行かない
    link: "https://www.geospatial.jp/ckan/dataset/csmap_tochigi",
  },
  hyogo: {
    tiles: "https://rinya-hyogo.geospatial.jp/2023/rinya/tile/csmap/{z}/{x}/{y}.png",
    scheme: "xyz",
    credit: "兵庫県50㎝メッシュCS立体図（xyzタイル）、兵庫県",
    bounds: [134.25, 34.15, 135.47, 35.68],
    link: "https://www.geospatial.jp/ckan/dataset/csmap_hyogo",
  },
  ehime: {
    // 愛媛県は TMS（y が南から数える）で配信されている
    tiles: "https://rinya-ehime.geospatial.jp/tile/rinya/2024/csmap_Ehime/{z}/{x}/{y}.png",
    scheme: "tms",
    credit: "愛媛県森林資源データ（2018年計測）微地形図（CS立体図）",
    bounds: [132.0, 32.88, 133.7, 34.3],
    link: "https://www.geospatial.jp/ckan/dataset/csmap_ehime",
  },
};

// 城の解説は文化遺産オンライン（文化庁）の史跡の解説から。
// 名前は山頂に置く（解説に「山頂を主郭」などとある）。山頂は地理院の標高タイル（DEM5A）で、
// 地理院地図の注記の点のまわりのいちばん高い点を scripts/find_summit.py で探したもの
type Castle = {
  id: string;
  name: string;
  kana: string;
  place: string;
  site: string;
  text: string;
  cs: keyof typeof CS;
  at: [number, number];
  center: [number, number];
  zoom: number;
  bunka: string;
};
const CASTLES: Castle[] = [
  {
    id: "karasawayama",
    name: "唐沢山城",
    kana: "からさわやまじょう",
    place: "栃木県佐野市",
    site: "国史跡「唐沢山城跡」（2014年指定）",
    text: "唐沢山の山頂を主郭として、一帯に曲輪を配する山城。山腹には、中世の山城だった頃の曲輪や堀切が残る。",
    cs: "tochigi",
    at: [139.600976, 36.353862], // 標高 244.8m
    center: [139.5985, 36.3535],
    zoom: 16.0,
    bunka: "https://online.bunka.go.jp/heritages/detail/232631",
  },
  {
    id: "konosumiyama",
    name: "此隅山城",
    kana: "このすみやまじょう",
    place: "兵庫県豊岡市",
    site: "国史跡「山名氏城跡」（1996年指定）",
    text: "但馬の守護・山名氏の本城。標高140mの山頂を中心に、四方にのびる尾根を削って平らにした曲輪を多数設ける。",
    cs: "hyogo",
    at: [134.872477, 35.487144], // 138.1m
    center: [134.8722, 35.4868],
    zoom: 16.1,
    bunka: "https://online.bunka.go.jp/heritages/detail/210750",
  },
  {
    id: "arikoyama",
    name: "有子山城",
    kana: "ありこやまじょう",
    place: "兵庫県豊岡市",
    site: "国史跡「山名氏城跡」（1996年指定）",
    text: "天正2年（1574）頃に山名祐豊が築いた城。標高321mの山頂に主郭、その西に6段の曲輪が階段状に続き、山腹には竪堀も残る。",
    cs: "hyogo",
    at: [134.878314, 35.455374], // 321.7m
    center: [134.8778, 35.4553],
    zoom: 16.2,
    bunka: "https://online.bunka.go.jp/heritages/detail/210750",
  },
  {
    id: "kagomori",
    name: "河後森城",
    kana: "かごもりじょう",
    place: "愛媛県松野町",
    site: "国史跡「河後森城跡」（1997年指定）",
    text: "南に開く馬蹄形の尾根に、東から古城・本城・新城の郭群が並ぶ。古城と本城の間を大堀切で断ち切っている。",
    cs: "ehime",
    at: [132.708471, 33.225172], // 172.2m
    center: [132.7090, 33.2240],
    zoom: 16.0,
    bunka: "https://online.bunka.go.jp/heritages/detail/139647",
  },
];

const PHOTO_CREDIT = "航空写真: 地理院タイル（全国最新写真（シームレス）。GRUS画像を含む場合 © Axelspace）";
const BUNKA_CREDIT = "城の解説: 文化遺産オンライン（文化庁）";

const params = new URLSearchParams(location.search);
const RECORD = params.has("record");
if (RECORD) document.body.classList.add("record");
// ?bare: パネルや出典を消して地図だけにする（ポスター画像を組むとき用。組んだ画像には出典を入れる）
if (params.has("bare")) document.body.classList.add("bare");

// CS立体図の地図は背景を塗らない（乗算で重ねるときに下の写真を透かすため。左右で比べるときは CSS で背景を塗る）
function style(sources: StyleSpecification["sources"], layers: StyleSpecification["layers"], bg = true): StyleSpecification {
  const base: StyleSpecification["layers"] = bg ? [{ id: "bg", type: "background", paint: { "background-color": "#0b0d12" } }] : [];
  return { version: 8, sources, layers: [...base, ...layers] };
}

const first = CASTLES.find((c) => c.id === params.get("castle")) ?? CASTLES[0];
const common = { center: first.center, zoom: first.zoom, minZoom: 12, maxZoom: 18.6, attributionControl: false as const, dragRotate: false, pitchWithRotate: false };

const photo = new maplibregl.Map({
  ...common,
  container: "photo",
  style: style(
    {
      photo: {
        type: "raster",
        tiles: ["https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg"],
        tileSize: 256,
        minzoom: 2,
        maxzoom: 18,
      },
    },
    [{ id: "photo", type: "raster", source: "photo" }],
  ),
});

const csSources: StyleSpecification["sources"] = {};
const csLayers: StyleSpecification["layers"] = [];
for (const [key, s] of Object.entries(CS)) {
  csSources[key] = { type: "raster", tiles: [s.tiles], scheme: s.scheme, bounds: s.bounds, tileSize: 256, minzoom: 8, maxzoom: 18 };
  csLayers.push({ id: key, type: "raster", source: key, paint: { "raster-fade-duration": 200 } });
}
const cs = new maplibregl.Map({ ...common, container: "cs", style: style(csSources, csLayers, false) });
// パネルの右側の見えている部分の中央に城が来るよう、地図に余白を付ける
function padding(): maplibregl.PaddingOptions {
  const w = window.innerWidth, h = window.innerHeight;
  return w > 640 ? { left: Math.min(392, w * 0.3), right: 0, top: 0, bottom: 0 } : { left: 0, right: 0, top: h * 0.42, bottom: 0 };
}
for (const m of [photo, cs]) m.setPadding(padding());

cs.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
cs.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");

// 2つの地図の位置をそろえる（動かしている方に、もう一方を合わせる）
let syncing = false;
function link(from: maplibregl.Map, to: maplibregl.Map) {
  from.on("move", () => {
    if (syncing) return;
    syncing = true;
    to.jumpTo({ center: from.getCenter(), zoom: from.getZoom(), bearing: from.getBearing(), pitch: from.getPitch() });
    syncing = false;
    placeLabels();
  });
}
link(photo, cs);
link(cs, photo);

// 仕切り。x は画面幅に対する割合（0〜1）
const csEl = document.getElementById("cs")!;
const divider = document.getElementById("divider")!;
let split = 0.5;
let mode: "swipe" | "blend" = "swipe";
function setSplit(v: number) {
  split = Math.min(1, Math.max(0, v));
  const px = split * window.innerWidth;
  divider.style.left = `${px}px`;
  csEl.style.clipPath = mode === "swipe" ? `inset(0 0 0 ${px}px)` : "none";
}
function onDrag(e: PointerEvent) {
  setSplit(e.clientX / window.innerWidth);
}
divider.addEventListener("pointerdown", (e) => {
  stopSweep();
  divider.setPointerCapture(e.pointerId);
  divider.addEventListener("pointermove", onDrag);
});
divider.addEventListener("pointerup", (e) => {
  divider.releasePointerCapture(e.pointerId);
  divider.removeEventListener("pointermove", onDrag);
});
divider.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") setSplit(split - 0.05);
  if (e.key === "ArrowRight") setSplit(split + 0.05);
});
window.addEventListener("resize", () => {
  setSplit(split);
  for (const m of [photo, cs]) m.setPadding(padding());
});

// 読み込み後に仕切りを右から左へ動かし、森の下の地形を見せる
let sweepId = 0;
function stopSweep() {
  sweepId++;
}
function sweep(from: number, to: number, ms: number): Promise<void> {
  const id = ++sweepId;
  const t0 = performance.now();
  return new Promise((resolve) => {
    const step = (t: number) => {
      if (id !== sweepId) return resolve();
      const k = Math.min(1, (t - t0) / ms);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      setSplit(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

// 城の名前（2つの地図の上に HTML で置く）
const labelsEl = document.getElementById("labels")!;
const labelEls = CASTLES.map((c) => {
  const el = document.createElement("div");
  el.className = "castle-label";
  el.innerHTML = `<div class="pin"></div><div class="name">${c.name}<small>${c.kana}</small></div>`;
  labelsEl.appendChild(el);
  return el;
});
function placeLabels() {
  CASTLES.forEach((c, i) => {
    const p = cs.project(c.at);
    labelEls[i].style.transform = `translate(${p.x}px, ${p.y}px)`;
  });
}
cs.on("load", placeLabels);
window.addEventListener("resize", placeLabels);

// 城の切り替え
const list = document.getElementById("castles")!;
const card = document.getElementById("card")!;
const credit = document.getElementById("credit")!;
let current = first;
function renderCard(c: Castle) {
  card.innerHTML = `
    <div class="place">${c.place}　${c.site}</div>
    <p>${c.text}</p>
    <a href="${c.bunka}" target="_blank" rel="noopener">文化遺産オンライン（文化庁）の解説</a>`;
  const s = CS[c.cs];
  credit.innerHTML = `出典: CS立体図 <a href="${s.link}" target="_blank" rel="noopener">${s.credit}</a>（G空間情報センター）／ ${PHOTO_CREDIT.replace("地理院タイル", '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>')}／ ${BUNKA_CREDIT}`;
  list.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.id === c.id));
}
for (const c of CASTLES) {
  const li = document.createElement("li");
  li.innerHTML = `<button type="button" data-id="${c.id}">${c.name}<span>${c.place}</span></button>`;
  li.querySelector("button")!.addEventListener("click", () => go(c));
  list.appendChild(li);
}
async function go(c: Castle) {
  current = c;
  renderCard(c);
  const params = new URLSearchParams(location.search);
  params.set("castle", c.id);
  history.replaceState(null, "", `?${params}`);
  // 遠い城へは一度引いてから寄る
  photo.flyTo({ center: c.center, zoom: c.zoom, duration: 2200, essential: true });
  await new Promise((r) => photo.once("moveend", r));
  if (current !== c) return;
  setSplit(0.92);
  await sweep(0.92, end(), 2600);
}
renderCard(first);

// モード: 左右で比べる / 写真に CS立体図を乗算で重ねる
document.querySelectorAll<HTMLButtonElement>(".mode button").forEach((b) =>
  b.addEventListener("click", () => {
    mode = b.dataset.mode as typeof mode;
    document.querySelectorAll(".mode button").forEach((x) => x.classList.toggle("on", x === b));
    document.body.classList.toggle("blend", mode === "blend");
    stopSweep();
    setSplit(split);
  }),
);

// ?split=0.3 のように渡すと、仕切りを動かさずその位置で止める（確認・スクリーンショット用）
const FIXED = params.has("split") ? Number(params.get("split")) : null;
// 仕切りは城の山頂の少し左で止める（城は CS立体図で、左に同じ山の森の写真が残る）
const end = () => Math.min(0.85, Math.max(0.3, (cs.project(current.at).x - Math.min(260, window.innerWidth * 0.18)) / window.innerWidth));
setSplit(FIXED ?? 0.92);
let loaded = 0;
const ready = () => {
  if (++loaded < 2) return;
  placeLabels();
  // タイルを読んでから仕切りを動かす
  if (FIXED !== null) return document.body.classList.add("ready");
  setTimeout(() => sweep(0.92, end(), 2600).then(() => document.body.classList.add("ready")), RECORD ? 1500 : 600);
};
photo.once("idle", ready);
cs.once("idle", ready);

// 確認用（スクリーンショットのスクリプトから使う）
Object.assign(window, { __day05: { setSplit, go: (id: string) => go(CASTLES.find((c) => c.id === id)!), photo, cs } });
