import * as maplibregl from "maplibre-gl";
import type { ExpressionSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { Protocol } from "pmtiles";
import "./style.css";

// 開発時は day04-clusters/data-web、公開時（day04-clusters/site/）は ../data-web を読む
const DATA = import.meta.env.DEV ? "./data-web/" : "../data-web/";
// 地名は国土地理院の最適化ベクトルタイルの注記（Anno）から出す
const GSI_PMTILES = "https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/optimal_bvmap-v1.pmtiles";
// 住所の検索は国土地理院の住所検索 API
const GSI_SEARCH = "https://msearch.gsi.go.jp/address-search/AddressSearch?q=";
// 沖縄の小さな地図の中心（沖縄本島）。縮尺と向きは本体の地図に合わせる
const OKINAWA: [number, number] = [127.85, 26.45];
// 最初の表示範囲（沖縄本島から北海道まで）。読み込み後に fitJapan で合わせ直す
const JAPAN: [[number, number], [number, number]] = [[127.6, 26.0], [145.9, 45.6]];
const BG = "#07080c";
const BEARING = -24;
// 同数のチェーンが並んだセル（c = -1）の色
const TIE = "#6b7080";
// A5 の解像度と、それを出すズームの範囲（scripts/prepare.py の RES と同じ）。
// full は「そのセルの店がこの数以上なら最も明るくする」数。セルの面積に合わせて変える
// 市（川越市・札幌市）にかかる約8km²のセル（r11f）は、ズーム FINE から約2km²のセル（r12、scripts/cities.py）に入れ替える
const FINE = 9.8;
const LEVELS = [
  { r: 9, src: "r9", min: 0, max: 7, full: 30 },
  { r: 10, src: "r10", min: 7, max: 8.6, full: 10 },
  { r: 11, src: "r11", min: 8.6, max: 23, full: 4 },
  { r: 11, src: "r11f", min: 8.6, max: FINE, full: 4 },
  { r: 12, src: "r12", min: FINE, max: 23, full: 2 },
];
// A5 の1セルの面積（km²）
const AREA: Record<number, number> = { 9: 129.7, 10: 32.4, 11: 8.1, 12: 2.0 };
const FADE = 0.3;
// 解像度の入れ替わりで2つのセルが重なるズーム（全国に共通のもの）。地方を出すときは、ここを避ける
const OVERLAP: [number, number][] = [7, 8.6].map((z) => [z - FADE, z + FADE]);

// 並びは scripts/prepare.py の CHAINS と同じ（番号で引く）
const COLORS = ["#ff4757", "#2ed47a", "#3d8bff", "#ffd23f", "#ff9f1c", "#c77dff", "#25e0e0", "#ff7ab8"];
const SHORT = ["セブン", "ファミマ", "ローソン", "ミニストップ", "セイコーマート", "デイリーヤマザキ", "NewDays", "ポプラ"];
const ALL = COLORS.map((_, i) => i);

type Chain = { id: string; name: string; count: number; sameNeighbor: number; expected: number };
type Res = { areaKm2: number; cells: number; top: number[]; ties: number; max: number };
type Stats = { run: string; total: number; unknownPref: number; chains: Chain[]; prefs: Record<string, number[]>; res: Record<string, Res> };
type Cells = GeoJSON.FeatureCollection<GeoJSON.Polygon, { i: string; k: number[]; n: number; c?: number; m?: number; s?: number }>;
// 市（scripts/cities.py）。k は市の境界の中にある店の数（チェーン別）
type Cities = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, { name: string; k: number[]; bbox: [number, number, number, number]; fine: string[] }>;
type Blocks = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, { name: string; prefs: string[]; bbox: [number, number, number, number] }>;

maplibregl.setWorkerUrl(workerUrl);
const protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

// 読み込んだ時点で URL に位置があれば、そこを出す（地図を作ると hash が書き込まれるので、先に取っておく）
const START_HASH = location.hash.length > 1;
const RECORD = new URLSearchParams(location.search).has("record");
const map = new maplibregl.Map({
  container: "map",
  hash: true,
  bounds: JAPAN,
  minZoom: 3,
  maxZoom: 11,
  attributionControl: false,
  // 発光の重ね描き（下の bloom）で、描いた直後の画面を読むため
  canvasContextAttributes: { preserveDrawingBuffer: true },
  style: {
    version: 8,
    glyphs: "https://gsi-cyberjapan.github.io/optimal_bvmap/glyphs/{fontstack}/{range}.pbf",
    sources: { gsi: { type: "vector", url: `pmtiles://${GSI_PMTILES}` } },
    layers: [{ id: "background", type: "background", paint: { "background-color": BG } }],
  },
});
map.addControl(
  new maplibregl.AttributionControl({
    compact: false,
    customAttribution:
      '店舗: <a href="https://alltheplaces.xyz/" target="_blank" rel="noopener">All the Places</a>（2026-10-24 実行分、CC0）を A5 のセルごとに集計 / 格子: <a href="https://a5geo.org/" target="_blank" rel="noopener">A5</a> / 地名・住所検索: <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a> / 地方の境: <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a> / 市の境: <a href="https://nlftp.mlit.go.jp/ksj/" target="_blank" rel="noopener">国土数値情報（行政区域）</a>を加工',
  }),
);
// 地図を回しているので、北の向きを出す
map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "bottom-right");
map.addControl(new maplibregl.GeolocateControl({ fitBoundsOptions: { maxZoom: 10 } }), "bottom-right");

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const num = (x: number) => x.toLocaleString("ja-JP");

