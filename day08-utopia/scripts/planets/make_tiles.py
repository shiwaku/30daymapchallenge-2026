"""月と火星の、MapLibre の地球儀で使うタイルを作る。

- dem/{z}/{x}/{y}.png: 標高（Terrarium 形式。color-relief と hillshade で陰影段彩にする）
- ov/{z}/{x}/{y}.png: 重ね合わせ（RGBA）
  - 月: 日照率40%以上を金（高いほど不透明）、永久影を青
  - 火星: 3つの条件を満たす所を緑、氷はありそうだが高すぎるか極に近い所を青灰
- 月は座標を回して、南極点がタイルの緯度0°・経度0°に来るようにする（Web メルカトルは緯度85°より極側を描けないため）。
  回した座標 (x', y', z') と本当の座標の関係は x = z', y = y', z = -x'。

ズーム（画素の大きさ = 2π×半径 ÷ (512×2^z) が元の格子に近いところで止める）
- 月: 全球 LDEM_16（約1.9km）は z4（約1.3km）。南緯75〜85°は120m 格子で z8（約83m）、南緯85°より極側は20m 格子で z10（約21m）。
  重ね合わせ（日照率・永久影は120m）は z8 まで
- 火星: MOLA 463m で z7（約326m）。重ね合わせ（SWIM は約3km）は z5（約1.3km）まで

使い方: python -I -X utf8 make_tiles.py <moon|mars> <data/moon か data/mars> <出力フォルダ>
"""
import math
import sys
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image

body, src, out = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
T = 512


def tile_lonlat(z, x, y):
    n = 2**z
    px = (np.arange(T) + 0.5) / T
    lon = (x + px) / n * 360 - 180
    my = (y + px) / n
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * my))))
    return np.meshgrid(lon, lat)


def terrarium(h):
    v = np.clip(h + 32768, 0, 65535.99)
    r = np.floor(v / 256)
    g = np.floor(v - r * 256)
    b = np.floor((v - np.floor(v)) * 256)
    return np.stack([r, g, b], -1).astype(np.uint8)


def save(arr, p, mode):
    p.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(arr, mode).save(p, optimize=False, compress_level=6)


if body == "moon":
    g16 = np.fromfile(src / "ldem_16.img", "<i2").reshape(2880, 5760).astype(np.float32) * 0.5
    N, PIX = 7624, 120.0
    dem_p = np.fromfile(src / "ldem_75s_120m.img", "<i2").reshape(N, N).astype(np.float32) * 0.5
    with rasterio.open(src / "LPSR_75S_120M_201608.TIF") as r:
        tr = r.transform
        psr = (r.read(1).astype(np.float32) * r.scales[0] + r.offsets[0]) > 0.5
    with rasterio.open(src / "AVGVISIB_75S_120M_201608.TIF") as r:
        ill = r.read(1).astype(np.float32) * r.scales[0] + r.offsets[0]
    RM = 1737400.0
    N20 = 15168
    dem20 = np.memmap(src / "ldem_85s_20m.img", "<i2", "r", shape=(N20, N20))

    def sample(lon_r, lat_r, fine=False):
        # 回した座標 → 本当の座標
        la, lo = np.radians(lat_r), np.radians(lon_r)
        xr, yr, zr = np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)
        X, Y, Z = zr, yr, -xr
        lat = np.degrees(np.arcsin(np.clip(Z, -1, 1)))
        lon = np.degrees(np.arctan2(Y, X))
        h = g16[np.clip(((90 - lat) * 16).astype(int), 0, 2879), ((lon % 360) * 16).astype(int) % 5760]
        il = np.zeros_like(h)
        ps = np.zeros(h.shape, bool)
        pol = lat < -75.2
        # 南極の極座標（球の極平射。中心経度0°、緯度の基準 -90°）
        k = 2 * RM * np.tan(np.radians(45 + lat[pol] / 2))
        xs = k * np.sin(np.radians(lon[pol]))
        ys = k * np.cos(np.radians(lon[pol]))
        cc = np.clip(((xs - tr.c) / PIX).astype(int), 0, N - 1)
        rr = np.clip(((tr.f - ys) / PIX).astype(int), 0, N - 1)
        h[pol] = dem_p[rr, cc]
        il[pol] = ill[rr, cc]
        ps[pol] = psr[rr, cc]
        if fine:  # 南緯85°より極側は20m 格子（中心が南極点、7583.5 画素目）
            p85 = lat < -85.0
            k = 2 * RM * np.tan(np.radians(45 + lat[p85] / 2))
            c2 = np.clip((k * np.sin(np.radians(lon[p85])) / 20 + 7583.5).astype(int), 0, N20 - 1)
            r2 = np.clip((7583.5 - k * np.cos(np.radians(lon[p85])) / 20).astype(int), 0, N20 - 1)
            h[p85] = dem20[r2, c2].astype(np.float32) * 0.5
        ov = np.zeros(h.shape + (4,), np.uint8)
        g = np.clip((il - 0.4) / 0.35, 0, 1)  # 日照率 40%→75% で金を濃く
        ov[..., 0], ov[..., 1], ov[..., 2] = 255, 200, 80
        ov[..., 3] = (g ** 0.8 * 245).astype(np.uint8)
        ov[ps] = (60, 130, 255, 215)
        return h, ov

    ZG, ZP, BOX, ZOV = 4, 8, 16.0, 8  # z0〜4 は全球、z5〜8 は南極のまわり（回した座標で ±16°）
    ZF, BOXF = 10, 5.2  # z9〜10 は南緯85°より極側（±5.2°）だけ、20m 格子で
