// A5 の格子（人口なし）を、タイルが要るたびにブラウザで計算してベクトルタイルにする。
// ズーム z のタイルには解像度 z+3 の五角形を入れる（人口のタイルと同じ対応）。
// MapLibre の addProtocol に渡すので、ファイルを置かずにどこまでも寄れる（解像度30まで）。
import { polygonToCells, uncompact, cellToBoundary } from "a5-js";
import { fromGeojsonVt } from "@maplibre/vt-pbf";

const EXTENT = 4096;
const BUF = 0.02; // タイルのまわりを少し広めに取る（タイルの境目で五角形が切れないように）

const lon = (t: number, n: number) => (t / n) * 360 - 180;
const lat = (t: number, n: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * t) / n))) * 180) / Math.PI;
const tx = (lo: number, n: number) => ((lo + 180) / 360) * n;
const ty = (la: number, n: number) => {
  const s = Math.sin((la * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
};

// r を指定すると、そのズームのタイルに解像度 r の五角形を入れる（タイルのズームは25までなので、解像度29・30はズーム25のタイルに入れる）
export function gridTile(z: number, x: number, y: number, res?: number): Uint8Array {
  const n = 2 ** z;
  const r = res ?? Math.min(30, z + 3);
  const ring: [number, number][] = [
    [lon(x - BUF, n), lat(y - BUF, n)],
    [lon(x + 1 + BUF, n), lat(y - BUF, n)],
    [lon(x + 1 + BUF, n), lat(y + 1 + BUF, n)],
    [lon(x - BUF, n), lat(y + 1 + BUF, n)],
    [lon(x - BUF, n), lat(y - BUF, n)],
  ];
  const cells = uncompact(polygonToCells(ring as never, r, { containment: "overlapping" }));
  const features = [];
  for (const c of cells) {
    const b = cellToBoundary(c);
    const g = b.map(([lo, la]) => [Math.round((tx(lo, n) - x) * EXTENT), Math.round((ty(la, n) - y) * EXTENT)] as [number, number]);
    if (g.length && (g[0][0] !== g[g.length - 1][0] || g[0][1] !== g[g.length - 1][1])) g.push(g[0]);
    features.push({ type: 3 as const, geometry: [g], tags: {} });
  }
  return fromGeojsonVt({ grid: { features } } as never, { version: 2, extent: EXTENT });
}
