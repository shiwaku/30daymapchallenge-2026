"""道路中心線に開通年と、なめらかにつないだ高さを付け、fill-extrusion 用（寄った画面）と線（引いた画面）の GeoJSON にする。

使い方:
  python scripts/prepare_smooth.py 道路中心線.geojson 出力ディレクトリ 高さ.csv:測った線.geojson [...] [--lights 西,南,東,北 ...]
  道路中心線   scripts/fetch_rdcl.py の出力（地理院ベクトルタイル、高速道路）
  高さ.csv     scripts/measure_las.py の出力（x, y 付き。東京都 区部点群データで測った路面の高さ）。
               「:」のあとに、その測定に使った道路中心線を書く（線の階層 lvOrder を引くため）
  --lights     光の粒を置く範囲（経度・緯度。寄る場面だけにして部品の数を抑える）
  data/n06/... 国土数値情報 高速道路時系列（首都高の区間の開通年・路線名）
出力:
  roads.geojson  kind = deck（高架の路面、4m の区間ごと）/ ground（地上・掘割）/ pier（橋脚）/ light（光の粒）。
                 z = 1 は寄る場面の範囲にかかる線
  lines.geojson  道路中心線（引いた画面で光らせる線）。year, route

開通年: 線の中点から40m以内で一番近い N06 の首都高の区間。当たらない線（ランプや、N06 と形がずれる所）は、
  つながっている線から引き継ぐ（いちばん早い年）。それでも決まらない線は捨てる。
段差をなくすため、高さは線ごとの1つの値にせず、4m おきの点ごとに持たせる:
  - 線の中で隣り合う点、線の端どうし（1.5m 以内）をつないだ網をつくる
  - 測定は、測った線に沿って前後7点の中央値から 2.5m 以上離れた値を捨て（上の標識や交差する高架を拾った値）、
    位置が 3m 以内で線の階層（lvOrder）が同じ点に割り当てる
  - 測定のある点は弱く寄せ（重み 0.4）、地上（ftCode 2701）とトンネル（2704）は 0 に固め、ほかは隣の点の平均で埋める
  - 勾配は隣の点より 0.32m（4m あたり 8%）までに抑える（下げる向きだけ）
"""

import os
import sys

import geopandas as gpd
import numpy as np
import pandas as pd
from scipy.spatial import cKDTree
from shapely.geometry import LineString, Point, box

ROOT = os.path.join(os.path.dirname(__file__), "..")
N06 = os.path.join(ROOT, "data", "n06", "N06-24", "UTF-8", "N06-24_HighwaySection.geojson")
STEP = 4.0
W = 4.5  # 路面の半幅（m）


