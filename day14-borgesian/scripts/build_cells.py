"""国勢調査（2020年）の125mメッシュ人口を、A5 のセル（解像度 3〜14）に面積の割合で配る。

A5 の親子は形として入れ子になっていない（子の五角形が親からはみ出す）ので、解像度ごとに直接計算する。
- メッシュの4隅が同じセルに入るなら、メッシュは丸ごとそのセルに入る（人口をすべてそのセルへ）
- そうでなければ、メッシュの辺の上の点（1辺 K 点）が入るセルを候補にし、
  メッシュ（緯度経度の長方形）と各セル（五角形）の重なりの面積の割合で人口を配る
- 下限 lo: セルに丸ごと入るメッシュの人口の合計。上限 hi: セルに少しでもかかるメッシュの人口の合計
  （メッシュの中の人の偏りによらず、セルの人口は必ず lo〜hi に入る）

  python -I -X utf8 scripts/build_cells.py <2020_pop_census_mesh125.parquet> data
出力: data/cells_rNN.geojsonl（GeoJSONSeq）, data/world.geojson（解像度0〜2の全球の格子）, data/stats.json
"""
import json
import sys
import time
from multiprocessing import Pool
from pathlib import Path

import a5
import numpy as np
import pandas as pd
import pyarrow.parquet as pq
import shapely

POP = "人口（総数）"
RES = list(range(3, 15))
K = 16  # 辺の上で調べる点の数（1辺あたり。約8m おき）


