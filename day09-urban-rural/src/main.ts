import "./style.css";

// 開発時は day09-urban-rural/data/web、公開時（day09-urban-rural/site/）は ../data/web を読む
const DATA = import.meta.env.DEV ? "./data/web/" : "../data/web/";

// 人口（GHS-POP）は載せない。日本の2都市で国勢調査と増減の向きが逆だったため（scripts/check_census.py）
type Props = { rank: number; name: string; name_en: string; country: string; built00: number; built20: number };

const grow = (p: Props) => p.built20 / p.built00 - 1;
const pct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(0)}%`;

let current: HTMLElement | null = null;
function select(p: Props | null, tile?: HTMLElement) {
  current?.classList.remove("sel");
  const panel = document.querySelector<HTMLElement>("#city")!;
  if (!p) { current = null; panel.hidden = true; return; }
  current = tile ?? null;
  current?.classList.add("sel");
  panel.hidden = false;
  document.querySelector("#c-name")!.textContent = p.name;
  document.querySelector("#c-type")!.textContent = `${p.name_en}, ${p.country}`;
  document.querySelector("#c-table")!.innerHTML = `
    <tr><th></th><th>2000</th><th>2020</th><th></th></tr>
    <tr><td>建物の面積</td><td>${Math.round(p.built00)} km²</td><td>${Math.round(p.built20)} km²</td><td>${pct(grow(p))}</td></tr>`;
  const img = document.querySelector<HTMLImageElement>("#c-img")!;
  img.src = `${DATA}built/${p.rank}.png`;
  img.alt = `${p.name} の建物の広がり`;
}

async function main() {
  const fc = await (await fetch(DATA + "cities.geojson")).json();
  const cities: Props[] = fc.features.map((f: { properties: Props }) => f.properties);
  cities.sort((a, b) => grow(b) - grow(a)); // build_poster.py と同じ順
  const grid = document.querySelector("#grid")!;
  for (const p of cities) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "tile";
    tile.innerHTML = `
      <div class="pic"><img src="${DATA}built/${p.rank}.png" alt="${p.name}" loading="lazy"></div>
      <div class="name">${p.name}</div>
      <div class="num">${pct(grow(p))}　${Math.round(p.built00)}→${Math.round(p.built20)} km²</div>`;
    tile.addEventListener("click", () => select(p, tile));
    grid.append(tile);
  }
}
document.querySelector("#close")!.addEventListener("click", () => select(null));
document.addEventListener("keydown", (e) => e.key === "Escape" && select(null));
main();
