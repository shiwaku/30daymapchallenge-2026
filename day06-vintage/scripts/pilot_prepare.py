"""検証範囲（江戸橋JCT〜箱崎JCT）の試作データを作る。

入力:
  data/pilot/gsi_rdcl.geojson   地理院ベクトルタイル（experimental_bvmap）の道路中心線のうち高速道路
  data/pilot/09LD1867.las       東京都 区部点群データ（江戸橋JCT の図郭）
  data/n06/...HighwaySection    国土数値情報 高速道路時系列（開通年）
  data/pilot/kt657y_crop.tif  KT657Y 1m オルソ（国土地理院 過去の地形データ）の範囲の切り出し
出力:
  web/pilot/roads.geojson   区間ごとの開通年・路線名・高さ（m）。kind = deck（路面）/ pier（橋脚）
  web/pilot/kt657y.png      1965年頃の写真（EPSG:3857 に変換）と web/pilot/kt657y.json（四隅の経緯度）

高さ: 線に沿って5mおきに、半径1.5mの点の上位10%を路面、半径20mの地盤点の中央値を地面として差を取る。
  上に別の高架が重なる所（階層が上の線が4m以内）は下の段にレーザーが届かないので使わない。
  区間の中央値を高さにし、測れなかった区間は同じ階層の中央値で埋める。
"""

import json
import os

import geopandas as gpd
import laspy
import numpy as np
import pandas as pd
import rasterio
from PIL import Image
from pyproj import Transformer
from rasterio.warp import calculate_default_transform, reproject, Resampling
from rasterio.windows import from_bounds
from scipy.spatial import cKDTree
from shapely.geometry import box, Point

ROOT = os.path.join(os.path.dirname(__file__), "..")
P = os.path.join(ROOT, "data", "pilot")
OUT = os.path.join(ROOT, "web", "pilot")
AOI = (139.7730, 35.6790, 139.7905, 35.6865)
# KT657Y_1mOrtho_IX(6677).tif（KT657Y_20260908.zip）から検証範囲を切り出したもの
KT = os.path.join(P, "kt657y_crop.tif")


def heights(r):
    las = laspy.read(os.path.join(P, "09LD1867.las"))
    X, Y, Z, C = np.asarray(las.x), np.asarray(las.y), np.asarray(las.z), np.asarray(las.classification)
    ext = box(X.min(), Y.min(), X.max(), Y.max()).buffer(-2)
    allp = cKDTree(np.c_[X, Y])
    g = C == 2
    grd, GZ = cKDTree(np.c_[X[g], Y[g]]), Z[g]
    h = {}
    for i, row in r.iterrows():
        geom = row.geometry.intersection(ext)
        if geom.is_empty:
            continue
        upper = r[(r.lvOrder > row.lvOrder) & (r.index != i)]
        vals = []
        for d in np.arange(0, geom.length, 5):
            p = geom.interpolate(d)
            if len(upper) and upper.distance(p).min() < 4:
                continue
            idx = allp.query_ball_point([p.x, p.y], 1.5)
            gi = grd.query_ball_point([p.x, p.y], 20)
            if len(idx) < 3 or len(gi) < 10:
                continue
            vals.append(np.percentile(Z[idx], 90) - np.median(GZ[gi]))
        if len(vals) >= 3:
            h[i] = float(np.median(vals))
    return pd.Series(h)


def main():
    os.makedirs(OUT, exist_ok=True)
    r = gpd.read_file(os.path.join(P, "gsi_rdcl.geojson")).to_crs(6677)
    r = r[r.ftCode.isin([2701, 2703])].reset_index(drop=True)

    # 開通年: 区間の中点から40m以内で一番近い N06 の首都高の区間
    n = gpd.read_file(os.path.join(ROOT, "data", "n06", "N06-24", "UTF-8", "N06-24_HighwaySection.geojson"))
    n = n[n.N06_007.str.contains("首都高速", na=False)].to_crs(6677)[["N06_001", "N06_007", "geometry"]]
    mid = r.set_geometry(r.geometry.interpolate(0.5, normalized=True))
    j = gpd.sjoin_nearest(mid, n, how="left", max_distance=40)
    j = j[~j.index.duplicated()]
    r["year"], r["route"] = j.N06_001, j.N06_007
    r = r[r.year.notna()].copy()

    r["h"] = heights(r)
    fill = r.groupby("lvOrder").h.median()
    r["measured"] = r.h.notna().astype(int)
    r["h"] = r.h.fillna(r.lvOrder.map(fill)).fillna(10)
    r.loc[r.ftCode == 2701, "h"] = 0.5  # 通常部（地上）
    print(r.groupby(["year", "lvOrder"]).agg(m=("h", "size"), h=("h", "median"), measured=("measured", "mean")).round(1))

    # 路面: 幅 9m の帯、厚さ 1.5m。橋脚: 30m おきに 2m 角
    deck = r.copy()
    deck["geometry"] = deck.buffer(4.5, cap_style="flat")
    deck["kind"], deck["b"], deck["t"] = "deck", (deck.h - 1.5).clip(lower=0), deck.h
    piers = []
    for _, row in r[r.h > 3].iterrows():
        for d in np.arange(15, row.geometry.length, 30):
            p = row.geometry.interpolate(d)
            piers.append({"year": row.year, "route": row.route, "kind": "pier", "b": 0, "t": row.h - 1.5,
                          "geometry": box(p.x - 1, p.y - 1, p.x + 1, p.y + 1)})
    cols = ["year", "route", "kind", "b", "t", "geometry"]
    out = pd.concat([deck[cols], gpd.GeoDataFrame(piers, crs=6677)[cols]], ignore_index=True)
    out = gpd.GeoDataFrame(out, crs=6677).to_crs(4326)
    out["year"] = out.year.astype(int)
    out["b"], out["t"] = out.b.round(1), out.t.round(1)
    out.to_file(os.path.join(OUT, "roads.geojson"), driver="GeoJSON")

    # 1965年頃の写真: 範囲だけ読み、Web メルカトルにして PNG
    t = Transformer.from_crs(4326, 6677, always_xy=True)
    x0, y0 = t.transform(AOI[0], AOI[1])
    x1, y1 = t.transform(AOI[2], AOI[3])
    with rasterio.open(KT) as src:
        a = src.read(1)
        st = src.transform
        crs = src.crs
    dt, dw, dh = calculate_default_transform(crs, 3857, a.shape[1], a.shape[0], *rasterio.transform.array_bounds(a.shape[0], a.shape[1], st))
    b = np.zeros((dh, dw), np.uint8)
    reproject(a, b, src_transform=st, src_crs=crs, dst_transform=dt, dst_crs=3857, resampling=Resampling.bilinear)
    alpha = (b > 0).astype(np.uint8) * 255
    Image.fromarray(np.dstack([b, b, b, alpha])).save(os.path.join(OUT, "kt657y.png"))
    l, bt, rt, tp = rasterio.transform.array_bounds(dh, dw, dt)
    m = Transformer.from_crs(3857, 4326, always_xy=True)
    corners = [m.transform(l, tp), m.transform(rt, tp), m.transform(rt, bt), m.transform(l, bt)]
    json.dump({"coordinates": corners}, open(os.path.join(OUT, "kt657y.json"), "w"))
    print("png", b.shape, corners)


if __name__ == "__main__":
    main()