const colorExpr: ExpressionSpecification = ["match", ["get", "c"], ...COLORS.flatMap((c, i) => [i, c]), TIE] as unknown as ExpressionSpecification;

// 選んだチェーンだけで数え直す。c = 選んだなかで店がいちばん多いチェーン（同数は -1）、m = 選んだチェーンの店の数、s = c の割合
function recount(fc: Cells, on: number[]): Cells {
  for (const f of fc.features) {
    const k = f.properties.k;
    let best = -1;
    let top = 0;
    let m = 0;
    for (const i of on) {
      m += k[i];
      if (k[i] > top) [best, top] = [i, k[i]];
      else if (k[i] === top && top > 0) best = -1;
    }
    Object.assign(f.properties, { c: best, m, s: m ? top / m : 0 });
  }
  return fc;
}

// セルのレイヤーを足す（本体の地図と沖縄の小さな地図で同じものを使う）
function addCells(m: maplibregl.Map, data: Cells[]) {
  LEVELS.forEach((lv, j) => {
    const src = lv.src;
    m.addSource(src, { type: "geojson", data: data[j], tolerance: 0 });
    // ズームの境目で、粗いセルと細かいセルを重ねて入れ替える
    const fade = (v: ExpressionSpecification | number): ExpressionSpecification =>
      ["interpolate", ["linear"], ["zoom"], lv.min - FADE, lv.min ? 0 : v, lv.min + FADE, v, lv.max - FADE, v, lv.max + FADE, lv.max < 23 ? 0 : v] as ExpressionSpecification;
    // 明るさは店の数（full で頭打ち）と、いちばん多いチェーンの割合
    const light: ExpressionSpecification = ["*", ["sqrt", ["min", 1, ["/", ["get", "m"], lv.full]]], ["+", 0.35, ["*", 0.65, ["get", "s"]]]];
    const range = { minzoom: Math.max(0, lv.min - FADE), maxzoom: lv.max + FADE };
    m.addLayer({
      id: `${src}-fill`,
      type: "fill",
      source: src,
      ...range,
      filter: [">", ["get", "m"], 0],
      paint: { "fill-color": colorExpr, "fill-opacity": fade(["+", 0.08, ["*", 0.5, light]]), "fill-antialias": false },
    });
    // 五角形の形が見えるように、セルの縁を背景の色で細く抜く
    m.addLayer({
      id: `${src}-edge`,
      type: "line",
      source: src,
      ...range,
      filter: [">", ["get", "m"], 0],
      paint: { "line-color": BG, "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.4, 10, 1.4], "line-opacity": fade(0.9) },
    });
    // ネオン管: セルの縁を、チェーンの色の明るい線で内側からなぞる（この線が下の bloom で光る）
    m.addLayer({
      id: `${src}-neon`,
      type: "line",
      source: src,
      ...range,
      filter: [">", ["get", "m"], 0],
      paint: {
        "line-color": colorExpr,
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 8, 1.4, 11, 2.4],
        "line-offset": ["interpolate", ["linear"], ["zoom"], 4, 0.4, 8, 1, 11, 1.8],
        "line-opacity": fade(["+", 0.25, ["*", 0.75, light]]),
      },
    });
  });
}

