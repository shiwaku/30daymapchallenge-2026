"""GHSL GHS-SMOD（R2023A, 1km, Mollweide）の段階ごとの面積を、国ごと・年次ごとに数える。

1セル = 1km²（Mollweide は正積）。国境は Natural Earth 1:50m。
出力: data/smod_by_country.csv（year, iso, cls, km2）
"""
from pathlib import Path
import sys
import numpy as np
import pandas as pd
import geopandas as gpd
import rasterio
from rasterio.features import rasterize
from rasterio.windows import Window

ROOT = Path(__file__).resolve().parents[1]
YEARS = [int(a) for a in sys.argv[1:]] or [1975, 2020]
CLASSES = [10, 11, 12, 13, 21, 22, 23, 30]

ne = gpd.read_file(ROOT / "data/ne/ne_50m_admin_0_countries.shp")
iso = ne["ADM0_A3"].tolist()

rows = []
for y in YEARS:
    tif = ROOT / f"data/ghsl/GHS_SMOD_E{y}_GLOBE_R2023A_54009_1000_V2_0.tif"
    with rasterio.open(tif) as src:
        geoms = ne.to_crs(src.crs).geometry
        shapes = [(g, i + 1) for i, g in enumerate(geoms) if g is not None]
        acc = np.zeros((len(iso) + 1, 31), dtype=np.int64)
        step = 1000
        for r0 in range(0, src.height, step):
            h = min(step, src.height - r0)
            win = Window(0, r0, src.width, h)
            a = src.read(1, window=win)
            c = rasterize(shapes, out_shape=a.shape, transform=src.window_transform(win), dtype="int32")
            m = (a >= 10) & (a <= 30)
            np.add.at(acc, (c[m], a[m]), 1)
    for ci in range(acc.shape[0]):
        for cl in CLASSES:
            if acc[ci, cl]:
                rows.append((y, "NONE" if ci == 0 else iso[ci - 1], cl, int(acc[ci, cl])))
    print(y, "done", flush=True)

out = ROOT / "data/smod_by_country.csv"
df = pd.DataFrame(rows, columns=["year", "iso", "cls", "km2"])
if out.exists():
    old = pd.read_csv(out)
    df = pd.concat([old[~old.year.isin(YEARS)], df])
df.sort_values(["year", "iso", "cls"]).to_csv(out, index=False)
