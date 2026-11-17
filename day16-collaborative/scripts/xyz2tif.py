"""兵庫県 50cm DSM/DEM（XYZ テキスト、平面直角座標系 第V系）から、竹田城まわりを GeoTIFF に切り出す。
使い方: python -X utf8 scripts/xyz2tif.py
"""
import zipfile, io
from pathlib import Path
import numpy as np
import rasterio
from rasterio.transform import from_origin

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data"
# 竹田城（山城攻城記の座標 134.829109, 35.300474 → 第V系 X=45088, Y=-77494）を中心に
XMIN, XMAX = 44400.0, 45800.0
YMIN, YMAX = -78000.0, -76800.0
RES = 0.5
SHEETS = ["5131", "5132", "5133", "5134"]  # 2x2 の 1/1250 図郭（右下が 34）

for kind in ["DSM", "DEM"]:
    w = int((XMAX - XMIN) / RES); h = int((YMAX - YMIN) / RES)
    arr = np.full((h, w), np.nan, dtype=np.float32)
    with zipfile.ZipFile(RAW / f"{kind}_05MF51.zip") as z:
        for s in SHEETS:
            name = f"05MF51/{kind}_05MF{s}_05g.txt"
            d = np.loadtxt(io.TextIOWrapper(z.open(name)), dtype=np.float64)
            x, y, v = d[:, 0], d[:, 1], d[:, 2]
            m = (x > XMIN) & (x < XMAX) & (y > YMIN) & (y < YMAX)
            c = ((x[m] - XMIN) / RES).astype(int); r = ((YMAX - y[m]) / RES).astype(int)
            arr[r, c] = v[m]
            print(kind, s, m.sum())
    prof = dict(driver="GTiff", width=w, height=h, count=1, dtype="float32", crs="EPSG:6673",
                transform=from_origin(XMIN, YMAX, RES, RES), nodata=np.nan, compress="deflate")
    with rasterio.open(OUT / f"takeda_{kind.lower()}.tif", "w", **prof) as dst:
        dst.write(arr, 1)
    print(kind, "nan:", np.isnan(arr).sum(), "min/max:", np.nanmin(arr), np.nanmax(arr))