// 発光（ブルーム）。A5 は格子で描き方の機能はないので、描いた画面を縮めてぼかした写しを、明るさを足す合成（screen）で上に重ねる。
function addBloom(m: maplibregl.Map, holder: HTMLElement) {
  const glow = document.createElement("canvas");
  glow.className = "bloom";
  holder.append(glow);
  const ctx = glow.getContext("2d")!;
  const SCALE = 4;
  m.on("render", () => {
    const src = m.getCanvas();
    const w = Math.max(1, Math.round(src.width / SCALE));
    const h = Math.max(1, Math.round(src.height / SCALE));
    if (glow.width !== w || glow.height !== h) [glow.width, glow.height] = [w, h];
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, w, h);
    // 近いにじみと遠いにじみを足す
    ctx.filter = "blur(3px)";
    ctx.drawImage(src, 0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    ctx.filter = "blur(10px)";
    ctx.drawImage(src, 0, 0, w, h);
    // 写しに入った背景の色（2回足したぶん）を引いて、背景は光らせない
    ctx.filter = "none";
    ctx.globalCompositeOperation = "difference";
    ctx.fillStyle = "#0e1018";
    ctx.fillRect(0, 0, w, h);
  });
}

// 点が面の中にあるか（セルや地方の面を、住所の点で引く）
function inRing(p: [number, number], ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

async function main() {
  const [stats, blocks, prefAreas, cityAreas, r9, r10, r11, r12] = (await Promise.all(
    ["stats.json", "blocks.geojson", "prefs.geojson", "cities.geojson", "a5-r9.geojson", "a5-r10.geojson", "a5-r11.geojson", "a5-r12-cities.geojson"].map((f) =>
      fetch(DATA + f).then((r) => r.json()),
    ),
  )) as [Stats, Blocks, Blocks, Cities, Cells, Cells, Cells, Cells];
  // 約8km²のセルを、市にかかるもの（r11f）とそれ以外に分ける（並びは LEVELS と同じ）
  const fine = new Set(cityAreas.features.flatMap((f) => f.properties.fine));
  const split = (keep: boolean): Cells => ({ type: "FeatureCollection", features: r11.features.filter((f) => fine.has(f.properties.i) === keep) });
  const cells = [r9, r10, split(false), split(true), r12];
  const chains = stats.chains;
  cells.forEach((fc) => recount(fc, ALL));
  addCells(map, cells);
  addBloom(map, $("#map"));

  // 地名（都道府県・市区町村）。セルの上に、黒い縁取りの白い字で出す（地方を選んだときは、外側の地名も暗くなるよう暗がりの下に置く）
  map.addLayer({
    id: "place",
    type: "symbol",
    source: "gsi",
    "source-layer": "Anno",
    minzoom: 6,
    filter: ["all", ["==", ["geometry-type"], "Point"], ["in", ["get", "vt_code"], ["literal", [140, 1301, 1302, 1303, 1401, 1402, 1403]]]],
    layout: {
      "text-field": ["get", "vt_text"],
      "text-font": ["NotoSansJP-Regular"],
      // 140 = 都道府県名、1301〜1303 = 小さな縮尺での主な市、1401〜1403 = 市区町村名
      "text-size": ["match", ["get", "vt_code"], 140, 15, [1301, 1302, 1303], 13, 11],
      "text-max-width": 20,
      "text-padding": 6,
    },
    paint: { "text-color": "#f2f2f4", "text-halo-color": "rgba(0,0,0,0.9)", "text-halo-width": 1.8, "text-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0, 6.4, 0.9] },
  });

  // 地方を選んだときに、その外側を暗くする（世界を覆う面から、地方の面をくり抜く）
  map.addSource("mask", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({ id: "mask", type: "fill", source: "mask", paint: { "fill-color": BG, "fill-opacity": 0.82 } });
  map.addLayer({ id: "mask-line", type: "line", source: "mask", paint: { "line-color": "#e8e8ea", "line-width": 1.2, "line-opacity": 0.7 } });

  // 沖縄は本州から離れているので、全国を見るときは左下に別の小さな地図で出す
  const inset = new maplibregl.Map({
    container: "inset",
    center: OKINAWA,
    zoom: 5,
    interactive: false,
    attributionControl: false,
    canvasContextAttributes: { preserveDrawingBuffer: true },
    style: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": BG } }] },
  });
  inset.on("load", () => {
    addCells(inset, cells);
    addBloom(inset, $("#inset"));
  });
  let block = "";
  // 小さな地図は、全国か九州・沖縄を見ているときだけ出す
  const updateInset = () => {
    const on = (map.getZoom() < 6.5 && block === "") || block === "九州・沖縄";
    $("#inset-box").classList.toggle("on", on);
    if (on) inset.jumpTo({ center: OKINAWA, zoom: map.getZoom(), bearing: map.getBearing() });
  };
  map.on("zoom", updateInset);

  // 地方ごとの店の割合（都道府県ごとの店舗数を足す。住所の都道府県で集計）
  const shares = (prefs: string[]) => sharesOf(ALL.map((i) => prefs.reduce((a, p) => a + (stats.prefs[p]?.[i] ?? 0), 0)));
  const sharesOf = (v: number[]) => {
    const t = v.reduce((a, b) => a + b, 0);
    return [...ALL].sort((a, b) => v[b] - v[a])
      .slice(0, 3)
      .map((i) => `<span class="c" style="--c:${COLORS[i]}">${SHORT[i]}</span> ${((100 * v[i]) / t).toFixed(1)}%`)
      .join("・");
  };
  const allPrefs = Object.keys(stats.prefs);
  const blockSub = (f: Blocks["features"][number]) => {
    const p = f.properties.prefs;
    if (f.properties.name === "中国・四国") return `中国　${shares(p.slice(0, 5))}<br>四国　${shares(p.slice(5))}`;
    if (f.properties.name === "九州・沖縄") return `九州　${shares(p.slice(0, 7))}<br>沖縄（左下）　${shares(["沖縄県"])}`;
    return shares(p);
  };

  // 地方のボタンと都道府県の選択。選ぶとその範囲に合わせて出し、外側を暗くする
  $("#blocks").innerHTML = ["全国", ...blocks.features.map((f) => f.properties.name)].map((n) => `<button type="button" data-b="${n}">${n}</button>`).join("");
  const prefSel = $("#prefsel") as HTMLSelectElement;
  prefSel.innerHTML =
    `<option value="">都道府県・市を選ぶ</option>` +
    `<optgroup label="都道府県">${prefAreas.features.map((f) => `<option>${f.properties.name}</option>`).join("")}</optgroup>` +
    `<optgroup label="市">${cityAreas.features.map((f) => `<option>${f.properties.name}</option>`).join("")}</optgroup>`;
  const storeCount = (prefs: string[]) => prefs.reduce((a, p) => a + (stats.prefs[p] ?? []).reduce((x, y) => x + y, 0), 0);
  function showBlock(name: string) {
    block = name === "全国" ? "" : name;
    document.querySelectorAll<HTMLButtonElement>("#blocks button").forEach((b) => b.classList.toggle("on", b.dataset.b === name));
    const city = cityAreas.features.find((x) => x.properties.name === block);
    const isPref = prefAreas.features.some((x) => x.properties.name === block);
    prefSel.value = isPref || city ? block : "";
    const f = blocks.features.find((x) => x.properties.name === block) ?? prefAreas.features.find((x) => x.properties.name === block) ?? city;
    const sub = city
      ? `${num(city.properties.k.reduce((a, b) => a + b, 0))}店　${sharesOf(city.properties.k)}`
      : !f
        ? shares(allPrefs)
        : isPref
          ? `${num(storeCount((f as Blocks["features"][number]).properties.prefs))}店　${shares((f as Blocks["features"][number]).properties.prefs)}`
          : blockSub(f as Blocks["features"][number]);
    regionHtml = `<div class="t">${f ? f.properties.name : "全国"}</div><div class="s">${sub}</div>`;
    renderRegion();
    const mask = map.getSource("mask") as maplibregl.GeoJSONSource;
    if (!f) {
      mask.setData({ type: "FeatureCollection", features: [] });
      fitJapan(r9.features.map((x) => x.geometry.coordinates[0][0] as [number, number]).filter(([, y]) => y > 30.5));
      updateInset();
      return;
    }
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    const world = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
    mask.setData({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [world, ...polys.map((p) => p[0])] } });
    // 市は、店のあるセル（約8km²）の範囲に合わせる（約2km²のセルが見えるまで拡大すると、市全体は収まらないことがある）
    let [w, s, e, n] = f.properties.bbox;
    if (city) {
      const ids = new Set(city.properties.fine);
      const xy = r11.features.filter((x) => ids.has(x.properties.i)).flatMap((x) => x.geometry.coordinates[0]);
      [w, s, e, n] = [Math.max(w, Math.min(...xy.map((p) => p[0]))), Math.max(s, Math.min(...xy.map((p) => p[1]))), Math.min(e, Math.max(...xy.map((p) => p[0]))), Math.min(n, Math.max(...xy.map((p) => p[1])))];
    }
    const left = $("#title").getBoundingClientRect().right + 24;
    const padding = window.innerWidth >= 900 ? { left, right: 40, top: 90, bottom: 40 } : { left: 12, right: 12, top: $("#title").getBoundingClientRect().bottom + 12, bottom: 40 };
    const cam = map.cameraForBounds([[w, s], [e, n]], { padding, bearing: 0 })!;
    let z = cam.zoom!;
    // 解像度の入れ替わるズームは、近いほうの端に寄せる（細かいほうに寄せると少しはみ出すが、上下の余白に収まる）
    for (const [a, b] of OVERLAP) if (z > a && z < b) z = z - a < b - z ? a - 0.05 : b + 0.05;
    // 市は約2km²のセルで見せる（入れ替わりの重なりを越えるところまで寄せる）
    if (city) z = Math.min(11, Math.max(z, FINE + FADE + 0.05));
    map.jumpTo({ center: cam.center, zoom: z, bearing: 0, padding });
    updateInset();
    renderRegion();
  }
  // 右上に、地域の名前と割合と、いま出ているセルの大きさを出す
  let regionHtml = "";
  function cellSizeText() {
    const z = map.getZoom();
    const r = z < 7 ? 9 : z < 8.6 ? 10 : 11;
    const base = `A5 解像度 ${r}・1セル約${AREA[r]}km²`;
    if (z < FINE) return base;
    if (cityAreas.features.some((x) => x.properties.name === block)) return `A5 解像度 12・1セル約${AREA[12]}km²`;
    return `${base}（${cityAreas.features.map((x) => x.properties.name).join("・")}の中は 解像度 12・約${AREA[12]}km²）`;
  }
  function renderRegion() {
    $("#region").innerHTML = `${regionHtml}<div class="cs">${cellSizeText()}</div>`;
  }
  map.on("zoomend", renderRegion);
  document.querySelectorAll<HTMLButtonElement>("#blocks button").forEach((b) => b.addEventListener("click", () => showBlock(b.dataset.b!)));
  prefSel.addEventListener("change", () => showBlock(prefSel.value || "全国"));

  // セルを押すと、そのあたりの店の数を出す
  const popup = new maplibregl.Popup({ closeButton: true, maxWidth: "260px" });
  const cellHtml = (props: { k: number[] | string; n: number }, title: string) => {
    const k: number[] = typeof props.k === "string" ? JSON.parse(props.k) : props.k;
    const rows = [...ALL].filter((i) => k[i] > 0)
      .sort((a, b) => k[b] - k[a])
      .map((i) => `<div class="pr"><span class="c" style="--c:${COLORS[i]}">${SHORT[i]}</span><span>${k[i]}</span></div>`)
      .join("");
    return `<div class="pop"><div class="pt">${title}</div>${rows || "店なし"}<div class="pn">合計 ${props.n}店</div></div>`;
  };
  // いまのズームで出ているセルのうち、いちばん細かいもの（市の中は約2km²）
  map.on("click", (e) => {
    const z = map.getZoom();
    const layers = LEVELS.filter((lv) => z >= lv.min && z < lv.max).map((lv) => `${lv.src}-fill`);
    const hits = map.queryRenderedFeatures(e.point, { layers });
    const f = hits.find((h) => h.layer.id.startsWith("r12")) ?? hits[0];
    if (!f) return popup.remove();
    const r = Number(f.layer.id.slice(1, 3));
    popup.setLngLat(e.lngLat).setHTML(cellHtml(f.properties as { k: string; n: number }, `このあたり（A5 解像度 ${r}・約${AREA[r]}km²）`)).addTo(map);
  });
  for (const lv of LEVELS) {
    map.on("mouseenter", `${lv.src}-fill`, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", `${lv.src}-fill`, () => (map.getCanvas().style.cursor = ""));
  }

  // 住所で探す。いちばん細かいセル（約8km²）に寄せて、そのセルの店の数を出す
  const marker = new maplibregl.Marker({ color: "#ffffff", scale: 0.8 });
  $("#search").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const q = ($("#q") as HTMLInputElement).value.trim();
    if (!q) return;
    const msg = $("#search-msg");
    msg.textContent = "探しています…";
    try {
      const res = (await fetch(GSI_SEARCH + encodeURIComponent(q)).then((r) => r.json())) as { geometry: { coordinates: [number, number] }; properties: { title: string } }[];
      if (!res.length) {
        msg.textContent = "見つかりませんでした。市区町村名から番地まで入れてみてください";
        return;
      }
      const p = res[0].geometry.coordinates;
      msg.textContent = res[0].properties.title;
      block = "";
      (map.getSource("mask") as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features: [] });
      document.querySelectorAll<HTMLButtonElement>("#blocks button").forEach((b) => b.classList.remove("on"));
      prefSel.value = "";
      regionHtml = "";
      renderRegion();
      marker.setLngLat(p).addTo(map);
      map.flyTo({ center: p, zoom: 10, bearing: 0, padding: { left: 0, right: 0, top: 0, bottom: 0 } });
      // 市の中なら約2km²のセル、それ以外は約8km²のセル
      const c12 = r12.features.find((f) => inRing(p, f.geometry.coordinates[0]));
      const cell = c12 ?? r11.features.find((f) => inRing(p, f.geometry.coordinates[0]));
      const r = c12 ? 12 : 11;
      const title = `${res[0].properties.title} のまわり（A5 解像度 ${r}・約${AREA[r]}km²）`;
      popup.setLngLat(p).setHTML(cell ? cellHtml(cell.properties, title) : `<div class="pop"><div class="pt">${title}</div>このセルに店はありません</div>`).addTo(map);
    } catch {
      msg.textContent = "住所検索につながりませんでした";
    }
  });

  $("#caption").innerHTML = `8チェーン・<b>${num(stats.total)}</b>店。`;
  $("#legend").innerHTML = chains
    .map((c, i) => `<li><button type="button" data-c="${i}"><span class="sw" style="--c:${COLORS[i]}"></span>${c.name}<span class="n">${num(c.count)}</span></button></li>`)
    .join("");
  const km2 = (r: number) => Math.round(stats.res[r].areaKm2);
  $("#note").innerHTML =
    `All the Places（${stats.run.slice(0, 10)} 実行分）が各社のサイトから集めた店舗。各社の公式の店舗数ではない。ローソンはローソンストア100・ナチュラルローソンを含む。` +
    `五角形は A5（地球を面積の等しい五角形に分ける格子）のセルで、全国では約${km2(9)}km²、拡大すると約${km2(10)}km²・約${km2(11)}km²（${cityAreas.features.map((x) => x.properties.name).join("・")}の中はさらに約${AREA[12]}km²）。` +
    `色はセルのなかで店がいちばん多いチェーン（灰色は同数）、明るさは店の数とそのチェーンの割合。店の位置は出していない。地方の割合は住所の都道府県で集計。`;

  let solo = -1;
  function paint(on: number[]) {
    cells.forEach((fc, j) => {
      recount(fc, on);
      const src = LEVELS[j].src;
      (map.getSource(src) as maplibregl.GeoJSONSource).setData(fc);
      (inset.getSource(src) as maplibregl.GeoJSONSource | undefined)?.setData(fc);
    });
    document.querySelectorAll<HTMLButtonElement>("#legend button").forEach((b) => b.classList.toggle("off", !on.includes(Number(b.dataset.c))));
  }
  // 凡例を押すと、そのチェーンだけで数え直す。もう一度押すと戻る
  document.querySelectorAll<HTMLButtonElement>("#legend button").forEach((b) =>
    b.addEventListener("click", () => {
      const c = Number(b.dataset.c);
      solo = solo === c ? -1 : c;
      paint(solo < 0 ? ALL : [c]);
    }),
  );

  if (!START_HASH) showBlock("全国");
  updateInset();
  if (RECORD) document.body.classList.add("record");
  // 静止画を撮るスクリプト（scripts/capture-x.mjs）から地方を切り替える
  Object.assign(window as object, { __block: showBlock, __map: map, __ready: true });
}

