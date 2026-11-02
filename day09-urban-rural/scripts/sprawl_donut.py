"""人口上位100都市圏で、スプロール（建物の広がり vs 人口の伸び）とドーナツ化（中心の人口減）を数える。

データ: GHSL R2023A（1km, Mollweide）の GHS-POP（人/セル）と GHS-BUILT-S（建物の面積 m²/セル）
都市: Natural Earth Populated Places の POP_MAX 上位100（点を中心に半径 40km）

出力: data/sprawl_donut.csv
  - 都市ごと・年ごとの 人口・建物面積（半径 40km）
  - 中心からの距離帯ごとの人口（0-5, 5-10, 10-20, 20-40 km）
  - LCRPGR = ln(B2/B1) / ln(P2/P1)  … SDG 11.3.1 の比（1 を超えると、人口の伸びより建物の広がりが速い）
"""
from pathlib import Path
import sys
import numpy as np
import pandas as pd
import geopandas as gpd
import rasterio
from rasterio.windows import from_bounds
from pyproj import Transformer

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[1]
G = ROOT / "data/ghsl"
YEARS = [int(a) for a in sys.argv[1:]] or [1975, 2000, 2020]
R = 40_000
RINGS = [(0, 5), (5, 10), (10, 20), (20, 40)]

d = gpd.read_file(ROOT / "data/ne/ne_10m_populated_places.shp").nlargest(100, "POP_MAX").reset_index(drop=True)
tr = Transformer.from_crs("EPSG:4326", "+proj=moll +lon_0=0 +datum=WGS84 +units=m", always_xy=True)

def read(kind, y, x, yy):
    with rasterio.open(G / f"GHS_{kind}_E{y}_GLOBE_R2023A_54009_1000_V1_0.tif") as r:
        w = from_bounds(x - R, yy - R, x + R, yy + R, r.transform).round_offsets().round_lengths()
        a = r.read(1, window=w, boundless=True, fill_value=0).astype("float64")
        t = r.window_transform(w)
    a[(a < 0) | (a > 1e6 + 1)] = 0  # POP の -200・BUILT-S の 4294967295（海など）は 0 に
    cx = t.c + (np.arange(a.shape[1]) + .5) * t.a
    cy = t.f + (np.arange(a.shape[0]) + .5) * t.e
    dist = np.hypot(*np.meshgrid(cx - x, cy - yy)) / 1000
    return a, dist

rows = []
for k, c in d.iterrows():
    x, yy = tr.transform(c.geometry.x, c.geometry.y)
    for y in YEARS:
        pop, dist = read("POP", y, x, yy)
        blt, _ = read("BUILT_S", y, x, yy)
        row = dict(rank=k + 1, name=c.NAME, name_ja=c.NAME_JA, country=c.ADM0NAME, year=y,
                   pop=pop[dist < 40].sum(), built_km2=blt[dist < 40].sum() / 1e6)
        for a, b in RINGS:
            m = (dist >= a) & (dist < b)
            row[f"pop_{a}_{b}"] = pop[m].sum()
            row[f"built_{a}_{b}"] = blt[m].sum() / 1e6
        rows.append(row)
    print(k + 1, c.NAME, flush=True)

df = pd.DataFrame(rows)
df.to_csv(ROOT / "data/sprawl_donut.csv", index=False, encoding="utf-8")
