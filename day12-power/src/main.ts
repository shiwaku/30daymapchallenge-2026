import * as maplibregl from "maplibre-gl";
import type { ExpressionSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "./style.css";

// 開発時は day12-power/web、公開時（day12-power/site/）は ../web を読む
const DATA = import.meta.env.DEV ? "./web/" : "../web/";
const BG = "#0b0d12";
const NODATA = "#23262e";

// 10年間の発電量の増加（TWh）の色。減った国は青
const CLASSES = [
  { max: -10, label: "−10未満", color: "#3b6fb6" },
  { max: 0, label: "−10〜0", color: "#8fb3dc" },
  { max: 10, label: "0〜10", color: "#4a3a2a" },
  { max: 50, label: "10〜50", color: "#7a4a1c" },
  { max: 150, label: "50〜150", color: "#b8641a" },
  { max: 500, label: "150〜500", color: "#ec8a2a" },
  { max: Infinity, label: "500以上", color: "#ffd27a" },
];

interface Comp {
  key: string; name: string; inc: number; pct: number | null; note: string | null;
  g1: number; d: number; per_year: number; r: number; dc_per_year: number; ratio: number | null;
}
interface Stats {
  years: [number, number]; dc_years: [number, number]; series_from: number; n_countries: number;
  world: { g0: number; g1: number; d: number; per_year: number };
  compare: Comp[];
  sensitivity: Record<string, { y0: number; y1: number; per_year: number; ratio: number | null }[]>;
  top_increase: { iso: string; name_en: string; d: number }[];
  outlook: {
    from: number; base: number; to: number; ratio_now: number; ratio_lin: number; ratio_cagr: number;
    areas: Record<string, { actual: number[]; lin: number[]; cagr: number[]; r: number }>;
  };
}

// 比較の吹き出しを置く位置
const ANCHOR: Record<string, [number, number]> = {
  USA: [-100, 40], CHN: [96, 31], EUR: [12, 50], JPN: [152, 45],
};
const OUT_ANCHOR: Record<string, [number, number]> = { USA: [-100, 40], CHN: [112, 42], IND: [72, 8] };

maplibregl.setWorkerUrl(workerUrl);
const params = new URLSearchParams(location.search);
const POSTER = params.has("poster");
const map = new maplibregl.Map({
  container: "map",
  bounds: POSTER ? [[-168, -56], [180, 76]] : [[-150, -50], [165, 72]],
  fitBoundsOptions: { padding: POSTER ? { left: 470, top: 10, right: 10, bottom: 10 } : 0 },
  minZoom: -1,
  maxZoom: 6,
  attributionControl: false,
  localIdeographFontFamily: "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', sans-serif",
  canvasContextAttributes: { preserveDrawingBuffer: POSTER },
  style: {
    version: 8,
    sources: {},
    layers: [{ id: "background", type: "background", paint: { "background-color": BG } }],
  },
});
map.addControl(new maplibregl.AttributionControl({ compact: false }));
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
if (POSTER) document.body.classList.add("poster");

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const fmt = (v: number, d = 0) => v.toLocaleString("ja-JP", { minimumFractionDigits: d, maximumFractionDigits: d });
const sign = (v: number, d = 0) => (v > 0 ? "+" : v < 0 ? "−" : "") + fmt(Math.abs(v), d);

function colorExpr(): ExpressionSpecification {
  const expr: unknown[] = ["step", ["get", "d"], CLASSES[0].color];
  for (let i = 1; i < CLASSES.length; i++) expr.push(CLASSES[i - 1].max, CLASSES[i].color);
  return ["case", ["has", "d"], expr, NODATA] as ExpressionSpecification;
}

function fit() {
  const wide = window.innerWidth >= 900;
  const panel = $("#title").getBoundingClientRect();
  if (!wide) {
    map.resize();
    // 縦長の画面では地図の高さより小さく縮められないので、地図は画面の上半分（CSS）にして、幅に世界が収まる縮尺にする
    map.jumpTo({
      center: [15, 25], zoom: Math.log2((window.innerWidth - 8) / (512 * (346 / 360))),

    });
    return;
  }
  map.fitBounds([[-168, -46], [178, 72]], {
    padding: wide
      ? { left: panel.right + 8, right: 30, top: 20, bottom: 30 }
      : { left: 8, right: 8, top: 8, bottom: window.innerHeight - panel.top + 8 },
    animate: false,
  });
}

// 10年後の見通しのグラフ。実績（実線）と、過去10年の伸びを延ばした2通り（毎年同じ量・同じ率）の帯
const OUT_COLOR: Record<string, string> = { CHN: "#ffd27a", USA: "#ff6b5b", IND: "#ec8a2a" };
const OUT_NAME: Record<string, string> = { CHN: "中国", USA: "米国", IND: "インド" };
// 2034年の幅（百の位で丸める）。同じなら1つだけ出す
const outRange = (a: { lin: number[]; cagr: number[] }) => {
  const r = (v: number) => fmt(Math.round(v / 100) * 100);
  const lo = r(a.lin[a.lin.length - 1]), hi = r(a.cagr[a.cagr.length - 1]);
  return lo === hi ? lo : `${lo}〜${hi}`;
};
function outlookChart(o: Stats["outlook"]): string {
  const W = 360, H = 170, L = 34, R = 74, T = 8, B = 18;
  const x = (y: number) => L + ((y - o.from) / (o.to - o.from)) * (W - L - R);
  const max = 18000;
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="中国・米国・インドの発電量の実績と10年後の見通し">`;
  for (const v of [0, 5000, 10000, 15000]) {
    svg += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#2a2d35"/>` +
      `<text x="${L - 4}" y="${y(v) + 3}" fill="#8a8c93" font-size="9" text-anchor="end">${fmt(v)}</text>`;
  }
  svg += `<line x1="${x(o.base)}" x2="${x(o.base)}" y1="${T}" y2="${H - B}" stroke="#555" stroke-dasharray="2 3"/>`;
  for (const yr of [o.from, o.base, o.to]) svg += `<text x="${x(yr)}" y="${H - 4}" fill="#8a8c93" font-size="9" text-anchor="middle">${yr}</text>`;
  // ラベルの高さ（重ならないよう、米国は上、インドは下にずらす）
  const LABEL_DY: Record<string, number> = { CHN: 0, USA: -10, IND: 14 };
  for (const k of ["IND", "USA", "CHN"]) {
    const a = o.areas[k], c = OUT_COLOR[k];
    const act = a.actual.map((v, i) => `${x(o.from + i)},${y(v)}`).join(" ");
    const hiL = a.cagr.map((v, i) => `${x(o.base + i)},${y(v)}`);
    const loL = a.lin.map((v, i) => `${x(o.base + i)},${y(v)}`).reverse();
    svg += `<polygon points="${[...hiL, ...loL].join(" ")}" fill="${c}" opacity="0.25"/>` +
      `<polyline points="${a.cagr.map((v, i) => `${x(o.base + i)},${y(v)}`).join(" ")}" fill="none" stroke="${c}" stroke-dasharray="3 3"/>` +
      `<polyline points="${a.lin.map((v, i) => `${x(o.base + i)},${y(v)}`).join(" ")}" fill="none" stroke="${c}" stroke-dasharray="3 3"/>` +
      `<polyline points="${act}" fill="none" stroke="${c}" stroke-width="2"/>`;
    const lo = a.lin[a.lin.length - 1], hi = a.cagr[a.cagr.length - 1];
    const ly = y((lo + hi) / 2) + LABEL_DY[k];
    svg += `<text x="${x(o.to) + 4}" y="${ly}" fill="${c}" font-size="11" font-weight="700">${OUT_NAME[k]}</text>` +
      `<text x="${x(o.to) + 4}" y="${ly + 11}" fill="#c8c9ce" font-size="9">${outRange(a)}</text>`;
  }
  return svg + `</svg><div class="cmp-unit">発電量（TWh）。実線は実績、帯は${o.base}年から、過去10年の伸び（毎年同じ量／同じ率）を延ばした値</div>`;
}