// 日本は南西から北東へのびているので、横長の画面では地図を回して北東を右に向け、説明の右側に収める。
// 回したあとの点の広がりで拡大率を決める（狭い画面では回さず、説明の下に収める）
function fitJapan(points: [number, number][]) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const wide = W >= 900;
  const title = $("#title").getBoundingClientRect();
  const bearing = wide ? BEARING : 0;
  const box = wide
    ? { left: title.right + 16, right: W - 24, top: 24, bottom: H - 40 }
    : { left: 12, right: W - 12, top: title.bottom + 12, bottom: H - 40 };
  const r = (-bearing * Math.PI) / 180;
  const [c, s] = [Math.cos(r), Math.sin(r)];
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of points) {
    const m = maplibregl.MercatorCoordinate.fromLngLat(p);
    const x = m.x * c - m.y * s;
    const y = m.x * s + m.y * c;
    [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  }
  // 1 = 世界全体の幅。ズーム z では 512 * 2^z px になる
  const zoom = Math.log2(Math.min((box.right - box.left) / (x1 - x0), (box.bottom - box.top) / (y1 - y0)) / 512);
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
  const center = new maplibregl.MercatorCoordinate(cx * c + cy * s, -cx * s + cy * c).toLngLat();
  map.jumpTo({ center, zoom, bearing, padding: { left: box.left, right: W - box.right, top: box.top, bottom: H - box.bottom } });
}

map.on("load", main);
