// イチョウ並木の3Dモデル。木の大きさは街路樹データの樹高・枝張（m）をそのまま使う。
// 形（樹冠の輪郭、幹の太さ、樹冠の始まる高さ）は見た目のための決めごとで、データではない。

type Mesh = { positions: { value: Float32Array; size: 3 }; normals: { value: Float32Array; size: 3 } };

// 回転体のメッシュを作る。profile は [高さ, 半径] の列（下から上）
function lathe(profile: [number, number][], sides: number): Mesh {
  const pos: number[] = [];
  const nor: number[] = [];
  // 各輪の法線（輪郭の傾きから出す）
  const ringNormal = (i: number): [number, number] => {
    const a = profile[Math.max(0, i - 1)];
    const b = profile[Math.min(profile.length - 1, i + 1)];
    const dz = b[0] - a[0];
    const dr = b[1] - a[1];
    const len = Math.hypot(dz, dr) || 1;
    return [dz / len, -dr / len]; // [外向き成分, 上向き成分]
  };
  for (let i = 0; i < profile.length - 1; i++) {
    const [z0, r0] = profile[i];
    const [z1, r1] = profile[i + 1];
    const [h0, v0] = ringNormal(i);
    const [h1, v1] = ringNormal(i + 1);
    for (let k = 0; k < sides; k++) {
      const a0 = (k / sides) * Math.PI * 2;
      const a1 = ((k + 1) / sides) * Math.PI * 2;
      const P = (r: number, z: number, a: number) => [r * Math.cos(a), r * Math.sin(a), z];
      const Nn = (h: number, v: number, a: number) => [h * Math.cos(a), h * Math.sin(a), v];
      const quad = [
        [P(r0, z0, a0), Nn(h0, v0, a0)],
        [P(r0, z0, a1), Nn(h0, v0, a1)],
        [P(r1, z1, a1), Nn(h1, v1, a1)],
        [P(r0, z0, a0), Nn(h0, v0, a0)],
        [P(r1, z1, a1), Nn(h1, v1, a1)],
        [P(r1, z1, a0), Nn(h1, v1, a0)],
      ];
      for (const [p, n] of quad) {
        pos.push(...p);
        nor.push(...n);
      }
    }
  }
  return { positions: { value: new Float32Array(pos), size: 3 }, normals: { value: new Float32Array(nor), size: 3 } };
}

// 樹冠の始まる高さ（樹高に対する割合）
export const CROWN_BASE = 0.28;

// 樹冠: 高さ 1、直径 1 の単位形。街路樹のイチョウは剪定されて縦長の卵形になるので、
// 下がふくらみ、上へ細くなる輪郭にする。getScale で [枝張, 枝張, 樹高×(1-CROWN_BASE)] に伸ばす
export const CROWN_MESH = (() => {
  const prof: [number, number][] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const r = 0.5 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.05)), 0.75) * (1 - 0.4 * u);
    prof.push([u, Math.max(0, r)]);
  }
  // 最大半径が 0.5（直径 1）になるようにそろえる
  const m = Math.max(...prof.map((p) => p[1]));
  return lathe(
    prof.map(([z, r]) => [z, (r / m) * 0.5]),
    12,
  );
})();

// 幹: 高さ 1、半径 1 の円柱。getScale で [太さ, 太さ, 樹冠の始まる高さ] に伸ばす
export const TRUNK_MESH = lathe(
  [
    [0, 1],
    [1, 0.8],
  ],
  6,
);

// 0〜1 の決まった乱数（木の番号と粒の番号から）
export function hash(i: number, k: number): number {
  let x = (i * 374761393 + k * 668265263) | 0;
  x = (x ^ (x >>> 13)) * 1274126177;
  x = x ^ (x >>> 16);
  return (x >>> 0) / 4294967296;
}
