"""試し刷り: 250mメッシュを1画素にして全国を描く。

使い方: python -I -X utf8 render_preview.py <mesh_carfree.parquet> <出力png>
"""
import sys

import numpy as np
import pandas as pd
from PIL import Image

m = pd.read_parquet(sys.argv[1])
LON0, LON1, LAT0, LAT1 = 128.3, 146.0, 30.9, 45.6
DLON, DLAT = 1 / 320, 1 / 480
# 緯度36度付近で縦横の長さをそろえる（1画素 = 250m 前後）
W = int((LON1 - LON0) / DLON)
H = int((LAT1 - LAT0) / DLAT)
m = m[(m.lon > LON0) & (m.lon < LON1) & (m.lat > LAT0) & (m.lat < LAT1)]
x = ((m.lon - LON0) / DLON).astype(int).to_numpy()
y = (H - 1 - (m.lat - LAT0) / DLAT).astype(int).to_numpy()

bg = np.array([12, 14, 22])
c_none = np.array([70, 60, 80])
c_serv = np.array([60, 95, 140])
c_both = np.array([255, 205, 90])
img = np.tile(bg, (H, W, 1)).astype(float)
a = np.clip(np.log10(m["pop"].to_numpy() + 1) / 3.5, 0.15, 1.0)[:, None]
col = np.where(m["both"].to_numpy()[:, None], c_both,
               np.where(m["service"].to_numpy()[:, None], c_serv, c_none))
img[y, x] = bg * (1 - a) + col * a
Image.fromarray(img.astype(np.uint8)).save(sys.argv[2])
print(W, H)
