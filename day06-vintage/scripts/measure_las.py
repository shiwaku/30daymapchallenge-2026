"""東京都 区部点群データの図郭を1枚ずつ落とし、道路中心線に沿って路面の高さを測る。

使い方: python scripts/measure_las.py 道路中心線.geojson 出力.csv 図郭番号...
- 5m おきに、半径1.5m の点の上位10%を路面の高さ、半径25m の地盤点（Class 2）の80パーセンタイルを
  周りの地面の高さとし、差（m）を測った位置（x, y、EPSG:6677）と一緒に記録する。掘割は負の値になる。
- 上に別の線（階層が上）が4m以内にある所は、レーザーが下の段に届かないので測らない。
- PCの負荷とディスクを抑えるため、図郭は1枚ずつ落として測り、測り終えたら LAS と zip を消す。
"""

import os
import sys
import urllib.request
import zipfile

import geopandas as gpd
import laspy
import numpy as np
import pandas as pd
from scipy.spatial import cKDTree
from shapely.geometry import box

URL = "https://gic-tokyo.s3.ap-northeast-1.amazonaws.com/2024/dig/lp/{}.zip"


def measure(las_path, r):
    las = laspy.read(las_path)
    X, Y, Z, C = np.asarray(las.x), np.asarray(las.y), np.asarray(las.z), np.asarray(las.classification)
    ext = box(X.min(), Y.min(), X.max(), Y.max()).buffer(-2)
    allp = cKDTree(np.c_[X, Y])
    g = C == 2
    grd, GZ = cKDTree(np.c_[X[g], Y[g]]), Z[g]
    rows = []
    for i, row in r[r.intersects(ext)].iterrows():
        geom = row.geometry.intersection(ext)
        if geom.is_empty:
            continue
        upper = r[(r.lvOrder > row.lvOrder) & (r.index != i)]
        upper = upper[upper.intersects(geom.buffer(10))]
        for d in np.arange(0, geom.length, 5):
            p = geom.interpolate(d)
            if len(upper) and upper.distance(p).min() < 4:
                continue
            idx = allp.query_ball_point([p.x, p.y], 1.5)
            gi = grd.query_ball_point([p.x, p.y], 25)
            if len(idx) < 3 or len(gi) < 10:
                continue
            rows.append({"line": i, "x": round(p.x, 2), "y": round(p.y, 2), "top": float(np.percentile(Z[idx], 90)), "ground": float(np.percentile(GZ[gi], 80))})
    return pd.DataFrame(rows, columns=["line", "x", "y", "top", "ground"])


def main():
    src, out, sheets = sys.argv[1], sys.argv[2], sys.argv[3:]
    r = gpd.read_file(src).to_crs(6677)
    tmp = os.path.join(os.path.dirname(out), "las_tmp")
    os.makedirs(tmp, exist_ok=True)
    done = pd.read_csv(out) if os.path.exists(out) else pd.DataFrame(columns=["sheet"])
    for s in sheets:
        if s in set(done.sheet):
            print(s, "測定済み")
            continue
        local = os.path.join(os.path.dirname(__file__), "..", "data", "pilot", f"{s}.las")
        if os.path.exists(local):  # 試作で落とした図郭は使い回す（消さない）
            m = measure(local, r)
        else:
            z = os.path.join(tmp, f"{s}.zip")
            urllib.request.urlretrieve(URL.format(s), z)
            with zipfile.ZipFile(z) as f:
                name = f.namelist()[0]
                f.extract(name, tmp)
            m = measure(os.path.join(tmp, name), r)
            os.remove(z)
            os.remove(os.path.join(tmp, name))
        m["sheet"] = s
        m["h"] = m.top - m.ground
        done = pd.concat([done, m], ignore_index=True)
        done.to_csv(out, index=False)
        print(s, len(m), "点")


if __name__ == "__main__":
    main()
