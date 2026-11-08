"""関東の標高タイル（Mapterhorn、Terrarium 形式の webp）を取ってきて1枚の配列にする。

使い方: python -I -X utf8 fetch_dem.py <出力フォルダ> [ズーム（既定12）]
出力: dem_z{z}.npy（float32、m）と dem_z{z}.json（範囲）
"""
import json
import math
import sys
import urllib.request
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image

out = Path(sys.argv[1]).resolve()
Z = int(sys.argv[2]) if len(sys.argv) > 2 else 12
LON0, LON1, LAT0, LAT1 = 138.7, 141.0, 34.85, 37.2  # 1都6県が入る範囲
(out / f"tiles/{Z}").mkdir(parents=True, exist_ok=True)


def tx(lon):
    return int((lon + 180) / 360 * 2**Z)


def ty(lat):
    r = math.radians(lat)
    return int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2**Z)


x0, x1, y0, y1 = tx(LON0), tx(LON1), ty(LAT1), ty(LAT0)
T = 512
dem = np.zeros(((y1 - y0 + 1) * T, (x1 - x0 + 1) * T), np.float32)
for x in range(x0, x1 + 1):
    for y in range(y0, y1 + 1):
        p = out / f"tiles/{Z}/{x}_{y}.webp"
        if not p.exists():
            req = urllib.request.Request(f"https://tiles.mapterhorn.com/{Z}/{x}/{y}.webp",
                                         headers={"User-Agent": "30daymapchallenge-day08"})
            try:
                p.write_bytes(urllib.request.urlopen(req, timeout=60).read())
            except Exception as e:  # 海だけのタイルは無いことがある
                print("skip", x, y, e)
                continue
        a = np.asarray(Image.open(p).convert("RGB")).astype(np.float32)
        dem[(y - y0) * T:(y - y0 + 1) * T, (x - x0) * T:(x - x0 + 1) * T] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
np.save(out / f"dem_z{Z}.npy", dem)
json.dump({"z": Z, "x0": x0, "y0": y0, "tile": T, "shape": dem.shape}, open(out / f"dem_z{Z}.json", "w"))
print(dem.shape, dem.min(), dem.max())
