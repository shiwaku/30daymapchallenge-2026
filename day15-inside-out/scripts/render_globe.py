"""裏返した標高タイル（output/tiles）から、正射図法の地球儀の静止画を描く。

使い方: python -I scripts/render_globe.py [lon0] [lat0] [zoom] [out.png]
"""
import math
import pathlib
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
TILES = ROOT / "output" / "tiles"
TS = 512

STOPS = [(-8800, (8, 20, 46)), (-4000, (15, 44, 92)), (-1500, (29, 79, 138)), (-300, (61, 127, 184)),
         (-1, (127, 182, 217)), (0, (207, 199, 163)), (1500, (168, 167, 122)), (3500, (140, 122, 85)),
         (5500, (181, 156, 120)), (7500, (227, 214, 195)), (10000, (255, 255, 255))]


def decode(p):
    a = np.asarray(Image.open(p).convert("RGB")).astype(np.float32)
    return a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768


def mosaic(z):
    n = 1 << z
    m = np.empty((n * TS, n * TS), dtype=np.float32)
    for x in range(n):
        for y in range(n):
            m[y * TS:(y + 1) * TS, x * TS:(x + 1) * TS] = decode(TILES / str(z) / str(x) / f"{y}.webp")
    return m


def shade(h, z, exag=12.0):
    n = h.shape[0]
    rows = np.arange(n) + 0.5
    lat = np.degrees(np.arctan(np.sinh(math.pi * (1 - 2 * rows / n))))
    px = 40075016.686 / n * np.cos(np.radians(lat))  # 各行の画素の実際の大きさ
    gy, gx = np.gradient(h)
    gx = gx / px[:, None] * exag
    gy = gy / px[:, None] * exag
    az, alt = math.radians(315), math.radians(40)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    return (np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)).astype(np.float32)


def polar_cap(north, edge=84.0):
    """Web メルカトルの外（|緯度|>85°）を、GEBCO の縮小版（4分格子）から正距円筒で用意する。
    この範囲に Mapterhorn はないので、GEBCO の値をそのまま使って符号を反転する。"""
    import glob
    import rasterio
    from rasterio.windows import Window
    tag = "n90.0_s0.0" if north else "n0.0_s-90.0"
    files = sorted(glob.glob(str(ROOT / "data" / "gebco" / "tif" / f"gebco_2026_{tag}_*.tif")),
                   key=lambda f: float(f.split("_w")[1].split("_")[0]))
    parts = []
    for f in files:
        with rasterio.open(f, overview_level=3) as ds:  # 16分の1 = 4分
            rows = int(round((90 - edge) / 90 * ds.height))
            win = Window(0, 0 if north else ds.height - rows, ds.width, rows)
            parts.append(ds.read(1, window=win).astype(np.float32))
    g = -np.hstack(parts)
    nr, nc = g.shape
    res = 360 / nc
    lat = (90 - (np.arange(nr) + 0.5) * res) if north else (-edge - (np.arange(nr) + 0.5) * res)
    gy, gx = np.gradient(g)
    dx = 111320 * res * np.maximum(np.cos(np.radians(lat)), 0.02)
    gx = gx / dx[:, None] * 12
    gy = gy / (111320 * res) * 12
    az, alt = math.radians(315), math.radians(40)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    s = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    return g, s.astype(np.float32), res


def colorize(h):
    xs = [s[0] for s in STOPS]
    return np.stack([np.interp(h, xs, [s[1][i] for s in STOPS]) for i in range(3)], -1).astype(np.float32)


def main():
    lon0 = float(sys.argv[1]) if len(sys.argv) > 1 else 140.0
    lat0 = float(sys.argv[2]) if len(sys.argv) > 2 else 20.0
    z = int(sys.argv[3]) if len(sys.argv) > 3 else 5
    out = pathlib.Path(sys.argv[4]) if len(sys.argv) > 4 else ROOT / "output" / "day15_inside_out_globe.png"

    W, H = 2400, 2400
    R = 1020
    cx, cy = W / 2, H / 2 - 40

    h = mosaic(z)
    hs = shade(h, z)
    n = h.shape[0]

    yy, xx = np.mgrid[0:H, 0:W].astype(np.float64)
    x = (xx + 0.5 - cx) / R
    y = -(yy + 0.5 - cy) / R
    rho = np.hypot(x, y)
    inside = rho < 1
    c = np.arcsin(np.clip(rho, 0, 1))
    p0, l0 = math.radians(lat0), math.radians(lon0)
    with np.errstate(invalid="ignore", divide="ignore"):
        lat = np.arcsin(np.cos(c) * math.sin(p0) + np.where(rho > 0, y * np.sin(c) * math.cos(p0) / rho, 0))
        lon = l0 + np.arctan2(x * np.sin(c), rho * np.cos(c) * math.cos(p0) - y * np.sin(c) * math.sin(p0))
    lat = np.degrees(lat)
    lon = (np.degrees(lon) + 180) % 360 - 180
    latc = np.clip(lat, -85.0, 85.0)
    px = ((lon + 180) / 360 * n).astype(np.int64).clip(0, n - 1)
    py = ((1 - np.log(np.tan(np.radians(latc)) + 1 / np.cos(np.radians(latc))) / math.pi) / 2 * n).astype(np.int64).clip(0, n - 1)

    hv = h[py, px]
    sv = hs[py, px]
    # |緯度|>85° は GEBCO の正距円筒で埋める
    for north in (True, False):
        m = inside & ((lat > 85.0) if north else (lat < -85.0))
        if not m.any():
            continue
        g, s, res = polar_cap(north)
        r = ((90 - lat[m]) / res) if north else ((-84.0 - lat[m]) / res)
        r = r.astype(np.int64).clip(0, g.shape[0] - 1)
        cc = ((lon[m] + 180) / res).astype(np.int64).clip(0, g.shape[1] - 1)
        hv[m] = g[r, cc]
        sv[m] = s[r, cc]
    col = colorize(hv) * (0.42 + 0.78 * sv[..., None])
    # 縁を少し暗くして球らしく見せる
    limb = np.sqrt(np.clip(1 - rho ** 2, 0, 1))
    col *= (0.55 + 0.45 * limb)[..., None]
    img = np.zeros((H, W, 3), dtype=np.float32)
    img[...] = (5, 7, 13)
    img[inside] = col[inside]

    # 大気のにじみ
    glow = np.clip(1 - (rho - 1.0) / 0.04, 0, 1) ** 2 * (rho >= 1.0)
    img += glow[..., None] * np.array([70, 120, 190], dtype=np.float32) * 0.6
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))

    d = ImageDraw.Draw(im)
    fb = ImageFont.truetype("C:/Windows/Fonts/YuGothB.ttc", 64)
    fm = ImageFont.truetype("C:/Windows/Fonts/YuGothM.ttc", 30)
    fs = ImageFont.truetype("C:/Windows/Fonts/YuGothM.ttc", 24)
    d.text((80, 70), "Inside out", font=fb, fill=(235, 238, 242))
    d.text((84, 150), "陸と海を裏返した地球（標高の符号を反転）", font=fm, fill=(200, 208, 218))
    d.text((84, H - 120), "#30DayMapChallenge 2026  Day 15", font=fs, fill=(170, 178, 190))
    d.text((84, H - 80),
           "陸: Mapterhorn（Copernicus GLO-30・国土地理院 基盤地図情報 ほか, mapterhorn.com/attribution）／"
           "海底: GEBCO Compilation Group (2026) GEBCO_2026 Grid", font=fs, fill=(170, 178, 190))
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out)
    print("saved", out)


if __name__ == "__main__":
    main()