function spark(s: (number | null)[], from: number): string {
  const v = s.map((x) => x ?? NaN);
  const ok = v.filter((x) => !isNaN(x));
  if (ok.length < 2) return "";
  const lo = Math.min(...ok), hi = Math.max(...ok);
  const W = 180, H = 44;
  const pts = v.map((x, i) => (isNaN(x) ? null : `${(i / (v.length - 1)) * W},${H - ((x - lo) / (hi - lo || 1)) * H}`))
    .filter(Boolean).join(" ");
  return `<svg width="${W}" height="${H + 14}" viewBox="0 -2 ${W} ${H + 16}"><polyline points="${pts}" fill="none" stroke="#ec8a2a" stroke-width="1.6"/>` +
    `<text x="0" y="${H + 13}" fill="#9a9ca3" font-size="10">${from}</text><text x="${W}" y="${H + 13}" fill="#9a9ca3" font-size="10" text-anchor="end">${from + v.length - 1}</text></svg>`;
}

async function main() {
  const load = (f: string) => fetch(DATA + f).then((r) => r.json());
  const [countries, stats] = (await Promise.all(["countries.geojson", "stats.json"].map(load))) as [GeoJSON.FeatureCollection, Stats];
  const [Y0, Y1] = stats.years;
  const [D0, D1] = stats.dc_years;
  const C = Object.fromEntries(stats.compare.map((c) => [c.key, c]));
  const W = stats.world;
  const chn = stats.top_increase.find((t) => t.iso === "CHN")!;

  map.addSource("c", {
    type: "geojson", data: countries, promoteId: "iso",
    attribution:
      '<a href="https://ember-energy.org/data/yearly-electricity-data/" target="_blank" rel="noopener">Ember</a>（CC BY 4.0）・' +
      '<a href="https://www.iea.org/reports/energy-and-ai/energy-demand-from-ai" target="_blank" rel="noopener">IEA Energy and AI</a>（CC BY 4.0）を加工して作成 / ' +
      '<a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a>',
  });
  map.addLayer({ id: "fill", type: "fill", source: "c", paint: { "fill-color": colorExpr(), "fill-opacity": 1 } });
  map.addLayer({ id: "line", type: "line", source: "c", paint: { "line-color": BG, "line-width": 0.5 } });
  map.addLayer({
    id: "hover", type: "line", source: "c",
    paint: { "line-color": "#fff", "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 1.5, 0] },
  });

  $("#lead").innerHTML =
    `AIのデータセンターは大量の電気を使う。「AIの覇権は電力で決まる」という話を、各国が実際にどれだけ発電を増やしてきたかで確かめた。`;

  // 凡例
  $("#legend").innerHTML = `<span class="unit">${Y0}→${Y1}年の発電量の増減（TWh）</span>` +
    CLASSES.map((c) => `<span class="item"><span class="bar" style="background:${c.color}"></span>${c.label}</span>`).join("") +
    `<span class="item"><span class="bar" style="background:${NODATA}"></span>データなし</span>`;

  // 4地域の比較（棒）: 発電の伸び（年あたり）と DC 需要の伸び（年あたり）
  const rows = ["USA", "CHN", "EUR", "JPN"].map((k) => C[k]);
  $("#compare").innerHTML = `<div class="cmp-head"><span></span><span>発電の伸び<br>${Y0}→${Y1}年</span><span>DC需要の伸び<br>${D0}→${D1}年</span><span>割合</span></div>` +
    rows.map((c) => {
      const m = Math.max(Math.abs(c.per_year), c.dc_per_year);
      const bar = (v: number, cls: string) => `<span class="track"><span class="cbar ${cls}" style="width:${(Math.abs(v) / m) * 100}%"></span></span>`;
      return `<div class="cmp-row"><span class="nm">${c.name}</span>` +
        `<span>${bar(c.per_year, c.per_year < 0 ? "neg" : "gen")}<em>${sign(c.per_year, 1)}</em></span>` +
        `<span>${bar(c.dc_per_year, "dc")}<em>+${fmt(c.dc_per_year, 1)}</em></span>` +
        `<span class="ratio">${c.ratio == null ? "—" : fmt(c.ratio * 100) + "%"}</span></div>`;
    }).join("") + `<div class="cmp-unit">TWh/年。割合 = DC需要の伸び ÷ 発電の伸び</div>`;

  $("#note").innerHTML =
    `発電量 = 国内で発電した電力量（Ember）。DC需要 = IEA「Energy and AI」（2025）の基本シナリオの、データセンターの電力消費の${D0}→${D1}年の増加量（米国 約${C.USA.inc}・中国 約${C.CHN.inc}・欧州 ${C.EUR.inc}超・日本 約${C.JPN.inc}TWh）を6で割った値。` +
    `欧州の発電量は Ember の Europe（欧州全体）で、IEA の「欧州」と範囲が同じかは分からない。` +
    `電力は条件の1つにすぎず、半導体・資金・人材は扱っていない。年間の電力量の比較で、送電の容量や接続待ちは表れない。`;

  // 吹き出し（段階2）
  const markers = rows.map((c) => {
    const el = document.createElement("div");
    el.className = "callout";
    el.innerHTML = `<div class="cn">${c.name}</div>` +
      (c.ratio == null
        ? `<div class="cr neg">発電が減少</div><div class="cs">発電 ${sign(c.per_year, 1)} / DC +${fmt(c.dc_per_year, 1)} TWh/年</div>`
        : `<div class="cr ${c.ratio >= 1 ? "hot" : c.ratio >= 0.5 ? "warm" : "cool"}">${fmt(c.ratio * 100)}%</div>` +
          `<div class="cs">発電 ${sign(c.per_year, 1)} / DC +${fmt(c.dc_per_year, 1)} TWh/年</div>`);
    return new maplibregl.Marker({ element: el }).setLngLat(ANCHOR[c.key]);
  });

  const rng = (k: string) => {
    const r = stats.sensitivity[k].map((x) => x.ratio).filter((x): x is number => x != null).map((x) => Math.round(x * 100));
    return `${Math.min(...r)}〜${Math.max(...r)}%`;
  };
  const captions = [
    () => `${Y0}→${Y1}年に世界の発電量は <b>${sign(W.d)}TWh</b>。そのうち<b class="hi">中国が${sign(chn.d)}TWh</b>（${fmt((chn.d / W.d) * 100)}%）。` +
      `<div class="small">次はインド ${sign(stats.top_increase[1].d)}、米国 ${sign(C.USA.d)}TWh。ドイツ・英国・日本は減った（日本 ${sign(C.JPN.d)}TWh）。</div>`,
    () => `IEA の見通しでは、データセンターの電力消費は${D0}→${D1}年に世界で約${C.WLD.inc}TWh増え、米国と中国で約8割を占める。` +
      `年あたりにすると、<b class="hot">米国は直近10年の発電の伸びの${fmt(C.USA.ratio! * 100)}%</b>、欧州は${fmt(C.EUR.ratio! * 100)}%。<b class="cool">中国は${fmt(C.CHN.ratio! * 100)}%</b>。` +
      `<div class="small">日本は発電が減っていて、DCの分は今の発電の中でやりくりすることになる。電力で見る限り、余裕があるのは中国。</div>` +
      `<div class="small">米国の割合は、発電の伸びを測る期間で変わる（${rng("USA")}）。中国は${rng("CHN")}。</div>`,
  ];

  const O = stats.outlook;
  captions.push(() =>
    `過去10年の伸びが続くと、${O.to}年の中国の発電量は<b class="hi">米国の${fmt(O.ratio_lin, 1)}〜${fmt(O.ratio_cagr, 1)}倍</b>（${O.base}年は${fmt(O.ratio_now, 1)}倍）。` +
    `<div class="small">電力の面で見る限り、次の10年に余裕があるのは中国。米国はデータセンターの伸びが発電の伸びを上回る。インドは伸びが速い（年${fmt(O.areas.IND.r, 1)}%）が、${O.to}年でも米国に届かない。</div>` +
    `<div class="small">AIの覇権は電力だけでは決まらない。半導体・資金・人材はこの地図では扱っていない。</div>`);
  $("#outlook").innerHTML = outlookChart(O);
  const outMarkers = ["CHN", "USA", "IND"].map((k) => {
    const a = O.areas[k];
    const el = document.createElement("div");
    el.className = "callout";
    el.innerHTML = `<div class="cn">${OUT_NAME[k]} ${O.to}年</div>` +
      `<div class="cr" style="color:${OUT_COLOR[k]}">${outRange(a)}</div>` +
      `<div class="cs">TWh（${O.base}年 ${fmt(Math.round(a.actual[a.actual.length - 1] / 100) * 100)}）</div>`;
    return new maplibregl.Marker({ element: el }).setLngLat(OUT_ANCHOR[k]);
  });

  // 段階1のラベル: 増減の大きい国に、国名と増減（TWh）
  const LBL: Record<string, [string, [number, number]]> = {
    CHN: ["中国", [103, 34]], IND: ["インド", [78, 17]], USA: ["米国", [-99, 39]], IDN: ["インドネシア", [114, -2]],
    VNM: ["ベトナム", [106, 14]], BRA: ["ブラジル", [-52, -10]], RUS: ["ロシア", [96, 62]], SAU: ["サウジアラビア", [45, 23]],
    DEU: ["ドイツ", [12, 50]], GBR: ["英国", [-9, 55]], JPN: ["日本", [139, 37]],
  };
  const dOf = Object.fromEntries([...stats.top_increase, ...stats.top_decrease].map((t) => [t.iso, t.d]));
  const labels = Object.entries(LBL).filter(([k]) => dOf[k] != null).map(([k, [nm, ll]]) => {
    const d = dOf[k];
    const el = document.createElement("div");
    el.className = `lbl${k === "CHN" ? " big" : ""}${d < 0 ? " neg" : ""}`;
    el.innerHTML = `<span class="ln">${nm}</span><span class="lv">${sign(d)}</span>`;
    return new maplibregl.Marker({ element: el }).setLngLat(ll);
  });

  const buttons = [...document.querySelectorAll<HTMLButtonElement>("#steps button")];
  let step = 0;
  let timer: number | undefined;
  function show(i: number) {
    step = i;
    buttons.forEach((b, j) => b.classList.toggle("on", j === i));
    $("#caption").innerHTML = captions[i]();
    $("#compare").style.display = i === 1 ? "" : "none";
    $("#outlook").style.display = i === 2 ? "" : "none";
    map.setPaintProperty("fill", "fill-opacity", i === 0 ? 1 : 0.55);
    markers.forEach((m) => (i === 1 ? m.addTo(map) : m.remove()));
    outMarkers.forEach((m) => (i === 2 ? m.addTo(map) : m.remove()));
    labels.forEach((m) => (i === 0 ? m.addTo(map) : m.remove()));
  }
  buttons.forEach((b, j) => b.addEventListener("click", () => { window.clearInterval(timer); show(j); }));

  // ホバーで国の値と推移
  let hovered: string | number | undefined;
  const tip = $("#tip");
  map.on("mousemove", "fill", (e) => {
    const f = e.features?.[0];
    if (!f) return;
    if (hovered !== undefined) map.setFeatureState({ source: "c", id: hovered }, { hover: false });
    hovered = f.id;
    if (hovered !== undefined) map.setFeatureState({ source: "c", id: hovered }, { hover: true });
    const p = f.properties as Record<string, unknown>;
    tip.innerHTML = p.d == null
      ? `<b>${p.name}</b><br><span class="small">データなし</span>`
      : `<b>${p.name}</b><br>${Y1}年 ${fmt(p.g1 as number)}TWh（${Y0}年から ${sign(p.d as number, 1)}、年${sign(p.r as number, 1)}%）` +
        spark(JSON.parse(p.s as string), stats.series_from);
    tip.style.display = "block";
    const x = Math.min(e.point.x + 14, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = `${x}px`;
    tip.style.top = `${Math.min(e.point.y + 14, window.innerHeight - tip.offsetHeight - 8)}px`;
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "fill", () => {
    if (hovered !== undefined) map.setFeatureState({ source: "c", id: hovered }, { hover: false });
    hovered = undefined;
    tip.style.display = "none";
    map.getCanvas().style.cursor = "";
  });

  fit();
  window.addEventListener("resize", fit);
  const s0 = params.get("step");
  if (s0 != null) show(Number(s0));
  else {
    show(0);
    timer = window.setInterval(() => show((step + 1) % captions.length), 6000);
  }
  map.once("idle", () => document.body.classList.add("ready"));
}

main();