def load(src):
    df = pq.read_table(src, columns=["KEY_CODE", POP]).to_pandas()
    df = df[df[POP] > 0].reset_index(drop=True)
    # 6次メッシュ（11桁）の南西端。1次: 緯度40分×経度1度、2次: 1/8、3次: 1/10、4〜6次: それぞれ1/2
    c = df["KEY_CODE"].astype(str)
    d = np.stack([c.str[i].astype(int).to_numpy() for i in range(4, 11)])
    lat = c.str[0:2].astype(int).to_numpy() / 1.5 + d[0] * (2 / 3) / 8 + d[2] * (2 / 3) / 80
    lon = c.str[2:4].astype(int).to_numpy() + 100 + d[1] / 8 + d[3] / 80
    dlat, dlon = (2 / 3) / 80, 1 / 80
    for k in (4, 5, 6):
        q = d[k]  # 1:南西 2:南東 3:北西 4:北東
        dlat, dlon = dlat / 2, dlon / 2
        lat = lat + ((q - 1) // 2) * dlat
        lon = lon + ((q - 1) % 2) * dlon
    return lat, lon, dlat, dlon, df[POP].to_numpy().astype(np.float64)


def cells_at(xs, ys, r):
    f = a5.lonlat_to_cell
    return np.fromiter((f((x, y), r) for x, y in zip(xs.tolist(), ys.tolist())), dtype=np.uint64, count=len(xs))


def polys(ids):
    rings = []
    for cid in ids.tolist():
        ring = a5.cell_to_boundary(int(cid))
        if ring[0] != ring[-1]:
            ring = list(ring) + [ring[0]]
        rings.append(ring)
    return shapely.polygons(rings) if len(set(map(len, rings))) == 1 else np.array([shapely.Polygon(rg) for rg in rings], dtype=object)


def level(args):
    r, lat, lon, dlat, dlon, pop = args
    t0 = time.time()
    n = len(lat)
    corners = np.stack([cells_at(lon + i * dlon, lat + j * dlat, r) for i in (0, 1) for j in (0, 1)])
    inside = (corners == corners[0]).all(axis=0)
    # 丸ごと入るメッシュ
    a = pd.DataFrame({"cell": corners[0][inside], "p": pop[inside]})
    # 境界にかかるメッシュ: 辺の上の点で候補セルを集める
    bi = np.flatnonzero(~inside)
    t = np.arange(K) / K
    la, lo = lat[bi], lon[bi]
    pts = []
    for s in t:
        pts += [(lo + s * dlon, la), (lo + dlon, la + s * dlat), (lo + (1 - s) * dlon, la + dlat), (lo, la + (1 - s) * dlat)]
    cand = np.stack([cells_at(x, y, r) for x, y in pts])  # (4K, nb)
    pair = pd.DataFrame({"m": np.tile(np.arange(len(bi)), cand.shape[0]), "cell": cand.ravel()}).drop_duplicates()
    ucell = pair["cell"].unique()
    cpoly = polys(ucell)
    cidx = pd.Series(np.arange(len(ucell)), index=ucell)
    boxes = shapely.box(lo, la, lo + dlon, la + dlat)
    m = pair["m"].to_numpy()
    ci = cidx[pair["cell"].to_numpy()].to_numpy()
    inter = np.empty(len(pair))
    step = 2_000_000
    for k0 in range(0, len(pair), step):
        sl = slice(k0, k0 + step)
        inter[sl] = shapely.area(shapely.intersection(boxes[m[sl]], cpoly[ci[sl]]))
    pair["a"] = inter
    cover = pair.groupby("m")["a"].sum().reindex(np.arange(len(bi)), fill_value=0).to_numpy() / (dlat * dlon)
    pair = pair[pair["a"] > 0]
    pair["frac"] = pair["a"].to_numpy() / (cover[pair["m"].to_numpy()] * dlat * dlon)
    pair["p"] = pop[bi][pair["m"].to_numpy()] * pair["frac"]
    pair["pm"] = pop[bi][pair["m"].to_numpy()]
    p = pd.concat([a.groupby("cell")["p"].sum(), pair.groupby("cell")["p"].sum()]).groupby(level=0).sum()
    lo_ = a.groupby("cell")["p"].sum().reindex(p.index, fill_value=0)
    hi_ = lo_ + pair.groupby("cell")["pm"].sum().reindex(p.index, fill_value=0)
    res = pd.DataFrame({"p": p, "lo": lo_, "hi": hi_})
    info = {"inside": int(inside.sum()), "edge": int(len(bi)), "cover_min": float(cover.min()) if len(bi) else 1.0,
            "cover_lt_0999": int((cover < 0.999).sum()), "sec": round(time.time() - t0)}
    return r, res, info


def main():
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    lat, lon, dlat, dlon, pop = load(src)
    total = int(pop.sum())
    print(f"meshes with pop {len(pop):,}  total {total:,}  mesh {dlat * 3600:.2f}\" x {dlon * 3600:.2f}\"", flush=True)
    stats = {"total": total, "meshes": int(len(pop)), "levels": {}}
    with Pool(len(RES)) as pool:
        for r, res, info in pool.imap_unordered(level, [(r, lat, lon, dlat, dlon, pop) for r in RES]):
            area = a5.cell_area(r) / 1e6
            assert abs(res["p"].sum() - total) < 1, (r, res["p"].sum())
            assert (res["lo"] <= res["p"] + 1e-6).all() and (res["p"] <= res["hi"] + 1e-6).all(), r
            path = out / f"cells_r{r:02d}.geojsonl"
            with path.open("w", encoding="utf-8") as fp:
                for cid, p, lo_, hi_ in zip(res.index.tolist(), res["p"].tolist(), res["lo"].tolist(), res["hi"].tolist()):
                    ring = [[round(x, 6), round(y, 6)] for x, y in a5.cell_to_boundary(int(cid))]
                    if ring[0] != ring[-1]:
                        ring.append(ring[0])
                    props = {"p": round(p), "d": round(p / area), "lo": round(lo_), "hi": round(hi_)}
                    fp.write(json.dumps({"type": "Feature", "properties": props, "geometry": {"type": "Polygon", "coordinates": [ring]}}, separators=(",", ":")) + "\n")
            v = res["p"].to_numpy()
            stats["levels"][r] = {"area_km2": area, "cells": int(len(res)), "max_pop": float(v.max()), "max_density": float(v.max() / area),
                                  "exact_cells": int((res["lo"] == res["hi"]).sum()), **info}
            print(f"res {r}: {len(res):,} cells  {info}  {time.time() - t0:.0f}s", flush=True)
    stats["levels"] = dict(sorted(stats["levels"].items()))

    # 全球の格子（解像度0〜2）。導入で12個の五角形から寄っていく用
    feats = []
    for r in (0, 1, 2):
        todo = a5.get_res0_cells() if r == 0 else [ch for p in a5.get_res0_cells() for ch in a5.cell_to_children(p, r)]
        for cid in todo:
            ring = [[round(x, 5), round(y, 5)] for x, y in a5.cell_to_boundary(int(cid), {"segments": 16})]
            if ring[0] != ring[-1]:
                ring.append(ring[0])
            feats.append({"type": "Feature", "properties": {"r": r}, "geometry": {"type": "Polygon", "coordinates": [ring]}})
    (out / "world.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")), encoding="utf-8")
    (out / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"done {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
