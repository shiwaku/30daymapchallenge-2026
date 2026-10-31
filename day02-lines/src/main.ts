import * as maplibregl from "maplibre-gl";
import type { ExpressionSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "./style.css";

// 開発時は day02-lines/data、公開時（day02-lines/site/）は ../data を読む
const DATA = import.meta.env.DEV ? "./data/" : "../data/";
const JAPAN: [[number, number], [number, number]] = [[127.6, 30.8], [146.2, 45.6]];
const BEARING = -38;

// 朝6時〜夜0時の18時間でならして、片道1日18本未満を「1時間に1本より少ない」、36本未満を「30分に1本より少ない」とする
const HOURLY = 18;
const HALF_HOURLY = 36;
// 本数の段。1時間あたりの本数（片道、18時間でならした目安）で区切る。少ないほど暗い青、多いほど明るい黄
const CLASSES: { max: number; label: string; color: string; w: number }[] = [
  { max: HOURLY, label: "1本未満", color: "#3d5f94", w: 0.7 },
  { max: HALF_HOURLY, label: "1〜2本", color: "#6f9bd1", w: 1.0 },
  { max: 4 * HOURLY, label: "2〜4本", color: "#b5d1ee", w: 1.4 },
  { max: 12 * HOURLY, label: "4〜12本", color: "#f2f2f2", w: 2.0 },
  { max: Infinity, label: "12本以上", color: "#ffd75e", w: 2.8 },
];
// 本数 n の段ごとの値を返す式
function byClass(pick: (c: (typeof CLASSES)[number]) => number | string): ExpressionSpecification {
  const expr: unknown[] = ["step", ["get", "n"], pick(CLASSES[0])];
  for (let i = 1; i < CLASSES.length; i++) expr.push(CLASSES[i - 1].max, pick(CLASSES[i]));
  return expr as ExpressionSpecification;
}
const CLASS_COLOR = byClass((c) => c.color);
const HOURLY_COLOR = "#ff4040";
const HALF_HOURLY_COLOR = "#ff9a1f";
const DIM_COLOR = "#3a3e47";
const ZERO_COLOR = "#ff5a5a";

// 本数0の区間の注記。路線ごとにまとめる（キーは「事業者名|路線名」）。出典は README
// dx, dy は注記をずらす量（px）。近くの注記と重ならないように
const STOPS: Record<string, { why: string; dx?: number; dy?: number }> = {
  "JR東日本|陸羽東線": { why: "2024年7月の大雨で被災し、運休中" },
  "JR東日本|津軽線": { why: "2022年8月の大雨で被災し運休。2027年4月に廃止予定" },
  "JR四国|瀬戸大橋線（宇多津）": { why: "特急だけが走る連絡線（このデータは特急を数えない）" },
  "JR九州|肥薩線": { why: "2020年7月豪雨で被災し、運休中" },
  "いすみ鉄道|いすみ線": { why: "2024年10月の脱線事故から運休中" },
  "大井川鐵道|本線": { why: "2022年9月の台風15号で被災し、運休中" },
  "くま川鉄道|くま川鉄道線": { why: "2020年7月豪雨で橋が流され運休。2026年9月20日に再開", dy: 62 },
  "スカイレールサービス|瀬野線": { why: "2024年4月で運行を終え、廃止", dy: -16 },
  "長崎電気軌道|4系統": { why: "運転士不足で、2026年2月から4系統を休止中", dy: -62 },
};
// 目印にする駅（各地方の中心駅）。位置は gtfs-gis.jp 2026年版の事業者別・駅別データの JR の駅
const STATIONS: [string, number, number][] = [
  ["札幌", 141.3508, 43.0686], ["旭川", 142.3585, 43.7629], ["釧路", 144.382, 42.9906], ["函館", 140.7262, 41.7744],
  ["青森", 140.7347, 40.8303], ["秋田", 140.1298, 39.7176], ["仙台", 140.8825, 38.2597], ["新潟", 139.061, 37.9122],
  ["東京", 139.7654, 35.6817], ["金沢", 136.6478, 36.5783], ["名古屋", 136.8822, 35.1713], ["大阪", 135.4951, 34.7023],
  ["岡山", 133.9183, 34.667], ["広島", 132.4754, 34.3975], ["高松", 134.0453, 34.3506], ["松山", 132.751, 33.8399],
  ["博多", 130.4206, 33.59], ["熊本", 130.6885, 32.7898], ["鹿児島中央", 130.542, 31.584],
];
// データでは0本だが、公式の時刻表では平日も走っている（0になる理由は確かめられなかった）。
// 「走っていない線」には数えず、ふつうの線として描く
const NOT_ZERO = ["富山地方鉄道"];
// このズームからすべての駅のレイヤーに切り替え、ターミナル駅を出す。ふつうの駅はさらに拡大してから出す
const STATION_ZOOM = 8;
const ALL_STATION_ZOOM = 10;
const isZero = (p: Props) => p.n === 0 && !NOT_ZERO.includes(p.op);

type Props = { op: string; line: string; a: string; b: string; fw: number; rv: number; n: number; km: number | null };
type FC = GeoJSON.FeatureCollection<GeoJSON.LineString, Props>;

maplibregl.setWorkerUrl(workerUrl);

const RECORD = new URLSearchParams(location.search).has("record");
const map = new maplibregl.Map({
  container: "map",
  hash: !RECORD,
  bounds: JAPAN,
  minZoom: 3,
  maxZoom: 12,
  attributionControl: false,
  localIdeographFontFamily: "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', sans-serif",
  style: {
    version: 8,
    sources: {},
    // 路線名の英数字だけこのフォントで描く。漢字・かなは端末のフォントで描く（localIdeographFontFamily）
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    layers: [{ id: "background", type: "background", paint: { "background-color": "#0b0d12" } }],
  },
});
map.addControl(new maplibregl.AttributionControl({ compact: false }));
// 地図を回しているので、北の向きを出す
map.addControl(new maplibregl.NavigationControl({ showZoom: false, visualizePitch: false }), "bottom-right");

// 線の太さ（ズーム4.5ほどのときの px）。本数の段ごとに決める。どの段も1px前後より太くして、色の差が見えるようにする。
// e=1 で、30分に1本より少ない線を太くして目立たせる
function width(e: number): ExpressionSpecification {
  const emph: ExpressionSpecification = ["case", ["<", ["get", "n"], HALF_HOURLY], 0.7 * e, 0];
  const w: ExpressionSpecification = ["+", byClass((c) => c.w), emph];
  return ["interpolate", ["exponential", 2], ["zoom"], 4, ["*", 0.7, w], 12, ["*", 6, w]];
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

// 日本は南西から北東へのびているので、横長の画面では地図を回して北東を右に向ける。
// 回したあとの線の広がりで拡大率を決める（緯度経度の四角形を回すと、余白が大きくなりすぎる）
function fitJapan(points: [number, number][]) {
  if (location.hash && !RECORD) return;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const wide = W >= 900;
  const title = $("#title").getBoundingClientRect();
  const bearing = wide ? BEARING : 0;
  const box = wide
    ? { left: 24, right: W - 24, top: title.bottom * 0.45, bottom: H - 36 }
    : { left: 12, right: W - 12, top: title.bottom + 12, bottom: H - 36 };

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
  // 画面の中心と枠の中心のずれを、地図の padding で寄せる
  map.jumpTo({
    center,
    zoom,
    bearing,
    padding: { left: box.left, right: W - box.right, top: box.top, bottom: H - box.bottom },
  });
}

async function main() {
  const [fc, eki] = (await Promise.all(
    ["kukan2026.geojson", "stations2026.geojson"].map((f) => fetch(DATA + f).then((r) => r.json())),
  )) as [FC, GeoJSON.FeatureCollection<GeoJSON.Point, { name: string; ops: number; terminal?: boolean }>];
  const feats = fc.features;

  // 数字はすべてこのデータから出す（営業キロのない区間は距離の合計から外す）
  const kmOf = (f: (typeof feats)[number]) => f.properties.km ?? 0;
  const totalKm = feats.reduce((s, f) => s + kmOf(f), 0);
  const kmWhere = (ok: (n: number) => boolean) => feats.filter((f) => ok(f.properties.n)).reduce((s, f) => s + kmOf(f), 0);
  const hourlyKm = kmWhere((n) => n < HOURLY);
  const halfKm = kmWhere((n) => n >= HOURLY && n < HALF_HOURLY);
  const zero = feats.filter((f) => isZero(f.properties));
  const zeroKm = zero.reduce((s, f) => s + kmOf(f), 0);
  const busiest = feats.reduce((a, b) => (b.properties.n > a.properties.n ? b : a));

  map.addSource("rail", {
    type: "geojson",
    data: fc,
    attribution:
      '<a href="https://gtfs-gis.jp/railway_honsu/" target="_blank" rel="noopener">gtfs-gis.jp 全国鉄道運行本数データ 2026年版</a>（西澤明、CC BY 4.0 / ODbL）を加工して作成',
  });
  // 段階3の発光。少ない線の下に、ぼかした線を2重に敷く（外側は大きく淡く、内側は細く強く）
  const GLOWS = [
    { id: "glow-outer", width: [8, 64], blur: [8, 64], opacity: 0.35 },
    { id: "glow-inner", width: [2.5, 20], blur: [2, 16], opacity: 0.8 },
  ];
  for (const g of GLOWS) {
    map.addLayer({
      id: g.id,
      type: "line",
      source: "rail",
      filter: ["<", ["get", "n"], HALF_HOURLY],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["case", ["<", ["get", "n"], HOURLY], HOURLY_COLOR, HALF_HOURLY_COLOR],
        "line-width": ["interpolate", ["exponential", 2], ["zoom"], 4, g.width[0], 12, g.width[1]],
        "line-blur": ["interpolate", ["exponential", 2], ["zoom"], 4, g.blur[0], 12, g.blur[1]],
        "line-opacity": 0,
        "line-opacity-transition": { duration: 1500 },
      },
    });
  }
  map.addLayer({
    id: "rail",
    type: "line",
    source: "rail",
    // 細い線を上に重ねる。太い線の下に細い線が隠れないように
    layout: { "line-cap": "round", "line-join": "round", "line-sort-key": ["-", ["get", "n"]] },
    paint: { "line-color": CLASS_COLOR, "line-width": width(0), "line-color-transition": { duration: 800 } },
  });
  map.addLayer({
    id: "zero",
    type: "line",
    source: "rail",
    filter: ["all", ["==", ["get", "n"], 0], ["!", ["in", ["get", "op"], ["literal", NOT_ZERO]]]],
    layout: { visibility: "none" },
    paint: { "line-color": ZERO_COLOR, "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1.4, 10, 3], "line-dasharray": [2, 1.5] },
  });

  // 路線名。拡大したときだけ、線に沿って出す
  map.addLayer({
    id: "line-name",
    type: "symbol",
    source: "rail",
    minzoom: 7.5,
    layout: {
      "symbol-placement": "line",
      "symbol-spacing": 400,
      // 「本線」「東西線」など、名前だけでは会社が分からない線が多いので、JR 以外は会社名を付ける
      "text-field": ["case", ["==", ["slice", ["get", "op"], 0, 2], "JR"], ["get", "line"], ["concat", ["get", "op"], " ", ["get", "line"]]],
      "text-font": ["Open Sans Semibold"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 7.5, 12, 12, 15],
      "text-max-angle": 30,
      "text-padding": 4,
      // 本数の多い線の名前を優先する
      "symbol-sort-key": ["-", ["get", "n"]],
    },
    paint: {
      "text-color": "#d8dae0",
      "text-halo-color": "#0b0d12",
      "text-halo-width": 2,
      "text-opacity": ["interpolate", ["linear"], ["zoom"], 7.5, 0, 8, 1],
    },
  });

  // すべての駅。拡大したときだけ出す。ターミナル駅（主要19駅と、3社以上が乗り入れる駅）は大きな白丸と太字で区別する
  const near = (a: number[], b: number[]) => Math.abs(a[0] - b[0]) < 0.005 && Math.abs(a[1] - b[1]) < 0.005;
  for (const f of eki.features) {
    const c = f.geometry.coordinates;
    f.properties.terminal = f.properties.ops >= 3 || STATIONS.some(([name, x, y]) => name === f.properties.name && near(c, [x, y]));
  }
  map.addSource("eki", { type: "geojson", data: eki });
  // ふつうの駅とターミナル駅でレイヤーを分ける（出始めるズームが違うので）。ターミナル駅を後に足して上に描く
  const EKI = [
    { id: "eki", term: false, minzoom: ALL_STATION_ZOOM, r: [1.8, 3], size: [10.5, 12.5], dot: "#0b0d12", ring: "#9aa3b5", text: "#aeb4c2", halo: 1.6 },
    { id: "eki-term", term: true, minzoom: STATION_ZOOM, r: [3.5, 6], size: [13, 16], dot: "#ffffff", ring: "#0b0d12", text: "#ffffff", halo: 2.2 },
  ];
  for (const k of EKI) {
    const filter: ExpressionSpecification = ["==", ["get", "terminal"], k.term];
    map.addLayer({
      id: `${k.id}-dot`,
      type: "circle",
      source: "eki",
      minzoom: k.minzoom,
      filter,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], k.minzoom, k.r[0], 13, k.r[1]],
        "circle-color": k.dot,
        "circle-stroke-color": k.ring,
        "circle-stroke-width": k.term ? 1.5 : 1,
      },
    });
    map.addLayer({
      id: `${k.id}-name`,
      type: "symbol",
      source: "eki",
      minzoom: k.minzoom,
      filter,
      layout: {
        "text-field": ["get", "name"],
        // このフォントサーバーには Semibold しかないので、ターミナル駅は大きさと色で区別する
        "text-font": ["Open Sans Semibold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], k.minzoom, k.size[0], 13, k.size[1]],
        "text-variable-anchor": ["left", "right", "top", "bottom"],
        "text-radial-offset": 0.6,
        "text-padding": 2,
      },
      paint: { "text-color": k.text, "text-halo-color": "#0b0d12", "text-halo-width": k.halo },
    });
  }

  // 走っていない線の注記。路線ごとに、まん中の区間のまん中に置く
  const groups = new Map<string, (typeof feats)[number][]>();
  for (const f of zero) {
    const key = `${f.properties.op}|${f.properties.line}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  const markers = [...groups].map(([key, fs]) => {
    const [op, line] = key.split("|");
    const mid = fs[Math.floor(fs.length / 2)].geometry.coordinates;
    const at = mid[Math.floor(mid.length / 2)] as [number, number];
    const el = document.createElement("div");
    el.className = "stop-label";
    const stop = STOPS[key] ?? { why: "" };
    el.innerHTML = `<div class="box"><div class="name">${op} ${line}</div><div class="why">${stop.why}</div></div>`;
    return new maplibregl.Marker({ element: el, anchor: "left", offset: [8 + (stop.dx ?? 0), stop.dy ?? 0] }).setLngLat(at).addTo(map);
  });

  // 主要19駅の駅名（全国を見るとき）。走っていない線の注記と重ならないよう、段階3では消す。
  // 拡大したら、上のすべての駅のレイヤーに任せて消す
  const stations = STATIONS.map(([name, lon, lat]) => {
    const el = document.createElement("div");
    el.className = "station";
    el.innerHTML = `<div class="box"><span class="dot"></span>${name}</div>`;
    return new maplibregl.Marker({ element: el, anchor: "left", offset: [-3, 0] }).setLngLat([lon, lat]).addTo(map);
  });

  const pct = (x: number) => Math.round((100 * x) / totalKm);
  const km = (x: number) => Math.round(x).toLocaleString("ja-JP");
  const p = busiest.properties;
  // 段階は1〜3（0番は使わない）
  const CAPTIONS = [
    "",
    `全国約${km(totalKm)}kmの鉄道（新幹線を除く）。いちばん多いのは${p.op} ${p.line} ${p.a}〜${p.b}の片道約${Math.round(p.n)}本。1時間に約${Math.round(p.n / HOURLY)}本になる。線の色と太さは、1時間あたりの本数（片道、朝6時から夜0時の18時間でならした目安）。`,
    `<div><b class="hourly">${pct(hourlyKm)}%</b>（約${km(hourlyKm)}km）は1時間に1本より少ない（片道1日${HOURLY}本未満）</div>` +
      `<div><b class="half">${pct(halfKm)}%</b>（約${km(halfKm)}km）は30分に1本より少ない（${HOURLY}〜${HALF_HOURLY}本未満）</div>` +
      `<div class="small">合わせて${pct(hourlyKm + halfKm)}%。朝6時から夜0時の18時間でならした目安</div>`,
    `<b class="zero">${zero.length}区間・約${km(zeroKm)}km</b>は、2026年3〜4月に列車が1本も数えられなかった。多くは災害で被災し、運休したまま。`,
  ];

  const legend = (step: number) => {
    const bars = CLASSES.map(
      (c) => `<div class="item"><div class="bar" style="height:${(c.w * 1.2).toFixed(1)}px;background:${c.color}"></div>${c.label}</div>`,
    ).join("");
    return step === 2
        ? `<div class="item"><div class="bar" style="height:3px;background:${HOURLY_COLOR}"></div>1時間に1本未満</div>` +
          `<div class="item"><div class="bar" style="height:3px;background:${HALF_HOURLY_COLOR}"></div>30分に1本未満</div>`
        : step === 3
          ? `<div class="item"><div class="dash"></div>0本</div>`
          : `<div class="unit">1時間あたりの本数（片道）</div><div class="bars">${bars}</div>`;
  };

  let step = -1;
  let e = 0;
  let anim = 0;
  function animateWidth(toE: number) {
    cancelAnimationFrame(anim);
    const fromE = e;
    const start = performance.now();
    const frame = (now: number) => {
      const k = Math.min((now - start) / 2500, 1);
      const ease = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      e = fromE + (toE - fromE) * ease;
      map.setPaintProperty("rail", "line-width", width(e));
      if (k < 1) anim = requestAnimationFrame(frame);
    };
    anim = requestAnimationFrame(frame);
  }

  function show(s: number) {
    if (s === step) return;
    step = s;
    document.querySelectorAll<HTMLButtonElement>("#steps button").forEach((b) => b.classList.toggle("on", Number(b.dataset.step) === s));
    $("#caption").innerHTML = CAPTIONS[s];
    $("#legend").innerHTML = legend(s);
    animateWidth(s === 2 ? 1 : 0);
    map.setPaintProperty(
      "rail",
      "line-color",
      s === 2
        ? ["case", ["<", ["get", "n"], HOURLY], HOURLY_COLOR, ["<", ["get", "n"], HALF_HOURLY], HALF_HOURLY_COLOR, DIM_COLOR]
        : s === 3
          ? DIM_COLOR
          : CLASS_COLOR,
    );
    map.setLayoutProperty("zero", "visibility", s === 3 ? "visible" : "none");
    for (const g of GLOWS) map.setPaintProperty(g.id, "line-opacity", s === 2 ? g.opacity : 0);
    // マーカーの不透明度は MapLibre が上書きするので、中の要素で出し入れする
    for (const m of markers) m.getElement().classList.toggle("on", s === 3);
    updateStations();
  }
  function updateStations() {
    const zoomedIn = map.getZoom() >= STATION_ZOOM;
    for (const m of stations) m.getElement().classList.toggle("on", step !== 3 && !zoomedIn);
  }
  map.on("zoom", updateStations);

  document.querySelectorAll<HTMLButtonElement>("#steps button").forEach((b) =>
    b.addEventListener("click", () => {
      stopAuto();
      show(Number(b.dataset.step));
    }),
  );

  show(1);
  // 沖縄（ゆいレール）は離れすぎるので、画面に収める範囲からは外す
  const inJapan = ([x, y]: number[]) => x >= JAPAN[0][0] && y >= JAPAN[0][1];
  fitJapan(feats.flatMap((f) => f.geometry.coordinates.filter(inJapan)) as [number, number][]);

  if (RECORD) {
    document.body.classList.add("record");
    const w = window as unknown as { __show: (s: number) => void };
    w.__show = show;
    return;
  }

  // 最初は順に自動で進める。ボタンを押したら止める
  let timer = window.setInterval(() => {
    if (step >= 3) return stopAuto();
    show(step + 1);
  }, 6000);
  function stopAuto() {
    clearInterval(timer);
    timer = 0;
  }
}

map.on("load", main);