def main():
    args = sys.argv[1:]
    lights = []
    if "--lights" in args:
        i = args.index("--lights")
        lights = [box(*map(float, a.split(","))) for a in args[i + 1:]]
        args = args[:i]
    src, outdir, hs = args[0], args[1], args[2:]
    os.makedirs(outdir, exist_ok=True)
    lights = list(gpd.GeoSeries(lights, crs=4326).to_crs(6677)) if lights else []
    r = gpd.read_file(src).to_crs(6677).reset_index(drop=True)
    r = r[r.ftCode.isin([2701, 2703, 2704])].copy()

    # 開通年・路線名
    n = gpd.read_file(N06)
    n = n[n.N06_007.str.contains("首都高速", na=False)].to_crs(6677)[["N06_001", "N06_007", "geometry"]]
    mid = r.set_geometry(r.geometry.interpolate(0.5, normalized=True))
    j = gpd.sjoin_nearest(mid, n, how="left", max_distance=40)
    j = j[~j.index.duplicated()]
    r["year"], r["route"] = j.N06_001, j.N06_007

    # 点と網
    nodes, edges = [], []
    for i, row in r.iterrows():
        g = row.geometry
        k = max(1, int(round(g.length / STEP)))
        start = len(nodes)
        for s in range(k + 1):
            d = g.length * s / k
            p = g.interpolate(d)
            nodes.append((i, s, p.x, p.y, d, row.ftCode, row.lvOrder))
            if s:
                edges.append((start + s - 1, start + s))
    nd = pd.DataFrame(nodes, columns=["line", "s", "x", "y", "d", "ft", "lv"])
    ends = nd.groupby("line").s.transform("max")
    tip = nd[(nd.s == 0) | (nd.s == ends)]
    nb = {}
    for a, b in cKDTree(tip[["x", "y"]].to_numpy()).query_pairs(1.5):
        ia, ib = tip.index[a], tip.index[b]
        la, lb = nd.line[ia], nd.line[ib]
        if la != lb:
            edges.append((ia, ib))
            nb.setdefault(la, set()).add(lb)
            nb.setdefault(lb, set()).add(la)
    E = np.array(edges)

    # 開通年が当たらない線は、つながっている線から引き継ぐ（いちばん早い年）
    miss0 = int(r.year.isna().sum())
    for _ in range(100):
        changed = False
        for i in r.index[r.year.isna()]:
            ys = [(r.year[k], r.route[k]) for k in nb.get(i, ()) if pd.notna(r.year[k])]
            if ys:
                r.loc[i, ["year", "route"]] = list(min(ys))
                changed = True
        if not changed:
            break
    print("開通年: N06 に当たらない線", miss0, "本 → 引き継いでも決まらない", int(r.year.isna().sum()), "本（",
          round(r[r.year.isna()].length.sum()), "m、捨てる）", file=sys.stderr)

    # 測定を点に割り当てる
    tree = {lv: (cKDTree(g[["x", "y"]].to_numpy()), g.index.to_numpy()) for lv, g in nd.groupby("lv")}
    got = {}
    nkeep = ndrop = 0
    for hspec in hs:
        csv, lines = hspec.split(":", 1) if ":" in hspec[2:] else (hspec, src)
        m = pd.read_csv(csv)
        ml = gpd.read_file(lines).to_crs(6677)
        m = m[m.line.isin(ml.index)]
        m["lv"] = ml.lvOrder.reindex(m.line.to_numpy()).to_numpy()
        keep = []
        for ln, g in m.groupby("line"):
            geom = ml.geometry[ln]
            g = g.assign(pos=[geom.project(Point(x, y)) for x, y in zip(g.x, g.y)]).sort_values("pos")
            rm = g.h.rolling(7, center=True, min_periods=1).median()
            keep.append(g[(g.h - rm).abs() < 2.5])
        k = pd.concat(keep)
        ndrop += len(m) - len(k)
        nkeep += len(k)
        for lv, g in k.groupby("lv"):
            if lv not in tree:
                continue
            t, idx = tree[lv]
            dist, ii = t.query(g[["x", "y"]].to_numpy(), distance_upper_bound=3.0)
            for dd, i2, hv in zip(dist, ii, g.h.to_numpy()):
                if np.isfinite(dd):
                    got.setdefault(idx[i2], []).append(hv)
    meas = np.full(len(nd), np.nan)
    for i2, v in got.items():
        meas[i2] = np.median(v)
    print("測定", nkeep, "点を使う（外れ値", ndrop, "点を捨てた）", file=sys.stderr)
    fixed = nd.ft.isin([2701, 2704]).to_numpy()
    measured = ~np.isnan(meas) & ~fixed
    print("測れた点の割合（高架の点）", round(measured.sum() / max(int((nd.ft == 2703).sum()), 1), 3), file=sys.stderr)

    # 反復で解く
    lvmed = pd.Series(meas[measured]).groupby(nd.lv[measured].to_numpy()).median()
    print("階層ごとの高さ（測れた点の中央値）", lvmed.round(1).to_dict(), file=sys.stderr)
    init = nd.lv.map(lvmed).fillna(10).to_numpy()
    h = np.where(measured, meas, np.where(fixed, 0.0, init))
    deg = np.bincount(E.ravel(), minlength=len(nd)).astype(float)
    wm = np.where(measured, 0.4, 0.0)
    for _ in range(3000):
        acc = np.bincount(E[:, 0], weights=h[E[:, 1]], minlength=len(nd)) + np.bincount(E[:, 1], weights=h[E[:, 0]], minlength=len(nd))
        nh = (acc + wm * np.nan_to_num(meas)) / np.maximum(deg + wm, 1e-9)
        h = np.where(fixed, 0.0, np.where(deg + wm > 0, nh, h))
    for _ in range(3000):
        cap = np.full(len(nd), np.inf)
        np.minimum.at(cap, E[:, 0], h[E[:, 1]] + 0.32)
        np.minimum.at(cap, E[:, 1], h[E[:, 0]] + 0.32)
        nh = np.minimum(h, cap)
        if np.allclose(nh, h):
            break
        h = nh
    nd["h"] = h

    rows = []
    for ln, g in nd.groupby("line"):
        row = r.loc[ln]
        if row.ftCode == 2704 or pd.isna(row.year):
            continue
        g = g.sort_values("s")
        xy, hh, dd = g[["x", "y"]].to_numpy(), g.h.to_numpy(), g.d.to_numpy()
        line = LineString(xy)
        # z: 寄る場面の範囲（光の粒の範囲）にかかる線。アニメーションで立ち上げるのはこの線だけ
        base = {"year": int(row.year), "route": row.route.replace("首都高速", ""), "lane": 0, "d": 0.0, "z": int(any(line.intersects(zz) for zz in lights))}
        for s in range(len(g) - 1):
            a, b = xy[s], xy[s + 1]
            v = (b - a) / max(np.hypot(*(b - a)), 1e-9)
            seg = LineString([a - v * 0.4, b + v * 0.4]).buffer(W, cap_style="flat")  # 少し重ねて継ぎ目のすき間をなくす
            top = (hh[s] + hh[s + 1]) / 2
            if top > 2:
                rows.append({**base, "kind": "deck", "b": max(top - 1.5, 0), "t": top, "geometry": seg})
            else:
                rows.append({**base, "kind": "ground", "b": 0.0, "t": max(top, 0) + 0.4, "geometry": seg})
        if base["z"]:
            for d in np.arange(1.5, line.length, 3.0):
                c0 = line.interpolate(d)
                if not any(c0.within(z) for z in lights):
                    continue
                p0, p1 = line.interpolate(max(d - 0.5, 0)), line.interpolate(d + 0.5)
                v = np.array([p1.x - p0.x, p1.y - p0.y])
                v = v / max(np.hypot(*v), 1e-9)
                nrm = np.array([-v[1], v[0]])
                top = float(np.interp(d, dd, hh))
                for lane in (1, -1):
                    q = np.array([c0.x, c0.y]) + nrm * 2.0 * lane
                    rows.append({**base, "d": round(float(d), 1), "kind": "light", "lane": lane,
                                 "b": round(top + 0.05, 2) if top > 2 else 0.45, "t": round(top + 0.7, 2) if top > 2 else 1.1,
                                 "geometry": box(q[0] - 0.7, q[1] - 0.7, q[0] + 0.7, q[1] + 0.7)})
        for d in np.arange(15, line.length, 30):
            top = float(np.interp(d, dd, hh))
            if top > 4:
                p = line.interpolate(d)
                rows.append({**base, "kind": "pier", "b": 0.0, "t": top - 1.5, "geometry": box(p.x - 1, p.y - 1, p.x + 1, p.y + 1)})
    o = gpd.GeoDataFrame(rows, crs=6677).to_crs(4326)
    o["b"], o["t"] = o.b.round(2), o.t.round(2)
    o.to_file(os.path.join(outdir, "roads.geojson"), driver="GeoJSON", COORDINATE_PRECISION=6)  # 約10cm
    print(o.groupby("kind").size().to_dict(), file=sys.stderr)

    ln = r[r.year.notna() & (r.ftCode != 2704)][["year", "route", "geometry"]].copy()
    ln["year"] = ln.year.astype(int)
    ln["route"] = ln.route.str.replace("首都高速", "")
    ln.to_crs(4326).to_file(os.path.join(outdir, "lines.geojson"), driver="GeoJSON", COORDINATE_PRECISION=6)

    dh = np.abs(h[E[:, 0]] - h[E[:, 1]])
    print("隣の点との高さの差 最大", round(dh.max(), 2), "m / 99%", round(np.percentile(dh, 99), 2), "m", file=sys.stderr)


if __name__ == "__main__":
    main()
