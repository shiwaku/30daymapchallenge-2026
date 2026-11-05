"""1961〜69年の写真（地理院タイル ort_old10）に、1969年までに開通した区間の高架が写っているかを目で見るための一覧をつくる。

使い方: python scripts/check_old10.py 出力.jpg 西 南 東 北 [路線名の一部,...]
- 国土数値情報 N06 の首都高の区間のうち、開通年 1969 以下で範囲内のものに沿って約600mおきに点を取り、
  その周りの写真（z17、約300m四方）を切り出して、N06 の線を赤で重ねて並べる。
- タイルは data/old10_tiles/ に置き、2回目からは読まない。1枚ずつ取る。
"""

import math
import os
import sys
import time
import urllib.request
from io import BytesIO

import geopandas as gpd
from PIL import Image, ImageDraw, ImageFont
from shapely.geometry import box
from shapely.ops import linemerge

ROOT = os.path.join(os.path.dirname(__file__), "..")
N06 = os.path.join(ROOT, "data", "n06", "N06-24", "UTF-8", "N06-24_HighwaySection.geojson")
CACHE = os.path.join(ROOT, "data", "old10_tiles")
Z = 17
N = 2**Z


def px(lon, lat):
    return (lon + 180) / 360 * N * 256, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * N * 256


def tile(x, y):
    p = os.path.join(CACHE, f"{Z}_{x}_{y}.png")
    if not os.path.exists(p):
        try:
            b = urllib.request.urlopen(f"https://cyberjapandata.gsi.go.jp/xyz/ort_old10/{Z}/{x}/{y}.png", timeout=30).read()
        except Exception:
            b = b""
        open(p, "wb").write(b)
        time.sleep(0.2)
    b = open(p, "rb").read()
    return Image.open(BytesIO(b)).convert("RGB") if b else Image.new("RGB", (256, 256), (40, 0, 0))


def main():
    out = sys.argv[1]
    w, s, e, n = map(float, sys.argv[2:6])
    os.makedirs(CACHE, exist_ok=True)
    g = gpd.read_file(N06)
    g = g[g.N06_007.str.contains("首都高速", na=False) & (g.N06_001 <= 1969)].clip(box(w, s, e, n))
    m = g.to_crs(6677)
    pts = []
    keep = sys.argv[6].split(",") if len(sys.argv) > 6 else None  # 路線名の一部（例: 上野,羽田,都心環状）
    for (route, year), sub in m.groupby(["N06_007", "N06_001"]):
        if keep and not any(k in route for k in keep):
            continue
        u = sub.union_all()
        u = linemerge(u) if u.geom_type == "MultiLineString" else u
        acc = 0.0  # 線が分かれていても、続けて約600mおきに取る
        for part in getattr(u, "geoms", [u]):
            d = (300 - acc) % 600
            while d < part.length:
                pts.append((route.replace("首都高速", ""), int(year), gpd.GeoSeries([part.interpolate(d)], crs=6677).to_crs(4326)[0]))
                d += 600
            acc = (acc + part.length) % 600
    lines = g.geometry
    font = ImageFont.truetype("C:/Windows/Fonts/meiryo.ttc", 14)
    cells = []
    for route, year, p in pts:
        cx, cy = px(p.x, p.y)
        x0, y0 = int(cx // 256) - 1, int(cy // 256) - 1
        im = Image.new("RGB", (768, 768))
        for i in range(3):
            for j in range(3):
                im.paste(tile(x0 + i, y0 + j), (i * 256, j * 256))
        dr = ImageDraw.Draw(im)
        for geom in lines:
            for part in getattr(geom, "geoms", [geom]):
                xy = [(px(x, y)[0] - x0 * 256, px(x, y)[1] - y0 * 256) for x, y in part.coords]
                dr.line(xy, fill=(255, 40, 40), width=1)
        ox, oy = int(cx - x0 * 256), int(cy - y0 * 256)
        im = im.crop((ox - 160, oy - 160, ox + 160, oy + 160))
        dr = ImageDraw.Draw(im)
        dr.rectangle((0, 0, 320, 22), fill=(0, 0, 0))
        dr.text((4, 2), f"{len(cells) + 1}. {route} {year}年開通  {p.x:.4f},{p.y:.4f}", font=font, fill=(255, 255, 255))
        cells.append(im)
    cols = 5
    rows = math.ceil(len(cells) / cols)
    sheet = Image.new("RGB", (cols * 320, rows * 320), (20, 20, 20))
    for k, c in enumerate(cells):
        sheet.paste(c, ((k % cols) * 320, (k // cols) * 320))
    sheet.save(out, quality=85)
    print(len(cells), "地点")


if __name__ == "__main__":
    main()
