"""陸は Mapterhorn、海底は GEBCO_2026 でつないだ全球の標高を、符号を反転して Terrarium タイルにする。

- Mapterhorn のタイルは海がちょうど 0m（海だけのタイルは配布されていない＝ 0m とみなす）。
- Mapterhorn が 0m の画素には GEBCO の値を入れる。ただし GEBCO が 0 より上（GEBCO 上は陸）のときは 0 に抑える。
- 0 以外（陸・湖面・海面下の陸地）は Mapterhorn のまま。
- できた標高 h を -h にして Terrarium（WebP 可逆）で output/tiles/{z}/{x}/{y}.webp に書く。

使い方: python -I scripts/build_inverted.py <maxzoom>
"""
import glob
import math
import pathlib
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np
import rasterio
from PIL import Image
from rasterio.transform import from_bounds
from rasterio.warp import Resampling, reproject

ROOT = pathlib.Path(__file__).resolve().parent.parent
MT = ROOT / "data" / "mapterhorn"
GEBCO_GLOB = str(ROOT / "data" / "gebco" / "tif" / "*.tif")
OUT = ROOT / "output" / "tiles"
SIZE = 512
R = 6378137.0
HALF = math.pi * R


def tile_bounds(z, x, y):
    n = 1 << z
    w = 2 * HALF / n
    return (-HALF + x * w, HALF - (y + 1) * w, -HALF + (x + 1) * w, HALF - y * w)


def merc_to_lonlat_bounds(b):
    def lat(yy):
        return math.degrees(2 * math.atan(math.exp(yy / R)) - math.pi / 2)
    return (math.degrees(b[0] / R), lat(b[1]), math.degrees(b[2] / R), lat(b[3]))


def decode_terrarium(rgb):
    rgb = rgb.astype(np.float64)
    return rgb[..., 0] * 256 + rgb[..., 1] + rgb[..., 2] / 256 - 32768


def encode_terrarium(h):
    v = np.clip(h + 32768.0, 0, 65535.996)
    r = np.floor(v / 256)
    g = np.floor(v) - r * 256
    b = np.floor((v - np.floor(v)) * 256)
    return np.dstack([r, g, b]).astype(np.uint8)


_GEBCO = {}
OVR_FACTORS = [2, 4, 8, 16, 32, 64]  # gdaladdo で付けた縮小版


def gebco_sources(level):
    """level=None は原寸、0.. は縮小版（.ovr）の段。"""
    if level not in _GEBCO:
        kw = {} if level is None else {"overview_level": level}
        _GEBCO[level] = [rasterio.open(f, **kw) for f in sorted(glob.glob(GEBCO_GLOB))]
    return _GEBCO[level]


def gebco_tile(z, x, y):
    b = tile_bounds(z, x, y)
    lb = merc_to_lonlat_bounds(b)
    dst = np.full((SIZE, SIZE), np.nan, dtype=np.float32)
    transform = from_bounds(*b, SIZE, SIZE)
    # 出力の画素が GEBCO の格子（15秒）より粗いときは平均、細かいときは双一次。
    # 粗いときは、出力の画素より細かい範囲でいちばん粗い縮小版から読む。
    ratio = (lb[2] - lb[0]) / SIZE / (15 / 3600)
    rs = Resampling.average if ratio > 1 else Resampling.bilinear
    level = None
    for i, f in enumerate(OVR_FACTORS):
        if f * 2 <= ratio:
            level = i
    for ds in gebco_sources(level):
        sb = ds.bounds
        if sb.right <= lb[0] or sb.left >= lb[2] or sb.top <= lb[1] or sb.bottom >= lb[3]:
            continue
        part = np.full((SIZE, SIZE), np.nan, dtype=np.float32)
        reproject(source=rasterio.band(ds, 1), destination=part, dst_transform=transform, dst_crs="EPSG:3857",
                  dst_nodata=np.nan, resampling=rs)
        m = np.isnan(dst) & ~np.isnan(part)
        dst[m] = part[m]
    return dst


def process(zxy):
    z, x, y = zxy
    out = OUT / str(z) / str(x) / f"{y}.webp"
    if out.exists():
        return 0
    p = MT / str(z) / str(x) / f"{y}.webp"
    if p.exists():
        mt = decode_terrarium(np.asarray(Image.open(p).convert("RGB")))
    else:
        mt = np.zeros((SIZE, SIZE))
    sea = mt == 0
    h = mt.copy()
    if sea.any():
        g = gebco_tile(z, x, y).astype(np.float64)
        g = np.where(np.isnan(g), 0, np.minimum(g, 0))
        h[sea] = g[sea]
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(encode_terrarium(-h)).save(out, "WEBP", lossless=True, quality=100, method=4)
    return 1


def main():
    maxzoom = int(sys.argv[1])
    minzoom = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    jobs = [(z, x, y) for z in range(minzoom, maxzoom + 1) for x in range(1 << z) for y in range(1 << z)]
    n = 0
    with ProcessPoolExecutor() as ex:
        for i, r in enumerate(ex.map(process, jobs, chunksize=8)):
            n += r
            if (i + 1) % 200 == 0:
                print(f"{i + 1}/{len(jobs)}", flush=True)
    print("done", n, "new tiles")


if __name__ == "__main__":
    main()
