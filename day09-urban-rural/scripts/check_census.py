"""GHS-POP の人口の増減（2000→2020、半径40km・距離帯ごと）を国勢調査と突き合わせる（大阪・東京）。

国勢調査: 2000年は500mメッシュ（e-Stat T000386、data/census2000/）、2020年は250mメッシュ（Day 8 で取った
day08-utopia/data/carfree/mesh_carfree.parquet）。メッシュの中心からの大圏距離で数える。

使い方: python -I -X utf8 scripts/check_census.py
"""
import glob
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
rows = []
for f in glob.glob(str(ROOT / "data/census2000/*.zip")):
    z = zipfile.ZipFile(f)
    rows.append(pd.read_csv(z.open(z.namelist()[0]), encoding="cp932", skiprows=[1], dtype=str, usecols=["KEY_CODE", "T000386001"]))
c = pd.concat(rows)
c["pop"] = pd.to_numeric(c.T000386001, errors="coerce").fillna(0)
s = c.KEY_CODE.str
a, b = s[0:2].astype(int), s[2:4].astype(int)
p, q = s[4].astype(int), s[5].astype(int)
r, t = s[6].astype(int), s[7].astype(int)
m4 = s[8].astype(int)
c["lat"] = a / 1.5 + p / 12 + r / 120 + (m4 >= 3) / 240 + 1 / 480
c["lon"] = 100 + b + q / 8 + t / 80 + (m4 % 2 == 0) / 160 + 1 / 320
m = pd.read_parquet(ROOT.parent / "day08-utopia/data/carfree/mesh_carfree.parquet", columns=["lat", "lon", "pop"])
g = pd.read_csv(ROOT / "data/sprawl_donut.csv")


def dist(df, lat0, lon0):
    la, lo = np.radians(df.lat), np.radians(df.lon)
    p0, l0 = np.radians(lat0), np.radians(lon0)
    return 6371 * np.arccos(np.clip(np.sin(la) * np.sin(p0) + np.cos(la) * np.cos(p0) * np.cos(lo - l0), -1, 1))


RINGS = [(0, 5), (5, 10), (10, 20), (20, 40)]
for name, lat0, lon0 in [("Ōsaka", 34.751981, 135.458199), ("Tokyo", 35.686963, 139.749462)]:
    d0, d1 = dist(c, lat0, lon0), dist(m, lat0, lon0)
    gg = g[g.name == name].set_index("year")
    out = {"全体": (c.loc[d0 < 40, "pop"].sum(), m.loc[d1 < 40, "pop"].sum(), gg.loc[2000, "pop"], gg.loc[2020, "pop"])}
    for x, y in RINGS:
        out[f"{x}-{y}km"] = (c.loc[(d0 >= x) & (d0 < y), "pop"].sum(), m.loc[(d1 >= x) & (d1 < y), "pop"].sum(),
                             gg.loc[2000, f"pop_{x}_{y}"], gg.loc[2020, f"pop_{x}_{y}"])
    print(name)
    for k, (c0, c1, g0, g1) in out.items():
        print(f"  {k:8s} 国勢調査 {c0:>11,.0f} → {c1:>11,.0f} ({c1 / c0 - 1:+.1%})   GHS-POP {g0:>11,.0f} → {g1:>11,.0f} ({g1 / g0 - 1:+.1%})")
