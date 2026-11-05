"""地理院ベクトルタイル（experimental_bvmap、z16）から高速道路の道路中心線を集める。

使い方: python scripts/fetch_rdcl.py 西 南 東 北 出力.geojson
- road レイヤのうち rdCtg=3（高速自動車国道等）または motorway=1 を残す。
- ftCode: 2701 通常部 / 2703 橋・高架 / 2704 トンネル（地理院 最適化ベクトルタイル 地物コード表）
- lvOrder: 階層順（0〜4）。交差する所の上下の順番で、高さそのものではない。
- 取得済みのタイルは data/gsi_tiles/ に置き、2回目からは読まない。サーバに負荷をかけないよう1枚ずつ取る。
"""

import math
import os
import sys
import time
import urllib.request

import geopandas as gpd
import mapbox_vector_tile
from shapely.geometry import box, shape
from shapely.ops import transform

ROOT = os.path.join(os.path.dirname(__file__), "..")
CACHE = os.path.join(ROOT, "data", "gsi_tiles")
Z = 16


def tile(x, y):
    p = os.path.join(CACHE, f"{Z}_{x}_{y}.pbf")
    if not os.path.exists(p):
        b = urllib.request.urlopen(f"https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/{Z}/{x}/{y}.pbf", timeout=30).read()
        open(p, "wb").write(b)
        time.sleep(0.2)
    return open(p, "rb").read()


def main():
    w, s, e, n = map(float, sys.argv[1:5])
    out = sys.argv[5]
    os.makedirs(CACHE, exist_ok=True)
    N = 2**Z
    tx = lambda lon: int((lon + 180) / 360 * N)
    ty = lambda lat: int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * N)
    rows = []
    for X in range(tx(w), tx(e) + 1):
        for Y in range(ty(n), ty(s) + 1):
            t = mapbox_vector_tile.decode(tile(X, Y), default_options={"y_coord_down": True})
            if "road" not in t:
                continue
            ext = t["road"]["extent"]
            f2 = lambda x, y, z=None: (((X + x / ext) / N) * 360 - 180, math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (Y + y / ext) / N)))))
            for f in t["road"]["features"]:
                p = f["properties"]
                if p.get("rdCtg") == 3 or p.get("motorway") == 1:
                    rows.append({**p, "geometry": transform(f2, shape(f["geometry"]))})
    g = gpd.GeoDataFrame(rows, crs=4326).clip(box(w, s, e, n))
    g = g[g.geom_type.isin(["LineString", "MultiLineString"])].explode(index_parts=False)
    g.to_file(out, driver="GeoJSON")
    print(len(g), "本", round(g.to_crs(6677).length.sum() / 1000, 1), "km")


if __name__ == "__main__":
    main()
