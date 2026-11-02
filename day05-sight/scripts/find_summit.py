"""地理院の標高タイル（DEM5A、PNG）で、指定した点のまわりのいちばん高い点を探す。

城の名前を置く位置（山頂）を決めるために使う。結果は src/main.ts に手で写す。
使い方: python -I -X utf8 scripts/find_summit.py <lon> <lat> <半径m> [ズーム=15]
標高タイル: https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/{z}/{x}/{y}.png（地理院タイル）
"""
import io
import math
import sys
import urllib.request

from PIL import Image

URL = "https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/{z}/{x}/{y}.png"


def tile_px(lon: float, lat: float, z: int) -> tuple[float, float]:
    n = 2**z * 256
    return (lon + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n


def px_lonlat(px: float, py: float, z: int) -> tuple[float, float]:
    n = 2**z * 256
    return px / n * 360 - 180, math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * py / n))))


def main() -> None:
    lon, lat, radius = float(sys.argv[1]), float(sys.argv[2]), float(sys.argv[3])
    z = int(sys.argv[4]) if len(sys.argv) > 4 else 15
    m_per_px = 156543.03 * math.cos(math.radians(lat)) / 2**z
    r_px = radius / m_per_px
    cx, cy = tile_px(lon, lat, z)
    tiles: dict[tuple[int, int], Image.Image] = {}
    best = (-1e9, 0.0, 0.0)
    for py in range(int(cy - r_px), int(cy + r_px) + 1):
        for px in range(int(cx - r_px), int(cx + r_px) + 1):
            if (px - cx) ** 2 + (py - cy) ** 2 > r_px**2:
                continue
            key = (px // 256, py // 256)
            if key not in tiles:
                u = URL.format(z=z, x=key[0], y=key[1])
                data = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=20).read()
                tiles[key] = Image.open(io.BytesIO(data)).convert("RGB")
            r, g, b = tiles[key].getpixel((px % 256, py % 256))
            v = r * 65536 + g * 256 + b
            if v == 2**23:
                continue  # 標高なし
            h = (v - 2**24 if v > 2**23 else v) * 0.01
            if h > best[0]:
                best = (h, px + 0.5, py + 0.5)
    h, px, py = best
    lo, la = px_lonlat(px, py, z)
    print(f"{lo:.6f} {la:.6f} {h:.1f}m")


if __name__ == "__main__":
    main()