else:
    with rasterio.open(src / "mola/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif") as r:
        mola = r.read(1)  # 90N→90S、180W→180E、128ppd
    MH, MW = mola.shape
    PPD = MW / 360
    c01 = rasterio.open(src / "swim/z/SWIM4MIM_Ci_0_1.tif").read(1)
    c15 = rasterio.open(src / "swim/z/SWIM4MIM_Ci_1_5.tif").read(1)
    ci = np.fmax(np.where(c01 == -30, np.nan, c01), np.where(c15 == -30, np.nan, c15))
    from scipy.ndimage import gaussian_filter
    v_ = np.nan_to_num(ci, nan=0.0)
    m_ = (~np.isnan(ci)).astype(np.float32)
    ci = np.where(m_ > 0, gaussian_filter(v_, 3) / np.maximum(gaussian_filter(m_, 3), 1e-6), np.nan)

    def sample(lon, lat, fine=False):
        h = mola[np.clip(((90 - lat) * PPD).astype(int), 0, MH - 1), (((lon + 180) % 360) * PPD).astype(int) % MW].astype(np.float32)
        inside = np.abs(lat) < 60
        ice = np.where(inside, ci[np.clip(((60 - lat) / 0.05).astype(int), 0, 2399), np.clip(((lon + 180) / 0.05).astype(int), 0, 7199)], np.nan)
        icy = np.nan_to_num(ice, nan=-1) >= 0.5
        ok = icy & (h <= 2000) & (np.abs(lat) <= 50)
        ov = np.zeros(h.shape + (4,), np.uint8)
        ov[icy] = (150, 175, 215, 150)
        ov[ok] = (120, 255, 170, 225)
        return h, ov

    ZG, ZP, BOX, ZOV = 7, 7, 0, 5
    ZF, BOXF = 7, 0

count = 0
for z in range(0, max(ZG, ZP, ZF) + 1):
    n = 2**z
    box = BOX if z <= ZP else BOXF
    if z <= ZG:
        xs_, ys_ = range(n), range(n)
    else:
        def tx(lon):
            return int((lon + 180) / 360 * n)

        def ty(lat):
            r = math.radians(lat)
            return int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n)
        xs_, ys_ = range(tx(-box), tx(box) + 1), range(ty(box), ty(-box) + 1)
    for x in xs_:
        for y in ys_:
            lon, lat = tile_lonlat(z, x, y)
            h, ov = sample(lon, lat, fine=z > ZP or (body == "mars"))
            save(terrarium(h), out / f"dem/{z}/{x}/{y}.png", "RGB")
            if z <= ZOV and ov[..., 3].any():
                save(ov, out / f"ov/{z}/{x}/{y}.png", "RGBA")
            count += 1
    print(body, "z", z, "tiles", count, flush=True)
