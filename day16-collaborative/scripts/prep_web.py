"""竹田城まわりの DSM/DEM から、Web 用のデータを作る。
- web/dsm.bin   : 1m 間隔の DSM（Uint16、(標高-90m)*100、行は北→南）
- web/color.jpg : 0.5m 間隔の色（樹冠の高さ DSM-DEM と陰影で塗る）
- web/meta.json : 大きさ・範囲など
"""
import json
from pathlib import Path
import numpy as np, rasterio
from PIL import Image
from pyproj import Transformer

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / "data"; W = ROOT / "web"; W.mkdir(exist_ok=True)
with rasterio.open(D / "takeda_dsm.tif") as s: dsm = s.read(1); tf = s.transform
with rasterio.open(D / "takeda_dem.tif") as s: dem = s.read(1)
BASE = 90.0

# 1m に間引いた DSM（2x2 の平均）
h, w = dsm.shape
d1 = dsm.reshape(h // 2, 2, w // 2, 2).mean(axis=(1, 3))
np.round((d1 - BASE) * 100).astype("<u2").tofile(W / "dsm.bin")

# 色: 樹冠の高さで森/地面を分け、陰影をかける
def shade(z, res=0.5, az=315, alt=40):
    gy, gx = np.gradient(z, res)
    slope = np.arctan(np.hypot(gx, gy)); aspect = np.arctan2(-gx, gy)
    a, b = np.radians(az), np.radians(alt)
    return np.clip(np.sin(b)*np.cos(slope) + np.cos(b)*np.sin(slope)*np.cos(a - aspect), 0, 1)
canopy = np.clip(dsm - dem, 0, 40)
sh = shade(dsm)[..., None]
forest = np.array([46, 70, 52], float); ground = np.array([196, 186, 168], float)
t = np.clip((canopy - 1.0) / 4.0, 0, 1)[..., None]
col = ground * (1 - t) + forest * t
col = col * (0.35 + 0.85 * sh)
Image.fromarray(np.clip(col, 0, 255).astype(np.uint8)).save(W / "color.jpg", quality=85)

xmin, ymax = tf.c, tf.f
lonlat = Transformer.from_crs(6673, 4326, always_xy=True)
meta = dict(width=w // 2, height=h // 2, res=1.0, base=BASE, scale=0.01,
            xmin=xmin, ymax=ymax, crs="EPSG:6673",
            castle=dict(x=45088.07 - xmin, y=ymax - (-77493.69), name="竹田城"),
            dsm_max=float(dsm.max()), dem_max=float(dem.max()), valley=float(np.percentile(dem, 2)))
(W / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
print(meta)
