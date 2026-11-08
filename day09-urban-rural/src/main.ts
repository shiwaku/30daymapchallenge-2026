import "./style.css";

// 開発時は day09-urban-rural/data/web、公開時（day09-urban-rural/site/）は ../data/web を読む
const DATA = import.meta.env.DEV ? "./data/web/" : "../data/web/";

type Ring = { r: string; p00: number; p20: number };
type Props = {
  rank: number; name: string; name_en: string; country: string; type: "sprawl" | "dense" | "shrink"; donut: boolean;
  pop00: number; pop20: number; built00: number; built20: number; lcr: number | null; m2pp00: number; m2pp20: number; rings: string;
};

const LABELS = { sprawl: "人口より建物が伸びた", dense: "建物より人口が伸びた", shrink: "人口は減り、建物は増えた" };
const COLORS = { sprawl: "#ff8c26", dense: "#4fc3f7", shrink: "#b39ddb" };

const pct = (a: number, b: number) => {
  const v = (b / a - 1) * 100;
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(0)}%`;
};
const fmt = (n: number) => `${(n / 1e4).toLocaleString("ja-JP", { maximumFractionDigits: 0 })}万人`;
const flat = (p: Props) => Math.abs(p.pop20 / p.pop00 - 1) < 0.05;

// 人口が減った → 人口ほぼ横ばい → 建物の伸び÷人口の伸び が大きい順（build_poster.py と同じ）
const order = (p: Props): [number, number] => (p.type === "shrink" ? [0, 0] : flat(p) ? [1, 0] : [2, -(p.lcr ?? 0)]);

// 中心からの距離帯ごとの人口増減を同心円で描く（赤=減った、青=増えた）
function glyph(rings: Ring[], size = 40) {
  const R = size / 2 - 2;
  const circles = [5, 10, 20, 40].map((km, i) => {
    const v = rings[i].p20 / rings[i].p00 - 1;
    const t = Math.min(Math.abs(v) / 0.5, 1) ** 0.6;
    const c = v < 0 ? "255,90,95" : "79,195,247";
    return `<circle cx="${size / 2}" cy="${size / 2}" r="${R * Math.sqrt(km / 40)}" fill="rgba(${c},${0.3 + 0.7 * t})" stroke="#0b0d12"/>`;
  });
  return `<svg class="glyph" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#0b0d12"/>${circles.reverse().join("")}</svg>`;
}

function ringsSvg(rings: Ring[]) {
  const W = 300, rowH = 26, left = 70, mid = left + (W - left) / 2, half = (W - left) / 2 - 36;
  const vals = rings.map((r) => r.p20 / r.p00 - 1);
  const max = Math.max(0.5, ...vals.map(Math.abs));
  const rows = rings.map((r, i) => {
    const v = vals[i], w = (Math.abs(v) / max) * half, y = i * rowH;
    const color = v >= 0 ? "#4fc3f7" : "#ff5a5f";
    return `<text x="0" y="${y + 17}" class="lab">${r.r.replace("-", "〜")} km</text>
      <rect x="${v >= 0 ? mid : mid - w}" y="${y + 6}" width="${Math.max(w, 1)}" height="14" fill="${color}" rx="2"/>
      <text x="${v >= 0 ? mid + w + 4 : mid - w - 4}" y="${y + 17}" class="val" text-anchor="${v >= 0 ? "start" : "end"}">${pct(r.p00, r.p20)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${rings.length * rowH + 4}" width="100%"><line x1="${mid}" x2="${mid}" y1="2" y2="${rings.length * rowH + 2}" stroke="#555"/>${rows.join("")}</svg>`;
}

let current: HTMLElement | null = null;
function select(p: Props | null, tile?: HTMLElement) {
  current?.classList.remove("sel");
  const panel = document.querySelector<HTMLElement>("#city")!;
  if (!p) { current = null; panel.hidden = true; return; }
  current = tile ?? null;
  current?.classList.add("sel");
  panel.hidden = false;
  document.querySelector("#c-name")!.textContent = p.name;
  document.querySelector("#c-type")!.innerHTML =
    `<span class="tag" style="background:${COLORS[p.type]}">${LABELS[p.type]}</span>` + (p.donut ? `<span class="tag donut">ドーナツ</span>` : "");
  const lcr = p.lcr === null || p.type === "shrink" ? "—" : flat(p) ? "人口ほぼ横ばい" : p.lcr.toFixed(2);
  document.querySelector("#c-table")!.innerHTML = `
    <tr><th></th><th>2000</th><th>2020</th><th></th></tr>
    <tr><td>人口</td><td>${fmt(p.pop00)}</td><td>${fmt(p.pop20)}</td><td>${pct(p.pop00, p.pop20)}</td></tr>
    <tr><td>建物の面積</td><td>${Math.round(p.built00)} km²</td><td>${Math.round(p.built20)} km²</td><td>${pct(p.built00, p.built20)}</td></tr>
    <tr><td>1人あたり</td><td>${p.m2pp00.toFixed(0)} m²</td><td>${p.m2pp20.toFixed(0)} m²</td><td>${pct(p.m2pp00, p.m2pp20)}</td></tr>
    <tr><td colspan="3">建物の伸び ÷ 人口の伸び（SDG 11.3.1）</td><td>${lcr}</td></tr>`;
  document.querySelector("#c-rings")!.innerHTML = ringsSvg(JSON.parse(p.rings));
  const img = document.querySelector<HTMLImageElement>("#c-img")!;
  img.src = `${DATA}built/${p.rank}.png`;
  img.alt = `${p.name} の建物の広がり`;
}

async function main() {
  const fc = await (await fetch(DATA + "cities.geojson")).json();
  const cities: Props[] = fc.features.map((f: { properties: Props }) => f.properties);
  cities.sort((a, b) => { const x = order(a), y = order(b); return x[0] - y[0] || x[1] - y[1]; });
  const grid = document.querySelector("#grid")!;
  for (const p of cities) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "tile" + (p.donut ? " donut" : "");
    tile.innerHTML = `
      <div class="pic"><img src="${DATA}built/${p.rank}.png" alt="${p.name}" loading="lazy">${glyph(JSON.parse(p.rings))}${p.donut ? '<span class="badge">ドーナツ</span>' : ""}</div>
      <div class="name">${p.name}</div>
      <div class="num">人口 ${pct(p.pop00, p.pop20)}　建物 ${pct(p.built00, p.built20)}</div>`;
    tile.addEventListener("click", () => select(p, tile));
    grid.append(tile);
  }
  document.querySelector(".legend .gl")!.innerHTML = glyph(
    [{ r: "", p00: 100, p20: 80 }, { r: "", p00: 100, p20: 95 }, { r: "", p00: 100, p20: 115 }, { r: "", p00: 100, p20: 140 }], 24);
}
document.querySelector("#close")!.addEventListener("click", () => select(null));
document.addEventListener("keydown", (e) => e.key === "Escape" && select(null));
main();
